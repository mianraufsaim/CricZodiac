// ============================================================
// CricZodiac — Player Dashboard (Home)
// List-row style stats, fetched live from API.
// ============================================================

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, RefreshControl, ActivityIndicator, Platform, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

// ── Stat Row ──────────────────────────────────────────────
const StatRow = ({ icon, label, value, valueColor, isLast, COLORS, styles }) => (
  <View style={[styles.statRow, !isLast && styles.statRowBorder]}>
    <View style={styles.statLeft}>
      <Icon name={icon} size={15} color={valueColor || COLORS.gray} style={{ opacity: 0.8 }} />
      <Text style={styles.statLabel}>{label}</Text>
    </View>
    <Text style={[styles.statValue, valueColor && { color: valueColor }]}>{value ?? '—'}</Text>
  </View>
);

// ── Card ──────────────────────────────────────────────────
const Card = ({ icon, title, color, children, styles }) => (
  <View style={styles.card}>
    <View style={[styles.cardHeader, { borderLeftColor: color }]}>
      <View style={[styles.cardIconWrap, { backgroundColor: color + '20' }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.cardTitle, { color }]}>{title}</Text>
    </View>
    <View style={styles.cardBody}>{children}</View>
  </View>
);

const TYPE_LABEL = { batsman: 'Batsman', bowler: 'Bowler', allrounder: 'All-rounder', wicketkeeper: 'Keeper' };

// ── Main ──────────────────────────────────────────────────
const PlayerDashboard = ({ navigation }) => {
  const { colors: COLORS, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const { user, activeClub, logout } = useAuth();

  const [data,       setData]       = useState(null);
  const [isOnline,   setIsOnline]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(s => {
      setIsOnline(s.isConnected && s.isInternetReachable !== false);
    });
    return unsub;
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await ApiService.get(API_ENDPOINTS.PLAYERS_MY_STATS);
      if (res?.success) setData(res);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const profile = data?.profile;
  const bat     = data?.batting  || {};
  const bowl    = data?.bowling  || {};
  const field   = data?.fielding || {};

  const displayName = profile?.full_name || user?.name || 'Player';

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Nav Bar ── */}
      <View style={styles.navBar}>
        <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={styles.navLogo}>
          <Text style={styles.navLogoTxt}>Z</Text>
        </LinearGradient>
        <View style={styles.navInfo}>
          <Text style={styles.navName} numberOfLines={1}>{displayName}</Text>
          <View style={styles.navSubRow}>
            <Text style={styles.navRole}>{TYPE_LABEL[profile?.player_type] || 'Player'}</Text>
            {activeClub && (
              <View style={styles.clubBadge}>
                <Icon name="shield-star" size={9} color={COLORS.gold} />
                <Text style={styles.clubBadgeTxt} numberOfLines={1}>{activeClub.name}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <View style={[styles.onlineDot, { backgroundColor: isOnline ? COLORS.success : COLORS.danger }]} />
        <TouchableOpacity style={styles.navBtn} onPress={toggleTheme}>
          <Icon name={isDark ? 'weather-sunny' : 'weather-night'} size={19} color={isDark ? COLORS.warning : COLORS.royalBlue} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={logout}>
          <Icon name="logout" size={19} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.gold} /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />
          }
        >
          {/* ── 4 key summary chips ── */}
          <View style={styles.summaryRow}>
            {[
              { label: 'Matches',  value: bat.total_matches,   color: COLORS.white  },
              { label: 'Runs',     value: bat.total_runs,      color: COLORS.gold   },
              { label: 'Wickets',  value: bowl.total_wickets,  color: COLORS.cyan   },
              { label: 'Avg',      value: bat.batting_average, color: COLORS.orange },
            ].map((c, i, arr) => (
              <React.Fragment key={c.label}>
                <View style={styles.summaryChip}>
                  <Text style={[styles.summaryVal, { color: c.color }]}>{c.value ?? '—'}</Text>
                  <Text style={styles.summaryLbl}>{c.label}</Text>
                </View>
                {i < arr.length - 1 && <View style={styles.summaryDiv} />}
              </React.Fragment>
            ))}
          </View>

          {/* ── No player state ── */}
          {data && !data.has_player && (
            <View style={styles.noPlayerCard}>
              <Icon name="account-off-outline" size={38} color={COLORS.gray} />
              <Text style={styles.noPlayerTxt}>No player profile linked to your account.</Text>
              <Text style={styles.noPlayerSub}>Contact your admin to set one up.</Text>
            </View>
          )}

          {data?.has_player && (
            <>
              {/* ── BATTING ── */}
              <Card icon="cricket" title="BATTING" color={COLORS.gold} styles={styles}>
                <StatRow icon="calendar-check"       label="Matches"         value={bat.total_matches}    valueColor={COLORS.white}  isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="counter"              label="Total Runs"      value={bat.total_runs}       valueColor={COLORS.gold}   isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="trophy-outline"       label="Highest Score"   value={bat.highest_score}    valueColor={COLORS.gold}   isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="chart-line"           label="Batting Average" value={bat.batting_average}  valueColor={COLORS.gold}   isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="speedometer"          label="Strike Rate"     value={bat.strike_rate}      valueColor={COLORS.white}  isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="target"               label="Balls Faced"     value={bat.total_balls}      valueColor={COLORS.white}  isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="numeric-4-circle"     label="Fours"           value={bat.total_fours}      valueColor={COLORS.royalBlue} isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="numeric-6-circle"     label="Sixes"           value={bat.total_sixes}      valueColor={COLORS.purple} isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="medal-outline"        label="Half Centuries"  value={bat.fifties}          valueColor={COLORS.cyan}   isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="medal"                label="Centuries"       value={bat.hundreds}         valueColor={COLORS.gold}   isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="check-circle-outline" label="Not Outs"        value={bat.not_outs}         valueColor={COLORS.success} isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="emoticon-sad-outline" label="Ducks"           value={bat.ducks}            valueColor={COLORS.danger} isLast={true}  COLORS={COLORS} styles={styles} />
              </Card>

              {/* ── BOWLING ── */}
              <Card icon="bullseye-arrow" title="BOWLING" color={COLORS.cyan} styles={styles}>
                <StatRow icon="target"        label="Wickets"        value={bowl.total_wickets}       valueColor={COLORS.cyan}   isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="clock-outline" label="Overs Bowled"   value={bowl.total_overs}         valueColor={COLORS.white}  isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="speedometer"   label="Economy Rate"   value={bowl.economy_rate}        valueColor={COLORS.cyan}   isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="star-shooting" label="Best Bowling"   value={bowl.best_bowling}        valueColor={COLORS.gold}   isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="arrow-up-bold" label="Runs Conceded"  value={bowl.total_runs_conceded} valueColor={COLORS.orange} isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="shield-star"   label="Maidens"        value={bowl.total_maidens}       valueColor={COLORS.success} isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="cricket"       label="Innings Bowled" value={bowl.bowling_innings}     valueColor={COLORS.white}  isLast={true}  COLORS={COLORS} styles={styles} />
              </Card>

              {/* ── FIELDING ── */}
              <Card icon="hand-back-right" title="FIELDING" color={COLORS.purple} styles={styles}>
                <StatRow icon="hand-back-left" label="Catches"   value={field.catches}   valueColor={COLORS.purple} isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="run-fast"       label="Run Outs"  value={field.run_outs}  valueColor={COLORS.orange} isLast={false} COLORS={COLORS} styles={styles} />
                <StatRow icon="lightning-bolt" label="Stumpings" value={field.stumpings} valueColor={COLORS.gold}   isLast={true}  COLORS={COLORS} styles={styles} />
              </Card>
            </>
          )}

          {/* ── History button ── */}
          <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('History')} activeOpacity={0.8}>
            <View style={[styles.historyIconWrap, { backgroundColor: COLORS.cyan + '22' }]}>
              <Icon name="history" size={18} color={COLORS.cyan} />
            </View>
            <Text style={styles.historyTxt}>View Match History</Text>
            <Icon name="chevron-right" size={18} color={COLORS.gray} />
          </TouchableOpacity>
        </ScrollView>
      )}
    </LinearGradient>
  );
};

