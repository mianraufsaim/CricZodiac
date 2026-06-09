// ============================================================
// CricZodiac — Series Detail Screen
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { MATCH_STATUS } from '../../config/constants';
import { getSeriesById, getSeriesMatches, updateSeriesStatus } from '../../database/queries/seriesQueries';
import { upsertMatchesFromServer } from '../../database/queries/matchQueries';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

const FORMAT_LABELS = { bestOf1: 'Best of 1', bestOf3: 'Best of 3', bestOf5: 'Best of 5' };

const firstText = (...values) => {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
};

const normalizeSeriesRow = (row) => ({
  ...row,
  id: row.local_id || String(row.id),
  server_id: row.server_id ?? (row.local_id ? String(row.id) : row.server_id),
  club_id: row.club_id != null ? String(row.club_id) : null,
  team_a_id: row.team_a_local || (row.team_a_id != null ? String(row.team_a_id) : null),
  team_b_id: row.team_b_local || (row.team_b_id != null ? String(row.team_b_id) : null),
  match_count: Number(row.match_count || 0),
  live_count: Number(row.live_count || 0),
  completed_count: Number(row.completed_count || 0),
  team_a_wins: Number(row.team_a_wins || 0),
  team_b_wins: Number(row.team_b_wins || 0),
});

const normalizeMatchRow = (row) => ({
  ...row,
  id: row.local_id || String(row.id),
  server_id: row.server_id ?? (row.local_id ? String(row.id) : row.server_id),
  club_id: row.club_id != null ? String(row.club_id) : null,
  series_id: row.series_local_id || (row.series_id != null ? String(row.series_id) : null),
  team_a_id: row.team_a_local || (row.team_a_id != null ? String(row.team_a_id) : null),
  team_b_id: row.team_b_local || (row.team_b_id != null ? String(row.team_b_id) : null),
  overs: Number(row.overs || 6),
  players_per_team: Number(row.players_per_team || 6),
  max_overs_per_bowler: Number(row.max_overs_per_bowler || 0),
  wide_value: Number(row.wide_value || 1),
  no_ball_value: Number(row.no_ball_value || 1),
  winner_team_id: row.winner_team_local || (row.winner_team_id != null ? String(row.winner_team_id) : null),
});

const winsNeededFor = (format) => {
  if (format === 'bestOf5') return 3;
  if (format === 'bestOf3') return 2;
  return 1;
};

const maxMatchesFor = (format) => {
  if (format === 'bestOf5') return 5;
  if (format === 'bestOf3') return 3;
  return 1;
};

