// ============================================================
// CricZodiac — Match Setup Screen
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
import { createMatch } from '../../database/queries/matchQueries';
import { useAuth } from '../../context/AuthContext';

// ── Stepper Component ─────────────────────────────────────
const Stepper = ({ label, value, min, max, onChange, unit = '', COLORS, styles }) => (
  <View style={styles.stepperWrap}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.stepperRow}>
      <TouchableOpacity
        style={[styles.stepBtn, value <= min && styles.stepBtnDisabled]}
        onPress={() => value > min && onChange(value - 1)}
        disabled={value <= min}
      >
        <Icon name="minus" size={20} color={value <= min ? COLORS.gray : COLORS.white} />
      </TouchableOpacity>

      <View style={styles.stepValue}>
        <Text style={styles.stepNum}>{value}</Text>
        {unit ? <Text style={styles.stepUnit}>{unit}</Text> : null}
      </View>

      <TouchableOpacity
        style={[styles.stepBtn, value >= max && styles.stepBtnDisabled]}
        onPress={() => value < max && onChange(value + 1)}
        disabled={value >= max}
      >
        <Icon name="plus" size={20} color={value >= max ? COLORS.gray : COLORS.white} />
      </TouchableOpacity>
    </View>
  </View>
);

// Date picker row — outside component to avoid re-render issues
const DateField = ({ label, value, onPress, styles, COLORS }) => (
  <View style={styles.fieldGroup}>
    <Text style={styles.label}>{label}</Text>
    <TouchableOpacity style={styles.dateRow} onPress={onPress} activeOpacity={0.75}>
      <Icon name="calendar" size={18} color={COLORS.gold} style={{ marginRight: 10 }} />
      <Text style={styles.dateTxt}>
        {value
          ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'Select date'}
      </Text>
      <Icon name="chevron-down" size={18} color={COLORS.gray} />
    </TouchableOpacity>
  </View>
);

// Text field — outside to prevent keyboard-dismiss on re-render
const Field = ({ label, keyName, placeholder, keyboardType = 'default', form, set, styles, COLORS }) => (
  <View style={styles.fieldGroup}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={COLORS.gray}
      value={form[keyName]}
      onChangeText={v => set(keyName, v)}
      keyboardType={keyboardType}
    />
  </View>
);

