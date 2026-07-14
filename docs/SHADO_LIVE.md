# Shado Live

## Status - Flagship Prototype

Shado Live is a specification and frontend-only interaction prototype on
`codex/shadowchat-2.0`. It is not a live-media product. The prototype is
compiled behind `VITE_FEATURE_SHADO_LIVE_PROTOTYPE=true`, lazy-loaded from
Entertainment, and routed at `?view=games&experience=shado-live` only in the
isolated 2.0 test build.

The default build keeps the flag false. It contains no Shado Live card or
route, starts no camera or microphone permission request, opens no provider
connection, creates no Supabase row, sends no notification, subscribes to no
Activity feed, and exposes no pretend report action. Production `main` and the
production Netlify frontend remain unchanged.

Accepted isolated trial deploy: `6a55a76aa3ae37c5d2d35a6e` at
`https://shadowchat-2-0-wave-one.netlify.app`.

The July 14 polish candidate adds a crop-safe `1920x720` retro picker banner,
aligns the lobby and stage with the Entertainment picker and ShadowChat's
obsidian/gold visual system, removes mobile stage/panel overlap, and keeps the
chat composer directly above the iOS keyboard inset. The banner source,
dimensions, accessibility description, and generation prompt are recorded in
`src/features/entertainment/shado-live/assets/manifest.ts`; the optimized
runtime asset is `public/entertainment/shado-live/picker-banner.webp`.

## Product Promise

Shado Live should make a small live gathering feel understandable and intimate
on a phone. The first real milestone is an audio-first Connections room with:

- one host and up to three approved speakers;
- listen-only entry, hand raising, and explicit host promotion;
- stage, room, chat, and safety surfaces that never cover each other;
- recording off by default;
- exact room-ended, reconnecting, and host-disconnect behavior; and
- server-authoritative roles, audience eligibility, blocks, and operator
  actions.

Video, recording, large public broadcasts, Inner Circle publishing, ticketing,
replays, co-host revenue, and creator analytics are separate later milestones.
Inner Circles do not become a publishing audience through this prototype.

## Prototype Contract

The current prototype exercises only local UI state:

1. premium lobby and room discovery;
2. listener entry without media permission;
3. stage, speaker stack, audience count, room details, and safety tabs;
4. local microphone/camera-state previews that never call `getUserMedia`;
5. hand raise, reactions, and unsent local chat;
6. keyboard-operable roving tabs and deliberate enter/leave focus restoration;
7. reconnecting and room-ended failure treatments; and
8. visible release-lock copy for Activity, member reporting, and operator
   readiness.

All visible latency, audience, recording, and format values are product targets
or design examples, not live telemetry. The prototype must always say that
nothing is broadcast, saved, reported, or sent.

## Future Room Lifecycle

The authoritative server state machine is:

```text
scheduled -> green_room -> live -> ending -> ended
    |             |
    +-----------> cancelled
```

- `scheduled`: discoverable only to the intended audience; no provider token.
- `green_room`: host and invited speakers can prepare; listeners cannot join
  media.
- `live`: eligible listeners may receive short-lived, room-scoped tokens.
- `ending`: new joins fail closed while media and audit state are finalized.
- `ended` or `cancelled`: terminal; no token can restore the room.

Provider presence and Supabase Realtime may improve responsiveness, but neither
authorizes a host, speaker, listener, moderator, or room transition.

## Future Backend Boundary

The real system is a new domain. It must not reuse Shado TV, General Chat, DM,
News, Boards, or ShadowPin tables as its authority.

Proposed canonical data:

- `live_rooms`
- `live_room_participants`
- `live_room_stage_requests`
- `live_room_invites`
- append-only `live_room_events`

Direct browser writes remain revoked. Narrow public invoker RPCs should call
reviewed private implementation functions, following the Connections and Inner
Circles architecture. A provider-neutral media adapter issues short-lived,
room- and role-scoped participant tokens from server-only boundaries:

- `shado-live-session`: authorize create/join and issue a provider token;
- `shado-live-command`: start, end, promote, mute, remove, or close; and
- `shado-live-provider-webhook`: verify signed provider lifecycle callbacks.

Bunny Stream is an upload/on-demand playback system in this repo and must not
be treated as the live RTC transport. Provider selection needs a separate
current capability, region, privacy, reliability, and cost spike before adding
an SDK, dependency, domain, or secret.

## Safety And Privacy Gates

A real build remains blocked until all of the following are accepted:

