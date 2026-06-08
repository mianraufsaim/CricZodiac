// ============================================================
// CricZodiac — Player Database Queries (Local SQLite)
// ============================================================

import { queryRows, queryFirstRow, executeTransaction, executeQuery } from '../DatabaseHelper';
import { SYNC_STATUS } from '../../config/constants';
import uuid from 'react-native-uuid';

export const createPlayer = async (data) => {
  const id = data.id || uuid.v4();
  await executeTransaction([
    {
      // name/email/phone live in the users table — players stores additional data only
      sql: `INSERT INTO players (id, user_id, club_id, player_type, batting_hand, bowling_style, profile_pic, sync_status)
            VALUES (?,?,?,?,?,?,?,?)`,
      params: [
        id, data.user_id, data.club_id || null,
        data.player_type   || 'allrounder',
        data.batting_hand  || 'right',
        data.bowling_style || null,
        data.profile_pic   || null,
        SYNC_STATUS.PENDING,
      ],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'players', 'create', id, JSON.stringify({ ...data, id }), SYNC_STATUS.PENDING],
    },
  ]);
  return id;
};

export const updatePlayer = async (id, data) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  await executeTransaction([
    {
      sql: `UPDATE players SET ${fields}, updated_at = datetime('now'), sync_status = ? WHERE id = ?`,
      params: [...Object.values(data), SYNC_STATUS.PENDING, id],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'players', 'update', id, JSON.stringify({ id, ...data }), SYNC_STATUS.PENDING],
    },
  ]);
};

export const getAllPlayers = () =>
  queryRows(`
    SELECT
      p.id,
      p.server_id,
      p.user_id,
      u.id AS user_local_id,
      u.server_id AS user_server_id,
      COALESCE(u.name, p.full_name) AS full_name,
      COALESCE(u.email, p.email) AS email,
      COALESCE(u.phone, p.phone) AS phone,
      COALESCE(u.club_id, p.club_id) AS club_id,
      COALESCE(u.status, 'active') AS status,
      COALESCE(u.is_approved, 1) AS is_approved,
      p.player_type,
      p.batting_hand,
      p.bowling_style,
      p.jersey_number,
      p.date_of_birth,
      p.profile_pic,
      p.is_active,
      p.created_at,
      p.updated_at,
      p.sync_status
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.is_active = 1
      AND COALESCE(u.status, 'active') = 'active'
      AND COALESCE(u.is_approved, 1) = 1
    ORDER BY full_name ASC
  `);

// ── Sync players from server API response ─────────────────
// serverUsers: array returned by GET /users/list.php
// Each item has: id, local_id, name, email, phone, role, status, is_approved,
//                player_db_id, player_local_id, player_type, player_pic, is_active
export const upsertPlayersFromServer = async (serverUsers) => {
  if (!serverUsers?.length) return;

  for (const u of serverUsers) {
    // Use local_id as SQLite PK; fall back to server id as string
    const userId = u.local_id || String(u.id);

    // Upsert user row
    await executeQuery(
      `INSERT OR REPLACE INTO users
         (id, server_id, name, email, phone, role, status, is_approved,
          profile_pic, club_id, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [userId, u.id, u.name, u.email || null, u.phone || null,
       u.role, u.status, u.is_approved ? 1 : 0,
       u.profile_pic || null, u.club_id != null ? String(u.club_id) : null]
    );

    // Upsert player row if a player profile exists on the server
    if (u.player_db_id || u.player_local_id) {
      const playerId = u.player_local_id || String(u.player_db_id);
      await executeQuery(
        `INSERT OR REPLACE INTO players
           (id, server_id, user_id, club_id, full_name, email, phone,
            player_type, batting_hand, bowling_style, jersey_number, date_of_birth,
            profile_pic, is_active, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [
          playerId, u.player_db_id || null, userId,
          u.club_id != null ? String(u.club_id) : null,
          u.name,                          // full_name = user's name
          u.email        || null,
          u.phone        || null,
          u.player_type  || 'allrounder',
          u.batting_hand || 'right',
          u.bowling_style || null,
          u.jersey_number || null,
          u.date_of_birth || null,
          u.player_pic   || null,
          u.is_active != null ? (u.is_active ? 1 : 0) : 1,
        ]
      );
    }
  }
};

