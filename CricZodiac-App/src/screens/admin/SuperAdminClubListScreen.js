// ============================================================
// CricZodiac — Super Admin: Club List (filtered)
// Route params: { filter: 'all'|'active'|'suspended'|'pending', title: string }
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { API_ENDPOINTS } from '../../config/api';
import ApiService from '../../services/ApiService';
import { showAlert } from '../../utils/toast';

const FILTER_META = {
  all:       { icon: 'domain',              color: null,         label: 'All Clubs' },
  active:    { icon: 'check-circle-outline', color: 'success',   label: 'Active Clubs' },
  suspended: { icon: 'cancel',              color: 'danger',     label: 'Suspended Clubs' },
  pending:   { icon: 'clock-alert-outline', color: 'warning',    label: 'Pending Clubs' },
};

const SuperAdminClubListScreen = ({ navigation, route }) => {
  const { filter = 'all', title } = route.params ?? {};
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const meta        = FILTER_META[filter] ?? FILTER_META.all;
  const accentColor = meta.color ? COLORS[meta.color] : COLORS.white;
  const screenTitle = title || meta.label;

  const [clubs,      setClubs]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { loadClubs(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadClubs();
    setRefreshing(false);
  }, []);

  const loadClubs = async () => {
    setLoading(true);
    try {
      const url = `${API_ENDPOINTS.SUPER_ADMIN_CLUBS}?filter=${filter}`;
      const val = await ApiService.get(url);
      setClubs(val.clubs ?? []);
    } catch (e) {
      showAlert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status) => {
    if (status === 'active')    return COLORS.success;
    if (status === 'suspended') return COLORS.danger;
    if (status === 'pending')   return COLORS.warning;
    return COLORS.gray;
  };

  const renderClub = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('SuperAdminClubDetail', { clubId: String(item.id) })}
      activeOpacity={0.85}
    >
      <View style={[styles.cardIconWrap, { backgroundColor: accentColor + '18' }]}>
        <Icon name="shield-star" size={22} color={accentColor} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.name}</Text>
        <Text style={styles.cardMeta}>
          {[item.city, item.country].filter(Boolean).join(' · ') || 'Indoor Cricket Club'}
        </Text>
        <View style={styles.cardStats}>
          <Icon name="account" size={11} color={COLORS.gray} />
          <Text style={styles.cardStatTxt}>{item.player_count ?? 0} players</Text>
          <Text style={styles.cardDot}>·</Text>
          <Icon name="cricket" size={11} color={COLORS.gray} />
          <Text style={styles.cardStatTxt}>{item.match_count ?? 0} matches</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={[styles.statusChip, { backgroundColor: statusColor(item.status) + '22' }]}>
          <Text style={[styles.statusTxt, { color: statusColor(item.status) }]}>
            {item.status?.toUpperCase()}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={COLORS.gray} />
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Icon name="arrow-left" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Icon name={meta.icon} size={18} color={accentColor} />
          <Text style={[styles.headerText, { color: accentColor }]}>{screenTitle}</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('CreateClub')}
          style={styles.addBtn}
          activeOpacity={0.8}
        >
          <Icon name="plus" size={18} color={COLORS.navy} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
      ) : clubs.length === 0 ? (
        <View style={styles.empty}>
          <Icon name={meta.icon} size={56} color={COLORS.gray} />
          <Text style={styles.emptyText}>No {filter === 'all' ? '' : filter} clubs found.</Text>
        </View>
      ) : (
        <FlatList
          data={clubs}
          renderItem={renderClub}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:       {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: 52, paddingHorizontal: 14, paddingBottom: 14,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  backBtn:      { padding: 6 },
  headerTitle:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText:   { fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  addBtn:       {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center',
  },

  list:         { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 30 },
  card:         {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  cardInfo:     { flex: 1 },
  cardName:     { color: COLORS.white, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  cardMeta:     { color: COLORS.gray, fontSize: 11, marginBottom: 5 },
  cardStats:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardStatTxt:  { color: COLORS.gray, fontSize: 10 },
  cardDot:      { color: COLORS.gray, fontSize: 10 },
  statusChip:   { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusTxt:    { fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyText:    { color: COLORS.gray, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});

export default SuperAdminClubListScreen;
