// ============================================================
// CricZodiac — Club Admin: Edit Profile
// Pre-filled from API. Styled like CreateClubScreen.
// Sections: PERSONAL INFO + CHANGE PASSWORD (optional)
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { API_ENDPOINTS } from '../../config/api';
import ApiService from '../../services/ApiService';
import { showAlert } from '../../utils/toast';

// ── Reusable field ────────────────────────────────────────
const Field = ({ icon, placeholder, value, onChangeText, keyboardType, autoCapitalize,
                 secureTextEntry, right, editable = true, styles, COLORS }) => (
  <View style={[styles.field, !editable && { opacity: 0.5 }]}>
    <Icon name={icon} size={18} color={COLORS.gray} style={styles.fieldIcon} />
    <TextInput
      style={styles.fieldInput}
      placeholder={placeholder}
      placeholderTextColor={COLORS.gray}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType || 'default'}
      autoCapitalize={autoCapitalize || 'sentences'}
      secureTextEntry={secureTextEntry}
      editable={editable}
    />
    {right}
  </View>
);

const EditProfileScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const { user, login } = useAuth();

  // Profile fields
  const [name,  setName]  = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Password fields
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [showCurr,   setShowCurr]   = useState(false);
  const [showNew,    setShowNew]    = useState(false);
  const [showConf,   setShowConf]   = useState(false);

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  // Load current profile on screen focus
  useFocusEffect(useCallback(() => {
    loadProfile();
  }, []));

  const loadProfile = async () => {
    setLoading(true);
    try {
      const val = await ApiService.get(API_ENDPOINTS.PROFILE);
      const p   = val.profile ?? {};
      setName(p.name     ?? '');
      setEmail(p.email   ?? '');
      setPhone(p.phone   ?? '');
    } catch (e) {
      showAlert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim())  return showAlert('Validation', 'Full name is required.');
    if (!email.trim()) return showAlert('Validation', 'Email is required.');
    if (!phone.trim()) return showAlert('Validation', 'Phone is required.');

    const changingPassword = currentPw || newPw || confirmPw;
    if (changingPassword) {
      if (!currentPw) return showAlert('Validation', 'Enter your current password.');
      if (newPw.length < 8) return showAlert('Validation', 'New password must be at least 8 characters.');
      if (newPw !== confirmPw) return showAlert('Validation', 'New passwords do not match.');
    }

    setSaving(true);
    try {
      const body = { name: name.trim(), email: email.trim(), phone: phone.trim() };
      if (changingPassword) {
        body.current_password = currentPw;
        body.new_password     = newPw;
        body.confirm_password = confirmPw;
      }

      const val = await ApiService.post(API_ENDPOINTS.PROFILE, body);

      // Update auth context with new name/email
      if (val.profile && login) {
        await login({ ...user, name: val.profile.name, email: val.profile.email });
      }

      // Clear password fields
      setCurrentPw(''); setNewPw(''); setConfirmPw('');

      showAlert('Success', 'Profile updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      showAlert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Icon name="arrow-left" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <Text style={styles.headerSub}>Update your account information</Text>
        </View>
        <View style={[styles.headerAvatar, { backgroundColor: COLORS.gold + '22' }]}>
          <Text style={[styles.headerAvatarTxt, { color: COLORS.gold }]}>
            {(name || user?.name || '?')[0].toUpperCase()}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info notice */}
        <View style={styles.notice}>
          <Icon name="account-edit" size={18} color={COLORS.cyan} />
          <Text style={styles.noticeTxt}>
            Changes to name, email, and phone take effect immediately. Password change requires your current password.
          </Text>
        </View>


        {/* ── PERSONAL INFORMATION ─────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PERSONAL INFORMATION</Text>

          <Field
            icon="account"
            placeholder="Full Name *"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            styles={styles}
            COLORS={COLORS}
          />
          <Field
            icon="email-outline"
            placeholder="Email Address *"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            styles={styles}
            COLORS={COLORS}
          />
          <Field
            icon="phone"
            placeholder="Phone Number *"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            styles={styles}
            COLORS={COLORS}
          />
        </View>

        {/* ── CHANGE PASSWORD ──────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CHANGE PASSWORD</Text>
          <Text style={styles.sectionHint}>Leave blank to keep your current password</Text>

          <Field
            icon="lock-outline"
            placeholder="Current Password"
            value={currentPw}
            onChangeText={setCurrentPw}
            autoCapitalize="none"
            secureTextEntry={!showCurr}
            right={
              <TouchableOpacity onPress={() => setShowCurr(v => !v)}>
                <Icon name={showCurr ? 'eye-off' : 'eye'} size={18} color={COLORS.gray} />
              </TouchableOpacity>
            }
            styles={styles}
            COLORS={COLORS}
          />
          <Field
            icon="lock-plus-outline"
            placeholder="New Password (8+ characters)"
            value={newPw}
            onChangeText={setNewPw}
            autoCapitalize="none"
            secureTextEntry={!showNew}
            right={
              <TouchableOpacity onPress={() => setShowNew(v => !v)}>
                <Icon name={showNew ? 'eye-off' : 'eye'} size={18} color={COLORS.gray} />
              </TouchableOpacity>
            }
            styles={styles}
            COLORS={COLORS}
          />
          <Field
            icon="lock-check-outline"
            placeholder="Confirm New Password"
            value={confirmPw}
            onChangeText={setConfirmPw}
            autoCapitalize="none"
            secureTextEntry={!showConf}
            right={
              <TouchableOpacity onPress={() => setShowConf(v => !v)}>
                <Icon name={showConf ? 'eye-off' : 'eye'} size={18} color={COLORS.gray} />
              </TouchableOpacity>
            }
            styles={styles}
            COLORS={COLORS}
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.saveBtnGrad}>
            {saving
              ? <ActivityIndicator size="small" color={COLORS.navy} />
              : <>
                  <Icon name="content-save" size={18} color={COLORS.navy} />
                  <Text style={styles.saveBtnTxt}>SAVE CHANGES</Text>
                </>
            }
          </LinearGradient>
        </TouchableOpacity>

      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  loadingWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:         {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  backBtn:        { padding: 6 },
  headerTitle:    { color: COLORS.white, fontSize: 17, fontWeight: '800' },
  headerSub:      { color: COLORS.gray, fontSize: 11, marginTop: 1 },
  headerAvatar:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerAvatarTxt:{ fontSize: 18, fontWeight: '900' },

  scroll:         { padding: 16, paddingBottom: 40 },

  notice:         {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.cyan + '14', borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.cyan + '30',
    padding: 12, marginBottom: 14,
  },
  noticeTxt:      { flex: 1, color: COLORS.lightGray, fontSize: 13, lineHeight: 19 },

  section:        {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  sectionLabel:   { color: COLORS.gold, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 14 },
  sectionHint:    { color: COLORS.gray, fontSize: 11, marginTop: -10, marginBottom: 14 },

  field:          {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.darkGray, borderRadius: 12,
    paddingHorizontal: 14, height: 52, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  fieldIcon:      { marginRight: 10 },
  fieldInput:     { flex: 1, color: COLORS.white, fontSize: 15 },

  saveBtn:        { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  saveBtnGrad:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, gap: 8 },
  saveBtnTxt:     { color: COLORS.navy, fontWeight: '900', fontSize: 14, letterSpacing: 2 },
});

export default EditProfileScreen;
