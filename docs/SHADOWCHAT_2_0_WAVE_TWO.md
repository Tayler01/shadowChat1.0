# ShadowChat 2.0 - Wave Two

## Goal

Build and validate the second high-impact 2.0 product wave on
`codex/shadowchat-2.0`, one independently verified candidate at a time. The
production `main` branch and production Netlify site remain unchanged. Shared
Supabase changes must be additive, preserve live RLS and auth boundaries, and
remain compatible with both the production frontend and the 2.0 trial.

## Candidate Sequence

1. **Universal Discovery & Library** - one phone-first discovery surface for
   visible General Chat and DM messages, DM-discoverable people, ShadowPin
   media, Play destinations, and the member's private saved collections.
2. **True General Chat Threads** - focused reply threads that preserve the
   fast main-room flow, realtime delivery, blocks, moderation, search, saves,
   notifications, and exact message routing.
3. **ShadowPin Creator Studio** - a deliberate creation and publishing flow
   for ShadowPin media with draft safety, upload state, metadata, preview, and
   reliable publish recovery.
4. **First-Run Activation Journey** - a short, resumable first-run path that
   helps a new member establish identity, notification/comfort choices, and
   complete the first meaningful action without blocking later app use.

Each candidate receives a separate strategy review, implementation checkpoint,
focused tests, mobile Chromium and WebKit proof, documentation update, and
checkpoint commit. Combined regression and shared-backend compatibility checks
run after all four candidates.

## Candidate 1 Contract - Universal Discovery & Library

### Product shape

- Upgrade the existing Search utility entry instead of adding another primary
  navigation tab.
- Present a safe-area-aware mobile Discover surface with `All`, `Messages`,
  `People`, `Pins`, `Play`, and `Library` scopes.
- Keep grouped result order stable and cap each source. A slow or failed source
  reports its own state while other results remain usable.
- Preserve message collections and saves. Extend the private Library only to
  eligible ShadowPin and Play content; profiles are discoverable but not
  saveable in this version.
- Exact result routes must support messages, profiles, Pins, Play experiences,
  Shado TV videos, and Shadow Mystery stories. Browser Back restores the
  Discover query, scope, filters, and scroll position without placing private
  search terms in the URL.

### Architecture decision

- Use a typed client orchestrator with debouncing, cancellation/stale-request
  protection, bounded parallel providers, and partial-error handling.
- Reuse `search_my_messages`, `search_users`, and
  `search_shadow_pin_images`; do not change their existing signatures.
- Search Play through a compact metadata-only catalog so discovery does not
  pull full entertainment screens or media assets into the eager bundle.
- Do not query `storage.objects`. Attachment discovery inherits visibility
  from its visible General Chat or DM message.
- Add only an owner-private, RLS-protected table/RPC layer for non-message
  Library entries. Library reads rejoin the current source under live
  visibility rules, so blocked, deleted, hidden, or unpublished content is not
  returned through an old save.

### Security boundaries

- General and DM messages remain governed by their existing RLS and reciprocal
  block policies.
- People discovery retains `dm_discoverable`, reciprocal blocking, and the
  existing safe public-profile projection. Raw `users` rows are not a result
  source.
- ShadowPin results remain governed by its invoker search and RLS.
- Play results include only member-visible, published, nondeleted content even
  for operators using the consumer surface.
- New schema objects revoke default `PUBLIC`/`anon` access, grant the minimum
  authenticated privileges, use `SECURITY INVOKER`, and keep a fixed empty
  `search_path` on RPCs.

### Verification gate

- Existing production message search/save contracts still pass unchanged.
- Anonymous, blocked, nonparticipant, deleted, hidden, draft, unpublished, and
  cross-owner cases have explicit negative tests.
- Search cancellation, partial failures, stable grouping, result caps, exact
  routes, Back restoration, Library save/move/remove, and collection deletion
  have focused behavior coverage.
- Clean local Supabase replay, database lint/advisors, lint, TypeScript, build
  and budgets, focused/full Jest, Pixel Chromium, and iPhone WebKit must pass.

## Candidate 2 Contract - True General Chat Threads

### Product shape

- Keep the main 2.0 General Chat feed fast by rendering only root messages.
  Roots with replies show a compact count, unread state, and bounded
  participant preview.
- Reply opens a focused thread instead of expanding an inline tree. Direct
  reply context remains available, but replies stay in one chronological
  conversation without nested indentation.
- Use a full-height, safe-area-aware phone sheet with a fixed composer and a
  `28rem` right drawer on desktop. Preserve scroll position when older replies
  load and do not force the member to the bottom when realtime replies arrive.
- Route exact targets as
  `?view=chat&thread=<root-id>&message=<target-id>`. Browser Back closes an
  in-app-opened thread; a cold route has an explicit close fallback.
- Preserve reactions, edits/deletes, attachments/GIFs, moderation, personal
  blocks, search, saves, push notifications, and existing direct-reply
  previews inside the thread.

### Architecture decision

