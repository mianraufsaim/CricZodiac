// ============================================================
// CricZodiac — Manage Users Screen (Admin)
// View all users, filter by role, tap to manage each user.
// Creation delegates to CreateUserScreen (credentials + share).
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  Modal, TextInput, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../config/constants';
import {
  getAllUsers, changeUserRole, setUserApproval, deactivateUser,
} from '../../database/queries/userQueries';

// ── Config ────────────────────────────────────────────────
const TABS = [
  { id: 'all',    label: 'All',     icon: 'account-group' },
  { id: 'umpire', label: 'Umpires', icon: 'account-tie'   },
  { id: 'player', label: 'Players', icon: 'account'       },
];

const getRoleCfg = (COLORS) => ({
  admin:  { color: COLORS.gold,    icon: 'shield-crown'  },
  umpire: { color: COLORS.cyan,    icon: 'account-tie'   },
  player: { color: COLORS.gray,    icon: 'account'       },
});

// ── Add Type Sheet ────────────────────────────────────────
const AddTypeSheet = ({ visible, onClose, onSelect, COLORS, sh }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <TouchableOpacity style={sh.overlay} activeOpacity={1} onPress={onClose}>
      <View style={sh.sheet}>
        <Text style={sh.title}>Create Account</Text>
        <TouchableOpacity style={sh.option} onPress={() => { onClose(); onSelect('umpire'); }}>
          <View style={[sh.iconBox, { backgroundColor: COLORS.cyan + '22' }]}>
            <Icon name="account-tie" size={26} color={COLORS.cyan} />
          </View>
          <View>
            <Text style={sh.optLabel}>Add Umpire</Text>
            <Text style={sh.optDesc}>Create login for a new umpire</Text>
          </View>
          <Icon name="chevron-right" size={18} color={COLORS.gray} />
        </TouchableOpacity>
        <TouchableOpacity style={sh.option} onPress={() => { onClose(); onSelect('player'); }}>
          <View style={[sh.iconBox, { backgroundColor: COLORS.gold + '22' }]}>
            <Icon name="account" size={26} color={COLORS.gold} />
          </View>
          <View>
            <Text style={sh.optLabel}>Add Player</Text>
            <Text style={sh.optDesc}>Create login for a new player</Text>
          </View>
          <Icon name="chevron-right" size={18} color={COLORS.gray} />
        </TouchableOpacity>
        <TouchableOpacity style={sh.cancelBtn} onPress={onClose}>
          <Text style={sh.cancelTxt}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);

