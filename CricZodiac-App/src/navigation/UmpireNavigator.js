// ============================================================
// CricZodiac — Umpire Navigator
// Umpires can: score matches, manage series, create players,
// view leaderboard & player profiles
// ============================================================

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import UmpireDashboard       from '../screens/umpire/UmpireDashboard';
import SeriesListScreen      from '../screens/umpire/SeriesListScreen';
import CreateSeriesScreen    from '../screens/umpire/CreateSeriesScreen';
import SeriesDetailScreen    from '../screens/umpire/SeriesDetailScreen';
import MatchSetupScreen      from '../screens/umpire/MatchSetupScreen';
import TeamSelectionScreen   from '../screens/umpire/TeamSelectionScreen';
import TossScreen            from '../screens/umpire/TossScreen';
import LiveScoringScreen     from '../screens/umpire/LiveScoringScreen';
import SelectBatsmanScreen   from '../screens/umpire/SelectBatsmanScreen';
import SelectBowlerScreen    from '../screens/umpire/SelectBowlerScreen';
import WicketScreen          from '../screens/umpire/WicketScreen';
import ExtrasScreen          from '../screens/umpire/ExtrasScreen';
import ScorecardScreen       from '../screens/umpire/ScorecardScreen';
import MatchSummaryScreen    from '../screens/umpire/MatchSummaryScreen';
import AddEditPlayerScreen   from '../screens/admin/AddEditPlayerScreen';
import ManagePlayersScreen   from '../screens/admin/ManagePlayersScreen';
import CreateUserScreen      from '../screens/shared/CreateUserScreen';
import LeaderboardScreen     from '../screens/shared/LeaderboardScreen';
import PlayerProfileViewScreen from '../screens/shared/PlayerProfileViewScreen';
import PlayerCompareScreen   from '../screens/shared/PlayerCompareScreen';
import SyncStatusScreen      from '../screens/admin/SyncStatusScreen';

const Stack = createNativeStackNavigator();

const UmpireNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    {/* Dashboard */}
    <Stack.Screen name="UmpireDashboard"   component={UmpireDashboard} />

    {/* Series & Matches */}
    <Stack.Screen name="SeriesList"        component={SeriesListScreen} />
    <Stack.Screen name="CreateSeries"      component={CreateSeriesScreen} />
    <Stack.Screen name="SeriesDetail"      component={SeriesDetailScreen} />
    <Stack.Screen name="MatchSetup"        component={MatchSetupScreen} />
    <Stack.Screen name="TeamSelection"     component={TeamSelectionScreen} />
    <Stack.Screen name="Toss"              component={TossScreen} />
    <Stack.Screen name="LiveScoring"       component={LiveScoringScreen} />
    <Stack.Screen name="SelectBatsman"     component={SelectBatsmanScreen} />
    <Stack.Screen name="SelectBowler"      component={SelectBowlerScreen} />
    <Stack.Screen name="Wicket"            component={WicketScreen} />
    <Stack.Screen name="Extras"            component={ExtrasScreen} />
    <Stack.Screen name="Scorecard"         component={ScorecardScreen} />
    <Stack.Screen name="MatchSummary"      component={MatchSummaryScreen} />

    {/* Player management (umpire can create players, not umpires) */}
    <Stack.Screen name="ManagePlayers"     component={ManagePlayersScreen} />
    <Stack.Screen name="AddEditPlayer"     component={AddEditPlayerScreen} />
    <Stack.Screen name="CreateUser"        component={CreateUserScreen}
      initialParams={{ defaultRole: 'player', lockRole: true }} />

    {/* Sync */}
    <Stack.Screen name="SyncStatus"        component={SyncStatusScreen} />

    {/* Stats & profiles */}
    <Stack.Screen name="Leaderboard"       component={LeaderboardScreen} />
    <Stack.Screen name="PlayerProfile"     component={PlayerProfileViewScreen} />
    <Stack.Screen name="PlayerProfileView" component={PlayerProfileViewScreen} />
    <Stack.Screen name="PlayerCompare"     component={PlayerCompareScreen} />
  </Stack.Navigator>
);

export default UmpireNavigator;
