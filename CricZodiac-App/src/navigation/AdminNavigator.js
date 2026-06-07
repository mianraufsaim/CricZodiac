// ============================================================
// CricZodiac — Admin Navigator
// Tabs: Home | Users | Series | Stats
// Sync removed from tab bar — shown as dot in Dashboard header
// ============================================================

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../context/ThemeContext';

import AdminDashboard          from '../screens/admin/AdminDashboard';
import EditProfileScreen       from '../screens/admin/EditProfileScreen';
import EditClubScreen          from '../screens/admin/EditClubScreen';
import ManageClubScreen        from '../screens/admin/ManageClubScreen';
import ManageUsersScreen       from '../screens/admin/ManageUsersScreen';
import CreateUserScreen        from '../screens/shared/CreateUserScreen';
import EditUserScreen          from '../screens/shared/EditUserScreen';
import ManagePlayersScreen     from '../screens/admin/ManagePlayersScreen';
import AddEditPlayerScreen     from '../screens/admin/AddEditPlayerScreen';
import AllMatchesScreen        from '../screens/admin/AllMatchesScreen';
import SyncStatusScreen        from '../screens/admin/SyncStatusScreen';
import MatchSetupScreen        from '../screens/umpire/MatchSetupScreen';
import SeriesListScreen        from '../screens/umpire/SeriesListScreen';
import CreateSeriesScreen      from '../screens/umpire/CreateSeriesScreen';
import SeriesDetailScreen      from '../screens/umpire/SeriesDetailScreen';
import TeamSelectionScreen     from '../screens/umpire/TeamSelectionScreen';
import TossScreen              from '../screens/umpire/TossScreen';
import LiveScoringScreen       from '../screens/umpire/LiveScoringScreen';
import SelectBatsmanScreen     from '../screens/umpire/SelectBatsmanScreen';
import SelectBowlerScreen      from '../screens/umpire/SelectBowlerScreen';
import WicketScreen            from '../screens/umpire/WicketScreen';
import ExtrasScreen            from '../screens/umpire/ExtrasScreen';
import ScorecardScreen         from '../screens/umpire/ScorecardScreen';
import MatchSummaryScreen      from '../screens/umpire/MatchSummaryScreen';
import PlayerProfileScreen     from '../screens/player/PlayerProfileScreen';
import LeaderboardScreen       from '../screens/shared/LeaderboardScreen';
import PlayerProfileViewScreen from '../screens/shared/PlayerProfileViewScreen';
import PlayerCompareScreen     from '../screens/shared/PlayerCompareScreen';
import ClubSelectorScreen      from '../screens/shared/ClubSelectorScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ── Shared match screens ──────────────────────────────────
const MATCH_SCREENS = [
  { name: 'MatchSetup',    component: MatchSetupScreen    },
  { name: 'TeamSelection', component: TeamSelectionScreen },
  { name: 'Toss',         component: TossScreen           },
  { name: 'LiveScoring',  component: LiveScoringScreen    },
  { name: 'SelectBatsman',component: SelectBatsmanScreen  },
  { name: 'SelectBowler', component: SelectBowlerScreen   },
  { name: 'Wicket',       component: WicketScreen         },
  { name: 'Extras',       component: ExtrasScreen         },
  { name: 'Scorecard',    component: ScorecardScreen      },
  { name: 'MatchSummary', component: MatchSummaryScreen   },
];

// ── Home Stack ────────────────────────────────────────────
const AdminHomeStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AdminDashboard"    component={AdminDashboard} />
    <Stack.Screen name="EditProfile"       component={EditProfileScreen} />
    <Stack.Screen name="EditClub"          component={EditClubScreen} />
    <Stack.Screen name="ManageClub"        component={ManageClubScreen} />
    <Stack.Screen name="AllMatches"        component={AllMatchesScreen} />
    <Stack.Screen name="ClubSelector"      component={ClubSelectorScreen} />
    <Stack.Screen name="SyncStatus"        component={SyncStatusScreen} />
    <Stack.Screen name="PlayerProfileView" component={PlayerProfileViewScreen} />
    <Stack.Screen name="PlayerCompare"     component={PlayerCompareScreen} />
    <Stack.Screen name="Leaderboard"       component={LeaderboardScreen} />
    {MATCH_SCREENS.map(s => <Stack.Screen key={s.name} name={s.name} component={s.component} />)}
  </Stack.Navigator>
);

// ── Users Stack ───────────────────────────────────────────
const UsersStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ManageUsers"       component={ManageUsersScreen} />
    <Stack.Screen name="CreateUser"        component={CreateUserScreen} />
    <Stack.Screen name="EditUser"          component={EditUserScreen} />
    <Stack.Screen name="ManagePlayers"     component={ManagePlayersScreen} />
    <Stack.Screen name="AddEditPlayer"     component={AddEditPlayerScreen} />
    <Stack.Screen name="PlayerProfileView" component={PlayerProfileViewScreen} />
    <Stack.Screen name="PlayerCompare"     component={PlayerCompareScreen} />
    <Stack.Screen name="PlayerProfile"     component={PlayerProfileScreen} />
  </Stack.Navigator>
);

// ── Series Stack (main entry point for match management) ──
const SeriesStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="SeriesList"        component={SeriesListScreen} />
    <Stack.Screen name="CreateSeries"      component={CreateSeriesScreen} />
    <Stack.Screen name="SeriesDetail"      component={SeriesDetailScreen} />
    <Stack.Screen name="AllMatches"        component={AllMatchesScreen} />
    <Stack.Screen name="PlayerProfileView" component={PlayerProfileViewScreen} />
    {MATCH_SCREENS.map(s => <Stack.Screen key={s.name} name={s.name} component={s.component} />)}
  </Stack.Navigator>
);

// ── Stats Stack ───────────────────────────────────────────
const StatsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Leaderboard"       component={LeaderboardScreen} />
    <Stack.Screen name="PlayerProfileView" component={PlayerProfileViewScreen} />
    <Stack.Screen name="PlayerCompare"     component={PlayerCompareScreen} />
  </Stack.Navigator>
);

// ── Tab icons ─────────────────────────────────────────────
const TAB_ICONS = {
  Home:   'view-dashboard',
  Users:  'account-group',
  Series: 'trophy',
  Stats:  'podium',
};

const AdminNavigator = () => {
  const { colors: COLORS } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.tabBar,
          borderTopColor: COLORS.tabBarBorder,
          height: 58,
          paddingBottom: 6,
        },
        tabBarActiveTintColor:   COLORS.gold,
        tabBarInactiveTintColor: COLORS.gray,
        tabBarLabelStyle: { fontSize: 11 },
        tabBarIcon: ({ color, size }) => (
          <Icon name={TAB_ICONS[route.name] || 'circle'} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home"   component={AdminHomeStack} options={{ tabBarLabel: 'Dashboard' }} />
      <Tab.Screen name="Users"  component={UsersStack} />
      <Tab.Screen name="Series" component={SeriesStack} />
      <Tab.Screen name="Stats"  component={StatsStack} />
    </Tab.Navigator>
  );
};

export default AdminNavigator;
