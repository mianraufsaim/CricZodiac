// ============================================================
// CricZodiac — Player Profile View (Read-only)
// All data fetched from API — no local SQLite.
// Shows: profile hero · summary strip · batting / bowling /
//        fielding · dismissal breakdown · wicket type breakdown
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Image, RefreshControl, Platform, StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import ApiService from '../../services/ApiService';
import { API_ENDPOINTS } from '../../config/api';

// ── Avatar ─────────────────────────────────────────────────
const Avatar = ({ uri, name, size = 80 }) => {
  if (uri) return (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: '#D4AF37' }} />
  );
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1a3a6e', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#D4AF37' }}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.38 }}>{name?.[0]?.toUpperCase() || '?'}</Text>
    </View>
  );
};

// ── Type badge ─────────────────────────────────────────────
const TypeBadge = ({ type, COLORS }) => {
  const map = {
    batsman:    { color: COLORS.gold,      icon: 'cricket' },
    bowler:     { color: COLORS.cyan,      icon: 'bullseye-arrow' },
    allrounder: { color: COLORS.purple,    icon: 'star-four-points' },
    wicketkeeper: { color: COLORS.orange,  icon: 'shield-star' },
  };
  const { color, icon } = map[type] || { color: COLORS.gray, icon: 'account' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: color + '22', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: color + '44' }}>
      <Icon name={icon} size={11} color={color} />
      <Text style={{ color, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }}>{type || 'Player'}</Text>
    </View>
  );
};

// ── Stat tile ──────────────────────────────────────────────
const StatTile = ({ label, value, icon, color, styles }) => (
  <View style={styles.tile}>
    <View style={[styles.tileIconWrap, { backgroundColor: color + '1A' }]}>
      <Icon name={icon} size={16} color={color} />
    </View>
    <Text style={styles.tileVal}>{value ?? '—'}</Text>
    <Text style={styles.tileLbl}>{label}</Text>
  </View>
);

// ── Section card ───────────────────────────────────────────
const Section = ({ icon, title, color, children, styles }) => (
  <View style={styles.card}>
    <View style={[styles.cardHeader, { borderLeftColor: color }]}>
      <View style={[styles.cardIconWrap, { backgroundColor: color + '22' }]}>
        <Icon name={icon} size={15} color={color} />
      </View>
      <Text style={[styles.cardTitle, { color }]}>{title}</Text>
    </View>
    <View style={styles.grid}>{children}</View>
  </View>
);

// ── Progress bar row (dismissals / wicket types) ───────────
const BarRow = ({ label, count, total, color, styles }) => {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round(pct)}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.barCount}>{count}</Text>
    </View>
  );
};

// ── Star row ───────────────────────────────────────────────
const StarRow = ({ label, rating, COLORS, styles }) => {
  const full    = Math.floor(rating);
  const partial = rating - full;
  return (
    <View style={styles.starBlock}>
      <Text style={styles.starLabel}>{label}</Text>
      <View style={styles.starRow}>
        {[0,1,2,3,4].map(i => (
          <Icon key={i}
            name={i < full ? 'star' : (i === full && partial >= 0.5) ? 'star-half-full' : 'star-outline'}
            size={13} color={COLORS.gold} style={{ marginRight: 1 }}
          />
        ))}
        <Text style={styles.starNum}>{rating.toFixed(1)}</Text>
      </View>
    </View>
  );
};

