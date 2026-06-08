// ============================================================
// CricZodiac — Offline Sync Service
// CRITICAL: Ensures no match data is ever lost
// ============================================================

import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
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
  'series', 'matches', 'players', 'teams', 'innings', 'balls',
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

// ── Trigger a reset-then-sync cycle ──────────────────────
const _resetAndSync = async () => {
  await resetFailedSync();
  await processSyncQueue();
};

// ── Start background sync service ────────────────────────
// Runs in three situations so sync always happens regardless of which
// screen is visible or whether the app was backgrounded:
//   1. Every SYNC_INTERVAL (10 s) via timer
//   2. Immediately when the app comes back to the foreground (AppState)
//   3. Immediately when the internet becomes reachable (NetInfo)
export const startSyncService = (statusCallback) => {
  onSyncStatusChange = statusCallback;
  console.log('[Sync] Service started');

  // 1. Run immediately on start (reset failed first in case items were stuck)
  _resetAndSync();

  // 2. Timer: reset failed + process every 10 s
  syncTimer = setInterval(_resetAndSync, SYNC_INTERVAL);

  // 3. App foreground: retry as soon as user opens the app again
  appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      console.log('[Sync] App foregrounded — triggering sync');
      _resetAndSync();
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
export const processSyncQueue = async () => {
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

    // Batch items by table for efficient API calls
    const batches = groupByTable(pendingItems);

    for (const [tableName, items] of Object.entries(batches)) {
      try {
        const payload = items.map(item => ({
          event_id:   item.event_id,
          table_name: item.table_name,
          action:     item.action_type,
          data:       JSON.parse(item.payload_json),
        }));

        const response = await ApiService.post(API_ENDPOINTS.SYNC_PUSH, {
          items: payload,
        });

        if (response.success) {
          const syncedIds = response.synced_event_ids || [];
          const syncedIdSet = new Set(syncedIds);
          for (const item of items) {
            if (response.all_synced || syncedIdSet.has(item.event_id)) {
              await markSyncItemSynced(item.id);
              await _updateMainRecordSyncStatus(item.table_name, item.local_id);
              totalSynced++;
            }
          }
          console.log(`[Sync] ✓ ${tableName}: ${syncedIds.length} items synced`);
        }
      } catch (tableError) {
        console.error(`[Sync] ✗ ${tableName} batch failed:`, tableError.message);
        for (const item of items) {
          await markSyncItemFailed(item.id, tableError.message);
          totalFailed++;
        }
      }
    }

    const stats = await getSyncStats();
    onSyncStatusChange?.(stats.pending > 0 ? 'pending' : 'synced', stats);

    // ── Toast notification — visible on ANY screen ──────
    if (totalSynced > 0 && totalFailed === 0) {
      Toast.show({
        type: 'success',
        text1: 'Sync Complete',
        text2: `${totalSynced} item${totalSynced !== 1 ? 's' : ''} pushed to server`,
        visibilityTime: 3000,
        position: 'bottom',
      });
    } else if (totalSynced > 0 && totalFailed > 0) {
      Toast.show({
        type: 'info',
        text1: 'Sync Partial',
        text2: `${totalSynced} synced · ${totalFailed} failed — will retry`,
        visibilityTime: 3000,
        position: 'bottom',
      });
    } else if (totalFailed > 0 && totalSynced === 0) {
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: `${totalFailed} item${totalFailed !== 1 ? 's' : ''} failed — retrying in 10s`,
        visibilityTime: 3000,
        position: 'bottom',
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
    const response = await ApiService.post(API_ENDPOINTS.SYNC_PUSH, {
      items: [{
        event_id:   item.event_id,
        table_name: item.table_name,
        action:     item.action_type,
        data:       parsedPayload,
      }],
    });

    const succeeded =
      response?.success &&
      (response?.all_synced || (response?.synced_event_ids || []).includes(item.event_id));

    if (succeeded) {
      await markSyncItemSynced(item.id);
      await _updateMainRecordSyncStatus(item.table_name, item.local_id);
    } else {
      // Server responded but didn't confirm sync
      const reason = response?.error || response?.message || 'Server did not confirm this item as synced.';
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
const groupByTable = (items) => {
  return items.reduce((groups, item) => {
    const key = item.table_name;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
};