- Activity supports exact live invite, start, change, end, and safety routes.
- Member reporting supports live-room and participant evidence without
  exposing reporter identity or unrelated media.
- Operators can end a room, remove a participant, restrict hosting, and audit
  every action.
- Live-specific bans and emergency shutdown behavior exist.
- Reciprocal personal blocking removes invitations, discovery, audience,
  stage, chat, presence, and media subscription visibility without disclosing
  block direction.
- Recording has explicit room and participant consent, retention, access,
  deletion, and evidence policies.
- Provider secrets, signing material, and service-role access remain server
  only.
- Join-token expiry, rate limits, concurrent-room caps, host-disconnect grace,
  webhook replay defense, and provider-outage behavior fail closed.
- Camera/microphone Permissions Policy and provider CSP changes are reviewed
  only for the real implementation. The prototype needs neither.

## Notification And Failure Contract

Live events cannot be added opportunistically to `notification_events`,
`activity_events`, or `send-push`. Each new type needs a dedupe key, preference,
quiet-hours behavior, exact typed route, block suppression, retry policy, and
old-client compatibility proof.

Required failure states include:

- permission denied or device unavailable;
- token expired before join;
- room full or no longer eligible;
- host disconnect grace and authoritative end;
- transient media reconnect with frozen controls;
- metadata Realtime reconnect without role escalation;
- provider outage and webhook delay;
- app background/resume and duplicate join; and
- recording or safety subsystem failure.

No state may silently fall back to a broader audience, keep publishing after a
room ends, or claim an operator action succeeded without authoritative proof.

## Accessibility And Performance

- Phone layout and safe areas are primary; desktop remains functional.
- Controls retain at least the shared phone touch baseline.
- Stage state, speaker state, mute state, and failure state are not conveyed by
  color alone.
- Tabs support Arrow keys, Home, End, and roving focus.
- Enter/leave and nested state changes restore focus deliberately.
- The Comfort provider remains authoritative for motion, autoplay, sound, and
  haptics.
- No media autoplays before explicit entry and authorization.
- A production room needs measured thermal, battery, memory, network, and
  background/resume budgets on physical iPhone and Android devices.

## Prototype Acceptance Gate

- default build has no available route/card and does not execute prototype
  code;
- flagged test build exposes the lazy Entertainment route;
- unit tests cover local stage, chat, tabs, focus, failure state, and prove no
  media API call;
- Pixel Chromium and iPhone WebKit cover routing, safe areas, phone geometry,
  keyboard compression, 130% text, and zero permission prompts;
- diagnostics show no unexpected network, Supabase, console, or page errors;
- the isolated test deploy creates no rows, uploads, notifications, or other
  residue; and
- production `main` and production Netlify remain untouched.

The automated Shado Live browser proof is
`scripts/verify-shado-live-prototype-browser.mjs`. Its July 14 matrix covers a
320x568 Chromium viewport at 130% text, Pixel Chromium, iPhone WebKit, and
desktop Chromium. It checks the real picker asset, lobby CTA, route/focus
restoration, stage/panel separation, local chat, tabs, dialog keyboard
behavior, controls, iOS keyboard compression, diagnostics, permission calls,
and zero backend or provider residue.

## Remaining Work

The prototype cleanup is ready for deeper testing, but these items remain
deliberately open:

1. Complete RD-030 on an installed iPhone PWA and installed Android PWA,
   including native keyboard animation, safe areas, touch comfort,
   VoiceOver/TalkBack, background/resume, and lock/unlock.
2. Collect structured feedback from Tayler and additional phone testers on the
   picker, lobby clarity, stage density, panel switching, reactions, and
   failure-state comprehension; fix reproducible issues on the isolated branch.
3. Keep the full live system gated until member reporting and Activity safety
   routes resume, the operator controls are proven, and a current media-provider
   capability/privacy/cost spike is approved.
4. If the full system is approved, implement the server-authoritative room
   lifecycle, role-scoped token service, provider adapter/webhooks, block and
   ban enforcement, notifications, failure recovery, and physical-device
   performance budgets described above.
5. Keep the private AI Catch-Up experiment separate. Deterministic Catch-Up is
   the accepted baseline; no AI trial starts until its accuracy, privacy,
   attribution, cost, and failure gates are defined.
6. Merge to production `main` and deploy the production Netlify frontend only
   after separate installed-phone acceptance and explicit approval.

The full Shado Live build can begin only after Tayler explicitly resumes the
required Activity and member-reporting dependencies and the safety gate above
is demonstrably complete.
