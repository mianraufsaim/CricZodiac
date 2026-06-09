// ============================================================
// CricZodiac — Super Admin: Club Detail Screen
// View + edit club info and manage the club admin user.
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { API_ENDPOINTS } from '../../config/api';
import ApiService from '../../services/ApiService';

// ── Small helpers ─────────────────────────────────────────
const SectionTitle = ({ title, COLORS }) => (
  <Text style={{ color: COLORS.gold, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 14 }}>
    {title}
  </Text>
);

const FieldRow = ({ label, keyName, value, onChange, keyboardType = 'default', COLORS, styles }) => (
  <View style={styles.fieldGroup}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={styles.fieldInput}
      value={value}
      onChangeText={v => onChange(keyName, v)}
      keyboardType={keyboardType}
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={COLORS.gray}
    />
  </View>
);

const StatBadge = ({ icon, value, label, color, COLORS, styles, valueStyle }) => (
  <View style={styles.statBadge}>
    <Icon name={icon} size={20} color={color} />
    <Text style={[styles.statNum, { color }, valueStyle]}>{value ?? 0}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ── Main ──────────────────────────────────────────────────
const SuperAdminClubDetailScreen = ({ navigation, route }) => {
  const { clubId } = route.params || {};
  const { colors: COLORS } = useTheme();
  const { enterClubView } = useAuth();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [club, setClub]         = useState(null);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Editable club fields
  const [clubForm, setClubForm] = useState({ club_name: '', country: '', city: '', contact_email: '', status: 'active' });
  // Editable admin fields
  const [adminForm, setAdminForm] = useState({ admin_name: '', admin_email: '', admin_phone: '' });

  const setClubField  = (k, v) => setClubForm(f  => ({ ...f, [k]: v }));
  const setAdminField = (k, v) => setAdminForm(f => ({ ...f, [k]: v }));

  useEffect(() => { loadClub(); }, [clubId]);

  const loadClub = async () => {
    if (!clubId) return;
    setFetching(true);
    try {
      const res = await ApiService.get(`${API_ENDPOINTS.SUPER_ADMIN_CLUB_DETAIL}?club_id=${clubId}`);
      const c = res.club;
      setClub(c);
      setClubForm({
        club_name:     c.name          || '',
        country:       c.country       || '',
        city:          c.city          || '',
        contact_email: c.contact_email || '',
        status:        c.status        || 'active',
      });
      setAdminForm({
        admin_name:  c.admin_name  || '',
        admin_email: c.admin_email || '',
        admin_phone: c.admin_phone || '',
      });
    } catch (e) {
      Alert.alert('Error', e.message);
      navigation.goBack();
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    if (!clubForm.club_name.trim()) { Alert.alert('Required', 'Club name cannot be empty.'); return; }
    setSaving(true);
    try {
      await ApiService.post(API_ENDPOINTS.SUPER_ADMIN_CLUB_DETAIL, {
        club_id:       clubId,
        ...clubForm,
        admin_id:      club?.admin_id,
        ...adminForm,
      });
      Alert.alert('Saved', 'Club updated successfully.');
      loadClub(); // refresh
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAdminStatus = () => {
    const current = club?.admin_status;
    const next    = current === 'active' ? 'blocked' : 'active';
    const label   = next === 'blocked' ? 'Block Admin' : 'Activate Admin';
    const msg     = next === 'blocked'
      ? `${club?.admin_name} will be blocked and cannot log in.`
      : `${club?.admin_name} will be re-activated.`;

    Alert.alert(label, msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label,
        style: next === 'blocked' ? 'destructive' : 'default',
        onPress: async () => {
          setSaving(true);
          try {
            await ApiService.post(API_ENDPOINTS.SUPER_ADMIN_CLUB_DETAIL, {
              club_id:       clubId,
              admin_id:      club?.admin_id,
              admin_status:  next,
            });
            await loadClub();
          } catch (e) {
            Alert.alert('Error', e.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleEnterClub = () => {
    Alert.alert(
      `Enter ${club?.name}`,
      'Browse this club as its admin. Tap "EXIT" banner to return.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Enter Club',
          onPress: () => {
            enterClubView({ id: String(clubId), name: club?.name });
          },
        },
      ]
    );
  };

  const handleToggleClubStatus = () => {
    const next = clubForm.status === 'active' ? 'suspended' : 'active';
    setClubForm(f => ({ ...f, status: next }));
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadClub();
    setRefreshing(false);
  }, []);

  // ── Loading ───────────────────────────────────────────────
  if (fetching) return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={COLORS.gold} size="large" />
    </View>
  );

  const adminIsActive  = club?.admin_status === 'active';
  const clubIsActive   = clubForm.status === 'active';

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Header ──────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{club?.name}</Text>
          <View style={[styles.statusPill, { backgroundColor: clubIsActive ? COLORS.success + '22' : COLORS.danger + '22' }]}>
            <Text style={[styles.statusPillText, { color: clubIsActive ? COLORS.success : COLORS.danger }]}>
              {clubForm.status?.toUpperCase()}
            </Text>
          </View>
        </View>
        {/* Enter Club button */}
        <TouchableOpacity style={styles.enterBtn} onPress={handleEnterClub} activeOpacity={0.8}>
          <Icon name="login-variant" size={14} color={COLORS.navy} />
          <Text style={styles.enterBtnText}>Enter</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />}
      >

        {/* ── Stats Row ─────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatBadge icon="account-multiple" value={club?.player_count} label="Players" color={COLORS.cyan}    COLORS={COLORS} styles={styles} />
          <View style={styles.statDivider} />
          <StatBadge icon="cricket"          value={club?.match_count}  label="Matches" color={COLORS.gold}    COLORS={COLORS} styles={styles} />
          <View style={styles.statDivider} />
          <StatBadge icon="calendar-plus"    value={club?.created_at ? new Date(club.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} label="Since" color={COLORS.gray} COLORS={COLORS} styles={styles} valueStyle={{ fontSize: 12,marginTop: 2.5,marginBottom: 2.5}} />
        </View>

        {/* ── Club Info ─────────────────────────────────── */}
        <View style={styles.card}>
          <SectionTitle title="CLUB INFORMATION" COLORS={COLORS} />

          <FieldRow label="CLUB NAME"      keyName="club_name"     value={clubForm.club_name}     onChange={setClubField} COLORS={COLORS} styles={styles} />
          <FieldRow label="COUNTRY"        keyName="country"       value={clubForm.country}       onChange={setClubField} COLORS={COLORS} styles={styles} />
          <FieldRow label="CITY"           keyName="city"          value={clubForm.city}          onChange={setClubField} COLORS={COLORS} styles={styles} />
          <FieldRow label="CONTACT EMAIL"  keyName="contact_email" value={clubForm.contact_email} onChange={setClubField} keyboardType="email-address" COLORS={COLORS} styles={styles} />

          {/* Status toggle */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>CLUB STATUS</Text>
            <View style={styles.statusToggleRow}>
              {['active', 'suspended'].map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusOpt, clubForm.status === s && {
                    backgroundColor: s === 'active' ? COLORS.success + '33' : COLORS.danger + '33',
                    borderColor:     s === 'active' ? COLORS.success         : COLORS.danger,
                  }]}
                  onPress={() => setClubForm(f => ({ ...f, status: s }))}
                >
                  <Text style={[styles.statusOptText, clubForm.status === s && {
                    color: s === 'active' ? COLORS.success : COLORS.danger
                  }]}>
                    {s.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ── Club Admin ────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.adminSectionHeader}>
            <SectionTitle title="CLUB ADMIN" COLORS={COLORS} />
            {club?.admin_id ? (
              <TouchableOpacity
                style={[styles.blockBtn, { backgroundColor: adminIsActive ? COLORS.danger + '22' : COLORS.success + '22', borderColor: adminIsActive ? COLORS.danger + '55' : COLORS.success + '55' }]}
                onPress={handleToggleAdminStatus}
                activeOpacity={0.8}
              >
                <Icon name={adminIsActive ? 'account-cancel' : 'account-check'} size={14} color={adminIsActive ? COLORS.danger : COLORS.success} />
                <Text style={[styles.blockBtnText, { color: adminIsActive ? COLORS.danger : COLORS.success }]}>
                  {adminIsActive ? 'Block' : 'Activate'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {club?.admin_id ? (
            <>
              {/* Admin status badge */}
              <View style={[styles.adminStatusBadge, { backgroundColor: adminIsActive ? COLORS.success + '18' : COLORS.danger + '18', borderColor: adminIsActive ? COLORS.success + '44' : COLORS.danger + '44' }]}>
                <View style={[styles.adminStatusDot, { backgroundColor: adminIsActive ? COLORS.success : COLORS.danger }]} />
                <Text style={[styles.adminStatusText, { color: adminIsActive ? COLORS.success : COLORS.danger }]}>
                  {club?.admin_status?.toUpperCase()}
                </Text>
                {club?.admin_approved === '1' || club?.admin_approved === 1
                  ? <Icon name="check-decagram" size={13} color={COLORS.success} style={{ marginLeft: 4 }} />
                  : <Icon name="clock-alert"    size={13} color={COLORS.warning} style={{ marginLeft: 4 }} />
                }
              </View>

              <FieldRow label="FULL NAME"  keyName="admin_name"  value={adminForm.admin_name}  onChange={setAdminField} COLORS={COLORS} styles={styles} />
              <FieldRow label="EMAIL"      keyName="admin_email" value={adminForm.admin_email} onChange={setAdminField} keyboardType="email-address" COLORS={COLORS} styles={styles} />
              <FieldRow label="PHONE"      keyName="admin_phone" value={adminForm.admin_phone} onChange={setAdminField} keyboardType="phone-pad"    COLORS={COLORS} styles={styles} />
            </>
          ) : (
            <View style={styles.noAdminBox}>
              <Icon name="account-off" size={32} color={COLORS.gray} />
              <Text style={styles.noAdminText}>No admin assigned to this club yet.</Text>
            </View>
          )}
        </View>

        {/* ── Save Button ───────────────────────────────── */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.65 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.saveBtnGrad}>
            {saving
              ? <ActivityIndicator size="small" color={COLORS.navy} />
              : <><Icon name="content-save" size={18} color={COLORS.navy} /><Text style={styles.saveBtnText}>SAVE CHANGES</Text></>
            }
          </LinearGradient>
        </TouchableOpacity>

      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingHorizontal: 18, paddingBottom: 14 },
  backBtn:      { padding: 4 },
  headerTitle:  { color: COLORS.white, fontSize: 18, fontWeight: '800', maxWidth: 180 },
  statusPill:   { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 3 },
  statusPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  enterBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.gold, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  enterBtnText: { color: COLORS.navy, fontWeight: '800', fontSize: 12 },

  scroll:       { padding: 16, paddingBottom: 50 },

  // Stats
  statsRow:     { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center' },
  statBadge:    { flex: 1, alignItems: 'center', gap: 3 },
  statDivider:  { width: 1, height: 36, backgroundColor: COLORS.cardBorder },
  statNum:      { fontSize: 18, fontWeight: '900' },
  statLabel:    { color: COLORS.gray, fontSize: 10 },

  // Cards
  card:         { backgroundColor: COLORS.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: 14 },

  // Fields
  fieldGroup:   { marginBottom: 14 },
  fieldLabel:   { color: COLORS.gray, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  fieldInput:   { backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 46, color: COLORS.white, fontSize: 15 },

  // Status toggle
  statusToggleRow: { flexDirection: 'row', gap: 10 },
  statusOpt:       { flex: 1, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.darkGray, borderWidth: 1, borderColor: COLORS.cardBorder },
  statusOptText:   { color: COLORS.gray, fontWeight: '700', fontSize: 12 },

  // Admin section
  adminSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 },
  blockBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 14 },
  blockBtnText:       { fontSize: 12, fontWeight: '700' },
  adminStatusBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 14 },
  adminStatusDot:     { width: 7, height: 7, borderRadius: 4 },
  adminStatusText:    { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  noAdminBox:         { alignItems: 'center', gap: 8, paddingVertical: 16 },
  noAdminText:        { color: COLORS.gray, fontSize: 13, textAlign: 'center' },

  // Save
  saveBtn:      { borderRadius: 14, overflow: 'hidden' },
  saveBtnGrad:  { height: 52, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  saveBtnText:  { color: COLORS.navy, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
});

export default SuperAdminClubDetailScreen;
