// ============================================================
// CricZodiac — Match Database Queries (Local SQLite)
// ============================================================

import { queryRows, queryFirstRow, executeQuery, executeTransaction } from '../DatabaseHelper';
import { SYNC_STATUS } from '../../config/constants';
import uuid from 'react-native-uuid';

const BOWLER_CREDIT_WICKET_TYPES = new Set(['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket']);
const BOWLER_UNCHARGED_EXTRAS = new Set(['bye', 'leg_bye']);
const bowlerRunsForBall = (ball) => {
  const runs = Number(ball.runs_scored || 0);
  const extras = Number(ball.extra_runs || 0);
  return runs + (BOWLER_UNCHARGED_EXTRAS.has(ball.extra_type) ? 0 : extras);
};

// ── Matches ───────────────────────────────────────────────

export const createMatch = async (matchData) => {
  const id = matchData.id || uuid.v4();
  const seriesRule = matchData.series_id
    ? await queryFirstRow('SELECT allow_super_over FROM series WHERE id = ?', [matchData.series_id])
    : null;
  const allowSuperOver = Object.prototype.hasOwnProperty.call(matchData, 'allow_super_over')
    ? (matchData.allow_super_over ? 1 : 0)
    : (seriesRule?.allow_super_over ? 1 : 0);
  const payload = { ...matchData, id, allow_super_over: allowSuperOver };
  const queries = [
    {
      sql: `INSERT INTO matches (
        id, club_id, title, venue, match_date, overs, players_per_team,
        allow_last_batsman, allow_super_over,
        team_a_id, team_b_id, series_id,
        wide_value, no_ball_value, max_overs_per_bowler,
        status, created_at, sync_status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?)`,
      params: [
        id, matchData.club_id || null,
        matchData.title, matchData.venue, matchData.match_date,
        matchData.overs || 6, matchData.players_per_team || 6,
        matchData.allow_last_batsman ? 1 : 0,
        allowSuperOver,
        matchData.team_a_id, matchData.team_b_id,
        matchData.series_id || null,
        matchData.wide_value || 1, matchData.no_ball_value || 1, matchData.max_overs_per_bowler || 0,
        'setup', SYNC_STATUS.PENDING
      ],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'matches', 'create', id, JSON.stringify(payload), SYNC_STATUS.PENDING],
    },
  ];
  await executeTransaction(queries);
  return id;
};

export const updateMatch = async (id, data) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(data), SYNC_STATUS.PENDING, id];
  await executeTransaction([
    {
      sql: `UPDATE matches SET ${fields}, sync_status = ?, updated_at = datetime('now') WHERE id = ?`,
      params: values,
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'matches', 'update', id, JSON.stringify({ id, ...data }), SYNC_STATUS.PENDING],
    },
  ]);
};

export const getMatch = (id) =>
  queryFirstRow('SELECT * FROM matches WHERE id = ?', [id]);

export const getAllMatches = () =>
  queryRows('SELECT * FROM matches ORDER BY created_at DESC');

export const getActiveMatches = () =>
  queryRows("SELECT * FROM matches WHERE status NOT IN ('completed') ORDER BY created_at DESC");

