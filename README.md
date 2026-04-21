# ShadowChat 1.0

ShadowChat 1.0 is a premium dark realtime chat app built with React, TypeScript, Vite, and Supabase. It combines a public group chat, private direct messages, profile customization, AI-assisted chat utilities, and browser push notifications behind a polished black-and-gold interface.

The project is already wired for hosted Supabase and Netlify deployment. It is designed to behave like a product app, not a demo: realtime messaging, uploads, presence, settings, DMs, and notification flows are all first-class parts of the codebase.

## Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- Supabase Auth, Postgres, Realtime, Storage, and Edge Functions
- Netlify for static hosting
- Jest + Testing Library for unit and hook coverage
- Playwright for headed browser debugging and smoke validation

## What The App Includes

- Realtime group chat
- Realtime direct messages
- Unread tracking and in-app DM notifications
- User profiles with avatar, banner, status, and theme color
- File, image, and voice-message uploads
- Message reactions, pinning, editing, and deletion
- Slash commands and reply/thread affordances
- AI reply and summary hooks through a secured Supabase Edge Function
- Browser push notifications for DMs and group chat
- PWA/service-worker foundation for installed mobile and desktop web experiences
- Premium obsidian-and-gold design system across desktop and mobile

## Current Project Shape

Frontend lives under [`src`](C:/repos/chat2.0/src).

- [`App.tsx`](C:/repos/chat2.0/src/App.tsx) owns high-level view switching and app chrome.
- [`src/components`](C:/repos/chat2.0/src/components) contains view and UI components grouped by domain.
- [`src/hooks`](C:/repos/chat2.0/src/hooks) contains most stateful app behavior.
- [`src/lib`](C:/repos/chat2.0/src/lib) contains Supabase, auth, push, AI, env, and utility layers.

Backend lives under [`supabase`](C:/repos/chat2.0/supabase).

- [`supabase/migrations`](C:/repos/chat2.0/supabase/migrations) is the source of truth for schema and policies.
- [`supabase/functions/openai-chat`](C:/repos/chat2.0/supabase/functions/openai-chat/index.ts) handles authenticated AI requests.
- [`supabase/functions/send-push`](C:/repos/chat2.0/supabase/functions/send-push/index.ts) sends web push notifications.

Tests live under [`tests`](C:/repos/chat2.0/tests).

## Quick Start

1. Install dependencies.
2. Create a Supabase project.
3. Add frontend env vars.
4. Link the repo to Supabase and push migrations.
5. Start the app.

```powershell
npm install
Copy-Item .env.example .env
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npm run dev
```

For the full setup flow, use [docs/SETUP_GUIDE.md](C:/repos/chat2.0/docs/SETUP_GUIDE.md:1).

## Environment Variables

Frontend env values live in [`.env`](C:/repos/chat2.0/.env.example:1).

Required:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Common optional values:

- `VITE_PRESENCE_INTERVAL_MS`
- `VITE_MESSAGE_FETCH_LIMIT`
- `VITE_DEBUG_LOGS`
- `VITE_WEB_PUSH_PUBLIC_KEY`
- `VITE_OPENAI_KEY` only if you intentionally add a client-side AI key path

Supabase Edge Function secrets are separate from `.env`. The project uses:

- `OPENAI_API_KEY` or `OPENAI_KEY`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

## Core Commands

```powershell
npm run dev
npm run build
npm run lint
npm test
npx tsc --noEmit -p tsconfig.app.json
npx vite preview
```

## Realtime, Push, and AI Notes

- Realtime depends on the migrations having been pushed to the target Supabase project.
- Browser push depends on the service worker, VAPID keys, the `send-push` edge function, and at least one active subscription row.
- AI features depend on the `openai-chat` edge function and a configured OpenAI secret on Supabase.
- iPhone web push requires the app to be installed to the Home Screen. Android and Windows work through supported browsers/PWAs.

## Testing And Debugging

The minimum quality gates for normal code changes are:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

For deeper testing guidance, including headed Playwright debugging, use [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1).

## Deployment

Production is hosted on Netlify and the backend is hosted on Supabase.

- Netlify config: [netlify.toml](C:/repos/chat2.0/netlify.toml:1)
- Deployment guide: [docs/DEPLOYMENT_GUIDE.md](C:/repos/chat2.0/docs/DEPLOYMENT_GUIDE.md:1)

## Documentation Map

- [AGENTS.md](C:/repos/chat2.0/AGENTS.md:1): agent-focused working guide for coding, testing, and debugging
- [docs/SETUP_GUIDE.md](C:/repos/chat2.0/docs/SETUP_GUIDE.md:1): first-time local and hosted setup
- [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1): lint, typecheck, unit tests, smoke tests, and Playwright usage
- [docs/DEPLOYMENT_GUIDE.md](C:/repos/chat2.0/docs/DEPLOYMENT_GUIDE.md:1): GitHub, Netlify, and Supabase deployment workflow
- [docs/ARCHITECTURE.md](C:/repos/chat2.0/docs/ARCHITECTURE.md:1): codebase map and key data flows
- [docs/LIQUID_GOLD_DARK_REWORK.md](C:/repos/chat2.0/docs/LIQUID_GOLD_DARK_REWORK.md:1): design-direction history
- [docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md](C:/repos/chat2.0/docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md:1): notification planning notes

## Status

This repo is active product code, not a skeleton starter. Before changing behavior, read the relevant hook and lib layers, especially:

- [src/hooks/useMessages.tsx](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [src/hooks/useDirectMessages.tsx](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
- [src/hooks/useAuth.tsx](C:/repos/chat2.0/src/hooks/useAuth.tsx:1)
- [src/lib/supabase.ts](C:/repos/chat2.0/src/lib/supabase.ts:1)
- [src/lib/push.ts](C:/repos/chat2.0/src/lib/push.ts:1)

That is where most of the realtime, session, push, and chat behavior is coordinated.
