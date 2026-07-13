# Connections

## Documentation Status - July 13, 2026

This document is the product, data, privacy, compatibility, and verification
contract for ShadowChat 2.0 Wave Three Candidate 1. Implementation is in
progress on `codex/shadowchat-2.0`. Production `main` and the production
Netlify frontend remain unchanged.

## Product Contract

Connections are reciprocal relationships between two ShadowChat members. A
Connection exists only after one member requests it and the other accepts, or
after two crossing requests converge on acceptance.

Connections are private:

- no public follower or following lists
- no public Connection lists
- no public Connection counts or popularity score
- no third-party mutual-Connection enumeration in v1
- no connection state returned to anyone outside the pair

The signed-in member can open Connections at
`?view=dms&panel=connections`. Entry points are available from:

- the DM Hub
- another member's public profile
- the signed-in member's own profile

The phone-first surface separates accepted Connections, incoming requests,
and outgoing requests. It uses bounded keyset pagination, clear pending and
empty states, accessible labels, theme-consistent controls, and the existing
Comfort preferences.

## DM Independence

Connections and direct messages are deliberately independent.

- A Connection is not required to start a DM when existing DM discovery rules
  allow the conversation.
- Connecting does not create a DM conversation.
- Declining, cancelling, or removing a Connection does not delete, archive,
  mute, mark unread, or otherwise mutate a DM conversation.
- Existing `dm_discoverable`, personal block, conversation, history, unread,
  archive, mute, and notification rules remain authoritative.
- A personal block continues to stop DM interaction through the existing
  reciprocal block contract, independent of Connection state.

## Canonical Relationship Lifecycle

`public.user_connections` stores one canonical unordered pair. The row uses a
stable ID and canonical first/second member ordering so the same pair cannot
create duplicate directional rows.

Supported statuses:

- `pending` - one member has requested the relationship
- `accepted` - the reciprocal relationship is active
- `inactive` - the request was declined/cancelled or the accepted relationship
  was removed

Supported actions:

- `request`
- `accept`
- `decline`
- `cancel`
- `remove`

Lifecycle rules:

1. A request against no pair creates one `pending` row.
2. Repeating the same pending request is idempotent.
3. A request crossing an existing request from the other member atomically
   converges on one `accepted` row.
4. Only the pending recipient can accept or decline.
5. Only the pending requester can cancel.
6. Either member can remove an accepted Connection.
7. Decline, cancel, and remove transition the canonical row to `inactive`.
   The retained row supports cooldown, anti-spam, deterministic retry, and
   race handling without exposing a public history.
8. An inactive pair can return to pending only through the guarded request
   action and its cooldown rules.
9. A personal block hard-deletes the pair row, whether pending, accepted, or
   inactive. Unblocking does not restore it.

The member UI and list APIs do not present inactive rows as relationships.

## Data And API Contract

Canonical table:

- `public.user_connections`

Internal implementation boundaries:

- `connections_private` schema
- `private.users_are_connected(uuid, uuid)` accepted-pair predicate

Authenticated public wrappers:

- `get_my_connection_state(target_user_id uuid)` returns only the caller's
  relationship state with the target.
- `get_my_connection_summary()` returns caller-private accepted/incoming/
  outgoing counts for the Connections surface. These are not public profile
  counts.
- `list_my_connections(target_scope text, result_limit integer,
  before_updated_at timestamptz, before_id uuid)` returns one
  bounded, deterministically ordered caller-owned page for an approved scope.
- `mutate_connection(target_user_id uuid, target_action text)` owns all five
  supported lifecycle actions.

The public wrappers validate authentication, target identity, action/scope,
pair membership, current state, block state, cooldowns, limits, and transition
authority. Browser code does not insert, update, or delete canonical pair rows
or Connection notification rows directly.

Every returned member payload uses the existing API-safe public profile
projection. Authentication email, legacy `full_name`, private preferences, and
raw `public.users` rows are excluded.

`private.users_are_connected(uuid, uuid)` returns true only for an accepted,
unblocked pair. It is the shared relationship predicate for later ShadowPin
Feed Modes and Inner Circles; pending and inactive rows never qualify.

## Foreground Notifications

Connections v1 uses existing recipient-owned `notification_events` for
foreground in-app notification and refresh behavior only.

Event types:

- `connection_request`
- `connection_accepted`
- `connection_changed`

`connection_request` and `connection_accepted` can produce the visible
foreground treatment. `connection_changed` is a bounded state-refresh event
for lifecycle changes such as decline, cancel, or remove and should not turn a
private relationship change into a public activity item.

`connection_notifications_enabled` controls foreground Connection
notification presentation. Turning it off does not hide canonical incoming
requests, alter Connection state, or prevent the member from opening the
Connections surface.

Each event is recipient-owned, deduplicated, includes only an API-safe actor
profile, and routes to `?view=dms&panel=connections`. Existing
`notification_events` RLS and Realtime publication remain authoritative.

