/**
 * AnalysisLoadingScreen — full-screen overlay shown while Gemini analyses a crop image.
 *
 * Feature: Diagnosis / Loading
 * ----------------------------
 * Displayed immediately after the farmer taps "Scan Crop" or picks from gallery.
 * The screen fills the viewport with the captured photo and overlays:
 *
 *  - A glowing green scanline that sweeps top→bottom in a continuous loop,
 *    conveying that the image is being actively "read" by the AI.
 *  - A dark-tinted bottom panel with:
 *      • Pulsing AgriScan brand dot.
 *      • Primary status copy: "Analyzing plant health with Gemini Vision AI…"
 *      • Sub-copy in Kinyarwanda: "Tugenzura ubuzima bw'ibimera…"
 *      • Progress indicator for the current phase (uploading / analyzing).
 *
 * The screen transitions automatically once `useDiagnosis` reports `done` or
 * `error`; the parent route drives navigation.
 *
 * Use cases
 * ---------
 * - Farmer waits 2–8 seconds while the image is uploaded and Gemini responds.
 * - Slow network: "Uploading photo…" copy reassures the farmer that upload is
 *   in progress before the AI step begins.
 * - Error path: a brief shake animation signals failure before the screen pops.
 */

import React, { useEffect } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';
import type { DiagnosisPhase } from './useDiagnosis';

// ─── Constants ────────────────────────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get('window');

/** Duration of one full scanline sweep in ms. */
const SCANLINE_DURATION_MS = 1800;

/** Duration of the pulse opacity cycle in ms. */
const PULSE_DURATION_MS = 900;

// ─── Props ────────────────────────────────────────────────────────────────────

interface AnalysisLoadingScreenProps {
  /** Local URI of the captured / picked image shown behind the overlay. */
  imageUri: string;
  /** Current pipeline phase from `useDiagnosis`. */
  phase: DiagnosisPhase;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Full-screen loading overlay for the analysis pipeline.
 *
 * @param imageUri - The local image URI displayed as the background.
 * @param phase    - Current phase drives the status copy.
 */
export default function AnalysisLoadingScreen({
  imageUri,
  phase,
}: AnalysisLoadingScreenProps) {
  const { t } = useLocale();
  // Scanline: translateY sweeps from -SCANLINE_H to SCREEN_H, repeats.
  const scanY = useSharedValue(-40);
  // Pulse dot: opacity oscillates between 0.4 and 1.
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    // Scanline sweep — runs indefinitely until unmount.
    scanY.value = withRepeat(
      withTiming(SCREEN_H, {
        duration: SCANLINE_DURATION_MS,
        easing: Easing.inOut(Easing.quad),
      }),
      -1, // infinite
      false,
    );
    // Reset to top on each cycle (jumpToStart handled by withRepeat internals).

    // Pulse dot — oscillates opacity.
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: PULSE_DURATION_MS }),
        withTiming(1.0, { duration: PULSE_DURATION_MS }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(scanY);
      cancelAnimation(pulseOpacity);
    };
  }, [scanY, pulseOpacity]);

  const scanlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanY.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

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
      {/* ── Background image ── */}
      <Image source={{ uri: imageUri }} style={styles.bgImage} resizeMode="cover" />

      {/* ── Dark vignette ── */}
      <View style={styles.vignette} pointerEvents="none" />

      {/* ── Animated scanline ── */}
      <Animated.View style={[styles.scanline, scanlineStyle]} pointerEvents="none">
        {/* Core green line */}
        <View style={styles.scanlineBar} />
        {/* Soft glow below */}
        <View style={styles.scanlineGlow} />
      </Animated.View>

      {/* ── Bottom status panel ── */}
      <View style={styles.panel}>
        {/* Pulsing brand dot */}
        <Animated.View style={[styles.pulseDot, pulseStyle]} />

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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    // Gradient-like effect: top clear, bottom heavy dark.
    backgroundColor: 'transparent',
    // Simulate gradient with a translucent layer.
    background: undefined, // not available in RN; use panel overlay instead.
    opacity: 0.35,
    backgroundColor: '#000',
  },
  // ── Scanline ─────────────────────────────────────────────────────────────
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  scanlineBar: {
    height: 2.5,
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  scanlineGlow: {
    height: 36,
    backgroundColor: Colors.accent,
    opacity: 0.14,
  },
  // ── Bottom panel ──────────────────────────────────────────────────────────
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
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
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
