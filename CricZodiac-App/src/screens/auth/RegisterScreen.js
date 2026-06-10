// ============================================================
// CricZodiac — Club Admin Registration
// Only club admins self-register. Umpires & players are
// created by admins/umpires inside the app.
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../../context/ThemeContext';
import { register } from '../../services/AuthService';
import { showAlert } from '../../utils/toast';

// ── Reusable input ────────────────────────────────────────
const InputField = ({
  icon, placeholder, value, onChangeText, keyboardType,
  secureTextEntry, rightIcon, onRightIcon, autoCapitalize,
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
      autoCapitalize={autoCapitalize || 'none'}
      autoCorrect={false}
    />
    {rightIcon && (
      <TouchableOpacity onPress={onRightIcon} style={styles.eyeIcon}>
        <Icon name={rightIcon} size={20} color={COLORS.gray} />
      </TouchableOpacity>
    )}
  </View>
);

const SectionLabel = ({ label, styles }) => (
  <Text style={styles.sectionLabel}>{label}</Text>
);

const RegisterScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [form, setForm] = useState({
    // Personal details
    name:                '',
    email:               '',
    phone:               '',
    password:            '',
    confirm_password:    '',
    // Club details
    club_name:           '',
    club_country:        '',
    club_city:           '',
    club_contact_email:  '',
  });

  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [isOnline, setIsOnline]       = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected && state.isInternetReachable !== false);
    });
    return unsub;
  }, []);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleRegister = async () => {
    const { name, email, phone, club_name, password, confirm_password } = form;

    if (!name.trim() || !email.trim() || !phone.trim() || !club_name.trim() || !password) {
      showAlert('Missing Fields', 'Please fill in all required fields (marked *).');
      return;
    }
    if (password !== confirm_password) {
      showAlert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      showAlert('Weak Password', 'Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await register({
        name:               name.trim(),
        email:              email.trim(),
        phone:              phone.trim(),
        password,
        club_name:          club_name.trim(),
        club_country:       form.club_country.trim(),
        club_city:          form.club_city.trim(),
        club_contact_email: form.club_contact_email.trim(),
        role:               'admin',
      });

      showAlert(
        'Registration Submitted',
        'Your club admin account is pending approval. You will be notified once Zodiac Technologies activates it.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } catch (err) {
      showAlert('Registration Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Icon name="arrow-left" size={24} color={COLORS.white} />
            </TouchableOpacity>
            <View style={styles.netRow}>
              <View style={[styles.netDot, { backgroundColor: isOnline ? COLORS.success : COLORS.danger }]} />
              <Text style={[styles.netLabel, { color: isOnline ? COLORS.success : COLORS.danger }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoBg}>
              <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={styles.logoGrad}>
                <Text style={styles.logoZ}>Z</Text>
              </LinearGradient>
            </View>
            <Text style={styles.title}>Club Admin</Text>
            <Text style={styles.subtitle}>Register your cricket club</Text>
          </View>

          {/* Info chip */}
          <View style={styles.infoChip}>
            <Icon name="shield-account" size={16} color={COLORS.cyan} />
            <Text style={styles.infoText}>
              This form is for <Text style={{ color: COLORS.gold, fontWeight: '700' }}>Club Admins</Text> only.
              Players are added by the admin inside the app.
            </Text>
          </View>

          {/* ── YOUR DETAILS ──────────────────────────────── */}
          <View style={styles.card}>
            <SectionLabel label="YOUR DETAILS" styles={styles} />

            <InputField
              icon="account"
              placeholder="Full Name *"
              value={form.name}
              onChangeText={v => update('name', v)}
              autoCapitalize="words"
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="email"
              placeholder="Email Address *"
              value={form.email}
              onChangeText={v => update('email', v)}
              keyboardType="email-address"
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="phone"
              placeholder="Phone Number *"
              value={form.phone}
              onChangeText={v => update('phone', v)}
              keyboardType="phone-pad"
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="lock"
              placeholder="Password (8+ characters) *"
              value={form.password}
              onChangeText={v => update('password', v)}
              secureTextEntry={!showPass}
              rightIcon={showPass ? 'eye-off' : 'eye'}
              onRightIcon={() => setShowPass(p => !p)}
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="lock-check"
              placeholder="Confirm Password *"
              value={form.confirm_password}
              onChangeText={v => update('confirm_password', v)}
              secureTextEntry={!showConfirm}
              rightIcon={showConfirm ? 'eye-off' : 'eye'}
              onRightIcon={() => setShowConfirm(p => !p)}
              COLORS={COLORS}
              styles={styles}
            />
          </View>

          {/* ── CLUB DETAILS ──────────────────────────────── */}
          <View style={styles.card}>
            <SectionLabel label="CLUB DETAILS" styles={styles} />

            <InputField
              icon="shield-star"
              placeholder="Club Name *"
              value={form.club_name}
              onChangeText={v => update('club_name', v)}
              autoCapitalize="words"
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="earth"
              placeholder="Country"
              value={form.club_country}
              onChangeText={v => update('club_country', v)}
              autoCapitalize="words"
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="map-marker"
              placeholder="City"
              value={form.club_city}
              onChangeText={v => update('club_city', v)}
              autoCapitalize="words"
              COLORS={COLORS}
              styles={styles}
            />
            <InputField
              icon="email-outline"
              placeholder="Club Contact Email"
              value={form.club_contact_email}
              onChangeText={v => update('club_contact_email', v)}
              keyboardType="email-address"
              COLORS={COLORS}
              styles={styles}
            />
          </View>

          {/* Submit */}
          <View style={styles.submitWrap}>
            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={handleRegister}
              disabled={loading}
            >
              <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.btnGradient}>
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={COLORS.navy} />
                    <Text style={styles.btnText}>Submitting...</Text>
                  </View>
                ) : (
                  <Text style={styles.btnText}>REGISTER CLUB</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.note}>
              Your account will be reviewed and approved by Zodiac Technologies before you can sign in.
            </Text>

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
              <Text style={styles.linkText}>
                Already have an account?{'  '}
                <Text style={styles.linkBold}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  scroll:       { flexGrow: 1, padding: 24, paddingBottom: 48 },
  topRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 16 },
  netRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  netDot:       { width: 8, height: 8, borderRadius: 4 },
  netLabel:     { fontSize: 11, fontWeight: '600' },
  loadingRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },

  header:       { alignItems: 'center', marginBottom: 20 },
  logoBg:       { marginBottom: 12 },
  logoGrad:     { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  logoZ:        { fontSize: 32, fontWeight: '900', color: COLORS.white, fontStyle: 'italic' },
  title:        { fontSize: 26, fontWeight: '900', color: COLORS.white, letterSpacing: 2 },
  subtitle:     { color: COLORS.gold, fontSize: 13, marginTop: 4 },

  infoChip:     {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.cyan + '14', borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.cyan + '33',
    padding: 12, marginBottom: 20,
  },
  infoText:     { flex: 1, color: COLORS.lightGray, fontSize: 13, lineHeight: 20 },

  card:         {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  sectionLabel: {
    color: COLORS.gold, fontSize: 11, fontWeight: '800',
    letterSpacing: 2, marginBottom: 14,
  },

  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.darkGray, borderRadius: 12,
    marginBottom: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  inputIcon:    { marginRight: 8 },
  input:        { flex: 1, height: 50, color: COLORS.white, fontSize: 15 },
  eyeIcon:      { padding: 4 },

  submitWrap:   {},
  btn:          { borderRadius: 12, overflow: 'hidden' },
  btnGradient:  { height: 52, alignItems: 'center', justifyContent: 'center' },
  btnText:      { color: COLORS.navy, fontSize: 15, fontWeight: '800', letterSpacing: 2 },

  note:         { color: COLORS.gray, fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
  link:         { alignItems: 'center', marginTop: 16 },
  linkText:     { color: COLORS.gray, fontSize: 14 },
  linkBold:     { color: COLORS.gold, fontWeight: '700' },
});

export default RegisterScreen;
