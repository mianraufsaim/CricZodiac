// ============================================================
// CricZodiac — Offline Sync Service
// CRITICAL: Ensures no match data is ever lost
// ============================================================

import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import uuid from 'react-native-uuid';
import ApiService from './ApiService';
import { API_ENDPOINTS, SYNC_INTERVAL, RETRY_DELAYS, MAX_RETRY_COUNT } from '../config/api';
import { SYNC_STATUS, STORAGE_KEYS } from '../config/constants';
import {
  getPendingSyncItems,
  markSyncItemSynced,
  markSyncItemFailed,
  getSyncStats,
  resetFailedSync,
} from '../database/queries/syncQueries';
import { queryRows, executeQuery } from '../database/DatabaseHelper';

// Tables that have a sync_status column and should be updated after sync
const SYNCABLE_TABLES = [
  'clubs', 'users', 'series', 'matches', 'players', 'teams', 'innings', 'balls',
  'batting_scorecards', 'bowling_scorecards', 'wickets', 'overs',
  'team_players', 'toss_results', 'match_results',
];

// After marking a sync_queue item synced, update the parent record's sync_status
// if no other pending items remain for the same local_id.
const _updateMainRecordSyncStatus = async (tableName, localId) => {
  if (!SYNCABLE_TABLES.includes(tableName) || !localId) return;
  try {
    const remaining = await queryRows(
      `SELECT id FROM sync_queue WHERE local_id = ? AND sync_status = 'pending' LIMIT 1`,
      [localId]
    );
    if (remaining.length === 0) {
      await executeQuery(
        `UPDATE ${tableName} SET sync_status = 'synced' WHERE id = ?`,
        [localId]
      );
    }
  } catch (_) { /* non-critical — UI-only */ }
};

let syncTimer             = null;
let isSyncing             = false;
let onSyncStatusChange    = null;
let appStateSubscription  = null;
let netInfoUnsubscribe    = null;

// ── Start background sync service ────────────────────────
// Runs in three situations so sync always happens regardless of which
// screen is visible or whether the app was backgrounded:
//   1. Every SYNC_INTERVAL (10 s) via timer
//   2. Immediately when the app comes back to the foreground (AppState)
//   3. Immediately when the internet becomes reachable (NetInfo)
// NOTE: Failed items are never auto-retried — use manualRetrySync() for that.
export const startSyncService = (statusCallback) => {
  onSyncStatusChange = statusCallback;
  console.log('[Sync] Service started');

  // 1. Run immediately on start (pending items only)
  processSyncQueue();

  // 2. Timer: process pending items every 10 s
  syncTimer = setInterval(processSyncQueue, SYNC_INTERVAL);

  // 3. App foreground: retry as soon as user opens the app again
  appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      console.log('[Sync] App foregrounded — triggering sync');
      processSyncQueue();
    }
  });

  // 4. Network restored: retry as soon as internet is back
  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable) {
      console.log('[Sync] Network restored — triggering sync');
      processSyncQueue(); // failed items already reset by timer; just process
    }
  });
};

export const stopSyncService = () => {
  if (syncTimer)            { clearInterval(syncTimer); syncTimer = null; }
  if (appStateSubscription) { appStateSubscription.remove(); appStateSubscription = null; }
  if (netInfoUnsubscribe)   { netInfoUnsubscribe(); netInfoUnsubscribe = null; }
  console.log('[Sync] Service stopped');
};

