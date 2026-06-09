// ============================================================
// CricZodiac — Super Admin: Admin Users List (filtered)
// Route params: { filter: 'all'|'active'|'blocked'|'pending', title: string }
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { API_ENDPOINTS } from '../../config/api';
import ApiService from '../../services/ApiService';

const FILTER_META = {
  all:     { icon: 'account-group',  color: null,       label: 'All Admins' },
  active:  { icon: 'account-check',  color: 'success',  label: 'Active Admins' },
  blocked: { icon: 'account-cancel', color: 'danger',   label: 'Blocked Admins' },
  pending: { icon: 'account-clock',  color: 'warning',  label: 'Pending Approval' },
};

const SuperAdminAdminListScreen = ({ navigation, route }) => {
  const { filter = 'all', title } = route.params ?? {};
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const meta        = FILTER_META[filter] ?? FILTER_META.all;
  const accentColor = meta.color ? COLORS[meta.color] : COLORS.cyan;
  const screenTitle = title || meta.label;

  const [admins,     setAdmins]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { loadAdmins(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAdmins();
    setRefreshing(false);
  }, []);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const url = `${API_ENDPOINTS.SUPER_ADMIN_ADMINS}?filter=${filter}`;
      const val = await ApiService.get(url);
      setAdmins(val.admins ?? []);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (admin, action) => {
    const actionLabel = action === 'approve' ? 'Approve'
      : action === 'block'   ? 'Block'
      : 'Activate';
    Alert.alert(
      `${actionLabel} Admin`,
      `${actionLabel} ${admin.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          style: action === 'block' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await ApiService.post(API_ENDPOINTS.SUPER_ADMIN_ADMINS, {
                user_id: admin.id,
                action,
              });
              loadAdmins();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const statusColor = (status, isApproved) => {
    if (status === 'blocked')                     return COLORS.danger;
    if (status === 'active' && isApproved === 1)  return COLORS.success;
    if (status === 'pending' || isApproved === 0) return COLORS.warning;
    return COLORS.gray;
  };

  const statusLabel = (status, isApproved) => {
    if (status === 'blocked')                     return 'BLOCKED';
    if (status === 'active' && isApproved === 1)  return 'ACTIVE';
    if (status === 'pending')                     return 'PENDING';
    if (status === 'active' && isApproved === 0)  return 'UNVERIFIED';
    return status?.toUpperCase() ?? '—';
  };

  const renderAdmin = ({ item }) => {
    const sColor = statusColor(item.status, item.is_approved);
    const sLabel = statusLabel(item.status, item.is_approved);
    const isPending = item.status === 'pending' || (item.status === 'active' && item.is_approved === 0);
    const isBlocked = item.status === 'blocked';
    const isActive  = item.status === 'active' && item.is_approved === 1;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => item.club_id && navigation.navigate('SuperAdminClubDetail', { clubId: String(item.club_id) })}
        activeOpacity={item.club_id ? 0.85 : 1}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: accentColor + '22' }]}>
          <Text style={[styles.avatarText, { color: accentColor }]}>
            {(item.name || '?')[0].toUpperCase()}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            <View style={[styles.statusChip, { backgroundColor: sColor + '22' }]}>
              <Text style={[styles.statusTxt, { color: sColor }]}>{sLabel}</Text>
            </View>
          </View>
          <Text style={styles.cardEmail} numberOfLines={1}>{item.email}</Text>
          {item.club_name ? (
            <View style={styles.clubRow}>
              <Icon name="shield-star" size={10} color={COLORS.gold} />
              <Text style={styles.clubTxt} numberOfLines={1}>{item.club_name}</Text>
            </View>
          ) : (
            <Text style={[styles.cardEmail, { fontStyle: 'italic' }]}>No club assigned</Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {isPending && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.success + '22' }]}
              onPress={() => handleAction(item, 'approve')}
              activeOpacity={0.7}
            >
              <Icon name="check" size={15} color={COLORS.success} />
            </TouchableOpacity>
          )}
          {isBlocked && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.success + '22' }]}
              onPress={() => handleAction(item, 'activate')}
              activeOpacity={0.7}
            >
              <Icon name="account-check" size={15} color={COLORS.success} />
            </TouchableOpacity>
          )}
          {isActive && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.danger + '22' }]}
              onPress={() => handleAction(item, 'block')}
              activeOpacity={0.7}
            >
              <Icon name="account-cancel" size={15} color={COLORS.danger} />
            </TouchableOpacity>
          )}
          {item.club_id && (
            <Icon name="chevron-right" size={16} color={COLORS.gray} style={{ marginLeft: 4 }} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

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
        {!loading && (
          <View style={[styles.countBadge, { backgroundColor: accentColor + '22' }]}>
            <Text style={[styles.countBadgeTxt, { color: accentColor }]}>{admins.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
      ) : admins.length === 0 ? (
        <View style={styles.empty}>
          <Icon name={meta.icon} size={56} color={COLORS.gray} />
          <Text style={styles.emptyText}>No {filter === 'all' ? '' : filter} admins found.</Text>
        </View>
      ) : (
        <FlatList
          data={admins}
          renderItem={renderAdmin}
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
  countBadge:   { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  countBadgeTxt:{ fontWeight: '800', fontSize: 13 },

  list:         { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 30 },
  card:         {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  avatar:       {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarText:   { fontSize: 18, fontWeight: '900' },
  cardInfo:     { flex: 1 },
  nameRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' },
  cardName:     { color: COLORS.white, fontWeight: '700', fontSize: 14, flexShrink: 1 },
  cardEmail:    { color: COLORS.gray, fontSize: 11, marginBottom: 3 },
  clubRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clubTxt:      { color: COLORS.gold, fontSize: 11, fontWeight: '600', maxWidth: 160 },
  statusChip:   { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusTxt:    { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  actions:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 6 },
  actionBtn:    { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyText:    { color: COLORS.gray, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});

export default SuperAdminAdminListScreen;
