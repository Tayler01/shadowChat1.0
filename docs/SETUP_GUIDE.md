# Setup Guide

This guide covers the recommended local and hosted setup flow for ShadowChat 1.0.

## Documentation Status - July 15, 2026

This setup guide matches the Node 24 GitHub/Netlify runtime, the backend-first
release, the July Supabase credential and security cleanup, and the intentional
Boards/News/Art/ESP pause. Use
[FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1)
before changing auth or hosted security setup.

## Prerequisites

- Node.js 24+
- npm 10+
- A Supabase account and project
- Supabase CLI
- Netlify CLI only if you plan to deploy from the terminal
- LiveKit CLI only when deploying or diagnosing the real Shado Live beta
- Render account only if a reviewed News reactivation or isolated worker proof
  requires it

Useful checks:

```powershell
node --version
npm --version
npx --version
supabase --version
```

On Windows, especially from the Codex desktop shell, verify that `npm` and
`npx` resolve from PATH before running QA. If `node --version` works but
`npm`/`npx` do not, fix the machine/user PATH or install a normal Node LTS
toolchain rather than working around it in test commands.

On this workstation, Codex shells inherit `C:\Users\tayle\AppData\Local\pnpm`
but may not inherit the full Windows user PATH. That directory now contains
small `node.CMD`, `npm.CMD`, and `npx.CMD` shims that forward to the FNM Node
install at:

```powershell
C:\Users\tayle\AppData\Roaming\fnm\node-versions\v24.15.0\installation
```

If `npx` disappears again, first verify those shims still exist and point at an
installed FNM Node version. The Visual Studio Node runtime path is a fallback,
but prefer the FNM install because it includes the normal npm/npx toolchain:

```powershell
C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Microsoft\VisualStudio\NodeJs
```

After updating PATH, restart the terminal or Codex process so new shells inherit
it, then rerun the checks above.

### LiveKit CLI on this Windows workstation

LiveKit CLI 2.17.0 is installed through WinGet. The exact executable is:

```powershell
& 'C:\Users\tayle\AppData\Local\Microsoft\WinGet\Packages\LiveKit.LiveKitCLI_Microsoft.Winget.Source_8wekyb3d8bbwe\lk.exe' --version
```

Do not use the collapsed path from copied terminal text such as
`C:Userstayle...`; the backslashes are required. `lk cloud auth` opens the
browser link flow and `lk project list` verifies the imported project. The CLI
can manage rooms and tokens, but LiveKit Cloud project webhooks are configured
under **Settings -> Webhooks** in the Cloud dashboard.

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
VITE_FEATURE_BOARDS=false
VITE_FEATURE_ESP_ADMIN=false
VITE_FEATURE_ACTIVITY=false
VITE_FEATURE_MEMBER_REPORTING=false
VITE_FEATURE_SHADO_LIVE_PROTOTYPE=false
VITE_FEATURE_SHADO_LIVE_REAL=false
VITE_FEATURE_CATCH_UP=false
```

Boards/News/Art Board and ESP admin are intentionally compile-time off. See
[PAUSED_FEATURES.md](C:/repos/chat2.0/docs/PAUSED_FEATURES.md:1) before changing
either flag; re-enabling the UI alone does not restore or secure remote services.

For the isolated real Shado Live beta, enable `VITE_FEATURE_SHADO_LIVE_REAL`
and `VITE_FEATURE_CATCH_UP`, keep the prototype flag false, and set
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` only as Supabase Edge
Function secrets. Never create a `VITE_` LiveKit credential.

## 3. Create Or Link A Supabase Project

This repo assumes a hosted Supabase project and includes [supabase/config.toml](C:/repos/chat2.0/supabase/config.toml:1) for function-level configuration such as `verify_jwt` settings. Treat [supabase/migrations](C:/repos/chat2.0/supabase/migrations) as the schema source of truth.

Login and link:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

`SUPABASE_ACCESS_TOKEN` is a Supabase personal access token with an `sbp_`
prefix; it is not the database password. Keep the linked project's database
password in a separate `SUPABASE_DB_PASSWORD` secret. If the CLI rejects the
token format, rerun `supabase login`, verify the PAT, and update the PAT secret
without a trailing newline rather than substituting the database password.

Then push the schema:

```powershell
supabase db push
```

That applies the migrations under [supabase/migrations](C:/repos/chat2.0/supabase/migrations).
For hosted projects, use `supabase migration list --linked` after the push to
confirm the remote project includes the latest app-surface migrations.

