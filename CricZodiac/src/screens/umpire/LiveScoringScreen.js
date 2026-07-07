// ============================================================
// CricZodiac — Live Scoring Screen (Full Rewrite)
// Reference: Play Cricket app screenshots
// Features:
//   • Batter stats table (R, B, 4s, 6s, SR)
//   • Bowler stats (O, M, R, W)
//   • Separate WIDE / NO BALL / BYE / LEG BYE buttons
//   • Ball-by-ball tab with over groups
//   • Edit any ball (tap in ball-by-ball feed)
//   • Undo last ball
//   • Partnership tracker
//   • Proper innings close → Start Next Innings
// ============================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Modal, FlatList, TextInput, BackHandler, NativeModules, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import {
  createInnings, enqueueInningsSync, createOver, enqueueOverSync, updateOver, updateInnings, updateMatch,
  saveBall, getCurrentOver, getMatchInnings, getMatch, getMatchTeams,
  getTeamPlayers, getAllTeamPlayers,
  getBallsWithPlayers, getPlayerBattingStats,
  getLastBall, deleteBall, getInnings, clearInningsProgress, saveWicket, retireBatsman,
  saveMatchResult, upsertTeamPlayersFromServer, upsertMatchesFromServer,
} from '../../database/queries/matchQueries';
import { queryFirstRow, executeQuery } from '../../database/DatabaseHelper';
import { processSyncQueue, setSyncSuccessToastsSuppressed } from '../../services/SyncService';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';
import uuid from 'react-native-uuid';
import { showAlert } from '../../utils/toast';

// ── Helpers ───────────────────────────────────────────────
const sr  = (runs, balls) => balls > 0 ? ((runs / balls) * 100).toFixed(1) : '0.0';
const eco = (runs, overs) => overs > 0 ? (runs / overs).toFixed(1) : '0.0';
const fallOverLabel = (overNumber, legalBallNumber) =>
  `${Math.max(0, (Number(overNumber) || 1) - 1)}.${Math.max(0, Number(legalBallNumber) || 0)}`;

const ballLabel = (ball) => {
  if (ball.is_wicket) return 'W';
  if (ball.extra_type === 'wide') {
    const totalWideRuns = Number(ball.extra_runs || 0);
    return totalWideRuns > 1 ? `${totalWideRuns}-WD` : 'WD';
  }
  if (ball.extra_type === 'no_ball') {
    const batRuns = Number(ball.runs_scored || 0);
    return batRuns > 0 ? `${batRuns}-NB` : 'NB';
  }
  if (ball.extra_type === 'bye')     return `${ball.extra_runs || 0}-B`;
  if (ball.extra_type === 'leg_bye') return `${ball.extra_runs || 0}-LB`;
  return String(ball.runs_scored || 0);
};

const ballBadgePalette = (ball, COLORS) => {
  if (Number(ball?.is_wicket || 0) === 1) {
    return { background: COLORS.danger, border: COLORS.danger, text: '#FFFFFF' };
  }
  if (['wide', 'no_ball', 'bye', 'leg_bye'].includes(ball?.extra_type)) {
    return { background: COLORS.gold, border: '#F6D365', text: COLORS.navy };
  }
  if ([4, 6].includes(Number(ball?.runs_scored || 0))) {
    return { background: '#14532D', border: '#22C55E', text: '#DCFCE7' };
  }
  if ([1, 2, 3].includes(Number(ball?.runs_scored || 0))) {
    return { background: '#F8FAFC', border: '#CBD5E1', text: '#0F172A' };
  }
  return { background: '#475569', border: '#64748B', text: '#FFFFFF' };
};

const crossedRunsForDelivery = (extraType, runsScored = 0, extraRuns = 0, wideValue = 1) => {
  if (extraType === 'bye' || extraType === 'leg_bye') return Number(extraRuns || 0);
  // The automatic wide penalty is not a completed run. Only the additional
  // runs taken by the batters can change ends.
  if (extraType === 'wide') return Math.max(0, Number(extraRuns || 0) - Number(wideValue || 1));
  return Number(runsScored || 0);
};

const bowlerRunsForDelivery = (ball) => {
  const runs = Number(ball?.runs_scored || 0);
  const extras = Number(ball?.extra_runs || 0);
  return runs + (ball?.extra_type === 'bye' || ball?.extra_type === 'leg_bye' ? 0 : extras);
};

const shouldSwapForCrossedRuns = (crossedRuns) =>
  Math.abs(Number(crossedRuns) || 0) % 2 === 1;

const oversFromLegalBalls = (balls) => {
  const legalBalls = Math.max(0, Number(balls) || 0);
  return Number(`${Math.floor(legalBalls / 6)}.${legalBalls % 6}`);
};

const BOWLER_CREDIT_WICKET_TYPES = new Set(['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket']);
const isBowlerCreditWicket = (ball) => {
  if (Number(ball?.is_wicket || 0) !== 1) return false;
  return ball.wicket_type ? BOWLER_CREDIT_WICKET_TYPES.has(ball.wicket_type) : true;
};
const toBool = (value) => value === true || value === 1 || value === '1';
const superOverFirstInningsNumber = (superOverNumber) => 3 + ((Math.max(1, Number(superOverNumber) || 1) - 1) * 2);
const isSecondSuperOverInnings = (inningsNumber, superOverNumber) =>
  Number(inningsNumber) === superOverFirstInningsNumber(superOverNumber) + 1;
const superOverLabel = (_sequence, isChase = false) =>
  `Super Over${isChase ? ' Chase' : ''}`;
const maxWicketsForMatch = (match) =>
  Math.max(1, Number(match?.players_per_team || 6) - (toBool(match?.allow_last_batsman) ? 0 : 1));
const isLastBatterMode = (match, wickets) =>
  toBool(match?.allow_last_batsman) && Number(wickets || 0) >= Math.max(1, Number(match?.players_per_team || 6) - 1);

const getExtraBtns = (COLORS) => [
  { id: 'wide',    label: 'WIDE',   short: 'Wd', color: COLORS.warning  },
  { id: 'no_ball', label: 'NO BALL',short: 'Nb', color: COLORS.danger   },
  { id: 'bye',     label: 'BYE',    short: 'B',  color: COLORS.gray     },
  { id: 'leg_bye', label: 'LEG BYE',short: 'Lb', color: COLORS.gray     },
];

const getAdminTabBarStyle = (COLORS) => ({
  backgroundColor: COLORS.tabBar,
  borderTopColor: COLORS.tabBarBorder,
  height: 58,
  paddingBottom: 6,
});

const BACK_ACTION_TYPES = new Set(['GO_BACK', 'POP', 'POP_TO_TOP']);
const KeepScreenAwake = Platform.OS === 'android' ? NativeModules.KeepScreenAwake : null;

// ── Sub-components ────────────────────────────────────────

