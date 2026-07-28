# AgriScan AI — Design Document

All features built as of the final commit. Each section documents status, files, UX, and key decisions.

---

## 1. Scan

**Status:** complete

### Description

The Scan tab (`app/(tabs)/scan/`) is the primary entry point for crop-disease detection.

**UX flow:**
1. User opens the Scan tab → camera viewfinder fills the top portion of the screen.
2. A leaf-alignment guide box (semi-transparent dimmed surround + Soft Leaf Green corner accents + translated label) helps the farmer centre the affected plant part.
3. The farmer taps the large circular **"Scan Crop / Tanga Ifoto"** button (bilingual via i18n). The button is elevated with a primary-green drop shadow and an accent-green outer ring.
4. Alternatively, **"Upload from Gallery"** opens the system image picker (single image, 1:1 crop, 0.85 quality).
5. Either path navigates to `/scan-result/[id]?uri=<local-uri>`. The diagnosis screen owns the Gemini API call and Supabase write.
6. A horizontal thumbnail strip below the controls shows the 5 most-recent scans from Supabase (via `useRecentScans`). Amber badge on scans that are `needs_review`. Tapping a thumbnail navigates to its result screen.

**Permission handling:**
- Camera permission is gated by `useCameraPermissions` from `expo-camera`.
- Media-library permission is pre-requested on Android mount; iOS asks lazily.
- If camera is denied, `PermissionPrompt` is shown with a re-request button.

**Image capture constraints:**
- Quality: 0.85 (JPEG).
- Aspect ratio for gallery picker: 1:1.
- No video; microphone permission explicitly disabled in `app.json`.

**File layout:**
```
features/scan/
  CameraScreen.tsx    — full camera screen component
  useRecentScans.ts   — hook: fetches last 5 scans for thumbnail strip
app/(tabs)/scan/index.tsx — re-export
```

### Key decisions

- `CameraScreen.tsx` lives in `features/scan/` (not `app/`); the route file is a one-line re-export. Business logic stays out of the router layer.
- All visible strings go through `useLocale().t()` — guide label, gallery button, capture label, recent scans strip.
- `useRecentScans` is isolated so the History tab can share the pattern without prop-drilling.
- Design tokens imported from `config/colors.ts`; no raw hex strings in components.

---

## 2. Diagnosis

**Status:** complete

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
  5. Writes result to scans table (service-role client bypasses RLS for the update)
  6. If confidence < 0.75 → sets status = "needs_review" + creates agronomist_reviews row
     Else → sets status = "diagnosed"
  7. Returns the diagnosis JSON to the caller
```

**Gemini prompt:** instructs the model to return only bare JSON with schema `{disease, confidence, treatment_steps, severity}`. Temperature 0.1, max 512 tokens, `responseMimeType: "application/json"`.

**Retry policy:** HTTP 503 / `RESOURCE_EXHAUSTED` / `UNAVAILABLE` → up to 3 attempts, base 1s backoff × 2^attempt ± 200ms jitter.

**Logging (structured JSON to stdout, binary-scrubbed):** `gemini_call_start`, `gemini_call_end`, `gemini_retry`, `diagnosis_complete`, `review_row_created`, `db_update_failed`, `gemini_failed`.

**Mobile screen flow:**

```
app/scan-result/[id]  (route controller)
  │
  ├── id === "new" + uri= → NewScanController → useDiagnosis
  │     ├── phase uploading/analyzing → AnalysisLoadingScreen
  │     │     Full-screen photo + glowing green scanline (reanimated worklet)
  │     │     "Analyzing plant health with Gemini Vision AI…" (i18n)
  │     │     Kinyarwanda subtext (always shown regardless of locale)
  │     │
  │     ├── done, confidence ≥ 0.60 → DiagnosisResultScreen
  │     │     Hero image + severity badge, disease heading,
  │     │     confidence gauge (20 segments), treatment steps card,
  │     │     EthicsVerificationSection, Scan Again button,
  │     │     floating TTS "Listen 🔊" pill (expo-speech)
  │     │
  │     └── done, confidence < 0.60 → LowConfidenceScreen ← SAFETY GATE
  │           Amber banner, explanation (EN + RW), Retake + Send to Agronomist
  │
  └── id === "<uuid>" → ExistingScanController
        Fetches row from Supabase → same confidence branch, no loading animation
