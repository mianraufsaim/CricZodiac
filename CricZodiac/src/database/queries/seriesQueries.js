// ============================================================
// CricZodiac — Series Database Queries (Local SQLite)
// ============================================================

import { queryRows, queryFirstRow, executeQuery, executeTransaction } from '../DatabaseHelper';
import { SYNC_STATUS } from '../../config/constants';
import uuid from 'react-native-uuid';

export const createSeries = async (data, userId) => {
  const id = uuid.v4();
  const seriesData = {
    ...data,
    start_date: data.start_date || null,
    end_date: data.end_date || null,
    allow_last_batsman: data.allow_last_batsman ? 1 : 0,
    allow_super_over: data.allow_super_over ? 1 : 0,
  };
  await executeTransaction([
    {
      sql: `INSERT INTO series
              (id, name, description, start_date, end_date, format, allow_last_batsman, allow_super_over, status, created_by, club_id, sync_status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        id,
        seriesData.name,
        seriesData.description || null,
        seriesData.start_date,
        seriesData.end_date,
        seriesData.format      || 'bestOf1',
        seriesData.allow_last_batsman,
        seriesData.allow_super_over,
        'active',
        userId || null,
        seriesData.club_id     || null,
        SYNC_STATUS.PENDING,
      ],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'series', 'create', id, JSON.stringify({ id, ...seriesData }), SYNC_STATUS.PENDING],
    },
  ]);
  return id;
};

export const getAllSeries = () =>
  queryRows(`
    SELECT s.*,
      COUNT(m.id) AS match_count,
      SUM(CASE WHEN m.status IN ('live', 'innings_2') THEN 1 ELSE 0 END) AS live_count,
      SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
    FROM series s
    LEFT JOIN matches m ON m.series_id = s.id OR m.series_id = s.server_id
    GROUP BY s.id
    ORDER BY
      CASE
        WHEN s.status = 'active' THEN 0
        WHEN s.status = 'completed' THEN 2
        ELSE 1
      END,
      s.created_at DESC
  `);

// ── Pull series from server into local SQLite cache ───────
// Server rows use MySQL integer ids, while app-created rows use UUID local_id.
export const upsertSeriesFromServer = async (serverSeries) => {
  if (!serverSeries?.length) return;

  for (const s of serverSeries) {
    const seriesId = s.local_id || String(s.id);
    const existing = await queryFirstRow('SELECT sync_status FROM series WHERE id = ?', [seriesId]);

    // Keep local offline edits authoritative until they have synced.
    if (existing?.sync_status === SYNC_STATUS.PENDING || existing?.sync_status === SYNC_STATUS.FAILED) {
      continue;
    }

    await executeQuery(
      `INSERT OR REPLACE INTO series
         (id, server_id, name, description, start_date, end_date, format, status,
          allow_last_batsman, allow_super_over, created_by, club_id, team_a_wins, team_b_wins, player_of_series, team_a_id, team_b_id,
          created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        seriesId,
        s.id || null,
        s.name,
        s.description || null,
        s.start_date || null,
        s.end_date || null,
        s.format || 'bestOf1',
        s.status || 'active',
        s.allow_last_batsman ? 1 : 0,
        s.allow_super_over ? 1 : 0,
        s.created_by != null ? String(s.created_by) : null,
        s.club_id != null ? String(s.club_id) : null,
        s.team_a_wins || 0,
        s.team_b_wins || 0,
        s.player_of_series_local || (s.player_of_series != null ? String(s.player_of_series) : null),
        s.team_a_local || (s.team_a_id != null ? String(s.team_a_id) : null),
        s.team_b_local || (s.team_b_id != null ? String(s.team_b_id) : null),
        s.created_at || null,
        s.updated_at || null,
        SYNC_STATUS.SYNCED,
      ]
    );
  }
};

export const getSeriesById = (id) =>
  queryFirstRow('SELECT * FROM series WHERE id = ?', [id]);

export const getSeriesMatches = (seriesId) =>
  queryRows(`
    SELECT m.*,
      t1.team_name AS team_a_name,
      t2.team_name AS team_b_name,
      tw.team_name AS winner_team_name
    FROM matches m
    LEFT JOIN teams t1 ON m.team_a_id = t1.id
      OR (t1.match_id = m.id AND t1.team_label = 'A')
    LEFT JOIN teams t2 ON m.team_b_id = t2.id
      OR (t2.match_id = m.id AND t2.team_label = 'B')
    LEFT JOIN teams tw ON m.winner_team_id = tw.id
      OR CAST(m.winner_team_id AS TEXT) = CAST(tw.server_id AS TEXT)
    WHERE m.series_id = ?
    ORDER BY m.created_at DESC
  `, [seriesId]);

export const updateSeriesStatus = async (id, status) => {
  await executeTransaction([
    {
      sql: `UPDATE series SET status = ?, updated_at = datetime('now'), sync_status = ? WHERE id = ?`,
      params: [status, SYNC_STATUS.PENDING, id],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [uuid.v4(), 'series', 'update', id, JSON.stringify({ id, status }), SYNC_STATUS.PENDING],
    },
  ]);
};

export const saveSeriesAward = async ({ seriesId, playerId, playerServerId = null }) => {
  await executeTransaction([
    {
      sql: `UPDATE series
            SET player_of_series = ?, updated_at = datetime('now'), sync_status = ?
            WHERE id = ?`,
      params: [playerId, SYNC_STATUS.PENDING, seriesId],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'series', 'update', seriesId,
        JSON.stringify({
          id: seriesId,
          player_of_series: playerServerId || null,
          player_of_series_local: playerId,
        }),
        SYNC_STATUS.PENDING,
      ],
    },
  ]);
};

// ── Record a match win and auto-complete series if Best of X decided ─────────
// teamSide: 'a' | 'b'
export const recordSeriesMatchWin = async (seriesId, teamSide) => {
  const series = await queryFirstRow('SELECT * FROM series WHERE id = ?', [seriesId]);
  if (!series || series.status !== 'active') return null;

  const format    = series.format || 'bestOf1';
  const totalGames = format === 'bestOf5' ? 5 : format === 'bestOf3' ? 3 : 1;
  const winsNeeded = Math.ceil(totalGames / 2);  // 1 for Bo1, 2 for Bo3, 3 for Bo5

  const newAWins = (series.team_a_wins || 0) + (teamSide === 'a' ? 1 : 0);
  const newBWins = (series.team_b_wins || 0) + (teamSide === 'b' ? 1 : 0);

  const seriesWon = newAWins >= winsNeeded || newBWins >= winsNeeded;
  const newStatus = seriesWon ? 'completed' : 'active';

  await executeTransaction([
    {
      sql: `UPDATE series
            SET team_a_wins = ?, team_b_wins = ?, status = ?,
                updated_at = datetime('now'), sync_status = ?
            WHERE id = ?`,
      params: [newAWins, newBWins, newStatus, SYNC_STATUS.PENDING, seriesId],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'series', 'update', seriesId,
        JSON.stringify({ id: seriesId, team_a_wins: newAWins, team_b_wins: newBWins, status: newStatus }),
        SYNC_STATUS.PENDING,
      ],
    },
  ]);

  return { newAWins, newBWins, seriesWon, winsNeeded, winner: seriesWon ? (newAWins >= winsNeeded ? 'a' : 'b') : null };
};
