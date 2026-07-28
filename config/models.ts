// Single source of truth for AI model identifiers and API key access.
// No other file should reference the model name string or process.env.GEMINI_API_KEY directly.

export const GEMINI_MODEL = 'gemini-3.1-pro';

export function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set. Add it to your .env file.');
  }
  return key;
}
