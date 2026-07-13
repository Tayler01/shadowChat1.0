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

## Candidate 4 Contract - First-Run Activation Journey

### Product shape

- Enroll only genuine invite signups created after the activation rollout.
  Existing members and non-invite profiles retain the current app and legacy
  install guidance without receiving a synthetic journey.
- Keep setup non-blocking and resumable. Close/minimize preserves server
  progress; reload and another device recover the authoritative revision.
- Guide identity review, notification choice, device-local Comfort review, and
  one selected first action: General Chat message, direct message, or
  ShadowPin image heart.
- Let the canonical action complete the core journey server-side, then restore
  a compact success card. PWA installation stays optional and never gates core
  completion.
- Use truthful device-specific install help. iPhone receives Safari steps and
  Android retains its matching video/native prompt path.

### Architecture decision

- Add owner-private `user_activation_journeys` plus a fixed rollout marker.
  An `AFTER INSERT` profile trigger enrolls only a post-rollout Auth user with
  a matching post-rollout private invite-redemption receipt; there is no
  backfill.
- Keep the read RPC `SECURITY INVOKER`. The exact public mutation signature is
  also `SECURITY INVOKER` and delegates to an owner-checking, revision-guarded
  definer in the unexposed `activation_private` schema.
- Record immutable completion from canonical message, DM, and ShadowPin-heart
  insert triggers only when the action matches the member's selected intent.
- Enforce identity-before-preferences, preferences-before-action, and
  completion-before-install in validated database constraints, not only in the
  React flow.
- Revoke PostgreSQL's global default function execution for future
  postgres-owned functions. Every future API function must grant intended
  roles explicitly.

### Security boundaries

- Force RLS, grant authenticated members owner-only `SELECT`, and deny direct
  member `INSERT`, `UPDATE`, and `DELETE`.
- Reject anonymous RPC execution, missing enrollment, stale revisions,
  out-of-order receipts, unsupported choices, and attempts to change a
  completed first-action kind.
- Keep `activation_private` out of PostgREST exposed schemas. Direct public
  helper lookup and explicit private-schema requests must both fail.
- Keep shared-backend changes additive: no production RPC, table-column, or
  legacy frontend contract is removed or changed.

### Verification gate

- Fresh local replay and transactional SQL proof must cover future-only invite
  enrollment, non-invite/pre-rollout negatives, forced-RLS isolation, denied
  direct writes, stale revisions, receipt ordering, minimize/resume, all three
  canonical action routes, idempotency, optional install, and rollback cleanup.
- Catalog and hosted REST proof must show invoker-only public RPC, unexposed
  owner-checked definer, explicit ACLs, fail-closed future function defaults,
  and no activation security-advisor finding.
- Pixel Chromium and iPhone WebKit must prove signup enrollment, Back/Escape/
  reload recovery, keyboard/footer geometry, Chat/DM/Pin handoffs, first-action
  completion, install outcomes, text scaling, cross-account isolation, zero
  unexpected browser/network errors, and complete disposable-data cleanup.
- Lint, TypeScript, build/paused chunks/budgets, focused/full Jest, linked
  history/dry run, and the immutable isolated Netlify deploy must pass before
  Candidate 4 is accepted.

Full contract:
[docs/FIRST_RUN_ACTIVATION_JOURNEY.md](C:/repos/chat2.0/docs/FIRST_RUN_ACTIVATION_JOURNEY.md:1).

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

## Progress - July 13, 2026

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
  server-owned staged assets, leased atomic image publication with scheduled
  orphan recovery, private-until-publish Bunny delivery, target-version
  guards, bounded media work, idempotent finalization, and one lazy four-stage
  Media/Details/Preview/Publish Studio. Local recovery now preserves newer
  unsynced metadata, Back/close and draft switches flush safely, late saves are
  scoped to their draft, Chat/DM success routes retain their origin, and all
  direct actions meet the shared phone touch baseline.
  Seven focused model, history, API, component, entrypoint, media, and SQL
  contract suites pass with 46 tests; the broader Candidate 3 route/ShadowPin
  set passes 9 suites and 107 tests. The hardening backend gate passes a fresh
  local reset, expanded rollback verifier, database lint/advisors, Deno/Node
  checks, and 3 focused suites with 21 tests.
