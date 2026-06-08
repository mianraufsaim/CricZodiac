// ============================================================
// CricZodiac — Sync Status Screen
// • Tap Pending/Failed stat cards to filter
// • Tap any item to expand payload + per-item Retry button
// • Retry shows full server response inline
// • Global Retry All shows a live progress log modal
// ============================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, ScrollView,
  RefreshControl, Modal, ActivityIndicator,
  Alert,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { clearSyncQueueByStatuses, getSyncHistory } from '../../database/queries/syncQueries';
import { retrySingleItem, retryAllWithProgress, getSyncStatus } from '../../services/SyncService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Constants ─────────────────────────────────────────────
const TABLE_ICONS = {
  series:             'trophy-outline',
  matches:            'cricket',
  players:            'account',
  teams:              'account-group',
  innings:            'run-fast',
  balls:              'circle-small',
  batting_scorecards: 'bat',
  bowling_scorecards: 'baseball',
  wickets:            'close-circle',
  overs:              'rotate-left',
  toss_results:       'hand-coin-outline',
  match_results:      'medal',
  team_players:       'account-multiple-plus',
};
const SKIP_KEYS = new Set(['sync_status', 'created_at', 'updated_at']);

const parsePayload = (json) => {
  try { return JSON.parse(json); } catch { return { raw: json }; }
};
const fmtVal = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object')         return JSON.stringify(v, null, 2);
  return String(v);
};

