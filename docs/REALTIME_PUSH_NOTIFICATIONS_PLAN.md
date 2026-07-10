# Realtime Push Notifications Plan

## Documentation Status - July 10, 2026

This file now documents the implemented local notification architecture rather
than only the original plan. The current release candidate includes targeted
General Chat/DM delivery, ShadowPin events, master and type controls, daily
quiet hours, temporary snooze, General Chat mute, private DM conversation
mutes, personal-block suppression, service-worker routing, and recipient-owned
in-app ShadowPin events. Production and normal-device delivery proof remains
pending.

## Goal

Add user-facing realtime notifications that work across:

- iPhone
- Android
- Windows

for this existing ShadowChat web app.

The plan should support:

- foreground in-app realtime notifications
- background push notifications
- click-through into the correct conversation or message context
- notification preferences and opt-in controls

## Recommended Delivery Model

Use a two-layer notification system:

1. In-app realtime notifications
2. Web Push notifications for background delivery

This is the right fit for the current stack because:

- the app already uses Supabase realtime subscriptions
- the app is already deployed as a web app on Netlify
- the backend source of truth already lives in Supabase

## Platform Reality

### iPhone

Use Web Push for installed Home Screen web apps.

Important limitation:

- iPhone web push requires the web app to be installed to the Home Screen
- do not promise generic browser-tab push on iPhone
- Home Screen icon badges are best-effort and require notification permission; users can disable badge display in iOS notification settings

### Android

Use standard Web Push with service workers.

This is the strongest browser/PWA path.

### Windows

Use standard Web Push in supported browsers and PWAs.

This covers the Windows requirement without introducing a native Windows app.

## Product Scope

The active product supports independently controlled delivery for direct
messages, mentions, replies, reactions, every General Chat message, Hype, new
ShadowPin posts, ShadowPin comments, and ShadowPin replies. Every-message group
delivery remains off by default so targeted activity does not become noisy.

## Current State In This Repo

Relevant existing pieces:

- [src/hooks/useMessageNotifications.tsx](/C:/repos/chat2.0/src/hooks/useMessageNotifications.tsx:1) already shows foreground toast notifications for incoming DMs
- [src/components/notifications/MessageNotification.tsx](/C:/repos/chat2.0/src/components/notifications/MessageNotification.tsx:1) already renders a desktop-style toast UI
- [src/components/settings/SettingsView.tsx](/C:/repos/chat2.0/src/components/settings/SettingsView.tsx:1) exposes push notification setup and status
- [public/sw.js](/C:/repos/chat2.0/public/sw.js:1) handles Web Push display, notification click routing, and app badge updates
- [public/manifest.webmanifest](/C:/repos/chat2.0/public/manifest.webmanifest:1) defines the installed app identity
- [supabase/functions/send-push/index.ts](/C:/repos/chat2.0/supabase/functions/send-push/index.ts:1) delivers Web Push with VAPID
- [src/components/notifications/AppBadgeSync.tsx](/C:/repos/chat2.0/src/components/notifications/AppBadgeSync.tsx:1) mirrors unread DM count to the installed app icon when supported

Implemented locally in the current candidate:

- privacy-safe aggregate delivery results (`deliveredCount`,
  `removedSubscriptions`, `attemptedCount`, and `retryableFailures`)
- permanent invalid-subscription cleanup without returning endpoint, database
  id, recipient id, or per-subscription results to the caller
- retryable `503` responses for transient provider failures and failed-claim
  release so a later request can reacquire the idempotency key
- two bounded client retries for network, `409`, and `5xx` Function failures;
  permanent `4xx` responses are not retried

Still open:

- richer operator-only diagnostics that preserve subscription/recipient privacy
- group unread tracking if group chat badge counts become product scope
- production mobile QA on iOS Home Screen, Android install, and Windows PWA

## Architecture

### Foreground Notifications

Keep the current Supabase realtime approach for foreground sessions.

Rules:

