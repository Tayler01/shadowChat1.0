# ShadowChat Mobile

## Documentation Status - July 10, 2026

The native workspace is a local development candidate, not a shipped client.
It is aligned to Expo `~57.0.4`, React Native `0.86.0`, React `19.2.3`, and
TypeScript `~6.0.3`. The web/PWA remains the production client.

Expo iOS-first native client for ShadowChat. The current web/PWA app remains the
production client while this app proves native parity.

## First Milestone

- Sign in with the same Supabase Auth account used by the web app.
- Load the same API-safe `public.users` presentation profile.
- Read and send General Chat messages through the same `public.messages` table.
- Receive web-sent General Chat messages through Supabase Realtime.

## Setup

Create `apps/mobile/.env` from `.env.example`:

```powershell
Copy-Item .env.example .env
```

Then set:

```text
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Use the same public Supabase URL and anon key as the web app. Do not add
service-role keys or provider secrets to this app.

## Private Identity Contract

Authentication email belongs to the Supabase Auth session. Public profile and
message models should contain presentation fields such as `username`,
`display_name`, avatar data, color, and badges; they must not depend on
`public.users.email` or the legacy `public.users.full_name` column.

The database private-identity rollout is staged. Release A keeps those nullable
compatibility columns for one production interval while consumers move away from
them. Release B may drop them only after the web, Edge, scripts, and this native
package are verified independent of both columns. The July 10 native milestone
has completed that selector/type cutover locally: profile and General Chat
selectors and `ShadowUser` no longer request either compatibility field.
Release B still requires Release A production proof and a fresh Expo gate.

## Run

```powershell
npm run start
```

Open the project in Expo Go first. Use a custom development build only after a
native-only capability requires it.

## Verification

```powershell
npm ci
npm audit --audit-level=low
npm run lint
npx tsc --noEmit
npm run doctor
npx expo export --platform web --output-dir output/expo57-web
```

The July 10 Expo 57 upgrade passed these checks locally, including Expo Doctor
`20/20` and a static web export. Remove generated export output after inspection.
These checks establish toolchain health; they are not App Store/TestFlight,
native-device, installed-PWA, or production-deployment proof.
