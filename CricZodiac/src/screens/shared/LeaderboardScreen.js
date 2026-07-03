// ============================================================
// CricZodiac — Leaderboard
// All data fetched live from API (club-scoped, no local SQLite)
// Tabs: BATTING | BOWLING
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

// ── Rank colours ─────────────────────────────────────────────
const RANK_COLOR  = ['#D4AF37', '#A8A9AD', '#CD7F32', null, null]; // gold/silver/bronze
const RANK_ICON   = ['crown', 'medal', 'medal-outline'];
const MIN_MATCHES = 20;
const INITIAL_VISIBLE_ROWS = 5;
const MAX_VISIBLE_ROWS = 10;

// ── Avatar ────────────────────────────────────────────────────
const Avatar = ({ uri, name, size = 32, COLORS }) => {
  const bg = COLORS.royalBlue;
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>
        {name?.[0]?.toUpperCase() || '?'}
      </Text>
    </View>
  );
};

// ── Single leaderboard row ────────────────────────────────────
const LBRow = ({ item, rank, valueKey, suffix, COLORS, styles, navigation }) => {
  const rankCol = RANK_COLOR[rank] ?? COLORS.gray;
  const isTop3  = rank < 3;
  return (
    <TouchableOpacity
      style={[styles.row, rank === 0 && styles.rowGold]}
      onPress={() => navigation?.navigate('PlayerProfileView', { playerId: item.id })}
      activeOpacity={0.75}
    >
      {/* Rank badge */}
      <View style={[styles.rankWrap, isTop3 && { backgroundColor: rankCol + '22' }]}>
        {isTop3
          ? <Icon name={RANK_ICON[rank]} size={14} color={rankCol} />
          : <Text style={[styles.rankNum, { color: COLORS.gray }]}>{rank + 1}</Text>
        }
      </View>

      <Avatar uri={item.profile_pic} name={item.full_name} size={30} COLORS={COLORS} />

      <Text style={styles.playerName} numberOfLines={1}>{item.full_name}</Text>

      <View style={styles.valueWrap}>
        <Text style={[styles.valueText, isTop3 && { color: rankCol }]}>
          {item[valueKey] ?? '—'}
        </Text>
        {suffix ? <Text style={styles.valueSuffix}>{suffix}</Text> : null}
      </View>
    </TouchableOpacity>
  );
};