// ── Styles ─────────────────────────────────────────────────
const getStyles = (COLORS) => StyleSheet.create({
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Nav
  navBar:       { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight || 24) + 8, paddingHorizontal: 14, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder, gap: 10 },
  navLogo:      { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  navLogoTxt:   { fontSize: 18, fontWeight: '900', color: '#fff', fontStyle: 'italic' },
  navInfo:      { flexShrink: 1 },
  navName:      { fontSize: 15, fontWeight: '800', color: COLORS.white },
  navSubRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  navRole:      { fontSize: 11, fontWeight: '600', color: COLORS.gold, letterSpacing: 0.5 },
  clubBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.gold + '1A', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.gold + '44' },
  clubBadgeTxt: { color: COLORS.gold, fontSize: 10, fontWeight: '700', maxWidth: 90 },
  jerseyBadge:  { backgroundColor: COLORS.purple + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.purple + '55' },
  jerseyTxt:    { color: COLORS.purple, fontSize: 10, fontWeight: '800' },
  onlineDot:    { width: 9, height: 9, borderRadius: 5, marginRight: 4 },
  navBtn:       { padding: 8 },

  scroll:       { paddingHorizontal: 14, paddingBottom: 36, gap: 12, paddingTop: 14 },

  // Hero
  hero:           { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: COLORS.cardBorder },
  avatar:         { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: COLORS.gold },
  avatarFallback: { backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center' },
  avatarInitial:  { color: '#fff', fontSize: 24, fontWeight: '900' },
  heroRight:      { flex: 1, gap: 6 },
  heroName:       { color: COLORS.white, fontSize: 16, fontWeight: '800' },
  heroMeta:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.darkGray, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  metaTxt:        { color: COLORS.gray, fontSize: 10, fontWeight: '600' },

  // Summary strip
  summaryRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  summaryChip:   { flex: 1, alignItems: 'center', gap: 2 },
  summaryVal:    { fontSize: 20, fontWeight: '900' },
  summaryLbl:    { color: COLORS.gray, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryDiv:    { width: 1, height: 28, backgroundColor: COLORS.cardBorder },

  // Card
  card:         { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden' },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  cardIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { fontWeight: '800', fontSize: 11, letterSpacing: 2 },
  cardBody:     { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8 },

  // Stat row
  statRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11 },
  statRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder + '88' },
  statLeft:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statLabel:     { color: COLORS.gray, fontSize: 13 },
  statValue:     { color: COLORS.white, fontSize: 14, fontWeight: '700' },

  // No player
  noPlayerCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  noPlayerTxt:  { color: COLORS.white, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  noPlayerSub:  { color: COLORS.gray, fontSize: 12, textAlign: 'center' },

  // History button
  historyBtn:      { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  historyIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyTxt:      { flex: 1, color: COLORS.white, fontWeight: '600', fontSize: 14 },
});

export default PlayerDashboard;
