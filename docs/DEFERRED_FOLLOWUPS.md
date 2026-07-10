# Deferred Follow-Ups

## Documentation Status - July 10, 2026

Reviewed during the July 10 production-alignment refresh. This file preserves
dated small ideas and completed history; current hardening and polish work is
ranked in
[FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

This document keeps small deferred ideas from being lost when stale branches are deleted.

## Private Identity Release B Hold - July 10, 2026

The July 10 deployment is Release A only. Its migrations establish an
API-safe public-profile contract, cut database/Edge consumers away from private
identity, and keep `public.users.email` plus `public.users.full_name` as nullable
compatibility columns for a production interval.

Release B is deliberately deferred. Do not create or apply the destructive
column-drop migration until the forward historical-grant correction is deployed,
stable-account auth/chat/DM/admin smoke passes, linked migration/security checks
are clean, the health manifest matches the latest `main` SHA, and repository/
runtime checks show no remaining consumer. The
independent `apps/mobile` package is part of that gate; its public-profile and
message selectors/types must not depend on either legacy column.

## Native Mobile Toolchain - July 10, 2026

The unshipped native workspace was upgraded locally to Expo `~57.0.4`, React
Native `0.86.0`, React `19.2.3`, and TypeScript `~6.0.3`. Clean install, audit,
lint, TypeScript, Expo Doctor `20/20`, and static web export passed locally.

This closes the stale Expo dependency/toolchain follow-up in Release A, but not
native product parity. Development-build, physical iPhone,
EAS/TestFlight, native push, DMs, media, and broader feature parity remain
deferred until native work resumes. The production web/PWA path is unchanged by
this toolchain milestone.

## Bundle Chunking

- On 2026-04-24, the stale remote branch `cursor/optimize-codebase-for-performance-16ed` was deleted instead of merged.
- Current `main` already has the useful lazy-view loading pattern in [src/App.tsx](C:/repos/chat2.0/src/App.tsx:17), while that branch's `App.tsx` was missing newer notification deep-link, app badge, mobile toast, and shell styling work.
- Completed July 9, 2026: current `main` implements route-aware
  `build.rollupOptions.output.manualChunks` in
  [vite.config.ts](C:/repos/chat2.0/vite.config.ts:1), removes the broad
  catch-all vendor chunk, and enforces eager, lazy, Phaser, and total-deploy
  budgets with `scripts/verify-build-budgets.mjs`.
- Do not blindly restore `sourcemap: true` for production unless production source maps are intentionally desired.
- When revisiting this, run `npm run build` before and after the change and compare the emitted chunk sizes.
- Historical note: on 2026-06-08, `npm run build` still passed with a Vite
  large-chunk warning. The July budgeted split supersedes that status; the
  intentionally large lazy Phaser payload has its own measured budget.

## Audit Improvements - 2026-04-26

Status as of June 1, 2026: these older audit notes are preserved for history, but the current cross-project priority list is [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Near-future priorities from the full codebase audit, after the P0 fixes:

1. Add bridge Edge Function tests for pairing, polling, session refresh, update check, and revoke.
2. Finish cryptographic update signing: real signing key, release signing pipeline, device-side signature verification, and rejection of `dev-unsigned-sha256-only` outside development.
3. Revisit user data export only if it becomes a product requirement; account deletion now has a real guarded flow and the old data/privacy settings surface was removed.
4. Add a canonical bridge read-state contract test that proves web unread counts and bridge polling agree.
5. Add connection/session health banners in the web app and TUI for stale session, reconnecting, offline, and revoked states.
6. Fix sidebar/mobile navigation dead states and unused `onNewDM` wiring.
7. Add TUI active-conversation header, connection footer, and clearer unread per-DM indicators.
8. Add consistent empty, loading, and failed states for DMs, bridge pairing, settings, and update flows.
9. Tighten TypeScript/ESLint gradually, starting with unused code warnings in `src`.
10. Update stale bridge architecture/testing/signature docs so instructions match the current implementation.
11. Split or lazy-load large frontend chunks, especially emoji picker and lower-frequency panels.
12. Add CI jobs for lint, typecheck, build, Jest, bridge TUI layout, and bridge function contract checks.
13. Partially completed in July 10 Release A: root Jest/jsdom and the
    Expo 57 native toolchain were modernized with clean audits. Continue staging
    unrelated Supabase/Vite/ESLint/Testing Library upgrades only as measured,
    independently verified batches.
14. Build a bridge admin dashboard for paired devices, revoke, last seen, firmware version, and health.
15. Add an offline TUI outbox with retry and delivery status.
16. Add update channels for stable, beta, local bundle, and rollback metadata.
17. Implement per-conversation notification preferences shared across web, push, and bridge clients.
18. Revisit the paused mood emoji / tone indicator feature with better UX, user control, and accuracy before exposing it again in Settings.
19. Add an explicit Fahrenheit/Celsius toggle for the weather widget if users need unit control beyond the stored `temperature_unit` field.
20. Completed 2026-07-09: local setup, Netlify (`NODE_VERSION = "24"`), and
    every current GitHub build/quality workflow use Node 24.
