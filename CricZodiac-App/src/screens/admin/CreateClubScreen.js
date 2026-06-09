// ============================================================
// CricZodiac — Create Club Screen (Super Admin)
// Same fields as registration form. Auto-approved — no pending.
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { API_ENDPOINTS } from '../../config/api';
import ApiService from '../../services/ApiService';
import { showAlert } from '../../utils/toast';

// ── Reusable input ────────────────────────────────────────
const InputField = ({
  icon, placeholder, value, onChangeText,
  keyboardType, secureTextEntry, rightIcon, onRightIcon,
  COLORS, styles,
}) => (
  <View style={styles.inputWrapper}>
    <Icon name={icon} size={20} color={COLORS.gray} style={styles.inputIcon} />
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={COLORS.gray}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType || 'default'}
      secureTextEntry={secureTextEntry}
      autoCapitalize="none"
      autoCorrect={false}
    />
    {rightIcon && (
      <TouchableOpacity onPress={onRightIcon} style={styles.eyeIcon}>
        <Icon name={rightIcon} size={20} color={COLORS.gray} />
      </TouchableOpacity>
    )}
  </View>
);

// ── Section header ────────────────────────────────────────
const SectionLabel = ({ title, COLORS }) => (
  <Text style={{ color: COLORS.gold, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 12, marginTop: 8 }}>
    {title}
  </Text>
);

const CreateClubScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [form, setForm] = useState({
    // Club
    club_name:     '',
    country:       '',
    city:          '',
    contact_email: '',
    // Admin
    admin_name:    '',
    admin_email:   '',
    admin_phone:   '',
    admin_password:         '',
    admin_confirm_password: '',
  });

  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleCreate = async () => {
    const { club_name, admin_name, admin_email, admin_phone, admin_password, admin_confirm_password } = form;

    if (!club_name.trim())   { showAlert('Missing Fields', 'Club name is required.');         return; }
    if (!admin_name.trim())  { showAlert('Missing Fields', 'Admin full name is required.');   return; }
    if (!admin_email.trim()) { showAlert('Missing Fields', 'Admin email is required.');        return; }
    if (!admin_phone.trim()) { showAlert('Missing Fields', 'Admin phone is required.');        return; }
    if (!admin_password)     { showAlert('Missing Fields', 'Password is required.');           return; }
    if (admin_password !== admin_confirm_password) {
      showAlert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (admin_password.length < 8) {
      showAlert('Weak Password', 'Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await ApiService.post(API_ENDPOINTS.SUPER_ADMIN_CREATE_CLUB, {
        club_name:      club_name.trim(),
        country:        form.country.trim(),
        city:           form.city.trim(),
        contact_email:  form.contact_email.trim() || admin_email.trim(),
        admin_name:     admin_name.trim(),
        admin_email:    admin_email.trim(),
        admin_phone:    admin_phone.trim(),
        admin_password: admin_password,
      });

      showAlert(
        '✓ Club Created',
        `${club_name.trim()} has been created and the admin account is active.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      showAlert('Creation Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Icon name="arrow-left" size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add New Club</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Info chip */}
          <View style={styles.infoChip}>
            <Icon name="shield-account" size={16} color={COLORS.cyan} />
            <Text style={styles.infoText}>
              Creating as <Text style={{ color: COLORS.gold, fontWeight: '700' }}>Super Admin</Text> — the club and admin account will be active immediately with no approval step.
            </Text>
          </View>

          {/* ── Club Info Section ── */}
          <View style={styles.card}>
            <SectionLabel title="CLUB DETAILS" COLORS={COLORS} />

            <InputField
              icon="shield-star"
              placeholder="Club Name *"
              value={form.club_name}
              onChangeText={v => set('club_name', v)}
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="earth"
              placeholder="Country"
              value={form.country}
              onChangeText={v => set('country', v)}
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="city"
              placeholder="City"
              value={form.city}
              onChangeText={v => set('city', v)}
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="email-outline"
              placeholder="Club Contact Email"
              value={form.contact_email}
              onChangeText={v => set('contact_email', v)}
              keyboardType="email-address"
              COLORS={COLORS}
              styles={styles}
            />

            {/* Divider */}
            <View style={styles.divider} />
            <SectionLabel title="CLUB ADMIN ACCOUNT" COLORS={COLORS} />

            <InputField
              icon="account"
              placeholder="Admin Full Name *"
              value={form.admin_name}
              onChangeText={v => set('admin_name', v)}
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="email"
              placeholder="Admin Email *"
              value={form.admin_email}
              onChangeText={v => set('admin_email', v)}
              keyboardType="email-address"
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="phone"
              placeholder="Admin Phone *"
              value={form.admin_phone}
              onChangeText={v => set('admin_phone', v)}
              keyboardType="phone-pad"
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="lock"
              placeholder="Password (8+ characters) *"
              value={form.admin_password}
              onChangeText={v => set('admin_password', v)}
              secureTextEntry={!showPass}
              rightIcon={showPass ? 'eye-off' : 'eye'}
              onRightIcon={() => setShowPass(p => !p)}
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="lock-check"
              placeholder="Confirm Password *"
              value={form.admin_confirm_password}
              onChangeText={v => set('admin_confirm_password', v)}
              secureTextEntry={!showConfirm}
              rightIcon={showConfirm ? 'eye-off' : 'eye'}
              onRightIcon={() => setShowConfirm(p => !p)}
              COLORS={COLORS}
              styles={styles}
            />

            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={handleCreate}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.btnGradient}>
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={COLORS.navy} />
                    <Text style={styles.btnText}>Creating Club...</Text>
                  </View>
                ) : (
                  <>
                    <Icon name="plus-circle" size={18} color={COLORS.navy} />
                    <Text style={styles.btnText}>CREATE CLUB</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  scroll:       { flexGrow: 1, padding: 20, paddingBottom: 50 },

  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, marginBottom: 20 },
  backBtn:      { padding: 4 },
  headerTitle:  { fontSize: 19, fontWeight: '800', color: COLORS.white },

  infoChip:     {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.cyan + '14', borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.cyan + '33',
    padding: 12, marginBottom: 20,
  },
  infoText:     { flex: 1, color: COLORS.lightGray, fontSize: 13, lineHeight: 20 },

  card:         { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.cardBorder },

  divider:      { height: 1, backgroundColor: COLORS.cardBorder, marginVertical: 16 },

  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkGray, borderRadius: 12, marginBottom: 14, paddingHorizontal: 12 },
  inputIcon:    { marginRight: 8 },
  input:        { flex: 1, height: 50, color: COLORS.white, fontSize: 15 },
  eyeIcon:      { padding: 4 },

  btn:          { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  btnGradient:  { height: 52, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnText:      { color: COLORS.navy, fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  loadingRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

export default CreateClubScreen;
