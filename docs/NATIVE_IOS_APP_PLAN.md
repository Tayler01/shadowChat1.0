# Native iOS App Plan

This plan tracks the iOS-first native ShadowChat client while the current web/PWA
app remains the production client.

## Hard Requirements

- Native messaging must interoperate with the production web app.
- Existing web app accounts must sign in to the native app.
- The native app must use the same Supabase project, Auth users, `public.users`
  profile rows, `messages` table, and realtime behavior for the first General
  Chat milestone.
- The first native milestone should avoid schema changes unless a blocking
  compatibility issue is found.
- The web app remains the production source of truth until native parity is
  proven on real devices.

## Repo Shape

Start the native app in this repo:

```text
apps/
  mobile/
```

Keep `apps/mobile` as an independent Expo package at first, with its own
`package.json` and lockfile. Do not convert the root package into a monorepo or
workspace until there is a concrete shared-code reason. This keeps the current
web app build, lockfile, and deploy path stable.

## Build Strategy

Use a fresh Expo app shell and port behavior selectively from the web app.

Reuse or mirror:

- Supabase Auth sign-in flow
- `public.users` profile loading
- General Chat message fetch/send/realtime contract
- `client_message_id` idempotency concept
- message sorting/deduping rules
- shared formatting helpers where they do not depend on DOM APIs

Rewrite natively:

- screens and navigation
- chat list and composer UI
- safe-area and keyboard behavior
- native storage/session persistence
- media picker, voice recording, push notifications, and deep linking

## First Milestone

Goal: prove one shared chat universe.

Scope:

- Scaffold `apps/mobile` with Expo Router and TypeScript.
- Configure Supabase using the same public URL and anon key as the web app.
- Persist native sessions in native-safe storage.
- Implement sign in with existing Supabase email/password credentials.
- Fetch the signed-in user's `public.users` profile row.
- Fetch the latest General Chat messages from `public.messages`.
- Send text messages into `public.messages`.
- Subscribe to realtime inserts for `public.messages`.

Acceptance:

- A web user can sign in to the native iOS app with the same account.
- A native-sent message appears in web General Chat.
- A web-sent message appears live in the native app.
- Message identity resolves through the same `public.users` profile data.
- No MVP schema migration is required.

## Deferred Milestones

- DMs: inbox, thread, send, unread counts, realtime lifecycle.
- Push: native APNs/Expo Notifications/FCM path that coexists with web push.
- Media: images, files, video, GIFs, and voice messages using native pickers and
  recording APIs.
- Profile and settings.
- Boards, News, games, and richer app surfaces.
- App Store/TestFlight build setup with EAS.

## Setup Notes

- Local `node`, `npm`, and `npx` resolve through FNM.
- Expo CLI does not need a global install for development; use project-local
  `npx expo`.
- EAS CLI is only needed when preparing cloud builds, submissions, or TestFlight.
