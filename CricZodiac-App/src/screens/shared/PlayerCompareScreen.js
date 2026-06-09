// ============================================================
// CricZodiac — Compare Players
// All data from API (club-scoped). Zero local SQLite.
// Pick 2 players → side-by-side batting + bowling comparison.
// ============================================================

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, FlatList, TextInput, ActivityIndicator,
  Image, RefreshControl, Platform, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

// ── Avatar ─────────────────────────────────────────────────
const Avatar = ({ uri, name, size = 60, color }) => {
  const bg = color || '#2C4BB5';
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.38 }}>
        {name?.[0]?.toUpperCase() || '?'}
      </Text>
    </View>
  );
};

// ── Player type badge ──────────────────────────────────────
const TypeBadge = ({ type, COLORS }) => {
  const colorMap = { batsman: COLORS.cyan, bowler: COLORS.orange, allrounder: COLORS.gold };
  const iconMap  = { batsman: 'cricket', bowler: 'baseball-bat', allrounder: 'star-four-points' };
  const color = colorMap[type] || COLORS.gray;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: color + '22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 }}>
      <Icon name={iconMap[type] || 'account'} size={10} color={color} />
      <Text style={{ color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {type || 'Player'}
      </Text>
    </View>
  );
};

// ── Player selector card ───────────────────────────────────
const SelectorCard = ({ player, side, onPress, COLORS, styles }) => (
  <TouchableOpacity style={styles.selectorCard} onPress={onPress} activeOpacity={0.8}>
    {player ? (
      <>
        <View style={[styles.selectorAvatarWrap, { borderColor: side === 'A' ? COLORS.gold : COLORS.cyan }]}>
          <Avatar uri={player.profile_pic} name={player.full_name} size={58} color={side === 'A' ? '#1a3a6e' : '#1a5a3a'} />
        </View>
        <Text style={styles.selectorName} numberOfLines={2}>{player.full_name}</Text>
        <TypeBadge type={player.player_type} COLORS={COLORS} />
        <TouchableOpacity style={styles.changeBtn} onPress={onPress}>
          <Icon name="pencil-outline" size={11} color={COLORS.gray} />
          <Text style={styles.changeTxt}>Change</Text>
        </TouchableOpacity>
      </>
    ) : (
      <View style={styles.emptySelector}>
        <View style={[styles.addIcon, { borderColor: side === 'A' ? COLORS.gold + '66' : COLORS.cyan + '66' }]}>
          <Icon name="account-plus" size={26} color={side === 'A' ? COLORS.gold : COLORS.cyan} />
        </View>
        <Text style={styles.selectHint}>Tap to select</Text>
      </View>
    )}
  </TouchableOpacity>
);

// ── Compare row ────────────────────────────────────────────
const CompRow = ({ label, valA, valB, higherWins, isLast, COLORS, styles }) => {
  const a = parseFloat(valA);
  const b = parseFloat(valB);
  const hasData = !isNaN(a) && !isNaN(b);
  const aWins = hasData && (higherWins ? a > b : (a < b && a > 0));
  const bWins = hasData && (higherWins ? b > a : (b < a && b > 0));
  const tie   = hasData && a === b;

  return (
    <View style={[styles.compRow, isLast && { borderBottomWidth: 0 }]}>
      {/* Player A value */}
      <View style={[styles.compValWrap, { alignItems: 'flex-end' }]}>
        <Text style={[styles.compVal, aWins && styles.compWinnerA, tie && styles.compTie]}>
          {valA ?? '—'}
        </Text>
        {aWins && <View style={styles.winDot} />}
      </View>

      {/* Label */}
      <View style={styles.compLabelWrap}>
        <Text style={styles.compLabel}>{label}</Text>
        {tie && hasData && <Text style={styles.tieText}>TIE</Text>}
      </View>

      {/* Player B value */}
      <View style={[styles.compValWrap, { alignItems: 'flex-start' }]}>
        {bWins && <View style={[styles.winDot, { backgroundColor: COLORS.cyan }]} />}
        <Text style={[styles.compVal, bWins && styles.compWinnerB, tie && styles.compTie]}>
          {valB ?? '—'}
        </Text>
      </View>
    </View>
  );
};

// ── Section header ─────────────────────────────────────────
const SectionHeader = ({ icon, title, color, styles }) => (
  <View style={[styles.secHeader, { borderLeftColor: color }]}>
    <View style={[styles.secIconWrap, { backgroundColor: color + '22' }]}>
      <Icon name={icon} size={15} color={color} />
    </View>
    <Text style={styles.secTitle}>{title}</Text>
  </View>
);

// ── Player Picker Modal ────────────────────────────────────
const PlayerPicker = ({ visible, onClose, onSelect, excludeId, clubParams, COLORS, styles }) => {
  const [players, setPlayers] = useState([]);
  const [query,   setQuery]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    ApiService.get(API_ENDPOINTS.PLAYERS_LIST, { params: clubParams })
      .then(res => { if (res?.success) setPlayers(res.players ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = players.filter(p =>
    p.id !== excludeId &&
    p.full_name?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Select Player</Text>

          <View style={styles.searchWrap}>
            <Icon name="magnify" size={18} color={COLORS.gray} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players..."
              placeholderTextColor={COLORS.gray}
              value={query}
              onChangeText={setQuery}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Icon name="close-circle" size={16} color={COLORS.gray} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.gold} style={{ marginVertical: 30 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={p => String(p.id)}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerRow} onPress={() => { onSelect(item); onClose(); setQuery(''); }} activeOpacity={0.75}>
                  <Avatar uri={item.profile_pic} name={item.full_name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerName}>{item.full_name}</Text>
                    <Text style={styles.pickerType}>{item.player_type}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={COLORS.gray} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <Icon name="account-off-outline" size={32} color={COLORS.gray} />
                  <Text style={[styles.pickerType, { marginTop: 8 }]}>No players found</Text>
                </View>
              }
              style={{ maxHeight: 360 }}
            />
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ── Main Screen ────────────────────────────────────────────
const PlayerCompareScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const { activeClub, viewingAsClub } = useAuth();
  const effectiveClub    = viewingAsClub ?? activeClub;
  const isSuperAdminView = !!viewingAsClub;
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const clubParams = isSuperAdminView && effectiveClub?.id ? { club_id: effectiveClub.id } : {};

  const [playerA,   setPlayerA]   = useState(null);
  const [playerB,   setPlayerB]   = useState(null);
  const [compared,  setCompared]  = useState(null); // API response
  const [loading,   setLoading]   = useState(false);
  const [refreshing,setRefreshing]= useState(false);
  const [picker,    setPicker]    = useState(null); // 'A' | 'B' | null

  const fetchCompare = useCallback(async (pA, pB) => {
    if (!pA || !pB) return;
    setLoading(true);
    try {
      const res = await ApiService.get(API_ENDPOINTS.PLAYERS_COMPARE, {
        params: { player_a: pA.id, player_b: pB.id, ...clubParams },
      });
      if (res?.success) setCompared(res);
    } catch (_) {}
    finally { setLoading(false); }
  }, [clubParams]);

  const selectPlayer = useCallback((side, player) => {
    if (side === 'A') {
      setPlayerA(player);
      setCompared(null);
      if (playerB) fetchCompare(player, playerB);
    } else {
      setPlayerB(player);
      setCompared(null);
      if (playerA) fetchCompare(playerA, player);
    }
  }, [playerA, playerB, fetchCompare]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCompare(playerA, playerB);
    setRefreshing(false);
  }, [playerA, playerB, fetchCompare]);

  const a = compared?.player_a;
  const b = compared?.player_b;
  const batA = a?.batting || {};
  const batB = b?.batting || {};
  const bwlA = a?.bowling || {};
  const bwlB = b?.bowling || {};

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Icon name="arrow-left" size={20} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Compare Players</Text>
        {(playerA || playerB) ? (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => { setPlayerA(null); setPlayerB(null); setCompared(null); }}
            activeOpacity={0.7}
          >
            <Icon name="refresh" size={16} color={COLORS.danger} />
            <Text style={styles.resetTxt}>Reset</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 60 }} />}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />
        }
      >
        {/* ── Selector Row ── */}
        <View style={styles.selectorRow}>
          <SelectorCard player={playerA} side="A" onPress={() => setPicker('A')} COLORS={COLORS} styles={styles} />

          {/* VS badge */}
          <View style={styles.vsBadge}>
            <View style={[styles.vsLine, { backgroundColor: COLORS.gold + '44' }]} />
            <View style={styles.vsCircle}>
              <Text style={styles.vsText}>VS</Text>
            </View>
            <View style={[styles.vsLine, { backgroundColor: COLORS.cyan + '44' }]} />
          </View>

          <SelectorCard player={playerB} side="B" onPress={() => setPicker('B')} COLORS={COLORS} styles={styles} />
        </View>

        {/* ── Column headers (player names) ── */}
        {playerA && playerB && (
          <View style={styles.colHeaders}>
            <Text style={[styles.colName, { color: COLORS.gold, textAlign: 'right' }]} numberOfLines={1}>
              {playerA.full_name?.split(' ')[0]}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.colName, { color: COLORS.cyan, textAlign: 'left' }]} numberOfLines={1}>
              {playerB.full_name?.split(' ')[0]}
            </Text>
          </View>
        )}

        {/* ── Loading ── */}
        {loading && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={COLORS.gold} />
            <Text style={[styles.hint, { marginTop: 12 }]}>Loading stats...</Text>
          </View>
        )}

        {/* ── Comparison data ── */}
        {compared && !loading && (
          <>
            {/* Batting */}
            <View style={styles.compCard}>
              <SectionHeader icon="cricket" title="Batting" color={COLORS.gold} styles={styles} />
              <CompRow label="Innings"     valA={batA.batting_innings} valB={batB.batting_innings} higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Runs"        valA={batA.total_runs}      valB={batB.total_runs}      higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Average"     valA={batA.average}         valB={batB.average}         higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Strike Rate" valA={batA.strike_rate}     valB={batB.strike_rate}     higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Highest"     valA={batA.highest_score}   valB={batB.highest_score}   higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="50s"         valA={batA.fifties}         valB={batB.fifties}         higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="100s"        valA={batA.hundreds}        valB={batB.hundreds}        higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Sixes"       valA={batA.total_sixes}     valB={batB.total_sixes}     higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Fours"       valA={batA.total_fours}     valB={batB.total_fours}     higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Ducks"       valA={batA.ducks}           valB={batB.ducks}           higherWins={false} COLORS={COLORS} styles={styles} isLast />
            </View>

            {/* Bowling */}
            <View style={styles.compCard}>
              <SectionHeader icon="bullseye-arrow" title="Bowling" color={COLORS.cyan} styles={styles} />
              <CompRow label="Innings"     valA={bwlA.bowling_innings}    valB={bwlB.bowling_innings}    higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Wickets"     valA={bwlA.total_wickets}      valB={bwlB.total_wickets}      higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Economy"     valA={bwlA.economy}            valB={bwlB.economy}            higherWins={false} COLORS={COLORS} styles={styles} />
              <CompRow label="Overs"       valA={bwlA.total_overs}        valB={bwlB.total_overs}        higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Runs Given"  valA={bwlA.total_runs_conceded}valB={bwlB.total_runs_conceded}higherWins={false} COLORS={COLORS} styles={styles} />
              <CompRow label="Maidens"     valA={bwlA.total_maidens}      valB={bwlB.total_maidens}      higherWins COLORS={COLORS} styles={styles} />
              <CompRow label="Avg Wickets" valA={bwlA.avg_wickets}        valB={bwlB.avg_wickets}        higherWins COLORS={COLORS} styles={styles} isLast />
            </View>
          </>
        )}

        {/* ── Hint when no players selected ── */}
        {!playerA && !playerB && !loading && (
          <View style={styles.hintWrap}>
            <Icon name="compare" size={48} color={COLORS.gold + '55'} />
            <Text style={styles.hint}>Select two players to compare their stats</Text>
          </View>
        )}

        {/* ── Partial selection hint ── */}
        {((playerA && !playerB) || (!playerA && playerB)) && !loading && (
          <View style={styles.hintWrap}>
            <Icon name="account-question-outline" size={38} color={COLORS.gray} />
            <Text style={styles.hint}>Now select the second player</Text>
          </View>
        )}
      </ScrollView>

      {/* Pickers */}
      <PlayerPicker
        visible={picker === 'A'}
        excludeId={playerB?.id}
        onSelect={p => selectPlayer('A', p)}
        onClose={() => setPicker(null)}
        clubParams={clubParams}
        COLORS={COLORS}
        styles={styles}
      />
      <PlayerPicker
        visible={picker === 'B'}
        excludeId={playerA?.id}
        onSelect={p => selectPlayer('B', p)}
        onClose={() => setPicker(null)}
        clubParams={clubParams}
        COLORS={COLORS}
        styles={styles}
      />
    </LinearGradient>
  );
};

