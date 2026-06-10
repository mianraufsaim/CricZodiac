// ============================================================
// CricZodiac — Club Selector Screen
// Shown when an admin manages multiple clubs — pick one to enter
// ============================================================

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getAllClubs } from '../../database/queries/clubQueries';
import { showAlert } from '../../utils/toast';

const ClubSelectorScreen = () => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { user, selectClub, logout } = useAuth();
  const [clubs,      setClubs]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadClubs(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadClubs();
    setRefreshing(false);
  }, []);

  const loadClubs = async () => {
    try {
      const all = await getAllClubs();

      if (all.length > 0) {
        setClubs(all);
        // Auto-pick if only 1 club in SQLite
        if (all.length === 1) await selectClub(all[0]);
      } else if (user?.club_id) {
        // Club not yet synced to local SQLite — build from stored user data
        const fallback = {
          id:      String(user.club_id),
          name:    user.club_name || 'My Club',
          city:    null,
          country: null,
          status:  'active',
        };
        await selectClub(fallback);
        // selectClub triggers re-render → navigates to AdminNavigator
      } else {
        setClubs([]);
      }
    } catch (e) {
      showAlert('Error', 'Could not load clubs: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePick = async (club) => {
    await selectClub(club);
    // AuthContext triggers re-render → AppNavigator sends to AdminNavigator
  };

  const renderClub = ({ item }) => (
    <TouchableOpacity style={styles.clubCard} onPress={() => handlePick(item)} activeOpacity={0.85}>
      <View style={styles.clubIcon}>
        <Icon name="shield-star" size={28} color={COLORS.gold} />
      </View>
      <View style={styles.clubInfo}>
        <Text style={styles.clubName}>{item.name}</Text>
        <Text style={styles.clubMeta}>
          {[item.city, item.country].filter(Boolean).join(' · ') || 'Indoor Cricket Club'}
        </Text>
      </View>
      <Icon name="chevron-right" size={22} color={COLORS.gold} />
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/round_logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Select Club</Text>
        <Text style={styles.subtitle}>Welcome, {user?.name} — pick a club to manage</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 40 }} />
      ) : clubs.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Icon name="shield-off-outline" size={48} color={COLORS.gray} />
          <Text style={styles.emptyText}>No clubs assigned yet.</Text>
          <Text style={styles.emptyHint}>Contact Zodiac Technologies to set up your club.</Text>
        </View>
      ) : (
        <FlatList
          data={clubs}
          renderItem={renderClub}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={() => showAlert('Logout', 'Sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ])}>
        <Icon name="logout" size={18} color={COLORS.gray} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  container:  { flex: 1 },
  header:     { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24, paddingBottom: 32 },
  logo:       { width: 84, height: 84, marginBottom: 16 },
  title:      { fontSize: 26, fontWeight: '900', color: COLORS.white, letterSpacing: 4, marginBottom: 6 },
  subtitle:   { color: COLORS.gray, fontSize: 14, textAlign: 'center' },

  list:       { paddingHorizontal: 20, paddingBottom: 20 },
  clubCard:   {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  clubIcon:   {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.darkGray,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  clubInfo:   { flex: 1 },
  clubName:   { color: COLORS.white, fontWeight: '700', fontSize: 16, marginBottom: 3 },
  clubMeta:   { color: COLORS.gray, fontSize: 13 },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText:  { color: COLORS.white, fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  emptyHint:  { color: COLORS.gray, fontSize: 13, marginTop: 8, textAlign: 'center' },

  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 36 },
  logoutText: { color: COLORS.gray, fontSize: 14 },
});

export default ClubSelectorScreen;
