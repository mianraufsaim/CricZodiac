// ============================================================
// CricZodiac — Player Dashboard
// Nav: [Z + name + Player | 🛡 Club]  ··· [☀ · logout]
// ============================================================

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../../context/ThemeContext';
import { BOWLING_STYLES } from '../../config/constants';
import { useAuth } from '../../context/AuthContext';
import { getPlayerStats, getPlayerByUserId } from '../../database/queries/playerQueries';

const StatRow = ({ label, value, highlight, styles, COLORS }) => (
  <View style={styles.statRow}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, highlight && { color: COLORS.gold }]}>{value ?? '—'}</Text>
  </View>
);

const PLAYER_TYPES_MAP = { batsman: 'Batsman', bowler: 'Bowler', allrounder: 'All-rounder' };

const PlayerDashboard = ({ navigation }) => {
  const { colors: COLORS, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const { user, activeClub, logout } = useAuth();
  const [stats,      setStats]      = useState(null);
  const [player,     setPlayer]     = useState(null);
  const [isOnline,   setIsOnline]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    load();
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected && state.isInternetReachable !== false);
    });
    return unsub;
  }, []);

  const load = async () => {
    const p = await getPlayerByUserId(user?.id);
    if (p) {
      setPlayer(p);
      const s = await getPlayerStats(p.id);
      setStats(s);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Nav Bar ── */}
      <View style={styles.navBar}>

        {/* LEFT: Z logo + name + [role | club badge on same line] */}
        <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={styles.navLogo}>
          <Text style={styles.navLogoText}>Z</Text>
        </LinearGradient>
        <View style={styles.navInfo}>
          <Text style={styles.navName} numberOfLines={1}>{player?.full_name || user?.name}</Text>
          <View style={styles.navRoleRow}>
            <Text style={styles.navRole}>
              {PLAYER_TYPES_MAP[player?.player_type] || 'Player'}
            </Text>
            {activeClub && (
              <View style={styles.clubBadge}>
                <Icon name="shield-star" size={10} color={COLORS.gold} />
                <Text style={styles.clubBadgeText} numberOfLines={1}>{activeClub.name}</Text>
              </View>
            )}
            {player?.jersey_number ? (
              <View style={styles.jerseyBadge}>
                <Text style={styles.jerseyNum}>#{player.jersey_number}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* CENTER: online / offline dot */}
        <View style={[styles.onlineDot, { backgroundColor: isOnline ? COLORS.success : COLORS.danger }]} />

        {/* RIGHT: theme toggle + logout */}
        <TouchableOpacity style={styles.navIconBtn} onPress={toggleTheme} activeOpacity={0.7}>
          <Icon
            name={isDark ? 'weather-sunny' : 'weather-night'}
            size={20}
            color={isDark ? COLORS.warning : COLORS.royalBlue}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navIconBtn} onPress={logout} activeOpacity={0.7}>
          <Icon name="logout" size={20} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />}>

        {/* Attribute chips */}
        {player && (
          <View style={styles.attrRow}>
            {player.profile_pic ? (
              <Image source={{ uri: player.profile_pic }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={styles.avatarText}>{(player?.full_name || user?.name)?.[0] || 'P'}</Text>
              </View>
            )}
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {player?.batting_hand ? (
                <View style={styles.attrChip}>
                  <Icon name={player.batting_hand === 'left' ? 'hand-left' : 'hand-right'} size={11} color={COLORS.gold} />
                  <Text style={styles.attrText}>{player.batting_hand === 'left' ? 'LHB' : 'RHB'}</Text>
                </View>
              ) : null}
              {player?.bowling_style && player.bowling_style !== 'none' ? (
                <View style={[styles.attrChip, { borderColor: COLORS.cyan + '44', backgroundColor: COLORS.cyan + '18' }]}>
                  <Icon name="arm-flex" size={11} color={COLORS.cyan} />
                  <Text style={[styles.attrText, { color: COLORS.cyan }]}>
                    {BOWLING_STYLES.find(s => s.id === player.bowling_style)?.label || player.bowling_style}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Batting */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="cricket" size={20} color={COLORS.gold} />
            <Text style={styles.cardTitle}>BATTING</Text>
          </View>
          <StatRow label="Matches"         value={stats?.batting?.total_matches}   styles={styles} COLORS={COLORS} />
          <StatRow label="Total Runs"      value={stats?.batting?.total_runs}      highlight styles={styles} COLORS={COLORS} />
          <StatRow label="Highest Score"   value={stats?.batting?.highest_score}   styles={styles} COLORS={COLORS} />
          <StatRow label="Batting Average" value={stats?.batting?.batting_average} styles={styles} COLORS={COLORS} />
          <StatRow label="Strike Rate"     value={stats?.batting?.strike_rate}     styles={styles} COLORS={COLORS} />
          <StatRow label="Fours"           value={stats?.batting?.total_fours}     styles={styles} COLORS={COLORS} />
          <StatRow label="Sixes"           value={stats?.batting?.total_sixes}     styles={styles} COLORS={COLORS} />
        </View>

        {/* Bowling */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="arm-flex" size={20} color={COLORS.cyan} />
            <Text style={[styles.cardTitle, { color: COLORS.cyan }]}>BOWLING</Text>
          </View>
          <StatRow label="Wickets"      value={stats?.bowling?.total_wickets}  highlight styles={styles} COLORS={COLORS} />
          <StatRow label="Overs Bowled" value={stats?.bowling?.total_overs}    styles={styles} COLORS={COLORS} />
          <StatRow label="Economy Rate" value={stats?.bowling?.economy_rate}   styles={styles} COLORS={COLORS} />
          <StatRow label="Best Bowling" value={stats?.bowling?.best_bowling}   styles={styles} COLORS={COLORS} />
          <StatRow label="Maidens"      value={stats?.bowling?.total_maidens}  styles={styles} COLORS={COLORS} />
        </View>

        {/* Fielding */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="hand-clap" size={20} color={COLORS.purple} />
            <Text style={[styles.cardTitle, { color: COLORS.purple }]}>FIELDING</Text>
          </View>
          <StatRow label="Catches"   value={stats?.fielding?.catches}   styles={styles} COLORS={COLORS} />
          <StatRow label="Run Outs"  value={stats?.fielding?.run_outs}  styles={styles} COLORS={COLORS} />
          <StatRow label="Stumpings" value={stats?.fielding?.stumpings} styles={styles} COLORS={COLORS} />
        </View>

        <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('History')}>
          <Icon name="history" size={20} color={COLORS.cyan} />
          <Text style={styles.historyBtnText}>View Match History</Text>
          <Icon name="chevron-right" size={20} color={COLORS.gray} />
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  navBar:        { flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingHorizontal: 14, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder, gap: 10 },
  navLogo:       { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  navLogoText:   { fontSize: 18, fontWeight: '900', color: '#fff', fontStyle: 'italic' },
  navInfo:       { flexShrink: 1 },
  navName:       { fontSize: 15, fontWeight: '800', color: COLORS.white },
  navRoleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  navRole:       { fontSize: 11, fontWeight: '600', color: COLORS.gold, letterSpacing: 0.5 },
  clubBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.gold + '1A', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.gold + '44' },
  clubBadgeText: { color: COLORS.gold, fontSize: 10, fontWeight: '700', maxWidth: 90 },
  jerseyBadge:   { backgroundColor: COLORS.purple + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.purple + '55' },
  jerseyNum:     { color: COLORS.purple, fontSize: 10, fontWeight: '800' },
  onlineDot:     { width: 10, height: 10, borderRadius: 5, marginHorizontal: 8 },
  navIconBtn:    { padding: 8 },

  attrRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  avatar:        { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: COLORS.gold },
  avatarText:    { color: COLORS.white, fontSize: 20, fontWeight: '900' },
  attrChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.gold + '18', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.gold + '44' },
  attrText:      { color: COLORS.gold, fontSize: 11, fontWeight: '700' },

  card:          { backgroundColor: COLORS.card, borderRadius: 16, marginHorizontal: 16, marginTop: 12, padding: 16, borderWidth: 1, borderColor: COLORS.cardBorder },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle:     { color: COLORS.gold, fontWeight: '700', fontSize: 13, letterSpacing: 2 },
  statRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  statLabel:     { color: COLORS.gray, fontSize: 14 },
  statValue:     { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  historyBtn:    { marginHorizontal: 16, marginTop: 12, backgroundColor: COLORS.card, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  historyBtnText:{ flex: 1, color: COLORS.white, fontWeight: '600', fontSize: 15 },
});

export default PlayerDashboard;
