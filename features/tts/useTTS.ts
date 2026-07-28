/**
 * features/tts/useTTS.ts — expo-speech wrapper for diagnosis read-aloud.
 *
 * Feature: TTS
 * ------------
 * Provides a single `speak` function that reads a formatted diagnosis script
 * aloud in the language that matches the active locale. Exposes `isSpeaking`
 * so the UI button can toggle between "Listen 🔊" and "Stop 🔇".
 *
 * Speech script structure (per locale)
 * -------------------------------------
 * "Diagnosis result. Disease: <disease>. Confidence: <pct> percent.
 *  Severity: <severity>. Treatment steps: <step1>. <step2>. …"
 *
 * The script is assembled from the active locale's `tts.intro` template,
 * which uses `%{variable}` interpolation via i18n-js.
 *
 * Voice selection
 * ---------------
 * expo-speech selects the voice by BCP-47 language tag (`language` option).
 * For Kinyarwanda ("rw-RW"), no dedicated voice exists on most devices; the
 * OS will fall back to a default voice and read the text phonetically. This
 * is an acceptable degradation — the Kinyarwanda text is still played rather
 * than silently dropped.
 *
 * Use cases
 * ---------
 * - Farmer with low literacy listens to the diagnosis in Kinyarwanda.
 * - Field agent confirms diagnosis while hands are busy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import type { DiagnosisData } from '../diagnosis/useDiagnosis';
import type { LocaleCode } from '../i18n/i18n';
import { LOCALE_SPEECH_LANG } from '../i18n/i18n';
import i18n from '../i18n/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseTTSResult {
  isSpeaking: boolean;
  isSupported: boolean;
  /** Starts speaking the diagnosis. If already speaking, stops first. */
  speak: () => void;
  /** Explicitly stops playback. */
  stop: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages TTS playback for a single diagnosis result.
 *
 * @param data   - The diagnosis data to be read aloud.
 * @param locale - Active locale code, determines language tag and script.
 */
export function useTTS(data: DiagnosisData, locale: LocaleCode): UseTTSResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  // Track whether the component is still mounted to avoid state updates after unmount.
  const mountedRef = useRef(true);

  // Check device TTS support on mount.
  useEffect(() => {
    Speech.getAvailableVoicesAsync().then((voices) => {
      if (mountedRef.current) {
        setIsSupported(voices !== null);
      }
    }).catch(() => {
      if (mountedRef.current) setIsSupported(false);
    });

    return () => { mountedRef.current = false; };
  }, []);

  // Stop speech when the component unmounts (e.g. navigating away).
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  /**
   * Builds the spoken script for the current locale.
   *
   * Steps are joined with ". " so the TTS engine pauses naturally between them.
   */
  const buildScript = useCallback((): string => {
    const pct = Math.round(data.confidence * 100);
    const steps = data.treatment_steps.length > 0
      ? data.treatment_steps.join('. ')
      : i18n.t('diagnosis.treatment_empty');

    return i18n.t('tts.intro', {
      disease: data.disease,
      pct,
      severity: data.severity,
      steps,
    });
  }, [data]);

  /**
   * Stops any in-progress speech.
   */
  const stop = useCallback(() => {
    Speech.stop();
    if (mountedRef.current) setIsSpeaking(false);
  }, []);

  /**
   * Starts speaking the diagnosis script in the active locale.
   * Stops any ongoing speech first.
   */
  const speak = useCallback(() => {
    if (isSpeaking) {
      stop();
      return;
    }

    const script = buildScript();
    const lang = LOCALE_SPEECH_LANG[locale];

    setIsSpeaking(true);

    Speech.speak(script, {
      language: lang,
      pitch: 1.0,
      rate: 0.92, // slightly slower than default for clarity in field conditions
      onDone: () => { if (mountedRef.current) setIsSpeaking(false); },
      onError: () => { if (mountedRef.current) setIsSpeaking(false); },
      onStopped: () => { if (mountedRef.current) setIsSpeaking(false); },
    });
  }, [isSpeaking, buildScript, locale, stop]);

  return { isSpeaking, isSupported, speak, stop };
}
