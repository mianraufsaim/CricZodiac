// ============================================================
// CricZodiac — Root App Navigator
// ============================================================

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ROLES } from '../config/constants';

// Navigators
import AuthNavigator       from './AuthNavigator';
import AdminNavigator      from './AdminNavigator';
import UmpireNavigator     from './UmpireNavigator';
import PlayerNavigator     from './PlayerNavigator';
import SuperAdminNavigator from './SuperAdminNavigator';

// Screens
import ClubSelectorScreen from '../screens/shared/ClubSelectorScreen';

const AppNavigator = () => {
  const { user, activeClub, viewingAsClub, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  const getNavigator = () => {
    if (!user) return <AuthNavigator />;

    switch (user.role) {
      case ROLES.SUPER_ADMIN:
        // Super admin can "enter" a club and view it as a club admin
        if (viewingAsClub) return <AdminNavigator />;
        return <SuperAdminNavigator />;

      case ROLES.ADMIN:
        if (!activeClub) return <ClubSelectorScreen />;
        return <AdminNavigator />;

      case ROLES.UMPIRE:
        return <UmpireNavigator />;

      case ROLES.PLAYER:
        return <PlayerNavigator />;

      default:
        return <AuthNavigator />;
    }
  };

  return (
    <NavigationContainer>
      {getNavigator()}
    </NavigationContainer>
  );
};

export default AppNavigator;