const matchNumberFromTitle = (title) => {
  const match = String(title || '').match(/\bmatch\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
};

const getTeamName = (row, side) => {
  const key = side === 'A' ? 'team_a' : 'team_b';
  return firstText(
    row?.[`${key}_name`],
    row?.[`${key}_team_name`],
    row?.[key]?.team_name,
    row?.[key]?.name
  );
};

const orderMatchesAsc = (rows) =>
  [...(rows || [])].sort((a, b) => {
    const titleA = matchNumberFromTitle(a.title);
    const titleB = matchNumberFromTitle(b.title);
    if (titleA && titleB && titleA !== titleB) return titleA - titleB;

    const createdA = new Date(a.created_at || 0).getTime() || 0;
    const createdB = new Date(b.created_at || 0).getTime() || 0;
    if (createdA !== createdB) return createdA - createdB;

    return String(a.id).localeCompare(String(b.id));
  });

const resultWinnerName = (match) => firstText(match?.winner_team_name, match?.winner_team?.team_name);

const normalizeName = (value) => firstText(value).toLowerCase();

const completedResultLine = (match) => {
  if (match.status !== 'completed') return '';
  const winnerName = resultWinnerName(match);
  const resultText = firstText(match.result_text);

  if (!winnerName) return resultText;
  if (!resultText) return `${winnerName} won`;

  const normalizedWinner = normalizeName(winnerName);
  const normalizedResult = normalizeName(resultText);
  const compactResult = normalizedResult.startsWith(normalizedWinner)
    ? resultText.slice(winnerName.length).trim()
    : resultText;

  return compactResult ? `${winnerName} · ${compactResult}` : winnerName;
};

const SeriesDetailScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { seriesId, seriesName, series: routeSeries = null } = route.params;
  const [series, setSeries]   = useState(routeSeries);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const orderedMatches = useMemo(() => orderMatchesAsc(matches), [matches]);
  const matchOrdinals = useMemo(() => {
    const ordinals = {};
    orderedMatches.forEach((item, index) => {
      ordinals[item.id] = index + 1;
    });
    return ordinals;
  }, [orderedMatches]);
  const seriesTeamNames = useMemo(() => {
    const firstMatchWithNames = orderedMatches.find(item => getTeamName(item, 'A') || getTeamName(item, 'B'));
    return {
      teamAName: firstText(series?.team_a_name, getTeamName(firstMatchWithNames, 'A'), 'Team A'),
      teamBName: firstText(series?.team_b_name, getTeamName(firstMatchWithNames, 'B'), 'Team B'),
    };
  }, [orderedMatches, series?.team_a_name, series?.team_b_name]);
  const knownSeriesTeams = seriesTeamNames.teamAName !== 'Team A' && seriesTeamNames.teamBName !== 'Team B';
  const seriesStats = useMemo(() => {
    let derivedTeamAWins = 0;
    let derivedTeamBWins = 0;
    const teamAName = normalizeName(seriesTeamNames.teamAName);
    const teamBName = normalizeName(seriesTeamNames.teamBName);

    for (const item of matches) {
      if (item.status !== 'completed') continue;

      const winnerName = normalizeName(resultWinnerName(item));
      const resultText = normalizeName(item.result_text);
      if ((winnerName && winnerName === teamAName) || (!winnerName && resultText.startsWith(teamAName))) {
        derivedTeamAWins += 1;
      } else if ((winnerName && winnerName === teamBName) || (!winnerName && resultText.startsWith(teamBName))) {
        derivedTeamBWins += 1;
      }
    }

    const numberValue = (value) => {
      const next = Number(value);
      return Number.isFinite(next) ? next : 0;
    };

    return {
      total: Math.max(matches.length, numberValue(series?.match_count)),
      live: Math.max(
        matches.filter(m => m.status === 'live' || m.status === 'innings_2').length,
        numberValue(series?.live_count)
      ),
      done: Math.max(matches.filter(m => m.status === 'completed').length, numberValue(series?.completed_count)),
      teamAWins: Math.max(numberValue(series?.team_a_wins), derivedTeamAWins),
      teamBWins: Math.max(numberValue(series?.team_b_wins), derivedTeamBWins),
    };
  }, [matches, series, seriesTeamNames]);
  const nextMatchNumber = seriesStats.total + 1;
  const winsNeeded = winsNeededFor(series?.format);
  const seriesLimit = maxMatchesFor(series?.format);
  const displaySeriesName = series?.name || seriesName || 'Series';
  const seriesDecided = seriesStats.teamAWins >= winsNeeded || seriesStats.teamBWins >= winsNeeded;
  const canCreateSeriesMatch =
    series?.status === 'active' &&
    seriesStats.total < seriesLimit &&
    !seriesDecided;

  const load = async () => {
    setLoading(true);
    try {
      try {
        const [seriesRes, matchRes] = await Promise.all([
          ApiService.get(API_ENDPOINTS.SERIES_LIST),
          ApiService.get(`${API_ENDPOINTS.MATCHES_LIST}?series_id=${encodeURIComponent(seriesId)}`),
        ]);
        const serverSeries = seriesRes?.series || seriesRes?.data?.series || [];
        const serverMatches = matchRes?.matches || matchRes?.data?.matches || [];
        const resolvedSeries = serverSeries
          .map(normalizeSeriesRow)
          .find(s => s.id === String(seriesId) || s.server_id === String(seriesId)) ||
          routeSeries;

        if (!resolvedSeries) {
          const [localSeries, localMatches] = await Promise.all([
            getSeriesById(seriesId),
            getSeriesMatches(seriesId),
          ]);
          setSeries(localSeries);
          setMatches(localMatches);
          return;
        }

        setSeries(resolvedSeries);
        setMatches(serverMatches.map(normalizeMatchRow));

        try {
          if (serverMatches.length) await upsertMatchesFromServer(serverMatches);
        } catch (cacheError) {
          console.warn('SeriesDetail cache refresh:', cacheError.message);
        }

        return;
      } catch (apiError) {
        console.warn('SeriesDetail API load:', apiError.message);
      }

      const [s, m] = await Promise.all([
        getSeriesById(seriesId),
        getSeriesMatches(seriesId),
      ]);
      setSeries(s);
      setMatches(m);
    } catch (e) {
      console.error('SeriesDetail:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const handleClose = () => {
    Alert.alert('Close Series', 'Mark this series as completed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close Series',
        style: 'destructive',
        onPress: async () => {
          await updateSeriesStatus(seriesId, 'completed');
          navigation.goBack();
        },
      },
    ]);
  };

  const statusColor = (s) => {
    if (s === MATCH_STATUS?.LIVE || s === 'live')      return COLORS.cyan;
    if (s === MATCH_STATUS?.COMPLETED || s === 'completed') return COLORS.gold;
    return COLORS.gray;
  };

  const handleMatchPress = async (item, index) => {
    const matchNumber = matchNumberFromTitle(item.title) || matchOrdinals[item.id] || index + 1;
    if (item.status === MATCH_STATUS?.SETUP || item.status === 'setup') {
      navigation.navigate('MatchSetup', {
        match: item,
        seriesId,
        seriesName: displaySeriesName,
        matchNumber,
        lockedTeamNames: matchNumber > 1 && knownSeriesTeams ? seriesTeamNames : null,
      });
    } else if (item.status === 'toss') {
      try {
        const res = await ApiService.get(
          `${API_ENDPOINTS.TEAMS_LIST}?match_id=${encodeURIComponent(item.id)}`
        );
        const teams = res?.teams || res?.data?.teams || [];
        const teamA = teams.find(t => t.team_label === 'A') || teams[0];
        const teamB = teams.find(t => t.team_label === 'B') || teams[1];
        if (!teamA || !teamB) {
          Alert.alert('Teams not found', 'Could not load teams for this match. Please complete team selection first.');
          return;
        }
        navigation.navigate('Toss', {
          match:        item,
          teamA: {
            id:           teamA.local_id || String(teamA.id),
            server_id:    teamA.id,
            team_name:    teamA.team_name,
            team_label:   'A',
            captain_id:   teamA.captain_local || String(teamA.captain_id),
            captain_name: teamA.captain_name,
            match_id:     item.id,
            club_id:      item.club_id,
            series_id:    item.series_id,
          },
          teamB: {
            id:           teamB.local_id || String(teamB.id),
            server_id:    teamB.id,
            team_name:    teamB.team_name,
            team_label:   'B',
            captain_id:   teamB.captain_local || String(teamB.captain_id),
            captain_name: teamB.captain_name,
            match_id:     item.id,
            club_id:      item.club_id,
            series_id:    item.series_id,
          },
          isFirstMatch: matchNumber === 1,
        });
      } catch (e) {
        Alert.alert('Error', 'Failed to load match teams.');
      }
    } else if (item.status === 'live' || item.status === 'innings_2') {
      navigation.navigate('LiveScoring', { matchId: item.id });
    } else if (item.status === 'completed') {
      // Open the full match summary for completed matches
      navigation.navigate('MatchSummary', { match: item });
    } else {
      // Fallback for any other status (e.g. unknown)
      navigation.navigate('Scorecard', { matchId: item.id });
    }
  };

  const renderMatch = ({ item, index }) => {
    const resultLine = completedResultLine(item);
    return (
      <TouchableOpacity
        style={styles.matchCard}
        onPress={() => handleMatchPress(item, index)}
      >
        <View style={styles.matchNum}>
          <Icon name="trophy" size={20} color={COLORS.gold} />
        </View>
        <View style={styles.matchBody}>
          <Text style={styles.matchTitle}>{item.title}</Text>
          {resultLine
            ? <Text style={styles.matchResult} numberOfLines={2}>{resultLine}</Text>
            : null}
          <View style={styles.matchMeta}>
            <Text style={styles.metaText}>{item.overs} ov  ·  {item.venue || 'Indoor'}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { borderColor: statusColor(item.status) }]}>
          <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
            {item.status?.toUpperCase() || 'SETUP'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{displaySeriesName}</Text>
        {series?.status === 'active'
          ? <TouchableOpacity onPress={handleClose}>
              <Icon name="close-circle-outline" size={24} color={COLORS.gray} />
            </TouchableOpacity>
          : <View style={{ width: 24 }} />
        }
      </View>

      {loading
        ? <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 60 }} />
        : (
          <FlatList
            data={matches}
            keyExtractor={i => i.id}
            renderItem={renderMatch}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListHeaderComponent={
              series ? (
                <View style={styles.seriesInfo}>
                  <View style={styles.statsRow}>
                    {[
                      { label: 'Total', value: seriesStats.total, icon: 'cricket' },
                      { label: 'Live',  value: seriesStats.live, icon: 'circle', color: COLORS.cyan },
                      { label: 'Done',  value: seriesStats.done, icon: 'check-circle', color: COLORS.gold },
                    ].map(s => (
                      <View key={s.label} style={styles.statBox}>
                        <Icon name={s.icon} size={20} color={s.color || COLORS.white} />
                        <Text style={[styles.statNum, s.color && { color: s.color }]}>{s.value}</Text>
                        <Text style={styles.statLabel}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                  {series.description
                    ? <Text style={styles.seriesDesc}>{series.description}</Text>
                    : null}

                  {/* Best-of-X Win Progress */}
                  {series.format && series.format !== 'bestOf1' && (
                    <View style={styles.bestOfRow}>
                      <Text style={styles.bestOfTitle}>{FORMAT_LABELS[series.format] || series.format}</Text>
                      <View style={styles.winsRow}>
                        <View style={styles.winsBox}>
                          <Text style={styles.winsNum}>{seriesStats.teamAWins}</Text>
                          <Text style={styles.winsLabel} numberOfLines={1}>{seriesTeamNames.teamAName}</Text>
                        </View>
                        <Text style={styles.winsNeed}>Need {winsNeeded} to win</Text>
                        <View style={styles.winsBox}>
                          <Text style={styles.winsNum}>{seriesStats.teamBWins}</Text>
                          <Text style={styles.winsLabel} numberOfLines={1}>{seriesTeamNames.teamBName}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {canCreateSeriesMatch && (
                    <TouchableOpacity
                      style={styles.newMatchBtn}
                      onPress={() => navigation.navigate('MatchSetup', {
                        seriesId,
                        seriesName: displaySeriesName,
                        matchNumber: nextMatchNumber,
                        lockedTeamNames: nextMatchNumber > 1 && knownSeriesTeams ? seriesTeamNames : null,
                      })}
                    >
                      <LinearGradient colors={[COLORS.royalBlue, COLORS.purple]} style={styles.newMatchInner}>
                        <Icon name="plus" size={18} color={COLORS.white} />
                        <Text style={styles.newMatchText}>New Match in Series</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}

                  <Text style={styles.sectionLabel}>MATCHES</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyMatches}>
                <Icon name="cricket" size={40} color={COLORS.cardBorder} />
                <Text style={styles.emptyText}>No matches yet in this series</Text>
              </View>
            }
          />
        )}
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 8 },
  title:         { color: COLORS.white, fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  seriesInfo:    { marginBottom: 8 },
  statsRow:      { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statBox:       { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  statNum:       { color: COLORS.white, fontSize: 22, fontWeight: '800', marginTop: 4 },
  statLabel:     { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  seriesDesc:    { color: COLORS.gray, fontSize: 13, marginBottom: 12, paddingHorizontal: 4 },
  newMatchBtn:   { borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  newMatchInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50 },
  newMatchText:  { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  sectionLabel:  { color: COLORS.gold, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginBottom: 10 },
  matchCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  matchNum:      { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.darkGray, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: COLORS.gold + '66' },
  matchBody:     { flex: 1 },
  matchTitle:    { color: COLORS.white, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  matchResult:   { color: COLORS.gray, fontSize: 12, marginBottom: 2, lineHeight: 17 },
  matchMeta:     {},
  metaText:      { color: COLORS.gray, fontSize: 11 },
  statusBadge:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusText:    { fontSize: 9, fontWeight: '700' },
  emptyMatches:  { alignItems: 'center', paddingTop: 30, gap: 10 },
  emptyText:     { color: COLORS.gray, fontSize: 13 },
  bestOfRow:     { backgroundColor: COLORS.darkGray, borderRadius: 12, padding: 14, marginBottom: 12 },
  bestOfTitle:   { color: COLORS.gold, fontWeight: '700', fontSize: 12, textAlign: 'center', marginBottom: 10 },
  winsRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  winsBox:       { alignItems: 'center', flex: 1 },
  winsNum:       { color: COLORS.white, fontWeight: '900', fontSize: 28 },
  winsLabel:     { color: COLORS.gray, fontSize: 10, marginTop: 2, maxWidth: 96 },
  winsNeed:      { color: COLORS.gray, fontSize: 11, textAlign: 'center', flex: 2 },
});

export default SeriesDetailScreen;
