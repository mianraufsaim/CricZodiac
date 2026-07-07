import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getRankings } from '../../services/RankingService';

const INITIAL_VISIBLE_ROWS = 5;
const SECTIONS = [
  { key: 'batting', title: 'Batting', icon: 'cricket', colorKey: 'gold' },
  { key: 'bowling', title: 'Bowling', icon: 'bullseye-arrow', colorKey: 'cyan' },
  { key: 'allRounder', title: 'All-rounder', icon: 'star-four-points', colorKey: 'success' },
];

const formatPoints = (value) => {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
};

const Movement = ({ movement, COLORS, styles }) => {
  if (movement === 'down') {
    return (
      <View style={[styles.movementBadge, { backgroundColor: COLORS.danger + '1F' }]}>
        <Icon name="arrow-down-bold" size={14} color={COLORS.danger} />
      </View>
    );
  }

  if (movement === 'up') {
    return (
      <View style={[styles.movementBadge, { backgroundColor: COLORS.success + '1F' }]}>
        <Icon name="arrow-up-bold" size={14} color={COLORS.success} />
      </View>
    );
  }

  return (
    <View style={styles.movementBadge}>
      <Icon name="minus" size={14} color={COLORS.gray} />
    </View>
  );
};

const RankingRow = ({ item, COLORS, styles }) => (
  <View style={styles.rankRow}>
    <Text style={styles.standing}>{item.standing}</Text>
    <Movement movement={item.movement} COLORS={COLORS} styles={styles} />
    <Text style={styles.playerName} numberOfLines={1}>{item.full_name}</Text>
    <Text style={styles.points}>{formatPoints(item.points)}</Text>
    <Text style={styles.ath}>{formatPoints(item.ath)}</Text>
  </View>
);

