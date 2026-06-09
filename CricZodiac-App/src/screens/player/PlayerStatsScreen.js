// ============================================================
// CricZodiac — Player Stats (My Stats)
// All data fetched live from API — no local SQLite.
// Shows: profile hero · summary strip · batting / bowling / fielding
// ============================================================

import React, { useCallback, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, Image, Platform, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

// ── Avatar ─────────────────────────────────────────────────
const Avatar = ({ uri, name, size = 80 }) => {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: '#D4AF37' }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1a3a6e', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#D4AF37' }}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.38 }}>
        {name?.[0]?.toUpperCase() || '?'}
      </Text>
    </View>
  );
};

// ── Player type badge ──────────────────────────────────────
const TypeBadge = ({ type, COLORS }) => {
  const map = { batsman: { color: COLORS.cyan, icon: 'cricket' }, bowler: { color: COLORS.orange, icon: 'baseball-bat' }, allrounder: { color: COLORS.gold, icon: 'star-four-points' } };
  const { color, icon } = map[type] || { color: COLORS.gray, icon: 'account' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: color + '22', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: color + '44' }}>
      <Icon name={icon} size={11} color={color} />
      <Text style={{ color, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }}>{type || 'Player'}</Text>
    </View>
  );
};

// ── Summary chip (top strip) ───────────────────────────────
const SummaryChip = ({ label, value, color, styles }) => (
  <View style={styles.summaryChip}>
    <Text style={[styles.summaryVal, { color }]}>{value ?? '—'}</Text>
    <Text style={styles.summaryLbl}>{label}</Text>
  </View>
);

// ── Stat tile ──────────────────────────────────────────────
const StatTile = ({ label, value, icon, color, wide, styles }) => (
  <View style={[styles.tile, wide && styles.tileWide]}>
    <View style={[styles.tileIconWrap, { backgroundColor: color + '1A' }]}>
      <Icon name={icon} size={17} color={color} />
    </View>
    <Text style={styles.tileVal}>{value ?? '—'}</Text>
    <Text style={styles.tileLbl}>{label}</Text>
  </View>
);

// ── Section card ───────────────────────────────────────────
const Section = ({ icon, title, color, children, styles }) => (
  <View style={styles.card}>
    <View style={[styles.cardHeader, { borderLeftColor: color }]}>
      <View style={[styles.cardIconWrap, { backgroundColor: color + '22' }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.cardTitle, { color }]}>{title}</Text>
    </View>
    <View style={styles.grid}>{children}</View>
  </View>
);

// ── Not a player state ─────────────────────────────────────
const NoPlayerView = ({ COLORS, styles }) => (
  <View style={styles.noPlayerWrap}>
    <Icon name="account-off-outline" size={56} color={COLORS.gray} />
    <Text style={styles.noPlayerTitle}>No Player Profile</Text>
    <Text style={styles.noPlayerSub}>Ask your admin to create a player profile linked to your account.</Text>
  </View>
);

