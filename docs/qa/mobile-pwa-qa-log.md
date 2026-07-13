# Mobile PWA QA Log

## Documentation Status - July 10, 2026

Older artifact paths remain historical evidence. The July 10 web Release A is
deployed, but its mobile/PWA-sensitive behavior still needs a fresh harness
artifact and physical-device pass.

Last updated: 2026-07-12

## July 12 ShadowChat 2.0 ShadowPin Creator Studio - Local Implementation

- Branch: `codex/shadowchat-2.0`; production `main` frontend remains
  unchanged.
- Candidate 3 uses one lazy four-stage Media/Details/Preview/Publish Studio
  with owner-private recovery, staged media, honest progress, explicit public
  confirmation, and exact Theater success handoff from ShadowPin, Chat, and DM
  entry points.
- Seven focused model, history, API, component, lazy/share-entry,
  private-media, and SQL source contract suites pass locally with 32 tests.
  This is code-level proof, not browser or linked-backend acceptance.
- Required Pixel Chromium `412x915` and iPhone WebKit `390x844` proof must
  cover home/category/Chat/DM/Edit entry prefills, image/video/URL preview,
  category/tags, close-reload-offline recovery, upload retry/resume, keyboard
  and safe areas, 130% text, large controls, reduced motion, Back/cold close,
  and zero overflow or console/page errors.
- Required two-account proof must keep Account A's draft/staged media invisible
  to B, deliver one Pin/event only after publish, suppress repeat events on
  edit/move/replacement, and keep old media visible until an atomic replacement
  succeeds.
- No Candidate 3 browser artifact, physical-device result, production Pin,
  notification fanout, or test-data/media cleanup is claimed by this entry.
  Evidence paths and cleanup counts will be added only after the runs finish.
- Contract: [SHADOW_PIN_CREATOR_STUDIO.md](C:/repos/chat2.0/docs/SHADOW_PIN_CREATOR_STUDIO.md:1).

## July 12 ShadowChat 2.0 General Chat Threads Checkpoint

- Branch: `codex/shadowchat-2.0`; production `main` frontend remains
  unchanged.
- Candidate 2 implements a root-only General Chat feed and a routed thread
  surface: full-height phone sheet and `28rem` desktop drawer.
- Authenticated two-account proof passed Pixel Chromium `412x915` and iPhone
  WebKit `390x844` against a production build and the linked shared backend.
- Both engines verified exact viewport-sized sheet geometry, document
  `scrollWidth` equal to viewport width, safe-area composer placement, root
  messages only in the Lounge, chronological direct/nested replies, live
  nested reply arrival, a stable underlying root-card position, exact-target
  focus, and browser Back/cold-close behavior.
- Pixel and iPhone completed with zero console/page errors. SQL/Jest separately
  prove read-cursor ordering, block filtering, deletion placeholders, ACLs,
  routing, normalization, and reply isolation.
- Evidence:
  `output/playwright/wave2-candidate2-threads/summary.json` and paired thread /
  exact-target screenshots in that directory.
- Each run created seven text-only QA messages across two controlled accounts,
  including one composer-sent reply per browser profile.
  Cleanup deleted in dependency-safe order, confirmed every delete, queried
  for remaining IDs, and reported zero cleanup errors. Read-cursor writes were
  intercepted because their legacy owner-private table intentionally has no
  member delete policy; cursor behavior is covered by rollback-only SQL.
- Physical installed-PWA keyboard animation, VoiceOver/TalkBack, native safe
  areas, and touch comfort remain release-gate follow-ups.
- Contract: [GENERAL_CHAT_THREADS.md](C:/repos/chat2.0/docs/GENERAL_CHAT_THREADS.md:1).

## July 12 ShadowChat 2.0 Universal Discovery Checkpoint

- Branch: `codex/shadowchat-2.0`; production `main` frontend unchanged.
- Authenticated production-preview proof passed Pixel Chromium `412x915` and
  iPhone WebKit `390x844` for Discover empty/grouped results, Play scope, and
  Library scope.
