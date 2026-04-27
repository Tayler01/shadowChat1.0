# Stability And QA Updates (April 2026)

This document records the stabilization work completed before the next major feature phase.

## What Was Fixed

### DM Read-State Consistency

- DM threads now mark messages as read through the canonical `mark_dm_messages_read` RPC instead of mixing direct `read_at` updates with RPC-driven unread counts.
- This keeps unread badges, DM inbox counts, and reload behavior in sync.

Relevant files:

- [src/hooks/useDirectMessages.tsx](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
- [src/lib/supabase.ts](C:/repos/chat2.0/src/lib/supabase.ts:1)
- [supabase/migrations/20250626225830_weathered_unit.sql](C:/repos/chat2.0/supabase/migrations/20250626225830_weathered_unit.sql:1)
- [supabase/migrations/20260420003000_fix_get_dm_conversations_unread_count.sql](C:/repos/chat2.0/supabase/migrations/20260420003000_fix_get_dm_conversations_unread_count.sql:1)

### Upload Send Reliability

- Image, file, and voice uploads now await the actual message send path instead of fire-and-forget behavior.
- Failed inserts no longer leave the UI in a misleading success state after upload completes.
- Message-input errors now surface toasts instead of failing silently.

Relevant files:

- [src/components/chat/MessageInput.tsx](C:/repos/chat2.0/src/components/chat/MessageInput.tsx:1)
- [src/hooks/useMessages.tsx](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [src/hooks/useDirectMessages.tsx](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)

### Mobile DM Navigation

- The mobile DM inbox back path now returns to chat correctly instead of bouncing the user back into the last thread.

Relevant files:

- [src/components/dms/DirectMessagesView.tsx](C:/repos/chat2.0/src/components/dms/DirectMessagesView.tsx:1)

### DM Reaction Schema Alignment

- DM reactions no longer rely on the broken assumption that DM message ids can live in the channel-message foreign key.
- A follow-up migration added explicit DM reaction support and hardened the related count/stat paths.

Relevant files:

- [supabase/migrations/20260421190000_fix_dm_message_reactions.sql](C:/repos/chat2.0/supabase/migrations/20260421190000_fix_dm_message_reactions.sql:1)

### Settings UI Consistency

- Notification toggles in Settings were restyled and normalized so they match the rest of the app’s switch geometry and semantics.

Relevant files:

- [src/components/settings/SettingsView.tsx](C:/repos/chat2.0/src/components/settings/SettingsView.tsx:1)

### Resume / Background Send Reliability

- Realtime now uses Supabase’s documented `worker: true` option so heartbeat timing is less vulnerable to background throttling.
- The app attaches a heartbeat reconnect hook to recover when Realtime reports disconnection or timeout.
- Resume-time auth recovery is deduplicated and timeout-bounded so stalled session lookups and `setSession()` calls cannot leave sends hanging forever.
- The heavyweight “recreate the client on every visibility change” path was removed from the shared visibility refresh hook.

Relevant files:

- [src/lib/supabase.ts](C:/repos/chat2.0/src/lib/supabase.ts:1)
- [src/hooks/useVisibilityRefresh.ts](C:/repos/chat2.0/src/hooks/useVisibilityRefresh.ts:1)

### Session Persistence Hardening

- Saved-session restore now stays in reconnect mode instead of showing the login form when a stored refresh token exists and mobile restore is temporarily slow.
- A lightweight resume watchdog refreshes the saved session on foreground and online events without rebuilding realtime subscriptions.
- Rollback checkpoints and required smoke checks are documented in [docs/SESSION_PERSISTENCE_RUNBOOK.md](C:/repos/chat2.0/docs/SESSION_PERSISTENCE_RUNBOOK.md:1).

Relevant files:

- [src/hooks/useAuth.tsx](C:/repos/chat2.0/src/hooks/useAuth.tsx:1)
- [src/hooks/useSessionResumeRecovery.ts](C:/repos/chat2.0/src/hooks/useSessionResumeRecovery.ts:1)
- [src/components/auth/AuthGuard.tsx](C:/repos/chat2.0/src/components/auth/AuthGuard.tsx:1)

### Home Screen iPhone Resume Deadlock

- The critical Home Screen-specific fix was in auth state handling.
- Supabase warns against doing async Supabase work directly inside `onAuthStateChange` callbacks because it can deadlock session operations.
- The app now keeps the auth callback synchronous and defers profile/session follow-up work until after the callback returns.
- This resolved the “Sending...” hang that still persisted in the installed iPhone Home Screen app after the first reconnect hardening pass.

Relevant files:

- [src/hooks/useAuth.tsx](C:/repos/chat2.0/src/hooks/useAuth.tsx:1)
- [src/lib/auth.ts](C:/repos/chat2.0/src/lib/auth.ts:1)

## QA And Test Improvements

### Jest Stability

- The full Jest suite was repaired and now runs reliably in-band on Windows.
- Several stale tests were updated to reflect current message-send, auth, and UI behavior.
- Resume/session regressions now have explicit tests.

Key tests:

- [tests/useAuth.test.tsx](C:/repos/chat2.0/tests/useAuth.test.tsx:1)
- [tests/refreshSessionLocked.test.ts](C:/repos/chat2.0/tests/refreshSessionLocked.test.ts:1)
- [tests/useMessages.test.tsx](C:/repos/chat2.0/tests/useMessages.test.tsx:1)
- [tests/useDirectMessages.test.tsx](C:/repos/chat2.0/tests/useDirectMessages.test.tsx:1)
- [tests/useVisibilityRefresh.test.tsx](C:/repos/chat2.0/tests/useVisibilityRefresh.test.tsx:1)

### Playwright Smoke Coverage

- A repo-local smoke runner was added to make browser QA repeatable across auth, DMs, group chat, reactions, uploads, mobile navigation, settings visuals, and resume-send regressions.
- The runner supports foreground observation, artifact capture, reusable test accounts, and production smoke checks.

Relevant files:

- [scripts/playwright-smoke.mjs](C:/repos/chat2.0/scripts/playwright-smoke.mjs:1)
- [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1)

## Current Recommended Smoke Checks

Before shipping realtime or mobile-sensitive changes, run:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npx jest --runInBand
node scripts/playwright-smoke.mjs --scenario=auth,resume-send --headed --no-reuse-server
```

For larger chat/UI changes, also run:

```powershell
node scripts/playwright-smoke.mjs --scenario=full --headed --no-reuse-server
```

## Deployment Notes

- Production deploys are done from `main`.
- After deploy, production should be smoke-tested directly, not only through the local preview.
- The minimum post-deploy checks are login, group chat send, DM send, and the resume-send flow.

## Important Maintenance Notes

- Treat [src/lib/supabase.ts](C:/repos/chat2.0/src/lib/supabase.ts:1), [src/hooks/useAuth.tsx](C:/repos/chat2.0/src/hooks/useAuth.tsx:1), [src/hooks/useMessages.tsx](C:/repos/chat2.0/src/hooks/useMessages.tsx:1), and [src/hooks/useDirectMessages.tsx](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1) as a connected stability surface.
- Do not reintroduce async Supabase calls directly inside `supabase.auth.onAuthStateChange(...)`.
- Prefer Supabase’s documented reconnect/session behavior over custom client recreation when debugging mobile resume issues.