- Keep `public.messages` and `reply_to` canonical. Add a server-owned,
  read-only `general_chat_thread_replies` projection that maps every direct or
  nested reply to a stable root while recording its direct parent.
- Leave `get_general_chat_message_window(...)` unchanged so the production
  frontend continues to receive the legacy flat stream. Add separate invoker
  readers for the 2.0 root window, bounded thread pages, and at-most-50 summary
  batches.
- Backfill existing reply chains and reject rollout if any chain is cyclic,
  over-depth, or otherwise cannot be mapped. New legacy `reply_to` inserts are
  mapped by a private trigger, so no new client write shape is required.
- Use `user_read_cursors` with `surface = 'general_chat_thread'` and the
  canonical root as scope. Realtime mapping events refresh root summaries;
  the open thread coalesces mapping and canonical message changes through the
  RLS-aware readers.
- Root deletion retains the mapped conversation and returns an unavailable
  root placeholder. Individual reply deletion cascades only its projection.

### Security boundaries

- Existing `messages` RLS, channel-ban rules, ownership, and reciprocal block
  enforcement remain authoritative for roots and replies.
- Reply validation rejects missing, self, cyclic, moved, and blocked targets.
  Authenticated clients cannot create or alter mapping rows.
- Existing hidden/blocked replies disappear from pages, counts, previews, and
  participant summaries. A hidden or deleted root uses the same unavailable
  placeholder so the API does not reveal why access is absent.
- Public thread APIs are authenticated `SECURITY INVOKER` functions with an
  empty `search_path`, bounded inputs, least grants, and no `anon` execution.
  Profile JSON continues through the safe public projection.
- The private trigger-only definer is not publicly executable and does not
  become a second content or authorization path.

### Verification gate

- Clean local replay proves legacy and nested mapping, flat-client
  compatibility, root-only windows, exact-target resolution, summaries,
  read-cursor ordering, delete placeholders, block filtering, cycle rejection,
  batch limits, and least privileges.
- Focused behavior tests cover API normalization/merge, route history, feed
  summaries, sheet behavior, and canonical push handoffs.
- Two authenticated accounts prove reply realtime, unread increment/clear,
  edit/delete/block refresh, exact target, and no reply duplication in the
  main feed.
- Lint, TypeScript, build/paused chunks/budgets, targeted/full Jest, Pixel
  Chromium, and iPhone WebKit must pass. Test-created rows/uploads must be
  removed before Candidate 2 is accepted.

Full contract:
[docs/GENERAL_CHAT_THREADS.md](C:/repos/chat2.0/docs/GENERAL_CHAT_THREADS.md:1).

## Candidate 3 Contract - ShadowPin Creator Studio

### Product shape

- Replace direct publication with one lazy, phone-first Studio entered from
  ShadowPin home/category, Chat/DM image share, and owner/operator Edit.
- Use four clear stages: Media, Details, Preview, and Publish. Autosave each
  meaningful change, expose recovery/needs-attention state when Studio opens,
  and restore safely after close, reload, or a failed upload.
- Show real media preview, a visible category selector, normalized tag input
  and limits, a ShadowPin-style card preview, explicit public confirmation,
  and honest staged upload/processing progress.
- Successful publish replaces the Studio route with the exact new Pin Theater.
  Retry is idempotent; save-and-exit never loses staged work.
- Stage and process a media replacement before atomically swapping it, so a
  failed edit never damages the ready Pin other members are viewing.

### Architecture decision

- Add owner-private `shadow_pin_creator_drafts` outside canonical
  `shadow_pin_images`, plus server-owned `shadow_pin_draft_assets` and private
  `shadow-pin-drafts` Storage bucket.
- Drafts and staged assets are excluded from every consumer feed, search,
  Library, score, activity, engagement, Realtime fanout, and notification path.
- Use authenticated server media actions for staged image/import/Bunny work
  and one idempotent transaction for final insert or replacement swap. Repeat
  finalization returns the same canonical Pin.
- Keep existing production direct-create/read APIs backward compatible. The
  current ready-state notification trigger remains the only new-post fanout
  authority.
- Use a typed four-stage client model with stale-autosave protection, explicit
  progress and recoverable errors, lazy loading, private route state, and the
  shared accessibility/Comfort providers.
- Finalization requires a `publish_ready` active asset, expected draft
  revision, and idempotency key; canonical Pins retain a nullable unique
  `creator_draft_id` receipt.

### Security boundaries

- Draft rows are owner-private; asset state is server-owned; `PUBLIC`, `anon`,
  and cross-owner access are denied.
- Staged media is private and previewed only with short owner-authorized signed
  URLs. Provider credentials, service-role keys, upload signatures, and raw
  provider errors remain server-only.
- Finalization rechecks auth, owner/operator authority, category availability,
  target version, media readiness, limits, and rate budgets.
- Autosave/preview/edit/replacement never create new-post events. Concurrent or
  repeated publish calls converge on one Pin and one eligible event.

### Verification gate

