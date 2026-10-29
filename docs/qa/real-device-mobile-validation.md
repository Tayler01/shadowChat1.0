# Real-Device Mobile Validation

## October 29 follow-up on build 22

The user reported visible startup-loader handoffs, a changing progress-bar
layout, an unwanted top-level Change community control, and a failed reviewer
login despite selecting Demo. These reports supersede treating the earlier
launch acceptance as complete polish acceptance.

The exact private reviewer file was rechecked against demo Auth and actual
Chromium and WebKit sign-in with native query parameters. Both reached chat;
the account remains ordinary, confirmed and acknowledged. Earlier demo Auth
logs contain invalid-credentials responses, but the submitted values are not
available: the precise phone-input cause is unproven. No password was changed.
All five probe sessions were revoked and no content was created. Evidence:
`output/release-evidence/demo-bootstrap-20261028/reviewer-login-recheck-20261029.json`.

The next native build must be physically checked for a continuous launch cover,
stable green bar, Settings-only community switching, and repeat demo sign-in.
No connected iPhone or usable simulator is currently exposed to the agent;
new native App Store screenshots and physical push proof remain outstanding.

## October 28 streamlined iPhone build 22

- The user confirmed TestFlight 1.0.0 (22) after a full close and reopen:
  the earliest launch shows the ShadoChat logo, the following loading screen
  is branded and shows progress, and the existing member account signs in
  normally. This is physical-device confirmation; the exact iPhone model and
  iOS version were not supplied.
- Apple processed build `7fcc54c1-ca55-4fdd-bc37-f0b357e81efa` as VALID and it is
  assigned to the existing internal test group. EAS build
  `8eb2edc1-2854-41c5-a80f-1d6b07626c08` uses native source `591093f631df`.
- The user subsequently confirmed signing out, selecting Demo, signing in as
  the ordinary reviewer, and seeing only synthetic chats and ShadowPin content.
  The repeated identical reply is one confirmation, not two independent tests.
- Notification delivery/taps, media permissions, and the remaining live-message
  regressions are not covered by these device confirmations. App Review
  submission and public release remain outstanding.

## October 5 Checkers selection, music and frame pacing

- User reports AI works in light iPhone testing, but reselection sometimes locks,
  music blips, and room/camera motion is sluggish on iPhone 16 Pro Max.
- Candidate repairs have browser/runtime evidence in `mobile-pwa-qa-log.md`.
  This is not physical-device acceptance. After the restart prompt, verify:
  tap another own piece and deselect, mandatory jumps, a complete AI/human match,
  camera drag/pinch, music on/off and background/return, then sustained play for
  at least ten minutes for heat, stable audio and responsiveness.

## October 5 first-send and composer-boundary follow-up

- New screenshots report a first outgoing text leaving latest and message rows
  painting behind the composer/keyboard accessory gap. The shared controller
  race is reproduced by event-order regression tests; the patch and mobile
  clipping pass Chromium/WebKit fixtures. Physical PWA/TestFlight acceptance is
  pending. [Validation steps](../features/first-send-scroll-2026-10-05.md).
- Tayler separately reports the earlier quiver fixed in both hosts. Preserve
  that accepted behavior while checking the new Send scenario. This does not
  close the remaining Home Screen video-paste or toolbar investigations.

## October 1 physical video-paste result

- Tayler reports video paste working in TestFlight after the Build 17 release,
  while the same operation still fails in the Home Screen app. Basic native
  movie paste is physically accepted; the exact file size, cloud-backed media,
  permission-denial path, rotation and notification delivery are not confirmed
  by this report. RD-043 is partially accepted, not fully closed.
- PWA movie paste remains open. Current upstream and a pinned WebKit release
  filter native movie representations before the async Clipboard API exposes
  data. The existing video picker remains physically confirmed. See the
  [source-backed investigation](../features/pwa-video-clipboard-2026-10-01.md).

## October 1 acceptance correction