const BatterRow = ({ batter, isStriker, COLORS, sc, onChangeBatsman }) => {
  if (!batter) return null;
  // Show CHANGE button only for a mid-innings new batsman who hasn't yet
  // faced any deliveries (balls === 0). Opening-pair change is handled by
  // the section-header "Change" button when allBalls.length === 0.
  const canChange = !!onChangeBatsman && (batter.balls ?? 0) === 0;
  return (
    <View style={sc.bRow}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text
          style={[sc.bName, isStriker && { color: COLORS.gold }, canChange && { flex: 0, flexShrink: 1 }]}
          numberOfLines={1}
        >
          {isStriker ? '* ' : '  '}{batter.full_name || '—'}
        </Text>
        {canChange && (
          <TouchableOpacity onPress={onChangeBatsman} style={sc.changeBtn}>
            <Icon name="pencil" size={10} color={COLORS.gold} />
            <Text style={sc.changeBtnText}>CHANGE</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={sc.bCell}>{batter.runs ?? 0}</Text>
      <Text style={sc.bCell}>{batter.balls ?? 0}</Text>
      <Text style={sc.bCell}>{batter.fours ?? 0}</Text>
      <Text style={sc.bCell}>{batter.sixes ?? 0}</Text>
      <Text style={[sc.bCell, { color: COLORS.cyan, marginLeft: 8 }]}>{sr(batter.runs, batter.balls)}</Text>
    </View>
  );
};

const BowlerRow = ({ bowler, legalBalls, COLORS, sc }) => {
  if (!bowler) return null;
  const completedOvers = bowler.overs ?? 0;           // completed full overs from bowlerStats
  const rem            = legalBalls;                  // balls in current over (already 0-5)
  const oversStr       = `${completedOvers}.${rem}`;
  const decimalOvers   = completedOvers + rem / 6;    // true decimal for eco calculation
  return (
    <View style={sc.bRow}>
      <Text style={[sc.bName, { color: COLORS.cyan }]} numberOfLines={1}>
        {bowler.full_name || '—'}
      </Text>
      <Text style={sc.bCell}>{oversStr}</Text>
      <Text style={sc.bCell}>{bowler.maidens ?? 0}</Text>
      <Text style={sc.bCell}>{bowler.runs ?? 0}</Text>
      <Text style={sc.bCell}>{bowler.wickets ?? 0}</Text>
      <Text style={[sc.bCell, { color: COLORS.warning, marginLeft: 8 }]}>{eco(bowler.runs, decimalOvers)}</Text>
    </View>
  );
};

const BallDot = ({ ball, onPress, COLORS, sc }) => {
  const label = ballLabel(ball);
  const badge = ballBadgePalette(ball, COLORS);
  return (
    <TouchableOpacity
      style={[sc.dot, { backgroundColor: badge.background, borderWidth: 1, borderColor: badge.border }]}
      onPress={() => onPress && onPress(ball)}
    >
      <Text style={[sc.dotTxt, { color: badge.text }, label.length > 2 && { fontSize: 9 }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const EmptyDot = ({ COLORS, sc }) => (
  <View style={[sc.dot, { borderWidth: 1, borderColor: COLORS.cardBorder, backgroundColor: 'transparent' }]} />
);

// ── Wicket Dismissal Types ─────────────────────────────────
const WICKET_TYPES_FULL = [
  { id: 'bowled',     label: 'Bowled',      icon: 'cricket',                   color: '#DC2626' },
  { id: 'caught',     label: 'Caught',      icon: 'hand-clap',                 color: '#7C3AED' },
  { id: 'run_out',    label: 'Run Out',     icon: 'run-fast',                  color: '#D97706' },
  { id: 'lbw',        label: 'LBW',         icon: 'target',                    color: '#2563EB' },
  { id: 'stumped',    label: 'Stumped',     icon: 'hand-extended',             color: '#059669' },
  { id: 'hit_wicket', label: 'Hit Wicket',  icon: 'baseball-bat',               color: '#EA580C' },
  { id: 'retired',    label: 'Retired Hurt', icon: 'walk',                      color: '#6B7280' },
  { id: 'other',      label: 'Other',       icon: 'dots-horizontal-circle',     color: '#6B7280' },
];

// Dismissal types where non-striker CAN also be out
const BOTH_ENDS_TYPES = ['run_out', 'retired', 'other'];

// ── Wicket Dismissal Modal ─────────────────────────────────
const WicketDismissalModal = ({ visible, striker, nonStriker, bowlingPlayers, isFreeHit, COLORS, onConfirm, onCancel }) => {
  const [selType,    setSelType]   = useState(null);
  const [selFielder, setSelFielder] = useState(null);
  // 'striker' | 'nonStriker' — only relevant for run_out / retired / other
  const [dismissed,  setDismissed] = useState('striker');
  const [runOutRuns, setRunOutRuns] = useState(0);

  // On free hit only run out is valid
  const availableTypes = isFreeHit
    ? WICKET_TYPES_FULL.filter(w => w.id === 'run_out')
    : WICKET_TYPES_FULL;

  const needsFielder  = ['caught', 'run_out', 'stumped'].includes(selType);
  const needsWhoIsOut = BOTH_ENDS_TYPES.includes(selType);
  const needsRunOutRuns = selType === 'run_out';
  const canConfirm    = !!selType && (!needsFielder || !!selFielder);

  // Reset each time modal opens; auto-select run_out on free hit
  React.useEffect(() => {
    if (visible) {
      setSelFielder(null);
      setDismissed('striker');
      setRunOutRuns(0);
      setSelType(isFreeHit ? 'run_out' : null);
    }
  }, [visible]);

  const dismissedPlayer = dismissed === 'striker' ? striker : nonStriker;

  const wdStyles = React.useMemo(() => StyleSheet.create({
    overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sheet:         { backgroundColor: COLORS.navy, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 34, paddingTop: 12 },
    handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.cardBorder, alignSelf: 'center', marginBottom: 16 },
    sectionHdr:    { color: COLORS.gray, fontSize: 10, letterSpacing: 2, marginLeft: 16, marginBottom: 10 },
    // WHO IS OUT row
    whoRow:        { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 16 },
    whoBtn:        { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12, backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.cardBorder, alignItems: 'center', gap: 3 },
    whoBtnSel:     { backgroundColor: '#DC262622', borderColor: '#DC2626' },
    whoRole:       { color: COLORS.gray, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
    whoRoleSel:    { color: '#DC2626' },
    whoName:       { color: COLORS.white, fontSize: 13, fontWeight: '700', textAlign: 'center' },
    whoNameSel:    { color: '#DC2626' },
    strikerBadge:  { backgroundColor: COLORS.cyan + '33', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    strikerTxt:    { color: COLORS.cyan, fontSize: 9, fontWeight: '800' },
    // Dismissal grid
    grid:          { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 16 },
    typeBtn:       { width: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.cardBorder, gap: 4 },
    typeSel:       { borderWidth: 2 },
    typeLbl:       { color: COLORS.gray, fontSize: 10, fontWeight: '700', textAlign: 'center' },
    fielderHdr:    { color: COLORS.gray, fontSize: 10, letterSpacing: 2, marginLeft: 16, marginBottom: 8 },
    fielderList:   { paddingHorizontal: 16, marginBottom: 16 },
    fielderBtn:    { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.card, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
    fielderSel:    { backgroundColor: COLORS.royalBlue, borderColor: COLORS.royalBlue },
    fielderTxt:    { color: COLORS.gray, fontSize: 13, fontWeight: '600' },
    fielderTxtSel: { color: '#FFFFFF' },
    fielderWarn:   { color: COLORS.warning, fontSize: 12, fontWeight: '700', marginHorizontal: 16, marginBottom: 16 },
    runsRow:       { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 16 },
    runBtn:        { flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.cardBorder, alignItems: 'center', justifyContent: 'center' },
    runBtnSel:     { backgroundColor: '#D9770622', borderColor: '#D97706' },
    runTxt:        { color: COLORS.gray, fontSize: 15, fontWeight: '800' },
    runTxtSel:     { color: '#D97706' },
    runHint:       { color: COLORS.gray, fontSize: 11, marginHorizontal: 16, marginTop: -10, marginBottom: 14, lineHeight: 16 },
    actions:       { flexDirection: 'row', gap: 10, marginHorizontal: 16 },
    cancelBtn:     { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder },
    cancelTxt:     { color: COLORS.gray, fontWeight: '700', fontSize: 15 },
    confirmBtn:    { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#DC2626' },
    confirmTxt:    { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    confirmDis:    { opacity: 0.4 },
  }), [COLORS]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={wdStyles.overlay}>
        <View style={wdStyles.sheet}>
          <View style={wdStyles.handle} />

          {/* HOW OUT? */}
          <Text style={wdStyles.sectionHdr}>
            {isFreeHit ? '⚡ FREE HIT — RUN OUT ONLY' : 'HOW OUT?'}
          </Text>
          <View style={wdStyles.grid}>
            {availableTypes.map(w => (
              <TouchableOpacity
                key={w.id}
                style={[wdStyles.typeBtn, selType === w.id && wdStyles.typeSel,
                  selType === w.id && { borderColor: w.color, backgroundColor: w.color + '22' }]}
                onPress={() => { setSelType(w.id); setSelFielder(null); if (!BOTH_ENDS_TYPES.includes(w.id)) setDismissed('striker'); }}
              >
                <Icon name={w.icon} size={22} color={selType === w.id ? w.color : COLORS.gray} />
                <Text style={[wdStyles.typeLbl, selType === w.id && { color: w.color }]}>{w.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* WHO IS OUT — only for run out / retired / other */}
          {needsWhoIsOut && (
            <>
              <Text style={wdStyles.sectionHdr}>WHO IS OUT?</Text>
              <View style={wdStyles.whoRow}>
                <TouchableOpacity
                  style={[wdStyles.whoBtn, dismissed === 'striker' && wdStyles.whoBtnSel]}
                  onPress={() => setDismissed('striker')}
                >
                  <View style={wdStyles.strikerBadge}>
                    <Text style={wdStyles.strikerTxt}>ON STRIKE</Text>
                  </View>
                  <Text style={[wdStyles.whoName, dismissed === 'striker' && wdStyles.whoNameSel]}>
                    {striker?.full_name || '—'}
                  </Text>
                  {dismissed === 'striker' && <Icon name="close-circle" size={16} color="#DC2626" />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    wdStyles.whoBtn,
                    !nonStriker && { opacity: 0.45 },
                    dismissed === 'nonStriker' && wdStyles.whoBtnSel,
                  ]}
                  onPress={() => setDismissed('nonStriker')}
                  disabled={!nonStriker}
                >
                  <View style={[wdStyles.strikerBadge, { backgroundColor: COLORS.cardBorder }]}>
                    <Text style={[wdStyles.strikerTxt, { color: COLORS.gray }]}>NON-STRIKE</Text>
                  </View>
                  <Text style={[wdStyles.whoName, dismissed === 'nonStriker' && wdStyles.whoNameSel]}>
                    {nonStriker?.full_name || '—'}
                  </Text>
                  {dismissed === 'nonStriker' && <Icon name="close-circle" size={16} color="#DC2626" />}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Runs completed before run out */}
          {needsRunOutRuns && (
            <>
              <Text style={wdStyles.sectionHdr}>RUNS COMPLETED BEFORE OUT</Text>
              <View style={wdStyles.runsRow}>
                {[0, 1, 2, 3].map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[wdStyles.runBtn, runOutRuns === r && wdStyles.runBtnSel]}
                    onPress={() => setRunOutRuns(r)}
                  >
                    <Text style={[wdStyles.runTxt, runOutRuns === r && wdStyles.runTxtSel]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={wdStyles.runHint}>
                Example: out while taking the 2nd run means 1 run completed.
              </Text>
            </>
          )}

          {/* Fielder picker */}
          {needsFielder && bowlingPlayers.length > 0 && (
            <>
              <Text style={wdStyles.fielderHdr}>FIELDER (required)</Text>
              <FlatList
                data={bowlingPlayers}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={p => p.id}
                contentContainerStyle={wdStyles.fielderList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[wdStyles.fielderBtn, selFielder?.id === item.id && wdStyles.fielderSel]}
                    onPress={() => setSelFielder(prev => prev?.id === item.id ? null : item)}
                  >
                    <Text style={[wdStyles.fielderTxt, selFielder?.id === item.id && wdStyles.fielderTxtSel]}>
                      {item.full_name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </>
          )}
          {needsFielder && bowlingPlayers.length === 0 && (
            <Text style={wdStyles.fielderWarn}>No fielders found for the bowling team.</Text>
          )}

          {/* Buttons */}
          <View style={wdStyles.actions}>
            <TouchableOpacity style={wdStyles.cancelBtn} onPress={onCancel}>
              <Text style={wdStyles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[wdStyles.confirmBtn, !canConfirm && wdStyles.confirmDis]}
              disabled={!canConfirm}
              onPress={() => onConfirm(selType, selFielder, dismissed, needsRunOutRuns ? runOutRuns : 0)}
            >
              <Text style={wdStyles.confirmTxt}>{needsFielder && !selFielder ? 'SELECT FIELDER' : 'CONFIRM WICKET'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── Innings Complete Modal ────────────────────────────────
const InningsCompleteModal = ({
  visible, battingTeam, bowlingTeam, score, wickets,
  onStartNext, onEndMatch, isLastInnings, resultText, nextActionLabel,
  isSuperOver, superOverNumber, showTarget, isTieBreaker, COLORS, ic,
}) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={ic.overlay}>
      <View style={ic.card}>
        <Icon
          name={isLastInnings ? 'trophy' : 'cricket'}
          size={44}
          color={isLastInnings ? COLORS.gold : COLORS.cyan}
          style={{ marginBottom: 12 }}
        />
        <Text style={ic.title}>
          {isLastInnings
            ? 'Match Over!'
            : isTieBreaker
              ? 'Match Tied'
              : isSuperOver
                ? superOverLabel(superOverNumber)
                : '1st Innings Complete'}
        </Text>

        {showTarget ? (
          <>
            <Text style={ic.team}>{battingTeam?.team_name}</Text>
            <Text style={ic.score}>{score}/{wickets}</Text>
            <Text style={[ic.sub, { color: COLORS.gray }]}>Target: {score + 1}</Text>
          </>
        ) : (
          <>
            <Text style={[ic.resultTxt, { color: COLORS.gold }]}>{resultText}</Text>
            <Text style={ic.team}>{battingTeam?.team_name}: {score}/{wickets}</Text>
          </>
        )}

        {!isLastInnings
          ? <TouchableOpacity style={ic.nextBtn} onPress={onStartNext}>
              <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={ic.nextGrad}>
                <Text style={ic.nextTxt}>{nextActionLabel || 'Continue →'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          : <TouchableOpacity style={ic.nextBtn} onPress={onEndMatch}>
              <LinearGradient colors={[COLORS.gold, '#B8942A']} style={ic.nextGrad}>
                <Text style={[ic.nextTxt, { color: COLORS.navy }]}>View Full Scorecard</Text>
              </LinearGradient>
            </TouchableOpacity>
        }
      </View>
    </View>
  </Modal>
);

// ── Ball-by-Ball Feed ─────────────────────────────────────
const ballResultLabel = (ball) => {
  if (Number(ball?.is_wicket || 0) === 1) return 'W';

  const batRuns = Number(ball?.runs_scored || 0);
  const extraRuns = Number(ball?.extra_runs || 0);
  if (ball?.extra_type === 'wide') return extraRuns > 1 ? `${extraRuns}-WD` : 'WD';
  if (ball?.extra_type === 'no_ball') return batRuns > 0 ? `${batRuns}-NB` : 'NB';
  if (ball?.extra_type === 'bye') return `${extraRuns}-B`;
  if (ball?.extra_type === 'leg_bye') return `${extraRuns}-LB`;
  return String(batRuns);
};

const ballOutcomeText = (ball) => {
  const wicketType = String(ball?.wicket_type || '').toLowerCase();
  const fielderName = ball?.fielder_name || ball?.wicket_fielder_name || '';
  if (Number(ball?.is_wicket || 0) === 1) {
    if (wicketType === 'caught') return fielderName ? `Caught by ${fielderName}` : 'Caught';
    if (wicketType === 'run_out') return fielderName ? `Run out by ${fielderName}` : 'Run out';
    if (wicketType === 'stumped') return fielderName ? `Stumped by ${fielderName}` : 'Stumped';
    if (wicketType === 'bowled') return 'Bowled';
    if (wicketType === 'lbw') return 'LBW';
    if (wicketType === 'hit_wicket') return 'Hit wicket';
    if (wicketType === 'retired' || wicketType === 'retired_hurt') return 'Retired hurt';
    return wicketType ? wicketType.replace(/_/g, ' ') : 'Wicket';
  }

  const batRuns = Number(ball?.runs_scored || 0);
  const extraRuns = Number(ball?.extra_runs || 0);
  if (ball?.extra_type === 'wide') return extraRuns > 1 ? `${extraRuns} wides` : 'Wide';
  if (ball?.extra_type === 'no_ball') return batRuns ? `No ball + ${batRuns} run${batRuns === 1 ? '' : 's'}` : 'No ball';
  if (ball?.extra_type === 'bye') return `${extraRuns} bye${extraRuns === 1 ? '' : 's'}`;
  if (ball?.extra_type === 'leg_bye') return `${extraRuns} leg bye${extraRuns === 1 ? '' : 's'}`;
  if (batRuns === 6) return 'Six runs';
  if (batRuns === 4) return 'Four runs';
  if (batRuns === 0) return 'Dot ball';
  return `${batRuns} run${batRuns === 1 ? '' : 's'}`;
};

const BallByBallTab = ({ allBalls, COLORS, bb }) => {
  // Group balls by over_id (maintain order)
  const overs = [];
  let current = null;
  for (const ball of allBalls) {
    if (!current || current.overId !== ball.over_id) {
      current = { overId: ball.over_id, overNumber: ball.over_number || overs.length + 1, balls: [] };
      overs.push(current);
    }
    current.balls.push(ball);
  }
  overs.reverse(); // Most recent first

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      {overs.map((over, oi) => (
        <View key={over.overId || oi} style={bb.overBlock}>
          <View style={bb.overHeader}>
            <Text style={bb.overLabel}>OVER {Math.max(0, Number(over.overNumber || 1) - 1)}</Text>
            <View style={bb.overRule} />
          </View>
          {[...over.balls].reverse().map((ball, bi) => {
            const badge = ballBadgePalette(ball, COLORS);
            return (
              <View key={ball.id || bi} style={bb.ballRow}>
                <View style={bb.deliveryPill}>
                  <Text style={bb.deliveryText}>
                    {Math.max(0, Number(over.overNumber || 1) - 1)}.{Math.max(0, Number(ball.ball_number) || 0)}
                  </Text>
                </View>
                <View style={bb.playerStack}>
                  <View style={bb.playerLine}>
                  <Icon name="cricket" size={16} color={COLORS.gold} />
                  <Text style={bb.playerName} numberOfLines={1}>{ball.striker_name || 'Batter'}</Text>
                  <Text style={bb.facesText}>facing</Text>
                  <Icon name="tennis-ball" size={15} color={COLORS.gold} />
                  <Text style={bb.playerName} numberOfLines={1}>{ball.bowler_name || 'Bowler'}</Text>
                  </View>
                  <Text style={bb.outcomeText} numberOfLines={1}>{ballOutcomeText(ball)}</Text>
                </View>
                <View style={[bb.resultBadge, { backgroundColor: badge.background, borderColor: badge.border }]}>
                  <Text style={[bb.resultText, { color: badge.text }]} numberOfLines={1}>{ballResultLabel(ball)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
      {overs.length === 0 && (
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <Icon name="cricket" size={40} color={COLORS.cardBorder} />
          <Text style={{ color: COLORS.gray, marginTop: 12 }}>No balls bowled yet</Text>
        </View>
      )}
    </ScrollView>
  );
};

// ── Scoring Pad ───────────────────────────────────────────
const RUN_BTNS = [0, 1, 2, 3, 4, 6];

const ScoringPad = ({ onRun, onExtra, onWicket, onUndo, onSwap, canUndo, canSwap, COLORS, pad, extraBtns }) => {
  const [customModal, setCustomModal] = useState({ visible: false, value: '' });

  const submitCustomRuns = () => {
    const n = parseInt(customModal.value, 10);
    if (!isNaN(n) && n >= 0) onRun(n);
    setCustomModal({ visible: false, value: '' });
  };

  return (
    <View style={pad.wrap}>
      {/* Run row */}
      <View style={pad.runRow}>
        {RUN_BTNS.map(r => (
          <TouchableOpacity
            key={r}
            style={[pad.runBtn,
              (r === 4 || r === 6) ? { backgroundColor: '#14532D', borderColor: '#22C55E' } : {}
            ]}
            onPress={() => onRun(r)}
          >
            <Text style={[pad.runTxt, (r === 4 || r === 6) && { color: '#DCFCE7' }]}>{r}</Text>
          </TouchableOpacity>
        ))}
        {/* Custom runs — opens a cross-platform numeric input. */}
        <TouchableOpacity
          style={[pad.runBtn, { backgroundColor: COLORS.orange, borderColor: COLORS.orange }]}
          onPress={() => setCustomModal({ visible: true, value: '' })}
          accessibilityLabel="Enter custom runs"
        >
          <Icon name="pencil-plus" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        {/* Undo follows the delivery ledger, including wides and no-balls. */}
        <TouchableOpacity
          style={[pad.undoBtn, !canUndo && { opacity: 0.3 }]}
          onPress={onUndo}
          disabled={!canUndo}
        >
          <Icon name="undo" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Extras row */}
      <View style={pad.extraRow}>
        {extraBtns.map(e => (
          <TouchableOpacity
            key={e.id}
            style={[pad.extraBtn, { borderColor: e.color }]}
            onPress={() => onExtra(e.id)}
          >
            <Text style={[pad.extraTxt, { color: e.color }]}>{e.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Wicket + Swap row */}
      <View style={pad.actionRow}>
        <TouchableOpacity style={pad.wicketBtn} onPress={onWicket}>
          <Text style={pad.wicketTxt}>WICKET</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[pad.swapBtn, !canSwap && { opacity: 0.3 }]}
          onPress={() => onSwap()}
          disabled={!canSwap}
        >
          <Icon name="swap-horizontal" size={18} color={COLORS.gray} />
          <Text style={pad.swapTxt}>SWAP</Text>
        </TouchableOpacity>
      </View>

      {/* Custom Runs Modal (replaces Alert.prompt — works on Android + iOS) */}
      <Modal
        transparent
        visible={customModal.visible}
        animationType="fade"
        onRequestClose={() => setCustomModal({ visible: false, value: '' })}
      >
        <View style={{ flex: 1, backgroundColor: '#000000CC', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 300, backgroundColor: COLORS.navy, borderRadius: 16, padding: 20, borderWidth: 1.5, borderColor: COLORS.cardBorder }}>
            <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '800', marginBottom: 4 }}>Custom Runs</Text>
            <Text style={{ color: COLORS.gray, fontSize: 12, marginBottom: 14 }}>Enter runs scored off the bat</Text>
            <TextInput
              style={{ height: 48, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.cardBorder, paddingHorizontal: 14, color: COLORS.white, fontSize: 22, fontWeight: '800', backgroundColor: COLORS.inputBg, marginBottom: 16, textAlign: 'center' }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={COLORS.gray}
              value={customModal.value}
              onChangeText={val => setCustomModal(prev => ({ ...prev, value: val.replace(/[^0-9]/g, '') }))}
              autoFocus
              maxLength={2}
              onSubmitEditing={submitCustomRuns}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setCustomModal({ visible: false, value: '' })}
                style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.cardBorder, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: COLORS.gray, fontWeight: '700', fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitCustomRuns}
                style={{ flex: 1, height: 44, borderRadius: 10, backgroundColor: COLORS.orange, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Add Runs</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ── Extra Runs Modal ─────────────────────────────────────
const EXTRA_RUN_OPTS = [0, 1, 2, 3, 4, 5, 6];

const EXTRA_CONFIG = {
  wide:    { icon: 'arrow-expand-horizontal', label: 'WIDE',     sub: 'Additional wide runs', accentKey: 'warning' },
  no_ball: { icon: 'close-circle',   label: 'NO BALL',  sub: 'Runs scored off bat', accentKey: 'danger'  },
  bye:     { icon: 'run-fast',        label: 'BYE',      sub: 'Bye runs',            accentKey: 'cyan'    },
  leg_bye: { icon: 'human-handsup',   label: 'LEG BYE',  sub: 'Leg bye runs',        accent: '#F2B01E'    },
};

const getErmStyles = (COLORS) => StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: '#000000CC', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:       { width: '100%', maxWidth: 340, backgroundColor: COLORS.navy, borderRadius: 20, borderWidth: 1.5, overflow: 'hidden' },
  hdr:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14 },
  title:       { flex: 1, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  closeBtn:    { padding: 4 },
  sub:         { color: COLORS.gray, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, paddingHorizontal: 18, marginBottom: 14 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10, marginBottom: 16 },
  runBtn:      { width: 64, height: 64, borderRadius: 14, borderWidth: 1.5, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  runNum:      { fontSize: 22, fontWeight: '800' },
  runSub:      { fontSize: 10, color: COLORS.gray, marginTop: 1 },
  customRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, marginBottom: 10 },
  customInput: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, color: COLORS.white, fontSize: 16, backgroundColor: COLORS.inputBg },
  customOk:    { height: 44, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  customOkTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  cancelBtn:   { alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  cancelTxt:   { color: COLORS.gray, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
});

const ExtraRunsModal = ({ visible, type, COLORS, onSelect, onCancel }) => {
  const erm = useMemo(() => getErmStyles(COLORS), [COLORS]);
  const [customVal, setCustomVal] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const cfg = EXTRA_CONFIG[type] || {};
  const accent = cfg.accent || COLORS[cfg.accentKey] || COLORS.gold;

  const handleSelect = (r) => { setShowCustom(false); setCustomVal(''); onSelect(r); };
  const handleCustomConfirm = () => {
    const r = parseInt(customVal, 10);
    if (!isNaN(r) && r >= 0) handleSelect(r);
  };
  const handleClose = () => { setShowCustom(false); setCustomVal(''); onCancel(); };

  if (!visible || !type) return null;

  const extraRunOptions = ['bye', 'leg_bye'].includes(type)
    ? EXTRA_RUN_OPTS.filter(r => r !== 0)
    : EXTRA_RUN_OPTS;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleClose}>
      <View style={erm.overlay}>
        <View style={[erm.sheet, { borderColor: accent }]}>
          {/* Header */}
          <View style={[erm.hdr, { backgroundColor: accent + '22' }]}>
            <Icon name={cfg.icon} size={22} color={accent} />
            <Text style={[erm.title, { color: accent }]}>{cfg.label}</Text>
            <TouchableOpacity onPress={handleClose} style={erm.closeBtn}>
              <Icon name="close" size={18} color={COLORS.gray} />
            </TouchableOpacity>
          </View>

          <Text style={erm.sub}>{cfg.sub}</Text>

          {/* Run grid */}
          <View style={erm.grid}>
            {extraRunOptions.map(r => {
              const displayValue = r === 0 && type === 'wide'
                ? 'WD'
                : r === 0 && type === 'no_ball'
                  ? 'NB'
                  : String(r);
              return (
                <TouchableOpacity key={r} style={[erm.runBtn, { borderColor: accent + '66' }]} onPress={() => handleSelect(r)}>
                  <Text style={[erm.runNum, { color: accent }, displayValue.length > 1 && { fontSize: 17 }]}>{displayValue}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[erm.runBtn, { borderColor: accent, backgroundColor: accent + '22' }]}
              onPress={() => setShowCustom(true)}
              accessibilityLabel="Enter custom extra runs"
            >
              <Icon name="pencil-plus" size={23} color={accent} />
              <Text style={erm.runSub}>custom</Text>
            </TouchableOpacity>
          </View>

          {/* Custom input */}
          {showCustom && (
            <View style={erm.customRow}>
              <TextInput
                style={[erm.customInput, { borderColor: accent }]}
                placeholder="Enter runs"
                placeholderTextColor={COLORS.gray}
                keyboardType="number-pad"
                value={customVal}
                onChangeText={setCustomVal}
                autoFocus
              />
              <TouchableOpacity style={[erm.customOk, { backgroundColor: accent }]} onPress={handleCustomConfirm}>
                <Text style={erm.customOkTxt}>OK</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={handleClose} style={erm.cancelBtn}>
            <Text style={erm.cancelTxt}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ── Main Screen ───────────────────────────────────────────
const LiveScoringScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const sc     = useMemo(() => getScStyles(COLORS), [COLORS]);
  const pad    = useMemo(() => getPadStyles(COLORS), [COLORS]);
  const bb     = useMemo(() => getBbStyles(COLORS), [COLORS]);
  const ic     = useMemo(() => getIcStyles(COLORS), [COLORS]);
  const extraBtns = useMemo(() => getExtraBtns(COLORS), [COLORS]);

  const {
    match: matchParam, battingTeam: battingTeamParam, bowlingTeam: bowlingTeamParam,
    inningsNumber: inningsNumberParam, target,
    isSuperOver: isSuperOverParam = false,
    superOverNumber: superOverNumberParam = null,
    matchId: routeMatchId,   // passed from SeriesDetailScreen for resume
  } = route.params || {};

  // These will be overwritten if recovered from DB in initScoring
  const [resolvedParams, setResolvedParams] = React.useState({
    match:         matchParam        || null,
    battingTeam:   battingTeamParam  || null,
    bowlingTeam:   bowlingTeamParam  || null,
    inningsNumber: inningsNumberParam || 1,
    target:        target             || null,
    isSuperOver:   toBool(isSuperOverParam),
    superOverNumber: superOverNumberParam,
  });
  const match         = resolvedParams.match;
  const battingTeam   = resolvedParams.battingTeam;
  const bowlingTeam   = resolvedParams.bowlingTeam;
  const inningsNumber = resolvedParams.inningsNumber;
  const resolvedTarget = resolvedParams.target;
  const isSuperOver = toBool(resolvedParams.isSuperOver || innings?.is_super_over);
  const superOverNumber = Number(
    resolvedParams.superOverNumber || innings?.super_over_number || (isSuperOver ? Math.max(1, Math.ceil((Number(inningsNumber) - 2) / 2)) : 0)
  ) || 0;
  const isSuperOverChase = isSuperOver && isSecondSuperOverInnings(inningsNumber, superOverNumber);
  const inningsOversLimit = isSuperOver ? 1 : Math.max(1, Number(match?.overs || 1));
  const inningsWicketLimit = isSuperOver
    ? Math.min(2, maxWicketsForMatch(match))
    : maxWicketsForMatch(match);
  const inningsDisplayLabel = isSuperOver
    ? superOverLabel(superOverNumber, isSuperOverChase)
    : `${inningsNumber === 1 ? '1st' : '2nd'} Innings`;
  const [seriesName, setSeriesName] = useState(
    matchParam?.series_name || route.params?.seriesName || ''
  );
  const headerSeriesName = seriesName || match?.series_name || 'CricZodiac';
  const headerMatchName = match?.title || 'Match';
  const headerVenue = match?.venue?.trim?.() || '';

  // Core state
  const [innings, setInnings]           = useState(null);
  const [currentOver, setCurrentOver]   = useState(null);
  const [striker, setStriker]           = useState(null);
  const [nonStriker, setNonStriker]     = useState(null);
  const [bowler, setBowler]             = useState(null);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState('scorecard'); // 'scorecard' | 'ballByBall'

  // Score state
  const [totalRuns, setTotalRuns]       = useState(0);
  const [totalWickets, setTotalWickets] = useState(0);
  const [extras, setExtras]             = useState({ wide: 0, no_ball: 0, bye: 0, leg_bye: 0 });
  const [overNumber, setOverNumber]     = useState(1);
  const [legalBalls, setLegalBalls]     = useState(0);
  const [overBalls, setOverBalls]       = useState([]);    // balls in current over (for dots)
  const [allBalls, setAllBalls]         = useState([]);    // full innings ball history

  useFocusEffect(
    useCallback(() => {
      KeepScreenAwake?.enable?.();
      navigation.setOptions?.({ gestureEnabled: false });

      const parentNavigation = navigation.getParent?.();
      parentNavigation?.setOptions?.({ tabBarStyle: { display: 'none' } });

      const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => true);
      const removeSubscription = navigation.addListener('beforeRemove', (event) => {
        if (BACK_ACTION_TYPES.has(event.data?.action?.type)) {
          event.preventDefault();
        }
      });

      return () => {
        KeepScreenAwake?.disable?.();
        backSubscription.remove();
        removeSubscription();
        navigation.setOptions?.({ gestureEnabled: true });
        parentNavigation?.setOptions?.({ tabBarStyle: getAdminTabBarStyle(COLORS) });
      };
    }, [COLORS, navigation])
  );

  // Per-player live stats (updated as balls come in)
  const [strikerStats, setStrikerStats]       = useState({ runs: 0, balls: 0, fours: 0, sixes: 0 });
  const [nonStrikerStats, setNonStrikerStats] = useState({ runs: 0, balls: 0, fours: 0, sixes: 0 });
  const [bowlerStats, setBowlerStats]         = useState({ overs: 0, runs: 0, wickets: 0, maidens: 0 });
  const [partnership, setPartnership]         = useState({ runs: 0, balls: 0 });

  // Innings complete modal
  const [showInningsComplete, setShowInningsComplete] = useState(false);
  const [inningsResultText, setInningsResultText]     = useState('');

  // Free hit state
  const [isFreeHit, setIsFreeHit] = useState(false);
  const isFreeHitRef = useRef(false);
  useEffect(() => { isFreeHitRef.current = isFreeHit; }, [isFreeHit]);

  // Wicket dismissal modal
  const [wicketModal, setWicketModal]       = useState({ visible: false });
  const [bowlingPlayers, setBowlingPlayers] = useState([]);
  const pendingSelectBowlerRef              = useRef(false);

  // Extra runs modal state
  const [extraModal, setExtraModal] = useState({ visible: false, type: null });


  // Refs to avoid stale closures in callbacks
  const inningsRef    = useRef(null);
  const overRef       = useRef(null);
  const strikerRef    = useRef(null);
  const nonStrikerRef = useRef(null);
  const bowlerRef     = useRef(null);
  const legalRef      = useRef(0);
  const overNumRef    = useRef(1);
  const totalRunsRef  = useRef(0);
  const totalWktsRef  = useRef(0);
  const processedBatsmanSelectionRef = useRef(null);
  const processedBowlerSelectionRef  = useRef(null);
  const processedWicketDismissedRef  = useRef(null);
  // Tracks the bowler who completed the most recent over — used to enforce the
  // "cannot bowl consecutive overs" rule when handleChangeBowler opens SelectBowler.
  const lastOverBowlerIdRef = useRef(null);
  // Stats refs — needed so _swap and recordBall always read current values
  // even when called inside async functions after awaits.
  const strikerStatsRef    = useRef({ runs: 0, balls: 0, fours: 0, sixes: 0 });
  const nonStrikerStatsRef = useRef({ runs: 0, balls: 0, fours: 0, sixes: 0 });

  useEffect(() => { initScoring(); }, []);

  useEffect(() => {
    setSyncSuccessToastsSuppressed(true);
    return () => setSyncSuccessToastsSuppressed(false);
  }, []);

  useEffect(() => {
    let active = true;
    const loadFielders = async () => {
      if (!bowlingTeam?.id) { setBowlingPlayers([]); return; }

      // 1. Try API first to get fresh player list
      try {
        const qParts = [`team_id=${encodeURIComponent(bowlingTeam.id)}`];
        if (bowlingTeam.match_id)   qParts.push(`match_id=${encodeURIComponent(bowlingTeam.match_id)}`);
        if (bowlingTeam.team_label) qParts.push(`team_label=${encodeURIComponent(bowlingTeam.team_label)}`);
        if (bowlingTeam.club_id)    qParts.push(`club_id=${encodeURIComponent(bowlingTeam.club_id)}`);
        const res = await ApiService.get(`${API_ENDPOINTS.TEAMS_PLAYERS}?${qParts.join('&')}`);
        const serverList = res?.players || res?.data?.players || [];
        if (serverList.length) {
          const mapped = serverList.map(sp => ({
            id:          sp.player_uuid || String(sp.player_id),
            player_id:   sp.player_uuid || String(sp.player_id),
            full_name:   (sp.full_name || sp.name || 'Unknown').trim(),
            player_type: sp.player_type || 'allrounder',
          }));
          if (active) setBowlingPlayers(mapped);
          upsertTeamPlayersFromServer(serverList, bowlingTeam.id).catch(() => {});
          return;
        }
      } catch (_) {}

      // 2. Fall back to SQLite by team_id
      try {
        const local = await getTeamPlayers(bowlingTeam.id);
        if (local.length) {
          if (active) setBowlingPlayers(local);
          return;
        }
      } catch (_) {}

      // 3. Last resort — all players in team_players table (no team filter)
      try {
        const all = await getAllTeamPlayers();
        if (active) setBowlingPlayers(all);
      } catch (_) {
        if (active) setBowlingPlayers([]);
      }
    };
    loadFielders();
    return () => { active = false; };
  }, [bowlingTeam?.id]);

  // Keep refs in sync
  useEffect(() => { inningsRef.current       = innings;       }, [innings]);
  useEffect(() => { overRef.current          = currentOver;   }, [currentOver]);
  useEffect(() => { strikerRef.current       = striker;       }, [striker]);
  useEffect(() => { nonStrikerRef.current    = nonStriker;    }, [nonStriker]);
  useEffect(() => { bowlerRef.current        = bowler;        }, [bowler]);
  useEffect(() => { legalRef.current         = legalBalls;    }, [legalBalls]);
  useEffect(() => { overNumRef.current       = overNumber;    }, [overNumber]);
  useEffect(() => { totalRunsRef.current     = totalRuns;     }, [totalRuns]);
  useEffect(() => { totalWktsRef.current     = totalWickets;  }, [totalWickets]);
  useEffect(() => { strikerStatsRef.current    = strikerStats;    }, [strikerStats]);
  useEffect(() => { nonStrikerStatsRef.current = nonStrikerStats; }, [nonStrikerStats]);

  useEffect(() => {
    const selection = route.params?.batsmanSelection;
    if (!selection?.requestId || processedBatsmanSelectionRef.current === selection.requestId) return;

    processedBatsmanSelectionRef.current = selection.requestId;

    const triggerBowlerIfNeeded = () => {
      if (pendingSelectBowlerRef.current) {
        pendingSelectBowlerRef.current = false;
        setTimeout(() => {
          navigation.navigate('SelectBowler', {
            inningsId:           inningsRef.current?.id,
            team:                bowlingTeam,
            currentBowlerId:     bowlerRef.current?.id,
            requestId:           uuid.v4(),
            returnScreen:        'LiveScoring',
            resetOver:           true,
            maxOversPerBowler:   match.max_overs_per_bowler || 0,
          });
        }, 300);
      }
    };

    const savedBattingStats = async (player) => {
      const emptyStats = { runs: 0, balls: 0, fours: 0, sixes: 0 };
      const activeInningsId = inningsRef.current?.id;
      if (!player?.id || !activeInningsId) return emptyStats;

      try {
        const stats = await getPlayerBattingStats(activeInningsId, player.id);
        return stats
          ? { runs: stats.runs_scored || 0, balls: stats.balls_faced || 0, fours: stats.fours || 0, sixes: stats.sixes || 0 }
          : emptyStats;
      } catch (error) {
        console.warn('[LiveScoring] Could not restore batter stats:', error?.message);
        return emptyStats;
      }
    };

    const applyBatsmanSelection = async () => {
      if (selection.type === 'new_batsman') {
        // An incoming batter, including a returning retired-hurt batter, takes strike.
        const nextStriker = selection.striker || null;
        const nextStats = await savedBattingStats(nextStriker);
        strikerRef.current = nextStriker;
        strikerStatsRef.current = nextStats;
        setStriker(nextStriker);
        setStrikerStats(nextStats);
        triggerBowlerIfNeeded();
      } else if (selection.type === 'new_non_striker') {
        // Replace the non-striker only, preserving a returning batter's figures.
        const nextNonStriker = selection.striker || null;
        const nextStats = await savedBattingStats(nextNonStriker);
        nonStrikerRef.current = nextNonStriker;
        nonStrikerStatsRef.current = nextStats;
        setNonStriker(nextNonStriker);   // SelectBatsman returns player in .striker field
        setNonStrikerStats(nextStats);
        triggerBowlerIfNeeded();
      } else if (selection.striker && selection.nonStriker) {
        // Opening pair (or re-selection due to technical restart) — clear all
        // existing balls/overs/scorecards for this innings so scoring starts fresh.
        const activeInnings = inningsRef.current;
        if (activeInnings?.id) {
          clearInningsProgress(activeInnings.id).catch(e =>
            console.warn('[LiveScoring] clearInningsProgress failed:', e)
          );
        }
        const emptyStats = { runs: 0, balls: 0, fours: 0, sixes: 0 };
        strikerRef.current = selection.striker;
        nonStrikerRef.current = selection.nonStriker;
        strikerStatsRef.current = emptyStats;
        nonStrikerStatsRef.current = emptyStats;
        setStriker(selection.striker);
        setNonStriker(selection.nonStriker);
        setStrikerStats(emptyStats);
        setNonStrikerStats(emptyStats);
        // Reset all live-scoring state
        setTotalRuns(0);       totalRunsRef.current = 0;
        setTotalWickets(0);    totalWktsRef.current = 0;
        setExtras({ wide: 0, no_ball: 0, bye: 0, leg_bye: 0 });
        setOverNumber(1);      overNumRef.current = 1;
        setLegalBalls(0);      legalRef.current = 0;
        setCurrentOver(null);  overRef.current = null;
        setOverBalls([]);
        setAllBalls([]);
        setPartnership({ runs: 0, balls: 0 });
        setBowlerStats({ overs: 0, runs: 0, wickets: 0, maidens: 0 });
      }
      navigation.setParams({ batsmanSelection: null });
    };

    applyBatsmanSelection().catch((error) => {
      console.warn('[LiveScoring] Could not apply batsman selection:', error?.message);
      navigation.setParams({ batsmanSelection: null });
    });
  }, [navigation, route.params?.batsmanSelection]);

  useEffect(() => {
    const selection = route.params?.bowlerSelection;
    if (!selection?.requestId || processedBowlerSelectionRef.current === selection.requestId) return;

    processedBowlerSelectionRef.current = selection.requestId;
    if (selection.bowler) {
      setBowler(selection.bowler);
      // Restore accumulated stats if this bowler has already bowled this innings
      const bowlerId = selection.bowler.id;
      const pastBalls = allBalls.filter(b => b.bowler_id === bowlerId);
      if (pastBalls.length > 0) {
        const pastOverIds = [...new Set(pastBalls.map(b => b.over_id))];
        const accRuns = pastBalls.reduce((s, b) => s + bowlerRunsForDelivery(b), 0);
        const accWickets = pastBalls.filter(isBowlerCreditWicket).length;
        let accMaidens = 0;
        for (const ovId of pastOverIds) {
          const ovBalls = pastBalls.filter(b => b.over_id === ovId);
          const legalCount = ovBalls.filter(b => b.is_valid_ball === 1).length;
          if (legalCount >= 6) {
            const ovRuns = ovBalls.reduce((s, b) => s + bowlerRunsForDelivery(b), 0);
            if (ovRuns === 0) accMaidens++;
          }
        }
        setBowlerStats({ overs: pastOverIds.length, runs: accRuns, wickets: accWickets, maidens: accMaidens });
      } else {
        setBowlerStats({ overs: 0, runs: 0, wickets: 0, maidens: 0 });
      }
    }
    if (selection.resetOver) {
      setOverBalls([]);
      setLegalBalls(0);
      legalRef.current = 0;
    }
    navigation.setParams({ bowlerSelection: null });
  }, [navigation, route.params?.bowlerSelection, allBalls]);

  useEffect(() => {
    const dismissed = route.params?.wicketDismissed;
    if (!dismissed?.requestId || processedWicketDismissedRef.current === dismissed.requestId) return;

    processedWicketDismissedRef.current = dismissed.requestId;
    strikerRef.current = null;
    strikerStatsRef.current = { runs: 0, balls: 0, fours: 0, sixes: 0 };
    setStriker(null);
    setStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
    navigation.setParams({ wicketDismissed: null });
  }, [navigation, route.params?.wicketDismissed]);

  // After both batsmen are set and there is no bowler yet → ask for bowler
  useEffect(() => {
    const canScoreWithOneBatter = striker && !nonStriker && isLastBatterMode(match, totalWickets);
    if (!striker || (!nonStriker && !canScoreWithOneBatter)) return;
    if (bowlerRef.current) return;       // bowler already picked
    if (!inningsRef.current) return;     // innings not ready yet

    const t = setTimeout(() => {
      navigation.navigate('SelectBowler', {
        inningsId:         inningsRef.current.id,
        team:              bowlingTeam,
        requestId:         uuid.v4(),
        returnScreen:      'LiveScoring',
        maxOversPerBowler: match.max_overs_per_bowler || 0,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [striker, nonStriker, totalWickets, match?.allow_last_batsman, match?.players_per_team]);

  // ── Init ───────────────────────────────────────────────
  const initScoring = async () => {
    // ── Step 1: Resolve match / teams — from route params OR recover from DB ──
    const matchId = routeMatchId || matchParam?.id;
    if (!matchId) {
      setLoading(false);
      return; // render guard will show "Session data lost"
    }

    let rMatch         = matchParam       || null;
    let rBattingTeam   = battingTeamParam || null;
    let rBowlingTeam   = bowlingTeamParam || null;
    let rInningsNumber = inningsNumberParam || 1;
    let rIsSuperOver   = toBool(isSuperOverParam);
    let rSuperOverNumber = Number(superOverNumberParam) || null;
    let rTarget = target || null;

    // If any key param is missing, recover everything from SQLite (+ server fallback)
    if (!rMatch || !rBattingTeam || !rBowlingTeam) {
      try {
        // ── Step 1a: Find match in SQLite by id, then by server_id as fallback ──
        rMatch = await getMatch(matchId);
        if (!rMatch) {
          // matchId might be a server integer string like "5" — try server_id column
          rMatch = await queryFirstRow(
            'SELECT * FROM matches WHERE server_id = ?', [matchId]
          );
        }

        // ── Step 1b: Still not found — fetch from server and upsert ────────
        if (!rMatch) {
          try {
            const res = await ApiService.get(
              `${API_ENDPOINTS.MATCHES_LIST}?id=${encodeURIComponent(matchId)}`
            );
            const serverMatches = res?.matches || res?.data?.matches || [];
            if (serverMatches.length) {
              await upsertMatchesFromServer(serverMatches);
              const m = serverMatches[0];
              const savedId = m.local_id || String(m.id);
              rMatch = await getMatch(savedId);
            }
          } catch (_) {}
        }

        if (!rMatch) { setLoading(false); return; }

        // ── Step 2a: Find teams in SQLite using the match's LOCAL id ──────────
        // (teams are always stored with the local UUID as match_id)
        let teams = await getMatchTeams(rMatch.id);

        // ── Step 2b: Not found — fetch teams from server and save locally ──
        if (teams.length < 2) {
          try {
            const res = await ApiService.get(
              `${API_ENDPOINTS.TEAMS_LIST}?match_id=${encodeURIComponent(matchId)}`
            );
            const serverTeams = res?.teams || res?.data?.teams || [];
            if (serverTeams.length >= 2) {
              // Save each team to SQLite so future lookups work
              for (const t of serverTeams) {
                const localId = t.local_id || uuid.v4();
                await executeQuery(
                  `INSERT OR REPLACE INTO teams
                     (id, server_id, match_id, series_id, club_id, team_name, team_label, captain_id, sync_status)
                   VALUES (?,?,?,?,?,?,?,?,?)`,
                  [
                    localId,
                    t.id || null,
                    rMatch.id,
                    rMatch.series_id || null,
                    rMatch.club_id   || null,
                    t.team_name,
                    t.team_label || 'A',
                    t.captain_id != null ? String(t.captain_id) : null,
                    'synced',
                  ]
                );
              }
              teams = await getMatchTeams(rMatch.id);
            }
          } catch (_) {}
        }

        if (teams.length < 2) { setLoading(false); return; }

        // ── Step 3: Get innings and determine which team bats ─────────────
        const allInnings = await getMatchInnings(rMatch.id);

        // Find the latest non-completed innings (= the one we should resume)
        const activeInnings = allInnings
          .filter(i => !i.is_completed)
          .sort((a, b) => b.innings_number - a.innings_number)[0];

        if (activeInnings) {
          rInningsNumber = activeInnings.innings_number;
          rIsSuperOver = toBool(activeInnings.is_super_over);
          rSuperOverNumber = activeInnings.super_over_number || (rIsSuperOver ? Math.max(1, Math.ceil((rInningsNumber - 2) / 2)) : null);
          rBattingTeam   = teams.find(t => t.id === activeInnings.batting_team_id) || teams[0];
          rBowlingTeam   = teams.find(t => t.id === activeInnings.bowling_team_id) || teams[1];
        } else {
          // Recover the exact continuation after an app restart while the
          // innings-complete modal was open. This is especially important for
          // repeatable super overs because every pair has its own target.
          const lastCompleted = [...allInnings]
            .filter(i => i.is_completed)
            .sort((a, b) => b.innings_number - a.innings_number)[0];
          const teamForId = (teamId, fallbackIndex) =>
            teams.find(t => t.id === teamId || String(t.server_id) === String(teamId)) || teams[fallbackIndex];

          if (!lastCompleted) {
            rInningsNumber = 1;
            rBattingTeam   = teams[0];
            rBowlingTeam   = teams[1];
          } else if (toBool(lastCompleted.is_super_over)) {
            const finishedSuperOver = Number(lastCompleted.super_over_number) || Math.max(1, Math.ceil((lastCompleted.innings_number - 2) / 2));
            const firstLegNumber = superOverFirstInningsNumber(finishedSuperOver);
            const firstLeg = allInnings.find(i => i.innings_number === firstLegNumber);
            const wasChase = isSecondSuperOverInnings(lastCompleted.innings_number, finishedSuperOver);

            if (!wasChase) {
              rInningsNumber = firstLegNumber + 1;
              rIsSuperOver = true;
              rSuperOverNumber = finishedSuperOver;
              rBattingTeam = teamForId(lastCompleted.bowling_team_id, 1);
              rBowlingTeam = teamForId(lastCompleted.batting_team_id, 0);
              rTarget = (lastCompleted.total_runs || 0) + 1;
            } else if (firstLeg && Number(firstLeg.total_runs) === Number(lastCompleted.total_runs)) {
              const nextSuperOver = finishedSuperOver + 1;
              rInningsNumber = superOverFirstInningsNumber(nextSuperOver);
              rIsSuperOver = true;
              rSuperOverNumber = nextSuperOver;
              rBattingTeam = teamForId(lastCompleted.bowling_team_id, 1);
              rBowlingTeam = teamForId(lastCompleted.batting_team_id, 0);
              rTarget = null;
            } else {
              setLoading(false);
              navigation.replace('MatchSummary', { match: rMatch, inningsId: lastCompleted.id });
              return;
            }
          } else if (Number(lastCompleted.innings_number) === 1) {
            rInningsNumber = 2;
            rBattingTeam = teamForId(lastCompleted.bowling_team_id, 1);
            rBowlingTeam = teamForId(lastCompleted.batting_team_id, 0);
            rTarget = (lastCompleted.total_runs || 0) + 1;
          } else {
            const regulationFirst = allInnings.find(i => i.innings_number === 1);
            const regulationTied = regulationFirst && Number(regulationFirst.total_runs) === Number(lastCompleted.total_runs);
            if (regulationTied && toBool(rMatch.allow_super_over)) {
              rInningsNumber = superOverFirstInningsNumber(1);
              rIsSuperOver = true;
              rSuperOverNumber = 1;
              rBattingTeam = teamForId(lastCompleted.batting_team_id, 0);
              rBowlingTeam = teamForId(lastCompleted.bowling_team_id, 1);
              rTarget = null;
            } else {
              setLoading(false);
              navigation.replace('MatchSummary', { match: rMatch, inningsId: lastCompleted.id });
              return;
            }
          }
        }

        // ── Step 4: Recover target for 2nd innings ─────────────────────────
        if (rIsSuperOver && !rTarget) {
          const firstLegNumber = superOverFirstInningsNumber(rSuperOverNumber);
          const firstLeg = allInnings.find(i => i.innings_number === firstLegNumber && i.is_completed);
          if (firstLeg) rTarget = (firstLeg.total_runs || 0) + 1;
        } else if (rInningsNumber === 2 && !rTarget) {
          const inn1 = allInnings.find(i => i.innings_number === 1 && i.is_completed);
          if (inn1) rTarget = (inn1.total_runs || 0) + 1;
        }

        // Update component state so JSX (header, fielder effect, etc.) is correct
        setResolvedParams({
          match:         rMatch,
          battingTeam:   rBattingTeam,
          bowlingTeam:   rBowlingTeam,
          inningsNumber: rInningsNumber,
          target:        rTarget,
          isSuperOver:   rIsSuperOver,
          superOverNumber: rSuperOverNumber,
        });
      } catch (err) {
        showAlert('Error', 'Could not resume match: ' + err.message);
        setLoading(false);
        return;
      }
    }

    // ── Step 2: Normal init using resolved variables ───────────────────────
    try {
      const directSeriesName = rMatch.series_name || rMatch.seriesName || route.params?.seriesName;
      if (directSeriesName) {
        setSeriesName(directSeriesName);
      } else if (rMatch.series_id) {
        const series = await queryFirstRow(
          'SELECT name FROM series WHERE id = ? OR server_id = ? LIMIT 1',
          [rMatch.series_id, rMatch.series_id]
        );
        setSeriesName(series?.name || '');
      }

      const existingInnings = await getMatchInnings(rMatch.id);
      let active = existingInnings.find(i => i.innings_number === rInningsNumber && !i.is_completed);

      if (!active) {
        const inningsId = await createInnings({
          match_id:        rMatch.id,
          club_id:         rMatch.club_id   || null,
          series_id:       rMatch.series_id || null,
          innings_number:  rInningsNumber,
          is_super_over:  rIsSuperOver ? 1 : 0,
          super_over_number: rSuperOverNumber,
          batting_team_id: rBattingTeam.id,
          bowling_team_id: rBowlingTeam.id,
        });
        active = {
          id:              inningsId,
          innings_number:  rInningsNumber,
          is_super_over:  rIsSuperOver ? 1 : 0,
          super_over_number: rSuperOverNumber,
          batting_team_id: rBattingTeam.id,
          bowling_team_id: rBowlingTeam.id,
          total_runs: 0, total_wickets: 0, extras: 0,
        };
        await enqueueInningsSync(active, rMatch);
      } else {
        // Innings already in SQLite — re-queue to make sure server is in sync.
        await updateInnings(active.id, {
          batting_team_id: rBattingTeam.id,
          bowling_team_id: rBowlingTeam.id,
        });
        active = { ...active, batting_team_id: rBattingTeam.id, bowling_team_id: rBowlingTeam.id };
        await enqueueInningsSync(active, rMatch);
      }

      processSyncQueue({ silent: true }).catch(() => {});

      // Set state + refs immediately so async code below reads correct values
      inningsRef.current = active;
      setInnings(active);

      const runs  = active.total_runs     || 0;
      const wkts  = active.total_wickets  || 0;
      setTotalRuns(runs);     totalRunsRef.current  = runs;
      setTotalWickets(wkts);  totalWktsRef.current  = wkts;

      // Load ball history
      const balls = await getBallsWithPlayers(active.id);
      setAllBalls(balls);

      // Load current over
      const existingOver = await getCurrentOver(active.id);
      if (existingOver) {
        overRef.current      = existingOver;
        overNumRef.current   = existingOver.over_number;
        legalRef.current     = existingOver.balls_bowled || 0;
        setCurrentOver(existingOver);
        setOverNumber(existingOver.over_number);
        setLegalBalls(existingOver.balls_bowled || 0);
        const ob = balls.filter(b => b.over_id === existingOver.id);
        setOverBalls(ob);
        await enqueueOverSync(existingOver, active, rMatch);
        processSyncQueue({ silent: true }).catch(() => {});
      }

      setLoading(false);

      // ── Decide whether to navigate or restore from existing balls ──────────
      const hasProgress = balls.length > 0;

      if (hasProgress) {
        // ── Restore from DB (crash-recovery / series-resume path) ───────────
        const lastBall = balls[balls.length - 1];

        let restoredStriker = lastBall.striker_id
          ? { id: lastBall.striker_id, full_name: lastBall.striker_name || 'Unknown' }
          : null;
        let restoredNS = lastBall.non_striker_id
          ? { id: lastBall.non_striker_id, full_name: lastBall.non_striker_name || 'Unknown' }
          : null;
        const restoredBowler = lastBall.bowler_id
          ? { id: lastBall.bowler_id, full_name: lastBall.bowler_name || 'Unknown' }
          : null;

        // Reconstruct the two batting ends from the final delivery. A run-out
        // can remove either player, but the run(s) still belong to the striker
        // who faced the ball. Apply movement first, then remove the dismissed
        // batter. The previous logic skipped this entire step for wickets and
        // could restore an already-dismissed player after returning to scoring.
        const isLastBallWicket = Number(lastBall.is_wicket || 0) === 1;
        const crossedRuns = isLastBallWicket && lastBall.wicket_type !== 'run_out'
          ? 0
          : crossedRunsForDelivery(
              lastBall.extra_type,
              lastBall.runs_scored,
              lastBall.extra_runs,
              rMatch?.wide_value || 1,
            );
        const overEnded = Number(lastBall.is_valid_ball ?? 1) === 1
          && (Number(lastBall.ball_number) || 0) >= 6;

        if (shouldSwapForCrossedRuns(crossedRuns)) {
          [restoredStriker, restoredNS] = [restoredNS, restoredStriker];
        }
        if (overEnded) {
          [restoredStriker, restoredNS] = [restoredNS, restoredStriker];
        }
        if (isLastBallWicket) {
          const dismissedId = lastBall.wicket_batsman_id || lastBall.batsman_id || lastBall.striker_id;
          if (String(restoredStriker?.id) === String(dismissedId)) {
            restoredStriker = null;
          } else if (String(restoredNS?.id) === String(dismissedId)) {
            restoredNS = null;
          }
        }

        strikerRef.current = restoredStriker;
        nonStrikerRef.current = restoredNS;
        if (restoredStriker) {
          setStriker(restoredStriker);
        } else {
          setStriker(null);
          strikerStatsRef.current = { runs: 0, balls: 0, fours: 0, sixes: 0 };
          setStrikerStats(strikerStatsRef.current);
        }
        if (restoredNS) {
          setNonStriker(restoredNS);
        } else {
          setNonStriker(null);
          nonStrikerStatsRef.current = { runs: 0, balls: 0, fours: 0, sixes: 0 };
          setNonStrikerStats(nonStrikerStatsRef.current);
        }
        if (restoredBowler)  { bowlerRef.current = restoredBowler;       setBowler(restoredBowler); }

        // Restore last-completed-over bowler so handleChangeBowler can correctly
        // restrict the consecutive-over rule after a crash-recovery resume.
        // The last completed over's bowler is the last ball NOT in the current over.
        const prevOverBalls = existingOver
          ? balls.filter(b => b.over_id !== existingOver.id)
          : balls;
        if (prevOverBalls.length > 0) {
          lastOverBowlerIdRef.current = prevOverBalls[prevOverBalls.length - 1].bowler_id;
        }

        // Restore batting stats from DB
        if (restoredStriker) {
          const ss = await getPlayerBattingStats(active.id, restoredStriker.id);
          if (ss) {
            const stats = { runs: ss.runs_scored || 0, balls: ss.balls_faced || 0, fours: ss.fours || 0, sixes: ss.sixes || 0 };
            strikerStatsRef.current = stats;
            setStrikerStats(stats);
          }
        }
        if (restoredNS) {
          const nss = await getPlayerBattingStats(active.id, restoredNS.id);
          if (nss) {
            const stats = { runs: nss.runs_scored || 0, balls: nss.balls_faced || 0, fours: nss.fours || 0, sixes: nss.sixes || 0 };
            nonStrikerStatsRef.current = stats;
            setNonStrikerStats(stats);
          }
        }

        // Restore bowler stats from over balls
        if (restoredBowler && existingOver) {
          const overBallsList = balls.filter(b => b.over_id === existingOver.id);
          const bwlRuns = overBallsList.reduce((s, b) => s + bowlerRunsForDelivery(b), 0);
          const bwlWkts = overBallsList.filter(isBowlerCreditWicket).length;
          setBowlerStats({ overs: existingOver.over_number - 1, runs: bwlRuns, wickets: bwlWkts, maidens: 0 });
        }

        // Restore actual extra runs from ball history.
        const eb = { wide: 0, no_ball: 0, bye: 0, leg_bye: 0 };
        balls.forEach(b => {
          if (!b.extra_type) return;
          const delta = Number(b.extra_runs || 0);
          eb[b.extra_type] = (eb[b.extra_type] || 0) + delta;
        });
        setExtras(eb);

        // Restore partnership since last wicket
        const lastWicketIdx = balls.map(b => b.is_wicket).lastIndexOf(1);
        const sinceLast = lastWicketIdx === -1 ? balls : balls.slice(lastWicketIdx + 1);
        setPartnership({
          runs:  sinceLast.reduce((s, b) => s + (b.runs_scored || 0) + (b.extra_runs || 0), 0),
          balls: sinceLast.filter(b => b.is_valid_ball === 1).length,
        });

      } else {
        // ── Fresh innings — navigate to select opening pair ──────────────────
        setTimeout(() => {
          navigation.navigate('SelectBatsman', {
            inningsId: active.id,
            team:      rBattingTeam,
            requestId: uuid.v4(),
            returnScreen:  'LiveScoring',
            selectionType: 'opening_pair',
          });
        }, 300);
      }
    } catch (err) {
      showAlert('Error', 'Failed to init: ' + err.message);
      setLoading(false);
    }
  };

  // ── Ensure Over ────────────────────────────────────────
  const ensureOver = async () => {
    const over = overRef.current;
    if (over && !over.is_completed) return over;

    const bwl = bowlerRef.current;
    if (!bwl) {
      navigation.navigate('SelectBowler', {
        inningsId:         inningsRef.current?.id,
        team:              bowlingTeam,
        requestId:         uuid.v4(),
        returnScreen:      'LiveScoring',
        resetOver:         true,
        maxOversPerBowler: match.max_overs_per_bowler || 0,
      });
      return null;
    }

    // If over is null → first ever ball, keep same number (e.g. 1).
    // If over.is_completed → a new over is needed, increment.
    const newOverNum = over ? overNumRef.current + 1 : overNumRef.current;
    const overId = await createOver({
      innings_id:     inningsRef.current.id,
      innings_number: inningsRef.current.innings_number || inningsNumber,
      match_id:       match.id,
      club_id:        match.club_id   || null,
      series_id:      match.series_id || null,
      over_number:    newOverNum,
      bowler_id:      bwl.id,
    });
    // Immediately push over to MySQL
    processSyncQueue({ silent: true }).catch(() => {});
    const newOver = { id: overId, over_number: newOverNum, bowler_id: bwl.id, balls_bowled: 0, runs_conceded: 0 };
    // Update refs IMMEDIATELY so recordBall reads correct values this same tick
    overRef.current    = newOver;
    legalRef.current   = 0;
    overNumRef.current = newOverNum;
    setCurrentOver(newOver);
    setOverNumber(newOverNum);
    setLegalBalls(0);
    setOverBalls([]);
    return newOver;
  };

  // ── Record Ball ────────────────────────────────────────
  const recordBall = async (runsScored, options = {}) => {
    const inn     = inningsRef.current;
    const str     = strikerRef.current;
    const ns      = nonStrikerRef.current;
    const totRuns = totalRunsRef.current;
    const totWkts = totalWktsRef.current;

    if (!inn) return;

    // ── Guard: batsmen must be set before we touch overs ──────────────────
    const canScoreWithOneBatter = str && !ns && isLastBatterMode(match, totWkts);
    if (!str || (!ns && !canScoreWithOneBatter)) {
      // Determine which end is missing and open SelectBatsman directly
      const selType = !str && !ns ? 'opening_pair' : !str ? 'new_batsman' : 'new_non_striker';
      navigation.navigate('SelectBatsman', {
        inningsId:           inn.id,
        team:                battingTeam,
        requestId:           uuid.v4(),
        returnScreen:        'LiveScoring',
        selectionType:       selType,
        mode:                selType !== 'opening_pair' ? 'new_batsman' : undefined,
        existingStrikerId:   str?.id,
        existingNonStrikerId: ns?.id,
      });
      return;
    }

    // ensureOver may reset legalRef/overNumRef — read AFTER
    const over = await ensureOver();
    if (!over) return;

    // Read AFTER ensureOver so refs reflect the new over if one was just created
    const bwl   = bowlerRef.current;
    const legal = legalRef.current;
    const ovNum = overNumRef.current;
    if (!bwl) {
      showAlert('Select Bowler', 'Please select a bowler first.');
      return;
    }

    // Clear free hit only on a legal delivery (wide/no-ball re-bowled, so free hit persists)
    const thisExtraType = options?.extraType;
    const isThisWideOrNoBall = thisExtraType === 'wide' || thisExtraType === 'no_ball';
    if (isFreeHitRef.current && !isThisWideOrNoBall) setIsFreeHit(false);

    try {
      const { extraType = null, byeRuns = 0, wideRuns = 0 } = options;
      const isExtra    = !!extraType;
      const isWide     = extraType === 'wide';
      const isNoBall   = extraType === 'no_ball';
      const isBye      = extraType === 'bye';
      const isLegBye   = extraType === 'leg_bye';
      const isValidBall = !isExtra || isBye || isLegBye;
      // A no-ball IS faced by the batsman (only wides are not faced).
      // countsBallFaced drives balls_faced; isValidBall drives over/ball counting.
      const countsBallFaced = !isWide;
      // 4/6 is credited to batsman on normal balls AND on no-balls
      const isFour     = runsScored === 4 && (!isExtra || isNoBall);
      const isSix      = runsScored === 6 && (!isExtra || isNoBall);
      // Use match-configured penalty values for wide/no-ball
      const widePenalty   = Math.max(1, Number(match.wide_value) || 1);
      const noBallPenalty = Math.max(1, Number(match.no_ball_value) || 1);
      const additionalWideRuns = Math.max(0, Number(wideRuns) || 0);
      const byeExtraRuns = Math.max(0, Number(byeRuns) || 0);
      const extraRuns  = isWide ? widePenalty + additionalWideRuns : isNoBall ? noBallPenalty : byeExtraRuns;
      const totalAdded = runsScored + extraRuns;
      const bowlerRunsAdded = runsScored + (isBye || isLegBye ? 0 : extraRuns);
      const crossedRuns = crossedRunsForDelivery(extraType, runsScored, extraRuns, widePenalty);

      const ballId = uuid.v4();
      await saveBall({
        id:              ballId,
        over_id:         over.id,
        over_number:     ovNum,
        innings_id:      inn.id,
        match_id:        match.id,
        ball_number:     legal + 1,
        striker_id:      str.id,
        non_striker_id:  ns?.id || '',
        bowler_id:       bwl.id,
        runs_scored:     runsScored,
        is_wicket:       false,
        is_extra:        isExtra,
        extra_type:      extraType,
        extra_runs:      extraRuns,
        is_four:         isFour,
        is_six:          isSix,
        is_valid_ball:   isValidBall,
      });

      // Update score
      const newTotal = totRuns + totalAdded;
      const newLegal = isValidBall ? legal + 1 : legal;
      totalRunsRef.current = newTotal;
      legalRef.current = newLegal;
      setTotalRuns(newTotal);
      if (isValidBall) setLegalBalls(newLegal);

      // Every extra type stores its actual contribution to the innings total.
      if (isExtra) {
        setExtras(prev => ({ ...prev, [extraType]: (prev[extraType] || 0) + extraRuns }));
      }

      // Update striker stats — read from ref so value is current even after awaits
      const curStrikerStats = strikerStatsRef.current;
      let newStrikerStats = curStrikerStats;
      if (!isWide && !isBye && !isLegBye) {
        newStrikerStats = {
          runs:  curStrikerStats.runs  + runsScored,
          balls: curStrikerStats.balls + (countsBallFaced ? 1 : 0),
          fours: curStrikerStats.fours + (isFour ? 1 : 0),
          sixes: curStrikerStats.sixes + (isSix  ? 1 : 0),
        };
      } else if (isValidBall) {
        // Bye/LB: still counts as a ball faced
        newStrikerStats = { ...curStrikerStats, balls: curStrikerStats.balls + 1 };
      }
      // Keep the synchronous scoring path in lockstep with React state. This
      // is especially important immediately after a run-out replacement.
      strikerStatsRef.current = newStrikerStats;
      setStrikerStats(newStrikerStats);

      // Update partnership (all runs including byes/lb add to partnership)
      setPartnership(prev => ({
        runs:  prev.runs  + totalAdded,
        balls: prev.balls + (isValidBall ? 1 : 0),
      }));

      // Update bowler stats
      setBowlerStats(prev => ({
        ...prev,
        runs:    prev.runs + bowlerRunsAdded,
        wickets: prev.wickets,
      }));

      // Free hit after no-ball
      if (isNoBall) {
        setIsFreeHit(true);
        showAlert(
          '⚡ FREE HIT!',
          'Next delivery is a FREE HIT — batsman can only be dismissed by a run-out!',
          [{ text: 'OK' }],
        );
      }

      // Add to ball history
      const ballDisplay = {
        id: ballId,
        over_id: over.id,
        over_number: ovNum,
        ball_number: newLegal,
        runs_scored: runsScored,
        extra_runs:  extraRuns,
        extra_type:  extraType,
        is_extra:    isExtra ? 1 : 0,
        is_wicket:   0,
        is_four:     isFour ? 1 : 0,
        is_six:      isSix  ? 1 : 0,
        is_valid_ball: isValidBall ? 1 : 0,
        striker_name:     str.full_name,
        non_striker_name: ns?.full_name,
        bowler_name:      bwl.full_name,
        striker_id:       str.id,
        non_striker_id:   ns?.id || '',
        bowler_id:        bwl.id,
      };
      setAllBalls(prev => [...prev, ballDisplay]);
      setOverBalls(prev => [...prev, ballDisplay]);

      // Auto-swap when batsmen physically cross. Byes/leg-byes store the
      // crossed runs in extra_runs, while bat/no-ball bat runs use runs_scored.
      if (shouldSwapForCrossedRuns(crossedRuns)) _swap(newStrikerStats);

      // Target chased? End innings immediately (2nd innings only)
      if (resolvedTarget && newTotal >= resolvedTarget) {
        _endInnings(newTotal, totWkts, inn.id, ((ovNum - 1) * 6) + newLegal);
        return;
      }

      // Over complete (6 legal balls)
      if (newLegal >= 6) {
        await updateOver(over.id, { is_completed: 1, balls_bowled: 6 });
        await updateInnings(inn.id, { total_overs: ovNum });
        setCurrentOver(null);
        overRef.current = null;
        legalRef.current = 0;
        setLegalBalls(0);
        // Pre-increment so ensureOver creates the correct next over number.
        // Must happen BEFORE _endInnings check so ovNum still holds the
        // just-completed over number for the >= match.overs comparison.
        overNumRef.current = ovNum + 1;
        setOverNumber(ovNum + 1);
        _swap(); // swap at end of over
        setBowlerStats(prev => ({ ...prev, overs: prev.overs + 1 }));
        lastOverBowlerIdRef.current = bwl.id; // track for consecutive-over restriction

        if (ovNum >= inningsOversLimit) {
          _endInnings(newTotal, totWkts, inn.id, ovNum * 6);
          return;
        }
        // Select new bowler for next over
        navigation.navigate('SelectBowler', {
          inningsId:         inn.id,
          team:              bowlingTeam,
          currentBowlerId:   bwl.id,
          requestId:         uuid.v4(),
          returnScreen:      'LiveScoring',
          resetOver:         true,
          maxOversPerBowler: match.max_overs_per_bowler || 0,
        });
      }
    } catch (err) {
      showAlert('Score Error', err.message);
    }
  };

  // ── Wicket ────────────────────────────────────────────
  // Only validates + shows the modal. Nothing is saved until the user confirms.
  const handleWicket = async () => {
    // On a free hit only run out is allowed — open modal with run_out only
    // (handled in WicketDismissalModal via isFreeHit prop)

    const inn     = inningsRef.current;
    const str     = strikerRef.current;
    const bwl     = bowlerRef.current;
    const ns      = nonStrikerRef.current;
    const legal   = legalRef.current;
    const ovNum   = overNumRef.current;
    const totRuns = totalRunsRef.current;
    const totWkts = totalWktsRef.current;

    if (!inn || !str || !bwl) {
      showAlert('Setup Incomplete', 'Select batsmen and bowler first.');
      return;
    }

    const over = await ensureOver();
    if (!over) return;

    const liveStr = strikerRef.current;
    const liveNs  = nonStrikerRef.current;
    const liveBwl = bowlerRef.current;

    // Store context for confirmWicket — nothing saved yet
    setWicketModal({
      visible: true,
      inn,
      str: liveStr || str,
      bwl: liveBwl || bwl,
      ns: liveNs || ns,
      ovNum: overNumRef.current || ovNum,
      legal: legalRef.current ?? legal,
      totRuns: totalRunsRef.current ?? totRuns,
      totWkts: totalWktsRef.current ?? totWkts,
      over,
      isFreeHit: isFreeHitRef.current,
    });
  };

  // ── Confirm Wicket (called from modal) ────────────────
  // dismissed: 'striker' | 'nonStriker'
  const confirmWicket = async (dismissalType, fielder, dismissed = 'striker', completedRuns = 0) => {
    const inn     = inningsRef.current    || wicketModal.inn;
    const str     = strikerRef.current    || wicketModal.str;
    const bwl     = bowlerRef.current     || wicketModal.bwl;
    const ns      = nonStrikerRef.current || wicketModal.ns;
    const ovNum   = overNumRef.current;
    const legal   = legalRef.current;
    const totRuns = totalRunsRef.current;
    const totWkts = totalWktsRef.current;
    const over    = overRef.current || wicketModal.over;
    setWicketModal({ visible: false });
    // A wicket (even run out on free hit) is a legal delivery — free hit ends
    if (isFreeHitRef.current) setIsFreeHit(false);

    const outBatsman = dismissed === 'nonStriker' ? ns : str;
    if (!inn || !str || !bwl || !outBatsman || !over) {
      showAlert('Wicket Error', 'Could not resolve the current striker. Please try again.');
      return;
    }
    const runOutRuns = dismissalType === 'run_out'
      ? Math.max(0, Number(completedRuns) || 0)
      : 0;

    // ── RETIRED: no ball bowled, no wicket, no over progress ──────────────
    // Per cricket rules, a retired batsman (retired hurt) simply walks off.
    // The delivery is not counted, balls_faced is unchanged, and the wicket
    // tally does not increase. We only mark their scorecard row as retired.
    if (dismissalType === 'retired') {
      try {
        await retireBatsman(inn.id, outBatsman.id);
        setPartnership({ runs: 0, balls: 0 });

        if (dismissed === 'nonStriker') {
          setNonStriker(null);
          setNonStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
          navigation.navigate('SelectBatsman', {
            inningsId: inn.id, team: battingTeam, requestId: uuid.v4(),
            returnScreen: 'LiveScoring', selectionType: 'new_non_striker',
            mode: 'new_batsman', existingStrikerId: str?.id,
          });
        } else {
          setStriker(null);
          setStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
          navigation.navigate('SelectBatsman', {
            inningsId: inn.id, team: battingTeam, requestId: uuid.v4(),
            returnScreen: 'LiveScoring', selectionType: 'new_batsman',
            mode: 'new_batsman', existingNonStrikerId: ns?.id,
          });
        }
      } catch (err) {
        showAlert('Retire Error', err.message);
      }
      return;
    }

    const newLegal   = legal + 1;
    const newWkts    = totWkts + 1;
    const runsCredit = runOutRuns;
    const isFour = runsCredit === 4;
    const isSix = runsCredit === 6;
    const creditsBowler = BOWLER_CREDIT_WICKET_TYPES.has(dismissalType);
    const maxWktsAllowed = inningsWicketLimit;
    const noReplacementNeeded = toBool(match?.allow_last_batsman) && newWkts === Math.max(1, Number(match?.players_per_team || 6) - 1);
    const strikerStatsAfterWicket = {
      ...strikerStatsRef.current,
      runs: (strikerStatsRef.current.runs || 0) + runsCredit,
      balls: (strikerStatsRef.current.balls || 0) + 1,
      fours: (strikerStatsRef.current.fours || 0) + (isFour ? 1 : 0),
      sixes: (strikerStatsRef.current.sixes || 0) + (isSix ? 1 : 0),
    };
    const emptyBattingStats = { runs: 0, balls: 0, fours: 0, sixes: 0 };
    let overCompletedOnWicket = false;

    const applyStrikerEnd = (player, stats = emptyBattingStats) => {
      strikerRef.current = player;
      strikerStatsRef.current = stats;
      setStriker(player);
      setStrikerStats(stats);
    };
    const applyNonStrikerEnd = (player, stats = emptyBattingStats) => {
      nonStrikerRef.current = player;
      nonStrikerStatsRef.current = stats;
      setNonStriker(player);
      setNonStrikerStats(stats);
    };

    const routeForReplacement = (missingEnd, strikerEndPlayer, nonStrikerEndPlayer) => {
      const selectionType = missingEnd === 'striker' ? 'new_batsman' : 'new_non_striker';
      const params = {
        inningsId: inn.id,
        team: battingTeam,
        requestId: uuid.v4(),
        returnScreen: 'LiveScoring',
        selectionType,
        mode: 'new_batsman',
      };
      if (missingEnd === 'striker') {
        params.existingNonStrikerId = nonStrikerEndPlayer?.id;
      } else {
        params.existingStrikerId = strikerEndPlayer?.id;
      }
      navigation.navigate('SelectBatsman', params);
    };

    const applyPostWicketEnds = (nextStriker, nextStrikerStats, nextNonStriker, nextNonStrikerStats) => {
      applyStrikerEnd(nextStriker, nextStrikerStats);
      applyNonStrikerEnd(nextNonStriker, nextNonStrikerStats);
    };
    const selectBowlerAfterSingleBatterOver = () => {
      if (!pendingSelectBowlerRef.current) return;
      pendingSelectBowlerRef.current = false;
      setTimeout(() => {
        navigation.navigate('SelectBowler', {
          inningsId:           inningsRef.current?.id,
          team:                bowlingTeam,
          currentBowlerId:     bowlerRef.current?.id,
          requestId:           uuid.v4(),
          returnScreen:        'LiveScoring',
          resetOver:           true,
          maxOversPerBowler:   match.max_overs_per_bowler || 0,
        });
      }, 300);
    };

    try {
      // 1. Save the ball
      const ballId = uuid.v4();
      await saveBall({
        id:             ballId,
        over_id:        over.id,
        over_number:    ovNum,
        innings_id:     inn.id,
        match_id:       match.id,
        ball_number:    newLegal,
        striker_id:     str.id,
        non_striker_id: ns?.id || '',
        bowler_id:      bwl.id,
        runs_scored:    runsCredit,
        is_wicket:      true,
        is_four:        isFour,
        is_six:         isSix,
        is_valid_ball:  true,
      });

      // 2. Save the wicket record with dismissal type
      await saveWicket({
        ball_id:      ballId,
        innings_id:   inn.id,
        batsman_id:   outBatsman.id,
        bowler_id:    bwl.id,
        wicket_type:  dismissalType,
        fielder_id:   fielder?.id || null,
        runs_at_fall: totRuns + runsCredit,
        over_at_fall: fallOverLabel(ovNum, newLegal),
        runs_completed: runOutRuns,
      });

      // 3. Update counts + UI
      const newTotal = totRuns + runsCredit;
      totalRunsRef.current = newTotal;
      totalWktsRef.current = newWkts;
      legalRef.current = newLegal;
      setTotalWickets(newWkts);
      setTotalRuns(newTotal);
      setLegalBalls(newLegal);
      setBowlerStats(prev => ({ ...prev, wickets: prev.wickets + (creditsBowler ? 1 : 0) }));
      setPartnership({ runs: 0, balls: 0 });
      await updateInnings(inn.id, { total_wickets: newWkts, total_runs: newTotal });

      const ballDisplay = {
        id: ballId, over_id: over.id, over_number: ovNum,
        ball_number: newLegal, runs_scored: runsCredit, extra_runs: 0,
        is_wicket: 1,
        is_four: isFour ? 1 : 0,
        is_six: isSix ? 1 : 0,
        is_valid_ball: 1,
        striker_name: str.full_name,
        non_striker_name: ns?.full_name,
        bowler_name: bwl.full_name,
        striker_id: str.id,
        non_striker_id: ns?.id || '',
        bowler_id: bwl.id,
        wicket_type: dismissalType,
        wicket_batsman_id: outBatsman.id,
        fielder_id: fielder?.id || null,
        fielder_name: fielder?.full_name || null,
      };
      setAllBalls(prev => [...prev, ballDisplay]);
      setOverBalls(prev => [...prev, ballDisplay]);

      // 4. A run-out can complete a chase with completed runs. End immediately
      // before asking for another batter, in a normal innings or super over.
      if (resolvedTarget && newTotal >= resolvedTarget) {
        _endInnings(newTotal, newWkts, inn.id, ((ovNum - 1) * 6) + newLegal);
        return;
      }

      // 5. All out → end innings
      if (newWkts >= maxWktsAllowed) {
        _endInnings(newTotal, newWkts, inn.id, ((ovNum - 1) * 6) + newLegal);
        return;
      }

      // 6. Over complete on this wicket ball
      if (newLegal >= 6) {
        await updateOver(over.id, { is_completed: 1, balls_bowled: 6 });
        setCurrentOver(null);
        overRef.current = null;
        legalRef.current = 0;
        setLegalBalls(0);
        overNumRef.current = ovNum + 1;
        setOverNumber(ovNum + 1);
        overCompletedOnWicket = true;
        setBowlerStats(prev => ({ ...prev, overs: prev.overs + 1 }));
        lastOverBowlerIdRef.current = bwl.id;
        if (ovNum >= inningsOversLimit) {
          _endInnings(newTotal, newWkts, inn.id, ovNum * 6);
          return;
        }
        pendingSelectBowlerRef.current = true;
      }

      // 7. Navigate to replace the dismissed batsman
      const strikerWasAtStrikerEndAfterRuns = runOutRuns % 2 === 0;
      let strikerEndPlayer = strikerWasAtStrikerEndAfterRuns ? str : ns;
      let strikerEndStats = strikerWasAtStrikerEndAfterRuns
        ? strikerStatsAfterWicket
        : nonStrikerStatsRef.current;
      let nonStrikerEndPlayer = strikerWasAtStrikerEndAfterRuns ? ns : str;
      let nonStrikerEndStats = strikerWasAtStrikerEndAfterRuns
        ? nonStrikerStatsRef.current
        : strikerStatsAfterWicket;

      if (overCompletedOnWicket) {
        [strikerEndPlayer, nonStrikerEndPlayer] = [nonStrikerEndPlayer, strikerEndPlayer];
        [strikerEndStats, nonStrikerEndStats] = [nonStrikerEndStats, strikerEndStats];
      }

      const missingEnd = strikerEndPlayer?.id === outBatsman.id
        ? 'striker'
        : nonStrikerEndPlayer?.id === outBatsman.id
          ? 'nonStriker'
          : dismissed;

      if (missingEnd === 'striker') {
        if (noReplacementNeeded) {
          applyPostWicketEnds(nonStrikerEndPlayer, nonStrikerEndStats, null, emptyBattingStats);
          selectBowlerAfterSingleBatterOver();
          return;
        }
        applyPostWicketEnds(null, emptyBattingStats, nonStrikerEndPlayer, nonStrikerEndStats);
        routeForReplacement('striker', null, nonStrikerEndPlayer);
        return;
      }

      if (noReplacementNeeded) {
        applyPostWicketEnds(strikerEndPlayer, strikerEndStats, null, emptyBattingStats);
        selectBowlerAfterSingleBatterOver();
        return;
      }

      applyPostWicketEnds(strikerEndPlayer, strikerEndStats, null, emptyBattingStats);
      routeForReplacement('nonStriker', strikerEndPlayer, null);
      return;
    } catch (err) {
      showAlert('Wicket Error', err.message);
    }
  };

  // ── Swap Strike ────────────────────────────────────────
  // Always read stats from refs so this is safe to call inside async functions
  // (state closures would be stale after awaits; refs are always current).
  const _swap = (updatedStrikerStats) => {
    const currentStriker = strikerRef.current;
    const currentNonStriker = nonStrikerRef.current;
    if (!currentStriker || !currentNonStriker) return;

    const sStats  = updatedStrikerStats !== undefined ? updatedStrikerStats : strikerStatsRef.current;
    const nsStats = nonStrikerStatsRef.current;

    strikerRef.current = currentNonStriker;
    nonStrikerRef.current = currentStriker;
    strikerStatsRef.current = nsStats;
    nonStrikerStatsRef.current = sStats;

    setStriker(currentNonStriker);
    setNonStriker(currentStriker);
    setStrikerStats(nsStats);
    setNonStrikerStats(sStats);
  };

  // ── Extra Buttons Handler ─────────────────────────────
  const handleExtra = (type) => {
    setExtraModal({ visible: true, type });
  };

  const handleExtraModalSelect = (runs) => {
    const { type } = extraModal;
    setExtraModal({ visible: false, type: null });
    if (type === 'no_ball') {
      recordBall(runs, { extraType: 'no_ball' });
    } else if (type === 'wide') {
      recordBall(0, { extraType: 'wide', wideRuns: runs });
    } else {
      recordBall(0, { extraType: type, byeRuns: runs });
    }
  };

  // ── Undo Last Ball ────────────────────────────────────
  const handleUndo = async () => {
    const inn = inningsRef.current;
    if (!inn) return;
    showAlert('Undo Last Ball', 'Remove the last ball recorded?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo', style: 'destructive', onPress: async () => {
        try {
          const last = await getLastBall(inn.id);
          if (!last) { showAlert('Nothing to undo'); return; }
          await deleteBall(last, inn.id);

          // ── Restore striker / non-striker ────────────────
          // Each ball stores who was at the crease when it was bowled, so
          // restoring last.striker_id / last.non_striker_id always reverses
          // any swap that happened (odd runs, end-of-over, etc.).
          if (last.striker_id) {
            const restoredStriker = { id: last.striker_id, full_name: last.striker_name || 'Unknown' };
            strikerRef.current = restoredStriker;
            setStriker(restoredStriker);
          }
          if (last.non_striker_id) {
            const restoredNS = { id: last.non_striker_id, full_name: last.non_striker_name || 'Unknown' };
            nonStrikerRef.current = restoredNS;
            setNonStriker(restoredNS);
          }

          // ── Reload ball history ──────────────────────────
          const refreshed = await getBallsWithPlayers(inn.id);
          setAllBalls(refreshed);

          // ── Reload innings totals ────────────────────────
          const currentInnings = await getInnings(inn.id);
          setTotalRuns(currentInnings.total_runs || 0);
          setTotalWickets(currentInnings.total_wickets || 0);

          // ── Reload over state ────────────────────────────
          const ov = await getCurrentOver(inn.id);
          let ob = [];
          if (ov) {
            setCurrentOver(ov);
            setOverNumber(ov.over_number);
            setLegalBalls(ov.balls_bowled || 0);
            ob = refreshed.filter(b => b.over_id === ov.id);
            setOverBalls(ob);
          } else {
            setLegalBalls(0);
            setOverBalls([]);
          }

          // ── Refresh batting stats from DB ────────────────
          // Use updated refs (set above) so correct player stats are loaded.
          const str = strikerRef.current;
          const ns  = nonStrikerRef.current;
          if (str) {
            const ss = await getPlayerBattingStats(inn.id, str.id);
            if (ss) setStrikerStats({ runs: ss.runs_scored || 0, balls: ss.balls_faced || 0, fours: ss.fours || 0, sixes: ss.sixes || 0 });
          }
          if (ns) {
            const nss = await getPlayerBattingStats(inn.id, ns.id);
            if (nss) setNonStrikerStats({ runs: nss.runs_scored || 0, balls: nss.balls_faced || 0, fours: nss.fours || 0, sixes: nss.sixes || 0 });
          }

          // ── Refresh bowler stats from current over balls ─
          const bwl = bowlerRef.current;
          if (bwl) {
            const bwlRuns = ob.reduce((s, b) => s + bowlerRunsForDelivery(b), 0);
            const bwlWkts = ob.filter(isBowlerCreditWicket).length;
            setBowlerStats(prev => ({ ...prev, runs: bwlRuns, wickets: bwlWkts }));
          }

          // ── Recompute partnership since last wicket ───────
          const lastWicketIdx = refreshed.map(b => b.is_wicket).lastIndexOf(1);
          const ballsSinceWicket = lastWicketIdx === -1 ? refreshed : refreshed.slice(lastWicketIdx + 1);
          setPartnership({
            runs:  ballsSinceWicket.reduce((s, b) => s + (b.runs_scored || 0) + (b.extra_runs || 0), 0),
            balls: ballsSinceWicket.filter(b => b.is_valid_ball === 1).length,
          });

          // ── Recompute extras breakdown after undo ────────
          const eb = { wide: 0, no_ball: 0, bye: 0, leg_bye: 0 };
          refreshed.forEach(b => {
            if (!b.extra_type) return;
            const delta = Number(b.extra_runs || 0);
            eb[b.extra_type] = (eb[b.extra_type] || 0) + delta;
          });
          setExtras(eb);

        } catch (e) { showAlert('Undo Failed', e.message); }
      }},
    ]);
  };

  // ── End Innings ────────────────────────────────────────
  const isSameTeam = (team, value) => {
    if (!team || value === null || value === undefined) return false;
    return [team.id, team.local_id, team.server_id]
      .filter(v => v !== null && v !== undefined && String(v) !== '')
      .some(v => String(v) === String(value));
  };

  const currentLegalBallsTotal = (legalBallsOverride) => {
    if (Number.isFinite(Number(legalBallsOverride))) {
      return Math.max(0, Number(legalBallsOverride));
    }

    const completedOvers = Math.max(0, (Number(overNumRef.current || overNumber || 1) || 1) - 1);
    const currentOverBalls = overRef.current
      ? Math.max(0, Math.min(6, Number(legalRef.current || legalBalls || 0) || 0))
      : 0;
    return (completedOvers * 6) + currentOverBalls;
  };

  const currentInningsSnapshot = (runs, wkts, legalBallsOverride) => {
    const totalLegalBalls = currentLegalBallsTotal(legalBallsOverride);
    const nextRuns = Number.isFinite(Number(runs)) ? Number(runs) : Number(totalRunsRef.current || totalRuns || 0);
    const nextWkts = Number.isFinite(Number(wkts)) ? Number(wkts) : Number(totalWktsRef.current || totalWickets || 0);
    const extraTotal = Number(extras.wide || 0) + Number(extras.no_ball || 0) + Number(extras.bye || 0) + Number(extras.leg_bye || 0);
    return {
      runs: nextRuns,
      wickets: nextWkts,
      legalBalls: totalLegalBalls,
      totalOvers: oversFromLegalBalls(totalLegalBalls),
      extras: extraTotal,
    };
  };

  const closeCurrentInnings = async (runs, wkts, inningsId, legalBallsOverride) => {
    const snapshot = currentInningsSnapshot(runs, wkts, legalBallsOverride);
    const targetInningsId = inningsId || inningsRef.current?.id || innings?.id;
    if (targetInningsId) {
      await updateInnings(targetInningsId, {
        total_runs: snapshot.runs,
        total_wickets: snapshot.wickets,
        total_overs: snapshot.totalOvers,
        extras: snapshot.extras,
        is_completed: 1,
      });
    }
    return snapshot;
  };

  const teamForSide = (side) => {
    const candidates = [battingTeam, bowlingTeam].filter(Boolean);
    const labelMatch = candidates.find(t => String(t.team_label || '').toUpperCase() === side);
    if (labelMatch) return labelMatch;

    const matchTeamId = side === 'A' ? (match?.team_a_id || match?.team_a_local) : (match?.team_b_id || match?.team_b_local);
    return candidates.find(t => isSameTeam(t, matchTeamId)) || (side === 'A' ? candidates[0] : candidates.find(t => !isSameTeam(t, candidates[0]?.id)));
  };

  const scoreForTeam = (team, inningsRows, snapshot) => {
    const row = (inningsRows || []).find(inn => isSameTeam(team, inn.batting_team_id));
    if (row) return `${Number(row.total_runs || 0)}/${Number(row.total_wickets || 0)}`;
    if (isSameTeam(team, battingTeam)) return `${snapshot.runs}/${snapshot.wickets}`;
    return '0/0';
  };

  const saveManualWinnerResult = async (winnerTeam) => {
    const snapshot = await closeCurrentInnings();
    const latestInnings = await getMatchInnings(match.id).catch(() => []);
    const teamA = teamForSide('A') || battingTeam;
    const teamB = teamForSide('B') || bowlingTeam;
    const loserTeam = winnerTeam
      ? ([teamA, teamB].find(team => team && !isSameTeam(team, winnerTeam.id)) || null)
      : null;

    const resultText = winnerTeam
      ? `${winnerTeam.team_name || 'Selected team'} won by surrender`
      : 'Match Tied!';

    await saveMatchResult({
      match_id:        match.id,
      winner_team_id:  winnerTeam ? (winnerTeam.local_id || winnerTeam.id) : null,
      loser_team_id:   loserTeam ? (loserTeam.local_id || loserTeam.id) : null,
      result_type:     winnerTeam ? 'win' : 'tie',
      margin:          0,
      margin_type:     null,
      team_a_score:    scoreForTeam(teamA, latestInnings, snapshot),
      team_b_score:    scoreForTeam(teamB, latestInnings, snapshot),
      player_of_match: null,
      result_text:     resultText,
    });
    await processSyncQueue({ silent: true }).catch(() => {});
  };

  const startNextInningsFromManualClose = async () => {
    try {
      const snapshot = await closeCurrentInnings();
      const goToInnings = (params) => {
        navigation.replace('LiveScoring', { match, ...params });
      };

      if (isSuperOver && !isSuperOverChase) {
        goToInnings({
          battingTeam: bowlingTeam,
          bowlingTeam: battingTeam,
          inningsNumber: superOverFirstInningsNumber(superOverNumber) + 1,
          target: snapshot.runs + 1,
          isSuperOver: true,
          superOverNumber,
        });
        return;
      }

      goToInnings({
        battingTeam: bowlingTeam,
        bowlingTeam: battingTeam,
        inningsNumber: 2,
        target: snapshot.runs + 1,
      });
    } catch (error) {
      showAlert('Close Innings Failed', error?.message || 'Please try again.');
    }
  };

  const handleManualCloseInnings = () => {
    const opensAnotherInnings = (!isSuperOver && inningsNumber === 1) || (isSuperOver && !isSuperOverChase);
    if (opensAnotherInnings) {
      showAlert('Close Innings', 'Close this innings and start the next innings?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isSuperOver ? 'Start Chase' : 'Start 2nd Innings',
          onPress: startNextInningsFromManualClose,
        },
      ]);
      return;
    }

    const chooseWinner = async (team) => {
      try {
        await saveManualWinnerResult(team);
        handleEndMatch();
      } catch (error) {
        showAlert('Result Save Failed', error?.message || 'Please try again.');
      }
    };

    showAlert('Choose Winner', 'This innings is being closed manually. Which team should win?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: battingTeam?.team_name || 'Batting Team',
        onPress: () => chooseWinner(battingTeam),
      },
      {
        text: bowlingTeam?.team_name || 'Bowling Team',
        onPress: () => chooseWinner(bowlingTeam),
      },
    ]);
  };

  const _endInnings = async (runs, wkts, inningsId, legalBallsOverride) => {
    try {
      const snapshot = await closeCurrentInnings(runs, wkts, inningsId, legalBallsOverride);

      // A normal second innings or a super-over chase decides its pair.
      const decidingInnings = (!isSuperOver && inningsNumber === 2) || (isSuperOver && isSuperOverChase);
      if (decidingInnings && resolvedTarget) {
        const finalRuns = snapshot.runs;
        const finalWkts = snapshot.wickets;
        const maxWkts   = inningsWicketLimit;
        const phaseName = isSuperOver ? 'Super Over' : 'Match';
        let result;
        if (finalRuns >= resolvedTarget) {
          // Batting team chased down — win by remaining wickets
          const wicketsLeft = maxWkts - finalWkts;
          result = isSuperOver
            ? `${battingTeam.team_name} wins ${phaseName} by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}!`
            : `${battingTeam.team_name} wins by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}!`;
        } else if (finalRuns === resolvedTarget - 1) {
          if (isSuperOver) {
            result = `${phaseName} tied! Another Super Over required.`;
          } else {
            result = toBool(match?.allow_super_over)
              ? 'Match tied! Super Over required.'
              : 'Match Tied!';
          }
        } else {
          // Bowling team defended — win by run difference
          const runDiff = (resolvedTarget - 1) - finalRuns;
          result = isSuperOver
            ? `${bowlingTeam.team_name} wins ${phaseName} by ${runDiff} run${runDiff !== 1 ? 's' : ''}!`
            : `${bowlingTeam.team_name} wins by ${runDiff} run${runDiff !== 1 ? 's' : ''}!`;
        }
        setInningsResultText(result);
      } else if (isSuperOver) {
        const finalRuns = snapshot.runs;
        setInningsResultText(`${battingTeam.team_name} set a target of ${finalRuns + 1}.`);
      }

      setShowInningsComplete(true);
    } catch (e) {
      console.error('endInnings:', e);
    }
  };

  const handleStartNextInnings = async () => {
    setShowInningsComplete(false);
    const snapMatch   = match;
    let snapRuns      = totalRunsRef.current;

    // Belt-and-suspenders: ensure the completed innings is saved before the
    // next regular or super-over innings is created.
    try {
      const snapshot = await closeCurrentInnings();
      snapRuns = snapshot.runs;
    } catch (e) {
      console.warn('[handleStartNextInnings] is_completed update failed:', e.message);
    }

    const goToInnings = (params) => {
      setTimeout(() => navigation.replace('LiveScoring', { match: snapMatch, ...params }), 400);
    };

    if (isSuperOver) {
      if (!isSuperOverChase) {
        goToInnings({
          battingTeam: bowlingTeam,
          bowlingTeam: battingTeam,
          inningsNumber: superOverFirstInningsNumber(superOverNumber) + 1,
          target: snapRuns + 1,
          isSuperOver: true,
          superOverNumber,
        });
        return;
      }

      const tied = Number(snapRuns) === Number(resolvedTarget) - 1;
      if (tied) {
        const nextSuperOver = superOverNumber + 1;
        goToInnings({
          battingTeam: bowlingTeam,
          bowlingTeam: battingTeam,
          inningsNumber: superOverFirstInningsNumber(nextSuperOver),
          target: null,
          isSuperOver: true,
          superOverNumber: nextSuperOver,
        });
      } else {
        handleEndMatch();
      }
      return;
    }

    if (inningsNumber === 1) {
      goToInnings({
        battingTeam: bowlingTeam,
        bowlingTeam: battingTeam,
        inningsNumber: 2,
        target: snapRuns + 1,
      });
      return;
    }

    const tied = Number(snapRuns) === Number(resolvedTarget) - 1;
    if (inningsNumber === 2 && tied && toBool(snapMatch?.allow_super_over)) {
      goToInnings({
        // The side that completed the regulation chase bats first in each
        // super over. The next pair repeats that same order.
        battingTeam,
        bowlingTeam,
        inningsNumber: superOverFirstInningsNumber(1),
        target: null,
        isSuperOver: true,
        superOverNumber: 1,
      });
      return;
    }

    handleEndMatch();
  };

  const handleEndMatch = () => {
    // Dismiss modal first; delay replace so the modal can fully unmount
    // before React Navigation replaces the screen — avoids timing crashes.
    setShowInningsComplete(false);
    const snapMatch   = match;
    const snapInnings = innings;
    setTimeout(() => {
      navigation.replace('MatchSummary', { match: snapMatch, inningsId: snapInnings?.id });
    }, 400);
  };


  // ── Change Batsmen (only before first ball of innings) ─
  const handleChangeBatsmen = () => {
    if (!inningsRef.current) return;
    navigation.navigate('SelectBatsman', {
      inningsId: inningsRef.current.id,
      team:      battingTeam,
      requestId: uuid.v4(),
      returnScreen: 'LiveScoring',
      selectionType: 'opening_pair',
    });
  };

  // ── Change Bowler ──────────────────────────────────────
  const handleChangeBowler = () => {
    if (!inningsRef.current) return;
    // currentBowlerId = whoever completed the last over (cannot bowl consecutive overs).
    // If called mid-over, also block the bowler currently bowling this over.
    const lastOverBowler = lastOverBowlerIdRef.current;
    const midOverBowler  = overRef.current && legalRef.current > 0 ? bowlerRef.current?.id : null;
    // Pass the most-recently-completed-over bowler as the restriction.
    // If mid-over change, that's the current bowler (they are in the middle of an over
    // so effectively they are also the "last over" restriction until the next over completes).
    const restrictedBowlerId = midOverBowler || lastOverBowler || null;
    navigation.navigate('SelectBowler', {
      inningsId:         inningsRef.current.id,
      team:              bowlingTeam,
      currentBowlerId:   restrictedBowlerId,
      requestId:         uuid.v4(),
      returnScreen:      'LiveScoring',
      maxOversPerBowler: match.max_overs_per_bowler || 0,
    });
  };

  // ── Helpers ────────────────────────────────────────────
  const formatOvers = () => {
    const comp = overNumber - 1;
    return `${comp}.${legalBalls}`;
  };

  const runRate = () => {
    const o = (overNumber - 1) + legalBalls / 6;
    return o > 0 ? (totalRuns / o).toFixed(2) : '0.00';
  };

  if (loading) return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Icon name="cricket" size={40} color={COLORS.gold} />
      <Text style={{ color: COLORS.white, marginTop: 16 }}>Setting up scoring...</Text>
    </LinearGradient>
  );

  // ── Guard: match data could not be resolved from params or SQLite ────────
  // (Only shown after loading=false; if we got here it means even DB recovery failed)
  if (!match || !battingTeam || !bowlingTeam) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.navy]} style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Icon name="alert-circle-outline" size={56} color={COLORS.danger} />
        <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '700', marginTop: 20, textAlign: 'center' }}>
          Match data not found
        </Text>
        <Text style={{ color: COLORS.gray, fontSize: 14, marginTop: 8, textAlign: 'center' }}>
          This match could not be loaded from local storage. Please go back to the series and try again.
        </Text>
        <TouchableOpacity
          onPress={() => {
            // Pop back to the SeriesList screen (correct screen name in UmpireNavigator)
            navigation.navigate('SeriesList');
          }}
          style={{ marginTop: 28, backgroundColor: COLORS.royalBlue, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 }}
        >
          <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 15 }}>Go to Series</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const completedScoreTied = Boolean(resolvedTarget) && Number(totalRuns) === Number(resolvedTarget) - 1;
  const needsFirstSuperOver = !isSuperOver && inningsNumber === 2 && completedScoreTied && toBool(match.allow_super_over);
  const needsAnotherSuperOver = isSuperOver && isSuperOverChase && completedScoreTied;
  const isLastInnings = isSuperOver
    ? isSuperOverChase && !completedScoreTied
    : inningsNumber === 2 && !needsFirstSuperOver;
  const modalShowsTarget = (!isSuperOver && inningsNumber === 1) || (isSuperOver && !isSuperOverChase);
  const nextInningsActionLabel = isSuperOver
    ? (isSuperOverChase
      ? 'Start Super Over'
      : `Start ${superOverLabel(superOverNumber, true)} →`)
    : inningsNumber === 1
      ? 'Start 2nd Innings →'
      : 'Start Super Over →';

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        {/* Left — TARGET badge in 2nd innings, empty spacer otherwise */}
        {resolvedTarget ? (
          <LinearGradient colors={['#2A2200', '#1A1500']} style={styles.targetBadge}>
            <Text style={styles.targetBadgeLabel}>🏴 TARGET</Text>
            <Text style={styles.targetBadgeNum}>{resolvedTarget}</Text>
          </LinearGradient>
        ) : (
          <View style={styles.headerSide} />
        )}

        {/* Centre — match identity stays visible; score remains in the innings band below. */}
        <View style={styles.headerCenter}>
          <Text style={styles.headerSeries} numberOfLines={1}>{headerSeriesName}</Text>
          <Text style={styles.headerMatch} numberOfLines={1}>{headerMatchName}</Text>
          {headerVenue ? (
            <View style={styles.headerVenueRow}>
              <Icon name="map-marker" size={11} color={COLORS.gray} />
              <Text style={styles.headerVenue} numberOfLines={1}>{headerVenue}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.headerSide} />
      </View>

      {/* Team row — teams centred */}
      <View style={styles.subHeader}>
        <View style={styles.teamsCenter}>
          <View style={[styles.teamPill, styles.battingTeamPill, { borderColor: COLORS.gold, backgroundColor: COLORS.gold + '18' }]}>
            <Icon name="cricket" size={15} color={COLORS.gold} style={styles.teamPillIcon} />
            <Text style={styles.teamPillTxt} numberOfLines={1}>{battingTeam.team_name}</Text>
          </View>
          <Text style={styles.vsLabel}>VS</Text>
          <View style={[styles.teamPill, styles.bowlingTeamPill, { borderColor: COLORS.cyan, backgroundColor: COLORS.cyan + '14' }]}>
            <Icon name="shield-outline" size={15} color={COLORS.cyan} style={styles.teamPillIcon} />
            <Text style={styles.teamPillTxt} numberOfLines={1}>{bowlingTeam.team_name}</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[
          { id: 'scorecard',  label: inningsDisplayLabel },
          { id: 'ballByBall', label: 'Ball-by-Ball' },
        ].map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, activeTab === t.id && styles.tabActive]}
            onPress={() => setActiveTab(t.id)}
          >
            <Text style={[styles.tabTxt, activeTab === t.id && styles.tabTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Persistent score strip (visible in both tabs) ── */}
      <View style={sc.scoreBandWrap}>
        {/* Score row */}
        <View style={sc.scoreBandRow}>
          <Text style={sc.scoreBandMain}>{totalRuns}/{totalWickets}</Text>
          <Text style={sc.scoreBandSep}>  ·  </Text>
          <Text style={sc.scoreBandMeta}>Ov {formatOvers()}/{inningsOversLimit}</Text>
          <Text style={sc.scoreBandSep}>  ·  </Text>
          <Text style={sc.scoreBandMeta}>RR {runRate()}</Text>
        </View>
        {/* Chase indicator — only in 2nd innings */}
        {resolvedTarget ? (() => {
          const runsNeeded  = Math.max(0, resolvedTarget - totalRuns);
          const ballsBowled = (overNumber - 1) * 6 + legalBalls;
          const ballsLeft   = Math.max(0, inningsOversLimit * 6 - ballsBowled);
          const reqRate     = ballsLeft > 0 ? ((runsNeeded / ballsLeft) * 6).toFixed(2) : '—';
          const won         = totalRuns >= resolvedTarget;
          const tied        = !won && runsNeeded === 0;
          return (
            <LinearGradient
              colors={won ? ['#1A2E00', '#0E1A00'] : ['#2A1E00', '#1A1300']}
              style={sc.chasePill}
            >
              {won ? (
                <>
                  <Icon name="trophy" size={13} color={COLORS.gold} />
                  <Text style={[sc.chaseText, { color: COLORS.gold, marginLeft: 6 }]}>Target Achieved!</Text>
                </>
              ) : (
                <>
                  <Icon name="lightning-bolt" size={12} color={COLORS.gold} style={{ marginRight: 5 }} />
                  <Text style={sc.chaseText}>
                    Need{' '}
                    <Text style={sc.chaseHighlight}>{runsNeeded}</Text>
                    {' '}Runs off{' '}
                    <Text style={sc.chaseHighlight}>{ballsLeft}</Text>
                    {' '}Balls
                  </Text>
                  <View style={sc.chaseDivider} />
                  <Text style={sc.chaseRRR}>RRR <Text style={sc.chaseHighlight}>{reqRate}</Text></Text>
                </>
              )}
            </LinearGradient>
          );
        })() : null}
      </View>

      {/* ── Scorecard Tab ── */}
      {activeTab === 'scorecard' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

          {/* Batting section */}
          <View style={sc.section}>
            <View style={sc.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={sc.sectionTitle}>BATTING</Text>
                {allBalls.length === 0 && striker && (
                  <TouchableOpacity onPress={handleChangeBatsmen} style={sc.changeBtn}>
                    <Icon name="pencil" size={11} color={COLORS.gold} />
                    <Text style={sc.changeBtnText}>Change</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={sc.colHeaders}>
                <Text style={sc.colH}>R</Text>
                <Text style={sc.colH}>B</Text>
                <Text style={sc.colH}>4s</Text>
                <Text style={sc.colH}>6s</Text>
                <Text style={[sc.colH, { marginLeft: 8 }]}>SR</Text>
              </View>
            </View>
            <BatterRow
              batter={striker ? { ...striker, ...strikerStats } : null}
              isStriker
              COLORS={COLORS}
              sc={sc}
              onChangeBatsman={allBalls.length > 0 ? () => {
                if (!inningsRef.current) return;
                navigation.navigate('SelectBatsman', {
                  inningsId: inningsRef.current.id,
                  team: battingTeam,
                  requestId: uuid.v4(),
                  returnScreen: 'LiveScoring',
                  selectionType: 'new_batsman',
                  mode: 'new_batsman',
                  existingNonStrikerId: nonStrikerRef.current?.id,
                });
              } : null}
            />
            <BatterRow
              batter={nonStriker ? { ...nonStriker, ...nonStrikerStats } : null}
              isStriker={false}
              COLORS={COLORS}
              sc={sc}
              onChangeBatsman={allBalls.length > 0 ? () => {
                if (!inningsRef.current) return;
                navigation.navigate('SelectBatsman', {
                  inningsId: inningsRef.current.id,
                  team: battingTeam,
                  requestId: uuid.v4(),
                  returnScreen: 'LiveScoring',
                  selectionType: 'new_non_striker',
                  mode: 'new_batsman',
                  existingStrikerId: strikerRef.current?.id,
                });
              } : null}
            />
            {/* Partnership */}
            {striker && nonStriker && (
              <View style={sc.partnerRow}>
                <Text style={sc.partnerTxt}>
                  Partnership: {partnership.runs} runs ({partnership.balls} balls)
                </Text>
                <TouchableOpacity onPress={() => _swap()}>
                  <Icon name="swap-horizontal" size={16} color={COLORS.cyan} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Extras */}
          <View style={sc.extrasRow}>
            <Text style={sc.extrasLabel}>Extras</Text>
            <Text style={[sc.extrasTxt, { flex: 1 }]}>
              nb {extras.no_ball}, wd {extras.wide}, b {extras.bye}, lb {extras.leg_bye}
            </Text>
            <Text style={sc.extrasTot}>
              {extras.no_ball + extras.wide + extras.bye + extras.leg_bye}
            </Text>
          </View>

          {/* Bowling section */}
          <View style={sc.section}>
            <View style={sc.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={sc.sectionTitle}>BOWLING</Text>
                {overBalls.length === 0 && bowler && (
                  <TouchableOpacity onPress={handleChangeBowler} style={sc.changeBtn}>
                    <Icon name="pencil" size={11} color={COLORS.cyan} />
                    <Text style={[sc.changeBtnText, { color: COLORS.cyan }]}>Change</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={sc.colHeaders}>
                <Text style={sc.colH}>O</Text>
                <Text style={sc.colH}>M</Text>
                <Text style={sc.colH}>R</Text>
                <Text style={sc.colH}>W</Text>
                <Text style={[sc.colH, { marginLeft: 8 }]}>Eco</Text>
              </View>
            </View>
            <BowlerRow bowler={bowler ? { ...bowler, ...bowlerStats } : null} legalBalls={legalBalls} COLORS={COLORS} sc={sc} />
          </View>

          {/* Current over dots */}
          <View style={sc.dotsRow}>
            {overBalls.map((b, i) => <BallDot key={i} ball={b} COLORS={COLORS} sc={sc} />)}
            {[...Array(Math.max(0, 6 - overBalls.length))].map((_, i) => <EmptyDot key={`e${i}`} COLORS={COLORS} sc={sc} />)}
          </View>

          {/* Free Hit banner */}
          {isFreeHit && (
            <View style={sc.freeHitBanner}>
              <Icon name="lightning-bolt" size={16} color={COLORS.navy} />
              <Text style={sc.freeHitTxt}>⚡ FREE HIT — Batsman cannot be dismissed!</Text>
            </View>
          )}

          {/* Scoring pad */}
          <ScoringPad
            onRun={(r) => recordBall(r)}
            onExtra={handleExtra}
            onWicket={handleWicket}
            onUndo={handleUndo}
            onSwap={_swap}
            canUndo={allBalls.length > 0}
            canSwap={!!striker && !!nonStriker}
            COLORS={COLORS}
            pad={pad}
            extraBtns={extraBtns}
          />

          {/* End Innings button */}
          <TouchableOpacity
            style={sc.endBtn}
            onPress={handleManualCloseInnings}
          >
            <Text style={sc.endBtnTxt}>{isSuperOver ? 'CLOSE SUPER OVER' : 'CLOSE INNINGS'}</Text>
          </TouchableOpacity>
          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {/* ── Ball-by-Ball Tab ── */}
      {activeTab === 'ballByBall' && (
        <BallByBallTab
          allBalls={allBalls}
          COLORS={COLORS}
          bb={bb}
        />
      )}

      {/* ── Wicket Dismissal Modal ── */}
      <WicketDismissalModal
        visible={wicketModal.visible}
        striker={wicketModal.str}
        nonStriker={wicketModal.ns}
        bowlingPlayers={bowlingPlayers}
        isFreeHit={wicketModal.isFreeHit}
        COLORS={COLORS}
        onConfirm={confirmWicket}
        onCancel={() => setWicketModal({ visible: false })}
      />

      {/* ── Innings Complete Modal ── */}
      <InningsCompleteModal
        visible={showInningsComplete}
        battingTeam={battingTeam}
        bowlingTeam={bowlingTeam}
        score={totalRuns}
        wickets={totalWickets}
        isLastInnings={isLastInnings}
        resultText={inningsResultText}
        nextActionLabel={nextInningsActionLabel}
        isSuperOver={isSuperOver}
        superOverNumber={superOverNumber}
        showTarget={modalShowsTarget}
        isTieBreaker={needsFirstSuperOver || needsAnotherSuperOver}
        onStartNext={handleStartNextInnings}
        onEndMatch={handleEndMatch}
        COLORS={COLORS}
        ic={ic}
      />

      {/* ── Extra Runs Modal ── */}
      <ExtraRunsModal
        visible={extraModal.visible}
        type={extraModal.type}
        COLORS={COLORS}
        onSelect={handleExtraModalSelect}
        onCancel={() => setExtraModal({ visible: false, type: null })}
      />
    </LinearGradient>
  );
};

// ── Style Factories ─────────────────────────────────────────

const getStyles = (COLORS) => StyleSheet.create({
  container:    { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 48, paddingHorizontal: 16, paddingBottom: 8 },
  headerSide:      { width: 44, alignItems: 'center' },
  headerCenter:    { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  headerSeries:    { color: COLORS.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  headerMatch:     { color: COLORS.white, fontSize: 16, fontWeight: '900', marginTop: 1 },
  headerVenueRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%', marginTop: 2 },
  headerVenue:     { color: COLORS.gray, fontSize: 10, fontWeight: '600', flexShrink: 1 },
  // TARGET badge — top-left of header in 2nd innings (height matches centre score row)
  targetBadge:      { width: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 4, borderWidth: 1.5, borderColor: COLORS.gold, overflow: 'hidden' },
  targetBadgeLabel: { color: COLORS.gold + 'BB', fontSize: 7, fontWeight: '900', letterSpacing: 1.5, marginBottom: 0 },
  targetBadgeNum:   { color: COLORS.gold, fontSize: 26, fontWeight: '900', lineHeight: 30 },
  subHeader:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 10 },
  teamsCenter:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  teamPill:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 0, flexShrink: 1, maxWidth: '43%', minHeight: 40, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5 },
  battingTeamPill: { shadowColor: COLORS.gold, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  bowlingTeamPill: { shadowColor: COLORS.cyan, shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  teamPillIcon:   { marginRight: 6 },
  teamPillTxt:    { color: COLORS.white, fontSize: 14, fontWeight: '900', flexShrink: 1, textAlign: 'center' },
  vsLabel:        { color: COLORS.gray, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  tabRow:       { flexDirection: 'row', marginHorizontal: 14, marginBottom: 6, gap: 8 },
  tab:          { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder },
  tabActive:    { backgroundColor: COLORS.royalBlue, borderColor: COLORS.cyan },
  tabTxt:       { color: COLORS.gray, fontWeight: '600', fontSize: 13 },
  tabTxtActive: { color: '#FFFFFF' },
});

// Scorecard tab styles
const getScStyles = (COLORS) => StyleSheet.create({
  summaryBar:    { flexDirection: 'row', backgroundColor: COLORS.card, marginHorizontal: 12, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  summaryItem:   { flex: 1, alignItems: 'center' },
  summaryVal:    { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  summaryLabel:  { color: COLORS.gray, fontSize: 9, marginTop: 2 },
  scoreBandWrap:  { backgroundColor: COLORS.card + 'CC', marginHorizontal: 12, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  scoreBandRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  scoreBandMain:  { color: COLORS.white, fontWeight: '900', fontSize: 32, lineHeight: 36 },
  scoreBandMeta:  { color: COLORS.gray,  fontWeight: '700', fontSize: 12 },
  scoreBandSep:   { color: COLORS.cardBorder, fontSize: 13 },
  // Chase pill — shown below score row in 2nd innings
  chasePill:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.gold + '60', overflow: 'hidden' },
  chaseText:      { color: '#C8B06A', fontSize: 12, fontWeight: '600' },
  chaseHighlight: { color: COLORS.gold, fontWeight: '900', fontSize: 13 },
  chaseDivider:   { width: 1, height: 12, backgroundColor: COLORS.gold + '40', marginHorizontal: 10 },
  chaseRRR:       { color: '#C8B06A', fontSize: 11, fontWeight: '600' },
  section:       { backgroundColor: COLORS.card, marginHorizontal: 12, borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.cardBorder },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder, paddingBottom: 6 },
  sectionTitle:  { color: COLORS.gold, fontWeight: '700', fontSize: 11, letterSpacing: 2 },
  changeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder },
  changeBtnText: { color: COLORS.gold, fontSize: 10, fontWeight: '700' },
  freeHitBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F0C030', borderRadius: 10, marginHorizontal: 16, marginBottom: 8, paddingVertical: 8 },
  freeHitTxt:    { color: '#1A1A00', fontWeight: '800', fontSize: 13 },
  colHeaders:    { flexDirection: 'row', gap: 2 },
  colH:          { color: COLORS.gray, fontSize: 10, width: 36, textAlign: 'right', fontWeight: '700' },
  bRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder + '55' },
  bName:         { flex: 1, color: COLORS.white, fontSize: 13, fontWeight: '600' },
  bCell:         { width: 36, textAlign: 'right', color: COLORS.lightGray, fontSize: 12, fontWeight: '600' },
  partnerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 },
  partnerTxt:    { color: COLORS.gray, fontSize: 11 },
  extrasRow:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, backgroundColor: COLORS.darkGray, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 6 },
  extrasLabel:   { color: COLORS.gray, fontSize: 11, fontWeight: '700', marginRight: 8 },
  extrasTxt:     { color: COLORS.gray, fontSize: 11 },
  extrasTot:     { color: COLORS.white, fontSize: 14, fontWeight: '800', minWidth: 24, textAlign: 'right' },
  dotsRow:       { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 10 },
  dot:           { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dotTxt:        { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  endBtn:        { marginHorizontal: 12, marginTop: 8, height: 46, backgroundColor: COLORS.darkGray, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  endBtnTxt:     { color: COLORS.gray, fontWeight: '700', fontSize: 13, letterSpacing: 1 },
});

// Scoring pad styles
const getPadStyles = (COLORS) => StyleSheet.create({
  wrap:      { paddingHorizontal: 12, paddingTop: 4 },
  runRow:    { flexDirection: 'row', gap: 6, marginBottom: 6 },
  runBtn:    { flex: 1, height: 52, backgroundColor: COLORS.card, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  runTxt:    { color: COLORS.white, fontSize: 20, fontWeight: '900' },
  undoBtn:   { width: 52, height: 52, backgroundColor: COLORS.darkGray, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  extraRow:  { flexDirection: 'row', gap: 6, marginBottom: 6 },
  extraBtn:  { flex: 1, height: 42, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  extraTxt:  { fontWeight: '800', fontSize: 11 },
  actionRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  wicketBtn: { flex: 2, height: 50, backgroundColor: COLORS.danger, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  wicketTxt: { color: '#FFFFFF', fontWeight: '900', fontSize: 15, letterSpacing: 2 },
  swapBtn:   { flex: 1, height: 50, backgroundColor: COLORS.darkGray, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.cardBorder, gap: 2 },
  swapTxt:   { color: COLORS.gray, fontSize: 10, fontWeight: '600' },
});

// Ball-by-ball tab styles
const getBbStyles = (COLORS) => StyleSheet.create({
  overBlock:    { marginBottom: 16 },
  overHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  overLabel:    { color: COLORS.gold, fontWeight: '900', fontSize: 11, letterSpacing: 1.8 },
  overRule:     { flex: 1, height: 1, backgroundColor: COLORS.cardBorder },
  ballRow:      { flexDirection: 'row', alignItems: 'center', minHeight: 62, backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 5, gap: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  deliveryPill: { width: 40, minHeight: 30, borderRadius: 8, backgroundColor: COLORS.darkGray, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  deliveryText: { color: COLORS.white, fontWeight: '900', fontSize: 11 },
  playerStack:  { flex: 1, minWidth: 0 },
  playerLine:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playerName:   { color: COLORS.white, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  facesText:    { color: COLORS.gray, fontSize: 10, fontWeight: '600', flexShrink: 0 },
  outcomeText:  { color: COLORS.gray, fontSize: 10, fontWeight: '600', marginTop: 3 },
  resultBadge:  { minWidth: 46, maxWidth: 64, minHeight: 30, borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  resultText:   { fontSize: 11, fontWeight: '900' },
});

// Innings complete modal
const getIcStyles = (COLORS) => StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:      { backgroundColor: COLORS.navy, borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: COLORS.gold },
  title:     { color: COLORS.white, fontSize: 20, fontWeight: '800', marginBottom: 8 },
  team:      { color: COLORS.cyan, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  score:     { color: COLORS.gold, fontSize: 48, fontWeight: '900', marginBottom: 16 },
  sub:       { fontSize: 13, fontWeight: '600', marginBottom: 24 },
  resultTxt: { fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  nextBtn:   { borderRadius: 14, overflow: 'hidden', width: '100%', marginTop: 20 },
  nextGrad:  { height: 56, alignItems: 'center', justifyContent: 'center' },
  nextTxt:   { color: COLORS.white, fontWeight: '900', fontSize: 16 },
});

export default LiveScoringScreen;