- if the user is actively viewing the relevant conversation, suppress foreground toast
- if the user is in-app but not in the relevant conversation, show toast
- do not also send a background push if the user is clearly active in the app on the same device

### Background Notifications

Use Web Push.

Flow:

1. Browser registers a service worker
2. Browser requests notification permission
3. Browser creates a `PushSubscription`
4. Client stores the subscription in Supabase
5. The message sender path or bridge Edge Function dispatches a notification-worthy event
6. The `send-push` Edge Function sends Web Push using VAPID
7. Service worker receives push and shows a notification
8. Notification click opens the app and routes to the right screen
9. The app and service worker update the app icon badge from unread DM count when the Badging API is available

## PWA Requirements

Current required pieces:

- `manifest.webmanifest`
- service worker file
- service worker registration at app bootstrap
- app icons and badges

The app does not need offline-first behavior to launch push notifications, but it does need:

- secure origin
- service worker
- notification permission flow

## Data Model

### `push_subscriptions`

Purpose:

- store one subscription per user per browser/device instance

Columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `endpoint text not null`
- `p256dh text not null`
- `auth text not null`
- `platform text not null`
- `device_label text null`
- `user_agent text null`
- `last_seen_at timestamptz not null default now()`
- `enabled boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- unique on `endpoint`

RLS:

- users can read their own subscriptions
- users can insert their own subscriptions
- users can update/delete their own subscriptions

### `notification_preferences`

Purpose:

- persist user-level notification settings

Columns:

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `push_enabled boolean not null default false`
- `notifications_enabled boolean not null default true`
- `dm_enabled boolean not null default true`
- `mention_enabled boolean not null default true`
- `reply_enabled boolean not null default true`
- `reaction_enabled boolean not null default false`
- `group_enabled boolean not null default false`
- `hype_enabled boolean not null default true`
- `shadow_pin_new_post_enabled boolean not null default true`
- `shadow_pin_comment_enabled boolean not null default true`
- `shadow_pin_reply_enabled boolean not null default true`
- `general_chat_muted boolean not null default false`
- `quiet_hours_start time null`
- `quiet_hours_end time null`
- `quiet_hours_timezone text not null default 'UTC'`
- `mute_until timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

RLS:

- users can read/insert/update their own row

### `notification_conversation_mutes`

Purpose:

- store private per-user DM conversation push mutes
- preserve the conversation and message history while delivery is muted

Columns:

- `user_id uuid references public.users(id)`
- `conversation_id uuid references public.dm_conversations(id)`
- `muted_until timestamptz null`; null means muted until the user removes the row
- timestamps

RLS allows only the owning participant to read or mutate their mute row. The
current UI exposes an indefinite mute toggle in the DM header.

### `notification_events`

Purpose:

- audit log, dedupe, and retry support

Columns:

- `id uuid primary key`
- `user_id uuid not null`
- `type text not null`
- `entity_id uuid not null`
- `conversation_id uuid null`
- `message_id uuid null`
- `payload jsonb not null`
- `dedupe_key text not null`
- `sent_at timestamptz null`
- `read_at timestamptz null`
- `created_at timestamptz not null default now()`

Constraints:

- unique on `dedupe_key`

`notification_events` is in the Supabase Realtime publication as of
`20260710044500_publish_notification_events_realtime.sql`. RLS continues to
limit SELECT and live INSERT delivery to the event recipient.

## Event Types

Current event types include:

- `dm_message`
- `group_message`
- `mention`
- `reply`
- `reaction`
- `hype_event`
- `shadow_pin_post`
- `shadow_pin_comment`
- `shadow_pin_reply`

Payload should include enough data for rendering without another blocking fetch:

- title
- body
- icon
- avatar_url
- conversation_id
- message_id
- route
- sender display name
- type

Example payload:

