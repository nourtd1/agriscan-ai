/**
 * features/i18n/LocaleContext.tsx — React context that owns the active locale.
 *
 * Provides:
 *   - `locale`    Current LocaleCode (read).
 *   - `setLocale` Switch locale at runtime and persist to Supabase.
 *   - `t`         Shorthand for `i18n.t(key, params?)`.
 *
 * Initialisation order
 * --------------------
 * 1. Read `preferred_language` from the authenticated user's `public.users` row.
 * 2. Fall back to the device locale via `expo-localization`.
 * 3. Fall back to `'en'` if neither matches a supported locale.
 *
 * Persistence
 * -----------
 * `setLocale` writes the new code to `public.users.preferred_language` so the
 * choice survives reinstalls / device changes. The write is fire-and-forget;
 * the UI updates immediately without waiting for the DB round-trip.
 *
 * Wrap the app root with `<LocaleProvider>` (done in `app/_layout.tsx`).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import * as ExpoLocalization from 'expo-localization';
import i18n, { type LocaleCode, SUPPORTED_LOCALES } from './i18n';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocaleContextValue {
  locale: LocaleCode;
  setLocale: (code: LocaleCode) => void;
  /** Shorthand translation helper — equivalent to `i18n.t(key, params)`. */
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves a raw BCP-47 tag (e.g. "fr-FR", "rw") to a supported LocaleCode.
 * Returns `'en'` if no match is found.
 *
 * @param tag - Locale string from expo-localization or Supabase.
 */
function resolveLocale(tag: string | null | undefined): LocaleCode {
  if (!tag) return 'en';
  const lower = tag.toLowerCase();
  // Exact match first (e.g. "rw"), then prefix (e.g. "fr-FR" → "fr").
  return (
    (SUPPORTED_LOCALES.find((l) => l === lower) ??
      SUPPORTED_LOCALES.find((l) => lower.startsWith(l))) ??
    'en'
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * LocaleProvider — wraps the app root and manages active locale state.
 *
 * @param children - React subtree.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    // Optimistic initialisation from device locale while we wait for Supabase.
    const deviceTag = ExpoLocalization.getLocales()[0]?.languageTag;
    return resolveLocale(deviceTag);
  });

  // On mount: try to load the user's persisted language preference.
  useEffect(() => {
    let cancelled = false;

    async function loadPreference() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from('users')
        .select('preferred_language')
        .eq('id', user.id)
        .single();

      if (cancelled) return;
      if (profile?.preferred_language) {
        const resolved = resolveLocale(profile.preferred_language);
        applyLocale(resolved);
      }
    }

    loadPreference();
    return () => { cancelled = true; };
  }, []);

  /** Applies a locale to both the i18n instance and React state. */
  const applyLocale = useCallback((code: LocaleCode) => {
    i18n.locale = code;
    setLocaleState(code);
  }, []);

  /**
   * Switches the active locale and persists it to the user's Supabase profile.
   * The UI updates immediately; DB write is fire-and-forget.
   *
   * @param code - Target LocaleCode.
   */
  const setLocale = useCallback(
    (code: LocaleCode) => {
      applyLocale(code);

      // Persist asynchronously — do not await; UI must not block.
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase
          .from('users')
          .update({ preferred_language: code })
          .eq('id', user.id);
      });
    },
    [applyLocale],
  );

  /**
   * Translation shorthand.
   *
   * @param key    - Dot-separated translation key (e.g. "diagnosis.label").
   * @param params - Optional interpolation params (e.g. `{ disease: "Rust" }`).
   */
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      i18n.t(key, params) as string,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale], // re-bind when locale changes so consumers re-render
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the active locale context.
 * Must be called inside a `<LocaleProvider>` subtree.
 */
export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
