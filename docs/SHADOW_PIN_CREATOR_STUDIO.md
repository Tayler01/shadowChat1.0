# ShadowPin Creator Studio

## Status

Wave Two Candidate 3 is implemented, locally hardened, and authenticated-live
verified on `codex/shadowchat-2.0` as of July 13, 2026. The production `main`
frontend and production Netlify site remain unchanged. Seven focused model,
history, API, component, lazy-entry, media, and SQL contract suites pass
locally with 46 tests; the broader Candidate 3 route/ShadowPin set passes 9
suites and 107 tests. The hardening backend gate also passes a fresh local
reset, expanded rollback verifier, database lint/advisors, Deno/Node checks,
and 3 focused suites with 21 tests.

The expanded two-account workflow passed against final immutable isolated
Netlify deploy `6a5541b45d9cfad72331beac` on Pixel Chromium `412x915` and
iPhone WebKit `390x844`. Nineteen recorded checks cover every entry point,
image and URL staging, local short-video selection/metadata, retry recovery,
owner-private draft/asset reads, signed preview recovery, one idempotent Pin,
one eligible recipient notification plus realtime toast, exact Theater
routing, and atomic edit/category-move/media replacement. The run exposed and
fixed a preview-order regression where an existing poster masked the newly
selected replacement blob; the focused component regression and exact deploy
both pass. Cleanup removed four drafts, five assets, one Pin, all linked
notification/activity/analytics rows, nine private objects, seven public
objects, the temporary Chat/DM rows, and two temporary categories; every scoped
remaining count was zero. Evidence is in
`output/playwright/wave2-candidate3-creator-studio/summary.json`.

The July 13 keyboard-spacing follow-up gives the Studio scroll region an
in-flow mobile keyboard anchor and positions the focused editor from measured
visual-viewport geometry instead of browser-dependent page scrolling. The
compressed Pixel gate measured a `12.21875px` field-to-footer gap (within the
`28px` ceiling), with the field fully visible. The identical build is published
to the isolated stable test frontend as deploy `6a5542e1bc2a1171f1b4073c`;
production `main` remains unchanged.

Linked history/dry-run and the combined Wave Two regression gate remain
separate release checks. Physical installed-PWA camera/library, keyboard,
safe-area, background upload/resume, VoiceOver, and TalkBack proof also remains
required and is not claimed by automated WebKit.

## Product Contract

Creator Studio replaces ShadowPin's direct-publish form with one deliberate,
recoverable workflow. It does not add another primary navigation tab.

Entry points are:

- a `Create Pin` action from ShadowPin home;
- the existing category `+` action with that category preselected;
- General Chat and DM `Add to Shado Pin` actions with the shared image and
  preview prefilled;
- owner/operator `Edit` from the grid, radial controls, or Theater.

Opening Studio without a new share/edit prefill restores the newest matching
unfinished owner draft. There is no separate primary navigation tab or draft
inbox in this checkpoint.

The phone-first Studio has four stages:

1. **Media** - choose an image or short video, use a public URL, inspect the
   real preview/poster, and replace or remove it. Local files preview from
   their object URL immediately; staged playback/posters, direct media URLs,
   YouTube posters, and authenticated link-preview images form a bounded
   fallback chain. Validation retains the established image/video limits.
2. **Details** - choose a visible category, add title and description, and
   enter up to eight normalized comma-separated tags. Meaningful changes are
   autosaved with visible saving, saved, recovery, or needs-attention state.
3. **Preview** - inspect a phone-first ShadowPin-style media card with its
   metadata before anything is public.
4. **Publish** - explicitly confirm that the Pin becomes public and may notify
   eligible members. Show honest `Preparing`, `Uploading`, `Processing`, and
   `Publishing` progress; native video includes real resumable-upload percent.

Step changes do not publish. Close/Back offers a clear save-and-exit path, and
reopening restores the newest owner draft. Reduced motion removes large stage
movement without hiding progress.

## Success, Failure, And Edit Behavior

Successful publish consumes the draft exactly once, refreshes ShadowPin
caches, replaces the Studio route with `?view=pins&pin=<id>`, and opens the
published Pin in Theater. Back then returns to the originating ShadowPin or
conversation surface, not a completed form.

A failed stage preserves the draft, selected category, metadata, staged asset,
and resumable session. The Studio presents a safe stage-specific error with
`Retry` and `Save draft and exit`. Retrying uses the same idempotency key so a
timeout after server success cannot create another Pin, notification, Bunny
asset, or Storage object.

Authenticated Netlify media requests use the current session first. A 401
forces one locked Supabase session refresh and repeats the exact request body
and abort signal once; other failures are surfaced without an auth retry. This
keeps long Studio sessions from failing when the access token rotates between
draft autosave and media staging. Each attempt is bounded to 45 seconds and
returns a clear retry prompt rather than leaving Studio indefinitely busy.

Metadata-only edits update the canonical Pin without new-post delivery. Media
replacement is staged and processed before an atomic swap; other members keep
seeing the old ready media until the replacement succeeds. A failed
replacement leaves the public Pin unchanged. Category moves revalidate the
destination at finalization. No edit, replacement, or move creates a second
new-post event.

