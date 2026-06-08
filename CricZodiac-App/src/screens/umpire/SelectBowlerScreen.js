import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, Animated } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { getTeamPlayers } from '../../database/queries/matchQueries';
import uuid from 'react-native-uuid';

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
  } = route.params;
  const [players, setPlayers]             = useState([]);
  const [selected, setSelected]           = useState(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchRef  = useRef(null);

  useEffect(() => {
    getTeamPlayers(team.id).then(p =>
      setPlayers(p.map(tp => ({ id: tp.player_id, full_name: tp.full_name, player_type: tp.player_type })))
    );
  }, []);

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
          <TouchableOpacity onPress={toggleSearch} style={styles.searchIconBtn}>
            <Icon name={searchVisible ? 'close' : 'magnify'} size={22} color={searchVisible ? COLORS.danger : COLORS.cyan} />
          </TouchableOpacity>
          <TouchableOpacity onPress={confirm}>
            <Text style={[styles.confirm, !selected && { opacity: 0.4 }]}>CONFIRM</Text>
          </TouchableOpacity>
        </View>
      </View>

      {searchVisible && (
        <Animated.View style={[styles.searchBar, { opacity: searchAnim }]}>
          <Icon name="magnify" size={18} color={COLORS.gray} style={{ marginRight: 8 }} />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder="Search bowlers..."
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
              <View style={styles.avatar}><Text style={styles.avatarText}>{item.full_name[0]}</Text></View>
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
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  searchIconBtn:  { padding: 2 },
  searchBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 14, height: 44, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  searchInput:    { flex: 1, color: COLORS.white, fontSize: 14 },
  emptyText:      { color: COLORS.gray, textAlign: 'center', marginTop: 40, fontSize: 14 },
  title:          { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  confirm:        { color: COLORS.gold, fontWeight: '800', fontSize: 15 },
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
