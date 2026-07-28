/**
 * AnalysisLoadingScreen — full-screen overlay shown while Gemini analyses a crop image.
 * Uses React Native's built-in Animated API (no native modules required for Expo Go).
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';
import type { DiagnosisPhase } from './useDiagnosis';

const { height: SCREEN_H } = Dimensions.get('window');
const SCANLINE_DURATION_MS = 1800;
const PULSE_DURATION_MS = 900;

interface AnalysisLoadingScreenProps {
  imageUri: string;
  phase: DiagnosisPhase;
}

export default function AnalysisLoadingScreen({
  imageUri,
  phase,
}: AnalysisLoadingScreenProps) {
  const { t } = useLocale();

  // Scanline sweep animation
  const scanY = useRef(new Animated.Value(-40)).current;
  // Pulse dot animation
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Scanline: sweep from top to bottom, repeat forever
    const scanAnim = Animated.loop(
      Animated.timing(scanY, {
        toValue: SCREEN_H,
        duration: SCANLINE_DURATION_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    scanAnim.start();

    // Pulse: fade in/out forever
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 0.35,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseAnim.start();

    return () => {
      scanAnim.stop();
      pulseAnim.stop();
    };
  }, [scanY, pulseOpacity]);

  const phaseLabel =
    phase === 'uploading'
      ? t('diagnosis.phase_uploading')
      : phase === 'analyzing'
        ? t('diagnosis.phase_analyzing')
        : phase === 'error'
          ? t('diagnosis.phase_error')
          : t('diagnosis.phase_done');

  return (
    <View style={styles.root}>
      <Image source={{ uri: imageUri }} style={styles.bgImage} resizeMode="cover" />
      <View style={styles.vignette} pointerEvents="none" />

      {/* Scanline */}
      <Animated.View
        style={[styles.scanline, { transform: [{ translateY: scanY }] }]}
        pointerEvents="none"
      >
        <View style={styles.scanlineBar} />
        <View style={styles.scanlineGlow} />
      </Animated.View>

      {/* Bottom panel */}
      <View style={styles.panel}>
        <Animated.View style={[styles.pulseDot, { opacity: pulseOpacity }]} />
        <Text style={styles.primaryText}>{t('diagnosis.loading_primary')}</Text>
        <Text style={styles.kinyarwandaText}>{t('diagnosis.loading_sub')}</Text>
        <View style={styles.phaseRow}>
          <View style={styles.phaseIndicator} />
          <Text style={styles.phaseText}>{phaseLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  vignette: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  scanline: { position: 'absolute', left: 0, right: 0, top: 0 },
  scanlineBar: {
    height: 2.5,
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  scanlineGlow: { height: 36, backgroundColor: Colors.accent, opacity: 0.14 },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10,30,10,0.82)',
    paddingTop: 28,
    paddingBottom: 48,
    paddingHorizontal: 28,
    alignItems: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accent,
    marginBottom: 18,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
  primaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
  },
  kinyarwandaText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phaseIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
    opacity: 0.7,
  },
  phaseText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