```

**Feature files:**
```
features/diagnosis/
  useDiagnosis.ts              — upload → insert scan → Edge Function → result
  AnalysisLoadingScreen.tsx    — scanline animation, bilingual status copy
  DiagnosisResultScreen.tsx    — hero, gauge, treatment, ethics section, TTS button
  EthicsVerificationSection.tsx— inline ethics + agronomist escalation card
  LowConfidenceScreen.tsx      — safety gate: withholds diagnosis + treatment
  index.ts                     — public re-exports
supabase/functions/
  _shared/models.ts cors.ts logger.ts
  analyze-crop/index.ts + index.dashboard.ts (single-file Dashboard build)
```

### ⚠ Safety gate: low-confidence threshold

When `confidence < 0.60`, the disease name, confidence %, and treatment steps are **entirely absent** from the UI tree — not hidden, not greyed. Anchoring bias means visible-but-warned numbers still drive decisions. A wrong fungicide on a bacterial infection, or vice versa, can destroy a subsistence crop.

| Constant | Value | Owner | Effect |
|---|---|---|---|
| `REVIEW_THRESHOLD` | 0.75 | Edge Function | Server auto-creates review row |
| `LOW_CONFIDENCE_THRESHOLD` | 0.60 | `LowConfidenceScreen.tsx` | Client withholds all diagnosis output |

### Key decisions

- API key read-only inside Edge Function via `Deno.env.get("GEMINI_API_KEY")`. Never in the app bundle.
- `_shared/models.ts` is a Deno-compatible mirror of `config/models.ts` (uses `Deno.env.get` not `process.env`). Both must be updated together when the model changes.
- Service-role client for DB writes. Ownership check happens first; then the admin client performs the update outside RLS.
- Route controller (`app/scan-result/[id]/index.tsx`) owns all confidence branching. Each result screen is independent and unaware of the others.
- Scanline animation runs on the UI thread via `useSharedValue` + `withRepeat` — never drops frames during upload.

---

## 3. Human Verification

**Status:** complete

### Description

Two-level integration:

**Level 1 — Automatic (Edge Function):** confidence < 0.75 → `agronomist_reviews` row auto-created + status → `needs_review`.

**Level 2 — Voluntary (EthicsVerificationSection):** every high-confidence result screen shows an inline verification card. States:

| State | UI |
|---|---|
| `idle` | Amber/red banner + "Why human verification?" box + send button |
| `sending` | Activity indicator |
| `pending` | Amber dot status card: "Pending Agronomist Review" |
| `reviewed` | Green dot status card: "Verified by Agronomist" |
| `error` | Inline error text |

Banner border: amber for low/medium severity, red for high. Initial state derived from `currentStatus` prop — no extra fetch needed when loading an existing scan.

**Supabase writes on send:** `scans.status → "needs_review"` + `agronomist_reviews INSERT`.

### Key decisions

- Inline, not a separate screen — friction kills adoption of optional safety features.
- "Why human verification?" is always visible — transparency is the product, not a footnote.
- No TTS on `LowConfidenceScreen` — reading withheld content aloud defeats the safety gate.

---

## 4. History

**Status:** complete

### Description

**Files:** `features/history/useHistory.ts`, `HistoryScreen.tsx` → `app/(tabs)/history/index.tsx`

Filter tabs (client-side, instant switching):

| Tab | Logic |
|---|---|
| All | All statuses |
| Healthy | `status == "diagnosed"` AND `diagnosis == "healthy"` |
| Needs Review | `status in ["needs_review", "pending"]` |
| Verified | `status == "verified"` |

Scan card: 72px thumbnail + severity colour dot + disease name + status badge (coloured dot + label) + date. Pull-to-refresh. Empty state with leaf emoji + bilingual copy.

### Key decisions

- All history in Supabase — no local SQLite. Consistent across devices; offline support is a future iteration.
- Client-side filtering — one fetch, instant tab switching for expected scan volumes.
- `useHistory` and `useRecentScans` are separate hooks with different shapes — no shared abstraction.

---

## 5. Internationalisation (i18n)

**Status:** complete

**Supported locales:** `en` (English), `rw` (Kinyarwanda), `sw` (Kiswahili), `fr` (French).

**Engine:** `i18n-js` v4. Single instance in `features/i18n/i18n.ts`. `enableFallback = true`.

**`LocaleContext`** owns active locale. `useLocale()` → `{ locale, setLocale, t }`. `t()` is a stable `useCallback` that rebinds on locale change. `setLocale` persists to `users.preferred_language` fire-and-forget.

**Init order:** device locale (instant) → Supabase `preferred_language` override (async).

**`LanguageSelector`** component: 4 locale pills, compact mode for headers, full-label mode for Profile. Placed in `headerRight` of every tab so it's reachable from any screen.

**String key namespaces:** `scan.*`, `history.*`, `profile.*`, `onboarding.*`, `diagnosis.*`, `low_confidence.*`, `ethics.*`, `tts.*`, `language.*`, `common.*`.

**Files:** `features/i18n/i18n.ts`, `LocaleContext.tsx`, `LanguageSelector.tsx`, `index.ts` · `locales/{en,rw,sw,fr}.json`

### Key decisions

- Context, not global state — `i18n.locale` mutated as side-effect of React state, not the source of truth.
- All visible strings go through `t()`. Hardcoded strings are a defect.
- `diagnosis.loading_sub` is always Kinyarwanda regardless of active locale — intentional secondary-language signal, not a translation of the primary copy.

---

## 6. Text-to-Speech (TTS)

**Status:** complete

**Library:** `expo-speech`. **Hook:** `features/tts/useTTS(data, locale)` → `{ isSpeaking, isSupported, speak, stop }`.

**Script template** (`tts.intro` in each locale): `"Diagnosis result. Disease: {disease}. Confidence: {pct} percent. Severity: {severity}. Treatment steps: {steps}"`. Steps joined with ". " for natural pauses.

**Voice selection:** BCP-47 tags — `en-US`, `rw-RW` (phonetic fallback), `sw-TZ`, `fr-FR`.

**`TTSButton`:** floating pill, `position: absolute`, `bottom + 16`, `right: 20` — hovers over ScrollView. Idle: emerald "Listen 🔊". Speaking: amber "Stop 🔇". Hidden if `isSupported === false`. No TTS on `LowConfidenceScreen`.

**Lifecycle:** stops on unmount, double-tap toggles off, `onDone/onError/onStopped` all reset state.

**Files:** `features/tts/useTTS.ts`, `index.ts`

---

## 7. Onboarding

**Status:** complete

Three-screen linear flow: Welcome → Language → Camera Permission.

**WelcomeScreen:** deep emerald background, 🌿 logo circle, bilingual subtitle, leaf row, accent-green "Get Started" CTA.

**LanguageSelectScreen:** large card per language (flag + autonym + English name + check mark). Full-row targets for low-literacy farmers. Calls `setLocale(selected)` on Continue.

**CameraPermissionScreen:** camera + leaf illustration, bilingual explanation, `requestPermission()` → `router.replace('/(tabs)/scan')`. `canAskAgain === false` → "Open Settings". Skip navigates without requesting.

**Files:** `features/onboarding/{Welcome,LanguageSelect,CameraPermission}Screen.tsx` · `app/(onboarding)/{index,language,permission}.tsx`

### Key decisions

- Language set before auth — app is localised from first interaction.
- No auth gates on onboarding screens.
- `router.replace` (not `push`) from permission screen — removes onboarding from back-stack.

---

## 8. Profile

**Status:** complete

**File:** `features/profile/ProfileScreen.tsx` → `app/(tabs)/profile/index.tsx`

Sections: signed-in email, `LanguageSelector` (full labels), district `TextInput` (saves on blur, ✓ tick), sign-out, app version.

### Key decisions

- District saved on `onEndEditing` — avoids write-on-every-keystroke.
- Sign-out calls `supabase.auth.signOut()` directly; navigation guard (future) handles redirect to onboarding.

---

## 9. Demo Seed

**Status:** complete

**File:** `scripts/seed-demo.ts`

Inserts 4 realistic demo scans using the service-role client (bypasses RLS). Gated behind `--dry-run` flag.

```bash
npm run seed:dry    # log inserts, no DB writes
npm run seed        # live insert into Supabase
```

**Demo cases:**

| # | Crop | Disease | Confidence | Severity | Status |
|---|---|---|---|---|---|
| 1 | Maize | healthy | 0.94 | low | diagnosed |
| 2 | Potato | Late Blight | 0.87 | high | needs_review |
| 3 | Bean | Powdery Mildew | 0.72 | medium | diagnosed |
| 4 | Sorghum | unknown | 0.41 | low | needs_review |

Cases 2 and 4 exercise the `needs_review` branch. Case 4 (confidence 0.41) exercises the `LowConfidenceScreen` safety gate. Case 1 exercises the "Healthy" filter tab in History.

### Key decisions

- Uses service-role key (never `anon` key) to write on behalf of any user.
- Detects first user in `public.users` automatically; falls back to a fixed placeholder UUID.
- Stable Unsplash URLs for thumbnails so History renders correctly without a real Storage bucket.

---

## Appendix: Architecture decisions

**Route-feature separation.** Every `app/` route file is a thin re-export of a component in `features/`. Business logic never lives in the router layer.

**Design tokens.** All colours in `config/colors.ts`. All model/key config in `config/models.ts` (Node) and `supabase/functions/_shared/models.ts` (Deno). No raw strings elsewhere.

**RLS everywhere.** Every Supabase table has RLS enabled with explicit policies. The service-role client is only used in the Edge Function and seed script — never in the mobile app.

**Navigation contract.** `router.push` for drill-down (camera → result). `router.replace` from terminal screens (permission → scan, result "Scan Again" → scan). This keeps the back-stack clean.

---

## Data model

Supabase (PostgreSQL). Migrations in `supabase/migrations/`. Types hand-authored in `config/database.types.ts`.

### `public.users`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | FK → `auth.users.id`, PK |
| `district` | `text` | Routes scans to the correct agronomist pool |
| `preferred_language` | `text` | Drives i18n locale + TTS voice; defaults `'en'` |
| `created_at` | `timestamptz` | |

RLS: own-row read/write only.

### `public.scans`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` |
| `image_url` | `text` | Supabase Storage public URL |
| `crop_type` | `text` | Detected or user-supplied |
| `diagnosis` | `text` | Gemini disease name; `"healthy"` if no disease |
| `confidence` | `numeric(5,4)` | [0,1]; < 0.75 → auto review row |
| `treatment_steps` | `text[]` | Ordered remediation steps |
| `severity` | `text` | `low` / `medium` / `high` |
| `status` | `scan_status` enum | `pending → diagnosed → needs_review → verified / rejected` |
| `created_at` | `timestamptz` | |

RLS: own-row CRUD only.

### `public.agronomist_reviews`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `scan_id` | `uuid` | FK → `scans.id` |
| `agronomist_id` | `uuid` | FK → `auth.users.id`; null until claimed |
| `district` | `text` | Denormalised from `users.district` for fast RLS |
| `status` | `review_status` enum | `pending → in_progress → approved / rejected` |
| `notes` | `text` | Agronomist's written assessment |
| `created_at` | `timestamptz` | |

RLS: scan owners select own; agronomists select + update by matching district.

### Enum reference

| Enum | Values |
|---|---|
| `scan_status` | `pending`, `diagnosed`, `needs_review`, `verified`, `rejected` |
| `review_status` | `pending`, `in_progress`, `approved`, `rejected` |
| `severity` | `low`, `medium`, `high` |

### Migrations

| File | What |
|---|---|
| `20260728000001_create_users.sql` | users table + RLS |
| `20260728000002_create_scans.sql` | scans table + scan_status enum + RLS |
| `20260728000003_create_agronomist_reviews.sql` | reviews table + review_status enum + RLS |
| `20260728000004_scans_add_diagnosis_fields.sql` | adds treatment_steps, severity columns |
