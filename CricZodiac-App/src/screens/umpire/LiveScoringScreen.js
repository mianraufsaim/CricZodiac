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
  Alert, StatusBar, Modal, FlatList, TextInput,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import {
  createInnings, createOver, updateOver, updateInnings,
  saveBall, getCurrentOver, getMatchInnings, getTeamPlayers,
  getBallsWithPlayers, getPlayerBattingStats,
  getLastBall, deleteBall, getInnings,
} from '../../database/queries/matchQueries';
import uuid from 'react-native-uuid';

// ── Helpers ───────────────────────────────────────────────
const sr  = (runs, balls) => balls > 0 ? ((runs / balls) * 100).toFixed(1) : '0.0';
const eco = (runs, overs) => overs > 0 ? (runs / overs).toFixed(1) : '0.0';

const ballLabel = (ball) => {
  if (ball.is_wicket) return 'W';
  if (ball.extra_type === 'wide')    return 'Wd';
  if (ball.extra_type === 'no_ball') return 'Nb';
  if (ball.extra_type === 'bye')     return 'B';
  if (ball.extra_type === 'leg_bye') return 'Lb';
  return String(ball.runs_scored || 0);
};

const ballColor = (ball, COLORS) => {
  if (ball.is_wicket)              return COLORS.danger;
  if (ball.extra_type === 'wide' || ball.extra_type === 'no_ball') return COLORS.warning;
  if (ball.runs_scored === 4)      return COLORS.royalBlue;
  if (ball.runs_scored === 6)      return COLORS.purple;
  if (ball.runs_scored === 0)      return COLORS.darkGray;
  return '#1A3F6F';
};

const getExtraBtns = (COLORS) => [
  { id: 'wide',    label: 'WIDE',   short: 'Wd', color: COLORS.warning  },
  { id: 'no_ball', label: 'NO BALL',short: 'Nb', color: COLORS.danger   },
  { id: 'bye',     label: 'BYE',    short: 'B',  color: COLORS.gray     },
  { id: 'leg_bye', label: 'LEG BYE',short: 'Lb', color: COLORS.gray     },
];

// ── Sub-components ────────────────────────────────────────

const BatterRow = ({ batter, isStriker, COLORS, sc }) => {
  if (!batter) return null;
  return (
    <View style={sc.bRow}>
      <Text style={[sc.bName, isStriker && { color: COLORS.gold }]} numberOfLines={1}>
        {isStriker ? '* ' : '  '}{batter.full_name || '—'}
      </Text>
      <Text style={sc.bCell}>{batter.runs ?? 0}</Text>
      <Text style={sc.bCell}>{batter.balls ?? 0}</Text>
      <Text style={sc.bCell}>{batter.fours ?? 0}</Text>
      <Text style={sc.bCell}>{batter.sixes ?? 0}</Text>
      <Text style={[sc.bCell, { color: COLORS.cyan }]}>{sr(batter.runs, batter.balls)}</Text>
    </View>
  );
};

const BowlerRow = ({ bowler, legalBalls, COLORS, sc }) => {
  if (!bowler) return null;
  const completedOvers = Math.floor(legalBalls / 6);
  const rem = legalBalls % 6;
  const oversStr = `${completedOvers}.${rem}`;
  return (
    <View style={sc.bRow}>
      <Text style={[sc.bName, { color: COLORS.cyan }]} numberOfLines={1}>
        {bowler.full_name || '—'}
      </Text>
      <Text style={sc.bCell}>{oversStr}</Text>
      <Text style={sc.bCell}>{bowler.maidens ?? 0}</Text>
      <Text style={sc.bCell}>{bowler.runs ?? 0}</Text>
      <Text style={sc.bCell}>{bowler.wickets ?? 0}</Text>
      <Text style={[sc.bCell, { color: COLORS.warning }]}>{eco(bowler.runs, parseFloat(oversStr))}</Text>
    </View>
  );
};

const BallDot = ({ ball, onPress, COLORS, sc }) => (
  <TouchableOpacity
    style={[sc.dot, { backgroundColor: ballColor(ball, COLORS) }]}
    onPress={() => onPress && onPress(ball)}
  >
    <Text style={sc.dotTxt}>{ballLabel(ball)}</Text>
  </TouchableOpacity>
);

const EmptyDot = ({ COLORS, sc }) => (
  <View style={[sc.dot, { borderWidth: 1, borderColor: COLORS.cardBorder, backgroundColor: 'transparent' }]} />
);

// ── Edit Ball Modal ───────────────────────────────────────
const SCORE_TYPES = [
  { id: 'runs',    label: 'Runs'    },
  { id: 'wide',    label: 'Wide'    },
  { id: 'no_ball', label: 'No Ball' },
  { id: 'bye',     label: 'Bye'     },
  { id: 'leg_bye', label: 'Leg Bye' },
  { id: 'wicket',  label: 'Wicket'  },
];

