# AgriScan AI — Design Document

Skeleton of planned features. Fill in each section as the feature is built.

---

## 1. Scan

**Status:** in progress — `CameraScreen` built; diagnosis integration pending

### Description

The Scan tab is the primary entry point for crop-disease detection.

**UX flow:**
1. User opens the Scan tab → camera viewfinder fills the top portion of the screen.
2. A leaf-alignment guide box (semi-transparent dimmed surround + Soft Leaf Green corner accents + label "Frame the affected leaf") helps the farmer centre the affected plant part.
3. The farmer taps the large circular **"Scan Crop / Tanga Ifoto"** button. The button is elevated with a primary-green drop shadow and an accent-green outer ring.
4. Alternatively, **"Upload from Gallery"** opens the system image picker (single image, 1:1 crop, 0.85 quality).
5. Either path navigates to `/scan-result/[id]` with the image URI. The diagnosis screen owns the Gemini API call and Supabase write.
6. A horizontal thumbnail strip below the controls shows the 5 most-recent scans from Supabase (via `useRecentScans`). Amber badge on scans that are `needs_review`. Tapping a thumbnail navigates to its result screen.

**Permission handling:**
- Camera permission is gated by `useCameraPermissions` from `expo-camera`.
- Media-library permission is pre-requested on Android mount; iOS asks lazily.
- If camera is denied, `PermissionPrompt` is shown with a re-request button.

**Image capture constraints:**
- Quality: 0.85 (JPEG).
- Aspect ratio for gallery picker: 1:1.
- No video; microphone permission is explicitly disabled in `app.json`.

### Key decisions

- `CameraScreen.tsx` lives in `features/scan/` (not `app/`); the route file at `app/(tabs)/scan/index.tsx` is a one-line re-export. This keeps all business logic out of the router layer.
- `useRecentScans` is a standalone hook so it can be reused on the History tab without prop-drilling.
- Design tokens (colours) are imported from `config/colors.ts`; no raw hex strings in components.
- Bilingual capture button label ("Scan Crop / Tanga Ifoto") is hardcoded for now; will be replaced with the i18n system once that feature is built.

---

## 2. Diagnosis

**Status:** in progress — Edge Function + all mobile screens built; Auth/onboarding integration pending

### Description

Diagnosis is handled entirely server-side by the `analyze-crop` Supabase Edge Function. The mobile app never touches the Gemini API or the API key directly.

**Request flow:**

```
Mobile app (CameraScreen)
  │
  │  POST /functions/v1/analyze-crop
  │  Authorization: Bearer <user-JWT>
  │  Content-Type: multipart/form-data
  │  Fields: image (File), scan_id (UUID)
  │
  ▼
analyze-crop Edge Function (Deno)
  1. Validates JWT → identifies user
  2. Verifies scan.user_id == user.id and scan.status == "pending"
  3. Calls Gemini vision API (model: gemini-3.1-pro) with structured prompt
     ├── Retries up to 3× on 503 / RESOURCE_EXHAUSTED with exponential back-off
     └── Strips base64/binary from all log lines
  4. Validates strict JSON schema: { disease, confidence, treatment_steps, severity }
  5. Writes result to scans table (admin client bypasses RLS for the update)
  6. If confidence < 0.75 → sets status = "needs_review" and creates an
     agronomist_reviews row (district copied from users.district)
     Else → sets status = "diagnosed"
  7. Returns the diagnosis JSON to the caller
```

**Gemini prompt (abbreviated):**
> "You are an expert agronomist. Respond with ONLY a valid JSON object. Schema: `{disease: string, confidence: number [0,1], treatment_steps: string[], severity: 'low'|'medium'|'high'}`."

**Temperature:** 0.1 (deterministic factual output).
**Max output tokens:** 512.
**Response MIME type hint:** `application/json`.

**Retry policy:**
- Retryable conditions: HTTP 503, Gemini status `RESOURCE_EXHAUSTED` or `UNAVAILABLE`.
- Back-off: `1s × 2^(attempt-1) ± 200ms jitter`, up to 3 attempts.
- All other errors are thrown immediately (no retry).

**Logging (info level, JSON to stdout):**
- `gemini_call_start`: attempt number, model, prompt text, generation config, image MIME type, image size in bytes.
- `gemini_call_end`: attempt, model, HTTP status, parsed response object.
- `gemini_retry`: attempt, delay until next attempt, retry reason.
- `diagnosis_complete`: scan ID, disease, confidence, severity, step count.
- `review_row_created` / `review_row_insert_failed`: scan ID, district.
- `db_update_failed` / `gemini_failed`: error message.
- Binary scrubbing: any field starting with `"data:"`, any key matching `/base64/i` or `/inline.?data/i`, and strings longer than 4096 chars are replaced with `"[binary removed]"` or `"[truncated, N chars]"` before logging.

**File layout:**
```
supabase/functions/
  _shared/
    models.ts    — GEMINI_MODEL + getApiKey() (Deno-compatible mirror of config/models.ts)
    cors.ts      — shared CORS headers
    logger.ts    — structured JSON logger with binary scrubbing
  analyze-crop/
    index.ts     — request handler, Gemini call, DB write
```

**Mobile screen flow:**

