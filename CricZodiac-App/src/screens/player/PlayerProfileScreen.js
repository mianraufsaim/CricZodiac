// ============================================================
// CricZodiac — Player Profile Screen (self-edit)
// Players can update: photo, name, email, phone, player type,
// batting hand, bowling style, jersey number, DOB
// View-only: career stats (via navigate to PlayerProfileView)
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Image, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { PLAYER_TYPES, BATTING_HAND, BOWLING_STYLES } from '../../config/constants';
import { useAuth } from '../../context/AuthContext';
import { getPlayerByUserId, updatePlayer } from '../../database/queries/playerQueries';

// ── Chip Selector ─────────────────────────────────────────
const ChipSelector = ({ options, value, onChange, colorKey, COLORS, st }) => (
  <View style={st.chipRow}>
    {options.map(opt => {
      const active = value === opt.id;
      const color  = colorKey ? opt[colorKey] : COLORS.cyan;
      return (
        <TouchableOpacity
          key={opt.id}
          style={[st.chip, active && { backgroundColor: color + '22', borderColor: color }]}
          onPress={() => onChange(opt.id)}
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
        >
          <Text style={[st.styleLabel, active && { color: s.color }]}>{s.label}</Text>
          <Text style={st.styleDesc} numberOfLines={1}>{s.desc}</Text>
          {active && <Icon name="check-circle" size={14} color={s.color} style={{ marginTop: 4 }} />}
        </TouchableOpacity>
      );
    })}
  </View>
);

