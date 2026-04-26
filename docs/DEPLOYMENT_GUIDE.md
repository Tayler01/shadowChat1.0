# Deployment Guide

ShadowChat deploys as a static frontend on Netlify with Supabase as the hosted backend.

## Production Pieces

- Frontend hosting: Netlify
- Backend: Supabase
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

## GitHub Push

```powershell
git status --short
git add .
git commit -m "Describe the change"
git push origin main
```

## Netlify Production Deploy

From the repo root:

```powershell
npx netlify deploy --prod
```

This project already includes:

- linked Netlify metadata under [`.netlify`](C:/repos/chat2.0/.netlify/state.json:1)
- a production build command in [netlify.toml](C:/repos/chat2.0/netlify.toml:1)

## Supabase Deployment Steps

### Schema

```powershell
supabase db push
```

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

Recommended production smoke for local post-deploy validation:

```powershell
npm run qa:smoke:prod
```

The default production smoke opens a visible browser. For CI-style environments where headless Chromium is stable, use:

```powershell
npm run qa:smoke:prod:headless
```

Production smoke requires the two stable, email-confirmed `PLAYWRIGHT_ACCOUNT_*` users from local `.env.testing.local` or CI secrets. Disposable signup is not reliable against production when email confirmation is enabled. See [`docs/PRODUCTION_SMOKE_TESTING.md`](C:/repos/chat2.0/docs/PRODUCTION_SMOKE_TESTING.md:1).

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

### iPhone Home Screen Still Hangs After Resume

If sends still hang only in the installed Home Screen app:

- verify the deployed build contains the latest `useAuth` and `supabase` session changes
- confirm no async Supabase work has been reintroduced inside `onAuthStateChange`
- rerun the production `auth,resume-send` smoke
- then do a real-device Home Screen validation pass, because iOS standalone mode can diverge from normal Safari behavior
