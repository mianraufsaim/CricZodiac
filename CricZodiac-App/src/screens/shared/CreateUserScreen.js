// ============================================================
// CricZodiac — Create User Screen (Admin + Umpire)
// Creates umpire OR player account with login credentials.
// After creation shows credentials + WhatsApp/Copy share.
// route.params.defaultRole = 'umpire' | 'player' | undefined (choose)
// ============================================================

import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Modal, Clipboard,
  Linking, Share, KeyboardAvoidingView, Platform,
} from 'react-native';
import DatePicker from 'react-native-date-picker';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { PLAYER_TYPES, BATTING_HAND, BOWLING_STYLES } from '../../config/constants';
import { createUserWithPlayer } from '../../database/queries/userQueries';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';
import { showAlert } from '../../utils/toast';

// ── Password Generator ────────────────────────────────────
const generatePassword = () => {
  const prefix = ['Quick', 'Swift', 'Sharp', 'Bold', 'Pace', 'Spin'];
  const suffix = ['Bat', 'Bowl', 'Run', 'Catch', 'Six', 'Ace'];
  const p = prefix[Math.floor(Math.random() * prefix.length)];
  const s = suffix[Math.floor(Math.random() * suffix.length)];
  const n = Math.floor(10 + Math.random() * 90);
  return `${p}${s}@${n}`;
};

// ── Credentials Modal ─────────────────────────────────────
const CredentialsModal = ({ visible, creds, onClose, COLORS, cr }) => {
  if (!creds) return null;

  const msg =
    `🏏 *CricZodiac Login Credentials*\n\n` +
    `Name: ${creds.name}\n` +
    (creds.email ? `Email: ${creds.email}\n` : '') +
    (creds.phone ? `Phone: ${creds.phone}\n` : '') +
    `Password: ${creds.password}\n\n` +
    `Role: ${creds.role.toUpperCase()}\n\n` +
    `Download the app and login with the above details.\n` +
    `_Powered by Zodiac Technologies_`;

  const copyToClipboard = () => {
    Clipboard.setString(msg);
    showAlert('Copied!', 'Credentials copied to clipboard.');
  };

  const shareWhatsApp = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Share.share({ message: msg });
    }
  };

  const shareGeneral = () => Share.share({ message: msg });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={cr.overlay}>
        <View style={cr.sheet}>
          {/* Close button — top right */}
          <View style={cr.modalHeader}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={cr.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="close" size={20} color={COLORS.gray} />
            </TouchableOpacity>
          </View>

          <View style={cr.iconRow}>
            <View style={cr.successIcon}>
              <Icon name="check-circle" size={40} color={COLORS.success} />
            </View>
          </View>
          <Text style={cr.title}>Account Created!</Text>
          <Text style={cr.subtitle}>Share these credentials with {creds.name}</Text>

          {/* Credential Card */}
          <View style={cr.credCard}>
            <CredRow label="Name"     value={creds.name}               COLORS={COLORS} cr={cr} />
            {creds.email && <CredRow label="Email"    value={creds.email}    COLORS={COLORS} cr={cr} />}
            {creds.phone && <CredRow label="Phone"    value={creds.phone}    COLORS={COLORS} cr={cr} />}
            <CredRow label="Password" value={creds.password} highlight  COLORS={COLORS} cr={cr} />
            <CredRow label="Role"     value={creds.role.toUpperCase()}  COLORS={COLORS} cr={cr} />
          </View>

          {/* Action Buttons */}
          <TouchableOpacity style={cr.whatsappBtn} onPress={shareWhatsApp}>
            <Icon name="whatsapp" size={22} color={COLORS.white} />
            <Text style={cr.whatsappTxt}>Share via WhatsApp</Text>
          </TouchableOpacity>

          <View style={cr.secondaryRow}>
            <TouchableOpacity style={cr.secBtn} onPress={copyToClipboard}>
              <Icon name="content-copy" size={18} color={COLORS.cyan} />
              <Text style={cr.secTxt}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cr.secBtn} onPress={shareGeneral}>
              <Icon name="share-variant" size={18} color={COLORS.gold} />
              <Text style={[cr.secTxt, { color: COLORS.gold }]}>Share</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={cr.doneBtn} onPress={onClose}>
            <Text style={cr.doneTxt}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const CredRow = ({ label, value, highlight, COLORS, cr }) => (
  <View style={cr.credRow}>
    <Text style={cr.credLabel}>{label}</Text>
    <Text style={[cr.credValue, highlight && { color: COLORS.gold, fontWeight: '800', fontSize: 16 }]}>{value}</Text>
  </View>
);

// ── Role Selector ─────────────────────────────────────────
const RoleBtn = ({ id, label, icon, color, active, onPress, COLORS, st }) => (
  <TouchableOpacity
    style={[st.roleBtn, active && { borderColor: color, backgroundColor: color + '18' }]}
    onPress={onPress}
  >
    <Icon name={icon} size={26} color={active ? color : COLORS.gray} />
    <Text style={[st.roleTxt, active && { color }]}>{label}</Text>
  </TouchableOpacity>
);