## Architecture

### Owner-private drafts

Creator work lives outside `shadow_pin_images` in an additive
`shadow_pin_creator_drafts` domain. A draft records its owner, create/edit
mode, optional target Pin, category, metadata/tags, source kind, staged asset
state, safe error details, idempotency key, optimistic version, and expiry.

Drafts are private workflow state, not ShadowPin content. They never appear in
the grid, exact Pin reads, Universal Discovery, Library, gold score, activity
analytics, hearts/comments, public Realtime, or new-post notifications.

### Server-owned staged assets

`shadow_pin_draft_assets` is a server-owned ledger for one draft's staged
image, imported URL result, Bunny upload session, or replacement candidate.
Clients read an owner-filtered projection but cannot forge ready state,
provider ids, storage paths, processing results, or publication links.

Staged images and derivatives live in the private `shadow-pin-drafts` bucket
and use ten-minute owner-authorized signed preview URLs. Image publication is
one authenticated server request: it claims a three-minute promotion lease, copies
the prepared objects to canonical paths, finalizes the Pin transaction, and
rolls back unreferenced public objects on failure. A scheduled ten-minute
janitor recovers expired promotion leases if the request or client disappears
mid-flight. The older prepare/rollback actions remain compatibility-only.

Native video keeps the existing Bunny TUS limits and resume behavior, but its
server-issued session and asset identity belong to the draft. Direct Bunny
preview, playback, HLS, and embed URLs remain null while the draft is private;
the device-local file supplies the immediate preview. The publish action
verifies Bunny readiness, computes canonical URLs server-side, and finalizes
through one authenticated transaction. Expiry/abandon cleanup removes private
Storage objects and eligible Bunny assets without touching a published Pin.

### Idempotent finalization

An authenticated server path validates owner/operator authority, target
version, category visibility, media readiness, normalized metadata, and the
draft idempotency key. It then performs one transaction that:

1. inserts a new canonical `shadow_pin_images` row or atomically swaps an
   existing Pin's ready media/metadata;
2. attaches its tags;
3. records the published Pin on the draft/asset ledger; and
4. makes repeat finalization return the same Pin.

The existing ready-state notification trigger stays authoritative. A new Pin
fans out only once when it first becomes ready; drafts and edits never fan out.
The production frontend continues using its existing direct-create API and
does not need to understand Creator Studio objects.

The canonical Pin stores a nullable unique `creator_draft_id` receipt. Draft
states are `editing`, `uploading`, `processing`, `ready`,
`preparing_publish`, `publish_ready`, `published`, `failed`, and `abandoned`;
asset states are `reserved`, `uploading`, `processing`, `ready`,
`publish_ready`, `failed`, `superseded`, and `deleted`. Finalization requires
the active asset to be `publish_ready`, the caller's expected draft revision,
and the draft idempotency key.

Replacement drafts also capture the target Pin's `updated_at` value on the
server. Finalization locks the target and rejects the swap if that value has
changed, so a stale Studio tab cannot overwrite a newer edit.

### Client model

The Creator Studio feature is lazy-loaded. A typed reducer/model owns the four
stages, validation, dirty/autosave state, upload progress, recoverable errors,
and publish success. Device snapshots persist dirty/saved revisions and a
timestamp. A newer unsynced matching snapshot wins recovery over an older
server receipt; late save responses are scoped to one draft and cannot replace
newer local state. Back/close persists locally and attempts a server flush,
while switching drafts flushes the outgoing context before the incoming draft
is rendered. Browser `File` objects are never described as persistable; if an
asset was not staged before reload, the Studio explicitly requests reselection.

Studio history uses its own marker. An in-app open pushes one Studio entry and
closing it uses Back. A cold `?studio=creator` route is replace-marked and
closes by removing the Studio parameter. The current stage is recovered from
the device-local snapshot rather than the URL. Private titles, descriptions,
tags, and source URLs never enter the address bar.

## Security And Privacy

- Draft and asset rows are owner-private under RLS. `PUBLIC` and `anon` have no
  table or function access; one member cannot read or mutate a guessed draft.
- The asset ledger is server-owned. Authenticated members cannot set provider,
  path, processing, ready, published, or cleanup fields directly.
- The staging bucket is private, accepts only the established MIME/size limits,
  and exposes previews through short owner-authorized signed URLs.
- Native Bunny drafts expose no direct provider playback URL before the
  authenticated publish transaction.
- Server media paths recheck the authenticated user, draft ownership,
  creator/operator edit authority, category availability, rate limits, and
  target optimistic version at every sensitive transition.
- Per-action image/video budgets, a 32-generation ceiling, and active-asset
  caps of four per draft and 40 per user bound provider, CPU, and Storage work
  independently of the draft count.
- Public URL import retains safe-fetch redirect, DNS/IP, MIME, and byte-limit
  protections. Provider credentials and service-role keys remain server-only.
- Autosave does not consume the public 12-per-minute or 100-per-day post
  budget. Final publication does, and concurrent finalizers converge on the
  same result.
