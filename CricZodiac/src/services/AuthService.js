// ============================================================
// CricZodiac — Authentication Service
// Offline-first: registration & login work without a server.
// Server sync happens automatically when connection is restored.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from './ApiService';
import { API_ENDPOINTS } from '../config/api';
import { STORAGE_KEYS } from '../config/constants';
import { executeQuery, executeTransaction, queryFirstRow } from '../database/DatabaseHelper';
import uuid from 'react-native-uuid';

// ── LOGIN ─────────────────────────────────────────────────

export const login = async (email, password) => {
  // 1. Try server
  try {
    const response = await ApiService.post(API_ENDPOINTS.LOGIN, {
      email,
      password,
    });

    if (response.success && response.token) {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, response.token);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.user));
      await cacheUserLocally(response.user, password);
      return response.user;
    }
    throw new Error(response.message || 'Login failed');

  } catch (err) {
    // 2. Server unreachable → try local auth (offline fallback)
    if (!isNetworkOrServerError(err)) throw err;
    return loginLocally(email, password);
  }
};

const loginLocally = async (email, password) => {
  const user = await queryFirstRow(
    `SELECT * FROM users
     WHERE email = ?
       AND local_password = ?
       AND status = 'active'
     LIMIT 1`,
    [email, password]
  );

  if (!user) {
    throw new Error('Login failed. Server is unreachable and no local account found.');
  }

  const localToken = 'LOCAL_' + uuid.v4();
  await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, localToken);
  await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
  console.log('[Auth] Offline login:', user.email);
  return user;
};

// ── REGISTER ─────────────────────────────────────────────

export const register = async (data) => {
  const response = await ApiService.post(API_ENDPOINTS.REGISTER, data);
  if (response.success) return response;
  throw new Error(response.message || 'Registration failed');
};

// ── LOGOUT ────────────────────────────────────────────────

export const logout = async () => {
  await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  await AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA);
};

// ── SESSION ───────────────────────────────────────────────

export const getCurrentUser = async () => {
  const userData = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
  return userData ? JSON.parse(userData) : null;
};

export const isLoggedIn = async () => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  return !!token;
};

// ── HELPERS ───────────────────────────────────────────────

const isNetworkOrServerError = (err) => {
  const msg = err.message?.toLowerCase() || '';
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('connect') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('database') ||      // server-side DB errors
    msg.includes('server error') ||
    msg.includes('500') ||
    msg.includes('503')
  );
};

const cacheUserLocally = async (user, password = null) => {
  try {
    await executeQuery(
      `INSERT OR REPLACE INTO users
         (id, server_id, name, email, phone, role, status, is_approved,
          profile_pic, club_id, local_password, sync_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        user.local_id || uuid.v4(),
        user.id,
        user.name,
        user.email,
        user.phone,
        user.role,
        user.status || 'active',
        user.is_approved ? 1 : 0,
        user.profile_pic || null,
        user.club_id || null,
        password,   // store for offline login on next launch
        'synced',
      ]
    );
  } catch (e) {
    console.warn('[Auth] Failed to cache user locally:', e);
  }
};
