// ============================================================
// CricZodiac — Login Screen
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../../context/ThemeContext';
import { login } from '../../services/AuthService';
import { useAuth } from '../../context/AuthContext';

const LoginScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);

  const { login: setUser } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected && state.isInternetReachable !== false);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      setUser(user);
    } catch (err) {
      Alert.alert('Login Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Network status dot — top right */}
          <View style={styles.netRow}>
            <View style={[styles.netDot, { backgroundColor: isOnline ? COLORS.success : COLORS.danger }]} />
            <Text style={[styles.netLabel, { color: isOnline ? COLORS.success : COLORS.danger }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoMini}>
              <LinearGradient colors={[COLORS.cyan, COLORS.royalBlue]} style={styles.logoBg}>
                <Text style={styles.logoZ}>Z</Text>
              </LinearGradient>
            </View>
            <Text style={styles.title}>CRICZODIAC</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </View>

          {/* Form */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome Back</Text>

            <View style={styles.inputWrapper}>
              <Icon name="email-outline" size={20} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor={COLORS.gray}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Icon name="lock-outline" size={20} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={COLORS.gray}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPass(p => !p)} style={styles.eyeIcon}>
                <Icon name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              <LinearGradient colors={[COLORS.gold, '#B8942A']} style={styles.loginBtnGradient}>
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={COLORS.navy} />
                    <Text style={styles.loginBtnText}>Signing In...</Text>
                  </View>
                ) : (
                  <Text style={styles.loginBtnText}>SIGN IN</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.registerLink}>
            <Text style={styles.registerText}>
              Don't have an account?{'  '}
              <Text style={styles.registerTextBold}>Register</Text>
            </Text>
          </TouchableOpacity>

          <Text style={styles.footer}>Zodiac Technologies • Indoor Cricket Manager</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  container:        { flex: 1 },
  kav:              { flex: 1 },
  scroll:           { flexGrow: 1, padding: 24, justifyContent: 'center' },

  netRow:           { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginBottom: 8 },
  netDot:           { width: 8, height: 8, borderRadius: 4 },
  netLabel:         { fontSize: 11, fontWeight: '600' },

  header:           { alignItems: 'center', marginBottom: 32 },
  logoMini:         { marginBottom: 12 },
  logoBg:           { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  logoZ:            { fontSize: 36, fontWeight: '900', color: COLORS.white, fontStyle: 'italic' },
  title:            { fontSize: 24, fontWeight: '900', color: COLORS.white, letterSpacing: 6 },
  subtitle:         { color: COLORS.gray, fontSize: 14, marginTop: 4 },

  card:             { backgroundColor: COLORS.card, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: COLORS.cardBorder },
  cardTitle:        { fontSize: 20, fontWeight: '700', color: COLORS.white, marginBottom: 24 },
  inputWrapper:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkGray, borderRadius: 12, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon:        { marginRight: 8 },
  input:            { flex: 1, height: 50, color: COLORS.white, fontSize: 15 },
  eyeIcon:          { padding: 4 },

  loginBtn:         { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnGradient: { height: 52, alignItems: 'center', justifyContent: 'center' },
  loadingRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loginBtnText:     { color: COLORS.navy, fontSize: 16, fontWeight: '800', letterSpacing: 2 },

  registerLink:     { alignItems: 'center', marginTop: 20 },
  registerText:     { color: COLORS.gray, fontSize: 14 },
  registerTextBold: { color: COLORS.gold, fontWeight: '700' },
  footer:           { textAlign: 'center', color: COLORS.darkGray, fontSize: 11, marginTop: 16 },
});

export default LoginScreen;
