// ============================================================
// CricZodiac — Match Summary / Result Screen
// All data fetched live from MySQL via API — no local DB reads.
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import {
  addPlayerToTeam,
  createMatch,
  createTeam,
  getTeamPlayers,
  saveMatchResult,
  updateMatch,
  upsertTeamPlayersFromServer,
} from '../../database/queries/matchQueries';
import { getSeriesById, getSeriesMatches } from '../../database/queries/seriesQueries';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';
import { processSyncQueue } from '../../services/SyncService';

const SERIES_TOTAL_MATCHES = { bestOf1: 1, bestOf3: 3, bestOf5: 5 };

const totalMatchesForSeries = (format) => SERIES_TOTAL_MATCHES[format] || 1;

const normalizeSeries = (row) => row ? ({
  ...row,
  id: row.local_id || String(row.id),
  server_id: row.server_id ?? (row.local_id ? String(row.id) : row.server_id),
  club_id: row.club_id != null ? String(row.club_id) : null,
  match_count: Number(row.match_count || 0),
  completed_count: Number(row.completed_count || 0),
  team_a_wins: Number(row.team_a_wins || 0),
  team_b_wins: Number(row.team_b_wins || 0),
}) : null;

const normalizeSeriesMatch = (row) => ({
  ...row,
  id: row.local_id || String(row.id),
  server_id: row.server_id ?? (row.local_id ? String(row.id) : row.server_id),
  club_id: row.club_id != null ? String(row.club_id) : null,
  series_id: row.series_local_id || (row.series_id != null ? String(row.series_id) : null),
  overs: Number(row.overs || 6),
  players_per_team: Number(row.players_per_team || 6),
  max_overs_per_bowler: Number(row.max_overs_per_bowler || 0),
  wide_value: Number(row.wide_value || 1),
  no_ball_value: Number(row.no_ball_value || 1),
});

// ── Pure winner helper ────────────────────────────────────
const computeWinner = (sortedInnings, teamsArr, ppt = 6) => {
  if (!sortedInnings || sortedInnings.length < 2) return null;
  const [inn1, inn2] = sortedInnings;
  if (!inn1 || !inn2) return null;
  const team1 = teamsArr.find(t => t.id === inn1.batting_team_id) ||
                teamsArr.find(t => t.local_id === inn1.batting_team_local) ||
                { team_name: 'Team A', id: inn1.batting_team_id };
  const team2 = teamsArr.find(t => t.id === inn2.batting_team_id) ||
                teamsArr.find(t => t.local_id === inn2.batting_team_local) ||
                { team_name: 'Team B', id: inn2.batting_team_id };
  const r1 = inn1.total_runs || 0;
  const r2 = inn2.total_runs || 0;
  if (r1 > r2) {
    const m = r1 - r2;
    return { winner: team1, loser: team2, margin: `${m} run${m !== 1 ? 's' : ''}`, margin_value: m, type: 'runs' };
  } else if (r2 > r1) {
    const w = Math.max(0, (ppt - 1) - (inn2.total_wickets || 0));
    return { winner: team2, loser: team1, margin: `${w} wicket${w !== 1 ? 's' : ''}`, margin_value: w, type: 'wickets' };
  }
  return { winner: null, loser: null, margin: 'Tied', margin_value: 0, type: 'tie' };
};

const MatchSummaryScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { match: matchParam } = route.params || {};

  const [innings,  setInnings]  = useState([]);
  const [teams,    setTeams]    = useState([]);
  const [result,   setResult]   = useState(null);
  const [potmName, setPotmName] = useState(null);
  const [potmPlayers, setPotmPlayers] = useState([]);
  const [selectedPotm, setSelectedPotm] = useState(null);
  const [savingPotm, setSavingPotm] = useState(false);
  const [creatingRematch, setCreatingRematch] = useState(false);
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [seriesMatches, setSeriesMatches] = useState([]);
  const [matchObj, setMatchObj] = useState(matchParam || null);
  const [loadErr,  setLoadErr]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const matchId = matchParam?.id;
      if (!matchId) {
        setLoadErr('Match data missing.');
        setLoading(false);
        return;
      }
      const seriesIdForMatch = matchParam?.series_id || matchParam?.series_local_id || null;

      // ── Fetch all data from API in parallel ──────────────────────────
      const [innsRes, teamsRes, resultRes, seriesRes, matchesRes] = await Promise.all([
        ApiService.get(`${API_ENDPOINTS.MATCHES_SCORE}?match_id=${encodeURIComponent(matchId)}`).catch(() => null),
        ApiService.get(`${API_ENDPOINTS.TEAMS_LIST}?match_id=${encodeURIComponent(matchId)}`).catch(() => null),
        ApiService.get(`${API_ENDPOINTS.MATCHES_RESULT}?match_id=${encodeURIComponent(matchId)}`).catch(() => null),
        seriesIdForMatch ? ApiService.get(API_ENDPOINTS.SERIES_LIST).catch(() => null) : Promise.resolve(null),
        seriesIdForMatch ? ApiService.get(`${API_ENDPOINTS.MATCHES_LIST}?series_id=${encodeURIComponent(seriesIdForMatch)}`).catch(() => null) : Promise.resolve(null),
      ]);

      // ── Parse innings ────────────────────────────────────────────────
      const rawInnings = innsRes?.innings || innsRes?.data?.innings || [];
      // De-duplicate by innings_number, keep highest score
      const dedup = new Map();
      for (const inn of rawInnings) {
        const n     = inn.innings_number;
        const score = (inn.total_runs || 0) + (inn.total_overs || 0) + (inn.total_wickets || 0);
        const prev  = dedup.get(n);
        const pScore = prev
          ? (prev.total_runs || 0) + (prev.total_overs || 0) + (prev.total_wickets || 0)
          : -1;
        if (score > pScore) dedup.set(n, inn);
      }
      const validInnings = [...dedup.values()]
        .sort((a, b) => a.innings_number - b.innings_number);

      // ── Parse teams ──────────────────────────────────────────────────
      const rawTeams = teamsRes?.teams || teamsRes?.data?.teams || [];
      // Normalize: use local_id as id if available
      const normalizedTeams = rawTeams.map(t => ({
        ...t,
        id:       t.local_id || String(t.id),
        local_id: t.local_id || String(t.id),
        server_id: t.id,
      }));

      const players = await loadPlayersForTeams(normalizedTeams);

      // ── Parse series context for next-match actions ──────────────────
      const serverSeries = seriesRes?.series || seriesRes?.data?.series || [];
      const resolvedSeries = serverSeries
        .map(normalizeSeries)
        .find(s => s.id === String(seriesIdForMatch) || s.server_id === String(seriesIdForMatch)) || null;
      const serverMatches = matchesRes?.matches || matchesRes?.data?.matches || [];
      let nextSeriesInfo = resolvedSeries;
      let nextSeriesMatches = serverMatches.map(normalizeSeriesMatch);

      if (seriesIdForMatch && (!nextSeriesInfo || !nextSeriesMatches.length)) {
        try {
          const [localSeries, localMatches] = await Promise.all([
            nextSeriesInfo ? Promise.resolve(nextSeriesInfo) : getSeriesById(seriesIdForMatch),
            nextSeriesMatches.length ? Promise.resolve(nextSeriesMatches) : getSeriesMatches(seriesIdForMatch),
          ]);
          nextSeriesInfo = nextSeriesInfo || normalizeSeries(localSeries);
          nextSeriesMatches = nextSeriesMatches.length ? nextSeriesMatches : (localMatches || []).map(normalizeSeriesMatch);
        } catch (seriesErr) {
          console.warn('[MatchSummary] series context:', seriesErr.message);
        }
      }

      // ── Parse result ─────────────────────────────────────────────────
      const sr = resultRes?.result || resultRes?.data?.result || null;
      let apiResult = sr && (sr.result_text || sr.winner_team_id != null) ? sr : null;

      // ── Auto-finalize if no result saved yet ─────────────────────────
      if (!apiResult && validInnings.length >= 2 && normalizedTeams.length >= 2) {
        try {
          const ppt    = matchParam?.players_per_team || 6;
          const winner = computeWinner(validInnings, normalizedTeams, ppt);
          if (winner) {
            const [inn1, inn2] = validInnings;
            // Resolve local UUIDs for winner/loser teams
            const winnerTeam = normalizedTeams.find(t =>
              t.id === winner.winner?.id || t.local_id === winner.winner?.local_id
            );
            const loserTeam = normalizedTeams.find(t =>
              t.id === winner.loser?.id || t.local_id === winner.loser?.local_id
            );
            await saveMatchResult({
              match_id:        matchId,
              winner_team_id:  winnerTeam?.local_id || winnerTeam?.id || null,
              loser_team_id:   loserTeam?.local_id  || loserTeam?.id  || null,
              result_type:     winner.type === 'tie' ? 'tie' : 'win',
              margin:          winner.margin_value ?? 0,
              margin_type:     winner.type === 'tie' ? null : (winner.type === 'runs' ? 'runs' : 'wickets'),
              team_a_score:    `${inn1.total_runs ?? 0}/${inn1.total_wickets ?? 0}`,
              team_b_score:    inn2 ? `${inn2.total_runs ?? 0}/${inn2.total_wickets ?? 0}` : '—',
              player_of_match: null,
              result_text:     winner.type === 'tie'
                ? 'Match Tied!'
                : `${winner.winner.team_name} won by ${winner.margin}`,
            });
            // Re-fetch result from API after saving
            const newRes = await ApiService.get(
              `${API_ENDPOINTS.MATCHES_RESULT}?match_id=${encodeURIComponent(matchId)}`
            ).catch(() => null);
            apiResult = newRes?.result || newRes?.data?.result || null;
          }
        } catch (e) {
          console.warn('[MatchSummary] auto-finalize:', e.message);
        }
      }

      // ── Commit to state ──────────────────────────────────────────────
      setInnings(validInnings);
      setTeams(normalizedTeams);
      setPotmPlayers(players);
      setSeriesInfo(nextSeriesInfo);
      setSeriesMatches(nextSeriesMatches);
      setMatchObj(prev => ({
        ...(prev || {}),
        ...(matchParam || {}),
        series_id: seriesIdForMatch || prev?.series_id || matchParam?.series_id || null,
      }));
      setResult(apiResult || null);
      setPotmName(
        (apiResult?.player_of_match_name || '').trim() || null
      );
    } catch (err) {
      setLoadErr(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayersForTeams = async (teamsForMatch) => {
    const merged = new Map();
    for (const team of teamsForMatch || []) {
      const teamId = team.local_id || team.id;
      if (!teamId) continue;

      const res = await ApiService
        .get(`${API_ENDPOINTS.TEAMS_PLAYERS}?team_id=${encodeURIComponent(teamId)}`)
        .catch(() => null);
      const rows = res?.players || res?.data?.players || [];
      for (const row of rows) {
        const localId = row.player_uuid || row.player_local_id || row.local_id || null;
        const serverId = row.player_id || row.id || null;
        const key = localId || String(serverId);
        if (!key || merged.has(key)) continue;

        const fullName = (row.full_name || row.user_name || row.name || '').trim();
        merged.set(key, {
          id: localId || String(serverId),
          local_id: localId,
          server_id: serverId,
          full_name: fullName || 'Unknown',
          player_type: row.player_type || 'player',
          team_name: team.team_name,
        });
      }
    }
    return [...merged.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  };

  const loadRosterForTeam = async (team) => {
    const teamId = team?.local_id || team?.id;
    if (!teamId) return [];

    try {
      const qParts = [`team_id=${encodeURIComponent(teamId)}`];
      if (matchParam?.id) qParts.push(`match_id=${encodeURIComponent(matchParam.id)}`);
      if (team?.team_label) qParts.push(`team_label=${encodeURIComponent(team.team_label)}`);
      if (team?.club_id || matchParam?.club_id) qParts.push(`club_id=${encodeURIComponent(team?.club_id || matchParam?.club_id)}`);
      const res = await ApiService.get(`${API_ENDPOINTS.TEAMS_PLAYERS}?${qParts.join('&')}`);
      const rows = res?.players || res?.data?.players || [];
      if (rows.length) {
        await upsertTeamPlayersFromServer(rows, teamId).catch(() => {});
        return rows
          .map((row, index) => ({
            player_id: row.player_uuid || row.player_local_id || (row.player_id != null ? String(row.player_id) : null),
            server_id: row.player_id || null,
            batting_order: Number(row.batting_order || index + 1),
          }))
          .filter(row => row.player_id)
          .sort((a, b) => a.batting_order - b.batting_order);
      }
    } catch (err) {
      console.warn('[MatchSummary] rematch roster API:', err.message);
    }

    const localRows = await getTeamPlayers(teamId).catch(() => []);
    return (localRows || [])
      .map((row, index) => ({
        player_id: row.player_id,
        server_id: row.player_server_id || null,
        batting_order: Number(row.batting_order || index + 1),
      }))
      .filter(row => row.player_id)
      .sort((a, b) => a.batting_order - b.batting_order);
  };

  const resolveRosterPlayer = (roster, localValue, serverValue) => {
    if (localValue) return localValue;
    const byServer = roster.find(row => serverValue != null && String(row.server_id) === String(serverValue));
    return byServer?.player_id || (serverValue != null ? String(serverValue) : roster[0]?.player_id || null);
  };

  const handleNewMatch = () => {
    const seriesId = matchObj?.series_id || matchParam?.series_id || matchParam?.series_local_id || null;
    navigation.navigate('MatchSetup', {
      seriesId,
      seriesName: seriesInfo?.name || matchParam?.series_name || null,
      matchNumber: Math.max(1, seriesMatches.length + 1),
    });
  };

  const createSameTeamRematch = async () => {
    if (creatingRematch) return;

    const teamA = teams.find(t => t.team_label === 'A') || teams[0];
    const teamB = teams.find(t => t.team_label === 'B') || teams[1];
    if (!teamA || !teamB) {
      Alert.alert('Teams not found', 'Could not load both teams for this match.');
      return;
    }

    setCreatingRematch(true);
    try {
      const [teamARoster, teamBRoster] = await Promise.all([
        loadRosterForTeam(teamA),
        loadRosterForTeam(teamB),
      ]);
      if (!teamARoster.length || !teamBRoster.length) {
        Alert.alert('Players not found', 'Could not copy both team player lists for the re-match.');
        return;
      }

      const seriesId = matchObj?.series_id || matchParam?.series_id || matchParam?.series_local_id || null;
      const nextMatchNumber = Math.max(1, seriesMatches.length + 1);
      const matchData = {
        title: seriesId ? `Match ${nextMatchNumber}` : `${displayMatchTitle} Re-match`,
        venue: matchObj?.venue || matchParam?.venue || '',
        match_date: new Date().toISOString().split('T')[0],
        overs: Number(matchObj?.overs || matchParam?.overs || 6),
        players_per_team: Math.max(
          Number(matchObj?.players_per_team || matchParam?.players_per_team || 0),
          teamARoster.length,
          teamBRoster.length
        ),
        max_overs_per_bowler: Number(matchObj?.max_overs_per_bowler || matchParam?.max_overs_per_bowler || 0),
        wide_value: Number(matchObj?.wide_value || matchParam?.wide_value || 1),
        no_ball_value: Number(matchObj?.no_ball_value || matchParam?.no_ball_value || 1),
        series_id: seriesId,
        club_id: matchObj?.club_id || matchParam?.club_id || seriesInfo?.club_id || null,
        team_a_name: teamA.team_name,
        team_b_name: teamB.team_name,
      };

      const newMatchId = await createMatch(matchData);
      const captainAId = resolveRosterPlayer(teamARoster, teamA.captain_local, teamA.captain_id);
      const captainBId = resolveRosterPlayer(teamBRoster, teamB.captain_local, teamB.captain_id);
      const wkAId = resolveRosterPlayer(teamARoster, teamA.wk_local, teamA.wk_id);
      const wkBId = resolveRosterPlayer(teamBRoster, teamB.wk_local, teamB.wk_id);

      const newTeamAId = await createTeam({
        match_id: newMatchId,
        club_id: matchData.club_id,
        series_id: matchData.series_id,
        team_name: teamA.team_name,
        team_label: 'A',
        captain_id: captainAId,
        wk_id: wkAId,
      });
      const newTeamBId = await createTeam({
        match_id: newMatchId,
        club_id: matchData.club_id,
        series_id: matchData.series_id,
        team_name: teamB.team_name,
        team_label: 'B',
        captain_id: captainBId,
        wk_id: wkBId,
      });

      await updateMatch(newMatchId, { team_a_id: newTeamAId, team_b_id: newTeamBId });

      for (const [index, row] of teamARoster.entries()) {
        await addPlayerToTeam(newTeamAId, row.player_id, row.batting_order || index + 1);
      }
      for (const [index, row] of teamBRoster.entries()) {
        await addPlayerToTeam(newTeamBId, row.player_id, row.batting_order || index + 1);
      }

      processSyncQueue().catch(() => {});
      navigation.navigate('Toss', {
        match: { id: newMatchId, ...matchData, players_per_team: Number(matchData.players_per_team) },
        teamA: {
          id: newTeamAId,
          team_name: teamA.team_name,
          team_label: 'A',
          captain_id: captainAId,
          captain_name: teamA.captain_name,
          match_id: newMatchId,
          club_id: matchData.club_id,
          series_id: matchData.series_id,
        },
        teamB: {
          id: newTeamBId,
          team_name: teamB.team_name,
          team_label: 'B',
          captain_id: captainBId,
          captain_name: teamB.captain_name,
          match_id: newMatchId,
          club_id: matchData.club_id,
          series_id: matchData.series_id,
        },
        isFirstMatch: false,
      });
    } catch (err) {
      Alert.alert('Re-match Failed', err.message || 'Could not create the re-match.');
    } finally {
      setCreatingRematch(false);
    }
  };

  const handleSameTeamRematch = () => {
    Alert.alert(
      'Start Re-match?',
      'Create a new match with the same teams, rules, and players, then go to the toss.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create & Toss', onPress: createSameTeamRematch },
      ],
    );
  };

  const handleSavePotm = async () => {
    if (!selectedPotm || !winner || winner.type === 'tie') return;

    setSavingPotm(true);
    try {
      const sorted = [...innings].sort((a, b) => a.innings_number - b.innings_number);
      const [inn1, inn2] = sorted;
      const winnerTeam = teams.find(t =>
        t.id === winner.winner?.id || t.local_id === winner.winner?.local_id
      ) || winner.winner;
      const loserTeam = teams.find(t =>
        t.id === winner.loser?.id || t.local_id === winner.loser?.local_id
      ) || winner.loser;
      const computedWinner = computeWinner(sorted, teams, ppt) || winner;
      const savedMargin = Number(result?.margin);
      const marginValue = Number.isFinite(savedMargin) && savedMargin > 0
        ? savedMargin
        : (computedWinner?.margin_value ?? 0);
      const marginType = result?.margin_type ||
        (computedWinner?.type === 'runs' ? 'runs' : 'wickets');

      await saveMatchResult({
        match_id: matchParam?.id,
        match_server_id: matchParam?.server_id || (Number.isInteger(Number(matchParam?.id)) ? Number(matchParam.id) : null),
        winner_team_id: winnerTeam?.local_id || winnerTeam?.id || null,
        winner_team_server_id: winnerTeam?.server_id || (Number.isInteger(Number(winnerTeam?.id)) ? Number(winnerTeam.id) : null),
        loser_team_id: loserTeam?.local_id || loserTeam?.id || null,
        loser_team_server_id: loserTeam?.server_id || (Number.isInteger(Number(loserTeam?.id)) ? Number(loserTeam.id) : null),
        result_type: winner.type === 'tie' ? 'tie' : 'win',
        margin: marginValue,
        margin_type: marginType,
        team_a_score: `${inn1?.total_runs ?? 0}/${inn1?.total_wickets ?? 0}`,
        team_b_score: inn2 ? `${inn2.total_runs ?? 0}/${inn2.total_wickets ?? 0}` : '—',
        player_of_match: selectedPotm.local_id || selectedPotm.id,
        player_of_match_server_id: selectedPotm.server_id || (Number.isInteger(Number(selectedPotm.id)) ? Number(selectedPotm.id) : null),
        result_text: winner.type === 'tie'
          ? 'Match Tied!'
          : (result?.result_text || `${winner.winner.team_name} won by ${winner.margin}`),
      });

      setPotmName(selectedPotm.full_name);
      setResult(prev => ({
        ...(prev || {}),
        player_of_match_name: selectedPotm.full_name,
        player_of_match_local: selectedPotm.local_id || selectedPotm.id,
        player_of_match: selectedPotm.server_id || prev?.player_of_match || null,
      }));
      processSyncQueue().catch(() => {});
    } finally {
      setSavingPotm(false);
    }
  };

  const getTeamScore = (inn) => `${inn?.total_runs ?? 0}/${inn?.total_wickets ?? 0}`;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>Loading match summary…</Text>
      </LinearGradient>
    );
  }

  // ── Error ─────────────────────────────────────────────────
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

  // ── Compute winner for display ────────────────────────────
  const sortedInnings = [...innings].sort((a, b) => a.innings_number - b.innings_number);
  const ppt           = matchObj?.players_per_team || matchParam?.players_per_team || 6;

  // If we have a saved result, use its text; otherwise compute from innings
  let winner = null;
  if (result) {
    const winnerTeam = teams.find(t =>
      t.id === result.winner_team_local || t.local_id === result.winner_team_local ||
      t.id === String(result.winner_team_id)
    );
    const loserTeam = teams.find(t =>
      t.id === result.loser_team_local || t.local_id === result.loser_team_local ||
      t.id === String(result.loser_team_id)
    );
    if (result.result_type === 'tie') {
      winner = { type: 'tie', winner: null, loser: null, margin: 'Tied', margin_value: 0, text: result.result_text };
    } else if (winnerTeam) {
      const computed = sortedInnings.length >= 2 ? computeWinner(sortedInnings, teams, ppt) : null;
      const resultMargin = Number(result.margin);
      const resultMarginType = result.margin_type || computed?.type || 'runs';
      const marginValue = Number.isFinite(resultMargin) && resultMargin > 0
        ? resultMargin
        : (computed?.margin_value ?? 0);
      winner = {
        type: resultMarginType,
        winner: winnerTeam,
        loser: loserTeam,
        margin: marginValue > 0
          ? `${marginValue} ${resultMarginType === 'runs' ? `run${marginValue !== 1 ? 's' : ''}` : `wicket${marginValue !== 1 ? 's' : ''}`}`
          : computed?.margin,
        margin_value: marginValue,
        text: result.result_text,
      };
    }
  }
  if (!winner && sortedInnings.length >= 2) {
    winner = computeWinner(sortedInnings, teams, ppt);
  }

  const displayMatchTitle = matchObj?.title || matchParam?.title || 'Match';
  const displayVenue      = matchObj?.venue || matchParam?.venue || null;
  const currentSeriesId   = matchObj?.series_id || matchParam?.series_id || matchParam?.series_local_id || null;
  const seriesTotalMatches = totalMatchesForSeries(seriesInfo?.format);
  const knownMatchCount = Math.max(seriesMatches.length, Number(seriesInfo?.match_count || 0));
  const canCreateNextSeriesMatch = Boolean(
    currentSeriesId &&
    seriesInfo &&
    seriesInfo.status !== 'completed' &&
    knownMatchCount < seriesTotalMatches
  );
  const nextMatchNumber = Math.max(1, knownMatchCount + 1);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('SeriesList')} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <Icon name="trophy" size={18} color={COLORS.gold} />
          <Text style={styles.headerTitle}>MATCH SUMMARY</Text>
        </View>
        {result ? (
          <View style={styles.savedBadge}>
            <Icon name="check-circle" size={14} color={COLORS.success} />
            <Text style={styles.savedText}>Completed</Text>
          </View>
        ) : (
          <View style={{ width: 70 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />}
      >

        {/* ── Match Identity ── */}
        <View style={styles.matchIdentity}>
          <Text style={styles.matchTitle}>{displayMatchTitle}</Text>
          {displayVenue ? <Text style={styles.matchVenue}>📍 {displayVenue}</Text> : null}
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
                <Text style={styles.resultMarginValue}>
                  {result?.result_text
                    ? result.result_text.replace(`${winner.winner?.team_name} won by `, '')
                    : winner.margin}
                </Text>
              </View>
            </LinearGradient>
          )
        )}

        {/* ── Innings Cards ── */}
        {sortedInnings.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>INNINGS SUMMARY</Text>
            {sortedInnings.map((inn, i) => {
              const team = teams.find(t =>
                t.id === inn.batting_team_local ||
                t.local_id === inn.batting_team_local ||
                t.id === String(inn.batting_team_id)
              );
              const isWinner = winner?.winner &&
                (winner.winner.id === (team?.id) || winner.winner.local_id === (team?.local_id));
              return (
                <View key={`${inn.id || inn.innings_number}`} style={[styles.inningsCard, isWinner && styles.inningsCardWinner]}>
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
                    onPress={() => navigation.navigate('Scorecard', {
                      inningsId: inn.local_id || String(inn.id),
                      match:     matchParam,
                    })}
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
              <Icon name="star-circle" size={28} color="#D4AF37" />
            </View>
          </>
        )}
        {!potmName && winner && winner.type !== 'tie' && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>MAN OF THE MATCH</Text>
            <View style={styles.potmPickerCard}>
              <View style={styles.potmPickerHeader}>
                <Icon name="star-circle-outline" size={22} color={COLORS.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.potmPickerTitle}>Select player of the match</Text>
                  <Text style={styles.potmPickerSub}>{potmPlayers.length} players available</Text>
                </View>
              </View>

              <View style={styles.potmGrid}>
                {potmPlayers.map(player => {
                  const active = selectedPotm?.id === player.id;
                  return (
                    <TouchableOpacity
                      key={player.id}
                      style={[styles.potmOption, active && styles.potmOptionSelected]}
                      onPress={() => setSelectedPotm(player)}
                    >
                      <View style={[styles.potmOptionAvatar, active && { backgroundColor: COLORS.gold }]}>
                        <Text style={[styles.potmOptionInitial, active && { color: COLORS.navy }]}>
                          {player.full_name[0]?.toUpperCase() || 'P'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.potmOptionName, active && { color: COLORS.gold }]} numberOfLines={1}>
                          {player.full_name}
                        </Text>
                        <Text style={styles.potmOptionTeam} numberOfLines={1}>{player.team_name}</Text>
                      </View>
                      {active && <Icon name="check-circle" size={18} color={COLORS.gold} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.savePotmBtn, (!selectedPotm || savingPotm) && styles.savePotmBtnDisabled]}
                onPress={handleSavePotm}
                disabled={!selectedPotm || savingPotm}
              >
                {savingPotm
                  ? <ActivityIndicator size="small" color={COLORS.navy} />
                  : <Icon name="content-save-check" size={17} color={COLORS.navy} />
                }
                <Text style={styles.savePotmText}>{savingPotm ? 'SAVING...' : 'SAVE MAN OF THE MATCH'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {canCreateNextSeriesMatch && (
          <View style={styles.nextMatchPanel}>
            <View style={styles.nextMatchHeader}>
              <View>
                <Text style={styles.nextMatchKicker}>SERIES CONTINUES</Text>
                <Text style={styles.nextMatchTitle}>Match {nextMatchNumber} of {seriesTotalMatches}</Text>
              </View>
              <Icon name="cricket" size={22} color={COLORS.gold} />
            </View>

            <TouchableOpacity
              style={[styles.rematchBtn, creatingRematch && { opacity: 0.6 }]}
              onPress={handleSameTeamRematch}
              disabled={creatingRematch}
            >
              <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.rematchBtnInner}>
                {creatingRematch
                  ? <ActivityIndicator size="small" color={COLORS.navy} />
                  : <Icon name="repeat-variant" size={18} color={COLORS.navy} />
                }
                <Text style={styles.rematchBtnText}>
                  {creatingRematch ? 'CREATING RE-MATCH...' : 'RE-MATCH SAME TEAMS'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.newSeriesMatchBtn}
              onPress={handleNewMatch}
              disabled={creatingRematch}
            >
              <Icon name="plus-circle-outline" size={18} color={COLORS.cyan} />
              <Text style={styles.newSeriesMatchText}>New Match</Text>
            </TouchableOpacity>
          </View>
        )}


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
  backBtn:           { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerLeft:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:       { color: COLORS.white, fontSize: 16, fontWeight: '900', letterSpacing: 2.5 },
  savedBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.success + '22', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: COLORS.success + '55' },
  savedText:         { color: COLORS.success, fontSize: 12, fontWeight: '700' },

  scroll:            { paddingHorizontal: 18, paddingBottom: 52, paddingTop: 8 },

  matchIdentity:     { alignItems: 'center', marginBottom: 18, paddingVertical: 10 },
  matchTitle:        { color: COLORS.white, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  matchVenue:        { color: COLORS.gray, fontSize: 13, marginTop: 4 },

  resultBanner:      { borderRadius: 20, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', marginBottom: 22, borderWidth: 1.5, borderColor: '#D4AF3750' },
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

  potmCard:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: '#D4AF3760', gap: 14 },
  potmAvatar:        { width: 52, height: 52, borderRadius: 26, backgroundColor: '#2C4BB5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#D4AF37' },
  potmAvatarText:    { color: '#FFFFFF', fontWeight: '900', fontSize: 22 },
  potmName:          { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  potmSub:           { color: COLORS.gold, fontSize: 11, marginTop: 2 },
  potmPickerCard:    { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: '#D4AF3760' },
  potmPickerHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  potmPickerTitle:   { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  potmPickerSub:     { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  potmGrid:          { gap: 8, marginBottom: 12 },
  potmOption:        { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.cardBorder, backgroundColor: COLORS.navy + '55', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  potmOptionSelected:{ borderColor: COLORS.gold, backgroundColor: COLORS.gold + '14' },
  potmOptionAvatar:  { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center' },
  potmOptionInitial: { color: COLORS.white, fontSize: 15, fontWeight: '900' },
  potmOptionName:    { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  potmOptionTeam:    { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  savePotmBtn:       { height: 42, borderRadius: 11, backgroundColor: COLORS.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  savePotmBtnDisabled:{ opacity: 0.45 },
  savePotmText:      { color: COLORS.navy, fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },

  nextMatchPanel:    { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.gold + '55' },
  nextMatchHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  nextMatchKicker:   { color: COLORS.gold, fontSize: 10, fontWeight: '900', letterSpacing: 2.2 },
  nextMatchTitle:    { color: COLORS.white, fontSize: 15, fontWeight: '800', marginTop: 3 },
  rematchBtn:        { borderRadius: 12, overflow: 'hidden', marginBottom: 10 },
  rematchBtnInner:   { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rematchBtnText:    { color: COLORS.navy, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  newSeriesMatchBtn: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: COLORS.cyan + '77', backgroundColor: COLORS.navy + '55', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  newSeriesMatchText:{ color: COLORS.cyan, fontSize: 13, fontWeight: '800' },

});

export default MatchSummaryScreen;
