/**
 * CameraPermissionScreen — camera permission gate in onboarding.
 *
 * Feature: Onboarding / Permission
 * ----------------------------------
 * The final onboarding screen. Explains why AgriScan needs camera access and
 * requests it. Three outcomes:
 *
 *   granted   → navigate to main app `/(tabs)/scan`
 *   denied    → show a "go to Settings" prompt (iOS/Android permission flow)
 *   skipped   → navigate to main app anyway; CameraScreen handles missing perms
 *
 * This screen is only shown once during onboarding. If the user opens the
 * camera on the Scan tab and permission is denied, `CameraScreen` shows its
 * own `PermissionPrompt` — this screen is not re-shown.
 *
 * Use cases
 * ---------
 * - First-time user grants camera during smooth onboarding.
 * - User denies, then opens Settings later to grant manually.
 * - User skips — uncommon but supported for gallery-only use.
 */

import React, { useCallback } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera } from 'expo-camera';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Requests camera permission and routes to the main app on grant.
 */
export default function CameraPermissionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const [permission, requestPermission] = Camera.useCameraPermissions();

  /** Requests permission; navigates to scan tab on grant. */
  const handleGrant = useCallback(async () => {
    const result = await requestPermission();
    if (result.granted) {
      router.replace('/(tabs)/scan');
    }
    // If denied: permission state updates and the denied view renders.
  }, [requestPermission, router]);

  /** Navigates to main app without requesting (skip). */
  const handleSkip = useCallback(() => {
    router.replace('/(tabs)/scan');
  }, [router]);

  /** Opens device Settings for manual permission grant. */
  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  const denied =
    permission !== null &&
    !permission.granted &&
    !permission.canAskAgain;

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 },
      ]}
    >
      {/* ── Illustration ── */}
      <View style={styles.illustration}>
        <View style={styles.cameraCircle}>
          <Text style={styles.cameraEmoji}>📷</Text>
        </View>
        <View style={styles.leafAccent}>
          <Text style={styles.leafAccentEmoji}>🌿</Text>
        </View>
      </View>

      {/* ── Copy ── */}
      <View style={styles.copyContainer}>
        <Text style={styles.title}>
          {denied
            ? t('onboarding.permission_denied_title')
            : t('onboarding.permission_title')}
        </Text>
        <Text style={styles.body}>
          {denied
            ? t('onboarding.permission_denied_body')
            : t('onboarding.permission_body')}
        </Text>
        {!denied && (
          <Text style={styles.bodySub}>{t('onboarding.permission_body_rw')}</Text>
        )}
      </View>

      {/* ── Actions ── */}
      <View style={styles.actions}>
        {denied ? (
          <>
            <Pressable
              onPress={handleOpenSettings}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>
                {t('onboarding.open_settings')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSkip}
              style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>{t('onboarding.permission_skip')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={handleGrant}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>
                {t('onboarding.permission_grant')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSkip}
              style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>{t('onboarding.permission_skip')}</Text>
            </Pressable>
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
    alignItems: 'center',
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },
  illustration: {
    position: 'relative',
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary + '30',
  },
  cameraEmoji: {
    fontSize: 52,
  },
  leafAccent: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafAccentEmoji: {
    fontSize: 22,
  },
  copyContainer: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 23,
  },
  bodySub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 19,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});
