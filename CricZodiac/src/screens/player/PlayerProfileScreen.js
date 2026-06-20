// ============================================================
// CricZodiac — Player Profile Screen (self-edit)
// All data fetched & saved via API — no local SQLite.
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, KeyboardAvoidingView, Platform,
  RefreshControl, ActivityIndicator, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DatePicker from 'react-native-date-picker';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { PLAYER_TYPES, BATTING_HAND, BOWLING_STYLES } from '../../config/constants';
import { useAuth } from '../../context/AuthContext';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';
import { showAlert } from '../../utils/toast';

// ── Chip Selector ─────────────────────────────────────────
const ChipSelector = ({ options, value, onChange, COLORS, st }) => (
  <View style={st.chipRow}>
    {options.map(opt => {
      const active = value === opt.id;
      const color  = opt.color || COLORS.cyan;
      return (
        <TouchableOpacity
          key={opt.id}
          style={[st.chip, active && { backgroundColor: color + '22', borderColor: color }]}
          onPress={() => onChange(opt.id)}
          activeOpacity={0.75}
        >
          {opt.icon && <Icon name={opt.icon} size={13} color={active ? color : COLORS.gray} style={{ marginRight: 4 }} />}
          <Text style={[st.chipText, active && { color }]}>{opt.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// ── Bowling Style Grid ────────────────────────────────────
const BowlingStyleGrid = ({ value, onChange, st }) => (
  <View style={st.styleGrid}>
    {BOWLING_STYLES.map(s => {
      const active = value === s.id;
      return (
        <TouchableOpacity
          key={s.id}
          style={[st.styleCard, active && { borderColor: s.color, backgroundColor: s.color + '18' }]}
          onPress={() => onChange(s.id)}
          activeOpacity={0.75}
        >
          <Text style={[st.styleLabel, active && { color: s.color }]}>{s.label}</Text>
          <Text style={st.styleDesc} numberOfLines={1}>{s.desc}</Text>
          {active && <Icon name="check-circle" size={14} color={s.color} style={{ marginTop: 4 }} />}
        </TouchableOpacity>
      );
    })}
  </View>
);

// ── Field Row ─────────────────────────────────────────────
const FieldRow = ({ label, fieldKey, form, set, keyboard, cap, icon, COLORS, st }) => (
  <View style={st.field}>
    <View style={st.fieldLabel}>
      {icon && <Icon name={icon} size={12} color={COLORS.gray} />}
      <Text style={st.label}>{label}</Text>
    </View>
    <TextInput
      style={st.input}
      value={form[fieldKey]}
      onChangeText={v => set(fieldKey, v)}
      keyboardType={keyboard || 'default'}
      autoCapitalize={cap || 'none'}
      placeholderTextColor={COLORS.gray + '88'}
      placeholder={label}
    />
  </View>
);

// ── Main ──────────────────────────────────────────────────
const PlayerProfileScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const st = useMemo(() => getStStyles(COLORS), [COLORS]);
  const { user } = useAuth();

  const [playerId,   setPlayerId]   = useState(null);
  const [form,       setForm]       = useState({
    full_name: '', email: '', phone: '',
    player_type: 'allrounder', batting_hand: 'right',
    bowling_style: '', jersey_number: '', date_of_birth: '',
    profile_pic: null,
  });
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newImageUri, setNewImageUri] = useState(null);
  const [dobOpen,    setDobOpen]    = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const supportsBowlingStyle = ['bowler', 'allrounder'].includes(form.player_type);
  const setPlayerType = (playerType) => setForm(f => ({
    ...f,
    player_type: playerType,
    bowling_style: playerType === 'batsman' ? '' : f.bowling_style,
  }));

  // ── Load ──────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [playerRes, userRes] = await Promise.all([
        ApiService.get(API_ENDPOINTS.PLAYERS_MY_STATS),
        ApiService.get(API_ENDPOINTS.PROFILE),
      ]);
      const p = playerRes?.profile;
      const u = userRes?.profile;
      if (p) {
        setPlayerId(p.id);
        setForm(f => ({
          ...f,
          full_name:    u?.name          || '',
          email:        u?.email         || '',
          phone:        u?.phone         || '',
          player_type:  p.player_type    || 'allrounder',
          batting_hand: p.batting_hand   || 'right',
          bowling_style:p.player_type === 'batsman' ? '' : p.bowling_style || '',
          jersey_number:p.jersey_number  || '',
          date_of_birth:p.date_of_birth  || '',
          profile_pic:  p.profile_pic    || null,
        }));
      } else if (u) {
        setForm(f => ({ ...f, full_name: u.name || '', email: u.email || '', phone: u.phone || '' }));
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ── Save ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.full_name.trim()) { showAlert('Name is required'); return; }
    setSaving(true);
    try {
      // 1. Upload image if new one was picked
      if (newImageUri && playerId) {
        const imgData = new FormData();
        const ext = newImageUri.split('.').pop() || 'jpg';
        imgData.append('profile_pic', { uri: newImageUri, type: `image/${ext}`, name: `profile.${ext}` });
        imgData.append('player_id', String(playerId));
        const imgRes = await ApiService.post(API_ENDPOINTS.UPLOAD_PROFILE, imgData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (imgRes?.url) set('profile_pic', imgRes.url);
        setNewImageUri(null);
      }

      // 2. Update user (name / email / phone)
      await ApiService.post(API_ENDPOINTS.PROFILE, {
        name:  form.full_name.trim(),
        phone: form.phone.trim() || undefined,
      });

      // 3. Update player fields (only if player profile exists)
      if (playerId) {
        await ApiService.post(API_ENDPOINTS.PLAYERS_UPDATE, {
          player_type:   form.player_type,
          batting_hand:  form.batting_hand,
          bowling_style: supportsBowlingStyle ? form.bowling_style || null : null,
          jersey_number: form.jersey_number || null,
          date_of_birth: form.date_of_birth || null,
        });
      }

      showAlert('Saved', 'Profile updated successfully.');
    } catch (err) {
      showAlert('Error', err?.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  // ── Image picker ─────────────────────────────────────
  const pickImage = () => {
    showAlert('Profile Picture', 'Choose source', [
      {
        text: 'Camera',
        onPress: () => launchCamera({ mediaType: 'photo', quality: 0.8, saveToPhotos: false }, res => {
          if (!res.didCancel && res.assets?.[0]?.uri) {
            setNewImageUri(res.assets[0].uri);
            set('profile_pic', res.assets[0].uri);
          }
        }),
      },
      {
        text: 'Gallery',
        onPress: () => launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, res => {
          if (!res.didCancel && res.assets?.[0]?.uri) {
            setNewImageUri(res.assets[0].uri);
            set('profile_pic', res.assets[0].uri);
          }
        }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const bowlingStyleObj = BOWLING_STYLES.find(s => s.id === form.bowling_style);
  const avatarLetter    = form.full_name?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase() || 'P';

  if (loading) return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={st.center}>
      <ActivityIndicator size="large" color={COLORS.gold} />
    </LinearGradient>
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Header ── */}
      <View style={st.header}>
        <View>
          <Text style={st.title}>My Profile</Text>
          <Text style={st.subtitle}>Edit your player details</Text>
        </View>
        <TouchableOpacity
          style={[st.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          <LinearGradient colors={[COLORS.gold, '#B8942A']} style={st.saveBtnInner}>
            {saving
              ? <ActivityIndicator size="small" color={COLORS.navy} />
              : <Text style={st.saveTxt}>SAVE</Text>
            }
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={st.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />}
        >

          {/* ── Personal Info ── */}
          <View style={st.card}>
            <View style={st.cardTitleRow}>
              <Icon name="account-outline" size={14} color={COLORS.gold} />
              <Text style={st.cardTitle}>PERSONAL INFO</Text>
            </View>
            <FieldRow label="Full Name"    fieldKey="full_name"    form={form} set={set} keyboard="default"       cap="words" icon="account"        COLORS={COLORS} st={st} />
            <View style={st.field}>
              <View style={st.fieldLabel}>
                <Icon name="email-outline" size={12} color={COLORS.gray} />
                <Text style={st.label}>Email</Text>
                <View style={st.lockedBadge}>
                  <Icon name="lock-outline" size={9} color={COLORS.gray} />
                  <Text style={st.lockedTxt}>Read only</Text>
                </View>
              </View>
              <View style={[st.input, st.inputDisabled]}>
                <Text style={st.inputDisabledTxt}>{form.email || '—'}</Text>
              </View>
            </View>
            <FieldRow label="Phone"        fieldKey="phone"        form={form} set={set} keyboard="phone-pad"     cap="none"  icon="phone-outline"   COLORS={COLORS} st={st} />
            <FieldRow label="Jersey No."   fieldKey="jersey_number" form={form} set={set} keyboard="number-pad"  cap="none"  icon="tshirt-crew-outline" COLORS={COLORS} st={st} />
            {/* Date of Birth — date picker */}
            <View style={[st.field, { marginBottom: 0 }]}>
              <View style={st.fieldLabel}>
                <Icon name="cake-variant-outline" size={12} color={COLORS.gray} />
                <Text style={st.label}>Date of Birth</Text>
              </View>
              <TouchableOpacity style={st.dobBtn} onPress={() => setDobOpen(true)} activeOpacity={0.8}>
                <Text style={form.date_of_birth ? st.dobTxt : st.dobPlaceholder}>
                  {form.date_of_birth || 'Select date'}
                </Text>
                <Icon name="calendar-outline" size={18} color={COLORS.gold} />
              </TouchableOpacity>
              <DatePicker
                modal
                open={dobOpen}
                date={form.date_of_birth ? new Date(form.date_of_birth) : new Date(2000, 0, 1)}
                mode="date"
                maximumDate={new Date()}
                minimumDate={new Date(1940, 0, 1)}
                title="Select Date of Birth"
                confirmText="Confirm"
                cancelText="Cancel"
                onConfirm={date => {
                  setDobOpen(false);
                  const iso = date.toISOString().split('T')[0]; // YYYY-MM-DD
                  set('date_of_birth', iso);
                }}
                onCancel={() => setDobOpen(false)}
              />
            </View>
          </View>

          {/* ── Player Type ── */}
          <View style={st.card}>
            <View style={st.cardTitleRow}>
              <Icon name="cricket" size={14} color={COLORS.gold} />
              <Text style={st.cardTitle}>PLAYER TYPE</Text>
            </View>
            <ChipSelector options={PLAYER_TYPES} value={form.player_type} onChange={setPlayerType} COLORS={COLORS} st={st} />
          </View>

          {/* ── Batting Hand ── */}
          <View style={st.card}>
            <View style={st.cardTitleRow}>
              <Icon name="hand-back-right-outline" size={14} color={COLORS.gold} />
              <Text style={st.cardTitle}>BATTING HAND</Text>
            </View>
            <ChipSelector options={BATTING_HAND} value={form.batting_hand} onChange={v => set('batting_hand', v)} COLORS={COLORS} st={st} />
          </View>

          {supportsBowlingStyle && (
            <View style={st.card}>
              <View style={st.cardTitleRow}>
                <Icon name="bullseye-arrow" size={14} color={COLORS.gold} />
                <Text style={st.cardTitle}>BOWLING STYLE</Text>
              </View>
              {bowlingStyleObj && (
                <View style={[st.selectedStyle, { borderColor: bowlingStyleObj.color }]}>
                  <Icon name="check-circle" size={14} color={bowlingStyleObj.color} style={{ marginRight: 6 }} />
                  <Text style={[st.selectedStyleTxt, { color: bowlingStyleObj.color }]}>{bowlingStyleObj.desc}</Text>
                </View>
              )}
              <BowlingStyleGrid value={form.bowling_style} onChange={v => set('bowling_style', v === form.bowling_style ? '' : v)} st={st} />
            </View>
          )}

          {/* ── View Full Stats ── */}
          {playerId && (
            <TouchableOpacity
              style={st.statsBtn}
              onPress={() => navigation.navigate('Home', {
                screen: 'PlayerProfileView',
                params: { playerId },
              })}
              activeOpacity={0.8}
            >
              <View style={[st.statsBtnIcon, { backgroundColor: COLORS.cyan + '22' }]}>
                <Icon name="chart-bar" size={17} color={COLORS.cyan} />
              </View>
              <Text style={st.statsBtnTxt}>View Full Career Stats</Text>
              <Icon name="chevron-right" size={18} color={COLORS.gray} />
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

// ── Styles ─────────────────────────────────────────────────
const getStStyles = (COLORS) => StyleSheet.create({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 10, paddingHorizontal: 20, paddingBottom: 12 },
  title:         { color: COLORS.white, fontSize: 20, fontWeight: '900' },
  subtitle:      { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  saveBtn:       { borderRadius: 12, overflow: 'hidden' },
  saveBtnInner:  { paddingHorizontal: 20, paddingVertical: 10, minWidth: 72, alignItems: 'center', justifyContent: 'center' },
  saveTxt:       { color: COLORS.navy, fontWeight: '800', fontSize: 13 },

  scroll:        { paddingHorizontal: 16, paddingBottom: 50, gap: 12 },

  // Avatar
  photoWrap:     { alignSelf: 'center', marginBottom: 4, position: 'relative' },
  photo:         { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: COLORS.gold },
  photoFallback: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.gold },
  photoInitial:  { color: '#fff', fontSize: 38, fontWeight: '900' },
  cameraBadge:   { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  newBadge:      { position: 'absolute', top: 2, right: -4, backgroundColor: COLORS.cyan, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  newBadgeTxt:   { color: '#fff', fontSize: 8, fontWeight: '800' },

  // Card
  card:          { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.cardBorder },
  cardTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: COLORS.gold, paddingLeft: 8 },
  cardTitle:     { color: COLORS.gold, fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  // Field
  field:         { marginBottom: 14 },
  fieldLabel:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  label:         { color: COLORS.gray, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  input:         { backgroundColor: COLORS.darkGray, borderRadius: 12, paddingHorizontal: 14, height: 48, color: COLORS.white, fontSize: 14, borderWidth: 1, borderColor: COLORS.cardBorder },
  dobBtn:        { backgroundColor: COLORS.darkGray, borderRadius: 12, paddingHorizontal: 14, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: COLORS.cardBorder },
  dobTxt:        { color: COLORS.white, fontSize: 14 },
  dobPlaceholder:{ color: COLORS.gray + '88', fontSize: 14 },
  inputDisabled: { justifyContent: 'center', opacity: 0.6 },
  inputDisabledTxt: { color: COLORS.gray, fontSize: 14 },
  lockedBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.darkGray, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 6 },
  lockedTxt:     { color: COLORS.gray, fontSize: 9, fontWeight: '600' },

  // Chips
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: COLORS.darkGray, borderWidth: 1, borderColor: COLORS.cardBorder },
  chipText:      { color: COLORS.gray, fontWeight: '600', fontSize: 13 },

  // Bowling style grid
  styleGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  styleCard:     { width: '47%', backgroundColor: COLORS.darkGray, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center' },
  styleLabel:    { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  styleDesc:     { color: COLORS.gray, fontSize: 10, marginTop: 3, textAlign: 'center' },
  selectedStyle: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkGray, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1 },
  selectedStyleTxt: { fontWeight: '600', fontSize: 13 },

  // Stats button
  statsBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.cardBorder, gap: 12 },
  statsBtnIcon:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statsBtnTxt:   { flex: 1, color: COLORS.white, fontWeight: '600', fontSize: 14 },
});

export default PlayerProfileScreen;