For invite-only signup, hosted projects also need the Supabase Auth settings in
[supabase/config.toml](C:/repos/chat2.0/supabase/config.toml:1): email
confirmations enabled, the Before User Created hook
`pg-functions://postgres/public/hook_validate_signup_invite`, the production
Site URL, and local/preview redirect URLs. After linking a hosted project, push
and verify Auth config:

```powershell
supabase config push --project-ref YOUR_PROJECT_REF --yes
```

Hosted production currently has leaked-password screening enabled. New hosted
projects should enable the equivalent Auth setting before launch. Raising
minimum password length or complexity is a separate sign-in UX decision because
it can affect existing users; do not silently change those requirements during
environment setup.

The Shado-branded confirmation and recovery email subject/body templates live
under [supabase/templates](C:/repos/chat2.0/supabase/templates). If inboxes show
`Supabase Auth` as the sender name, configure Supabase Custom SMTP in the hosted
project with a verified Shado sender name/address; keep SMTP credentials out of
browser env and out of the repo.

## 4. Configure Supabase Secrets

Set Edge Function secrets before expecting AI or push features to work:

### AI

Recommended OpenRouter test setup:

- `OPENROUTER_API_KEY`
- `AI_PROVIDER=openrouter`
- `OPENROUTER_MODEL=mistralai/mistral-nemo`
- `AI_ALLOWED_MODELS=mistralai/mistral-nemo`
- `OPENROUTER_SITE_URL=https://shadochat.online`
- `OPENROUTER_APP_NAME=ShadowChat`

