# Realtime Push Notifications Plan

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

Ship notifications in this order:

1. Direct messages
2. Mentions in group chat
3. Replies to your messages
4. Reactions to your messages
5. Group message summaries or optional group-chat alerts

Do not start with all group-message notifications. It will feel noisy immediately.

## Current State In This Repo

Relevant existing pieces:

- [src/hooks/useMessageNotifications.tsx](/C:/repos/chat2.0/src/hooks/useMessageNotifications.tsx:1) already shows foreground toast notifications for incoming DMs
- [src/components/notifications/MessageNotification.tsx](/C:/repos/chat2.0/src/components/notifications/MessageNotification.tsx:1) already renders a desktop-style toast UI
- [src/components/settings/SettingsView.tsx](/C:/repos/chat2.0/src/components/settings/SettingsView.tsx:1) exposes push notification setup and status
- [public/sw.js](/C:/repos/chat2.0/public/sw.js:1) handles Web Push display, notification click routing, and app badge updates
- [public/manifest.webmanifest](/C:/repos/chat2.0/public/manifest.webmanifest:1) defines the installed app identity
- [supabase/functions/send-push/index.ts](/C:/repos/chat2.0/supabase/functions/send-push/index.ts:1) delivers Web Push with VAPID
- [src/components/notifications/AppBadgeSync.tsx](/C:/repos/chat2.0/src/components/notifications/AppBadgeSync.tsx:1) mirrors unread DM count to the installed app icon when supported

Still open:

- richer retry/diagnostic reporting for failed push endpoints
- mention/reply/reaction notification event types
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

Add:

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
- `dm_enabled boolean not null default true`
- `mention_enabled boolean not null default true`
- `reply_enabled boolean not null default true`
- `reaction_enabled boolean not null default false`
- `group_enabled boolean not null default false`
- `quiet_hours_start time null`
- `quiet_hours_end time null`
- `mute_until timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

RLS:

- users can read/update their own row

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

## Event Types

Support these event types first:

- `dm_message`
- `mention`
- `reply`
- `reaction`

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

### Use Supabase Edge Functions

Create:

- `supabase/functions/send-web-push`

Responsibilities:

- validate internal caller identity or signed request source
- fetch matching subscriptions for the target user
- respect user notification preferences
- send Web Push with VAPID
- prune dead subscriptions on `410 Gone` or equivalent failures
- record delivery outcome in `notification_events`

### Trigger Source

There are two good options.

#### Option A: Database Trigger -> Edge Function

Pros:

- low latency
- close to the source of truth

Cons:

- trigger-to-http logic is more operationally sensitive

#### Option B: Edge Function Poller / queue processor

Pros:

- easier retries and dedupe
- safer operational model

Cons:

- slightly more moving parts

Recommended for this repo:

- write notification candidate rows into `notification_events`
- process them from an Edge Function runner path

That gives cleaner retries, dedupe, and future expandability.

## Client-Side Responsibilities

### New Hook: `usePushNotifications`

Add a client hook that handles:

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

Upgrade the current `Push Notifications` toggle in:

- [src/components/settings/SettingsView.tsx](/C:/repos/chat2.0/src/components/settings/SettingsView.tsx:1)

into a real settings surface with:

- master push toggle
- DM toggle
- mention toggle
- reply toggle
- reaction toggle
- optional quiet hours
- install guidance on iPhone if push is unsupported in the current mode

## Service Worker Responsibilities

Create a service worker that:

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
- the relevant conversation is already active on the same device and the app is visible
- the event is inside quiet hours and the type is not high-priority

### Dedupe

Use deterministic `dedupe_key` values like:

- `dm:<message_id>:<user_id>`
- `mention:<message_id>:<user_id>`
- `reply:<message_id>:<user_id>`
- `reaction:<message_id>:<emoji>:<user_id>`

### Expired subscriptions

When push delivery reports a dead subscription:

- disable or delete the subscription row

## Security

- never send push directly from the browser using private VAPID keys
- keep VAPID private key only in Supabase secrets
- validate all `user_id` writes for subscriptions via RLS
- do not trust raw client payloads for notification events

## Secrets

Add Supabase secrets for:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_CONTACT_EMAIL`

The public key is also exposed to the client as:

- `VITE_WEB_PUSH_PUBLIC_KEY`

## Milestones

### Milestone 1: PWA foundation

- add manifest
- add service worker
- add registration code
- add icon assets

### Milestone 2: Subscription plumbing

- add `push_subscriptions`
- add `notification_preferences`
- implement `usePushNotifications`
- wire settings toggle to real backend state

### Milestone 3: DM push MVP

- add `notification_events`
- create event creation path for incoming DMs
- create `send-web-push` Edge Function
- deliver DM notifications end to end

### Milestone 4: Mentions and replies

- detect mentions in group chat
- add reply notification generation
- add preference checks

### Milestone 5: Reactions and polish

- add reaction notifications
- add quiet hours
- add dedupe tuning
- add notification history UI if desired

## Testing Matrix

### Functional

- DM push while app is closed
- DM push while app is backgrounded
- no push when viewing active DM
- mention push from group chat
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
- offline delivery retry path

## Repo-Level Implementation Order

Suggested file areas:

1. Schema and function work
   - `supabase/migrations/...`
   - `supabase/functions/send-web-push/...`

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

## Recommendation

Build the first production-worthy version as:

- PWA + Web Push
- DM notifications first
- Supabase-managed event pipeline
- service worker click-through routing

This gives the app real cross-device notifications now, keeps the stack aligned with the current architecture, and leaves room for a later native-mobile push layer without throwing away the backend model.
