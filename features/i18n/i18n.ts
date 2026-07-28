/**
 * features/i18n/i18n.ts — i18n-js v4 instance wired to our locale files.
 *
 * Single source of truth for translations. Import `i18n` and call
 * `i18n.t("some.key")` anywhere in the app. To switch locale at runtime
 * call `setLocale(code)` from `useLocale` — never mutate `i18n.locale`
 * directly outside this file.
 *
 * Supported locales
 * -----------------
 *   en  English   (default / fallback)
 *   rw  Kinyarwanda
 *   sw  Kiswahili
 *   fr  French
 *
 * Missing key behaviour: falls back to English, then returns the key itself
 * so the UI never crashes on an untranslated string.
 */

import { I18n } from 'i18n-js';
import en from '../../locales/en.json';
import rw from '../../locales/rw.json';
import sw from '../../locales/sw.json';
import fr from '../../locales/fr.json';

export type LocaleCode = 'en' | 'rw' | 'sw' | 'fr';

export const SUPPORTED_LOCALES: LocaleCode[] = ['en', 'rw', 'sw', 'fr'];

/** Human-readable display names used in the language selector pill. */
export const LOCALE_LABELS: Record<LocaleCode, string> = {
  en: 'EN',
  rw: 'RW',
  sw: 'SW',
  fr: 'FR',
};

/** BCP-47 language tags used by expo-speech for voice selection. */
export const LOCALE_SPEECH_LANG: Record<LocaleCode, string> = {
  en: 'en-US',
  rw: 'rw-RW', // Kinyarwanda — falls back to nearest available voice
  sw: 'sw-TZ', // Swahili
  fr: 'fr-FR',
};

const i18n = new I18n({ en, rw, sw, fr });

i18n.defaultLocale = 'en';
i18n.enableFallback = true;

export default i18n;
