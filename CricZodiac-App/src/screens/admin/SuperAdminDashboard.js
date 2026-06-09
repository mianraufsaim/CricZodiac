// ============================================================
// CricZodiac — Super Admin Dashboard
// Stats overview: Clubs (4 cards) + Admins (4 cards)
// Each card taps to a filtered list screen
// ============================================================

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, Modal, ScrollView, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { API_ENDPOINTS } from '../../config/api';
import ApiService from '../../services/ApiService';
import { showAlert } from '../../utils/toast';

const SuperAdminDashboard = ({ navigation }) => {
  const { colors: COLORS, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const { user, logout, enterClubView } = useAuth();

  const [clubs, setClubs]           = useState([]);
  const [dropdownOpen, setDropdown] = useState(false);
  const [pendingCount, setPending]  = useState(0);
  const [stats, setStats]           = useState({ total: 0, active: 0, suspended: 0, pending: 0 });
  const [adminStats, setAdminStats] = useState({ total: 0, active: 0, blocked: 0, pending: 0 });
  const [isOnline, setIsOnline]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected && state.isInternetReachable !== false);
    });
    return unsub;
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const loadData = async () => {
    try {
      const [clubsRes, pendingRes] = await Promise.allSettled([
        ApiService.get(API_ENDPOINTS.SUPER_ADMIN_CLUBS),
        ApiService.get(API_ENDPOINTS.PENDING_APPROVALS),
      ]);
      if (clubsRes.status === 'fulfilled') {
        const val = clubsRes.value;
        setClubs(val.clubs ?? []);
        setStats({
          total:     val.total_count     ?? 0,
          active:    val.active_count    ?? 0,
          suspended: val.suspended_count ?? 0,
          pending:   val.pending_count   ?? 0,
        });
        setAdminStats({
          total:   val.admin_total   ?? 0,
          active:  val.admin_active  ?? 0,
          blocked: val.admin_blocked ?? 0,
          pending: val.admin_pending ?? 0,
        });
      }
      if (pendingRes.status === 'fulfilled') {
        setPending(pendingRes.value.count ?? pendingRes.value.data?.count ?? 0);
      }
    } catch (e) {
      showAlert('Error', e.message);
    }
  };

  const handleLogout = () =>
    showAlert('Logout', 'Sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);

  const handleEnterClub = (club) => {
    setDropdown(false);
    showAlert(
      `Enter ${club.name}`,
      'You will view this club as its admin. Tap "Exit Club" in the header to return.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Enter Club', onPress: () => enterClubView(club) },
      ]
    );
  };

  // ── Helpers ───────────────────────────────────────────────
  const goClubs  = (filter, title) => navigation.navigate('SuperAdminClubList',  { filter, title });
  const goAdmins = (filter, title) => navigation.navigate('SuperAdminAdminList', { filter, title });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  // ── Dropdown overlay ──────────────────────────────────────
  const ClubDropdown = () => (
    <Modal
      visible={dropdownOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setDropdown(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setDropdown(false)}
      >
        <View style={styles.dropdown}>
          <Text style={styles.dropdownTitle}>ENTER CLUB AS ADMIN</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {clubs.length === 0 ? (
              <Text style={styles.dropdownEmpty}>No clubs registered yet</Text>
            ) : clubs.map(club => (
              <TouchableOpacity
                key={String(club.id)}
                style={styles.dropdownItem}
                onPress={() => handleEnterClub(club)}
                activeOpacity={0.7}
              >
                <View style={styles.dropdownItemLeft}>
                  <Icon name="shield-star" size={16} color={COLORS.gold} />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.dropdownClubName}>{club.name}</Text>
                    {(club.city || club.country) ? (
                      <Text style={styles.dropdownClubMeta}>
                        {[club.city, club.country].filter(Boolean).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={[
                  styles.statusPill,
                  { backgroundColor: club.status === 'active' ? COLORS.success + '22' : COLORS.danger + '22' }
                ]}>
                  <Text style={[
                    styles.statusPillText,
                    { color: club.status === 'active' ? COLORS.success : COLORS.danger }
                  ]}>
                    {club.status?.toUpperCase()}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <LinearGradient
      colors={[COLORS.gradientStart ?? COLORS.background, COLORS.gradientEnd ?? COLORS.navy]}
      style={{ flex: 1 }}
    >
      {/* ── Top Nav Bar ───────────────────────────────────── */}
      <View style={styles.navBar}>
        <View style={styles.navLeft}>
          <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={styles.navLogo}>
            <Text style={styles.navLogoText}>Z</Text>
          </LinearGradient>
          <View>
            <Text style={styles.navOrg} numberOfLines={1}>{user?.name}</Text>
            <Text style={styles.navRole}>Super Admin</Text>
          </View>
        </View>

        {/* Online / offline dot */}
        <View style={[styles.onlineDot, { backgroundColor: isOnline ? COLORS.success : COLORS.danger }]} />

        <View style={styles.navRight}>
          <TouchableOpacity style={styles.navClubBtn} onPress={() => setDropdown(true)} activeOpacity={0.8}>
            <Icon name="shield-star-outline" size={14} color={COLORS.gold} />
            <Text style={styles.navClubBtnText}>Enter Club</Text>
            <Icon name="chevron-down" size={14} color={COLORS.gold} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navIconBtn} onPress={toggleTheme} activeOpacity={0.7}>
            <Icon name={isDark ? 'weather-sunny' : 'weather-night'} size={20}
              color={isDark ? COLORS.warning : COLORS.royalBlue} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navIconBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Icon name="logout" size={20} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />}>

        {/* ── Stats Overview ──────────────────────────────── */}
        <View style={styles.overviewContainer}>

          {/* CLUBS section */}
          <View style={styles.sectionHeader}>
            <Icon name="shield-star" size={13} color={COLORS.gold} />
            <Text style={styles.sectionHeaderText}>CLUBS</Text>
            <View style={styles.sectionDivider} />
          </View>
          <View style={styles.statsRow}>

            <TouchableOpacity style={styles.statCard} onPress={() => goClubs('all', 'All Clubs')} activeOpacity={0.75}>
              <Icon name="domain" size={15} color={COLORS.white} />
              <Text style={styles.statNum}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
              <Icon name="chevron-right" size={11} color={COLORS.gray} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.statCard} onPress={() => goClubs('active', 'Active Clubs')} activeOpacity={0.75}>
              <Icon name="check-circle-outline" size={15} color={COLORS.success} />
              <Text style={[styles.statNum, { color: COLORS.success }]}>{stats.active}</Text>
              <Text style={styles.statLabel}>Active</Text>
              <Icon name="chevron-right" size={11} color={COLORS.gray} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.statCard} onPress={() => goClubs('suspended', 'Suspended Clubs')} activeOpacity={0.75}>
              <Icon name="cancel" size={15} color={COLORS.danger} />
              <Text style={[styles.statNum, { color: COLORS.danger }]}>{stats.suspended}</Text>
              <Text style={styles.statLabel}>Suspended</Text>
              <Icon name="chevron-right" size={11} color={COLORS.gray} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.statCard, stats.pending > 0 && { borderColor: COLORS.warning + '60' }]}
              onPress={() => goClubs('pending', 'Pending Clubs')} activeOpacity={0.75}>
              <Icon name="clock-alert-outline" size={15} color={COLORS.warning} />
              <Text style={[styles.statNum, { color: COLORS.warning }]}>{stats.pending}</Text>
              <Text style={[styles.statLabel, { color: COLORS.warning }]}>Pending</Text>
              <Icon name="chevron-right" size={11} color={COLORS.gray} />
            </TouchableOpacity>

          </View>

          {/* CLUB ADMINS section */}
          <View style={[styles.sectionHeader, { marginTop: 14 }]}>
            <Icon name="account-tie" size={13} color={COLORS.cyan} />
            <Text style={[styles.sectionHeaderText, { color: COLORS.cyan }]}>CLUB ADMINS</Text>
            <View style={[styles.sectionDivider, { backgroundColor: COLORS.cyan + '40' }]} />
          </View>
          <View style={styles.statsRow}>

            <TouchableOpacity style={styles.statCard} onPress={() => goAdmins('all', 'All Admins')} activeOpacity={0.75}>
              <Icon name="account-group" size={15} color={COLORS.white} />
              <Text style={styles.statNum}>{adminStats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
              <Icon name="chevron-right" size={11} color={COLORS.gray} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.statCard} onPress={() => goAdmins('active', 'Active Admins')} activeOpacity={0.75}>
              <Icon name="account-check" size={15} color={COLORS.success} />
              <Text style={[styles.statNum, { color: COLORS.success }]}>{adminStats.active}</Text>
              <Text style={styles.statLabel}>Active</Text>
              <Icon name="chevron-right" size={11} color={COLORS.gray} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.statCard} onPress={() => goAdmins('blocked', 'Blocked Admins')} activeOpacity={0.75}>
              <Icon name="account-cancel" size={15} color={COLORS.danger} />
              <Text style={[styles.statNum, { color: COLORS.danger }]}>{adminStats.blocked}</Text>
              <Text style={styles.statLabel}>Blocked</Text>
              <Icon name="chevron-right" size={11} color={COLORS.gray} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, adminStats.pending > 0 && { borderColor: COLORS.gold + '70' }]}
              onPress={() => goAdmins('pending', 'Pending Approval')}
              activeOpacity={0.75}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Icon name="account-clock" size={15} color={adminStats.pending > 0 ? COLORS.gold : COLORS.gray} />
                {adminStats.pending > 0 && <View style={styles.pendingDot} />}
              </View>
              <Text style={[styles.statNum, adminStats.pending > 0 && { color: COLORS.gold }]}>{adminStats.pending}</Text>
              <Text style={[styles.statLabel, adminStats.pending > 0 && { color: COLORS.gold }]}>Approvals</Text>
              <Icon name="chevron-right" size={11} color={COLORS.gray} />
            </TouchableOpacity>

          </View>
        </View>

        {/* ── Pending Banner ────────────────────────────────── */}
        {pendingCount > 0 && (
          <TouchableOpacity
            style={styles.pendingBanner}
            onPress={() => navigation.navigate('PendingApprovals')}
            activeOpacity={0.85}
          >
            <Icon name="clock-alert-outline" size={18} color={COLORS.navy} />
            <Text style={styles.pendingBannerText}>
              {pendingCount} registration{pendingCount > 1 ? 's' : ''} awaiting approval
            </Text>
            <Icon name="chevron-right" size={16} color={COLORS.navy} />
          </TouchableOpacity>
        )}

        {/* ── Add Club Button ──────────────────────────────── */}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('CreateClub')}
        >
          <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.addBtnGrad}>
            <Icon name="plus" size={18} color={COLORS.navy} />
            <Text style={styles.addBtnText}>ADD NEW CLUB</Text>
          </LinearGradient>
        </TouchableOpacity>

      </ScrollView>

      <ClubDropdown />
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  // ── Nav Bar ──────────────────────────────────────────────
  navBar:         {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  navLeft:        { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  navLogo:        { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  navLogoText:    { fontSize: 18, fontWeight: '900', color: '#fff', fontStyle: 'italic' },
  navOrg:         { fontSize: 15, fontWeight: '800', color: COLORS.white, maxWidth: 140 },
  navRole:        { fontSize: 11, fontWeight: '600', color: COLORS.gold, marginTop: 1, letterSpacing: 1 },
  onlineDot:      { width: 10, height: 10, borderRadius: 5, marginHorizontal: 10 },
  navRight:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navClubBtn:     {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.gold + '18', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.gold + '44',
  },
  navClubBtnText: { color: COLORS.gold, fontSize: 12, fontWeight: '700' },
  navIconBtn:     { padding: 8 },

  // ── Stats Overview ───────────────────────────────────────
  overviewContainer: {
    marginHorizontal: 14, marginTop: 14, marginBottom: 10,
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  sectionHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionHeaderText: { color: COLORS.gold, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  sectionDivider:    { flex: 1, height: 1, backgroundColor: COLORS.gold + '30' },
  statsRow:          { flexDirection: 'row', gap: 6 },
  statCard:          {
    flex: 1, backgroundColor: COLORS.darkGray + 'AA', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 4,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder, gap: 2,
  },
  statNum:           { fontSize: 20, fontWeight: '900', color: COLORS.white },
  statLabel:         { color: COLORS.gray, fontSize: 9, textAlign: 'center' },
  pendingDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.gold, marginTop: -6 },

  // ── Pending banner ───────────────────────────────────────
  pendingBanner:     {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 14, marginBottom: 10,
    backgroundColor: COLORS.gold, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  pendingBannerText: { flex: 1, color: COLORS.navy, fontWeight: '700', fontSize: 12 },

  // ── Add button ───────────────────────────────────────────
  addBtn:         { marginHorizontal: 14, borderRadius: 10, overflow: 'hidden' },
  addBtnGrad:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 44, gap: 6 },
  addBtnText:     { color: COLORS.navy, fontWeight: '800', fontSize: 13, letterSpacing: 2 },

  // ── Dropdown modal ───────────────────────────────────────
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-start', paddingTop: 110 },
  dropdown:       {
    marginHorizontal: 14, backgroundColor: COLORS.card,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden',
  },
  dropdownTitle:  {
    color: COLORS.gold, fontSize: 10, fontWeight: '800', letterSpacing: 2,
    padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  dropdownEmpty:  { color: COLORS.gray, textAlign: 'center', padding: 20 },
  dropdownItem:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  dropdownItemLeft:   { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dropdownClubName:   { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  dropdownClubMeta:   { color: COLORS.gray, fontSize: 11, marginTop: 1 },
  statusPill:         { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText:     { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});

export default SuperAdminDashboard;
