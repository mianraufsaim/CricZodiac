// ============================================================
// CricZodiac — Match History
// Fetched from API — no local SQLite.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  ActivityIndicator, Platform, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

// ── Result badge ──────────────────────────────────────────
const ResultBadge = ({ result, COLORS }) => {
  const cfg = {
    WON:  { bg: COLORS.success + '22', border: COLORS.success + '66', color: COLORS.success, icon: 'trophy-outline' },
    LOST: { bg: COLORS.danger  + '22', border: COLORS.danger  + '66', color: COLORS.danger,  icon: 'close-circle-outline' },
    TIE:  { bg: COLORS.warning + '22', border: COLORS.warning + '66', color: COLORS.warning, icon: 'handshake-outline' },
    DRAW: { bg: COLORS.gray    + '22', border: COLORS.gray    + '44', color: COLORS.gray,    icon: 'minus-circle-outline' },
  };
  const c = cfg[result] || cfg.DRAW;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: c.border }}>
      <Icon name={c.icon} size={12} color={c.color} />
      <Text style={{ color: c.color, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>{result}</Text>
    </View>
  );
};

// ── Stat chip ─────────────────────────────────────────────
const Chip = ({ label, value, color, COLORS }) => (
  <View style={{ alignItems: 'center', minWidth: 40 }}>
    <Text style={{ color: color || COLORS.white, fontSize: 15, fontWeight: '900' }}>{value ?? '—'}</Text>
    <Text style={{ color: COLORS.gray, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 }}>{label}</Text>
  </View>
);

const Sep = ({ COLORS }) => (
  <View style={{ width: 1, height: 26, backgroundColor: COLORS.cardBorder }} />
);

