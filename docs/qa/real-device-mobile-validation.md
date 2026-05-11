# Real-Device Mobile Validation

Use this checklist after `npm run qa:mobile-pwa` passes and before treating a
mobile/PWA-sensitive release as fully proven. Playwright catches most layout and
flow regressions, but real installed PWAs still differ around browser chrome,
keyboard animation, safe areas, status bars, lock/reopen behavior, and touch
comfort.

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
| RD-013 | Both | Boards | Open Boards and News Chat. | Board map, labels, chat composer, and nav controls fit and remain usable. | not run | | |
| RD-014 | Both | Settings | Open Settings and Account/Profile. | Sections fit; controls are tappable; no footer/nav overlap. | not run | | |
| RD-015 | Both | Feedback modal | Open Settings > Feedback > Send Feedback. | Modal fits screen, scrolls internally, keyboard does not trap submit/close controls. | not run | | |
| RD-016 | Both | Background/refocus | Send or view a thread, background app for 30 seconds, reopen. | App resumes without stale blank state; realtime/session state recovers. | not run | | |
| RD-017 | Both | Lock/unlock | Lock phone with app open, unlock and return. | App remains usable; no stuck keyboard, blank screen, or stale overlay. | not run | | |
| RD-018 | Both | Poor network | Toggle poor connection or briefly enable airplane mode during send/read flow. | Failure states are clear; app recovers after network returns. | not run | | |
| RD-019 | Both | Safe-area top/bottom | Inspect header and footer near notch/status bar/home indicator. | No important content sits under notch, status bar, or home indicator. | not run | | |
| RD-020 | Both | Touch comfort | Tap dense controls: reactions, reply links, board chips, settings controls. | Controls are usable without frequent mistaps. | not run | | |
| RD-021 | Both | Theme/dark mode | If device/app theme changes are relevant, toggle or inspect theme state. | Premium dark UI remains consistent; no unreadable contrast. | not run | | |
| RD-022 | Both | Notifications | If push changed, send a notification and tap it. | Notification displays, badge behavior is sane, tap routes to the right place. | not run | | |

## Known Emulator Gaps

- iOS Home Screen status-bar and browser-chrome behavior.
- Native keyboard animation timing.
- Home indicator safe-area feel on physical devices.
- Android vendor keyboard differences.
- Lock/unlock and background timer behavior.
- Notification delivery and OS badge behavior.
- Real finger tap comfort for dense secondary controls.

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
