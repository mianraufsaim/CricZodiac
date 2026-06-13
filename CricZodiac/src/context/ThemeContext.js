// ============================================================
// CricZodiac — Theme Context
// Auto mode: switches dark/light based on sunrise & sunset.
// Coordinates fetched once via IP API (no native module needed).
// Manual override persisted to AsyncStorage.
// Modes: 'auto' | 'light' | 'dark'
// ============================================================

import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useRef,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_COLORS, LIGHT_COLORS } from '../config/theme';

const THEME_KEY    = 'criczodiac_theme';   // 'auto' | 'light' | 'dark'
const COORDS_KEY   = 'criczodiac_coords';  // cached lat/lon
const COORDS_TTL   = 24 * 60 * 60 * 1000; // re-fetch after 24h

// ── Sunrise / Sunset calculator (pure JS, no library) ──────
// Based on NOAA / Wikipedia sunrise equation
function getSunTimes(lat, lon, date = new Date()) {
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;

  // Julian date of noon on given day
  const JD = date.getTime() / 86400000 + 2440587.5;
  const J2000 = 2451545.0;

  // Mean solar noon (Julian)
  const n     = Math.round(JD - J2000 - 0.5 + lon / 360);
  const Jstar = J2000 + n - lon / 360;

  // Solar mean anomaly
  const M = ((357.5291 + 0.98560028 * (Jstar - J2000)) % 360 + 360) % 360;

  // Equation of center
  const C = 1.9148 * Math.sin(toRad(M))
          + 0.0200 * Math.sin(toRad(2 * M))
          + 0.0003 * Math.sin(toRad(3 * M));

  // Ecliptic longitude
  const lambda = ((M + C + 180 + 102.9372) % 360 + 360) % 360;

  // Solar transit
  const Jtransit = Jstar
    + 0.0053 * Math.sin(toRad(M))
    - 0.0069 * Math.sin(toRad(2 * lambda));

  // Declination of the sun
  const decl = toDeg(Math.asin(Math.sin(toRad(lambda)) * Math.sin(toRad(23.4397))));

  // Hour angle
  const cosH = (Math.sin(toRad(-0.833)) - Math.sin(toRad(lat)) * Math.sin(toRad(decl)))
             / (Math.cos(toRad(lat)) * Math.cos(toRad(decl)));

  if (cosH < -1) return { sunrise: null, sunset: null }; // midnight sun
  if (cosH >  1) return { sunrise: null, sunset: null }; // polar night

  const H = toDeg(Math.acos(cosH));

  const jdToDate = jd => new Date((jd - 2440587.5) * 86400000);

  return {
    sunrise: jdToDate(Jtransit - H / 360),
    sunset:  jdToDate(Jtransit + H / 360),
  };
}

function isDaytime(lat, lon) {
  const now   = new Date();
  const times = getSunTimes(lat, lon, now);
  if (!times.sunrise || !times.sunset) return true; // polar fallback → stay light
  return now >= times.sunrise && now <= times.sunset;
}

// Time-of-day fallback (no coords): dark 7pm–6am
function isDaytimeFallback() {
  const h = new Date().getHours();
  return h >= 6 && h < 19;
}

// ── IP-based coordinates (cached 24h in AsyncStorage) ──────
async function fetchCoords() {
  try {
    // Check cache
    const cached = await AsyncStorage.getItem(COORDS_KEY);
    if (cached) {
      const { lat, lon, ts } = JSON.parse(cached);
      if (Date.now() - ts < COORDS_TTL) return { lat, lon };
    }
  } catch (_) {}

  try {
    const res  = await fetch('https://ipapi.co/json/', { timeout: 5000 });
    const data = await res.json();
    if (data.latitude && data.longitude) {
      const coords = { lat: data.latitude, lon: data.longitude };
      await AsyncStorage.setItem(COORDS_KEY, JSON.stringify({ ...coords, ts: Date.now() }));
      return coords;
    }
  } catch (_) {}

  return null;
}

// ── Context ────────────────────────────────────────────────
const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [mode,   setMode]   = useState('auto');
  const [isDark, setIsDark] = useState(false);
  const [coords, setCoords] = useState(null);
  const timerRef = useRef(null);

  // Compute isDark from mode + coords
  const computeDark = useCallback((m, c) => {
    if (m === 'light') return false;
    if (m === 'dark')  return true;
    // auto
    if (c) return !isDaytime(c.lat, c.lon);
    return !isDaytimeFallback();
  }, []);

  // ── Init on mount ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      // Load saved mode
      const saved = await AsyncStorage.getItem(THEME_KEY);
      const m = (saved === 'light' || saved === 'dark' || saved === 'auto') ? saved : 'auto';
      setMode(m);

      // Get coords only if auto
      let c = null;
      if (m === 'auto') {
        c = await fetchCoords();
        setCoords(c);
      }
      setIsDark(computeDark(m, c));
    })();
  }, []);

  // ── Interval: re-check every minute in auto mode ───────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mode !== 'auto') return;

    timerRef.current = setInterval(() => {
      setIsDark(computeDark('auto', coords));
    }, 60 * 1000);

    return () => clearInterval(timerRef.current);
  }, [mode, coords, computeDark]);

  // ── Manual toggle (light ↔ dark) ───────────────────────
  const toggleTheme = useCallback(async () => {
    const next = isDark ? 'light' : 'dark';
    setMode(next);
    setIsDark(!isDark);
    await AsyncStorage.setItem(THEME_KEY, next);
  }, [isDark]);

  // ── Reset to auto (sunrise/sunset) ─────────────────────
  const resetToAuto = useCallback(async () => {
    setMode('auto');
    await AsyncStorage.setItem(THEME_KEY, 'auto');
    const c = await fetchCoords();
    setCoords(c);
    setIsDark(computeDark('auto', c));
  }, [computeDark]);

  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider value={{
      colors, isDark, mode,
      toggleTheme,   // manual light ↔ dark
      resetToAuto,   // go back to auto sunrise/sunset
      followSystem: resetToAuto, // alias for backwards compat
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};
