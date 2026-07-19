# Notification Presentation v2

## Status - July 18, 2026

This document is the implementation and rollout contract for the next
notification presentation layer. It extends the July 17 notification
reliability rebuild; it does not replace its canonical unread, read, badge, or
delivery semantics.

The implementation is intentionally additive and remains locally gated until
Tayler explicitly approves a production rollout. PWA background custom sounds,
native remote push, and native rich media each have platform-specific
limitations and must not be described as accepted until the matching physical
device proof exists.

## Product Outcome

Every ShadowChat notification should feel intentionally designed for its
source while still belonging to one obsidian-and-gold product language:

- member-originated events show the current member PFP and open the member
  profile from the identity control
- ShadowPin events can include a media thumbnail while keeping the actor PFP
- messages, mentions, social activity, Live, and games use distinct but
  restrained presentation and sound semantics
- actions and routes are typed, allowlisted, and source-specific
- repeated activity can group visually without merging or losing canonical
  unread events
- full, sender-only, and private preview modes are enforced before remote
  provider delivery
- one visible app presents one in-app banner; a background or closed app
  receives one system notification
- notification dismissal never silently marks source content read
- exact source reads remain the only authority for clearing durable unread
  state, navigation badges, launcher badges, and matching tray entries

## Canonical Data Boundary

`public.notification_events` remains the only durable recipient-owned
notification ledger and badge authority.

Presentation v2 must not add a second `read_at`, `resolved_at`, or unread
counter. The v2 envelope is a one-to-one presentation projection of a
canonical event. Device presentation receipts record only delivery and
interaction facts for one installation.

Existing producers continue to create `notification_events`. A reviewed
server-side mapper materializes v2 presentation data from trusted event types,
routes, actor references, and bounded payload fields.

## Notification Envelope v2

The presentation contract carries:

- schema version and canonical event id
- stable category and type
- current actor identity reference
- bounded public and privacy-safe title/body variants
- same-origin route and source entity id
- optional public thumbnail reference
- logical action keys
- logical sound id and Android channel family
- grouping/collapse key
- priority, creation time, and expiry

The envelope never contains:

- service-role or provider credentials
- browser subscription endpoints
- native push tokens
- arbitrary remote action URLs or RPC names
- private signed media URLs
- payment, contact, authentication, or secret fields

## Category Matrix

| Category | Examples | Default sound | Primary action | Group key |
| --- | --- | --- | --- | --- |
| Direct messages | New DM | Shadow Whisper | Open DM | conversation |
| General Chat | New post | Low Glass | Open Chat | thread/general |
| Mentions and replies | Mention, reply | Gold Signal | View Message | thread/message |
| Reactions and Hype | Reaction, Hype | Hype Burst | View Message | source message |
| ShadowPin | Post, comment, reply | Pin Shutter | View Pin | pin/source |
| Connections | Request, accepted | Connection Chime | Review Connection | actor |
| Presence | Member active | Presence Pulse | View Active Users | actor |
| Shado Live | Start, stage change, end | Live Beacon | Join Live | room |
| Shadow Checkers | Turn ready | Checkers Move | Play Turn | match |
| Shadow War | Turn/update | War Drum | Open Battle | session |
| Weather | Severe alert, saved-location alert | Weather Glass | View Weather | location/alert |
| Security/system | Account/device warning | Security Signal | Review | event |

Only event types with an authoritative server producer may send remote push.
Unimplemented event families remain feature-gated even though their
presentation templates and preferences exist.

## Original Obsidian Sound Pack

The versioned logical sound catalog is:

- `shadow_whisper`
- `low_glass`
- `gold_signal`
- `hype_burst`
- `pin_shutter`
- `connection_chime`
- `presence_pulse`
- `live_beacon`
- `checkers_move`
- `war_drum`
- `weather_glass`
- `security_signal`
- `system_default`
- `silent`

Foreground PWA sounds use the shared Sound Effects and Comfort policy. They
play only after a presentation is successfully claimed, do not play when the
source is already open, and are rate-limited so grouped events produce one
cue.

Background PWA push cannot reliably use a custom audio asset. The browser and
phone own that sound. Settings must say this plainly.

Native iOS sounds are bundled and selected per notification. Android sounds
belong to immutable versioned channels. Changing a sound requires a new
channel id and a new native binary; it must never silently repurpose a user's
existing channel.