export const deactivatePlayer = async (id) => {
  await executeTransaction([
    {
      sql: `UPDATE players SET is_active = 0, updated_at = datetime('now'), sync_status = ? WHERE id = ?`,
      params: [SYNC_STATUS.PENDING, id],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'players', 'delete', id, JSON.stringify({ id }), SYNC_STATUS.PENDING],
    },
  ]);
};

export const getPlayer = (id) =>
  queryFirstRow('SELECT * FROM players WHERE id = ?', [id]);

export const getPlayerByUserId = (userId) =>
  queryFirstRow('SELECT * FROM players WHERE user_id = ?', [userId]);

export const getPlayerStats = async (playerId) => {
  const batting = await queryFirstRow(`
    SELECT
      COUNT(DISTINCT m.id) as total_matches,
      SUM(bs.runs_scored) as total_runs,
      MAX(bs.runs_scored) as highest_score,
      SUM(bs.balls_faced) as total_balls_faced,
      SUM(bs.fours) as total_fours,
      SUM(bs.sixes) as total_sixes,
      SUM(CASE WHEN bs.is_out = 1 THEN 1 ELSE 0 END) as total_outs
    FROM batting_scorecards bs
    JOIN innings i ON bs.innings_id = i.id
    JOIN matches m ON i.match_id = m.id
    WHERE bs.player_id = ? AND m.status = 'completed'
  `, [playerId]);

  const bowling = await queryFirstRow(`
    SELECT
      SUM(bwl.overs_bowled) as total_overs,
      SUM(bwl.wickets) as total_wickets,
      SUM(bwl.runs_conceded) as total_runs_conceded,
      SUM(bwl.maidens) as total_maidens,
      MIN(CASE WHEN bwl.wickets > 0 THEN bwl.runs_conceded || '/' || bwl.wickets ELSE NULL END) as best_bowling
    FROM bowling_scorecards bwl
    JOIN innings i ON bwl.innings_id = i.id
    JOIN matches m ON i.match_id = m.id
    WHERE bwl.player_id = ? AND m.status = 'completed'
  `, [playerId]);

  const fielding = await queryFirstRow(`
    SELECT
      COUNT(CASE WHEN w.wicket_type = 'caught' THEN 1 END) as catches,
      COUNT(CASE WHEN w.wicket_type = 'run_out' THEN 1 END) as run_outs,
      COUNT(CASE WHEN w.wicket_type = 'stumped' THEN 1 END) as stumpings
    FROM wickets w
    WHERE w.fielder_id = ?
  `, [playerId]);

  const avg = batting?.total_outs > 0 ? (batting.total_runs / batting.total_outs).toFixed(2) : batting?.total_runs || 0;
  const sr  = batting?.total_balls_faced > 0 ? ((batting.total_runs / batting.total_balls_faced) * 100).toFixed(2) : 0;
  const eco = bowling?.total_overs > 0 ? (bowling.total_runs_conceded / bowling.total_overs).toFixed(2) : 0;

  return {
    batting: { ...batting, batting_average: avg, strike_rate: sr },
    bowling: { ...bowling, economy_rate: eco },
    fielding,
  };
};

export const getPlayerMatchHistory = (playerId) =>
  queryRows(`
    SELECT
      m.id, m.title, m.venue, m.match_date, m.status,
      bs.runs_scored, bs.balls_faced, bs.fours, bs.sixes, bs.is_out, bs.dismissal_type,
      bwl.overs_bowled, bwl.wickets, bwl.runs_conceded,
      t_bat.team_name as batting_team,
      t_bowl.team_name as bowling_team
    FROM batting_scorecards bs
    JOIN innings i ON bs.innings_id = i.id
    JOIN matches m ON i.match_id = m.id
    JOIN teams t_bat ON i.batting_team_id = t_bat.id
    JOIN teams t_bowl ON i.bowling_team_id = t_bowl.id
    LEFT JOIN bowling_scorecards bwl ON bwl.player_id = bs.player_id AND bwl.innings_id != bs.innings_id AND EXISTS (
      SELECT 1 FROM innings i2 WHERE i2.id = bwl.innings_id AND i2.match_id = m.id
    )
    WHERE bs.player_id = ?
    ORDER BY m.match_date DESC
  `, [playerId]);