const EditBallModal = ({ visible, ball, striker, nonStriker, bowler, onSave, onCancel, COLORS, em }) => {
  const [runs, setRuns]           = useState(0);
  const [scoreType, setScoreType] = useState('runs');

  useEffect(() => {
    if (ball) {
      setRuns(ball.runs_scored || 0);
      if (ball.is_wicket)             setScoreType('wicket');
      else if (ball.extra_type)       setScoreType(ball.extra_type);
      else                            setScoreType('runs');
    }
  }, [ball]);

  if (!ball) return null;

  const handleSave = () => {
    const isExtra   = scoreType !== 'runs' && scoreType !== 'wicket';
    const isWicket  = scoreType === 'wicket';
    const isValid   = scoreType === 'runs' || scoreType === 'bye' || scoreType === 'leg_bye' || isWicket;
    onSave({
      runs_scored:   isExtra ? 0 : runs,
      extra_runs:    isExtra ? 1 : 0,
      extra_type:    isExtra ? scoreType : null,
      is_extra:      isExtra ? 1 : 0,
      is_wicket:     isWicket ? 1 : 0,
      is_four:       runs === 4 && !isExtra ? 1 : 0,
      is_six:        runs === 6 && !isExtra ? 1 : 0,
      is_valid_ball: isValid ? 1 : 0,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={em.overlay}>
        <View style={em.sheet}>
          <Text style={em.title}>EDIT BALL</Text>

          <View style={em.infoRow}>
            <View style={em.infoBox}>
              <Text style={em.infoLabel}>Strike Batter</Text>
              <Text style={em.infoVal}>{striker?.full_name || '—'}</Text>
            </View>
            <View style={em.infoBox}>
              <Text style={em.infoLabel}>Bowler</Text>
              <Text style={em.infoVal}>{bowler?.full_name || '—'}</Text>
            </View>
          </View>

          {/* Score Type */}
          <Text style={em.label}>Score Type</Text>
          <View style={em.typeRow}>
            {SCORE_TYPES.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[em.typeBtn, scoreType === t.id && em.typeBtnActive]}
                onPress={() => setScoreType(t.id)}
              >
                <Text style={[em.typeTxt, scoreType === t.id && { color: COLORS.white }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Runs stepper */}
          {(scoreType === 'runs' || scoreType === 'bye' || scoreType === 'leg_bye') && (
            <>
              <Text style={em.label}>Runs</Text>
              <View style={em.stepper}>
                <TouchableOpacity style={em.stepBtn} onPress={() => setRuns(r => Math.max(0, r - 1))}>
                  <Text style={em.stepTxt}>−</Text>
                </TouchableOpacity>
                <Text style={em.stepVal}>{runs}</Text>
                <TouchableOpacity style={em.stepBtn} onPress={() => setRuns(r => r + 1)}>
                  <Text style={em.stepTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Actions */}
          <View style={em.actionRow}>
            <TouchableOpacity style={em.cancelBtn} onPress={onCancel}>
              <Text style={em.cancelTxt}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={em.saveBtn} onPress={handleSave}>
              <Text style={em.saveTxt}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── Innings Complete Modal ────────────────────────────────
const InningsCompleteModal = ({ visible, battingTeam, score, wickets, onStartNext, onEndMatch, isLastInnings, COLORS, ic }) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={ic.overlay}>
      <View style={ic.card}>
        <Icon name="cricket" size={40} color={COLORS.gold} style={{ marginBottom: 12 }} />
        <Text style={ic.title}>Innings Complete</Text>
        <Text style={ic.team}>{battingTeam?.team_name}</Text>
        <Text style={ic.score}>{score}/{wickets}</Text>
        {!isLastInnings
          ? <TouchableOpacity style={ic.nextBtn} onPress={onStartNext}>
              <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={ic.nextGrad}>
                <Text style={ic.nextTxt}>Start 2nd Innings →</Text>
              </LinearGradient>
            </TouchableOpacity>
          : <TouchableOpacity style={ic.nextBtn} onPress={onEndMatch}>
              <LinearGradient colors={[COLORS.gold, '#B8942A']} style={ic.nextGrad}>
                <Text style={[ic.nextTxt, { color: COLORS.navy }]}>View Match Result</Text>
              </LinearGradient>
            </TouchableOpacity>
        }
      </View>
    </View>
  </Modal>
);

// ── Ball-by-Ball Feed ─────────────────────────────────────
const BallByBallTab = ({ allBalls, onEditBall, COLORS, bb }) => {
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
            <TouchableOpacity key={ball.id || bi} style={bb.ballRow} onPress={() => onEditBall(ball)}>
              <View style={[bb.ballDot, { backgroundColor: ballColor(ball, COLORS) }]}>
                <Text style={bb.ballDotTxt}>{ballLabel(ball)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={bb.ballDesc}>
                  {over.overNumber}.{ball.ball_number}  {ball.striker_name || '—'}
                  {ball.is_wicket ? '  🔴 OUT' : ''}
                  {ball.extra_type ? `  (${ball.extra_type.replace('_', ' ')})` : ''}
                </Text>
                <Text style={bb.ballSub}>{ball.bowler_name || '—'}</Text>
              </View>
              <Text style={bb.ballRuns}>
                {(ball.runs_scored || 0) + (ball.extra_runs || 0)}
              </Text>
              <Icon name="pencil" size={14} color={COLORS.gray} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
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

const ScoringPad = ({ onRun, onExtra, onWicket, onUndo, onSwap, COLORS, pad, extraBtns }) => (
  <View style={pad.wrap}>
    {/* Run row */}
    <View style={pad.runRow}>
      {RUN_BTNS.map(r => (
        <TouchableOpacity
          key={r}
          style={[pad.runBtn,
            r === 4 ? { backgroundColor: '#0D2F6F', borderColor: COLORS.royalBlue } :
            r === 6 ? { backgroundColor: '#2A0F5F', borderColor: COLORS.purple }    : {}
          ]}
          onPress={() => onRun(r)}
        >
          <Text style={pad.runTxt}>{r}</Text>
        </TouchableOpacity>
      ))}
      {/* 5+ button */}
      <TouchableOpacity style={[pad.runBtn, { backgroundColor: '#1A3F6F' }]}
        onPress={() => Alert.prompt(
          'Custom Runs', 'Enter runs scored:',
          (txt) => { const n = parseInt(txt); if (!isNaN(n) && n >= 0) onRun(n); }
        )}>
        <Text style={pad.runTxt}>5+</Text>
      </TouchableOpacity>
      {/* Undo */}
      <TouchableOpacity style={pad.undoBtn} onPress={onUndo}>
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
      <TouchableOpacity style={pad.swapBtn} onPress={onSwap}>
        <Icon name="swap-horizontal" size={18} color={COLORS.gray} />
        <Text style={pad.swapTxt}>SWAP</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// ── Extra Runs Modal ─────────────────────────────────────
const EXTRA_RUN_OPTS = [0, 1, 2, 3, 4, 5, 6];

const EXTRA_CONFIG = {
  no_ball: { icon: 'close-circle',   label: 'NO BALL',  sub: 'Runs scored off bat', accentKey: 'danger'  },
  bye:     { icon: 'run-fast',        label: 'BYE',      sub: 'Bye runs',            accentKey: 'cyan'    },
  leg_bye: { icon: 'human-handsup',   label: 'LEG BYE',  sub: 'Leg bye runs',        accentKey: 'purple'  },
};

const ExtraRunsModal = ({ visible, type, COLORS, onSelect, onCancel }) => {
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
                <Text style={[erm.runNum, r === 4 ? { color: COLORS.royalBlue } : r === 6 ? { color: COLORS.purple } : { color: COLORS.white }]}>{r}</Text>
                {r === 6 && <Text style={erm.runSub}>🎯</Text>}
              </TouchableOpacity>
            ))}
            {/* 5+ custom */}
            <TouchableOpacity style={[erm.runBtn, { borderColor: accent + '66', backgroundColor: accent + '18' }]} onPress={() => setShowCustom(true)}>
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

const erm = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: '#000000CC', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:       { width: '100%', maxWidth: 340, backgroundColor: '#0F1B2D', borderRadius: 20, borderWidth: 1.5, overflow: 'hidden' },
  hdr:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14 },
  title:       { flex: 1, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  closeBtn:    { padding: 4 },
  sub:         { color: '#8899AA', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, paddingHorizontal: 18, marginBottom: 14 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10, marginBottom: 16 },
  runBtn:      { width: 64, height: 64, borderRadius: 14, borderWidth: 1.5, backgroundColor: '#162030', alignItems: 'center', justifyContent: 'center' },
  runNum:      { fontSize: 22, fontWeight: '800' },
  runSub:      { fontSize: 10, color: '#8899AA', marginTop: 1 },
  customRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, marginBottom: 10 },
  customInput: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, color: '#FFFFFF', fontSize: 16, backgroundColor: '#162030' },
  customOk:    { height: 44, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  customOkTxt: { color: '#000', fontWeight: '800', fontSize: 14 },
  cancelBtn:   { alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#1E2D3E' },
  cancelTxt:   { color: '#8899AA', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
});

// ── Main Screen ───────────────────────────────────────────
const LiveScoringScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const sc     = useMemo(() => getScStyles(COLORS), [COLORS]);
  const pad    = useMemo(() => getPadStyles(COLORS), [COLORS]);
  const bb     = useMemo(() => getBbStyles(COLORS), [COLORS]);
  const em     = useMemo(() => getEmStyles(COLORS), [COLORS]);
  const ic     = useMemo(() => getIcStyles(COLORS), [COLORS]);
  const extraBtns = useMemo(() => getExtraBtns(COLORS), [COLORS]);

  const { match, battingTeam, bowlingTeam, inningsNumber, target } = route.params;

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

  // Free hit state
  const [isFreeHit, setIsFreeHit] = useState(false);
  const isFreeHitRef = useRef(false);
  useEffect(() => { isFreeHitRef.current = isFreeHit; }, [isFreeHit]);

  // Extra runs modal state
  const [extraModal, setExtraModal] = useState({ visible: false, type: null });

  // Edit ball modal
  const [editBall, setEditBall]   = useState(null);
  const [showEdit, setShowEdit]   = useState(false);

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

  useEffect(() => { initScoring(); }, []);

  // Keep refs in sync
  useEffect(() => { inningsRef.current    = innings;    }, [innings]);
  useEffect(() => { overRef.current       = currentOver;}, [currentOver]);
  useEffect(() => { strikerRef.current    = striker;    }, [striker]);
  useEffect(() => { nonStrikerRef.current = nonStriker; }, [nonStriker]);
  useEffect(() => { bowlerRef.current     = bowler;     }, [bowler]);
  useEffect(() => { legalRef.current      = legalBalls; }, [legalBalls]);
  useEffect(() => { overNumRef.current    = overNumber; }, [overNumber]);
  useEffect(() => { totalRunsRef.current  = totalRuns;  }, [totalRuns]);
  useEffect(() => { totalWktsRef.current  = totalWickets;}, [totalWickets]);

  useEffect(() => {
    const selection = route.params?.batsmanSelection;
    if (!selection?.requestId || processedBatsmanSelectionRef.current === selection.requestId) return;

    processedBatsmanSelectionRef.current = selection.requestId;
    if (selection.type === 'new_batsman') {
      setStriker(selection.striker || null);
      setStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
    } else if (selection.striker && selection.nonStriker) {
      setStriker(selection.striker);
      setNonStriker(selection.nonStriker);
      setStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
      setNonStrikerStats({ runs: 0, balls: 0, fours: 0, sixes: 0 });
    }
    navigation.setParams({ batsmanSelection: null });
  }, [navigation, route.params?.batsmanSelection]);

  useEffect(() => {
    const selection = route.params?.bowlerSelection;
    if (!selection?.requestId || processedBowlerSelectionRef.current === selection.requestId) return;

    processedBowlerSelectionRef.current = selection.requestId;
    if (selection.bowler) {
      setBowler(selection.bowler);
      setBowlerStats({ runs: 0, wickets: 0, maidens: 0, overs: 0 });
    }
    if (selection.resetOver) {
      setOverBalls([]);
      setLegalBalls(0);
      legalRef.current = 0;
    }
    navigation.setParams({ bowlerSelection: null });
  }, [navigation, route.params?.bowlerSelection]);

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
        inningsId: inningsRef.current.id,
        team:      bowlingTeam,
        requestId: uuid.v4(),
        returnScreen: 'LiveScoring',
      });
    }, 300);
    return () => clearTimeout(t);
  }, [striker, nonStriker]);

  // ── Init ───────────────────────────────────────────────
  const initScoring = async () => {
    try {
      const existingInnings = await getMatchInnings(match.id);
      let active = existingInnings.find(i => i.innings_number === inningsNumber && !i.is_completed);

      if (!active) {
        const inningsId = await createInnings({
          match_id:        match.id,
          innings_number:  inningsNumber,
          batting_team_id: battingTeam.id,
          bowling_team_id: bowlingTeam.id,
        });
        active = { id: inningsId, total_runs: 0, total_wickets: 0, extras: 0 };
      }
      setInnings(active);
      setTotalRuns(active.total_runs || 0);
      setTotalWickets(active.total_wickets || 0);

      const existingOver = await getCurrentOver(active.id);
      if (existingOver) {
        setCurrentOver(existingOver);
        setOverNumber(existingOver.over_number);
        setLegalBalls(existingOver.balls_bowled || 0);
      }

      // Load ball history
      const balls = await getBallsWithPlayers(active.id);
      setAllBalls(balls);

      // Load current-over balls for display
      if (existingOver) {
        const ob = balls.filter(b => b.over_id === existingOver.id);
        setOverBalls(ob);
      }

      setLoading(false);

      // Navigate to select batsmen
      setTimeout(() => {
        navigation.navigate('SelectBatsman', {
          inningsId: active.id,
          team: battingTeam,
          requestId: uuid.v4(),
          returnScreen: 'LiveScoring',
          selectionType: 'opening_pair',
        });
      }, 300);
    } catch (err) {
      Alert.alert('Error', 'Failed to init: ' + err.message);
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
        inningsId: inningsRef.current?.id,
        team: bowlingTeam,
        requestId: uuid.v4(),
        returnScreen: 'LiveScoring',
        resetOver: true,
      });
      return null;
    }

    // If over is null → first ever ball, keep same number (e.g. 1).
    // If over.is_completed → a new over is needed, increment.
    const newOverNum = over ? overNumRef.current + 1 : overNumRef.current;
    const overId = await createOver({
      innings_id:  inningsRef.current.id,
      over_number: newOverNum,
      bowler_id:   bwl.id,
    });
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

    // ensureOver may reset legalRef/overNumRef — read AFTER
    const over = await ensureOver();
    if (!over) return;

    // Read AFTER ensureOver so refs reflect the new over if one was just created
    const bwl   = bowlerRef.current;
    const legal = legalRef.current;
    const ovNum = overNumRef.current;

    if (!str || !ns) {
      Alert.alert('Select Batsmen', 'Please select both batsmen first.');
      return;
    }
    if (!bwl) {
      Alert.alert('Select Bowler', 'Please select a bowler first.');
      return;
    }

    // Clear free hit after this ball (it was for THIS delivery)
    if (isFreeHitRef.current) setIsFreeHit(false);

    try {
      const { extraType = null, byeRuns = 0 } = options;
      const isExtra    = !!extraType;
      const isWide     = extraType === 'wide';
      const isNoBall   = extraType === 'no_ball';
      const isBye      = extraType === 'bye';
      const isLegBye   = extraType === 'leg_bye';
      const isValidBall = !isExtra || isBye || isLegBye;
      // 4/6 is credited to batsman on normal balls AND on no-balls
      const isFour     = runsScored === 4 && (!isExtra || isNoBall);
      const isSix      = runsScored === 6 && (!isExtra || isNoBall);
      // Use match-configured penalty values for wide/no-ball
      const widePenalty   = match.wide_value    || 1;
      const noBallPenalty = match.no_ball_value || 1;
      const extraRuns  = isWide ? widePenalty : isNoBall ? noBallPenalty : byeRuns;
      const totalAdded = runsScored + extraRuns;

      const ballId = uuid.v4();
      await saveBall({
        id:              ballId,
        over_id:         over.id,
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

      // Update extras breakdown
      if (isExtra) {
        setExtras(prev => ({ ...prev, [extraType]: (prev[extraType] || 0) + 1 }));
      }

      // Update striker stats — compute synchronously so _swap can use updated value
      let newStrikerStats = strikerStats;
      if (!isWide && !isBye && !isLegBye) {
        newStrikerStats = {
          runs:  strikerStats.runs  + runsScored,
          balls: strikerStats.balls + (isValidBall ? 1 : 0),
          fours: strikerStats.fours + (isFour ? 1 : 0),
          sixes: strikerStats.sixes + (isSix  ? 1 : 0),
        };
      } else if (isValidBall) {
        // Bye/LB: still counts as a ball faced
        newStrikerStats = { ...strikerStats, balls: strikerStats.balls + 1 };
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
        Alert.alert(
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

      // Auto-swap on odd runs (valid delivery) — pass updated stats to avoid stale closure
      if (isValidBall && runsScored % 2 !== 0) _swap(newStrikerStats);

      // Target chased? End innings immediately (2nd innings only)
      if (target && newTotal > target) {
        _endInnings(newTotal, totWkts, inn.id);
        return;
      }

      // Over complete (6 legal balls)
      if (newLegal >= 6) {
        await updateOver(over.id, { is_completed: 1, balls_bowled: 6 });
        await updateInnings(inn.id, { total_overs: ovNum });
        setCurrentOver(null);
        _swap(); // swap at end of over
        setBowlerStats(prev => ({ ...prev, overs: prev.overs + 1 }));

        if (ovNum >= match.overs) {
          _endInnings(newTotal, totWkts, inn.id);
          return;
        }
        // Select new bowler for next over
        navigation.navigate('SelectBowler', {
          inningsId:       inn.id,
          team:            bowlingTeam,
          currentBowlerId: bwl.id,
          requestId:       uuid.v4(),
          returnScreen:    'LiveScoring',
          resetOver:       true,
        });
      }
    } catch (err) {
      Alert.alert('Score Error', err.message);
    }
  };

  // ── Wicket ────────────────────────────────────────────
  const handleWicket = async () => {
    const inn  = inningsRef.current;
    const str  = strikerRef.current;
    const bwl  = bowlerRef.current;
    const ns   = nonStrikerRef.current;
    const legal = legalRef.current;
    const ovNum = overNumRef.current;
    const totRuns = totalRunsRef.current;
    const totWkts = totalWktsRef.current;

    if (!inn || !str || !bwl) {
      Alert.alert('Setup Incomplete', 'Select batsmen and bowler first.');
      return;
    }

    const over = await ensureOver();
    if (!over) return;

    try {
      const ballId = uuid.v4();
      await saveBall({
        id:           ballId,
        over_id:      over.id,
        innings_id:   inn.id,
        match_id:     match.id,
        ball_number:  legal + 1,
        striker_id:   str.id,
        non_striker_id: ns?.id,
        bowler_id:    bwl.id,
        runs_scored:  0,
        is_wicket:    true,
        is_valid_ball: true,
      });

      const newWkts  = totWkts + 1;
      const newLegal = legal + 1;
      setTotalWickets(newWkts);
      setLegalBalls(newLegal);
      setBowlerStats(prev => ({ ...prev, wickets: prev.wickets + 1, runs: prev.runs }));
      setPartnership({ runs: 0, balls: 0 });
      await updateInnings(inn.id, { total_wickets: newWkts });

      const ballDisplay = {
        id: ballId,
        over_id: over.id,
        over_number: ovNum,
        ball_number: newLegal,
        runs_scored: 0,
        extra_runs: 0,
        is_wicket: 1,
        striker_name: str.full_name,
        bowler_name:  bwl.full_name,
      };
      setAllBalls(prev => [...prev, ballDisplay]);
      setOverBalls(prev => [...prev, ballDisplay]);

      // All out
      if (newWkts >= match.players_per_team - 1) {
        _endInnings(totRuns, newWkts, inn.id);
        return;
      }

      // Navigate to Wicket screen (enter dismissal type) then select new batsman
      navigation.navigate('Wicket', {
        inningsId:   inn.id,
        ballId,
        batsman:     str,
        bowler:      bwl,
        totalRuns:   totRuns,
        overAtFall:  `${ovNum}.${newLegal}`,
        requestId:   uuid.v4(),
        returnScreen:'LiveScoring',
      });

      // Over complete after wicket ball
      if (newLegal >= 6) {
        await updateOver(over.id, { is_completed: 1, balls_bowled: 6 });
        setCurrentOver(null);
        _swap();
        if (ovNum >= match.overs) {
          _endInnings(totRuns, newWkts, inn.id);
        }
      }
    } catch (err) {
      Alert.alert('Wicket Error', err.message);
    }
  };

  // ── Swap Strike ────────────────────────────────────────
  // updatedStrikerStats: pass the freshly-computed striker stats when calling
  // right after setStrikerStats() to avoid reading stale state closure.
  const _swap = (updatedStrikerStats) => {
    const sStats = updatedStrikerStats !== undefined ? updatedStrikerStats : strikerStats;
    setStriker(prev => {
      const ns = nonStrikerRef.current;
      setNonStriker(prev);
      setStrikerStats(nonStrikerStats);
      setNonStrikerStats(sStats);
      return ns;
    });
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
    Alert.alert('Undo Last Ball', 'Remove the last ball recorded?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo', style: 'destructive', onPress: async () => {
        try {
          const last = await getLastBall(inn.id);
          if (!last) { Alert.alert('Nothing to undo'); return; }
          await deleteBall(last, inn.id);

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
            runs:  ballsSinceWicket.reduce((s, b) => s + (b.runs_scored || 0), 0),
            balls: ballsSinceWicket.filter(b => b.is_valid_ball === 1).length,
          });

          // ── Recompute extras breakdown ───────────────────
          const eb = { wide: 0, no_ball: 0, bye: 0, leg_bye: 0 };
          refreshed.forEach(b => { if (b.extra_type) eb[b.extra_type] = (eb[b.extra_type] || 0) + 1; });
          setExtras(eb);

        } catch (e) { Alert.alert('Undo Failed', e.message); }
      }},
    ]);
  };

  // ── End Innings ────────────────────────────────────────
  const _endInnings = async (runs, wkts, inningsId) => {
    try {
      await updateInnings(inningsId || innings?.id, { is_completed: 1 });
      setShowInningsComplete(true);
    } catch (e) {
      console.error('endInnings:', e);
    }
  };

  const handleStartNextInnings = () => {
    setShowInningsComplete(false);
    navigation.replace('LiveScoring', {
      match,
      battingTeam:   bowlingTeam,
      bowlingTeam:   battingTeam,
      inningsNumber: 2,
      target:        totalRuns + 1,
    });
  };

  const handleEndMatch = () => {
    setShowInningsComplete(false);
    navigation.replace('MatchSummary', { match, inningsId: innings?.id });
  };

  // ── Save edited ball ───────────────────────────────────
  const handleSaveEdit = async (changes) => {
    if (!editBall || !innings) return;
    try {
      // Simple approach: delete old ball record and re-insert with new values
      await deleteBall(editBall, innings.id);
      await saveBall({
        id:              editBall.id,
        over_id:         editBall.over_id,
        innings_id:      innings.id,
        match_id:        match.id,
        ball_number:     editBall.ball_number,
        striker_id:      editBall.striker_id,
        non_striker_id:  editBall.non_striker_id,
        bowler_id:       editBall.bowler_id,
        ...changes,
      });
      // Refresh from DB
      const refreshed = await getBallsWithPlayers(innings.id);
      setAllBalls(refreshed);
      const currentInnings = await getInnings(innings.id);
      setTotalRuns(currentInnings.total_runs || 0);
      setTotalWickets(currentInnings.total_wickets || 0);
      setShowEdit(false);
      setEditBall(null);
    } catch (e) {
      Alert.alert('Edit Failed', e.message);
    }
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

  // ── Change Bowler (only before first ball of an over) ──
  const handleChangeBowler = () => {
    if (!inningsRef.current) return;
    navigation.navigate('SelectBowler', {
      inningsId: inningsRef.current.id,
      team:      bowlingTeam,
      requestId: uuid.v4(),
      returnScreen: 'LiveScoring',
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

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        {/* Left — close */}
        <TouchableOpacity onPress={() => Alert.alert('Exit Scoring', 'Return to match list? Scoring is saved.', [
          { text: 'Stay', style: 'cancel' },
          { text: 'Exit', onPress: () => navigation.goBack() },
        ])} style={styles.headerSide}>
          <Icon name="close" size={22} color={COLORS.gray} />
        </TouchableOpacity>

        {/* Centre — score */}
        <View style={styles.headerCenter}>
          <Text style={styles.headerScore}>{totalRuns}/{totalWickets}</Text>
          <Text style={styles.headerOvers}>Ov {formatOvers()} / {match.overs}</Text>
        </View>

        {/* Right — scorecard icon */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Scorecard', { inningsId: innings?.id, match })}
          style={styles.headerSide}
        >
          <Icon name="view-list" size={22} color={COLORS.cyan} />
        </TouchableOpacity>
      </View>

      {/* Batting team row */}
      <View style={styles.subHeader}>
        <View style={[styles.teamPill, { borderColor: COLORS.gold }]}>
          <Text style={styles.teamPillTxt}>{battingTeam.team_name}</Text>
        </View>
        <Text style={styles.vsLabel}>vs</Text>
        <View style={styles.teamPill}>
          <Text style={styles.teamPillTxt}>{bowlingTeam.team_name}</Text>
        </View>
        {/* Target pill — pushed to the far right of the same row */}
        {target ? (
          <View style={styles.targetPill}>
            <Text style={styles.targetLbl}>Target {target}  Need {Math.max(0, target - totalRuns)}</Text>
          </View>
        ) : null}
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

      {/* ── Scorecard Tab ── */}
      {activeTab === 'scorecard' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

          {/* Summary bar */}
          <View style={sc.summaryBar}>
            {[
              { label: 'OVERS',   val: formatOvers() },
              { label: 'RUNS',    val: totalRuns      },
              { label: 'WICKETS', val: totalWickets   },
              { label: 'RR',      val: runRate()      },
            ].map(s => (
              <View key={s.label} style={sc.summaryItem}>
                <Text style={sc.summaryVal}>{s.val}</Text>
                <Text style={sc.summaryLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

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
                <Text style={sc.colH}>SR</Text>
              </View>
            </View>
            <BatterRow
              batter={striker ? { ...striker, ...strikerStats } : null}
              isStriker
              COLORS={COLORS}
              sc={sc}
            />
            <BatterRow
              batter={nonStriker ? { ...nonStriker, ...nonStrikerStats } : null}
              isStriker={false}
              COLORS={COLORS}
              sc={sc}
            />
            {/* Partnership */}
            {striker && nonStriker && (
              <View style={sc.partnerRow}>
                <Text style={sc.partnerTxt}>
                  Partnership: {partnership.runs} runs ({partnership.balls} balls)
                </Text>
                <TouchableOpacity onPress={_swap}>
                  <Icon name="swap-horizontal" size={16} color={COLORS.cyan} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Extras */}
          <View style={sc.extrasRow}>
            <Text style={sc.extrasLabel}>Extras</Text>
            <Text style={sc.extrasTxt}>
              nb {extras.no_ball}, wd {extras.wide}, b {extras.bye}, lb {extras.leg_bye}
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
                <Text style={sc.colH}>Eco</Text>
              </View>
            </View>
            <BowlerRow bowler={bowler ? { ...bowler, ...bowlerStats } : null} legalBalls={legalBalls} COLORS={COLORS} sc={sc} />
          </View>

          {/* Current over dots */}
          <View style={sc.dotsRow}>
            {overBalls.map((b, i) => <BallDot key={i} ball={b} onPress={(ball) => { setEditBall(ball); setShowEdit(true); }} COLORS={COLORS} sc={sc} />)}
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
            COLORS={COLORS}
            pad={pad}
            extraBtns={extraBtns}
          />

          {/* End Innings button */}
          <TouchableOpacity
            style={sc.endBtn}
            onPress={() => Alert.alert('Close Innings', 'End this innings?', [
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
          onEditBall={(ball) => { setEditBall(ball); setShowEdit(true); }}
          COLORS={COLORS}
          bb={bb}
        />
      )}

      {/* ── Edit Ball Modal ── */}
      <EditBallModal
        visible={showEdit}
        ball={editBall}
        striker={striker}
        nonStriker={nonStriker}
        bowler={bowler}
        onSave={handleSaveEdit}
        onCancel={() => { setShowEdit(false); setEditBall(null); }}
        COLORS={COLORS}
        em={em}
      />

      {/* ── Innings Complete Modal ── */}
      <InningsCompleteModal
        visible={showInningsComplete}
        battingTeam={battingTeam}
        score={totalRuns}
        wickets={totalWickets}
        isLastInnings={inningsNumber === 2}
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
  headerCenter:    { alignItems: 'center', flex: 1 },
  headerScore:     { color: COLORS.white, fontSize: 28, fontWeight: '900' },
  headerOvers:     { color: COLORS.gray, fontSize: 12 },
  // Target block — right side of header in 2nd innings
  targetBox:       { width: 72, alignItems: 'center', backgroundColor: COLORS.warning + '22', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 6, borderWidth: 1, borderColor: COLORS.warning },
  targetBoxLabel:  { color: COLORS.warning, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  targetBoxNum:    { color: COLORS.white, fontSize: 20, fontWeight: '900', lineHeight: 24 },
  targetBoxNeed:   { color: COLORS.warning, fontSize: 9, fontWeight: '700' },
  // Target pill — far right of subHeader (2nd innings only)
  targetPill:      { marginLeft: 'auto', backgroundColor: COLORS.warning + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.warning },
  targetLbl:       { color: COLORS.warning, fontSize: 10, fontWeight: '800' },
  subHeader:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 8, gap: 8, flexWrap: 'nowrap' },
  teamPill:        { backgroundColor: COLORS.card, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.cardBorder },
  teamPillTxt:     { color: COLORS.white, fontSize: 11, fontWeight: '600' },
  vsLabel:         { color: COLORS.gray, fontSize: 11 },
  tabRow:       { flexDirection: 'row', marginHorizontal: 14, marginBottom: 6, gap: 8 },
  tab:          { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder },
  tabActive:    { backgroundColor: COLORS.royalBlue, borderColor: COLORS.cyan },
  tabTxt:       { color: COLORS.gray, fontWeight: '600', fontSize: 13 },
  tabTxtActive: { color: COLORS.white },
});

// Scorecard tab styles
const getScStyles = (COLORS) => StyleSheet.create({
  summaryBar:    { flexDirection: 'row', backgroundColor: COLORS.card, marginHorizontal: 12, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  summaryItem:   { flex: 1, alignItems: 'center' },
  summaryVal:    { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  summaryLabel:  { color: COLORS.gray, fontSize: 9, marginTop: 2 },
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
  extrasLabel:   { color: COLORS.gray, fontSize: 11, fontWeight: '700', marginRight: 12 },
  extrasTxt:     { color: COLORS.gray, fontSize: 11 },
  dotsRow:       { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 10 },
  dot:           { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dotTxt:        { color: COLORS.white, fontWeight: '800', fontSize: 12 },
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
  wicketTxt: { color: COLORS.white, fontWeight: '900', fontSize: 15, letterSpacing: 2 },
  swapBtn:   { flex: 1, height: 50, backgroundColor: COLORS.darkGray, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.cardBorder, gap: 2 },
  swapTxt:   { color: COLORS.gray, fontSize: 10, fontWeight: '600' },
});

// Ball-by-ball tab styles
const getBbStyles = (COLORS) => StyleSheet.create({
  overBlock:   { marginBottom: 14 },
  overLabel:   { color: COLORS.gold, fontWeight: '700', fontSize: 12, letterSpacing: 2, marginBottom: 8 },
  ballRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 10, marginBottom: 4, gap: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  ballDot:     { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ballDotTxt:  { color: COLORS.white, fontWeight: '800', fontSize: 11 },
  ballDesc:    { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  ballSub:     { color: COLORS.gray, fontSize: 11, marginTop: 1 },
  ballRuns:    { color: COLORS.white, fontWeight: '800', fontSize: 14 },
});

// Edit ball modal styles
const getEmStyles = (COLORS) => StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: COLORS.navy, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  title:       { color: COLORS.white, fontWeight: '800', fontSize: 18, textAlign: 'center', marginBottom: 16 },
  infoRow:     { flexDirection: 'row', gap: 12, marginBottom: 16 },
  infoBox:     { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  infoLabel:   { color: COLORS.gray, fontSize: 10, marginBottom: 4 },
  infoVal:     { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  label:       { color: COLORS.gray, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  typeRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeBtn:     { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  typeBtnActive: { backgroundColor: COLORS.royalBlue, borderColor: COLORS.cyan },
  typeTxt:     { color: COLORS.gray, fontWeight: '700', fontSize: 12 },
  stepper:     { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 20, justifyContent: 'center' },
  stepBtn:     { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center' },
  stepTxt:     { color: COLORS.white, fontSize: 22, fontWeight: '900' },
  stepVal:     { color: COLORS.white, fontWeight: '900', fontSize: 32, minWidth: 50, textAlign: 'center' },
  actionRow:   { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn:   { flex: 1, height: 50, backgroundColor: COLORS.darkGray, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelTxt:   { color: COLORS.gray, fontWeight: '700', fontSize: 14 },
  saveBtn:     { flex: 1, height: 50, backgroundColor: COLORS.royalBlue, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveTxt:     { color: COLORS.white, fontWeight: '800', fontSize: 14 },
});

// Innings complete modal
const getIcStyles = (COLORS) => StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:      { backgroundColor: COLORS.navy, borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: COLORS.gold },
  title:     { color: COLORS.white, fontSize: 20, fontWeight: '800', marginBottom: 8 },
  team:      { color: COLORS.cyan, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  score:     { color: COLORS.gold, fontSize: 48, fontWeight: '900', marginBottom: 24 },
  nextBtn:   { borderRadius: 14, overflow: 'hidden', width: '100%' },
  nextGrad:  { height: 56, alignItems: 'center', justifyContent: 'center' },
  nextTxt:   { color: COLORS.white, fontWeight: '900', fontSize: 16 },
});

export default LiveScoringScreen;
