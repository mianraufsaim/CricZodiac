// ============================================================
// CricZodiac — Edit User Screen
// Pre-fills all fields. Allows updating profile, password,
// status, and approval state.
// route.params.user = full user object from ManageUsersScreen
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import DatePicker from 'react-native-date-picker';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { PLAYER_TYPES, BATTING_HAND, BOWLING_STYLES } from '../../config/constants';
import { updateUserWithPlayer } from '../../database/queries/userQueries';

// ── Helpers ───────────────────────────────────────────────
const generatePassword = () => {
  const prefix = ['Quick', 'Swift', 'Sharp', 'Bold', 'Pace', 'Spin'];
  const suffix = ['Bat', 'Bowl', 'Run', 'Catch', 'Six', 'Ace'];
  const p = prefix[Math.floor(Math.random() * prefix.length)];
  const s = suffix[Math.floor(Math.random() * suffix.length)];
  return `${p}${s}@${Math.floor(10 + Math.random() * 90)}`;
};

const STATUS_OPTIONS = [
  { id: 'active',   label: 'Active',   color: '#22C55E' },
  { id: 'blocked',  label: 'Blocked',  color: '#EF4444' },
  { id: 'pending',  label: 'Pending',  color: '#F59E0B' },
  { id: 'inactive', label: 'Inactive', color: '#0c51da' },
];