// ── Main Screen ────────────────────────────────────────────
const PlayerStatsScreen = () => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await ApiService.get(API_ENDPOINTS.PLAYERS_MY_STATS);
      if (res?.success) setData(res);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  if (loading) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </LinearGradient>
    );
  }

  const profile = data?.profile;
  const bat     = data?.batting  || {};
  const bowl    = data?.bowling  || {};
  const field   = data?.fielding || {};

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Page header ── */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>My Stats</Text>
        <Text style={styles.pageSub}>Completed match performance</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />
        }
      >
        {!data?.has_player ? (
          <NoPlayerView COLORS={COLORS} styles={styles} />
        ) : (
          <>
            {/* ── Profile hero ── */}
            <View style={styles.hero}>
              <View style={styles.heroAvatarRow}>
                <Avatar uri={profile?.profile_pic} name={profile?.full_name} size={74} />
                <View style={styles.heroInfo}>
                  <Text style={styles.heroName}>{profile?.full_name}</Text>
                  <TypeBadge type={profile?.player_type} COLORS={COLORS} />
                  <View style={styles.heroMeta}>
                    {profile?.jersey_number ? (
                      <View style={styles.metaChip}>
                        <Icon name="tshirt-crew-outline" size={11} color={COLORS.gray} />
                        <Text style={styles.metaChipTxt}>#{profile.jersey_number}</Text>
                      </View>
                    ) : null}
                    {profile?.club_name ? (
                      <View style={styles.metaChip}>
                        <Icon name="shield-star" size={11} color={COLORS.gold} />
                        <Text style={[styles.metaChipTxt, { color: COLORS.gold }]}>{profile.club_name}</Text>
                      </View>
                    ) : null}
                    {profile?.batting_hand ? (
                      <View style={styles.metaChip}>
                        <Icon name="hand-back-right-outline" size={11} color={COLORS.gray} />
                        <Text style={styles.metaChipTxt}>{profile.batting_hand}-hand</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* ── Summary strip ── */}
              <View style={styles.summaryStrip}>
                <SummaryChip label="Matches" value={bat.total_matches}  color={COLORS.white}  styles={styles} />
                <View style={styles.summaryDiv} />
                <SummaryChip label="Runs"    value={bat.total_runs}     color={COLORS.gold}   styles={styles} />
                <View style={styles.summaryDiv} />
                <SummaryChip label="Wickets" value={bowl.total_wickets} color={COLORS.cyan}   styles={styles} />
                <View style={styles.summaryDiv} />
                <SummaryChip label="Avg"     value={bat.batting_average} color={COLORS.orange} styles={styles} />
              </View>
            </View>

            {/* ── BATTING ── */}
            <Section icon="cricket" title="BATTING" color={COLORS.gold} styles={styles}>
              <StatTile icon="calendar-check"  label="Matches"      value={bat.total_matches}    color={COLORS.gold}      styles={styles} />
              <StatTile icon="counter"         label="Total Runs"   value={bat.total_runs}       color={COLORS.gold}      styles={styles} />
              <StatTile icon="trophy-outline"  label="Highest"      value={bat.highest_score}    color={COLORS.gold}      styles={styles} />
              <StatTile icon="chart-line"      label="Average"      value={bat.batting_average}  color={COLORS.gold}      styles={styles} />
              <StatTile icon="speedometer"     label="Strike Rate"  value={bat.strike_rate}      color={COLORS.gold}      styles={styles} />
              <StatTile icon="target"          label="Balls Faced"  value={bat.total_balls}      color={COLORS.gold}      styles={styles} />
              <StatTile icon="numeric-4-circle" label="Fours"       value={bat.total_fours}      color={COLORS.royalBlue} styles={styles} />
              <StatTile icon="numeric-6-circle" label="Sixes"       value={bat.total_sixes}      color={COLORS.purple}    styles={styles} />
              <StatTile icon="medal-outline"   label="50s"          value={bat.fifties}          color={COLORS.cyan}      styles={styles} />
              <StatTile icon="medal"           label="100s"         value={bat.hundreds}         color={COLORS.gold}      styles={styles} />
              <StatTile icon="check-circle-outline" label="Not Outs" value={bat.not_outs}        color={COLORS.success}   styles={styles} />
              <StatTile icon="emoticon-sad-outline" label="Ducks"   value={bat.ducks}            color={COLORS.danger}    styles={styles} />
            </Section>

            {/* ── BOWLING ── */}
            <Section icon="bullseye-arrow" title="BOWLING" color={COLORS.cyan} styles={styles}>
              <StatTile icon="target"            label="Wickets"      value={bowl.total_wickets}       color={COLORS.cyan}   styles={styles} />
              <StatTile icon="clock-outline"     label="Overs"        value={bowl.total_overs}         color={COLORS.cyan}   styles={styles} />
              <StatTile icon="speedometer"       label="Economy"      value={bowl.economy_rate}        color={COLORS.cyan}   styles={styles} />
              <StatTile icon="star-shooting"     label="Best Figures" value={bowl.best_bowling}        color={COLORS.gold}   styles={styles} />
              <StatTile icon="arrow-up-bold"     label="Runs Given"   value={bowl.total_runs_conceded} color={COLORS.orange} styles={styles} />
              <StatTile icon="shield-star"       label="Maidens"      value={bowl.total_maidens}       color={COLORS.success}styles={styles} />
              <StatTile icon="cricket"           label="Innings"      value={bowl.bowling_innings}     color={COLORS.cyan}   styles={styles} />
            </Section>

            {/* ── FIELDING ── */}
            <Section icon="hand-back-right" title="FIELDING" color={COLORS.purple} styles={styles}>
              <StatTile icon="hand-back-left"  label="Catches"   value={field.catches}   color={COLORS.purple} styles={styles} />
              <StatTile icon="run-fast"        label="Run Outs"  value={field.run_outs}  color={COLORS.orange} styles={styles} />
              <StatTile icon="lightning-bolt"  label="Stumpings" value={field.stumpings} color={COLORS.gold}   styles={styles} />
            </Section>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
};

// ── Styles ─────────────────────────────────────────────────
const getStyles = (COLORS) => StyleSheet.create({
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  pageHeader: { paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 10, paddingHorizontal: 20, paddingBottom: 8 },
  pageTitle:  { color: COLORS.white, fontSize: 22, fontWeight: '900' },
  pageSub:    { color: COLORS.gray, fontSize: 12, marginTop: 2 },

  scroll:     { paddingHorizontal: 16, paddingBottom: 40, gap: 14 },

  // Hero
  hero:           { backgroundColor: COLORS.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.cardBorder },
  heroAvatarRow:  { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  heroInfo:       { flex: 1, gap: 6 },
  heroName:       { color: COLORS.white, fontSize: 18, fontWeight: '900' },
  heroMeta:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  metaChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.darkGray, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  metaChipTxt:    { color: COLORS.gray, fontSize: 10, fontWeight: '600' },

  // Summary strip
  summaryStrip:   { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkGray, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8 },
  summaryChip:    { flex: 1, alignItems: 'center', gap: 2 },
  summaryVal:     { fontSize: 20, fontWeight: '900' },
  summaryLbl:     { color: COLORS.gray, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDiv:     { width: 1, height: 32, backgroundColor: COLORS.cardBorder },

  // Section card
  card:           { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden' },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  cardIconWrap:   { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle:      { fontWeight: '800', fontSize: 12, letterSpacing: 2 },
  grid:           { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },

  // Stat tile
  tile:           { flex: 1, minWidth: '29%', backgroundColor: COLORS.darkGray, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.cardBorder },
  tileWide:       { minWidth: '46%' },
  tileIconWrap:   { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tileVal:        { color: COLORS.white, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  tileLbl:        { color: COLORS.gray, fontSize: 9, fontWeight: '600', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 },

  // No player
  noPlayerWrap:   { alignItems: 'center', paddingVertical: 60, gap: 12 },
  noPlayerTitle:  { color: COLORS.white, fontSize: 18, fontWeight: '800' },
  noPlayerSub:    { color: COLORS.gray, fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
});

export default PlayerStatsScreen;
