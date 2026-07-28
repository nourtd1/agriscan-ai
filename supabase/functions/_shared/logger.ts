/**
 * _shared/logger.ts — structured info/error logger for Edge Functions.
 *
 * All log lines are JSON objects written to stdout. Supabase captures
 * stdout as function logs visible in the dashboard.
 *
 * Binary-data scrubbing
 * ---------------------
 * Any field whose string value starts with "data:" (data-URI) or whose
 * key ends in "base64" is replaced with the placeholder "[binary removed]"
 * so image payloads never appear in logs.
 */

type LogLevel = 'info' | 'warn' | 'error';

/** Recursively scrub data-URIs and base64 fields from a plain object. */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8) return value; // guard against circular structures
  if (typeof value === 'string') {
    // data-URI (e.g. "data:image/jpeg;base64,...")
    if (value.startsWith('data:')) return '[binary removed]';
    // very long strings are likely raw base64 blobs
    if (value.length > 4096) return `[truncated, ${value.length} chars]`;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrub(v, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // keys like "inlineData", "base64", "imageBase64" → scrub
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

/**
 * Emits a structured JSON log line to stdout.
 *
 * @param level   - Severity level.
 * @param message - Human-readable summary.
 * @param data    - Optional key/value payload. Binary fields are scrubbed.
 */
export function log(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    level,
    message,
    ts: new Date().toISOString(),
    ...(data ? (scrub(data) as object) : {}),
  };
  console.log(JSON.stringify(entry));
}
