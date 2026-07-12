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
  errors. Candidate 2 strategy review is next.
