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

## Native Registration Recovery - July 19, 2026

Physical build `7` testing exposed a native registration hang after the web
session had already synchronized. Production API evidence showed authenticated
iPhone installation-state calls but no completed
`register_my_notification_installation_v2` call. That proved only that the
remaining stall was at or before installation persistence; the cached APNs
device-token promise was a suspected downstream risk, not yet the proven first
blocker.

Build `8` hardens that path:

- every enable/disable command has a request id, and web waiters ignore terminal
  state from older commands
- session synchronization and notification commands execute in order
- permission, installation, APNs/FCM token, Expo token, and token-persistence
  stages each have a bounded timeout with an actionable stage-specific error
- iOS retry bypasses the `expo-notifications` module-level cached device-token
  promise and asks the native token manager for a fresh request, so an older
  unresolved APNs request cannot poison every later attempt
- passive native progress no longer owns the web switch's active-save state, so
  a late `busy` snapshot cannot permanently disable retry
- Settings shows the current native registration stage while the explicit
  operation is active

The native delivery worker remains disabled/shadow-gated until build `8`
creates a real installation and Expo token row and passes foreground,
background, terminated, exact-route, duplicate-suppression, badge, and clearing
proof on a physical iPhone. Android must pass the same matrix separately.

### Build 8 bridge finding

Physical build `8` testing still froze before the first installation RPC.
Linked production evidence showed the signed-in iPhone continuing normal app
traffic while `notification_installations` remained empty. The failure was
therefore earlier than APNs: the persisted hosted WebView could issue an older
sessionless enable command that the stricter build `8` native parser discarded.

The build `9` recovery keeps current session-bearing commands strict while
accepting the legacy sessionless enable shape without clearing the already
synchronized native session. It also:

- uses a request-id-deduplicated same-origin navigation control as a fallback
  when the normal WebView message channel gives no acknowledgement
- fails the web request with an actionable error after the fallback is also
  silent, instead of showing an indefinite saving state
- loads the hosted native shell with a bridge compatibility epoch and disables
  the WebView HTTP cache so app updates do not preserve an incompatible shell
- keeps malformed supplied sessions rejected and leaves native delivery
  shadow-gated until a physical build creates both installation and token rows

### Build 10 immediate post-sign-in session authority

Physical build `9` testing exposed a second, narrower race immediately after a
fresh web sign-in. Live Auth logs showed Tayler's password login and subsequent
authenticated WebView requests succeeding, while no iOS installation or native
token row was created. The bridge could synchronize the verified web session
into the native Supabase client, but the notification provider then consulted
its separately updated session ref. That ref could still be null for the same
turn, causing the false `Sign in to ShadoChat before enabling notifications`
failure.

The verified session returned by native `setSession` is now passed directly
into notification registration and made authoritative for that request. The
provider still falls back to its persisted native session for legacy commands,
but it no longer waits for a React auth-listener render before registering a
device immediately after sign-in.

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

## Native Release Status - July 19, 2026

The external signing and beta-distribution prerequisites are now in place:

- Expo Application Services is authenticated as `shadowchat111`, and
  `apps/mobile` is linked to EAS project
  `1deb0022-9ec4-4e90-8fc8-8b71c3737ff2`.
- iOS build `3` exposed an obsolete General Chat-only proof shell and could not
  synchronize the production web session into native notification
  registration. It was removed from `ShadoChat Internal Beta` and is not an
  acceptance artifact.
- replacement iOS production build `5`
  (`1635236c-c9ce-4810-8fe2-bfaf8c5e202c`) contains the complete production
  ShadoChat app in a strict same-origin native container, secure web/native
  session synchronization, native notification setup, exact notification
  routing, and the rich notification service extension. Apple reports it
  `VALID` and `IN_BETA_TESTING` in `ShadoChat Internal Beta`; auto-notify is
  enabled and only build `5` is attached to that group.
- the account holder at `taylerthekid1407@icloud.com` is invited as the first
  internal tester.
- the signed iOS configuration includes the
  `ShadowChatNotificationService` extension for rich lock-screen media.
- Android package `com.shadowchat.mobile` has its Firebase project file and an
  active FCM V1 service-account credential in Expo. The former proof-shell APK
  is superseded; version-code `2` replacement build
  `ef382e37-f474-4ada-9909-4efb8b36ece1` finished successfully from the same
  full-app source and is ready for physical-device validation.
- the linked Supabase runtime is in `shadow` mode for the `dm` category and the
  single Tayler Kid canary account. Worker invocation and receipt
  reconciliation remain disabled.
- the worker health probe returns HTTP 200, but the linked backend currently
  has zero active native tokens. Existing PWA delivery therefore remains the
  only production delivery owner.

Do not change the DM canary from `shadow` to `active` until TestFlight build `5`
is installed, the complete app is visually confirmed, notification permission
is granted, a production Expo token is visible in the linked backend, and a
fresh worker health probe succeeds. After that gate, activate only the
single-account DM canary and verify foreground, background, terminated, route,
sound, image, action, badge, read-clearing, and duplicate-suppression behavior
before expanding categories or users.

### Build 6 native hotfix

Physical build `5` exposed two native-container defects even though its signed
APNs entitlements were correct:

- the production WebView extended into the iPhone status-bar area instead of
  owning the native top and bottom safe areas;
- the web Settings switch still opened browser-oriented setup before sending
  the native permission request, and the bridge could incorrectly accept an
  initial `undetermined` permission state as a completed request.

