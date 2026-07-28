/**
 * _shared/cors.ts — CORS headers shared across all Edge Functions.
 *
 * Expo apps call functions directly from the device; the wildcard origin
 * is intentional for development. Tighten to your production domain before
 * shipping.
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;
