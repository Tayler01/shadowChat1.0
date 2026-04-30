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

### Mobile Chat Viewport Density

- Mobile group chat no longer keeps a `24rem` bottom scroll reserve after the latest message.
- Group and DM threads now reserve only the fixed mobile composer/navigation height plus a small visible buffer, while still honoring `env(safe-area-inset-bottom)`.
- Empty message inputs now stay one row tall instead of expanding to the wrapped placeholder text, which was making narrow DM composers taller than necessary.
- The app shell uses a `100dvh`-backed viewport class so mobile browser chrome changes do not leave the chat surface sized from stale `100vh`.
- Production-preview visual checks on iPhone 13 and Pixel 5 measured about `15px` between the latest group message and the composer, and about `6px` in a DM thread.

Relevant files:

- [src/App.tsx](C:/repos/chat2.0/src/App.tsx:1)
- [src/index.css](C:/repos/chat2.0/src/index.css:1)
- [src/components/chat/MessageList.tsx](C:/repos/chat2.0/src/components/chat/MessageList.tsx:1)
- [src/components/chat/MessageInput.tsx](C:/repos/chat2.0/src/components/chat/MessageInput.tsx:1)
- [src/components/dms/DirectMessagesView.tsx](C:/repos/chat2.0/src/components/dms/DirectMessagesView.tsx:1)
- [src/components/layout/MobileChatFooter.tsx](C:/repos/chat2.0/src/components/layout/MobileChatFooter.tsx:1)

### Mood Emoji Paused

- The message mood emoji / tone indicator feature is turned off in production until it gets further product and accuracy work.
- The Settings toggle was removed so users cannot enable the unfinished experience from the production app.
- The underlying tone analysis code remains in place for future development, but the enabled-state hook now defaults to off and ignores previously saved enabled values.

Relevant files:

- [src/hooks/useToneAnalysisEnabled.ts](C:/repos/chat2.0/src/hooks/useToneAnalysisEnabled.ts:1)
- [src/components/settings/SettingsView.tsx](C:/repos/chat2.0/src/components/settings/SettingsView.tsx:1)

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

### Startup Loading Clarity

- The auth restore/reopen screen now uses one simple startup message: `Loading Shado...`.
- The previous workspace-specific explanatory copy was removed so the app feels less busy while sessions, presence, and account state restore in the background.
- The lazy view fallback now uses the same loading copy and gold circular spinner treatment for consistent app-wide loading states.
- Validation for the release included the focused `tests/AuthGuard.test.tsx` regression, full lint/typecheck/build, full Jest, and a headed production smoke for `auth,resume-send`.

Relevant files:

- [src/components/auth/AuthGuard.tsx](C:/repos/chat2.0/src/components/auth/AuthGuard.tsx:1)
- [src/App.tsx](C:/repos/chat2.0/src/App.tsx:1)

## QA And Test Improvements

### Jest Stability

- The full Jest suite was repaired and now runs reliably in-band on Windows.
- Several stale tests were updated to reflect current message-send, auth, and UI behavior.
- Resume/session regressions now have explicit tests.

Key tests:

- [tests/AuthGuard.test.tsx](C:/repos/chat2.0/tests/AuthGuard.test.tsx:1)
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
