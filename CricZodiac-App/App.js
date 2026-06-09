// ============================================================
// CricZodiac — App Entry Point
// ============================================================

import React from 'react';
import { Platform, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { SyncProvider } from './src/context/SyncContext';
import AppNavigator from './src/navigation/AppNavigator';
import { toastConfig } from './src/utils/toast';

// Inner component so useTheme() works inside ThemeProvider
const AppInner = () => {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
        translucent={false}
      />
      <AuthProvider>
        <SyncProvider>
          <AppNavigator />
          <Toast
            config={toastConfig}
            position="top"
            topOffset={Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 8}
          />
        </SyncProvider>
      </AuthProvider>
    </>
  );
};

const App = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  </GestureHandlerRootView>
);

export default App;
