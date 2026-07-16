# Shado Live

## Status - Real Allowlisted Beta

Shado Live is now implemented as a real, audio-first LiveKit experience on
`codex/shadowchat-2.0`. It remains excluded from the default build and from
production `main`. The real client is compiled only when
`VITE_FEATURE_SHADO_LIVE_REAL=true`; the preserved frontend-only prototype uses
the separate `VITE_FEATURE_SHADO_LIVE_PROTOTYPE` flag and must remain false in
the real beta build.

The isolated beta uses the shared Supabase project through additive schema and
Edge Functions, while access is server-gated to selected testers. A hidden
production route or a forged feature flag does not grant access. The isolated
frontend also restores deterministic Catch-Up with
`VITE_FEATURE_CATCH_UP=true`.

The accepted July 14 retro picker banner remains the real beta picker asset:
`public/entertainment/shado-live/picker-banner.webp`. Its source dimensions,
accessibility description, and generation prompt are recorded in
`src/features/entertainment/shado-live/assets/manifest.ts`.
The banner is intentionally limited to the Entertainment picker. The Live
lobby uses the same compact, tokenized page chrome as the rest of ShadowChat
instead of repeating a large decorative hero inside the feature.

Production `main` and the production Netlify frontend remain unchanged until
installed-phone acceptance and explicit merge approval.

## V1 Product Contract

The beta is an intimate, phone-first audio room:

- one host and up to three approved speakers;
- listen-only entry by default, with hand raising and host promotion;
- server-authoritative room, role, audience, block, restriction, and operator
  decisions;
- recording disabled;
- room chat with canonical server persistence;
- exact reconnecting, removed, ineligible, and room-ended states; and
- live-room, participant, and message reporting with server-captured evidence.

Room hosts, speakers, listeners, and message authors use their normal
ShadowChat avatars. Those identity controls open the same canonical public
profile card used elsewhere in the app; Shado Live does not create a parallel
profile presentation.

Video, recording, large public broadcasts, Inner Circle publishing, ticketing,
replays, revenue, and creator analytics are outside this beta. Inner Circles do
not become a Shado Live audience.

## Authoritative Lifecycle

```text
scheduled -> green_room -> live -> ending -> ended
    |             |
    +-----------> cancelled
```

- `green_room` is visible only to its host. It is not advertised as a live
  room to other members.
- `live` is discoverable only to eligible allowlisted members. Listeners receive
  short-lived, room-scoped media tokens.
- `ending` rejects new joins while provider and audit state are finalized.
- `ended` and `cancelled` are terminal. A stale token or reconnect cannot
  restore access.

Supabase remains the authority. LiveKit presence and webhooks reconcile media
state but never grant a role, access, or room transition.

## Backend And Provider Boundary

The canonical domain is isolated from General Chat, DMs, ShadowPin, Shado TV,
News, Boards, and Activity. The primary data is held in dedicated Shado Live
tables for system state, access membership, rooms, participants, stage
requests, messages, events, signals, provider operations, webhook receipts,
restrictions, safety evidence, and notifications.

Direct browser mutation is revoked. Reviewed private `SECURITY DEFINER`
functions in `shado_live_private` are reached through narrow public invoker
RPCs. `live_room_signals` and recipient-owned notification rows are the only
RLS-filtered browser Realtime surfaces required for invalidation.

LiveKit is the audio transport. Server-only credentials are named:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Never expose those values through `VITE_*` variables. The real client receives
only a short-lived participant token and the WebSocket URL returned by the
authorized session function.

The deployed Edge Function contract is:

- `shado-live-session`: create, join, resume, leave, and issue role-scoped media
  credentials;
- `shado-live-command`: start/end, hand state, messages, promote/demote, mute,
  and remove;
- `shado-live-provider-webhook`: validate the raw signed LiveKit callback before
  parsing and ingest it idempotently; and
- `shado-live-reconcile`: claim bounded provider work and repair delayed or
  missing provider state.

The client runs reconciliation immediately and every 20 seconds only while the
document is visible and online, with no overlapping request.

## Access And Compatibility

`shado_live_system_state.access_mode` supports `disabled`, `allowlist`, and
future global `enabled`. The isolated beta is `allowlist`; tester membership is
private and operator-managed. Production clients do not expose the real route,
and older clients remain compatible with the additive schema.

Selected beta accounts are seeded by
`20260716030000_shado_live_beta_access.sql`. The migration inserts only IDs that
already exist in `public.users`, so local resets and incomplete environments do
not create placeholder identities.

Personal blocking suppresses discovery, notifications, chat, stage, audience,
and media eligibility in both directions. Block teardown does not reveal who
blocked whom and does not restore prior live access after unblock.

## Safety And Operator Contract

Member-facing reporting is enabled only inside the real Shado Live runtime;
the broader paused report entry points stay hidden. A live report may target a
room, participant, or message. The server captures the authoritative snapshot;
the reporting client cannot upload or replace evidence.

The operator Shado Live queue supports:

- claim and review of live-only cases;
- end room;
- remove or mute participant;
- set scoped `host`, `join`, and/or `chat` restrictions with duration and
  public reason;
