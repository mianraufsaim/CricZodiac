// ============================================================
// CricZodiac — Club Admin: Edit Club Information
// Pre-filled from API. Accessible via club badge in EditProfile.
// Fields: Club Name, Country, City, Contact Email
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { API_ENDPOINTS } from '../../config/api';
import ApiService from '../../services/ApiService';

// ── Reusable field ────────────────────────────────────────
const Field = ({ icon, placeholder, value, onChangeText, keyboardType,
                 autoCapitalize, editable = true, styles, COLORS }) => (
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
      editable={editable}
    />
  </View>
);

const EditClubScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [clubName,      setClubName]      = useState('');
  const [country,       setCountry]       = useState('');
  const [city,          setCity]          = useState('');
  const [contactEmail,  setContactEmail]  = useState('');
  const [status,        setStatus]        = useState('');

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // Load club info on screen focus
  useFocusEffect(useCallback(() => {
    loadClub();
  }, []));

  const loadClub = async () => {
    setLoading(true);
    try {
      const val = await ApiService.get(API_ENDPOINTS.ADMIN_CLUB);
      const c   = val.club ?? {};
      setClubName(c.name          ?? '');
      setCountry(c.country        ?? '');
      setCity(c.city              ?? '');
      setContactEmail(c.contact_email ?? '');
      setStatus(c.status          ?? '');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!clubName.trim()) return Alert.alert('Validation', 'Club name is required.');

    setSaving(true);
    try {
      await ApiService.post(API_ENDPOINTS.ADMIN_CLUB, {
        name:          clubName.trim(),
        country:       country.trim(),
        city:          city.trim(),
        contact_email: contactEmail.trim(),
      });

      Alert.alert('Success', 'Club information updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message);
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
          <Text style={styles.headerTitle}>Edit Club</Text>
          <Text style={styles.headerSub}>Update your club information</Text>
        </View>
        {/* Club shield avatar */}
        <View style={[styles.headerAvatar, { backgroundColor: COLORS.gold + '22' }]}>
          <Icon name="shield-star" size={22} color={COLORS.gold} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info notice */}
        <View style={styles.notice}>
          <Icon name="shield-edit" size={18} color={COLORS.gold} />
          <Text style={styles.noticeTxt}>
            Update your club's name, location, and contact email. Club status is managed by the super admin.
          </Text>
        </View>

        {/* Status badge (read-only) */}
        {!!status && (
          <View style={[styles.statusBadge, { backgroundColor: statusColor(status, COLORS) + '22', borderColor: statusColor(status, COLORS) + '55' }]}>
            <Icon name={statusIcon(status)} size={13} color={statusColor(status, COLORS)} />
            <Text style={[styles.statusBadgeTxt, { color: statusColor(status, COLORS) }]}>
              {status.toUpperCase()}
            </Text>
          </View>
        )}

        {/* ── CLUB INFORMATION ─────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CLUB INFORMATION</Text>

          <Field
            icon="shield-star"
            placeholder="Club Name *"
            value={clubName}
            onChangeText={setClubName}
            autoCapitalize="words"
            styles={styles}
            COLORS={COLORS}
          />
          <Field
            icon="earth"
            placeholder="Country"
            value={country}
            onChangeText={setCountry}
            autoCapitalize="words"
            styles={styles}
            COLORS={COLORS}
          />
          <Field
            icon="map-marker"
            placeholder="City"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
            styles={styles}
            COLORS={COLORS}
          />
          <Field
            icon="email-outline"
            placeholder="Contact Email"
            value={contactEmail}
            onChangeText={setContactEmail}
            keyboardType="email-address"
            autoCapitalize="none"
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

// ── Helpers ────────────────────────────────────────────────
const statusColor = (status, COLORS) => {
  if (status === 'active')    return COLORS.success;
  if (status === 'suspended') return COLORS.danger;
  if (status === 'pending')   return COLORS.warning;
  return COLORS.gray;
};
const statusIcon = (status) => {
  if (status === 'active')    return 'check-circle';
  if (status === 'suspended') return 'cancel';
  if (status === 'pending')   return 'clock-outline';
  return 'help-circle-outline';
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

  scroll:         { padding: 16, paddingBottom: 40 },

  notice:         {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.gold + '14', borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.gold + '30',
    padding: 12, marginBottom: 14,
  },
  noticeTxt:      { flex: 1, color: COLORS.lightGray, fontSize: 13, lineHeight: 19 },

  statusBadge:    {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14, alignSelf: 'flex-start',
  },
  statusBadgeTxt: { fontWeight: '700', fontSize: 12, letterSpacing: 1 },

  section:        {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  sectionLabel:   { color: COLORS.gold, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 14 },

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

export default EditClubScreen;
