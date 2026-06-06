import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getPlayerByUserId, getPlayerMatchHistory } from '../../database/queries/playerQueries';

const MatchHistoryScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    getPlayerByUserId(user?.id).then(p => {
      if (p) getPlayerMatchHistory(p.id).then(setHistory);
    });
  }, []);

  const renderMatch = ({ item }) => (
    <View style={styles.matchCard}>
      <View style={styles.matchTop}>
        <Text style={styles.matchTitle}>{item.title}</Text>
        <Text style={styles.matchDate}>{item.match_date?.split('T')[0]}</Text>
      </View>
      <Text style={styles.venue}>{item.venue}</Text>
      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statV}>{item.runs_scored}</Text>
          <Text style={styles.statL}>Runs</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statV}>{item.balls_faced}</Text>
          <Text style={styles.statL}>Balls</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statV}>{item.fours}</Text>
          <Text style={styles.statL}>4s</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statV}>{item.sixes}</Text>
          <Text style={styles.statL}>6s</Text>
        </View>
        {item.wickets !== null && (
          <View style={styles.statBlock}>
            <Text style={[styles.statV, { color: COLORS.cyan }]}>{item.wickets}/{item.runs_conceded}</Text>
            <Text style={styles.statL}>Bowl</Text>
          </View>
        )}
      </View>
      {item.is_out ? (
        <Text style={styles.dismissal}>Out: {item.dismissal_type}</Text>
      ) : (
        <Text style={[styles.dismissal, { color: COLORS.success }]}>Not Out</Text>
      )}
    </View>
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Match History</Text>
      </View>
      <FlatList
        data={history}
        renderItem={renderMatch}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        ListEmptyComponent={<Text style={styles.empty}>No match history yet</Text>}
      />
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  header:     { paddingTop: 50, paddingHorizontal: 20, marginBottom: 12 },
  title:      { color: COLORS.white, fontSize: 22, fontWeight: '800' },
  matchCard:  { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.cardBorder },
  matchTop:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  matchTitle: { color: COLORS.white, fontWeight: '700', fontSize: 14, flex: 1 },
  matchDate:  { color: COLORS.gray, fontSize: 12 },
  venue:      { color: COLORS.gray, fontSize: 12, marginBottom: 12 },
  statsRow:   { flexDirection: 'row', gap: 16, marginBottom: 8 },
  statBlock:  { alignItems: 'center' },
  statV:      { color: COLORS.white, fontWeight: '800', fontSize: 18 },
  statL:      { color: COLORS.gray, fontSize: 11 },
  dismissal:  { color: COLORS.warning, fontSize: 12 },
  empty:      { color: COLORS.gray, textAlign: 'center', marginTop: 60, fontSize: 15 },
});

export default MatchHistoryScreen;
