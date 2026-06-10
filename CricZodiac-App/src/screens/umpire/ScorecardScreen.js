// ============================================================
// CricZodiac — Scorecard Screen
//
// Two entry points:
//   1. Admin flow  → route.params.matchId  (from AllMatchesScreen)
//      Uses MATCHES_FULL_SCORECARD, shows innings tabs
//   2. Umpire flow → route.params.inningsId (from LiveScoringScreen)
//      Uses MATCHES_SCORECARD + SQLite fallback, single innings
// ============================================================

import React, {
  useState, useCallback, useMemo, useEffect,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { getBattingScorecard, getBowlingScorecard, getInnings, getInningsExtras } from '../../database/queries/matchQueries';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

// ── helpers ───────────────────────────────────────────────
const fmtOvers = (overs) => {
  const full  = Math.floor(overs);
  const balls = Math.round((overs - full) * 10);
  return `${full}.${balls}`;
};

// ── Extras card (always shown below any active table) ─────
const EXTRA_TYPES = [
  { abbr: 'W',  label: 'Wides',    key: 'wides',    color: '#f59e0b' },
  { abbr: 'NB', label: 'No Balls', key: 'no_balls', color: '#ef4444' },
  { abbr: 'B',  label: 'Byes',     key: 'byes',     color: '#60a5fa' },
  { abbr: 'LB', label: 'Leg Byes', key: 'leg_byes', color: '#a78bfa' },
];

const ExtrasCard = ({ extras, COLORS, styles }) => {
  if (!extras) return null;
  const total = EXTRA_TYPES.reduce((sum, t) => sum + (extras[t.key] || 0), 0);
  return (
    <View style={styles.extrasCard}>
      {/* Header row */}
      <View style={styles.extrasCardHeader}>
        <View style={styles.extrasCardHeaderLeft}>
          <Icon name="plus-circle-outline" size={13} color={COLORS.gold} />
          <Text style={styles.extrasCardTitle}>EXTRAS</Text>
        </View>
        <Text style={styles.extrasCardTotal}>{total}</Text>
      </View>

      {/* Chips row */}
      <View style={styles.extrasChipsRow}>
        {EXTRA_TYPES.map(({ abbr, label, key, color }) => {
          const val = extras[key] || 0;
          return (
            <View key={abbr} style={[styles.extrasChip, { borderColor: color + '55' }]}>
              <Text style={[styles.extrasChipAbbr, { color }]}>{abbr}</Text>
              <Text style={[styles.extrasChipVal, val > 0 && { color }]}>{val}</Text>
              <Text style={styles.extrasChipSubLabel}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// ── Batting table ─────────────────────────────────────────
const BattingTable = ({ rows, COLORS, styles }) => (
  <View style={styles.tableCard}>
    <View style={styles.tableHeader}>
      <Text style={[styles.th, { flex: 3, textAlign: 'left' }]}>Batsman</Text>
      <Text style={styles.th}>R</Text>
      <Text style={styles.th}>B</Text>
      <Text style={styles.th}>0s</Text>
      <Text style={styles.th}>4s</Text>
      <Text style={styles.th}>6s</Text>
      <Text style={[styles.th, { marginLeft: 4 }]}>SR</Text>
    </View>
    {rows.length === 0 ? (
      <Text style={styles.emptyText}>No batting data available</Text>
    ) : (
      rows.map((b, i) => {
        const rs = b.runs_scored || 0;
        const bf = b.balls_faced || 0;
        const sr = bf > 0 ? ((rs / bf) * 100).toFixed(1) : '0.0';
        return (
          <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
            <View style={{ flex: 3 }}>
              <Text style={styles.playerName} numberOfLines={1}>{b.full_name}</Text>
              <Text style={styles.dismissal}>
                {b.is_out
                  ? (b.dismissal_type
                      ? b.dismissal_type.replace(/_/g, ' ')
                        + (b.bowler_name ? ` · b. ${b.bowler_name}` : '')
                      : 'out')
                  : 'not out'}
              </Text>
            </View>
            <Text style={[styles.td, rs >= 50 && styles.tdGold]}>{rs}</Text>
            <Text style={styles.td}>{bf}</Text>
            <Text style={styles.td}>{b.dots || 0}</Text>
            <Text style={styles.td}>{b.fours || 0}</Text>
            <Text style={styles.td}>{b.sixes || 0}</Text>
            <Text style={[styles.td, { marginLeft: 4 }]}>{sr}</Text>
          </View>
        );
      })
    )}
  </View>
);

// ── Bowling table ─────────────────────────────────────────
const BowlingTable = ({ rows, COLORS, styles }) => (
  <View style={styles.tableCard}>
    <View style={styles.tableHeader}>
      <Text style={[styles.th, { flex: 3, textAlign: 'left' }]}>Bowler</Text>
      <Text style={styles.th}>O</Text>
      <Text style={styles.th}>D</Text>
      <Text style={styles.th}>M</Text>
      <Text style={styles.th}>R</Text>
      <Text style={styles.th}>W</Text>
      <Text style={[styles.th, { marginLeft: 4 }]}>Eco</Text>
    </View>
    {rows.length === 0 ? (
      <Text style={styles.emptyText}>No bowling data available</Text>
    ) : (
      rows.map((b, i) => {
        const bb  = b.balls_bowled  || 0;
        const rc  = b.runs_conceded || 0;
        const ov  = `${Math.floor(bb / 6)}.${bb % 6}`;
        const eco = bb > 0 ? ((rc / bb) * 6).toFixed(2) : '0.00';
        return (
          <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
            <Text style={[styles.playerName, { flex: 3 }]} numberOfLines={1}>{b.full_name}</Text>
            <Text style={styles.td}>{ov}</Text>
            <Text style={styles.td}>{b.dots || 0}</Text>
            <Text style={styles.td}>{b.maidens || 0}</Text>
            <Text style={styles.td}>{rc}</Text>
            <Text style={[styles.td, (b.wickets || 0) >= 3 && styles.tdGold]}>{b.wickets || 0}</Text>
            <Text style={[styles.td, { marginLeft: 4 }]}>{eco}</Text>
          </View>
        );
      })
    )}
  </View>
);

// ── Score summary strip ───────────────────────────────────
const ScoreSummary = ({ innings, COLORS, styles }) => {
  if (!innings) return null;
  return (
    <View style={styles.summaryStrip}>
      {innings.batting_team_name ? (
        <Text style={styles.summaryTeam}>{innings.batting_team_name}</Text>
      ) : null}
      <Text style={styles.summaryScore}>
        {innings.total_runs ?? 0}/{innings.total_wickets ?? 0}
      </Text>
      <Text style={styles.summaryOvers}>
        ({fmtOvers(innings.total_overs || 0)} ov)
      </Text>
    </View>
  );
};

// ── Main Screen ───────────────────────────────────────────
const ScorecardScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  // ── Detect entry flow ────────────────────────────────
  const { matchId, inningsId, match, liveOverNumber, liveLegalBalls } = route.params || {};
  const isAdminFlow = !!matchId && !inningsId;

  // ── State ────────────────────────────────────────────
  // Admin flow: array of { innings, batting, bowling, extras }
  const [scorecards,  setScorecards]  = useState([]);
  // Umpire flow: single arrays
  const [batting,     setBatting]     = useState([]);
  const [bowling,     setBowling]     = useState([]);
  const [innings,     setInnings]     = useState(null);
  const [matchInfo,   setMatchInfo]   = useState(null);

  const [extras,     setExtras]      = useState(null); // umpire flow extras
  const [inningsTab,  setInningsTab]  = useState(0);   // 0 = 1st, 1 = 2nd
  const [scoreTab,    setScoreTab]    = useState('batting');
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  // ── Load ─────────────────────────────────────────────
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      if (isAdminFlow) {
        // ── Admin: full match scorecard from API ─────
        const res = await ApiService.get(
          `${API_ENDPOINTS.MATCHES_FULL_SCORECARD}?match_id=${encodeURIComponent(matchId)}`
        );
        if (res?.success) {
          setScorecards(res.scorecards || []);
          setMatchInfo(res.match || null);
        }
      } else {
        // ── Umpire: single innings (SQLite first) ────
        const [bat, bowl, inn, ext] = await Promise.all([
          getBattingScorecard(inningsId),
          getBowlingScorecard(inningsId),
          getInnings(inningsId),
          getInningsExtras(inningsId),
        ]);

        if (bat?.length || bowl?.length) {
          setBatting(bat || []);
          setBowling(bowl || []);
          setInnings(inn || null);
          setExtras(ext || null);
          // Background API refresh (no extras refresh — SQLite is source of truth here)
          fetchSingleFromApi(inningsId, match?.id).then(api => {
            if (api) {
              if (api.batting?.length) setBatting(api.batting);
              if (api.bowling?.length) setBowling(api.bowling);
              if (api.innings)         setInnings(api.innings);
            }
          }).catch(() => {});
          return;
        }

        const api = await fetchSingleFromApi(inningsId, match?.id);
        if (api) {
          setBatting(api.batting || []);
          setBowling(api.bowling || []);
          setInnings(api.innings || inn || null);
        } else {
          setInnings(inn || null);
        }
        setExtras(ext || null);
      }
    } catch (e) {
      console.warn('[Scorecard] load error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, [isAdminFlow, matchId, inningsId]);

  const fetchSingleFromApi = async (localInningsId, localMatchId) => {
    try {
      const params = [`innings_id=${encodeURIComponent(localInningsId)}`];
      if (localMatchId) params.push(`match_id=${encodeURIComponent(localMatchId)}`);
      const res = await ApiService.get(`${API_ENDPOINTS.MATCHES_SCORECARD}?${params.join('&')}`);
      const inn = res?.innings || null;
      const bat = res?.batting || [];
      const bwl = res?.bowling || [];
      if (inn || bat.length || bwl.length) return { innings: inn, batting: bat, bowling: bwl };
    } catch (e) {
      console.warn('[Scorecard] API fetch:', e.message);
    }
    return null;
  };

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  // ── Derived per-innings data ──────────────────────────
  // Use ?? (not ||) so an all-zero extras object still passes through
  const activeCard    = scorecards[inningsTab] ?? null;
  const activeExtras  = isAdminFlow ? (activeCard?.extras ?? null) : extras;

  // ── Umpire live overs string ─────────────────────────
  const liveOversStr = (liveOverNumber != null && liveLegalBalls != null)
    ? `${liveOverNumber - 1}.${liveLegalBalls}`
    : null;

  // ── Result banner (admin flow) ────────────────────────
  const resultText = matchInfo?.result_text_full || matchInfo?.result_text || null;
  const winnerName = matchInfo?.winner_team_name || null;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={styles.title}>SCORECARD</Text>
          {isAdminFlow && matchInfo ? (
            <Text style={styles.matchTeams} numberOfLines={1}>
              {matchInfo.team_a_name} vs {matchInfo.team_b_name}
            </Text>
          ) : null}
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* ── Result banner (admin) ── */}
      {isAdminFlow && (winnerName || resultText) ? (
        <View style={styles.resultBanner}>
          <Icon name="trophy" size={14} color={COLORS.gold} />
          <Text style={styles.resultText} numberOfLines={2}>
            {resultText || `${winnerName} won`}
          </Text>
        </View>
      ) : null}

      {/* ── Umpire single innings summary ── */}
      {!isAdminFlow && innings ? (
        <View style={styles.summaryStrip}>
          <Text style={styles.summaryScore}>
            {innings.total_runs ?? 0}/{innings.total_wickets ?? 0}
          </Text>
          <Text style={styles.summaryOvers}>
            ({liveOversStr || fmtOvers(innings.total_overs || 0)} overs)
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 36 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.gold}
              colors={[COLORS.gold]}
            />
          }
        >
          {/* ── Innings tabs (admin: switch 1st / 2nd innings) ── */}
          {isAdminFlow && scorecards.length > 0 ? (
            <View style={styles.inningsTabs}>
              {scorecards.map((sc, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.innTab, inningsTab === idx && styles.innTabActive]}
                  onPress={() => setInningsTab(idx)}
                >
                  <Text style={[styles.innTabText, inningsTab === idx && styles.innTabTextActive]}>
                    {idx === 0 ? '1st Inn' : '2nd Inn'}
                  </Text>
                  {sc.innings?.total_runs != null ? (
                    <Text style={[styles.innScore, inningsTab === idx && { color: COLORS.gold }]}>
                      {sc.innings.total_runs}/{sc.innings.total_wickets}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {/* ── Innings summary strip ── */}
          {isAdminFlow && activeCard?.innings ? (
            <ScoreSummary innings={activeCard.innings} COLORS={COLORS} styles={styles} />
          ) : null}

          {/* ── No innings found ── */}
          {isAdminFlow && scorecards.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, gap: 10 }}>
              <Icon name="cricket" size={52} color={COLORS.cardBorder} />
              <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 16 }}>
                No scorecard data yet
              </Text>
              <Text style={{ color: COLORS.gray, fontSize: 13, textAlign: 'center', paddingHorizontal: 40 }}>
                Innings have not been started for this match.
              </Text>
            </View>
          ) : null}

          {/* ── Batting / Bowling sub-tabs ── */}
          {(isAdminFlow ? scorecards.length > 0 : true) ? (
            <>
              <View style={styles.subTabs}>
                {['batting', 'bowling'].map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.subTab, scoreTab === t && styles.subTabActive]}
                    onPress={() => setScoreTab(t)}
                  >
                    <Icon
                      name={t === 'batting' ? 'cricket' : 'bullseye-arrow'}
                      size={14}
                      color={scoreTab === t ? COLORS.white : COLORS.gray}
                    />
                    <Text style={[styles.subTabText, scoreTab === t && styles.subTabTextActive]}>
                      {t.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {scoreTab === 'batting' ? (
                <BattingTable
                  rows={isAdminFlow ? (activeCard?.batting || []) : batting}
                  COLORS={COLORS}
                  styles={styles}
                />
              ) : (
                <BowlingTable
                  rows={isAdminFlow ? (activeCard?.bowling || []) : bowling}
                  COLORS={COLORS}
                  styles={styles}
                />
              )}

              {/* ── Extras card — always visible below batting OR bowling ── */}
              <ExtrasCard extras={activeExtras} COLORS={COLORS} styles={styles} />
            </>
          ) : null}
        </ScrollView>
      )}
    </LinearGradient>
  );
};

// ── Styles ────────────────────────────────────────────────
const getStyles = (COLORS) => StyleSheet.create({
  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  title:      { color: COLORS.white, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  matchTeams: { color: COLORS.gray, fontSize: 11, marginTop: 2 },

  resultBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: COLORS.gold + '18',
    borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: COLORS.gold + '44',
  },
  resultText: { color: COLORS.gold, fontSize: 13, fontWeight: '700', flex: 1 },

  summaryStrip: {
    alignItems: 'center', paddingVertical: 12, paddingBottom: 4,
  },
  summaryTeam:  { color: COLORS.gray, fontSize: 12, marginBottom: 2 },
  summaryScore: { color: COLORS.white, fontSize: 34, fontWeight: '900' },
  summaryOvers: { color: COLORS.gray, fontSize: 13 },

  // Innings switcher tabs
  inningsTabs: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, gap: 10,
  },
  innTab: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    gap: 2,
  },
  innTabActive: {
    backgroundColor: COLORS.royalBlue + '33',
    borderColor: COLORS.royalBlue,
  },
  innTabText:       { color: COLORS.gray, fontWeight: '700', fontSize: 13 },
  innTabTextActive: { color: COLORS.white },
  innScore:         { color: COLORS.gray, fontSize: 11, fontWeight: '700' },

  // Batting/Bowling sub-tabs
  subTabs: {
    flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 12,
  },
  subTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10,
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  subTabActive:     { backgroundColor: COLORS.royalBlue, borderColor: COLORS.gold },
  subTabText:       { color: COLORS.gray, fontWeight: '700', fontSize: 13 },
  subTabTextActive: { color: COLORS.white },

  // Table
  tableCard: {
    marginHorizontal: 16, backgroundColor: COLORS.card,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  tableHeader: {
    flexDirection: 'row', backgroundColor: COLORS.darkGray,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  th: {
    color: COLORS.gold, fontWeight: '700', fontSize: 12,
    width: 36, textAlign: 'center',
  },
  tableRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  tableRowAlt: { backgroundColor: 'rgba(255,255,255,0.02)' },
  playerName:  { color: COLORS.white, fontWeight: '600', fontSize: 13 },
  dismissal:   { color: COLORS.gray, fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  td:          { color: COLORS.lightGray, fontSize: 13, width: 36, textAlign: 'center' },
  tdGold:      { color: COLORS.gold, fontWeight: '800' },
  emptyText:   { color: COLORS.gray, textAlign: 'center', paddingVertical: 28, fontSize: 13 },

  // Extras card
  extrasCard: {
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: COLORS.card,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  extrasCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.darkGray,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  extrasCardHeaderLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  extrasCardTitle: {
    color: COLORS.gold, fontWeight: '800', fontSize: 11, letterSpacing: 1.5,
  },
  extrasCardTotal: {
    color: COLORS.white, fontWeight: '900', fontSize: 20,
  },
  extrasChipsRow: {
    flexDirection: 'row', padding: 10, gap: 8,
  },
  extrasChip: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, borderWidth: 1,
  },
  extrasChipAbbr: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.5,
  },
  extrasChipVal: {
    color: COLORS.white, fontSize: 20, fontWeight: '900', lineHeight: 24,
  },
  extrasChipSubLabel: {
    color: COLORS.gray, fontSize: 9, fontWeight: '600', letterSpacing: 0.3,
  },
});

export default ScorecardScreen;
