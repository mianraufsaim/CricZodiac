// ============================================================
// CricZodiac — Super Admin Navigator
// Zodiac Technologies staff: manages all clubs globally
// ============================================================

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SuperAdminDashboard          from '../screens/admin/SuperAdminDashboard';
import SuperAdminClubDetailScreen   from '../screens/admin/SuperAdminClubDetailScreen';
import SuperAdminClubListScreen     from '../screens/admin/SuperAdminClubListScreen';
import SuperAdminAdminListScreen    from '../screens/admin/SuperAdminAdminListScreen';
import CreateClubScreen             from '../screens/admin/CreateClubScreen';
import CreateUserScreen             from '../screens/shared/CreateUserScreen';
import PendingApprovalsScreen       from '../screens/admin/PendingApprovalsScreen';

const Stack = createNativeStackNavigator();

const SuperAdminNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="SuperAdminDashboard"  component={SuperAdminDashboard} />
    <Stack.Screen name="PendingApprovals"     component={PendingApprovalsScreen} />
    <Stack.Screen name="CreateClub"           component={CreateClubScreen} />
    <Stack.Screen name="SuperAdminClubDetail" component={SuperAdminClubDetailScreen} />
    <Stack.Screen name="SuperAdminClubList"   component={SuperAdminClubListScreen} />
    <Stack.Screen name="SuperAdminAdminList"  component={SuperAdminAdminListScreen} />
    <Stack.Screen name="CreateUser"           component={CreateUserScreen} />
  </Stack.Navigator>
);

export default SuperAdminNavigator;