// ── Pull matches from server into local SQLite cache ──────
export const upsertMatchesFromServer = async (serverMatches) => {
  if (!serverMatches?.length) return;

  for (const m of serverMatches) {
    const matchId = m.local_id || String(m.id);
    const existing = await queryFirstRow('SELECT sync_status FROM matches WHERE id = ?', [matchId]);

    if (existing?.sync_status === SYNC_STATUS.PENDING || existing?.sync_status === SYNC_STATUS.FAILED) {
      continue;
    }

    await executeQuery(
      `INSERT OR REPLACE INTO matches (
        id, server_id, club_id, title, venue, match_date, overs, players_per_team,
        allow_last_batsman, allow_super_over, team_a_id, team_b_id, series_id, toss_winner_id, toss_choice, batting_first,
        wide_value, no_ball_value, max_overs_per_bowler, status, result_text,
        winner_team_id, player_of_match, created_at, updated_at, sync_status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        matchId,
        m.id || null,
        m.club_id != null ? String(m.club_id) : null,
        m.title,
        m.venue || null,
        m.match_date || null,
        m.overs || 6,
        m.players_per_team || 6,
        m.allow_last_batsman ? 1 : 0,
        m.allow_super_over ? 1 : 0,
        m.team_a_local || (m.team_a_id != null ? String(m.team_a_id) : null),
        m.team_b_local || (m.team_b_id != null ? String(m.team_b_id) : null),
        m.series_local_id || (m.series_id != null ? String(m.series_id) : null),
        m.toss_winner_id != null ? String(m.toss_winner_id) : null,
        m.toss_choice || null,
        m.batting_first != null ? String(m.batting_first) : null,
        m.wide_value || 1,
        m.no_ball_value || 1,
        m.max_overs_per_bowler || 0,
        m.status || 'setup',
        m.result_text || null,
        m.winner_team_id != null ? String(m.winner_team_id) : null,
        m.player_of_match != null ? String(m.player_of_match) : null,
        m.created_at || null,
        m.updated_at || null,
        SYNC_STATUS.SYNCED,
      ]
    );
  }
};

// ── Teams ─────────────────────────────────────────────────

export const createTeam = async (teamData) => {
  const id = teamData.id || uuid.v4();
  const match = await queryFirstRow('SELECT club_id, series_id FROM matches WHERE id = ?', [teamData.match_id]);
  const clubId = teamData.club_id || match?.club_id || null;
  const seriesId = teamData.series_id || match?.series_id || null;
  await executeTransaction([
    {
      sql: `INSERT INTO teams (id, club_id, match_id, series_id, team_name, team_label, captain_id, sync_status)
            VALUES (?,?,?,?,?,?,?,?)`,
      params: [id, clubId, teamData.match_id, seriesId, teamData.team_name, teamData.team_label, teamData.captain_id, SYNC_STATUS.PENDING],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'teams', 'create', id, JSON.stringify({ ...teamData, id, club_id: clubId, series_id: seriesId }), SYNC_STATUS.PENDING],
    },
  ]);
  return id;
};

export const addPlayerToTeam = async (teamId, playerId, battingOrder = 0) => {
  const existing = await queryFirstRow(
    'SELECT id FROM team_players WHERE team_id = ? AND player_id = ?',
    [teamId, playerId]
  );
  if (existing?.id) return existing.id;

  const id = uuid.v4();
  const team = await queryFirstRow(`
    SELECT
      t.match_id,
      COALESCE(t.club_id, m.club_id) AS club_id,
      COALESCE(t.series_id, m.series_id) AS series_id
    FROM teams t
    LEFT JOIN matches m ON m.id = t.match_id
    WHERE t.id = ?
  `, [teamId]);

  await executeTransaction([
    {
      sql: `INSERT OR IGNORE INTO team_players (id, club_id, series_id, match_id, team_id, player_id, batting_order, sync_status)
            VALUES (?,?,?,?,?,?,?,?)`,
      params: [id, team?.club_id || null, team?.series_id || null, team?.match_id || null, teamId, playerId, battingOrder, SYNC_STATUS.PENDING],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'team_players', 'create', id,
               JSON.stringify({
                 id,
                 club_id: team?.club_id || null,
                 series_id: team?.series_id || null,
                 match_id: team?.match_id || null,
                 team_id: teamId,
                 player_id: playerId,
                 batting_order: battingOrder,
               }), SYNC_STATUS.PENDING],
    },
  ]);
  return id;
};

export const getTeamPlayers = async (teamId) => {
  const rows = await queryRows(`
    SELECT
      tp.*,
      p.user_id AS player_user_id,
      p.player_type,
      p.profile_pic
    FROM team_players tp
    JOIN players p ON tp.player_id = p.id
    WHERE tp.team_id = ?
    ORDER BY tp.batting_order ASC
  `, [teamId]);

  const userColumns = await queryRows('PRAGMA table_info(users)');
  let hasServerId = false;
  for (const column of userColumns) {
    if (column.name === 'server_id') {
      hasServerId = true;
      break;
    }
  }

  const users = await queryRows(
    `SELECT id, ${hasServerId ? 'server_id' : 'NULL AS server_id'}, name FROM users`
  );
  const namesByUserRef = new Map();
  for (const user of users) {
    const name = (user.name || '').trim();
    if (!name) continue;

    if (user.id != null) namesByUserRef.set(String(user.id), name);
    if (user.server_id != null) {
      namesByUserRef.set(String(user.server_id), name);
      namesByUserRef.set(`u_${user.server_id}`, name);
    }
  }

  const resolved = [];
  for (const row of rows) {
    const userRef = row.player_user_id != null ? String(row.player_user_id) : '';
    resolved.push({
      ...row,
      full_name: namesByUserRef.get(userRef) || 'Unknown',
    });
  }

  return resolved;
};

// Fallback: returns ALL players from team_players (no team filter).
// Used when the bowling team has no cached players in SQLite.
export const getAllTeamPlayers = async () => {
  const rows = await queryRows(`
    SELECT
      tp.*,
      p.user_id AS player_user_id,
      p.player_type,
      p.profile_pic
    FROM team_players tp
    JOIN players p ON tp.player_id = p.id
    ORDER BY tp.batting_order ASC
  `);

  const userColumns = await queryRows('PRAGMA table_info(users)');
  let hasServerId = false;
  for (const column of userColumns) {
    if (column.name === 'server_id') { hasServerId = true; break; }
  }

  const users = await queryRows(
    `SELECT id, ${hasServerId ? 'server_id' : 'NULL AS server_id'}, name FROM users`
  );
  const namesByUserRef = new Map();
  for (const user of users) {
    const name = (user.name || '').trim();
    if (!name) continue;
    if (user.id != null) namesByUserRef.set(String(user.id), name);
    if (user.server_id != null) {
      namesByUserRef.set(String(user.server_id), name);
      namesByUserRef.set(`u_${user.server_id}`, name);
    }
  }

  const resolved = [];
  for (const row of rows) {
    const userRef = row.player_user_id != null ? String(row.player_user_id) : '';
    resolved.push({ ...row, full_name: namesByUserRef.get(userRef) || 'Unknown' });
  }
  return resolved;
};

// Cache team players received from the server into SQLite.
// serverPlayers: array from GET /teams/players.php
// teamLocalId: the SQLite UUID for this team
export const upsertTeamPlayersFromServer = async (serverPlayers, teamLocalId) => {
  if (!serverPlayers?.length) return;
  for (const sp of serverPlayers) {
    // Prefer local UUIDs; fall back to string of server integer id
    const playerId = sp.player_uuid || sp.player_local_id || String(sp.player_id);
    const tpId     = sp.local_id    || String(sp.id);
    const playerName = (sp.full_name || sp.name || sp.user_name || sp.player_name || sp.user?.name || '').trim();

    // Cache user into SQLite so the JOIN in getTeamPlayers can resolve the name.
    // users/list.php stores MySQL-only users as String(id), so keep the same key here.
    const sqliteUserId = sp.user_uuid || (sp.user_id != null ? String(sp.user_id) : null);
    if (sqliteUserId && playerName) {
      await executeQuery(
        `INSERT OR IGNORE INTO users (id, server_id, name, role, status, is_approved) VALUES (?, ?, ?, 'player', 'active', 1)`,
        [sqliteUserId, sp.user_id || null, playerName]
      );
      await executeQuery(
        `UPDATE users
         SET server_id = COALESCE(?, server_id),
             name = ?,
             role = COALESCE(role, 'player'),
             status = 'active',
             is_approved = 1,
             sync_status = 'synced'
         WHERE id = ?`,
        [sp.user_id || null, playerName, sqliteUserId]
      );
    }

    // Ensure player row exists in SQLite
    await executeQuery(
      `INSERT OR IGNORE INTO players
         (id, server_id, user_id, full_name, player_type, batting_hand, bowling_style, profile_pic, is_active, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [
        playerId,
        sp.player_id    || null,
        sqliteUserId    || null,
        playerName      || 'Unknown',
        sp.player_type  || 'allrounder',
        sp.batting_hand || 'right',
        sp.bowling_style || null,
        sp.profile_pic   || null,
        sp.is_active != null ? (sp.is_active ? 1 : 0) : 1,
      ]
    );
    // Always refresh name + user_id from server in case the row was previously
    // cached with an empty full_name (INSERT OR IGNORE would have skipped it)
    if (playerName) {
      await executeQuery(
        `UPDATE players SET full_name = ?, user_id = COALESCE(?, user_id), sync_status = 'synced' WHERE id = ?`,
        [playerName, sqliteUserId || null, playerId]
      );
    } else if (sqliteUserId) {
      await executeQuery(
        `UPDATE players SET user_id = COALESCE(?, user_id), sync_status = 'synced' WHERE id = ?`,
        [sqliteUserId, playerId]
      );
    }

    // Ensure team_player row exists in SQLite
    await executeQuery(
      `INSERT OR IGNORE INTO team_players
         (id, club_id, series_id, match_id, team_id, player_id, batting_order, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [
        tpId,
        sp.club_id != null ? String(sp.club_id) : null,
        sp.series_id != null ? String(sp.series_id) : null,
        sp.match_id != null ? String(sp.match_id) : null,
        teamLocalId,
        playerId,
        sp.batting_order || 0,
      ]
    );
    await executeQuery(
      `UPDATE team_players
       SET club_id = COALESCE(?, club_id),
           series_id = COALESCE(?, series_id),
           match_id = COALESCE(?, match_id),
           player_id = ?,
           batting_order = ?,
           sync_status = 'synced'
       WHERE id = ?`,
      [
        sp.club_id != null ? String(sp.club_id) : null,
        sp.series_id != null ? String(sp.series_id) : null,
        sp.match_id != null ? String(sp.match_id) : null,
        playerId,
        sp.batting_order || 0,
        tpId,
      ]
    );
  }
};

export const getMatchTeams = (matchId) =>
  queryRows('SELECT * FROM teams WHERE match_id = ?', [matchId]);

export const getMatchTeamsWithCaptains = (matchId) =>
  queryRows(`
    SELECT
      t.id, t.team_name, t.team_label, t.captain_id, t.wk_id,
      COALESCE(u.name, p.full_name) AS captain_name
    FROM teams t
    LEFT JOIN players p ON t.captain_id = p.id
    LEFT JOIN users u   ON p.user_id    = u.id
    WHERE t.match_id = ?
    ORDER BY t.team_label ASC
  `, [matchId]);

// ── Toss ─────────────────────────────────────────────────

export const saveTossResult = async (tossData) => {
  const id = tossData.id || uuid.v4();
  const match = await queryFirstRow('SELECT club_id, series_id FROM matches WHERE id = ?', [tossData.match_id]);
  const clubId = tossData.club_id || match?.club_id || null;
  const seriesId = tossData.series_id || match?.series_id || null;
  const callingCaptainId = tossData.calling_captain_id || tossData.calling_captain || null;
  const tossWinnerId = tossData.toss_winner_id || tossData.toss_winner || null;
  const payload = {
    ...tossData,
    id,
    club_id: clubId,
    series_id: seriesId,
    calling_captain_id: callingCaptainId,
    toss_winner_id: tossWinnerId,
  };

  await executeTransaction([
    {
      sql: `INSERT INTO toss_results (
              id, club_id, series_id, match_id,
              calling_captain, calling_captain_id,
              toss_call, toss_outcome,
              toss_winner, toss_winner_id,
              elected_to, sync_status
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        id, clubId, seriesId, tossData.match_id,
        tossData.calling_captain, callingCaptainId,
        tossData.toss_call, tossData.toss_outcome,
        tossData.toss_winner, tossWinnerId,
        tossData.elected_to, SYNC_STATUS.PENDING,
      ],
    },
    {
      sql: `UPDATE matches SET toss_winner_id = ?, toss_choice = ?, batting_first = ?, status = 'toss', sync_status = ? WHERE id = ?`,
      params: [tossData.toss_winner, tossData.elected_to,
               tossData.elected_to === 'bat' ? tossData.toss_winner : tossData.toss_loser,
               SYNC_STATUS.PENDING, tossData.match_id],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'toss_results', 'create', id, JSON.stringify(payload), SYNC_STATUS.PENDING],
    },
  ]);
  return id;
};

