# Catch-Up

## Status - Production Deterministic V1

Catch-Up is the production, lazy, source-linked, non-AI notification center at
`?view=catchup`.

As of July 17, 2026, notification-inbox cards join their `actor_id` to the
current API-safe public profile projection. Every notification with a user
actor therefore uses the member's current PFP, name, fallback color, and
clickable canonical profile action instead of depending on an older event
payload. System notifications without a user actor retain the branded initials
fallback and do not invent a profile target.

Unread notification cards can be swiped left past a deliberate threshold to
mark the exact event read without opening its source. The revealed `Read`
control provides the same action for keyboard and assistive-technology users.
Opening a card still opens its exact source and marks that same event read.
Both paths clear the matching system notification and request a unified app
badge refresh.

## Product Contract

Catch-Up answers one question: "What should I look at since I was away?" It is
not a generated narrative and it does not pretend that a bounded window is the
entire history.

The screen has four fixed sections:

1. **Needs you** - incoming Connection requests, mentions, direct replies,
   reactions, targeted Hype, and ShadowPin comments/replies.
2. **Direct messages** - one source card per conversation with canonical unread
   count or manually-unread state and an exact first-unread target. Current
   unread conversations remain visible even when their latest message predates
   the activity lookback; the source state, not an arbitrary date cutoff, is
   authoritative for DMs.
3. **General Chat** - visible unread root messages inside the bounded lookback.
   Targeted thread replies remain represented through Needs you; broad thread
   aggregation is deferred rather than guessed.
4. **ShadowPin** - eligible new-post events still waiting for acknowledgement.

Sections and cards are ordered deterministically newest-first by
`(occurred_at, source_id)`. Every card contains typed IDs, never an arbitrary
URL, and the frontend constructs an exact route back to the source.

The header visibly says `Source-linked / No AI`, displays the snapshot time,
and states the seven-day activity window. Truncated and older-unread states are honest;
the UI must not say "caught up" while a section reports omitted older work.

## On-Demand Backend

Migration `20260714020000_deterministic_catch_up_v1.sql` adds two narrow public
invoker RPCs:

- `get_my_catch_up_v1(section_limit integer, lookback_hours integer)`
- `acknowledge_my_catch_up_events(target_event_ids uuid[])`

The retrieval RPC clamps sections to 1-12 items and lookback to 24-336 hours.
It returns one transactionally consistent versioned JSON envelope with exact
effective time, fixed section order, shown/total counts, truncation flags,
current source preview, safe actor projection, unread counts, typed targets,
and the Activity IDs represented by a targeted card.

There is no summary table, browser-written snapshot, Edge Function, model call,
provider secret, Realtime subscription, eager badge query, or background job.

## Activity Ledger Exception

Activity HQ remains paused. Catch-Up may read the existing recipient-owned
`activity_events` ledger only through `get_my_catch_up_v1` when the user opens
or refreshes Catch-Up. It does not import or mount `ActivityProvider`,
`ActivityView`, Activity navigation, its badge, or its Realtime subscription.

This narrow reuse is deliberate: targeted reactions, Hype, comments, and Pin
events already have authoritative recipient, source, dedupe, ordering, block
cleanup, and RLS semantics. Reconstructing their audience later would be less
accurate and less private.

DM and General Chat unread state do not trust Activity `read_at`:

- DMs use canonical `read_by` plus owner-private `marked_unread_at`.
- General Chat uses the caller's `user_read_cursors` boundary and excludes
  mapped thread replies from the broad root list.
- Connections use the canonical current pending state.

Opening a targeted Activity or Pin card acknowledges only its represented
Activity IDs. Opening DMs, Chat, or Connections does not bulk-mark source state;
the source surface remains authoritative.

## Privacy And Security

- Both RPCs require authentication, use `SECURITY INVOKER`, and have locked
  search paths and explicit grants.
- Source RLS and reciprocal personal blocking remain authoritative.
- Actor data uses `user_public_profile_json`; raw `users`, email, private
  identity fields, block direction, and private circle data are never returned.
- Deleted, blocked, soft-hidden, or newly invisible sources disappear because
  the snapshot rejoins current caller-visible source rows.
- Event acknowledgement is owner-scoped, unread-only, deduplicated, and capped
  at 50 UUIDs.
- The RPC returns typed target facts only. Unknown/malformed targets fail
  strict frontend normalization and cannot become navigation URLs.

## Route And Back Contract

- Catch-Up: `?view=catchup`
- Connection request: `?view=dms&panel=connections`
- General Chat: `?view=chat&message=<id>`
- DM: `?view=dms&conversation=<id>&message=<first-unread>`
- Pin: `?view=pins&pin=<id>`
- Pin comment/reply:
  `?view=pins&pin=<id>&panel=comments&comment=<id>`

Opening a source pushes a `catch-up-result` history layer. Browser Back and the
source surface's in-app close control return to the per-account cached snapshot,
scroll position, and originating-card focus without an eager refetch. Re-entry
revalidates snapshots older than 30 seconds; the refresh control always forces
an immediate update.

## Failure And Accessibility

- Loading, empty, retry, stale-snapshot refresh failure, truncated, and
  older-unread states are distinct.
- The phone view preserves the fixed bottom navigation and safe-area padding.
- Cards render the safe actor thumbnail already returned by the snapshot, with
  initials as the image-error or missing-image fallback. The avatar is a
  separate control that lazily opens the canonical public profile card without
  opening or acknowledging the source item.
- Notification-inbox actor media is refreshed through the live safe public
  profile relationship, so changing a PFP does not leave old inbox cards
  permanently stale.
- Notification cards support vertical scrolling without gesture conflict and
  a horizontal swipe-left read action with an explicit accessible equivalent.
- Controls use the shared phone touch baseline and visible focus treatment.
- Counts and unread state use text in addition to color.
- Loading animation remains essential status motion and all other motion stays
  under the Comfort provider.
- The feature makes no request before its route is opened.

## Verification Gate

- transactional SQL: authentication, owner isolation, cross-owner denial,
  current-source previews, deterministic order/counts, DM/manual unread,
  General Chat cursor bounds, Connections, Activity/Pin acknowledgement,
  block/delete disappearance, lookback truncation, and rollback;
- frontend: strict normalization, unknown target denial, exact typed routes,
  cache/Back behavior, empty/error/truncated states, no bulk read, and no
  Activity provider import;
- Pixel Chromium and iPhone WebKit: route, source open, Back restoration,
  no eager request before entry, no Activity Realtime channel, geometry,
  diagnostics, and zero test residue;
- full lint, TypeScript, build/budgets, Jest, linked migration parity, database
  lint/security, and unchanged-production compatibility smoke; and
- deploy only to `https://shadowchat-2-0-wave-one.netlify.app`.

## Private AI Trial - Not Started

V1 contains no AI code. A later private trial requires a server-only tester
allowlist and flag. It may summarize only the already-authorized deterministic
snapshot, must retain exact source citations, must fail back to this view, and
must store nothing by default. Accuracy, omission, privacy, attribution, cost,
and failure behavior require separate acceptance before any release.
