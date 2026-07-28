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

**Status:** complete — ethics section on result screen + onboarding + history + profile built

### Description

Human verification is integrated at two levels:

**Level 1 — Automatic server-side routing (Edge Function)**
Scans with confidence < 0.75 automatically get an `agronomist_reviews` row created and status set to `needs_review`. The farmer doesn't need to do anything.

**Level 2 — Voluntary farmer-initiated escalation (EthicsVerificationSection)**
Every result screen (confidence ≥ 0.60) shows an "Ethical AI & Human Verification" section below the treatment steps card. This gives the farmer agency to request human review even for high-confidence results.

**`EthicsVerificationSection` component** (`features/diagnosis/EthicsVerificationSection.tsx`):

| State | What is shown |
|---|---|
| `idle` | Banner + "Why human verification?" box + "Send to Local District Agronomist" button |
| `sending` | Button replaced with activity indicator |
| `pending` | Status card: amber dot + "Pending Agronomist Review" + sub-copy |
| `reviewed` | Status card: green dot + "Verified by Agronomist" |
| `error` | Inline error text with implicit retry (re-tap button) |

The banner border colour escalates with severity: amber for low/medium, red for high. This makes the nudge more prominent on the cases where human verification matters most.

**Supabase writes on send:**
1. `scans.status` → `"needs_review"`
2. `agronomist_reviews` INSERT with user's district

**Why inline, not a separate screen:** Requiring navigation to a dedicated "request review" screen would mean most farmers never use it. Inline placement guarantees every farmer sees the option without extra steps.

### Key decisions

- **`EthicsVerificationSection` derives its initial state from `currentStatus` prop.** When navigating to an existing scan that is already `needs_review` or `verified`, the correct state card is shown immediately without any extra fetch.
- **The "Why human verification?" explanation is always visible, not collapsed.** Transparency about AI limitations is the point; hiding it behind a disclosure would undermine the message.
- **TTS has no "Listen" button on `LowConfidenceScreen`.** Reading withheld content aloud would defeat the safety gate.

---

## 4. History

**Status:** complete

### Description

**File layout:**
```
features/history/
  useHistory.ts      — data hook: fetch all scans, client-side filter
  HistoryScreen.tsx  — filterable list UI
app/(tabs)/history/index.tsx — re-export
```

**Filter tabs** (horizontal pill strip at top):

| Tab | Filter logic |
|---|---|
| All | All statuses |
| Healthy | `status == "diagnosed"` AND `diagnosis == "healthy"` |
| Needs Review | `status in ["needs_review", "pending"]` |
| Verified | `status == "verified"` |

Filtering is client-side — all scans are fetched once and filtered in JS. This avoids multiple round-trips and allows instant tab switching.

**Scan card layout:**
- 72×72 thumbnail (crop photo) with a severity colour dot overlay
- Disease name (or status label if not yet diagnosed)
- Status badge: coloured dot + label (Pending / Diagnosed / Needs Review / Verified / Rejected)
- Date scanned
- Chevron → taps navigate to `/scan-result/<id>`

**Pull-to-refresh** wired to `useHistory.refresh()`.

**Empty state:** leaf emoji + bilingual copy when no scans match the active filter.

### Key decisions

- **No local SQLite/AsyncStorage.** All history data lives in Supabase. This keeps the data model simple and ensures consistency across devices. Offline support is a future iteration.
- **Client-side filtering.** For the expected volume (tens to low hundreds of scans per user), fetching all rows and filtering in JS is faster than multiple DB queries with different WHERE clauses.
- **`useRecentScans` (camera screen) and `useHistory` are separate hooks.** They have different shapes (recent = 5 items, history = all + filters). Merging them would add complexity for no benefit.

---

## 5. Internationalisation (i18n)

**Status:** complete

### Description

**Supported locales:**

