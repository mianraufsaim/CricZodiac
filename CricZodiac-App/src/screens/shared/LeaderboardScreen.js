// ============================================================
// CricZodiac — Leaderboard / Stats Dashboard
// Mirrors: Pavilions app Dashboard
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Image, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getMyStats, getTopAverages, getTopScores, getLeastScores,
  getMostSixes, getMostFours, getTopWicketTakers,
  getTopEconomy, getLeastEconomy, getTopBowler, getLeastBowler,
} from '../../database/queries/leaderboardQueries';
import { getPlayerByUserId } from '../../database/queries/playerQueries';

// ── Stat Chip ────────────────────────────────────────────
const StatChip = ({ label, value, styles }) => (
  <View style={styles.chip}>
    <Text style={styles.chipValue}>{value ?? '—'}</Text>
    <Text style={styles.chipLabel}>{label}</Text>
  </View>
);

// ── Leaderboard Section ───────────────────────────────────
const Section = ({ title, data, valueKey, valueLabel, onViewAll, navigation, COLORS, styles }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll}>
          <Text style={styles.viewAll}>View All</Text>
        </TouchableOpacity>
      )}
    </View>
    {!data || data.length === 0
      ? <Text style={styles.noData}>No data yet</Text>
      : data.slice(0, 5).map((item, idx) => (
        <TouchableOpacity
          key={item.id || idx}
          style={styles.row}
          onPress={() => navigation?.navigate('PlayerProfileView', { playerId: item.id })}
        >
          <View style={styles.rankBadge}>
            <Text style={[styles.rank, idx === 0 && { color: COLORS.gold }]}>{idx + 1}</Text>
          </View>
          {item.profile_pic
            ? <Image source={{ uri: item.profile_pic }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{item.full_name?.[0] || '?'}</Text>
              </View>
          }
          <Text style={styles.playerName} numberOfLines={1}>{item.full_name}</Text>
          <Text style={[styles.statValue, idx === 0 && { color: COLORS.gold }]}>
            {item[valueKey] ?? '—'}
            {valueLabel ? <Text style={styles.statUnit}> {valueLabel}</Text> : null}
          </Text>
        </TouchableOpacity>
      ))}
  </View>
);

// ── Double Section (two columns) ─────────────────────────
const DoubleSection = ({ leftTitle, leftData, leftKey, rightTitle, rightData, rightKey, navigation, COLORS, styles }) => (
  <View style={styles.doubleRow}>
    <View style={[styles.section, { flex: 1, marginRight: 6 }]}>
      <Text style={styles.sectionTitle}>{leftTitle}</Text>
      {!leftData || leftData.length === 0
        ? <Text style={styles.noData}>No data</Text>
        : leftData.slice(0, 5).map((item, idx) => (
          <TouchableOpacity key={item.id || idx} style={styles.row}
            onPress={() => navigation?.navigate('PlayerProfileView', { playerId: item.id })}>
            <Text style={[styles.rank, { width: 18 }, idx === 0 && { color: COLORS.gold }]}>{idx + 1}</Text>
            {item.profile_pic
              ? <Image source={{ uri: item.profile_pic }} style={styles.avatarSm} />
              : <View style={[styles.avatarSm, styles.avatarFallback]}>
                  <Text style={[styles.avatarInitial, { fontSize: 9 }]}>{item.full_name?.[0]}</Text>
                </View>}
            <Text style={styles.playerNameSm} numberOfLines={1}>{item.full_name}</Text>
            <Text style={[styles.statValueSm, idx === 0 && { color: COLORS.gold }]}>{item[leftKey] ?? '—'}</Text>
          </TouchableOpacity>
        ))}
    </View>
    <View style={[styles.section, { flex: 1, marginLeft: 6 }]}>
      <Text style={styles.sectionTitle}>{rightTitle}</Text>
      {!rightData || rightData.length === 0
        ? <Text style={styles.noData}>No data</Text>
        : rightData.slice(0, 5).map((item, idx) => (
          <TouchableOpacity key={item.id || idx} style={styles.row}
            onPress={() => navigation?.navigate('PlayerProfileView', { playerId: item.id })}>
            <Text style={[styles.rank, { width: 18 }, idx === 0 && { color: '#e74c3c' }]}>{idx + 1}</Text>
            {item.profile_pic
              ? <Image source={{ uri: item.profile_pic }} style={styles.avatarSm} />
              : <View style={[styles.avatarSm, styles.avatarFallback]}>
                  <Text style={[styles.avatarInitial, { fontSize: 9 }]}>{item.full_name?.[0]}</Text>
                </View>}
            <Text style={styles.playerNameSm} numberOfLines={1}>{item.full_name}</Text>
            <Text style={[styles.statValueSm, idx === 0 && { color: '#e74c3c' }]}>{item[rightKey] ?? '—'}</Text>
          </TouchableOpacity>
        ))}
    </View>
  </View>
);

