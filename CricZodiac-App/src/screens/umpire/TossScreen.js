// ============================================================
// CricZodiac — Toss Screen
// Match 1 in a series: full coin flip toss
// Match 2+ in a series (isFirstMatch=false): choose who bats
// ============================================================

import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Alert, Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { saveTossResult } from '../../database/queries/matchQueries';

const { width } = Dimensions.get('window');

// ── Choose Batting Order (match 2+) ───────────────────────
const ChooseBattingMode = ({ match, teamA, teamB, navigation, COLORS, styles }) => {
  const [saving, setSaving] = useState(false);

  const handlePick = async (battingTeam, bowlingTeam) => {
    setSaving(true);
    try {
      // Record as toss with no coin flip — both teams same result
      await saveTossResult({
        match_id:        match.id,
        club_id:         match.club_id,
        series_id:       match.series_id,
        calling_captain: battingTeam.captain_id,
        calling_captain_id: battingTeam.captain_id,
        toss_call:       'heads',
        toss_outcome:    'heads',
        toss_winner:     battingTeam.id,
        toss_winner_id:  battingTeam.id,
        toss_loser:      bowlingTeam.id,
        toss_loser_id:   bowlingTeam.id,
        elected_to:      'bat',
      });
      navigation.navigate('LiveScoring', {
        match,
        battingTeam,
        bowlingTeam,
        inningsNumber: 1,
      });
    } catch (err) {
      Alert.alert('Error', 'Could not save batting order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy, COLORS.royalBlue]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BATTING ORDER</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.teamsBar}>
        <View style={styles.teamChip}>
          <Text style={styles.teamChipText}>{teamA?.team_name}</Text>
        </View>
        <Text style={styles.vsText}>vs</Text>
        <View style={styles.teamChip}>
          <Text style={styles.teamChipText}>{teamB?.team_name}</Text>
        </View>
      </View>

      {/* No coin for subsequent matches */}
      <View style={styles.coinArea}>
        <View style={styles.noCoinCircle}>
          <Icon name="cricket" size={52} color={COLORS.gold} />
        </View>
      </View>

      <View style={styles.phaseContainer}>
        <Text style={styles.phaseTitle}>Who bats first?</Text>
        <Text style={styles.chooseSubtitle}>
          (No toss needed — loser of previous match picks)
        </Text>

        <View style={[styles.callRow, { marginTop: 16 }]}>
          <TouchableOpacity
            style={[styles.choiceBtn, saving && { opacity: 0.5 }]}
            onPress={() => !saving && handlePick(teamA, teamB)}
          >
            <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.choiceBtnGradient}>
              <Icon name="cricket" size={28} color={COLORS.white} />
              <Text style={styles.choiceBtnText}>{teamA?.team_name}</Text>
              <Text style={styles.choiceBtnSub}>BATS FIRST</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.choiceBtn, saving && { opacity: 0.5 }]}
            onPress={() => !saving && handlePick(teamB, teamA)}
          >
            <LinearGradient colors={[COLORS.royalBlue, COLORS.purple]} style={styles.choiceBtnGradient}>
              <Icon name="cricket" size={28} color={COLORS.white} />
              <Text style={styles.choiceBtnText}>{teamB?.team_name}</Text>
              <Text style={styles.choiceBtnSub}>BATS FIRST</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
};

