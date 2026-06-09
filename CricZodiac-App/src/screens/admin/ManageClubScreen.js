// ============================================================
// CricZodiac — Create / Manage Club Screen (Super Admin)
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { createClub, updateClub, getClub } from '../../database/queries/clubQueries';

const ManageClubScreen = ({ navigation, route }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { clubId, adminView } = route.params || {};
  const isEdit = !!clubId;

  const [form, setForm]     = useState({ name: '', country: '', city: '', contact_email: '', logo_url: '', status: 'active' });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    if (isEdit) {
      return getClub(clubId).then(club => {
        if (club) setForm({ name: club.name, country: club.country || '', city: club.city || '', contact_email: club.contact_email || '', logo_url: club.logo_url || '', status: club.status });
      }).finally(() => setFetching(false));
    }
    return Promise.resolve();
  };

  useEffect(() => {
    load();
  }, [clubId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Club name is required.'); return; }
    setLoading(true);
    try {
      if (isEdit) {
        await updateClub(clubId, form);
        Alert.alert('Updated', `${form.name} has been updated.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        await createClub(form);
        Alert.alert('Created', `${form.name} has been created.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={COLORS.gold} size="large" />
    </View>
  );

  const Field = ({ label, keyName, placeholder, keyboardType = 'default' }) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={COLORS.gray}
        value={form[keyName]}
        onChangeText={v => set(keyName, v)}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Manage Club' : 'New Club'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />}>
        <View style={styles.card}>
          <Field label="CLUB NAME *"     keyName="name"          placeholder="e.g. Karachi Indoor Cricket Club" />
          <Field label="COUNTRY"         keyName="country"        placeholder="e.g. Pakistan" />
          <Field label="CITY"            keyName="city"           placeholder="e.g. Karachi" />
          <Field label="CONTACT EMAIL"   keyName="contact_email"  placeholder="admin@club.com" keyboardType="email-address" />

          {isEdit && !adminView && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>STATUS</Text>
              <View style={styles.statusRow}>
                {['active', 'suspended'].map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOpt, form.status === s && styles.statusOptActive]}
                    onPress={() => set('status', s)}
                  >
                    <Text style={[styles.statusOptText, form.status === s && { color: COLORS.white }]}>
                      {s.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={loading}
          >
            <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.saveBtnGrad}>
              <Text style={styles.saveBtnText}>{loading ? 'Saving...' : (isEdit ? 'SAVE CHANGES' : 'CREATE CLUB')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, marginBottom: 16 },
  headerTitle:   { fontSize: 18, fontWeight: '700', color: COLORS.white },
  scroll:        { padding: 20, paddingBottom: 40 },
  card:          { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.cardBorder },
  fieldGroup:    { marginBottom: 16 },
  label:         { color: COLORS.gray, fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 1 },
  input:         { backgroundColor: COLORS.darkGray, borderRadius: 10, paddingHorizontal: 14, height: 48, color: COLORS.white, fontSize: 15 },
  statusRow:     { flexDirection: 'row', gap: 12 },
  statusOpt:     { flex: 1, height: 44, borderRadius: 10, backgroundColor: COLORS.darkGray, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.cardBorder },
  statusOptActive: { backgroundColor: COLORS.royalBlue, borderColor: COLORS.gold },
  statusOptText: { color: COLORS.gray, fontWeight: '700', fontSize: 13 },
  saveBtn:       { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  saveBtnGrad:   { height: 52, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:   { color: COLORS.navy, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
});

export default ManageClubScreen;