// ── Section card ─────────────────────────────────────────────
const Section = ({
  sectionKey,
  icon,
  title,
  iconColor,
  data,
  valueKey,
  suffix,
  visibleCount,
  onLoadMore,
  navigation,
  COLORS,
  styles,
}) => {
  const rows = data ?? [];
  const shownRows = rows.slice(0, visibleCount);
  const canLoadMore = rows.length > shownRows.length && visibleCount < MAX_VISIBLE_ROWS;

  return (
    <View style={styles.card}>
      {/* Card header */}
      <View style={[styles.cardHeader, { borderLeftColor: iconColor }]}>
        <View style={[styles.cardIconWrap, { backgroundColor: iconColor + '22' }]}>
          <Icon name={icon} size={16} color={iconColor} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>

      {/* Rows */}
      {shownRows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Icon name="database-off-outline" size={22} color={COLORS.gray} />
          <Text style={styles.emptyText}>No data yet</Text>
        </View>
      ) : shownRows.map((item, idx) => (
        <LBRow
          key={item.id || idx}
          item={item}
          rank={idx}
          valueKey={valueKey}
          suffix={suffix}
          COLORS={COLORS}
          styles={styles}
          navigation={navigation}
        />
      ))}

      {canLoadMore ? (
        <TouchableOpacity
          style={styles.loadMoreBtn}
          onPress={() => onLoadMore(sectionKey)}
          activeOpacity={0.75}
        >
          <Icon name="chevron-down-circle-outline" size={16} color={COLORS.gold} />
          <Text style={styles.loadMoreText}>Load More</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

// ── Tab bar ───────────────────────────────────────────────────
const TabBar = ({ active, onChange, COLORS, styles }) => (
  <View style={styles.tabBar}>
    {['BATTING', 'BOWLING'].map(tab => (
      <TouchableOpacity
        key={tab}
        style={[styles.tab, active === tab && styles.tabActive]}
        onPress={() => onChange(tab)}
        activeOpacity={0.75}
      >
        <Icon
          name={tab === 'BATTING' ? 'cricket' : 'baseball-bat'}
          size={14}
          color={active === tab ? COLORS.gold : COLORS.gray}
        />
        <Text style={[styles.tabText, active === tab && styles.tabTextActive]}>{tab}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

// ── My Stats Bar ──────────────────────────────────────────────
const MyStatsBar = ({ myStats, COLORS, styles }) => {
  if (!myStats) return null;
  const chips = [
    { label: 'Runs',    value: myStats.total_runs  ?? '—' },
    { label: 'Sixes',   value: myStats.total_sixes ?? '—' },
    { label: 'Avg',     value: myStats.avg_score   ?? '—' },
    { label: 'SR',      value: myStats.strike_rate ?? '—' },
  ];
  return (
    <View style={styles.myBar}>
      <Text style={styles.myBarLabel}>MY STATS</Text>
      <View style={styles.myChips}>
        {chips.map((c, i) => (
          <View key={c.label} style={styles.myChip}>
            {i > 0 && <View style={styles.chipDiv} />}
            <Text style={styles.myChipVal}>{c.value}</Text>
            <Text style={styles.myChipLbl}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ── Main Screen ───────────────────────────────────────────────
const LeaderboardScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const { activeClub, viewingAsClub, user } = useAuth();
  const effectiveClub    = viewingAsClub ?? activeClub;
  const isSuperAdminView = !!viewingAsClub;
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [activeTab,  setActiveTab]  = useState('BATTING');
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleRowsBySection, setVisibleRowsBySection] = useState({});

  const loadData = useCallback(async () => {
    try {
      const params = { limit: MAX_VISIBLE_ROWS, min_matches: MIN_MATCHES };
      if (isSuperAdminView && effectiveClub?.id) params.club_id = effectiveClub.id;
      const res = await ApiService.get(API_ENDPOINTS.PLAYERS_LEADERBOARD, { params });
      if (res?.success) setData(res);
    } catch (_) {}
    finally { setLoading(false); }
  }, [isSuperAdminView, effectiveClub?.id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const batting = data?.batting ?? {};
  const bowling = data?.bowling ?? {};
  const visibleRowsFor = useCallback(
    (sectionKey) => visibleRowsBySection[sectionKey] ?? INITIAL_VISIBLE_ROWS,
    [visibleRowsBySection]
  );
  const handleLoadMore = useCallback((sectionKey) => {
    setVisibleRowsBySection(prev => ({
      ...prev,
      [sectionKey]: Math.min(MAX_VISIBLE_ROWS, (prev[sectionKey] ?? INITIAL_VISIBLE_ROWS) + INITIAL_VISIBLE_ROWS),
    }));
  }, []);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('PlayerCompare')}
          style={styles.compareBtn}
          activeOpacity={0.75}
        >
          <Icon name="compare" size={18} color={COLORS.gold} />
          <Text style={styles.compareTxt}>Compare</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <TabBar active={activeTab} onChange={setActiveTab} COLORS={COLORS} styles={styles} />

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />
          }
        >
          {/* My Stats Bar */}
          <MyStatsBar myStats={data?.my_stats} COLORS={COLORS} styles={styles} />

          {activeTab === 'BATTING' ? (
            <>
              <Section sectionKey="batting.top_averages"  icon="trending-up"        title="Top Averages"       iconColor={COLORS.gold}       data={batting.top_averages}  valueKey="average"    visibleCount={visibleRowsFor('batting.top_averages')}  onLoadMore={handleLoadMore} navigation={navigation} COLORS={COLORS} styles={styles} />
              <Section sectionKey="batting.top_scores"    icon="run-fast"           title="Top Run Scorers"    iconColor={COLORS.cyan}       data={batting.top_scores}    valueKey="total_runs" suffix="runs" visibleCount={visibleRowsFor('batting.top_scores')}    onLoadMore={handleLoadMore} navigation={navigation} COLORS={COLORS} styles={styles} />
              <Section sectionKey="batting.highest_score" icon="star-shooting"      title="Highest Score"      iconColor={COLORS.orange}     data={batting.highest_score} valueKey="best_score" visibleCount={visibleRowsFor('batting.highest_score')} onLoadMore={handleLoadMore} navigation={navigation} COLORS={COLORS} styles={styles} />
              <Section sectionKey="batting.most_sixes"    icon="numeric-6-circle"   title="Most Sixes"         iconColor={COLORS.purple}     data={batting.most_sixes}    valueKey="total_sixes" suffix="×6" visibleCount={visibleRowsFor('batting.most_sixes')}    onLoadMore={handleLoadMore} navigation={navigation} COLORS={COLORS} styles={styles} />
              <Section sectionKey="batting.most_fours"    icon="numeric-4-circle"   title="Most Fours"         iconColor={COLORS.royalBlue}  data={batting.most_fours}    valueKey="total_fours" suffix="×4" visibleCount={visibleRowsFor('batting.most_fours')}    onLoadMore={handleLoadMore} navigation={navigation} COLORS={COLORS} styles={styles} />
            </>
          ) : (
            <>
              <Section sectionKey="bowling.top_wickets"        icon="bullseye-arrow"     title="Top Wicket Takers"  iconColor={COLORS.gold}       data={bowling.top_wickets}        valueKey="total_wickets" suffix="wkts" visibleCount={visibleRowsFor('bowling.top_wickets')}        onLoadMore={handleLoadMore} navigation={navigation} COLORS={COLORS} styles={styles} />
              <Section sectionKey="bowling.best_economy"       icon="speedometer"        title="Best Economy"       iconColor={COLORS.success}    data={bowling.best_economy}       valueKey="economy" visibleCount={visibleRowsFor('bowling.best_economy')}       onLoadMore={handleLoadMore} navigation={navigation} COLORS={COLORS} styles={styles} />
              <Section sectionKey="bowling.worst_economy"      icon="speedometer-slow"   title="Highest Economy"    iconColor={COLORS.danger}     data={bowling.worst_economy}      valueKey="economy" visibleCount={visibleRowsFor('bowling.worst_economy')}      onLoadMore={handleLoadMore} navigation={navigation} COLORS={COLORS} styles={styles} />
              <Section sectionKey="bowling.most_runs_conceded" icon="fire"               title="Most Runs Conceded" iconColor={COLORS.orange}     data={bowling.most_runs_conceded} valueKey="runs_conceded" suffix="rc" visibleCount={visibleRowsFor('bowling.most_runs_conceded')} onLoadMore={handleLoadMore} navigation={navigation} COLORS={COLORS} styles={styles} />
            </>
          )}
        </ScrollView>
      )}
    </LinearGradient>
  );
};

// ── Styles ────────────────────────────────────────────────────
const getStyles = (COLORS) => StyleSheet.create({
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 52, paddingHorizontal: 20, paddingBottom: 8 },
  headerTitle:  { color: COLORS.white, fontSize: 22, fontWeight: '900' },
  compareBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.gold + '22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.gold + '55' },
  compareTxt:   { color: COLORS.gold, fontSize: 12, fontWeight: '700' },

  // Tab bar
  tabBar:       { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, backgroundColor: COLORS.card, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: COLORS.cardBorder },
  tab:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 11 },
  tabActive:    { backgroundColor: COLORS.gold + '22' },
  tabText:      { color: COLORS.gray, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  tabTextActive:{ color: COLORS.gold },

  scroll:       { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 12 },

  // My stats bar
  myBar:        { backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.gold + '44' },
  myBarLabel:   { color: COLORS.gold, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  myChips:      { flexDirection: 'row' },
  myChip:       { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chipDiv:      { width: 1, height: 28, backgroundColor: COLORS.cardBorder, marginRight: 10 },
  myChipVal:    { color: COLORS.white, fontWeight: '900', fontSize: 17, flex: 1, textAlign: 'center' },
  myChipLbl:    { position: 'absolute', bottom: -12, left: 0, right: 0, color: COLORS.gray, fontSize: 9, textAlign: 'center' },

  // Section card
  card:         { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden' },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  cardIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { color: COLORS.white, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },

  // Rows
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderTopWidth: 1, borderTopColor: COLORS.cardBorder + '88' },
  rowGold:      { backgroundColor: COLORS.gold + '0A' },
  rankWrap:     { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rankNum:      { fontSize: 12, fontWeight: '700' },
  playerName:   { flex: 1, color: COLORS.white, fontSize: 13, fontWeight: '600' },
  valueWrap:    { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  valueText:    { color: COLORS.white, fontWeight: '800', fontSize: 14 },
  valueSuffix:  { color: COLORS.gray, fontSize: 10, fontWeight: '500' },
  loadMoreBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, margin: 12, marginTop: 8, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.gold + '16', borderWidth: 1, borderColor: COLORS.gold + '55' },
  loadMoreText: { color: COLORS.gold, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

  // Empty state
  emptyWrap:    { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptyText:    { color: COLORS.gray, fontSize: 12 },
});

export default LeaderboardScreen;
