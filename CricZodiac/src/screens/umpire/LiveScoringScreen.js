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
  StatusBar, Modal, FlatList, TextInput,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import {
  createInnings, enqueueInningsSync, createOver, enqueueOverSync, updateOver, updateInnings, updateMatch,
  saveBall, getCurrentOver, getMatchInnings, getMatch, getMatchTeams,
  getTeamPlayers, getAllTeamPlayers,
  getBallsWithPlayers, getPlayerBattingStats,
  getLastBall, deleteBall, getInnings, clearInningsProgress, saveWicket, retireBatsman,
  upsertTeamPlayersFromServer, upsertMatchesFromServer,
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
  if (ball.extra_type === 'wide')    return 'Wd';
  if (ball.extra_type === 'no_ball') return `${ball.runs_scored || 0}-NB`;
  if (ball.extra_type === 'bye')     return `${ball.extra_runs || 0}-B`;
  if (ball.extra_type === 'leg_bye') return `${ball.extra_runs || 0}-LB`;
  return String(ball.runs_scored || 0);
};

const ballColor = (ball, COLORS) => {
  if (ball.is_wicket)              return COLORS.danger;
  if (ball.extra_type === 'wide' || ball.extra_type === 'no_ball') return COLORS.warning;
  if (ball.runs_scored === 4)      return COLORS.royalBlue;
  if (ball.runs_scored === 6)      return COLORS.purple;
  if (ball.runs_scored === 0)      return '#6B7280';   // mid-gray — visible on both themes
  return COLORS.royalBlue;
};

const crossedRunsForDelivery = (extraType, runsScored = 0, extraRuns = 0) =>
  (extraType === 'bye' || extraType === 'leg_bye')
    ? Number(extraRuns || 0)
    : Number(runsScored || 0);

const shouldSwapForCrossedRuns = (extraType, crossedRuns) =>
  extraType !== 'wide' && Math.abs(Number(crossedRuns) || 0) % 2 === 1;