// ── Styles ─────────────────────────────────────────────────
const getStyles = (COLORS) => StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 10, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  headerTitle: { color: COLORS.white, fontSize: 18, fontWeight: '800' },
  resetBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.danger + '22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  resetTxt:    { color: COLORS.danger, fontSize: 11, fontWeight: '700' },

  scroll:      { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },

  // Selector row
  selectorRow:      { flexDirection: 'row', alignItems: 'center', gap: 0 },
  selectorCard:     { flex: 1, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder, minHeight: 140 },
  selectorAvatarWrap:{ borderRadius: 35, borderWidth: 2.5, padding: 2, marginBottom: 8 },
  selectorName:     { color: COLORS.white, fontWeight: '700', fontSize: 12, textAlign: 'center', marginBottom: 2 },
  emptySelector:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  addIcon:          { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  selectHint:       { color: COLORS.gray, fontSize: 11, fontWeight: '600' },
  changeBtn:        { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6, backgroundColor: COLORS.darkGray, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  changeTxt:        { color: COLORS.gray, fontSize: 10, fontWeight: '600' },

  // VS badge
  vsBadge:     { width: 52, alignItems: 'center', gap: 4 },
  vsLine:      { width: 1.5, flex: 1, borderRadius: 1 },
  vsCircle:    { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.gold },
  vsText:      { color: COLORS.gold, fontWeight: '900', fontSize: 12, letterSpacing: 1 },

  // Column name headers
  colHeaders:  { flexDirection: 'row', paddingHorizontal: 4, alignItems: 'center' },
  colName:     { flex: 2, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

  // Section card
  compCard:    { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden' },
  secHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  secIconWrap: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  secTitle:    { color: COLORS.white, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },

  // Compare row
  compRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder + '66' },
  compValWrap: { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  compVal:     { color: COLORS.white, fontSize: 14, fontWeight: '600' },
  compWinnerA: { color: COLORS.gold, fontWeight: '900', fontSize: 15 },
  compWinnerB: { color: COLORS.cyan, fontWeight: '900', fontSize: 15 },
  compTie:     { color: COLORS.purple, fontWeight: '800' },
  compLabelWrap:{ flex: 3, alignItems: 'center' },
  compLabel:   { color: COLORS.gray, fontSize: 11, textAlign: 'center' },
  tieText:     { color: COLORS.purple, fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 1 },
  winDot:      { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.gold },

  // Hint
  hintWrap:    { alignItems: 'center', paddingVertical: 50, gap: 12 },
  hint:        { color: COLORS.gray, fontSize: 14, textAlign: 'center' },

  // Modal
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: COLORS.navy, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, borderTopWidth: 1, borderColor: COLORS.cardBorder },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.gray + '55', borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle:  { color: COLORS.white, fontWeight: '800', fontSize: 16, marginBottom: 14 },
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: 12 },
  searchInput: { flex: 1, color: COLORS.white, fontSize: 14, padding: 0 },
  pickerRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder + '55' },
  pickerName:  { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  pickerType:  { color: COLORS.gray, fontSize: 11, textTransform: 'capitalize', marginTop: 2 },
  cancelBtn:   { marginTop: 14, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  cancelTxt:   { color: COLORS.gray, fontWeight: '700', fontSize: 14 },
});

export default PlayerCompareScreen;
