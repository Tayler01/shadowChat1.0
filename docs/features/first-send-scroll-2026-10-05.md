# First-send following and composer boundary — October 5, 2026

Tayler's iPhone screenshots show the first outgoing text leaving the chat above
latest, with the down arrow visible. A second screenshot shows message rows
painted behind the fixed composer and in the keyboard accessory gap.

## Cause and changes

`useUnreadScroll` previously treated any off-bottom scroll event as a departure
from latest. DOM insertion, composer clearing and keyboard/footer layout can
produce that event before ResizeObserver. Once following was disabled, the
layout handler restored the older anchor instead of completing the follow.

The shared controller now compares the last measured scroll geometry and keeps
existing follow intent through known layout settlement. It does not report a
temporary gap as physically at bottom or save it as a history anchor. Genuine
touch, wheel and keyboard ownership still cancels correction immediately;
elastic positions still receive no forced writes. A positive prior viewport
measurement is required, so an unmeasured/hidden container is not mistaken for
a settled layout.

General Chat, DMs and reply sheets also use a mobile paint clip at the complete
measured fixed-footer height plus keyboard inset. Scrollport dimensions and
padding stay unchanged, preserving the stable frame and native boundary motion.
The latest arrow stays above the clip and body-portaled menus remain outside it.
Pins comments use an inline footer and receive the shared controller fix without
the fixed-footer clip. Preserved Board/News components also reuse MessageList;
their runtime remains paused and their tests remain covered.

## Verification and limits

- Four parameterized first-send regression cases fail before the controller fix
  and pass afterward: DOM growth → scroll event → resize observation, followed
  by viewport change, delayed displacement and immediate wheel takeover.
- Shared gesture, history, read-cursor and elastic regressions pass.
- Final full Jest: 322 suites / 2,948 passing tests (16 existing TODOs).
  Lint, TypeScript, build budgets, 402 Node tests, function classification and
  documentation integrity pass. Production dependency audit is clean; the full
  audit reports five existing development-only high findings outside this patch.
- Remote migration dry run is empty; no backend/schema change is required.
- Eight isolated Chromium/WebKit mobile fixtures use the actual shared hook and
  compiled production CSS. They verify final latest position, confirmed row
  above the composer, absence of the latest arrow after Send, takeover during
  layout, a usable fixed latest arrow and clipped paint/hits below the composer.
  Both engines retain the desktop clipping behavior (`none`).
- Fixture traffic is restricted to localhost; no authenticated reads or writes
  and no test-created production messages or Storage objects.
- Browser artifacts: `output/playwright/first-send-scroll/report.json` and phone
  screenshots in the same folder. These are browser-engine checks, not physical
  iPhone keyboard or installed-app acceptance.

Physical follow-up: open a conversation at latest, focus the composer and send
the first text; repeat after multiline/reply/attachment drafts, keyboard closing,
return from history and orientation changes in PWA and TestFlight. Verify that
the outgoing row remains visible, reading gestures remain uninterrupted and no
rows appear below the entry field. Hosted changes need no new native binary.
