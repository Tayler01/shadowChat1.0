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
```

### Secrets

Keep these configured in Supabase:

- `OPENAI_API_KEY` or `OPENAI_KEY`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

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

Recommended production smoke:

```powershell
node scripts/playwright-smoke.mjs --base-url=https://shadowchat-1-0.netlify.app --scenario=auth,resume-send --run-name=prod-postdeploy
```

## Production Gotchas

### AI Not Working

The frontend deploy can be healthy while AI still fails if the Supabase OpenAI secret is missing.

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
