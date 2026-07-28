# AgriScan AI — Design Document

Skeleton of planned features. Fill in each section as the feature is built.

---

## 1. Scan

**Status:** planned

### Description

<!-- How the camera screen works, UX flow, image capture constraints -->

### Key decisions

<!-- -->

---

## 2. Diagnosis

**Status:** planned

### Description

<!-- Gemini API call flow, prompt structure, response schema -->

### Key decisions

<!-- -->

---

## 3. Human Verification

**Status:** planned

### Description

<!-- When AI confidence is low, how the result is queued for expert review; status polling; notification -->

### Key decisions

<!-- -->

---

## 4. History

**Status:** planned

### Description

<!-- Local persistence (AsyncStorage / SQLite), list view, detail view, deletion -->

### Key decisions

<!-- -->

---

## 5. Internationalisation (i18n)

**Status:** planned

### Description

<!-- Locale detection strategy, translation file format (locales/*.json), RTL support -->

### Key decisions

<!-- -->

---

## 6. Text-to-Speech (TTS)

**Status:** planned

### Description

<!-- Which Expo/RN TTS library, playback controls, language matching with active locale -->

### Key decisions

<!-- -->

---

## Appendix: Non-feature decisions

<!-- Architecture, navigation structure, state management, testing strategy -->

---

## Data model

Supabase (PostgreSQL). Migrations live in `supabase/migrations/`. Types are hand-authored in `config/database.types.ts` until `supabase gen types` is wired into CI.

### `public.users`

Extends `auth.users`. Stores the fields the app needs beyond authentication.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | FK → `auth.users.id`, PK |
| `district` | `text` | Farmer's geographic district; used to route scans to the right agronomist pool |
| `preferred_language` | `text` | Drives i18n locale and TTS voice selection; defaults to `'en'` |
| `created_at` | `timestamptz` | |

**RLS:** users read/write only their own row.

---

### `public.scans`

Core entity — one row per photo submitted by a farmer.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` |
| `image_url` | `text` | Supabase Storage URL of the uploaded photo |
| `crop_type` | `text` | Detected or user-supplied crop name |
| `diagnosis` | `text` | Gemini's disease/pest diagnosis text |
| `confidence` | `numeric(5,4)` | Gemini confidence in [0, 1]; values below threshold trigger `needs_review` |
| `status` | `scan_status` enum | `pending → diagnosed → needs_review → verified / rejected` |
| `created_at` | `timestamptz` | |

**RLS:** farmers read, insert, update, and delete only their own scans.

---

### `public.agronomist_reviews`

Human-verification queue. Created when `scans.confidence` is below threshold.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `scan_id` | `uuid` | FK → `scans.id` |
| `agronomist_id` | `uuid` | FK → `auth.users.id`; null until a reviewer picks it up |
| `district` | `text` | Denormalised from `users.district` at insert time; keeps RLS fast without a join |
| `status` | `review_status` enum | `pending → in_progress → approved / rejected` |
| `notes` | `text` | Agronomist's written assessment |
| `created_at` | `timestamptz` | |

**RLS:**
- Scan owners can select reviews attached to their own scans.
- Agronomists can select **and update** reviews whose `district` matches their own `users.district`.

---

### Enum reference

| Enum | Values |
|---|---|
| `scan_status` | `pending`, `diagnosed`, `needs_review`, `verified`, `rejected` |
| `review_status` | `pending`, `in_progress`, `approved`, `rejected` |