- Candidate 3's expanded final checkpoint passed against immutable isolated
  Netlify deploy `6a549b1e052c56307d851b7d`, not production or the mutable
  site alias. Nineteen recorded checks across Pixel Chromium `412x915` and
  iPhone WebKit `390x844` proved every Studio entry point, image/local-video/
  external-video/image-URL selection, private draft/asset isolation, signed
  recovery, injected retry recovery, one idempotent Pin/event, exact Theater
  routing, and atomic edit/category-move/media replacement. The expanded run
  found and fixed an existing-poster preview ordering regression; replacement
  selection now shows the new blob immediately while public media remains
  unchanged until finalization. Cleanup removed all scoped database and Storage
  artifacts and verified zero remaining rows and objects. Evidence:
  `output/playwright/wave2-candidate3-creator-studio/summary.json`.
- Candidate 3 linked history/dry-run and the combined Wave Two regression gate
  are clean. The authenticated checkpoint does not claim production
  publication or physical installed-PWA certification.
- July 13 phone-hardening follow-up: General Chat threads now reuse the shared
  mobile footer so the composer stays against the software keyboard while the
  bottom navigation remains present; message action portals sit above the
  thread sheet. Creator Studio autosave no longer disables focused fields, its
  action footer participates in the visual-viewport flex layout, focused
  fields are re-revealed during keyboard settling, and media preview uses local,
  staged, direct, provider-poster, and authenticated link-preview fallbacks.
- The immutable Studio rerun exposed a stale-session 401 at the Netlify media
  boundary after several authenticated navigation and draft operations. The
  media client now mirrors the shared Edge Function recovery contract: current
  token first, one locked refresh/retry on 401, identical body/signal, and no
  retry for other statuses.
- ShadowPin Theater now coalesces drag rendering to animation frames, accepts
  up to three queued swipes during the 220ms handoff, preloads two Pins on each
  side, and reuses locally resolved routed Pins instead of refetching exact and
  neighbor rows on every swipe. Pixel Chromium and iPhone WebKit both completed
  two rapid touch swipes from Pin 1 to Pin 3 of 18 and stayed settled without
  route/title snapback or console/page errors. Evidence:
  `output/playwright/shadow-pin-theater-rapid-swipe/summary.json`.
- Candidate 4 is implemented and remotely aligned. Its activation table is
  future-invite-only and owner-private; validated constraints enforce receipt
  order; canonical message/DM/Pin triggers own completion; the public mutation
  RPC is invoker-only over an unexposed owner-checking definer; and future
  postgres-owned functions now default to no role execution.
- Candidate 4 passed a fresh local replay, rollback-only transactional
  verifier, local/linked lint, local advisors, hosted activation-advisor filter,
  catalog/REST privilege negatives, linked migration parity, and exact remote
  no-pending proof.
- Candidate 4's expanded authenticated checkpoint passed on immutable deploy
  `6a549b1e052c56307d851b7d`: six Pixel Chromium/iPhone WebKit profiles, 139
  checks, and 47 screenshots across General Chat, DM, and ShadowPin action
  choices. It proves future-invite enrollment, Escape/Back/reload resume,
  focused footer geometry, nested DM and Pin raw-Back restoration, all three
  canonical actions in both engines, cross-owner denial, optional install
  contracts, zero browser/network/origin/backend errors, and zero live push
  delivery. Cleanup removed all six users/invites, four messages, two DM
  conversations, and two Pin hearts and proved all 14 scoped counters zero.
  Evidence:
  `output/playwright/wave2-candidate4-activation/activation-1783930103447-a91d2b7f0b9c/summary.json`.
- The expanded Pin action found and fixed a URL/local-state race where Browser
  Back before exact-image lookup completion could leave Theater open after
  `?pin=` disappeared. Route absence now closes only the route-owned viewer and
  preserves the category grid; focused Jest plus Pixel/WebKit live proof pass.
- The combined repository gate passed 188 Jest suites / 972 tests / 16
  intentional todos, zero-warning lint, TypeScript, warning-free production build, paused
  feature verification, and bundle budgets. The exact deploy health endpoint
  returned directly with HTTP 200. Its optional build identity fields were
  null, so verification bound the Netlify API deploy ID, immutable hostname,
  and all deployed JavaScript chunks instead.
- All four Wave Two candidates are ready for Tayler's installed-phone trial.
  Production `main` and the production Netlify frontend remain unchanged.
- Physical installed-PWA
  keyboard, VoiceOver/TalkBack, and touch-comfort checks remain Wave Two
  release-gate follow-ups rather than automated-browser claims.
