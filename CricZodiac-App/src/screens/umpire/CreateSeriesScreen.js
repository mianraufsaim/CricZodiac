// ============================================================
// CricZodiac — Create Series Screen
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DatePicker from 'react-native-date-picker';
import { useTheme } from '../../context/ThemeContext';
import { createSeries } from '../../database/queries/seriesQueries';
import { useAuth } from '../../context/AuthContext';

const FORMAT_OPTIONS = [
  { id: 'bestOf1', label: 'Best of 1', desc: 'Single match decides winner' },
  { id: 'bestOf3', label: 'Best of 3', desc: 'First to 2 wins' },
  { id: 'bestOf5', label: 'Best of 5', desc: 'First to 3 wins' },
];

// Helper: Date → 'YYYY-MM-DD' string
const toStr = (d) => d ? d.toISOString().split('T')[0] : '';

// Helper: display label for a date (or placeholder)
const displayDate = (str, placeholder) =>
  str ? new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : placeholder;

// Text field — defined outside to avoid keyboard-dismiss re-render bug
const Field = ({ label, keyName, placeholder, multiline, keyboardType, form, set, styles, COLORS }) => (
  <View style={styles.fieldGroup}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
      placeholder={placeholder}
      placeholderTextColor={COLORS.gray}
      value={form[keyName]}
      onChangeText={v => set(keyName, v)}
      multiline={multiline}
      keyboardType={keyboardType || 'default'}
    />
  </View>
);

// Date picker row — defined outside for the same reason
const DateField = ({ label, value, placeholder, onPress, onClear, styles, COLORS }) => (
  <View style={styles.fieldGroup}>
    <Text style={styles.label}>{label}</Text>
    <TouchableOpacity style={styles.dateRow} onPress={onPress} activeOpacity={0.75}>
      <Icon name="calendar" size={18} color={value ? COLORS.gold : COLORS.gray} style={{ marginRight: 10 }} />
      <Text style={[styles.dateTxt, !value && { color: COLORS.gray }]}>
        {displayDate(value, placeholder)}
      </Text>
      {value ? (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="close-circle" size={16} color={COLORS.gray} />
        </TouchableOpacity>
      ) : (
        <Icon name="chevron-down" size={18} color={COLORS.gray} />
      )}
    </TouchableOpacity>
  </View>
);

const CreateSeriesScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { user, activeClub } = useAuth();
  const [form, setForm] = useState({
    name:        '',
    description: '',
    start_date:  toStr(new Date()),
    end_date:    '',
    format:      'bestOf1',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Date picker modal state
  const [openStart, setOpenStart] = useState(false);
  const [openEnd,   setOpenEnd]   = useState(false);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      Alert.alert('Series name is required');
      return;
    }
    if (form.end_date && form.end_date < form.start_date) {
      Alert.alert('Invalid Dates', 'End date cannot be before start date.');
      return;
    }
    setSaving(true);
    try {
      const clubId = activeClub?.server_id || user?.club_id || null;
      const seriesId = await createSeries({ ...form, club_id: clubId }, user?.id);
      Alert.alert('✅ Series Created', `"${form.name}" is ready. Now add matches to it.`, [
        {
          text: 'Add First Match',
          onPress: () => navigation.replace('MatchSetup', { seriesId, seriesName: form.name }),
        },
        {
          text: 'Go to Series',
          onPress: () => navigation.replace('SeriesDetail', { seriesId, seriesName: form.name }),
        },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // Minimum date for end picker = selected start date (or today)
  const minEndDate = form.start_date ? new Date(form.start_date) : new Date();

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title}>New Series</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Field
            label="SERIES NAME *"
            keyName="name"
            placeholder="e.g. Zodiac Premier League 2025"
            form={form} set={set} styles={styles} COLORS={COLORS}
          />
          <Field
            label="DESCRIPTION"
            keyName="description"
            placeholder="Optional details..."
            multiline
            form={form} set={set} styles={styles} COLORS={COLORS}
          />

          {/* Start date picker */}
          <DateField
            label="START DATE *"
            value={form.start_date}
            placeholder="Select start date"
            onPress={() => setOpenStart(true)}
            onClear={() => set('start_date', '')}
            styles={styles}
            COLORS={COLORS}
          />
          <DatePicker
            modal
            mode="date"
            open={openStart}
            date={form.start_date ? new Date(form.start_date) : new Date()}
            onConfirm={(d) => { setOpenStart(false); set('start_date', toStr(d)); }}
            onCancel={() => setOpenStart(false)}
          />

          {/* End date picker */}
          <DateField
            label="END DATE"
            value={form.end_date}
            placeholder="Select end date (optional)"
            onPress={() => setOpenEnd(true)}
            onClear={() => set('end_date', '')}
            styles={styles}
            COLORS={COLORS}
          />
          <DatePicker
            modal
            mode="date"
            open={openEnd}
            date={form.end_date ? new Date(form.end_date) : minEndDate}
            minimumDate={minEndDate}
            onConfirm={(d) => { setOpenEnd(false); set('end_date', toStr(d)); }}
            onCancel={() => setOpenEnd(false)}
          />

          {/* Best of X Format Picker */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>FORMAT</Text>
            {FORMAT_OPTIONS.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.formatOption, form.format === f.id && styles.formatOptionActive]}
                onPress={() => set('format', f.id)}
              >
                <View style={[styles.radio, form.format === f.id && styles.radioActive]}>
                  {form.format === f.id && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formatLabel, form.format === f.id && { color: COLORS.gold }]}>{f.label}</Text>
                  <Text style={styles.formatDesc}>{f.desc}</Text>
                </View>
                {form.format === f.id && <Icon name="check-circle" size={18} color={COLORS.gold} />}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.btn, saving && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={saving}
          >
            <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.btnGradient}>
              <Icon name="trophy-outline" size={18} color={COLORS.navy} style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>{saving ? 'Creating...' : 'CREATE SERIES'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 16 },
  title:       { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  scroll:      { padding: 20, paddingBottom: 40 },
  card:        { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.cardBorder },
  fieldGroup:  { marginBottom: 16 },
  label:       { color: COLORS.gray, fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 1 },
  input:       { backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 48, color: COLORS.white, fontSize: 15 },

  // Date picker row
  dateRow:     {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.darkGray, borderRadius: 10,
    paddingHorizontal: 14, height: 48,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  dateTxt:     { flex: 1, color: COLORS.white, fontSize: 15 },

  btn:               { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  btnGradient:       { flexDirection: 'row', height: 52, alignItems: 'center', justifyContent: 'center' },
  btnText:           { color: COLORS.navy, fontWeight: '800', fontSize: 15 },
  formatOption:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkGray, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  formatOptionActive:{ borderColor: COLORS.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  formatLabel:       { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  formatDesc:        { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  radio:             { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.gray, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  radioActive:       { borderColor: COLORS.gold },
  radioDot:          { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.gold },
});

export default CreateSeriesScreen;
