/**
 * analyze-crop — single-file build for Supabase Dashboard deployment.
 * Source of truth is the multi-file version in this directory.
 * Shared modules (_shared/cors.ts, logger.ts, models.ts) are inlined below.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── _shared/cors.ts ──────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

// ─── _shared/logger.ts ────────────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error';

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return '[binary removed]';
    if (value.length > 4096) return `[truncated, ${value.length} chars]`;
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/base64/i.test(k) || /inline.?data/i.test(k)) {
        out[k] = '[binary removed]';
      } else {
        out[k] = scrub(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry = {
    level,
    message,
    ts: new Date().toISOString(),
    ...(data ? (scrub(data) as object) : {}),
  };
  console.log(JSON.stringify(entry));
}

// ─── _shared/models.ts ────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-3.1-pro';

function getApiKey(): string {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) {
    throw new Error('GEMINI_API_KEY secret is not set.');
  }
  return key;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const REVIEW_THRESHOLD = 0.75;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1_000;
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiagnosisResult {
  disease: string;
  confidence: number;
  treatment_steps: string[];
  severity: 'low' | 'medium' | 'high';
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { code: number; message: string; status: string };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(): string {
  return [
    'You are an expert agronomist and plant pathologist.',
    'Analyse the attached crop photograph and respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.',
    'The JSON must conform exactly to this schema:',
    '{',
    '  "disease": string,           // common English name of the disease or pest; "healthy" if none detected',
    '  "confidence": number,        // your confidence in [0.00, 1.00] with two decimal places',
    '  "treatment_steps": string[], // ordered list of actionable treatment or prevention steps (1–6 items)',
    '  "severity": "low" | "medium" | "high"  // low = cosmetic, medium = yield impact, high = crop loss risk',
    '}',
    'If you cannot determine a diagnosis from the image, set disease to "unknown", confidence to 0.00, treatment_steps to [], severity to "low".',
  ].join('\n');
}

// ─── Gemini call with retry ───────────────────────────────────────────────────

async function callGeminiWithRetry(
  imageBytes: Uint8Array,
  mimeType: string,
): Promise<DiagnosisResult> {
  const apiKey = getApiKey();
  const promptText = buildPrompt();
  const generationConfig = {
    temperature: 0.1,
    maxOutputTokens: 512,
    responseMimeType: 'application/json',
  };

  const base64Image = btoa(String.fromCharCode(...imageBytes));

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          { inline_data: { mime_type: mimeType, data: base64Image } },
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
    });

    const response = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const raw = await response.text();
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
      response: parsed,
    });

    const retryable =
      response.status === 503 ||
      parsed.error?.status === 'RESOURCE_EXHAUSTED' ||
      parsed.error?.status === 'UNAVAILABLE';

    if (retryable && attempt < MAX_ATTEMPTS) {
      const jitter = Math.random() * 400 - 200;
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

    if (!response.ok) {
      throw new Error(
        `Gemini error ${response.status}: ${parsed.error?.message ?? raw.slice(0, 200)}`,
      );
    }

    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) throw new Error('Gemini returned an empty response body.');

    return parseDiagnosis(text);
  }

  throw lastError ?? new Error('Gemini call failed after all retries.');
}

// ─── Parsing & validation ─────────────────────────────────────────────────────

function parseDiagnosis(raw: string): DiagnosisResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `Gemini output is not valid JSON: ${(e as Error).message}. Raw: ${cleaned.slice(0, 300)}`,
    );
  }
  return validateDiagnosis(obj);
}

function validateDiagnosis(obj: unknown): DiagnosisResult {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Diagnosis must be a JSON object.');
  }
  const o = obj as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof o.disease !== 'string' || !o.disease.trim())
    errors.push('"disease" must be a non-empty string');
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1)
    errors.push('"confidence" must be a number in [0, 1]');
  if (
    !Array.isArray(o.treatment_steps) ||
    (o.treatment_steps as unknown[]).some((s) => typeof s !== 'string')
  )
    errors.push('"treatment_steps" must be an array of strings');
  if (!['low', 'medium', 'high'].includes(o.severity as string))
    errors.push('"severity" must be "low", "medium", or "high"');

  if (errors.length > 0)
    throw new Error(`Diagnosis schema validation failed: ${errors.join('; ')}`);

  return {
    disease: (o.disease as string).trim(),
    confidence: o.confidence as number,
    treatment_steps: (o.treatment_steps as string[]).map((s) => s.trim()),
    severity: o.severity as DiagnosisResult['severity'],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ─── Request handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonError('Method not allowed. Use POST.', 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError('Missing or malformed Authorization header.', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userJwt = authHeader.slice(7);

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonError('Invalid or expired token.', 401);
  }

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
    return jsonError(
      `Unsupported image type "${imageFile.type}". Allowed: jpeg, png, webp.`,
      400,
    );
  }

  const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
  if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
    return jsonError(`Image exceeds the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit.`, 400);
  }

  const { data: scan, error: scanFetchError } = await adminClient
    .from('scans')
    .select('id, user_id, status')
    .eq('id', scanId)
    .single();

  if (scanFetchError || !scan) return jsonError('Scan not found.', 404);
  if (scan.user_id !== user.id) return jsonError('You do not own this scan.', 403);
  if (scan.status !== 'pending') {
    return jsonError(
      `Scan is already in status "${scan.status}" and cannot be re-analysed.`,
      409,
    );
  }

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

  const newStatus = diagnosis.confidence < REVIEW_THRESHOLD ? 'needs_review' : 'diagnosed';

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

  if (newStatus === 'needs_review') {
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
