// ============================================================
// CricZodiac — Admin Dashboard
// Nav: [Z + name + Club Admin | 🛡 Club]  ··· [sync · ☀ · logout]
// ============================================================

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { getAllMatches } from '../../database/queries/matchQueries';
import { getAllPlayers } from '../../database/queries/playerQueries';
import { getAllUsers } from '../../database/queries/userQueries';
import { manualRetrySync } from '../../services/SyncService';

const StatCard = ({ icon, value, label, color, COLORS, styles }) => (
  <View style={styles.statCard}>
    <Icon name={icon} size={24} color={color || COLORS.gold} />
    <Text style={styles.statValue}>{value ?? 0}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const QuickAction = ({ icon, label, color, onPress, styles }) => (
  <TouchableOpacity style={styles.qa} onPress={onPress} activeOpacity={0.75}>
    <View style={[styles.qaIcon, { backgroundColor: color + '22' }]}>
      <Icon name={icon} size={22} color={color} />
    </View>
    <Text style={styles.qaLabel}>{label}</Text>
  </TouchableOpacity>
);

const AdminDashboard = ({ navigation }) => {
  const { colors: COLORS, isDark, toggleTheme } = useTheme();
  const { user, activeClub, viewingAsClub, exitClubView, logout } = useAuth();
  const effectiveClub    = viewingAsClub ?? activeClub;
  const isSuperAdminView = !!viewingAsClub;
  const { syncStatus, syncStats } = useSync();
  const [counts, setCounts] = useState({ matches: 0, players: 0, users: 0, live: 0 });
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const loadCounts = async () => {
    const [matches, players, users] = await Promise.all([
      getAllMatches(), getAllPlayers(), getAllUsers(),
    ]);
    setCounts({
      matches: matches.length,
      players: players.length,
      users:   users.filter(u => u.status !== 'inactive').length,
      live:    matches.filter(m => m.status === 'live').length,
    });
  };

  useFocusEffect(useCallback(() => { loadCounts(); }, []));

  const syncColor =
    syncStatus === 'synced'  ? COLORS.success :
    syncStatus === 'pending' ? COLORS.warning  : COLORS.danger;

  const handleRetrySync = () => Alert.alert('Retry Sync', 'Retry all failed sync items?', [
    { text: 'Cancel' },
    { text: 'Retry', onPress: async () => { await manualRetrySync(); Alert.alert('Done', 'Sync retry started.'); } },
  ]);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* Super Admin "viewing as club" banner */}
      {isSuperAdminView && (
        <TouchableOpacity style={styles.superAdminBanner} onPress={exitClubView} activeOpacity={0.85}>
          <Icon name="shield-account" size={16} color={COLORS.navy} />
          <Text style={styles.superAdminBannerText}>
            Viewing as: <Text style={{ fontWeight: '900' }}>{effectiveClub?.name}</Text>
          </Text>
          <View style={styles.exitChip}>
            <Icon name="arrow-left" size={12} color={COLORS.navy} />
            <Text style={styles.exitChipText}>EXIT</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Nav Bar ── */}
      <View style={[styles.navBar, isSuperAdminView && { paddingTop: 12 }]}>

        {/* LEFT: Z logo + name + [role | club badge on same line] */}
        <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={styles.navLogo}>
          <Text style={styles.navLogoText}>Z</Text>
        </LinearGradient>
        <TouchableOpacity
          style={styles.navInfo}
          onPress={isSuperAdminView ? undefined : () => navigation.navigate('EditProfile')}
          activeOpacity={isSuperAdminView ? 1 : 0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.navName} numberOfLines={1}>{user?.name}</Text>
            {!isSuperAdminView && (
              <Icon name="pencil-outline" size={11} color={COLORS.gray} style={{ marginTop: 1 }} />
            )}
          </View>
          <View style={styles.navRoleRow}>
            <Text style={styles.navRole}>
              {isSuperAdminView ? 'Viewing as Admin' : 'Club Admin'}
            </Text>
            {effectiveClub && (
              <TouchableOpacity
                style={styles.clubBadge}
                onPress={isSuperAdminView ? undefined : () => navigation.navigate('EditClub')}
                activeOpacity={isSuperAdminView ? 1 : 0.75}
              >
                <Icon name="shield-star" size={10} color={COLORS.gold} />
                <Text style={styles.clubBadgeText} numberOfLines={1}>{effectiveClub.name}</Text>
                {!isSuperAdminView && (
                  <Icon name="pencil-outline" size={9} color={COLORS.gold} />
                )}
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* RIGHT: sync chip + theme toggle + logout/exit */}
        <TouchableOpacity
          style={styles.syncChip}
          onPress={() => navigation.navigate('SyncStatus')}
          activeOpacity={0.7}
        >
          <View style={[styles.syncDot, { backgroundColor: syncColor }]} />
          {syncStats.pending > 0 && (
            <Text style={[styles.syncCount, { color: syncColor }]}>{syncStats.pending}</Text>
          )}
          {syncStats.failed > 0 && (
            <Icon name="refresh-circle" size={15} color={COLORS.danger} style={{ marginLeft: 2 }} />
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.navIconBtn} onPress={toggleTheme} activeOpacity={0.7}>
          <Icon
            name={isDark ? 'weather-sunny' : 'weather-night'}
            size={20}
            color={isDark ? COLORS.warning : COLORS.royalBlue}
          />
        </TouchableOpacity>

        {isSuperAdminView ? (
          <TouchableOpacity onPress={exitClubView} style={styles.navIconBtn}>
            <Icon name="arrow-left-circle" size={22} color={COLORS.gold} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={logout} style={styles.navIconBtn}>
            <Icon name="logout" size={20} color={COLORS.danger} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.statsGrid}>
          <StatCard icon="cricket"       value={counts.matches}  label="Matches"  color={COLORS.cyan}    COLORS={COLORS} styles={styles} />
          <StatCard icon="account"       value={counts.players}  label="Players"  color={COLORS.gold}    COLORS={COLORS} styles={styles} />
          <StatCard icon="account-group" value={counts.users}    label="Users"    color={COLORS.purple}  COLORS={COLORS} styles={styles} />
          <StatCard icon="play-circle"   value={counts.live}     label="Live Now" color={COLORS.success} COLORS={COLORS} styles={styles} />
        </View>

        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        <View style={styles.qaGrid}>
          <QuickAction icon="trophy-outline" label="New Series"   color={COLORS.cyan}
            onPress={() => navigation.navigate('Series')} styles={styles} />
          <QuickAction icon="account-group"  label="Manage Users" color={COLORS.purple}
            onPress={() => navigation.navigate('Users')} styles={styles} />
          <QuickAction icon="history"        label="All Matches"  color={COLORS.success}
            onPress={() => navigation.navigate('AllMatches')} styles={styles} />
          <QuickAction icon="podium"         label="Leaderboard"  color={COLORS.royalBlue}
            onPress={() => navigation.navigate('Stats')} styles={styles} />
          <QuickAction icon="cricket"        label="Quick Match"  color={COLORS.orange}
            onPress={() => navigation.navigate('MatchSetup', {})} styles={styles} />
        </View>

        {(syncStats.pending > 0 || syncStats.failed > 0) && (
          <TouchableOpacity style={styles.syncBanner} onPress={() => navigation.navigate('SyncStatus')}>
            <Icon name="cloud-sync" size={20} color={syncColor} />
            <Text style={[styles.syncBannerText, { color: syncColor }]}>
              {syncStats.pending} pending · {syncStats.failed} failed
            </Text>
            {syncStats.failed > 0 && (
              <TouchableOpacity onPress={handleRetrySync} style={styles.retryBtn}>
                <Text style={styles.retryTxt}>RETRY</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  superAdminBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.gold, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10 },
  superAdminBannerText: { flex: 1, color: COLORS.navy, fontSize: 13, fontWeight: '600' },
  exitChip:             { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.navy + '33', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  exitChipText:         { color: COLORS.navy, fontWeight: '800', fontSize: 11 },

  // Nav bar
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

  // Stats
  statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 10 },
  statCard:      { flex: 1, minWidth: '44%', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.cardBorder },
  statValue:     { color: COLORS.white, fontSize: 26, fontWeight: '900' },
  statLabel:     { color: COLORS.gray, fontSize: 11 },

  // Quick actions
  sectionTitle:  { color: COLORS.gold, fontSize: 11, fontWeight: '700', letterSpacing: 3, paddingHorizontal: 18, marginBottom: 10 },
  qaGrid:        { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10, marginBottom: 16 },
  qa:            { width: '30.5%', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, alignItems: 'center', gap: 7, borderWidth: 1, borderColor: COLORS.cardBorder },
  qaIcon:        { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  qaLabel:       { color: COLORS.lightGray, fontSize: 11, fontWeight: '600', textAlign: 'center' },

  // Sync banner
  syncBanner:    { marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  syncBannerText:{ flex: 1, fontSize: 13, fontWeight: '600' },
  retryBtn:      { backgroundColor: COLORS.danger + '33', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  retryTxt:      { color: COLORS.danger, fontWeight: '800', fontSize: 11 },
});

export default AdminDashboard;