- Both engines reported exact viewport/dialog width and height, document
  `scrollWidth` equal to viewport width, stable header geometry, and zero
  console/page errors.
- WebKit exposed and verified a message-card line-box regression that Chromium
  did not reproduce. Explicit block/flex button layout reduced the WebKit card
  from about `846px` to `222px` without changing content.
- Rapid scope changes no longer surface an unhandled abort page error.
- Evidence: `output/playwright/wave2-candidate1-discovery/summary.json` and the
  paired Pixel/iPhone screenshots in that directory.
- No posts, messages, uploads, saves, or collections were created by this
  browser pass, so no remote test-data cleanup was required.

## July 10 Release A Mobile QA Checkpoint

Release scope includes service-worker update behavior, accessible mobile
dialogs/message menus, bounded DM history, notification quiet hours and mutes,
personal blocking, global search/saved collections, and ShadowPin search,
comments, replies, and notification preferences.

- No new `qa:mobile-pwa` artifact is claimed by this documentation pass. The May
  artifacts below remain the latest recorded browser proof until the final
  release is run with `--no-reuse-server`.
- The separate Expo 57 / React Native 0.86 workspace passed local clean install,
  audit, lint, TypeScript, Expo Doctor `20/20`, and static web export. That is
  native toolchain evidence, not installed-PWA or production proof.
- Required release follow-up: fresh iPhone/WebKit and Android/Chromium harness
  coverage, then one installed iPhone and one installed Android pass after the
  production deploy.
- Do not publish a production ShadowPin post merely for smoke. A new pin fans
  notification events and web push to eligible members, and deleting it cannot
  recall delivered notifications. Use existing/staged content unless a real,
  controlled post is explicitly approved.

## Summary

Mobile PWA visual QA now runs through `npm run qa:mobile-pwa`, which uses `scripts/mobile-pwa-visual-qa.mjs` against a production-style Vite preview on `127.0.0.1:4174`.

Latest focused pass: `node scripts/mobile-pwa-visual-qa.mjs --run-name=mobile-header-media-pins-headed-20260517c --no-reuse-server --headed --slow-mo=70`.

- Result: passed.
- Profiles: Mobile Safari/WebKit iPhone small, Mobile Safari/WebKit iPhone large, Mobile Chrome Android medium, Mobile Chrome Android small.
- Checks: 100 passed, 0 failed, 0 not-tested notes.
- Artifacts: `output/playwright/mobile-header-media-pins-headed-20260517c/`.
- Foreground smoke pass: `node scripts/playwright-smoke.mjs --run-name=mobile-shell-headed-smoke-20260517g --headed --slow-mo=40 --no-reuse-server` passed `auth`, `dm`, and `mobile-dm-back`.
- QA cleanup: the mobile harness deleted its 4 group-chat posts during the run; lingering `Mobile PWA chat`, `Group smoke`, `Smoke ping`, and `Resume dm` QA rows were removed from group chat and DM tables after verification.
- Targeted real-device regression artifacts: `output/playwright/mobile-fixes-targeted/`.
- Prior complete public-profile coverage artifact: `output/playwright/mobile-pwa-audit-10/` with 84 passed, 0 failed, 0 not tested.

## Issue Log