| Code | Language | File |
|---|---|---|
| `en` | English | `locales/en.json` |
| `rw` | Kinyarwanda | `locales/rw.json` |
| `sw` | Kiswahili | `locales/sw.json` |
| `fr` | French | `locales/fr.json` |

**Engine:** `i18n-js` v4 (`I18n` class). Single instance in `features/i18n/i18n.ts`. `enableFallback = true` so missing keys fall through to English rather than crashing.

**Runtime switching:** `LocaleContext` (React context + provider) owns the active locale. Components call `useLocale()` to get `{ locale, setLocale, t }`. The `t(key, params?)` shorthand is a stable callback that rebinds when `locale` changes, triggering re-renders across the tree without prop-drilling.

**Initialisation order:**
1. Optimistic device locale from `expo-localization` (instant, no network).
2. Async load of `users.preferred_language` from Supabase on mount.
3. If the DB value is set and differs from device, it overrides (step 2 wins).

**Persistence:** `setLocale(code)` writes to `public.users.preferred_language` fire-and-forget. UI updates immediately; DB write happens in the background.

**Language selector:** `LanguageSelector` component — a row of four locale pills (EN / RW / SW / FR). Active pill: filled emerald-green. Inactive: ghost outline. Placed via `headerRight` in the tabs layout so it's accessible from every screen. Also usable inline on the Profile screen.

**String key structure:**
```
scan.*         — CameraScreen strings
history.*      — History tab
profile.*      — Profile tab
diagnosis.*    — Loading, result, TTS button labels, severity badges
low_confidence.* — Warning banner, explanation, action buttons
tts.*          — TTS not-supported message, spoken script template
language.*     — Locale pill labels
common.*       — Shared error strings
```

**RTL:** not implemented in this iteration. Kinyarwanda and Swahili are LTR. French is LTR. Add `I18nManager.forceRTL` if Arabic/Amharic support is added.

### Key decisions

- **Context, not global state.** `LocaleProvider` is the React tree's single locale owner. `i18n.locale` is mutated as a side effect of context state, not the other way around — this ensures React re-renders propagate correctly.
- **`t()` is a stable `useCallback`.** It rebinds on locale change, which is the only signal consumers need. Components don't import `i18n` directly.
- **All UI strings must go through `t()`.** Hardcoded strings in components are a lint violation (enforce with a custom ESLint rule when the project matures).
- **Loading sub-copy is always Kinyarwanda.** The `diagnosis.loading_sub` key is deliberately the complementary language (Kinyarwanda when locale is EN, English when locale is RW). This is intentional — the sub-copy is a secondary confirmation that the system is multilingual, not a translation of the primary copy.

---

## 6. Text-to-Speech (TTS)

**Status:** complete

### Description

**Library:** `expo-speech` — cross-platform, no extra native module setup required beyond the Expo managed workflow.

**Entry point:** `features/tts/useTTS(data, locale)` hook. Returns `{ isSpeaking, isSupported, speak, stop }`.

**Spoken script template** (from `tts.intro` in each locale file):
```
"Diagnosis result. Disease: {disease}. Confidence: {pct} percent.
 Severity: {severity}. Treatment steps: {step1}. {step2}. …"
```
Steps are joined with ". " so the TTS engine pauses naturally between them.

**Voice/language selection:** `LOCALE_SPEECH_LANG` maps locale codes to BCP-47 tags:

| Locale | BCP-47 tag |
|---|---|
| `en` | `en-US` |
| `rw` | `rw-RW` (no dedicated voice on most devices — OS falls back to default voice and reads phonetically) |
| `sw` | `sw-TZ` |
| `fr` | `fr-FR` |

The phonetic fallback for Kinyarwanda is an acceptable degradation. The text is still spoken in the correct sequence; the pronunciation will not be perfect, but the content is correct. A native Kinyarwanda TTS voice would require an off-device API.

