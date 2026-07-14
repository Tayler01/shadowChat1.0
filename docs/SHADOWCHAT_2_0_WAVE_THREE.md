# ShadowChat 2.0 - Wave Three

## Goal

Build and validate the third high-impact ShadowChat 2.0 product wave on
`codex/shadowchat-2.0`, one independently verified candidate at a time. The
production `main` branch and production Netlify frontend remain unchanged.
Shared Supabase work must be additive, preserve the current auth, RLS,
personal-blocking, and private-identity contracts, and remain compatible with
both the production frontend and the isolated 2.0 trial frontend.

## Authoritative Sequence

1. **Connections** - a private reciprocal relationship layer with explicit
   requests, acceptance, removal, blocking teardown, and phone-first access
   from the DM Hub and profiles.
2. **ShadowPin Feed Modes** - member-controlled ways to move between the
   existing broad ShadowPin experience and a Connections-based feed without
   weakening canonical Pin visibility or engagement rules.
3. **Inner Circles** - private member-curated groups built only after the
   Connections relationship and feed semantics are stable.

Each candidate receives its own contract, implementation checkpoint, focused
security and behavior tests, Pixel Chromium and iPhone WebKit proof, shared-
backend compatibility check, cleanup proof, documentation update, and branch
checkpoint. Combined regression and isolated Netlify verification run after
all three candidates.

## Candidate 1 Contract - Connections

### Product shape

- Connections are reciprocal and private. They are not public follower lists,
  public popularity scores, or public connection counts.
- Open the Connections surface at `?view=dms&panel=connections`. Entry points
  live in the DM Hub, another member's public profile, and the signed-in
  member's own profile.
- The surface separates accepted Connections, incoming requests, and outgoing
  requests while keeping pending and empty states understandable on a phone.
- Connecting is not required to start or retain a DM. Existing
  `dm_discoverable`, conversation, archive, unread, mute, block, and message
  history rules remain independent and authoritative.
- Removing a Connection does not delete or alter an existing DM conversation.

### Relationship lifecycle

- `public.user_connections` stores one canonical unordered pair and uses only
  `pending`, `accepted`, and `inactive` relationship states.
- A first request creates `pending`. Repeating the same request is idempotent.
  Crossing requests converge on one accepted relationship rather than two
  rows.
- The recipient can accept or decline. The requester can cancel. Either member
  can remove an accepted Connection. Decline, cancel, and remove transition the
  canonical row to `inactive` so cooldown, abuse resistance, and retry
  semantics do not depend on deleted history.
- A later request can reactivate the canonical pair only through the guarded
  mutation contract and its cooldown rules.
- Creating a personal block hard-deletes the pair row. Unblocking never
  restores a Connection or pending request; a new request is required.

### Backend contract

- Canonical table: `public.user_connections`.
- Internal implementation schema: `connections_private`.
- Internal accepted-pair predicate:
  `private.users_are_connected(uuid, uuid)`.
- Authenticated public wrappers:
  - `get_my_connection_state(target_user_id uuid)`
  - `get_my_connection_summary()`
  - `list_my_connections(target_scope text, result_limit integer,
    before_updated_at timestamptz, before_id uuid)`
  - `mutate_connection(target_user_id uuid, target_action text)`
- Supported mutation actions are `request`, `accept`, `decline`, `cancel`, and
  `remove`.
- Reads are caller-scoped, bounded, and deterministically keyset-paginated.
  Public profile payloads use the existing safe public-profile projection.
- No browser code writes pair rows or notification rows directly. The guarded
  mutation boundary owns canonical pair ordering, legal state transitions,
  crossing-request convergence, cooldown enforcement, and notification
  creation.

Full contract:
[docs/CONNECTIONS.md](C:/repos/chat2.0/docs/CONNECTIONS.md:1).

### Notifications

- Connections v1 uses recipient-owned `notification_events` for foreground
  in-app state only. It does not add OS push delivery or expand `send-push`.
- Event types are `connection_request`, `connection_accepted`, and
  `connection_changed`. Request and acceptance may produce the visible
  foreground treatment; changed events provide a bounded refresh signal for
  decline, cancel, remove, or other nonblocked lifecycle changes.
