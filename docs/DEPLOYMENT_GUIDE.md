# Deployment Guide

ShadowChat deploys as a static frontend on Netlify with Supabase as the hosted backend. The News Feed scraper is a separate always-on Render worker.

## Production Pieces

- Frontend hosting: Netlify
- Backend: Supabase
- News scraper: Render worker from [render.yaml](C:/repos/chat2.0/render.yaml:1)
- Static build output: `dist`
- Netlify config: [netlify.toml](C:/repos/chat2.0/netlify.toml:1)

## Before Deploying

Run:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

If the change affects realtime or UI behavior, also run a headed browser smoke before shipping.

If the change affects auth, session recovery, or mobile resume behavior, also run:

```powershell
node scripts/playwright-smoke.mjs --scenario=auth,resume-send --headed --no-reuse-server
```

For the current login persistence behavior, rollback checkpoints, and production smoke expectations, see [`docs/SESSION_PERSISTENCE_RUNBOOK.md`](C:/repos/chat2.0/docs/SESSION_PERSISTENCE_RUNBOOK.md:1).

If the change affects News scraping, run:

```powershell
npm run news:scrape:proof
```

Then run one Supabase-backed cycle with service-role credentials in the shell or Render after deployment:

```powershell
node services/news-scraper/src/index.mjs --once
```

## GitHub Push

```powershell
git status --short
git add .
git commit -m "Describe the change"
git push origin main
```

Pushing `main` automatically starts the GitHub Actions workflow in
[.github/workflows/netlify-production.yml](C:/repos/chat2.0/.github/workflows/netlify-production.yml:1).
That workflow runs install, lint, typecheck, Netlify build, and Netlify
production deploy.

## Netlify Production Deploy

Manual CLI deploy is now a fallback path, not the normal production path. From
the repo root:

```powershell
npx netlify deploy --prod
```

This project already includes:

- linked Netlify metadata under [`.netlify`](C:/repos/chat2.0/.netlify/state.json:1)
- a production build command in [netlify.toml](C:/repos/chat2.0/netlify.toml:1)
- GitHub Actions production deployment on every push to `main`

## Supabase Deployment Steps

### Schema

```powershell
supabase db push --yes
```

Run schema deployment before publishing frontend changes that depend on new
tables or buckets. For example, Settings feedback submissions require
`public.feedback_submissions` and the private `feedback-attachments` Storage
bucket before the production UI can submit reports, and the weather widget
requires `public.user_weather_preferences` before users can save weather
locations.
Channel bans require `public.user_channel_bans` plus the updated channel and
reaction policies before the production moderation UI can reliably block
participation.
Boards require `public.board_catalog`, `public.board_chat_messages`,
`public.board_chat_reactions`, and `get_board_badge_counts` before the
production Boards UI can load chat boards or unread counts.

Recent app-surface migrations to confirm in fresh projects:

- `20260501233924_admin_roles_foundation.sql`: app-wide admin/sub-admin model.
- `20260502020855_presence_visibility_active_users.sql`: tracked/invisible presence and active users.
- `20260502034206_feedback_admin_review_access.sql`: operator feedback review access.
- `20260502034941_feedback_review_read_policy_consolidation.sql`: consolidated feedback read policies.
- `20260502042003_user_weather_preferences.sql`: private per-user weather location preferences.
- `20260502070543_channel_bans_moderation.sql`: profile-popup moderation controls and channel-ban enforcement.
- `20260502193604_boards_domain.sql`: Boards catalog, reusable board-chat stream, per-board unread counts, and Boards moderation scopes.

### Edge Functions

```powershell
supabase functions deploy openai-chat --no-verify-jwt
supabase functions deploy send-push --no-verify-jwt
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
supabase functions deploy link-preview --no-verify-jwt
```

The bridge functions keep JWT verification disabled at the Supabase function gateway because the firmware bootstrap calls do not carry a browser user token. User-sensitive bridge operations validate the caller's Supabase session inside the function, while device-sensitive operations validate pairing codes or bridge control-plane tokens.

### Secrets

Keep these configured in Supabase:

- `OPENROUTER_API_KEY`
- `AI_PROVIDER=openrouter`
- `OPENROUTER_MODEL=mistralai/mistral-nemo`
- `AI_ALLOWED_MODELS=mistralai/mistral-nemo`
- `OPENROUTER_SITE_URL=https://shadowchat-1-0.netlify.app`
- `OPENROUTER_APP_NAME=ShadowChat`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

