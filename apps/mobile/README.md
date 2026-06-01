# ShadowChat Mobile

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This feature guide is current for the shipped product surface, with any known hardening or polish follow-ups tracked in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Expo iOS-first native client for ShadowChat. The current web/PWA app remains the
production client while this app proves native parity.

## First Milestone

- Sign in with the same Supabase Auth account used by the web app.
- Load the same `public.users` profile row.
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

## Run

```powershell
npm run start
```

Open the project in Expo Go first. Use a custom development build only after a
native-only capability requires it.