- `connection_notifications_enabled` controls foreground Connection
  notification presentation. It does not hide canonical incoming requests or
  change relationship state.
- Events use dedupe keys, safe actor profiles, recipient-only RLS, and the
  existing Realtime publication. A block clears or suppresses pair events and
  must not disclose block direction.

### Security and compatibility boundaries

- Pair rows and lists are visible only to a participating member, and only
  while the pair is not blocked. Third parties cannot enumerate the graph.
- All caller-controlled IDs, states, actions, pagination values, and state
  transitions are validated server-side. Self-connections, forged acceptance,
  illegal transitions, and arbitrary pair mutation fail closed.
- Raw `public.users` rows, authentication email, and legacy `full_name` never
  enter Connection APIs, Realtime payloads, or notification payloads.
- Schema and API additions remain backward compatible with the production
  frontend. Existing RPC signatures, DM behavior, profile behavior, and
  notification types are not removed or repurposed.
- `private.users_are_connected(uuid, uuid)` is the only shared accepted-pair
  predicate prepared for later Feed Modes and Inner Circles. Those candidates
  must not infer a relationship from pending or inactive rows.

### Verification gate

- Transactional SQL proof covers owner isolation, third-party denial, safe
  profiles, legal and illegal transitions, self-target denial, idempotent and
  crossing requests, cooldowns, deterministic pagination, notification
  dedupe, preference behavior, personal-block teardown, and no restore after
  unblock.
- Focused Jest covers the SQL contract, typed API/model behavior, realtime
  refresh and optimistic rollback, route restoration, DM independence, profile
  controls, empty/error states, and mobile accessibility.
- Two authenticated browser contexts prove request, foreground notification,
  accept, cancel/decline/remove, rapid duplicate input, block/unblock behavior,
  route and Back handling, and no effect on existing DM history.
- Pixel Chromium and iPhone WebKit must show no horizontal overflow, hidden
  actions, keyboard collision, unsafe-area overlap, console errors, page
  errors, or unexpected Supabase failures.
- Every run removes its scoped pair rows and Connection notification events,
  restores any controlled preference or block state, and verifies all scoped
  counters at zero.
- Lint, TypeScript, production build, paused-feature and bundle checks,
  targeted/full Jest, clean local Supabase replay, lint/advisors, linked
  migration parity/dry run, old-frontend compatibility smoke, and the isolated
  Netlify trial must pass before Candidate 1 is accepted.

## Candidate 2 Contract - ShadowPin Feed Modes

Candidate 2 is accepted after the Connections checkpoint. Feed Modes
uses accepted, unblocked Connections through the canonical pair predicate and
preserves current ShadowPin RLS, blocks, ready/deleted visibility, search,
engagement, Creator Studio, notification, and Discover behavior. The exact
two-mode, chronological ordering, no-fallback empty state, keyset pagination,
account preference, Connections-scoped Theater, accessibility, and cleanup
contract is locked in
[docs/SHADOW_PIN_FEED_MODES.md](C:/repos/chat2.0/docs/SHADOW_PIN_FEED_MODES.md:1).

## Candidate 3 Contract - Inner Circles

Candidate 3 is accepted after Connections and Feed Modes passed their
independent gates. Inner Circles are private, owner-curated lists of accepted Connections.
V1 supports up to 10 circles per owner and 50 members per circle. Circle names,
membership, and counts are visible only to the owner; adding or removing a
member creates no notification and no new relationship, DM, group chat, badge,
or public graph signal.

Membership is keyed to the member and revalidates the canonical accepted,
unblocked Connection on every mutation and read. Disconnecting or blocking
hard-deletes memberships in both directions. Unblocking or reconnecting never
restores prior circle membership.

Inside `feed=connections`, a transient owner-private circle filter may narrow
the already eligible Connections feed. It is route state, not a third persisted
feed mode, and it never grants visibility or creates a circle publishing
audience. Search stays universal. Circle-scoped Theater must preserve the
filter and use server-side keyset/window APIs; it must never client-filter broad
pages or paint broader Connections content under a circle label.

Circle-only publishing, sharing/audience permissions, group DMs, live rooms,
member invitations, public counts, and member-facing Activity/reporting remain
explicitly excluded from v1.

