// ============================================================
// CricZodiac — All Matches (Admin)
// Fetches from API — club-scoped, no local SQLite display.
// ============================================================

import React, {
  useState, useCallback, useMemo, useRef, useEffect,
} from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform,
  StatusBar, Animated, Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Status config ──────────────────────────────────────────
const STATUS = {
  completed: {
    color: '#22c55e', bg: '#22c55e18',
    border: '#22c55e55', icon: 'check-circle', label: 'COMPLETED',
  },
  live: {
    color: '#f43f5e', bg: '#f43f5e18',
    border: '#f43f5e55', icon: 'broadcast', label: 'LIVE',
  },
  setup: {
    color: '#60a5fa', bg: '#60a5fa18',
    border: '#60a5fa55', icon: 'clock-outline', label: 'SETUP',
  },
  toss: {
    color: '#f59e0b', bg: '#f59e0b18',
    border: '#f59e0b55', icon: 'coin-outline', label: 'TOSS',
  },
  default: {
    color: '#9ca3af', bg: '#9ca3af18',
    border: '#9ca3af44', icon: 'help-circle-outline', label: 'UNKNOWN',
  },
};
const getStatus = (s) => STATUS[s?.toLowerCase()] || STATUS.default;

// ── Pulsing live dot ───────────────────────────────────────
const LiveDot = () => {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.6, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{
      width: 7, height: 7, borderRadius: 4,
      backgroundColor: '#f43f5e',
      marginRight: 4,
      transform: [{ scale }],
    }} />
  );
};

// ── Filter pill ────────────────────────────────────────────
const FilterPill = ({ label, active, count, onPress, color }) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 13, paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: active ? (color + '22') : 'transparent',
      borderWidth: 1,
      borderColor: active ? color : '#ffffff22',
    }}
  >
    <Text style={{
      color: active ? color : '#9ca3af',
      fontWeight: active ? '800' : '600',
      fontSize: 12,
    }}>{label}</Text>
    {count > 0 && (
      <View style={{
        backgroundColor: active ? color : '#ffffff22',
        borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1,
      }}>
        <Text style={{ color: active ? '#fff' : '#9ca3af', fontSize: 10, fontWeight: '700' }}>
          {count}
        </Text>
      </View>
    )}
  </TouchableOpacity>
);

// ── Match Card ─────────────────────────────────────────────
const MatchCard = ({ item, onPress, COLORS }) => {
  const sc = getStatus(item.status);
  const isCompleted = item.status === 'completed';
  const isLive      = item.status === 'live';

  const date    = item.match_date ? new Date(item.match_date) : null;
  const dateStr = date?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // End date — use updated_at for completed matches if available
  const endDate    = item.end_date ?? (item.status === 'completed' ? item.updated_at : null);
  const endDateStr = endDate
    ? new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  const teamA = item.team_a_name || 'Team A';
  const teamB = item.team_b_name || 'Team B';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={{ marginBottom: 12 }}>
      <View style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        overflow: 'hidden',
      }}>
        {/* ── Accent bar ── */}
        <View style={{ height: 3, backgroundColor: sc.color }} />

        {/* ── Card body ── */}
        <View style={{ padding: 16 }}>

          {/* ── Top row: teams + status badge ── */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>

            {/* Teams */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 2 }}>
                <Text style={{
                  color: COLORS.white, fontWeight: '800', fontSize: 15, flexShrink: 1,
                }} numberOfLines={1}>{teamA}</Text>

                <View style={{
                  backgroundColor: COLORS.gold + '22',
                  borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
                  borderWidth: 1, borderColor: COLORS.gold + '55',
                }}>
                  <Text style={{ color: COLORS.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>VS</Text>
                </View>

                <Text style={{
                  color: COLORS.white, fontWeight: '800', fontSize: 15, flexShrink: 1,
                }} numberOfLines={1}>{teamB}</Text>
              </View>
            </View>

            {/* Status badge */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: sc.bg,
              borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5,
              borderWidth: 1, borderColor: sc.border,
            }}>
              {isLive ? <LiveDot /> : (
                <Icon name={sc.icon} size={11} color={sc.color} />
              )}
              <Text style={{ color: sc.color, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>
                {sc.label}
              </Text>
            </View>
          </View>

          {/* ── Result / Winner row ── */}
          {isCompleted ? (
            <View style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: 6,
              backgroundColor: item.winner_team_name ? COLORS.gold + '12' : COLORS.darkGray,
              borderRadius: 10, padding: 9, marginTop: 10,
              borderWidth: 1,
              borderColor: item.winner_team_name ? COLORS.gold + '33' : COLORS.cardBorder,
            }}>
              <Icon
                name={item.winner_team_name ? 'trophy' : 'handshake-outline'}
                size={14}
                color={item.winner_team_name ? COLORS.gold : COLORS.gray}
                style={{ marginTop: 1 }}
              />
              <Text style={{
                flex: 1,
                color: item.winner_team_name ? COLORS.gold : COLORS.gray,
                fontSize: 12, fontWeight: '700', lineHeight: 18,
              }} numberOfLines={2}>
                {item.result_text || (item.winner_team_name ? `${item.winner_team_name} won` : 'Match completed')}
              </Text>
            </View>
          ) : isLive ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: '#f43f5e12',
              borderRadius: 10, padding: 9, marginTop: 10,
              borderWidth: 1, borderColor: '#f43f5e33',
            }}>
              <Icon name="broadcast" size={13} color="#f43f5e" />
              <Text style={{ color: '#f43f5e', fontSize: 12, fontWeight: '800' }}>
                Match in progress
              </Text>
            </View>
          ) : (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              marginTop: 8,
            }}>
              <Icon name="clock-outline" size={12} color={COLORS.gray} />
              <Text style={{ color: COLORS.gray, fontSize: 12 }}>Awaiting setup</Text>
            </View>
          )}

          {/* ── Meta row ── */}
          <View style={{
            flexDirection: 'row', flexWrap: 'wrap',
            gap: 6, marginTop: 10,
          }}>
            {item.venue ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: COLORS.darkGray, borderRadius: 7,
                paddingHorizontal: 8, paddingVertical: 4,
              }}>
                <Icon name="map-marker-outline" size={11} color={COLORS.gray} />
                <Text style={{ color: COLORS.gray, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
                  {item.venue}
                </Text>
              </View>
            ) : null}

            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 3,
              backgroundColor: '#60a5fa18', borderRadius: 7,
              paddingHorizontal: 8, paddingVertical: 4,
            }}>
              <Icon name="clock-fast" size={11} color="#60a5fa" />
              <Text style={{ color: '#60a5fa', fontSize: 11, fontWeight: '700' }}>
                {item.overs || '?'} Overs
              </Text>
            </View>

            {dateStr ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: COLORS.darkGray, borderRadius: 7,
                paddingHorizontal: 8, paddingVertical: 4,
              }}>
                <Icon name="calendar-outline" size={11} color={COLORS.gray} />
                <Text style={{ color: COLORS.gray, fontSize: 11 }}>{dateStr}</Text>
              </View>
            ) : null}

            {endDateStr && endDateStr !== dateStr ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: COLORS.darkGray, borderRadius: 7,
                paddingHorizontal: 8, paddingVertical: 4,
              }}>
                <Icon name="calendar-check-outline" size={11} color={COLORS.gray} />
                <Text style={{ color: COLORS.gray, fontSize: 11 }}>{endDateStr}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── Empty state ────────────────────────────────────────────
