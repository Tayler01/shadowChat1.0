# Deferred Follow-Ups

This document keeps small deferred ideas from being lost when stale branches are deleted.

## Bundle Chunking

- On 2026-04-24, the stale remote branch `cursor/optimize-codebase-for-performance-16ed` was deleted instead of merged.
- Current `main` already has the useful lazy-view loading pattern in [src/App.tsx](C:/repos/chat2.0/src/App.tsx:17), while that branch's `App.tsx` was missing newer notification deep-link, app badge, mobile toast, and shell styling work.
- The only idea worth revisiting is a fresh, current-main implementation of `build.rollupOptions.output.manualChunks` in [vite.config.ts](C:/repos/chat2.0/vite.config.ts:1).
- Do not blindly restore `sourcemap: true` for production unless production source maps are intentionally desired.
- When revisiting this, run `npm run build` before and after the change and compare the emitted chunk sizes.

## Audit Improvements - 2026-04-26

Near-future priorities from the full codebase audit, after the P0 fixes:

1. Add bridge Edge Function tests for pairing, polling, session refresh, update check, and revoke.
2. Finish cryptographic update signing: real signing key, release signing pipeline, device-side signature verification, and rejection of `dev-unsigned-sha256-only` outside development.
3. Replace fake Settings actions with real data export and account deletion flows, or remove them until backend support exists.
4. Add a canonical bridge read-state contract test that proves web unread counts and bridge polling agree.
5. Add connection/session health banners in the web app and TUI for stale session, reconnecting, offline, and revoked states.
6. Fix sidebar/mobile navigation dead states and unused `onNewDM` wiring.
7. Add TUI active-conversation header, connection footer, and clearer unread per-DM indicators.
8. Add consistent empty, loading, and failed states for DMs, bridge pairing, settings, and update flows.
9. Tighten TypeScript/ESLint gradually, starting with unused code warnings in `src`.
10. Update stale bridge architecture/testing/signature docs so instructions match the current implementation.
11. Split or lazy-load large frontend chunks, especially emoji picker and lower-frequency panels.
12. Add CI jobs for lint, typecheck, build, Jest, bridge TUI layout, and bridge function contract checks.
13. Stage dependency upgrades for Supabase, Vite, TypeScript, ESLint, and Testing Library.
14. Build a bridge admin dashboard for paired devices, revoke, last seen, firmware version, and health.
15. Add an offline TUI outbox with retry and delivery status.
16. Add update channels for stable, beta, local bundle, and rollback metadata.
17. Implement per-conversation notification preferences shared across web, push, and bridge clients.
