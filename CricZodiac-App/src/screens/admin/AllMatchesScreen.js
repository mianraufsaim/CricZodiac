import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { MATCH_STATUS } from '../../config/constants';
import { queryRows } from '../../database/DatabaseHelper';
import { upsertMatchesFromServer } from '../../database/queries/matchQueries';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

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
});

const AllMatchesScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMatches = async () => {
    setLoading(true);
    try {
      try {
        const res = await ApiService.get(API_ENDPOINTS.MATCHES_LIST);
        const serverMatches = res?.matches || res?.data?.matches || [];
        setMatches(serverMatches.map(normalizeMatchRow));

        try {
          if (serverMatches.length) await upsertMatchesFromServer(serverMatches);
        } catch (cacheError) {
          console.warn('AllMatchesScreen cache refresh:', cacheError.message);
        }

        return;
      } catch (apiError) {
        console.warn('AllMatchesScreen API load:', apiError.message);
      }

      const rows = await queryRows(
        `SELECT m.*,
          t1.team_name AS team_a_name,
          t2.team_name AS team_b_name
         FROM matches m
         LEFT JOIN teams t1 ON m.team_a_id = t1.id
          OR (t1.match_id = m.id AND t1.team_label = 'A')
         LEFT JOIN teams t2 ON m.team_b_id = t2.id
          OR (t2.match_id = m.id AND t2.team_label = 'B')
         ORDER BY m.created_at DESC`,
        []
      );
      setMatches(rows);
    } catch (e) {
      console.error('AllMatchesScreen:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadMatches(); }, []));

  const statusColor = (status) => {
    if (status === MATCH_STATUS.LIVE)      return COLORS.cyan;
    if (status === MATCH_STATUS.COMPLETED) return COLORS.gold;
    return COLORS.gray;
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => {
        if (item.status === MATCH_STATUS.SETUP || item.status === 'setup') {
          navigation.navigate('MatchSetup', {
            match: item,
            seriesId: item.series_id,
          });
        } else {
          navigation.navigate('Scorecard', { matchId: item.id });
        }
      }}
    >
      <View style={styles.cardTop}>
        <Text style={styles.teams}>
          {item.team_a_name || 'Team A'} <Text style={{ color: COLORS.gold }}>vs</Text> {item.team_b_name || 'Team B'}
        </Text>
        <View style={[styles.badge, { borderColor: statusColor(item.status) }]}>
          <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>
            {item.status?.toUpperCase() || 'SETUP'}
          </Text>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <Icon name="map-marker" size={12} color={COLORS.gray} />
        <Text style={styles.meta}> {item.venue || 'Indoor Ground'}</Text>
        <Text style={styles.meta}>  •  {item.overs || 10} overs</Text>
        {item.match_date ? <Text style={styles.meta}>  •  {item.match_date}</Text> : null}
      </View>
    </TouchableOpacity>
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMatches();
    setRefreshing(false);
  }, []);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title}>All Matches</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateMatch')}>
          <Icon name="plus-circle" size={26} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      {loading
        ? <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={matches}
            keyExtractor={i => String(i.id)}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16 }}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Icon name="cricket" size={48} color={COLORS.cardBorder} />
                <Text style={styles.emptyText}>No matches yet.</Text>
                <TouchableOpacity
                  style={styles.newBtn}
                  onPress={() => navigation.navigate('CreateMatch')}
                >
                  <Text style={{ color: COLORS.navy, fontWeight: '700' }}>Start New Match</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 8 },
  title:      { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  card:       { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  teams:      { color: COLORS.white, fontWeight: '700', fontSize: 15, flex: 1 },
  badge:      { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', alignItems: 'center' },
  meta:       { color: COLORS.gray, fontSize: 12 },
  empty:      { alignItems: 'center', marginTop: 60 },
  emptyText:  { color: COLORS.gray, marginTop: 12, fontSize: 14 },
  newBtn:     { marginTop: 16, backgroundColor: COLORS.gold, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
});

export default AllMatchesScreen;
