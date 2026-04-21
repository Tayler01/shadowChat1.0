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

This repo keeps Playwright as an installed tool for ad hoc debugging rather than as the main test-runner workflow.

### Headed Smoke Script Pattern

Use an inline Node script with the installed `playwright` package:

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

## Useful Files While Testing

- [`tests/setupTests.ts`](C:/repos/chat2.0/tests/setupTests.ts:1)
- [`jest.config.js`](C:/repos/chat2.0/jest.config.js:1)
- [`tsconfig.test.json`](C:/repos/chat2.0/tsconfig.test.json:1)
- [`src/hooks/useMessages.tsx`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [`src/hooks/useDirectMessages.tsx`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