`mistralai/mistral-nemo` is the current cheap paid OpenRouter test model. As of April 26, 2026, OpenRouter lists it around $0.01 per million input tokens and $0.03 per million output tokens. Recheck the [OpenRouter model catalog](https://openrouter.ai/models) and [pricing page](https://openrouter.ai/pricing) before changing this default.

The `@ai` group-chat flow posts answers as the dedicated `Shado` assistant profile (`shado_ai`). Keep `SUPABASE_SERVICE_ROLE_KEY` configured for Edge Functions so `openai-chat` can create/repair that profile and insert Shado's answer.

Bridge TUI `@ai` support uses the same AI secrets through `bridge-group-send`, so deploy both `openai-chat` and `bridge-group-send` after changing shared AI code.

Chat link previews use the `link-preview` Edge Function. Deploy it with `--no-verify-jwt`; the function validates the signed-in user's bearer token in code before fetching remote metadata.

Optional Meta/Facebook/Instagram previews can use these server-only secrets:

- `META_OEMBED_ACCESS_TOKEN`
- or `META_APP_ID` plus `META_APP_SECRET`

Do not put provider preview tokens in frontend `VITE_*` env vars.

## Render News Scraper Deployment

The News scraper deploys from [render.yaml](C:/repos/chat2.0/render.yaml:1) as the `shado-news-scraper` Docker worker.

Required Render secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Expected Render values:

- `NEWS_SCRAPE_INTERVAL_MS=90000`
- `NEWS_SCRAPE_HEADLESS=true`

Optional Render secrets:

- `PINCHTAB_CDP_URL`
- `PINCHTAB_WS_ENDPOINT`
- `X_USERNAME`
- `X_EMAIL`
- `X_PASSWORD`
- `TRUTH_USERNAME`
- `TRUTH_EMAIL`
- `TRUTH_PASSWORD`
- `NEWS_X_SHARED_CONTEXT`

Deploy notes:

1. Push the commit to the branch Render watches.
2. Confirm the Render worker build finishes and the service is running.
3. Watch logs for `Stored`, `Skipped seen`, or `Source ... failed` lines.
4. Query `news_sources` to confirm `last_checked_at`, `last_success_at`, `health_status`, and `last_seen_external_id`.

Truth Social can block hosted worker IPs even with credentials configured. If Render shows a persistent `blocked` state for Truth, use a trusted remote browser path with `PINCHTAB_CDP_URL` or `PINCHTAB_WS_ENDPOINT` instead of exposing credentials to the browser client.

## Frontend Env Requirements

Netlify needs the frontend equivalents of:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_WEB_PUSH_PUBLIC_KEY` when push subscriptions are enabled in the UI

Check [`.env.example`](C:/repos/chat2.0/.env.example:1) for the expected names.

## Post-Deploy Smoke

After deploy, verify:

1. Sign in works
2. Group chat loads
3. DM list loads
4. Realtime group message works
5. Realtime DM works
6. Resume-send works after a background/foreground cycle
7. Settings page renders cleanly on mobile and desktop
8. A message containing an `https://` or `www.` link renders as a clickable link and loads a compact preview card
9. Settings feedback can submit a bug or feature report with an image attachment after feedback schema changes
10. Boards tab loads the low-friction bubble map and opens News Feed plus each chat board
11. News Chat, Investing Chat, Learning Chat, and Crypto Chat send, edit, delete, react, render link previews, and avoid duplicate subheaders/manual refresh rows
12. Settings > Admin > News Sources shows source health for an `admin` or `sub_admin` account
13. Render worker has checked enabled sources since deploy and today's feed rows match current Eastern-day posts
14. General Chat header shows active-user count, active-user popup, and weather widget without mobile overlap
15. Settings > Account & Profile can save or clear a weather location
16. Settings > Admin > Feedback Review lists submitted feedback for an app operator
17. An app operator can open another user's profile popup and see Channel bans
18. A channel-banned user is blocked from the selected channel, board, or all interaction while DMs and read access still work

Recommended production smoke for local post-deploy validation:

```powershell
npm run qa:smoke:prod
```

The default production smoke opens a visible browser. For CI-style environments where headless Chromium is stable, use:

```powershell
npm run qa:smoke:prod:headless
```

Production smoke requires the two stable, email-confirmed `PLAYWRIGHT_ACCOUNT_*` users from local `.env.testing.local` or CI secrets. Disposable signup is not reliable against production when email confirmation is enabled. See [`docs/PRODUCTION_SMOKE_TESTING.md`](C:/repos/chat2.0/docs/PRODUCTION_SMOKE_TESTING.md:1).

For larger releases, run the full headed local smoke from a fresh preview build and keep its artifact path in the release notes:

```powershell
node scripts/playwright-smoke.mjs --scenario=full --run-name=full-smoke-release --headed --slow-mo=100 --no-reuse-server
```

## Production Gotchas

### AI Not Working

The frontend deploy can be healthy while AI still fails if the Supabase `OPENROUTER_API_KEY` secret is missing, the `openai-chat` function was not redeployed, or the OpenRouter account has no usable credits/model access.

### Push Not Working

The frontend deploy can be healthy while push still fails if:

- VAPID keys are missing
- `send-push` is not deployed
- devices are not actually subscribed

### Realtime Looks Stale

The frontend deploy can be healthy while realtime still fails if the target Supabase project is not on the latest migrations.

### Weather Widget Is Empty

The frontend deploy can be healthy while the weather widget still prompts for
setup if the signed-in user has no saved weather location. If location save
fails, confirm `20260502042003_user_weather_preferences.sql` has been applied
and that the signed-in user has an authenticated session. Open-Meteo does not
require a project secret for the current browser-side integration.

### Channel Bans Do Not Apply

The frontend deploy can show moderation controls while enforcement still fails
if the target Supabase project is missing
`20260502070543_channel_bans_moderation.sql` or
`20260502193604_boards_domain.sql`. Confirm `supabase migration list` shows the
migrations on both local and remote, then retest General Chat, board chats,
News Feed reactions, and DMs.

### News Feed Is Stale

The frontend deploy can be healthy while the News Feed is stale if:

- the Render worker did not redeploy or is stopped
- `SUPABASE_SERVICE_ROLE_KEY` is missing or rotated
- source rows are disabled
- X logged-out pages are stale and no X credentials are configured
- Truth Social is blocking the worker IP

Start with [docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1), then check `news_sources.last_checked_at`, `health_status`, and `last_error`.

### iPhone Home Screen Still Hangs After Resume

If sends still hang only in the installed Home Screen app:

- verify the deployed build contains the latest `useAuth` and `supabase` session changes
- confirm no async Supabase work has been reintroduced inside `onAuthStateChange`
- rerun the production `auth,resume-send` smoke
- then do a real-device Home Screen validation pass, because iOS standalone mode can diverge from normal Safari behavior
