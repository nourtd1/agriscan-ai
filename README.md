# AgriScan AI

A mobile app that helps farmers identify crop diseases by photographing their plants. Gemini analyses the image and returns a diagnosis; when confidence is low the result is queued for review by a local agronomist.

Built with **Expo Router** (TypeScript) and **Supabase**.

---

## Features

| Feature | Status |
|---|---|
| Camera scan | planned |
| AI diagnosis (Gemini) | planned |
| Human verification queue | planned |
| Scan history | planned |
| Internationalisation (i18n) | planned |
| Text-to-speech (TTS) | planned |

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 57 + Expo Router |
| Language | TypeScript |
| Backend / DB | Supabase (PostgreSQL, Auth, Storage) |
| AI | Google Gemini API |
| Navigation | Expo Router (file-based) |

---

## Project structure

```
app/
  (onboarding)/          welcome / auth screens
  (tabs)/
    scan/                camera capture screen
    history/             past scans list
    profile/             user settings
  scan-result/[id]/      diagnosis detail view
config/
  models.ts              GEMINI_MODEL constant + getApiKey() — single source of truth
  database.types.ts      hand-authored Supabase Database type
features/
  scan/                  camera & image-prep logic
  diagnosis/             Gemini API calls & response parsing
  human-verification/    review queue logic
  history/               local persistence
  i18n/                  locale detection & translation loading
  tts/                   text-to-speech playback
lib/
  supabase.ts            typed Supabase client wrapper
locales/
  en.json                English strings
  fr.json                French strings
supabase/
  migrations/            ordered SQL migrations (tables + RLS)
scripts/                 code-gen and asset-pipeline helpers
```

---

## Getting started

### Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A [Supabase](https://supabase.com) project
- A [Gemini API key](https://aistudio.google.com)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/agriscan-ai.git
cd agriscan-ai
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your real values:

```
GEMINI_API_KEY=AIza...
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

- **Supabase URL + anon key:** Supabase dashboard → Settings → API
- **Gemini key:** [aistudio.google.com](https://aistudio.google.com) → Get API key

### 3. Apply database migrations

```bash
supabase login
supabase link          # select your project
supabase db push --password YOUR_DB_PASSWORD
```

This creates the `users`, `scans`, and `agronomist_reviews` tables with all RLS policies.

### 4. Run the app

```bash
npm start              # Expo dev server (scan QR with Expo Go)
npm run android        # Android emulator
npm run ios            # iOS simulator (macOS only)
npm run web            # browser
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | yes | Google Gemini API key — never expose to the client |
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon (public) key |

> `EXPO_PUBLIC_` variables are bundled into the client build. Only put non-secret values there. The Gemini key is server-side only and must never use this prefix.

---

## Database

See [Design.md](./Design.md#data-model) for the full data model, column notes, and RLS policy documentation.

Quick summary:

- **`users`** — profile data (district, preferred language) extending Supabase Auth
- **`scans`** — one row per photo; tracks diagnosis result and review lifecycle
- **`agronomist_reviews`** — human-verification queue; district-scoped so each agronomist only sees their region

---

## Contributing

1. Branch off `master`
2. Fill in a feature section in `Design.md` before writing code
3. Keep `config/models.ts` as the sole owner of the Gemini model name and API key access — no other file should reference either directly
4. Run `supabase gen types typescript` and update `config/database.types.ts` after any schema change
