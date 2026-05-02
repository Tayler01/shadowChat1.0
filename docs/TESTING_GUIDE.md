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
npx jest --runInBand
```

Run a specific test file:

```powershell
npx jest --runInBand tests/useDirectMessages.test.tsx
```

Current coverage is strongest around:

- auth hooks
- auth-gated startup loading copy
- group chat hooks
- DM hooks
- message input behavior
- thread reply and pinned message UI
- session refresh and realtime reset helpers
- theme and user search hooks
- Boards map routing and board-chat rendering
- admin feedback review
- weather widget and location settings

## When To Add Manual Browser QA

Do browser validation when changing:

- realtime subscriptions
- DM unread behavior
- message sending
- clickable links or link previews
- uploads
- auth/session recovery
- mobile navigation or composer layout
- theme and visual polish
- push notification setup
- Boards map layout, per-board badges, News Feed layout, reaction menus, and source-health admin UI
- admin access, admin subpages, role badges, or channel-ban moderation
- active-user indicators or presence visibility
- General Chat weather widget or Account & Profile weather location settings

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

For release handoff or a major feature wrap-up, prefer a fresh headed preview run so stale preview assets cannot hide frontend regressions:

```powershell
node scripts/playwright-smoke.mjs --scenario=full --run-name=full-smoke-release --headed --slow-mo=100 --no-reuse-server
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

Boards/News-specific Jest coverage currently lives in:

- [tests/NewsView.test.tsx](C:/repos/chat2.0/tests/NewsView.test.tsx:1)
- [tests/NewsChat.test.tsx](C:/repos/chat2.0/tests/NewsChat.test.tsx:1)
- [tests/linkPreview.test.ts](C:/repos/chat2.0/tests/linkPreview.test.ts:1)

Admin/weather focused Jest coverage currently lives in:

- [tests/SettingsView.test.tsx](C:/repos/chat2.0/tests/SettingsView.test.tsx:1)
- [tests/AdminFeedbackReview.test.tsx](C:/repos/chat2.0/tests/AdminFeedbackReview.test.tsx:1)
- [tests/PublicProfileDialog.test.tsx](C:/repos/chat2.0/tests/PublicProfileDialog.test.tsx:1)
- [tests/WeatherWidget.test.tsx](C:/repos/chat2.0/tests/WeatherWidget.test.tsx:1)
- [tests/WeatherLocationSettings.test.tsx](C:/repos/chat2.0/tests/WeatherLocationSettings.test.tsx:1)
- [tests/weather.test.ts](C:/repos/chat2.0/tests/weather.test.ts:1)

Latest focused release smoke recorded for the weather widget release:

- Date: May 2, 2026
- Local gates: `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, `npx jest --runInBand`, `npm run build`
- Browser check: headed Chromium against `npx vite preview --host 127.0.0.1 --port 4184 --strictPort`
- Artifacts: `output/playwright/weather-widget/final-desktop-weather-popup.png`, `output/playwright/weather-widget/final-mobile-chat-header.png`, and `output/playwright/weather-widget/final-weather-settings-card.png`

Latest full release smoke recorded for the feedback submission release:

- Date: April 28, 2026
- Command: `node scripts/playwright-smoke.mjs --scenario=full --run-name=full-smoke-feedback-release-20260428 --headed --slow-mo=100 --no-reuse-server`
- Result: passed all eight scenarios
- Summary: `output/playwright/full-smoke-feedback-release-20260428/summary.json`

For link preview changes, verify a local preview build with a signed-in account and send a message containing a public `https://` URL. The message should keep the link clickable immediately, then load one preview card without rerendering the whole chat thread. Test at least one generic Open Graph link and one `x.com`/`twitter.com` link because X metadata can arrive through the oEmbed fallback.

For Boards changes, verify both desktop and mobile:

- Boards nav label opens the bubble map, and old `view=news` URLs route to Boards
- board bubbles show per-board unread counts and reset to the default layout when Boards is opened
- dragging a bubble moves it and pushes overlapping bubbles aside without idle drift
- News Feed and all chat boards open from their bubbles and have a clear back button
- feed tile media placement, no empty image placeholders, and scrollable modal media
- feed and chat reaction menus stay inside the viewport
- selected reactions render as compact counts
- News Chat, Investing Chat, Learning Chat, and Crypto Chat send/edit/delete/reaction realtime between two signed-in users
- Board bubbles show their own unread counts, the Boards nav badge combines chat-board counts only, and News Feed clears immediately after opening

For News scraper changes, start with proof mode:

```powershell
npm run news:scrape:proof
```

Then run one real cycle with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set:

```powershell
node services/news-scraper/src/index.mjs --once
```

After the one-cycle check, query `news_sources` and today's `news_feed_items`.
The source should update `last_checked_at`; successful sources should update
`last_success_at`, `health_status`, and `last_seen_external_id`. Only current
Eastern-day posts should appear on the board.

For Settings feedback changes, verify the wizard from Settings, submit at least one bug or feature report with an image attachment, then query `public.feedback_submissions` as the same user and download the stored object from `feedback-attachments`. This confirms both table RLS and private Storage policy behavior.

For Feedback Review changes, verify Settings > Admin > Feedback Review as an
`admin` or `sub_admin`. The list should show submitted bugs and suggestions,
and the full popup should show title, description, submitter metadata, and
signed image attachments. Admin review is read-only for now.

For Admin Access changes, verify a full `admin` can open Settings > Admin >
Admin Access, search the complete user list, grant/revoke sub-admin access, and
cannot remove the single full admin from that UI. Verify sub-admin users can see
operator tools but cannot see Admin Access.

For channel-ban moderation changes, verify an `admin` or `sub_admin` can open
another user's profile popup from an avatar, open Channel bans, save timed and
permanent scopes, clear all scopes, and cannot moderate the single full admin
account. Then verify the target user is blocked from General Chat, the selected
chat boards, and/or all interaction according to the selected scopes while DMs
remain usable and read access remains open.

For profile admin-access changes, verify the full admin can grant/remove
sub-admin access from a user's profile popup, and sub-admin users cannot see or
use that role-management control.

For weather changes, verify General Chat header on desktop and mobile, the
forecast popup, and Settings > Account & Profile > Weather Location. Weather
preferences should be scoped to the signed-in user and should not appear on
public profile data.

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
- verify Settings exposes `App Setup & User Guide` and can reopen the same guide

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
- admin subpages and feedback review
- channel-ban controls in public profile popups
- weather widget and weather settings
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