const getExtraBtns = (COLORS) => [
  { id: 'wide',    label: 'WIDE',   short: 'Wd', color: COLORS.warning  },
  { id: 'no_ball', label: 'NO BALL',short: 'Nb', color: COLORS.danger   },
  { id: 'bye',     label: 'BYE',    short: 'B',  color: COLORS.gray     },
  { id: 'leg_bye', label: 'LEG BYE',short: 'Lb', color: COLORS.gray     },
];

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
  return (
    <TouchableOpacity
      style={[sc.dot, { backgroundColor: ballColor(ball, COLORS) }]}
      onPress={() => onPress && onPress(ball)}
    >
      <Text style={[sc.dotTxt, label.length > 2 && { fontSize: 9 }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const EmptyDot = ({ COLORS, sc }) => (
  <View style={[sc.dot, { borderWidth: 1, borderColor: COLORS.cardBorder, backgroundColor: 'transparent' }]} />
);

// ── Wicket Dismissal Types ─────────────────────────────────
const WICKET_TYPES_FULL = [
  { id: 'bowled',     label: 'Bowled',      icon: 'cricket',                   color: '#DC2626' },
  { id: 'caught',     label: 'Caught',      icon: 'hand-pointing-right',        color: '#7C3AED' },
  { id: 'run_out',    label: 'Run Out',     icon: 'run-fast',                   color: '#D97706' },
  { id: 'lbw',        label: 'LBW',         icon: 'human',                      color: '#2563EB' },
  { id: 'stumped',    label: 'Stumped',     icon: 'close-circle-outline',        color: '#059669' },
  { id: 'hit_wicket', label: 'Hit Wicket',  icon: 'kabaddi',                    color: '#EA580C' },
  { id: 'retired',    label: 'Retired',     icon: 'walk',                       color: '#6B7280' },
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

  // On free hit only run out is valid
  const availableTypes = isFreeHit
    ? WICKET_TYPES_FULL.filter(w => w.id === 'run_out')
    : WICKET_TYPES_FULL;

  const needsFielder  = ['caught', 'run_out', 'stumped'].includes(selType);
  const needsWhoIsOut = BOTH_ENDS_TYPES.includes(selType);
  const canConfirm    = !!selType && (!needsFielder || !!selFielder);

  // Reset each time modal opens; auto-select run_out on free hit
  React.useEffect(() => {
    if (visible) {
      setSelFielder(null);
      setDismissed('striker');
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
                  style={[wdStyles.whoBtn, dismissed === 'nonStriker' && wdStyles.whoBtnSel]}
                  onPress={() => setDismissed('nonStriker')}
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
              onPress={() => onConfirm(selType, selFielder, dismissed)}
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
  onStartNext, onEndMatch, isLastInnings, resultText, COLORS, ic,
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
          {isLastInnings ? 'Match Over!' : '1st Innings Complete'}
        </Text>

        {!isLastInnings ? (
          <>
            <Text style={ic.team}>{battingTeam?.team_name}</Text>
            <Text style={ic.score}>{score}/{wickets}</Text>
            <Text style={[ic.sub, { color: COLORS.gray }]}>Target for 2nd innings: {score + 1}</Text>
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
                <Text style={ic.nextTxt}>Start 2nd Innings →</Text>
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
          <Text style={bb.overLabel}>Over {over.overNumber}</Text>
          {[...over.balls].reverse().map((ball, bi) => (
            <View key={ball.id || bi} style={bb.ballRow}>
              <View style={[bb.ballDot, { backgroundColor: ballColor(ball, COLORS) }]}>
                {(() => { const lbl = ballLabel(ball); return (
                  <Text style={[bb.ballDotTxt, lbl.length > 2 && { fontSize: 8 }]}>{lbl}</Text>
                ); })()}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={bb.ballDesc}>
                  {over.overNumber}.{ball.extra_type === 'wide' ? 'Wd' : ball.extra_type === 'no_ball' ? 'NB' : ball.extra_type === 'bye' ? 'B' : ball.extra_type === 'leg_bye' ? 'LB' : ball.ball_number}{'  '}{ball.striker_name || '—'}
                  {ball.is_wicket ? '  🔴 OUT' : ''}
                </Text>
                <Text style={bb.ballSub}>{ball.bowler_name || '—'}</Text>
              </View>
              <Text style={bb.ballRuns}>
                +{(ball.runs_scored || 0) + (ball.extra_runs || 0)}
              </Text>
            </View>
          ))}
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
              r === 4 ? { backgroundColor: COLORS.royalBlue, borderColor: COLORS.royalBlue } :
              r === 6 ? { backgroundColor: COLORS.purple,    borderColor: COLORS.purple }    : {}
            ]}
            onPress={() => onRun(r)}
          >
            <Text style={[pad.runTxt, (r === 4 || r === 6) && { color: '#FFFFFF' }]}>{r}</Text>
          </TouchableOpacity>
        ))}
        {/* 5+ button — opens cross-platform TextInput modal (Alert.prompt is iOS only) */}
        <TouchableOpacity
          style={[pad.runBtn, { backgroundColor: COLORS.orange, borderColor: COLORS.orange }]}
          onPress={() => setCustomModal({ visible: true, value: '' })}
        >
          <Text style={[pad.runTxt, { color: '#FFFFFF' }]}>5+</Text>
        </TouchableOpacity>
        {/* Undo — disabled when the current over has no balls yet */}
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
  no_ball: { icon: 'close-circle',   label: 'NO BALL',  sub: 'Runs scored off bat', accentKey: 'danger'  },
  bye:     { icon: 'run-fast',        label: 'BYE',      sub: 'Bye runs',            accentKey: 'cyan'    },
  leg_bye: { icon: 'human-handsup',   label: 'LEG BYE',  sub: 'Leg bye runs',        accentKey: 'purple'  },
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
  const accent = COLORS[cfg.accentKey] || COLORS.gold;

  const handleSelect = (r) => { setShowCustom(false); setCustomVal(''); onSelect(r); };
  const handleCustomConfirm = () => {
    const r = parseInt(customVal, 10);
    if (!isNaN(r) && r >= 0) handleSelect(r);
  };
  const handleClose = () => { setShowCustom(false); setCustomVal(''); onCancel(); };

  if (!visible || !type) return null;

  // Run number text colour: 4 → royalBlue, 6 → purple, others → always-white on coloured bg
  const runNumColor = (r) => {
    if (r === 4) return COLORS.royalBlue;
    if (r === 6) return COLORS.purple;
    return COLORS.white;
  };

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
            {EXTRA_RUN_OPTS.map(r => (
              <TouchableOpacity key={r} style={[erm.runBtn, { borderColor: accent + '66' }]} onPress={() => handleSelect(r)}>
                <Text style={[erm.runNum, { color: runNumColor(r) }]}>{r}</Text>
                {r === 6 && <Text style={erm.runSub}>🎯</Text>}
              </TouchableOpacity>
            ))}
            {/* 5+ custom */}
            <TouchableOpacity style={[erm.runBtn, { borderColor: accent, backgroundColor: accent + '22' }]} onPress={() => setShowCustom(true)}>
              <Text style={[erm.runNum, { color: accent }]}>5+</Text>
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
    matchId: routeMatchId,   // passed from SeriesDetailScreen for resume
  } = route.params || {};

  // These will be overwritten if recovered from DB in initScoring
  const [resolvedParams, setResolvedParams] = React.useState({
    match:         matchParam        || null,
    battingTeam:   battingTeamParam  || null,
    bowlingTeam:   bowlingTeamParam  || null,
    inningsNumber: inningsNumberParam || 1,
    target:        target             || null,
  });
  const match         = resolvedParams.match;
  const battingTeam   = resolvedParams.battingTeam;
  const bowlingTeam   = resolvedParams.bowlingTeam;
  const inningsNumber = resolvedParams.inningsNumber;
  const resolvedTarget = resolvedParams.target;

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

    if (selection.type === 'new_batsman') {
      // Striker was out — incoming batsman takes strike
      setStriker(selection.striker || null);
      setStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
      triggerBowlerIfNeeded();
    } else if (selection.type === 'new_non_striker') {
      // Non-striker was out (e.g. run out at non-striker's end) — replace non-striker only
      setNonStriker(selection.striker || null);   // SelectBatsman returns player in .striker field
      setNonStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
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
      setStriker(selection.striker);
      setNonStriker(selection.nonStriker);
      setStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
      setNonStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
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
        const accRuns = pastBalls.reduce((s, b) => s + (b.runs_scored || 0) + (b.extra_runs || 0), 0);
        const accWickets = pastBalls.filter(b => b.is_wicket === 1).length;
        let accMaidens = 0;
        for (const ovId of pastOverIds) {
          const ovBalls = pastBalls.filter(b => b.over_id === ovId);
          const legalCount = ovBalls.filter(b => b.is_valid_ball === 1).length;
          if (legalCount >= 6) {
            const ovRuns = ovBalls.reduce((s, b) => s + (b.runs_scored || 0) + (b.extra_runs || 0), 0);
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
    setStriker(null);
    setStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
    navigation.setParams({ wicketDismissed: null });
  }, [navigation, route.params?.wicketDismissed]);

  // After both batsmen are set and there is no bowler yet → ask for bowler
  useEffect(() => {
    if (!striker || !nonStriker) return;
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
  }, [striker, nonStriker]);

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
          rBattingTeam   = teams.find(t => t.id === activeInnings.batting_team_id) || teams[0];
          rBowlingTeam   = teams.find(t => t.id === activeInnings.bowling_team_id) || teams[1];
        } else {
          // No innings started yet — fresh match, default to innings 1
          rInningsNumber = 1;
          rBattingTeam   = teams[0];
          rBowlingTeam   = teams[1];
        }

        // ── Step 4: Recover target for 2nd innings ─────────────────────────
        let rTarget = target || null;
        if (rInningsNumber === 2 && !rTarget) {
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
        });
      } catch (err) {
        showAlert('Error', 'Could not resume match: ' + err.message);
        setLoading(false);
        return;
      }
    }

    // ── Step 2: Normal init using resolved variables ───────────────────────
    try {
      const existingInnings = await getMatchInnings(rMatch.id);
      let active = existingInnings.find(i => i.innings_number === rInningsNumber && !i.is_completed);

      if (!active) {
        const inningsId = await createInnings({
          match_id:        rMatch.id,
          club_id:         rMatch.club_id   || null,
          series_id:       rMatch.series_id || null,
          innings_number:  rInningsNumber,
          batting_team_id: rBattingTeam.id,
          bowling_team_id: rBowlingTeam.id,
        });
        active = {
          id:              inningsId,
          innings_number:  rInningsNumber,
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

        if (!lastBall.is_wicket) {
          const crossedRuns = crossedRunsForDelivery(lastBall.extra_type, lastBall.runs_scored, lastBall.extra_runs);
          const overEnded = lastBall.is_valid_ball === 1 && (Number(lastBall.ball_number) || 0) >= 6;

          if (shouldSwapForCrossedRuns(lastBall.extra_type, crossedRuns)) {
            [restoredStriker, restoredNS] = [restoredNS, restoredStriker];
          }
          if (overEnded) {
            [restoredStriker, restoredNS] = [restoredNS, restoredStriker];
          }
        }

        if (restoredStriker) { strikerRef.current = restoredStriker;    setStriker(restoredStriker); }
        if (restoredNS)      { nonStrikerRef.current = restoredNS;       setNonStriker(restoredNS); }
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
          const bwlRuns = overBallsList.reduce((s, b) => s + (b.runs_scored || 0) + (b.extra_runs || 0), 0);
          const bwlWkts = overBallsList.filter(b => b.is_wicket === 1).length;
          setBowlerStats({ overs: existingOver.over_number - 1, runs: bwlRuns, wickets: bwlWkts, maidens: 0 });
        }

        // Restore extras from ball history
        const eb = { wide: 0, no_ball: 0, bye: 0, leg_bye: 0 };
        balls.forEach(b => {
          if (!b.extra_type) return;
          const delta = (b.extra_type === 'bye' || b.extra_type === 'leg_bye') ? (b.extra_runs || 0) : 1;
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
    if (!str || !ns) {
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
      const { extraType = null, byeRuns = 0 } = options;
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
      const widePenalty   = match.wide_value    || 1;
      const noBallPenalty = match.no_ball_value || 1;
      const extraRuns  = isWide ? widePenalty : isNoBall ? noBallPenalty : byeRuns;
      const totalAdded = runsScored + extraRuns;
      const crossedRuns = crossedRunsForDelivery(extraType, runsScored, extraRuns);

      const ballId = uuid.v4();
      await saveBall({
        id:              ballId,
        over_id:         over.id,
        over_number:     ovNum,
        innings_id:      inn.id,
        match_id:        match.id,
        ball_number:     legal + 1,
        striker_id:      str.id,
        non_striker_id:  ns.id,
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
      setTotalRuns(newTotal);
      if (isValidBall) setLegalBalls(newLegal);

      // Update extras breakdown.
      // wide/no_ball: track count (penalty applied at display time).
      // bye/leg_bye: track actual runs (variable per delivery).
      if (isExtra) {
        const extDelta = (isBye || isLegBye) ? extraRuns : 1;
        setExtras(prev => ({ ...prev, [extraType]: (prev[extraType] || 0) + extDelta }));
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
      setStrikerStats(newStrikerStats);

      // Update partnership (all runs including byes/lb add to partnership)
      setPartnership(prev => ({
        runs:  prev.runs  + totalAdded,
        balls: prev.balls + (isValidBall ? 1 : 0),
      }));

      // Update bowler stats
      setBowlerStats(prev => ({
        ...prev,
        runs:    prev.runs + totalAdded,
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
        non_striker_name: ns.full_name,
        bowler_name:      bwl.full_name,
        striker_id:       str.id,
        non_striker_id:   ns.id,
        bowler_id:        bwl.id,
      };
      setAllBalls(prev => [...prev, ballDisplay]);
      setOverBalls(prev => [...prev, ballDisplay]);

      // Auto-swap when batsmen physically cross. Byes/leg-byes store the
      // crossed runs in extra_runs, while bat/no-ball bat runs use runs_scored.
      if (shouldSwapForCrossedRuns(extraType, crossedRuns)) _swap(newStrikerStats);

      // Target chased? End innings immediately (2nd innings only)
      if (resolvedTarget && newTotal >= resolvedTarget) {
        _endInnings(newTotal, totWkts, inn.id);
        return;
      }

      // Over complete (6 legal balls)
      if (newLegal >= 6) {
        await updateOver(over.id, { is_completed: 1, balls_bowled: 6 });
        await updateInnings(inn.id, { total_overs: ovNum });
        setCurrentOver(null);
        // Pre-increment so ensureOver creates the correct next over number.
        // Must happen BEFORE _endInnings check so ovNum still holds the
        // just-completed over number for the >= match.overs comparison.
        overNumRef.current = ovNum + 1;
        setOverNumber(ovNum + 1);
        _swap(); // swap at end of over
        setBowlerStats(prev => ({ ...prev, overs: prev.overs + 1 }));
        lastOverBowlerIdRef.current = bwl.id; // track for consecutive-over restriction

        if (ovNum >= match.overs) {
          _endInnings(newTotal, totWkts, inn.id);
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
  const confirmWicket = async (dismissalType, fielder, dismissed = 'striker') => {
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
    const strikerStatsAfterWicket = {
      ...strikerStatsRef.current,
      balls: (strikerStatsRef.current.balls || 0) + 1,
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
        non_striker_id: ns?.id,
        bowler_id:      bwl.id,
        runs_scored:    0,
        is_wicket:      true,
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
        runs_at_fall: totRuns,
        over_at_fall: fallOverLabel(ovNum, newLegal),
      });

      // 3. Update counts + UI
      setTotalWickets(newWkts);
      setLegalBalls(newLegal);
      setBowlerStats(prev => ({ ...prev, wickets: prev.wickets + 1 }));
      setPartnership({ runs: 0, balls: 0 });
      await updateInnings(inn.id, { total_wickets: newWkts });

      const ballDisplay = {
        id: ballId, over_id: over.id, over_number: ovNum,
        ball_number: newLegal, runs_scored: 0, extra_runs: 0,
        is_wicket: 1, striker_name: str.full_name, bowler_name: bwl.full_name,
      };
      setAllBalls(prev => [...prev, ballDisplay]);
      setOverBalls(prev => [...prev, ballDisplay]);

      // 4. All out → end innings
      if (newWkts >= match.players_per_team - 1) {
        _endInnings(totRuns, newWkts, inn.id);
        return;
      }

      // 5. Over complete on this wicket ball
      if (newLegal >= 6) {
        await updateOver(over.id, { is_completed: 1, balls_bowled: 6 });
        setCurrentOver(null);
        overRef.current = null;
        overNumRef.current = ovNum + 1;
        setOverNumber(ovNum + 1);
        overCompletedOnWicket = true;
        setBowlerStats(prev => ({ ...prev, overs: prev.overs + 1 }));
        lastOverBowlerIdRef.current = bwl.id;
        if (ovNum >= match.overs) {
          _endInnings(totRuns, newWkts, inn.id);
          return;
        }
        pendingSelectBowlerRef.current = true;
      }

      // 6. Navigate to replace the dismissed batsman
      if (dismissed === 'nonStriker') {
        if (overCompletedOnWicket) {
          applyNonStrikerEnd(str, strikerStatsAfterWicket);
          applyStrikerEnd(null);
          navigation.navigate('SelectBatsman', {
            inningsId: inn.id, team: battingTeam, requestId: uuid.v4(),
            returnScreen: 'LiveScoring', selectionType: 'new_batsman',
            mode: 'new_batsman',
            existingNonStrikerId: str?.id,
          });
          return;
        }

        setStrikerStats(strikerStatsAfterWicket);
        strikerStatsRef.current = strikerStatsAfterWicket;
        applyNonStrikerEnd(null);
        navigation.navigate('SelectBatsman', {
          inningsId: inn.id, team: battingTeam, requestId: uuid.v4(),
          returnScreen: 'LiveScoring', selectionType: 'new_non_striker',
          mode: 'new_batsman',           // single-player selection UI
          existingStrikerId: str?.id,    // current striker stays, exclude from list
        });
      } else {
        if (overCompletedOnWicket) {
          applyStrikerEnd(ns, nonStrikerStatsRef.current);
          applyNonStrikerEnd(null);
          navigation.navigate('SelectBatsman', {
            inningsId: inn.id, team: battingTeam, requestId: uuid.v4(),
            returnScreen: 'LiveScoring', selectionType: 'new_non_striker',
            mode: 'new_batsman',
            existingStrikerId: ns?.id,
          });
          return;
        }

        applyStrikerEnd(null);
        navigation.navigate('SelectBatsman', {
          inningsId: inn.id, team: battingTeam, requestId: uuid.v4(),
          returnScreen: 'LiveScoring', selectionType: 'new_batsman',
          mode: 'new_batsman',             // single-player selection UI
          existingNonStrikerId: ns?.id,    // current non-striker stays, exclude from list
        });
      }
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
    if (type === 'wide') {
      recordBall(0, { extraType: 'wide' });
    } else {
      setExtraModal({ visible: true, type });
    }
  };

  const handleExtraModalSelect = (runs) => {
    const { type } = extraModal;
    setExtraModal({ visible: false, type: null });
    if (type === 'no_ball') {
      recordBall(runs, { extraType: 'no_ball' });
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
            const bwlRuns = ob.reduce((s, b) => s + (b.runs_scored || 0) + (b.extra_runs || 0), 0);
            const bwlWkts = ob.filter(b => b.is_wicket === 1).length;
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
          // wide/no_ball → count; bye/leg_bye → actual extra_runs
          const eb = { wide: 0, no_ball: 0, bye: 0, leg_bye: 0 };
          refreshed.forEach(b => {
            if (!b.extra_type) return;
            const delta = (b.extra_type === 'bye' || b.extra_type === 'leg_bye')
              ? (b.extra_runs || 0)
              : 1;
            eb[b.extra_type] = (eb[b.extra_type] || 0) + delta;
          });
          setExtras(eb);

        } catch (e) { showAlert('Undo Failed', e.message); }
      }},
    ]);
  };

  // ── End Innings ────────────────────────────────────────
  const _endInnings = async (runs, wkts, inningsId) => {
    try {
      await updateInnings(inningsId || innings?.id, { is_completed: 1 });

      // Compute result text for 2nd innings
      if (inningsNumber === 2 && resolvedTarget) {
        const finalRuns = runs  ?? totalRuns;
        const finalWkts = wkts ?? totalWickets;
        const maxWkts   = (match.players_per_team || 6) - 1;
        let result;
        if (finalRuns >= resolvedTarget) {
          // Batting team chased down — win by remaining wickets
          const wicketsLeft = maxWkts - finalWkts;
          result = `${battingTeam.team_name} wins by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}!`;
        } else if (finalRuns === resolvedTarget - 1) {
          result = 'Match Tied!';
        } else {
          // Bowling team defended — win by run difference
          const runDiff = (resolvedTarget - 1) - finalRuns;
          result = `${bowlingTeam.team_name} wins by ${runDiff} run${runDiff !== 1 ? 's' : ''}!`;
        }
        setInningsResultText(result);
      }

      setShowInningsComplete(true);
    } catch (e) {
      console.error('endInnings:', e);
    }
  };

  const handleStartNextInnings = async () => {
    setShowInningsComplete(false);
    const snapRuns    = totalRunsRef.current;
    const snapMatch   = match;
    const snapInnings = inningsRef.current;

    // Belt-and-suspenders: ensure innings 1 is marked complete regardless
    // of whether _endInnings ran cleanly before navigation.
    try {
      if (snapInnings?.id) {
        await updateInnings(snapInnings.id, { is_completed: 1 });
      }
    } catch (e) {
      console.warn('[handleStartNextInnings] is_completed update failed:', e.message);
    }

    setTimeout(() => {
      navigation.replace('LiveScoring', {
        match:         snapMatch,
        battingTeam:   bowlingTeam,
        bowlingTeam:   battingTeam,
        inningsNumber: 2,
        target:        snapRuns + 1,
      });
    }, 400);
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

        {/* Centre — score + overs on one row */}
        <View style={styles.headerCenter}>
          <Text style={styles.headerScore}>{totalRuns}/{totalWickets}</Text>
          <Text style={styles.headerOvers}>  Ov {formatOvers()}/{match?.overs ?? '—'}</Text>
        </View>

        {/* Right — scorecard icon */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Scorecard', { inningsId: innings?.id, match, liveOverNumber: overNumber, liveLegalBalls: legalBalls })}
          style={styles.headerSide}
        >
          <Icon name="view-list" size={22} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      {/* Team row — teams centred */}
      <View style={styles.subHeader}>
        <View style={styles.teamsCenter}>
          <View style={[styles.teamPill, { borderColor: COLORS.gold }]}>
            <Text style={styles.teamPillTxt}>{battingTeam.team_name}</Text>
          </View>
          <Text style={styles.vsLabel}>vs</Text>
          <View style={styles.teamPill}>
            <Text style={styles.teamPillTxt}>{bowlingTeam.team_name}</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[
          { id: 'scorecard',  label: `${inningsNumber === 1 ? '1st' : '2nd'} Innings` },
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
          <Text style={sc.scoreBandMeta}>Ov {formatOvers()}/{match?.overs ?? '—'}</Text>
          <Text style={sc.scoreBandSep}>  ·  </Text>
          <Text style={sc.scoreBandMeta}>RR {runRate()}</Text>
        </View>
        {/* Chase indicator — only in 2nd innings */}
        {resolvedTarget ? (() => {
          const runsNeeded  = Math.max(0, resolvedTarget - totalRuns);
          const ballsBowled = (overNumber - 1) * 6 + legalBalls;
          const ballsLeft   = Math.max(0, (match?.overs || 0) * 6 - ballsBowled);
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
              {extras.no_ball * (match.no_ball_value || 1)
               + extras.wide   * (match.wide_value    || 1)
               + extras.bye
               + extras.leg_bye}
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
            canUndo={legalBalls > 0}
            canSwap={!!striker && !!nonStriker}
            COLORS={COLORS}
            pad={pad}
            extraBtns={extraBtns}
          />

          {/* End Innings button */}
          <TouchableOpacity
            style={sc.endBtn}
            onPress={() => showAlert('Close Innings', 'End this innings?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Close Innings', onPress: () => _endInnings() },
            ])}
          >
            <Text style={sc.endBtnTxt}>CLOSE INNINGS</Text>
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
        isLastInnings={inningsNumber === 2}
        resultText={inningsResultText}
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
  headerCenter:    { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  headerScore:     { color: COLORS.white, fontSize: 26, fontWeight: '900' },
  headerOvers:     { color: COLORS.gray, fontSize: 13, fontWeight: '600' },
  // TARGET badge — top-left of header in 2nd innings (height matches centre score row)
  targetBadge:      { width: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 4, borderWidth: 1.5, borderColor: COLORS.gold, overflow: 'hidden' },
  targetBadgeLabel: { color: COLORS.gold + 'BB', fontSize: 7, fontWeight: '900', letterSpacing: 1.5, marginBottom: 0 },
  targetBadgeNum:   { color: COLORS.gold, fontSize: 26, fontWeight: '900', lineHeight: 30 },
  subHeader:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 8 },
  teamsCenter:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  teamPill:        { backgroundColor: COLORS.card, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.cardBorder },
  teamPillTxt:     { color: COLORS.white, fontSize: 11, fontWeight: '600' },
  vsLabel:         { color: COLORS.gray, fontSize: 11 },
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
  scoreBandWrap:  { backgroundColor: COLORS.card + 'CC', marginHorizontal: 12, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  scoreBandRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  scoreBandMain:  { color: COLORS.white, fontWeight: '900', fontSize: 18 },
  scoreBandMeta:  { color: COLORS.gray,  fontWeight: '600', fontSize: 13 },
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
  overBlock:   { marginBottom: 14 },
  overLabel:   { color: COLORS.gold, fontWeight: '700', fontSize: 12, letterSpacing: 2, marginBottom: 8 },
  ballRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 10, marginBottom: 4, gap: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  ballDot:     { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ballDotTxt:  { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  ballDesc:    { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  ballSub:     { color: COLORS.gray, fontSize: 11, marginTop: 1 },
  ballRuns:    { color: COLORS.white, fontWeight: '800', fontSize: 14 },
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
