import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getPlayerByUserId, getPlayerStats } from '../../database/queries/playerQueries';

const asValue = value => (value === null || value === undefined ? '0' : String(value));

const StatTile = ({ label, value, icon, color, styles }) => (
  <View style={styles.tile}>
    <View style={[styles.iconCircle, { borderColor: color }]}>
      <Icon name={icon} size={18} color={color} />
    </View>
    <Text style={styles.tileValue}>{asValue(value)}</Text>
    <Text style={styles.tileLabel}>{label}</Text>
  </View>
);

const Section = ({ title, icon, color, children, styles }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <Icon name={icon} size={20} color={color} />
      <Text style={[styles.cardTitle, { color }]}>{title}</Text>
    </View>
    <View style={styles.grid}>{children}</View>
  </View>
);

const PlayerStatsScreen = () => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    const player = await getPlayerByUserId(user?.id);
    if (!player) {
      setStats(null);
      return;
    }

    const nextStats = await getPlayerStats(player.id);
    setStats(nextStats);
  }, [user?.id]);

  useEffect(() => {
    loadStats().finally(() => setLoading(false));
  }, [loadStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.center}>
        <ActivityIndicator color={COLORS.gold} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Stats</Text>
        <Text style={styles.subtitle}>Completed match performance</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.gold} />}
        showsVerticalScrollIndicator={false}
      >
        <Section title="BATTING" icon="cricket" color={COLORS.gold} styles={styles}>
          <StatTile label="Matches"     value={stats?.batting?.total_matches}  icon="calendar-check" color={COLORS.gold} styles={styles} />
          <StatTile label="Runs"        value={stats?.batting?.total_runs}     icon="counter"        color={COLORS.gold} styles={styles} />
          <StatTile label="Highest"     value={stats?.batting?.highest_score}  icon="trophy"         color={COLORS.gold} styles={styles} />
          <StatTile label="Average"     value={stats?.batting?.batting_average} icon="chart-line"    color={COLORS.gold} styles={styles} />
          <StatTile label="Strike Rate" value={stats?.batting?.strike_rate}    icon="speedometer"    color={COLORS.gold} styles={styles} />
          <StatTile label="4s / 6s"     value={`${asValue(stats?.batting?.total_fours)} / ${asValue(stats?.batting?.total_sixes)}`} icon="bomb" color={COLORS.gold} styles={styles} />
        </Section>

        <Section title="BOWLING" icon="arm-flex" color={COLORS.cyan} styles={styles}>
          <StatTile label="Wickets"    value={stats?.bowling?.total_wickets}       icon="bullseye"        color={COLORS.cyan} styles={styles} />
          <StatTile label="Overs"      value={stats?.bowling?.total_overs}         icon="clock-outline"   color={COLORS.cyan} styles={styles} />
          <StatTile label="Economy"    value={stats?.bowling?.economy_rate}        icon="chart-bell-curve" color={COLORS.cyan} styles={styles} />
          <StatTile label="Best"       value={stats?.bowling?.best_bowling || '0/0'} icon="medal"         color={COLORS.cyan} styles={styles} />
          <StatTile label="Maidens"    value={stats?.bowling?.total_maidens}       icon="shield-star"     color={COLORS.cyan} styles={styles} />
          <StatTile label="Runs Given" value={stats?.bowling?.total_runs_conceded} icon="arrow-up-bold"  color={COLORS.cyan} styles={styles} />
        </Section>

        <Section title="FIELDING" icon="hand-clap" color={COLORS.purple} styles={styles}>
          <StatTile label="Catches"   value={stats?.fielding?.catches}   icon="hand-back-left" color={COLORS.purple} styles={styles} />
          <StatTile label="Run Outs"  value={stats?.fielding?.run_outs}  icon="run-fast"       color={COLORS.purple} styles={styles} />
          <StatTile label="Stumpings" value={stats?.fielding?.stumpings} icon="lightning-bolt" color={COLORS.purple} styles={styles} />
        </Section>
      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 50, paddingHorizontal: 20, marginBottom: 12 },
  title: { color: COLORS.white, fontSize: 22, fontWeight: '800' },
  subtitle: { color: COLORS.gray, fontSize: 13, marginTop: 4 },
  content: { paddingHorizontal: 16, paddingBottom: 30 },
  card: { backgroundColor: COLORS.card, borderRadius: 16, marginBottom: 16, padding: 16, borderWidth: 1, borderColor: COLORS.cardBorder },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle: { fontWeight: '700', fontSize: 13, letterSpacing: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31%', minHeight: 104, backgroundColor: COLORS.darkGray, borderRadius: 12, padding: 10, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileValue: { color: COLORS.white, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  tileLabel: { color: COLORS.gray, fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },
});

export default PlayerStatsScreen;
