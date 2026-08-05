# Notification Reliability Rebuild

## Status - July 17, 2026

This is the production implementation and acceptance contract for the
notification reliability rebuild. Tayler approved the complete rollout to
`main` on July 17, 2026.

The rebuild preserves the notification features users already have while
replacing the piecemeal foreground presentation, launcher-badge, and read-state
behavior with one recipient-owned contract.

The full Jest and Node contract suites, production build gates, clean local
migration replay, local and linked database lint, local security contract, and
authenticated iPhone WebKit/Android Chromium checks passed before rollout.
Installed-phone delivery behavior remains an ongoing operational validation
surface.

The July 17 notification-center follow-up makes actor identity dependable at
read time: unread events join their `actor_id` to the current API-safe public
profile, and every resulting PFP opens the canonical profile card. Inbox cards
also support swipe-left mark-as-read without source navigation, with an
equivalent revealed Read button. Both open-and-read and swipe-and-read paths
clear the matching system notification and refresh unified badges.

Swipe dismissal now uses the same durable read contract rather than removing a
card on animation alone. The event ID is queued in user-scoped device storage
before the read RPC, confirmed reads clear the queue and card, failures restore
the card, and pending IDs replay before the next inbox fetch. A claimed
horizontal gesture also locks only the Catch-Up scroller until release. Early
diagonal finger jitter remains undecided, clear vertical intent stays native,
and a claimed left swipe keeps ownership even if the finger later drifts down.
Touch input uses a native non-passive listener on the active gesture so mobile
Safari and Chrome cannot cancel the swipe before the React pointer layer sees
it; touch-generated pointer compatibility events are ignored to prevent double
handling, and multi-touch remains available for pinch zoom.
Full Comfort motion uses a deterministic rasterized sand finish; reduced and
none keep the same confirmed-read behavior without capture or particles.

The July 18 persistence follow-up distinguishes the bounded 30-card page from
the complete unread ledger. Production evidence showed that exact reads
remained read and did not recreate their dedupe keys; a large historical
backlog was simply refilling the fixed page. Catch-Up now displays `showing X of
Y`, offers a caller-scoped `Mark all read` transaction, invalidates its
deterministic cache after confirmed reads, and checks interrupted retry IDs by
exact canonical unread state even when they are beyond the first page.

The full-motion finish now captures the real notification card rather than
placing generic decoration over it. A bounded `html-to-image` canvas snapshot
includes the rendered surface, avatar, text, and controls; Canvas 2D pixel data
then supplies thousands of deterministic, original-color grains. A noisy
left-to-right erosion front removes the captured card while those grains blow
left and disperse. The list reflows only after the read is server-confirmed and
the sand animation completes. Reduced motion uses a short fade, no-motion
removes the confirmed row immediately, and the former CSS fracture remains a
failure fallback when safe raster capture is unavailable.

The same rollout establishes a one-time production baseline at midnight on
July 18, 2026 America/New_York. Unread notification-ledger rows older than that
cutoff are marked read for all users, with matching Activity projections
acknowledged. The migration does not delete or mark read any canonical DM,
General Chat message, Pin, Checkers match, or Live room. Before application,
the reviewed scope was 10,784 notification rows across 25 users, dominated by
historical General Chat delivery events. This is a one-time baseline, not a
daily auto-clear policy.

The destination follow-up in
`20260717233421_notification_destination_badges.sql` makes every nonzero Pins
or Play badge traceable in the UI. Play shows unread counts on the owning
experience and then the exact Checkers match or Shado Live room. ShadowPin
shows unread counts on Discover, the owning category, and the exact Pin, with
post and discussion event IDs kept separate. Opening the exact match/room,
meaningfully viewing the Pin, or successfully loading its comments marks only
that represented destination read. `notification_events` UPDATE Realtime
refreshes the shared badge state across open tabs and devices.

## Product Contract

For one event on one device:

- a visible, foreground app may show one in-app alert
- a background or closed app may receive one system push
- the same device must not show both presentations for the same event
- opening the app later must not replay an expired foreground alert
- dismissing an alert does not silently mark its source read
- reading the source clears its event, navigation badge, launcher badge, and
  matching system notification
- every non-zero badge category must have a visible route to the unread source

Foreground presentation is intentionally short-lived. Durable unread state is
not. `presented_at`, `presentation_expires_at`, `read_at`, and `resolved_at`
represent different facts and must not be treated as aliases.

## Canonical Surfaces

`notification_events` is the recipient-owned notification ledger. It provides:

- a stable event id and dedupe key
- a normalized category
- an exact route to the source
- actor and source references
- foreground-presentation eligibility
- durable read and resolution state

The foreground coordinator is the only app-wide presenter for active
notification types. It atomically claims a recent event before presenting it,
queues one alert at a time, and enforces a wall-clock dismissal deadline.
Legacy feature hooks must not independently replay recipient events.