## Foreground Presentation

Phone layout:

- one complete 48px-control banner plus a compact queued count
- safe-area-aware top placement and 12-16px gutters
- 44px PFP with a category marker
- two-line bounded body
- optional 56px media thumbnail
- contextual action label
- visible remaining-time rail
- 6.5-second normal duration

Interaction:

- source tap marks the represented event read and opens the exact source
- PFP tap opens the member profile without marking the source read
- dismiss or upward swipe removes only the transient presentation
- the timer pauses during hover, focus, pointer hold, or hidden-document time
- grouped presentation retains every represented event id

Full Comfort motion uses a restrained 180-220ms entrance and settlement.
Reduced motion uses a brief opacity transition. No-motion changes state
immediately. The dramatic sand effect remains exclusive to deliberate
Catch-Up read dismissal.

## Catch-Up

Catch-Up remains the durable notification inbox. Presentation v2 reuses the
same actor identity, category semantics, media reference, route, and contextual
action label while preserving exact-event read persistence.

Visual grouping must never merge canonical events. A grouped card owns an
array of event ids and acknowledges only the explicitly selected card or
explicit group action.

## Privacy

Preview modes:

- `full`: actor, body, PFP, and eligible public media
- `sender_only`: actor identity with generic body and no media
- `private`: generic ShadowChat copy with no actor PFP or media

Remote push privacy is resolved in the trusted backend before provider
transmission. Hiding private content only in the service worker or UI is not
sufficient.

Phone lock-screen settings, Focus, Do Not Disturb, silent mode, and Android
channel settings remain authoritative.

## Actions

Initial safe actions:

- `open`
- `mark_read`

Contextual labels can be Open DM, View Pin, Join Live, Play Turn, or Review
Connection while still mapping to `open`.

Inline reply, accept-connection, mute-user, and other remote mutations remain
deferred until an authenticated, idempotent, background-safe command contract
exists. Unknown action keys fail closed.

PWA action buttons are progressive enhancement. Normal notification tap and
exact route must remain the required path because iPhone and Android PWA
support differs.

## Native Delivery

The first native transport uses Expo Push Tokens through `expo-notifications`.
The schema keeps provider identity explicit so direct APNs or FCM may be added
later without moving tokens into the Web Push subscription table.

Native registrations are installation-scoped, owner-managed through narrow
RPCs, and service-role-readable only for delivery. Raw tokens are never
returned from list APIs or written to logs.

The native root:

1. creates Android channels and iOS action categories
2. requests permission only from an intentional user flow
3. registers or rotates the installation token
4. renews a foreground lease while active
5. consumes cold-start and running notification responses once
6. validates routes through an allowlist
7. sends unsupported destinations to a safe target screen rather than an
   arbitrary router path

Foreground native delivery is suppressed server-side for the active
installation and presented in-app. Other background installations for the
same account remain eligible.

## Android Channel Families

Presentation v2 creates one immutable Android channel per sound choice so a
category-level choice made in ShadowChat maps to the exact bundled sound:

- `shadowchat_sound_shadow_whisper_v2`
- `shadowchat_sound_low_glass_v2`
- `shadowchat_sound_gold_signal_v2`
- `shadowchat_sound_hype_burst_v2`
- `shadowchat_sound_pin_shutter_v2`
- `shadowchat_sound_connection_chime_v2`
- `shadowchat_sound_presence_pulse_v2`
- `shadowchat_sound_live_beacon_v2`
- `shadowchat_sound_checkers_move_v2`
- `shadowchat_sound_war_drum_v2`
- `shadowchat_sound_weather_glass_v2`
- `shadowchat_sound_security_signal_v2`
- `shadowchat_sound_system_default_v2`
- `shadowchat_sound_silent_v2`

The following category-family channels are retained as the v1 compatibility
surface for already installed native builds:

- `shadowchat_messages_v1`
- `shadowchat_mentions_v1`
- `shadowchat_social_v1`
- `shadowchat_live_v1`
- `shadowchat_games_v1`
- `shadowchat_weather_v1`
- `shadowchat_security_v1`

The installation reports its channel schema version. New channel behavior
uses a new suffix; old channels remain for at least one native release so user
choices are preserved.

## Mobile Navigation

