# Testing Guide

This project uses a mix of static checks, Jest coverage, and real browser validation.

## Baseline Checks

Run these for almost every change:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

## Unit And Hook Tests

Run the suite:

```powershell
npm test -- --runInBand
```

Run a specific test file:

```powershell
npm test -- --runInBand tests/useDirectMessages.test.tsx
```

Current coverage is strongest around:

- auth hooks
- group chat hooks
- DM hooks
- message input behavior
- thread reply and pinned message UI
- session refresh and realtime reset helpers
- theme and user search hooks

## When To Add Manual Browser QA

Do browser validation when changing:

- realtime subscriptions
- DM unread behavior
- message sending
- uploads
- auth/session recovery
- mobile navigation or composer layout
- theme and visual polish
- push notification setup

## Recommended Local Browser Loop

Use a preview build for stable QA:

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4174
```

## Playwright Usage

This repo keeps Playwright as a smoke and debugging tool rather than as the main assertion-heavy test runner.

### Repo Smoke Runner

Use the repo-local runner when you want a dependable browser pass with managed preview startup, screenshots, logs, and repeatable flows:

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

Run the same check against production in a visible browser:

```powershell
npm run qa:smoke:prod
```

Run the explicit headed alias when you want the command name to say what it does:

```powershell
npm run qa:smoke:prod:headed
```

Run the production smoke headless only when the local or CI browser environment is known to be stable:

```powershell
npm run qa:smoke:prod:headless
```

Run the broader end-to-end sweep:

```powershell
npm run qa:smoke:full
```

For custom flags, call the script directly:

```powershell
node scripts/playwright-smoke.mjs --scenario=auth,dm --run-name=my-check --base-url=http://127.0.0.1:4174
```

Useful direct-script flags:

- `--scenario=auth,dm,mobile-dm-back`
- `--scenario=auth,resume-send`
- `--headed`
- `--slow-mo=300`
- `--base-url=http://127.0.0.1:4174`
- `--account-mode=env`
- `--no-reuse-server`
- `--skip-build`
- `--run-name=my-check`

What the smoke runner does by default:

- reuses `http://127.0.0.1:4174` if it is already up
- otherwise runs `vite build` and starts `vite preview`
- signs in with `PLAYWRIGHT_ACCOUNT_*` credentials if present
- otherwise creates disposable Supabase users for a clean DM run
- saves screenshots, logs, storage state, and a JSON summary under `output/playwright/<run-name>/`

When you have changed app code and want the latest build instead of the already-running preview, add `--no-reuse-server`.

Production smoke is different from local smoke: it must use the two stable, email-confirmed `PLAYWRIGHT_ACCOUNT_*` users from `.env.testing.local` because production signup can require email confirmation and return no active session. See [`docs/PRODUCTION_SMOKE_TESTING.md`](C:/repos/chat2.0/docs/PRODUCTION_SMOKE_TESTING.md:1) for canonical account details, setup, commands, and artifact triage.

Auth/session persistence checks and rollback notes live in [`docs/SESSION_PERSISTENCE_RUNBOOK.md`](C:/repos/chat2.0/docs/SESSION_PERSISTENCE_RUNBOOK.md:1). Use that runbook whenever a change touches saved sessions, mobile resume, auth restore, or realtime reconnect behavior.

Current smoke scenarios:

- `auth`: both accounts land in the authenticated app shell
- `group-chat`: verifies general chat send, reactions, image upload, file upload, and voice upload between two accounts
- `settings`: checks desktop notification/settings UI, preference toggles, and push registration on a persistent browser profile
- `dm`: starts or opens a DM, sends a real message, verifies read-clearing after reload
- `resume-send`: simulates a background/foreground cycle, then verifies group-chat and DM sends still complete
- `profile-visual`: captures the desktop profile screen for visual review
- `mobile-dm-back`: validates the mobile DM thread back flow
- `mobile-settings-visual`: checks the mobile settings layout and notification toggle geometry

Disposable accounts are the most deterministic option. Reused env-backed accounts can carry old threads and unread state from earlier runs.

