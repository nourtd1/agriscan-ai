/**
 * useDiagnosis — orchestrates the full scan-submission → analysis pipeline.
 *
 * Feature: Diagnosis
 * ------------------
 * Called by the loading screen as soon as it mounts. Responsible for:
 *  1. Uploading the captured image to Supabase Storage.
 *  2. Inserting a pending scan row so the Edge Function has a target to update.
 *  3. POSTing to the `analyze-crop` Edge Function with the image + scan ID.
 *  4. Returning the structured result (or error) to the caller.
 *
 * The hook exposes a simple state machine:
 *   idle → uploading → analyzing → done | error
 *
 * Use cases
 * ---------
 * - New capture from camera: imageUri is a local file:// URI.
 * - Gallery pick: imageUri is a ph:// or content:// URI on iOS/Android.
 * - Re-analysis is prevented by the Edge Function (409 if status ≠ pending).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Severity, ScanStatus } from '../../config/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiagnosisPhase = 'uploading' | 'analyzing' | 'done' | 'error';

export interface DiagnosisData {
  scanId: string;
  imageUrl: string;
  disease: string;
  confidence: number;
  treatment_steps: string[];
  severity: Severity;
  status: ScanStatus;
}

interface UseDiagnosisResult {
  phase: DiagnosisPhase;
  data: DiagnosisData | null;
  errorMessage: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Storage bucket that holds crop photos. Create this bucket in Supabase dashboard. */
const STORAGE_BUCKET = 'crop-images';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Runs the full upload → insert → Edge Function pipeline for a single image.
 *
 * @param imageUri - Local file URI from expo-camera or expo-image-picker.
 *                  Pass `null` to skip (e.g. when loading an existing scan by ID).
 */
export function useDiagnosis(imageUri: string | null): UseDiagnosisResult {
  const [phase, setPhase] = useState<DiagnosisPhase>('uploading');
  const [data, setData] = useState<DiagnosisData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Guard against double-invocation from React Strict Mode or hot reload.
  const hasRun = useRef(false);

  const run = useCallback(async (uri: string) => {
    try {
      // ── 1. Get authenticated user ──────────────────────────────────────
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated. Please sign in.');

      // Ensure a users profile row exists (needed for RLS on scans table).
      await supabase.from('users').upsert({ id: user.id }, { onConflict: 'id' });

      // ── 2. Upload image to Storage ────────────────────────────────────
      setPhase('uploading');

      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const storagePath = `${user.id}/${Date.now()}.${ext}`;

      // React Native: fetch the local file as ArrayBuffer for Supabase Storage upload.
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, arrayBuffer, { contentType: mimeType, upsert: false });

      if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);

      const { data: { publicUrl } } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      // ── 3. Insert pending scan row ────────────────────────────────────
      const { data: scanRow, error: insertError } = await supabase
        .from('scans')
        .insert({ user_id: user.id, image_url: publicUrl })
        .select('id')
        .single();

      if (insertError || !scanRow) throw new Error(`Failed to create scan: ${insertError?.message}`);

      // ── 4. Call Edge Function ─────────────────────────────────────────
      setPhase('analyzing');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired. Please log in again.');

      const formData = new FormData();
      formData.append('scan_id', scanRow.id);
      // React Native FormData accepts { uri, name, type } directly — no File constructor needed.
      formData.append('image', { uri, name: `crop.${ext}`, type: mimeType } as any);

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const fnResponse = await fetch(
        `${supabaseUrl}/functions/v1/analyze-crop`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        },
      );

      const result = await fnResponse.json();

      if (!fnResponse.ok) {
        throw new Error(result.error ?? `Analysis failed (HTTP ${fnResponse.status})`);
      }

      // ── 5. Done ───────────────────────────────────────────────────────
      setData({
        scanId: result.scan_id,
        imageUrl: publicUrl,
        disease: result.disease,
        confidence: result.confidence,
        treatment_steps: result.treatment_steps,
        severity: result.severity,
        status: result.status,
      });
      setPhase('done');
    } catch (err) {
      setErrorMessage((err as Error).message);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (!imageUri || hasRun.current) return;
    hasRun.current = true;
    run(imageUri);
  }, [imageUri, run]);

  return { phase, data, errorMessage };
}
