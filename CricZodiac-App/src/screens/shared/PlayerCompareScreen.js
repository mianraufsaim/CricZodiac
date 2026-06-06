// ============================================================
// CricZodiac — Player Comparison Screen
// Pick 2 players, compare stats side-by-side
// Winner per row highlighted in gold
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, FlatList, Image, TextInput, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { getAllPlayers } from '../../database/queries/playerQueries';
import { getFullPlayerStats, getFullBowlingStats } from '../../database/queries/leaderboardQueries';

// ── Player Picker Modal ───────────────────────────────────
const PlayerPicker = ({ visible, onClose, onSelect, excluded, COLORS, md }) => {
  const [all,    setAll]    = useState([]);
  const [query,  setQuery]  = useState('');

  useEffect(() => { if (visible) getAllPlayers().then(setAll); }, [visible]);

  const filtered = all.filter(p =>
    p.id !== excluded &&
    p.full_name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={md.overlay}>
        <View style={md.sheet}>
          <View style={md.handle} />
          <Text style={md.title}>Select Player</Text>
          <TextInput
            style={md.search}
            placeholder="Search..."
            placeholderTextColor={COLORS.gray}
            value={query}
            onChangeText={setQuery}
          />
          <FlatList
            data={filtered}
            keyExtractor={p => p.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={md.row} onPress={() => { onSelect(item); onClose(); }}>
                {item.profile_pic
                  ? <Image source={{ uri: item.profile_pic }} style={md.avatar} />
                  : <View style={[md.avatar, md.avatarFallback]}>
                      <Text style={md.initial}>{item.full_name?.[0]}</Text>
                    </View>
                }
                <View>
                  <Text style={md.name}>{item.full_name}</Text>
                  <Text style={md.type}>{item.player_type}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={md.empty}>No players found</Text>}
          />
          <TouchableOpacity style={md.closeBtn} onPress={onClose}>
            <Text style={md.closeTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ── Avatar Select Card ────────────────────────────────────
const AvatarCard = ({ player, side, onPress, COLORS, st }) => (
  <TouchableOpacity style={[st.avatarCard, side === 'left' && { alignItems: 'flex-start' }, side === 'right' && { alignItems: 'flex-end' }]}
    onPress={onPress}>
    {player
      ? <>
          {player.profile_pic
            ? <Image source={{ uri: player.profile_pic }} style={st.avImg} />
            : <View style={[st.avImg, st.avFallback]}>
                <Text style={st.avInit}>{player.full_name?.[0]}</Text>
              </View>
          }
          <Text style={st.avName} numberOfLines={2}>{player.full_name}</Text>
          <Text style={st.avType}>{player.player_type}</Text>
        </>
      : <View style={st.avPlaceholder}>
          <Icon name="account-plus" size={30} color={COLORS.gray} />
          <Text style={st.avPlaceholderTxt}>Select</Text>
        </View>
    }
  </TouchableOpacity>
);

// ── Compare Row ───────────────────────────────────────────
const CompareRow = ({ label, valA, valB, higherWins, st }) => {
  const a = parseFloat(valA) || 0;
  const b = parseFloat(valB) || 0;
  const aWins = higherWins ? a > b : (a < b && a > 0);
  const bWins = higherWins ? b > a : (b < a && b > 0);

  return (
    <View style={st.cRow}>
      <Text style={[st.cVal, { textAlign: 'right' }, aWins && st.cWinner]}>{valA ?? '—'}</Text>
      <Text style={st.cLabel}>{label}</Text>
      <Text style={[st.cVal, { textAlign: 'left' }, bWins && st.cWinner]}>{valB ?? '—'}</Text>
    </View>
  );
};

// ── Main ──────────────────────────────────────────────────
const PlayerCompareScreen = ({ route, navigation }) => {
  const { colors: COLORS } = useTheme();
  const st = useMemo(() => getStStyles(COLORS), [COLORS]);
  const md = useMemo(() => getMdStyles(COLORS), [COLORS]);

  const { preloadId } = route?.params || {};

  const [playerA, setPlayerA] = useState(null);
  const [playerB, setPlayerB] = useState(null);
  const [statsA,  setStatsA]  = useState(null);
  const [statsB,  setStatsB]  = useState(null);
  const [bwlA,    setBwlA]    = useState(null);
  const [bwlB,    setBwlB]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [picker,  setPicker]  = useState(null); // 'A' | 'B' | null

  // If navigated from PlayerProfile, preload that player as A
  useEffect(() => {
    if (preloadId && !playerA) {
      (async () => {
        const players = await getAllPlayers();
        const p = players.find(x => x.id === preloadId);
        if (p) selectPlayer('A', p);
      })();
    }
  }, [preloadId]);

  const loadStats = async (id) => {
    const [bat, bwl] = await Promise.all([
      getFullPlayerStats(id),
      getFullBowlingStats(id),
    ]);
    return { bat, bwl };
  };

  const selectPlayer = async (side, player) => {
    setLoading(true);
    const { bat, bwl } = await loadStats(player.id);
    if (side === 'A') { setPlayerA(player); setStatsA(bat); setBwlA(bwl); }
    else              { setPlayerB(player); setStatsB(bat); setBwlB(bwl); }
    setLoading(false);
  };

  const avgDisp = (stats) => {
    if (!stats) return '—';
    return stats.outs > 0
      ? (stats.total_runs / stats.outs).toFixed(1)
      : (stats.total_runs || '—');
  };

  const srDisp = (stats) => {
    if (!stats || !stats.total_balls) return '—';
    return ((stats.total_runs / stats.total_balls) * 100).toFixed(1);
  };

  const ecoDisp = (bwl) => {
    if (!bwl || !bwl.total_overs) return '—';
    return (bwl.total_runs_conceded / bwl.total_overs).toFixed(1);
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Compare Players</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={st.scroll}>
        {/* Player selectors */}
        <View style={st.selectorRow}>
          <AvatarCard player={playerA} side="left"  onPress={() => setPicker('A')} COLORS={COLORS} st={st} />
          <View style={st.vsCircle}><Text style={st.vsText}>VS</Text></View>
          <AvatarCard player={playerB} side="right" onPress={() => setPicker('B')} COLORS={COLORS} st={st} />
        </View>

        {loading && <ActivityIndicator color={COLORS.gold} style={{ marginVertical: 20 }} />}

        {playerA && playerB && !loading && (
          <>
            {/* Batting Comparison */}
            <View style={st.section}>
              <Text style={st.sectionTitle}>🏏 Batting</Text>
              <CompareRow label="Innings"     valA={statsA?.batting_innings} valB={statsB?.batting_innings} higherWins st={st} />
              <CompareRow label="Runs"        valA={statsA?.total_runs}      valB={statsB?.total_runs}      higherWins st={st} />
              <CompareRow label="Average"     valA={avgDisp(statsA)}         valB={avgDisp(statsB)}         higherWins st={st} />
              <CompareRow label="Strike Rate" valA={srDisp(statsA)}          valB={srDisp(statsB)}          higherWins st={st} />
              <CompareRow label="Highest"     valA={statsA?.highest_score}   valB={statsB?.highest_score}   higherWins st={st} />
              <CompareRow label="100s"        valA={statsA?.hundreds}        valB={statsB?.hundreds}        higherWins st={st} />
              <CompareRow label="50s"         valA={statsA?.fifties}         valB={statsB?.fifties}         higherWins st={st} />
              <CompareRow label="Sixes"       valA={statsA?.total_sixes}     valB={statsB?.total_sixes}     higherWins st={st} />
              <CompareRow label="Fours"       valA={statsA?.total_fours}     valB={statsB?.total_fours}     higherWins st={st} />
              <CompareRow label="Ducks"       valA={statsA?.ducks}           valB={statsB?.ducks}           higherWins={false} st={st} />
            </View>

            {/* Bowling Comparison */}
            <View style={st.section}>
              <Text style={st.sectionTitle}>🎯 Bowling</Text>
              <CompareRow label="Wickets"     valA={bwlA?.total_wickets}       valB={bwlB?.total_wickets}       higherWins st={st} />
              <CompareRow label="Economy"     valA={ecoDisp(bwlA)}             valB={ecoDisp(bwlB)}             higherWins={false} st={st} />
              <CompareRow label="Overs"       valA={bwlA?.total_overs}         valB={bwlB?.total_overs}         higherWins st={st} />
              <CompareRow label="Runs Given"  valA={bwlA?.total_runs_conceded} valB={bwlB?.total_runs_conceded} higherWins={false} st={st} />
              <CompareRow label="Maidens"     valA={bwlA?.total_maidens}       valB={bwlB?.total_maidens}       higherWins st={st} />
              <CompareRow label="Avg Wickets" valA={bwlA?.avg_wickets}         valB={bwlB?.avg_wickets}         higherWins st={st} />
            </View>
          </>
        )}

        {(!playerA || !playerB) && !loading && (
          <Text style={st.hint}>Select two players to compare their stats</Text>
        )}
      </ScrollView>

      {/* Pickers */}
      <PlayerPicker
        visible={picker === 'A'}
        excluded={playerB?.id}
        onSelect={p => selectPlayer('A', p)}
        onClose={() => setPicker(null)}
        COLORS={COLORS}
        md={md}
      />
      <PlayerPicker
        visible={picker === 'B'}
        excluded={playerA?.id}
        onSelect={p => selectPlayer('B', p)}
        onClose={() => setPicker(null)}
        COLORS={COLORS}
        md={md}
      />
    </LinearGradient>
  );
};

// ── Style Factories ────────────────────────────────────────
const getStStyles = (COLORS) => StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 4 },
  headerTitle:   { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  scroll:        { padding: 16, paddingBottom: 40 },

  selectorRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarCard:    { flex: 1, alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.cardBorder },
  avImg:         { width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: COLORS.gold },
  avFallback:    { backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center' },
  avInit:        { color: COLORS.white, fontWeight: '900', fontSize: 26 },
  avName:        { color: COLORS.white, fontWeight: '700', fontSize: 12, marginTop: 8, textAlign: 'center' },
  avType:        { color: COLORS.cyan, fontSize: 10, textTransform: 'uppercase', marginTop: 2, textAlign: 'center' },
  avPlaceholder: { alignItems: 'center', justifyContent: 'center', minHeight: 90 },
  avPlaceholderTxt: { color: COLORS.gray, fontSize: 11, marginTop: 6 },
  vsCircle:      { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center', marginHorizontal: 10, borderWidth: 2, borderColor: COLORS.gold },
  vsText:        { color: COLORS.gold, fontWeight: '900', fontSize: 13 },

  section:       { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  sectionTitle:  { color: COLORS.white, fontWeight: '700', fontSize: 14, marginBottom: 12, textAlign: 'center' },

  cRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  cVal:          { flex: 2, color: COLORS.white, fontSize: 13, fontWeight: '600' },
  cLabel:        { flex: 3, color: COLORS.gray, fontSize: 12, textAlign: 'center' },
  cWinner:       { color: COLORS.gold, fontWeight: '800', fontSize: 14 },

  hint:          { color: COLORS.gray, textAlign: 'center', marginTop: 40, fontSize: 14 },
});

const getMdStyles = (COLORS) => StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: COLORS.navy, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '75%' },
  handle:        { width: 40, height: 4, backgroundColor: COLORS.gray, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title:         { color: COLORS.white, fontWeight: '700', fontSize: 16, marginBottom: 12 },
  search:        { backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 44, color: COLORS.white, marginBottom: 12 },
  row:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  avatar:        { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  avatarFallback:{ backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center' },
  initial:       { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  name:          { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  type:          { color: COLORS.gray, fontSize: 12, textTransform: 'capitalize' },
  empty:         { color: COLORS.gray, textAlign: 'center', paddingVertical: 20 },
  closeBtn:      { marginTop: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: COLORS.darkGray, borderRadius: 12 },
  closeTxt:      { color: COLORS.gray, fontWeight: '600', fontSize: 15 },
});

export default PlayerCompareScreen;