// ── Chip Selector ─────────────────────────────────────────
const Chips = ({ options, value, onChange, colorKey, COLORS, st }) => (
  <View style={st.chips}>
    {options.map(o => {
      const active = value === o.id;
      const color  = colorKey ? o[colorKey] : COLORS.cyan;
      return (
        <TouchableOpacity
          key={o.id}
          style={[st.chip, active && { borderColor: color, backgroundColor: color + '18' }]}
          onPress={() => onChange(o.id)}
        >
          {o.icon && <Icon name={o.icon} size={12} color={active ? color : COLORS.gray} style={{ marginRight: 3 }} />}
          <Text style={[st.chipTxt, active && { color }]}>{o.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// ── Main Screen ───────────────────────────────────────────
const CreateUserScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const { user, activeClub } = useAuth();
  const st = useMemo(() => getStStyles(COLORS), [COLORS]);
  const cr = useMemo(() => getCrStyles(COLORS), [COLORS]);

  const { defaultRole } = route?.params || {};
  const lockRole = !!defaultRole;  // if defaultRole passed, don't let them change it

  const [role, setRole]     = useState(defaultRole || 'player');
  const [form, setForm]     = useState({
    name: '', email: '', phone: '',
    player_type: 'allrounder', batting_hand: 'right', bowling_style: '',
    jersey_number: '', date_of_birth: '',
    password: generatePassword(),
  });
  const [saving,     setSaving]     = useState(false);
  const [creds,      setCreds]      = useState(null);
  const [showCreds,  setShowCreds]  = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);

  // Date picker working value — keeps picker position while open
  const [dobPickerDate, setDobPickerDate] = useState(new Date(2000, 0, 1));
  const today = new Date();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const regeneratePassword = () => set('password', generatePassword());

  const handleCreate = async () => {
    if (!form.name.trim())               { showAlert('Name is required');             return; }
    if (!form.email.trim() && !form.phone.trim()) {
      showAlert('Contact Required', 'Enter at least an email or phone number so the user can log in.');
      return;
    }
    if (!form.password.trim())           { showAlert('Password is required');          return; }

    setSaving(true);
    try {
      // Server duplicate check: same email + same club (offline → skip, server rejects on sync)
      if (form.email.trim()) {
        try {
          const res = await ApiService.get(
            `${API_ENDPOINTS.USERS_CHECK}?email=${encodeURIComponent(form.email.trim())}`
          );
          if (res.exists) {
            showAlert('Already Exists', 'A user with this email address already exists in your club.');
            setSaving(false);
            return;
          }
        } catch (_) {
          // Offline — proceed; server will reject duplicate on sync
        }
      }

      const clubId = activeClub?.server_id || user?.club_id || null;
      await createUserWithPlayer({ ...form, role, club_id: clubId });
      setCreds({ ...form, role });
      setShowCreds(true);
    } catch (e) {
      showAlert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCredsDone = () => {
    setShowCreds(false);
    navigation.goBack();
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={st.title}>Create Account</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">

          {/* Role selector (hidden if defaultRole locked) */}
          {!lockRole && (
            <View style={st.card}>
              <Text style={st.sectionLabel}>ACCOUNT TYPE</Text>
              <View style={st.roleRow}>
                <RoleBtn id="player" label="Player"  icon="account-outline" color={COLORS.gold}  active={role === 'player'} onPress={() => setRole('player')} COLORS={COLORS} st={st} />
              </View>
            </View>
          )}

          {/* Identity */}
          <View style={st.card}>
            <Text style={st.sectionLabel}>PLAYER INFO</Text>
            {[
              { label: 'Full Name *',  key: 'name',  kb: 'default',       cap: 'words' },
              { label: 'Email',        key: 'email', kb: 'email-address',  cap: 'none'  },
              { label: 'Phone',        key: 'phone', kb: 'phone-pad',      cap: 'none'  },
            ].map(f => (
              <View key={f.key} style={st.field}>
                <Text style={st.label}>{f.label}</Text>
                <TextInput
                  style={st.input}
                  value={form[f.key]}
                  onChangeText={v => set(f.key, v)}
                  keyboardType={f.kb}
                  autoCapitalize={f.cap}
                  placeholderTextColor={COLORS.gray}
                  placeholder={f.label}
                />
              </View>
            ))}
          </View>

          {/* Password */}
          <View style={st.card}>
            <Text style={st.sectionLabel}>LOGIN PASSWORD</Text>
            <Text style={st.hint}>Auto-generated. You can edit or tap 🔄 to regenerate.</Text>
            <View style={st.passRow}>
              <TextInput
                style={[st.input, { flex: 1 }]}
                value={form.password}
                onChangeText={v => set('password', v)}
                placeholderTextColor={COLORS.gray}
                autoCapitalize="none"
              />
              <TouchableOpacity style={st.regenBtn} onPress={regeneratePassword}>
                <Icon name="refresh" size={20} color={COLORS.gold} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Player-specific fields */}
          {role === 'player' && (
            <>
              <View style={st.card}>
                <Text style={st.sectionLabel}>PLAYER TYPE</Text>
                <Chips options={PLAYER_TYPES} value={form.player_type} onChange={v => set('player_type', v)} COLORS={COLORS} st={st} />
              </View>

              <View style={st.card}>
                <Text style={st.sectionLabel}>BATTING HAND</Text>
                <Chips options={BATTING_HAND} value={form.batting_hand} onChange={v => set('batting_hand', v)} COLORS={COLORS} st={st} />
              </View>

              {/* Jersey Number + Date of Birth */}
              <View style={st.card}>
                <Text style={st.sectionLabel}>ADDITIONAL INFO</Text>

                {/* Jersey Number */}
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

                {/* Date of Birth */}
                <View style={st.field}>
                  <Text style={st.label}>Date of Birth</Text>
                  <TouchableOpacity
                    style={st.dobBtn}
                    onPress={() => {
                      // seed picker at stored date or default
                      if (form.date_of_birth) {
                        setDobPickerDate(new Date(form.date_of_birth));
                      }
                      setShowDobPicker(true);
                    }}
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

          {/* Create Button */}
          <TouchableOpacity
            style={[st.createBtn, saving && { opacity: 0.5 }]}
            onPress={handleCreate}
            disabled={saving}
          >
            <LinearGradient colors={[COLORS.gold, '#B8942A']} style={st.createBtnInner}>
              <Icon name="account-plus" size={20} color={COLORS.navy} style={{ marginRight: 8 }} />
              <Text style={st.createBtnTxt}>
                {saving ? 'Creating...' : `CREATE ${role.toUpperCase()} ACCOUNT`}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <CredentialsModal
        visible={showCreds}
        creds={creds}
        onClose={handleCredsDone}
        COLORS={COLORS}
        cr={cr}
      />

      {/* Date of Birth Picker */}
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

// ── Style Factories ────────────────────────────────────────
const getStStyles = (COLORS) => StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 4 },
  title:         { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  scroll:        { padding: 16, paddingBottom: 50 },
  card:          { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  sectionLabel:  { color: COLORS.gold, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 14 },
  hint:          { color: COLORS.gray, fontSize: 12, marginBottom: 10 },
  field:         { marginBottom: 14 },
  label:         { color: COLORS.gray, fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 },
  input:         { backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 48, color: COLORS.white, fontSize: 15 },
  passRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  regenBtn:      { width: 48, height: 48, borderRadius: 10, backgroundColor: COLORS.darkGray, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gold },
  roleRow:       { flexDirection: 'row', gap: 12 },
  roleBtn:       { flex: 1, alignItems: 'center', paddingVertical: 16, backgroundColor: COLORS.darkGray, borderRadius: 14, borderWidth: 1, borderColor: COLORS.cardBorder, gap: 8 },
  roleTxt:       { color: COLORS.gray, fontWeight: '700', fontSize: 14 },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: COLORS.darkGray, borderWidth: 1, borderColor: COLORS.cardBorder },
  chipTxt:       { color: COLORS.gray, fontWeight: '600', fontSize: 13 },
  styleGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  styleCard:     { width: '47%', backgroundColor: COLORS.darkGray, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center' },
  styleLabel:    { color: COLORS.white, fontWeight: '700', fontSize: 12 },
  styleDesc:     { color: COLORS.gray, fontSize: 10, marginTop: 2, textAlign: 'center' },
  createBtn:     { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  createBtnInner:{ flexDirection: 'row', height: 56, alignItems: 'center', justifyContent: 'center' },
  createBtnTxt:  { color: COLORS.navy, fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  dobBtn:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 48 },
  dobTxt:        { flex: 1, color: COLORS.gray, fontSize: 15 },
});

const getCrStyles = (COLORS) => StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: COLORS.navy, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.darkGray, alignItems: 'center', justifyContent: 'center' },
  iconRow:     { alignItems: 'center', marginBottom: 8 },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.success + '22', alignItems: 'center', justifyContent: 'center' },
  title:       { color: COLORS.white, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle:    { color: COLORS.gray, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  credCard:    { backgroundColor: COLORS.darkGray, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.cardBorder },
  credRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  credLabel:   { color: COLORS.gray, fontSize: 13 },
  credValue:   { color: COLORS.white, fontSize: 13, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  whatsappBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#25D366', borderRadius: 14, height: 54, marginBottom: 12 },
  whatsappTxt: { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  secondaryRow:{ flexDirection: 'row', gap: 10, marginBottom: 12 },
  secBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.darkGray, borderRadius: 12, height: 48, borderWidth: 1, borderColor: COLORS.cardBorder },
  secTxt:      { color: COLORS.cyan, fontWeight: '700', fontSize: 14 },
  doneBtn:     { height: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.darkGray, borderRadius: 12 },
  doneTxt:     { color: COLORS.gray, fontWeight: '600', fontSize: 15 },
});

export default CreateUserScreen;
