/**
 * LanguageSelectScreen — language-selection grid in onboarding.
 *
 * Feature: Onboarding / Language
 * --------------------------------
 * Lets the farmer choose their preferred language before they see any other
 * content. Each option is a large tappable card (not a compact pill) with:
 *   - The language name in that language (autonym).
 *   - The language name in English in a secondary line.
 *   - A check mark when selected.
 *
 * Tapping "Continue" calls `setLocale` from `useLocale`, which persists the
 * choice to Supabase and navigates to the camera-permission screen.
 *
 * Use cases
 * ---------
 * - Non-literate farmer uses the card layout (larger touch targets) to identify
 *   their language visually rather than reading a label.
 * - Field agent sets up a shared device for a Swahili-speaking farmer.
 */

import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../config/colors';
import { useLocale } from '../i18n/LocaleContext';
import { SUPPORTED_LOCALES, type LocaleCode } from '../i18n/i18n';

// ─── Language metadata ────────────────────────────────────────────────────────

/** Autonym (name of the language in that language) + English name + flag emoji. */
const LANGUAGE_META: Record<LocaleCode, { autonym: string; english: string; flag: string }> = {
  en: { autonym: 'English',      english: 'English',    flag: '🇬🇧' },
  rw: { autonym: 'Ikinyarwanda', english: 'Kinyarwanda', flag: '🇷🇼' },
  sw: { autonym: 'Kiswahili',    english: 'Swahili',    flag: '🌍' },
  fr: { autonym: 'Français',     english: 'French',     flag: '🇫🇷' },
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Language-selection grid for onboarding.
 */
export default function LanguageSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, setLocale } = useLocale();
  const [selected, setSelected] = useState<LocaleCode>('en');

  /** Applies the chosen locale and navigates to the camera permission screen. */
  function handleContinue() {
    setLocale(selected);
    router.push('/(onboarding)/permission');
  }

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.language_title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.language_subtitle')}</Text>
      </View>

      {/* ── Language grid ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {SUPPORTED_LOCALES.map((code) => {
          const meta = LANGUAGE_META[code];
          const active = selected === code;
          return (
            <Pressable
              key={code}
              onPress={() => setSelected(code)}
              style={({ pressed }) => [
                styles.langCard,
                active && styles.langCardActive,
                pressed && styles.langCardPressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${meta.autonym} — ${meta.english}`}
            >
              <Text style={styles.flag}>{meta.flag}</Text>
              <View style={styles.langText}>
                <Text style={[styles.autonym, active && styles.autonymActive]}>
                  {meta.autonym}
                </Text>
                <Text style={[styles.englishName, active && styles.englishNameActive]}>
                  {meta.english}
                </Text>
              </View>
              {active && (
                <View style={styles.checkCircle}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Continue ── */}
      <View style={styles.footer}>
        <Pressable
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.continueButton,
            pressed && styles.continueButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.language_continue')}
        >
          <Text style={styles.continueText}>{t('onboarding.language_continue')}</Text>
        </Pressable>
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
  header: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  scroll: {
    flex: 1,
  },
  grid: {
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 16,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  langCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  langCardPressed: {
    opacity: 0.75,
  },
  flag: {
    fontSize: 32,
  },
  langText: {
    flex: 1,
    gap: 2,
  },
  autonym: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  autonymActive: {
    color: Colors.primary,
  },
  englishName: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  englishNameActive: {
    color: Colors.primary,
    opacity: 0.7,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  continueButton: {
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
  continueButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  continueText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