The phone navigation keeps Active Users on the always-visible first page. Play,
Weather, Search, and Settings live on the second page. The page-swap control is
named **More**, replacing the narrower **Tools** label.

## Settings Information Architecture

1. Delivery on this device
2. Presentation and privacy
3. What you hear about
4. Sound selection by category
5. Quiet hours, snooze, and mutes
6. Home Screen and navigation badges
7. Advanced device troubleshooting

The settings preview renders the actual foreground banner component, not a
separate imitation. Web copy distinguishes foreground branded sounds from
background phone-controlled sound.

## Rollout Gates

1. Additive schema, RLS, and catalogs; v2 delivery disabled.
2. Shadow materialization and parity verification against current events.
3. PWA foreground v2 on test accounts.
4. PWA system payload v2 with current v1 fallback.
5. Native development builds and token registration.
6. Android and iPhone physical-device delivery, routing, sounds, privacy, and
   badge proof.
7. Category canary with one transport owner per category.
8. Controlled production rollout after explicit approval.

Rollback disables v2 materialization/delivery flags and leaves additive data in
place. Because unread truth stays in `notification_events`, rollback requires
no read or badge reconciliation.

The service worker can validate and render a V2 system envelope, but the
current `send-push` Web Push path remains the production PWA background
delivery owner until gate 4 is explicitly completed. The dormant Expo worker
does not deliver to web installations. This prevents two transports from
delivering the same event during the foundation release.

## External Native Release Prerequisites

The implementation is locally complete but native remote delivery cannot be
accepted or activated from this Windows checkout alone:

- Expo Application Services is not authenticated on this workstation.
- `apps/mobile` therefore has no verified EAS project id, native signing
  credentials, or development-build push token.
- iOS rich lock-screen images require a Notification Service Extension in the
  signed iOS build. Android rich images are already represented through the
  Expo `richContent` payload.
- production enablement also requires an optional Expo Push access token if
  enhanced push security is enabled in the Expo project.

Do not enable `notification_presentation_v2` or deploy the delivery worker as a
production owner until EAS authentication, development builds, real Expo push
tokens, iPhone and Android delivery receipts, and route/sound/privacy checks
all pass.

## Local Verification - July 18, 2026

- full local Supabase reset from migration zero: pass
- Supabase database lint at warning level: pass, zero findings
- local Supabase security contract: pass, 139 reviewed definers
- Edge Function Deno check: pass
- Expo mobile lint and TypeScript: pass
- Expo Doctor: 20/20 checks
- original sound asset and native delivery contract: pass
- root lint, app TypeScript, production build, paused-feature check, and bundle
  budgets: pass
- full Jest: 238 suites, 1,320 passing tests, 16 documented TODOs
- Node contracts: 47 passing tests
- Deno delivery worker: 5 retry/environment tests plus typecheck
- targeted foreground coordinator, settings, PWA service worker, navigation,
  envelope, Catch-Up parity, and SQL contracts: pass
- two-user local SQL semantics: disabled/shadow modes, token account transfer,
  RLS isolation, private token grants, and claim idempotency pass
- hardened iPhone WebKit and Android Chromium service-worker/coordinator visual
  gate: pass with zero unexpected runtime issues; see
  `output/playwright/notification-presentation-v2-hardened-r4/summary.json`

The physical native-device gate remains pending for the external prerequisites
above. The V2 runtime flags remain disabled. Applying the additive migration,
deploying the guarded worker, or shipping the web presentation code does not
activate native delivery; no native binary is released by this repository
deployment.

## Required Acceptance

- every active event type maps deterministically
- unknown types, routes, media, actions, sounds, and expired envelopes fail
  closed
- same-origin routes only
- one foreground presentation or one system push per device, never both
- actor PFP, profile navigation, media fallback, and privacy mode work
- grouping preserves all event ids
- source-active events produce neither presentation nor sound
- dismissal leaves durable unread state intact
- exact reads clear source, Catch-Up, navigation, launcher badge, and tray
- quiet hours, snooze, mutes, blocks, and per-category choices apply at
  delivery time
- native token rotation, account switching, invalid-token cleanup, cold-start
  routing, channel migration, and foreground lease behavior pass
- iPhone Home Screen PWA and Android installed PWA pass physical-device checks
- native iOS and Android development builds pass real remote-push checks before
  native delivery is called production-ready
