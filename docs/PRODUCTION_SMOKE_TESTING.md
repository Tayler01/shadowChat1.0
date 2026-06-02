# Production Smoke Testing

Use this workflow after a Netlify production deploy or whenever production auth, session resume, or realtime send behavior needs a browser-level check.

## Documentation Status - June 2, 2026

This runbook is current for the shipped production smoke flow and now records
the invite-only signup/email-verification rollout implications. The auth
rollout is implemented; production smoke should continue to use stable
email-confirmed accounts instead of disposable signup.

## Why Stable Accounts Are Required

The smoke runner can create disposable users for local and preview environments. Production Supabase auth may require email confirmation, so a disposable production signup can complete without returning an active session. Production smoke therefore must sign in with two stable, email-confirmed `PLAYWRIGHT_ACCOUNT_*` users.

This workspace has stable production smoke credentials stored only in the local `.env.testing.local`. Do not commit real smoke account passwords.

## Invite And Email Verification Rollout Impact

Invite-only signup and required email verification make stable production smoke
accounts a hard deploy prerequisite. Before each production auth deploy:

1. Confirm both canonical smoke users exist in Supabase Auth.
2. Confirm both users are email-confirmed.
3. Confirm both users have usable passwords and matching `public.users`
   profiles.
4. Confirm local `.env.testing.local` or CI secrets provide both
   `PLAYWRIGHT_ACCOUNT_*` credential sets.
5. Run `npm run qa:smoke:prod` after the production deploy so auth regressions
   are separated from deploy availability issues.

Do not rely on production disposable signup after invite enforcement is enabled.
If a production signup proof is explicitly approved, use one dedicated test
invite, confirm the email, verify first login, then disable or expire the
invite and document any profile cleanup in the deploy notes.

## Production Test Data Cleanup

Production smoke must leave the live app clean. Any scenario that creates real
messages, posts, uploads, or attachments must delete those rows and Storage
objects before the run is considered complete. This includes test images,
videos, audio or voice clips, thumbnails or derived media, and generic file
attachments. If cleanup cannot be verified, keep the payload minimal and record
the remaining rows or object paths in the deploy notes as residual risk.

For General Chat scroll timing on production, use the metrics-only probe:
`npm run qa:chat-scroll:metrics -- --base-url=https://shadochat.online --skip-build`.
Do not run seeded chat-scroll scenarios against production unless explicit
production data-seeding approval has been given; the script requires
`--allow-production-seed` for known production targets.

## Canonical Smoke Accounts

Always check for and use these two production smoke users before creating any new test accounts:

| Slot | Email | Username | Display name |
| --- | --- | --- | --- |
| Account 1 | `shadowchat-smoke-prod-a@example.com` | `shadowchat_smoke_prod_a` | `ShadowChat Smoke A` |
| Account 2 | `shadowchat-smoke-prod-b@example.com` | `shadowchat_smoke_prod_b` | `ShadowChat Smoke B` |

These accounts should stay email-confirmed in Supabase Auth and should not be deleted during test-account cleanup.

## Required Environment Variables

Add these to local `.env.testing.local` or the shell/CI secret store that runs the production smoke:

```powershell
PLAYWRIGHT_ACCOUNT_1_EMAIL=shadowchat-smoke-prod-a@example.com
PLAYWRIGHT_ACCOUNT_1_PASSWORD=change_me
PLAYWRIGHT_ACCOUNT_1_USERNAME=shadowchat_smoke_prod_a
PLAYWRIGHT_ACCOUNT_1_DISPLAY_NAME=ShadowChat Smoke A
PLAYWRIGHT_ACCOUNT_2_EMAIL=shadowchat-smoke-prod-b@example.com
PLAYWRIGHT_ACCOUNT_2_PASSWORD=change_me
PLAYWRIGHT_ACCOUNT_2_USERNAME=shadowchat_smoke_prod_b
PLAYWRIGHT_ACCOUNT_2_DISPLAY_NAME=ShadowChat Smoke B
```

The email and password values are required. Username and display name are optional, but keeping them set makes artifacts and DM targeting easier to read.

The smoke runner loads `.env`, then `.env.testing.local`, then process environment variables. Values in `.env.testing.local` override `.env`, and process environment variables override both.

## Creating Or Repairing The Accounts

Use the two dedicated smoke users above. Do not reuse a personal admin account and do not create fresh production smoke users unless those canonical accounts cannot be repaired.

1. Check Supabase Auth for the two canonical account emails.
2. If either is missing, create it in Supabase Auth or with the Supabase Auth Admin API.
3. Set a strong password for each user.
4. Mark both users as email-confirmed.
5. Ensure each user has a matching `public.users` profile with a unique username and display name.
6. Save the credentials to local `.env.testing.local` or the deployment secret store.
7. Verify password sign-in before running the smoke.

If the accounts are created through normal production signup, finish the email-confirmation step before using them in Playwright. If the accounts are created through an admin path, set the metadata keys `username`, `display_name`, and `full_name` so the `public.users` trigger can bootstrap readable profiles.

Prefer repairing these canonical users through Supabase Auth Admin instead of
consuming normal product invites. Use a real invite for smoke only when the
release explicitly needs to prove production signup itself.

## Commands

Run the recommended local post-deploy smoke in a visible browser:

```powershell
npm run qa:smoke:prod
```

Run the explicit headed alias when you want the command name to say what it does:

