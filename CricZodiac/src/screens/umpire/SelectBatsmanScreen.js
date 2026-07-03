import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import {
  getTeamPlayers,
  upsertTeamPlayersFromServer,
  resumeRetiredHurtBatsman,
  getBattingScorecard,
  getBallsWithPlayers,
} from '../../database/queries/matchQueries';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';
import uuid from 'react-native-uuid';
import { showAlert } from '../../utils/toast';

const getPlayerDisplayName = (player) => (
  player?.full_name ||
  player?.name ||
  player?.user_name ||
  player?.player_name ||
  player?.user?.name ||
  ''
).trim();

const isMissingPlayerName = (name) => !name || name.toLowerCase() === 'unknown';
const isRetiredHurt = (dismissalType) => ['retired', 'retired_hurt'].includes(
  String(dismissalType || '').toLowerCase()
);

const scoreFromBalls = (balls = []) => {
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  for (const ball of balls) {
    runs += Number(ball.runs_scored || 0) + Number(ball.extra_runs || 0);
    wickets += Number(ball.is_wicket || 0) === 1 ? 1 : 0;
    legalBalls += Number(ball.is_valid_ball ?? 1) === 1 ? 1 : 0;
  }
  return {
    runs,
    wickets,
    overs: `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`,
  };
};

const SelectBatsmanScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const {
    inningsId,
    team,
    existingStrikerId,
    existingNonStrikerId,
    mode: modeParam,
    requestId,
    returnScreen = 'LiveScoring',
    selectionType,
  } = route.params;
  // mode can be passed explicitly or inferred from selectionType
  const mode = modeParam || (selectionType === 'new_batsman' || selectionType === 'new_non_striker' ? 'new_batsman' : undefined);
  const [players, setPlayers]   = useState([]);
  const [striker, setStriker]   = useState(null);
  const [nonStriker, setNonStriker] = useState(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [scoreInfo, setScoreInfo] = useState(null);

  useEffect(() => { load(); }, []);

  const loadScoreInfo = async () => {
    if (!inningsId) return;
    try {
      const balls = await getBallsWithPlayers(inningsId);
      setScoreInfo(scoreFromBalls(balls || []));
    } catch (_) {}
  };

  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return players;
    const q = searchQuery.toLowerCase();
    return players.filter(p =>
      p.full_name?.toLowerCase().includes(q) ||
      p.player_type?.toLowerCase().includes(q)
    );
  }, [players, searchQuery]);

  const load = async () => {
    loadScoreInfo();
    let teamPlayers = [];
    const loadLocalTeamPlayers = async () => {
      const local = await getTeamPlayers(team.id);
      return (local || []).map(tp => ({
        player_id:   tp.player_id,
        full_name:   getPlayerDisplayName(tp) || 'Unknown',
        player_type: tp.player_type || 'allrounder',
      }));
    };

    // 1. Fetch from API server first
    try {
      const qParts = [`team_id=${encodeURIComponent(team.id)}`];
      if (team.match_id)   qParts.push(`match_id=${encodeURIComponent(team.match_id)}`);
      if (team.team_label) qParts.push(`team_label=${encodeURIComponent(team.team_label)}`);
      if (team.club_id)    qParts.push(`club_id=${encodeURIComponent(team.club_id)}`);

      const res = await ApiService.get(`${API_ENDPOINTS.TEAMS_PLAYERS}?${qParts.join('&')}`);
      const serverList = res?.players || res?.data?.players || [];

      if (serverList.length) {
        // Build list directly from server response
        teamPlayers = serverList.map(sp => ({
          player_id:   sp.player_uuid || sp.player_local_id || String(sp.player_id),
          full_name:   getPlayerDisplayName(sp) || 'Unknown',
          player_type: sp.player_type || 'allrounder',
        }));
        // Save to SQLite in background
        const cacheWrite = upsertTeamPlayersFromServer(serverList, team.id).catch(() => {});

        if (teamPlayers.some(player => isMissingPlayerName(player.full_name))) {
          await cacheWrite;
          const localPlayers = await loadLocalTeamPlayers().catch(() => []);
          const localById = new Map(localPlayers.map(player => [String(player.player_id), player]));
          teamPlayers = teamPlayers.map(player => {
            if (!isMissingPlayerName(player.full_name)) return player;
            const localPlayer = localById.get(String(player.player_id));
            return {
              ...player,
              full_name: getPlayerDisplayName(localPlayer) || player.full_name,
              player_type: localPlayer?.player_type || player.player_type,
            };
          });
        }
      } else {
        teamPlayers = await loadLocalTeamPlayers();
      }
    } catch (apiErr) {
      console.warn('[SelectBatsman] API fetch failed, falling back to SQLite:', apiErr?.message);
      // 2. Fallback to SQLite if API fails
      teamPlayers = await loadLocalTeamPlayers();
    }

    // 3. Filter out already-batting and genuinely dismissed players.
    // A retired-hurt batter remains eligible to return later in the innings.
    const scorecard = await getBattingScorecard(inningsId);
    const outPlayerIds = new Set();
    const retiredHurtPlayerIds = new Set();
    for (const score of scorecard) {
      if (isRetiredHurt(score.dismissal_type)) {
        retiredHurtPlayerIds.add(String(score.player_id));
      } else if (Number(score.is_out) === 1) {
        outPlayerIds.add(String(score.player_id));
      }
    }

    const availablePlayers = [];
    for (const player of teamPlayers) {
      if (
        String(player.player_id) === String(existingStrikerId) ||
        String(player.player_id) === String(existingNonStrikerId) ||
        outPlayerIds.has(String(player.player_id))
      ) continue;

      availablePlayers.push({
        id:                         player.player_id,
        full_name:                  getPlayerDisplayName(player) || 'Unknown',
        player_type:                player.player_type || 'allrounder',
        isReturningFromRetiredHurt: retiredHurtPlayerIds.has(String(player.player_id)),
      });
    }

    setPlayers(availablePlayers);
  };

  const resumeIfReturningFromRetiredHurt = async (batter) => {
    if (!batter?.isReturningFromRetiredHurt) return;
    await resumeRetiredHurtBatsman(inningsId, batter.id);
  };

  const handleConfirm = async () => {
    if (mode === 'new_batsman') {
      if (!striker) { showAlert('Select a batsman'); return; }
      try {
        await resumeIfReturningFromRetiredHurt(striker);
      } catch (error) {
        showAlert('Unable to Resume Batter', error?.message || 'Please try selecting the batter again.');
        return;
      }
      // Preserve the original selectionType so LiveScoring knows whether to update
      // striker or non-striker (e.g. 'new_non_striker' for run-out of non-striker)
      navigation.navigate({
        name: returnScreen,
        params: {
          batsmanSelection: {
            requestId: requestId || uuid.v4(),
            type: selectionType || 'new_batsman',   // ← was always 'new_batsman', now preserves type
            striker,
          },
        },
        merge: true,
      });
    } else {
      if (!striker) { showAlert('Selection Incomplete', 'Please select the Striker.'); return; }
      if (!nonStriker) { showAlert('Selection Incomplete', 'Please select the Non-Striker.'); return; }
      try {
        await Promise.all([
          resumeIfReturningFromRetiredHurt(striker),
          resumeIfReturningFromRetiredHurt(nonStriker),
        ]);
      } catch (error) {
        showAlert('Unable to Resume Batter', error?.message || 'Please try selecting the batters again.');
        return;
      }
      navigation.navigate({
        name: returnScreen,
        params: {
          batsmanSelection: {
            requestId: requestId || uuid.v4(),
            type: selectionType || 'opening_pair',
            striker,
            nonStriker,
          },
        },
        merge: true,
      });
    }
  };

  const handlePlayerTap = (item) => {
    if (mode === 'new_batsman') { setStriker(item); return; }

    // Tapping the current striker → deselect
    if (striker?.id === item.id) { setStriker(null); return; }
    // Tapping the current non-striker → deselect
    if (nonStriker?.id === item.id) { setNonStriker(null); return; }

    // Fill the first empty slot (striker first, then non-striker)
    if (!striker)    { setStriker(item);    return; }
    if (!nonStriker) { setNonStriker(item); return; }

    // Both full → replace striker (non-striker stays)
    setStriker(item);
  };

  const canConfirm = mode === 'new_batsman' ? !!striker : !!striker && !!nonStriker;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>{mode === 'new_batsman' ? 'New Batsman' : 'Select Batsmen'}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!canConfirm}
            style={[styles.doneBtn, !canConfirm && styles.doneBtnDisabled]}
          >
            <Icon name="check" size={18} color={COLORS.navy} />
            <Text style={styles.doneTxt}>DONE</Text>
          </TouchableOpacity>
        </View>
      </View>

      {scoreInfo && (
        <View style={styles.scoreStrip}>
          <View>
            <Text style={styles.scoreLabel}>CURRENT SCORE</Text>
            <Text style={styles.scoreValue}>{scoreInfo.runs}/{scoreInfo.wickets}</Text>
          </View>
          <View style={styles.scoreMetaPill}>
            <Icon name="cricket" size={14} color={COLORS.gold} />
            <Text style={styles.scoreMeta}>Ov {scoreInfo.overs}</Text>
          </View>
        </View>
      )}

      {mode !== 'new_batsman' && (
        <View style={styles.selectedRow}>
          <TouchableOpacity
            style={[styles.selectedChip, striker && { borderColor: COLORS.gold }]}
            onPress={() => striker && setStriker(null)}
            activeOpacity={striker ? 0.6 : 1}
          >
            <View style={styles.selectedChipHeader}>
              <Text style={styles.selectedLabel}>⚡ STRIKER</Text>
              {striker && <Icon name="close-circle" size={14} color={COLORS.gray} />}
            </View>
            <Text style={[styles.selectedName, !striker && { color: COLORS.gray }]}>
              {striker?.full_name || 'Tap to select'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectedChip, nonStriker && { borderColor: COLORS.purple }]}
            onPress={() => nonStriker && setNonStriker(null)}
            activeOpacity={nonStriker ? 0.6 : 1}
          >
            <View style={styles.selectedChipHeader}>
              <Text style={styles.selectedLabel}>🏃 NON-STRIKER</Text>
              {nonStriker && <Icon name="close-circle" size={14} color={COLORS.gray} />}
            </View>
            <Text style={[styles.selectedName, !nonStriker && { color: COLORS.gray }]}>
              {nonStriker?.full_name || 'Tap to select'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search here"
          placeholderTextColor={COLORS.gray}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
            <Icon name="close-circle" size={16} color={COLORS.gray} />
          </TouchableOpacity>
        )}
        <Icon name="magnify" size={19} color={COLORS.gold} style={{ marginLeft: 10 }} />
      </View>

      <FlatList
        data={filteredPlayers}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {searchQuery.trim() ? `No players found for "${searchQuery}"` : 'No players available'}
          </Text>
        }
        renderItem={({ item }) => {
          const isStriker    = striker?.id === item.id;
          const isNonStriker = nonStriker?.id === item.id;
          return (
            <TouchableOpacity
              style={[styles.row, isStriker && styles.rowStriker, isNonStriker && styles.rowNonStriker]}
              onPress={() => handlePlayerTap(item)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.full_name || '?')[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name}</Text>
                <Text style={styles.type}>{item.player_type}</Text>
              </View>
              {isStriker    && <Text style={styles.badge}>STRIKER</Text>}
              {isNonStriker && <Text style={[styles.badge, { backgroundColor: COLORS.purple }]}>NON-STR</Text>}
            </TouchableOpacity>
          );
        }}
      />
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 12 },
  headerRight:   { alignItems: 'flex-end' },
  searchBar:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 14, height: 48, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  searchInput:   { flex: 1, color: COLORS.white, fontSize: 14 },
  emptyText:     { color: COLORS.gray, textAlign: 'center', marginTop: 40, fontSize: 14 },
  title:         { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  doneBtn:       { minWidth: 94, minHeight: 46, borderRadius: 10, backgroundColor: COLORS.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14 },
  doneBtnDisabled: { opacity: 0.38 },
  doneTxt:       { color: COLORS.navy, fontWeight: '900', fontSize: 14 },
  scoreStrip:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.gold + '55' },
  scoreLabel:    { color: COLORS.gray, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  scoreValue:    { color: COLORS.white, fontSize: 24, fontWeight: '900', marginTop: 2 },
  scoreMetaPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: COLORS.gold + '14', borderWidth: 1, borderColor: COLORS.gold + '44' },
  scoreMeta:     { color: COLORS.gold, fontSize: 12, fontWeight: '900' },
  selectedRow:  { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  selectedChip:       { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  selectedChipHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  selectedLabel:      { color: COLORS.gray, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  selectedName:       { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  rowStriker:   { borderColor: COLORS.gold, backgroundColor: COLORS.darkGray },
  rowNonStriker: { borderColor: COLORS.purple },
  avatar:       { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText:   { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  name:         { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  type:         { color: COLORS.gray, fontSize: 12 },
  badge:        { backgroundColor: COLORS.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, color: COLORS.navy, fontWeight: '800', fontSize: 11 },
});

export default SelectBatsmanScreen;