```
app/scan-result/[id]  (route controller)
  │
  ├── id === "new" → NewScanController
  │     │
  │     ├── phase: uploading / analyzing
  │     │       → AnalysisLoadingScreen
  │     │           Full-screen crop photo + glowing green scanline animation
  │     │           Status: "Analyzing plant health with Gemini Vision AI…"
  │     │           Subtext in Kinyarwanda
  │     │           Phase indicator: "Uploading photo…" / "Running AI analysis…"
  │     │
  │     ├── phase: done, confidence ≥ 0.60
  │     │       → DiagnosisResultScreen
  │     │           Hero image + severity badge (green/amber/red pill)
  │     │           Disease name heading
  │     │           Confidence gauge (20 segments, colour-coded)
  │     │           Treatment steps card (numbered list)
  │     │           "Scan Again" button
  │     │
  │     └── phase: done, confidence < 0.60
  │             → LowConfidenceScreen  ← SAFETY GATE (see below)
  │
  └── id === "<uuid>" → ExistingScanController
        Fetches scan row from Supabase → same branching as above
        (no loading animation — result shown directly)
```

**Feature files:**
```
features/diagnosis/
  useDiagnosis.ts           — upload → insert scan → call Edge Function → return result
  AnalysisLoadingScreen.tsx — scanline animation, bilingual status copy
  DiagnosisResultScreen.tsx — hero, severity badge, confidence gauge, treatment card
  LowConfidenceScreen.tsx   — amber warning banner, retake + escalate actions
  index.ts                  — public re-exports
```

### ⚠ Safety gate: low-confidence threshold

**The `LowConfidenceScreen` is a deliberate patient-safety analogue for agriculture.**

When `confidence < 0.60` (60 %), the following are intentionally withheld:
- The disease name.
- The confidence percentage.
- All treatment steps.

**Why withheld, not just warned about:**

A warning banner alongside a visible diagnosis still anchors the farmer's
decision to the AI's guess. Research in decision-making under uncertainty
(anchoring bias) shows that people act on partially-disclosed information
even when told it may be wrong. A subsistence farmer who misapplies a
fungicide or pesticide based on a 45 % AI guess may:

1. Spend money on the wrong chemical.
2. Damage the crop further (e.g., applying a fungicide to a bacterial
   infection, or vice versa).
3. Build resistance in the pathogen population.
4. Lose the harvest — which, in a food-insecure household, is irreversible.

The threshold of 60 % was chosen because:
- The Edge Function already routes to human review at 75 % (the agronomist
  review queue exists for the 60–74 % grey zone).
- Below 60 %, the model is essentially guessing; no treatment plan derived
  from that guess should reach a farmer without expert sign-off.

**What the screen shows instead:**
- Amber banner: "AI confidence too low — recommendation withheld"
- Plain-language explanation + Kinyarwanda subline.
- **"Retake Photo"** — routes back to CameraScreen. Covers the most common
  cause: blurry photo, wrong crop part, poor lighting.
- **"Send Directly to Local Agronomist"** — creates an `agronomist_reviews`
  row and sets scan status to `needs_review`. A real agronomist will examine
  the original photo and provide a verified diagnosis.

**Threshold constants:**

| Constant | Value | Location | Meaning |
|---|---|---|---|
| `REVIEW_THRESHOLD` | 0.75 | Edge Function `analyze-crop/index.ts` | Server-side: below this, creates a review row |
| `LOW_CONFIDENCE_THRESHOLD` | 0.60 | `features/diagnosis/LowConfidenceScreen.tsx` | Client-side: below this, withholds diagnosis entirely |

The two thresholds are intentionally separate. The 0.75–1.00 range shows the
diagnosis AND queues it for passive agronomist review. The 0.60–0.74 range
shows the diagnosis but the review queue already exists. Below 0.60, nothing
is shown.

### Key decisions

- **API key never leaves the server.** `getApiKey()` in `_shared/models.ts` calls `Deno.env.get("GEMINI_API_KEY")`. The mobile app has no reference to the key whatsoever.
- **`_shared/models.ts` mirrors `config/models.ts`.** Edge Functions run Deno, not Node, so `process.env` is unavailable. Two separate files share the same model-name constant; both must be updated in sync when the model changes.
- **Service-role client for DB writes.** The function verifies JWT ownership first, then uses the service-role client to write the diagnosis — this is necessary because RLS only allows the user to update their own rows, but the function runs in a server context without the user's session cookie.
- **`needs_review` row created atomically.** If confidence < 0.75, the agronomist review row is inserted in the same function invocation. Failure is non-fatal (logged as warn); the scan is still marked `needs_review`.
- **`verify_jwt = true` in `config.toml`.** Unauthenticated calls are rejected at the Edge Function gateway level before our code runs.
- **Route controller, not screen, owns the threshold branch.** `app/scan-result/[id]/index.tsx` decides which screen to render. Neither `DiagnosisResultScreen` nor `LowConfidenceScreen` knows about the other — they are fully independent components. This makes the threshold easy to test in isolation.
- **Scanline uses `react-native-reanimated` worklets.** The sweep animation runs on the UI thread via `useSharedValue` + `withRepeat`, so it never drops frames while the JS thread is busy uploading/fetching.

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
| `confidence` | `numeric(5,4)` | Gemini confidence in [0, 1]; values below 0.75 trigger `needs_review` |
| `treatment_steps` | `text[]` | Ordered list of remediation steps returned by Gemini |
| `severity` | `text` | `low` / `medium` / `high`; null until analysed |
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
