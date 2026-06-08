// ============================================================
// CricZodiac — Scorecard Screen
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { getBattingScorecard, getBowlingScorecard, getInnings } from '../../database/queries/matchQueries';

const ScorecardScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { inningsId, match, liveOverNumber, liveLegalBalls } = route.params;
  const [batting, setBatting]   = useState([]);
  const [bowling, setBowling]   = useState([]);
  const [innings, setInnings]   = useState(null);
  const [tab, setTab]           = useState('batting');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [bat, bowl, inn] = await Promise.all([
      getBattingScorecard(inningsId),
      getBowlingScorecard(inningsId),
      getInnings(inningsId),
    ]);
    setBatting(bat);
    setBowling(bowl);
    setInnings(inn);
  };

  // If live over data was passed (innings still in progress), use it directly
  const liveOversStr = (liveOverNumber != null && liveLegalBalls != null)
    ? `${liveOverNumber - 1}.${liveLegalBalls}`
    : null;

  const formatOvers = (overs) => {
    const full  = Math.floor(overs);
    const balls = Math.round((overs - full) * 10);
    return `${full}.${balls}`;
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title}>SCORECARD</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Summary */}
      {innings && (
        <View style={styles.summary}>
          <Text style={styles.summaryScore}>{innings.total_runs}/{innings.total_wickets}</Text>
          <Text style={styles.summaryOvers}>({liveOversStr || formatOvers(innings.total_overs)} overs)</Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {['batting', 'bowling'].map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {tab === 'batting' ? (
          <View style={styles.tableCard}>
            {/* Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 3 }]}>Batsman</Text>
              <Text style={styles.th}>R</Text>
              <Text style={styles.th}>B</Text>
              <Text style={styles.th}>4s</Text>
              <Text style={styles.th}>6s</Text>
              <Text style={[styles.th, { marginLeft: 8 }]}>SR</Text>
            </View>
            {batting.map((b, i) => {
              const bf = b.balls_faced || 0;
              const rs = b.runs_scored || 0;
              const srVal = bf > 0 ? ((rs / bf) * 100).toFixed(1) : '0.0';
              return (
                <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                  <View style={{ flex: 3 }}>
                    <Text style={styles.playerName}>{b.full_name}</Text>
                    <Text style={styles.dismissal}>{b.is_out ? b.dismissal_type : 'not out'}</Text>
                  </View>
                  <Text style={[styles.td, rs >= 50 && styles.tdHighlight]}>{rs}</Text>
                  <Text style={styles.td}>{bf}</Text>
                  <Text style={styles.td}>{b.fours}</Text>
                  <Text style={styles.td}>{b.sixes}</Text>
                  <Text style={[styles.td, { marginLeft: 8 }]}>{srVal}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 3 }]}>Bowler</Text>
              <Text style={styles.th}>O</Text>
              <Text style={styles.th}>M</Text>
              <Text style={styles.th}>R</Text>
              <Text style={styles.th}>W</Text>
              <Text style={[styles.th, { marginLeft: 8 }]}>Eco</Text>
            </View>
            {bowling.map((b, i) => {
              const bb = b.balls_bowled || 0;
              const rc = b.runs_conceded || 0;
              const oStr = `${Math.floor(bb / 6)}.${bb % 6}`;
              const ecoVal = bb > 0 ? ((rc / bb) * 6).toFixed(2) : '0.00';
              return (
                <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                  <Text style={[styles.playerName, { flex: 3 }]}>{b.full_name}</Text>
                  <Text style={styles.td}>{oStr}</Text>
                  <Text style={styles.td}>{b.maidens}</Text>
                  <Text style={styles.td}>{rc}</Text>
                  <Text style={[styles.td, b.wickets >= 3 && styles.tdHighlight]}>{b.wickets}</Text>
                  <Text style={[styles.td, { marginLeft: 8 }]}>{ecoVal}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 8 },
  title:         { color: COLORS.white, fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  summary:       { alignItems: 'center', paddingVertical: 12 },
  summaryScore:  { color: COLORS.white, fontSize: 36, fontWeight: '900' },
  summaryOvers:  { color: COLORS.gray, fontSize: 14 },
  tabs:          { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 12 },
  tab:           { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  tabActive:     { backgroundColor: COLORS.royalBlue, borderColor: COLORS.gold },
  tabText:       { color: COLORS.gray, fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: COLORS.white },
  tableCard:     { marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.cardBorder },
  tableHeader:   { flexDirection: 'row', backgroundColor: COLORS.darkGray, paddingHorizontal: 14, paddingVertical: 10 },
  th:            { color: COLORS.gold, fontWeight: '700', fontSize: 12, width: 36, textAlign: 'center' },
  tableRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  tableRowAlt:   { backgroundColor: 'rgba(255,255,255,0.02)' },
  playerName:    { color: COLORS.white, fontWeight: '600', fontSize: 13 },
  dismissal:     { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  td:            { color: COLORS.lightGray, fontSize: 13, width: 36, textAlign: 'center' },
  tdHighlight:   { color: COLORS.gold, fontWeight: '800' },
});

export default ScorecardScreen;