// ── Innings ───────────────────────────────────────────────

export const createInnings = async (inningsData) => {
  // Prevent duplicate innings for the same match + innings_number.
  // If one already exists (even is_completed=1), return its id rather than
  // inserting a phantom duplicate that poisons the match summary display.
  const existing = await queryFirstRow(
    'SELECT id FROM innings WHERE match_id = ? AND innings_number = ? LIMIT 1',
    [inningsData.match_id, inningsData.innings_number]
  );
  if (existing?.id) return existing.id;

  const id = inningsData.id || uuid.v4();
  // Resolve club_id + series_id from match if not provided
  const matchRow = await queryFirstRow('SELECT club_id, series_id FROM matches WHERE id = ?', [inningsData.match_id]);
  const clubId   = inningsData.club_id   || matchRow?.club_id   || null;
  const seriesId = inningsData.series_id || matchRow?.series_id || null;
  await executeTransaction([
    {
      sql: `INSERT INTO innings (id, match_id, innings_number, is_super_over, super_over_number, batting_team_id, bowling_team_id, sync_status)
            VALUES (?,?,?,?,?,?,?,?)`,
      params: [id, inningsData.match_id, inningsData.innings_number,
               inningsData.is_super_over ? 1 : 0, inningsData.super_over_number || null,
               inningsData.batting_team_id, inningsData.bowling_team_id, SYNC_STATUS.PENDING],
    },
    {
      sql: `UPDATE matches SET status = 'live', sync_status = ? WHERE id = ?`,
      params: [SYNC_STATUS.PENDING, inningsData.match_id],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'innings', 'create', id,
               JSON.stringify({ ...inningsData, id, club_id: clubId, series_id: seriesId }),
               SYNC_STATUS.PENDING],
    },
  ]);
  return id;
};

// Re-queue an existing innings for sync to MySQL.
// Called when the innings already exists in SQLite but we need to guarantee
// MySQL has it (e.g. after toss, on app reopen, or after a sync failure).
export const enqueueInningsSync = async (inningsRow, match) => {
  const matchRow = await queryFirstRow('SELECT club_id, series_id FROM matches WHERE id = ?', [inningsRow.match_id]);
  const clubId   = match?.club_id   || matchRow?.club_id   || null;
  const seriesId = match?.series_id || matchRow?.series_id || null;
  await executeQuery(
    `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
     VALUES (?,?,?,?,?,?,datetime('now'))`,
    [
      uuid.v4(), 'innings', 'create', inningsRow.id,
      JSON.stringify({
        id:              inningsRow.id,
        match_id:        inningsRow.match_id,
        club_id:         clubId,
        series_id:       seriesId,
        innings_number:  inningsRow.innings_number,
        is_super_over:   inningsRow.is_super_over ? 1 : 0,
        super_over_number: inningsRow.super_over_number || null,
        batting_team_id: inningsRow.batting_team_id,
        bowling_team_id: inningsRow.bowling_team_id,
        total_runs:      inningsRow.total_runs      || 0,
        total_wickets:   inningsRow.total_wickets   || 0,
        total_overs:     inningsRow.total_overs     || 0,
        extras:          inningsRow.extras          || 0,
        is_completed:    inningsRow.is_completed ? 1 : 0,
      }),
      SYNC_STATUS.PENDING,
    ]
  );
};

export const updateInnings = async (id, data) => {
  const keys = Object.keys(data || {});
  if (!id || keys.length === 0) return;

  const current = await queryFirstRow('SELECT * FROM innings WHERE id = ?', [id]);
  if (!current) return;

  const next = { ...current, ...data, id };
  const matchRow = await queryFirstRow('SELECT club_id, series_id FROM matches WHERE id = ?', [next.match_id]);
  const payload = {
    id,
    match_id:        next.match_id,
    club_id:         matchRow?.club_id || null,
    series_id:       matchRow?.series_id || null,
    innings_number:  next.innings_number,
    is_super_over:   next.is_super_over ? 1 : 0,
    super_over_number: next.super_over_number || null,
    batting_team_id: next.batting_team_id,
    bowling_team_id: next.bowling_team_id,
    total_runs:      next.total_runs || 0,
    total_wickets:   next.total_wickets || 0,
    total_overs:     next.total_overs || 0,
    extras:          next.extras || 0,
    is_completed:    next.is_completed ? 1 : 0,
  };

  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  await executeTransaction([
    {
      sql: `UPDATE innings SET ${fields}, sync_status = ?, updated_at = datetime('now') WHERE id = ?`,
      params: [...Object.values(data), SYNC_STATUS.PENDING, id],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'innings', 'update', id, JSON.stringify(payload), SYNC_STATUS.PENDING],
    },
  ]);
};

