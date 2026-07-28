/**
 * WelcomeScreen — first screen of the onboarding flow.
 *
 * Feature: Onboarding
 * -------------------
 * Displays the AgriScan AI brand mark, a two-line bilingual value proposition,
 * and a "Get Started" button that navigates to the language-selection screen.
 *
 * This screen is intentionally minimal — no form fields, no auth. Its job is
 * to communicate the app's purpose before asking for anything from the user.
 *
 * Use cases
 * ---------
 * - First-time install: farmer sees the app purpose before committing.
 * - Shared device: returning to onboarding after sign-out.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';

/**
 * Renders the welcome splash with brand mark and CTA.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 },
      ]}
    >
      {/* ── Brand mark ── */}
      <View style={styles.brandContainer}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>🌿</Text>
        </View>
        <Text style={styles.appName}>{t('onboarding.welcome_title')}</Text>
      </View>

      {/* ── Value prop ── */}
      <View style={styles.valueContainer}>
        <Text style={styles.subtitle}>{t('onboarding.welcome_subtitle')}</Text>
        <Text style={styles.subtitleSub}>{t('onboarding.welcome_sub_rw')}</Text>
      </View>

      {/* ── Decorative leaf line ── */}
      <View style={styles.leafRow}>
        {['🌱', '🍃', '🌿', '🍃', '🌱'].map((e, i) => (
          <Text key={i} style={styles.leafEmoji}>{e}</Text>
        ))}
      </View>

      {/* ── CTA ── */}
      <View style={styles.ctaContainer}>
        <Pressable
          onPress={() => router.push('/(onboarding)/language')}
          style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.get_started')}
        >
          <Text style={styles.ctaText}>{t('onboarding.get_started')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  brandContainer: {
    alignItems: 'center',
    gap: 16,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  logoEmoji: {
    fontSize: 48,
  },
  appName: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  valueContainer: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    lineHeight: 25,
    fontWeight: '500',
  },
  subtitleSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  leafRow: {
    flexDirection: 'row',
    gap: 10,
  },
  leafEmoji: {
    fontSize: 22,
    opacity: 0.7,
  },
  ctaContainer: {
    width: '100%',
  },
  ctaButton: {
    backgroundColor: Colors.accent,
    borderRadius: 28,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  ctaButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  ctaText: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
