# Mobile Performance Optimization Plan

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This feature guide is current for the shipped product surface, with any known hardening or polish follow-ups tracked in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

ShadowChat is phone-first by default. This plan tracks the current mobile
performance pass across iPhone/WebKit and Android/Chromium flows.

## Goals

- Make chat avatars, profile media, Art Board images, and chat attachments load
  quickly on phone networks.
- Standardize the mobile header and bottom menu so phone chrome behaves
  consistently across Chat, DMs, Boards, Entertainment, Settings, and Pins.
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
   - Use the app-wide two-asset standard for new row-backed images: preserve
     the full stored image and store a display thumbnail URL for phone lists.

2. Existing media backfill
   - Use `npm run media:backfill-mobile -- --apply` to process row-backed media
     in `users` avatar/banner rows and `art_board_items`.
   - The current backfill stores Supabase Storage transformed thumbnail URLs
     into the new thumbnail columns. It keeps originals in place.
   - Group/DM chat history is skipped by default; pass
     `--include-chat-history` only for a deliberate old-message cleanup.
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
   - Keep Art Board URL imports at the bucket-level 10 MB limit and rely on
     backend delivery transformations instead of asking users to resize images.

7. Avatar and realtime render containment
   - Treat avatars as phone-first UI, with only the newest visible chat/DM
     avatars eager-loaded and older/offscreen avatars left lazy.
   - Serve avatars, chat image attachments, and Art Board canvas/detail images
     through Supabase backend transformation URLs so phones receive
     display-sized images even when the stored object is larger.
   - Keep presence updates scoped to the user row that changed so one heartbeat
     does not force every avatar and presence badge in long chat lists to
     repaint.
   - Pause periodic presence and weather refreshes while the PWA is hidden, then
     refresh when it becomes visible again.

8. Mobile shell and game-picker polish
   - Use the shared compact mobile header on General Chat, DMs, Boards and
     board chats, Art Board, Entertainment, Settings, and Pins.
   - Move Settings to the header and put Pins in the bottom menu.
   - Collapse header and bottom menu while the phone keyboard is open on chat
     composer surfaces, then restore them when the keyboard closes.
   - Serve game picker cards from lightweight picker-specific WebP derivatives
     instead of the larger in-game banner/backdrop assets.

## Findings And Resolution

| Finding | Resolution |
| --- | --- |
| Chat avatars, profile photos, banners, Art Board images, and image attachments were loading row-backed originals that could be much larger than phone displays need. | Added shared browser-side image optimization before avatar, banner, chat image, Art Board image, and Shadow Pin uploads. GIF and SVG are preserved. |
| Existing profile, chat, DM, and Art Board media still pointed at older large objects. | Added `npm run media:backfill-mobile` and ran the backend backfill on May 14, 2026. It optimized 89 of 110 row-backed media URLs, reducing those rows from 281,326,346 bytes to 12,878,620 bytes while preserving originals in storage. |
| Future uploads needed a protection path, not just a one-time cleanup. | New in-app uploads are optimized before storage where practical, row-backed media can be reprocessed by the idempotent backfill script, and render paths now request backend-transformed delivery URLs so users do not need to manually resize normal images. |
| Shadow Pin already had the better backend media model: originals plus generated thumbnail/medium derivatives from the Netlify Sharp processor. | Left Shadow Pin on that path and used it as the pattern for other surfaces instead of reworking it again. |
| Art Board URL imports were capped at 2 MB, which made users think about image size. | Raised the import guardrail to the bucket's 10 MB limit and switched Art Board image delivery to Supabase backend transformation URLs for canvas/detail thumbnails. |
| Avatar and chat image rows can still point at older originals or future externally written objects. | Added a shared Supabase Storage transform URL helper and routed Avatar, General Chat image, DM image, and Art Board image rendering through backend resizing/optimization where the source is a Supabase public storage URL. GIF/SVG sources bypass transformation. |
| Art Board, News, and profile images could compete with first paint or decode on the main thread. | Added explicit `loading` and `decoding` hints so lists and trays lazy-load while opened detail/profile media remains eager. |
| Chat and DM realtime UPDATE events could hydrate full rows just to patch already-visible messages. | Added local realtime update merge logic that preserves joined user/sender data, ignores stale updates, and skips unloaded rows. |
| Supabase performance advisor reported duplicate indexes. | Dropped duplicate message, DM conversation, and username indexes while keeping equivalent coverage. Broader RLS policy advisor warnings remain a separate security-sensitive cleanup. |
| Mobile QA was being forced into preview reuse mode when `npx` was missing. | Fixed the Windows user PATH for `npm`/`npx`, documented the setup check, and changed the QA scripts to start Vite through the repo-local `node_modules/vite/bin/vite.js` entrypoint. |
| The production build emitted a circular manual-chunk warning. | Tightened Vite manual chunk package detection so packages are grouped by exact package name instead of substring matches such as `react`. |
| Linked Supabase storage still contains old original objects, but current app rows are much lighter after backfill: `users.avatar_url` references 523 kB total across 12 avatar rows, `art_board_items.image_url` references 2,986 kB across 11 rows, and only one current chat attachment remains over 1 MB. | Keep originals for rollback, but focus the next avatar work on render churn and viewport prioritization rather than another avatar migration. Videos remain a separate attachment delivery track. |
| Every avatar and invisible-status badge subscribed through the full presence context, so any heartbeat could invalidate all consumers in chat, DMs, sidebars, and profile surfaces. | Presence now uses per-user `useSyncExternalStore` snapshots. Consumers whose user row did not change keep the same snapshot and avoid unnecessary rerenders. |
| Long General Chat and DM threads are capped initially but still render every loaded message once older pages are fetched. | Added CSS containment for chat/DM rows and eager loading only for the newest 12 avatar rows. True windowing remains the next bigger list-rendering step if threads routinely exceed a few hundred loaded rows. |
| Weather and presence refresh timers kept running while the app was hidden. | Presence polling and weather forecast refreshes now skip hidden tabs and refresh on visibility/focus. Manual weather refresh also uses the freshly fetched preference instead of a stale closure. |
| Weather share images could be cropped by capturing the visible popover while it was positioned for the phone header. | Weather sharing now captures a fixed-width off-screen card, uploads it through the chat image path, stores a thumbnail URL, and lets the chat modal open the full image. |
| New chat/DM static image uploads and weather shares had no explicit thumbnail column. | Added message and DM thumbnail metadata columns plus compatibility fallbacks while the migration rolls out. GIFs keep the existing URL-only path. |
| Art Board needed the same forward image model as chat without forcing users to resize. | Art Board uploads/imports now store thumbnail metadata and render canvas/detail media from the thumbnail path when present. A backfill covers existing Art Board images. |
| Shadow Pin category order was still based on hearts, not recent image activity. | Added `latest_image_created_at`, trigger maintenance, and frontend ordering so categories with the newest images sort first; empty categories fall last. |
| Game picker cards reused larger in-game assets. | Added picker-specific WebP derivatives for Shadow Checkers and Shadow War and added explicit decode/loading dimensions. |
| Header/menu controls were implemented differently across app surfaces. | Introduced the shared mobile header/menu pattern, moved Settings into the header, moved Pins into the bottom menu, and kept the same right-side controls across mobile surfaces. |

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
npm run media:backfill-mobile -- --apply
npm run shadow-pin:backfill-media -- --apply
```