export const getInnings = (id) =>
  queryFirstRow('SELECT * FROM innings WHERE id = ?', [id]);

export const getMatchInnings = (matchId) =>
  queryRows('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number ASC', [matchId]);

// ── Overs ─────────────────────────────────────────────────

export const createOver = async (overData) => {
  const id = overData.id || uuid.v4();
  // Resolve match context — needed by server to resolve innings when UUID mismatches
  const inningsRow = await queryFirstRow('SELECT match_id FROM innings WHERE id = ?', [overData.innings_id]);
  const matchRow   = await queryFirstRow('SELECT club_id, series_id FROM matches WHERE id = ?',
                       [overData.match_id || inningsRow?.match_id]);
  const payload = {
    ...overData,
    id,
    match_id:       overData.match_id       || inningsRow?.match_id || null,
    club_id:        overData.club_id        || matchRow?.club_id    || null,
    series_id:      overData.series_id      || matchRow?.series_id  || null,
    innings_number: overData.innings_number || null,
  };
  await executeTransaction([
    {
      sql: `INSERT INTO overs (id, innings_id, over_number, bowler_id, sync_status)
            VALUES (?,?,?,?,?)`,
      params: [id, overData.innings_id, overData.over_number, overData.bowler_id, SYNC_STATUS.PENDING],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'overs', 'create', id, JSON.stringify(payload), SYNC_STATUS.PENDING],
    },
  ]);
  return id;
};

// Re-queue an existing over for sync — use when SQLite has the over but MySQL doesn't,
// or when innings UUID mismatch means previous sync stored NULLs.
export const enqueueOverSync = async (overRow, inningsRow, match) => {
  const matchRow = await queryFirstRow('SELECT club_id, series_id FROM matches WHERE id = ?',
                     [match?.id || overRow.match_id]);
  const clubId   = match?.club_id   || matchRow?.club_id   || null;
  const seriesId = match?.series_id || matchRow?.series_id || null;
  await executeQuery(
    `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
     VALUES (?,?,?,?,?,?,datetime('now'))`,
    [
      uuid.v4(), 'overs', 'create', overRow.id,
      JSON.stringify({
        id:             overRow.id,
        innings_id:     overRow.innings_id || inningsRow?.id || null,
        innings_number: inningsRow?.innings_number || null,
        match_id:       match?.id || overRow.match_id || null,
        club_id:        clubId,
        series_id:      seriesId,
        over_number:    overRow.over_number,
        bowler_id:      overRow.bowler_id,
        runs_conceded:  overRow.runs_conceded  || 0,
        wickets:        overRow.wickets        || 0,
        balls_bowled:   overRow.balls_bowled   || 0,
        is_maiden:      overRow.is_maiden      || 0,
        is_completed:   overRow.is_completed   || 0,
      }),
      SYNC_STATUS.PENDING,
    ]
  );
};

export const updateOver = async (id, data) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  await executeQuery(
    `UPDATE overs SET ${fields}, sync_status = ? WHERE id = ?`,
    [...Object.values(data), SYNC_STATUS.PENDING, id]
  );
};

export const getCurrentOver = (inningsId) =>
  queryFirstRow('SELECT * FROM overs WHERE innings_id = ? AND is_completed = 0 ORDER BY over_number DESC LIMIT 1', [inningsId]);

// ── Balls (most critical — every delivery) ─────────────────