// ── Main sync processor ────────────────────────────────────
export const processSyncQueue = async ({ silent = false } = {}) => {
  if (isSyncing) return;

  // Skip sync when no authenticated user
  const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (!token) {
    console.log('[Sync] Not authenticated — skipping sync');
    return;
  }

  const netState = await NetInfo.fetch();
  if (!netState.isConnected || !netState.isInternetReachable) {
    console.log('[Sync] Offline — skipping sync');
    return;
  }

  isSyncing = true;
  onSyncStatusChange?.('syncing');

  let totalSynced = 0;
  let totalFailed = 0;

  try {
    const pendingItems = await getPendingSyncItems(50);
    if (pendingItems.length === 0) {
      onSyncStatusChange?.('synced');
      isSyncing = false;
      return;
    }

    console.log(`[Sync] Processing ${pendingItems.length} pending items`);

    // Batch items by table for efficient API calls. Some child rows need a
    // lightweight parent refresh when the original parent event was already ACKed.
    const syncItems = await expandItemsWithDependencies(pendingItems);
    const batches = groupByTable(syncItems);

    for (const [tableName, items] of sortBatchesForDependencies(batches)) {
      try {
        const payload = [];
        for (const item of items) {
          payload.push(buildApiSyncItem(item));
        }

        const response = await ApiService.post(API_ENDPOINTS.SYNC_PUSH, {
          items: payload,
        });

        if (response.success) {
          const syncedIds = response.synced_event_ids || [];
          const syncedIdSet = new Set(syncedIds);
          const errorByEventId = getErrorByEventId(response);
          const failedAnchorIds = await markFailedSyntheticAnchors(items, errorByEventId);
          totalFailed += failedAnchorIds.size;
          for (const item of items) {
            if (item.synthetic) continue;
            if (failedAnchorIds.has(item.id)) continue;
            if (response.all_synced || syncedIdSet.has(item.event_id)) {
              await markSyncItemSynced(item.id);
              await _updateMainRecordSyncStatus(item.table_name, item.local_id);
              totalSynced++;
            } else if (errorByEventId.has(item.event_id)) {
              await markSyncItemFailed(item.id, errorByEventId.get(item.event_id));
              totalFailed++;
            }
          }
          console.log(`[Sync] ✓ ${tableName}: ${syncedIds.length} items synced`);
        }
      } catch (tableError) {
        console.error(`[Sync] ✗ ${tableName} batch failed:`, tableError.message);
        for (const item of items) {
          if (item.synthetic) continue;
          await markSyncItemFailed(item.id, tableError.message);
          totalFailed++;
        }
      }
    }

    const stats = await getSyncStats();
    onSyncStatusChange?.(stats.pending > 0 ? 'pending' : 'synced', stats);

    // ── Toast notification ────────────────────────────────
    // silent=true suppresses success/partial toasts (e.g. LiveScoringScreen
    // fires sync on every ball — flooding the screen with "Sync Complete" is
    // noise). Errors always show so the umpire knows if data is at risk.
    if (!silent && totalSynced > 0 && totalFailed === 0) {
      Toast.show({
        type: 'success',
        text1: 'Sync Complete',
        text2: `${totalSynced} item${totalSynced !== 1 ? 's' : ''} pushed to server`,
        visibilityTime: 3000,
        position: 'top',
      });
    } else if (!silent && totalSynced > 0 && totalFailed > 0) {
      Toast.show({
        type: 'info',
        text1: 'Sync Partial',
        text2: `${totalSynced} synced · ${totalFailed} failed — retry manually`,
        visibilityTime: 3000,
        position: 'top',
      });
    } else if (totalFailed > 0 && totalSynced === 0) {
      // errors always shown regardless of silent flag
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: `${totalFailed} item${totalFailed !== 1 ? 's' : ''} failed — retry manually`,
        visibilityTime: 3000,
        position: 'top',
      });
    }
  } catch (error) {
    console.error('[Sync] Fatal sync error:', error);
    onSyncStatusChange?.('failed');
  } finally {
    isSyncing = false;
  }
};

// ── Manual retry (Admin feature) ─────────────────────────
export const manualRetrySync = async () => {
  await resetFailedSync();
  return processSyncQueue();
};

