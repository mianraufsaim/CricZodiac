// ============================================================
// CricZodiac — Team Selection Screen
// ============================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, TextInput, Animated, Modal, ActivityIndicator } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { getAllPlayers, upsertPlayersFromServer } from '../../database/queries/playerQueries';
import { createTeam, addPlayerToTeam } from '../../database/queries/matchQueries';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

// ── Role Picker Modal ─────────────────────────────────────
const RolePickerModal = ({ visible, player, captainId, wkId, onAssign, onClear, onCancel, COLORS }) => {
  if (!visible || !player) return null;
  const isCap = captainId === player.id;
  const isWK  = wkId      === player.id;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={rpm.overlay}>
        <View style={rpm.card}>
          {/* Player header */}
          <View style={rpm.playerRow}>
            <View style={[rpm.avatar, { backgroundColor: COLORS.royalBlue }]}>
              <Text style={rpm.avatarTxt}>{player.full_name?.[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={rpm.playerName}>{player.full_name}</Text>
              <Text style={rpm.playerType}>{player.player_type}</Text>
            </View>
          </View>

          <Text style={rpm.sectionLabel}>ASSIGN ROLE</Text>

          {/* Captain button */}
          <TouchableOpacity
            style={[rpm.roleBtn, { borderColor: COLORS.gold }, isCap && { backgroundColor: COLORS.gold + '28' }]}
            onPress={() => onAssign('captain')}
            activeOpacity={0.75}
          >
            <View style={[rpm.roleIcon, { backgroundColor: COLORS.gold + '22' }]}>
              <Text style={{ fontSize: 22 }}>🏏</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[rpm.roleName, { color: COLORS.gold }]}>Captain</Text>
              <Text style={rpm.roleDesc}>Team leader for toss & decisions</Text>
            </View>
            {isCap && <Icon name="check-circle" size={20} color={COLORS.gold} />}
          </TouchableOpacity>

          {/* Wicketkeeper button */}
          <TouchableOpacity
            style={[rpm.roleBtn, { borderColor: COLORS.cyan }, isWK && { backgroundColor: COLORS.cyan + '22' }]}
            onPress={() => onAssign('wk')}
            activeOpacity={0.75}
          >
            <View style={[rpm.roleIcon, { backgroundColor: COLORS.cyan + '18' }]}>
              <Text style={{ fontSize: 22 }}>🧤</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[rpm.roleName, { color: COLORS.cyan }]}>Wicket Keeper</Text>
              <Text style={rpm.roleDesc}>Stands behind the stumps</Text>
            </View>
            {isWK && <Icon name="check-circle" size={20} color={COLORS.cyan} />}
          </TouchableOpacity>

          {/* Clear roles */}
          {(isCap || isWK) && (
            <TouchableOpacity style={rpm.clearBtn} onPress={onClear}>
              <Icon name="close-circle-outline" size={16} color='#EF5350' />
              <Text style={rpm.clearTxt}>Remove roles from this player</Text>
            </TouchableOpacity>
          )}

          {/* Cancel */}
          <TouchableOpacity style={rpm.cancelBtn} onPress={onCancel}>
            <Text style={rpm.cancelTxt}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const rpm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: '#000000CC', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:       { width: '100%', maxWidth: 340, backgroundColor: '#0F1B2D', borderRadius: 22, borderWidth: 1.5, borderColor: '#1E3A5F', overflow: 'hidden' },
  playerRow:  { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14, borderBottomWidth: 1, borderBottomColor: '#1E3A5F' },
  avatar:     { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:  { color: '#FFFFFF', fontWeight: '900', fontSize: 20 },
  playerName: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  playerType: { color: '#8899AA', fontSize: 12, marginTop: 2 },
  sectionLabel: { color: '#8899AA', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 },
  roleBtn:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 10, borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 12, backgroundColor: '#162030' },
  roleIcon:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  roleName:   { fontSize: 15, fontWeight: '800' },
  roleDesc:   { color: '#8899AA', fontSize: 11, marginTop: 2 },
  clearBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  clearTxt:   { color: '#EF5350', fontSize: 12, fontWeight: '600' },
  cancelBtn:  { alignItems: 'center', paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#1E3A5F', marginTop: 4 },
  cancelTxt:  { color: '#8899AA', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
});

// ── Main Screen ───────────────────────────────────────────
const TeamSelectionScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { matchId, form, matchNumber = 1 } = route.params;
  const limit = parseInt(form.players_per_team) || 11;

  const [players, setPlayers]       = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [teamAPlayers, setTeamA]    = useState([]);
  const [teamBPlayers, setTeamB]    = useState([]);
  const [captainA, setCaptainA]     = useState(null);
  const [captainB, setCaptainB]     = useState(null);
  const [wkA, setWkA]               = useState(null);
  const [wkB, setWkB]               = useState(null);
  const [activeTab, setActiveTab]   = useState('A');
  const [saving, setSaving]         = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [roleModal, setRoleModal]         = useState({ visible: false, player: null });
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchRef  = useRef(null);

  useEffect(() => { loadPlayers(); }, []);

  const loadPlayers = async () => {
    setLoadingPlayers(true);
    try {
      // 1. Fetch fresh player list from server and save to SQLite
      try {
        const res = await ApiService.get(API_ENDPOINTS.USERS_LIST);
        const serverUsers = res?.users || res?.data?.users || [];
        if (res?.success && serverUsers.length) await upsertPlayersFromServer(serverUsers);
      } catch (_) {
        // Offline or server error — fall through to cached SQLite data
      }
      // 2. Load from local SQLite (now populated with full_name)
      const all = await getAllPlayers();
      setPlayers(all || []);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoadingPlayers(false);
    }
  };

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
    const otherTeamIds = new Set(
      (activeTab === 'A' ? teamBPlayers : teamAPlayers).map(p => p.id)
    );
    let list = players.filter(p => !otherTeamIds.has(p.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.full_name?.toLowerCase().includes(q) ||
        p.player_type?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [players, searchQuery, activeTab, teamAPlayers, teamBPlayers]);

  const currentTeam = activeTab === 'A' ? teamAPlayers : teamBPlayers;
  const teamFull    = currentTeam.length >= limit;

  const togglePlayer = (player, team) => {
    if (team === 'A') {
      const inB = teamBPlayers.find(p => p.id === player.id);
      if (inB) { Alert.alert('Already in Team B', `${player.full_name} is already selected for Team B.`); return; }
      const inA = teamAPlayers.find(p => p.id === player.id);
      if (inA) {
        setTeamA(prev => prev.filter(p => p.id !== player.id));
        if (captainA?.id === player.id) setCaptainA(null);
        if (wkA?.id === player.id) setWkA(null);
      } else {
        if (teamAPlayers.length >= limit) {
          Alert.alert('Team Full', `${form.team_a_name} already has ${limit}/${limit} players.`);
          return;
        }
        setTeamA(prev => [...prev, player]);
      }
    } else {
      const inA = teamAPlayers.find(p => p.id === player.id);
      if (inA) { Alert.alert('Already in Team A', `${player.full_name} is already selected for Team A.`); return; }
      const inB = teamBPlayers.find(p => p.id === player.id);
      if (inB) {
        setTeamB(prev => prev.filter(p => p.id !== player.id));
        if (captainB?.id === player.id) setCaptainB(null);
        if (wkB?.id === player.id) setWkB(null);
      } else {
        if (teamBPlayers.length >= limit) {
          Alert.alert('Team Full', `${form.team_b_name} already has ${limit}/${limit} players.`);
          return;
        }
        setTeamB(prev => [...prev, player]);
      }
    }
  };

  const handleRoleAssign = (role) => {
    const p = roleModal.player;
    if (!p) return;
    if (role === 'captain') {
      if (activeTab === 'A') setCaptainA(p); else setCaptainB(p);
    } else {
      if (activeTab === 'A') setWkA(p); else setWkB(p);
    }
    setRoleModal({ visible: false, player: null });
  };

  const handleRoleClear = () => {
    const p = roleModal.player;
    if (!p) return;
    if (activeTab === 'A') {
      if (captainA?.id === p.id) setCaptainA(null);
      if (wkA?.id === p.id) setWkA(null);
    } else {
      if (captainB?.id === p.id) setCaptainB(null);
      if (wkB?.id === p.id) setWkB(null);
    }
    setRoleModal({ visible: false, player: null });
  };

  const handleSaveTeams = async () => {
    if (teamAPlayers.length < limit) {
      Alert.alert('Incomplete Team', `${form.team_a_name} needs ${limit} players. You have selected ${teamAPlayers.length}/${limit}.`);
      return;
    }
    if (teamBPlayers.length < limit) {
      Alert.alert('Incomplete Team', `${form.team_b_name} needs ${limit} players. You have selected ${teamBPlayers.length}/${limit}.`);
      return;
    }
    if (!captainA || !captainB) {
      Alert.alert('No Captains', 'Please select a captain for each team.');
      return;
    }
    setSaving(true);
    try {
      const teamAId = await createTeam({ match_id: matchId, series_id: form.series_id, team_name: form.team_a_name, team_label: 'A', captain_id: captainA.id, wk_id: wkA?.id });
      const teamBId = await createTeam({ match_id: matchId, series_id: form.series_id, team_name: form.team_b_name, team_label: 'B', captain_id: captainB.id, wk_id: wkB?.id });

      for (let i = 0; i < teamAPlayers.length; i++) await addPlayerToTeam(teamAId, teamAPlayers[i].id, i + 1);
      for (let i = 0; i < teamBPlayers.length; i++) await addPlayerToTeam(teamBId, teamBPlayers[i].id, i + 1);

      navigation.navigate('Toss', {
        match:        { id: matchId, ...form, players_per_team: parseInt(form.players_per_team) },
        teamA:        { id: teamAId, team_name: form.team_a_name, captain_id: captainA.id, captain_name: captainA.full_name },
        teamB:        { id: teamBId, team_name: form.team_b_name, captain_id: captainB.id, captain_name: captainB.full_name },
        isFirstMatch: matchNumber === 1,
      });
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const renderPlayer = ({ item }) => {
    const inA = teamAPlayers.find(p => p.id === item.id);
    const inB = teamBPlayers.find(p => p.id === item.id);
    const inCurrent = activeTab === 'A' ? inA : inB;
    const isCap = (activeTab === 'A' ? captainA : captainB)?.id === item.id;
    const isWK  = (activeTab === 'A' ? wkA : wkB)?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.playerRow, inCurrent && styles.playerRowSelected]}
        onPress={() => togglePlayer(item, activeTab)}
        onLongPress={() => {
          const inCurrent2 = activeTab === 'A' ? inA : inB;
          if (!inCurrent2) return;
          setRoleModal({ visible: true, player: item });
        }}
      >
        <View style={styles.playerAvatar}>
          <Text style={styles.playerAvatarText}>{item.full_name[0]}</Text>
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>{item.full_name}</Text>
          <Text style={styles.playerType}>{item.player_type}</Text>
        </View>
        {isCap && (
          <View style={[styles.rolePill, { backgroundColor: COLORS.gold + '22', borderColor: COLORS.gold }]}>
            <Text style={{ fontSize: 11 }}>🏏</Text>
            <Text style={[styles.rolePillTxt, { color: COLORS.gold }]}>C</Text>
          </View>
        )}
        {isWK && (
          <View style={[styles.rolePill, { backgroundColor: COLORS.cyan + '22', borderColor: COLORS.cyan, marginLeft: isCap ? 4 : 0 }]}>
            <Text style={{ fontSize: 11 }}>🧤</Text>
            <Text style={[styles.rolePillTxt, { color: COLORS.cyan }]}>WK</Text>
          </View>
        )}
        {inA && !inCurrent && <Text style={styles.teamBadge}>A</Text>}
        {inB && !inCurrent && <Text style={[styles.teamBadge, { backgroundColor: COLORS.purple }]}>B</Text>}
        {inCurrent && !isCap && !isWK && <Icon name="check-circle" size={22} color={COLORS.success} />}
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
        <Text style={styles.headerTitle}>Select Players</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleSearch} style={styles.searchIconBtn}>
            <Icon name={searchVisible ? 'close' : 'magnify'} size={22} color={searchVisible ? COLORS.danger : COLORS.gold} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSaveTeams} disabled={saving}>
            <Text style={[styles.doneBtn, saving && { opacity: 0.5 }]}>{saving ? '...' : 'DONE'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
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

      {/* Tabs */}
      <View style={styles.tabs}>
        {['A', 'B'].map(t => {
          const count = t === 'A' ? teamAPlayers.length : teamBPlayers.length;
          const full  = count >= limit;
          const cap   = t === 'A' ? captainA : captainB;
          return (
            <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
              <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                {t === 'A' ? form.team_a_name : form.team_b_name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <Text style={[styles.tabCount, full && { color: COLORS.success }]}>{count}/{limit}</Text>
                {cap && <Text style={styles.tabCap}>🏏 {cap.full_name?.split(' ')[0]}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Hint */}
      {teamFull ? (
        <Text style={[styles.hint, { color: COLORS.success }]}>
          ✅ {activeTab === 'A' ? form.team_a_name : form.team_b_name} is full ({limit}/{limit})  •  Long-press → Assign Captain / WK
        </Text>
      ) : (
        <Text style={styles.hint}>
          {currentTeam.length}/{limit} selected  •  Tap to add/remove  •  Long-press → Assign roles
        </Text>
      )}

      {loadingPlayers ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingTxt}>Loading players...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPlayers}
          renderItem={renderPlayer}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? `No players found for "${searchQuery}"` : 'No players found. Make sure players are approved in Manage Users.'}
            </Text>
          }
        />
      )}

      {/* Role Picker Modal */}
      <RolePickerModal
        visible={roleModal.visible}
        player={roleModal.player}
        captainId={(activeTab === 'A' ? captainA : captainB)?.id}
        wkId={(activeTab === 'A' ? wkA : wkB)?.id}
        onAssign={handleRoleAssign}
        onClear={handleRoleClear}
        onCancel={() => setRoleModal({ visible: false, player: null })}
        COLORS={COLORS}
      />
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 12 },
  headerTitle:       { fontSize: 18, fontWeight: '700', color: COLORS.white },
  headerRight:       { flexDirection: 'row', alignItems: 'center', gap: 14 },
  searchIconBtn:     { padding: 2 },
  doneBtn:           { color: COLORS.gold, fontWeight: '800', fontSize: 15 },
  searchBar:         { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 14, height: 44, marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden' },
  searchInput:       { flex: 1, color: COLORS.white, fontSize: 14 },
  tabs:              { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 8 },
  tab:               { flex: 1, paddingVertical: 10, backgroundColor: COLORS.card, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  tabActive:         { backgroundColor: COLORS.royalBlue, borderColor: COLORS.gold },
  tabText:           { color: COLORS.gray, fontWeight: '600', fontSize: 13 },
  tabTextActive:     { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  tabCount:          { color: COLORS.gold, fontWeight: '800', fontSize: 11 },
  tabCap:            { color: COLORS.gold, fontSize: 10, fontWeight: '600' },
  hint:              { color: COLORS.gray, fontSize: 12, textAlign: 'center', marginBottom: 8 },
  list:              { paddingHorizontal: 20, paddingBottom: 30 },
  emptyText:         { color: COLORS.gray, textAlign: 'center', marginTop: 40, fontSize: 14 },
  loadingWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  loadingTxt:        { color: COLORS.gray, marginTop: 12, fontSize: 14 },
  playerRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  playerRowSelected: { borderColor: COLORS.gold, backgroundColor: COLORS.darkGray },
  playerAvatar:      { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.royalBlue, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  playerAvatarText:  { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  playerInfo:        { flex: 1 },
  playerName:        { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  playerType:        { color: COLORS.gray, fontSize: 12, marginTop: 2 },
  rolePill:          { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 6 },
  rolePillTxt:       { fontSize: 11, fontWeight: '800' },
  teamBadge:         { backgroundColor: COLORS.royalBlue, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, color: COLORS.white, fontWeight: '700', fontSize: 12 },
});

export default TeamSelectionScreen;
