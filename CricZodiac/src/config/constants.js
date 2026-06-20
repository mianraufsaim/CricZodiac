// ============================================================
// CricZodiac — App Constants
// ============================================================

// Brand Colors (from Zodiac Technologies palette)
export const COLORS = {
  navy:        '#0A0F2C',
  royalBlue:   '#102B6F',
  cyan:        '#00F0FF',
  purple:      '#4B2AA1',
  gold:        '#D4AF37',
  white:       '#FFFFFF',
  lightGray:   '#E8EAF0',
  gray:        '#8892A4',
  darkGray:    '#2A2F45',
  success:     '#00C851',
  warning:     '#FFBB33',
  danger:      '#FF4444',
  background:  '#060A1A',
  card:        '#0D1530',
  cardBorder:  '#1A2445',
};

// User Roles
export const ROLES = {
  SUPER_ADMIN: 'super_admin',  // Zodiac Technologies staff — sees all clubs
  ADMIN:       'admin',        // Club admin — manages one or more clubs
  PLAYER:      'player',       // Per-club player (view-only)
};

// Sync Status
export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED:  'synced',
  FAILED:  'failed',
};

// Match Status
export const MATCH_STATUS = {
  SETUP:      'setup',
  TOSS:       'toss',
  LIVE:       'live',
  INNINGS_2:  'innings_2',
  COMPLETED:  'completed',
};

// Wicket Types
export const WICKET_TYPES = [
  { id: 'bowled',     label: 'Bowled' },
  { id: 'caught',     label: 'Caught' },
  { id: 'run_out',    label: 'Run Out' },
  { id: 'lbw',        label: 'LBW' },
  { id: 'stumped',    label: 'Stumped' },
  { id: 'hit_wicket', label: 'Hit Wicket' },
  { id: 'retired',    label: 'Retired Hurt' },
  { id: 'other',      label: 'Other' },
];

// Extras Types
export const EXTRAS_TYPES = [
  { id: 'wide',     label: 'Wide',     short: 'WD' },
  { id: 'no_ball',  label: 'No Ball',  short: 'NB' },
  { id: 'bye',      label: 'Bye',      short: 'B' },
  { id: 'leg_bye',  label: 'Leg Bye',  short: 'LB' },
  { id: 'penalty',  label: 'Penalty',  short: 'P' },
];

// Player Types
export const PLAYER_TYPES = [
  { id: 'batsman',     label: 'Batsman' },
  { id: 'bowler',      label: 'Bowler' },
  { id: 'allrounder',  label: 'All-rounder' },
];

// Batting Hand
export const BATTING_HAND = [
  { id: 'right', label: 'Right Hand', icon: 'hand-back-right-outline' },
  { id: 'left',  label: 'Left Hand',  icon: 'hand-back-left-outline'  },
];

// Bowling Styles (arm + pace/type)
export const BOWLING_STYLES = [
  // Right Arm
  { id: 'ra_fast',   label: 'RA Fast',       desc: 'Right Arm Fast',         color: '#e74c3c' },
  { id: 'ra_medium', label: 'RA Medium',      desc: 'Right Arm Medium Fast',  color: '#e67e22' },
  { id: 'ra_spin',   label: 'RA Spin',        desc: 'Right Arm Off Spin',     color: '#3498db' },
  { id: 'leg_spin',  label: 'Leg Spin',       desc: 'Right Arm Leg Spin',     color: '#9b59b6' },
  // Left Arm
  { id: 'la_fast',   label: 'LA Fast',        desc: 'Left Arm Fast',          color: '#e74c3c' },
  { id: 'la_medium', label: 'LA Medium',      desc: 'Left Arm Medium Fast',   color: '#e67e22' },
  { id: 'la_spin',   label: 'LA Spin',        desc: 'Left Arm Orthodox Spin', color: '#1abc9c' },
  { id: 'chinaman',  label: 'Chinaman',       desc: 'Left Arm Wrist Spin',    color: '#9b59b6' },
  { id: 'none',      label: 'Does Not Bowl',  desc: 'Non-bowler',             color: '#8892A4' },
];

// Sync retry limit — must match api.js MAX_RETRY_COUNT
export const MAX_RETRY_COUNT = 5;

// Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN:   'auth_token',
  USER_DATA:    'user_data',
  LAST_SYNC:    'last_sync_time',
  SETTINGS:     'app_settings',
};

// Default match settings
export const DEFAULT_MATCH_SETTINGS = {
  overs:       7,
  playersPerTeam: 7,
};
