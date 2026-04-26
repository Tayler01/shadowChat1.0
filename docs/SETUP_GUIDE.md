# Setup Guide

This guide covers the recommended local and hosted setup flow for ShadowChat 1.0.

## Prerequisites

- Node.js 20+
- npm 10+
- A Supabase account and project
- Supabase CLI
- Netlify CLI only if you plan to deploy from the terminal

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
VITE_MESSAGE_FETCH_LIMIT=100
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
```

## 6. Start The App

```powershell
npm run dev
```

Default Vite URL:

- `http://localhost:5173`

## 7. Verify Core Flows

After setup, verify:

1. Sign up or sign in
2. Group chat loads
3. DM list loads
4. File/image upload works
5. Profile updates persist
6. Push settings screen renders

## 8. Optional Preview Mode

For production-style local QA:

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4174
```

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

### Realtime Looks Dead

- migrations were not pushed
- wrong Supabase project linked
- stale session or auth issue

When debugging realtime, inspect:

- [`src/lib/supabase.ts`](C:/repos/chat2.0/src/lib/supabase.ts:1)
- [`src/hooks/useMessages.tsx`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [`src/hooks/useDirectMessages.tsx`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
