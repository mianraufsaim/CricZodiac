import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, TextInput, Animated } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { getTeamPlayers } from '../../database/queries/matchQueries';
import { getBattingScorecard } from '../../database/queries/matchQueries';

const SelectBatsmanScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { inningsId, team, onSelect, existingStrikerId, existingNonStrikerId, mode } = route.params;
  const [players, setPlayers]   = useState([]);
  const [striker, setStriker]   = useState(null);
  const [nonStriker, setNonStriker] = useState(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchRef  = useRef(null);

  useEffect(() => { load(); }, []);

  const toggleSearch = () => {
    const opening = !searchVisible;
    setSearchVisible(opening);
    if (opening) setSearchQuery('');
    Animated.timing(searchAnim, {
      toValue: opening ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => { if (opening) searchRef.current?.focus(); });
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
    const teamPlayers = await getTeamPlayers(team.id);
    const scorecard   = await getBattingScorecard(inningsId);
    const outPlayerIds = new Set();
    for (const score of scorecard) {
      if (score.is_out) outPlayerIds.add(score.player_id);
    }

    const availablePlayers = [];
    for (const player of teamPlayers) {
      if (
        player.player_id === existingStrikerId ||
        player.player_id === existingNonStrikerId ||
        outPlayerIds.has(player.player_id)
      ) {
        continue;
      }

      availablePlayers.push({
        id: player.player_id,
        full_name: player.full_name,
        player_type: player.player_type,
      });
    }

    setPlayers(availablePlayers);
  };

  const handleConfirm = () => {
    if (mode === 'new_batsman') {
      if (!striker) { Alert.alert('Select a batsman'); return; }
      onSelect?.(striker);
      navigation.goBack();
    } else {
      if (!striker) { Alert.alert('Selection Incomplete', 'Please select the Striker.'); return; }
      if (!nonStriker) { Alert.alert('Selection Incomplete', 'Please select the Non-Striker.'); return; }
      onSelect?.(striker, nonStriker);
      navigation.goBack();
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

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>{mode === 'new_batsman' ? 'New Batsman' : 'Select Batsmen'}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleSearch} style={styles.searchIconBtn}>
            <Icon name={searchVisible ? 'close' : 'magnify'} size={22} color={searchVisible ? COLORS.danger : COLORS.gold} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleConfirm}>
            <Text style={[
              styles.confirm,
              (mode === 'new_batsman' ? !striker : (!striker || !nonStriker)) && { opacity: 0.4 },
            ]}>CONFIRM</Text>
          </TouchableOpacity>
        </View>
      </View>

      {searchVisible && (
        <Animated.View style={[styles.searchBar, { opacity: searchAnim }]}>
          <Icon name="magnify" size={18} color={COLORS.gray} style={{ marginRight: 8 }} />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder="Search players..."
            placeholderTextColor={COLORS.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={16} color={COLORS.gray} />
            </TouchableOpacity>
          )}
        </Animated.View>
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
                <Text style={styles.avatarText}>{item.full_name[0]}</Text>
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
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  searchIconBtn: { padding: 2 },
  searchBar:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 14, height: 44, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  searchInput:   { flex: 1, color: COLORS.white, fontSize: 14 },
  emptyText:     { color: COLORS.gray, textAlign: 'center', marginTop: 40, fontSize: 14 },
  title:         { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  confirm:       { color: COLORS.gold, fontWeight: '800', fontSize: 15 },
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
