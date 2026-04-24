# Deferred Follow-Ups

This document keeps small deferred ideas from being lost when stale branches are deleted.

## Bundle Chunking

- On 2026-04-24, the stale remote branch `cursor/optimize-codebase-for-performance-16ed` was deleted instead of merged.
- Current `main` already has the useful lazy-view loading pattern in [src/App.tsx](C:/repos/chat2.0/src/App.tsx:17), while that branch's `App.tsx` was missing newer notification deep-link, app badge, mobile toast, and shell styling work.
- The only idea worth revisiting is a fresh, current-main implementation of `build.rollupOptions.output.manualChunks` in [vite.config.ts](C:/repos/chat2.0/vite.config.ts:1).
- Do not blindly restore `sourcemap: true` for production unless production source maps are intentionally desired.
- When revisiting this, run `npm run build` before and after the change and compare the emitted chunk sizes.