- Focused model/API/component tests cover stages, prefill, validation,
  autosave/recovery/conflict, progress, confirmation, retry, exact success
  routing, accessibility/Comfort, and atomic edit/replace behavior.
- Local SQL/server proof covers RLS, server-owned asset state, draft exclusion,
  private Storage, idempotency, notification once-only, stale/deleted/blocked/
  expired negatives, and asset cleanup.
- Pixel Chromium and iPhone WebKit plus two accounts prove private drafts,
  keyboard/safe-area geometry, upload recovery, exact Theater handoff,
  recipient visibility/notification, replacement continuity, zero overflow/
  console errors, and complete test-data/media cleanup.
- Lint, TypeScript, build/paused chunks/budgets, targeted/full Jest, clean local
  replay, advisors, linked history/dry run, and deployed media functions must
  pass before Candidate 3 is accepted.

Full contract:
[docs/SHADOW_PIN_CREATOR_STUDIO.md](C:/repos/chat2.0/docs/SHADOW_PIN_CREATOR_STUDIO.md:1).

## Release Boundaries

- Boards, News, Art Board, ESP Bridge, Activity, and member report intake stay
  paused and must not gain navigation, queries, subscriptions, or eager chunks.
- No Wave Two frontend change is pushed to production `main` during the trial.
- No shared schema change may require the production frontend to adopt a new
  API or data shape.
- The existing Wave One trial site remains the isolated deployment target
  unless a new Wave Two site is intentionally created at the release gate.
- Test-created database rows and Storage objects must be removed before a
  checkpoint is accepted.

## Wave Completion Gate

After all four candidates pass their individual gates, repeat the complete
repository regression suite, paused-feature and bundle checks, linked Supabase
compatibility verification, authenticated short mobile probes, and a separate
Netlify deploy/health-manifest check. The trial is then handed to Tayler for
installed-phone acceptance. Nothing merges to `main` before that approval.

## Progress - July 12, 2026

- Wave Two scope recovered and locked to the four candidates above.
- GitHub, Netlify, linked Supabase, Node/npm/npx, and Playwright checks are
  healthy. Docker Desktop and the local Supabase stack are running for schema
  and RLS verification.
- Candidate 1 completed three independent domain, security/data, and phone UX
  reviews, implementation, and its full checkpoint gate.
- Universal Discovery now provides bounded grouped Messages/People/Pins/Play
  results, partial-error isolation, exact routes with Back restoration, and a
  private cross-source Library for messages, Pins, published TV, and published
  Mystery stories.
- The additive migration is applied to the linked shared Supabase project.
  Linked dry run reports no pending migration and local/remote history matches.
- Candidate 1 proof: clean local replay, database lint/advisors, rollback-only
  multi-user RLS/visibility verification, 171 Jest suites / 872 passing tests,
  zero-warning lint, TypeScript, production build/paused chunks/budgets, and
  authenticated Pixel Chromium plus iPhone WebKit with zero console/page
  errors.
- Candidate 2 domain, security/data, and phone UX reviews are complete. The
  accepted implementation keeps `public.messages` canonical, adds a
  server-owned stable reply-to-root projection, retains the old flat-window
  contract for production, and adds a root-only 2.0 feed plus exact routed
  thread sheet/drawer.
- Candidate 2 passed its checkpoint. Migration `20260712234202` is applied to
  the linked shared project, linked dry-run is clean, migration history is
  aligned, and the updated `send-push` Edge Function is deployed. The old
  flat-window RPC remains unchanged for the production frontend.
- Candidate 2 proof: fresh local replay, rollback-only multi-user SQL verifier,
  zero database-lint/security-advisor findings, catalog ACL/security checks,
  173 Jest suites / 885 passing tests / 16 intentional todos, zero-warning
  lint, TypeScript, production build/paused chunks/budgets, and an
  authenticated two-account realtime pass on Pixel Chromium `412x915` plus
  iPhone WebKit `390x844`. Both engines proved root-feed isolation, routed
  thread geometry, live nested reply delivery without moving the root card,
  exact-target focus, Back restoration, zero horizontal overflow, and zero
  console/page errors. All seven QA messages per run were deletion-confirmed;
  the final artifact is
  `output/playwright/wave2-candidate2-threads/summary.json`.
- Candidate 3 implementation is present locally. The contract uses
  owner-private drafts, private image staging with signed owner previews,
  server-owned staged assets, bounded publish promotion/rollback, idempotent
  finalization, and one lazy four-stage Media/Details/Preview/Publish Studio.
  Seven focused model, history, API, component, entrypoint, media, and SQL
  contract suites pass with 32 tests. Fresh local database replay, rollback verifier, database lint,
  and security advisors also pass. No Candidate 3 linked-backend,
  cross-account browser, function-deploy, production notification, or full
  test-data/media cleanup proof is claimed yet.
- Physical installed-PWA
  keyboard, VoiceOver/TalkBack, and touch-comfort checks remain Wave Two
  release-gate follow-ups rather than automated-browser claims.
