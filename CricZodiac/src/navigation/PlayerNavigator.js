import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../context/ThemeContext';

import PlayerDashboard from '../screens/player/PlayerDashboard';
import PlayerProfileScreen from '../screens/player/PlayerProfileScreen';
import PlayerStatsScreen from '../screens/player/PlayerStatsScreen';
import MatchHistoryScreen from '../screens/player/MatchHistoryScreen';
import LeaderboardScreen from '../screens/shared/LeaderboardScreen';
import RankingsScreen from '../screens/shared/RankingsScreen';
import PlayerProfileViewScreen from '../screens/shared/PlayerProfileViewScreen';
import PlayerCompareScreen from '../screens/shared/PlayerCompareScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Wrap Home tab so Leaderboard/Compare/ProfileView can be pushed on top
const HomeStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="PlayerDashboard"    component={PlayerDashboard} />
    <Stack.Screen name="Rankings"           component={RankingsScreen} />
    <Stack.Screen name="Leaderboard"        component={LeaderboardScreen} />
    <Stack.Screen name="PlayerProfile"      component={PlayerProfileViewScreen} />
    <Stack.Screen name="PlayerProfileView"  component={PlayerProfileViewScreen} />
    <Stack.Screen name="PlayerCompare"      component={PlayerCompareScreen} />
  </Stack.Navigator>
);

// Stats stack so Profile/Compare can be pushed from Stats screen
const StatsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="PlayerStatsMain"    component={PlayerStatsScreen} />
    <Stack.Screen name="Rankings"           component={RankingsScreen} />
    <Stack.Screen name="Leaderboard"        component={LeaderboardScreen} />
    <Stack.Screen name="PlayerProfile"      component={PlayerProfileViewScreen} />
    <Stack.Screen name="PlayerProfileView"  component={PlayerProfileViewScreen} />
    <Stack.Screen name="PlayerCompare"      component={PlayerCompareScreen} />
  </Stack.Navigator>
);

const PlayerNavigator = () => {
  const { colors: COLORS } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: COLORS.tabBar, borderTopColor: COLORS.tabBarBorder, height: 60 },
        tabBarActiveTintColor: COLORS.gold,
        tabBarInactiveTintColor: COLORS.gray,
        tabBarLabelStyle: { fontSize: 11, marginBottom: 4 },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Home: 'view-dashboard', Stats: 'podium', History: 'history',
            Rankings: 'trophy', Leaderboard: 'trophy', Profile: 'account-circle',
          };
          return <Icon name={icons[route.name] || 'circle'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"        component={HomeStack}          options={{ tabBarLabel: 'Dashboard' }} />
      <Tab.Screen name="Stats"       component={StatsStack}         options={{ tabBarLabel: 'Stats' }} />
      <Tab.Screen name="Rankings"    component={RankingsScreen} />
      <Tab.Screen name="History"     component={MatchHistoryScreen} />
      <Tab.Screen name="Profile"     component={PlayerProfileScreen} />
    </Tab.Navigator>
  );
};

export default PlayerNavigator;
