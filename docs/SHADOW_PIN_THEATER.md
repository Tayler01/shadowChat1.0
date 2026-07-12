# ShadowPin Theater

## Status

Wave One candidate 2 is implemented and live on the isolated
`codex/shadowchat-2.0` trial at
`https://shadowchat-2-0-wave-one.netlify.app`. Production `main` and the
production Netlify site remain unchanged. Theater required no schema migration.

## Product Contract

ShadowPin Theater turns the existing single-Pin fullscreen modal into the
primary way members consume Pins. It remains category-scoped and uses the
existing ShadowPin domain; it is not a vertical recommendation feed and does
not add following, ranking, or new providers.

The phone-first contract is:

- one tap opens an edge-to-edge, safe-area-aware viewer
- horizontal swipe, visible Previous/Next controls, and Left/Right keys move
  through the current category in deterministic `(created_at DESC, id DESC)`
  order
- each Pin has a canonical `/?view=pins&pin=<id>` URL
- comments add a second history layer and retain exact
  `&comment=<id>` targeting
- browser Back closes comments, then the viewer, then returns to the category
- media, identity, Heart, Comment, Share, Details, and owner/operator Edit stay
  available without gesture-only controls
- Share uses the ShadowChat permalink; Open source remains a separate action
- third-party interactive embeds require session-only consent inside Theater
- only the active video or iframe mounts and plays
- adjacent loading and poster prefetch remain bounded

## Interaction And Accessibility

The viewer renders through a body portal with `role="dialog"`, `aria-modal`, a
visible accessible title, trapped focus, Escape handling, body scroll lock,
and focus restoration. Primary phone controls target 48 CSS pixels. Every
gesture has a button and keyboard equivalent.

Horizontal paging is disabled while an image is zoomed. Swipe recognition
ignores the iPhone edge-back zones, interactive controls, videos, and iframes;
it requires horizontal dominance plus a distance or velocity threshold.
Reduced-motion users receive immediate or crossfade state changes instead of
large slide transitions.

The existing comment conversation remains authoritative. On phone it is a
safe-area bottom sheet above the current Pin. Existing loading, retry, empty,
edit, reply, delete, and exact-comment highlight behavior is preserved.

The July 12 trial revision makes feed-card detail dots and Theater navigation/
zoom glyphs visually minimal while retaining 48-pixel hit targets and visible
focus. The detail toggle stays above its overlay so short cards can always be
closed. Theater commits paging on the transform transition end, keys active
media by Pin, and keeps the preloaded poster behind the incoming full asset to
prevent WebKit from repainting the previous decoded image during a swipe.

## Data And Performance Boundary

No new database domain is required. Existing RLS, reciprocal blocking,
comments, hearts, activity analytics, media processing, and notification
contracts remain authoritative and compatible with the production frontend.

The 2.0 frontend will:

- use an explicit Pin projection that excludes storage-path and processing-error
  fields while retaining legacy provider metadata required by existing
  Pinterest, X, Instagram, YouTube, and Bunny records
- merge an exact deep-link target into the loaded category sequence without
  duplicates
- query at most one RLS-visible neighbor in each direction for a cold target
- request only the next existing 30-Pin page near a loaded boundary
- preload adjacent image/poster assets, never adjacent playback streams
- record `pin_opened` once per settled Pin per viewer session
- patch comment counts in the category cache instead of refetching the whole
  category after every comment session
- load comments in 40-item `(created_at, id)` keyset pages, enrich an exact
  comment link and its parent without sweeping the thread, and preserve the
  trigger-maintained canonical count

The legacy `shadow-pin` Storage bucket remains public in this wave because the
production frontend and historical shared media URLs depend on that contract.
The Theater Share action nevertheless exposes the authenticated app permalink
as the primary member action rather than copying a raw CDN/provider URL.

## Explicit Exclusions

- vertical/TikTok-style discovery feed
- recommendation or follow graph changes
- a separate desktop-only comments/details layout
- draggable multi-snap comment sheets
- new media providers
- app-wide persistent third-party-provider consent
- private-bucket media migration
- downloads or new save semantics

## Verification Gate

The checkpoint must pass focused viewer, routing/history, media lifecycle,
zoom/gesture, heart rollback, comment cache, search/deep-link, and existing
ShadowPin provider tests; full Jest; lint; TypeScript; production build and
budgets; actual iPhone WebKit and Android Chromium phone QA; reduced-motion,
safe-area, keyboard, focus, Back-stack, media failure, and test-data cleanup
proof.

## Local Verification - July 11, 2026

- focused Theater, routing, media, comments, heart, zoom, and API contract
  suites: 84 tests passed
- full repository regression: 151 suites passed, 752 tests passed, 16 existing
  todo cases, and zero failures
- authenticated local PostgREST proof: 40-comment first page, five-comment
  second page, zero cursor overlap, and exact-comment lookup
- Android Chromium at 412 x 839 CSS pixels: cold exact link, bounded three-Pin
  sequence, Previous/Next URL replacement, Comments history, 48px controls,
  composer containment, zoom paging lock, Close behavior, and external consent
  passed with zero relevant console errors
- actual WebKit at 390 x 664 CSS pixels: the same acceptance flow passed with
  zero relevant console errors; known local cross-port WebKit cancellation
  noise for Supabase presence/session cleanup was excluded
- production build, paused-feature verification, and bundle budgets passed
- ESLint with zero warnings and the app TypeScript no-emit check passed

The local QA account, comments, Pins, category, and temporary preview assets
were removed by the final clean local database reset and workspace cleanup.

The July 12 live Pixel 7 acceptance opened Theater with a real touch gesture
and verified visible Previous, Next, and Close controls. The full live smoke,
iPhone WebKit comfort/navigation matrix, PWA registration, and Netlify media
Function boundary also passed on the separate trial origin.
