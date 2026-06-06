// ============================================================
// CricZodiac — Pending Approvals Screen (Super Admin)
// Tap a card to see full admin + club detail, then approve/reject.
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  Modal, ScrollView, Pressable,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { API_ENDPOINTS } from '../../config/api';
import ApiService from '../../services/ApiService';

// ── Detail modal ──────────────────────────────────────────
const DetailRow = ({ icon, label, value, COLORS, styles }) => (
  value ? (
    <View style={styles.detailRow}>
      <Icon name={icon} size={15} color={COLORS.gray} style={{ width: 22 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  ) : null
);

const SectionHeader = ({ icon, title, color, styles }) => (
  <View style={styles.sectionHeader}>
    <Icon name={icon} size={14} color={color} />
    <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
  </View>
);

const PendingApprovalsScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [acting, setActing]       = useState(null);
  const [selected, setSelected]   = useState(null); // item shown in modal

  useFocusEffect(useCallback(() => { loadPending(); }, []));

  const loadPending = async () => {
    setLoading(true);
    try {
      const res = await ApiService.get(API_ENDPOINTS.PENDING_APPROVALS);
      setItems(res.pending ?? res.data?.pending ?? []);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not load pending requests.');
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = (item, action) => {
    const label = action === 'approve' ? 'Approve' : 'Reject';
    const msg   = action === 'approve'
      ? `Approve ${item.name}?\n\nTheir club "${item.club_name}" will become active.`
      : `Reject ${item.name}?\n\nTheir account and club will be suspended.`;

    Alert.alert(label, msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label,
        style: action === 'approve' ? 'default' : 'destructive',
        onPress: () => doAction(item.id, action),
      },
    ]);
  };

  const doAction = async (userId, action) => {
    setActing(userId);
    setSelected(null); // close modal
    try {
      await ApiService.post(API_ENDPOINTS.APPROVE_USER, { user_id: userId, action });
      setItems(prev => prev.filter(i => i.id !== userId));
    } catch (e) {
      Alert.alert('Error', e.message || 'Action failed.');
    } finally {
      setActing(null);
    }
  };

  const fmtDate = (dt) => dt
    ? new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  // ── List card ─────────────────────────────────────────────
  const renderItem = ({ item }) => {
    const isActing = acting === item.id;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setSelected(item)}
        activeOpacity={0.75}
      >
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>{item.email}</Text>
          {item.phone ? <Text style={styles.meta}>{item.phone}</Text> : null}

          <View style={styles.clubRow}>
            <Icon name="shield-outline" size={13} color={COLORS.gold} />
            <Text style={styles.clubName}>{item.club_name}</Text>
          </View>

          {(item.club_city || item.club_country) ? (
            <Text style={styles.location}>
              {[item.club_city, item.club_country].filter(Boolean).join(', ')}
            </Text>
          ) : null}

          <Text style={styles.date}>Registered {fmtDate(item.created_at)}</Text>
        </View>

        {/* Quick actions */}
        {isActing ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginLeft: 12 }} />
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => confirmAction(item, 'approve')}
              activeOpacity={0.8}
            >
              <Icon name="check" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => confirmAction(item, 'reject')}
              activeOpacity={0.8}
            >
              <Icon name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── Detail modal ──────────────────────────────────────────
  const renderModal = () => {
    const item = selected;
    if (!item) return null;
    const isActing = acting === item.id;

    return (
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          {/* Stop propagation on the sheet itself */}
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            {/* Drag handle */}
            <View style={styles.dragHandle} />

            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {/* ── Avatar + name ── */}
              <View style={styles.modalHero}>
                <LinearGradient
                  colors={[COLORS.gold + '40', COLORS.gold + '15']}
                  style={styles.modalAvatar}
                >
                  <Text style={styles.modalAvatarTxt}>
                    {item.name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </LinearGradient>
                <Text style={styles.modalName}>{item.name}</Text>
                <View style={styles.pendingBadge}>
                  <Icon name="clock-outline" size={12} color={COLORS.warning} />
                  <Text style={styles.pendingBadgeTxt}>PENDING APPROVAL</Text>
                </View>
              </View>

              {/* ── ADMIN DETAILS ── */}
              <SectionHeader
                icon="account"
                title="ADMIN DETAILS"
                color={COLORS.cyan}
                styles={styles}
              />
              <View style={styles.detailCard}>
                <DetailRow icon="account-outline"   label="Full Name"    value={item.name}        COLORS={COLORS} styles={styles} />
                <DetailRow icon="email-outline"      label="Email"        value={item.email}       COLORS={COLORS} styles={styles} />
                <DetailRow icon="phone-outline"      label="Phone"        value={item.phone}       COLORS={COLORS} styles={styles} />
                <DetailRow icon="calendar-outline"   label="Registered"   value={fmtDate(item.created_at)} COLORS={COLORS} styles={styles} />
                <DetailRow icon="shield-account"     label="Role"         value="Club Admin"       COLORS={COLORS} styles={styles} />
              </View>

              {/* ── CLUB DETAILS ── */}
              <SectionHeader
                icon="shield-star"
                title="CLUB DETAILS"
                color={COLORS.gold}
                styles={styles}
              />
              <View style={styles.detailCard}>
                <DetailRow icon="shield-outline"     label="Club Name"    value={item.club_name}   COLORS={COLORS} styles={styles} />
                <DetailRow icon="earth"              label="Country"      value={item.club_country} COLORS={COLORS} styles={styles} />
                <DetailRow icon="map-marker-outline" label="City"         value={item.club_city}   COLORS={COLORS} styles={styles} />
                <DetailRow icon="email-outline"      label="Contact Email" value={item.club_email} COLORS={COLORS} styles={styles} />
                {/* <DetailRow icon="identifier"         label="Club ID"      value={item.club_id ? `#${item.club_id}` : null} COLORS={COLORS} styles={styles} /> */}
              </View>

              {/* ── Action buttons ── */}
              <View style={styles.modalActions}>
                {isActing ? (
                  <ActivityIndicator color={COLORS.gold} size="large" />
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.modalApproveBtn}
                      onPress={() => confirmAction(item, 'approve')}
                      activeOpacity={0.85}
                    >
                      <LinearGradient colors={[COLORS.success, '#1a8a4a']} style={styles.modalBtnGrad}>
                        <Icon name="check-circle" size={20} color="#fff" />
                        <Text style={styles.modalBtnTxt}>APPROVE</Text>
                      </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.modalRejectBtn}
                      onPress={() => confirmAction(item, 'reject')}
                      activeOpacity={0.85}
                    >
                      <LinearGradient colors={[COLORS.danger, '#a01515']} style={styles.modalBtnGrad}>
                        <Icon name="close-circle" size={20} color="#fff" />
                        <Text style={styles.modalBtnTxt}>REJECT</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* bottom padding for safe area */}
              <View style={{ height: 16 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Pending Requests</Text>
          {!loading && (
            <Text style={styles.headerSub}>
              {items.length === 0 ? 'All caught up!' : `${items.length} awaiting approval`}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={loadPending} style={styles.refreshBtn}>
          <Icon name="refresh" size={20} color={COLORS.gray} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 60 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="check-circle-outline" size={64} color={COLORS.gold} />
          <Text style={styles.emptyTitle}>All Clear!</Text>
          <Text style={styles.emptyText}>No pending registrations at this time.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={styles.list}
        />
      )}

      {renderModal()}
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  // ── Screen ──────────────────────────────────────────────
  header:       { flexDirection: 'row', alignItems: 'center', paddingTop: 54, paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  backBtn:      { padding: 6 },
  headerText:   { flex: 1, marginLeft: 4 },
  headerTitle:  { fontSize: 22, fontWeight: '900', color: COLORS.white },
  headerSub:    { fontSize: 12, color: COLORS.gray, marginTop: 1 },
  refreshBtn:   { padding: 8 },

  list:         { paddingHorizontal: 16, paddingBottom: 32 },
  card:         { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.cardBorder },

  avatar:       { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.gold + '30', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  avatarText:   { fontSize: 18, fontWeight: '900', color: COLORS.gold },

  info:         { flex: 1, gap: 2 },
  name:         { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  meta:         { color: COLORS.gray, fontSize: 12 },
  clubRow:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  clubName:     { color: COLORS.gold, fontSize: 12, fontWeight: '600' },
  location:     { color: COLORS.gray, fontSize: 11 },
  date:         { color: COLORS.gray, fontSize: 11, marginTop: 4, fontStyle: 'italic' },

  actions:      { flexDirection: 'column', gap: 8, marginLeft: 10, flexShrink: 0 },
  actionBtn:    { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  approveBtn:   { backgroundColor: COLORS.success },
  rejectBtn:    { backgroundColor: COLORS.danger },

  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle:   { color: COLORS.white, fontSize: 22, fontWeight: '800' },
  emptyText:    { color: COLORS.gray, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },

  // ── Modal ────────────────────────────────────────────────
  modalBackdrop:  {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet:     {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 10,
    maxHeight: '90%',
    borderWidth: 1, borderColor: COLORS.cardBorder,
    borderBottomWidth: 0,
  },
  dragHandle:     {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.gray + '60',
    alignSelf: 'center', marginBottom: 18,
  },

  modalHero:      { alignItems: 'center', marginBottom: 20 },
  modalAvatar:    {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  modalAvatarTxt: { fontSize: 30, fontWeight: '900', color: COLORS.gold },
  modalName:      { color: COLORS.white, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  pendingBadge:   {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.warning + '20', borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.warning + '50',
    paddingHorizontal: 10, paddingVertical: 4,
  },
  pendingBadgeTxt:{ color: COLORS.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  sectionHeader:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, marginBottom: 8,
  },
  sectionTitle:   { fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  detailCard:     {
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  detailRow:      {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 10, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  detailLabel:    { color: COLORS.gray, fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginBottom: 1 },
  detailValue:    { color: COLORS.white, fontSize: 14, fontWeight: '500' },

  modalActions:   { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8 },
  modalApproveBtn:{ flex: 1, borderRadius: 14, overflow: 'hidden' },
  modalRejectBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  modalBtnGrad:   {
    height: 52, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  modalBtnTxt:    { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
});

export default PendingApprovalsScreen;