// ── User Action Sheet ─────────────────────────────────────
const UserActionSheet = ({ user, visible, onClose, onRefresh, COLORS, ac }) => {
  if (!user) return null;
  const isUmpire = user.role === 'umpire';
  const isAdmin  = user.role === 'admin';
  const ROLE_CFG = getRoleCfg(COLORS);

  const handleChangeRole = () => {
    onClose();
    const newRole = isUmpire ? 'player' : 'umpire';
    Alert.alert(
      isUmpire ? 'Demote to Player' : 'Promote to Umpire',
      `Change ${user.name}'s role to ${newRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: async () => { await changeUserRole(user.id, newRole); onRefresh(); } },
      ]
    );
  };

  const handleApproval = () => {
    onClose();
    const approve = !user.is_approved;
    Alert.alert(
      approve ? 'Approve User' : 'Revoke Approval',
      `${approve ? 'Approve access for' : 'Revoke access for'} ${user.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: async () => { await setUserApproval(user.id, approve); onRefresh(); } },
      ]
    );
  };

  const handleRemove = () => {
    onClose();
    Alert.alert('Remove User', `Deactivate ${user.name}? They lose access but data is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deactivateUser(user.id); onRefresh(); } },
    ]);
  };

  const cfg = ROLE_CFG[user.role] || ROLE_CFG.player;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={ac.overlay} activeOpacity={1} onPress={onClose}>
        <View style={ac.sheet}>
          <View style={ac.userRow}>
            <View style={[ac.avatar, { backgroundColor: cfg.color + '22' }]}>
              <Text style={[ac.avatarTxt, { color: cfg.color }]}>{user.name?.[0]?.toUpperCase()}</Text>
            </View>
            <View>
              <Text style={ac.userName}>{user.name}</Text>
              <Text style={[ac.userRole, { color: cfg.color }]}>{user.role?.toUpperCase()}</Text>
            </View>
          </View>

          {!isAdmin && (
            <>
              <TouchableOpacity style={ac.action} onPress={handleChangeRole}>
                <Icon name={isUmpire ? 'arrow-down-circle' : 'arrow-up-circle'} size={20} color={COLORS.cyan} />
                <Text style={ac.actionTxt}>{isUmpire ? 'Demote to Player' : 'Promote to Umpire'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ac.action} onPress={handleApproval}>
                <Icon name={user.is_approved ? 'account-cancel' : 'account-check'} size={20} color={COLORS.warning} />
                <Text style={ac.actionTxt}>{user.is_approved ? 'Revoke Approval' : 'Approve User'}</Text>
              </TouchableOpacity>
              <View style={ac.divider} />
              <TouchableOpacity style={ac.action} onPress={handleRemove}>
                <Icon name="account-remove" size={20} color={COLORS.danger} />
                <Text style={[ac.actionTxt, { color: COLORS.danger }]}>Remove User</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={ac.cancelBtn} onPress={onClose}>
            <Text style={ac.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

// ── Main ──────────────────────────────────────────────────
const ManageUsersScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const { user: currentUser } = useAuth();
  const st = useMemo(() => getStStyles(COLORS), [COLORS]);
  const sh = useMemo(() => getShStyles(COLORS), [COLORS]);
  const ac = useMemo(() => getAcStyles(COLORS), [COLORS]);
  const ROLE_CFG = useMemo(() => getRoleCfg(COLORS), [COLORS]);

  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('all');
  const [search,   setSearch]   = useState('');
  const [addSheet, setAddSheet] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setUsers(await getAllUsers()); }
    catch (e) { Alert.alert('Error', e.message); }
    finally  { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  // Exclude the logged-in admin from the list — they manage others, not themselves
  const active  = users.filter(u => u.status !== 'inactive' && String(u.id) !== String(currentUser?.id));
  const umpires = active.filter(u => u.role === 'umpire');
  const players = active.filter(u => u.role === 'player');

  const filtered = active.filter(u => {
    const matchTab = tab === 'all' || u.role === tab;
    const matchSearch = !search || u.name?.toLowerCase().includes(search.toLowerCase())
      || u.email?.toLowerCase().includes(search.toLowerCase())
      || u.phone?.includes(search);
    return matchTab && matchSearch;
  });

  const handleAddSelect = (role) => {
    navigation.navigate('CreateUser', { defaultRole: role });
  };

  const renderUser = ({ item }) => {
    const cfg = ROLE_CFG[item.role] || ROLE_CFG.player;
    return (
      <TouchableOpacity style={st.card} onPress={() => setSelected(item)} activeOpacity={0.75}>
        <View style={[st.avatar, { backgroundColor: cfg.color + '22' }]}>
          <Text style={[st.avatarTxt, { color: cfg.color }]}>{item.name?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={st.nameRow}>
            <Text style={st.name}>{item.name}</Text>
            {!item.is_approved && (
              <View style={st.pendingBadge}>
                <Text style={st.pendingTxt}>PENDING</Text>
              </View>
            )}
          </View>
          <Text style={st.detail}>{item.email || item.phone || 'No contact'}</Text>
        </View>
        <View style={[st.badge, { borderColor: cfg.color, backgroundColor: cfg.color + '18' }]}>
          <Icon name={cfg.icon} size={11} color={cfg.color} style={{ marginRight: 3 }} />
          <Text style={[st.badgeTxt, { color: cfg.color }]}>{item.role?.toUpperCase()}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack?.()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={st.title}>Manage Users</Text>
        <TouchableOpacity onPress={() => setAddSheet(true)}>
          <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={st.addBtn}>
            <Icon name="account-plus" size={18} color={COLORS.navy} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={st.summary}>
        {[
          { label: 'Umpires', count: umpires.length, color: COLORS.cyan   },
          { label: 'Players', count: players.length, color: COLORS.gray   },
          { label: 'Total',   count: active.length,  color: COLORS.gold   },
        ].map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && <View style={st.summaryDivider} />}
            <View style={st.summaryItem}>
              <Text style={[st.summaryNum, { color: s.color }]}>{s.count}</Text>
              <Text style={st.summaryLabel}>{s.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Search */}
      <View style={st.searchBar}>
        <Icon name="magnify" size={18} color={COLORS.gray} />
        <TextInput
          style={st.searchInput}
          placeholder="Search by name, email, phone..."
          placeholderTextColor={COLORS.gray}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Icon name="close-circle" size={16} color={COLORS.gray} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tabs */}
      <View style={st.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[st.tabBtn, tab === t.id && st.tabActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[st.tabTxt, tab === t.id && st.tabTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading
        ? <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={filtered}
            keyExtractor={i => String(i.id)}
            renderItem={renderUser}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={st.empty}>
                <Icon name="account-off" size={48} color={COLORS.cardBorder} />
                <Text style={st.emptyTxt}>
                  {tab === 'umpire' ? 'No umpires yet.' : tab === 'player' ? 'No players yet.' : 'No users found.'}
                </Text>
                <TouchableOpacity style={st.emptyBtn} onPress={() => setAddSheet(true)}>
                  <Text style={st.emptyBtnTxt}>+ Create Account</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}

      {/* FAB */}
      {/* <TouchableOpacity style={st.fab} onPress={() => setAddSheet(true)}>
        <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={st.fabInner}>
          <Icon name="account-plus" size={24} color={COLORS.navy} />
        </LinearGradient>
      </TouchableOpacity> */}

      {/* Sheets */}
      <AddTypeSheet
        visible={addSheet}
        onClose={() => setAddSheet(false)}
        onSelect={handleAddSelect}
        COLORS={COLORS}
        sh={sh}
      />
      <UserActionSheet
        user={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
        onRefresh={() => { setSelected(null); load(); }}
        COLORS={COLORS}
        ac={ac}
      />
    </LinearGradient>
  );
};

// ── Styles ─────────────────────────────────────────────────
const getStStyles = (COLORS) => StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 12 },
  title:         { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  addBtn:        { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  summary:       { flexDirection: 'row', backgroundColor: COLORS.card, marginHorizontal: 16, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  summaryItem:   { flex: 1, alignItems: 'center' },
  summaryNum:    { fontWeight: '900', fontSize: 22 },
  summaryLabel:  { color: COLORS.gray, fontSize: 10, marginTop: 2 },
  summaryDivider:{ width: 1, backgroundColor: COLORS.cardBorder },
  searchBar:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 14, marginBottom: 10, gap: 8, borderWidth: 1, borderColor: COLORS.cardBorder, height: 46 },
  searchInput:   { flex: 1, color: COLORS.white, fontSize: 14 },
  tabRow:        { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4, gap: 8 },
  tabBtn:        { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder },
  tabActive:     { backgroundColor: COLORS.royalBlue, borderColor: COLORS.cyan },
  tabTxt:        { color: COLORS.gray, fontWeight: '600', fontSize: 13 },
  tabTxtActive:  { color: COLORS.white },
  card:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  avatar:        { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:     { fontWeight: '800', fontSize: 20 },
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  name:          { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  detail:        { color: COLORS.gray, fontSize: 12 },
  badge:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeTxt:      { fontSize: 10, fontWeight: '700' },
  pendingBadge:  { backgroundColor: COLORS.warning + '33', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.warning },
  pendingTxt:    { color: COLORS.warning, fontSize: 9, fontWeight: '700' },
  empty:         { alignItems: 'center', paddingTop: 50, gap: 12 },
  emptyTxt:      { color: COLORS.gray, fontSize: 14 },
  emptyBtn:      { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.royalBlue, borderRadius: 10 },
  emptyBtnTxt:   { color: COLORS.white, fontWeight: '700' },
  fab:           { position: 'absolute', bottom: 28, right: 24 },
  fabInner:      { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 8 },
});

const getShStyles = (COLORS) => StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: COLORS.navy, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  title:       { color: COLORS.white, fontWeight: '800', fontSize: 18, marginBottom: 16 },
  option:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  iconBox:     { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optLabel:    { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  optDesc:     { color: COLORS.gray, fontSize: 12, marginTop: 2 },
  cancelBtn:   { marginTop: 14, height: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.darkGray, borderRadius: 12 },
  cancelTxt:   { color: COLORS.gray, fontWeight: '600', fontSize: 15 },
});

const getAcStyles = (COLORS) => StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: COLORS.navy, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  userRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  avatar:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:  { fontWeight: '800', fontSize: 18 },
  userName:   { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  userRole:   { fontSize: 12, marginTop: 2 },
  action:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  actionTxt:  { color: COLORS.white, fontSize: 15 },
  divider:    { height: 1, backgroundColor: COLORS.cardBorder, marginVertical: 4 },
  cancelBtn:  { marginTop: 8, height: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.darkGray, borderRadius: 12 },
  cancelTxt:  { color: COLORS.gray, fontWeight: '600', fontSize: 15 },
});

export default ManageUsersScreen;
