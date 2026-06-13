// ============================================================
// CricZodiac - AI Ball Tracking Lab
// Test-only screen. It does not save deliveries anywhere.
//
// Current implementation:
//   Android: real camera + native frame processor auto-detects a
//   small moving cricket ball and draws a red trajectory.
//
// Notes:
//   This is the first automatic detector, not a trained Hawk-Eye model.
//   It works best with the phone fixed behind/near the umpire and a
//   high-contrast ball against the pitch/background.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  Camera,
  VisionCameraProxy,
  runAtTargetFps,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { useTheme } from '../../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PITCH_LENGTH_M = 20.12;
const PITCH_LENGTH_YD = 22;
const PITCH_WIDTH_M = 3.05;

const VIEW_MODES = [
  { key: 'live', label: 'Live', icon: 'camera-iris' },
  { key: 'replay', label: 'Replay', icon: 'play-circle-outline' },
  { key: 'view360', label: '360', icon: 'rotate-360' },
  { key: 'impact', label: 'Impact', icon: 'cricket' },
  { key: 'setup', label: 'Setup', icon: 'camera-marker-outline' },
];

let ballTrackerPlugin = null;
let createRunOnJS = null;
let frameProcessorSetupError = '';
const FRAME_PROCESSOR_REBUILD_MESSAGE =
  'The installed app binary does not include Worklets/frame processors yet. Uninstall the old app and install the rebuilt Android app.';

try {
  ballTrackerPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectCricketBall') || null;
} catch (error) {
  frameProcessorSetupError = error?.message || 'Frame processor plugin could not be loaded.';
}

try {
  const { Worklets } = require('react-native-worklets-core');
  createRunOnJS = Worklets?.createRunOnJS ? Worklets.createRunOnJS.bind(Worklets) : null;
} catch (error) {
  frameProcessorSetupError = frameProcessorSetupError || FRAME_PROCESSOR_REBUILD_MESSAGE;
}

