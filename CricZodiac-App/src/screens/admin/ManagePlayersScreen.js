import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { getAllPlayers } from '../../database/queries/playerQueries';
import { executeQuery } from '../../database/DatabaseHelper';

const ManagePlayersScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [players, setPlayers] = useState([]);
  const [search, setSearch]   = useState('');

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    const all = await getAllPlayers();
    setPlayers(all);
  };

  const filtered = players.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (player) => {
    Alert.alert('Delete Player', `Remove ${player.full_name}?`, [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await executeQuery('UPDATE players SET is_active = 0 WHERE id = ?', [player.id]);
        load();
      }},
    ]);
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Players ({players.length})</Text>
        <TouchableOpacity onPress={() => navigation.navigate('AddEditPlayer', {})}>
          <Icon name="plus" size={26} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Icon name="magnify" size={20} color={COLORS.gray} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search players..."
          placeholderTextColor={COLORS.gray}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        renderItem={({ item }) => (
          <View style={styles.playerCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.full_name[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.playerName}>{item.full_name}</Text>
              <Text style={styles.playerType}>{item.player_type} · {item.email || item.phone}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('AddEditPlayer', { player: item })} style={styles.actionBtn}>
              <Icon name="pencil" size={18} color={COLORS.cyan} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
              <Icon name="delete" size={18} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No players found</Text>}
      />
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 12 },
  title:       { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  searchBar:   { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  searchInput: { flex: 1, height: 46, color: COLORS.white, fontSize: 15 },
  playerCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  avatar:      { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: COLORS.white, fontWeight: '800', fontSize: 18 },
  playerName:  { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  playerType:  { color: COLORS.gray, fontSize: 12, marginTop: 2 },
  actionBtn:   { padding: 6 },
  empty:       { color: COLORS.gray, textAlign: 'center', marginTop: 40 },
});

export default ManagePlayersScreen;
