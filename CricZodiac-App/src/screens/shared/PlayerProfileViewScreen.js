// ============================================================
// CricZodiac — Player Profile View (Read-only detailed stats)
// Used from Leaderboard / Admin — shows full career stats,
// star ratings, dismissal breakdown, bowling figures
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Image, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { BOWLING_STYLES } from '../../config/constants';
import { getPlayer } from '../../database/queries/playerQueries';
import {
  getFullPlayerStats, getFullBowlingStats, getWicketBreakdown,
} from '../../database/queries/leaderboardQueries';

// ── Star Rating ───────────────────────────────────────────
const Stars = ({ rating, label, COLORS, st }) => {
  const full    = Math.floor(rating);
  const partial = rating - full;
  return (
    <View style={st.starBlock}>
      <Text style={st.starLabel}>{label}</Text>
      <View style={st.starRow}>
        {[0,1,2,3,4].map(i => (
          <Icon key={i}
            name={i < full ? 'star' : i === full && partial >= 0.5 ? 'star-half-full' : 'star-outline'}
            size={14} color={COLORS.gold}
            style={{ marginRight: 1 }}
          />
        ))}
        <Text style={st.starNum}>{rating.toFixed(1)}</Text>
      </View>
    </View>
  );
};

// ── Stat Row ──────────────────────────────────────────────
const StatRow = ({ label, value, highlight, COLORS, st }) => (
  <View style={st.statRow}>
    <Text style={st.statLabel}>{label}</Text>
    <Text style={[st.statVal, highlight && { color: COLORS.gold, fontWeight: '800' }]}>{value ?? '—'}</Text>
  </View>
);

