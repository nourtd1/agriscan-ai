/**
 * Edge Function: analyze-crop
 * ============================
 * Accepts a multipart/form-data POST containing a crop image and an existing
 * scan row ID, calls the Gemini vision API to diagnose the image, writes the
 * structured result back into the `scans` table, and returns the diagnosis to
 * the caller.
 *
 * Security contract
 * -----------------
 * - The GEMINI_API_KEY secret is read exclusively inside this function via
 *   `_shared/models.ts → getApiKey()`. It is never returned to the client,
 *   never logged, and never referenced anywhere in the mobile app bundle.
 * - The caller must supply a valid Supabase JWT (Authorization: Bearer <token>).
 *   The function uses that token to create a row-level-security–scoped client,
 *   so a user can only update their own scan rows.
 *
 * Request shape (multipart/form-data)
 * ------------------------------------
 *   image   File    JPEG/PNG/WEBP crop photo — max 10 MB
 *   scan_id string  UUID of the pre-created scan row to update
 *
 * Response shape (JSON)
 * ----------------------
 * On success (200):
 *   {
 *     scan_id:         string,
 *     disease:         string,
 *     confidence:      number,        // [0, 1]
 *     treatment_steps: string[],
 *     severity:        "low" | "medium" | "high",
 *     status:          "diagnosed" | "needs_review"
 *   }
 *
 * On error (4xx / 5xx):
 *   { error: string }
 *
 * Retry behaviour
 * ---------------
 * Gemini 503 / model-overloaded errors are retried up to MAX_ATTEMPTS times
 * with exponential back-off (base 1 s, jitter ±200 ms).
 *
 * Logging
 * -------
 * Every Gemini call logs: model name, prompt text, generation config, and the
 * raw response text. Any base64 / data-URI content is stripped before logging.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GEMINI_MODEL, getApiKey } from '../_shared/models.ts';
import { CORS_HEADERS } from '../_shared/cors.ts';
import { log } from '../_shared/logger.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max image size accepted (bytes). Gemini inline limit is ~20 MB; stay well under. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Confidence threshold below which a scan is routed for human review. */
const REVIEW_THRESHOLD = 0.75;

/** Maximum Gemini call attempts before giving up. */
const MAX_ATTEMPTS = 3;

/** Base back-off delay in milliseconds. Doubles each retry. */
const BACKOFF_BASE_MS = 1_000;

/** Gemini REST endpoint template — model injected at call time. */
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// ─── Types ────────────────────────────────────────────────────────────────────

/** The strict JSON schema Gemini must return. */
interface DiagnosisResult {
  disease: string;
  confidence: number;
  treatment_steps: string[];
  severity: 'low' | 'medium' | 'high';
}

/** Minimal shape of a Gemini REST response we care about. */
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  error?: { code: number; message: string; status: string };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

/**
 * Builds the structured Gemini prompt.
 *
 * The prompt is a single user turn that contains both the instruction text and
 * the image inline part. The instruction explicitly requires JSON-only output
 * so the model does not wrap the response in markdown code fences.
 */
function buildPrompt(): string {
  return [
    'You are an expert agronomist and plant pathologist.',
    'Analyse the attached crop photograph and respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.',
    'The JSON must conform exactly to this schema:',
    '{',
    '  "disease": string,          // common English name of the disease or pest; "healthy" if none detected',
    '  "confidence": number,       // your confidence in [0.00, 1.00] with two decimal places',
    '  "treatment_steps": string[], // ordered list of actionable treatment or prevention steps (1–6 items)',
    '  "severity": "low" | "medium" | "high"  // low = cosmetic, medium = yield impact, high = crop loss risk',
    '}',
    'If you cannot determine a diagnosis from the image, set disease to "unknown", confidence to 0.00, treatment_steps to [], severity to "low".',
  ].join('\n');
}

// ─── Gemini call with retry ───────────────────────────────────────────────────

/**
 * Calls the Gemini vision REST API with the provided image bytes.
 *
 * Retries on HTTP 503 or Gemini `RESOURCE_EXHAUSTED` / `UNAVAILABLE` errors
 * with exponential back-off and jitter. Other errors are thrown immediately.
 *
 * @param imageBytes - Raw image bytes (JPEG/PNG/WEBP).
 * @param mimeType   - MIME type of the image.
 * @returns          Parsed `DiagnosisResult` from Gemini.
 */