// ── Main Screen ────────────────────────────────────────────
const PlayerProfileViewScreen = ({ route, navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { playerId } = route.params;

  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ApiService.get(API_ENDPOINTS.PLAYERS_STATS, {
        params: { player_id: playerId },
      });
      if (res?.success) setData(res);
    } catch (_) {}
    finally { setLoading(false); }
  }, [playerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.gold} />
    </LinearGradient>
  );

  const profile  = data?.profile  || {};
  const bat      = data?.batting  || {};
  const bowl     = data?.bowling  || {};
  const field    = data?.fielding || {};
  const wktBreak = data?.wicket_break || {};

  // Star ratings
  const batAvgNum  = parseFloat(bat.batting_average) || 0;
  const batStar    = Math.min(5, (batAvgNum / 30) * 5);
  const eco        = parseFloat(bowl.economy_rate) || 999;
  const bowlStar   = eco < 999 ? Math.min(5, Math.max(0, (12 - eco) / 12 * 5)) : 0;
  const consistency = Math.min(5, ((parseInt(bat.batting_innings) || 0) / 20) * 5);
  const overall    = ((batStar + bowlStar + consistency) / 3);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Player Profile</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('PlayerCompare', { preloadId: playerId })}
          style={styles.compareBtn}
        >
          <Icon name="compare" size={20} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" colors={['#D4AF37']} />
        }
      >
        {/* ── Profile hero ── */}
        <View style={styles.hero}>
          <Avatar uri={profile.profile_pic} name={profile.full_name} size={78} />
          <View style={styles.heroInfo}>
            <View style={styles.heroNameRow}>
              <Text style={styles.heroName} numberOfLines={1}>{profile.full_name || '—'}</Text>
              {profile.jersey_number ? (
                <View style={styles.jerseyBadge}>
                  <Text style={styles.jerseyTxt}>#{profile.jersey_number}</Text>
                </View>
              ) : null}
            </View>
            <TypeBadge type={profile.player_type} COLORS={COLORS} />
            <View style={styles.metaRow}>
              {profile.club_name ? (
                <View style={styles.metaChip}>
                  <Icon name="shield-star" size={10} color={COLORS.gold} />
                  <Text style={[styles.metaTxt, { color: COLORS.gold }]}>{profile.club_name}</Text>
                </View>
              ) : null}
              {profile.batting_hand ? (
                <View style={styles.metaChip}>
                  <Icon name="hand-back-right-outline" size={10} color={COLORS.gray} />
                  <Text style={styles.metaTxt}>{profile.batting_hand}-hand</Text>
                </View>
              ) : null}
              {profile.bowling_style && profile.bowling_style !== 'none' ? (
                <View style={styles.metaChip}>
                  <Icon name="arm-flex-outline" size={10} color={COLORS.cyan} />
                  <Text style={[styles.metaTxt, { color: COLORS.cyan }]}>{profile.bowling_style}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Summary strip ── */}
        <View style={styles.summaryStrip}>
          {[
            { label: 'Matches',  value: bat.total_matches,   color: COLORS.white  },
            { label: 'Runs',     value: bat.total_runs,      color: COLORS.gold   },
            { label: 'Wickets',  value: bowl.total_wickets,  color: COLORS.cyan   },
            { label: 'Avg',      value: bat.batting_average, color: COLORS.orange },
          ].map((c, i, arr) => (
            <React.Fragment key={c.label}>
              <View style={styles.summaryChip}>
                <Text style={[styles.summaryVal, { color: c.color }]}>{c.value ?? '—'}</Text>
                <Text style={styles.summaryLbl}>{c.label}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.summaryDiv} />}
            </React.Fragment>
          ))}
        </View>

        {/* ── Star ratings ── */}
        <View style={styles.card}>
          <View style={[styles.cardHeader, { borderLeftColor: COLORS.gold }]}>
            <View style={[styles.cardIconWrap, { backgroundColor: COLORS.gold + '22' }]}>
              <Icon name="star-circle" size={15} color={COLORS.gold} />
            </View>
            <Text style={[styles.cardTitle, { color: COLORS.gold }]}>RATINGS</Text>
          </View>
          <View style={styles.starsGrid}>
            <StarRow label="Batting"     rating={batStar}     COLORS={COLORS} styles={styles} />
            <StarRow label="Bowling"     rating={bowlStar}    COLORS={COLORS} styles={styles} />
            <StarRow label="Consistency" rating={consistency} COLORS={COLORS} styles={styles} />
            <StarRow label="Overall"     rating={overall}     COLORS={COLORS} styles={styles} />
          </View>
        </View>

        {/* ── BATTING ── */}
        <Section icon="cricket" title="BATTING" color={COLORS.gold} styles={styles}>
          <StatTile icon="calendar-check"   label="Matches"      value={bat.total_matches}    color={COLORS.gold}      styles={styles} />
          <StatTile icon="counter"          label="Total Runs"   value={bat.total_runs}       color={COLORS.gold}      styles={styles} />
          <StatTile icon="trophy-outline"   label="Highest"      value={bat.highest_score}    color={COLORS.gold}      styles={styles} />
          <StatTile icon="chart-line"       label="Average"      value={bat.batting_average}  color={COLORS.gold}      styles={styles} />
          <StatTile icon="speedometer"      label="Strike Rate"  value={bat.strike_rate}      color={COLORS.gold}      styles={styles} />
          <StatTile icon="target"           label="Balls Faced"  value={bat.total_balls}      color={COLORS.gold}      styles={styles} />
          <StatTile icon="numeric-4-circle" label="Fours"        value={bat.total_fours}      color={COLORS.royalBlue} styles={styles} />
          <StatTile icon="numeric-6-circle" label="Sixes"        value={bat.total_sixes}      color={COLORS.purple}    styles={styles} />
          <StatTile icon="medal-outline"    label="50s"          value={bat.fifties}          color={COLORS.cyan}      styles={styles} />
          <StatTile icon="medal"            label="100s"         value={bat.hundreds}         color={COLORS.gold}      styles={styles} />
          <StatTile icon="check-circle-outline" label="Not Outs" value={bat.not_outs}         color={COLORS.success}   styles={styles} />
          <StatTile icon="emoticon-sad-outline" label="Ducks"    value={bat.ducks}            color={COLORS.danger}    styles={styles} />
        </Section>

        {/* Dismissal breakdown */}
        {parseInt(bat.total_outs) > 0 && (
          <View style={styles.card}>
            <View style={[styles.cardHeader, { borderLeftColor: COLORS.orange }]}>
              <View style={[styles.cardIconWrap, { backgroundColor: COLORS.orange + '22' }]}>
                <Icon name="chart-bar" size={15} color={COLORS.orange} />
              </View>
              <Text style={[styles.cardTitle, { color: COLORS.orange }]}>DISMISSAL BREAKDOWN</Text>
            </View>
            <View style={styles.barSection}>
              {[
                { label: 'Bowled',  color: '#e74c3c' },
                { label: 'Caught',  color: '#3498db' },
                { label: 'Stumped', color: '#9b59b6' },
                { label: 'Run Out', color: '#e67e22' },
                { label: 'LBW',     color: '#1abc9c' },
              ].map(d => {
                const key = d.label.toLowerCase().replace(' ', '_');
                const c = bat[key] || bat[`${key}s`] || 0;
                return <BarRow key={d.label} label={d.label} count={c} total={parseInt(bat.total_outs)} color={d.color} styles={styles} />;
              })}
            </View>
          </View>
        )}

        {/* ── BOWLING ── */}
        <Section icon="bullseye-arrow" title="BOWLING" color={COLORS.cyan} styles={styles}>
          <StatTile icon="target"          label="Wickets"      value={bowl.total_wickets}       color={COLORS.cyan}    styles={styles} />
          <StatTile icon="clock-outline"   label="Overs"        value={bowl.total_overs}         color={COLORS.cyan}    styles={styles} />
          <StatTile icon="speedometer"     label="Economy"      value={bowl.economy_rate}        color={COLORS.cyan}    styles={styles} />
          <StatTile icon="star-shooting"   label="Best"         value={bowl.best_bowling}        color={COLORS.gold}    styles={styles} />
          <StatTile icon="arrow-up-bold"   label="Runs Given"   value={bowl.total_runs_conceded} color={COLORS.orange}  styles={styles} />
          <StatTile icon="shield-star"     label="Maidens"      value={bowl.total_maidens}       color={COLORS.success} styles={styles} />
          <StatTile icon="cricket"         label="Innings"      value={bowl.bowling_innings}     color={COLORS.cyan}    styles={styles} />
        </Section>

        {/* Wicket type breakdown */}
        {parseInt(wktBreak.total_wickets) > 0 && (
          <View style={styles.card}>
            <View style={[styles.cardHeader, { borderLeftColor: COLORS.purple }]}>
              <View style={[styles.cardIconWrap, { backgroundColor: COLORS.purple + '22' }]}>
                <Icon name="chart-donut" size={15} color={COLORS.purple} />
              </View>
              <Text style={[styles.cardTitle, { color: COLORS.purple }]}>WICKET TYPES</Text>
            </View>
            <View style={styles.barSection}>
              {[
                { label: 'Bowled',  key: 'bowled',  color: '#e74c3c' },
                { label: 'Caught',  key: 'caught',  color: '#3498db' },
                { label: 'Stumped', key: 'stumped', color: '#9b59b6' },
                { label: 'Run Out', key: 'run_out', color: '#e67e22' },
                { label: 'LBW',     key: 'lbw',     color: '#1abc9c' },
              ].map(d => (
                <BarRow key={d.label} label={d.label} count={parseInt(wktBreak[d.key]) || 0} total={parseInt(wktBreak.total_wickets)} color={d.color} styles={styles} />
              ))}
            </View>
          </View>
        )}

        {/* ── FIELDING ── */}
        <Section icon="hand-back-right" title="FIELDING" color={COLORS.purple} styles={styles}>
          <StatTile icon="hand-back-left" label="Catches"   value={field.catches}   color={COLORS.purple} styles={styles} />
          <StatTile icon="run-fast"       label="Run Outs"  value={field.run_outs}  color={COLORS.orange} styles={styles} />
          <StatTile icon="lightning-bolt" label="Stumpings" value={field.stumpings} color={COLORS.gold}   styles={styles} />
        </Section>
      </ScrollView>
    </LinearGradient>
  );
};

