# Session Persistence And Mobile Resume Runbook

This runbook covers the mobile login persistence hardening shipped in April 2026.

## Goal

Shadow Chat should stay signed in for days or weeks when Supabase still has a valid saved refresh token. Mobile app resume should not send the user back to the login screen just because a session lookup or profile lookup briefly stalls.

## Current Behavior

- The Supabase browser client uses `persistSession: true` and `autoRefreshToken: true`.
- Initial auth restore still checks the normal session path first.
- If the app finds a saved refresh token but restore temporarily fails, it keeps the user in the restore screen and retries instead of rendering the login form.
- A lightweight resume watchdog runs on `visibilitychange`, `pageshow`, `focus`, and `online`.
- The watchdog calls the existing `ensureSession()` path only. It does not recreate clients or directly rebuild realtime subscriptions.

Relevant files:

- [src/hooks/useAuth.tsx](C:/repos/chat2.0/src/hooks/useAuth.tsx:1)
- [src/hooks/useSessionResumeRecovery.ts](C:/repos/chat2.0/src/hooks/useSessionResumeRecovery.ts:1)
- [src/components/auth/AuthGuard.tsx](C:/repos/chat2.0/src/components/auth/AuthGuard.tsx:1)
- [src/lib/supabase.ts](C:/repos/chat2.0/src/lib/supabase.ts:1)

## Composer Draft Restore

The group and DM composers persist unsent text through `useDraft`. Treat this as mobile-resume-sensitive behavior because the desktop and mobile composers can both be mounted with the same draft key while only one is visible.

Current guardrails:

- Whitespace-only drafts are treated as empty and removed from `localStorage`.
- Mounted composer instances with the same draft key sync through the `shadowchat:draft-update` window event.
- Empty draft cleanup on `pagehide` and hidden `visibilitychange` only runs for the visible composer, so a hidden desktop or mobile composer cannot wipe a real draft owned by the active composer.

Regression checks:

```powershell
npx jest --runInBand --runTestsByPath tests/useDraft.test.tsx tests/MessageInput.test.tsx
npm run build
```

For browser validation, use a mobile viewport and verify:

- `localStorage.draft-general = "   "` reloads into an empty composer and removes the storage key.
- A partial message typed through the visible composer survives reload.
- Typing only spaces leaves the visible composer empty and no draft key stored.

## Rollback Checkpoints

The changes were shipped as two small commits on `main`:

- `36fb65d` - `Keep saved sessions in restore mode`
- `543801c` - `Refresh sessions on mobile resume`

Rollback only the resume watchdog:

```powershell
git revert 543801c
```

Rollback the full login-persistence hardening:

```powershell
git revert 543801c 36fb65d
```

After any rollback, run the standard checks and production smoke before redeploying.

## Required Checks

For any auth, session, or realtime-adjacent edit:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npm test -- --runInBand
```

Minimum headed browser smoke:

```powershell
node scripts/playwright-smoke.mjs --scenario=auth,resume-send --headed --no-reuse-server
```

Recommended production smoke after deploy:

```powershell
node scripts/playwright-smoke.mjs --base-url=https://shadowchat-1-0.netlify.app --scenario=auth,resume-send --account-mode=env --headed --slow-mo=300 --run-name=prod-session-check
```

When using throwaway accounts for auth/session checks, delete:

- auth users
- matching `public.users` rows
- group messages sent by those user ids
- DM messages and conversations containing those user ids

## What Not To Reintroduce

- Do not await Supabase queries directly inside `supabase.auth.onAuthStateChange(...)`.
- Do not recreate the Supabase client or all realtime subscriptions on every foreground event.
- Do not show the login form while a saved refresh token exists and recovery is still plausible.
- Do not clear local auth storage unless the user explicitly signs out or the backend reports the auth user truly no longer exists.

## Supabase Settings To Verify

If users still get logged out too often, check Supabase Auth settings before changing app code:

- JWT expiry is not extremely short.
- Inactivity timeout is not set aggressively.
- Time-boxed sessions are not set too short.
- Single-session-per-user is not enabled unless intentional.

Supabase sessions are normally sustained by refresh tokens. If the backend policy expires or revokes those refresh tokens, the app cannot safely keep the user signed in.