## Final Flagship Track

### Shado Live

- Specify and prototype Shado Live now so its product, safety, moderation,
  presence, media, notification, failure, and operator requirements can be
  tested early.
- Do not build or release the full live system until Activity and member
  reporting are dependable enough to support the required safety and operator
  workflows.
- Activity HQ and member-facing report intake remain paused under the current
  product contract. The full Shado Live build is therefore gated unless Tayler
  explicitly changes those dependencies.

### Catch-Up

- Begin Catch-Up as a deterministic, source-linked summary experience with
  visible provenance and exact routes back to the underlying content.
- Keep the first implementation non-AI so omissions, ordering, unread bounds,
  block filtering, and source accuracy can be measured directly.
- Trial AI summarization only after the deterministic contract is dependable,
  and keep that trial private until accuracy, privacy, attribution, cost, and
  failure behavior are accepted.

## Release Boundaries

- Boards, News, Art Board, ESP Bridge, Activity HQ, and member-facing report
  intake stay paused and must not gain navigation, subscriptions, or eager
  runtime work through Wave Three.
- No Wave Three frontend change merges to production `main` or deploys to the
  production Netlify site during the trial.
- Shared Supabase work must be additive and compatible with the current
  production frontend before it is applied.
- Test-created rows, notifications, users, uploads, and derived media must be
  removed and verified before a checkpoint is accepted.

## Progress - July 13, 2026

- The authoritative Wave Three and final-track sequence is locked in this
  document.
- Connections is implemented and accepted on `codex/shadowchat-2.0`. The
  additive migration is linked, the unchanged production frontend passed its
  compatibility smoke, and immutable deploy `6a556190a9c126b4758b29f1`
  passed repeat Pixel Chromium/iPhone WebKit lifecycle, realtime, routing,
  focus, geometry, DM-independence, and zero-residue proof.
- ShadowPin Feed Modes is accepted. Additive migration `20260713223200` is
  linked; immutable deploy `6a5575bcbc2a1131aab40695` and the stable isolated
  URL passed the complete two-account Pixel Chromium/iPhone WebKit feed,
  Theater, engagement, lifecycle, routing, geometry, diagnostics, and
  zero-residue verifier.
- Inner Circles is accepted. Additive migration `20260713235745` is linked with
  clean local/remote security and no-pending proof; the unchanged production
  frontend passed its compatibility smoke. All 201 Jest suites (1,065 tests),
  42 Node contracts, lint, typecheck, build/budgets, transactional SQL, and the
  complete Pixel Chromium/iPhone WebKit verifier passed against immutable
  deploy `6a55892252f0d306fae5b852` with exact zero-residue cleanup. Stable
  isolated deploy `6a558acc257a6d21fa379fa2` serves byte-identical HTML and
  all 12 boot assets and passed a fresh iPhone WebKit Connections -> Circles
  route check.
- The cumulative Wave Three gate is accepted on exact immutable deploy
  `6a558acc257a6d21fa379fa2`. Connections, ShadowPin Feed Modes, and Inner
  Circles each passed their complete two-account Pixel Chromium/iPhone WebKit
  verifier with exact cleanup; the core auth, DM, and mobile DM Back smoke also
  passed. The smoke readiness selector now follows the visible mobile message
  viewport and composer instead of the intentionally hidden legacy Lounge
  header.
- Shado Live is specified and implemented as a flagged, frontend-only local
  interaction prototype. Its unit and Pixel Chromium/iPhone WebKit gates pass
  without media permission, provider, Supabase, notification, or residue work;
  the real live system remains gated by paused Activity and reporting.
- Deterministic Catch-Up is implemented behind its isolated-trial flag. Additive
  migration `20260714020000` is linked with clean local/remote migration,
  database-lint, security-contract, transactional two-user, unchanged-
  production compatibility, unit, routing, and Pixel Chromium/iPhone WebKit
  proof. It remains source-linked and non-AI; no private AI trial has started.
- The final flagged build and isolated Netlify deployment are the remaining
  release step for these two tracks.
- Production `main` and the production Netlify frontend remain unchanged.