// ── Main ──────────────────────────────────────────────────
const PlayerProfileScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const st = useMemo(() => getStStyles(COLORS), [COLORS]);

  const { user } = useAuth();
  const [player,  setPlayer]  = useState(null);
  const [form,    setForm]    = useState({
    full_name:    '',
    email:        '',
    phone:        '',
    player_type:  'allrounder',
    batting_hand: 'right',
    bowling_style: '',
    jersey_number: '',
    date_of_birth: '',
    profile_pic:  null,
  });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const load = async () => {
    const p = await getPlayerByUserId(user?.id);
    if (p) {
      setPlayer(p);
      setForm({
        full_name:    p.full_name    || '',
        email:        p.email        || '',
        phone:        p.phone        || '',
        player_type:  p.player_type  || 'allrounder',
        batting_hand: p.batting_hand || 'right',
        bowling_style:p.bowling_style || '',
        jersey_number:p.jersey_number || '',
        date_of_birth:p.date_of_birth || '',
        profile_pic:  p.profile_pic  || null,
      });
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const handleSave = async () => {
    if (!form.full_name.trim()) { Alert.alert('Name is required'); return; }
    setSaving(true);
    try {
      await updatePlayer(player.id, form);
      Alert.alert('Saved', 'Profile updated and queued for sync.');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const pickImage = () => {
    Alert.alert('Profile Picture', 'Choose source', [
      {
        text: 'Camera',
        onPress: () => launchCamera({ mediaType: 'photo', quality: 0.8, saveToPhotos: false }, res => {
          if (!res.didCancel && res.assets?.[0]?.uri) set('profile_pic', res.assets[0].uri);
        }),
      },
      {
        text: 'Gallery',
        onPress: () => launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, res => {
          if (!res.didCancel && res.assets?.[0]?.uri) set('profile_pic', res.assets[0].uri);
        }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const bowlingStyleObj = BOWLING_STYLES.find(s => s.id === form.bowling_style);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={st.header}>
        <Text style={st.title}>My Profile</Text>
        <TouchableOpacity
          style={[st.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <LinearGradient colors={[COLORS.gold, '#B8942A']} style={st.saveBtnInner}>
            <Text style={st.saveTxt}>{saving ? 'Saving...' : 'SAVE'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={st.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />}
        >
          {/* Profile Photo */}
          <TouchableOpacity style={st.photoSection} onPress={pickImage}>
            {form.profile_pic
              ? <Image source={{ uri: form.profile_pic }} style={st.photo} />
              : <View style={st.photoPlaceholder}>
                  <Icon name="account" size={52} color={COLORS.royalBlue} />
                </View>
            }
            <View style={st.cameraBadge}>
              <Icon name="camera" size={16} color={COLORS.white} />
            </View>
          </TouchableOpacity>

          {/* Name / Email / Phone */}
          <View style={st.card}>
            <Text style={st.cardTitle}>PERSONAL INFO</Text>

            {[
              { label: 'Full Name *', key: 'full_name', keyboard: 'default',       cap: 'words' },
              { label: 'Email',       key: 'email',     keyboard: 'email-address',  cap: 'none'  },
              { label: 'Phone',       key: 'phone',     keyboard: 'phone-pad',      cap: 'none'  },
              { label: 'Jersey No.', key: 'jersey_number', keyboard: 'number-pad', cap: 'none'  },
              { label: 'Date of Birth (YYYY-MM-DD)', key: 'date_of_birth', keyboard: 'numeric', cap: 'none' },
            ].map(f => (
              <View key={f.key} style={st.field}>
                <Text style={st.label}>{f.label}</Text>
                <TextInput
                  style={st.input}
                  value={form[f.key]}
                  onChangeText={v => set(f.key, v)}
                  keyboardType={f.keyboard}
                  autoCapitalize={f.cap}
                  placeholderTextColor={COLORS.gray}
                  placeholder={f.label}
                />
              </View>
            ))}
          </View>

          {/* Player Type */}
          <View style={st.card}>
            <Text style={st.cardTitle}>PLAYER TYPE</Text>
            <ChipSelector
              options={PLAYER_TYPES}
              value={form.player_type}
              onChange={v => set('player_type', v)}
              COLORS={COLORS}
              st={st}
            />
          </View>

          {/* Batting Hand */}
          <View style={st.card}>
            <Text style={st.cardTitle}>BATTING</Text>
            <ChipSelector
              options={BATTING_HAND}
              value={form.batting_hand}
              onChange={v => set('batting_hand', v)}
              COLORS={COLORS}
              st={st}
            />
          </View>

          {/* Bowling Style */}
          <View style={st.card}>
            <Text style={st.cardTitle}>BOWLING STYLE</Text>
            {bowlingStyleObj && (
              <View style={[st.selectedStyle, { borderColor: bowlingStyleObj.color }]}>
                <Icon name="check-circle" size={14} color={bowlingStyleObj.color} style={{ marginRight: 6 }} />
                <Text style={[st.selectedStyleTxt, { color: bowlingStyleObj.color }]}>{bowlingStyleObj.desc}</Text>
              </View>
            )}
            <BowlingStyleGrid value={form.bowling_style} onChange={v => set('bowling_style', v)} st={st} />
          </View>

          {/* View Full Stats button */}
          {player && (
            <TouchableOpacity
              style={st.statsBtn}
              onPress={() => navigation.navigate('Home', {
                screen: 'PlayerProfileView',
                params: { playerId: player.id },
              })}
            >
              <Icon name="chart-bar" size={18} color={COLORS.cyan} />
              <Text style={st.statsBtnTxt}>View Full Career Stats</Text>
              <Icon name="chevron-right" size={18} color={COLORS.gray} />
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const getStStyles = (COLORS) => StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 4 },
  title:         { color: COLORS.white, fontSize: 20, fontWeight: '800' },
  saveBtn:       { borderRadius: 10, overflow: 'hidden' },
  saveBtnInner:  { paddingHorizontal: 18, paddingVertical: 9 },
  saveTxt:       { color: COLORS.navy, fontWeight: '800', fontSize: 13 },
  scroll:        { padding: 16, paddingBottom: 50 },

  photoSection:  { alignSelf: 'center', marginBottom: 16, position: 'relative' },
  photo:         { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: COLORS.gold },
  photoPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.cardBorder, borderStyle: 'dashed' },
  cameraBadge:   { position: 'absolute', bottom: 2, right: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },

  card:          { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  cardTitle:     { color: COLORS.gold, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 14 },
  field:         { marginBottom: 14 },
  label:         { color: COLORS.gray, fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 },
  input:         { backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 48, color: COLORS.white, fontSize: 15 },

  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: COLORS.darkGray, borderWidth: 1, borderColor: COLORS.cardBorder },
  chipText:      { color: COLORS.gray, fontWeight: '600', fontSize: 13 },

  styleGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  styleCard:     { width: '47%', backgroundColor: COLORS.darkGray, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center' },
  styleLabel:    { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  styleDesc:     { color: COLORS.gray, fontSize: 10, marginTop: 3, textAlign: 'center' },
  selectedStyle: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkGray, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1 },
  selectedStyleTxt: { fontWeight: '600', fontSize: 13 },

  statsBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder, gap: 12 },
  statsBtnTxt:   { flex: 1, color: COLORS.white, fontWeight: '600', fontSize: 15 },
});

export default PlayerProfileScreen;
