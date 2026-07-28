import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../config/database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Cast through unknown to avoid TypeScript generic inference failures with
// moduleResolution:node + @supabase/supabase-js v2 .d.mts declarations.
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
) as unknown as SupabaseClient<Database>;