function detectCricketBall(frame, options) {
  'worklet';
  if (ballTrackerPlugin == null) {
    return { detected: false, confidence: 0, reason: 'plugin-missing' };
  }
  return ballTrackerPlugin.call(frame, options);
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const format = (value, digits = 1) => Number(value || 0).toFixed(digits);

const pathFromPoints = (points) => {
  if (!points.length) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${format(point.x)} ${format(point.y)}`)
    .join(' ');
};

const angleBetween = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);

const normalizeTimestampMs = (timestamp) => {
  const value = Number(timestamp) || Date.now();
  return value > 100000000000 ? value / 1000000 : value;
};

const projectFor360 = (points, field, pitchBounds) => points.map((point) => {
  const progress = clamp((point.y - pitchBounds.top) / Math.max(1, pitchBounds.bottom - pitchBounds.top), 0, 1);
  const perspective = 0.44 + progress * 0.74;
  const xFromCenter = point.x - pitchBounds.centerX;
  return {
    ...point,
    x: pitchBounds.centerX + xFromCenter * perspective + Math.sin(progress * Math.PI) * field.width * 0.08,
    y: pitchBounds.top + progress * (pitchBounds.bottom - pitchBounds.top) * 0.92,
  };
});

const slicePointsForScrub = (points, index) => {
  if (points.length < 2) return points;
  return points.slice(0, clamp(index + 1, 2, points.length));
};

const MetricCard = ({ icon, label, value, unit, color, styles }) => (
  <View style={styles.metricCard}>
    <View style={[styles.metricIcon, { backgroundColor: color + '24' }]}>
      <Icon name={icon} size={17} color={color} />
    </View>
    <Text style={styles.metricLabel}>{label}</Text>
    <View style={styles.metricValueRow}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {!!unit && <Text style={styles.metricUnit}>{unit}</Text>}
    </View>
  </View>
);

const BallTrackingLabScreen = ({ navigation }) => {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const [field, setField] = useState({ width: SCREEN_WIDTH - 32, height: 520 });
  const [tracking, setTracking] = useState(false);
  const [points, setPoints] = useState([]);
  const [deliveryNo, setDeliveryNo] = useState(1);
  const [detectorStatus, setDetectorStatus] = useState('Ready');
  const [lastSeenAt, setLastSeenAt] = useState(null);
  const [viewMode, setViewMode] = useState('live');
  const [scrubIndex, setScrubIndex] = useState(0);
  const frameProcessorAvailable = ballTrackerPlugin != null && createRunOnJS != null;

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (points.length > 1) {
      setScrubIndex(points.length - 1);
    }
  }, [points.length]);

  const pitchBounds = useMemo(() => ({
    left: field.width * 0.24,
    right: field.width * 0.76,
    top: field.height * 0.12,
    bottom: field.height * 0.88,
    centerX: field.width * 0.5,
  }), [field.height, field.width]);

  const mapDetectionToStage = useCallback((result) => {
    const xNorm = clamp(Number(result?.x) || 0, 0, 1);
    const yNorm = clamp(Number(result?.y) || 0, 0, 1);
    const frameWidth = Number(result?.frameWidth) || 0;
    const frameHeight = Number(result?.frameHeight) || 0;

    if (field.height > field.width && frameWidth > frameHeight) {
      return {
        x: (1 - yNorm) * field.width,
        y: xNorm * field.height,
      };
    }

    return {
      x: xNorm * field.width,
      y: yNorm * field.height,
    };
  }, [field.height, field.width]);

  const onBallDetection = useMemo(() => {
    const handleDetection = (result) => {
      if (!tracking) return;

      if (!result?.detected) {
        setDetectorStatus(result?.reason === 'warming-up' ? 'Calibrating motion' : 'Searching for ball');
        return;
      }

      const mapped = mapDetectionToStage(result);
      const point = {
        x: clamp(mapped.x, 0, field.width),
        y: clamp(mapped.y, 0, field.height),
        t: normalizeTimestampMs(result.timestamp),
        confidence: Number(result.confidence) || 0,
      };

      setDetectorStatus('Ball locked');
      setLastSeenAt(Date.now());
      setPoints(prev => {
        const last = prev[prev.length - 1];
        if (last) {
          const dx = Math.abs(last.x - point.x);
          const dy = Math.abs(last.y - point.y);
          if (dx + dy < 3) return prev;
        }
        return [...prev, point].slice(-100);
      });
    };

    return createRunOnJS ? createRunOnJS(handleDetection) : handleDetection;
  }, [field.height, field.width, mapDetectionToStage, tracking]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const result = runAtTargetFps(30, () => {
      'worklet';
      return detectCricketBall(frame, {
        roiLeft: 0.08,
        roiTop: 0.04,
        roiRight: 0.92,
        roiBottom: 0.96,
        minMotion: 18,
        smooth: 0.48,
      });
    });
    if (result != null) {
      onBallDetection(result);
    }
  }, [onBallDetection]);

  const metrics = useMemo(() => {
    if (points.length < 2) {
      return {
        speed: 0,
        turn: 0,
        bounce: 0,
        swing: 0,
        confidence: 0,
        length: 'Waiting',
        impact: 'Waiting',
      };
    }

    const first = points[0];
    const last = points[points.length - 1];
    const elapsedSec = Math.max(0.16, (last.t - first.t) / 1000);
    const verticalCoverage = clamp(
      Math.abs(last.y - first.y) / Math.max(1, pitchBounds.bottom - pitchBounds.top),
      0,
      1,
    );
    const estimatedMeters = verticalCoverage * PITCH_LENGTH_M;
    const speedMph = clamp((estimatedMeters / elapsedSec) * 2.23694, 0, 105);

    const bounceTargetY = pitchBounds.top + (pitchBounds.bottom - pitchBounds.top) * 0.72;
    const bounceIndex = points.reduce((best, point, index) => (
      Math.abs(point.y - bounceTargetY) < Math.abs(points[best].y - bounceTargetY) ? index : best
    ), 0);
    const bouncePoint = points[bounceIndex];
    const bounceFromBowler = clamp(
      ((bouncePoint.y - pitchBounds.top) / Math.max(1, pitchBounds.bottom - pitchBounds.top)) * PITCH_LENGTH_M,
      0,
      PITCH_LENGTH_M,
    );
    const bounceFromBatter = clamp(PITCH_LENGTH_M - bounceFromBowler, 0, PITCH_LENGTH_M);

    const midLineX = first.x + ((last.x - first.x) * 0.5);
    const midPoint = points[Math.floor(points.length / 2)];
    const lateralMeters = ((midPoint.x - midLineX) / Math.max(1, pitchBounds.right - pitchBounds.left)) * PITCH_WIDTH_M;
    const swingCm = clamp(lateralMeters * 100, -120, 120);

    let turnDeg = 0;
    if (bounceIndex > 2 && bounceIndex < points.length - 3) {
      const before = angleBetween(points[Math.max(0, bounceIndex - 3)], points[bounceIndex]);
      const after = angleBetween(points[bounceIndex], points[Math.min(points.length - 1, bounceIndex + 3)]);
      turnDeg = clamp(after - before, -40, 40);
    }

    const length =
      bounceFromBatter < 1.9 ? 'Yorker' :
      bounceFromBatter < 4.2 ? 'Full' :
      bounceFromBatter < 7.2 ? 'Good Length' :
      bounceFromBatter < 10.5 ? 'Short' : 'Bouncer';

    const avgConfidence = points.reduce((sum, point) => sum + (point.confidence || 0), 0) / points.length;

    return {
      speed: speedMph,
      turn: turnDeg,
      bounce: bounceFromBatter,
      swing: swingCm,
      confidence: clamp(avgConfidence * 100, 0, 96),
      length,
      impact: Math.abs(last.x - pitchBounds.centerX) < field.width * 0.11 ? 'Hitting stumps' : 'Missing stumps',
    };
  }, [field.width, pitchBounds.bottom, pitchBounds.centerX, pitchBounds.left, pitchBounds.right, pitchBounds.top, points]);

  const bouncePoint = useMemo(() => {
    if (points.length < 2) return null;
    const bounceTargetY = pitchBounds.top + (pitchBounds.bottom - pitchBounds.top) * 0.72;
    return points.reduce((best, point) => (
      Math.abs(point.y - bounceTargetY) < Math.abs(best.y - bounceTargetY) ? point : best
    ), points[0]);
  }, [pitchBounds.bottom, pitchBounds.top, points]);

  const displayedPoints = useMemo(() => {
    if (viewMode === 'replay' || viewMode === 'impact') {
      return slicePointsForScrub(points, scrubIndex);
    }
    if (viewMode === 'view360') {
      return projectFor360(points, field, pitchBounds);
    }
    return points;
  }, [field, pitchBounds, points, scrubIndex, viewMode]);

  const displayedBouncePoint = useMemo(() => {
    if (displayedPoints.length < 2) return null;
    const bounceTargetY = pitchBounds.top + (pitchBounds.bottom - pitchBounds.top) * 0.72;
    return displayedPoints.reduce((best, point) => (
      Math.abs(point.y - bounceTargetY) < Math.abs(best.y - bounceTargetY) ? point : best
    ), displayedPoints[0]);
  }, [displayedPoints, pitchBounds.bottom, pitchBounds.top]);

  const replayProgress = points.length > 1 ? scrubIndex / (points.length - 1) : 0;
  const showReplayControls = points.length > 1 && viewMode !== 'live' && viewMode !== 'setup';
  const showSyntheticView = viewMode === 'view360' || viewMode === 'impact';
  const swingFeet = metrics.swing / 30.48;

  const startTracking = useCallback(() => {
    if (!frameProcessorAvailable) {
      setTracking(false);
      setDetectorStatus('Rebuild app for auto tracking');
      return;
    }

    setPoints([]);
    setViewMode('live');
    setScrubIndex(0);
    setTracking(true);
    setDetectorStatus('Calibrating motion');
    setLastSeenAt(null);
  }, [frameProcessorAvailable]);

  const stopTracking = useCallback(() => {
    setTracking(false);
    setDetectorStatus(points.length > 1 ? 'Delivery complete' : 'Ready');
  }, [points.length]);

  const reset = useCallback(() => {
    setTracking(false);
    setPoints([]);
    setViewMode('live');
    setScrubIndex(0);
    setDetectorStatus('Ready');
    setLastSeenAt(null);
  }, []);

  const nextDelivery = useCallback(() => {
    setTracking(false);
    setPoints([]);
    setViewMode('live');
    setScrubIndex(0);
    setDeliveryNo(prev => prev + 1);
    setDetectorStatus('Ready');
    setLastSeenAt(null);
  }, []);

  const renderCamera = () => {
    if (!hasPermission) {
      return (
        <View style={styles.cameraFallback}>
          <Icon name="camera-outline" size={42} color={COLORS.warning} />
          <Text style={styles.fallbackTitle}>Camera permission needed</Text>
          <Text style={styles.fallbackText}>Allow camera access to track a real ball automatically.</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!device) {
      return (
        <View style={styles.cameraFallback}>
          <Icon name="camera-off" size={42} color={COLORS.gray} />
          <Text style={styles.fallbackTitle}>No back camera found</Text>
          <Text style={styles.fallbackText}>Try this screen on a physical Android device.</Text>
        </View>
      );
    }

    return (
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        pixelFormat="yuv"
        video={false}
        photo={false}
        frameProcessor={tracking && frameProcessorAvailable ? frameProcessor : undefined}
      />
    );
  };

  const recentlySeen = lastSeenAt && Date.now() - lastSeenAt < 900;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.navy]} style={styles.root}>
      <View style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerIcon} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>AI Ball Tracking Lab</Text>
            <Text style={styles.subtitle}>Auto camera tracking from umpire position</Text>
          </View>
          <View style={[styles.statusPill, tracking && styles.statusPillLive]}>
            <View style={[styles.statusDot, tracking && { backgroundColor: recentlySeen ? COLORS.success : COLORS.warning }]} />
            <Text style={styles.statusText}>{tracking ? 'AUTO' : 'READY'}</Text>
          </View>
        </View>

        <View style={styles.calibrationStrip}>
          <View style={styles.calibrationItem}>
            <Text style={styles.calibrationLabel}>PITCH LENGTH</Text>
            <Text style={styles.calibrationValue}>{PITCH_LENGTH_M} m / {PITCH_LENGTH_YD} yd</Text>
          </View>
          <View style={styles.calibrationDivider} />
          <View style={styles.calibrationItem}>
            <Text style={styles.calibrationLabel}>PHONE POSITION</Text>
            <Text style={styles.calibrationValue}>Behind umpire</Text>
          </View>
        </View>

        <View style={styles.modeBar}>
          {VIEW_MODES.map((mode) => (
            <TouchableOpacity
              key={mode.key}
              style={[styles.modeButton, viewMode === mode.key && styles.modeButtonActive]}
              onPress={() => setViewMode(mode.key)}
            >
              <Icon name={mode.icon} size={15} color={viewMode === mode.key ? '#FFFFFF' : COLORS.gray} />
              <Text style={[styles.modeButtonText, viewMode === mode.key && styles.modeButtonTextActive]}>{mode.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.metricsGrid}>
          <MetricCard icon="speedometer" label="Speed" value={format(metrics.speed, 0)} unit="mph" color={COLORS.cyan} styles={styles} />
          <MetricCard icon="rotate-3d-variant" label="Turn" value={format(metrics.turn)} unit="deg" color={COLORS.gold} styles={styles} />
          <MetricCard icon="arrow-collapse-down" label="Bounce" value={format(metrics.bounce)} unit="m" color={COLORS.warning} styles={styles} />
          <MetricCard icon="weather-windy" label="Swing" value={format(metrics.swing, 0)} unit="cm" color={COLORS.purple} styles={styles} />
        </View>

        <View
          style={styles.trackingStage}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setField({ width, height });
          }}
        >
          {showSyntheticView ? <View style={styles.syntheticBackdrop} /> : renderCamera()}

          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={field.width} height={field.height} style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgLinearGradient id="pitchGlow" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.06" />
                  <Stop offset="1" stopColor="#00F0FF" stopOpacity="0.13" />
                </SvgLinearGradient>
              </Defs>

              {showSyntheticView && (
                <>
                  <Rect x="0" y="0" width={field.width} height={field.height} fill="#153B24" opacity="0.92" />
                  <Rect
                    x={pitchBounds.left - field.width * 0.08}
                    y={pitchBounds.top - 16}
                    width={(pitchBounds.right - pitchBounds.left) + field.width * 0.16}
                    height={(pitchBounds.bottom - pitchBounds.top) + 48}
                    rx="18"
                    fill="#A8A07B"
                    opacity="0.82"
                  />
                </>
              )}

              <Rect
                x={pitchBounds.left}
                y={pitchBounds.top}
                width={pitchBounds.right - pitchBounds.left}
                height={pitchBounds.bottom - pitchBounds.top}
                rx="10"
                fill="url(#pitchGlow)"
                stroke="#FFFFFF"
                strokeOpacity="0.32"
                strokeWidth="1"
              />
              <Line x1={pitchBounds.centerX} y1={pitchBounds.top} x2={pitchBounds.centerX} y2={pitchBounds.bottom} stroke={COLORS.cyan} strokeOpacity="0.6" strokeWidth={viewMode === 'view360' ? '8' : '3'} />
              <Path
                d={`M ${pitchBounds.centerX - 14} ${pitchBounds.bottom} L ${pitchBounds.centerX - 4} ${pitchBounds.top} L ${pitchBounds.centerX + 16} ${pitchBounds.bottom} Z`}
                fill={COLORS.cyan}
                opacity="0.16"
              />
              <Line x1={field.width * 0.16} y1={pitchBounds.bottom} x2={field.width * 0.84} y2={pitchBounds.bottom} stroke="#FFFFFF" strokeOpacity="0.78" strokeWidth="3" />
              <Line x1={field.width * 0.28} y1={pitchBounds.bottom - 58} x2={field.width * 0.72} y2={pitchBounds.bottom - 58} stroke="#FFFFFF" strokeOpacity="0.42" strokeWidth="2" />
              <Line x1={field.width * 0.43} y1={pitchBounds.bottom + 6} x2={field.width * 0.43} y2={pitchBounds.bottom + 70} stroke="#FFFFFF" strokeOpacity="0.65" strokeWidth="2" />
              <Line x1={field.width * 0.57} y1={pitchBounds.bottom + 6} x2={field.width * 0.57} y2={pitchBounds.bottom + 70} stroke="#FFFFFF" strokeOpacity="0.65" strokeWidth="2" />

              {displayedPoints.length > 1 && (
                <>
                  <Path d={pathFromPoints(displayedPoints)} stroke={COLORS.danger} strokeWidth={viewMode === 'view360' ? '7' : '5'} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <Path d={pathFromPoints(displayedPoints)} stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </>
              )}

              {displayedBouncePoint && (
                <>
                  <Circle cx={displayedBouncePoint.x} cy={displayedBouncePoint.y} r="16" fill={COLORS.warning} opacity="0.2" />
                  <Circle cx={displayedBouncePoint.x} cy={displayedBouncePoint.y} r="6" fill={COLORS.warning} />
                </>
              )}

              {displayedPoints.map((point, index) => (
                <Circle
                  key={`${point.t}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={index === points.length - 1 ? 6 : 3}
                  fill={index === points.length - 1 ? COLORS.danger : '#FFFFFF'}
                  opacity={index === points.length - 1 ? 1 : 0.65}
                />
              ))}
            </Svg>
          </View>

          <View style={styles.overlayMetricStack}>
            <View style={styles.overlayMetric}>
              <Text style={styles.overlayMetricLabel}>Swing</Text>
              <Text style={styles.overlayMetricValue}>{format(swingFeet)} sf</Text>
            </View>
            <View style={styles.overlayMetric}>
              <Text style={styles.overlayMetricLabel}>Spin</Text>
              <Text style={styles.overlayMetricValue}>{format(metrics.turn)} deg</Text>
            </View>
            <View style={styles.overlayMetric}>
              <Text style={styles.overlayMetricLabel}>Speed</Text>
              <Text style={styles.overlayMetricValue}>{format(metrics.speed, 0)} mph</Text>
            </View>
          </View>

          <View style={styles.sideToolbar}>
            <TouchableOpacity style={styles.toolButton} onPress={() => setViewMode('replay')}>
              <Icon name="play-circle-outline" size={19} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButton} onPress={() => setViewMode('view360')}>
              <Icon name="rotate-360" size={19} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButton} onPress={() => setViewMode('impact')}>
              <Icon name="cricket" size={19} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButton} onPress={() => setViewMode('setup')}>
              <Icon name="camera-marker-outline" size={19} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.stageTopLeft}>
            <Text style={styles.overlayLabel}>DELIVERY</Text>
            <Text style={styles.overlayValue}>#{deliveryNo}</Text>
          </View>

          <View style={styles.stageTopRight}>
            <Icon name={recentlySeen ? 'target' : 'crosshairs-gps'} size={16} color={recentlySeen ? COLORS.success : COLORS.cyan} />
            <Text style={styles.confidenceText}>{format(metrics.confidence, 0)}%</Text>
          </View>

          <View style={styles.lengthBadge}>
            <Text style={styles.lengthLabel}>LENGTH</Text>
            <Text style={styles.lengthValue}>{metrics.length}</Text>
          </View>

          {viewMode === 'view360' && (
            <View style={styles.view360Badge}>
              <Icon name="rotate-360" size={18} color="#FFFFFF" />
              <Text style={styles.view360Text}>360 Degree View</Text>
            </View>
          )}

          {viewMode === 'impact' && (
            <View style={styles.impactBadge}>
              <Text style={styles.lengthLabel}>WICKET IMPACT</Text>
              <Text style={[styles.lengthValue, { color: metrics.impact === 'Hitting stumps' ? COLORS.success : COLORS.warning }]}>{metrics.impact}</Text>
            </View>
          )}

          {viewMode === 'setup' && (
            <View style={styles.setupPanel}>
              <View style={styles.setupIcon}>
                <Icon name="cellphone-marker" size={22} color={COLORS.cyan} />
              </View>
              <Text style={styles.setupTitle}>Umpire Stand Setup</Text>
              <Text style={styles.setupText}>Mount phone behind umpire, keep all stumps inside the guide, then bowl through the blue pitch corridor.</Text>
              <View style={styles.setupChecklist}>
                <Text style={styles.setupCheck}>1. Back camera facing bowler</Text>
                <Text style={styles.setupCheck}>2. Pitch centered on blue guide</Text>
                <Text style={styles.setupCheck}>3. Phone fixed on tripod or steady hand</Text>
              </View>
            </View>
          )}

          {showReplayControls && (
            <View style={styles.timelinePanel}>
              <View style={styles.timelineHeader}>
                <Text style={styles.timelineLabel}>Replay Timeline</Text>
                <Text style={styles.timelineTime}>{format(replayProgress * 100, 0)}%</Text>
              </View>
              <View
                style={styles.timelineTrack}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(event) => {
                  const x = clamp(event.nativeEvent.locationX, 0, Math.max(1, field.width - 56));
                  setScrubIndex(Math.round((x / Math.max(1, field.width - 56)) * Math.max(0, points.length - 1)));
                }}
                onResponderMove={(event) => {
                  const x = clamp(event.nativeEvent.locationX, 0, Math.max(1, field.width - 56));
                  setScrubIndex(Math.round((x / Math.max(1, field.width - 56)) * Math.max(0, points.length - 1)));
                }}
              >
                <View style={[styles.timelineFill, { width: `${replayProgress * 100}%` }]} />
                <View style={[styles.timelineThumb, { left: `${replayProgress * 100}%` }]} />
              </View>
            </View>
          )}

          {points.length < 2 && (
            <View style={styles.hintCard}>
              <Icon name={frameProcessorAvailable ? 'radar' : 'alert-circle-outline'} size={18} color={frameProcessorAvailable ? COLORS.cyan : COLORS.warning} />
              <Text style={styles.hintText}>
                {!frameProcessorAvailable
                  ? `Auto tracking needs the rebuilt native app installed. ${frameProcessorSetupError || 'Worklets/frame processors are not active on this app binary.'}`
                  : tracking
                    ? `${detectorStatus}. Keep the phone fixed and let the bowler deliver through the pitch guide.`
                    : 'Set phone behind umpire, align the pitch inside the guide, then tap Track Ball.'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.controlPanel}>
          <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
            <Icon name="restart" size={20} color={COLORS.lightGray} />
            <Text style={styles.secondaryButtonText}>Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, tracking && { backgroundColor: COLORS.warning }]}
            onPress={tracking ? stopTracking : startTracking}
          >
            <Icon name={tracking ? 'stop' : 'radar'} size={23} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{tracking ? 'Stop' : 'Track Ball'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={nextDelivery}>
            <Icon name="skip-next" size={20} color={COLORS.lightGray} />
            <Text style={styles.secondaryButtonText}>Next</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
};

