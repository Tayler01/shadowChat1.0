# Production Smoke Testing

Use this workflow after a Netlify production deploy or whenever production auth, session resume, or realtime send behavior needs a browser-level check.

## Why Stable Accounts Are Required

The smoke runner can create disposable users for local and preview environments. Production Supabase auth may require email confirmation, so a disposable production signup can complete without returning an active session. Production smoke therefore must sign in with two stable, email-confirmed `PLAYWRIGHT_ACCOUNT_*` users.

This workspace has stable production smoke credentials stored only in the local `.env`. Do not commit real smoke account passwords.

## Required Environment Variables

Add these to local `.env` or the shell/CI secret store that runs the production smoke:

```powershell
PLAYWRIGHT_ACCOUNT_1_EMAIL=smoke-user-1@example.com
PLAYWRIGHT_ACCOUNT_1_PASSWORD=change_me
PLAYWRIGHT_ACCOUNT_1_USERNAME=smokeuser1
PLAYWRIGHT_ACCOUNT_1_DISPLAY_NAME=Smoke User 1
PLAYWRIGHT_ACCOUNT_2_EMAIL=smoke-user-2@example.com
PLAYWRIGHT_ACCOUNT_2_PASSWORD=change_me
PLAYWRIGHT_ACCOUNT_2_USERNAME=smokeuser2
PLAYWRIGHT_ACCOUNT_2_DISPLAY_NAME=Smoke User 2
```

The email and password values are required. Username and display name are optional, but keeping them set makes artifacts and DM targeting easier to read.

## Creating Or Repairing The Accounts

Use two dedicated smoke users. Do not reuse a personal admin account.

1. Create the users in Supabase Auth or with the Supabase Auth Admin API.
2. Set a strong password for each user.
3. Mark both users as email-confirmed.
4. Ensure each user has a matching `public.users` profile with a unique username and display name.
5. Save the credentials to local `.env` or the deployment secret store.
6. Verify password sign-in before running the smoke.

If the accounts are created through normal production signup, finish the email-confirmation step before using them in Playwright. If the accounts are created through an admin path, set the metadata keys `username`, `display_name`, and `full_name` so the `public.users` trigger can bootstrap readable profiles.

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
node scripts/playwright-smoke.mjs --base-url=https://shadowchat-1-0.netlify.app --scenario=auth,resume-send --account-mode=env --run-name=prod-postdeploy --headed --slow-mo=300
```

Headless direct equivalent:

```powershell
node scripts/playwright-smoke.mjs --base-url=https://shadowchat-1-0.netlify.app --scenario=auth,resume-send --account-mode=env --run-name=prod-postdeploy-headless
```

## Reading Results

The runner writes artifacts to:

```text
output/playwright/<run-name>/
```

Check `summary.json` first. Screenshots, storage state, fixtures, and logs sit beside it.

Common failure meanings:

- `Signup ... completed without an active session`: production is running in disposable signup mode or the `PLAYWRIGHT_ACCOUNT_*` variables are missing.
- `Missing Playwright account ... credentials`: `--account-mode=env` was requested but one of the required email/password variables is absent.
- Timeout or browser crash after sign-in: rerun `npm run qa:smoke:prod` or `npm run qa:smoke:prod:headed` to observe the visible browser. On Windows, headed mode is the preferred debug path for local Chromium instability.

## Post-Deploy Checklist

1. Confirm Netlify production deploy completed.
2. Confirm local `.env` or CI has both stable smoke accounts.
3. Run `npm run qa:smoke:prod`.
4. Use `npm run qa:smoke:prod:headless` only for unattended environments where headless Chromium is stable.
5. Keep the latest passing artifact path with the deploy notes.