const RankingSection = ({
  config,
  rows,
  visibleCount,
  onViewMore,
  COLORS,
  styles,
}) => {
  const color = COLORS[config.colorKey] || COLORS.gold;
  const shownRows = rows.slice(0, visibleCount);
  const canViewMore = rows.length > visibleCount;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: color + '1F' }]}>
          <Icon name={config.icon} size={18} color={color} />
        </View>
        <View style={styles.sectionTitleWrap}>
          <Text style={styles.sectionTitle}>{config.title}</Text>
          <Text style={styles.sectionMeta}>Top {Math.min(rows.length, INITIAL_VISIBLE_ROWS)} players</Text>
        </View>
      </View>

      <View style={styles.tableHead}>
        <Text style={styles.headStanding}>#</Text>
        <Text style={styles.headMove}>Move</Text>
        <Text style={styles.headName}>Full Name</Text>
        <Text style={styles.headPoints}>Points</Text>
        <Text style={styles.headAth}>ATH</Text>
      </View>

      {shownRows.length ? shownRows.map(item => (
        <RankingRow key={item.id} item={item} COLORS={COLORS} styles={styles} />
      )) : (
        <View style={styles.emptyBlock}>
          <Icon name="chart-box-outline" size={22} color={COLORS.gray} />
          <Text style={styles.emptyText}>No completed match data yet</Text>
        </View>
      )}

      {canViewMore ? (
        <TouchableOpacity style={styles.viewMoreBtn} onPress={() => onViewMore(config.key)} activeOpacity={0.75}>
          <Icon name="chevron-down-circle-outline" size={16} color={COLORS.gold} />
          <Text style={styles.viewMoreText}>View More</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const PointsLegend = ({ COLORS, styles }) => {
  const items = [
    { label: 'Run', value: '+1', color: COLORS.gold },
    { label: 'Wicket', value: '+25', color: COLORS.cyan },
    { label: 'Catch/Stump/RO', value: '+5', color: COLORS.success },
    { label: 'Run conceded', value: '-0.5', color: COLORS.danger },
  ];

  return (
    <View style={styles.legend}>
      <View style={styles.legendHeader}>
        <Icon name="information-outline" size={16} color={COLORS.gold} />
        <Text style={styles.legendTitle}>Points Legend</Text>
      </View>
      <View style={styles.legendGrid}>
        {items.map(item => (
          <View key={item.label} style={styles.legendItem}>
            <Text style={[styles.legendValue, { color: item.color }]}>{item.value}</Text>
            <Text style={styles.legendLabel} numberOfLines={1}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const RankingsScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const { activeClub, viewingAsClub } = useAuth();
  const effectiveClub = viewingAsClub || activeClub;
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [rankings, setRankings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleRows, setVisibleRows] = useState({});
  const [errorText, setErrorText] = useState('');

  const loadData = useCallback(async () => {
    try {
      setErrorText('');
      const data = await getRankings({ clubId: effectiveClub?.id || null });
      setRankings(data);
    } catch (error) {
      console.warn('[Rankings] load failed:', error?.message);
      setErrorText(error?.message || 'Rankings API unavailable.');
      setRankings(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveClub?.id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleViewMore = useCallback((sectionKey) => {
    setVisibleRows(prev => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || INITIAL_VISIBLE_ROWS) + INITIAL_VISIBLE_ROWS,
    }));
  }, []);

  const matchCount = rankings?.meta?.currentMatchCount || 0;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.screen}>
      <View style={styles.header}>
        {navigation.canGoBack?.() ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.75}>
            <Icon name="arrow-left" size={21} color={COLORS.white} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Rankings</Text>
          <Text style={styles.subtitle}>Last {matchCount || 25} matches ranking points</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={onRefresh} activeOpacity={0.75}>
          <Icon name="refresh" size={20} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />
          }
        >
          {errorText ? (
            <View style={styles.errorBlock}>
              <Icon name="alert-circle-outline" size={18} color={COLORS.danger} />
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          ) : null}

          <PointsLegend COLORS={COLORS} styles={styles} />

          {SECTIONS.map(config => (
            <RankingSection
              key={config.key}
              config={config}
              rows={rankings?.[config.key] || []}
              visibleCount={visibleRows[config.key] || INITIAL_VISIBLE_ROWS}
              onViewMore={handleViewMore}
              COLORS={COLORS}
              styles={styles}
            />
          ))}
        </ScrollView>
      )}
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { color: COLORS.white, fontSize: 22, fontWeight: '900' },
  subtitle: { color: COLORS.gray, fontSize: 11, fontWeight: '600', marginTop: 2 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 14, paddingBottom: 34, gap: 12 },
  legend: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    overflow: 'hidden',
  },
  legendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  legendTitle: { color: COLORS.lightGray, fontSize: 12, fontWeight: '900' },
  legendGrid: { flexDirection: 'row', paddingVertical: 10 },
  legendItem: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 3 },
  legendValue: { fontSize: 16, fontWeight: '900' },
  legendLabel: { color: COLORS.gray, fontSize: 9, fontWeight: '700' },
  errorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: COLORS.danger + '16',
    borderWidth: 1,
    borderColor: COLORS.danger + '55',
    borderRadius: 8,
  },
  errorText: { flex: 1, color: COLORS.lightGray, fontSize: 12, fontWeight: '700' },
  section: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    gap: 10,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleWrap: { flex: 1 },
  sectionTitle: { color: COLORS.white, fontSize: 15, fontWeight: '900' },
  sectionMeta: { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: COLORS.darkGray,
  },
  headStanding: { width: 28, color: COLORS.gray, fontSize: 10, fontWeight: '800' },
  headMove: { width: 42, color: COLORS.gray, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  headName: { flex: 1, color: COLORS.gray, fontSize: 10, fontWeight: '800' },
  headPoints: { width: 58, color: COLORS.gray, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  headAth: { width: 54, color: COLORS.gray, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder + '88',
  },
  standing: { width: 28, color: COLORS.lightGray, fontSize: 14, fontWeight: '900' },
  movementBadge: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  playerName: { flex: 1, color: COLORS.white, fontSize: 13, fontWeight: '700' },
  points: { width: 58, color: COLORS.gold, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  ath: { width: 54, color: COLORS.lightGray, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  emptyBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 22, gap: 6 },
  emptyText: { color: COLORS.gray, fontSize: 12, fontWeight: '600' },
  viewMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    margin: 10,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: COLORS.gold + '16',
    borderWidth: 1,
    borderColor: COLORS.gold + '55',
  },
  viewMoreText: { color: COLORS.gold, fontSize: 12, fontWeight: '900' },
});

export default RankingsScreen;