// ── Main Screen ───────────────────────────────────────────
const LeaderboardScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { user } = useAuth();
  const [myStats,   setMyStats]   = useState(null);
  const [data,      setData]      = useState({});
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = async () => {
    try {
      let playerRow = null;
      if (user?.id) playerRow = await getPlayerByUserId(user.id);

      const [
        ms, topAvg, topScores, leastScores,
        mostSix, mostFour, topWkt,
        topEco, leastEco, topBwl, leastBwl,
      ] = await Promise.all([
        playerRow ? getMyStats(playerRow.id) : Promise.resolve(null),
        getTopAverages(10), getTopScores(10), getLeastScores(10),
        getMostSixes(10),   getMostFours(10), getTopWicketTakers(10),
        getTopEconomy(10),  getLeastEconomy(10),
        getTopBowler(10),   getLeastBowler(10),
      ]);

      setMyStats(ms);
      setData({ topAvg, topScores, leastScores, mostSix, mostFour, topWkt, topEco, leastEco, topBwl, leastBwl });
    } catch (e) {
      console.error('LeaderboardScreen:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadAll(); }, []));
  const onRefresh = () => { setRefreshing(true); loadAll(); };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <TouchableOpacity onPress={() => navigation.navigate('PlayerCompare')}>
          <Icon name="compare" size={24} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      {loading
        ? <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 60 }} />
        : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
          >
            {/* Personal Stats Bar */}
            {myStats && (
              <View style={styles.myStatsBar}>
                <StatChip label="Strike Rate" value={myStats.strike_rate} styles={styles} />
                <View style={styles.chipDivider} />
                <StatChip label="Avg Score"   value={myStats.avg_score}   styles={styles} />
                <View style={styles.chipDivider} />
                <StatChip label="Avg Eco"     value={myStats.avg_eco}     styles={styles} />
                <View style={styles.chipDivider} />
                <StatChip label="Avg Wkts"    value={myStats.avg_wickets} styles={styles} />
              </View>
            )}

            {/* Top Averages */}
            <Section title="🏏 Top Averages" data={data.topAvg} valueKey="average" navigation={navigation} COLORS={COLORS} styles={styles} />

            {/* Top/Least Scores */}
            <DoubleSection
              leftTitle="Top Scores"    leftData={data.topScores}    leftKey="total_runs"
              rightTitle="Least Scores" rightData={data.leastScores} rightKey="total_runs"
              navigation={navigation} COLORS={COLORS} styles={styles}
            />

            {/* Most Sixes / Fours */}
            <DoubleSection
              leftTitle="Most Sixes"  leftData={data.mostSix}  leftKey="total_sixes"
              rightTitle="Most Fours" rightData={data.mostFour} rightKey="total_fours"
              navigation={navigation} COLORS={COLORS} styles={styles}
            />

            {/* Top Wicket Takers */}
            <Section title="🎯 Top Wicket Takers" data={data.topWkt} valueKey="total_wickets" navigation={navigation} COLORS={COLORS} styles={styles} />

            {/* Top/Least Economy */}
            <DoubleSection
              leftTitle="Top Economy"    leftData={data.topEco}   leftKey="economy"
              rightTitle="Least Economy" rightData={data.leastEco} rightKey="economy"
              navigation={navigation} COLORS={COLORS} styles={styles}
            />

            {/* Top/Least Bowler */}
            <DoubleSection
              leftTitle="Top Bowler (RC)"    leftData={data.topBwl}   leftKey="runs_conceded"
              rightTitle="Least Bowler (RC)" rightData={data.leastBwl} rightKey="runs_conceded"
              navigation={navigation} COLORS={COLORS} styles={styles}
            />
          </ScrollView>
        )}
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 4 },
  headerTitle:    { color: COLORS.white, fontSize: 20, fontWeight: '800' },
  scroll:         { padding: 16, paddingBottom: 40 },

  myStatsBar:     { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center' },
  chip:           { flex: 1, alignItems: 'center' },
  chipValue:      { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  chipLabel:      { color: COLORS.gray, fontSize: 9, marginTop: 2, textAlign: 'center' },
  chipDivider:    { width: 1, height: 32, backgroundColor: COLORS.cardBorder },

  section:        { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  sectionHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle:   { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  viewAll:        { color: COLORS.gold, fontSize: 11 },
  noData:         { color: COLORS.gray, fontSize: 12, textAlign: 'center', paddingVertical: 8 },

  row:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  rankBadge:      { width: 22, alignItems: 'center' },
  rank:           { color: COLORS.gray, fontWeight: '700', fontSize: 12 },
  avatar:         { width: 28, height: 28, borderRadius: 14, marginHorizontal: 8 },
  avatarSm:       { width: 22, height: 22, borderRadius: 11, marginHorizontal: 6 },
  avatarFallback: { backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center' },
  avatarInitial:  { color: COLORS.white, fontWeight: '700', fontSize: 11 },
  playerName:     { flex: 1, color: COLORS.white, fontSize: 13, fontWeight: '600' },
  playerNameSm:   { flex: 1, color: COLORS.white, fontSize: 11, fontWeight: '600' },
  statValue:      { color: COLORS.white, fontWeight: '700', fontSize: 13, marginLeft: 4 },
  statValueSm:    { color: COLORS.white, fontWeight: '700', fontSize: 11 },
  statUnit:       { color: COLORS.gray, fontWeight: '400', fontSize: 10 },

  doubleRow:      { flexDirection: 'row', marginBottom: 12 },
});

export default LeaderboardScreen;
