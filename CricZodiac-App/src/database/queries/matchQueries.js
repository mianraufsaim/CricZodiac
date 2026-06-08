// ============================================================
// CricZodiac — Match Database Queries (Local SQLite)
// ============================================================

import { queryRows, queryFirstRow, executeQuery, executeTransaction } from '../DatabaseHelper';
import { SYNC_STATUS } from '../../config/constants';
import uuid from 'react-native-uuid';

// ── Matches ───────────────────────────────────────────────

export const createMatch = async (matchData) => {
  const id = matchData.id || uuid.v4();
  const queries = [
    {
      sql: `INSERT INTO matches (
        id, club_id, title, venue, match_date, overs, players_per_team,
        team_a_id, team_b_id, series_id,
        wide_value, no_ball_value, max_overs_per_bowler,
        status, created_at, sync_status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?)`,
      params: [
        id, matchData.club_id || null,
        matchData.title, matchData.venue, matchData.match_date,
        matchData.overs || 6, matchData.players_per_team || 6,
        matchData.team_a_id, matchData.team_b_id,
        matchData.series_id || null,
        matchData.wide_value || 1, matchData.no_ball_value || 1, matchData.max_overs_per_bowler || 0,
        'setup', SYNC_STATUS.PENDING
      ],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'matches', 'create', id, JSON.stringify({ ...matchData, id }), SYNC_STATUS.PENDING],
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
        team_a_id, team_b_id, series_id, toss_winner_id, toss_choice, batting_first,
        wide_value, no_ball_value, max_overs_per_bowler, status, result_text,
        winner_team_id, player_of_match, created_at, updated_at, sync_status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        matchId,
        m.id || null,
        m.club_id != null ? String(m.club_id) : null,
        m.title,
        m.venue || null,
        m.match_date || null,
        m.overs || 6,
        m.players_per_team || 6,
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

export const getTeamPlayers = (teamId) =>
  queryRows(`
    SELECT tp.*, COALESCE(u.name, p.full_name) AS full_name, p.player_type, p.profile_pic
    FROM team_players tp
    JOIN players p ON tp.player_id = p.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE tp.team_id = ?
    ORDER BY tp.batting_order ASC
  `, [teamId]);

// Cache team players received from the server into SQLite.
// serverPlayers: array from GET /teams/players.php
// teamLocalId: the SQLite UUID for this team
export const upsertTeamPlayersFromServer = async (serverPlayers, teamLocalId) => {
  if (!serverPlayers?.length) return;
  for (const sp of serverPlayers) {
    // Prefer local UUIDs; fall back to string of server integer id
    const playerId = sp.player_uuid || String(sp.player_id);
    const tpId     = sp.local_id    || String(sp.id);

    // Cache user into SQLite so the JOIN in getTeamPlayers can resolve the name.
    // users.local_id is often NULL in MySQL, so we derive a stable SQLite user id
    // from the server integer user_id (stored as "u_<int>").
    const sqliteUserId = sp.user_uuid || (sp.user_id ? `u_${sp.user_id}` : null);
    if (sqliteUserId && sp.full_name) {
      await executeQuery(
        `INSERT OR IGNORE INTO users (id, server_id, name, role, status, is_approved) VALUES (?, ?, ?, 'player', 'active', 1)`,
        [sqliteUserId, sp.user_id || null, sp.full_name]
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
        sp.full_name    || 'Unknown',
        sp.player_type  || 'allrounder',
        sp.batting_hand || 'right',
        sp.bowling_style || null,
        sp.profile_pic   || null,
        sp.is_active != null ? (sp.is_active ? 1 : 0) : 1,
      ]
    );
    // Always refresh name + user_id from server in case the row was previously
    // cached with an empty full_name (INSERT OR IGNORE would have skipped it)
    if (sp.full_name) {
      await executeQuery(
        `UPDATE players SET full_name = ?, user_id = COALESCE(?, user_id), sync_status = 'synced' WHERE id = ?`,
        [sp.full_name, sqliteUserId || null, playerId]
      );
    }

    // Ensure team_player row exists in SQLite
    await executeQuery(
      `INSERT OR IGNORE INTO team_players
         (id, team_id, player_id, batting_order, sync_status)
       VALUES (?, ?, ?, ?, 'synced')`,
      [tpId, teamLocalId, playerId, sp.batting_order || 0]
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
  const id = inningsData.id || uuid.v4();
  // Resolve club_id + series_id from match if not provided
  const matchRow = await queryFirstRow('SELECT club_id, series_id FROM matches WHERE id = ?', [inningsData.match_id]);
  const clubId   = inningsData.club_id   || matchRow?.club_id   || null;
  const seriesId = inningsData.series_id || matchRow?.series_id || null;
  await executeTransaction([
    {
      sql: `INSERT INTO innings (id, match_id, innings_number, batting_team_id, bowling_team_id, sync_status)
            VALUES (?,?,?,?,?,?)`,
      params: [id, inningsData.match_id, inningsData.innings_number,
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
        batting_team_id: inningsRow.batting_team_id,
        bowling_team_id: inningsRow.bowling_team_id,
        total_runs:      inningsRow.total_runs      || 0,
        total_wickets:   inningsRow.total_wickets   || 0,
      }),
      SYNC_STATUS.PENDING,
    ]
  );
};

export const updateInnings = async (id, data) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  await executeQuery(
    `UPDATE innings SET ${fields}, sync_status = ?, updated_at = datetime('now') WHERE id = ?`,
    [...Object.values(data), SYNC_STATUS.PENDING, id]
  );
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
            SET runs_scored = runs_scored + ?,
                balls_faced = balls_faced + ?,
                fours = fours + ?,
                sixes = sixes + ?,
                sync_status = ?,
                updated_at = datetime('now')
            WHERE innings_id = ? AND player_id = ?`,
      params: [
        ballData.runs_scored || 0,
        ballData.is_valid_ball !== false ? 1 : 0,
        ballData.is_four ? 1 : 0,
        ballData.is_six ? 1 : 0,
        SYNC_STATUS.PENDING,
        ballData.innings_id, ballData.striker_id,
      ],
    },
    // Update over stats
    {
      sql: `UPDATE overs
            SET runs_conceded = runs_conceded + ?,
                balls_bowled = balls_bowled + ?,
                sync_status = ?
            WHERE id = ?`,
      params: [
        (ballData.runs_scored || 0) + (ballData.extra_runs || 0),
        ballData.is_valid_ball !== false ? 1 : 0,
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
    // Update bowling scorecard runs + balls + overs
    {
      sql: `UPDATE bowling_scorecards
            SET runs_conceded = runs_conceded + ?,
                balls_bowled  = balls_bowled  + ?,
                overs_bowled  = ((balls_bowled + ?) / 6) + (((balls_bowled + ?) % 6) * 0.1),
                sync_status   = ?,
                updated_at    = datetime('now')
            WHERE innings_id = ? AND player_id = ?`,
      params: [
        (ballData.runs_scored || 0) + (ballData.extra_runs || 0),
        ballData.is_valid_ball !== false ? 1 : 0,
        ballData.is_valid_ball !== false ? 1 : 0,
        ballData.is_valid_ball !== false ? 1 : 0,
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
  await executeTransaction([
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
    {
      sql: `UPDATE bowling_scorecards SET wickets = wickets + 1, sync_status = ? WHERE innings_id = ? AND player_id = ?`,
      params: [SYNC_STATUS.PENDING, wicketData.innings_id, wicketData.bowler_id],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'wickets', 'create', id, JSON.stringify({ ...wicketData, id }), SYNC_STATUS.PENDING],
    },
  ]);
  return id;
};

// ── Match Result ──────────────────────────────────────────

export const saveMatchResult = async (resultData) => {
  const id = resultData.id || uuid.v4();
  await executeTransaction([
    {
      sql: `INSERT OR REPLACE INTO match_results (
              id, match_id, winner_team_id, loser_team_id, result_type,
              margin, margin_type, team_a_score, team_b_score,
              player_of_match, result_text, sync_status
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        id, resultData.match_id, resultData.winner_team_id, resultData.loser_team_id,
        resultData.result_type, resultData.margin, resultData.margin_type,
        resultData.team_a_score, resultData.team_b_score,
        resultData.player_of_match, resultData.result_text, SYNC_STATUS.PENDING,
      ],
    },
    {
      sql: `UPDATE matches SET status = 'completed', result_text = ?, winner_team_id = ?, player_of_match = ?, sync_status = ? WHERE id = ?`,
      params: [resultData.result_text, resultData.winner_team_id, resultData.player_of_match, SYNC_STATUS.PENDING, resultData.match_id],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'match_results', 'create', id, JSON.stringify({ ...resultData, id }), SYNC_STATUS.PENDING],
    },
  ]);
  return id;
};