```json
{
  "type": "dm_message",
  "title": "Smoke User Two",
  "body": "hey are you around?",
  "conversation_id": "uuid",
  "message_id": "uuid",
  "route": "/?view=dms&conversation=uuid",
  "icon": "https://...",
  "tag": "dm-conversation-uuid"
}
```

## Backend Strategy

### Supabase `send-push` Edge Function

Implementation:

- `supabase/functions/send-push/index.ts`
- `supabase/functions/_shared/notification-delivery.ts`

Responsibilities:

- validate the signed-in caller and load the referenced source entity instead
  of trusting recipient/title/body data from the browser
- fetch matching subscriptions for the target user
- enforce type preferences, master mute, temporary snooze, timezone-aware quiet
  hours, General Chat mute, DM conversation mute, self-suppression, and personal
  blocking
- send Web Push with VAPID
- prune permanently invalid subscriptions; keep transient provider failures for
  retry
- create/update deterministic `notification_events` delivery evidence
- return only aggregate delivery counts, never subscription endpoints/ids,
  recipient ids, or raw provider result arrays
- return `503` when any provider failure is retryable and release the Edge
  idempotency claim instead of recording a false completion

### Trigger Source

The active chat/DM/ShadowPin client sends a best-effort `send-push` request only
after the source mutation succeeds. The Function re-reads the message,
reaction, Hype event, pin, or comment and resolves eligible recipients on the
server. ShadowPin database triggers also create recipient-owned in-app events;
deterministic dedupe keys prevent duplicate event rows when background delivery
processes the same source entity. A new-post event is created only when a pin
first reaches its visible `processing_status = 'ready'` state, not when a raw
processing row is inserted.

## Client-Side Responsibilities

### `usePushNotifications`

The current client hook handles:

- feature detection
- permission state
- service worker registration
- push subscription lifecycle
- storing/updating subscription records
- syncing settings UI with backend preferences

Public API should look roughly like:

```ts
{
  supported: boolean
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
  loading: boolean
  enablePush: () => Promise<void>
  disablePush: () => Promise<void>
}
```

### App Bootstrap

At startup:

- register the service worker
- read the current push permission state
- do not prompt immediately on first load

### Settings UX

The current notification settings surface in:

- [src/components/settings/SettingsView.tsx](/C:/repos/chat2.0/src/components/settings/SettingsView.tsx:1)

includes:

- device-specific push subscription toggle and setup guidance
- master delivery toggle
- DM, mention, reply, reaction, every-message General Chat, Hype, and three
  ShadowPin type toggles
- General Chat mute
- timezone-aware daily quiet hours
- one-hour/eight-hour temporary snooze and immediate resume
- per-DM conversation mute in the thread header
- install guidance on iPhone if push is unsupported in the current mode

## Service Worker Responsibilities

The service worker:

- handles `push`
- handles `notificationclick`
- optionally handles badge updates later

### `push` event

- parse payload
- show notification
- set `tag` for dedupe/replacement behavior
- set `data` with route metadata

### `notificationclick` event

- close notification
- focus existing app tab if present
- otherwise open a new tab
- route to DM or message target using the payload route/data

## Delivery Rules

### Suppression

Do not send push when:

- the sender is the same as the recipient
- the recipient disabled that notification type
- the recipient disabled all notifications or has an active temporary snooze
- the event falls inside the configured daily quiet-hours window
- a General Chat event is covered by the General Chat mute
- a DM event is covered by that recipient's conversation mute
- either user has personally blocked the other

### Dedupe

Use deterministic `dedupe_key` values like:

- `dm:<message_id>:<user_id>`
- `mention:<message_id>:<user_id>`
- `reply:<message_id>:<user_id>`
- `reaction:<message_id>:<emoji>:<user_id>`
- `shadow_pin_post:<image_id>:<user_id>`
- `shadow_pin_comment:<comment_id>:<user_id>`
- `shadow_pin_reply:<comment_id>:<user_id>`

### Expired subscriptions

When push delivery reports a dead subscription:

- disable or delete the subscription row