// ── Dismissal Bar ─────────────────────────────────────────
const DismissalBar = ({ label, count, total, color, st }) => {
  const pct = total > 0 ? (count / total) : 0;
  return (
    <View style={st.dBar}>
      <Text style={st.dLabel}>{label}</Text>
      <View style={st.dTrack}>
        <View style={[st.dFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={st.dCount}>{count}</Text>
    </View>
  );
};

// ── Main ──────────────────────────────────────────────────
const PlayerProfileViewScreen = ({ route, navigation }) => {
  const { colors: COLORS } = useTheme();
  const st = useMemo(() => getStStyles(COLORS), [COLORS]);

  const { playerId } = route.params;
  const [player,   setPlayer]   = useState(null);
  const [batting,  setBatting]  = useState(null);
  const [bowling,  setBowling]  = useState(null);
  const [wktBreak, setWktBreak] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, bat, bwl, wb] = await Promise.all([
        getPlayer(playerId),
        getFullPlayerStats(playerId),
        getFullBowlingStats(playerId),
        getWicketBreakdown(playerId),
      ]);
      setPlayer(p);
      setBatting(bat);
      setBowling(bwl);
      setWktBreak(wb);
    } catch (e) {
      console.error('PlayerProfileViewScreen:', e);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useFocusEffect(useCallback(() => { load(); }, [playerId]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  // Compute star ratings (0–5)
  const battingAvg  = batting?.outs > 0 ? batting.total_runs / batting.outs : (batting?.total_runs || 0);
  const batStar     = Math.min(5, (battingAvg / 30) * 5);
  const eco         = bowling?.total_overs > 0 ? bowling.total_runs_conceded / bowling.total_overs : 999;
  const bowlStar    = eco < 999 ? Math.min(5, Math.max(0, (12 - eco) / 12 * 5)) : 0;
  const consistency = Math.min(5, ((batting?.batting_innings || 0) / 20) * 5);
  const playerStar  = (batStar + bowlStar + consistency) / 3;

  const battingSR = batting?.total_balls > 0
    ? ((batting.total_runs / batting.total_balls) * 100).toFixed(1) : '0.0';
  const batAvgDisp = batting?.outs > 0
    ? (batting.total_runs / batting.outs).toFixed(1)
    : (batting?.total_runs || 0);
  const ecoDisp = bowling?.total_overs > 0
    ? (bowling.total_runs_conceded / bowling.total_overs).toFixed(1) : '—';

  if (loading) return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={[{ flex: 1 }, st.center]}>
      <ActivityIndicator size="large" color={COLORS.gold} />
    </LinearGradient>
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Player Profile</Text>
        <TouchableOpacity onPress={() =>
          navigation.navigate('PlayerCompare', { preloadId: playerId })
        }>
          <Icon name="compare" size={22} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />}>
        {/* Identity Card */}
        <View style={st.identityCard}>
          {player?.profile_pic
            ? <Image source={{ uri: player.profile_pic }} style={st.avatar} />
            : <View style={[st.avatar, st.avatarFallback]}>
                <Text style={st.initial}>{player?.full_name?.[0] || '?'}</Text>
              </View>
          }
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <Text style={st.playerName}>{player?.full_name || '—'}</Text>
            {player?.jersey_number ? (
              <View style={st.jerseyBadge}>
                <Text style={st.jerseyNum}>#{player.jersey_number}</Text>
              </View>
            ) : null}
          </View>
          <Text style={st.playerType}>{player?.player_type?.toUpperCase() || '—'}</Text>

          {/* Batting hand + bowling style tags */}
          <View style={st.attrRow}>
            {player?.batting_hand ? (
              <View style={st.attrTag}>
                <Icon name={player.batting_hand === 'left' ? 'hand-left' : 'hand-right'} size={12} color={COLORS.gold} />
                <Text style={st.attrText}>{player.batting_hand === 'left' ? 'Left Hand Bat' : 'Right Hand Bat'}</Text>
              </View>
            ) : null}
            {player?.bowling_style && player.bowling_style !== 'none' ? (
              <View style={[st.attrTag, { borderColor: COLORS.cyan + '55' }]}>
                <Icon name="arm-flex" size={12} color={COLORS.cyan} />
                <Text style={[st.attrText, { color: COLORS.cyan }]}>
                  {BOWLING_STYLES.find(s => s.id === player.bowling_style)?.desc || player.bowling_style}
                </Text>
              </View>
            ) : null}
            {player?.date_of_birth ? (
              <View style={st.attrTag}>
                <Icon name="cake-variant" size={12} color={COLORS.gray} />
                <Text style={[st.attrText, { color: COLORS.gray }]}>{player.date_of_birth}</Text>
              </View>
            ) : null}
          </View>

          {/* Stats summary chips */}
          <View style={st.chipRow}>
            {[
              { label: 'Matches', value: batting?.matches_played ?? '—' },
              { label: 'Runs',    value: batting?.total_runs ?? '—' },
              { label: 'Wickets', value: bowling?.total_wickets ?? '—' },
              { label: 'Series',  value: batting?.series_count ?? '—' },
            ].map(c => (
              <View key={c.label} style={st.chip}>
                <Text style={st.chipVal}>{c.value}</Text>
                <Text style={st.chipLbl}>{c.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Star Ratings */}
        <View style={st.card}>
          <Text style={st.cardTitle}>⭐ Ratings</Text>
          <View style={st.starsGrid}>
            <Stars rating={batStar}     label="Batting"     COLORS={COLORS} st={st} />
            <Stars rating={bowlStar}    label="Bowling"     COLORS={COLORS} st={st} />
            <Stars rating={consistency} label="Consistency" COLORS={COLORS} st={st} />
            <Stars rating={playerStar}  label="Player"      COLORS={COLORS} st={st} />
          </View>
        </View>

        {/* Batting Stats */}
        <View style={st.card}>
          <Text style={st.cardTitle}>🏏 Batting</Text>
          <StatRow label="Innings"        value={batting?.batting_innings} COLORS={COLORS} st={st} />
          <StatRow label="Total Runs"     value={batting?.total_runs}     highlight COLORS={COLORS} st={st} />
          <StatRow label="Highest Score"  value={batting?.highest_score}  highlight COLORS={COLORS} st={st} />
          <StatRow label="Batting Avg"    value={batAvgDisp}              highlight COLORS={COLORS} st={st} />
          <StatRow label="Strike Rate"    value={battingSR}               COLORS={COLORS} st={st} />
          <StatRow label="Balls Faced"    value={batting?.total_balls}    COLORS={COLORS} st={st} />
          <StatRow label="Sixes"          value={batting?.total_sixes}    COLORS={COLORS} st={st} />
          <StatRow label="Fours"          value={batting?.total_fours}    COLORS={COLORS} st={st} />
          <StatRow label="100s"           value={batting?.hundreds}       COLORS={COLORS} st={st} />
          <StatRow label="50s"            value={batting?.fifties}        COLORS={COLORS} st={st} />
          <StatRow label="Ducks"          value={batting?.ducks}          COLORS={COLORS} st={st} />

          {/* Dismissal breakdown */}
          {batting?.outs > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={[st.cardTitle, { fontSize: 12, marginBottom: 8 }]}>Dismissal Breakdown</Text>
              {[
                { label: 'Bowled',   count: batting?.bowled_out, color: '#e74c3c' },
                { label: 'Caught',   count: batting?.caught_out, color: '#3498db' },
                { label: 'Stumped',  count: batting?.stumped,    color: '#9b59b6' },
                { label: 'Run Out',  count: batting?.run_out,    color: '#e67e22' },
                { label: 'Mankad',   count: batting?.mankad,     color: '#1abc9c' },
              ].map(d => (
                <DismissalBar key={d.label} label={d.label}
                  count={d.count || 0} total={batting?.outs} color={d.color} st={st} />
              ))}
            </View>
          )}
        </View>

        {/* Bowling Stats */}
        <View style={st.card}>
          <Text style={st.cardTitle}>🎯 Bowling</Text>
          <StatRow label="Innings"        value={bowling?.bowling_innings}     COLORS={COLORS} st={st} />
          <StatRow label="Total Wickets"  value={bowling?.total_wickets}       highlight COLORS={COLORS} st={st} />
          <StatRow label="Runs Conceded"  value={bowling?.total_runs_conceded} COLORS={COLORS} st={st} />
          <StatRow label="Overs Bowled"   value={bowling?.total_overs}         COLORS={COLORS} st={st} />
          <StatRow label="Economy Rate"   value={ecoDisp}                      highlight COLORS={COLORS} st={st} />
          <StatRow label="Avg Wickets"    value={bowling?.avg_wickets}         COLORS={COLORS} st={st} />
          <StatRow label="Maidens"        value={bowling?.total_maidens}       COLORS={COLORS} st={st} />
          <StatRow label="Best Economy"   value={bowling?.lowest_eco}          COLORS={COLORS} st={st} />
          <StatRow label="Worst Economy"  value={bowling?.highest_eco}         COLORS={COLORS} st={st} />

          {/* Wicket type breakdown (as bowler) */}
          {wktBreak?.total_wickets > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={[st.cardTitle, { fontSize: 12, marginBottom: 8 }]}>Wicket Types</Text>
              {[
                { label: 'Bowled',  count: wktBreak?.bowled,  color: '#e74c3c' },
                { label: 'Caught',  count: wktBreak?.caught,  color: '#3498db' },
                { label: 'Stumped', count: wktBreak?.stumped, color: '#9b59b6' },
                { label: 'Mankad',  count: wktBreak?.mankad,  color: '#1abc9c' },
              ].map(d => (
                <DismissalBar key={d.label} label={d.label}
                  count={d.count || 0} total={wktBreak?.total_wickets} color={d.color} st={st} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const getStStyles = (COLORS) => StyleSheet.create({
  center:        { alignItems: 'center', justifyContent: 'center' },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 4 },
  headerTitle:   { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  scroll:        { padding: 16, paddingBottom: 40 },

  identityCard:  { backgroundColor: COLORS.card, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  avatar:        { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.gold, marginBottom: 10 },
  avatarFallback:{ backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center' },
  initial:       { color: COLORS.white, fontSize: 36, fontWeight: '900' },
  playerName:    { color: COLORS.white, fontSize: 22, fontWeight: '800' },
  playerType:    { color: COLORS.cyan, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 8 },
  jerseyBadge:   { backgroundColor: COLORS.gold + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.gold },
  jerseyNum:     { color: COLORS.gold, fontSize: 12, fontWeight: '800' },
  attrRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 14 },
  attrTag:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.darkGray, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.cardBorder },
  attrText:      { color: COLORS.gold, fontSize: 11, fontWeight: '600' },
  chipRow:       { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  chip:          { alignItems: 'center' },
  chipVal:       { color: COLORS.white, fontWeight: '800', fontSize: 18 },
  chipLbl:       { color: COLORS.gray, fontSize: 10, marginTop: 2 },

  card:          { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  cardTitle:     { color: COLORS.white, fontWeight: '700', fontSize: 14, marginBottom: 12 },

  starsGrid:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  starBlock:     { width: '48%', marginBottom: 12 },
  starLabel:     { color: COLORS.gray, fontSize: 11, marginBottom: 4 },
  starRow:       { flexDirection: 'row', alignItems: 'center' },
  starNum:       { color: COLORS.gold, fontSize: 12, fontWeight: '700', marginLeft: 4 },

  statRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  statLabel:     { color: COLORS.gray, fontSize: 13 },
  statVal:       { color: COLORS.white, fontSize: 13, fontWeight: '600' },

  dBar:          { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  dLabel:        { color: COLORS.gray, fontSize: 11, width: 60 },
  dTrack:        { flex: 1, height: 8, backgroundColor: COLORS.darkGray, borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
  dFill:         { height: '100%', borderRadius: 4 },
  dCount:        { color: COLORS.white, fontSize: 11, fontWeight: '700', width: 22, textAlign: 'right' },
});

export default PlayerProfileViewScreen;