// ── Retry a single sync_queue item — returns full server response ─────────────
// Use this for per-item retry with visible feedback in the UI.
export const retrySingleItem = async (item) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (!token) return { success: false, error: 'Not authenticated — please log in first.' };

  const netState = await NetInfo.fetch();
  if (!netState.isConnected || !netState.isInternetReachable) {
    return { success: false, error: 'Device is offline — connect to the internet and retry.' };
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(item.payload_json);
  } catch {
    return { success: false, error: 'Payload JSON is corrupt and cannot be parsed.' };
  }

  try {
    const retryItems = await expandItemsWithDependencies([item], parsedPayload);
    const requestItems = [];
    for (const retryItem of retryItems) {
      requestItems.push(buildApiSyncItem(retryItem));
    }

    const response = await ApiService.post(API_ENDPOINTS.SYNC_PUSH, {
      items: requestItems,
    });

    const syncedIdSet = new Set(response?.synced_event_ids || []);
    const errorByEventId = getErrorByEventId(response);
    const dependencyError = getFirstSyntheticError(retryItems, errorByEventId);
    const succeeded =
      response?.success &&
      !dependencyError &&
      isRetryItemConfirmed(retryItems, item.id, response, syncedIdSet);

    if (succeeded) {
      for (const retryItem of retryItems) {
        if (retryItem.synthetic) continue;
        if (response?.all_synced || syncedIdSet.has(retryItem.event_id)) {
          await markSyncItemSynced(retryItem.id);
          await _updateMainRecordSyncStatus(retryItem.table_name, retryItem.local_id);
        }
      }
    } else {
      // Server responded but didn't confirm sync
      const reason = dependencyError ||
        errorByEventId.get(item.event_id) ||
        response?.error ||
        response?.message ||
        'Server did not confirm this item as synced.';
      await markSyncItemFailed(item.id, reason);
    }

    return { success: succeeded, serverResponse: response };
  } catch (err) {
    const errMsg = err.message || 'Unknown network error';
    await markSyncItemFailed(item.id, errMsg);
    return { success: false, error: errMsg };
  }
};

// ── Retry a specific list of items with per-item progress callback ────────────
// items: array of sync_queue rows already loaded by the caller (no re-fetch).
// onProgress({ current, total, item, result, done, fatalError }) called per item.
export const retryAllWithProgress = async (items, onProgress) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (!token) {
    onProgress?.({ done: true, fatalError: 'Not authenticated — please log in first.' });
    return;
  }

  const netState = await NetInfo.fetch();
  if (!netState.isConnected || !netState.isInternetReachable) {
    onProgress?.({ done: true, fatalError: 'Device is offline — connect to the internet and retry.' });
    return;
  }

  if (!items || items.length === 0) {
    onProgress?.({ done: true, fatalError: null });
    return;
  }

  let current = 0;
  for (const item of items) {
    current++;
    const result = await retrySingleItem(item);
    onProgress?.({ current, total: items.length, item, result, done: current === items.length });
  }
};

// ── Get current sync stats ────────────────────────────────
export const getSyncStatus = async () => {
  const stats = await getSyncStats();
  const netState = await NetInfo.fetch();
  return {
    ...stats,
    is_online: netState.isConnected && netState.isInternetReachable,
  };
};

// ── Helpers ───────────────────────────────────────────────
const SYNC_TABLE_ORDER = [
  'clubs',
  'users',
  'players',
  'series',
  'matches',
  'teams',
  'team_players',
  'toss_results',
  'innings',
  'overs',
  'balls',
  'wickets',
  'batting_scorecards',
  'bowling_scorecards',
  'match_results',
];

const sortBatchesForDependencies = (batches) => {
  const rank = new Map(SYNC_TABLE_ORDER.map((table, index) => [table, index]));
  return Object.entries(batches).sort(
    ([a], [b]) => (rank.get(a) ?? SYNC_TABLE_ORDER.length) - (rank.get(b) ?? SYNC_TABLE_ORDER.length)
  );
};