- RD-044 is not accepted yet: native Send swipe improved, but physical bottom
  rebound and PWA Send swipe still quiver. Follow-up fixes the real CSS override
  and elastic-position correction loop; recheck the new hosted release in both
  hosts, retaining normal boundary pull. Browser probes are not device acceptance.
- RD-043 requires installed Build 17, not the signed artifact alone. Native movie
  module registration/rotation are verified in the IPA; Apple account access
  recovered and the uploaded build is processing. Verify Photos video copy/paste and Allow/Deny
  Paste after the installed build number changes to 17.

## September 30 TestFlight build 17 follow-up

- Tayler physically installed build 16 and confirmed accessory toolbar absence;
  the Home Screen PWA still displays the toolbar. System-dialog typing was
  rejected as unsuitable. This supersedes the parked/unverified native notes
  below, which describe an earlier checkpoint.
- RD-043: Build 17 permits rotation and adds native movie paste recovery. Verify
  each landscape game opens after rotating, and Photos Copy/Paste stages the
  reported 35 MiB movie with its caption/removal/regular Send. Check Allow/Deny
  Paste and a cloud-backed video. Signed compilation is a separate gate.
- RD-044: Recheck slow/medium/quick Send-side keyboard swipe and upward scrolling
  from exact bottom in General, DMs and Pins, both PWA and TestFlight. Shared
  hook engine tests passed; actual UIKeyboard transitions remain unverified.
- RD-045: Production native enrollment grants are repaired. Enable phone push
  in TestFlight, verify a current production installation/token, then enable
  the bounded named-account DM canary. Verify background and terminated
  display/open, foreground suppression, privacy and sign-out revocation.
  Old native jobs and response collectors must remain paused.

## September 30 composer follow-up acceptance

- RD-040: On Tayler's iOS 27 home-screen PWA, verify media tiles without detail rows,
  video paste and picker review, X removal, regular caption/media Send, side-by-side
  chevron, swipe dismissal, late-send focus behavior and neutral entry styling.
- RD-041: Settings > Feedback > Open keyboard comparison. Confirm home-screen
  context. Tayler reported all DOM editor/file-picker/form variants retained the
  whole toolbar; his September 30 photo confirms installed-PWA context. These
  variants failed the removal goal on his phone. The new System text dialog is
  unverified there; test typing/emoji/paste/cancel and whole toolbar visibility.
  The local paste diagnostic reports formats and byte counts without contents.
- RD-042: Native-client suppression is parked at Tayler's PWA-only request. Its
  prepared patch/export are local and no signed build was released.
- RD-040 and the new RD-041 experiment still need acceptance. Thirty-six practical browser
  checks passed, with exact temporary-data cleanup. WebKit blob video decoding
  remains explicit; uploaded HTTP video playback passed in emulation.

## Documentation Status - July 14, 2026

The checklist now includes the deployed July 10 Release A PWA update,
notification, blocking, ShadowPin, and private-identity risks. No new physical-
device pass is claimed; every device row remains pending until recorded below.

Use this checklist after `npm run qa:mobile-pwa` passes and before treating a
mobile/PWA-sensitive release as fully proven. Playwright catches most layout and
flow regressions, but real installed PWAs still differ around browser chrome,
keyboard animation, safe areas, status bars, lock/reopen behavior, and touch
comfort.

ShadowChat is phone-first by default. Unless a task explicitly states another
target, real-device validation should cover both an iPhone path and an Android
phone path before a user-facing change is considered fully proven.

The Expo 57 / React Native 0.86 workspace is a separate, unshipped native
prototype. Its Doctor/export checks do not satisfy this installed-PWA checklist,
and this checklist does not prove a future native development build.

Wave Three Connections has passed automated Pixel Chromium and iPhone WebKit
proof on isolated deploy `6a556190a9c126b4758b29f1`; RD-029 remains the
required installed-device acceptance and must not be marked passed from that
automation alone.

