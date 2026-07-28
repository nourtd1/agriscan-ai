/**
 * EthicsVerificationSection — "Ethical AI & Human Verification" card on the
 * result screen.
 *
 * Feature: Ethics / Human Verification integration point
 * -------------------------------------------------------
 * Displayed below the treatment steps card on DiagnosisResultScreen. Its job
 * is to make the AI's epistemic limitations visible to the farmer and offer a
 * one-tap path to escalate to a human expert.
 *
 * States
 * ------
 *   idle        — Initial. Shows the banner + "Send to Agronomist" button.
 *   sending     — Button disabled, activity indicator shown.
 *   pending     — After successful send: status card "Pending Agronomist Review".
 *   reviewed    — Scan already has status "verified" when the screen loads.
 *   error       — Send failed; inline error message with retry.
 *
 * Supabase writes
 * ---------------
 * On send: updates `scans.status` to `needs_review` and upserts an
 * `agronomist_reviews` row with the user's district. Both operations use the
 * anon client (user's own row — RLS allows it).
 *
 * Why this is on the result screen, not a separate screen
 * -------------------------------------------------------
 * Requiring navigation to a separate "verify" screen adds friction. A farmer
 * who found the result reassuring would simply not navigate there. Inline
 * placement means every farmer sees the verification option without extra steps.
 *
 * Use cases
 * ---------
 * - Severity "high": farmer is strongly nudged to send for human review.
 * - Severity "medium": farmer can choose to send or act on the AI result.
 * - Severity "low": section is shown (transparency) but button is deprioritised.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../../lib/supabase';
import type { ScanStatus, Severity } from '../../config/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

type SendState = 'idle' | 'sending' | 'pending' | 'reviewed' | 'error';

interface EthicsVerificationSectionProps {
  scanId: string;
  currentStatus: ScanStatus;
  severity: Severity;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derives the initial send-state from the scan's current DB status so the
 * section renders the right view even when navigating to an existing scan.
 *
 * @param status - The scan's current `status` value from Supabase.
 */
function deriveInitialState(status: ScanStatus): SendState {
  if (status === 'verified') return 'reviewed';
  if (status === 'needs_review') return 'pending';
  return 'idle';
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders the ethics banner and verification CTA inline on the result screen.
 *
 * @param scanId        - UUID of the scan row to escalate.
 * @param currentStatus - Current scan status; drives initial render state.
 * @param severity      - Severity level; used to style the banner prominence.
 */
export default function EthicsVerificationSection({
  scanId,
  currentStatus,
  severity,
}: EthicsVerificationSectionProps) {
  const { t } = useLocale();
  const [sendState, setSendState] = useState<SendState>(() =>
    deriveInitialState(currentStatus),
  );

  // Re-derive if the parent re-renders with a different status (e.g. after a
  // real-time subscription updates the scan row).
  useEffect(() => {
    setSendState(deriveInitialState(currentStatus));
  }, [currentStatus]);

  /**
   * Sends the scan to the agronomist review queue.
   *
   * Writes:
   *   1. scans.status → "needs_review"
   *   2. agronomist_reviews INSERT (with user's district)
   */
  const sendForVerification = useCallback(async () => {
    setSendState('sending');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('users')
        .select('district')
        .eq('id', user.id)
        .single();

      const district = profile?.district ?? 'unknown';

      // Update scan status.
      const { error: updateErr } = await supabase
        .from('scans')
        .update({ status: 'needs_review' })
        .eq('id', scanId);
      if (updateErr) throw updateErr;

      // Insert review row — non-fatal if a duplicate already exists.
      await supabase
        .from('agronomist_reviews')
        .insert({ scan_id: scanId, district });

      setSendState('pending');
    } catch {
      setSendState('error');
    }
  }, [scanId]);

  // Banner border colour is more prominent for high-severity scans.
  const bannerBorderColor =
    severity === 'high' ? Colors.error : Colors.warning;

  return (
    <View style={styles.container}>
      {/* ── Section heading ── */}
      <Text style={styles.sectionTitle}>{t('ethics.section_title')}</Text>

      {/* ── Banner ── */}
      <View style={[styles.banner, { borderLeftColor: bannerBorderColor }]}>
        <Text style={styles.bannerIcon}>🌿</Text>
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>{t('ethics.banner')}</Text>
          <Text style={styles.bannerSub}>{t('ethics.banner_sub')}</Text>
        </View>
      </View>

      {/* ── Why explanation (collapsible in future; always shown for now) ── */}
      <View style={styles.whyBox}>
        <Text style={styles.whyTitle}>{t('ethics.why_title')}</Text>
        <Text style={styles.whyBody}>{t('ethics.why_body')}</Text>
      </View>

      {/* ── Action area ── */}
      {sendState === 'reviewed' ? (
        <ReviewedCard t={t} />
      ) : sendState === 'pending' ? (
        <PendingCard t={t} />
      ) : (
        <>
          <Pressable
            onPress={sendForVerification}
            disabled={sendState === 'sending'}
            style={({ pressed }) => [
              styles.sendButton,
              severity === 'high' && styles.sendButtonUrgent,
              pressed && styles.sendButtonPressed,
              sendState === 'sending' && styles.sendButtonDisabled,
            ]}
            accessibilityLabel={t('ethics.send_button')}
            accessibilityRole="button"
          >
            {sendState === 'sending' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>{t('ethics.send_button')}</Text>
            )}
          </Pressable>

          {sendState === 'error' && (
            <Text style={styles.errorText}>{t('ethics.send_failed')}</Text>
          )}
        </>
      )}
    </View>
  );
}

// ─── Status sub-cards ─────────────────────────────────────────────────────────

/**
 * PendingCard — shown after a successful send, replacing the CTA button.
 * Makes the queue status visible without requiring navigation.
 */
function PendingCard({ t }: { t: (key: string) => string }) {
  return (
    <View style={styles.statusCard}>
      <View style={[styles.statusDot, { backgroundColor: Colors.warning }]} />
      <View style={styles.statusText}>
        <Text style={styles.statusTitle}>{t('ethics.status_pending')}</Text>
        <Text style={styles.statusSub}>{t('ethics.status_pending_sub')}</Text>
      </View>
    </View>
  );
}

/**
 * ReviewedCard — shown when the scan has already been verified by an agronomist.
 */
function ReviewedCard({ t }: { t: (key: string) => string }) {
  return (
    <View style={[styles.statusCard, styles.statusCardVerified]}>
      <View style={[styles.statusDot, { backgroundColor: Colors.accent }]} />
      <View style={styles.statusText}>
        <Text style={styles.statusTitle}>{t('ethics.status_reviewed')}</Text>
        <Text style={styles.statusSub}>{t('ethics.status_reviewed_sub')}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Banner ────────────────────────────────────────────────────────────────
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.warning + '18',
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
  },
  bannerIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  bannerSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // ── Why box ───────────────────────────────────────────────────────────────
  whyBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.accent + '40',
  },
  whyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
  },
  whyBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },

  // ── Send button ───────────────────────────────────────────────────────────
  sendButton: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  sendButtonUrgent: {
    backgroundColor: Colors.error,
    shadowColor: Colors.error,
  },
  sendButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    textAlign: 'center',
  },

  // ── Status cards ──────────────────────────────────────────────────────────
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.warning + '18',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning + '50',
  },
  statusCardVerified: {
    backgroundColor: Colors.accent + '18',
    borderColor: Colors.accent + '50',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
    flexShrink: 0,
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  statusSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
});
