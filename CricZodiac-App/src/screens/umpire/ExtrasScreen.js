import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { EXTRAS_TYPES } from '../../config/constants';
import { saveBall } from '../../database/queries/matchQueries';
import { showAlert } from '../../utils/toast';

const ExtrasScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { matchId, inningsId, overId, ballNumber, onSave } = route.params || {};
  const [selected, setSelected] = useState(null);
  const [runs, setRuns]         = useState(1);
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    if (!selected) { showAlert('Select extras type'); return; }
    setSaving(true);
    try {
      await saveBall({
        match_id:   matchId,
        innings_id: inningsId,
        over_id:    overId,
        ball_number: ballNumber,
        runs_scored: runs,
        extras_type: selected,
        is_extra:    1,
        is_wicket:   0,
      });
      if (onSave) onSave();
      navigation.goBack();
    } catch (e) {
      showAlert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Extras</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ padding: 20 }}>
        <Text style={styles.label}>Type</Text>
        <View style={styles.typeRow}>
          {(EXTRAS_TYPES || ['wide', 'no_ball', 'bye', 'leg_bye', 'penalty']).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, selected === t && styles.typeBtnActive]}
              onPress={() => setSelected(t)}
            >
              <Text style={[styles.typeBtnText, selected === t && { color: COLORS.white }]}>
                {t.replace('_', ' ').toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: 24 }]}>Runs</Text>
        <View style={styles.runsRow}>
          {[0, 1, 2, 3, 4, 5, 6].map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.runBtn, runs === r && styles.runBtnActive]}
              onPress={() => setRuns(r)}
            >
              <Text style={[styles.runBtnText, runs === r && { color: COLORS.navy }]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.btnInner}>
            <Text style={styles.btnText}>{saving ? 'SAVING...' : 'RECORD EXTRAS'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 16 },
  title:         { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  label:         { color: COLORS.gray, fontSize: 12, fontWeight: '600', marginBottom: 10 },
  typeRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn:       { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  typeBtnActive: { backgroundColor: COLORS.royalBlue, borderColor: COLORS.gold },
  typeBtnText:   { color: COLORS.gray, fontWeight: '600', fontSize: 12 },
  runsRow:       { flexDirection: 'row', gap: 8 },
  runBtn:        { flex: 1, height: 48, backgroundColor: COLORS.card, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  runBtnActive:  { backgroundColor: COLORS.gold },
  runBtnText:    { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  btn:           { marginTop: 32, borderRadius: 12, overflow: 'hidden' },
  btnInner:      { height: 52, alignItems: 'center', justifyContent: 'center' },
  btnText:       { color: COLORS.navy, fontWeight: '800', fontSize: 15 },
});

export default ExtrasScreen;
