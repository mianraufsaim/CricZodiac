// ============================================================
// CricZodiac — Umpire Dashboard
// Nav: [Z + name + Umpire | 🛡 Club]  ··· [sync · ☀ · logout]
// ============================================================

import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';

const QuickBtn = ({ icon, label, color, onPress, wide, COLORS, styles }) => (
  <TouchableOpacity
    style={[styles.quickBtn, wide && styles.quickBtnWide]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <View style={[styles.quickIcon, { backgroundColor: color + '22' }]}>
      <Icon name={icon} size={24} color={color} />
    </View>
    <Text style={styles.quickLabel}>{label}</Text>
  </TouchableOpacity>
);

const UmpireDashboard = ({ navigation }) => {
  const { colors: COLORS, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const { user, activeClub, logout } = useAuth();
  const { syncStatus, syncStats }    = useSync();
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {};

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const syncColor =
    syncStatus === 'synced'  ? COLORS.success :
    syncStatus === 'pending' ? COLORS.warning : COLORS.danger;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Nav Bar ── */}
      <View style={styles.navBar}>

        {/* LEFT: Z logo + name + [role | club badge on same line] */}
        <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={styles.navLogo}>
          <Text style={styles.navLogoText}>Z</Text>
        </LinearGradient>
        <View style={styles.navInfo}>
          <Text style={styles.navName} numberOfLines={1}>{user?.name}</Text>
          <View style={styles.navRoleRow}>
            <Text style={styles.navRole}>Umpire</Text>
            {activeClub && (
              <View style={styles.clubBadge}>
                <Icon name="shield-star" size={10} color={COLORS.gold} />
                <Text style={styles.clubBadgeText} numberOfLines={1}>{activeClub.name}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* RIGHT: sync chip + theme toggle + logout */}
        <TouchableOpacity
          style={styles.syncChip}
          onPress={() => navigation.navigate('SyncStatus')}
          activeOpacity={0.7}
        >
          <View style={[styles.syncDot, { backgroundColor: syncColor }]} />
          {syncStats.pending > 0 && (
            <Text style={[styles.syncCount, { color: syncColor }]}>{syncStats.pending}</Text>
          )}
        </TouchableOpacity>

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

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />}>
        <TouchableOpacity style={styles.mainAction} onPress={() => navigation.navigate('MatchSetup')}>
          <LinearGradient colors={[COLORS.royalBlue, COLORS.purple]} style={styles.mainGrad}>
            <Icon name="cricket" size={40} color={COLORS.gold} />
            <Text style={styles.mainTitle}>START NEW MATCH</Text>
            <Text style={styles.mainSub}>Setup → Teams → Toss → Score</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.grid}>
          <QuickBtn icon="radar" label="AI Ball Lab" color={COLORS.warning}
            onPress={() => navigation.navigate('BallTrackingLab')} COLORS={COLORS} styles={styles} />
          <QuickBtn icon="trophy-outline" label="Series"     color={COLORS.gold}
            onPress={() => navigation.navigate('SeriesList')} COLORS={COLORS} styles={styles} />
          <QuickBtn icon="account-plus"  label="Add Player"  color={COLORS.cyan}
            onPress={() => navigation.navigate('CreateUser', { defaultRole: 'player', lockRole: true })} COLORS={COLORS} styles={styles} />
          <QuickBtn icon="account-group" label="All Players" color={COLORS.purple}
            onPress={() => navigation.navigate('ManagePlayers')} COLORS={COLORS} styles={styles} />
          <QuickBtn icon="podium"        label="Leaderboard" color={COLORS.success}
            onPress={() => navigation.navigate('Leaderboard')} COLORS={COLORS} styles={styles} />
          <QuickBtn icon="trophy"        label="Rankings"    color={COLORS.gold}
            onPress={() => navigation.navigate('Rankings')} COLORS={COLORS} styles={styles} />
        </View>

        <View style={styles.syncCard}>
          <Icon name={syncStatus === 'synced' ? 'cloud-check' : 'cloud-sync'} size={24} color={syncColor} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.syncCardTitle}>Sync Status</Text>
            <Text style={[styles.syncCardStatus, { color: syncColor }]}>{syncStatus?.toUpperCase()}</Text>
          </View>
          <Text style={styles.syncCardCount}>{syncStats.pending} pending</Text>
        </View>
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
  syncChip:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkGray, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.cardBorder, gap: 4 },
  syncDot:       { width: 8, height: 8, borderRadius: 4 },
  syncCount:     { fontSize: 12, fontWeight: '700' },
  navIconBtn:    { padding: 8 },

  content:       { padding: 20, paddingBottom: 40 },
  mainAction:    { borderRadius: 20, overflow: 'hidden', marginBottom: 24 },
  mainGrad:      { padding: 32, alignItems: 'center', gap: 8 },
  mainTitle:     { color: COLORS.white, fontSize: 22, fontWeight: '900', letterSpacing: 3 },
  mainSub:       { color: COLORS.lightGray, fontSize: 13 },
  sectionLabel:  { color: COLORS.gold, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginBottom: 12 },
  grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  quickBtn:      { width: '47%', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  quickBtnWide:  { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 12 },
  quickIcon:     { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  quickLabel:    { color: COLORS.lightGray, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  syncCard:      { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  syncCardTitle: { color: COLORS.gray, fontSize: 12 },
  syncCardStatus:{ fontWeight: '700', fontSize: 14 },
  syncCardCount: { color: COLORS.gray, fontSize: 13 },
});

export default UmpireDashboard;
