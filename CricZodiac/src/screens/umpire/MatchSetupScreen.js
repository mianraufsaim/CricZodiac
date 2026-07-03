// ============================================================
// CricZodiac — Match Setup Screen
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DatePicker from 'react-native-date-picker';
import { useTheme } from '../../context/ThemeContext';
import { createMatch, getMatchTeams, updateMatch } from '../../database/queries/matchQueries';
import { useAuth } from '../../context/AuthContext';
import { showAlert } from '../../utils/toast';
import { getSeriesById } from '../../database/queries/seriesQueries';

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
const Field = ({ label, keyName, placeholder, keyboardType = 'default', editable = true, form, set, styles, COLORS }) => (
  <View style={styles.fieldGroup}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={[styles.input, !editable && styles.inputReadonly]}
      placeholder={placeholder}
      placeholderTextColor={COLORS.gray}
      value={form[keyName]}
      onChangeText={v => set(keyName, v)}
      keyboardType={keyboardType}
      editable={editable}
      selectTextOnFocus={editable}
    />
  </View>
);

const firstText = (...values) => {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
};

const toDateOnly = (value) => {
  if (!value) return new Date().toISOString().split('T')[0];
  return String(value).split('T')[0].split(' ')[0];
};

const toNumber = (value, fallback) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const toBool = (value) => value === true || value === 1 || value === '1';

const minPlayersForOvers = (overs) => {
  if (overs >= 20) return 11;
  if (overs >= 10) return 6;
  return 2;
};

const teamNameFromMatch = (match, side) => {
  const key = side === 'A' ? 'team_a' : 'team_b';
  return (
    match?.[`${key}_name`] ||
    match?.[`${key}_team_name`] ||
    match?.[key]?.team_name ||
    match?.[key]?.name ||
    ''
  );
};