export const saveBall = async (ballData) => {
  const id = ballData.id || uuid.v4();
  const bowlerRuns = bowlerRunsForBall(ballData);
  // CRITICAL: use executeTransaction for atomic write + queue
  await executeTransaction([
    {
      sql: `INSERT INTO balls (
              id, over_id, innings_id, match_id, ball_number,
              striker_id, non_striker_id, bowler_id,
              runs_scored, is_wicket, is_extra, extra_type, extra_runs,
              is_four, is_six, is_valid_ball, sync_status
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        id, ballData.over_id, ballData.innings_id, ballData.match_id, ballData.ball_number,
        ballData.striker_id, ballData.non_striker_id, ballData.bowler_id,
        ballData.runs_scored || 0,
        ballData.is_wicket ? 1 : 0,
        ballData.is_extra ? 1 : 0,
        ballData.extra_type || null,
        ballData.extra_runs || 0,
        ballData.is_four ? 1 : 0,
        ballData.is_six ? 1 : 0,
        ballData.is_valid_ball !== false ? 1 : 0,
        SYNC_STATUS.PENDING,
      ],
    },
    // Update batting scorecard
    {
      sql: `INSERT INTO batting_scorecards (id, innings_id, player_id, sync_status)
            SELECT ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM batting_scorecards WHERE innings_id = ? AND player_id = ?
            )`,
      params: [uuid.v4(), ballData.innings_id, ballData.striker_id, SYNC_STATUS.PENDING,
               ballData.innings_id, ballData.striker_id],
    },
    {
      sql: `UPDATE batting_scorecards
            SET runs_scored  = runs_scored + ?,
                balls_faced  = balls_faced + ?,
                fours        = fours + ?,
                sixes        = sixes + ?,
                strike_rate  = CASE WHEN (balls_faced + ?) > 0
                               THEN CAST(runs_scored + ? AS REAL) / (balls_faced + ?) * 100
                               ELSE 0.0 END,
                sync_status  = ?,
                updated_at   = datetime('now')
            WHERE innings_id = ? AND player_id = ?`,
      params: [
        ballData.runs_scored || 0,                       // runs_scored delta
        ballData.extra_type !== 'wide' ? 1 : 0,          // balls_faced delta (no-ball=+1, wide=+0)
        ballData.is_four ? 1 : 0,
        ballData.is_six ? 1 : 0,
        ballData.extra_type !== 'wide' ? 1 : 0,          // SR: new balls_faced
        ballData.runs_scored || 0,                       // SR: new runs_scored
        ballData.extra_type !== 'wide' ? 1 : 0,          // SR: new balls_faced (divisor)
        SYNC_STATUS.PENDING,
        ballData.innings_id, ballData.striker_id,
      ],
    },
    // Update over stats
    {
      sql: `UPDATE overs
            SET runs_conceded = runs_conceded + ?,
                balls_bowled = balls_bowled + ?,
                wickets = wickets + ?,
                sync_status = ?
            WHERE id = ?`,
      params: [
        (ballData.runs_scored || 0) + (ballData.extra_runs || 0),
        ballData.is_valid_ball !== false ? 1 : 0,
        ballData.is_wicket ? 1 : 0,
        SYNC_STATUS.PENDING,
        ballData.over_id,
      ],
    },
    // Update innings totals
    {
      sql: `UPDATE innings
            SET total_runs = total_runs + ?,
                extras = extras + ?,
                sync_status = ?,
                updated_at = datetime('now')
            WHERE id = ?`,
      params: [
        (ballData.runs_scored || 0) + (ballData.extra_runs || 0),
        ballData.extra_runs || 0,
        SYNC_STATUS.PENDING,
        ballData.innings_id,
      ],
    },
    // Ensure bowling scorecard row exists
    {
      sql: `INSERT INTO bowling_scorecards (id, innings_id, player_id, sync_status)
            SELECT ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM bowling_scorecards WHERE innings_id = ? AND player_id = ?
            )`,
      params: [uuid.v4(), ballData.innings_id, ballData.bowler_id, SYNC_STATUS.PENDING,
               ballData.innings_id, ballData.bowler_id],
    },
    // Update bowling scorecard runs + balls + overs + economy
    {
      sql: `UPDATE bowling_scorecards
            SET runs_conceded = runs_conceded + ?,
                balls_bowled  = balls_bowled  + ?,
                overs_bowled  = ((balls_bowled + ?) / 6) + (((balls_bowled + ?) % 6) * 0.1),
                economy_rate  = CASE WHEN (balls_bowled + ?) > 0
                                THEN CAST(runs_conceded + ? AS REAL) / ((balls_bowled + ?) / 6.0)
                                ELSE 0.0 END,
                sync_status   = ?,
                updated_at    = datetime('now')
            WHERE innings_id = ? AND player_id = ?`,
      params: [
        bowlerRuns,                                                // byes/leg-byes are not charged to bowler
        ballData.is_valid_ball !== false ? 1 : 0,                  // balls_bowled delta
        ballData.is_valid_ball !== false ? 1 : 0,                  // overs formula ?1
        ballData.is_valid_ball !== false ? 1 : 0,                  // overs formula ?2
        ballData.is_valid_ball !== false ? 1 : 0,                  // eco: new balls_bowled
        bowlerRuns,                                                // eco: new runs_conceded
        ballData.is_valid_ball !== false ? 1 : 0,                  // eco: new balls_bowled (divisor)
        SYNC_STATUS.PENDING,
        ballData.innings_id, ballData.bowler_id,
      ],
    },
    // Add to sync queue
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'balls', 'create', id, JSON.stringify({ ...ballData, id }), SYNC_STATUS.PENDING],
    },
  ]);
  return id;
};

// ── Wickets ───────────────────────────────────────────────

export const saveWicket = async (wicketData) => {
  const id = wicketData.id || uuid.v4();
  const creditsBowler = BOWLER_CREDIT_WICKET_TYPES.has(wicketData.wicket_type);
  const queries = [
    {
      sql: `INSERT INTO wickets (id, ball_id, innings_id, batsman_id, bowler_id, wicket_type, fielder_id, runs_at_fall, over_at_fall, sync_status)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      params: [id, wicketData.ball_id, wicketData.innings_id, wicketData.batsman_id,
               wicketData.bowler_id, wicketData.wicket_type, wicketData.fielder_id,
               wicketData.runs_at_fall, wicketData.over_at_fall, SYNC_STATUS.PENDING],
    },
    {
      sql: `UPDATE batting_scorecards SET is_out = 1, dismissal_type = ?, bowler_id = ?, fielder_id = ?, sync_status = ? WHERE innings_id = ? AND player_id = ?`,
      params: [wicketData.wicket_type, wicketData.bowler_id, wicketData.fielder_id, SYNC_STATUS.PENDING, wicketData.innings_id, wicketData.batsman_id],
    },
    {
      sql: `UPDATE innings SET total_wickets = total_wickets + 1, sync_status = ? WHERE id = ?`,
      params: [SYNC_STATUS.PENDING, wicketData.innings_id],
    },
  ];

  if (creditsBowler) {
    queries.push({
      sql: `UPDATE bowling_scorecards SET wickets = wickets + 1, sync_status = ? WHERE innings_id = ? AND player_id = ?`,
      params: [SYNC_STATUS.PENDING, wicketData.innings_id, wicketData.bowler_id],
    });
  }

  queries.push({
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'wickets', 'create', id, JSON.stringify({ ...wicketData, id }), SYNC_STATUS.PENDING],
    });

  await executeTransaction(queries);
  return id;
};

// ── Retired Batsman ───────────────────────────────────────
// Retired is NOT a wicket: no ball is saved, over doesn't advance,
// bowling/innings wicket counts are untouched. We only mark the
// batsman's batting_scorecards row as retired.
export const retireBatsman = async (inningsId, batsmanId) => {
  const eventId = uuid.v4();
  await executeTransaction([
    // Ensure batting scorecard row exists (batsman may not have faced a ball yet)
    {
      sql: `INSERT INTO batting_scorecards (id, innings_id, player_id, sync_status)
            SELECT ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM batting_scorecards WHERE innings_id = ? AND player_id = ?
            )`,
      params: [uuid.v4(), inningsId, batsmanId, SYNC_STATUS.PENDING, inningsId, batsmanId],
    },
    {
      sql: `UPDATE batting_scorecards
            SET is_out = 1, dismissal_type = 'retired',
                sync_status = ?, updated_at = datetime('now')
            WHERE innings_id = ? AND player_id = ?`,
      params: [SYNC_STATUS.PENDING, inningsId, batsmanId],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        eventId, 'batting_scorecards', 'update',
        `${inningsId}:${batsmanId}`,
        JSON.stringify({ innings_id: inningsId, player_id: batsmanId, is_out: 1, dismissal_type: 'retired' }),
        SYNC_STATUS.PENDING,
      ],
    },
  ]);
};

// ── Match Result ──────────────────────────────────────────