const groupByTable = (items) => {
  return items.reduce((groups, item) => {
    const key = item.table_name;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
};

const buildApiSyncItem = (item) => ({
  event_id:   item.event_id,
  table_name: item.table_name,
  action:     item.action_type,
  data:       JSON.parse(item.payload_json),
});

const getErrorByEventId = (response) => {
  const errors = response?.errors || [];
  const errorMap = new Map();
  for (const error of errors) {
    if (error?.event_id) {
      errorMap.set(error.event_id, error.error || 'Sync failed.');
    }
  }
  return errorMap;
};

const markFailedSyntheticAnchors = async (items, errorByEventId) => {
  const failedAnchorIds = new Set();

  for (const item of items) {
    if (!item.synthetic || !errorByEventId.has(item.event_id)) continue;

    const anchorIds = item.anchor_ids || (item.anchor_id ? [item.anchor_id] : []);
    for (const anchorId of anchorIds) {
      if (!anchorId || failedAnchorIds.has(anchorId)) continue;

      await markSyncItemFailed(anchorId, errorByEventId.get(item.event_id));
      failedAnchorIds.add(anchorId);
    }
  }

  return failedAnchorIds;
};

const getFirstSyntheticError = (items, errorByEventId) => {
  for (const item of items) {
    if (item.synthetic && errorByEventId.has(item.event_id)) {
      return errorByEventId.get(item.event_id);
    }
  }
  return null;
};

const isRetryItemConfirmed = (retryItems, originalItemId, response, syncedIdSet) => {
  if (response?.all_synced) return true;

  for (const retryItem of retryItems) {
    if (retryItem.synthetic || retryItem.id !== originalItemId) continue;
    if (syncedIdSet.has(retryItem.event_id)) return true;
  }

  return false;
};

const expandItemsWithDependencies = async (items, singleParsedPayload = null) => {
  const expanded = [];
  const queuedTeamIds = new Set();
  const syntheticTeamIds = new Set();
  const expandedTeamPlayerTeamIds = new Set();
  const teamPlayerItemsByLocalId = new Map();

  for (const item of items) {
    if (item.table_name === 'teams' && item.local_id) {
      queuedTeamIds.add(item.local_id);
    }

    if (item.table_name === 'team_players') {
      const payload = singleParsedPayload && items.length === 1
        ? singleParsedPayload
        : safeParsePayload(item.payload_json);
      const localId = item.local_id || payload?.id;
      if (localId) {
        teamPlayerItemsByLocalId.set(localId, item);
      }
    }
  }

  for (const item of items) {
    if (item.table_name !== 'team_players') {
      expanded.push(item);
      continue;
    }

    const payload = singleParsedPayload && items.length === 1
      ? singleParsedPayload
      : safeParsePayload(item.payload_json);

    const teamLocalId = payload?.team_id;
    if (!teamLocalId) {
      expanded.push(item);
      continue;
    }

    if (expandedTeamPlayerTeamIds.has(teamLocalId)) continue;

    if (!queuedTeamIds.has(teamLocalId) && !syntheticTeamIds.has(teamLocalId)) {
      const dependency = await buildTeamDependencyItem(teamLocalId, payload);
      if (dependency) {
        expanded.push(dependency);
        syntheticTeamIds.add(teamLocalId);
      }
    }

    const rosterItems = await buildTeamPlayerRosterItems(
      teamLocalId,
      teamPlayerItemsByLocalId,
      payload,
      item.id
    );

    if (rosterItems.length > 0) {
      for (const rosterItem of rosterItems) {
        expanded.push(rosterItem);
      }
    } else {
      expanded.push(item);
    }

    expandedTeamPlayerTeamIds.add(teamLocalId);
  }

  return expanded;
};

const safeParsePayload = (payloadJson) => {
  try {
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
};

const buildTeamDependencyItem = async (teamLocalId, fallbackPayload = {}) => {
  const teamPayload = await getQueuedTeamPayload(teamLocalId, fallbackPayload) ||
    await getLocalTeamPayload(teamLocalId, fallbackPayload);

  if (!teamPayload) return null;

  return {
    event_id: uuid.v4(),
    table_name: 'teams',
    action_type: 'create',
    local_id: teamLocalId,
    payload_json: JSON.stringify(teamPayload),
    synthetic: true,
  };
};

const getQueuedTeamPayload = async (teamLocalId, fallbackPayload) => {
  const rows = await queryRows(`
    SELECT payload_json
    FROM sync_queue
    WHERE table_name = 'teams'
      AND local_id = ?
    ORDER BY id DESC
    LIMIT 1
  `, [teamLocalId]);

  const payload = rows[0]?.payload_json ? safeParsePayload(rows[0].payload_json) : null;
  if (!payload) return null;

  return {
    ...payload,
    id: payload.id || teamLocalId,
    club_id: payload.club_id || fallbackPayload?.club_id || null,
    series_id: payload.series_id || fallbackPayload?.series_id || null,
    match_id: payload.match_id || fallbackPayload?.match_id || null,
  };
};

const getLocalTeamPayload = async (teamLocalId, fallbackPayload) => {
  const rows = await queryRows(`
    SELECT
      t.id,
      COALESCE(t.club_id, m.club_id) AS club_id,
      COALESCE(t.series_id, m.series_id) AS series_id,
      t.match_id,
      t.team_name,
      t.team_label,
      t.captain_id
    FROM teams t
    LEFT JOIN matches m ON m.id = t.match_id
    WHERE t.id = ?
    LIMIT 1
  `, [teamLocalId]);

  const team = rows[0];
  if (!team) return null;

  return {
    id: team.id,
    club_id: team.club_id || fallbackPayload?.club_id || null,
    series_id: team.series_id || fallbackPayload?.series_id || null,
    match_id: team.match_id || fallbackPayload?.match_id || null,
    team_name: team.team_name || '',
    team_label: team.team_label || 'A',
    captain_id: team.captain_id || null,
  };
};

const buildTeamPlayerRosterItems = async (
  teamLocalId,
  teamPlayerItemsByLocalId,
  fallbackPayload = {},
  defaultAnchorId = null
) => {
  const payloads = await getLocalTeamPlayerPayloads(teamLocalId, fallbackPayload);
  if (payloads.length === 0) return [];

  const anchorIds = [];
  const anchorIdSet = new Set();
  for (const payload of payloads) {
    const originalItem = teamPlayerItemsByLocalId.get(payload.id);
    if (originalItem?.id && !anchorIdSet.has(originalItem.id)) {
      anchorIds.push(originalItem.id);
      anchorIdSet.add(originalItem.id);
    }
  }
  if (anchorIds.length === 0 && defaultAnchorId) {
    anchorIds.push(defaultAnchorId);
  }

  const rosterItems = [];
  for (const payload of payloads) {
    const originalItem = teamPlayerItemsByLocalId.get(payload.id);
    rosterItems.push({
      id: originalItem?.id,
      event_id: uuid.v4(),
      table_name: 'team_players',
      action_type: originalItem?.action_type || 'create',
      local_id: payload.id,
      payload_json: JSON.stringify(payload),
      synthetic: !originalItem,
      anchor_ids: originalItem ? null : anchorIds,
    });
  }

  return rosterItems;
};

const getLocalTeamPlayerPayloads = async (teamLocalId, fallbackPayload = {}) => {
  const rows = await queryRows(`
    SELECT
      id,
      club_id,
      series_id,
      match_id,
      team_id,
      player_id,
      batting_order
    FROM team_players
    WHERE team_id = ?
    ORDER BY batting_order ASC, created_at ASC, id ASC
  `, [teamLocalId]);

  const payloads = [];
  for (const row of rows) {
    if (!row.player_id) continue;
    payloads.push({
      id: row.id,
      club_id: row.club_id || fallbackPayload?.club_id || null,
      series_id: row.series_id || fallbackPayload?.series_id || null,
      match_id: row.match_id || fallbackPayload?.match_id || null,
      team_id: row.team_id || teamLocalId,
      player_id: row.player_id,
      batting_order: row.batting_order || 0,
    });
  }

  return payloads;
};
