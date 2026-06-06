// ============================================================
// CricZodiac — Match Summary / Result Screen
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, FlatList } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { getMatch, getMatchInnings, getBattingScorecard, getBowlingScorecard, saveMatchResult, getMatchTeams } from '../../database/queries/matchQueries';
import { getAllPlayers } from '../../database/queries/playerQueries';

const MatchSummaryScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { match: matchParam } = route.params;
  const [match, setMatch]           = useState(null);
  const [innings, setInnings]       = useState([]);
  const [teams, setTeams]           = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [potm, setPotm]             = useState(null);
  const [saved, setSaved]           = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [m, inns, tms, players] = await Promise.all([
      getMatch(matchParam.id),
      getMatchInnings(matchParam.id),
      getMatchTeams(matchParam.id),
      getAllPlayers(),
    ]);
    setMatch(m);
    setInnings(inns);
    setTeams(tms);
    setAllPlayers(players);
  };

  const getTeamScore = (inningsItem) =>
    `${inningsItem.total_runs}/${inningsItem.total_wickets}`;

  const determineWinner = () => {
    if (innings.length < 2) return null;
    // Sort by innings_number to ensure inn1=1st innings, inn2=2nd innings
    const sorted = [...innings].sort((a, b) => a.innings_number - b.innings_number);
    const [inn1, inn2] = sorted;
    const team1 = teams.find(t => t.id === inn1.batting_team_id);
    const team2 = teams.find(t => t.id === inn2.batting_team_id);
    if (inn1.total_runs > inn2.total_runs) {
      // Team batting 1st defended successfully — won by X runs
      return { winner: team1, loser: team2, margin: `${inn1.total_runs - inn2.total_runs} runs` };
    } else if (inn2.total_runs > inn1.total_runs) {
      // Team batting 2nd chased — won by wickets remaining
      const wktsLeft = (matchParam.players_per_team - 1) - (inn2.total_wickets || 0);
      return { winner: team2, loser: team1, margin: `${wktsLeft} wicket${wktsLeft !== 1 ? 's' : ''}` };
    }
    return { winner: null, loser: null, margin: 'TIE' };
  };

  const handleFinalizeResult = async () => {
    if (!potm) { Alert.alert('Player of Match', 'Please select the Player of the Match.'); return; }
    const result = determineWinner();
    const inn1 = innings[0];
    const inn2 = innings[1];
    try {
      await saveMatchResult({
        match_id:       matchParam.id,
        winner_team_id: result?.winner?.id,
        loser_team_id:  result?.loser?.id,
        result_type:    result?.winner ? 'win' : 'tie',
        margin:         0,
        margin_type:    'runs',
        team_a_score:   getTeamScore(inn1),
        team_b_score:   inn2 ? getTeamScore(inn2) : '—',
        player_of_match: potm.id,
        result_text:    result?.winner ? `${result.winner.team_name} won by ${result.margin}` : 'Match Tied',
      });
      setSaved(true);
      Alert.alert('Match Saved', 'Match result saved locally and queued for sync!');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const winner = determineWinner();

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>MATCH SUMMARY</Text>
        {saved && (
          <View style={styles.savedBadge}>
            <Icon name="check-circle" size={16} color={COLORS.success} />
            <Text style={styles.savedText}>Saved</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Match Title */}
        <View style={styles.matchTitle}>
          <Text style={styles.matchTitleText}>{match?.title}</Text>
          <Text style={styles.matchVenue}>{match?.venue}</Text>
        </View>

        {/* Result Banner */}
        {winner && (
          <LinearGradient
            colors={winner.winner ? [COLORS.royalBlue, COLORS.purple] : [COLORS.darkGray, COLORS.card]}
            style={styles.resultBanner}
          >
            {winner.winner ? (
              <>
                <Text style={styles.resultEmoji}>🏆</Text>
                <Text style={styles.resultWinner}>{winner.winner.team_name}</Text>
                <Text style={styles.resultMargin}>Won by {winner.margin}</Text>
              </>
            ) : (
              <Text style={styles.resultTie}>🤝 MATCH TIED</Text>
            )}
          </LinearGradient>
        )}

        {/* Innings Scores */}
        {innings.map((inn, i) => {
          const team = teams.find(t => t.id === inn.batting_team_id);
          return (
            <View key={inn.id} style={styles.inningsCard}>
              <Text style={styles.inningsLabel}>Innings {i + 1} — {team?.team_name}</Text>
              <Text style={styles.inningsScore}>{getTeamScore(inn)}</Text>
              <Text style={styles.inningsOvers}>({inn.total_overs} overs)</Text>
              <TouchableOpacity
                style={styles.viewScorecardBtn}
                onPress={() => navigation.navigate('Scorecard', { inningsId: inn.id, match: matchParam })}
              >
                <Text style={styles.viewScorecardText}>View Full Scorecard</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Player of Match */}
        {!saved && (
          <>
            <Text style={styles.sectionTitle}>PLAYER OF THE MATCH</Text>
            <FlatList
              data={allPlayers}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={p => p.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.potmBtn, potm?.id === item.id && styles.potmBtnSelected]}
                  onPress={() => setPotm(item)}
                >
                  <Text style={styles.potmName}>{item.full_name}</Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingVertical: 8 }}
            />

            <TouchableOpacity style={styles.finalizeBtn} onPress={handleFinalizeResult}>
              <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.finalizeBtnGradient}>
                <Icon name="trophy" size={20} color={COLORS.navy} />
                <Text style={styles.finalizeBtnText}>FINALIZE MATCH RESULT</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => navigation.navigate(navigation.canGoBack() ? 'UmpireDashboard' : 'Home')}
        >
          <Text style={styles.homeBtnText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 16 },
  title:             { color: COLORS.white, fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  savedBadge:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  savedText:         { color: COLORS.success, fontSize: 13, fontWeight: '600' },
  matchTitle:        { alignItems: 'center', marginBottom: 16 },
  matchTitleText:    { color: COLORS.white, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  matchVenue:        { color: COLORS.gray, fontSize: 13, marginTop: 4 },
  resultBanner:      { borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  resultEmoji:       { fontSize: 40, marginBottom: 8 },
  resultWinner:      { color: COLORS.white, fontSize: 24, fontWeight: '900' },
  resultMargin:      { color: COLORS.lightGray, fontSize: 14, marginTop: 4 },
  resultTie:         { color: COLORS.white, fontSize: 22, fontWeight: '800' },
  inningsCard:       { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  inningsLabel:      { color: COLORS.gray, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  inningsScore:      { color: COLORS.white, fontSize: 32, fontWeight: '900' },
  inningsOvers:      { color: COLORS.gray, fontSize: 13 },
  viewScorecardBtn:  { marginTop: 10, padding: 8, alignItems: 'center' },
  viewScorecardText: { color: COLORS.cyan, fontWeight: '600', fontSize: 13 },
  sectionTitle:      { color: COLORS.gold, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginBottom: 4, marginTop: 8 },
  potmBtn:           { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.card, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  potmBtnSelected:   { borderColor: COLORS.gold, backgroundColor: COLORS.darkGray },
  potmName:          { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  finalizeBtn:       { borderRadius: 14, overflow: 'hidden', marginTop: 20 },
  finalizeBtnGradient: { flexDirection: 'row', gap: 10, height: 54, alignItems: 'center', justifyContent: 'center' },
  finalizeBtnText:   { color: COLORS.navy, fontWeight: '800', fontSize: 15, letterSpacing: 1 },
  homeBtn:           { marginTop: 16, alignItems: 'center', padding: 14 },
  homeBtnText:       { color: COLORS.gray, fontSize: 14 },
});

export default MatchSummaryScreen;