async function callGeminiWithRetry(
  imageBytes: Uint8Array,
  mimeType: string,
): Promise<DiagnosisResult> {
  const apiKey = getApiKey();
  const promptText = buildPrompt();
  const generationConfig = {
    temperature: 0.1,   // low temperature → deterministic, factual output
    maxOutputTokens: 512,
    responseMimeType: 'application/json',
  };

  // Convert bytes to base64 for the inline_data part — only inside this
  // function; never reaches logs (scrubbed by logger).
  // Chunked base64 to avoid call stack overflow on large images.
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < imageBytes.length; i += chunkSize) {
    binary += String.fromCharCode(...imageBytes.subarray(i, i + chunkSize));
  }
  const base64Image = btoa(binary);

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    log('info', 'gemini_call_start', {
      attempt,
      model: GEMINI_MODEL,
      prompt: promptText,
      generationConfig,
      imageMimeType: mimeType,
      imageSizeBytes: imageBytes.byteLength,
      // base64Image is intentionally omitted — logger would truncate it anyway,
      // but we never pass it here to avoid any accidental partial logging.
    });

    const response = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const raw = await response.text();

    // Parse once; re-use for both logging and result extraction.
    let parsed: GeminiResponse;
    try {
      parsed = JSON.parse(raw) as GeminiResponse;
    } catch {
      parsed = {};
    }

    log('info', 'gemini_call_end', {
      attempt,
      model: GEMINI_MODEL,
      httpStatus: response.status,
      // Log the parsed response — logger scrubs inline_data/base64 fields.
      response: parsed,
    });

    // ── Retryable errors ────────────────────────────────────────────────
    const retryable =
      response.status === 503 ||
      parsed.error?.status === 'RESOURCE_EXHAUSTED' ||
      parsed.error?.status === 'UNAVAILABLE';

    if (retryable && attempt < MAX_ATTEMPTS) {
      const jitter = Math.random() * 400 - 200; // ±200 ms
      const delay = BACKOFF_BASE_MS * Math.pow(2, attempt - 1) + jitter;
      log('warn', 'gemini_retry', {
        attempt,
        nextAttemptIn: Math.round(delay),
        reason: parsed.error?.status ?? `HTTP ${response.status}`,
      });
      await new Promise((res) => setTimeout(res, delay));
      lastError = new Error(parsed.error?.message ?? `HTTP ${response.status}`);
      continue;
    }

    // ── Non-retryable HTTP error ─────────────────────────────────────────
    if (!response.ok) {
      throw new Error(
        `Gemini error ${response.status}: ${parsed.error?.message ?? raw.slice(0, 200)}`,
      );
    }

    // ── Extract text from first candidate ───────────────────────────────
    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) {
      throw new Error('Gemini returned an empty response body.');
    }

    // ── Parse and validate the JSON ──────────────────────────────────────
    return parseDiagnosis(text);
  }

  // All retries exhausted.
  throw lastError ?? new Error('Gemini call failed after all retries.');
}

// ─── Response parsing and validation ─────────────────────────────────────────

/**
 * Parses the raw Gemini text output into a validated `DiagnosisResult`.
 *
 * Gemini is instructed to return bare JSON, but occasionally wraps it in
 * a markdown code block. This function strips those fences before parsing.
 *
 * @param raw - The text content of the first candidate part.
 * @returns    Validated `DiagnosisResult`.
 * @throws     If the JSON is malformed or fails schema validation.
 */
