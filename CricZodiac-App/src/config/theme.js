// ============================================================
// CricZodiac — Color Palettes
// Two complete palettes: DARK (default) and LIGHT
// Consumed via useTheme() — never import directly in screens
// ============================================================

export const DARK_COLORS = {
  // Backgrounds
  background:  '#060A1A',
  navy:        '#0A0F2C',
  card:        '#0D1530',
  cardBorder:  '#1A2445',
  darkGray:    '#2A2F45',
  inputBg:     '#141830',

  // Text
  white:       '#FFFFFF',
  lightGray:   '#E8EAF0',
  gray:        '#8892A4',

  // Brand
  gold:        '#D4AF37',
  cyan:        '#00F0FF',
  royalBlue:   '#102B6F',
  purple:      '#4B2AA1',
  orange:      '#E67E22',

  // Status
  success:     '#00C851',
  warning:     '#FFBB33',
  danger:      '#FF4444',

  // Gradient stops (for LinearGradient)
  gradientStart: '#060A1A',
  gradientEnd:   '#0A0F2C',

  // Tab / nav bar
  tabBar:      '#080C20',
  tabBarBorder:'#1A2445',

  // Status bar
  statusBar:   'light-content',
  isDark:      true,
};

export const LIGHT_COLORS = {
  // Backgrounds
  background:  '#F4F6FB',
  navy:        '#FFFFFF',
  card:        '#FFFFFF',
  cardBorder:  '#DDE3F0',
  darkGray:    '#EDF0F7',
  inputBg:     '#EDF0F7',

  // Text
  white:       '#0D1530',   // inverted — main text colour
  lightGray:   '#374151',
  gray:        '#6B7280',

  // Brand (slightly deepened for light backgrounds)
  gold:        '#B8860B',
  cyan:        '#0369A1',
  royalBlue:   '#2C4BB5',
  purple:      '#5B21B6',
  orange:      '#C2540A',

  // Status
  success:     '#15803D',
  warning:     '#B45309',
  danger:      '#DC2626',

  // Gradient stops
  gradientStart: '#EEF2FF',
  gradientEnd:   '#FFFFFF',

  // Tab / nav bar
  tabBar:      '#FFFFFF',
  tabBarBorder:'#DDE3F0',

  // Status bar
  statusBar:   'dark-content',
  isDark:      false,
};