const getStyles = (COLORS) => StyleSheet.create({
  root: { flex: 1 },
  safe: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 14 : (StatusBar.currentHeight || 24) + 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, gap: 10 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder },
  headerTextWrap: { flex: 1 },
  title: { color: COLORS.white, fontSize: 18, fontWeight: '900' },
  subtitle: { color: COLORS.gray, fontSize: 11, marginTop: 3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder },
  statusPillLive: { borderColor: COLORS.warning + '88' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  statusText: { color: COLORS.lightGray, fontSize: 11, fontWeight: '900' },
  calibrationStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  calibrationItem: { flex: 1 },
  calibrationLabel: { color: COLORS.gray, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  calibrationValue: { color: COLORS.lightGray, fontSize: 12, fontWeight: '800', marginTop: 3 },
  calibrationDivider: { width: 1, alignSelf: 'stretch', backgroundColor: COLORS.cardBorder, marginHorizontal: 10 },
  modeBar: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  modeButton: { flex: 1, minHeight: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder, paddingVertical: 6 },
  modeButtonActive: { backgroundColor: COLORS.royalBlue, borderColor: COLORS.cyan + '66' },
  modeButtonText: { color: COLORS.gray, fontSize: 9, fontWeight: '900', marginTop: 2 },
  modeButtonTextActive: { color: '#FFFFFF' },
  metricsGrid: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  metricCard: { flex: 1, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder, borderRadius: 12, padding: 8 },
  metricIcon: { width: 24, height: 24, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  metricLabel: { color: COLORS.gray, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  metricValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 2 },
  metricValue: { fontSize: 18, lineHeight: 21, fontWeight: '900' },
  metricUnit: { color: COLORS.gray, fontSize: 8, fontWeight: '700', paddingBottom: 2 },
  trackingStage: { flex: 1, minHeight: 310, maxHeight: 560, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.cardBorder, backgroundColor: '#050816' },
  syntheticBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#102315' },
  cameraFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#08101F' },
  fallbackTitle: { color: COLORS.white, fontSize: 17, fontWeight: '900', marginTop: 12 },
  fallbackText: { color: COLORS.gray, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  permissionButton: { marginTop: 16, backgroundColor: COLORS.royalBlue, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  permissionText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  stageTopLeft: { position: 'absolute', top: 14, left: 14, backgroundColor: 'rgba(0,0,0,0.48)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  overlayLabel: { color: '#D1D5DB', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  overlayValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 1 },
  stageTopRight: { position: 'absolute', top: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.48)', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  confidenceText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  overlayMetricStack: { position: 'absolute', top: 70, left: 14, width: 108, gap: 7 },
  overlayMetric: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  overlayMetricLabel: { color: '#D1D5DB', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  overlayMetricValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: 2 },
  sideToolbar: { position: 'absolute', top: 70, right: 14, gap: 10 },
  toolButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)' },
  lengthBadge: { position: 'absolute', left: 14, bottom: 14, backgroundColor: 'rgba(0,0,0,0.54)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  lengthLabel: { color: '#D1D5DB', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  lengthValue: { color: COLORS.gold, fontSize: 18, fontWeight: '900', marginTop: 1 },
  view360Badge: { position: 'absolute', top: '42%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(30,64,175,0.78)', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  view360Text: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  impactBadge: { position: 'absolute', right: 14, bottom: 14, backgroundColor: 'rgba(0,0,0,0.54)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', maxWidth: 170 },
  setupPanel: { position: 'absolute', left: 18, right: 18, top: '24%', backgroundColor: 'rgba(0,0,0,0.68)', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  setupIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,240,255,0.14)', marginBottom: 10 },
  setupTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  setupText: { color: '#E5E7EB', fontSize: 12, lineHeight: 18, marginTop: 6 },
  setupChecklist: { gap: 5, marginTop: 12 },
  setupCheck: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  timelinePanel: { position: 'absolute', left: 14, right: 14, bottom: 72, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  timelineLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  timelineTime: { color: COLORS.cyan, fontSize: 11, fontWeight: '900' },
  timelineTrack: { height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden', justifyContent: 'center' },
  timelineFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: COLORS.cyan, opacity: 0.5 },
  timelineThumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, marginLeft: -9, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: COLORS.cyan },
  hintCard: { position: 'absolute', left: 14, right: 14, bottom: 74, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.58)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  hintText: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  controlPanel: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  primaryButton: { flex: 1.5, height: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.royalBlue },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  secondaryButton: { flex: 1, height: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder },
  secondaryButtonText: { color: COLORS.lightGray, fontWeight: '800', fontSize: 13 },
});

export default BallTrackingLabScreen;
