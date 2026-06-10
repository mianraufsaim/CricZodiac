// ============================================================
// CricZodiac — Toast Utility
// Replaces Alert.alert everywhere with top-center Toast.
//
// showAlert(title, msg?, buttons?)
//   • 0-1 buttons (or no buttons)  → Toast (top-right)
//   • 2+ buttons (confirmation)    → native Alert.alert
//
// toastConfig  → pass to <Toast config={toastConfig} /> in App.js
// ============================================================

import React from 'react';
import {
  View, Text, Pressable, Dimensions, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Toast from 'react-native-toast-message';

const W = Dimensions.get('window').width;

// ── Type metadata ─────────────────────────────────────────
const TYPE_META = {
  success: { color: '#22c55e', icon: 'check-circle',     bg: '#0f2a1a' },
  error:   { color: '#ef4444', icon: 'close-circle',     bg: '#2a0f0f' },
  info:    { color: '#60a5fa', icon: 'information',      bg: '#0f1a2a' },
  warning: { color: '#f59e0b', icon: 'alert-circle',     bg: '#2a1e0f' },
};

// ── Infer toast type from title keywords ─────────────────
const inferType = (title = '') => {
  const t = title.toLowerCase();
  if (/success|saved|updated|created|done|completed|approved|copied|sent|added|registered|cleared|synced/.test(t))
    return 'success';
  if (/error|fail|failed|invalid|wrong|incorrect|mismatch|not found|denied|missing|required|weak|duplicate|already|conflict/.test(t))
    return 'error';
  if (/warning|warn|caution|attention/.test(t))
    return 'warning';
  return 'info';
};

// ── Custom toast box (top-center aligned) ────────────────
const ToastBox = ({ text1, text2, hide, type = 'info' }) => {
  const meta = TYPE_META[type] || TYPE_META.info;
  return (
    <View
      style={{
        width: W,
        alignItems: 'center',
        paddingHorizontal: 16,
      }}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={hide}
        style={{
          backgroundColor: meta.bg,
          borderRadius: 14,
          width: '100%',
          maxWidth: 420,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 12,
          paddingHorizontal: 15,
          borderLeftWidth: 4,
          borderLeftColor: meta.color,
          borderWidth: 1,
          borderColor: meta.color + '33',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.5,
          shadowRadius: 12,
          elevation: 12,
        }}
      >
        <Icon name={meta.icon} size={20} color={meta.color} style={{ flexShrink: 0 }} />
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 13, lineHeight: 18 }}
            numberOfLines={1}
          >
            {text1}
          </Text>
          {text2 ? (
            <Text
              style={{ color: '#94a3b8', fontSize: 12, marginTop: 2, lineHeight: 16 }}
              numberOfLines={2}
            >
              {text2}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
};

// ── Toast config (export → pass to <Toast config={toastConfig} />) ──
export const toastConfig = {
  success: (props) => <ToastBox {...props} type="success" />,
  error:   (props) => <ToastBox {...props} type="error" />,
  info:    (props) => <ToastBox {...props} type="info" />,
  warning: (props) => <ToastBox {...props} type="warning" />,
};

// ── Main replacement for Alert.alert ─────────────────────
// Usage: showAlert(title, msg?, buttons?)
// • Confirmation (2+ buttons) → native Alert (cannot be a toast)
// • Everything else          → top-right Toast
export const showAlert = (title, msg, buttons = null, options = null) => {
  // Confirmation dialog: keep as native Alert
  if (buttons && buttons.length > 1) {
    Alert.alert(title, msg, buttons, options);
    return;
  }

  // Determine type from title
  const type = inferType(title);

  // Single OK button callback (e.g. navigation.goBack) — fire after toast hides
  const cb = buttons?.[0]?.onPress ?? null;

  Toast.show({
    type,
    text1: title ?? '',
    text2: msg || undefined,
    visibilityTime: 3200,
    onHide: cb ? cb : undefined,
  });
};

// ── Convenience shorthands (optional, use anywhere) ──────
export const showToast = {
  success: (title, msg) => Toast.show({ type: 'success', text1: title, text2: msg, visibilityTime: 3000 }),
  error:   (title, msg) => Toast.show({ type: 'error',   text1: title, text2: msg, visibilityTime: 4000 }),
  info:    (title, msg) => Toast.show({ type: 'info',    text1: title, text2: msg, visibilityTime: 3000 }),
  warning: (title, msg) => Toast.show({ type: 'warning', text1: title, text2: msg, visibilityTime: 3500 }),
};
