/**
 * scripts/seed-demo.ts — inserts 4 realistic demo scans into Supabase.
 *
 * Usage
 * -----
 *   npx tsx scripts/seed-demo.ts               # real insert
 *   npx tsx scripts/seed-demo.ts --dry-run     # log only, no DB writes
 *
 * Requirements
 * ------------
 *   .env must contain EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
 *   and SUPABASE_SERVICE_ROLE_KEY (seed uses service role to bypass RLS and
 *   insert on behalf of a demo user).
 *
 * Demo cases
 * ----------
 *   1. Healthy maize        — confidence 0.94, severity low,   status "diagnosed"
 *   2. Late Blight          — confidence 0.87, severity high,  status "needs_review"
 *   3. Powdery Mildew       — confidence 0.72, severity medium,status "diagnosed"
 *   4. Low-confidence brown — confidence 0.41, severity low,   status "needs_review"
 *
 * The seed uses a stable placeholder image URL (a publicly accessible Unsplash
 * crop photo) for all rows so the thumbnails render in the History screen without
 * requiring a real Storage bucket.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../config/database.types';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '❌  Missing env vars. Make sure .env contains:\n' +
    '    EXPO_PUBLIC_SUPABASE_URL\n' +
    '    SUPABASE_SERVICE_ROLE_KEY',
  );
  process.exit(1);
}

// ─── Supabase client (service role — bypasses RLS) ────────────────────────────

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Demo data ────────────────────────────────────────────────────────────────

/**
 * Stable public crop photo URLs used as placeholder thumbnails.
 * These are direct image URLs from Unsplash (free-to-use).
 */
const IMAGES = {
  healthyMaize:   'https://images.unsplash.com/photo-1601599561213-832382fd07ba?w=400&q=80',
  lateBlight:     'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=80',
  powderyMildew:  'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4e7?w=400&q=80',
  unknownBrown:   'https://images.unsplash.com/photo-1592982537447-6f2a6a0c7c10?w=400&q=80',
};

type SeedScan = {
  label: string;
  row: Database['public']['Tables']['scans']['Insert'];
};

/**
 * Builds the 4 demo scan rows.
 * `user_id` is set to a fixed demo UUID — replace with a real user ID if
 * you want the rows visible to a specific account.
 *
 * @param userId - UUID of the user to associate the demo scans with.
 */
function buildDemoScans(userId: string): SeedScan[] {
  const base = {
    user_id: userId,
    created_at: new Date().toISOString(),
  } as const;

  return [
    {
      label: '1 — Healthy maize (high confidence, diagnosed)',
      row: {
        ...base,
        image_url: IMAGES.healthyMaize,
        crop_type: 'Maize',
        diagnosis: 'healthy',
        confidence: 0.94,
        treatment_steps: [
          'No treatment needed.',
          'Continue regular watering schedule.',
          'Monitor for early signs of disease weekly.',
        ],
        severity: 'low',
        status: 'diagnosed',
      },
    },
    {
      label: '2 — Late Blight (high confidence, high severity → needs_review)',
      row: {
        ...base,
        image_url: IMAGES.lateBlight,
        crop_type: 'Potato',
        diagnosis: 'Late Blight (Phytophthora infestans)',
        confidence: 0.87,
        treatment_steps: [
          'Remove and destroy all visibly infected leaves and stems immediately.',
          'Apply copper-based fungicide (e.g. Bordeaux mixture) to all plants.',
          'Avoid overhead irrigation — water at soil level only.',
          'Improve airflow by spacing plants at least 50 cm apart.',
          'Repeat fungicide application every 7–10 days during wet weather.',
          'Do not compost infected material — burn or bury deeply.',
        ],
        severity: 'high',
        status: 'needs_review',
      },
    },
    {
      label: '3 — Powdery Mildew (medium confidence, medium severity, diagnosed)',
      row: {
        ...base,
        image_url: IMAGES.powderyMildew,
        crop_type: 'Bean',
        diagnosis: 'Powdery Mildew (Erysiphe spp.)',
        confidence: 0.72,
        treatment_steps: [
          'Remove heavily infected leaves and dispose of them away from the field.',
          'Apply a sulphur-based fungicide or neem oil spray.',
          'Ensure adequate spacing between plants to reduce humidity.',
          'Water in the morning so foliage dries during the day.',
        ],
        severity: 'medium',
        status: 'diagnosed',
      },
    },
    {
      label: '4 — Unknown brown lesions (low confidence → needs_review, safety gate)',
      row: {
        ...base,
        image_url: IMAGES.unknownBrown,
        crop_type: 'Sorghum',
        diagnosis: 'unknown',
        confidence: 0.41,
        treatment_steps: [],
        severity: 'low',
        status: 'needs_review',
      },
    },
  ];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌿  AgriScan AI — Demo Seed Script`);
  console.log(`    Mode: ${DRY_RUN ? '🔍  DRY RUN (no writes)' : '✍️   LIVE INSERT'}\n`);

  // Resolve demo user: use the first user in auth.users, or a fixed fallback UUID.
  let userId: string;
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id')
    .limit(1)
    .single();

  if (usersErr || !users) {
    // No users yet — use a deterministic demo UUID so the seed is idempotent.
    userId = '00000000-0000-0000-0000-000000000001';
    console.log(`⚠️  No users found in public.users. Using placeholder ID: ${userId}`);
    console.log('   The demo scans will not be visible until a real user with this ID exists.\n');
  } else {
    userId = users.id;
    console.log(`👤  Seeding scans for user: ${userId}\n`);
  }

  const demos = buildDemoScans(userId);

  for (const { label, row } of demos) {
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would insert: ${label}`);
      console.log(JSON.stringify(row, null, 2));
      console.log('');
      continue;
    }

    console.log(`  ➤  Inserting: ${label}`);
    const { data, error } = await supabase
      .from('scans')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.error(`     ❌  Failed: ${error.message}`);
    } else {
      console.log(`     ✅  Inserted — id: ${data?.id}`);
    }
  }

  console.log(`\n${DRY_RUN ? '🔍  Dry run complete — nothing written.' : '✅  Seed complete.'}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
