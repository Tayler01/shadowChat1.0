# October 1 mobile quiver and paste follow-up

## Physical report and verified causes

Tayler reports native Send-side dismissal now works, but bottom-edge rebound
still quivers and the Home Screen swipe remains unstable. The September 30 web
release `3287871f` is confirmed live. Signed native Build 17 completed overnight
but was not yet distributed, so the installed Build 16 has no native movie-paste
capability. Its old empty-clipboard toast is consistent with that missing flag.

- The real stylesheet overrides Send's `touch-none` utility with
  `.hype-send-button { touch-action: manipulation }`. The bounded Send handle
  now uses `none`; the textarea keeps normal text selection. Previous isolated
  probes used an inline override and missed this actual cascade.
- Safari exposes elastic scroll positions beyond the logical end. Automatic
  following and anchor correction could write the logical maximum back during
  the rebound. The shared hook now waits through contact, momentum and elastic
  positions, then resumes following when the browser settles at latest. General,
  DMs, threads and Pins share this controller. Normal containment is retained.
- Empty-valued declared clipboard formats were incorrectly treated as readable.
  Actual text/HTML/URI values now determine that decision. Native recovery also
  preserves mixed clipboard captions in General/DM/Pins. Ordinary text and image
  paste remain on the browser path; no speculative background clipboard reads.
- A rebound can end without another scroll event. DMs now retrieve arrivals
  deferred during contact when following resumes. Resolved empty windows finish
  positioning without waiting for a nonexistent row, revealing the DM greeting.

## Verification

- Six swipe probes use actual compiled CSS: Chromium real touch and WebKit
  replay confirm Send computes `none`, one blur, zero accidental sends and an
  unchanged draft. Eight controlled-elastic DOM probes cover the four shared
  surface keys in both engines, with zero correction writes during rebound.
- Final focused scroll/surface suites passed 119 tests; clipboard/composer suites
  passed 112. A tap followed by an append remains live without a scroll event.
  A deterministic 35 MiB file traverses the actual native controller and web
  decoder in 187 pull chunks, with full byte equality and staging/removal without
  upload. This proves transfer bounds, not a physical Photos representation.
- Signed IPA `d96c5839-5bbe-45a6-9611-b4269f79f824` is Build 17, has four
  orientations, production APNs entitlement and the clipboard module linked.
  The generated Expo provider's ARM64 registration function calls that module's
  metadata accessor. SDK is iOS 26.5/Xcode 26.6; provisioning expires July 2027.
- Final lint, TypeScript, build and all 320 Jest suites passed: 2,918 tests and
  16 TODO. Chromium/WebKit affected UI checks passed 16/16: actual Send CSS,
  swipe/draft preservation, empty-format clipboard/caption staging, empty DM
  presentation and resumed UI sends with second-account live receipt. Browser
  native clipboard is a mocked bridge, not proof of Photos on a physical phone.
- Linked migration dry run reports up to date. Current remote function and
  secret-name inventories are retained privately for operations-health checks.
  Manual production publishing must include both verified Linux function ZIPs.
  Build/deploy/restart and production smoke evidence is retained under ignored
  `output/oct1-*` and `output/playwright/` artifacts; live identity comes from
  the no-store health manifest, rather than this pre-publish source checkpoint.

## Apple and device boundary

Apple initially rejected App Store Connect access for a required agreement.
Readonly access recovered after the user reviewed the account. No agreement was
accepted by the agent. Signed Build 17 was uploaded through Apple's official
API: upload `cb8676f4-88d2-49b4-8c71-b6bb31f940ed`, all chunks complete without
errors or warnings, now processing. Assign the processed valid build to the
existing internal tester group; verify `IN_BETA_TESTING` before claiming access.

Physical Photos paste/permission and actual keyboard/rebound acceptance remain
phone checks after installing Build 17 and loading the new web release. An
ordinary PWA cannot call this iOS module: its video paste still depends on the
movie bytes WebKit exposes. Existing PWA toolbar investigation and App Store
requirements remain in the September 30 reports. Native push enrollment is
repaired; delivery stays gated pending current physical enrollment and canary
proof. Legacy native jobs remain paused.
