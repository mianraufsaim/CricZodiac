// ============================================================
// CricZodiac — Wicket Screen
// ============================================================

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, FlatList } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { WICKET_TYPES } from '../../config/constants';
import { saveWicket } from '../../database/queries/matchQueries';
import { getTeamPlayers } from '../../database/queries/matchQueries';
import uuid from 'react-native-uuid';

const WicketScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const {
    inningsId,
    batsman,
    bowler,
    totalRuns,
    overAtFall,
    bowlingTeam,
    requestId,
    returnScreen = 'LiveScoring',
  } = route.params;
  const [selectedType, setSelectedType]   = useState(null);
  const [fielder, setFielder]             = useState(null);
  const [fieldingTeam, setFieldingTeam]   = useState([]);
  const [saving, setSaving]               = useState(false);

  React.useEffect(() => {
    let active = true;
    if (bowlingTeam) {
      getTeamPlayers(bowlingTeam.id)
        .then(players => { if (active) setFieldingTeam(players); })
        .catch(() => { if (active) setFieldingTeam([]); });
    } else {
      setFieldingTeam([]);
    }
    return () => { active = false; };
  }, [bowlingTeam?.id]);

  const handleConfirm = async () => {
    if (!selectedType) { Alert.alert('Select Dismissal', 'Please select how the batsman was dismissed.'); return; }
    if (['caught', 'run_out', 'stumped'].includes(selectedType) && !fielder) {
      Alert.alert('Select Fielder', 'Please select the fielder for this dismissal.');
      return;
    }
    setSaving(true);
    try {
      const ballId = uuid.v4();
      await saveWicket({
        ball_id:     ballId,
        innings_id:  inningsId,
        batsman_id:  batsman.id,
        bowler_id:   bowler.id,
        wicket_type: selectedType,
        fielder_id:  fielder?.id || null,
        runs_at_fall: totalRuns,
        over_at_fall: overAtFall,
      });
      navigation.navigate({
        name: returnScreen,
        params: {
          wicketDismissed: {
            requestId: requestId || uuid.v4(),
          },
        },
        merge: true,
      });
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
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>WICKET</Text>
        <TouchableOpacity onPress={handleConfirm} disabled={saving}>
          <Text style={[styles.confirm, saving && { opacity: 0.4 }]}>CONFIRM</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Batsman */}
        <View style={styles.batsmanCard}>
          <Text style={styles.batsmanLabel}>OUT:</Text>
          <Text style={styles.batsmanName}>{batsman?.full_name}</Text>
        </View>

        {/* Wicket Types */}
        <Text style={styles.sectionLabel}>DISMISSAL TYPE</Text>
        <View style={styles.grid}>
          {WICKET_TYPES.map(w => (
            <TouchableOpacity
              key={w.id}
              style={[styles.typeBtn, selectedType === w.id && styles.typeBtnSelected]}
              onPress={() => setSelectedType(w.id)}
            >
              <Text style={[styles.typeBtnText, selectedType === w.id && { color: COLORS.white }]}>{w.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Fielder (for caught/run out/stumped) */}
        {['caught', 'run_out', 'stumped'].includes(selectedType) && fieldingTeam.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>FIELDER</Text>
            <FlatList
              data={fieldingTeam}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={i => i.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.fielderBtn, fielder?.id === item.id && styles.fielderBtnSelected]}
                  onPress={() => setFielder(item)}
                >
                  <Text style={[styles.fielderText, fielder?.id === item.id && { color: COLORS.white }]}>{item.full_name}</Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 8 }}
            />
          </>
        )}
        {['caught', 'run_out', 'stumped'].includes(selectedType) && fieldingTeam.length === 0 && (
          <Text style={styles.fielderWarn}>No fielders found for the bowling team.</Text>
        )}
      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 20 },
  cancel:           { color: COLORS.gray, fontSize: 15 },
  title:            { color: COLORS.white, fontSize: 20, fontWeight: '800', letterSpacing: 4 },
  confirm:          { color: COLORS.gold, fontSize: 15, fontWeight: '800' },
  scroll:           { padding: 20 },
  batsmanCard:      { backgroundColor: COLORS.danger + '33', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24, borderWidth: 1, borderColor: COLORS.danger },
  batsmanLabel:     { color: COLORS.danger, fontWeight: '800', fontSize: 16 },
  batsmanName:      { color: COLORS.white, fontWeight: '700', fontSize: 18 },
  sectionLabel:     { color: COLORS.gray, fontSize: 11, letterSpacing: 2, marginBottom: 12 },
  grid:             { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  typeBtn:          { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  typeBtnSelected:  { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  typeBtnText:      { color: COLORS.gray, fontWeight: '600', fontSize: 14 },
  fielderBtn:       { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.card, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  fielderBtnSelected: { backgroundColor: COLORS.royalBlue, borderColor: COLORS.royalBlue },
  fielderText:      { color: COLORS.gray, fontSize: 13, fontWeight: '600' },
  fielderWarn:      { color: COLORS.warning, fontSize: 12, fontWeight: '700', marginBottom: 16 },
});

export default WicketScreen;