**UI affordance:** `TTSButton` is a floating pill anchored `position: absolute` at `bottom + 16`, `right: 20` — it hovers over the `ScrollView` content without participating in the scroll layout. Idle state: emerald-green fill ("Listen 🔊"). Speaking state: amber fill ("Stop 🔇"). Hidden if `isSupported === false`.

**Lifecycle:**
- Playback stops when the component unmounts (navigation away).
- Double-tap: tapping while speaking calls `stop()` immediately.
- `onDone / onError / onStopped` callbacks all reset `isSpeaking` to false.

### Key decisions

- **`useTTS` is locale-aware.** The hook receives `locale` as a parameter (not read from context internally) so it stays a pure function of its inputs and is easy to test.
- **Rate 0.92.** Slightly slower than the system default (1.0) for clarity in field conditions (outdoor ambient noise, non-native speakers).
- **Script is built from i18n templates.** The `tts.intro` key in each locale file controls the spoken structure. Changing the script format for one language does not require touching the hook code.
- **TTS button is inside `DiagnosisResultScreen`, not the route controller.** The low-confidence screen deliberately has no TTS button — reading a withheld diagnosis aloud would defeat the safety gate.

---

## 7. Onboarding

**Status:** complete

### Description

Three-screen linear flow: Welcome → Language → Camera Permission.

```
app/(onboarding)/
  index.tsx       → WelcomeScreen
  language.tsx    → LanguageSelectScreen
  permission.tsx  → CameraPermissionScreen

features/onboarding/
  WelcomeScreen.tsx
  LanguageSelectScreen.tsx
  CameraPermissionScreen.tsx
```

**WelcomeScreen**
- Deep emerald green full-screen background.
- Large 🌿 logo circle with frosted border.
- Bilingual subtitle: English primary + Kinyarwanda secondary.
- Decorative leaf emoji row.
- Accent-green "Get Started" button → navigates to language screen.

**LanguageSelectScreen**
- Large-target language cards (full row, not compact pills) — critical for low-literacy farmers who identify their language by flag + autonym rather than a 2-letter code.
- Each card: flag emoji + autonym (name in that language) + English name + check mark when selected.
- "Continue" button calls `setLocale(selected)` then navigates to permission screen.

**CameraPermissionScreen**
- Camera + leaf illustration.
- Explains why camera is needed (bilingual: English + Kinyarwanda).
- "Allow Camera Access" → `requestPermission()` → on grant, `router.replace('/(tabs)/scan')`.
- "Skip for now" → `router.replace('/(tabs)/scan')` without requesting (CameraScreen handles it).
- If permission was previously denied and `canAskAgain === false`: shows "Open Settings" instead of "Allow".

### Key decisions

- **Language is set during onboarding, before auth.** This means the app is localised from the first interaction, not after login.
- **No auth on onboarding screens.** Authentication is deferred to Supabase Auth (not yet built). The onboarding flow is intentionally auth-free so it can be previewed without a Supabase account.
- **`router.replace` (not `push`) from permission → scan.** This removes the onboarding stack from history so the back button doesn't return to onboarding after the app is set up.

---

## 8. Profile

**Status:** complete

### Description

**File:** `features/profile/ProfileScreen.tsx`  →  `app/(tabs)/profile/index.tsx`

Sections:
- **Signed in as** — displays the authenticated user's email.
- **Language** — `LanguageSelector` (full labels, not compact) wired to `useLocale`.
- **District** — `TextInput` with `onEndEditing` saving to `users.district`. Shows a ✓ tick on save and an activity indicator while saving.
- **Sign out** — calls `supabase.auth.signOut()`.
- **Version** — reads from `Constants.expoConfig.version`.

### Key decisions

- **District is saved on `onEndEditing`** (keyboard dismiss or return key) not on every keystroke. This avoids excessive DB writes while the user is still typing.
- **Sign-out is a local Supabase call** — no separate confirmation dialog for now. The navigation guard (not yet built) will redirect to onboarding on session loss.

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
