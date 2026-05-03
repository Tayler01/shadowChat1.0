# Setup Guide

This guide covers the recommended local and hosted setup flow for ShadowChat 1.0.

## Prerequisites

- Node.js 20+
- npm 10+
- A Supabase account and project
- Supabase CLI
- Netlify CLI only if you plan to deploy from the terminal
- Render account only if you plan to run the production News scraper

Useful checks:

```powershell
node --version
npm --version
supabase --version
```

## 1. Install Dependencies

```powershell
npm install
```

## 2. Create Frontend Env File

Copy [`.env.example`](C:/repos/chat2.0/.env.example:1) to `.env` and fill in the required values.

```powershell
Copy-Item .env.example .env
```

Minimum required values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Common optional values:

```env
VITE_PRESENCE_INTERVAL_MS=30000
VITE_MESSAGE_FETCH_LIMIT=50
VITE_DEBUG_LOGS=true
VITE_WEB_PUSH_PUBLIC_KEY=YOUR_WEB_PUSH_PUBLIC_KEY
```

## 3. Create Or Link A Supabase Project

This repo assumes a hosted Supabase project, not a checked-in local `supabase/config.toml`.

Login and link:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Then push the schema:

```powershell
supabase db push
```

That applies the migrations under [supabase/migrations](C:/repos/chat2.0/supabase/migrations).

## 4. Configure Supabase Secrets

Set Edge Function secrets before expecting AI or push features to work:

### AI

Recommended OpenRouter test setup:

- `OPENROUTER_API_KEY`
- `AI_PROVIDER=openrouter`
- `OPENROUTER_MODEL=mistralai/mistral-nemo`
- `AI_ALLOWED_MODELS=mistralai/mistral-nemo`
- `OPENROUTER_SITE_URL=https://shadowchat-1-0.netlify.app`
- `OPENROUTER_APP_NAME=ShadowChat`

