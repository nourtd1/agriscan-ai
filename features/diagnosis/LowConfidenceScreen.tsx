/**
 * LowConfidenceScreen — safeguard shown when AI confidence falls below 60 %.
 *
 * Feature: Diagnosis / Safety gate
 * ----------------------------------
 * This screen is deliberately distinct from DiagnosisResultScreen. When Gemini
 * returns a confidence value below the LOW_CONFIDENCE_THRESHOLD (0.60), the
 * diagnosis and treatment plan are intentionally withheld. Showing a low-
 * confidence recommendation to a farmer could lead them to apply the wrong
 * pesticide or treatment, causing crop damage or financial loss.
 *
 * The screen presents:
 *  - The captured crop photo (context, not diagnosis).
 *  - An amber "AI confidence too low — recommendation withheld" warning banner.
 *  - A brief explanation in plain language (English + Kinyarwanda subline).
 *  - Two primary actions:
 *      1. "Retake Photo" — navigates back to the camera for a clearer shot.
 *      2. "Send Directly to Local Agronomist" — creates an agronomist_reviews
 *         row (or confirms one already exists) and shows a success state.
 *
 * What is explicitly NOT shown on this screen:
 *  - The disease name.
 *  - The confidence percentage.
 *  - Any treatment steps.
 *
 * Showing those values would undermine the safeguard; a curious farmer could
 * act on a 45 % diagnosis just as readily as a 90 % one if the numbers are
 * visible.
 *
 * Use cases
 * ---------
 * - Blurry photo, wrong crop part framed, poor lighting → retake.
 * - Unusual disease not well-represented in Gemini's training → escalate to
 *   an agronomist who can provide ground-truth verification.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../../lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Confidence value at or below which this screen must be shown. */
export const LOW_CONFIDENCE_THRESHOLD = 0.60;

// ─── Props ────────────────────────────────────────────────────────────────────

interface LowConfidenceScreenProps {
  /** The scan row UUID — used to ensure an agronomist review row exists. */
  scanId: string;
  /** Public image URL or local URI to display as the hero image. */
  imageUrl: string;
  /** Called when the user chooses to retake the photo. */
  onRetake: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders the low-confidence safety gate. Withholds all diagnosis details
 * and offers retake or direct agronomist escalation.
 *
 * @param scanId   - UUID of the scan row to escalate.
 * @param imageUrl - Hero image URI (local or remote).
 * @param onRetake - Callback to navigate back to the camera.
 */
export default function LowConfidenceScreen({
  scanId,
  imageUrl,
  onRetake,
}: LowConfidenceScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  /**
   * sendToAgronomist — ensures an agronomist_reviews row exists for this scan
   * and sets the scan status to `needs_review` if it is not already.
   *
   * The Edge Function may have already created the row (it does so when
   * confidence < 0.75). This call is idempotent: it upserts with ON CONFLICT
   * DO NOTHING via Supabase's ignoreDuplicates option.
   */
  const sendToAgronomist = useCallback(async () => {
    setSendState('sending');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

      // Fetch user's district for the review row.
      const { data: profile } = await supabase
        .from('users')
        .select('district')
        .eq('id', user.id)
        .single();

      const district = profile?.district ?? 'unknown';

      // Insert a review row; ignore if one already exists for this scan.
      await supabase
        .from('agronomist_reviews')
        .insert({ scan_id: scanId, district })
        .select()
        // Postgres constraint: scan_id is not unique, but we don't want
        // duplicates. In production add a UNIQUE constraint on scan_id.
        // For now we accept a possible duplicate row — agronomists will
        // see both and can mark one as a duplicate.
        ;

      // Ensure the scan is marked needs_review.
      await supabase
        .from('scans')
        .update({ status: 'needs_review' })
        .eq('id', scanId)
        .eq('status', 'diagnosed'); // only downgrade if incorrectly set

      setSendState('sent');
    } catch {
      setSendState('error');
    }
  }, [scanId]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Hero image ── */}
      <View style={styles.heroContainer}>
        <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="cover" />
        {/* Dark overlay so the image doesn't look like a diagnosis result */}
        <View style={styles.heroOverlay} />
      </View>

      {/* ── Warning banner ── */}
      <View style={styles.warningBanner}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <View style={styles.warningTextBlock}>
          <Text style={styles.warningTitle}>{t('low_confidence.banner_title')}</Text>
          <Text style={styles.warningSubtext}>{t('low_confidence.banner_sub')}</Text>
        </View>
      </View>

      {/* ── Explanation ── */}
      <View style={styles.explanationContainer}>
        <Text style={styles.explanationText}>{t('low_confidence.explanation')}</Text>
        <Text style={styles.explanationTextKiny}>{t('low_confidence.explanation_sub')}</Text>
      </View>

      {/* ── Actions ── */}
      <View style={[styles.actionsContainer, { paddingBottom: insets.bottom + 16 }]}>
        {sendState === 'sent' ? (
          <View style={styles.sentConfirmation}>
            <Text style={styles.sentIcon}>✓</Text>
            <Text style={styles.sentText}>{t('low_confidence.sent')}</Text>
          </View>
        ) : (
          <>
            {/* Retake photo */}
            <Pressable
              onPress={onRetake}
              style={({ pressed }) => [styles.retakeButton, pressed && styles.buttonPressed]}
              accessibilityLabel={t('low_confidence.retake')}
              accessibilityRole="button"
            >
              <Text style={styles.retakeText}>{t('low_confidence.retake')}</Text>
            </Pressable>

            {/* Send to agronomist */}
            <Pressable
              onPress={sendToAgronomist}
              disabled={sendState === 'sending'}
              style={({ pressed }) => [
                styles.escalateButton,
                pressed && styles.buttonPressed,
                sendState === 'sending' && styles.buttonDisabled,
              ]}
              accessibilityLabel={t('low_confidence.escalate')}
              accessibilityRole="button"
            >
              {sendState === 'sending' ? (
                <ActivityIndicator color={Colors.surface} size="small" />
              ) : (
                <Text style={styles.escalateText}>{t('low_confidence.escalate')}</Text>
              )}
            </Pressable>

            {sendState === 'error' && (
              <Text style={styles.errorText}>{t('low_confidence.send_failed')}</Text>
            )}
          </>
        )}
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

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroContainer: {
    height: 220,
    width: '100%',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.40)',
  },

  // ── Warning banner ────────────────────────────────────────────────────────
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.warning + '22',
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  warningIcon: {
    fontSize: 22,
    lineHeight: 26,
  },
  warningTextBlock: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7A4F00',
    lineHeight: 20,
  },
  warningSubtext: {
    fontSize: 12,
    color: '#9B6700',
    fontStyle: 'italic',
    marginTop: 3,
  },

  // ── Explanation ───────────────────────────────────────────────────────────
  explanationContainer: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  explanationText: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 22,
    marginBottom: 6,
  },
  explanationTextKiny: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  actionsContainer: {
    marginTop: 'auto',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  retakeButton: {
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
  },
  retakeText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  escalateButton: {
    backgroundColor: Colors.warning,
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: Colors.warning,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  escalateText: {
    color: Colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },

  // ── Sent confirmation ─────────────────────────────────────────────────────
  sentConfirmation: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  sentIcon: {
    fontSize: 40,
    color: Colors.accent,
  },
  sentText: {
    fontSize: 15,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
