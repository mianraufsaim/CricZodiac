import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { PLAYER_TYPES, BATTING_HAND, BOWLING_STYLES } from '../../config/constants';
import { createPlayer, updatePlayer } from '../../database/queries/playerQueries';

const AddEditPlayerScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { player } = route.params || {};
  const isEdit = !!player;

  const [form, setForm] = useState({
    full_name:    player?.full_name    || '',
    email:        player?.email        || '',
    phone:        player?.phone        || '',
    player_type:  player?.player_type  || 'allrounder',
    batting_hand: player?.batting_hand || 'right',
    bowling_style:player?.bowling_style|| '',
    jersey_number:player?.jersey_number|| '',
    date_of_birth:player?.date_of_birth|| '',
    profile_pic:  player?.profile_pic  || null,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const pickImage = () => {
    Alert.alert('Profile Picture', 'Choose source', [
      {
        text: 'Camera',
        onPress: () =>
          launchCamera(
            { mediaType: 'photo', quality: 0.7, saveToPhotos: false },
            res => {
              if (!res.didCancel && !res.errorCode && res.assets?.[0]?.uri) {
                set('profile_pic', res.assets[0].uri);
              }
            },
          ),
      },
      {
        text: 'Gallery',
        onPress: () =>
          launchImageLibrary(
            { mediaType: 'photo', quality: 0.7 },
            res => {
              if (!res.didCancel && !res.errorCode && res.assets?.[0]?.uri) {
                set('profile_pic', res.assets[0].uri);
              }
            },
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      if (isEdit) await updatePlayer(player.id, form);
      else        await createPlayer(form);
      Alert.alert('Success', `Player ${isEdit ? 'updated' : 'added'} and queued for sync.`);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? 'Edit Player' : 'Add Player'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>

          {/* ── Profile Picture ── */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={pickImage} style={styles.avatarWrap}>
              {form.profile_pic ? (
                <Image source={{ uri: form.profile_pic }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Icon name="account" size={48} color={COLORS.gray} />
                </View>
              )}
              <View style={styles.avatarBadge}>
                <Icon name="camera" size={14} color={COLORS.navy} />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to add photo</Text>
          </View>

          {/* ── Text Fields ── */}
          {[
            { label: 'Full Name *', key: 'full_name',    type: 'default',       cap: 'words' },
            { label: 'Email',       key: 'email',         type: 'email-address', cap: 'none'  },
            { label: 'Phone',       key: 'phone',         type: 'phone-pad',     cap: 'none'  },
            { label: 'Jersey No.', key: 'jersey_number', type: 'number-pad',    cap: 'none'  },
            { label: 'Date of Birth (YYYY-MM-DD)', key: 'date_of_birth', type: 'numeric', cap: 'none' },
          ].map(f => (
            <View key={f.key} style={styles.field}>
              <Text style={styles.label}>{f.label}</Text>
              <TextInput
                style={styles.input}
                value={form[f.key]}
                onChangeText={v => set(f.key, v)}
                keyboardType={f.type}
                autoCapitalize={f.cap}
                placeholderTextColor={COLORS.gray}
                placeholder={f.label}
              />
            </View>
          ))}

          {/* ── Player Type ── */}
          <Text style={styles.label}>Player Type</Text>
          <View style={styles.typeRow}>
            {PLAYER_TYPES.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.typeBtn, form.player_type === t.id && styles.typeBtnActive]}
                onPress={() => set('player_type', t.id)}
              >
                <Text style={[styles.typeBtnText, form.player_type === t.id && { color: COLORS.white }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Batting Hand ── */}
          <Text style={[styles.label, { marginTop: 8 }]}>Batting Hand</Text>
          <View style={[styles.typeRow, { marginBottom: 20 }]}>
            {BATTING_HAND.map(h => (
              <TouchableOpacity
                key={h.id}
                style={[styles.typeBtn, form.batting_hand === h.id && styles.typeBtnActive]}
                onPress={() => set('batting_hand', h.id)}
              >
                <Icon name={h.icon} size={14} color={form.batting_hand === h.id ? COLORS.white : COLORS.gray} style={{ marginBottom: 2 }} />
                <Text style={[styles.typeBtnText, form.batting_hand === h.id && { color: COLORS.white }]}>
                  {h.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Bowling Style ── */}
          <Text style={[styles.label, { marginTop: 4 }]}>Bowling Style</Text>
          <View style={styles.styleGrid}>
            {BOWLING_STYLES.map(s => {
              const active = form.bowling_style === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.styleCard, active && { borderColor: s.color, backgroundColor: s.color + '18' }]}
                  onPress={() => set('bowling_style', s.id)}
                >
                  <Text style={[styles.styleLabel, active && { color: s.color }]}>{s.label}</Text>
                  <Text style={styles.styleDesc} numberOfLines={1}>{s.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Save Button ── */}
          <TouchableOpacity
            style={[styles.btn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.btnGradient}>
              <Text style={styles.btnText}>
                {saving ? 'Saving...' : isEdit ? 'UPDATE PLAYER' : 'ADD PLAYER'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 16 },
  title:            { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  card:             { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.cardBorder },

  avatarSection:    { alignItems: 'center', marginBottom: 24 },
  avatarWrap:       { position: 'relative' },
  avatar:           { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: COLORS.gold },
  avatarPlaceholder:{ width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.darkGray, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.cardBorder },
  avatarBadge:      { position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  avatarHint:       { color: COLORS.gray, fontSize: 12, marginTop: 8 },

  field:            { marginBottom: 16 },
  label:            { color: COLORS.gray, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input:            { backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 48, color: COLORS.white, fontSize: 15 },
  typeRow:          { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 20 },
  typeBtn:          { flex: 1, paddingVertical: 10, backgroundColor: COLORS.darkGray, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  typeBtnActive:    { backgroundColor: COLORS.royalBlue, borderColor: COLORS.gold },
  typeBtnText:      { color: COLORS.gray, fontWeight: '600', fontSize: 12 },
  btn:              { borderRadius: 12, overflow: 'hidden' },
  btnGradient:      { height: 52, alignItems: 'center', justifyContent: 'center' },
  btnText:          { color: COLORS.navy, fontWeight: '800', fontSize: 15 },
  styleGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 20 },
  styleCard:        { width: '47%', backgroundColor: COLORS.darkGray, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center' },
  styleLabel:       { color: COLORS.white, fontWeight: '700', fontSize: 12 },
  styleDesc:        { color: COLORS.gray, fontSize: 10, marginTop: 3, textAlign: 'center' },
});

export default AddEditPlayerScreen;
