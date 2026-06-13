// ============================================================
// CricZodiac — Splash Screen
// ============================================================

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Image, Dimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { isLoggedIn, getCurrentUser } from '../../services/AuthService';
import { useAuth } from '../../context/AuthContext';

const { width, height } = Dimensions.get('window');

const SplashScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const { login } = useAuth();
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const scaleAnim    = useRef(new Animated.Value(0.5)).current;
  const slideAnim    = useRef(new Animated.Value(50)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      Animated.timing(progressAnim, { toValue: 100, duration: 1800, useNativeDriver: false }),
    ]).start();

    const id = progressAnim.addListener(({ value }) => setPercent(Math.round(value)));

    setTimeout(checkAuth, 2000);

    return () => progressAnim.removeListener(id);
  }, []);

  const checkAuth = async () => {
    const loggedIn = await isLoggedIn();
    if (loggedIn) {
      const user = await getCurrentUser();
      if (user) {
        // Set user in context → AppNavigator will switch to the correct role navigator
        login(user);
      } else {
        navigation.replace('Login');
      }
    } else {
      navigation.replace('Login');
    }
  };

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.navy, COLORS.royalBlue]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Decorative circles */}
      <View style={styles.circle1} />
      <View style={styles.circle2} />

      <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.logoShadow}>
          <Image
            source={require('../../assets/images/round_logo.png')}
            style={styles.logoBox}
            resizeMode="contain"
          />
        </View>
      </Animated.View>

      <Animated.View style={[styles.textContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={styles.appName}>CRICZODIAC</Text>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.tagline}>Indoor Cricket Manager</Text>
          <View style={styles.dividerLine} />
        </View>
        <Text style={styles.brand}>by Zodiac Technologies</Text>
      </Animated.View>

      <Animated.View style={[styles.loaderContainer, { opacity: fadeAnim }]}>
        <View style={styles.loaderTrack}>
          <Animated.View style={[styles.loaderFill, {
            width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: [0, 200] }),
          }]} />
        </View>
        <Text style={styles.loadingText}>Loading... {percent}%</Text>
      </Animated.View>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  container:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  circle1:        { position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(0,240,255,0.05)' },
  circle2:        { position: 'absolute', bottom: -100, left: -100, width: 400, height: 400, borderRadius: 200, backgroundColor: 'rgba(75,42,161,0.08)' },
  logoContainer:  { marginBottom: 32, alignItems: 'center' },
  logoShadow:     { shadowColor: COLORS.cyan, shadowOpacity: 0.7, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 20 },
  logoBox:        { width: 130, height: 130 },
  textContainer:  { alignItems: 'center', marginBottom: 60 },
  appName:        { fontSize: 32, fontWeight: '900', color: COLORS.white, letterSpacing: 8 },
  divider:        { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  dividerLine:    { width: 40, height: 1, backgroundColor: COLORS.gold },
  tagline:        { color: COLORS.gold, fontSize: 13, fontWeight: '600', letterSpacing: 2, marginHorizontal: 10 },
  brand:          { color: COLORS.gray, fontSize: 12, letterSpacing: 1, marginTop: 4 },
  loaderContainer: { position: 'absolute', bottom: 60, alignItems: 'center' },
  loaderTrack:    { width: 200, height: 3, backgroundColor: COLORS.darkGray, borderRadius: 2 },
  loaderFill:     { height: '100%', backgroundColor: COLORS.gold, borderRadius: 2 },
  loadingText:    { color: COLORS.gray, fontSize: 12, marginTop: 8 },
});

export default SplashScreen;
