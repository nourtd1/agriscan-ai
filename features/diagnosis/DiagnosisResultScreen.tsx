/**
 * DiagnosisResultScreen — displays the AI diagnosis for a crop scan.
 *
 * Feature: Diagnosis / Result
 * ---------------------------
 * Rendered when `useDiagnosis` reaches `phase === "done"` AND
 * `confidence >= 0.60`. Shows:
 *
 *  - Hero crop photo with a severity badge overlaid on the bottom-left corner.
 *  - Disease name as a prominent heading.
 *  - Confidence gauge: a segmented horizontal bar that fills proportionally,
 *    coloured green (≥ 0.80), amber (0.60–0.79), or red (< 0.60 — this screen
 *    is never shown below 0.60; guard is here for type-safety).
 *  - Treatment steps card: numbered list of actionable remediation steps
 *    returned by Gemini.
 *  - Floating "Listen 🔊" / "Stop 🔇" TTS button — reads the diagnosis and
 *    treatment steps aloud in the active locale via expo-speech.
 *  - "Scan Again" button at the bottom.
 *
 * All visible strings are sourced from the active locale via `useLocale().t()`.
 *
 * If `confidence < 0.60`, the caller must render `LowConfidenceScreen` instead.
 * This component does NOT enforce the threshold itself — that logic lives in the
 * route controller (`app/scan-result/[id]/index.tsx`).
 *
 * Use cases
 * ---------
 * - Farmer receives a clear, high-confidence diagnosis and reads treatment steps.
 * - Low-literacy farmer taps "Listen" to hear the diagnosis in Kinyarwanda.
 * - Field agent verifies the AI diagnosis before acting.
 */

import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';
import { useTTS } from '../tts/useTTS';
import EthicsVerificationSection from './EthicsVerificationSection';
import type { DiagnosisData } from './useDiagnosis';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Number of segments in the confidence gauge bar. */
const GAUGE_SEGMENTS = 20;

/** Threshold above which the gauge is rendered green. */
const GAUGE_GREEN_THRESHOLD = 0.80;

/** Lower bound; result screen is never shown below this. */
const GAUGE_AMBER_THRESHOLD = 0.60;

// ─── Props ────────────────────────────────────────────────────────────────────

interface DiagnosisResultScreenProps {
  data: DiagnosisData;
  /** Called when the user taps "Scan Again". */
  onScanAgain: () => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * SeverityBadge — pill overlay showing low / medium / high severity.
 * Label is sourced from the active locale.
 *
 * @param severity - The severity string from the diagnosis result.
 */
function SeverityBadge({ severity }: { severity: DiagnosisData['severity'] }) {
  const { t } = useLocale();
  const palette = {
    low: { bg: Colors.accent, text: Colors.primary },
    medium: { bg: Colors.warning, text: '#fff' },
    high: { bg: Colors.error, text: '#fff' },
  } as const;
  const { bg, text } = palette[severity];
  const label = t(`diagnosis.severity_${severity}`);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
    </View>
  );
}

/**
 * ConfidenceGauge — segmented horizontal bar visualising confidence.
 *
 * @param confidence - Confidence value in [0, 1].
 */