The service worker is the last race-condition guard. Before showing any push,
it checks for a visible same-origin app client. This applies to every
notification type, not only presence.

## Category And Destination Contract

| Category | Primary destination | Badge surface |
| --- | --- | --- |
| Direct messages | Exact DM conversation/message | DMs |
| General Chat | Exact message/thread | Chat |
| Mentions, replies, reactions, Hype | Exact source in Catch-Up | Catch-Up |
| Connections | Connections panel/profile | Catch-Up and DMs hub |
| ShadowPin | Exact pin/comment | Pins and Catch-Up |
| Shadow Checkers | Exact match | Play and Catch-Up |
| Presence | Active Users/profile | No durable launcher badge |

Counts shown by the installed-app icon and bottom navigation must come from the
same server-owned category breakdown. Display is capped at `99`; the underlying
read state is not discarded.

## Preferences

The settings UI keeps the existing feature controls but groups them by user
intent:

1. Device push health and permission
2. Messages and interactions
3. Social and presence
4. Live and Play
5. Launcher and navigation badges
6. Quiet hours, snooze, and mutes
7. Sound and comfort

Shadow Checkers turn alerts and the Play badge are independently configurable.
Foreground and push delivery use the same master, type, quiet-hours, snooze,
block, and conversation-mute policy.

## Shadow Checkers

Turn events are created from the server-authoritative match transition, not
from optimistic UI state. A turn is deduplicated by match, move count, and
recipient. Older turn events for the match are resolved when the turn advances
or the match ends. The notification route opens the exact match, and opening
that match clears the turn event.

The existing client delivery kick remains the immediate path. The bounded
asynchronous recovery worker is implemented in `send-push` and is invoked once
per minute by the production-only Netlify `notification-recovery` scheduled
function using the existing Functions-only Supabase service-role credential.
That credential was already required by the site's server-only Netlify media
functions and is never exposed through `VITE_*` or the browser bundle. The four
former database notification cron jobs and all native/TestFlight delivery stay
paused. The browser compatibility kick must not be treated as the source of
truth for turn ownership.

## Local Acceptance Evidence

- `npm run lint`
- `npx tsc --noEmit -p tsconfig.app.json`
- `npm run build`
- `npx jest --runInBand` - 233 suites, 1,267 passed, 16 todo
- `npm run test:node` - 43 passed
- `npm run docs:verify`
- `deno check supabase/functions/send-push/index.ts`
- `supabase db reset --local --yes`
- local and linked `supabase db lint --level error` - zero errors
- `npm run supabase:security-contract:local`
- `supabase db push --dry-run` - only
  `20260717193835_notification_reliability_rebuild.sql` is pending
- authenticated iPhone WebKit and Android Chromium phone-size checks:
  nonblank 720x788 weather shares, one foreground alert with hard auto-dismiss,
  findable unread notification in Catch-Up, and zero horizontal overflow on
  Settings, Weather, and Catch-Up

The browser pass blocks service workers intentionally, so it proves the
foreground path without accidentally exercising OS push. Installed-PWA
foreground/background arbitration, OS tray clearing, and Home Screen badges
remain physical-device gates.

## Rollout Order

1. Add the normalized event fields, read-through RPCs, preference fields,
   Checkers event producer, and complete badge state.
2. Deploy the compatible `send-push` and service-worker guards.
3. Ship the unified foreground coordinator, category navigation badges,
   notification inbox, and rebuilt settings surface.
4. Verify normal-device behavior on installed iPhone and Android PWAs.
5. Remove legacy presenters or compatibility delivery kicks only after
   production telemetry proves the replacement path.

## Acceptance Matrix

The candidate is not ready for production until all applicable checks pass:

- DM, General Chat, reaction, Hype, ShadowPin, connection, presence, Live, and
  Checkers events each present once
- foreground app receives only the in-app presentation
- background and closed app receive only push
- foreground/background transitions do not duplicate an event
- old unread events appear in their source or inbox but do not replay as alerts
- every in-app alert dismisses on its hard deadline without requiring app close
- exact-source reads clear notification rows, system notifications, navigation
  badges, and launcher badge counts
- Checkers advances create one turn event for the correct opponent
- multi-device subscriptions do not leak endpoint or recipient details
- quiet hours, snooze, master mute, type toggles, block rules, General Chat
  mute, and DM conversation mutes suppress both presentation paths consistently
- installed iPhone Home Screen and Android PWA routes, safe areas, touch
  targets, and permission states pass physical-device review

## Operational Boundary

No service-role credential, VAPID private key, provider token, or device
endpoint may be exposed to browser-visible variables or logs. Database changes
are additive during the compatibility window. Production deployment requires
an explicit approval packet with migration, Edge Function, service-worker,
frontend, test, and physical-device evidence.
