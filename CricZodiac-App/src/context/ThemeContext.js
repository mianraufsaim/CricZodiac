// ============================================================
// CricZodiac — Theme Context
// • Default: follows system (sunrise/sunset auto-mode)
// • Manual override persisted to AsyncStorage
// • Toggle between light / dark / system
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_COLORS, LIGHT_COLORS } from '../config/theme';

const THEME_KEY = 'criczodiac_theme'; // 'light' | 'dark' | 'system'

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const systemScheme  = useColorScheme();           // 'light' | 'dark' | null
  const [mode, setMode] = useState('system');        // user preference

  // Load saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setMode(saved);
      }
    });
  }, []);

  // Resolve which palette to use
  const resolvedDark =
    mode === 'system'
      ? systemScheme === 'dark'   // follow OS (sunrise/sunset on device)
      : mode === 'dark';

  const colors = resolvedDark ? DARK_COLORS : LIGHT_COLORS;

  // Toggle between light ↔ dark (manual override)
  const toggleTheme = useCallback(async () => {
    const next = resolvedDark ? 'light' : 'dark';
    setMode(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  }, [resolvedDark]);

  // Reset to system default
  const followSystem = useCallback(async () => {
    setMode('system');
    await AsyncStorage.setItem(THEME_KEY, 'system');
  }, []);

  return (
    <ThemeContext.Provider value={{ colors, isDark: resolvedDark, mode, toggleTheme, followSystem }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};
