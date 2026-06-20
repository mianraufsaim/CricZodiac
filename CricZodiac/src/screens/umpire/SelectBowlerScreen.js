import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { getTeamPlayers, upsertTeamPlayersFromServer, getBowlingScorecard } from '../../database/queries/matchQueries';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';
import uuid from 'react-native-uuid';

const getPlayerDisplayName = (player) => (
  player?.full_name ||
  player?.name ||
  player?.user_name ||
  player?.player_name ||
  player?.user?.name ||
  ''
).trim();

const isMissingPlayerName = (name) => !name || name.toLowerCase() === 'unknown';

const SelectBowlerScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const {
    inningsId,
    team,
    currentBowlerId,
    requestId,
    returnScreen = 'LiveScoring',
    resetOver = false,
    maxOversPerBowler = 0,
  } = route.params;
  const [players, setPlayers]             = useState([]);
  const [selected, setSelected]           = useState(null);
  const [searchQuery, setSearchQuery]     = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
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
      console.warn('[SelectBowler] API fetch failed, falling back to SQLite:', apiErr?.message);
      // 2. Fallback to SQLite if API fails
      teamPlayers = await loadLocalTeamPlayers();
    }

    // Build bowler overs map from bowling scorecard (to enforce max overs per bowler)
    let bowlerOversMap = {};
    if (maxOversPerBowler > 0 && inningsId) {
      try {
        const scorecard = await getBowlingScorecard(inningsId);
        for (const row of scorecard) {
          // Use balls_bowled integer (reliable) to derive completed overs
          bowlerOversMap[row.player_id] = Math.floor((row.balls_bowled || 0) / 6);
        }
      } catch (_) {}
    }

    const availablePlayers = [];
    for (const tp of teamPlayers) {
      const player = {
        id:          tp.player_id,
        full_name:   getPlayerDisplayName(tp) || 'Unknown',
        player_type: tp.player_type || 'allrounder',
      };
      if (maxOversPerBowler > 0) {
        const completedOvers = bowlerOversMap[player.id] ?? 0;
        if (completedOvers >= maxOversPerBowler) continue;
      }
      availablePlayers.push(player);
    }

    setPlayers(availablePlayers);
  };

  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return players;
    const q = searchQuery.toLowerCase();
    return players.filter(p =>
      p.full_name?.toLowerCase().includes(q) ||
      p.player_type?.toLowerCase().includes(q)
    );
  }, [players, searchQuery]);

  const confirm = () => {
    if (!selected) return;
    navigation.navigate({
      name: returnScreen,
      params: {
        bowlerSelection: {
          requestId: requestId || uuid.v4(),
          bowler: selected,
          resetOver,
        },
      },
      merge: true,
    });
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Bowler</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={confirm} disabled={!selected} style={[styles.doneBtn, !selected && styles.doneBtnDisabled]}>
            <Icon name="check" size={18} color={COLORS.navy} />
            <Text style={styles.doneTxt}>DONE</Text>
          </TouchableOpacity>
        </View>
      </View>

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
        <Icon name="magnify" size={19} color={COLORS.cyan} style={{ marginLeft: 10 }} />
      </View>

      <FlatList
        data={filteredPlayers}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {searchQuery.trim() ? `No bowlers found for "${searchQuery}"` : 'No players available'}
          </Text>
        }
        renderItem={({ item }) => {
          const isCurrent = item.id === currentBowlerId;
          return (
            <TouchableOpacity
              style={[styles.row, selected?.id === item.id && styles.rowSelected, isCurrent && styles.rowCurrent]}
              onPress={() => !isCurrent && setSelected(item)}
              disabled={isCurrent}
            >
              <View style={styles.avatar}><Text style={styles.avatarText}>{(item.full_name || '?')[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name}</Text>
                <Text style={styles.type}>{item.player_type}</Text>
              </View>
              {isCurrent  && <Text style={styles.currentBadge}>PREV OVER</Text>}
              {selected?.id === item.id && <Text style={styles.selectedBadge}>SELECTED</Text>}
            </TouchableOpacity>
          );
        }}
      />
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 12 },
  headerRight:    { alignItems: 'flex-end' },
  searchBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 14, height: 48, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  searchInput:    { flex: 1, color: COLORS.white, fontSize: 14 },
  emptyText:      { color: COLORS.gray, textAlign: 'center', marginTop: 40, fontSize: 14 },
  title:          { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  doneBtn:        { minWidth: 94, minHeight: 46, borderRadius: 10, backgroundColor: COLORS.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14 },
  doneBtnDisabled:{ opacity: 0.38 },
  doneTxt:        { color: COLORS.navy, fontWeight: '900', fontSize: 14 },
  row:            { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  rowSelected:    { borderColor: COLORS.cyan },
  rowCurrent:     { opacity: 0.4 },
  avatar:         { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText:     { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  name:           { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  type:           { color: COLORS.gray, fontSize: 12 },
  currentBadge:   { color: COLORS.gray, fontSize: 11, fontWeight: '700' },
  selectedBadge:  { color: COLORS.cyan, fontWeight: '800', fontSize: 12 },
});

export default SelectBowlerScreen;
