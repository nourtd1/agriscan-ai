/**
 * _shared/models.ts — Deno-compatible mirror of config/models.ts.
 *
 * Edge Functions run in the Deno runtime, which reads secrets via
 * `Deno.env.get()` instead of `process.env`. This file is the single
 * source of truth for AI model configuration inside the functions layer.
 *
 * Rule: no other Edge Function file may reference the model name string
 * or call `Deno.env.get("GEMINI_API_KEY")` directly.
 */

/** Gemini model used for all crop-diagnosis requests. */
export const GEMINI_MODEL = 'gemini-3.1-pro';

/**
 * Returns the Gemini API key from the function's environment secrets.
 * Throws immediately if the secret is absent so the error surfaces at
 * boot time, not buried inside a request handler.
 */
export function getApiKey(): string {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY secret is not set. ' +
        'Run: supabase secrets set GEMINI_API_KEY=<your-key>',
    );
  }
  return key;
}