// ── Scorecard Queries ─────────────────────────────────────

export const getBattingScorecard = (inningsId) =>
  queryRows(`
    SELECT bs.*, u.name AS full_name, p.player_type
    FROM batting_scorecards bs
    JOIN players p ON bs.player_id = p.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE bs.innings_id = ?
    ORDER BY bs.batting_order ASC, bs.runs_scored DESC
  `, [inningsId]);

export const getBowlingScorecard = (inningsId) =>
  queryRows(`
    SELECT bs.*, u.name AS full_name
    FROM bowling_scorecards bs
    JOIN players p ON bs.player_id = p.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE bs.innings_id = ?
    ORDER BY bs.wickets DESC, bs.economy_rate ASC
  `, [inningsId]);

export const getInningsBalls = (inningsId) =>
  queryRows('SELECT * FROM balls WHERE innings_id = ? ORDER BY created_at ASC', [inningsId]);

// ── Ball-by-Ball with player names ────────────────────────
export const getBallsWithPlayers = (inningsId) =>
  queryRows(`
    SELECT b.*,
           us.name  AS striker_name,
           uns.name AS non_striker_name,
           ubw.name AS bowler_name
    FROM balls b
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
  queryFirstRow('SELECT * FROM balls WHERE innings_id = ? ORDER BY created_at DESC LIMIT 1', [inningsId]);

export const deleteBall = async (ball, inningsId) => {
  const totalDelta  = (ball.runs_scored || 0) + (ball.extra_runs || 0);
  const extrasDelta = ball.extra_runs || 0;
  const isValid     = ball.is_valid_ball === 1;

  await executeTransaction([
    { sql: 'DELETE FROM balls WHERE id = ?', params: [ball.id] },
    // Undo bowling scorecard runs/balls
    {
      sql: `UPDATE bowling_scorecards
            SET runs_conceded = MAX(0, runs_conceded - ?),
                balls_bowled  = MAX(0, balls_bowled  - ?),
                overs_bowled  = (MAX(0, balls_bowled - ?) / 6) + ((MAX(0, balls_bowled - ?) % 6) * 0.1)
            WHERE innings_id = ? AND player_id = ?`,
      params: [
        (ball.runs_scored || 0) + (ball.extra_runs || 0),
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
                balls_bowled  = MAX(0, balls_bowled  - ?)
            WHERE id = ?`,
      params: [totalDelta, isValid ? 1 : 0, ball.over_id],
    },
    // If it was a wicket, undo
    ...(ball.is_wicket
      ? [
          {
            sql: `UPDATE innings SET total_wickets = MAX(0, total_wickets - 1) WHERE id = ?`,
            params: [inningsId],
          },
          {
            sql: `UPDATE batting_scorecards SET is_out = 0, dismissal_type = NULL, bowler_id = NULL, fielder_id = NULL WHERE innings_id = ? AND player_id = ?`,
            params: [inningsId, ball.striker_id],
          },
          // Remove the wicket record
          {
            sql: `DELETE FROM wickets WHERE ball_id = ?`,
            params: [ball.id],
          },
          // Decrement bowling_scorecards wicket count
          {
            sql: `UPDATE bowling_scorecards SET wickets = MAX(0, wickets - 1), sync_status = ? WHERE innings_id = ? AND player_id = ?`,
            params: [SYNC_STATUS.PENDING, inningsId, ball.bowler_id],
          },
        ]
      : []),
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'balls', 'delete', ball.id, JSON.stringify({ id: ball.id }), SYNC_STATUS.PENDING],
    },
  ]);
};

// ── Per-player batting stats (live) ──────────────────────
export const getPlayerBattingStats = (inningsId, playerId) =>
  queryFirstRow('SELECT * FROM batting_scorecards WHERE innings_id = ? AND player_id = ?', [inningsId, playerId]);

// ── Overs for innings (for maiden calc) ──────────────────
export const getInningsOvers = (inningsId) =>
  queryRows('SELECT * FROM overs WHERE innings_id = ? ORDER BY over_number ASC', [inningsId]);