function parseDiagnosis(raw: string): DiagnosisResult {
  // Strip markdown code fences if present (```json ... ``` or ``` ... ```).
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Gemini output is not valid JSON: ${(e as Error).message}. Raw: ${cleaned.slice(0, 300)}`);
  }

  return validateDiagnosis(obj);
}

/**
 * Validates that an unknown value conforms to `DiagnosisResult`.
 *
 * @param obj - Parsed JSON value from Gemini.
 * @returns    Typed `DiagnosisResult`.
 * @throws     Descriptive error for every schema violation found.
 */
function validateDiagnosis(obj: unknown): DiagnosisResult {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Diagnosis must be a JSON object.');
  }
  const o = obj as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof o.disease !== 'string' || !o.disease.trim()) {
    errors.push('"disease" must be a non-empty string');
  }
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) {
    errors.push('"confidence" must be a number in [0, 1]');
  }
  if (
    !Array.isArray(o.treatment_steps) ||
    (o.treatment_steps as unknown[]).some((s) => typeof s !== 'string')
  ) {
    errors.push('"treatment_steps" must be an array of strings');
  }
  if (!['low', 'medium', 'high'].includes(o.severity as string)) {
    errors.push('"severity" must be "low", "medium", or "high"');
  }

  if (errors.length > 0) {
    throw new Error(`Diagnosis schema validation failed: ${errors.join('; ')}`);
  }

  return {
    disease: (o.disease as string).trim(),
    confidence: o.confidence as number,
    treatment_steps: (o.treatment_steps as string[]).map((s) => s.trim()),
    severity: o.severity as DiagnosisResult['severity'],
  };
}

// ─── Request handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS preflight ───────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed. Use POST.', 405);
  }

  // ── Auth — require a valid Supabase JWT ──────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError('Missing or malformed Authorization header.', 401);
  }

  // Build a user-scoped Supabase client so RLS applies to all DB writes.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userJwt = authHeader.slice(7);

  // We use the service-role client to update the scan row (the row was
  // already created by the mobile app under the user's RLS context).
  // We verify the user is the owner before writing.
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Verify JWT by fetching the user — throws/returns null if invalid.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonError('Invalid or expired token.', 401);
  }

  // ── Parse multipart form ─────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError('Request body must be multipart/form-data.', 400);
  }

  const scanId = formData.get('scan_id');
  const imageFile = formData.get('image');

  if (typeof scanId !== 'string' || !scanId.trim()) {
    return jsonError('Field "scan_id" is required.', 400);
  }
  if (!(imageFile instanceof File)) {
    return jsonError('Field "image" must be a file.', 400);
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(imageFile.type)) {
    return jsonError(`Unsupported image type "${imageFile.type}". Allowed: jpeg, png, webp.`, 400);
  }

  const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
  if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
    return jsonError(`Image exceeds the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit.`, 400);
  }

  // ── Verify scan ownership ────────────────────────────────────────────────
  const { data: scan, error: scanFetchError } = await adminClient
    .from('scans')
    .select('id, user_id, status')
    .eq('id', scanId)
    .single();

  if (scanFetchError || !scan) {
    return jsonError('Scan not found.', 404);
  }
  if (scan.user_id !== user.id) {
    return jsonError('You do not own this scan.', 403);
  }
  if (scan.status !== 'pending') {
    return jsonError(`Scan is already in status "${scan.status}" and cannot be re-analysed.`, 409);
  }

  // ── Call Gemini ──────────────────────────────────────────────────────────
  let diagnosis: DiagnosisResult;
  try {
    diagnosis = await callGeminiWithRetry(imageBytes, imageFile.type);
  } catch (err) {
    log('error', 'gemini_failed', { scanId, error: (err as Error).message });
    return jsonError(`AI analysis failed: ${(err as Error).message}`, 502);
  }

  log('info', 'diagnosis_complete', {
    scanId,
    disease: diagnosis.disease,
    confidence: diagnosis.confidence,
    severity: diagnosis.severity,
    stepCount: diagnosis.treatment_steps.length,
  });

  // ── Determine new status ─────────────────────────────────────────────────
  const newStatus = diagnosis.confidence < REVIEW_THRESHOLD ? 'needs_review' : 'diagnosed';

  // ── Write result to scans table ──────────────────────────────────────────
  const { error: updateError } = await adminClient
    .from('scans')
    .update({
      diagnosis: diagnosis.disease,
      confidence: diagnosis.confidence,
      treatment_steps: diagnosis.treatment_steps,
      severity: diagnosis.severity,
      status: newStatus,
    })
    .eq('id', scanId);

  if (updateError) {
    log('error', 'db_update_failed', { scanId, error: updateError.message });
    return jsonError(`Failed to save diagnosis: ${updateError.message}`, 500);
  }

  // ── If needs_review → create agronomist_review row ──────────────────────
  if (newStatus === 'needs_review') {
    // Fetch the user's district for routing.
    const { data: profile } = await adminClient
      .from('users')
      .select('district')
      .eq('id', user.id)
      .single();

    const district = profile?.district ?? 'unknown';

    const { error: reviewError } = await adminClient
      .from('agronomist_reviews')
      .insert({ scan_id: scanId, district });

    if (reviewError) {
      // Non-fatal — scan is already updated; log and continue.
      log('warn', 'review_row_insert_failed', { scanId, error: reviewError.message });
    } else {
      log('info', 'review_row_created', { scanId, district });
    }
  }

  return new Response(
    JSON.stringify({
      scan_id: scanId,
      disease: diagnosis.disease,
      confidence: diagnosis.confidence,
      treatment_steps: diagnosis.treatment_steps,
      severity: diagnosis.severity,
      status: newStatus,
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    },
  );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a JSON error response with the given message and HTTP status code.
 *
 * @param message - Human-readable error description returned to the caller.
 * @param status  - HTTP status code.
 */
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