| Issue ID | Status | Device profile | Route/screen | Reproduction steps | Screenshot path | Root cause | Files changed | Verification command | Notes/remaining risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MPWA-001 | fixed | local QA environment | Playwright mobile browsers | Run `npm run qa:mobile-pwa -- --run-name=mobile-pwa-initial --no-reuse-server`. | n/a | Playwright was installed but the local browser binaries were missing. | none | `npx playwright install chromium webkit` | Environment dependency installed locally. |
| MPWA-002 | verified | all mobile profiles | core mobile PWA flows | Run the new mobile visual QA harness. | `output/playwright/mobile-pwa-final/summary.json` | The repo had mobile smoke coverage but no focused reusable PWA visual audit harness. | `package.json`; `scripts/mobile-pwa-visual-qa.mjs` | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-final --no-reuse-server` | Harness covers launch/session restore, chat, DMs, boards, settings, feedback, profile, message actions, composer focus/compression, and refocus simulation. |
| MPWA-003 | fixed | iPhone small WebKit, 390x844 | DM list | Navigate to DMs during the mobile PWA audit and navigate back to the DM list from a thread. | `output/playwright/mobile-pwa-audit-5/iphone-small-webkit-07-dm-list.png`; `output/playwright/mobile-pwa-final/summary.json` | The DM list panel used horizontal entrance motion that could be sampled mid-transition and clip controls on route entry or return-to-list. | `src/components/dms/DirectMessagesView.tsx` | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-final --no-reuse-server` | Removed the full-panel horizontal slide so the viewport-width DM list no longer creates transient mobile clipping. |
| MPWA-004 | fixed | Android small Chromium, 360x800 | DM list header | Navigate to DMs on the small Android profile. | `output/playwright/mobile-pwa-audit-7/android-small-chromium-07-dm-list.png` | The DM masthead did not leave enough shrink room for the new conversation button at the narrowest tested width. | `src/components/dms/DirectMessagesView.tsx` | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-audit-8 --no-reuse-server` | Header now has constrained flex behavior, a smaller logo/offset below 380px, truncated title text, and a non-shrinking plus button. |
| MPWA-005 | documented | all mobile profiles | dense secondary controls | Run the mobile PWA audit and review warnings in `summary.json`. | `output/playwright/mobile-pwa-final/summary.json` | Some reaction chips, reply links, weather/action buttons, and board reaction chips are visually small secondary controls. | docs only | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-final --no-reuse-server` | Automated audit records them as warnings, not blockers. Validate comfort on real installed iPhone and Android before deciding whether to enlarge dense secondary controls. |
| MPWA-006 | documented | iPhone small WebKit, 390x844 | public profile modal | Run `mobile-pwa-final` and open a public profile from the currently loaded chat content. | `output/playwright/mobile-pwa-final/summary.json`; `output/playwright/mobile-pwa-audit-10/summary.json` | In the final run, one visible opener did not produce a dialog on the iPhone-small profile. The same flow passed in the prior complete run and other final profiles. | `scripts/mobile-pwa-visual-qa.mjs`; docs only | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-final --no-reuse-server` | Marked as non-blocking testability variance. Real-device validation should still tap public profiles from chat and DM content. |
| MPWA-007 | fixed | iPhone WebKit, 390x844 | General Chat weather popup | Tap the weather pill in the mobile chat header. | `output/playwright/mobile-fixes-targeted/iphone-weather-centered.png`; `output/playwright/mobile-fixes-targeted/summary.json` | The popup was absolutely anchored to the narrow header pill, so the 320px forecast surface could hang off the viewport on iPhone. | `src/components/chat/WeatherWidget.tsx`; `tests/WeatherWidget.test.tsx` | targeted Playwright geometry check; `npm run qa:mobile-pwa -- --run-name=mobile-pwa-phone-fixes-final --no-reuse-server` | Weather popup now uses a mobile fixed center position below the safe-area/header band, with desktop keeping the anchored dropdown behavior. |
| MPWA-008 | fixed | Android Chromium, iPhone WebKit | Boards > Shadow Pin category images | Open Boards, open Shadow Pin, then open a populated category with mixed aspect ratios. | `output/playwright/mobile-fixes-targeted/android-shadow-pin-grid.png`; `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | Android Chromium rendered the old CSS multi-column masonry as one visible column, and a row-grid fallback fixed Android while removing the original packed staggered image flow. | `src/features/shadow-pin/ShadowPin.tsx`; `tests/ShadowPin.test.tsx`; `docs/SHADOW_PIN.md` | targeted Playwright geometry check; `node scripts/mobile-pwa-visual-qa.mjs --run-name=mobile-picker-masonry-weather-share-final --no-reuse-server` | The category image list now uses responsive balanced masonry columns: two columns on phone widths, then greedy-packed by aspect ratio so mixed image heights stagger without row gaps. |
| MPWA-009 | fixed | iPhone WebKit, Android Chromium, compressed keyboard simulation | General Chat GIF picker | Open + > GIF, then focus search while the viewport is keyboard-compressed. | `output/playwright/mobile-fixes-targeted/iphone-gif-picker-compressed.png`; `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | The picker was composer-anchored, so search could crowd the header and the translucent panel allowed chat content to show through behind the keyboard state. | `src/components/chat/GifPicker.tsx`; `tests/MessageInput.test.tsx` | targeted Playwright geometry check; `node scripts/mobile-pwa-visual-qa.mjs --run-name=mobile-picker-masonry-weather-share-final --no-reuse-server` | The mobile GIF picker is now a fixed full-screen portal with forced search focus and an opaque themed background. |
| MPWA-010 | fixed | iPhone WebKit, Android Chromium | General Chat grouped messages | Tap the edge of the second adjacent message from the same user to open the quick reaction rail. | `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | The quick picker lived inside the message bubble stacking context, so grouped bubbles could paint above it. | `src/components/chat/MessageItem.tsx`; `src/components/chat/QuickReactionRail.tsx`; `tests/MessageItem.test.tsx` | `npx jest --runInBand tests/MessageItem.test.tsx`; browser 390x844 check; mobile PWA harness | Quick reactions now render in a body-level portal with viewport-aware positioning, keeping them above grouped messages and away from screen edges. |
| MPWA-011 | fixed | iPhone WebKit, Android Chromium, keyboard-compressed | Chat, DMs, boards, news reactions | Open the full emoji picker from composer or message reactions while the keyboard is available. | `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | Several emoji picker surfaces used local anchored panels, so mobile keyboards, message lists, and headers could overlap them. | `src/components/chat/EmojiPickerOverlay.tsx`; `src/components/chat/MessageInput.tsx`; `src/components/chat/MessageItem.tsx`; `src/components/chat/PinnedMessageItem.tsx`; `src/components/dms/DirectMessagesView.tsx`; `src/components/boards/BoardChat.tsx`; `src/components/news/NewsReactionBar.tsx`; `src/types.ts`; tests | targeted Jest; browser 390x844 check; mobile PWA harness | Phone-sized emoji pickers now use one fixed full-screen portal with forced search focus, opaque themed background, Escape/outside-close behavior on desktop, and shared typing support. |
| MPWA-012 | fixed | iPhone WebKit, Android Chromium | Group chat and DM image preview | Tap an uploaded image in a chat or DM thread. | `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | Image previews could inherit local layout constraints and appear off-center or under app chrome. | `src/components/ui/ImageModal.tsx`; `src/components/chat/MessageItem.tsx`; `src/components/dms/DirectMessagesView.tsx` | browser 390x844 check; mobile PWA harness | Chat and DM image previews now share a body-level fixed modal that centers the image inside the safe-area viewport. Shadow Pin and Art Board previews stay on their own surfaces. |
| MPWA-013 | implemented | iPhone WebKit, Android Chromium | General Chat weather popup | Open weather, tap Share, and send the card into chat. | `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | Weather could be discussed only as text; there was no themed image capture of the exact card the user sees. | `src/components/chat/WeatherWidget.tsx`; `src/components/chat/ChatView.tsx`; `package.json`; `package-lock.json`; `tests/WeatherWidget.test.tsx`; `docs/WEATHER_WIDGET.md` | `npx jest --runInBand tests/WeatherWidget.test.tsx`; full verification bundle | Weather share captures the themed popup with `html-to-image`, excludes controls, uploads through the existing chat media path, and sends it as an image message. |
| MPWA-014 | fixed | iPhone WebKit, Android Chromium | Pinned message preview | Pin a message with multiline/rich content and compare it with the original bubble. | `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | Pinned previews rendered raw text, so whitespace and rich message formatting did not match the original message layout. | `src/components/chat/PinnedMessageItem.tsx`; `tests/PinnedMessageItem.test.tsx` | `npx jest --runInBand tests/PinnedMessageItem.test.tsx`; full Jest | Pinned previews now use the same rich text renderer as chat bubbles, preserving spacing and link rendering. |
| MPWA-015 | verified | iPhone WebKit, Android Chromium | standardized header/menu, DMs, Boards, Entertainment, Settings, Pins, keyboard-compressed chat surfaces | Run the headed mobile PWA harness after the standardized mobile shell and media-derivative work. | `output/playwright/mobile-header-media-pins-headed-20260517c/summary.json` | Header/menu controls moved to a shared mobile shell, Settings moved to the header, Pins moved into bottom nav, and keyboard focus intentionally hides chat chrome. The harness had to be updated to expect hidden keyboard chrome, display-name-only DM headers, and immediate QA post cleanup. | `src/components/layout/MobileAppHeader.tsx`; `src/components/layout/MobileNav.tsx`; `src/components/layout/MobileChatFooter.tsx`; `src/components/dms/DirectMessagesView.tsx`; `src/components/boards/BoardsView.tsx`; `src/features/shadow-pin/ShadowPin.tsx`; `src/components/settings/SettingsView.tsx`; `src/features/games/GamesHome.tsx`; `scripts/mobile-pwa-visual-qa.mjs`; `scripts/playwright-smoke.mjs`; docs | headed mobile PWA harness; headed smoke; lint; typecheck; build; Jest | 100/100 headed mobile checks passed. Smoke passed auth, DM realtime, and mobile DM back navigation. |
| MPWA-016 | verified | Android/Chromium-style landscape and portrait Chrome-channel probes | Entertainment > Shadow Runner | Open Shadow Runner from the Entertainment picker, verify portrait rotate gate, open level map/detail popup, start Level 3, and QA-finish Level 1/2/3 with normal finish movement after teleport. | `output/playwright/shadow-runner-goal-20260611-square-frame/932x430-level3-popup-square-frame.png`; `output/playwright/shadow-runner-goal-20260611-postbuild/932x430-level3-complete.png`; `output/playwright/shadow-runner-goal-20260611-routes/portrait-390x740-rotate-gate.png` | Shadow Runner needed the next phone-gameplay validation pass after adding Level 3, square mission frames, and kind-aware enemy runtime state. | `src/features/games/shadow-runner/ShadowRunnerScreen.tsx`; `src/features/games/shadow-runner/assets/manifest.ts`; `src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`; `src/features/games/shadow-runner/game/levels.ts`; `src/features/games/shadow-runner/game/simulation.ts`; Shadow Runner docs | `npm run lint`; `npx tsc --noEmit -p tsconfig.app.json`; `npm run build`; custom Chrome-channel Playwright probes | Landscape gate remained open at `932x430` and `740x390`; portrait gate blocked play at `390x740`; true square popup frame measured `ratio: 1`; Level 1/2/3 completion overlays rendered. Real-device iOS/Android touch feel still needs follow-up after push. |

## Historical May Summary

The automated mobile PWA visual loop passed across the core installed-home-screen simulations. Final required checks also passed: lint, typecheck, build, Jest, existing mobile smoke, full smoke, and the focused mobile PWA harness. Remaining mobile-specific risk is limited to real-device behavior that Playwright cannot fully reproduce: native keyboard animation, iOS standalone status bar behavior, home indicator safe-area behavior on physical devices, and touch comfort for dense secondary controls.

That statement applies to the recorded May artifact set, not the July 10 local
candidate. Use the candidate checkpoint above until new browser and device
evidence is recorded.