// ── Chip Selector ─────────────────────────────────────────
const Chips = ({ options, value, onChange, COLORS, st, colorKey, noWrap }) => (
  <View style={[st.chips, noWrap && { flexWrap: 'nowrap' }]}>
    {options.map(o => {
      const active = value === o.id;
      const color  = colorKey ? o[colorKey] : COLORS.cyan;
      return (
        <TouchableOpacity
          key={o.id}
          style={[st.chip, noWrap && st.chipCompact, active && { borderColor: color, backgroundColor: color + '22' }]}
          onPress={() => onChange(o.id)}
        >
          {o.icon && <Icon name={o.icon} size={12} color={active ? color : COLORS.gray} style={{ marginRight: 3 }} />}
          <Text style={[st.chipTxt, noWrap && st.chipTxtCompact, active && { color }]}>{o.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// ── Main Screen ───────────────────────────────────────────
const EditUserScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const { user: authUser, activeClub } = useAuth();
  const st = useMemo(() => getStyles(COLORS), [COLORS]);

  const { user } = route.params;
  const isPlayer = user.role === 'player';
  const localUserId = user.local_id || String(user.id);

  const [form, setForm] = useState({
    name:          user.name          || '',
    email:         user.email         || '',
    phone:         user.phone         || '',
    player_type:   user.player_type   || 'allrounder',
    batting_hand:  user.batting_hand  || 'right',
    bowling_style: user.bowling_style || '',
    jersey_number: user.jersey_number ? String(user.jersey_number) : '',
    date_of_birth: user.date_of_birth || '',
    status:        user.status        || 'active',
    is_approved:   user.is_approved != null ? !!user.is_approved : true,
  });

  const [newPassword,    setNewPassword]    = useState('');
  const [showPassCard,   setShowPassCard]   = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [showDobPicker,  setShowDobPicker]  = useState(false);
  const [dobPickerDate,  setDobPickerDate]  = useState(
    user.date_of_birth ? new Date(user.date_of_birth) : new Date(2000, 0, 1)
  );
  const today = new Date();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Name is required'); return; }
    setSaving(true);
    try {
      const clubId = activeClub?.server_id || authUser?.club_id || user.club_id || null;
      await updateUserWithPlayer(localUserId, {
        ...form,
        is_approved:      form.is_approved ? 1 : 0,
        role:             user.role,
        club_id:          clubId,
        player_local_id:  user.player_local_id || null,
        new_password:     newPassword.trim() || null,
      });
      Alert.alert('Saved', `${form.name}'s profile has been updated.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={st.title}>Edit Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Role badge (read-only) */}
      <View style={st.roleBadgeRow}>
        <View style={[st.roleBadge, { borderColor: isPlayer ? COLORS.gold : COLORS.cyan }]}>
          <Icon name={isPlayer ? 'account' : 'account-tie'} size={14} color={isPlayer ? COLORS.gold : COLORS.cyan} />
          <Text style={[st.roleBadgeTxt, { color: isPlayer ? COLORS.gold : COLORS.cyan }]}>
            {user.role?.toUpperCase()}
          </Text>
        </View>
        <Text style={st.roleHint}>Role changes via action menu</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">

          {/* Profile Info */}
          <View style={st.card}>
            <Text style={st.sectionLabel}>PROFILE INFO</Text>
            {[
              { label: 'Full Name *', key: 'name',  kb: 'default',      cap: 'words', readonly: false },
              { label: 'Email',       key: 'email', kb: 'email-address', cap: 'none',  readonly: true  },
              { label: 'Phone',       key: 'phone', kb: 'phone-pad',     cap: 'none',  readonly: false },
            ].map(f => (
              <View key={f.key} style={st.field}>
                <Text style={st.label}>{f.label}{f.readonly ? '  🔒' : ''}</Text>
                <TextInput
                  style={[st.input, f.readonly && st.inputDisabled]}
                  value={form[f.key]}
                  onChangeText={f.readonly ? undefined : (v => set(f.key, v))}
                  keyboardType={f.kb}
                  autoCapitalize={f.cap}
                  placeholderTextColor={COLORS.gray}
                  placeholder={f.label.replace(' *', '')}
                  editable={!f.readonly}
                  selectTextOnFocus={!f.readonly}
                />
              </View>
            ))}
          </View>

          {/* Account Status */}
          <View style={st.card}>
            <Text style={st.sectionLabel}>ACCOUNT STATUS</Text>

            <View style={st.field}>
              <Text style={st.label}>STATUS</Text>
              <Chips
                options={STATUS_OPTIONS}
                value={form.status}
                onChange={v => set('status', v)}
                colorKey="color"
                COLORS={COLORS}
                st={st}
                noWrap
              />
            </View>

            <View style={st.field}>
              <Text style={st.label}>APPROVAL</Text>
              <View style={st.chips}>
                {[
                  { id: true,  label: 'Approved',     icon: 'check-circle',  color: '#22C55E' },
                  { id: false, label: 'Not Approved',  icon: 'close-circle',  color: '#EF4444' },
                ].map(o => {
                  const active = form.is_approved === o.id;
                  return (
                    <TouchableOpacity
                      key={String(o.id)}
                      style={[st.chip, active && { borderColor: o.color, backgroundColor: o.color + '22' }]}
                      onPress={() => set('is_approved', o.id)}
                    >
                      <Icon name={o.icon} size={13} color={active ? o.color : COLORS.gray} style={{ marginRight: 4 }} />
                      <Text style={[st.chipTxt, active && { color: o.color }]}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Change Password */}
          <TouchableOpacity
            style={st.card}
            onPress={() => { if (!showPassCard) setShowPassCard(true); }}
            activeOpacity={showPassCard ? 1 : 0.7}
          >
            <View style={st.passHeader}>
              <Icon name="lock-reset" size={18} color={COLORS.cyan} />
              <Text style={st.sectionLabel}>CHANGE PASSWORD</Text>
              {!showPassCard && <Icon name="chevron-down" size={18} color={COLORS.gray} style={{ marginLeft: 'auto' }} />}
            </View>
            {showPassCard && (
              <>
                <Text style={[st.label, { marginBottom: 10 }]}>Leave blank to keep current password</Text>
                <View style={st.passRow}>
                  <TextInput
                    style={[st.input, { flex: 1 }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="New password"
                    placeholderTextColor={COLORS.gray}
                    autoCapitalize="none"
                    secureTextEntry={false}
                  />
                  <TouchableOpacity
                    style={st.regenBtn}
                    onPress={() => setNewPassword(generatePassword())}
                  >
                    <Icon name="refresh" size={20} color={COLORS.gold} />
                  </TouchableOpacity>
                </View>
                {newPassword.length > 0 && newPassword.length < 6 && (
                  <Text style={st.passWarn}>Password must be at least 6 characters</Text>
                )}
              </>
            )}
          </TouchableOpacity>

          {/* Player-specific fields */}
          {isPlayer && (
            <>
              <View style={st.card}>
                <Text style={st.sectionLabel}>PLAYER TYPE</Text>
                <Chips options={PLAYER_TYPES} value={form.player_type} onChange={v => set('player_type', v)} COLORS={COLORS} st={st} />
              </View>

              <View style={st.card}>
                <Text style={st.sectionLabel}>BATTING HAND</Text>
                <Chips options={BATTING_HAND} value={form.batting_hand} onChange={v => set('batting_hand', v)} COLORS={COLORS} st={st} />
              </View>

              <View style={st.card}>
                <Text style={st.sectionLabel}>ADDITIONAL INFO</Text>
                <View style={st.field}>
                  <Text style={st.label}>Jersey Number</Text>
                  <TextInput
                    style={st.input}
                    value={form.jersey_number}
                    onChangeText={v => set('jersey_number', v)}
                    keyboardType="number-pad"
                    placeholderTextColor={COLORS.gray}
                    placeholder="e.g. 7"
                    maxLength={3}
                  />
                </View>
                <View style={st.field}>
                  <Text style={st.label}>Date of Birth</Text>
                  <TouchableOpacity
                    style={st.dobBtn}
                    onPress={() => { if (form.date_of_birth) setDobPickerDate(new Date(form.date_of_birth)); setShowDobPicker(true); }}
                    activeOpacity={0.7}
                  >
                    <Icon name="calendar" size={18} color={form.date_of_birth ? COLORS.gold : COLORS.gray} />
                    <Text style={[st.dobTxt, form.date_of_birth && { color: COLORS.white }]}>
                      {form.date_of_birth
                        ? new Date(form.date_of_birth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'Select date of birth'}
                    </Text>
                    {form.date_of_birth
                      ? <TouchableOpacity onPress={() => set('date_of_birth', '')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <Icon name="close-circle" size={16} color={COLORS.gray} />
                        </TouchableOpacity>
                      : null}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={st.card}>
                <Text style={st.sectionLabel}>BOWLING STYLE</Text>
                <View style={st.styleGrid}>
                  {BOWLING_STYLES.map(s => {
                    const active = form.bowling_style === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[st.styleCard, active && { borderColor: s.color, backgroundColor: s.color + '18' }]}
                        onPress={() => set('bowling_style', s.id)}
                      >
                        <Text style={[st.styleLabel, active && { color: s.color }]}>{s.label}</Text>
                        <Text style={st.styleDesc}>{s.desc}</Text>
                        {active && <Icon name="check-circle" size={12} color={s.color} style={{ marginTop: 3 }} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[st.saveBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <LinearGradient colors={[COLORS.gold, '#B8942A']} style={st.saveBtnInner}>
              <Icon name="content-save" size={20} color={COLORS.navy} style={{ marginRight: 8 }} />
              <Text style={st.saveBtnTxt}>{saving ? 'Saving...' : 'SAVE CHANGES'}</Text>
            </LinearGradient>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <DatePicker
        modal
        open={showDobPicker}
        date={dobPickerDate}
        mode="date"
        maximumDate={today}
        onDateChange={setDobPickerDate}
        onConfirm={(date) => {
          setShowDobPicker(false);
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          set('date_of_birth', `${y}-${m}-${d}`);
        }}
        onCancel={() => setShowDobPicker(false)}
      />
    </LinearGradient>
  );
};

// ── Styles ────────────────────────────────────────────────
const getStyles = (COLORS) => StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 4 },
  title:         { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  roleBadgeRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 8 },
  roleBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  roleBadgeTxt:  { fontSize: 11, fontWeight: '700' },
  roleHint:      { color: COLORS.gray, fontSize: 11 },
  scroll:        { padding: 16, paddingBottom: 50 },
  card:          { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  sectionLabel:  { color: COLORS.gold, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 14 },
  field:         { marginBottom: 14 },
  label:         { color: COLORS.gray, fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 },
  input:         { backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 48, color: COLORS.white, fontSize: 15 },
  inputDisabled: { opacity: 0.45, color: COLORS.gray },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: COLORS.darkGray, borderWidth: 1, borderColor: COLORS.cardBorder },
  chipTxt:       { color: COLORS.gray, fontWeight: '600', fontSize: 13 },
  chipCompact:   { flex: 1, justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 7 },
  chipTxtCompact:{ fontSize: 11, textAlign: 'center' },
  passHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 },
  passRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  regenBtn:      { width: 48, height: 48, borderRadius: 10, backgroundColor: COLORS.darkGray, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gold },
  passWarn:      { color: '#EF4444', fontSize: 11, marginTop: 6 },
  dobBtn:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 48 },
  dobTxt:        { flex: 1, color: COLORS.gray, fontSize: 15 },
  styleGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  styleCard:     { width: '47%', backgroundColor: COLORS.darkGray, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center' },
  styleLabel:    { color: COLORS.white, fontWeight: '700', fontSize: 12 },
  styleDesc:     { color: COLORS.gray, fontSize: 10, marginTop: 2, textAlign: 'center' },
  saveBtn:       { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  saveBtnInner:  { flexDirection: 'row', height: 56, alignItems: 'center', justifyContent: 'center' },
  saveBtnTxt:    { color: COLORS.navy, fontWeight: '900', fontSize: 15, letterSpacing: 1 },
});

export default EditUserScreen;
