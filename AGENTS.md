# Agent Guide

This file is the working handbook for agentic contributors operating inside this repository.

## Mission

Ship product-quality improvements to ShadowChat without breaking realtime chat, DMs, auth, uploads, push notifications, or the premium dark UI language.

## Current Feature Focus

The current major planning and upcoming implementation track is the `ESP bridge` feature for an airgapped Windows PC.

High-level direction:

- `ESP32-S3` bridge
- `USB CDC serial` local link
- no general internet access for the connected PC
- `chat-first TUI` plus a separate `admin shell`
- bridge-specific pairing and session lifecycle
- realtime group chat and full DMs

Before implementing bridge work, read the bridge planning set in this order:

1. [docs/ESP_BRIDGE_FEATURE_ROADMAP.md](C:/repos/chat2.0/docs/ESP_BRIDGE_FEATURE_ROADMAP.md:1)
2. [docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md](C:/repos/chat2.0/docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md:1)
3. [docs/ESP_BRIDGE_AUTH_MODEL_SPEC.md](C:/repos/chat2.0/docs/ESP_BRIDGE_AUTH_MODEL_SPEC.md:1)
4. [docs/ESP_BRIDGE_SESSION_ISSUANCE_AND_PAIRING_EXCHANGE.md](C:/repos/chat2.0/docs/ESP_BRIDGE_SESSION_ISSUANCE_AND_PAIRING_EXCHANGE.md:1)
5. [docs/ESP_BRIDGE_BACKEND_IMPLEMENTATION_PROPOSAL.md](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_IMPLEMENTATION_PROPOSAL.md:1)
6. [docs/ESP_BRIDGE_PHASE0_IMPLEMENTATION_BRIEF.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_IMPLEMENTATION_BRIEF.md:1)

Supporting docs:

- [docs/ESP_BRIDGE_PROTOCOL_DRAFT.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PROTOCOL_DRAFT.md:1)
- [docs/ESP_BRIDGE_PAIRING_FLOW_SPEC.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PAIRING_FLOW_SPEC.md:1)
- [docs/ESP_BRIDGE_BACKEND_SCHEMA_PROPOSAL.md](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_SCHEMA_PROPOSAL.md:1)
- [docs/ESP_BRIDGE_PHASE0_SPIKE_CHECKLIST.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_SPIKE_CHECKLIST.md:1)
- [docs/ESP_BRIDGE_TUI_UX_SPEC.md](C:/repos/chat2.0/docs/ESP_BRIDGE_TUI_UX_SPEC.md:1)

When starting bridge implementation work:

- treat the bridge control plane as a new backend domain
- prefer Edge Functions for pairing and session lifecycle
- prefer existing authenticated Supabase data access for chat and DMs until the auth path is proven
- do not assume a dashboard/browser transport exists in `v1`

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
- [`supabase/functions/bridge-register/index.ts`](C:/repos/chat2.0/supabase/functions/bridge-register/index.ts:1): bridge device registration
- [`supabase/functions/bridge-pairing-begin/index.ts`](C:/repos/chat2.0/supabase/functions/bridge-pairing-begin/index.ts:1): pairing-code issuance
- [`supabase/functions/bridge-pairing-status/index.ts`](C:/repos/chat2.0/supabase/functions/bridge-pairing-status/index.ts:1): device polling for approval state
- [`supabase/functions/bridge-session-exchange/index.ts`](C:/repos/chat2.0/supabase/functions/bridge-session-exchange/index.ts:1): bridge control-plane session issuance
- [`supabase/functions/bridge-session-refresh/index.ts`](C:/repos/chat2.0/supabase/functions/bridge-session-refresh/index.ts:1): bridge control-plane session rotation
- [`supabase/functions/bridge-pairing-revoke/index.ts`](C:/repos/chat2.0/supabase/functions/bridge-pairing-revoke/index.ts:1): remote revoke and device wipe
- [`supabase/functions/bridge-heartbeat/index.ts`](C:/repos/chat2.0/supabase/functions/bridge-heartbeat/index.ts:1): bridge health ping

### ESP Bridge Firmware

- [`firmware/esp-bridge`](C:/repos/chat2.0/firmware/esp-bridge): ESP-IDF firmware workspace for the `ESP32-S3` bridge spike
- [`firmware/esp-bridge/main/main.c`](C:/repos/chat2.0/firmware/esp-bridge/main/main.c:1): current serial admin shell, Wi-Fi onboarding, and backend control-plane calls
- [`firmware/esp-bridge/README.md`](C:/repos/chat2.0/firmware/esp-bridge/README.md:1): firmware setup, build, and command reference
- future bridge work will also add bridge-specific control-plane functions under [`supabase/functions`](C:/repos/chat2.0/supabase/functions)

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

### 3a. Treat Bridge Docs As Source Of Truth For Firmware Work

Before changing ESP bridge behavior, read the bridge planning stack in this order:

- [docs/ESP_BRIDGE_FEATURE_ROADMAP.md](C:/repos/chat2.0/docs/ESP_BRIDGE_FEATURE_ROADMAP.md:1)
- [docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md](C:/repos/chat2.0/docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md:1)
- [docs/ESP_BRIDGE_PHASE0_IMPLEMENTATION_BRIEF.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_IMPLEMENTATION_BRIEF.md:1)
- [docs/ESP_BRIDGE_SESSION_ISSUANCE_AND_PAIRING_EXCHANGE.md](C:/repos/chat2.0/docs/ESP_BRIDGE_SESSION_ISSUANCE_AND_PAIRING_EXCHANGE.md:1)
- [docs/ESP_BRIDGE_PHASE0_PROGRESS_2026-04-23.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_PROGRESS_2026-04-23.md:1)

Keep `Phase 0` firmware serial-first and do not assume the future local dashboard or full local app transport already exists.

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

This repo does not keep Playwright specs as the main workflow. Prefer the repo smoke runner for dependable browser checks, then fall back to inline scripts or the Codex Playwright wrapper for custom debugging.

Primary smoke command:

```powershell
npm run qa:smoke
```

Headed mode:

```powershell
npm run qa:smoke:headed
```

Run a specific scenario:

```powershell
npm run qa:smoke:dm
```

Run the resume/background-send repro:

```powershell
npm run qa:smoke:resume
```

For custom flags, call the script directly:

```powershell
node scripts/playwright-smoke.mjs --scenario=auth,dm --run-name=my-check
```

Run the broader end-to-end sweep:

```powershell
npm run qa:smoke:full
```

If you have changed the app code and need a fresh preview build instead of reusing an already-running server, add `--no-reuse-server`.

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
- bridge planning and implementation docs listed in `Current Feature Focus`

## Before Shipping

Before push/deploy:

1. Confirm the change is intentionally scoped.
2. Run lint, typecheck, and build.
3. Run targeted Jest if existing tests cover the area.
4. Run a headed browser check for UI/realtime changes.
5. Review the final screens for visual consistency, especially on mobile.