Production commit `c7c4ee7` makes the Settings switch request native permission
directly, adds an exact native route to the phone notification settings for
denied permission, waits for a terminal permission result, and wraps the full
app in the iOS/Android safe-area container. iOS EAS build `6`
(`c96adbff-dc49-47c6-896b-483681643b8d`) is signed, processed by Apple, attached
to `ShadoChat Internal Beta`, and has build-specific test instructions. Build
`6` confirmed the safe-area repair, then exposed one more bridge problem:
native-mode detection was frozen before the WebView JavaScript bridge appeared,
and a stale native session read could overwrite the signed-in session supplied
by the web app. The visible symptoms were `Permission: Unsupported` and the
incorrect `Sign in to ShadoChat` error for an already signed-in user.

Native delivery remains in the existing DM-only `shadow` canary with worker
invocation disabled. The next replacement build must contain the query-backed
native detection and atomic auth-plus-enable handoff, register the first
production iOS token, and pass foreground, background, and terminated tests
before activation.

Production commit `ae2d04e` contains that repair. The replacement artifacts are
iOS build `7` (`a6e8d7d1-7c77-4c40-b54c-a6ca206fa15e`) and Android version-code
`4` (`b443cfe8-5cba-40ec-be54-5410384b162a`). They were created from the same
verified source state. iOS build `7` finished, was submitted and processed by
Apple, received build-specific test instructions, and is attached to
`ShadoChat Internal Beta`. Android version-code `4` finished as an internal APK.
Native delivery remains deliberately inactive until the physical-device
acceptance pass registers a real native installation.

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

## Rollout Verification - July 19, 2026

- linked migrations `20260718210000`, `20260718233000`, and `20260719110500`:
  applied
- linked `deliver-notifications-v2` Edge Function: active, version 3
- worker authentication secret and delivery-environment secret: present
- worker health probe: HTTP 200
- focused Node notification contracts: 6/6 passing
- focused notification SQL Jest contracts: 3 suites / 21 tests passing
- delivery worker Deno tests: 8/8 passing
- replacement iOS EAS production build
  `1635236c-c9ce-4810-8fe2-bfaf8c5e202c`: finished
- App Store Connect build `5`: valid and in internal beta testing; build `3`
  removed from the internal group after its obsolete proof shell was identified
- replacement Android EAS preview build
  `ef382e37-f474-4ada-9909-4efb8b36ece1`: finished
- Expo Android FCM V1 credential:
  `firebase-adminsdk-fbsvc@shadowchat-99822.iam.gserviceaccount.com`, active
- linked rollout state: DM-only, one-account `shadow` canary; zero active native
  tokens; worker delivery disabled

The remaining gate is physical native-device proof. Shadow mode materializes
and measures the candidate path without sending native pushes. It does not
compete with the current PWA transport.

## TestFlight Toggle Recovery - July 19, 2026

Physical testing of iOS build `7` exposed two hosted-web bridge failures after
the native session synchronization repair:

- a native denied permission could be overwritten by the browser-only
  `unsupported` fallback, hiding the route to iOS Settings
- a signed-in web profile could briefly exist before the recoverable Supabase
  session was available, allowing an invalid signed-out enable command

The hosted Settings repair preserves native permission and support state,
requires a complete web session before sending the atomic enable command, and
shows an explicit updating state while the native request is active. The
bridge ignores stale idle `undetermined` events but accepts that result after a
real busy enable cycle, so it avoids both premature completion and a frozen
switch. This is a hosted-web repair consumed by build `7`; no replacement
binary is required for this checkpoint. Native delivery remains inactive until
an installation and token are registered and the physical acceptance matrix
passes.

## Build 11 Durable Native Enrollment - July 20, 2026

Physical build `10` proved that the prior repair still had the wrong authority
boundary. The hosted account was authenticated, but notification setup waited
for a second native GoTrue session and its sessionless custom-URL fallback
discarded that identity. Production traces showed successful hosted
`/auth/v1/token` and `/auth/v1/user` requests with no native notification
registration RPC. That is why an already signed-in user saw `Sign in to
ShadoChat before enabling notifications`.

Build `11` replaces that path instead of extending its timeout:

- the native container creates a 256-bit verifier, a SHA-256 verifier
  challenge, a device-only installation credential, and its credential hash
- the authenticated hosted app mints a five-minute, single-use Supabase ticket
  bound to the exact request, installation key, verifier challenge, credential
  hash, and signed-in user
- native redeems the ticket with the verifier, plaintext device credential,
  and production Expo token; no Supabase access token, refresh token,
  enrollment ticket, verifier, or installation credential is placed in a URL
- only the credential hash is stored server-side, while the plaintext
  credential is stored with iOS/Android device-only secure storage
- token rotation, foreground suppression leases, sign-out/account-change
  revocation, and retry after a lost redemption response use the scoped device
  credential and no longer depend on native session timing
- the production delivery worker now honors each native installation's active
  foreground lease, suppressing only that foreground device while preserving
  delivery to inactive sibling devices
- WebView messages are same-origin checked, request-id correlated, retried,
  deduplicated, bounded, and expired after five minutes
- the duplicate local-storage auth poller and the secret-bearing custom-scheme
  fallback are removed

Linked migrations `20260720152414` and `20260720155850` are applied. The
enrollment transaction passed wrong-verifier, replay, rollback, credential
rotation, token refresh, foreground lease, revoke, and post-revoke checks
against the linked database. The security-definer allowlist and linked
security contract include the intentionally anonymous, credential-scoped
endpoints. The two private enrollment tables remain deny-by-default with RLS
and no browser policies. `deliver-notifications-v2` version `12` is deployed
with the foreground arbitration fix.

Build `10` cannot consume this protocol. Acceptance requires installing build
`11`, enabling notifications from the signed-in Settings page, observing the
native iOS prompt, confirming a linked iOS installation/token row, and then
passing foreground, background, terminated, route, action, image, sound,
badge, read-clearing, sign-out, and account-switch tests.

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