// ── Main Screen ───────────────────────────────────────────
const MatchSetupScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { user } = useAuth();
  const { seriesId = null, seriesName = null, matchNumber = 1 } = route.params || {};
  const [form, setForm] = useState({
    title:              seriesId ? `Match ${matchNumber}` : '',
    venue:              '',
    match_date:         new Date().toISOString().split('T')[0],
    overs:              7,
    players_per_team:   7,
    max_overs_per_bowler: 0,   // 0 = no limit
    wide_value:         1,
    no_ball_value:      1,
    team_a_name:        '',
    team_b_name:        '',
  });
  const [loading, setLoading]       = useState(false);
  const [openDatePicker, setOpenDate] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.title.trim() || !form.team_a_name.trim() || !form.team_b_name.trim()) {
      Alert.alert('Missing Fields', 'Please fill in match title and both team names.');
      return;
    }
    setLoading(true);
    try {
      const matchId = await createMatch({
        ...form,
        overs:            form.overs,
        players_per_team: form.players_per_team,
        umpire_id:        user?.id,
        series_id:        seriesId,
      });
      navigation.navigate('TeamSelection', { matchId, form, matchNumber });
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Match Setup</Text>
          {seriesName
            ? <Text style={styles.seriesTag}>📋 {seriesName}  ·  Match #{matchNumber}</Text>
            : null}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>

          {/* Match Info */}
          <Field label="MATCH TITLE *" keyName="title" placeholder="e.g. Match 1"                   form={form} set={set} styles={styles} COLORS={COLORS} />
          <Field label="VENUE"        keyName="venue" placeholder="e.g. Indoor Sports Hall, Lahore" form={form} set={set} styles={styles} COLORS={COLORS} />

          <DateField
            label="MATCH DATE"
            value={form.match_date}
            onPress={() => setOpenDate(true)}
            styles={styles}
            COLORS={COLORS}
          />
          <DatePicker
            modal
            mode="date"
            open={openDatePicker}
            date={form.match_date ? new Date(form.match_date) : new Date()}
            onConfirm={(d) => { setOpenDate(false); set('match_date', d.toISOString().split('T')[0]); }}
            onCancel={() => setOpenDate(false)}
          />

          {/* Overs + Players Steppers */}
          <View style={styles.stepperContainer}>
            <Stepper
              label="OVERS"
              value={form.overs}
              min={1}
              max={50}
              onChange={v => set('overs', v)}
              unit="ov"
              COLORS={COLORS}
              styles={styles}
            />
            <View style={styles.stepperDivider} />
            <Stepper
              label="PLAYERS / TEAM"
              value={form.players_per_team}
              min={2}
              max={15}
              onChange={v => set('players_per_team', v)}
              unit="pl"
              COLORS={COLORS}
              styles={styles}
            />
          </View>

          {/* Teams */}
          <View style={styles.sectionRow}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionHeader}>TEAMS</Text>
            <View style={styles.sectionLine} />
          </View>

          <Field label="TEAM A NAME *" keyName="team_a_name" placeholder="e.g. Zodiac XI"    form={form} set={set} styles={styles} COLORS={COLORS} />
          <Field label="TEAM B NAME *" keyName="team_b_name" placeholder="e.g. Challengers" form={form} set={set} styles={styles} COLORS={COLORS} />

          {/* Match Settings */}
          <View style={styles.sectionRow}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionHeader}>SETTINGS</Text>
            <View style={styles.sectionLine} />
          </View>

          <Stepper
            label="MAX OVERS / BOWLER  (0 = no limit)"
            value={form.max_overs_per_bowler}
            min={0} max={form.overs}
            onChange={v => set('max_overs_per_bowler', v)}
            unit="ov"
            COLORS={COLORS}
            styles={styles}
          />

          <View style={styles.stepperContainer}>
            <Stepper
              label="WIDE VALUE"
              value={form.wide_value}
              min={1} max={5}
              onChange={v => set('wide_value', v)}
              unit="run"
              COLORS={COLORS}
              styles={styles}
            />
            <View style={styles.stepperDivider} />
            <Stepper
              label="NO BALL VALUE"
              value={form.no_ball_value}
              min={1} max={5}
              onChange={v => set('no_ball_value', v)}
              unit="run"
              COLORS={COLORS}
              styles={styles}
            />
          </View>

          {/* Summary chip */}
          <View style={styles.summaryChip}>
            <Icon name="cricket" size={16} color={COLORS.gold} />
            <Text style={styles.summaryText}>
              {form.overs} overs  ·  {form.players_per_team} players per side
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={loading}
          >
            <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.btnGradient}>
              <Text style={styles.btnText}>
                {loading ? 'Creating...' : 'CONTINUE → SELECT TEAMS'}
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
  headerTitle:      { fontSize: 18, fontWeight: '700', color: COLORS.white },
  seriesTag:        { fontSize: 11, color: COLORS.gold, marginTop: 2 },
  scroll:           { padding: 20, paddingBottom: 40 },
  card:             { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.cardBorder },

  fieldGroup:       { marginBottom: 16 },
  label:            { color: COLORS.gray, fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 1 },
  input:            { backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 48, color: COLORS.white, fontSize: 15 },
  dateRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: COLORS.cardBorder },
  dateTxt:          { flex: 1, color: COLORS.white, fontSize: 15 },

  // Steppers
  stepperContainer: { flexDirection: 'row', backgroundColor: COLORS.darkGray, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.cardBorder, gap: 12 },
  stepperWrap:      { flex: 1, alignItems: 'center' },
  stepperDivider:   { width: 1, backgroundColor: COLORS.cardBorder, marginHorizontal: 8 },
  stepperRow:       { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 12 },
  stepBtn:          { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center' },
  stepBtnDisabled:  { backgroundColor: COLORS.cardBorder },
  stepValue:        { alignItems: 'center', minWidth: 48 },
  stepNum:          { color: COLORS.white, fontSize: 28, fontWeight: '800' },
  stepUnit:         { color: COLORS.gray, fontSize: 11, marginTop: -4 },

  // Section divider
  sectionRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionLine:      { flex: 1, height: 1, backgroundColor: COLORS.cardBorder },
  sectionHeader:    { color: COLORS.gold, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginHorizontal: 10 },

  // Summary
  summaryChip:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, borderWidth: 1, borderColor: COLORS.gold + '44' },
  summaryText:      { color: COLORS.gold, fontWeight: '600', fontSize: 13 },

  btn:              { borderRadius: 12, overflow: 'hidden' },
  btnGradient:      { height: 52, alignItems: 'center', justifyContent: 'center' },
  btnText:          { color: COLORS.navy, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
});

export default MatchSetupScreen;