The flagged Shado Live prototype has automated 320px/Pixel Chromium/iPhone
WebKit/desktop proof, including simulated iOS keyboard compression and zero
permission or backend residue. RD-030 remains the required installed-device
acceptance; automation does not prove native keyboard animation, safe-area
feel, assistive technology, lock/resume, or real-finger touch comfort.

Do not create a production ShadowPin post merely for device smoke. New pins fan
out in-app notifications and web push to eligible members; deleting the pin
cannot retract delivered notifications. Test creation in local/staging, or use
existing production content. A controlled production post requires explicit
approval and a real content/audience plan.

Related docs:

- `docs/qa/mobile-pwa-qa-log.md`
- `docs/qa/mobile-viewport-audit.md`
- `docs/PHONE_INSTALL_ONBOARDING.md`
- `docs/PRODUCTION_SMOKE_TESTING.md`

## Minimum Release Gate

Before real-device testing:

- [ ] `npm run lint` passed.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` passed.
- [ ] `npm run build` passed.
- [ ] Relevant targeted Jest passed.
- [ ] Relevant smoke script passed.
- [ ] `npm run qa:mobile-pwa -- --run-name=<release-name> --no-reuse-server` passed.
- [ ] Latest artifact path is recorded:

Minimum real-device pass:

- [ ] One iPhone installed from Safari to Home Screen.
- [ ] One Android phone installed from Chrome to Home Screen.
- [ ] Login/session restore works on both.
- [ ] Chat, DMs, settings, and at least one modal work on both.
- [ ] Composer focus, typing, sending, and keyboard close work on both.
- [ ] No critical safe-area, scroll, or fixed-footer issue remains.

## Device Matrix

| Device | OS | Browser/install source | App URL | Tester | Date | Result |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone | iOS | Safari Home Screen | | | | not run |
| Android | Android | Chrome Home Screen | | | | not run |

## Checklist

| ID | Device | Flow | Steps | Expected result | Result | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RD-001 | iPhone | Install from Safari | Open production or preview URL in Safari, add to Home Screen, launch from icon. | App opens standalone-like, correct icon/title, no broken first paint. | not run | | |
| RD-002 | Android | Install from Chrome | Open URL in Chrome, install/add to Home Screen, launch from icon. | App opens standalone-like, correct icon/title, no broken first paint. | not run | | |
| RD-003 | Both | Login/session restore | Sign in, close app, reopen from home screen. | Session restores without forced login or blank screen. | not run | | |
| RD-004 | Both | General Chat launch | Open General Chat after session restore. | Header, weather widget, active users, message list, and composer fit without overlap. | not run | | |
| RD-005 | Both | Composer focus | Tap composer, type multiple lines, close keyboard. | Composer stays visible; message list remains usable; no major layout jump. | not run | | |
| RD-006 | Both | Send message | Type and send a test message. | Local feedback is immediate; keyboard/focus behavior is stable; message appears once. | not run | | |
| RD-007 | Both | Receive/realtime | Send from another account/device or browser session. | Incoming message appears once; unread/realtime UI updates correctly. | not run | | |
| RD-008 | Both | Scroll history | Scroll up and back to newest messages. | Scroll is smooth; footer does not cover content; no unwanted body bounce blocks use. | not run | | |
| RD-009 | Both | Message actions | Open reactions/reply/actions from a message. | Action UI fits the viewport and is tappable. | not run | | |
| RD-010 | Both | Public profile | Tap a user/avatar from chat or DMs. | Profile modal opens, scrolls internally, closes cleanly. | not run | | |
| RD-011 | Both | DM list | Open Direct Messages. | Header, list, new conversation button, and nav controls remain inside viewport. | not run | | |
| RD-012 | Both | DM thread | Open a DM thread, focus composer, send a message, go back. | Composer works; back navigation returns to DM list without clipping or horizontal slide artifacts. | not run | | |
| RD-013 | Both | Paused navigation | Inspect the bottom navigation and open a legacy Boards/News URL. | Boards is absent and the legacy URL safely returns to Chat. | not run | | |
| RD-014 | Both | Settings | Open Settings and Account/Profile. | Sections fit; controls are tappable; no footer/nav overlap. | not run | | |
| RD-015 | Both | Feedback modal | Open Settings > Feedback > Send Feedback. | Modal fits screen, scrolls internally, keyboard does not trap submit/close controls. | not run | | |
| RD-016 | Both | Background/refocus | Send or view a thread, background app for 30 seconds, reopen. | App resumes without stale blank state; realtime/session state recovers. | not run | | |
| RD-017 | Both | Lock/unlock | Lock phone with app open, unlock and return. | App remains usable; no stuck keyboard, blank screen, or stale overlay. | not run | | |
| RD-018 | Both | Poor network | Toggle poor connection or briefly enable airplane mode during send/read flow. | Failure states are clear; app recovers after network returns. | not run | | |
| RD-019 | Both | Safe-area top/bottom | Inspect header and footer near notch/status bar/home indicator. | No important content sits under notch, status bar, or home indicator. | not run | | |
| RD-020 | Both | Touch comfort | Tap dense controls: reactions, reply links, board chips, settings controls. | Controls are usable without frequent mistaps. | not run | | |
| RD-021 | Both | Theme/dark mode | If device/app theme changes are relevant, toggle or inspect theme state. | Premium dark UI remains consistent; no unreadable contrast. | not run | | |
| RD-022 | Both | Notifications | If push changed, send a notification and tap it. | Notification displays, badge behavior is sane, tap routes to the right place. | not run | | |
| RD-023 | Both | General Chat read position | After seeded/staging browser scroll QA passes, reopen General Chat with older unread messages and a message deep link. | First unread/deep-link target is visible, Jump to latest reaches the newest message, and realtime incoming messages do not pull an anchored reader to the bottom. | not run | | |
| RD-024 | Both | PWA update | Install the prior production build, deploy the candidate, background/reopen, and accept or observe the update path. | The app updates without a stale shell, reload loop, blank feed, or lost authenticated session. | not run | | |
| RD-025 | Both | Notification controls | Exercise global, General Chat, DM-conversation, quiet-hours, and ShadowPin notification toggles with controlled test traffic. | Muted/quiet notifications stay suppressed; allowed notifications show once and route correctly. | not run | | Use staging or targeted existing-account traffic; do not create a test pin in production. |
| RD-026 | Both | Personal blocking | Block a second test account, resume/reconnect, inspect presence/chat/search/DM surfaces, then unblock. | Blocked users/content remain hidden as designed and blocked DM creation/sending fails server-side; unblocking restores allowed behavior. | not run | | |
| RD-027 | Both | Private identity Release A | Sign in with stable users, open profiles, General Chat, DMs, search, and full-admin access where authorized. | Public surfaces omit Auth email and legacy `full_name`; guarded full-admin email remains available; no profile/bootstrap regression appears. | not run | | Required before considering the later Release B column drop. |
| RD-028 | Both | ShadowPin social UI | Use an existing or staged pin to open search, tags, comments, replies, moderation, and notification settings. | Controls fit the safe area/keyboard, thread state updates once, and no unintended production-wide notification fan-out occurs. | not run | | Production pin creation requires explicit approval. |
| RD-029 | Both | Connections | From the DM Hub, open Connections; search a controlled account; request, accept, open the profile, enter the existing DM, return, remove, and test Back/Escape. | Sheet and nested profile fit the safe area, focus/touch behavior is comfortable, realtime request state appears once, Back/Escape restore the correct layer, and the existing DM is unchanged. | not run | | Use the isolated 2.0 URL and controlled accounts; restore Connection and discovery/notification preference state. |
| RD-030 | Both | Real Shado Live beta | On the isolated 2.0 URL, use two selected tester accounts. Host creates and starts a room; listener joins, chats, raises/lowers a hand; host promotes, mutes/demotes, and ends. Repeat reconnect, background/resume, lock/unlock, Bluetooth/headphones, weak network, report, foreground notification route, and VoiceOver/TalkBack flows. | Banner and stage fit safe areas; listener receives no microphone prompt; host/speaker permission and audio routing work; composer follows the native keyboard; state changes appear once; terminal/removed state tears down media; live report uses server evidence; notification routes to the exact room; no camera/recording request or leftover provider room/test data remains. | not run | | Isolated test URL and allowlisted accounts only. Restore preferences and remove all scoped test rooms/messages/provider residue. |
| RD-031 | Both | Foreground/background notification arbitration | With the same recipient signed into an installed PWA, send controlled DM, General Chat, interaction, ShadowPin, connection, presence, Live, and Checkers events while the app is foregrounded, backgrounded, and closed. | Foreground shows one in-app alert and no OS push; background/closed shows one push and no replay after reopening; transitions do not duplicate events. | not run | | Verify every preference, quiet-hours, snooze, block, General Chat mute, and DM-conversation mute path. |
| RD-032 | Both | Notification read and badge clearing | Create unread events in each badge category, locate each through its tab or Catch-Up, open the exact source, then inspect the OS tray and Home Screen icon. | Navigation and Home Screen counts share the same unread ledger, cap visually at 99, clear only on source read, and leave no ghost count or stale OS notification. | not run | | Include DM conversation counts, Pin/Catch-Up discovery, Checkers Play badge, app restart, and notification-tap routing. |
| RD-033 | Both | Weather share and radar | Share the loaded weather card to General Chat, open the posted image, then run radar through several loops and a background/resume cycle. | Shared image is readable rather than black; radar advances about every 500 ms with no blank layer, large jump, or runaway hidden-tab work. | not run | | Browser automation passed nonblank 720x788 output; confirm installed-PWA rendering and real network behavior. |

## Shadow Checkers hosted browser evidence — September 29, 2026

Published build `fef865dee100b6c6ef92926c62faaab0a2ea1f04` to `https://shadochat.online` in Netlify deploy `6abc7522c70385a4236e9f57`. Hosted two-player Android/Chromium and iPhone/WebKit browser emulation passed local animation before held RPC (12 ms and 138 ms), own-side orientation, authoritative persistence without replay, opponent realtime reply from the flipped seat, camera controls and exact test-created data cleanup. Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1790735775133/summary.json` and `multiplayer-1790735841210/summary.json`. Public health checked app 200, media endpoint 405 and 11 game assets; production health checked app 200 with News paused. Restart release `fef865de` was published and broadcast. Physical iPhone/Android installed-PWA confirmation remains pending; the RD results below do not change.