const EmptyState = ({ filter, COLORS }) => (
  <View style={{ alignItems: 'center', paddingVertical: 80, gap: 12 }}>
    <Icon name="cricket" size={64} color={COLORS.cardBorder} />
    <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '800' }}>
      {filter === 'all' ? 'No Matches Yet' : `No ${filter} Matches`}
    </Text>
    <Text style={{ color: COLORS.gray, fontSize: 13, textAlign: 'center', paddingHorizontal: 40 }}>
      {filter === 'all'
        ? 'No matches found for your club.'
        : `There are no ${filter} matches right now.`}
    </Text>
  </View>
);

// ── Main screen ────────────────────────────────────────────
const FILTERS = [
  { key: 'all',       label: 'All',       color: '#9ca3af' },
  { key: 'live',      label: 'Live',      color: '#f43f5e' },
  { key: 'setup',     label: 'Setup',     color: '#60a5fa' },
  { key: 'completed', label: 'Completed', color: '#22c55e' },
];

const AllMatchesScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();

  const [matches,    setMatches]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState('all');

  // ── Load from API ──────────────────────────────────────
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await ApiService.get(API_ENDPOINTS.MATCHES_LIST);
      const list = res?.matches || [];
      setMatches(list);
    } catch (e) {
      console.warn('[AllMatchesScreen]', e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  // ── Filter ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filter === 'all') return matches;
    return matches.filter(m => m.status?.toLowerCase() === filter);
  }, [matches, filter]);

  const countOf = (key) => key === 'all'
    ? matches.length
    : matches.filter(m => m.status?.toLowerCase() === key).length;

  // ── Navigate on card press ─────────────────────────────
  const handlePress = useCallback((item) => {
    const s = item.status?.toLowerCase();
    if (s === 'setup' || s === 'toss') {
      navigation.navigate('MatchSetup', { match: item, seriesId: item.series_id ?? item.series_local_id });
    } else if (s === 'live') {
      navigation.navigate('LiveScoring', { matchId: item.id ?? item.local_id });
    } else {
      navigation.navigate('Scorecard', { matchId: item.id ?? item.local_id });
    }
  }, [navigation]);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Header ── */}
      <View style={{
        paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 10,
        paddingHorizontal: 20, paddingBottom: 14,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="arrow-left" size={20} color={COLORS.white} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '900' }}>All Matches</Text>
            <Text style={{ color: COLORS.gray, fontSize: 11, marginTop: 1 }}>
              {matches.length} match{matches.length !== 1 ? 'es' : ''} in your club
            </Text>
          </View>

          {/* spacer keeps title centred */}
          <View style={{ width: 38 }} />
        </View>

        {/* ── Filter tabs ── */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {FILTERS.map(f => (
            <FilterPill
              key={f.key}
              label={f.label}
              active={filter === f.key}
              count={f.key === 'all' ? 0 : countOf(f.key)}
              color={f.color}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </View>
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={{ color: COLORS.gray, marginTop: 12, fontSize: 13 }}>Loading matches…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) => String(item.id ?? item.local_id ?? idx)}
          renderItem={({ item }) => (
            <MatchCard
              item={item}
              COLORS={COLORS}
              onPress={() => handlePress(item)}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            <EmptyState filter={filter} COLORS={COLORS} />
          }
        />
      )}
    </LinearGradient>
  );
};

export default AllMatchesScreen;