export const saveMatchResult = async (resultData) => {
  const id = resultData.id || uuid.v4();

  // ── Resolve server integer IDs before building sync payloads ──────────
  // The server's match_results and matches tables use INT foreign keys.
  // SQLite teams/players/matches tables store server_id alongside the local UUID.
  const [matchRow, winnerRow, loserRow, playerRow] = await Promise.all([
    resultData.match_id
      ? queryFirstRow('SELECT server_id, club_id, series_id FROM matches WHERE id = ?', [resultData.match_id])
      : null,
    resultData.winner_team_id
      ? queryFirstRow('SELECT server_id FROM teams WHERE id = ?', [resultData.winner_team_id])
      : null,
    resultData.loser_team_id
      ? queryFirstRow('SELECT server_id FROM teams WHERE id = ?', [resultData.loser_team_id])
      : null,
    resultData.player_of_match
      ? queryFirstRow('SELECT server_id FROM players WHERE id = ?', [resultData.player_of_match])
      : null,
  ]);

  const numericOrNull = value => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  const serverMatchId   = resultData.match_server_id || matchRow?.server_id || numericOrNull(resultData.match_id);
  const serverWinnerId  = resultData.winner_team_server_id || winnerRow?.server_id || numericOrNull(resultData.winner_team_id);
  const serverLoserId   = resultData.loser_team_server_id || loserRow?.server_id || numericOrNull(resultData.loser_team_id);
  const serverPlayerId  = resultData.player_of_match_server_id || playerRow?.server_id || numericOrNull(resultData.player_of_match);
  const clubId          = resultData.club_id || matchRow?.club_id || null;
  const seriesId        = resultData.series_id || matchRow?.series_id || null;
  const resultText      = resultData.result_text || null;
  const parsedMargin    = resultText?.match(/\b(?:won|wins)\s+by\s+(\d+)\s+(run|runs|wicket|wickets)\b/i);
  const numericMargin   = Number(resultData.margin);
  const margin          = Number.isFinite(numericMargin) && numericMargin > 0
    ? numericMargin
    : (parsedMargin ? Number(parsedMargin[1]) : 0);
  const parsedMarginType = parsedMargin?.[2]?.toLowerCase().startsWith('run') ? 'runs' : (parsedMargin ? 'wickets' : null);
  const marginType      = resultData.result_type === 'tie'
    ? null
    : (resultData.margin_type || parsedMarginType);

  await executeTransaction([
    {
      sql: `INSERT OR REPLACE INTO match_results (
              id, club_id, series_id, match_id, winner_team_id, loser_team_id, result_type,
              margin, margin_type, team_a_score, team_b_score,
              player_of_match, result_text, sync_status
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        id,
        clubId,
        seriesId,
        resultData.match_id,       // local UUID stored locally
        resultData.winner_team_id, // local UUID stored locally
        resultData.loser_team_id,
        resultData.result_type, margin, marginType,
        resultData.team_a_score, resultData.team_b_score,
        resultData.player_of_match,
        resultText, SYNC_STATUS.PENDING,
      ],
    },
    {
      sql: `UPDATE matches SET status = 'completed', result_text = ?, winner_team_id = ?, player_of_match = ?, sync_status = ? WHERE id = ?`,
      params: [resultData.result_text, resultData.winner_team_id, resultData.player_of_match, SYNC_STATUS.PENDING, resultData.match_id],
    },
    // Sync payload for match_results — server integer IDs in the right columns
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'match_results', 'create', id,
        JSON.stringify({
          id,
          club_id:              clubId,
          series_id:            seriesId,
          match_id:             serverMatchId,          // INT
          match_local_id:       resultData.match_id,    // UUID
          winner_team_id:       serverWinnerId,         // INT
          winner_team_local:    resultData.winner_team_id,
          loser_team_id:        serverLoserId,          // INT
          loser_team_local:     resultData.loser_team_id,
          result_type:          resultData.result_type,
          margin,
          margin_type:          marginType,
          team_a_score:         resultData.team_a_score,
          team_b_score:         resultData.team_b_score,
          player_of_match:      serverPlayerId,         // INT
          player_of_match_local: resultData.player_of_match,
          result_text:          resultText,
        }),
        SYNC_STATUS.PENDING,
      ],
    },
    // Sync payload for matches table — mark as completed with server integer IDs
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'matches', 'update', resultData.match_id,
        JSON.stringify({
          id:              serverMatchId,            // INT — server uses this to look up the row
          local_id:        resultData.match_id,      // UUID fallback
          status:          'completed',
          result_text:     resultText,
          winner_team_id:  serverWinnerId,           // INT
          player_of_match: serverPlayerId,           // INT
        }),
        SYNC_STATUS.PENDING,
      ],
    },
  ]);
  return id;
};

export const getMatchResult = (matchId) =>
  queryFirstRow('SELECT * FROM match_results WHERE match_id = ? LIMIT 1', [matchId]);

// ── Upsert innings rows from server response ───────────────
// serverInnings : array from GET /matches/score.php
// matchLocalId  : the local UUID of the match
export const upsertInningsFromServer = async (serverInnings, matchLocalId) => {
  if (!serverInnings?.length) return;
  for (const inn of serverInnings) {
    const localId = inn.local_id || uuid.v4();

    // Resolve batting team local UUID
    let battingLocal = inn.batting_team_local || null;
    if (!battingLocal && inn.batting_team_id) {
      const row = await queryFirstRow('SELECT id FROM teams WHERE server_id = ?', [inn.batting_team_id]);
      battingLocal = row?.id || String(inn.batting_team_id);
    }

    // Resolve bowling team local UUID
    let bowlingLocal = inn.bowling_team_local || null;
    if (!bowlingLocal && inn.bowling_team_id) {
      const row = await queryFirstRow('SELECT id FROM teams WHERE server_id = ?', [inn.bowling_team_id]);
      bowlingLocal = row?.id || String(inn.bowling_team_id);
    }

    await executeQuery(
      `INSERT OR REPLACE INTO innings (
         id, server_id, match_id, innings_number, is_super_over, super_over_number,
         batting_team_id, bowling_team_id,
         total_runs, total_wickets, total_overs, is_completed, sync_status
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        localId,
        inn.id   || null,
        matchLocalId,
        inn.innings_number,
        inn.is_super_over ? 1 : 0,
        inn.super_over_number || null,
        battingLocal,
        bowlingLocal,
        inn.total_runs    || 0,
        inn.total_wickets || 0,
        inn.total_overs   || 0,
        inn.is_completed  || 0,
        SYNC_STATUS.SYNCED,
      ]
    );
  }
};

// ── Upsert teams from server response ─────────────────────
// serverTeams  : array from GET /teams/list.php?match_id=...
// matchLocalId : the local UUID of the match
export const upsertTeamsFromServer = async (serverTeams, matchLocalId) => {
  if (!serverTeams?.length) return;
  for (const t of serverTeams) {
    const localId = t.local_id || uuid.v4();
    await executeQuery(
      `INSERT OR REPLACE INTO teams (
         id, server_id, match_id, club_id, series_id,
         team_name, team_label, captain_id, sync_status
       ) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        localId,
        t.id    || null,
        matchLocalId,
        t.club_id   != null ? String(t.club_id)   : null,
        t.series_id != null ? String(t.series_id) : null,
        t.team_name || `Team ${t.team_label || ''}`,
        t.team_label || null,
        t.captain_local || (t.captain_id != null ? String(t.captain_id) : null),
        SYNC_STATUS.SYNCED,
      ]
    );
  }
};

// ── Upsert match result from server response ───────────────
// serverResult : object from GET /matches/result.php
// matchLocalId : the local UUID of the match
export const upsertMatchResultFromServer = async (serverResult, matchLocalId) => {
  if (!serverResult) return;
  const localId = serverResult.local_id || uuid.v4();

  // Resolve winner team local UUID
  let winnerLocal = serverResult.winner_team_local || null;
  if (!winnerLocal && serverResult.winner_team_id) {
    const row = await queryFirstRow('SELECT id FROM teams WHERE server_id = ?', [serverResult.winner_team_id]);
    winnerLocal = row?.id || String(serverResult.winner_team_id);
  }

  // Resolve loser team local UUID
  let loserLocal = serverResult.loser_team_local || null;
  if (!loserLocal && serverResult.loser_team_id) {
    const row = await queryFirstRow('SELECT id FROM teams WHERE server_id = ?', [serverResult.loser_team_id]);
    loserLocal = row?.id || String(serverResult.loser_team_id);
  }

  // Resolve POTM player local UUID
  let playerLocal = serverResult.player_of_match_local || null;
  if (!playerLocal && serverResult.player_of_match) {
    const row = await queryFirstRow('SELECT id FROM players WHERE server_id = ?', [serverResult.player_of_match]);
    playerLocal = row?.id || null;
  }

  await executeQuery(
    `INSERT OR REPLACE INTO match_results (
       id, club_id, series_id, match_id, winner_team_id, loser_team_id, result_type,
       margin, margin_type, team_a_score, team_b_score,
       player_of_match, result_text, sync_status
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      localId,
      serverResult.club_id != null ? String(serverResult.club_id) : null,
      serverResult.series_id != null ? String(serverResult.series_id) : null,
      matchLocalId,
      winnerLocal,
      loserLocal,
      serverResult.result_type  || 'win',
      serverResult.margin       || 0,
      serverResult.margin_type  || 'runs',
      serverResult.team_a_score || null,
      serverResult.team_b_score || null,
      playerLocal,
      serverResult.result_text  || null,
      SYNC_STATUS.SYNCED,
    ]
  );
};

// ── Scorecard Queries ─────────────────────────────────────

// Batting figures are always derived from the delivery ledger.  The aggregate
// table still owns dismissal metadata and batting order, but it must never be
// able to show stale (or incorrectly cached) runs/balls after a wicket.
export const getBattingScorecard = (inningsId) =>
  queryRows(`
    SELECT
      bs.id,
      bs.innings_id,
      bs.player_id,
      COALESCE(bt.runs_scored, 0) AS runs_scored,
      COALESCE(bt.balls_faced, 0) AS balls_faced,
      COALESCE(bt.fours, 0) AS fours,
      COALESCE(bt.sixes, 0) AS sixes,
      CASE WHEN COALESCE(bt.balls_faced, 0) > 0
        THEN CAST(COALESCE(bt.runs_scored, 0) AS REAL) / bt.balls_faced * 100
        ELSE 0.0
      END AS strike_rate,
      bs.dismissal_type,
      bs.bowler_id,
      bs.fielder_id,
      bs.is_out,
      bs.batting_order,
      bs.created_at,
      bs.updated_at,
      bs.sync_status,
      u.name AS full_name,
      p.player_type,
      COALESCE(bt.dots, 0) AS dots
    FROM batting_scorecards bs
    JOIN players p ON bs.player_id = p.id
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN (
      SELECT
        b.innings_id,
        b.striker_id AS player_id,
        SUM(COALESCE(b.runs_scored, 0)) AS runs_scored,
        SUM(CASE WHEN b.extra_type = 'wide' THEN 0 ELSE 1 END) AS balls_faced,
        SUM(CASE WHEN b.is_four = 1 THEN 1 ELSE 0 END) AS fours,
        SUM(CASE WHEN b.is_six = 1 THEN 1 ELSE 0 END) AS sixes,
        SUM(CASE WHEN b.is_valid_ball = 1 AND b.runs_scored = 0 THEN 1 ELSE 0 END) AS dots
      FROM balls b
      WHERE b.innings_id = ?
      GROUP BY b.innings_id, b.striker_id
    ) bt ON bt.innings_id = bs.innings_id AND bt.player_id = bs.player_id
    WHERE bs.innings_id = ?
    ORDER BY bs.batting_order ASC, COALESCE(bt.runs_scored, 0) DESC
  `, [inningsId, inningsId]);

export const getBowlingScorecard = (inningsId) =>
  (async () => {
    // Bowling figures are derived from balls. Reconcile existing local rows so
    // old matches recorded before the bye/leg-bye fix show correct figures too.
    await executeQuery(`
      UPDATE bowling_scorecards
      SET runs_conceded = COALESCE((
            SELECT SUM(
              COALESCE(b.runs_scored, 0) +
              CASE WHEN b.extra_type IN ('bye', 'leg_bye') THEN 0 ELSE COALESCE(b.extra_runs, 0) END
            )
            FROM balls b
            WHERE b.innings_id = bowling_scorecards.innings_id
              AND b.bowler_id = bowling_scorecards.player_id
          ), 0),
          maidens = COALESCE((
            SELECT COUNT(*)
            FROM overs o
            WHERE o.innings_id = bowling_scorecards.innings_id
              AND o.bowler_id = bowling_scorecards.player_id
              AND o.is_completed = 1
              AND NOT EXISTS (
                SELECT 1
                FROM balls b
                WHERE b.over_id = o.id
                  AND (
                    COALESCE(b.runs_scored, 0) +
                    CASE WHEN b.extra_type IN ('bye', 'leg_bye') THEN 0 ELSE COALESCE(b.extra_runs, 0) END
                  ) > 0
              )
          ), 0)
      WHERE innings_id = ?
    `, [inningsId]);

    await executeQuery(`
      UPDATE bowling_scorecards
      SET economy_rate = CASE
        WHEN balls_bowled > 0 THEN ROUND(CAST(runs_conceded AS REAL) / (balls_bowled / 6.0), 2)
        ELSE 0.0
      END
      WHERE innings_id = ?
    `, [inningsId]);

    return queryRows(`
    SELECT bs.*, u.name AS full_name,
      (SELECT COUNT(*) FROM balls b
        WHERE b.innings_id = bs.innings_id
          AND b.bowler_id = bs.player_id
          AND b.is_valid_ball = 1
          AND b.runs_scored = 0
          AND (b.extra_type IS NULL OR b.extra_type IN ('bye', 'leg_bye'))) AS dots
    FROM bowling_scorecards bs
    JOIN players p ON bs.player_id = p.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE bs.innings_id = ?
    ORDER BY bs.wickets DESC, bs.economy_rate ASC
    `, [inningsId]);
  })();

export const getInningsExtras = (inningsId) =>
  queryFirstRow(`
    SELECT
      SUM(CASE WHEN extra_type = 'wide'    THEN extra_runs   ELSE 0 END) AS wides,
      SUM(CASE WHEN extra_type = 'no_ball' THEN extra_runs   ELSE 0 END) AS no_balls,
      SUM(CASE WHEN extra_type = 'bye'     THEN extra_runs   ELSE 0 END) AS byes,
      SUM(CASE WHEN extra_type = 'leg_bye' THEN extra_runs   ELSE 0 END) AS leg_byes,
      SUM(COALESCE(extra_runs, 0))                                        AS total_extras
    FROM balls WHERE innings_id = ?
  `, [inningsId]);

export const getInningsBalls = (inningsId) =>
  queryRows('SELECT * FROM balls WHERE innings_id = ? ORDER BY created_at ASC', [inningsId]);

// ── Ball-by-Ball with player names ────────────────────────
export const getBallsWithPlayers = (inningsId) =>
  queryRows(`
    SELECT b.*,
           w.wicket_type,
           w.batsman_id AS wicket_batsman_id,
           w.fielder_id AS wicket_fielder_id,
           us.name  AS striker_name,
           uns.name AS non_striker_name,
           ubw.name AS bowler_name
    FROM balls b
    LEFT JOIN wickets w ON w.ball_id = b.id
    LEFT JOIN players s   ON b.striker_id     = s.id
    LEFT JOIN players ns  ON b.non_striker_id = ns.id
    LEFT JOIN players bw  ON b.bowler_id      = bw.id
    LEFT JOIN users us    ON s.user_id        = us.id
    LEFT JOIN users uns   ON ns.user_id       = uns.id
    LEFT JOIN users ubw   ON bw.user_id       = ubw.id
    WHERE b.innings_id = ?
    ORDER BY b.created_at ASC
  `, [inningsId]);

// ── Undo last ball ────────────────────────────────────────
export const getLastBall = (inningsId) =>
  queryFirstRow(`
    SELECT b.*,
           w.wicket_type,
           w.batsman_id AS wicket_batsman_id,
           w.fielder_id AS wicket_fielder_id,
           us.name  AS striker_name,
           uns.name AS non_striker_name,
           ubw.name AS bowler_name
    FROM balls b
    LEFT JOIN wickets w ON w.ball_id = b.id
    LEFT JOIN players s   ON b.striker_id     = s.id
    LEFT JOIN players ns  ON b.non_striker_id = ns.id
    LEFT JOIN players bw  ON b.bowler_id      = bw.id
    LEFT JOIN users us    ON s.user_id        = us.id
    LEFT JOIN users uns   ON ns.user_id       = uns.id
    LEFT JOIN users ubw   ON bw.user_id       = ubw.id
    WHERE b.innings_id = ?
    ORDER BY b.created_at DESC
    LIMIT 1
  `, [inningsId]);

export const deleteBall = async (ball, inningsId) => {
  const totalDelta  = (ball.runs_scored || 0) + (ball.extra_runs || 0);
  const extrasDelta = ball.extra_runs || 0;
  const isValid     = Number(ball.is_valid_ball ?? 1) === 1;
  const isWicket    = Number(ball.is_wicket || 0) === 1;
  const dismissedBatsmanId = ball.wicket_batsman_id || ball.batsman_id || ball.striker_id;
  const creditsBowler = ball.wicket_type
    ? BOWLER_CREDIT_WICKET_TYPES.has(ball.wicket_type)
    : isWicket;

  const queries = [
    { sql: 'DELETE FROM balls WHERE id = ?', params: [ball.id] },
    // Undo bowling scorecard runs/balls
    {
      sql: `UPDATE bowling_scorecards
            SET runs_conceded = MAX(0, runs_conceded - ?),
                balls_bowled  = MAX(0, balls_bowled  - ?),
                overs_bowled  = (MAX(0, balls_bowled - ?) / 6) + ((MAX(0, balls_bowled - ?) % 6) * 0.1)
            WHERE innings_id = ? AND player_id = ?`,
      params: [
        bowlerRunsForBall(ball),
        isValid ? 1 : 0,
        isValid ? 1 : 0,
        isValid ? 1 : 0,
        inningsId, ball.bowler_id,
      ],
    },
    // Undo batting scorecard
    {
      sql: `UPDATE batting_scorecards
            SET runs_scored = MAX(0, runs_scored - ?),
                balls_faced = MAX(0, balls_faced - ?),
                fours = MAX(0, fours - ?),
                sixes = MAX(0, sixes - ?)
            WHERE innings_id = ? AND player_id = ?`,
      params: [
        ball.runs_scored || 0,
        isValid ? 1 : 0,
        ball.is_four || 0,
        ball.is_six  || 0,
        inningsId, ball.striker_id,
      ],
    },
    // Undo innings totals
    {
      sql: `UPDATE innings
            SET total_runs = MAX(0, total_runs - ?),
                extras = MAX(0, extras - ?)
            WHERE id = ?`,
      params: [totalDelta, extrasDelta, inningsId],
    },
    // Undo over balls/runs
    {
      sql: `UPDATE overs
            SET runs_conceded = MAX(0, runs_conceded - ?),
                balls_bowled  = MAX(0, balls_bowled  - ?),
                wickets       = MAX(0, wickets       - ?)
            WHERE id = ?`,
      params: [totalDelta, isValid ? 1 : 0, isWicket ? 1 : 0, ball.over_id],
    },
    // If it was a wicket, undo
    ...(isWicket
      ? [
          {
            sql: `UPDATE innings SET total_wickets = MAX(0, total_wickets - 1) WHERE id = ?`,
            params: [inningsId],
          },
          {
            sql: `UPDATE batting_scorecards SET is_out = 0, dismissal_type = NULL, bowler_id = NULL, fielder_id = NULL WHERE innings_id = ? AND player_id = ?`,
            params: [inningsId, dismissedBatsmanId],
          },
          // Remove the wicket record
          {
            sql: `DELETE FROM wickets WHERE ball_id = ?`,
            params: [ball.id],
          },
        ]
      : []),
  ];

  if (isWicket && creditsBowler) {
    queries.push({
      sql: `UPDATE bowling_scorecards SET wickets = MAX(0, wickets - 1), sync_status = ? WHERE innings_id = ? AND player_id = ?`,
      params: [SYNC_STATUS.PENDING, inningsId, ball.bowler_id],
    });
  }

  queries.push({
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'balls', 'delete', ball.id, JSON.stringify({ id: ball.id }), SYNC_STATUS.PENDING],
    });

  await executeTransaction(queries);
};

// ── Per-player batting stats (live) ──────────────────────
export const getPlayerBattingStats = async (inningsId, playerId) => {
  const scorecard = await getBattingScorecard(inningsId);
  return scorecard.find(row => String(row.player_id) === String(playerId)) || null;
};

// ── Overs for innings (for maiden calc) ──────────────────
export const getInningsOvers = (inningsId) =>
  queryRows('SELECT * FROM overs WHERE innings_id = ? ORDER BY over_number ASC', [inningsId]);

// ── Clear innings live-scoring progress (fresh restart) ──────────────────
// Deletes all balls, overs, and batting/bowling scorecards for the innings
// and resets the innings totals to 0. Called when the opening pair is
// re-selected (e.g. app crashed mid-over and user is starting fresh).
export const clearInningsProgress = async (inningsId) => {
  await executeTransaction([
    { sql: 'DELETE FROM balls               WHERE innings_id = ?', params: [inningsId] },
    { sql: 'DELETE FROM overs               WHERE innings_id = ?', params: [inningsId] },
    { sql: 'DELETE FROM batting_scorecards  WHERE innings_id = ?', params: [inningsId] },
    { sql: 'DELETE FROM bowling_scorecards  WHERE innings_id = ?', params: [inningsId] },
    { sql: 'DELETE FROM wickets             WHERE innings_id = ?', params: [inningsId] },
    {
      sql: `UPDATE innings
            SET total_runs = 0, total_wickets = 0, total_overs = 0, extras = 0
            WHERE id = ?`,
      params: [inningsId],
    },
  ]);
};