- Safe error codes may be stored for recovery; secrets, provider responses,
  signed URLs, and private profile data must not be persisted as member-facing
  error text.

## Accessibility And Comfort

- Render through a body portal with dialog semantics, focus trap, Escape,
  focus restoration, body scroll lock, and visible labels for stage and save
  state.
- Use the shared visual-viewport height and safe-area insets. The action footer
  is a non-scrolling flex child instead of a layout-viewport fixed overlay;
  focused fields are re-revealed as the visual viewport settles so title,
  description, and tags remain reachable above iPhone and Android software
  keyboards at 130% text.
- Background autosave reports saving state without disabling the editor or
  blurring the active field. Upload, processing, restore, draft-switch, and
  publish operations retain the intentional interaction lock.
- Controls meet the shared phone touch baseline and Comfort large-control
  setting. Progress and validation never rely on color alone.
- Upload/publish status uses a polite live region; failure gets focus without
  repeatedly interrupting assistive technology.
- Stage and progress motion consumes `useComfortPreferences`; no new direct
  media-query, vibration, audio, or autoplay checks are introduced.
- Preview media follows the shared autoplay preference and remains fully
  understandable when playback is disabled.

## Verification Gate

### Model And Component

- Four-stage transitions, validation, dirty/save/error state, progress
  normalization, and success handoff are deterministic.
- Debounced autosave ignores stale responses, survives reload/offline state,
  handles conflicts, and requests media reselection only when staging never
  completed.
- Netlify media staging covers healthy-token success, one stale-token 401
  refresh/retry with the same body, a bounded second-401 failure, and a stalled
  request timeout.
- Every entry point prepopulates the same Studio model; the legacy mini share
  dialog is not a second publisher.
- File/URL exclusion, image/video boundaries, video duration, unsafe URL,
  category disappearance, tag normalization/limits, preview, confirmation,
  retry, cancel, edit, and replacement are covered.
- Character-by-character typing proves autosave does not collapse the keyboard
  or drop focus, and local image, local video, direct URL, provider poster, and
  discovered link-preview fallbacks prove media appears automatically.
- Focus trap/restoration, keyboard operation, live progress, reduced motion,
  130% text, and large controls have component assertions.

### Database And Server

- Clean local replay, database lint/advisors, least grants, and function
  catalog checks pass.
- Anonymous and cross-owner draft/asset access is denied; authenticated callers
  cannot forge server-owned ledger state.
- Drafts are absent from every consumer read/search/score/activity/notification
  path. Ready-stage image assets remain private and use owner-signed previews;
  any promoted public objects left unreferenced by a failed finalization are
  rolled back.
- Repeated/concurrent finalization returns one Pin and one eligible new-post
  event. Autosave, preview, edit, move, replacement, and retry do not create an
  event.
- Stale target, deleted category, revoked auth, block boundary, expired draft,
  invalid/failed media, and rate-limit cases fail safely.
- Replacement failure leaves the old public media unchanged; successful swap
  schedules old-asset cleanup only after commit.

### Browser And Two-account

- Pixel Chromium `412x915` and iPhone WebKit `390x844` cover all entry points,
  draft recovery, image/short-video/URL preview, category and tags, publish
  confirmation, progress, retry, success Theater handoff, Back/cold close,
  safe areas, keyboard compression, reduced motion, and no horizontal overflow
  or console/page errors.
- Account A's draft, signed preview, and staged ids are invisible to Account B.
  On publish, B receives exactly one visible Pin and one eligible notification;
  exact routing opens it. A later edit/move/replacement produces no second
  new-post event.
- While A stages or retries replacement, B continuously sees the old media.
  Failed replacement preserves it; successful replacement changes it once.
- A newly selected replacement blob takes preview precedence over the existing
  poster while the canonical public media remains unchanged until finalization.
- Test cleanup confirms removal of every draft, Pin, notification, private and
  live Storage/derivative object, and Bunny asset created by the run.

Physical installed-PWA checks remain required for the real camera/library
picker, iPhone/Android keyboard and safe areas, background upload/resume,
VoiceOver, and TalkBack. Automated WebKit is not that certification.

## Operational Rules

- Apply the additive draft/asset migration, create the private bucket, and
  deploy the media functions before exposing the Studio frontend.
- Do not deploy the Studio against a backend that lacks idempotent finalize or
  owner-private draft enforcement.
- Do not use production Pin publication as casual smoke data: a ready new Pin
  can notify every eligible other member.
- Keep old direct-create and read contracts intact until production adopts the
  Studio.
- Cleanup workers must distinguish abandoned staged assets from canonical live
  assets and fail closed on uncertain ownership/publication state.

Canonical backend migrations:

- `supabase/migrations/20260713003323_shadow_pin_creator_studio_backend.sql`
- `supabase/migrations/20260713042749_shadow_pin_creator_studio_hardening.sql`

Canonical member RPCs:

- `create_shadow_pin_creator_draft`
- `update_shadow_pin_creator_draft`
- `list_my_shadow_pin_creator_drafts`
- `delete_shadow_pin_creator_draft`
- `finalize_shadow_pin_creator_draft`