// ── RetryResponseBox ──────────────────────────────────────
// Shows the full server response (or error) after a per-item retry
const RetryResponseBox = ({ result, COLORS, styles }) => {
  const [showRaw, setShowRaw] = useState(false);

  if (!result) return null;

  if (result.success) {
    return (
      <View style={[styles.responseBox, { borderColor: COLORS.success + '55', backgroundColor: COLORS.success + '12' }]}>
        <View style={styles.responseHeader}>
          <Icon name="check-circle" size={16} color={COLORS.success} />
          <Text style={[styles.responseTitleText, { color: COLORS.success }]}>SYNCED SUCCESSFULLY</Text>
        </View>
        {result.serverResponse && (
          <TouchableOpacity onPress={() => setShowRaw(p => !p)}>
            <Text style={[styles.responseToggle, { color: COLORS.success }]}>
              {showRaw ? 'Hide' : 'Show'} server response
            </Text>
          </TouchableOpacity>
        )}
        {showRaw && result.serverResponse && (
          <Text style={styles.responseRaw}>{JSON.stringify(result.serverResponse, null, 2)}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.responseBox, { borderColor: COLORS.danger + '55', backgroundColor: COLORS.danger + '12' }]}>
      <View style={styles.responseHeader}>
        <Icon name="alert-circle" size={16} color={COLORS.danger} />
        <Text style={[styles.responseTitleText, { color: COLORS.danger }]}>RETRY FAILED</Text>
      </View>

      {/* Error message */}
      {result.error && (
        <View style={styles.responseErrorRow}>
          <Text style={styles.responseErrorLabel}>Error</Text>
          <Text style={styles.responseErrorText}>{result.error}</Text>
        </View>
      )}

      {/* Server response (even on failure there may be a body) */}
      {result.serverResponse && (
        <>
          <TouchableOpacity onPress={() => setShowRaw(p => !p)}>
            <Text style={[styles.responseToggle, { color: COLORS.danger }]}>
              {showRaw ? 'Hide' : 'Show'} server response
            </Text>
          </TouchableOpacity>
          {showRaw && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={styles.responseRaw}>{JSON.stringify(result.serverResponse, null, 2)}</Text>
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
};

// ── SyncItem ──────────────────────────────────────────────
const SyncItem = ({ item, COLORS, styles, onRetried }) => {
  const [expanded,   setExpanded]   = useState(false);
  const [retrying,   setRetrying]   = useState(false);
  const [retryResult, setRetryResult] = useState(null);

  const statusColor =
    retryResult?.success       ? COLORS.success :
    item.sync_status === 'synced'  ? COLORS.success :
    item.sync_status === 'pending' ? COLORS.warning  : COLORS.danger;

  const statusIcon =
    retryResult?.success       ? 'check-circle' :
    item.sync_status === 'synced'  ? 'check-circle'  :
    item.sync_status === 'pending' ? 'clock-outline'  : 'alert-circle';

  const tableIcon = TABLE_ICONS[item.table_name] || 'database';
  const payload   = useMemo(() => parsePayload(item.payload_json), [item.payload_json]);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(p => !p);
  };

  const handleRetry = async () => {
    setRetrying(true);
    setRetryResult(null);
    const result = await retrySingleItem(item);
    setRetryResult(result);
    setRetrying(false);
    if (result.success) onRetried?.();
  };

  const canRetry = item.sync_status !== 'synced' && !retryResult?.success;

  return (
    <TouchableOpacity
      style={[styles.historyItem, { borderColor: expanded ? statusColor + '66' : COLORS.cardBorder }]}
      onPress={toggle}
      activeOpacity={0.85}
    >
      {/* ── Collapsed row ── */}
      <View style={styles.historyRow}>
        <View style={[styles.tableIconBox, { backgroundColor: statusColor + '18' }]}>
          <Icon name={tableIcon} size={18} color={statusColor} />
        </View>

        <View style={styles.historyInfo}>
          <Text style={styles.historyTable}>
            {item.table_name}
            <Text style={{ color: COLORS.cyan, fontWeight: '600' }}>{'  ·  '}{item.action_type}</Text>
          </Text>
          <Text style={styles.historyTime}>{item.created_at}</Text>
          {item.last_error && !expanded && (
            <Text style={styles.errorSnippet} numberOfLines={1}>⚠ {item.last_error}</Text>
          )}
        </View>

        <View style={styles.historyRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <Icon name={statusIcon} size={12} color={statusColor} />
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {retryResult?.success ? 'SYNCED' : item.sync_status?.toUpperCase()}
            </Text>
          </View>
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={COLORS.gray}
            style={{ marginTop: 4 }}
          />
        </View>
      </View>

      {/* ── Expanded detail ── */}
      {expanded && (
        <View style={styles.expandedBox}>

          {/* Event ID */}
          <View style={styles.payloadRow}>
            <Text style={styles.payloadKey}>event_id</Text>
            <Text style={[styles.payloadVal, styles.mono]} numberOfLines={1}>{item.event_id}</Text>
          </View>
          <View style={styles.payloadRow}>
            <Text style={styles.payloadKey}>retry_count</Text>
            <Text style={[styles.payloadVal, styles.mono]}>{item.retry_count}</Text>
          </View>

          {/* Payload fields */}
          <Text style={styles.sectionMini}>PAYLOAD</Text>
          {(() => {
            const rows = [];
            for (const [k, v] of Object.entries(payload)) {
              if (SKIP_KEYS.has(k)) continue;
              rows.push(
                <View key={k} style={styles.payloadRow}>
                  <Text style={styles.payloadKey}>{k}</Text>
                  <Text style={[styles.payloadVal, styles.mono]} numberOfLines={3}>{fmtVal(v)}</Text>
                </View>
              );
            }
            return rows;
          })()}

          {/* Last error */}
          {item.last_error && (
            <View style={styles.lastErrorBox}>
              <Icon name="alert-circle-outline" size={14} color={COLORS.danger} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lastErrorLabel}>LAST ERROR</Text>
                <Text style={styles.lastErrorText}>{item.last_error}</Text>
              </View>
            </View>
          )}

          {/* Retry result (server response) */}
          <RetryResponseBox result={retryResult} COLORS={COLORS} styles={styles} />

          {/* Retry button */}
          {canRetry && (
            <TouchableOpacity
              style={[styles.retryItemBtn, retrying && { opacity: 0.6 }]}
              onPress={handleRetry}
              disabled={retrying}
            >
              {retrying
                ? <ActivityIndicator size="small" color={COLORS.navy} />
                : <Icon name="refresh" size={16} color={COLORS.navy} />
              }
              <Text style={styles.retryItemBtnText}>
                {retrying ? 'RETRYING — waiting for server…' : 'RETRY THIS ITEM'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

// ── RetryAllModal — live progress log ────────────────────
const RetryAllModal = ({ visible, log, total, done, fatalError, COLORS, styles, onClose }) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={styles.modalBox}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>RETRY ALL — LIVE LOG</Text>
          {!done && <ActivityIndicator size="small" color={COLORS.gold} />}
          {done && (
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={22} color={COLORS.gray} />
            </TouchableOpacity>
          )}
        </View>

        {fatalError ? (
          <View style={styles.fatalErrorBox}>
            <Icon name="wifi-off" size={28} color={COLORS.danger} />
            <Text style={styles.fatalErrorText}>{fatalError}</Text>
          </View>
        ) : (
          <>
            {/* Progress bar */}
            {total > 0 && (
              <View style={styles.progressTrack}>
                <View style={[
                  styles.progressFill,
                  { width: `${Math.round((log.length / total) * 100)}%`, backgroundColor: COLORS.gold },
                ]} />
              </View>
            )}
            <Text style={styles.progressLabel}>
              {log.length} / {total} processed
            </Text>

            <ScrollView style={styles.logScroll} contentContainerStyle={{ paddingBottom: 10 }}>
              {log.map((entry, i) => (
                <View key={i} style={styles.logEntry}>
                  <Icon
                    name={entry.result.success ? 'check-circle' : 'alert-circle'}
                    size={16}
                    color={entry.result.success ? COLORS.success : COLORS.danger}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.logItemName}>
                      {entry.item.table_name} · {entry.item.action_type}
                    </Text>
                    {entry.result.success ? (
                      <Text style={[styles.logItemStatus, { color: COLORS.success }]}>✓ Synced</Text>
                    ) : (
                      <Text style={[styles.logItemStatus, { color: COLORS.danger }]} numberOfLines={2}>
                        ✗ {entry.result.error || 'Failed — see item for details'}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>

            {done && (
              <View style={styles.logSummary}>
                <Text style={[styles.logSummaryText, { color: COLORS.success }]}>
                  ✓ {log.filter(e => e.result.success).length} synced
                </Text>
                <Text style={[styles.logSummaryText, { color: COLORS.danger }]}>
                  ✗ {log.filter(e => !e.result.success).length} failed
                </Text>
              </View>
            )}
          </>
        )}

        {done && (
          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
            <Text style={styles.modalCloseBtnText}>CLOSE</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  </Modal>
);

// ── Main Screen ───────────────────────────────────────────
const AUTO_RETRY_INTERVAL = 10; // seconds — must match SYNC_INTERVAL in api.js

const SyncStatusScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [stats,      setStats]      = useState({ total: 0, synced: 0, pending: 0, failed: 0 });
  const [history,    setHistory]    = useState([]);
  const [isOnline,   setIsOnline]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState(null);
  const [countdown,  setCountdown]  = useState(AUTO_RETRY_INTERVAL);

  // Retry-all modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [retryLog,     setRetryLog]     = useState([]);
  const [retryTotal,   setRetryTotal]   = useState(0);
  const [retryDone,    setRetryDone]    = useState(false);
  const [fatalError,   setFatalError]   = useState(null);

  useEffect(() => { load(); }, []);

  // ── Countdown + auto-refresh every 10 s ────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          load(); // refresh data when background sync fires
          return AUTO_RETRY_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const load = async () => {
    const [s, h] = await Promise.all([getSyncStatus(), getSyncHistory()]);
    setStats(s);
    setIsOnline(s.is_online);
    setHistory(h);
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleRetryAll = async () => {
    // Use items already loaded in memory — avoids race condition with background sync
    const itemsToRetry = history.filter(
      h => h.sync_status === 'pending' || h.sync_status === 'failed'
    );

    setRetryLog([]);
    setRetryTotal(itemsToRetry.length);
    setRetryDone(false);
    setFatalError(null);
    setModalVisible(true);

    await retryAllWithProgress(itemsToRetry, ({ current, total, item, result, done, fatalError: fe }) => {
      if (fe) {
        setFatalError(fe);
        setRetryDone(true);
        return;
      }
      if (total) setRetryTotal(total);
      if (item && result) {
        setRetryLog(prev => [...prev, { item, result }]);
      }
      if (done) {
        setRetryDone(true);
        load();
      }
    });
  };

  const handleModalClose = () => {
    setModalVisible(false);
    load();
  };

  const handleClearSyncQueue = ({ label, statuses, count }) => {
    if (!count) {
      Alert.alert('Nothing to Clear', `There are no ${label.toLowerCase()} sync items.`);
      return;
    }

    const risky = statuses.includes('pending') || statuses.includes('failed');
    const message = risky
      ? `This will clear ${count} ${label.toLowerCase()} sync queue item${count !== 1 ? 's' : ''}. Pending or failed items will stop retrying, but cricket data already saved in the app will not be deleted.`
      : `This will clear ${count} ${label.toLowerCase()} sync history item${count !== 1 ? 's' : ''}. Cricket data will not be deleted.`;

    Alert.alert(`Clear ${label}?`, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearSyncQueueByStatuses(statuses);
            if (filter && statuses.includes(filter)) setFilter(null);
            await load();
          } catch (error) {
            Alert.alert('Clear Failed', error.message || 'Could not clear sync items.');
          }
        },
      },
    ]);
  };

  const toggleFilter = (f) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilter(prev => prev === f ? null : f);
  };

  const filtered = filter ? history.filter(h => h.sync_status === filter) : history;
  const totalCount = Number(stats.total || 0);
  const syncedCount = Number(stats.synced || 0);
  const pendingCount = Number(stats.pending || 0);
  const failedCount = Number(stats.failed || 0);
  const clearableTotal = syncedCount + pendingCount + failedCount;

  const STAT_CARDS = [
    { label: 'Total',   value: totalCount,   color: COLORS.lightGray, key: null },
    { label: 'Synced',  value: syncedCount,  color: COLORS.success,   key: 'synced' },
    { label: 'Pending', value: pendingCount, color: COLORS.warning,   key: 'pending' },
    { label: 'Failed',  value: failedCount,  color: COLORS.danger,    key: 'failed' },
  ];

  const CLEAR_ACTIONS = [
    { label: 'Synced',  statuses: ['synced'],                      count: syncedCount,    color: COLORS.success, icon: 'check-circle-outline' },
    { label: 'Pending', statuses: ['pending'],                     count: pendingCount,   color: COLORS.warning, icon: 'clock-remove-outline' },
    { label: 'Failed',  statuses: ['failed'],                      count: failedCount,    color: COLORS.danger,  icon: 'alert-remove-outline' },
    { label: 'All',     statuses: ['synced', 'pending', 'failed'], count: clearableTotal, color: COLORS.gold,    icon: 'delete-sweep-outline' },
  ];

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title}>SYNC STATUS</Text>
        <View style={[styles.onlineBadge, { backgroundColor: isOnline ? COLORS.success + '22' : COLORS.danger + '22' }]}>
          <View style={[styles.onlineDot, { backgroundColor: isOnline ? COLORS.success : COLORS.danger }]} />
          <Text style={[styles.onlineText, { color: isOnline ? COLORS.success : COLORS.danger }]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Stat cards */}
      <View style={styles.statsRow}>
        {STAT_CARDS.map(s => {
          const active = filter === s.key && s.key !== null;
          return (
            <TouchableOpacity
              key={s.label}
              style={[styles.statItem, active && { borderColor: s.color, borderWidth: 2 }, s.key === null && { opacity: 0.7 }]}
              onPress={() => s.key && toggleFilter(s.key)}
              activeOpacity={s.key ? 0.75 : 1}
            >
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
              {s.key && s.value > 0 && (
                <Icon name={active ? 'filter-remove' : 'filter-outline'} size={11} color={s.color} style={{ marginTop: 3 }} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Active filter bar */}
      {filter && (
        <View style={styles.filterBar}>
          <Icon name="filter" size={14} color={COLORS.gold} />
          <Text style={styles.filterBarText}>Showing {filter.toUpperCase()} — {filtered.length} items</Text>
          <TouchableOpacity onPress={() => setFilter(null)}>
            <Icon name="close-circle" size={16} color={COLORS.gray} />
          </TouchableOpacity>
        </View>
      )}

      {/* Auto-retry countdown bar */}
      {(failedCount > 0 || pendingCount > 0) && (
        <View style={styles.countdownBar}>
          <View style={styles.countdownLeft}>
            <Icon name="timer-outline" size={14} color={COLORS.cyan} />
            <Text style={styles.countdownText}>Auto-retry in</Text>
            <Text style={[styles.countdownNum, { color: countdown <= 3 ? COLORS.warning : COLORS.cyan }]}>
              {countdown}s
            </Text>
          </View>
          {/* Progress track — shrinks left to right */}
          <View style={styles.countdownTrack}>
            <View style={[
              styles.countdownFill,
              {
                width: `${(countdown / AUTO_RETRY_INTERVAL) * 100}%`,
                backgroundColor: countdown <= 3 ? COLORS.warning : COLORS.cyan,
              },
            ]} />
          </View>
        </View>
      )}

      {/* Retry All button */}
      {(failedCount > 0 || pendingCount > 0) && (
        <TouchableOpacity style={styles.retryAllBtn} onPress={handleRetryAll}>
          <Icon name="refresh" size={18} color={COLORS.navy} />
          <Text style={styles.retryAllBtnText}>
            RETRY ALL PENDING & FAILED ({pendingCount + failedCount})
          </Text>
        </TouchableOpacity>
      )}

      {clearableTotal > 0 && (
        <View style={styles.clearPanel}>
          <View style={styles.clearHeader}>
            <Icon name="delete-clock-outline" size={15} color={COLORS.gray} />
            <Text style={styles.clearTitle}>CLEAR SYNC QUEUE</Text>
          </View>
          <View style={styles.clearGrid}>
            {CLEAR_ACTIONS.map(action => {
              const disabled = action.count === 0;
              return (
                <TouchableOpacity
                  key={action.label}
                  style={[
                    styles.clearBtn,
                    { borderColor: action.color + '55', backgroundColor: action.color + '12' },
                    disabled && styles.clearBtnDisabled,
                  ]}
                  onPress={() => handleClearSyncQueue(action)}
                  disabled={disabled}
                >
                  <Icon name={action.icon} size={15} color={disabled ? COLORS.gray : action.color} />
                  <Text style={[styles.clearBtnText, { color: disabled ? COLORS.gray : action.color }]}>
                    {action.label} ({action.count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Item list */}
      <FlatList
        data={filtered}
        keyExtractor={i => String(i.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <SyncItem
            item={item}
            COLORS={COLORS}
            styles={styles}
            onRetried={load}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Icon name="cloud-check" size={48} color={COLORS.gray} />
            <Text style={styles.empty}>{filter ? `No ${filter} items` : 'No sync history yet'}</Text>
          </View>
        }
      />

      {/* Retry All Modal */}
      <RetryAllModal
        visible={modalVisible}
        log={retryLog}
        total={retryTotal}
        done={retryDone}
        fatalError={fatalError}
        COLORS={COLORS}
        styles={styles}
        onClose={handleModalClose}
      />
    </LinearGradient>
  );
};

// ── Styles ─────────────────────────────────────────────────
const getStyles = (COLORS) => StyleSheet.create({
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 16 },
  title:           { color: COLORS.white, fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  onlineBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  onlineDot:       { width: 8, height: 8, borderRadius: 4 },
  onlineText:      { fontSize: 12, fontWeight: '700' },

  statsRow:        { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  statItem:        { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  statValue:       { fontSize: 22, fontWeight: '900' },
  statLabel:       { color: COLORS.gray, fontSize: 10, marginTop: 2 },

  filterBar:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 8, backgroundColor: COLORS.gold + '18', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  filterBarText:   { flex: 1, color: COLORS.gold, fontSize: 12, fontWeight: '700' },

  countdownBar:    { marginHorizontal: 16, marginBottom: 8, backgroundColor: COLORS.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: COLORS.cardBorder, gap: 6 },
  countdownLeft:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countdownText:   { color: COLORS.gray, fontSize: 12 },
  countdownNum:    { fontSize: 13, fontWeight: '800' },
  countdownTrack:  { height: 3, backgroundColor: COLORS.darkGray, borderRadius: 2, overflow: 'hidden' },
  countdownFill:   { height: 3, borderRadius: 2 },

  retryAllBtn:     { marginHorizontal: 16, marginBottom: 10, backgroundColor: COLORS.gold, borderRadius: 12, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  retryAllBtnText: { color: COLORS.navy, fontWeight: '800', fontSize: 12 },

  clearPanel:      { marginHorizontal: 16, marginBottom: 10, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.cardBorder, padding: 10 },
  clearHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  clearTitle:      { color: COLORS.gray, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  clearGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clearBtn:        { width: '48%', minHeight: 36, borderRadius: 9, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  clearBtnDisabled:{ opacity: 0.45 },
  clearBtnText:    { fontSize: 11, fontWeight: '800' },

  // History item
  historyItem:     { backgroundColor: COLORS.card, borderRadius: 14, marginBottom: 8, borderWidth: 1, overflow: 'hidden' },
  historyRow:      { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  tableIconBox:    { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  historyInfo:     { flex: 1 },
  historyTable:    { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  historyTime:     { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  errorSnippet:    { color: COLORS.danger, fontSize: 11, marginTop: 3 },
  historyRight:    { alignItems: 'flex-end', gap: 2 },
  statusBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },

  // Expanded
  expandedBox:     { borderTopWidth: 1, borderTopColor: COLORS.cardBorder, padding: 14 },
  sectionMini:     { color: COLORS.gray, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 10, marginBottom: 6 },
  payloadRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder + '50' },
  payloadKey:      { color: COLORS.gray, fontSize: 12, fontWeight: '600', flex: 0.38 },
  payloadVal:      { color: COLORS.white, fontSize: 12, flex: 0.60, textAlign: 'right' },
  mono:            { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  lastErrorBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, backgroundColor: COLORS.danger + '18', borderRadius: 8, padding: 10 },
  lastErrorLabel:  { color: COLORS.danger, fontSize: 10, fontWeight: '800', marginBottom: 3 },
  lastErrorText:   { color: COLORS.danger, fontSize: 12 },

  // Retry item button
  retryItemBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, backgroundColor: COLORS.gold, borderRadius: 10, height: 42 },
  retryItemBtnText:{ color: COLORS.navy, fontWeight: '800', fontSize: 12 },

  // Response box
  responseBox:     { borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 10 },
  responseHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  responseTitleText:{ fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  responseToggle:  { fontSize: 12, fontWeight: '600', textDecorationLine: 'underline', marginBottom: 6 },
  responseErrorRow:{ marginBottom: 6 },
  responseErrorLabel:{ fontSize: 10, fontWeight: '800', color: COLORS.gray, marginBottom: 2 },
  responseErrorText:{ fontSize: 12, color: COLORS.white },
  responseRaw:     { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11, color: COLORS.lightGray, marginTop: 4 },

  emptyBox:        { alignItems: 'center', marginTop: 60, gap: 12 },
  empty:           { color: COLORS.gray, fontSize: 15 },

  // Retry All Modal
  modalOverlay:    { flex: 1, backgroundColor: '#000000CC', justifyContent: 'flex-end' },
  modalBox:        { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle:      { color: COLORS.white, fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  progressTrack:   { height: 6, backgroundColor: COLORS.darkGray, borderRadius: 3, marginBottom: 6 },
  progressFill:    { height: 6, borderRadius: 3 },
  progressLabel:   { color: COLORS.gray, fontSize: 12, marginBottom: 12 },
  logScroll:       { maxHeight: 320 },
  logEntry:        { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  logItemName:     { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  logItemStatus:   { fontSize: 12, marginTop: 2 },
  logSummary:      { flexDirection: 'row', gap: 20, justifyContent: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  logSummaryText:  { fontSize: 15, fontWeight: '800' },
  fatalErrorBox:   { alignItems: 'center', padding: 20, gap: 10 },
  fatalErrorText:  { color: COLORS.danger, fontSize: 14, textAlign: 'center' },
  modalCloseBtn:   { marginTop: 12, backgroundColor: COLORS.gold, borderRadius: 12, height: 46, alignItems: 'center', justifyContent: 'center' },
  modalCloseBtnText:{ color: COLORS.navy, fontWeight: '800', fontSize: 14 },
});

export default SyncStatusScreen;