- revoke a restriction; and
- no-action closeout.

Every operator action is expected-version guarded and permanently audited.
The existing operator Safety Case Center remains available for prior cases.

## Notification Contract

The beta uses a dedicated recipient-owned `shado_live_notifications` surface.
Room starts/ends and participant role or safety changes are deduped, block
filtered, preference controlled, and routed to:

`?view=games&experience=shado-live&item=<room-id>`

Foreground notifications use a five-second in-app treatment, canonical unread
fetch, recipient-filtered Realtime invalidation, duplicate suppression, and an
explicit mark-read RPC. The setting is on by default and may be disabled in
Settings.

Shado Live OS push is intentionally not part of this beta. It must not be
described as delivered until a separate quiet-hours, background/foreground,
badge, dedupe, block, and old-client compatibility pass extends `send-push`.

## Failure, Privacy, And Media Rules

- Camera and display capture remain denied by Permissions Policy. Only
  microphone is permitted for host/speaker media.
- Listeners do not request microphone permission.
- Recording is off and no egress is configured.
- Tokens are short-lived, room scoped, identity scoped, and role scoped.
- Session and command paths use authenticated user verification, rate limits,
  idempotency claims, expected revisions, and fail-closed provider handling.
- Webhook signatures cover the exact raw body and are verified before JSON
  normalization.
- Provider operations and webhook events are replay safe.
- A provider outage never widens access or claims a state change succeeded.
- Terminal room or eligibility state tears down media locally.

## Mobile And Accessibility Contract

- Phone layout, safe areas, installed-PWA behavior, and keyboard compression
  are primary; desktop remains functional.
- Listener, host, stage, mute, reconnect, and terminal state are not conveyed
  by color alone.
- Tabs and dialogs retain keyboard navigation and deliberate focus restore.
- The existing Comfort provider remains authoritative for motion, sound,
  haptics, and autoplay comfort.
- Media starts only after explicit room entry and authorization.
- Audible room playback always requires the visible `Start listening` tap.
  Remote audio elements are mounted before LiveKit consumes that user gesture,
  and the renderer container is rebound across session creation and reconnect
  timing so iPhone and Android do not depend on detached autoplay.
- The real client lazy-loads `livekit-client`; the default build contains no
  LiveKit runtime chunk.
- Camera APIs, display capture, recording, and egress are absent from the real
  beta browser contract.

## Verification

Local backend gates cover a clean Supabase reset, transactional two-user
verification with rollback, database lint, security-definer allowlisting,
access-mode isolation, roles, messages, stage requests, blocks, restrictions,
notifications, provider outbox, and webhook receipts.

Frontend and Edge tests cover API normalization, safe public avatar/profile
projection, LiveKit media state, remote-track attachment before audio unlock,
host and listener controls, reconciliation cadence, reporting, operator
actions, notification routing/dedupe, and signed provider boundaries. The
production build verifier runs deterministic Pixel Chromium and iPhone WebKit
host and listener flows with mounted remote audio, clickable profiles, exact
phone geometry, 16px mobile composers, keyboard and safe-area checks, no
camera/recording requests, and zero residue.

Commands:

```powershell
npm run qa:shado-live:real
npm run supabase:functions:verify
supabase db push --dry-run --linked
```

## Deployment Checklist

1. Run lint, app TypeScript, build, targeted/full Jest, Deno checks, local
   Supabase reset/verifier/lint, linked dry run, and phone browser QA.
2. Apply the three additive Shado Live migrations in timestamp order.
3. Set the three `LIVEKIT_*` secrets only in Supabase Edge Function secrets.
4. Deploy the four active Shado Live Edge Functions with their checked-in JWT
   verification contract.
5. In LiveKit Cloud, open **Settings -> Webhooks**, create the Supabase provider
   webhook URL, choose the same signing API key, and send a test event.
6. Verify provider room create/join/start/chat/end/cleanup with controlled beta
   accounts and confirm no provider room or test data remains.
7. Build the isolated frontend with real Live enabled, prototype disabled, and
   Catch-Up enabled; deploy only to `shadowchat-2-0-wave-one`.
8. Repeat authenticated Pixel Chromium/iPhone WebKit smoke against the exact
   deploy and then perform installed iPhone/Android beta acceptance.

## Remaining Before Production

1. Complete installed iPhone and Android PWA testing for microphone permission,
   audio routing, speaker/listener handoff, Bluetooth/headphones, keyboard,
   safe areas, background/resume, lock/unlock, weak network, and accessibility.
2. Collect multi-tester feedback and repair reproducible beta issues.
3. Add OS push only through its separate notification reliability gate.
4. Measure physical-device battery, thermal, memory, and network behavior.
5. Merge and deploy to production only after explicit approval. Catch-Up stays
   deterministic and source linked; the private AI trial remains separate.

## Preserved Prototype

The July 14 frontend-only prototype and its verifier remain in the repo for
design history and offline interaction QA. It must continue to make no media,
database, notification, or reporting claim. Do not enable the prototype and
real flags together in a release build.
