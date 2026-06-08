// ============================================================
// CricZodiac — Sync Queue Database Queries
// ============================================================

import { queryRows, queryFirstRow, executeQuery } from '../DatabaseHelper';
import { SYNC_STATUS, MAX_RETRY_COUNT } from '../../config/constants';

export const getPendingSyncItems = (limit = 50) =>
  queryRows(`
    SELECT * FROM sync_queue
    WHERE sync_status IN ('pending', 'failed')
    AND retry_count < ?
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `, [MAX_RETRY_COUNT, limit]);

export const markSyncItemSynced = (id) =>
  executeQuery(`
    UPDATE sync_queue
    SET sync_status = ?, synced_at = datetime('now')
    WHERE id = ?
  `, [SYNC_STATUS.SYNCED, id]);

export const markSyncItemFailed = (id, errorMessage) =>
  executeQuery(`
    UPDATE sync_queue
    SET sync_status = ?,
        retry_count = retry_count + 1,
        last_error = ?
    WHERE id = ?
  `, [SYNC_STATUS.FAILED, errorMessage, id]);

export const getSyncStats = () =>
  queryFirstRow(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
      SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM sync_queue
  `);

export const resetFailedSync = () =>
  executeQuery(`
    UPDATE sync_queue
    SET sync_status = 'pending', retry_count = 0, last_error = NULL
    WHERE sync_status = 'failed'
  `);

export const getSyncHistory = () =>
  queryRows(`
    SELECT * FROM sync_queue
    ORDER BY created_at DESC
    LIMIT 200
  `);