The current cheap paid test model is `mistralai/mistral-nemo`. As of April 26, 2026, OpenRouter lists it around $0.01 per million input tokens and $0.03 per million output tokens. Recheck the [OpenRouter model catalog](https://openrouter.ai/models) and [pricing page](https://openrouter.ai/pricing) before changing production defaults.

The `@ai` group-chat flow posts answers as a dedicated `Shado` assistant profile (`shado_ai`). The `openai-chat` Edge Function uses `SUPABASE_SERVICE_ROLE_KEY` to create or repair that profile and to insert Shado's answer without making it look like the requesting user wrote it.

Legacy fallback, only if using OpenAI directly:

- `OPENAI_API_KEY` or `OPENAI_KEY`

### Web Push

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

Example:

```powershell
supabase secrets set OPENROUTER_API_KEY=YOUR_OPENROUTER_KEY
supabase secrets set AI_PROVIDER=openrouter
supabase secrets set OPENROUTER_MODEL=mistralai/mistral-nemo
supabase secrets set AI_ALLOWED_MODELS=mistralai/mistral-nemo
supabase secrets set OPENROUTER_SITE_URL=https://shadowchat-1-0.netlify.app
supabase secrets set OPENROUTER_APP_NAME=ShadowChat
supabase secrets set WEB_PUSH_PUBLIC_KEY=YOUR_PUBLIC_KEY
supabase secrets set WEB_PUSH_PRIVATE_KEY=YOUR_PRIVATE_KEY
supabase secrets set WEB_PUSH_SUBJECT=https://your-app.example.com
```

## 5. Deploy Edge Functions

```powershell
supabase functions deploy openai-chat --no-verify-jwt
supabase functions deploy send-push --no-verify-jwt
supabase functions deploy link-preview --no-verify-jwt
```

Deploy bridge functions too when working on the ESP bridge or when a fresh
Supabase project needs full feature parity:

```powershell
supabase functions deploy bridge-register --no-verify-jwt
supabase functions deploy bridge-pairing-begin --no-verify-jwt
supabase functions deploy bridge-pairing-status --no-verify-jwt
supabase functions deploy bridge-session-exchange --no-verify-jwt
supabase functions deploy bridge-session-refresh --no-verify-jwt
supabase functions deploy bridge-heartbeat --no-verify-jwt
supabase functions deploy bridge-pairing-approve --no-verify-jwt
supabase functions deploy bridge-pairing-revoke --no-verify-jwt
supabase functions deploy bridge-group-send --no-verify-jwt
supabase functions deploy bridge-group-poll --no-verify-jwt
supabase functions deploy bridge-dm-send --no-verify-jwt
supabase functions deploy bridge-dm-poll --no-verify-jwt
supabase functions deploy bridge-update-check --no-verify-jwt
supabase functions deploy bridge-user-profile --no-verify-jwt
supabase functions deploy bridge-user-search --no-verify-jwt
```

`link-preview` validates the signed-in user's bearer token inside the function
while keeping gateway JWT verification disabled for deployment compatibility.

## 6. Start The App

```powershell
npm run dev
```

Default Vite URL:

- `http://localhost:5173`

## 7. Optional News Scraper Setup

The app can run locally without the News scraper, but News Feed ingestion needs
the worker.

Proof mode does not require Supabase credentials:

```powershell
npm run news:scrape:proof
```

For a real one-cycle local check, set server-only Supabase values in the shell:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
node services/news-scraper/src/index.mjs --once
```

Production uses [render.yaml](C:/repos/chat2.0/render.yaml:1). Required Render
secrets are `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; optional source
credentials are `X_USERNAME`, `X_EMAIL`, `X_PASSWORD`, `TRUTH_USERNAME`,
`TRUTH_EMAIL`, and `TRUTH_PASSWORD`.

Admins and sub-admins manage tracked sources from Settings > Admin > News
Sources. The admin class is stored in `public.user_roles` as `admin` or
`sub_admin`; full admins can manage sub-admin access from Settings > Admin >
Admin Access or from a user's profile popup. Operators can also open another
user's public profile popup to manage channel bans for General Chat, individual
chat boards, and all interaction.

Full runbook: [docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1).
Moderation runbook: [docs/CHANNEL_BANS.md](C:/repos/chat2.0/docs/CHANNEL_BANS.md:1).

## 8. Optional Weather Widget Setup

The General Chat weather widget works without any provider secret. Users choose
their own location from Settings > Account & Profile > Weather Location. The
browser calls Open-Meteo for geocoding and forecasts.

Fresh Supabase projects must include
[`20260502042003_user_weather_preferences.sql`](C:/repos/chat2.0/supabase/migrations/20260502042003_user_weather_preferences.sql:1)
so the private per-user preference table and RLS policies exist.

## 9. Verify Core Flows

After setup, verify:

1. Sign up or sign in
2. Group chat loads
3. DM list loads
4. File/image upload works
5. Profile updates persist
6. Push settings screen renders
7. New-account phone setup opens after signup or first sign-in from the same browser
8. Boards tab loads the low-friction bubble map and bubbles reset when Boards is reopened
9. News Chat, Investing Chat, Learning Chat, and Crypto Chat send and receive messages without duplicate subheaders
10. An `admin` or `sub_admin` user can add, pause, enable, and delete a News source in Settings > Admin > News Sources
11. If the scraper is configured, `news_sources.last_checked_at` updates after a worker cycle
12. A full `admin` user can grant or remove sub-admin access from Settings > Admin > Admin Access and from a profile popup
13. Settings > Account & Profile can save and clear a weather location
14. General Chat shows the weather widget and active-user count without overlapping on mobile
15. An `admin` or `sub_admin` can open another user's profile popup and update channel-ban scopes
16. A banned user cannot post/react in the selected channel, board, or all-interaction scope, and can still read content and use DMs

## 10. Optional Preview Mode

For production-style local QA:

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4174
```

## 11. End-User Phone Setup

New accounts get a guided Home Screen setup modal. The guide is intentionally simple:

- iPhone: open in Safari, tap Share, tap `Add to Home Screen`, tap `Add`
- Android: tap `Install Now` when Chrome exposes the native prompt, or use the Chrome menu and choose `Install app` / `Add to Home screen`

Users can reopen the guide from Settings under `App Setup & User Guide`.

For implementation and QA details, see [docs/PHONE_INSTALL_ONBOARDING.md](C:/repos/chat2.0/docs/PHONE_INSTALL_ONBOARDING.md:1).

## Common Setup Problems

### Blank Or Broken Data

- confirm `.env` values
- confirm `supabase db push` ran successfully
- confirm the linked project is the one you expect

### AI Returns 500

- `OPENROUTER_API_KEY` is missing on Supabase
- `openai-chat` has not been redeployed after AI provider changes
- OpenRouter credits, model access, or rate limits are blocking the request

### Push Setup Works But Nothing Delivers

- `send-push` function not deployed
- VAPID secrets missing
- browser/device has no active subscription row

### News Feed Is Empty

- no `news_sources` rows are enabled
- the Render worker is stopped or missing `SUPABASE_SERVICE_ROLE_KEY`
- newest visible source posts are older than today's Eastern date
- X logged-out pages are stale and no X credentials are configured
- Truth Social is blocking the hosted worker IP

### Realtime Looks Dead

- migrations were not pushed
- wrong Supabase project linked
- stale session or auth issue

### Channel Ban Controls Are Missing

- confirm the signed-in account has `admin` or `sub_admin`
- confirm the target profile is not the single full admin account
- confirm migrations include `user_channel_bans`

### Weather Location Does Not Save

- confirm migrations include `user_weather_preferences`
- confirm the user is signed in
- confirm browser requests to `geocoding-api.open-meteo.com` and
  `api.open-meteo.com` are not blocked by local network policy

When debugging realtime, inspect:

- [`src/lib/supabase.ts`](C:/repos/chat2.0/src/lib/supabase.ts:1)
- [`src/hooks/useMessages.tsx`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [`src/hooks/useDirectMessages.tsx`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