function ConfidenceGauge({ confidence }: { confidence: number }) {
  const { t } = useLocale();
  const filledCount = Math.round(confidence * GAUGE_SEGMENTS);
  const pct = Math.round(confidence * 100);

  const barColor =
    confidence >= GAUGE_GREEN_THRESHOLD
      ? Colors.accent
      : confidence >= GAUGE_AMBER_THRESHOLD
        ? Colors.warning
        : Colors.error;

  return (
    <View style={styles.gaugeContainer}>
      <View style={styles.gaugeHeader}>
        <Text style={styles.gaugeLabel}>{t('diagnosis.confidence')}</Text>
        <Text style={[styles.gaugePct, { color: barColor }]}>{pct}%</Text>
      </View>
      <View style={styles.gaugeTrack}>
        {Array.from({ length: GAUGE_SEGMENTS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.gaugeSegment,
              i < filledCount
                ? { backgroundColor: barColor }
                : styles.gaugeSegmentEmpty,
              i === 0 && styles.gaugeSegmentFirst,
              i === GAUGE_SEGMENTS - 1 && styles.gaugeSegmentLast,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * TreatmentStepsCard — numbered list of Gemini-recommended remediation steps.
 *
 * @param steps - Array of step strings from the diagnosis result.
 */
function TreatmentStepsCard({ steps }: { steps: string[] }) {
  const { t } = useLocale();
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('diagnosis.treatment_title')}</Text>
      {steps.length === 0 ? (
        <Text style={styles.stepText}>{t('diagnosis.treatment_empty')}</Text>
      ) : (
        steps.map((step, idx) => (
          <View key={idx} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{idx + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * TTSButton — floating circular button that triggers / stops speech.
 *
 * Displayed as a pill anchored to the bottom-right, floating over the scroll
 * content. Uses a filled emerald-green style when idle, amber while speaking.
 *
 * @param data   - Diagnosis data passed to useTTS.
 */
function TTSButton({ data }: { data: DiagnosisData }) {
  const { t, locale } = useLocale();
  const { isSpeaking, isSupported, speak } = useTTS(data, locale);

  if (!isSupported) return null;

  return (
    <Pressable
      onPress={speak}
      style={({ pressed }) => [
        styles.ttsButton,
        isSpeaking && styles.ttsButtonSpeaking,
        pressed && styles.ttsButtonPressed,
      ]}
      accessibilityLabel={isSpeaking ? t('diagnosis.listen_stop') : t('diagnosis.listen')}
      accessibilityRole="button"
    >
      <Text style={styles.ttsButtonText}>
        {isSpeaking ? t('diagnosis.listen_stop') : t('diagnosis.listen')}
      </Text>
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Renders the full diagnosis result when confidence is high enough to display.
 *
 * @param data        - Structured diagnosis data from the Edge Function.
 * @param onScanAgain - Navigation callback for the "Scan Again" button.
 */
export default function DiagnosisResultScreen({
  data,
  onScanAgain,
}: DiagnosisResultScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero image ── */}
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: data.imageUrl }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <SeverityBadge severity={data.severity} />
        </View>

        {/* ── Disease heading ── */}
        <View style={styles.diseaseSection}>
          <Text style={styles.diseaseLabel}>{t('diagnosis.label')}</Text>
          <Text style={styles.diseaseName}>{data.disease}</Text>
        </View>

        {/* ── Confidence gauge ── */}
        <View style={styles.section}>
          <ConfidenceGauge confidence={data.confidence} />
        </View>

        {/* ── Treatment steps ── */}
        <View style={styles.section}>
          <TreatmentStepsCard steps={data.treatment_steps} />
        </View>

        {/* ── Ethical AI & Human Verification ── */}
        <View style={styles.section}>
          <EthicsVerificationSection
            scanId={data.scanId}
            currentStatus={data.status}
            severity={data.severity}
          />
        </View>

        {/* ── Scan again button ── */}
        <Pressable
          onPress={onScanAgain}
          style={({ pressed }) => [styles.scanAgainButton, pressed && styles.scanAgainPressed]}
          accessibilityLabel={t('diagnosis.scan_again')}
          accessibilityRole="button"
        >
          <Text style={styles.scanAgainText}>{t('diagnosis.scan_again')}</Text>
        </Pressable>
      </ScrollView>

      {/* ── Floating TTS button — rendered outside ScrollView so it hovers ── */}
      <View
        style={[styles.ttsFloatContainer, { bottom: insets.bottom + 16 }]}
        pointerEvents="box-none"
      >
        <TTSButton data={data} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroContainer: {
    width: '100%',
    height: 280,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // ── Disease section ───────────────────────────────────────────────────────
  diseaseSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  diseaseLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  diseaseName: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    lineHeight: 32,
  },

  // ── Generic section spacer ────────────────────────────────────────────────
  section: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // ── Confidence gauge ──────────────────────────────────────────────────────
  gaugeContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gaugeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  gaugePct: {
    fontSize: 18,
    fontWeight: '800',
  },
  gaugeTrack: {
    flexDirection: 'row',
    gap: 3,
    height: 10,
  },
  gaugeSegment: {
    flex: 1,
    borderRadius: 3,
  },
  gaugeSegmentEmpty: {
    backgroundColor: Colors.accent + '25',
  },
  gaugeSegmentFirst: {
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  },
  gaugeSegmentLast: {
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },

  // ── Treatment card ────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 21,
  },

  // ── Scan again ────────────────────────────────────────────────────────────
  scanAgainButton: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  scanAgainPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  scanAgainText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── TTS floating button ───────────────────────────────────────────────────
  ttsFloatContainer: {
    position: 'absolute',
    right: 20,
    alignItems: 'flex-end',
  },
  ttsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 28,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  ttsButtonSpeaking: {
    backgroundColor: Colors.warning,
    shadowColor: Colors.warning,
  },
  ttsButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  ttsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