// ── Main Screen ───────────────────────────────────────────
const MatchSetupScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { user, activeClub } = useAuth();
  const {
    seriesId: routeSeriesId = null,
    seriesName = null,
    seriesStatus = null,
    matchNumber = 1,
    match: existingMatch = null,
    lockedTeamNames = null,
  } = route.params || {};
  const isEditingSetup = !!existingMatch?.id;
  const seriesId = routeSeriesId || existingMatch?.series_id || null;
  const numericMatchNumber = Number(matchNumber) || 1;
  const teamNamesLocked = numericMatchNumber > 1 && !!(lockedTeamNames?.teamAName || lockedTeamNames?.teamBName);
  const [form, setForm] = useState(() => {
    const overs = toNumber(existingMatch?.overs, 7);
    const minPlayers = minPlayersForOvers(overs);
    return {
      title:              existingMatch?.title || (seriesId ? `Match ${numericMatchNumber}` : ''),
      venue:              existingMatch?.venue || '',
      match_date:         toDateOnly(existingMatch?.match_date),
      overs,
      players_per_team:   Math.max(toNumber(existingMatch?.players_per_team, 7), minPlayers),
      max_overs_per_bowler: Math.min(toNumber(existingMatch?.max_overs_per_bowler, 0), overs),
      wide_value:         toNumber(existingMatch?.wide_value, 1),
      no_ball_value:      toNumber(existingMatch?.no_ball_value, 1),
      allow_last_batsman: toBool(existingMatch?.allow_last_batsman),
      allow_super_over: toBool(existingMatch?.allow_super_over),
      team_a_name:        firstText(lockedTeamNames?.teamAName, teamNameFromMatch(existingMatch, 'A')),
      team_b_name:        firstText(lockedTeamNames?.teamBName, teamNameFromMatch(existingMatch, 'B')),
    };
  });
  const [loading, setLoading]       = useState(false);
  const [seriesClosed, setSeriesClosed] = useState(
    seriesStatus ? String(seriesStatus).toLowerCase() !== 'active' : false
  );
  const [openDatePicker, setOpenDate] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const playerMinimum = minPlayersForOvers(form.overs);

  useEffect(() => {
    if (!seriesId) return;

    let mounted = true;
    const checkSeriesStatus = async () => {
      try {
        const seriesRule = await getSeriesById(seriesId);
        if (!mounted) return;
        if (seriesRule) {
          setSeriesClosed(String(seriesRule.status || '').toLowerCase() !== 'active');
        }
      } catch (_) {}
    };

    checkSeriesStatus();
    return () => { mounted = false; };
  }, [seriesId]);

  useEffect(() => {
    if (!teamNamesLocked) return;

    setForm(f => ({
      ...f,
      team_a_name: firstText(lockedTeamNames?.teamAName, f.team_a_name),
      team_b_name: firstText(lockedTeamNames?.teamBName, f.team_b_name),
    }));
  }, [lockedTeamNames?.teamAName, lockedTeamNames?.teamBName, teamNamesLocked]);

  useEffect(() => {
    if (teamNamesLocked || !isEditingSetup || (form.team_a_name && form.team_b_name)) return;

    let mounted = true;
    const loadSavedTeamNames = async () => {
      try {
        const teams = await getMatchTeams(existingMatch.id);
        if (!mounted || !teams?.length) return;

        const teamA = teams.find(t => t.team_label === 'A');
        const teamB = teams.find(t => t.team_label === 'B');
        setForm(f => ({
          ...f,
          team_a_name: f.team_a_name || teamA?.team_name || '',
          team_b_name: f.team_b_name || teamB?.team_name || '',
        }));
      } catch (err) {
        console.warn('MatchSetup team prefill:', err.message);
      }
    };

    loadSavedTeamNames();
    return () => { mounted = false; };
  }, [existingMatch?.id, form.team_a_name, form.team_b_name, isEditingSetup, teamNamesLocked]);

  const setOvers = (overs) => {
    setForm(f => ({
      ...f,
      overs,
      players_per_team: Math.max(f.players_per_team, minPlayersForOvers(overs)),
      max_overs_per_bowler: Math.min(f.max_overs_per_bowler, overs),
    }));
  };

  const handleCreate = async () => {
    if (seriesClosed) {
      showAlert('Series Closed', 'This series is closed. Re-open the series before setting up another match.');
      return;
    }

    if (!form.title.trim() || !form.team_a_name.trim() || !form.team_b_name.trim()) {
      showAlert('Missing Fields', 'Please fill in match title and both team names.');
      return;
    }
    if (form.players_per_team < playerMinimum) {
      showAlert('Invalid Match Setup', `${form.overs} overs needs at least ${playerMinimum} players per team.`);
      return;
    }
    if (form.max_overs_per_bowler > 0 && (form.max_overs_per_bowler * form.players_per_team) < form.overs) {
      showAlert(
        'Invalid Bowler Limit',
        `${form.overs} overs cannot be completed with ${form.players_per_team} players if each bowler is limited to ${form.max_overs_per_bowler} over. Increase the limit or set it to 0.`
      );
      return;
    }
    setLoading(true);
    try {
      const seriesRule = seriesId ? await getSeriesById(seriesId) : null;
      if (seriesRule && String(seriesRule.status || '').toLowerCase() !== 'active') {
        setSeriesClosed(true);
        showAlert('Series Closed', 'This series is closed. Re-open the series before setting up another match.');
        return;
      }

      const allowSuperOver = isEditingSetup
        ? toBool(existingMatch?.allow_super_over)
        : toBool(seriesRule?.allow_super_over);
      const matchData = {
        ...form,
        overs:            form.overs,
        players_per_team: form.players_per_team,
        allow_last_batsman: form.allow_last_batsman ? 1 : 0,
        allow_super_over: allowSuperOver ? 1 : 0,
        series_id:        seriesId,
        club_id:          existingMatch?.club_id || activeClub?.server_id || user?.club_id || null,
      };
      const matchId = isEditingSetup
        ? existingMatch.id
        : await createMatch(matchData);

      if (isEditingSetup) {
        await updateMatch(matchId, {
          club_id:              matchData.club_id,
          title:                matchData.title,
          venue:                matchData.venue,
          match_date:           matchData.match_date,
          overs:                matchData.overs,
          players_per_team:     matchData.players_per_team,
          allow_last_batsman:   matchData.allow_last_batsman,
          allow_super_over:     matchData.allow_super_over,
          series_id:            matchData.series_id,
          wide_value:           matchData.wide_value,
          no_ball_value:        matchData.no_ball_value,
          max_overs_per_bowler: matchData.max_overs_per_bowler,
        });
      }

      navigation.navigate('TeamSelection', { matchId, form: matchData, matchNumber: numericMatchNumber });
    } catch (err) {
      showAlert('Error', err.message);
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
          <Text style={styles.headerTitle}>{isEditingSetup ? 'Finish Match Setup' : 'Match Setup'}</Text>
          {seriesName
            ? <Text style={styles.seriesTag}>📋 {seriesName}  ·  Match #{numericMatchNumber}</Text>
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
              onChange={setOvers}
              unit="ov"
              COLORS={COLORS}
              styles={styles}
            />
            <View style={styles.stepperDivider} />
            <Stepper
              label="PLAYERS / TEAM"
              value={form.players_per_team}
              min={playerMinimum}
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

          <Field
            label="TEAM A NAME *"
            keyName="team_a_name"
            placeholder="e.g. Zodiac XI"
            editable={!teamNamesLocked}
            form={form}
            set={set}
            styles={styles}
            COLORS={COLORS}
          />
          <Field
            label="TEAM B NAME *"
            keyName="team_b_name"
            placeholder="e.g. Challengers"
            editable={!teamNamesLocked}
            form={form}
            set={set}
            styles={styles}
            COLORS={COLORS}
          />

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

          <TouchableOpacity
            style={[styles.ruleRow, form.allow_last_batsman && styles.ruleRowActive]}
            onPress={() => set('allow_last_batsman', !form.allow_last_batsman)}
            activeOpacity={0.8}
          >
            <View style={[styles.ruleIcon, form.allow_last_batsman && { backgroundColor: COLORS.gold + '24' }]}>
              <Icon
                name={form.allow_last_batsman ? 'toggle-switch' : 'toggle-switch-off-outline'}
                size={26}
                color={form.allow_last_batsman ? COLORS.gold : COLORS.gray}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ruleTitle, form.allow_last_batsman && { color: COLORS.gold }]}>
                Last batter option
              </Text>
              <Text style={styles.ruleDesc}>Let the final batter continue when no partner remains.</Text>
            </View>
          </TouchableOpacity>

          {/* Summary chip */}
          <View style={styles.summaryChip}>
            <Icon name="cricket" size={16} color={COLORS.gold} />
            <Text style={styles.summaryText}>
              {form.overs} overs  ·  {form.players_per_team} players per side
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, (loading || seriesClosed) && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={loading}
          >
            <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.btnGradient}>
              <Text style={styles.btnText}>
                {seriesClosed ? 'SERIES CLOSED' : loading ? 'Saving...' : 'CONTINUE → SELECT TEAMS'}
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
  inputReadonly:    { borderWidth: 1, borderColor: COLORS.gold + '55', color: COLORS.gold },
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
  ruleRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.darkGray, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.cardBorder },
  ruleRowActive:    { borderColor: COLORS.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  ruleIcon:         { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card },
  ruleTitle:        { color: COLORS.white, fontSize: 14, fontWeight: '800' },
  ruleDesc:         { color: COLORS.gray, fontSize: 11, marginTop: 3, lineHeight: 15 },

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
