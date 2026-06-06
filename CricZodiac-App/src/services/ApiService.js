// ============================================================
// CricZodiac — Axios API Service
// ============================================================

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, API_TIMEOUT } from '../config/api';
import { STORAGE_KEYS } from '../config/constants';

const ApiService = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
});

// ── Request interceptor — attach auth token ───────────────
ApiService.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor — normalize errors ───────────────
ApiService.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      await AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA);
    }
    const message =
      error.response?.data?.message ||
      error.message ||
      'Network error. Please check your connection.';
    return Promise.reject(new Error(message));
  }
);

export default ApiService;
