// ============================================================
// CricZodiac — Series List Screen
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { getAllSeries, upsertSeriesFromServer } from '../../database/queries/seriesQueries';
import { upsertMatchesFromServer } from '../../database/queries/matchQueries';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

const normalizeSeriesRow = (row) => ({
  ...row,
  id: row.local_id || String(row.id),
  server_id: row.server_id ?? (row.local_id ? String(row.id) : row.server_id),
  club_id: row.club_id != null ? String(row.club_id) : null,
  team_a_id: row.team_a_local || (row.team_a_id != null ? String(row.team_a_id) : null),
  team_b_id: row.team_b_local || (row.team_b_id != null ? String(row.team_b_id) : null),
  match_count: Number(row.match_count || 0),
  live_count: Number(row.live_count || 0),
  completed_count: Number(row.completed_count || 0),
  team_a_wins: Number(row.team_a_wins || 0),
  team_b_wins: Number(row.team_b_wins || 0),
  allow_last_batsman: row.allow_last_batsman ? 1 : 0,
});

const seriesStatusRank = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'active') return 0;
  if (normalizedStatus === 'completed') return 2;
  return 1;
};

const sortSeriesRows = (rows) =>
  [...rows].sort((a, b) => {
    const statusDiff = seriesStatusRank(a.status) - seriesStatusRank(b.status);
    if (statusDiff !== 0) return statusDiff;

    const createdA = new Date(a.created_at || a.start_date || 0).getTime() || 0;
    const createdB = new Date(b.created_at || b.start_date || 0).getTime() || 0;
    if (createdA !== createdB) return createdB - createdA;

    return String(b.id).localeCompare(String(a.id));
  });

const SeriesListScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const [series, setSeries]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSeries = async () => {
    setLoading(true);
    try {
      try {
        const res = await ApiService.get(API_ENDPOINTS.SERIES_LIST);
        const serverSeries = res?.series || res?.data?.series || [];
        setSeries(sortSeriesRows(serverSeries.map(normalizeSeriesRow)));

        try {
          if (serverSeries.length) await upsertSeriesFromServer(serverSeries);
          const matchRes = await ApiService.get(API_ENDPOINTS.MATCHES_LIST);
          const serverMatches = matchRes?.matches || matchRes?.data?.matches || [];
          if (serverMatches.length) await upsertMatchesFromServer(serverMatches);
        } catch (cacheError) {
          console.warn('SeriesListScreen cache refresh:', cacheError.message);
        }

        return;
      } catch (apiError) {
        console.warn('SeriesListScreen API load:', apiError.message);
      }

      const rows = await getAllSeries();
      setSeries(sortSeriesRows(rows.map(normalizeSeriesRow)));
    } catch (e) {
      console.error('SeriesListScreen:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadSeries(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSeries();
    setRefreshing(false);
  }, []);

  const statusColor = (s) => s === 'active' ? COLORS.cyan : s === 'completed' ? COLORS.success : COLORS.gray;

  const FORMAT_LABEL = {
    bestOf1: 'Best of 1',
    bestOf3: 'Best of 3',
    bestOf5: 'Best of 5',
  };

  const fmtDate = (d) => {
    if (!d) return null;
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return d; }
  };

  const renderItem = ({ item }) => {
    const startStr = fmtDate(item.start_date);
    const endStr   = fmtDate(item.end_date);
    const formatLabel = FORMAT_LABEL[item.format] || item.format;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('SeriesDetail', { seriesId: item.id, seriesName: item.name, series: item })}
      >
        <View style={styles.cardLeft}>
          <LinearGradient colors={[COLORS.royalBlue, COLORS.purple]} style={styles.iconWrap}>
            <Icon name="trophy" size={22} color={COLORS.gold} />
          </LinearGradient>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.seriesName}>{item.name}</Text>
          {item.description ? <Text style={styles.desc} numberOfLines={1}>{item.description}</Text> : null}

          {/* Date range */}
          {startStr ? (
            <View style={styles.metaRow}>
              <Icon name="calendar-range" size={12} color={COLORS.gold} />
              <Text style={[styles.meta, { marginLeft: 4 }]}>
                {startStr}{endStr ? `  →  ${endStr}` : ''}
              </Text>
            </View>
          ) : null}

          {/* Format + match count */}
          <View style={[styles.metaRow, { marginTop: 4 }]}>
            <View style={styles.formatPill}>
              <Text style={styles.formatPillText}>{formatLabel}</Text>
            </View>
            <Icon name="cricket" size={12} color={COLORS.gray} style={{ marginLeft: 8 }} />
            <Text style={styles.meta}>  {item.match_count || 0} matches</Text>
            {item.live_count > 0 && (
              <><Text style={styles.meta}>  · </Text><Text style={[styles.meta, { color: COLORS.cyan }]}>🔴 {item.live_count} live</Text></>
            )}
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={[styles.badge, { borderColor: statusColor(item.status), backgroundColor: statusColor(item.status) + '18' }]}>
            <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>
              {item.status?.toUpperCase()}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={COLORS.gray} style={{ marginTop: 8 }} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        {navigation.canGoBack()
          ? <TouchableOpacity onPress={() => navigation.goBack()}>
              <Icon name="arrow-left" size={24} color={COLORS.white} />
            </TouchableOpacity>
          : <View style={{ width: 24 }} />
        }
        <Text style={styles.title}>Series</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateSeries')}>
          <Icon name="plus-circle" size={28} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      {loading
        ? <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 60 }} />
        : (
          <FlatList
            data={series}
            keyExtractor={i => i.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Icon name="trophy-outline" size={64} color={COLORS.cardBorder} />
                <Text style={styles.emptyTitle}>No Series Yet</Text>
                <Text style={styles.emptySubtitle}>Create a series to start managing matches</Text>
                <TouchableOpacity
                  style={styles.createBtn}
                  onPress={() => navigation.navigate('CreateSeries')}
                >
                  <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.createBtnInner}>
                    <Icon name="plus" size={18} color={COLORS.navy} />
                    <Text style={styles.createBtnText}>Create First Series</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            }
          />
        )}
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 8 },
  title:          { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  card:           { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  cardLeft:       { marginRight: 14 },
  iconWrap:       { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  cardBody:       { flex: 1 },
  seriesName:     { color: COLORS.white, fontWeight: '700', fontSize: 15, marginBottom: 2 },
  desc:           { color: COLORS.gray, fontSize: 12, marginBottom: 4 },
  metaRow:        { flexDirection: 'row', alignItems: 'center' },
  meta:           { color: COLORS.gray, fontSize: 12 },
  cardRight:      { alignItems: 'flex-end' },
  badge:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeText:      { fontSize: 9, fontWeight: '700' },
  formatPill:     { backgroundColor: COLORS.royalBlue + '60', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.royalBlue },
  formatPillText: { color: COLORS.cyan, fontSize: 10, fontWeight: '700' },
  empty:          { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyTitle:     { color: COLORS.white, fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySubtitle:  { color: COLORS.gray, fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 32 },
  createBtn:      { borderRadius: 12, overflow: 'hidden' },
  createBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14 },
  createBtnText:  { color: COLORS.navy, fontWeight: '800', fontSize: 14 },
});

export default SeriesListScreen;
