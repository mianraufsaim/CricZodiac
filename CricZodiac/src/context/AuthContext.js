// ============================================================
// CricZodiac — Auth Context
// Tracks: user session + active club selection
// ============================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser, isLoggedIn, logout as authLogout } from '../services/AuthService';
import { getDatabase } from '../database/DatabaseHelper';
import { getClub } from '../database/queries/clubQueries';
import { STORAGE_KEYS, ROLES } from '../config/constants';

const ACTIVE_CLUB_KEY = 'active_club';

const AuthContext = createContext(null);

/** Roles that operate within a club scope */
const needsClubContext = (role) =>
  [ROLES.ADMIN, ROLES.UMPIRE, ROLES.PLAYER].includes(role);

/**
 * Resolve club for a user.
 * Priority: savedClubId from AsyncStorage → user.club_id in SQLite → synthetic from userData fields.
 * This handles the case where the club was created on the server but not yet synced to local SQLite.
 */
const resolveClub = async (userData, savedClubId) => {
  // 1. Try restoring previously selected club
  const lookupId = savedClubId || userData?.club_id;
  if (lookupId) {
    try {
      const club = await getClub(String(lookupId));
      if (club) return club;
    } catch (_) {}
  }

  // 2. Fallback: build a minimal club object from the user's stored data.
  //    login.php returns club_id + club_name in the user object.
  if (userData?.club_id) {
    return {
      id:   String(userData.club_id),
      name: userData.club_name || 'My Club',
      city: null,
      country: null,
      status: 'active',
    };
  }

  return null;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser]                   = useState(null);
  const [activeClub, setActiveClub]       = useState(null);
  const [viewingAsClub, setViewingAsClub] = useState(null); // super_admin only
  const [loading, setLoading]             = useState(true);

  useEffect(() => { initApp(); }, []);

  const initApp = async () => {
    try {
      await getDatabase();
      const loggedIn = await isLoggedIn();
      if (loggedIn) {
        const userData = await getCurrentUser();
        setUser(userData);

        if (userData && needsClubContext(userData.role)) {
          const savedClubId = await AsyncStorage.getItem(ACTIVE_CLUB_KEY);
          const club = await resolveClub(userData, savedClubId);
          if (club) {
            setActiveClub(club);
            await AsyncStorage.setItem(ACTIVE_CLUB_KEY, String(club.id));
          }
        }
      }
    } catch (e) {
      console.error('[Auth] Init error:', e);
    } finally {
      setLoading(false);
    }
  };

  const login = async (userData) => {
    setUser(userData);
    if (userData && needsClubContext(userData.role)) {
      try {
        const club = await resolveClub(userData, null);
        if (club) {
          setActiveClub(club);
          await AsyncStorage.setItem(ACTIVE_CLUB_KEY, String(club.id));
        }
      } catch (_) {}
    }
  };

  /** Called from ClubSelectorScreen when admin picks a club */
  const selectClub = async (club) => {
    setActiveClub(club);
    await AsyncStorage.setItem(ACTIVE_CLUB_KEY, String(club.id));
  };

  /** Super admin: enter a club's view */
  const enterClubView = (club) => setViewingAsClub(club);

  /** Super admin: exit club view, back to super admin dashboard */
  const exitClubView = () => setViewingAsClub(null);

  const logout = async () => {
    await authLogout();
    await AsyncStorage.removeItem(ACTIVE_CLUB_KEY);
    setUser(null);
    setActiveClub(null);
    setViewingAsClub(null);
  };

  return (
    <AuthContext.Provider value={{ user, activeClub, viewingAsClub, loading, login, logout, selectClub, enterClubView, exitClubView }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