### Bridge TUI

Run the local layout regression after any PowerShell TUI change:

```powershell
npm run bridge:tui:test
```

That check covers long-message wrapping, side-feed clipping, long draft input visibility, DM routing, unread counts, scroll state, and realtime backfill flags.

Live bridge smoke still requires a paired ESP on a scanned serial port:

```powershell
npm run bridge:tui:smoke
```

For `@ai` validation, first deploy `openai-chat` and `bridge-group-send`, then send `@ai health check` in group chat from the TUI. The user message should send as the bridge profile and the answer should appear from Shado.

The shipped TUI hardening and release/rollback notes live in [`docs/ESP_BRIDGE_TUI_PRODUCTION_READINESS.md`](C:/repos/chat2.0/docs/ESP_BRIDGE_TUI_PRODUCTION_READINESS.md:1).

### iPhone Home Screen Note

The iPhone Home Screen app should be treated as a distinct runtime when debugging auth or realtime issues. A flow that passes in Safari can still fail in standalone mode if session recovery or auth-state callbacks are blocking.

Important guardrails:

- do not put async Supabase work directly inside `supabase.auth.onAuthStateChange(...)`
- prefer Supabase's documented `worker: true` and heartbeat reconnect behavior before inventing custom client recreation logic
- verify resume/send after deploy, not only in local preview

### Phone Install Onboarding

Use fresh disposable users for the new-account phone setup guide, then delete them after the run.

Checks to cover:

- sign up or seed the phone-install pending marker for the new temp account
- verify the guide opens after first authenticated load
- verify the iPhone tab shows Safari, Share, `Add to Home Screen`, and `Add`
- verify the Android tab shows either the native `Install Now` path or Chrome menu fallback
- verify Settings exposes `Phone App Setup` and can reopen the same guide

The stable `PLAYWRIGHT_ACCOUNT_*` users should stay out of this test so routine smoke runs are not blocked by onboarding. See [docs/PHONE_INSTALL_ONBOARDING.md](C:/repos/chat2.0/docs/PHONE_INSTALL_ONBOARDING.md:1).

### Headed Smoke Script Pattern

For one-off exploration, inline scripts are still fine:

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

### Recommended Artifact Location

Store artifacts under:

```text
output/playwright/<run-name>/
```

Examples:

- `output/playwright/smoke-20260422/`
- `output/playwright/dm-realtime-debug/`
- `output/playwright/final-mobile-product-pass/`

### Good Playwright Targets

- login flow
- group message send/receive
- DM send/receive in two browser contexts
- profile edit
- settings and push setup
- mobile nav and composer spacing

## Realtime Validation Checklist

### Group Chat

1. Sign into two accounts
2. Open chat on both
3. Send a message from account A
4. Confirm it appears on account B without refresh
5. Confirm reactions, edits, and deletes propagate correctly

### DMs

1. Sign into two accounts
2. Open DMs on both
3. Keep account B on a different thread or inbox view
4. Send a DM from account A to account B
5. Confirm the thread moves to the top and unread count updates live on account B
6. Open the DM and confirm unread clears

## Mobile QA Checklist

- login screen spacing
- sidebar and bottom nav tap targets
- DM composer overlap
- settings scroll and action button layout
- profile cards and stats layout
- toast placement above nav/composer

## Known Testing Realities

- Push delivery cannot be fully trusted in incognito-style automation contexts.
- Real notification delivery still needs at least one normal browser/device validation.
- Preview mode is more stable than hot-reload mode for visual and realtime verification.
- Browser automation is a strong regression signal for resume issues, but final confidence for iPhone Home Screen behavior still comes from one real-device validation pass.

## Useful Files While Testing

- [`tests/setupTests.ts`](C:/repos/chat2.0/tests/setupTests.ts:1)
- [`jest.config.js`](C:/repos/chat2.0/jest.config.js:1)
- [`tsconfig.test.json`](C:/repos/chat2.0/tsconfig.test.json:1)
- [`src/hooks/useMessages.tsx`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [`src/hooks/useDirectMessages.tsx`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