// ── Match Card ────────────────────────────────────────────
const MatchCard = ({ item, COLORS, styles }) => {
  const bat  = item.batting;
  const bowl = item.bowling;

  const date = item.match_date
    ? new Date(item.match_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const time = item.match_date
    ? new Date(item.match_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={styles.card}>

      {/* ── Result accent bar ── */}
      <View style={[
        styles.accentBar,
        { backgroundColor: item.result === 'WON' ? COLORS.success : item.result === 'LOST' ? COLORS.danger : COLORS.gray }
      ]} />

      {/* ── Top: teams + result + date ── */}
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          {/* Teams */}
          <Text style={styles.teamsText} numberOfLines={1}>
            {item.team_a}
            <Text style={{ color: COLORS.gray }}> vs </Text>
            {item.team_b}
          </Text>

          {/* Meta chips row */}
          <View style={styles.metaRow}>
            {item.series_name ? (
              <View style={styles.metaChip}>
                <Icon name="tournament" size={9} color={COLORS.gold} />
                <Text style={[styles.metaTxt, { color: COLORS.gold }]}>{item.series_name}</Text>
              </View>
            ) : null}
            {item.overs ? (
              <View style={styles.metaChip}>
                <Icon name="clock-outline" size={9} color={COLORS.cyan} />
                <Text style={[styles.metaTxt, { color: COLORS.cyan }]}>{item.overs} Overs</Text>
              </View>
            ) : null}
            {item.venue ? (
              <View style={styles.metaChip}>
                <Icon name="map-marker-outline" size={9} color={COLORS.gray} />
                <Text style={styles.metaTxt} numberOfLines={1}>{item.venue}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Right: badge + date */}
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <ResultBadge result={item.result} COLORS={COLORS} />
          {date ? <Text style={styles.dateText}>{date}</Text> : null}
          {time ? <Text style={[styles.dateText, { opacity: 0.6 }]}>{time}</Text> : null}
        </View>
      </View>

      {/* ── Result text ── */}
      {item.result_text ? (
        <View style={styles.resultTextRow}>
          <Icon
            name={item.result === 'WON' ? 'trophy' : item.result === 'LOST' ? 'close-circle' : 'handshake'}
            size={11}
            color={item.result === 'WON' ? COLORS.success : item.result === 'LOST' ? COLORS.danger : COLORS.gray}
          />
          <Text style={[
            styles.resultTxt,
            { color: item.result === 'WON' ? COLORS.success : item.result === 'LOST' ? COLORS.danger : COLORS.gray }
          ]}>{item.result_text}</Text>
        </View>
      ) : null}

      {/* ── Batting ── */}
      {bat ? (
        <>
          <View style={styles.sep} />
          <View style={styles.perfSection}>
            <View style={styles.perfLabel}>
              <Icon name="cricket" size={11} color={COLORS.gold} />
              <Text style={[styles.perfLabelTxt, { color: COLORS.gold }]}>BATTING</Text>
              {Number(bat.is_out) === 1 ? (
                <View style={styles.dismissalPill}>
                  <Icon name="close-circle" size={9} color={COLORS.danger} />
                  <Text style={styles.dismissalTxt}>
                    {bat.dismissal_type
                      ? bat.dismissal_type.replace('_', ' ')
                      : 'Out'}
                    {bat.bowler_name ? ` · b. ${bat.bowler_name}` : ''}
                  </Text>
                </View>
              ) : ['retired', 'retired_hurt'].includes(String(bat.dismissal_type || '').toLowerCase()) ? (
                <View style={[styles.dismissalPill, { backgroundColor: COLORS.warning + '22', borderColor: COLORS.warning + '44' }]}>
                  <Icon name="walk" size={9} color={COLORS.warning} />
                  <Text style={[styles.dismissalTxt, { color: COLORS.warning }]}>Retired Hurt</Text>
                </View>
              ) : (
                <View style={[styles.dismissalPill, { backgroundColor: COLORS.success + '22', borderColor: COLORS.success + '44' }]}>
                  <Icon name="check-circle" size={9} color={COLORS.success} />
                  <Text style={[styles.dismissalTxt, { color: COLORS.success }]}>Not Out</Text>
                </View>
              )}
            </View>
            <View style={styles.statsRow}>
              <Chip label="Runs"  value={bat.runs_scored}  color={COLORS.gold}      COLORS={COLORS} />
              <Sep COLORS={COLORS} />
              <Chip label="Balls" value={bat.balls_faced}  color={COLORS.white}     COLORS={COLORS} />
              <Sep COLORS={COLORS} />
              <Chip label="SR"    value={bat.strike_rate}  color={COLORS.white}     COLORS={COLORS} />
              <Sep COLORS={COLORS} />
              <Chip label="4s"    value={bat.fours}        color={COLORS.royalBlue} COLORS={COLORS} />
              <Sep COLORS={COLORS} />
              <Chip label="6s"    value={bat.sixes}        color={COLORS.purple}    COLORS={COLORS} />
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.sep} />
          <View style={[styles.perfSection, { paddingVertical: 10 }]}>
            <Text style={styles.didNotPlay}>Did not bat</Text>
          </View>
        </>
      )}

      {/* ── Bowling ── */}
      {bowl ? (
        <>
          <View style={styles.sep} />
          <View style={styles.perfSection}>
            <View style={styles.perfLabel}>
              <Icon name="bullseye-arrow" size={11} color={COLORS.cyan} />
              <Text style={[styles.perfLabelTxt, { color: COLORS.cyan }]}>BOWLING</Text>
            </View>
            <View style={styles.statsRow}>
              <Chip label="W/R"    value={`${bowl.wickets}/${bowl.runs_conceded}`} color={COLORS.cyan}    COLORS={COLORS} />
              <Sep COLORS={COLORS} />
              <Chip label="Overs"  value={bowl.overs_bowled}  color={COLORS.white}   COLORS={COLORS} />
              <Sep COLORS={COLORS} />
              <Chip label="Econ"   value={bowl.economy}       color={COLORS.cyan}    COLORS={COLORS} />
              <Sep COLORS={COLORS} />
              <Chip label="Maidens" value={bowl.maidens}      color={COLORS.success} COLORS={COLORS} />
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
};

// ── Empty state ───────────────────────────────────────────
const EmptyState = ({ COLORS, styles }) => (
  <View style={styles.emptyWrap}>
    <Icon name="cricket" size={60} color={COLORS.cardBorder} />
    <Text style={styles.emptyTitle}>No Match History</Text>
    <Text style={styles.emptySub}>Completed matches you played will appear here</Text>
  </View>
);

// ── Main ──────────────────────────────────────────────────
const MatchHistoryScreen = () => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [matches,    setMatches]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ApiService.get(API_ENDPOINTS.PLAYERS_MATCH_HISTORY);
      if (res?.success) setMatches(res.matches || []);
    } catch (e) {
      console.log('[MatchHistory] error:', e?.message);
    }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Match History</Text>
          <Text style={styles.subtitle}>
            {matches.length > 0 ? `${matches.length} match${matches.length > 1 ? 'es' : ''} played` : 'Your match timeline'}
          </Text>
        </View>
        {matches.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countTxt}>{matches.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={i => String(i.match_id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={<EmptyState COLORS={COLORS} styles={styles} />}
          renderItem={({ item }) => <MatchCard item={item} COLORS={COLORS} styles={styles} />}
        />
      )}
    </LinearGradient>
  );
};

// ── Styles ────────────────────────────────────────────────
const getStyles = (COLORS) => StyleSheet.create({
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:     { paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 10, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:      { color: COLORS.white, fontSize: 22, fontWeight: '900' },
  subtitle:   { color: COLORS.gray, fontSize: 12, marginTop: 2 },
  countBadge: { backgroundColor: COLORS.gold + '22', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.gold + '55' },
  countTxt:   { color: COLORS.gold, fontWeight: '800', fontSize: 14 },

  list:       { paddingHorizontal: 16, paddingBottom: 36, gap: 12 },

  // Card
  card:       { backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden' },
  accentBar:  { height: 3, width: '100%' },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  teamsText:  { color: COLORS.white, fontSize: 14, fontWeight: '800', marginBottom: 7 },
  metaRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  metaChip:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.darkGray, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  metaTxt:    { color: COLORS.gray, fontSize: 10, fontWeight: '600' },
  dateText:   { color: COLORS.gray, fontSize: 10 },

  // Result text row
  resultTextRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingBottom: 10, marginTop: -4 },
  resultTxt:     { fontSize: 11, fontWeight: '600', flex: 1 },

  sep:        { height: 1, backgroundColor: COLORS.cardBorder },

  // Performance section
  perfSection:   { padding: 14, gap: 10 },
  perfLabel:     { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  perfLabelTxt:  { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  dismissalPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.danger + '1A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.danger + '44' },
  dismissalTxt:  { color: COLORS.danger, fontSize: 9, fontWeight: '600', textTransform: 'capitalize' },
  statsRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  didNotPlay:    { color: COLORS.gray, fontSize: 12, fontStyle: 'italic' },

  // Empty
  emptyWrap:  { alignItems: 'center', paddingVertical: 80, gap: 10 },
  emptyTitle: { color: COLORS.white, fontSize: 18, fontWeight: '800' },
  emptySub:   { color: COLORS.gray, fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
});

export default MatchHistoryScreen;