```powershell
npm run qa:smoke:prod:headed
```

Run headless only when the local or CI browser environment is known to be stable:

```powershell
npm run qa:smoke:prod:headless
```

Default direct equivalent:

```powershell
node scripts/playwright-smoke.mjs --base-url=https://shadochat.online --scenario=auth,resume-send --account-mode=env --run-name=prod-postdeploy --headed --slow-mo=300
```

Full production Settings check after a deploy:

```powershell
node scripts/playwright-smoke.mjs --base-url=https://shadochat.online --scenario=settings --account-mode=env --run-name=prod-settings-postdeploy --headed --slow-mo=100 --skip-build
```

Headless direct equivalent:

```powershell
node scripts/playwright-smoke.mjs --base-url=https://shadochat.online --scenario=auth,resume-send --account-mode=env --run-name=prod-postdeploy-headless
```

## Reading Results

The runner writes artifacts to:

```text
output/playwright/<run-name>/
```

Check `summary.json` first. Screenshots, storage state, fixtures, and logs sit beside it.

Common failure meanings:

- `Signup ... completed without an active session`: production is running in disposable signup mode or the `PLAYWRIGHT_ACCOUNT_*` variables are missing.
- `Invalid invite`, `Invite required`, or similar errors during production
  smoke: the runner is using disposable signup or missing env-backed stable
  accounts. Production smoke should use `--account-mode=env`.
- `Missing Playwright account ... credentials`: `--account-mode=env` was requested but one of the required email/password variables is absent.
- Auth requests returning HTTP `402` with `exceed_cached_egress_quota` or `exceed_egress_quota`: Supabase has restricted the project for usage quota. This is not a password or app-code failure. Restore Supabase service from the dashboard or contact Supabase support, then rerun the production smoke. The login screen should show a backend-quota message while the restriction is active.
- Timeout or browser crash after sign-in: rerun `npm run qa:smoke:prod` or `npm run qa:smoke:prod:headed` to observe the visible browser. On Windows, headed mode is the preferred debug path for local Chromium instability.

## Post-Deploy Checklist

1. Confirm Netlify production deploy completed.
2. Confirm local `.env.testing.local` or CI has both stable smoke accounts.
3. Run `npm run qa:smoke:prod`.
4. Use `npm run qa:smoke:prod:headless` only for unattended environments where headless Chromium is stable.
5. Open the Boards tab with a stable account and confirm the low-friction board map, contained labels, non-overlapping objects, News Feed, and chat boards render.
6. If the deploy touched News or Boards, verify Render worker health in `news_sources`, send one board-chat link to confirm previews, and confirm opened boards do not show duplicate secondary headers or manual refresh controls.
7. Open General Chat and confirm active-user count plus weather widget render without header overlap.
8. Open Settings > Account & Profile and confirm Weather Location renders.
9. If the deploy touched admin tools, verify Settings > Admin subpages with an operator account.
10. If the deploy touched moderation, verify an operator can open another
    user's profile popup and see Channel bans without using a personal admin
    account for routine smoke traffic.
11. Keep the latest passing artifact path with the deploy notes.

## Latest Documentation Refresh Deploy

June 1, 2026 documentation refresh:

- Commit `2439624` pushed directly to `main`.
- GitHub Actions `Netlify Production Deploy` run `26760574110` passed.
- Workflow completed install, lint, typecheck, Netlify build, metadata verification, production deploy, and in-app release publish.

## Historical Release Checks

### Latest Feedback Release Checks

April 28, 2026 post-deploy checks:

- Production Settings smoke passed: `output/playwright/prod-feedback-settings-postdeploy/summary.json`
- Production feedback E2E passed with a real submission row and private attachment download: `output/playwright/feedback-prod-e2e-1777419359750/summary.json`

### Latest Weather/Admin Local Release Checks

May 2, 2026 local post-build checks:

- Full Jest suite passed: `npx jest --runInBand`
- Production build passed: `npm run build`
- Headed weather widget preview passed with artifacts under `output/playwright/weather-widget/`
- Netlify Production Deploy workflow passed for commit `601c3c9`

### Latest Channel Ban Moderation Checks

May 2, 2026 channel-ban moderation release:

- Local gates passed: `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`
- Focused Jest passed: `npx jest --runInBand tests/PublicProfileDialog.test.tsx tests/MessageItem.test.tsx tests/useMessages.test.tsx tests/NewsChat.test.tsx`
- Supabase migration `20260502070543_channel_bans_moderation.sql` applied and migration history aligned
- Netlify Production Deploy workflow passed for commit `f868bce`

### Latest Boards/Header Checks

May 2, 2026 Boards header and bubble-motion adjustment:

- Local gates passed: `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, focused Jest, `npm run build`
- Headed preview check passed against `npx vite preview --host 127.0.0.1 --port 4175 --strictPort`
- Verified desktop/mobile Boards map, collision motion, News Chat/News Feed without duplicate subheaders, and removed visible refresh controls
- Artifacts: `output/playwright/header-bubbles-adjustment/`

May 3, 2026 Boards map polish:

- Local gates passed: `npx jest --runInBand tests/BoardBubbleMap.test.tsx`, `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`
- Headed desktop and mobile preview checks passed against local Vite preview
- Verified contained labels, no visual overlap after drag collisions, collision sparkle feedback, sound-effects-aware collision tap, and readable pill spin settling
- Artifacts: `output/playwright/boards-map-polish/`