// ── Styles ─────────────────────────────────────────────────
const getStyles = (COLORS) => StyleSheet.create({
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 10, paddingHorizontal: 16, paddingBottom: 8 },
  backBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  topTitle:   { color: COLORS.white, fontSize: 17, fontWeight: '800' },
  compareBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold + '22', borderRadius: 12, borderWidth: 1, borderColor: COLORS.gold + '55' },

  scroll:     { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },

  // Hero
  hero:          { backgroundColor: COLORS.card, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: COLORS.cardBorder },
  heroInfo:      { flex: 1, gap: 6 },
  heroNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  heroName:      { color: COLORS.white, fontSize: 17, fontWeight: '900', flex: 1 },
  jerseyBadge:   { backgroundColor: COLORS.gold + '22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.gold },
  jerseyTxt:     { color: COLORS.gold, fontSize: 11, fontWeight: '800' },
  metaRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  metaChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.darkGray, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  metaTxt:       { color: COLORS.gray, fontSize: 10, fontWeight: '600' },

  // Summary
  summaryStrip:  { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8, borderWidth: 1, borderColor: COLORS.cardBorder },
  summaryChip:   { flex: 1, alignItems: 'center', gap: 2 },
  summaryVal:    { fontSize: 20, fontWeight: '900' },
  summaryLbl:    { color: COLORS.gray, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDiv:    { width: 1, height: 30, backgroundColor: COLORS.cardBorder },

  // Section card
  card:          { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: 'hidden' },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  cardIconWrap:  { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle:     { fontWeight: '800', fontSize: 11, letterSpacing: 2 },
  grid:          { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },

  // Stat tile
  tile:          { flex: 1, minWidth: '29%', backgroundColor: COLORS.darkGray, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.cardBorder },
  tileIconWrap:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tileVal:       { color: COLORS.white, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  tileLbl:       { color: COLORS.gray, fontSize: 9, fontWeight: '600', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Stars
  starsGrid:     { flexDirection: 'row', flexWrap: 'wrap', padding: 14, gap: 10 },
  starBlock:     { width: '47%' },
  starLabel:     { color: COLORS.gray, fontSize: 11, marginBottom: 4 },
  starRow:       { flexDirection: 'row', alignItems: 'center' },
  starNum:       { color: COLORS.gold, fontSize: 11, fontWeight: '700', marginLeft: 4 },

  // Bar rows (dismissals / wicket types)
  barSection:    { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 10, gap: 8 },
  barRow:        { flexDirection: 'row', alignItems: 'center' },
  barLabel:      { color: COLORS.gray, fontSize: 11, width: 62 },
  barTrack:      { flex: 1, height: 7, backgroundColor: COLORS.darkGray, borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
  barFill:       { height: '100%', borderRadius: 4 },
  barCount:      { color: COLORS.white, fontSize: 11, fontWeight: '700', width: 22, textAlign: 'right' },
});

export default PlayerProfileViewScreen;