## Shadow Checkers move sync and camera browser evidence — September 29, 2026

Before publication, Android/Chromium and iPhone/WebKit two-player local browser emulation passed local legal-move animation before RPC (10 ms and 146 ms respectively), authoritative acknowledgement without replay, opponent realtime reply from the correctly flipped seat, camera controls and exact test-created data cleanup. Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1790734760532/summary.json` and `multiplayer-1790734821801/summary.json`. These earlier checks do not change the physical-device results below; iPhone and Android installed-PWA confirmation remains pending.

## Shadow Checkers closeout — September 27, 2026

These checks target the deployed closeout update. Browser checks do not fill in physical-device results. On September 27, after the chat patch's restart prompt, the user confirmed all three reported issues work on their phone: visible Send, normal screen zoom while using chat, and messages without bubbles. Device model, OS and installed-PWA versus browser mode were not specified; this confirms that narrow flow on one phone, not both platform checklists.

| ID | Device | Flow | Expected result | Result |
| --- | --- | --- | --- | --- |
| RD-034 | iPhone and Android installed PWA | Rotate, landscape lobby, load game, pan/pinch, menu, open/send/close chat, background/return | Branded entrance; usable one-screen lobby; only Chat/menu over room; keyboard dismisses reliably; latest board retained. | partial: user confirms Send, normal zoom and plain chat after restart on one unspecified phone; other flows/platforms remain open |
| RD-035 | Two controlled accounts on phones | Invite while foreground/background; join/decline/expire; take turns, tap push, read current turn | Correct private recipient/match; no duplicate game or stale alerts; foreground prompt and supported background push; exact turn/badge clearing. | not run |
| RD-036 | iPhone and Android installed PWA | Master/music/piece toggles, lock/return, sustained full match, opening tour and fireplace camera movement | Preferences preserved; natural quiet soundtrack/effects; no objectionable blocky patches; responsive play without crash/heat regression; user accepts final visuals/audio. | not run |

## September 30 chat smoothness acceptance

Tayler will perform these after the authorized manual release. Local WebKit and
Chromium evidence is tracked in the [implementation record](../features/chat-smoothness-implementation-2026-09-30.md).

| ID | Device | Flow | Expected result | Result |
| --- | --- | --- | --- | --- |
| RD-037 | iPhone and Android installed PWA | Open General, DM, reply thread and Pins with unread history; page older, receive a message, jump latest, close/reopen and reconnect | Correct first unread or saved row; no loading jump or pull away from history; reads advance only for visible content | Pending Tayler's physical-device test |
| RD-038 | iPhone and Android installed PWA, desktop clipboard | Paste text/image/file, review/remove attachments, send twice rapidly, switch conversation before acknowledgement, open/close keyboard | Staged media, preserved new draft/reply, correct recipient, stable viewport and usable caret | Pending Tayler's physical-device test |
| RD-039 | Two physical devices/accounts | Disable notifications on one device, mute a conversation, hide previews, foreground/background/lock, reconnect | Device choice persists; privacy and mute choices honored; no duplicate recovery; accurate supported OS badges | Pending Tayler's physical-device test |

### October 1 physical follow-up

Tayler reports quiver resolved in both TestFlight and the Home Screen app, and
video paste working in TestFlight. Home Screen video paste still fails. This
accepts the reported interactions on his phone, rather than all rows above.
Pins video thumbnails were separately reported missing and remain under repair.

## Known Emulator Gaps

- iOS Home Screen status-bar and browser-chrome behavior.
- Native keyboard animation timing.
- Home indicator safe-area feel on physical devices.
- Android vendor keyboard differences.
- Lock/unlock and background timer behavior.
- Notification delivery and OS badge behavior.
- Real finger tap comfort for dense secondary controls.
- Service-worker activation/update timing after a real production version change.
- OS quiet-hours/badge interaction with app-level notification preferences.

## Bug Report Template For Codex

Paste this into a new goal when a real-device issue is found:

```text
/goal Reproduce, diagnose, fix, and verify this ShadowChat real-device mobile PWA bug without stopping until the closest practical automated/mobile QA check covers it, the root cause is fixed or documented, and the relevant QA log is updated.

Bug:
[title]

Device:
[device model, OS version, browser, installed Home Screen or browser tab]

Environment:
[production URL, preview URL, or local preview URL]

Route/screen:
[screen]

Steps to reproduce:
1. [step]
2. [step]
3. [step]

Actual result:
[what happened]

Expected result:
[what should happen]

Evidence:
[photo/video/screenshot/artifact path]

Constraints:
- Read AGENTS.md first.
- Preserve desktop behavior.
- Do not redesign unrelated UI.
- Do not change Supabase schema unless required and documented.
- Prefer the existing mobile QA harness and smoke scripts.
- Update docs/qa/mobile-pwa-qa-log.md or docs/qa/mobile-viewport-audit.md as appropriate.

Stopping condition:
- The bug no longer reproduces in the closest practical automated check, or it is documented as requiring final real-device confirmation.
- Relevant lint/typecheck/build/test/smoke checks pass.
- QA docs include root cause, files changed, verification, and remaining risk.
```

## Release Notes

| Date | Release/check | Devices | Result | Artifact or evidence | Follow-up |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
