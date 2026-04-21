# Agent Guide

This file is the working handbook for agentic contributors operating inside this repository.

## Mission

Ship product-quality improvements to ShadowChat without breaking realtime chat, DMs, auth, uploads, push notifications, or the premium dark UI language.

## Non-Negotiable Checks

Run these after meaningful code changes:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Run targeted Jest when touching behavior that already has tests:

```powershell
npm test -- --runInBand
```

## Repo Map

### App Shell

- [`src/App.tsx`](C:/repos/chat2.0/src/App.tsx:1): top-level layout, view switching, toasts, URL state
- [`src/main.tsx`](C:/repos/chat2.0/src/main.tsx:1): app boot, service worker registration
- [`src/index.css`](C:/repos/chat2.0/src/index.css:1): global tokens and theme styling

### State And Behavior

- [`src/hooks/useAuth.tsx`](C:/repos/chat2.0/src/hooks/useAuth.tsx:1): auth session, profile loading, sign-in/sign-up/sign-out
- [`src/hooks/useMessages.tsx`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1): group chat fetch, realtime, reactions, pinning, send flow
- [`src/hooks/useDirectMessages.tsx`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1): DM conversations, realtime, unread counts, message loading
- [`src/hooks/usePushNotifications.ts`](C:/repos/chat2.0/src/hooks/usePushNotifications.ts:1): browser push setup and preference state
- [`src/hooks/useTheme.tsx`](C:/repos/chat2.0/src/hooks/useTheme.tsx:1): product theme selection and persistence
- [`src/hooks/useTyping.ts`](C:/repos/chat2.0/src/hooks/useTyping.ts:1): typing indicators

### Backend Integration

- [`src/lib/supabase.ts`](C:/repos/chat2.0/src/lib/supabase.ts:1): Supabase client, session refresh, storage, RPC helpers
- [`src/lib/auth.ts`](C:/repos/chat2.0/src/lib/auth.ts:1): auth workflows and profile bootstrap
- [`src/lib/push.ts`](C:/repos/chat2.0/src/lib/push.ts:1): push subscription persistence and function calls
- [`src/lib/ai.ts`](C:/repos/chat2.0/src/lib/ai.ts:1): AI function calls

### Views

- [`src/components/chat`](C:/repos/chat2.0/src/components/chat): group chat UI
- [`src/components/dms`](C:/repos/chat2.0/src/components/dms): inbox and DM thread UI
- [`src/components/profile`](C:/repos/chat2.0/src/components/profile): profile editing and presentation
- [`src/components/settings`](C:/repos/chat2.0/src/components/settings): feature toggles, push setup, theme settings
- [`src/components/layout`](C:/repos/chat2.0/src/components/layout): sidebar, mobile nav, shell controls

### Backend Schema And Functions

- [`supabase/migrations`](C:/repos/chat2.0/supabase/migrations): canonical schema and policy history
- [`supabase/functions/openai-chat/index.ts`](C:/repos/chat2.0/supabase/functions/openai-chat/index.ts:1): authenticated AI proxy
- [`supabase/functions/send-push/index.ts`](C:/repos/chat2.0/supabase/functions/send-push/index.ts:1): DM and group push delivery

## Working Rules

### 1. Respect Realtime

Any change touching:

- auth
- chat message inserts
- DM unread counts
- visibility refresh
- session refresh
- websocket reconnects

should be treated as a realtime-sensitive change. Re-test the affected flow in a browser, not just with unit tests.

### 2. Respect The Design System

The app uses a premium obsidian-and-gold visual system. Avoid introducing:

- default bright blues and greens
- plain browser-looking controls
- inconsistent badges or spacing
- one-off surfaces that ignore existing token usage

Check [`src/index.css`](C:/repos/chat2.0/src/index.css:1) and nearby components before adding ad hoc colors.

### 3. Treat Migrations As Source Of Truth

Do not describe schema behavior from memory. Read the relevant migration or helper function first.

### 4. Prefer Preview For Visual QA

For stable UI checks, use a production-style preview build instead of relying only on the hot-reload dev server.

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4174
```

## Testing Workflow

### Standard Code Changes

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

### Jest

Run the whole suite:

```powershell
npm test -- --runInBand
```

Run a single file:

```powershell
npm test -- --runInBand tests/useDirectMessages.test.tsx
```

Use `--runInBand` on Windows to reduce flakiness and keep output easier to read.

### Playwright Debugging

This repo does not keep Playwright specs as the main workflow. For ad hoc browser debugging, use inline Node scripts with the installed `playwright` package or the Codex Playwright wrapper.

Recommended local visual-debug loop:

1. Build the app.
2. Start preview on a fixed host/port.
3. Launch headed Chromium.
4. Save artifacts under `output/playwright/<run-name>/`.

Minimal example:

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4174
```

Then in another shell:

```powershell
@'
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 120 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'output/playwright/manual-check/home.png', fullPage: true });
})();
'@ | node
```

For DM or group-chat regressions, use two browser contexts with different accounts and verify:

- send path
- recipient live update
- unread count changes
- thread selection
- mobile and desktop layout

## Common Risk Areas

### DM Realtime

Read and test:

- [`src/hooks/useDirectMessages.tsx`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
- [`src/components/dms/DirectMessagesView.tsx`](C:/repos/chat2.0/src/components/dms/DirectMessagesView.tsx:1)
- [`src/hooks/useMessageNotifications.tsx`](C:/repos/chat2.0/src/hooks/useMessageNotifications.tsx:1)

### Group Chat Realtime

Read and test:

- [`src/hooks/useMessages.tsx`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [`src/components/chat/ChatView.tsx`](C:/repos/chat2.0/src/components/chat/ChatView.tsx:1)

### Auth And Session Recovery

Read and test:

- [`src/hooks/useAuth.tsx`](C:/repos/chat2.0/src/hooks/useAuth.tsx:1)
- [`src/lib/auth.ts`](C:/repos/chat2.0/src/lib/auth.ts:1)
- [`src/lib/supabase.ts`](C:/repos/chat2.0/src/lib/supabase.ts:1)

### Push Notifications

Read and test:

- [`src/lib/push.ts`](C:/repos/chat2.0/src/lib/push.ts:1)
- [`src/hooks/usePushNotifications.ts`](C:/repos/chat2.0/src/hooks/usePushNotifications.ts:1)
- [`supabase/functions/send-push/index.ts`](C:/repos/chat2.0/supabase/functions/send-push/index.ts:1)

## Setup Dependencies

For a clean working environment, see:

- [README.md](C:/repos/chat2.0/README.md:1)
- [docs/SETUP_GUIDE.md](C:/repos/chat2.0/docs/SETUP_GUIDE.md:1)
- [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1)
- [docs/DEPLOYMENT_GUIDE.md](C:/repos/chat2.0/docs/DEPLOYMENT_GUIDE.md:1)

## Before Shipping

Before push/deploy:

1. Confirm the change is intentionally scoped.
2. Run lint, typecheck, and build.
3. Run targeted Jest if existing tests cover the area.
4. Run a headed browser check for UI/realtime changes.
5. Review the final screens for visual consistency, especially on mobile.