// ── Coin Toss (match 1) ───────────────────────────────────
const TossScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { match, teamA, teamB, isFirstMatch = true } = route.params;

  // Non-first match → straight to pick mode
  if (!isFirstMatch) {
    return <ChooseBattingMode match={match} teamA={teamA} teamB={teamB} navigation={navigation} COLORS={COLORS} styles={styles} />;
  }

  const [selectedCaptain, setSelectedCaptain] = useState(null);
  const [tossCall, setTossCall]               = useState(null);   // 'heads' | 'tails'
  const [tossResult, setTossResult]           = useState(null);
  const [phase, setPhase]                     = useState('select'); // select | call | flip | result

  const flipAnim   = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  // Just run the flip animation — call is already set by HEADS/TAILS buttons
  const doFlip = () => {
    setPhase('flip');

    Animated.sequence([
      Animated.timing(bounceAnim, { toValue: -120, duration: 400, useNativeDriver: true }),
      Animated.timing(bounceAnim, { toValue: 0,    duration: 400, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.timing(flipAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(flipAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(flipAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(flipAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(flipAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(flipAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
      setTossResult(outcome);
      setPhase('result');
    });
  };

  // Tapping the coin: validate call first, then flip
  const handleCoinPress = () => {
    if (phase !== 'call') return;
    if (!tossCall) {
      Alert.alert(
        '📢 Make a call first!',
        'Captains, please call Heads or Tails before flipping the coin.',
        [{ text: 'OK' }],
      );
      return;
    }
    doFlip();
  };

  const handleBatBowl = async (choice) => {
    // selectedCaptain is WHO CALLED — winner is determined by whether their call matched the result
    const callingTeam  = selectedCaptain === 'A' ? teamA : teamB;
    const otherTeam    = selectedCaptain === 'A' ? teamB : teamA;
    const callerWon    = tossResult === tossCall;
    const tossWinner   = callerWon ? callingTeam : otherTeam;
    const tossLoser    = callerWon ? otherTeam   : callingTeam;
    try {
      await saveTossResult({
        match_id:        match.id,
        club_id:         match.club_id,
        series_id:       match.series_id,
        calling_captain: callingTeam.captain_id,
        calling_captain_id: callingTeam.captain_id,
        toss_call:       tossCall,
        toss_outcome:    tossResult,
        toss_winner:     tossWinner.id,
        toss_winner_id:  tossWinner.id,
        toss_loser:      tossLoser.id,
        toss_loser_id:   tossLoser.id,
        elected_to:      choice,
      });
      navigation.navigate('LiveScoring', {
        match,
        battingTeam:   choice === 'bat' ? tossWinner : tossLoser,
        bowlingTeam:   choice === 'bat' ? tossLoser  : tossWinner,
        inningsNumber: 1,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to save toss result.');
    }
  };

  const won = tossResult === tossCall;

  const flipStyle = {
    transform: [
      { scaleX: flipAnim.interpolate({ inputRange: [0, 1], outputRange: [1, -1] }) },
      { translateY: bounceAnim },
    ],
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy, COLORS.royalBlue]} style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TOSS</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Teams bar */}
      <View style={styles.teamsBar}>
        <View style={styles.teamChip}>
          <Text style={styles.teamChipText}>{teamA?.team_name}</Text>
        </View>
        <Text style={styles.vsText}>vs</Text>
        <View style={styles.teamChip}>
          <Text style={styles.teamChipText}>{teamB?.team_name}</Text>
        </View>
      </View>

      {/* Phase: Select Captain — shown ABOVE the coin */}
      {phase === 'select' && (
        <View style={styles.callSection}>
          <Text style={styles.callSectionTitle}>Who calls the toss?</Text>
          <View style={styles.captainRow}>
            {[{ team: teamA, label: 'A' }, { team: teamB, label: 'B' }].map(({ team, label }) => (
              <TouchableOpacity
                key={label}
                style={[styles.captainBtn, selectedCaptain === label && styles.captainBtnSelected]}
                onPress={() => { setSelectedCaptain(label); setPhase('call'); }}
              >
                <Icon name="account-tie" size={22} color={selectedCaptain === label ? COLORS.gold : COLORS.gray} style={{ marginBottom: 6 }} />
                <Text style={styles.captainBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {team?.captain_name || team?.team_name}
                </Text>
                <Text style={styles.captainBtnSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {team?.team_name} · Captain
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* HEADS / TAILS call buttons — shown ABOVE the coin during call phase */}
      {phase === 'call' && (
        <View style={styles.callSection}>
          <Text style={styles.callSectionTitle}>
            {selectedCaptain === 'A'
              ? (teamA?.captain_name || teamA?.team_name)
              : (teamB?.captain_name || teamB?.team_name)
            } — make your call:
          </Text>
          <View style={styles.callRow}>
            {['heads', 'tails'].map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.callBtn, tossCall === c && styles.callBtnSelected]}
                onPress={() => setTossCall(c)}
              >
                <Text style={styles.callBtnEmoji}>{c === 'heads' ? '👑' : '🦅'}</Text>
                <Text style={[styles.callBtnText, tossCall === c && { color: COLORS.gold }]}>
                  {c.toUpperCase()}
                </Text>
                {tossCall === c && (
                  <Icon name="check-circle" size={16} color={COLORS.gold} style={{ marginTop: 4 }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Coin — tappable during call phase */}
      <View style={styles.coinArea}>
        <TouchableOpacity
          onPress={handleCoinPress}
          activeOpacity={phase === 'call' ? 0.85 : 1}
          disabled={phase === 'flip' || phase === 'result'}
        >
          <Animated.View style={[styles.coinContainer, flipStyle]}>
            {(() => {
              // Show tossResult after flip, tossCall selection before, default heads
              const face = tossResult ?? tossCall ?? 'heads';
              return (
                <LinearGradient
                  colors={face === 'tails'
                    ? ['#C0C0C0', '#A0A0A0', '#C0C0C0']
                    : [COLORS.gold, '#B8942A', COLORS.gold]}
                  style={styles.coin}
                >
                  <View style={styles.coinInner}>
                    <Text style={styles.coinSymbol}>{face === 'tails' ? '🦅' : '👑'}</Text>
                    <Text style={styles.coinLabel}>{face === 'tails' ? 'TAILS' : 'HEADS'}</Text>
                    {phase === 'call' && tossCall && (
                      <Text style={styles.tapHint}>TAP TO FLIP</Text>
                    )}
                    {phase === 'call' && !tossCall && (
                      <Text style={styles.tapHintDim}>make a call first</Text>
                    )}
                  </View>
                  <View style={styles.coinEdge} />
                </LinearGradient>
              );
            })()}
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Phase: call — instruction hint below coin */}
      {phase === 'call' && (
        <View style={styles.phaseContainer}>
          <Text style={styles.phaseHint}>
            {tossCall
              ? `✅ ${tossCall.toUpperCase()} selected — tap the coin to flip!`
              : '👆 Select Heads or Tails above, then tap the coin'}
          </Text>
        </View>
      )}

      {/* Phase: Flipping */}
      {phase === 'flip' && (
        <View style={styles.phaseContainer}>
          <Text style={styles.phaseTitle}>Flipping...</Text>
        </View>
      )}

      {/* Phase: Result → Choose bat/bowl */}
      {phase === 'result' && (
        <View style={styles.phaseContainer}>
          <View style={[styles.resultBadge, { backgroundColor: won ? COLORS.success : COLORS.danger }]}>
            <Text style={styles.resultBadgeText}>
              {won ? '🎉 ' : ''}
              {(selectedCaptain === 'A' ? teamA?.team_name : teamB?.team_name)} {won ? 'WON' : 'LOST'} the Toss!
            </Text>
          </View>
          <Text style={styles.outcomeText}>Coin landed on {tossResult?.toUpperCase()}</Text>
          <Text style={styles.chooseText}>Choose to:</Text>
          <View style={styles.callRow}>
            {['bat', 'bowl'].map(c => (
              <TouchableOpacity key={c} style={styles.choiceBtn} onPress={() => handleBatBowl(c)}>
                <LinearGradient
                  colors={c === 'bat' ? [COLORS.gold, '#B8942A'] : [COLORS.royalBlue, COLORS.purple]}
                  style={styles.choiceBtnGradient}
                >
                  <Icon name={c === 'bat' ? 'cricket' : 'bowl-mix'} size={28} color={COLORS.white} />
                  <Text style={styles.choiceBtnText}>{c === 'bat' ? 'BAT FIRST' : 'BOWL FIRST'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </LinearGradient>
  );
};

// ── Styles ─────────────────────────────────────────────────
const getStyles = (COLORS) => StyleSheet.create({
  container:         { flex: 1, paddingHorizontal: 20 },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, marginBottom: 20 },
  headerTitle:       { fontSize: 20, fontWeight: '800', color: COLORS.white, letterSpacing: 4 },
  teamsBar:          { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20, gap: 12 },
  teamChip:          { backgroundColor: COLORS.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.gold },
  teamChipText:      { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  vsText:            { color: COLORS.gold, fontWeight: '800', fontSize: 16 },
  coinArea:          { alignItems: 'center', justifyContent: 'center', height: 200, marginVertical: 20 },
  coinContainer:     { width: 150, height: 150, borderRadius: 75, backgroundColor: COLORS.gold, shadowColor: COLORS.gold, shadowOpacity: 0.8, shadowRadius: 20, elevation: 20 },
  coin:              { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center' },
  coinInner:         { alignItems: 'center' },
  coinSymbol:        { fontSize: 40 },
  coinLabel:         { color: COLORS.navy, fontWeight: '900', fontSize: 12, letterSpacing: 2, marginTop: 4 },
  coinEdge:          { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 6, borderColor: 'rgba(255,255,255,0.3)' },
  noCoinCircle:      { width: 150, height: 150, borderRadius: 75, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.gold },
  phaseContainer:    { flex: 1, alignItems: 'center' },
  phaseTitle:        { fontSize: 18, fontWeight: '700', color: COLORS.white, marginBottom: 10, textAlign: 'center' },
  chooseSubtitle:    { color: COLORS.gray, fontSize: 12, marginBottom: 10, textAlign: 'center' },
  captainRow:        { flexDirection: 'row', gap: 16, width: '100%' },
  captainBtn:        { flex: 1, backgroundColor: COLORS.card, borderRadius: 16, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  captainBtnSelected:{ borderColor: COLORS.gold, backgroundColor: COLORS.darkGray },
  captainBtnText:    { width: '100%', color: COLORS.white, fontWeight: '700', fontSize: 15, textAlign: 'center' },
  captainBtnSub:     { width: '100%', color: COLORS.gray, fontSize: 12, marginTop: 4, textAlign: 'center' },
  callRow:           { flexDirection: 'row', gap: 16, width: '100%', marginTop: 8 },
  callSection:       { paddingHorizontal: 0, marginBottom: 8 },
  callSectionTitle:  { color: COLORS.white, fontWeight: '600', fontSize: 14, textAlign: 'center', marginBottom: 10 },
  callBtn:           { flex: 1, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  callBtnSelected:   { borderColor: COLORS.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  callBtnEmoji:      { fontSize: 32, marginBottom: 6 },
  callBtnText:       { color: COLORS.white, fontWeight: '800', fontSize: 15, letterSpacing: 2 },
  tapHint:           { color: COLORS.navy, fontWeight: '800', fontSize: 10, letterSpacing: 1, marginTop: 6, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  tapHintDim:        { color: 'rgba(0,0,0,0.4)', fontWeight: '600', fontSize: 9, letterSpacing: 0.5, marginTop: 6 },
  phaseHint:         { color: COLORS.gray, fontSize: 13, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },
  resultBadge:       { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginBottom: 12 },
  resultBadgeText:   { color: COLORS.white, fontWeight: '800', fontSize: 16, textAlign: 'center' },
  outcomeText:       { color: COLORS.gray, fontSize: 14, marginBottom: 20 },
  chooseText:        { color: COLORS.white, fontWeight: '600', fontSize: 16, marginBottom: 12 },
  choiceBtn:         { flex: 1, borderRadius: 16, overflow: 'hidden' },
  choiceBtnGradient: { padding: 20, alignItems: 'center', gap: 8 },
  choiceBtnText:     { color: COLORS.white, fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  choiceBtnSub:      { color: 'rgba(255,255,255,0.7)', fontSize: 10, letterSpacing: 1 },
});

export default TossScreen;
