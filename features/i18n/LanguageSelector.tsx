/**
 * LanguageSelector — horizontal pill strip for switching locale at runtime.
 *
 * Feature: i18n
 * -------------
 * Renders a row of tappable locale pills (EN / RW / SW / FR). The active
 * locale is highlighted with a filled emerald-green pill; inactive options
 * use a ghost/outline style.
 *
 * Intended placement: top-right of the screen header via Expo Router's
 * `headerRight` option, or inline on the Profile screen.
 *
 * Tapping a pill calls `setLocale` from `useLocale`, which:
 *   1. Updates the i18n instance immediately (all `t()` calls re-render).
 *   2. Persists the choice to `public.users.preferred_language` in Supabase.
 *
 * Use cases
 * ---------
 * - Farmer who speaks Kinyarwanda switches from EN → RW on first launch.
 * - Field agent switches to French for a literate supervisor review.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../config/colors';
import { useLocale } from './LocaleContext';
import { SUPPORTED_LOCALES, LOCALE_LABELS, type LocaleCode } from './i18n';

// ─── Props ────────────────────────────────────────────────────────────────────

interface LanguageSelectorProps {
  compact?: boolean;
  /** When true, renders with white/transparent styles for dark backgrounds. */
  onDark?: boolean;
}

export default function LanguageSelector({ compact = false, onDark = false }: LanguageSelectorProps) {
  const { locale, setLocale } = useLocale();

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {SUPPORTED_LOCALES.map((code: LocaleCode) => {
        const active = code === locale;
        return (
          <Pressable
            key={code}
            onPress={() => setLocale(code)}
            style={({ pressed }) => [
              styles.pill,
              compact && styles.pillCompact,
              active
                ? (onDark ? styles.pillActiveDark : styles.pillActive)
                : (onDark ? styles.pillInactiveDark : styles.pillInactive),
              pressed && styles.pillPressed,
            ]}
            accessibilityLabel={`Switch language to ${LOCALE_LABELS[code]}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[
                styles.pillText,
                compact && styles.pillTextCompact,
                active
                  ? (onDark ? styles.pillTextActiveDark : styles.pillTextActive)
                  : (onDark ? styles.pillTextInactiveDark : styles.pillTextInactive),
              ]}
            >
              {LOCALE_LABELS[code]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  containerCompact: {
    gap: 4,
  },

  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  pillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillActiveDark: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(255,255,255,0.95)',
  },
  pillInactive: {
    backgroundColor: 'transparent',
    borderColor: Colors.accent,
  },
  pillInactiveDark: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.45)',
  },
  pillPressed: {
    opacity: 0.7,
  },

  pillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pillTextCompact: {
    fontSize: 11,
  },
  pillTextActive: {
    color: '#fff',
  },
  pillTextInactive: {
    color: Colors.primary,
  },
  pillTextActiveDark: {
    color: Colors.primary,
  },
  pillTextInactiveDark: {
    color: 'rgba(255,255,255,0.75)',
  },
});