### Retry

The client invocation helper retries only transport failures, `409`, and `5xx`
responses after 250 ms and 1,000 ms. The Function classifies provider `408`,
`429`, `5xx`, and network exceptions as retryable; invalid endpoints or
subscriptions and provider `400`, `401`, `403`, `404`, or `410` responses are
removed and are not retried.

## Security

- never send push directly from the browser using private VAPID keys
- keep VAPID private key only in Supabase secrets
- validate all `user_id` writes for subscriptions via RLS
- do not trust raw client payloads for notification events
- do not expose push endpoints, subscription ids, recipient ids, or raw
  provider responses in Function results

## Secrets

Add Supabase secrets for:

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

The public key is also exposed to the client as:

- `VITE_WEB_PUSH_PUBLIC_KEY`

## Milestones

### Milestone 1: PWA foundation - implemented

- add manifest
- add service worker
- add registration code
- add icon assets

### Milestone 2: Subscription plumbing - implemented

- add `push_subscriptions`
- add `notification_preferences`
- implement `usePushNotifications`
- wire settings toggle to real backend state

### Milestone 3: DM push MVP - implemented

- add `notification_events`
- create event creation path for incoming DMs
- deliver through the `send-push` Edge Function
- deliver DM notifications end to end

### Milestone 4: Mentions and replies - implemented locally

- detect mentions in group chat
- add reply notification generation
- add preference checks

### Milestone 5: Reactions and delivery controls - implemented locally

- add reaction notifications
- add quiet hours
- add dedupe tuning
- add notification history UI if desired

### Milestone 6: ShadowPin and conversation controls - implemented locally

- new-post, comment, and reply events
- recipient-owned Realtime in-app delivery
- global, General Chat, and per-DM-thread mutes
- reciprocal personal-block suppression
- normal-device and production proof still pending

### Milestone 7: Delivery privacy and bounded retry - implemented locally

- privacy-safe aggregate delivery responses
- permanent invalid-subscription pruning
- transient provider `503` status and idempotency-claim release
- bounded client retry for transport, conflict, and server failures
- focused retry/privacy contract tests

## Testing Matrix

### Functional

- DM push while app is closed
- DM push while app is backgrounded
- no push when viewing active DM
- mention push from group chat
- reply and General Chat/DM reaction push
- new ShadowPin post, pin comment, and pin reply in-app event plus push
- master mute, General Chat mute, DM conversation mute, quiet hours, and snooze
- reciprocal block suppresses every matching event
- push click routes correctly
- disable push and verify no delivery

### Device Coverage

- iPhone Home Screen installed web app
- Android Chrome
- Windows Chrome
- Windows Edge

### Failure Cases

- revoked permission
- expired subscription
- duplicate subscription rows
- multiple devices for same user
- offline/transient provider retry path without duplicate event rows
- permanent `4xx` failure does not loop
- Function response contains no endpoint, subscription, or recipient identifiers

## Repo-Level Source Map

1. Schema and function work
   - `supabase/migrations/...`
   - `supabase/functions/send-push/...`
   - `supabase/functions/_shared/notification-delivery.ts`

2. Client platform plumbing
   - `src/lib/push.ts`
   - `src/hooks/usePushNotifications.ts`
   - `src/main.tsx` or app bootstrap registration
   - `public/manifest.webmanifest`
   - `public/sw.js` or equivalent worker entry

3. Settings integration
   - `src/components/settings/SettingsView.tsx`

4. Event generation and suppression logic
   - DM/message hooks
   - auth/user presence helpers

## Remaining Recommendation

Keep Web Push and recipient-owned Supabase events as the web/PWA contract. Run
the full preference/block/mute matrix on a preview or staging backend, then
verify one installed iPhone Home Screen app, one Android PWA, and one desktop
browser after production deployment. A later native APNs/FCM layer should reuse
the server-side event eligibility and preference contract rather than creating
an independent notification policy.
