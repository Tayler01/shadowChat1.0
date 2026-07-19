# ShadowChat Mobile

## Documentation Status - July 19, 2026

The native workspace is the signed iPhone/Android notification companion for
the production ShadoChat web client. It is aligned to Expo `~57.0.4`, React
Native `0.86.0`, React `19.2.3`, and TypeScript `~6.0.3`.

Expo iOS-first native client for ShadoChat. The complete product UI continues
to come from `https://shadochat.online` inside a strict same-origin WebView, so
the signed app and installed PWA do not drift into separate feature shells.
Native code owns push permissions, secure session persistence, token
registration, foreground arbitration, rich presentation, actions, badges,
custom sounds, and exact notification routing.

## Native Client Contract

- Present the complete production ShadoChat app rather than a native imitation.
- Allow only the canonical `https://shadochat.online` origin in the app
  container; external links open in the operating system.
- Synchronize the signed-in web session into native secure storage without
  exposing service-role credentials or provider secrets.
- Register one native notification installation per signed-in account/device.
- Keep PWA and native foreground leases separate so only one presentation
  surface wins.
- Route notification taps and actions to their exact production destination.
- Revoke the native installation and clear native notification state on
  sign-out or device opt-out.

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

Rich notification capabilities require a development or signed native build;
Expo Go is not an acceptance surface for APNs/FCM, the iOS notification service
extension, Notifee presentation, communication intents, custom sounds, or
production routing.

## Verification

```powershell
npm ci
npm audit --audit-level=low
npm run lint
npx tsc --noEmit
npm run doctor
npx expo export --platform ios --output-dir output/expo57-ios
```

Remove generated export output after inspection. These checks establish
toolchain and bundle health; App Store/TestFlight processing and physical-device
APNs/FCM delivery remain separate release gates.