Connections v1 does **not** add OS push delivery, new `send-push` event types,
email notification, SMS notification, or background fanout. That expansion
requires a separate security, preference, abuse, and delivery review.

## Personal Blocking

The existing reciprocal personal-block contract overrides Connection state.

- A blocked pair cannot request, accept, list, inspect, or derive a Connection.
- Creating a block deletes the pair row and clears or suppresses relevant
  unread foreground events without revealing who blocked whom.
- Unblocking restores neither a pending request nor an accepted Connection.
- The pair must begin again with a new guarded request if both members later
  choose to reconnect.
- Connection helpers, notifications, future feed queries, and future circle
  membership must all fail closed across a block.

## Privacy And Security Boundaries

- Browser roles have no direct canonical-table privileges. Caller-scoped RPCs
  enforce pair membership and block filtering for every state, summary, list,
  and mutation operation.
- `PUBLIC` and `anon` receive no table or function access.
- Third parties cannot enumerate pairs, lists, states, private summaries, or
  notification rows.
- Self-connections, arbitrary target IDs, forged acceptance, illegal state
  transitions, pair-column mutation, oversized pages, invalid scopes/actions,
  and cooldown bypass fail server-side.
- Canonical pair uniqueness and guarded state transitions make retries and
  crossing requests converge without duplicate rows or notifications.
- Notification creation is server-owned, recipient-bound, block-aware, and
  deduplicated. The browser cannot choose an arbitrary notification recipient.
- The relationship table is not added to the Postgres Changes publication.
  Foreground refresh uses the existing recipient-owned notification event
  stream plus explicit caller-scoped refetch.
- Any privileged internal function pins its search path, has no implicit
  public execution, and is included in the reviewed Supabase security
  manifest.

## Shared-Supabase Compatibility

Connections ships backend-first to the same Supabase project used by the
production and 2.0 trial frontends. The rollout must remain additive:

- no existing table, column, RPC signature, RLS behavior, or Edge Function
  request type is removed or repurposed
- the production frontend is not required to query the new table or wrappers
- existing notification consumers continue to ignore the new event types
- existing DM, profile, Universal Discovery, personal-blocking, ShadowPin, and
  Activity behavior remains unchanged
- the old production frontend receives no new eager subscription or runtime
  work

The backend migration is applied only after clean local replay, contract tests,
linked history review, dry run, security-manifest verification, and explicit
old-frontend compatibility proof.

## Verification And Cleanup

### Database and security proof

- authenticated owner visibility and anonymous/third-party denial
- safe-profile output with no email, `full_name`, or raw user row
- self-target, forged action, illegal transition, and protected-column denial
- idempotent repeat request and atomic crossing-request acceptance
- accept/decline/cancel/remove authority and inactive-row cooldown behavior
- deterministic keyset pages and caller-private summary counts
- exactly-once recipient notifications and preference behavior
- block teardown, notification suppression, and no restore after unblock
- `private.users_are_connected` true only for accepted, unblocked pairs
- least privileges, fixed search paths, reviewed privileged-function manifest,
  database lint, and security advisors

The local SQL verifier runs inside a transaction and rolls back all seeded
users, pairs, blocks, preferences, and events.

### Browser proof

Use two authenticated contexts across Pixel Chromium and iPhone WebKit to
prove:

- DM Hub, public-profile, and own-profile entry points
- exact `?view=dms&panel=connections` route and Browser Back restoration
- request, incoming foreground event, accept, decline, cancel, and remove
- rapid duplicate input and crossing-request convergence
- realtime refresh without duplicate banners or stale badges
- block/unblock teardown with no relationship restoration
- existing DM conversation and history remain unchanged
- phone safe areas, keyboard behavior, text scaling, reduced motion, touch
  sizing, loading/error/empty states, and no horizontal overflow
- zero unexpected console, page, network, or Supabase errors

### Cleanup contract

Every automated or manual QA run must track exact pair and event IDs. Cleanup
must remove run-scoped Connection rows and `notification_events`, restore any
controlled Connection preference or block state, preserve unrelated existing
DMs and user data, and verify every scoped counter at zero. A verifier must
refuse to overwrite an unrelated pre-existing relationship between controlled
accounts.

## Explicit V1 Exclusions

- public followers/following
- public Connection or mutual-Connection counts
- third-party graph browsing or recommendations based on private graph edges
- OS push, email, SMS, or background Connection notifications
- automatic DM creation or Connection-only DM restrictions
- automatic restoration after unblock
- Inner Circles or circle-based content visibility
- ShadowPin Feed Modes or Connection-based ranking
- contact-book upload, phone-number matching, invite scraping, or external
  social-graph import
- AI-generated people recommendations

Wave Three Candidate 2 and Candidate 3 own Feed Modes and Inner Circles after
this foundation is implemented, verified, and accepted.
