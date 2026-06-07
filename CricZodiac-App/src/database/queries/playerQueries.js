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
  queryRows('SELECT * FROM players WHERE is_active = 1 ORDER BY created_at ASC');

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
