# Activity HQ

## Status - ShadowChat 2.0 Wave One

Activity HQ is implemented on the isolated `codex/shadowchat-2.0` branch, but
its frontend is paused for the current phone trial at Tayler's request. The
default build omits its navigation, lazy view, provider fetch, and Realtime
subscription. Its additive database contract, source, migrations, and tests
remain preserved and compatible with both frontends against the same Supabase
project. Re-enable only through `VITE_FEATURE_ACTIVITY=true` plus the release
gate below.

The separately flagged deterministic Catch-Up trial may read bounded,
caller-visible `activity_events` only through the on-demand
`get_my_catch_up_v1` RPC after the member opens or refreshes Catch-Up. It does
not mount Activity navigation, its provider, badge query, fetch loop, or
Realtime subscription. See
[CATCH_UP.md](C:/repos/chat2.0/docs/CATCH_UP.md:1) for the narrow exception and
acknowledgement contract.

## Product Contract

Activity is a first-class destination for durable, recipient-owned updates:

- incoming direct messages
- General Chat mentions and direct replies
- reactions to General Chat or DM messages
- targeted message Hype
- new ShadowPin posts allowed by the existing preference
- ShadowPin comments and one-level replies

It deliberately excludes every General Chat message, broadcast Hype bell
events, paused domains, admin-role notices, and historical backfill.

The installed-app badge remains DM-only during the parallel 2.0 trial so DM
events are not counted twice. Activity has its own navigation badge.

## Data Model

`public.activity_events` is separate from `public.notification_events`.
`notification_events` remains the legacy push-delivery, retry, and dedupe
ledger used by the production frontend. Its `read_at` field is not Activity
state.

Activity rows are created by authoritative source-table triggers, independent
of push subscriptions, quiet hours, or foreground delivery. There is no
historical backfill. The table has:

- normalized recipient and actor IDs
- typed source foreign keys
- bounded preview and metadata fields
- deterministic dedupe keys
- stable `(occurred_at, id)` keyset ordering
- an Activity-only `read_at`
- owner-only, reciprocal-block-aware RLS
- recipient SELECT and column-only `read_at` UPDATE grants
- no authenticated INSERT or DELETE grant

The migration also narrows legacy authenticated
`notification_events` updates to `read_at` only. This matches the current
production frontend behavior while preventing recipients from changing
delivery evidence or payload fields.

## Realtime And Recovery

`activity_events` is in the `supabase_realtime` publication. The client uses
an unfiltered Postgres Changes binding because the local Realtime server rejects
the new-table filtered binding with an internal argument error. Recipient-only
RLS remains authoritative, and the callback independently rejects rows whose
`user_id` does not match the signed-in member.

Realtime is a responsiveness layer, not the source of truth. Initial load,
focus/resume recovery, and reconnect recovery query the table again. Inserts
are deduplicated by row ID.

## UX Contract

- When explicitly re-enabled, phone navigation includes Activity and desktop
  navigation exposes the same destination.
- Desktop: Activity is a normal sidebar destination.
- All and Unread views use 44-pixel minimum controls.
- Rows group into Today, Yesterday, and Earlier.
- Initial and subsequent pages use a 30-row keyset boundary.
- Read actions are optimistic and roll back on failure.
- Row activation marks the event read and opens the exact Chat message, DM
  message, Pin, or Pin comment.
- Unavailable targets remain readable without accepting arbitrary URLs.
- The screen includes loading, empty, caught-up, offline, retry, and end states.
- Unread state is conveyed with text and shape, not color alone.
- New rows use a polite live-region announcement.

DM and ShadowPin foreground toasts also have a hard five-second dismissal in
addition to the normal toast timer. Hovering cannot leave them over Activity
controls indefinitely.

## Verification

The implementation is covered by:

- `tests/activityEventsSql.test.ts`
- `tests/activityModel.test.ts`
- `tests/ActivityView.test.tsx`
- updated navigation, routing, notification, and security-allowlist tests
- `scripts/verify-activity-events-local.sql`

The local SQL verifier creates isolated users and exercises DM, mention, reply,
reaction, Hype, ShadowPin post/comment/reply, RLS isolation, column-only read
updates, blocking cleanup, and source cleanup inside a rolled-back transaction.

Visual QA passed on Android Chromium and actual WebKit phone layouts. The live
browser proof includes an authoritative DM insert, Activity badge increment,
realtime prepend, typed route handoff, exact Pin-comment focus, and zero console
errors after fixture setup.

## Shared-Backend Rollout - Complete July 12, 2026

Migration `20260711194211` is canonical, applied to the linked Supabase project,
and verified by linked history, dry run, lint, and the reviewed security
contract. The 2.0 frontend is live only on the separate
`shadowchat-2-0-wave-one` Netlify site; production `main` remains unchanged.