The current cheap paid test model is `mistralai/mistral-nemo`. As of April 26, 2026, OpenRouter lists it around $0.01 per million input tokens and $0.03 per million output tokens. Recheck the [OpenRouter model catalog](https://openrouter.ai/models) and [pricing page](https://openrouter.ai/pricing) before changing production defaults.

The `@ai` group-chat flow posts answers as a dedicated `Shado` assistant profile (`shado_ai`). The `openai-chat` Edge Function uses `SUPABASE_SERVICE_ROLE_KEY` to create or repair that profile and to insert Shado's answer without making it look like the requesting user wrote it.

Legacy fallback, only if using OpenAI directly:

- `OPENAI_API_KEY` or `OPENAI_KEY`

### Web Push

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`
- `WEB_PUSH_RECOVERY_SECRET`

Example:

```powershell
supabase secrets set OPENROUTER_API_KEY=YOUR_OPENROUTER_KEY
supabase secrets set AI_PROVIDER=openrouter
supabase secrets set OPENROUTER_MODEL=mistralai/mistral-nemo
supabase secrets set AI_ALLOWED_MODELS=mistralai/mistral-nemo
supabase secrets set OPENROUTER_SITE_URL=https://shadochat.online
supabase secrets set OPENROUTER_APP_NAME=ShadowChat
supabase secrets set WEB_PUSH_PUBLIC_KEY=YOUR_PUBLIC_KEY
supabase secrets set WEB_PUSH_PRIVATE_KEY=YOUR_PRIVATE_KEY
supabase secrets set WEB_PUSH_SUBJECT=https://your-app.example.com
supabase secrets set WEB_PUSH_RECOVERY_SECRET=YOUR_RANDOM_32_BYTE_OR_LONGER_SECRET
```

## 5. Deploy Edge Functions

```powershell
npm run supabase:functions:verify
npm run supabase:functions:deploy
```

`supabase/function-manifest.json` is the canonical inventory. The deploy command
publishes active functions, publishes every ESP Bridge endpoint with its shared
default-deny hold, removes the paused `art-board-import-image` endpoint, and
verifies remote names and JWT settings. It requires `SUPABASE_PROJECT_ID` and
`SUPABASE_ACCESS_TOKEN` in the shell.

`shadow-pin-video`, `send-push`, `link-preview`, and `delete-account` validate their mixed auth contracts inside the function. Keep their `--no-verify-jwt` deployment mode aligned with [supabase/config.toml](C:/repos/chat2.0/supabase/config.toml:1), and do not remove in-function auth checks.

Do not deploy bridge or Art Board functions by hand. Reactivation must first
change the reviewed manifest classification and complete the checklist in
[PAUSED_FEATURES.md](C:/repos/chat2.0/docs/PAUSED_FEATURES.md:1).

The July 10 production proof matched 23 deployed Functions: 8 active Functions
and 15 ESP Bridge endpoints that deny with the shared pause response;
`art-board-import-image` was absent as required.

`link-preview` validates the signed-in user's bearer token inside the function
while keeping gateway JWT verification disabled for deployment compatibility.

## 6. Start The App

```powershell
npm run dev
```

Default Vite URL:

- `http://localhost:5173`

## 7. Optional News Scraper Setup

News is paused. This section is retained for local proof and a future reviewed
reactivation; normal setup does not start or deploy the worker.

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

The preserved production blueprint is [render.yaml](C:/repos/chat2.0/render.yaml:1)
with automatic deploys off. A future reactivation requires these Render
secrets are `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; optional source
credentials include `X_USERNAME`, `X_EMAIL`, `X_SECONDARY_IDENTIFIER`,
`X_PASSWORD`, `X_AUTH_TOKEN`, `X_CT0`, `NEWS_X_COOKIE_HEADER`,
`TRUTH_USERNAME`, `TRUTH_EMAIL`, `TRUTH_PASSWORD`, and
`NEWS_TRUTH_COOKIE_HEADER`.

When News is re-enabled, admins and sub-admins manage tracked sources from
Settings > Admin > News Sources. That panel is absent from the default build.
The admin class is stored in `public.user_roles` as `admin` or
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

1. Generate a 24-hour invite from Settings > Admin > Invites or create a
   temporary invite through the Supabase RPCs, then sign up with that invite
2. Confirm the email-verification link, then sign in
3. Group chat loads
4. DM list loads
5. File/image upload works
6. Profile updates persist
7. Push settings screen renders
8. Phone setup tutorial opens once after first mobile post-login launch and remains available in Settings > App Setup & User Guide
9. Boards is absent from desktop/mobile navigation and legacy Boards/News URLs return to Chat
10. Settings omits News Sources and ESP Bridge Pairing while those domains are paused
11. An `admin` or `sub_admin` user can generate, revoke, and review signup invites from Settings > Admin > Invites
12. The production function inventory matches `supabase/function-manifest.json`; bridge endpoints are deny-paused and `art-board-import-image` is absent
13. The Render News worker remains suspended with automatic deploys off
14. A full `admin` user can grant or remove sub-admin access from Settings > Admin > Admin Access and from a profile popup
15. Settings > Account & Profile can save and clear a weather location
16. General Chat shows the weather widget and active-user count without overlapping on mobile
17. An `admin` or `sub_admin` can open another user's profile popup and update channel-ban scopes
18. A banned user cannot post/react in the selected channel, board, or all-interaction scope, and can still read content and use DMs
19. An `admin` or `sub_admin` can delete a normal-user General Chat or board-chat message and the delete propagates to another signed-in client
20. Avatar upload allows crop/zoom/position adjustment and the saved avatar renders correctly in chat and profile surfaces
21. A sparse DM thread keeps messages visible when the mobile keyboard opens
22. Account deletion renders from Settings and reaches the `delete-account` Edge Function only for the signed-in user

## 10. Optional Preview Mode

For production-style local QA:

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4174
```

## 11. End-User Phone Setup

Phone users get a short setup tutorial after first post-login launch. The guide covers install plus notification setup:

- iPhone: open `https://shadochat.online` in Safari, tap Share, tap `Add to Home Screen`, keep `Open as Web App` on, tap `Add`, then enable notifications from inside Shadow Chat
- Android: tap `Install Now` when Chrome exposes the native prompt, or use the Chrome menu and choose `Install app` / `Add to Home screen`, then enable notifications from inside Shadow Chat

Users can replay the tutorial from Settings under `App Setup & User Guide`. Notification Setup stays as a compact steps-and-actions flow without an embedded video.

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

This is expected in the default production build while News is paused. If News
is explicitly reactivated and still empty, check:

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

### Operator Message Delete Fails

- confirm the signed-in account has `admin` or `sub_admin`
- confirm the target message was not authored by an admin or sub-admin
- confirm migrations include `20260503191532_admin_delete_non_admin_chat_messages.sql`
- confirm you are testing General Chat or a board chat, not DMs

### Weather Location Does Not Save

- confirm migrations include `user_weather_preferences`
- confirm the user is signed in
- confirm browser requests to `geocoding-api.open-meteo.com` and
  `api.open-meteo.com` are not blocked by local network policy

When debugging realtime, inspect:

- [`src/lib/supabase.ts`](C:/repos/chat2.0/src/lib/supabase.ts:1)
- [`src/hooks/useMessages.tsx`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [`src/hooks/useDirectMessages.tsx`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
