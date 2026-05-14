# Mobile Performance Optimization Plan

ShadowChat is phone-first by default. This plan tracks the current mobile
performance pass across iPhone/WebKit and Android/Chromium flows.

## Goals

- Make chat avatars, profile media, Art Board images, and chat attachments load
  quickly on phone networks.
- Keep existing realtime chat and DM behavior intact.
- Avoid schema-dependent frontend breakage during deploy.
- Preserve original storage objects while switching row-backed URLs to optimized
  mobile media where safe.

## Implementation Slices

1. Mobile media upload optimization
   - Optimize avatar, banner, chat image, Art Board image, and Shadow Pin upload
     paths before storage upload.
   - Skip GIF and SVG so animated or vector content is not flattened.
   - Store optimized uploads with long-lived cache headers.

2. Existing media backfill
   - Use `npm run media:backfill-mobile -- --apply` to process row-backed media
     in `avatars`, `banners`, `art-board`, and `chat-uploads`.
   - Update database URLs to the optimized WebP object.
   - Keep original objects in storage for rollback/manual recovery.
   - Re-run this as backend maintenance if future imported or externally
     written media ever bypasses the app upload optimizer.

3. Mobile image rendering polish
   - Add explicit lazy/eager loading and async decoding on Art Board, News, and
     profile images.
   - Keep user-opened detail images eager so modals feel responsive.

4. Realtime update containment
   - Keep INSERT hydration for chat and DMs.
   - Merge UPDATE payloads into already-loaded rows locally, preserving joined
     user/sender data and ignoring stale updates.
   - Skip unloaded UPDATE rows instead of fetching them into the visible window.

5. Database performance hygiene
   - Drop duplicate indexes reported by the Supabase performance advisor.
   - Leave broader RLS policy init-plan cleanup as a later isolated migration
     because it touches many security policies.

6. Tooling and import guardrails
   - Keep mobile QA scripts on repo-local Vite binaries so they do not depend
     on a global `npx` being present.
   - Cap backend Art Board URL imports at 2 MB; larger images should be saved
     and uploaded through the phone app so the browser optimizer runs first.

## Findings And Resolution

| Finding | Resolution |
| --- | --- |
| Chat avatars, profile photos, banners, Art Board images, and image attachments were loading row-backed originals that could be much larger than phone displays need. | Added shared browser-side image optimization before avatar, banner, chat image, Art Board image, and Shadow Pin uploads. GIF and SVG are preserved. |
| Existing profile, chat, DM, and Art Board media still pointed at older large objects. | Added `npm run media:backfill-mobile` and ran the backend backfill on May 14, 2026. It optimized 89 of 110 row-backed media URLs, reducing those rows from 281,326,346 bytes to 12,878,620 bytes while preserving originals in storage. |
| Future uploads needed a protection path, not just a one-time cleanup. | New in-app uploads are optimized before storage, row-backed media can be reprocessed by the idempotent backfill script, and Art Board URL imports now reject remote images over 2 MB so they do not bypass the optimizer. |
| Art Board, News, and profile images could compete with first paint or decode on the main thread. | Added explicit `loading` and `decoding` hints so lists and trays lazy-load while opened detail/profile media remains eager. |
| Chat and DM realtime UPDATE events could hydrate full rows just to patch already-visible messages. | Added local realtime update merge logic that preserves joined user/sender data, ignores stale updates, and skips unloaded rows. |
| Supabase performance advisor reported duplicate indexes. | Dropped duplicate message, DM conversation, and username indexes while keeping equivalent coverage. Broader RLS policy advisor warnings remain a separate security-sensitive cleanup. |
| Mobile QA was being forced into preview reuse mode when `npx` was missing. | Fixed the Windows user PATH for `npm`/`npx`, documented the setup check, and changed the QA scripts to start Vite through the repo-local `node_modules/vite/bin/vite.js` entrypoint. |
| The production build emitted a circular manual-chunk warning. | Tightened Vite manual chunk package detection so packages are grouped by exact package name instead of substring matches such as `react`. |

## Residual Mobile QA Notes

The May 14, 2026 final harness passed, but it still reported non-blocking
mobile ergonomics warnings that should stay visible for a later focused UI pass:

- Some compact reaction badges and board-chat reaction chips are below ideal
  touch target size. They are currently treated as compact counters, but any
  future reaction interaction pass should make the actionable hit area larger
  without visually bloating the chat rows.
- The General Chat weather-settings and active-user header controls measured
  below ideal touch target height on small iPhone profiles.
- The DM list audit still sees the desktop empty-state panel as an overflow
  candidate behind the mobile list. It did not create horizontal page overflow
  in the final run, but the mobile DM empty-state layout should be simplified
  in a future DM polish slice.
- One iPhone-small public-profile opener did not open a dialog in the final
  run. Other profile/dialog checks passed, so this is logged as a harness/data
  coverage gap rather than a blocker.

## Verification

Required before push:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npx jest --runInBand
npm run qa:mobile-pwa -- --run-name=mobile-performance-final --no-reuse-server
```
