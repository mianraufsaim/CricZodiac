// ============================================================
// CricZodiac — Match Summary / Result Screen
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import {
  getMatch, getMatchInnings, saveMatchResult, getMatchTeams, getMatchResult,
  upsertInningsFromServer, upsertTeamsFromServer, upsertMatchResultFromServer,
  upsertTeamPlayersFromServer,
} from '../../database/queries/matchQueries';
import { queryFirstRow } from '../../database/DatabaseHelper';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

// ── Pure winner-determination helper (no state refs) ─────
const computeWinner = (sortedInnings, teamsArr, ppt = 6) => {
  if (!sortedInnings || sortedInnings.length < 2) return null;
  const [inn1, inn2] = sortedInnings;
  if (!inn1 || !inn2) return null;
  const team1 = teamsArr.find(t => t.id === inn1.batting_team_id) || { team_name: 'Team A', id: inn1.batting_team_id };
  const team2 = teamsArr.find(t => t.id === inn2.batting_team_id) || { team_name: 'Team B', id: inn2.batting_team_id };
  const r1 = inn1.total_runs || 0;
  const r2 = inn2.total_runs || 0;
  if (r1 > r2) {
    const margin = r1 - r2;
    return { winner: team1, loser: team2, margin: `${margin} run${margin !== 1 ? 's' : ''}`, type: 'runs' };
  } else if (r2 > r1) {
    const wktsLeft = Math.max(0, (ppt - 1) - (inn2.total_wickets || 0));
    return { winner: team2, loser: team1, margin: `${wktsLeft} wicket${wktsLeft !== 1 ? 's' : ''}`, type: 'wickets' };
  }
  return { winner: null, loser: null, margin: 'Tied', type: 'tie' };
};

const MatchSummaryScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { match: matchParam } = route.params || {};

  const [match,    setMatch]    = useState(null);
  const [innings,  setInnings]  = useState([]);
  const [teams,    setTeams]    = useState([]);
  const [result,   setResult]   = useState(null);   // saved match_results row
  const [potmName, setPotmName] = useState(null);   // POTM player name (if any)
  const [loadErr,  setLoadErr]  = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const matchId = matchParam?.id;
      if (!matchId) {
        setLoadErr('Match data missing — please go back and try again.');
        setLoading(false);
        return;
      }

      // ── 1. Load everything from local SQLite ───────────────────────────
      let [m, inns, tms, existingResult] = await Promise.all([
        getMatch(matchId),
        getMatchInnings(matchId),
        getMatchTeams(matchId),
        getMatchResult(matchId),
      ]);

      // ── 2. API fallback: Teams ─────────────────────────────────────────
      if (!tms?.length) {
        try {
          const res = await ApiService.get(
            `${API_ENDPOINTS.TEAMS_LIST}?match_id=${encodeURIComponent(matchId)}`
          );
          const serverTeams = res?.teams || res?.data?.teams || [];
          if (serverTeams.length) {
            await upsertTeamsFromServer(serverTeams, matchId);
            tms = await getMatchTeams(matchId);
          }
        } catch (e) {
          console.warn('[MatchSummary] teams API fallback:', e.message);
        }
      }

      // ── 3. API fallback: Innings ───────────────────────────────────────
      if (!inns?.length) {
        try {
          const res = await ApiService.get(
            `${API_ENDPOINTS.MATCHES_SCORE}?match_id=${encodeURIComponent(matchId)}`
          );
          const serverInnings = res?.innings || res?.data?.innings || [];
          if (serverInnings.length) {
            await upsertInningsFromServer(serverInnings, matchId);
            inns = await getMatchInnings(matchId);
          }
        } catch (e) {
          console.warn('[MatchSummary] innings API fallback:', e.message);
        }
      }

      // ── 4. API fallback: Match result ──────────────────────────────────
      if (!existingResult) {
        try {
          const res = await ApiService.get(
            `${API_ENDPOINTS.MATCHES_RESULT}?match_id=${encodeURIComponent(matchId)}`
          );
          const sr = res?.result || res?.data?.result || res?.data || null;
          if (sr && (sr.result_text || sr.winner_team_id != null)) {
            await upsertMatchResultFromServer(sr, matchId);
            existingResult = await getMatchResult(matchId);
          }
        } catch (e) {
          console.warn('[MatchSummary] result API fallback:', e.message);
        }
      }

      // ── 5. Background: fetch team players so names resolve ─────────────
      if (tms?.length) {
        Promise.all(
          (tms || []).map(team => {
            const q = [`team_id=${encodeURIComponent(team.id)}`];
            if (team.match_id) q.push(`match_id=${encodeURIComponent(team.match_id)}`);
            return ApiService.get(`${API_ENDPOINTS.TEAMS_PLAYERS}?${q.join('&')}`)
              .then(res => {
                const sp = res?.players || res?.data?.players || [];
                if (sp.length) return upsertTeamPlayersFromServer(sp, team.id);
              })
              .catch(() => {});
          })
        ).catch(() => {});
      }

      // ── 6. De-duplicate innings ────────────────────────────────────────
      const dedup = new Map();
      for (const inn of (inns || [])) {
        const n      = inn.innings_number;
        const score  = (inn.total_runs || 0) + (inn.total_overs || 0) + (inn.total_wickets || 0);
        const prev   = dedup.get(n);
        const pScore = prev
          ? (prev.total_runs || 0) + (prev.total_overs || 0) + (prev.total_wickets || 0)
          : -1;
        if (score > pScore) dedup.set(n, inn);
      }
      const validInnings = [...dedup.values()]
        .filter(inn => (inn.total_overs || 0) > 0 || (inn.total_runs || 0) > 0 || (inn.total_wickets || 0) > 0)
        .sort((a, b) => a.innings_number - b.innings_number);

      // ── 7. Auto-pick POTM: top scorer across all innings ──────────────
      let autoPotmId   = null;
      let autoPotmName = null;
      try {
        const topScorer = await queryFirstRow(
          `SELECT bs.player_id,
                  bs.runs_scored,
                  COALESCE(u.name, p.full_name) AS display_name
             FROM batting_scorecards bs
             JOIN innings  i ON i.id  = bs.innings_id
             JOIN players  p ON p.id  = bs.player_id
             LEFT JOIN users u ON u.id = p.user_id
            WHERE i.match_id = ?
            ORDER BY bs.runs_scored DESC, bs.balls_faced ASC
            LIMIT 1`,
          [matchId]
        );
        if (topScorer?.player_id && topScorer?.display_name) {
          autoPotmId   = topScorer.player_id;
          autoPotmName = topScorer.display_name.trim();
        }
      } catch (_) {}

      // ── 8. Auto-finalize: save result if complete innings but no result ─
      let finalResult = existingResult;
      if (!existingResult && validInnings.length >= 2 && (tms || []).length >= 2) {
        try {
          const ppt    = m?.players_per_team || matchParam?.players_per_team || 6;
          const winner = computeWinner(validInnings, tms, ppt);
          if (winner) {
            const [inn1, inn2] = validInnings;
            await saveMatchResult({
              match_id:        matchId,
              winner_team_id:  winner.winner?.id  || null,
              loser_team_id:   winner.loser?.id   || null,
              result_type:     winner.type === 'tie' ? 'tie' : 'win',
              margin:          0,
              margin_type:     winner.type === 'runs' ? 'runs' : 'wickets',
              team_a_score:    `${inn1.total_runs ?? 0}/${inn1.total_wickets ?? 0}`,
              team_b_score:    inn2 ? `${inn2.total_runs ?? 0}/${inn2.total_wickets ?? 0}` : '—',
              player_of_match: autoPotmId,
              result_text:     winner.type === 'tie'
                ? 'Match Tied!'
                : `${winner.winner.team_name} won by ${winner.margin}`,
            });
            finalResult = await getMatchResult(matchId);
          }
        } catch (e) {
          console.warn('[MatchSummary] auto-finalize failed:', e.message);
        }
      }

      // ── 9. Resolve POTM name — always try API first ───────────────────
      // result.php returns player_of_match_name directly from MySQL JOIN.
      // Use that; fall back to the auto top-scorer name we picked above.
      let resolvedPotmName = autoPotmName;
      try {
        const rRes = await ApiService.get(
          `${API_ENDPOINTS.MATCHES_RESULT}?match_id=${encodeURIComponent(matchId)}`
        );
        const sr = rRes?.result || rRes?.data?.result || null;
        if (sr?.player_of_match_name) {
          resolvedPotmName = sr.player_of_match_name.trim();
        } else if (finalResult?.player_of_match) {
          // API result exists but no POTM name there — look up locally
          const potmRow = await queryFirstRow(
            `SELECT COALESCE(u.name, p.full_name) AS display_name
               FROM players p LEFT JOIN users u ON u.id = p.user_id
              WHERE p.id = ?`,
            [finalResult.player_of_match]
          );
          const fromDb = (potmRow?.display_name || '').trim();
          if (fromDb) resolvedPotmName = fromDb;
        }
      } catch (_) {
        // API unavailable — keep autoPotmName already set
      }

      // ── 9. Commit to state ─────────────────────────────────────────────
      setMatch(m || matchParam);
      setTeams(tms || []);
      setInnings(validInnings);
      setResult(finalResult || null);
      setPotmName(resolvedPotmName);
    } catch (err) {
      setLoadErr(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────
  const getTeamScore = (inn) => `${inn?.total_runs ?? 0}/${inn?.total_wickets ?? 0}`;

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>Loading match summary…</Text>
      </LinearGradient>
    );
  }

  // ── Error ──────────────────────────────────────────────────
  if (loadErr) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.center}>
        <Icon name="alert-circle-outline" size={48} color={COLORS.danger} />
        <Text style={styles.errText}>{loadErr}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('SeriesList')} style={styles.errBtn}>
          <Text style={styles.errBtnText}>Go to Dashboard</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const sortedInnings = [...innings].sort((a, b) => a.innings_number - b.innings_number);
  const ppt           = match?.players_per_team || matchParam?.players_per_team || 6;
  const winner        = result
    ? {
        winner: teams.find(t => t.id === result.winner_team_id) || null,
        loser:  teams.find(t => t.id === result.loser_team_id)  || null,
        type:   result.result_type === 'tie' ? 'tie' : (result.margin_type === 'runs' ? 'runs' : 'wickets'),
        text:   result.result_text,
      }
    : computeWinner(sortedInnings, teams, ppt);
  const matchObj = match || matchParam;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Icon name="trophy" size={20} color={COLORS.gold} />
          <Text style={styles.headerTitle}>MATCH SUMMARY</Text>
        </View>
        {result && (
          <View style={styles.savedBadge}>
            <Icon name="check-circle" size={14} color={COLORS.success} />
            <Text style={styles.savedText}>Completed</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Match Identity ── */}
        <View style={styles.matchIdentity}>
          <Text style={styles.matchTitle}>{matchObj?.title || 'Match'}</Text>
          {matchObj?.venue ? <Text style={styles.matchVenue}>📍 {matchObj.venue}</Text> : null}
        </View>

        {/* ── Result Banner ── */}
        {winner && (
          winner.type === 'tie' ? (
            <LinearGradient
              colors={['#1a1a2e', '#16213e']}
              style={[styles.resultBanner, { borderColor: COLORS.gray + '55' }]}
            >
              <Text style={{ fontSize: 38, marginBottom: 8 }}>🤝</Text>
              <Text style={styles.tieText}>MATCH TIED</Text>
            </LinearGradient>
          ) : (
            <LinearGradient colors={['#1A3000', '#0E1A00']} style={styles.resultBanner}>
              <Icon name="trophy" size={34} color="#D4AF37" style={{ marginBottom: 8 }} />
              <Text style={styles.resultWinnerName}>{winner.winner?.team_name}</Text>
              <View style={styles.resultMarginRow}>
                <Text style={styles.resultMarginLabel}>WON BY</Text>
                <Text style={styles.resultMarginValue}>{winner.margin}</Text>
              </View>
            </LinearGradient>
          )
        )}

        {/* ── Innings Cards ── */}
        {sortedInnings.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>INNINGS SUMMARY</Text>
            {sortedInnings.map((inn, i) => {
              const team     = teams.find(t => t.id === inn.batting_team_id);
              const isWinner = winner?.winner?.id === inn.batting_team_id;
              return (
                <View key={inn.id} style={[styles.inningsCard, isWinner && styles.inningsCardWinner]}>
                  <View style={styles.inningsTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inningsNum}>INNINGS {i + 1}</Text>
                      <Text style={styles.inningsTeam}>{team?.team_name || `Team ${i + 1}`}</Text>
                    </View>
                    {isWinner && (
                      <View style={styles.winnerBadge}>
                        <Icon name="trophy" size={10} color={COLORS.navy} />
                        <Text style={styles.winnerBadgeText}>WINNER</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.inningsScoreRow}>
                    <Text style={[styles.inningsScore, isWinner && { color: COLORS.gold }]}>
                      {getTeamScore(inn)}
                    </Text>
                    <Text style={styles.inningsOvers}>({inn.total_overs || 0} ov)</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.viewScorecardBtn}
                    onPress={() => navigation.navigate('Scorecard', { inningsId: inn.id, match: matchParam })}
                  >
                    <Icon name="view-list" size={13} color={COLORS.cyan} />
                    <Text style={styles.viewScorecardText}>View Full Scorecard</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        ) : (
          <View style={styles.noDataCard}>
            <Icon name="cricket" size={32} color={COLORS.cardBorder} />
            <Text style={styles.noDataText}>Innings data unavailable</Text>
          </View>
        )}

        {/* ── Player of the Match ── */}
        {potmName && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>PLAYER OF THE MATCH</Text>
            <View style={styles.potmCard}>
              <View style={styles.potmAvatar}>
                <Text style={styles.potmAvatarText}>{potmName[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.potmName}>{potmName}</Text>
                <Text style={styles.potmSub}>Outstanding Performance</Text>
              </View>
              <Icon name="star-circle" size={28} color={COLORS.gold} />
            </View>
          </>
        )}

        {/* ── Return ── */}
        <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.navigate('SeriesList')}>
          <Icon name="arrow-left-circle-outline" size={17} color={COLORS.gray} style={{ marginRight: 7 }} />
          <Text style={styles.homeBtnText}>Return to Dashboard</Text>
        </TouchableOpacity>

      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  center:            { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText:       { color: COLORS.gray, marginTop: 14, fontSize: 14 },
  errText:           { color: COLORS.white, fontSize: 15, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  errBtn:            { marginTop: 20, backgroundColor: COLORS.royalBlue, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  errBtnText:        { color: COLORS.white, fontWeight: '700' },

  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 52, paddingHorizontal: 20, marginBottom: 8 },
  headerLeft:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:       { color: COLORS.white, fontSize: 16, fontWeight: '900', letterSpacing: 2.5 },
  savedBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.success + '22', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: COLORS.success + '55' },
  savedText:         { color: COLORS.success, fontSize: 12, fontWeight: '700' },

  scroll:            { paddingHorizontal: 18, paddingBottom: 52, paddingTop: 8 },

  matchIdentity:     { alignItems: 'center', marginBottom: 18, paddingVertical: 10 },
  matchTitle:        { color: COLORS.white, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  matchVenue:        { color: COLORS.gray, fontSize: 13, marginTop: 4 },

  resultBanner:      { borderRadius: 20, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', marginBottom: 22, borderWidth: 1.5, borderColor: COLORS.gold + '50' },
  resultWinnerName:  { color: '#FFFFFF', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  resultMarginRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  resultMarginLabel: { color: '#A0A0A0', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  resultMarginValue: { color: '#D4AF37', fontSize: 18, fontWeight: '900' },
  tieText:           { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: 3 },

  sectionLabel:      { color: COLORS.gold, fontSize: 10, fontWeight: '900', letterSpacing: 3, marginBottom: 10 },

  inningsCard:       { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  inningsCardWinner: { borderColor: COLORS.gold + '70' },
  inningsTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  inningsNum:        { color: COLORS.gray, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
  inningsTeam:       { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  winnerBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.gold, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  winnerBadgeText:   { color: COLORS.navy, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  inningsScoreRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  inningsScore:      { color: COLORS.white, fontSize: 38, fontWeight: '900' },
  inningsOvers:      { color: COLORS.gray, fontSize: 14 },
  viewScorecardBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  viewScorecardText: { color: COLORS.cyan, fontWeight: '600', fontSize: 13 },

  noDataCard:        { backgroundColor: COLORS.card, borderRadius: 16, padding: 28, alignItems: 'center', gap: 10, marginBottom: 16, borderWidth: 1, borderColor: COLORS.cardBorder },
  noDataText:        { color: COLORS.gray, fontSize: 14 },

  potmCard:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: COLORS.gold + '60', gap: 14 },
  potmAvatar:        { width: 52, height: 52, borderRadius: 26, backgroundColor: '#2C4BB5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#D4AF37' },
  potmAvatarText:    { color: '#FFFFFF', fontWeight: '900', fontSize: 22 },
  potmName:          { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  potmSub:           { color: COLORS.gold, fontSize: 11, marginTop: 2 },

  homeBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingVertical: 14 },
  homeBtnText:       { color: COLORS.gray, fontSize: 14 },
});

export default MatchSummaryScreen;
