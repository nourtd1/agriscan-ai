/**
 * Route: /scan-result/[id]
 *
 * Controller that orchestrates the three diagnosis screens:
 *
 *   1. AnalysisLoadingScreen  — shown while upload + Gemini analysis runs.
 *   2. DiagnosisResultScreen  — shown when confidence >= LOW_CONFIDENCE_THRESHOLD.
 *   3. LowConfidenceScreen    — shown when confidence <  LOW_CONFIDENCE_THRESHOLD.
 *
 * Params
 * ------
 *   id    string  UUID of an existing scan row, OR "new" for a fresh capture.
 *   uri   string  Local image URI — required when id === "new".
 *
 * Navigation contract
 * -------------------
 *   - Camera screen pushes here with `{ id: "new", uri: "<local-file-uri>" }`.
 *   - History / recent-scans strip pushes here with `{ id: "<uuid>" }` (no uri).
 *     In that case this route loads the scan from Supabase and shows the
 *     appropriate result screen directly (no loading screen).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../../config/colors';
import { useDiagnosis, type DiagnosisData } from '../../../features/diagnosis/useDiagnosis';
import { LOW_CONFIDENCE_THRESHOLD } from '../../../features/diagnosis/LowConfidenceScreen';
import AnalysisLoadingScreen from '../../../features/diagnosis/AnalysisLoadingScreen';
import DiagnosisResultScreen from '../../../features/diagnosis/DiagnosisResultScreen';
import LowConfidenceScreen from '../../../features/diagnosis/LowConfidenceScreen';
import { supabase } from '../../../lib/supabase';
import type { ScanStatus, Severity } from '../../../config/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'result'; data: DiagnosisData }
  | { kind: 'low_confidence'; scanId: string; imageUrl: string }
  | { kind: 'error'; message: string };

// ─── New scan controller ──────────────────────────────────────────────────────

/**
 * NewScanController — handles the `id === "new"` path.
 *
 * Runs `useDiagnosis` with the local image URI and transitions to the
 * appropriate screen once analysis completes.
 */
function NewScanController({ uri }: { uri: string }) {
  const router = useRouter();
  const { phase, data, errorMessage } = useDiagnosis(uri);
  const insets = useSafeAreaInsets();

  const handleScanAgain = useCallback(() => {
    router.replace('/(tabs)/scan');
  }, [router]);

  const handleRetake = useCallback(() => {
    router.replace('/(tabs)/scan');
  }, [router]);

  // ── Error state ────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={styles.errorTitle}>Analysis failed</Text>
        <Text style={styles.errorBody}>{errorMessage ?? 'Unknown error.'}</Text>
      </View>
    );
  }

  // ── Loading (uploading / analyzing) ───────────────────────────────────
  if (phase !== 'done' || !data) {
    return <AnalysisLoadingScreen imageUri={uri} phase={phase} />;
  }

  // ── Route on confidence ────────────────────────────────────────────────
  if (data.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return (
      <LowConfidenceScreen
        scanId={data.scanId}
        imageUrl={data.imageUrl}
        onRetake={handleRetake}
      />
    );
  }

  return <DiagnosisResultScreen data={data} onScanAgain={handleScanAgain} />;
}

// ─── Existing scan controller ─────────────────────────────────────────────────

/**
 * ExistingScanController — handles navigating to a previously completed scan.
 *
 * Fetches the scan row from Supabase and renders the appropriate result screen.
 * No loading animation is shown (we go straight to the result).
 */
function ExistingScanController({ scanId }: { scanId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: row, error } = await supabase
        .from('scans')
        .select('*')
        .eq('id', scanId)
        .single();

      if (cancelled) return;

      if (error || !row) {
        setState({ kind: 'error', message: error?.message ?? 'Scan not found.' });
        return;
      }

      const diagnosisData: DiagnosisData = {
        scanId: row.id,
        imageUrl: row.image_url,
        disease: row.diagnosis ?? 'Unknown',
        confidence: row.confidence ?? 0,
        treatment_steps: row.treatment_steps ?? [],
        severity: (row.severity as Severity) ?? 'low',
        status: row.status as ScanStatus,
      };

      if ((row.confidence ?? 0) < LOW_CONFIDENCE_THRESHOLD) {
        setState({ kind: 'low_confidence', scanId: row.id, imageUrl: row.image_url });
      } else {
        setState({ kind: 'result', data: diagnosisData });
      }
    }

    load();
    return () => { cancelled = true; };
  }, [scanId]);

  const handleScanAgain = useCallback(() => {
    router.replace('/(tabs)/scan');
  }, [router]);

  const handleRetake = useCallback(() => {
    router.replace('/(tabs)/scan');
  }, [router]);

  if (state.kind === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={styles.errorTitle}>Could not load scan</Text>
        <Text style={styles.errorBody}>{state.message}</Text>
      </View>
    );
  }

  if (state.kind === 'low_confidence') {
    return (
      <LowConfidenceScreen
        scanId={state.scanId}
        imageUrl={state.imageUrl}
        onRetake={handleRetake}
      />
    );
  }

  return (
    <DiagnosisResultScreen data={state.data} onScanAgain={handleScanAgain} />
  );
}

// ─── Route entry point ────────────────────────────────────────────────────────

/**
 * Root export for the `/scan-result/[id]` route.
 *
 * Delegates to `NewScanController` or `ExistingScanController`
 * based on whether `id === "new"`.
 */
export default function ScanResultRoute() {
  const { id, uri } = useLocalSearchParams<{ id: string; uri?: string }>();

  if (id === 'new') {
    if (!uri) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Missing image URI</Text>
        </View>
      );
    }
    return <NewScanController uri={uri} />;
  }

  return <ExistingScanController scanId={id} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: Colors.background,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
});
