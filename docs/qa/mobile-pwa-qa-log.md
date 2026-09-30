## September 30 current mobile stability checkpoint

Tayler physically confirmed build 16 removes the accessory toolbar; its older
pending notes below are historical. Build 17 adds rotation/native movie paste,
while shared swipe/scroll repairs target both hosts. Server enrollment repair
and bounded worker deployment are verified; native delivery awaits current
physical enrollment. See [current evidence](../features/mobile-stability-build17-2026-09-30.md).

## September 30 native Build 16 TestFlight release

- Current complete hosted UI is retained; the shared native WebView now requests accessory-toolbar suppression. Expo Doctor 20/20, mobile lint/types, fresh install, audit, compatibility tests and iOS export passed. Signed Xcode compilation and Apple processing passed; Build 16 is VALID and IN_BETA_TESTING in the existing group. Physical iPhone suppression, media permissions, account resume and notification acceptance remain pending Tayler's TestFlight check.
- PWA Photos video paste remains unresolved despite working image paste and video picker upload on Tayler's phone. Native toolbar configuration is not evidence of a clipboard fix. [Release evidence](../features/native-testflight-update-2026-09-30.md).

## September 30 large-video and empty-paste follow-up

- Published merged build `fb1d0b58` / Netlify `6abd41540302b1466c64796c`; public identity/cache/media guards, migration dry-run and operations health passed, with required restart broadcast. The initial static-only deployment's missing Functions was corrected before release broadcast.
- Real 35/55 MiB General/DM video sends passed in Chromium/WebKit with progress, captions, live receipt and actual playback. Pins 55 MiB selections show the 50 MiB rejection and no upload. Six merged chat smoke and six clipboard-metadata privacy cases passed. Six messages, four files and two Pins/categories were cleaned; read state restored.
- Tayler requires a PWA fix. All tested DOM editor variants retained the toolbar on his phone. The new system text dialog is a distinct proposed experiment, not a verified removal; clipboard data missing from iOS is now explained when a paste event reaches the app. Actual device video paste and the original selected byte count remain pending.

## September 30 composer follow-up

- Build `abb22931` is pushed to main and live through Netlify `6abd3281fceefa3eb468e003`; required-restart policy/broadcast and public health/media guards passed. Hosted two-account auth/resume-send/DM smoke and exact cleanup passed. Hosted diagnostic DOM checks passed 16 Chromium/WebKit cases.
- Inline previews, captioned media Send, video paste/picker staging, side-by-side chevrons, neutral focus styling and Pins loading bars passed 36 practical assertions across Android Chromium, iPhone WebKit and desktop. Exact test data/Storage cleanup and read-cursor restoration passed. [Follow-up report](../features/composer-media-followup-2026-09-30.md).
- Tayler upgraded iOS 18 to 27 and reported at 12:09 PM ET that every installed-PWA keyboard-comparison variant still showed the native up/down/checkmark toolbar. His photo confirms Home-screen context true and plaintext-only editor/no picker. Editor/file-picker/form changes did not solve removal on this phone; native host suppression is the next prepared path.
- Existing native wrapper suppression is prepared separately; signed-client delivery remains gated. WebKit uploaded HTTP video playback passed, while staged blob/synthetic video decoding remains a device-validation gap.

## September 30 chat smoothness release

- Code `e079a569` is pushed to main and live through Netlify `6abd16af68215c0a06c1be8a`. Production two-account Chromium auth/resume-send/DM smoke and exact data cleanup passed; public health SHA/cache checks and Linux media guards passed. Backend migrations, function inventory, security contract and Auth checks passed. Physical installed-PWA checks remain pending, and the implementation report retains the WebKit frame-time limitation.

- The shared read/scroll controller waits for committed target rows, restores stable row/offset anchors, respects user movement and excludes rows covered by the fixed mobile composer. DM targets also clear the floating controls. General, DMs, reply threads and Pins retain bounded history.
- Pins discussion checks passed Android Chromium, iPhone WebKit and desktop: initial unread, visible-only cursor, history prepend, realtime while reading, send/edit, private file upload, exact target and header counts. Temporary comments/files were removed and absence verified.
- Shared-composer paste/stage/remove and mixed-text caret checks passed Chromium and WebKit. Final local image send appeared live for a second account; its exact message and Storage object were removed. These tests use an isolated local Supabase project with synthetic accounts, not real OS clipboard or installed-PWA proof.
- Source gates passed: 268 Jest suites / 1,591 tests (16 existing TODOs), 63 Node contracts, lint, TypeScript and unchanged build budgets. Full migration replay, six transactional SQL suites and exact security contracts also passed.
- Final build 5 integrated checks passed 20/20 Chromium and 20/20 WebKit, including the first displayed unread frame, fixed-control bounds, capped history, realtime/reconnect, two-account sends, missing-target recovery and delayed send after switching conversations. Exact temporary rows/user/conversation cleanup passed. Chromium had no page errors; WebKit emitted two ResizeObserver loop warnings despite passing all assertions. They remain a diagnostic follow-up, not physical-device proof.
- [Implementation and release evidence](../features/chat-smoothness-implementation-2026-09-30.md) records the final cross-browser and hosted results. Physical-device acceptance remains RD-037 through RD-039 in [real-device validation](real-device-mobile-validation.md).

## September 29 Shadow Checkers hosted move and camera QA

- Published build `fef865dee100b6c6ef92926c62faaab0a2ea1f04`, Netlify deploy `6abc7522c70385a4236e9f57`, passed hosted two-player Android/Chromium browser emulation. Legal-move animation began 12 ms after input before held RPC completion; the server persisted it without acknowledgement replay. Own-side orientation, opponent realtime turn/reply from the flipped seat, camera controls and exact test-created data cleanup passed. Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1790735775133/summary.json`.
- Hosted iPhone/WebKit browser emulation passed the same checks at 138 ms optimistic start with exact cleanup. Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1790735841210/summary.json`. Public health checked app 200, media endpoint 405 and 11 game assets; production health checked app 200 with News paused. Restart release `fef865de` was published and broadcast.
- Physical iPhone and Android installed-PWA interaction, camera gestures and sustained performance still require confirmation. Browser emulation is not physical-device proof.

## September 29 Shadow Checkers optimistic move and camera browser QA

- Two-player Android/Chromium browser emulation passed: a legal move began local animation 10 ms after input while its RPC was held, the server persisted it without animation replay on acknowledgement, and the opponent saw the realtime turn and replied from the correctly flipped seat. Portrait/landscape gate and camera controls passed. Exact test-created data cleanup passed. Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1790734760532/summary.json`.
- The corresponding iPhone/WebKit browser-emulated run passed the same move, realtime reply, seat and camera checks with 146 ms local animation start and exact cleanup. Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1790734821801/summary.json`.
- These were local browser-emulated checks before the hosted release recorded above. Physical iPhone and Android installed-PWA responsiveness, real touch gestures and sustained performance remain pending.

## September 27 Shadow Checkers opponent orientation follow-up

- Reproduced and corrected stale native token transforms after viewer-seat changes; explicitly clear canceled movement bookkeeping to avoid busy-input lock. Native checks: 240 piece hits, 960 empty-square hits, 14 orientation/motion/reset/overhead checks.
- Rebuilt WebGL source `5366fb618549f64b7f772f6863836a8c32d52f30` passes one-frame seat switching in Chromium/Pixel 7 and WebKit/iPhone 13 emulation. Both place own home rows nearest and return correct logical piece taps; zero page errors. Reviewed the opponent screenshot with dark pieces near and white far. `output/playwright/shadow-checkers-unity/seat-switch-report.json` records the rebuilt manifest.
- Physical confirmation that the opponent sees their own pieces nearest remains open. The user's Send/zoom/plain-chat confirmation remains limited to those three prior fixes.

## September 27 Shadow Checkers continuation release — 10:26 PM ET

- Published `47b07751782a13f8fa48460b8f0c7e980209a2b1`, Netlify `6ab9d01510b8d67a73d93cd6`: queue-leave/status, correct queued-loser waiting action, and explicit invite/queue appearance choices. Full lint/types/build/docs and 254 suites pass (1,471 tests, 16 existing TODOs); Chromium/WebKit layout coverage and one reviewed 667×320/130% invitation screen pass. Public health/11 assets and Linux function/production health verified, restart notice broadcast.
- User confirmed Send, normal zoom and bubble-free chat on their physical phone after the preceding patch. Device/platform/install mode unknown; RD-034 is partial, not fully passed.
- Production SQL rollback proof completed a natural 35-move game, settled statistics once, rejected terminal replay, and returned one rematch continuation to both callers. Zero exact test rows remain and crown is unchanged. Report: `output/playwright/shadow-checkers-complete-sequence/result.json`. This does not prove a committed full game, browser results/reconnect or third-player queue handoff.

## September 27 Shadow Checkers chat follow-up — 10:03 PM ET

- Live build `c3523dadeacc960878b71b5d12b0fbd30181c402`, Netlify `6ab9cab96d8fcedc0386d2d1`. Verified exact health/11 assets, Linux media guard, production health and restart broadcast after manual deployment.
- `layout-webkit-1790560393203` and `layout-chromium-1790560506456` cover transparent feed, visible Send, input font at least 16px, keyboard-height containment and scale 1 on send/close across four profiles. Final hide-feed-while-composing state passes targeted WebKit/Chromium preview checks and 20 Jest tests; reviewed `layout-webkit-1790560640584/chat-composer-landscape.png`.
- Notice-positioning reports `layout-webkit-1790559834632` and `layout-chromium-1790559947723` verify unobstructed Skip at 915×412. Hosted transport proof below was on the preceding build, before these presentation-only follow-ups. Physical iPhone/PWA focus zoom is not reproduced or certified by desktop WebKit; user retest remains required.

## September 27 Shadow Checkers closeout release — 9:38 PM ET

- Production build `b298f52bc4b6e9539640a3cd26fee3edd51be6b7`, Netlify `6ab9c48ad00735ff94c5c11f`, is live with matching health and Unity assets, working Linux media function and restart notice. Release verification is recorded in `output/checkers-closeout-live-verification.json`.
- Final layout report `layout-webkit-1790558611751` verifies whole visible cards and rank entries within the panel at 667×320 and 130% text. Final camera reports `camera-chromium-1790557724609` and `camera-webkit-1790557738396` verify inverted drag/arrows, zoom, invisible input zone and menu isolation.
- Final native render report `render-chromium-2-1790558475130`: 567 draws/frame, 30.46 submissions/sec, 33.4 ms p95 interval, zero >50 ms intervals over eight seconds on desktop Intel Arc. These are not phone/GPU-completion/thermal measurements.
- Hosted report `shadow-checkers-invite-hosted-1790560134591/summary.json` passes private invite, distinct-character Join into one match, both players' Unity moves, recipient turn event/read and live compact chat. Exact QA cleanup verified zero sessions/matches/moves/chat/invitations/events/jobs. The test dismissed the accepted-match notice to bypass the discovered Skip overlap; a separate CSS follow-up addresses it. The user's phone found input zoom, unclear Send and unwanted chat panel styling; these require a follow-up and phone retest. Physical installed-PWA push, audio mix/autoplay, real keyboard dismissal, sustained play and the user's camera-moving fireplace artifact remain unverified.

## September 27 Shadow Checkers closeout candidate — local only

- Landscape layout reports `layout-chromium-1790552946284` and `layout-webkit-1790552986595` cover the revised lobby/menu/feed/composer, small landscape, enlarged text, simulated keyboard, failed-send retention and dismissal. These fixtures do not prove hosted transport or real mobile keyboards.
- Actual Unity camera reports `camera-chromium-1790553587774` and `camera-webkit-1790553607999` pass navigation, tilt/zoom, input separation and 44 px controls. Chromium injects two-finger touch; WebKit keyboard zoom is not Safari finger-pinch proof. Fixed the menu overlapping camera-help dismissal.
- `resume-chromium-1790553443275` and `resume-webkit-1790553501121` pass capture, real WebGL context loss and retry with the latest pieces/move retained. Actual history return did not use the browser cache in these runs; synthetic lifecycle coverage is recorded separately.
- `render-chromium-2-1790553727232`: desktop Intel Arc, DPR 2, 915×412, 521 draws/frame, 30.62 submitted frames/sec, 33.4 ms p95 submission interval, zero >50 ms intervals in eight seconds, no page errors. Latest prior shadow-batched baseline was 511 draws/frame. These are submission metrics, not GPU completion/physical-phone/thermal proof.
- All new UI/art/invitation changes remain local. Physical-phone fireplace patches during camera movement, audio feel/autoplay, real keyboard dismissal, invitation/turn push, sustained play and final visual acceptance remain open.

## September 27 Shadow Checkers production testing release

- Manual production build bdde5246d73f254f03f04f8c9067b1fbf684f3de / Netlify 6ab8a42a9c6ca3bd2a6de905 is live, with matching health/Unity assets and restart notice. Full release checks passed; production bundle remains below the unchanged 100 MB limit.
- Post-CSS-split layout-webkit-1790485067166 and camera-webkit-1790485179592 pass. Hosted headed iPhone/WebKit multiplayer-1790485580354 passes actual Unity touch moves for both seats, authoritative persistence/realtime, themed notices, match chat, rotation containment, overhead/reset and exact cleanup. Intro is deliberately skipped using its normal control for this transport smoke.
- First hosted attempt was blocked by late release notes; the harness now dismisses them before skipping the reveal. Initial manual upload omitted Linux Sharp; corrected final deployment returns expected media 405 and passes production health. No screenshots taken.
- Desktop WebKit emulation is not physical iPhone/Android, audio, thermal, installed-PWA or concurrent continuation proof. User is testing the released build on phones next.

## September 27 Shadow Checkers host readiness handshake

- Actual Unity Fast Refresh red/green: refresh-1790483423891 fails when the host watchdog expires its retained iframe; refresh-1790483494645 passes with the same iframe/time origin and a second ready acknowledgment. Only the post-start watchdog is accelerated; source bytes remain unchanged.
- Ten frame lifecycle and 25 screen/board tests pass. Accelerated Windows WebKit resume-webkit-1790483546588 passes navigation/capture and real WebGL-loss retry with the latest pieces/move preserved and overhead working. This is desktop browser evidence, not physical-phone PWA or GPU/thermal proof.
- Lint/types/build/scoped whitespace checks pass, payload 99,794,928 bytes under unchanged budget. Foreground ready-handshake-20260927; no push/deploy. Prior MeshCollider message's independent engine cause is not established.

## September 27 Shadow Checkers invisible gesture overlay

- Actual Unity camera-chromium-1790482916976 and camera-webkit-1790483020586 pass: transparent/empty/borderless left overlay, full-width iframe, full-height gestures, all default playable square centers clear at 915x412 and 667x320, drag/tilt/zoom/reset/overhead, 44 px corner targets. Chromium injected pinch passes; WebKit keyboard zoom is not physical Safari pinch proof. Reviewed controls.png.
- Themed resign/cancel dialogs: 25 screen/board tests pass, including focus return, pending duplicate rejection and retry after failure. layout-chromium-1790482943887 and layout-webkit-1790483056416 pass four landscape/text profiles, 44 px actions and exact dispatch. ending-chromium-1790483091884 passes actual Unity capture/result/rematch after cancelling resignation.
- Lint/types/app build pass; app payload 99,794,656 bytes under unchanged 100 MB limit. Local only, no push/deploy. Real-device/PWA/audio/performance and final art/hosted continuation acceptance remain open.

## September 27 Shadow Checkers optical flame energy

- Linear HDR diagnostic renders eight isolated flames at 32 times, comparing normalized glow against local-light energy before tone mapping. Red evidence: flame-energy-before-20260927.json, candle mismatch 3.5854%. Corrected MedievalStudyEffects.cs: flame-energy-checks.json passes at 0.0182% candle / 1.363% hearth; 45 source-alignment and pause/reduced-motion checks also pass.
- Accelerated Windows WebKit material-webkit-1790482411342 passes opening/overhead/reset. Unity/lint/types/app build and console pass; app 99,793,027 bytes within unchanged budget. Foreground revision candle-energy-20260927. No push/deployment. These are local rendered-source/desktop-browser checks, not physical-device or full room-GI proof.

## September 27 Shadow Checkers shadow batching

- Chromium render-chromium-2-1790481694981: 511 draws/frame versus 758 before; 190 depth/shadow draws versus 437. Actual GL trace now confirms instanced shadow draws. Landscape reviewed; contact shadows and reflections remain. Cadence 30.75 submissions/sec, 38.9 ms p95, no >50 ms intervals; desktop submission metrics are not physical-phone GPU/performance proof.
- Accelerated Windows WebKit material-webkit-1790481790996 passes opening/overhead/reset, capture and kinging. Native optical flame/light check passes all 45 samples and pause/reduced-motion checks. Unity/lint/types/app build pass, 99,794,303-byte app payload within unchanged budget. No push/deployment; physical iPhone/Android/PWA/audio/thermal and final photographic-fidelity acceptance remain open.

## September 26 Shadow Checkers player menu reachability

- Accelerated Windows WebKit ending-webkit-1790481089504 also passes menu dismissal with zero square events/unchanged revision, then capture/result/rematch. Final lint/types/build pass; app payload 99,792,519 bytes. No additional screenshot or Unity rebuild was needed for the invisible input shield.
- Reproduced native iframe tap-through in ending-chromium-1790480902674: open menu remained visible, one square event selected a checker (revision 2 to 3). Outside-tap shield fixes it: ending-chromium-1790480998964 closes the menu with zero square events and unchanged revision, then passes capture/result/rematch. Fourteen screen tests pass.
- Active-match identities/characters/counts were hidden. Restored them in a scrollable game menu with safe-area-aware height, 44 px targets and Escape focus return.
- layout-chromium-1790480403699 and layout-webkit-1790480451043 pass 667x320 (100% and 130%), 844x390 (130%), and 915x412 (100%). Both player cards fit; all action targets scroll into an unobstructed viewport position.
- Actual Unity Chromium ending-chromium-1790480524882 passes capture/king/reduced-motion results and rematch dispatch. Final label/portrait fixture ending-chromium-1790480685796 passes; player-menu.png reviewed. These are desktop browser emulations with isolated data, not physical-device or server settlement proof. No push/deployment.

## September 26 Shadow Checkers room grain cost

- Accelerated Windows WebKit opening/overhead/reset passes: material-webkit-1790479907450. No real iPhone/Android test was performed.
- Reused the existing mipmapped oak photograph with independent room detail coordinates and wood-only masks. Both room meshes retain one submesh each; no new lights, renderers or texture assets.
- Chromium render-chromium-2-1790479862999: unchanged 758 draws/frame, 32.72 submissions/sec, 38.8 ms p95, zero >50 ms intervals. Landscape image reviewed. App 99,791,567 bytes is below 100 MB with only 208,433 bytes remaining. These are desktop-host measurements, not phone GPU/thermal proof. No push/deployment.

## September 26 Shadow Checkers moving candle sources

- Accelerated Windows WebKit opening/overhead/reset passes: material-webkit-1790479165576. Pause and reduced motion here are covered by the native optical diagnostic, not an actual iPhone lifecycle test.
- Synchronized source position with rendered flame lean/height. Native optical readback passes 45 samples; pause/reduced-motion clock behavior passes. This checks luminous-source alignment, not full room GI or shadows from every candle.
- Chromium render-chromium-2-1790479123546: unchanged 758 draws/frame, 32.37 submissions/sec, 38.8 ms p95 and zero intervals above 50 ms. App 99,553,088 bytes remains within the 100 MB budget. Desktop submission measurements do not establish physical-phone GPU or thermal performance. No push/deployment.

## September 26 Shadow Checkers charcoal lighting cost

- Natural charcoal/end-grain changes retain one renderer and the same 758 draws/frame. Chromium desktop profile render-chromium-2-1790478415965: 31.60 submissions/sec, 38.7 ms p95, zero >50 ms intervals. This measures submission timing, not GPU completion or phone thermal behavior.
- Accelerated Windows WebKit opening/overhead/reset passes: material-webkit-1790478487167. App 99,557,564 bytes stays within the unchanged 100 MB budget. Physical iPhone/Android validation remains open. No push/deployment.

## September 26 Shadow Checkers hearth material cost

- Added one shared dynamically lit stone renderer (8,149 vertices), 1K color and 512 px normal texture imports. App build 99,557,903 bytes; budget unchanged. Reviewed native stone close-up and actual Chromium seated render.
- render-chromium-2-1790477634119 measures 758 draws/frame (eight above previous), 31.35 submissions/sec, 38.5 ms p95, no intervals over 50 ms on desktop Intel Arc. material-webkit-1790477652339 passes opening, overhead and reset in accelerated Windows WebKit.
- These results do not prove physical-phone GPU/thermal/memory performance or photo-reference visual acceptance. No push/deployment.
## September 26 Shadow Checkers steep-angle controls

- Native camera previously stopped at 41.53 degrees despite increasing requested tilt. Constrained arc now reaches 65 degrees, with optical zoom at the height limit. 216 native poses and 1,200 picking checks pass.
- Browser camera regressions pass at 915x412 and 667x320, including continued tilt past the former plateau and responsive zoom: camera-chromium-1790476777529 and camera-webkit-1790476790688. Chromium uses actual CDP pinch; WebKit uses pointer drag and keyboard zoom. No new screenshot was needed.
- Lint/types/build pass. No production deployment. Physical phone/PWA input, sustained GPU/thermal behavior and audio remain unverified.
## September 26 Shadow Checkers left-side camera and flame lighting

- Camera UI checks pass in Chromium and accelerated Windows WebKit at 915x412 and 667x320: full-height gesture zone separated from the board, reset framing of all 64 squares and 44 px corner buttons. Chromium exercised actual two-finger CDP touch; WebKit exercised pointer drag and keyboard zoom because mobile wheel injection is unsupported. Evidence: camera-chromium-1790475719398, camera-webkit-1790475879928.
- Final synchronized-room-lighting build passes WebKit opening/overhead/reset (material-webkit-1790476189397). Chromium capture/kinging/pause passed before the final room-shader-only refinement (material-chromium-1790475895549). Final render-chromium-2-1790476172345: 30.71 WebGL submissions/sec, 750 draws/frame, 38.8 ms p95, no intervals above 50 ms on desktop Intel Arc.
- Native timing samples match candle/light and room-light uniforms and freeze on pause. App 98,861,661 bytes. These are desktop browser results, not physical iPhone/Android/PWA pinch, GPU, thermal or audio proof. No push/deployment.
## September 26 Shadow Checkers graphics recovery

- Forced actual WebGL context loss after a double capture. Verified failed iframe removal, disabled camera controls, Retry with unchanged pieces/latest move, completed presentation and working overhead framing. Chromium/Pixel 7 and accelerated Windows WebKit/iPhone 13 layouts pass with no page errors: resume-chromium-1790474301950 and resume-webkit-1790474342597.
- Seven lifecycle and thirteen host/bridge tests pass; app build 98,784,382 bytes, source/dist frame hash matched. No native player rebuild, push or deployment.
- Physical-phone memory pressure, OS process eviction, sustained GPU/thermal load and PWA audio remain **not verified**. The forced extension event tests graphics loss/retry, not every phone failure mode.

## September 26 Shadow Checkers cached-page recovery

- Fixed unconditional Unity/audio teardown on persisted pagehide. Cached pages now pause and request fresh host state on pageshow; final unload and delayed-start cleanup remain explicit. Five lifecycle unit tests and twelve host/bridge tests pass.
- scripts/shadow-checkers-resume-qa.mjs passes in Chromium/Pixel 7 and accelerated Windows WebKit/iPhone 13 layouts. Synthetic persisted events exercise the actual Unity player, and a capture works after real browser Back navigation. Evidence: resume-chromium-1790473870886 and resume-webkit-1790473906341. No page errors or extra screenshots.
- Both actual returns reloaded instead of using the back/forward cache. Physical iPhone/Android retained-cache restoration, OS sleep/process eviction, PWA audio and sustained GPU/thermal behavior remain **not verified**. No push/deployment.

## September 25 Shadow Checkers ASTC texture delivery

- All ten study texture imports use ASTC 6x6 with unchanged dimensions/mips. Theoretical texture storage is 6,925,520 bytes, versus 61,865,976 bytes as RGBA32; excludes render targets and is not measured physical allocation. Audit: `output/shadow-checkers-unity/astc-textures.json`.
- Desktop Chromium and accelerated Windows WebKit do not expose ASTC; both pass the fallback path's entrance/overhead/reset, capture, kinging and pause/resume (`material-chromium-1790323442121`, `material-webkit-1790323542807`). Chromium visual reviewed. Runtime profile now records extension support and actual texture-upload formats; this host used RGBA8/sRGB8-alpha storage, with 30.61 submissions/sec and 33.4 ms p95 (`render-chromium-2-1790323635871`).
- Physical iPhone/Android gate remains **not run**: verify actual ASTC capability and native ASTC texture uploads, inspect fire/map/book/marble quality, then record sustained play, background/foreground recovery, GPU memory if available and thermal behavior. Browser device presets do not provide this evidence. Build 10,474,272 bytes; app 94.16 MiB, checks/hashes pass. Local preview only; no push/deployment.

## September 25 Shadow Checkers seated view and raised-piece picking

- Lowered final perspective camera and fixed a reproduced tap error where the visible top of a far-side piece projected off the board. Native production-picker checks cover 192 normal/king hits and 768 empty destinations, both player orientations, three landscape aspects and reset/left/right/overhead modes. All 960 pass (`output/shadow-checkers-unity/pointer-checks.json`).
- Real Unity browser fixtures pass opening, overhead/reset, touch-driven double capture, kinging and pause/resume in Chromium/Pixel 7 and accelerated Windows WebKit/iPhone 13 at 915 x 412. Zero page errors. Evidence: `material-chromium-1790319324571` and `material-webkit-1790319423884` under `output/playwright/shadow-checkers-unity/`.
- Unity 11,679,671 bytes; app 95.31 MiB; lint, TypeScript, build and four source/dist hashes pass. These tests do not establish physical-thumb accuracy, iPhone audio/PWA behavior or sustained phone GPU/thermal performance. No push/deployment; final reference-photo fidelity remains open.
## September 25 Shadow Checkers final-capture/result timing

- `scripts/shadow-checkers-ending-qa.mjs` passed in Chromium/Pixel 7 and accelerated Windows WebKit/iPhone 13 at 844 x 390: final double capture, final capture-to-king, paused presentation, reduced motion, result dismissal and exact-match rematch dispatch. These fixtures use the production screen, real Unity player and engine, with only auth/data transport isolated. They never change ranked server statistics.
- Evidence: `ending-chromium-1790313850126` and `ending-webkit-1790313914230` under `output/playwright/shadow-checkers-unity/`. Winning results remained absent throughout the deliberate pause and appeared only after Unity's matching `presented` event. Final capture/landing/crown sound events preceded acknowledgement. The reduced-motion fixture completed without waiting for normal animation duration.
- Eighteen screen/host tests, lint, application TypeScript and app build passed. Unity build: 11,696,620 bytes. App: 95.36 MiB within unchanged budget; all source/dist player hashes match. Landscape picker fixture passed again (`layout-chromium-1790313819195`). Foreground preview updated to `ending-presentation-20260925`.
- No push/deployment. Windows browser emulation does not establish physical-phone PWA, audio/thermal/GPU behavior, server ranked continuation or final photo-reference fidelity.

## September 25 Shadow Checkers landscape dialog validation

- Real production screen/Comfort provider with isolated auth, match data, action dispatch and Unity frame: 667 x 320 at 100%/130% text, 844 x 390 at 130%, and 915 x 412 at 100%, Chromium and Windows WebKit. All picker controls and result totals fit; eight character choices and confirmation remain tappable; create/dismiss/rematch dispatch checks pass. Original 440px character dialog prevented confirmation on the smallest profile.
- Evidence under `output/playwright/shadow-checkers-unity/`: baseline `layout-chromium-1790313254309` (failed confirmation), final `layout-chromium-1790313535525` and `layout-webkit-1790313478395`. Focused result screenshots reviewed before/after the opacity and artwork-cropping correction. No unnecessary scene screenshots.
- Lint, application TypeScript, 12 existing screen tests, documentation integrity (237 files) and app build passed. Payload is 95.36 MiB within the unchanged 100,000,000-byte budget.
- This is browser layout/dispatch evidence only: it mocks the Unity frame and data hooks, creates no real matches, and does not establish physical-phone safe areas, keyboard/PWA behavior, ranked continuation or 3D performance. Native player unchanged; no push/deployment.

## September 25 Shadow Checkers rounded library player

- Updated library models preserve the original shared atlas, add curved spines/raised bands and horizontal stacks, and correct shelf/pillar contact. Native close-up reviewed; affected mesh vertex count is slightly lower overall.
- Finished player passed Chromium/Pixel 7 and accelerated Windows WebKit/iPhone 13 landscape fixtures: opening, all squares framed overhead, reset, double capture, kinging and pause/resume; no page errors. Evidence: `material-chromium-1790312673072` and `material-webkit-1790312612419` under `output/playwright/shadow-checkers-unity/`.
- Unity build 11,695,252 bytes; packaged app 95.35 MiB within the unchanged budget. All four source/dist player hashes match; lint and TypeScript passed. Foreground preview uses `rounded-library-20260925`. Physical-phone visuals/performance, PWA/audio and final reference fidelity remain unverified. No push/deployment.

- Isolated accelerated-WebKit render probe measured 30.83 submissions/second, 32 ms median / 34 ms p95, zero intervals over 50 ms and 654 draws/frame (`render-webkit-2-1790312858695`). A competing foreground Unity preview lowered the earlier sample to 21.45; releasing that additional renderer recovered the target cadence. The foreground preview was restored afterward. Keep active-renderer conditions explicit in comparisons.

## September 25 Shadow Checkers Windows WebKit compositor comparison

- Earlier roughly 10 FPS runs used Playwright 1.61.1's Windows `--disable-accelerated-compositing` flag. Default Unity-loop CPU median was 9 ms; bypassing draws still yielded 9.82 attempted frames/second. A real tap did not change the result.
- Removing only that flag using `node scripts/shadow-checkers-render-profile.mjs --webkit --accelerated` yielded 30.97 submitted frames/second; an independent visual run yielded 30.98, 32 ms median / 34 ms p95, zero intervals over 50 ms, unchanged 1830 x 640 canvas and 654 draws/frame. Evidence: `render-webkit-2-1790311410123` and `render-webkit-2-1790311476233` under `output/playwright/shadow-checkers-unity/`. Actual image reviewed.
- Accelerated WebKit opening, overhead, reset, paused double capture and paused kinging passed without page errors: `material-webkit-1790311513960`. Production player is unchanged; the comparison is opt-in and no global browser defaults were modified.
- This isolates a Windows test-port compositor limitation. Neither configuration proves physical-phone GPU/frame rate, thermal, PWA or audio behavior. The Windows port's "Apple GPU" string is not actual iPhone hardware. No push/deployment.

## September 25 Shadow Checkers render submissions and combined board

- Measured actual WebGL draw submissions with `scripts/shadow-checkers-render-profile.mjs`, separately from browser animation callbacks. Baseline WebKit at DPR 2: 970 draws/frame, 9.57 submissions/second (`render-webkit-2-1790308935809`). DPR 1.5: 9.95 submissions/second (`render-webkit-1.5-1790308967886`), insufficient benefit to justify lowering detail.
- Combined board and instanced materials: 654 draws/frame at unchanged 1830 x 640 resolution, 9.87 submissions/second, 102 ms median and 110 ms p95 (`render-webkit-2-1790309810227`). The 32.6% reduction in drawing work does not establish a meaningful WebKit FPS improvement. Actual image reviewed; no loss of bevels, material cuts, shadows or reflections observed.
- Final isolated Chromium submission probe (`render-chromium-2-1790310133276`): 654 draws/frame, 29.997 submissions/second, 33.3 ms median, 33.4 ms p95, zero sampled submission intervals above 50 ms. Sampling lasted eight seconds; it is not a sustained thermal or physical-device test.
- Final Chromium and WebKit fixtures passed opening/overhead/reset, paused double capture and paused crowning, correct resumed turn and no page errors: `material-chromium-1790309861017`, `material-webkit-1790309969419`. Final native WebGL build is 11,653,520 bytes; app build 95.31 MiB. Lint, TypeScript and four source/dist player hashes pass.
- The measurements are desktop submission cadence, not GPU completion timing, physical iPhone/Android sustained performance or installed-PWA acceptance. Production resolution remains at DPR cap 2. No push or deployment. Real-device performance and remaining feature-parity validation are still open.

## September 24 Shadow Checkers continuous entrance, overhead and pause

- Final local player passed headed Chromium/Pixel 7 and WebKit/iPhone 13 landscape fixtures: opening, all 64 squares framed overhead, reset, double capture and kinging. Both engines pause during capture/kinging, hold the busy lock without new landing/sound/ready events, then resume to the correct turn. Overhead screenshots were reviewed; the ceiling no longer blacks out the board.
- Evidence: `material-chromium-1790308376214` and `material-webkit-1790308457332` under `output/playwright/shadow-checkers-unity/`. Native live-transform pause probe passed 17 checks in `output/shadow-checkers-unity/presentation-pause.json`. A separate rendered engraving probe confirmed zero visible glyph pixels through its opaque blocker (`engraving-depth.json`).
- Native WebGL build: 11,630,668 bytes. App: 95.29 MiB within the unchanged budget. Lint, TypeScript, 21 targeted tests, audio lifecycle checks and source/dist payload hashes passed.
- `tour-audio-1790308597884` verifies a 12.119-second entrance, original two-minute music decoding/looping at 0.11 gain, and Play/Mute. Sampled recording review confirms window-side entry, full wall map, room sweep and final board framing.
- Desktop browser animation cadence remains distinct from Unity FPS and real-phone performance. Chromium: 11.1 ms median, 11.2 ms p95, zero of 239 samples above 50 ms. Windows WebKit: 74 ms median, 92 ms p95, 120 of 239 above 50 ms. Its functional tests pass, but this is not smooth-iPhone evidence. Physical-device GPU/thermal/PWA/audio acceptance and final reference-level realism remain open. No push or deployment.

## September 24 Shadow Checkers foreground detail and audio

- Final local Unity data `3dc46534323192524d2f842d098648dd.data.unityweb` passed actual canvas touch opening, double capture and kinging fixtures in headed Android/Chromium and iPhone/WebKit emulation, without page errors. WebKit landscape render reviewed. Evidence: `material-chromium-1790306016932` and `material-webkit-1790305877481` under `output/playwright/shadow-checkers-unity/`.
- Actual Chromium playback verified the original two-minute soundtrack's smaller stereo delivery file, quiet 0.11 gain, loop, Play/Mute and a 9.12-second room pan (`tour-audio-1790306096757`). Prior contact/fire playback checks remain applicable; the sound behavior was unchanged by this prop pass.
- Final app payload is 95.24 MiB within the unchanged build budget; source/dist Unity and music hashes match. This is local validation, not a production deploy or physical-phone PWA/audio/thermal/performance claim.
- Browser animation cadence is diagnostic, not Unity frame rate. Chromium's 239 samples had a 11.2 ms p95 and none above 50 ms. Windows WebKit's first sample was uneven during the app build; its follow-up without that build (`material-webkit-1790306148112`) remained uneven: 72 ms median, 90 ms p95, 120/239 above 50 ms. Gameplay still passed. Do not claim smooth iPhone performance from these results; native-device profiling and presentation pause/resume validation remain open.

## September 24 Shadow Checkers hosted WebKit

- Current production passed headed WebKit/iPhone 13 emulation: both players' canvas touches persisted moves, realtime turns and match chat updated, portrait-to-landscape containment and camera controls worked. Exact test-session cleanup passed; no screenshots.
- Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1790296822651/summary.json`. Canonical QA now handles late release notes, foreground settling and closed-page diagnostic capture. Actual iPhone/Android sound, thermal performance and installed-PWA behavior remain unverified.
## September 24 Shadow Runner Foundry and Lock local routes

- Foundry east local runner-foundry-east-local-2026-09-25T03-21-45-585Z passes Chromium932x430 and WebKit740x390 at12HP/three lives. Its135 sampled Arcade cases validate supported fresh-calm offsets and jump timing, not full-level completion.
- Lock local runner-lock-local-2026-09-25T03-43-33-631Z passes both engines on runtime D5XrMwCL / Games CJHjhsgw. All11steps finish, Warden/archer defeated, checkpoint activated, three lives and zero page errors. Android minimum5HP heals naturally to12HP at the checkpoint; WebKit remains12HP. Final WebKit screenshot reviewed.
- Setup injects only Lock placement18980/616. No forced guard deaths, restored health or granted powers. Normal controls drive all later actions; browser-emulated keyboard input is not physical-phone touch proof. Remote requests/WebSockets blocked, no external data created. This does not close any full-route, mastery or boss acceptance cell.
-54 actual-Arcade arrow cases and386Node checks pass, with lint/typecheck/build at92.68MiB. Full Jest passes300suites/2,604tests with16existing auth TODOs. Full normal runner-lock-defense-route-20260924-02 is terminal: WebKit194steps/five Flames reaches Sovereign Last Light at2/24HP before exhausting lives; Chromium20steps stalls healthy under gap04. Both report zero page errors and matching hashes. Neither is accepted completion. Replay01 was cancelled before completion for the retry-adapter correction; six verified task-owned processes terminated and absence verified.
- Actual-Arcade reproduces the gap04 underside hit atx3608. A20px earlier input takeoff passes45sampled cases and both local engines in runner-prism-entry-local-2026-09-25T03-58-17-024Z at12HP/three lives. Explicit setup placement3500/616 and prior Lancer clearance; no geometry/health/power alteration. Screenshot reviewed.202focused Jest,386Node and lint pass after that policy change. Full replay, boss victory/ending, mastery and physical-device checks remain open. No push, deploy or backend mutation.

## September 24 Shadow Runner Relay crawl cover

- Pre-fix local runner-crawl-ascent-local-2026-09-25T03-00-04-808Z survived but finished Chromium6HP/WebKit3HP after repeated covered-passage orb damage. Installed Arcade regressions reproduced close-muzzle roof escape at 30/60/120fps.
- Post-fix runner-crawl-ascent-local-2026-09-25T03-08-49-393Z passes both phone viewports on runtime BCEXLdJE / Games Cu5aidEp. Both retain 12HP while covered, defeat caster/lancer, keep three lives, finish at8/12HP and report no page errors. Exposed exit/combat damage remains. Screenshot reviewed.
- The local setup logs placement21704/616 and the preceding Rival's defeat, not powers, restore or completion. No external data created. This is not full-route or physical-device proof. Full normal runner-relay-cover-route-20260924-01 is terminal, with zero page errors and matching hashes. Chromium162steps/four Flames activates Crown and naturally recovers there, then exhausts lives in Lock's arrow corridor. WebKit53steps/12HP/three lives stalls at Foundry's east wind anchor; fresh calm at x7525/7527 misses the7516target's8px tolerance. Neither reaches the revised crawl in its full attempt; mastery/boss/ending/release remain open.
- Normal and mastery route checkpoint targets now pass their actual activation line; game trigger positions are unchanged. Eight new projectile regressions plus full Jest300suites/2,581tests pass (16existingTODOs), final379Node checks and lint/typecheck/build pass at92.68MiB. No push.

## September 24 Shadow Runner supported fire

- Frozen runtime D3EwwbQ8 / Games Dk5xkFzQ. runner-impact-systems-20260924-02 passes 50 QA-assisted systems checks across Chromium 932x430 and WebKit 740x390. Both storm damage rectangles are exactly y590-616, above the y616 road. Reviewed fresh images show the fire at road height. The command used --skip-physics; this is not route or physical-phone acceptance.
- Probe01 failed: an existing remote pooled fire satisfied the old wait while the preceding Sunsteel attack could destroy the new grenade. The smoke now waits for attack completion and a visible target-location fire. Target bounds remain strict; failed evidence retained. External requests blocked, no remote data created.
- Fresh runner-late-ascent-local-2026-09-25T02-54-14-036Z passes both engines on the same build, full health/three lives, checkpoint active and zero page errors. Local setup placement/prior enemy clearance remain explicit. Screenshots reviewed/shared.
- Actual-engine impact/tilt tests cover fast hits at 30/60/120fps, non-floor contacts, crouched overlap, moving supports, expiry and pooling. Full Jest 299 suites / 2,573 tests passes with 16 existing auth TODOs; 377 Node, lint, TypeScript and build pass. Full-route, creative/finale, mastery, real-device and deployment gates remain open. No push.

## September 24 Shadow Runner late Ascent

- Frozen runtime CfymhNKG / Games gNhltiKh. Local runner-late-ascent-local-2026-09-25T02-21-10-764Z passes932x430Chromium and740x390WebKit: five steps, minimum/final12HP, three lives, last checkpoint active, both nearby threats alive, zero page errors. Screenshots reviewed and shared. Browser sizing/keyboard inputs are not physical-phone multitouch evidence.
- Setup explicitly places the runner at22596/616 and defeats the preceding caster/lancer. No restore, power grant, clock override or hazard disabling; remote traffic blocked and no external data created.
- Earlier probes retained real failures: grenade/wind waits stalled, standing checkpoint alignment drifted backward, and a12px positional tolerance stopped short of the actual checkpoint trigger. The final route removes the second wait, braces through the exit, and targets23064for activation. Assertions remain strict.
-225sampled real-Arcade geometry/wind cases pass independently.377Node checks and production build pass. Full regression passes298Jest suites/2564tests with16existing auth TODOs, lint, app TypeScript, docs integrity175 and diff-check. Unassisted runner-late-ascent-drop-route-20260924-01 is terminal: both engines exhaust natural lives before this crossing, with zero page errors/matching hashes. Android172steps/four Flames ends during crawl06; WebKit152steps/three Flames ends during Crown retries. Checkpoint/resource preservation works, but ordinary victory is not accepted. Some storm impact bodies below their contacted surface require follow-up validation. Campaign/mastery/finale/device/release acceptance remains open; no push/backend mutation.

## September 24 Shadow Runner Crown to Lock

- Frozen runtime CuWoSaKx / Games BenChcKr. Local runner-crown-local-2026-09-25T01-26-07-655Z passes932x430Chromium and740x390WebKit: both guards defeated, Flame4/Aether naturally acquired after setup, ten steps, three lives, Android9HP/WebKit8HP, no page errors.
- Initial failures are retained. The01-11-19Android trace cleared combat/Flame4 but died at the exit; authored Lock arrows overlapped Crown. After shortening only those lifetimes,01-22-24Android passed while WebKit's driver repeated an already-collected Flame.01-24-14WebKit passed while Android's waiting anchor conflicted with its jump boundary. Guarded grounded pickup confirmation and the safe18536anchor fix these driver defects; no assertions or finite-life checks were removed.
- Setup explicitly logs three prerequisite-objective placements, one pre-input restore, prior-drone clearance and initial Crown placement. It can acquire earlier powers during setup. These local passes must not be described as unassisted normal campaign proof. Remote traffic is blocked; no external data created. Screenshots reviewed and shared.
- Final regression passes298Jest suites/2547tests (16existing auth TODOs),374Node checks, lint, app TypeScript, build, docs integrity175 and diff-check. The physics includes90real Arcade beam/approach cases plus nine safe-anchor jump cases. Production build remains467files/92.68MiB. Campaign/mastery/finale and physical-device gates remain open. No push or backend change.
- Full real-input runner-crown-exit-route-20260924-01 is terminal: Android177/WebKit178completed steps include naturally earned five Flames and refuge crossing, not victory. Both stop at gap-23-step. Android exhausts lives after earlier Crown/Lock losses; WebKit dies there once, recovers at Lock, then stalls with1HP/two lives. No page errors, no gameplay setup/restore/forced kills. Recovery preserves consumed powers/dead enemies and naturally exercises the earned-Flame skip. Last wind-exposed jump/approach and later boss/ending remain unproven.

## September 24 Shadow Runner movement baseline

- Frozen runtime Dj4VLLIi / Games uXUgEAQo includes frame-independent held-input movement. Local932x430Chromium and740x390WebKit Ascent replay runner-ascent-local-2026-09-25T00-35-50-743Z passes with12HP/3lives, natural Aether pickup and no page errors.
- Foundry local runner-foundry-local-2026-09-25T00-34-23-817Z crosses in both engines. Chromium defeats both guards and reaches Gearwing checkpoint; WebKit loses a life fighting the lancer. Survival is not accepted. No gameplay assertions were relaxed to turn that failure green.
- Removed mid-route screenshot capture: its observation delay let wind push the runner off a small ledge during the automated input pause. Terminal screenshots remain. Prior Foundry/checkpoint and Ascent/refuge images were reviewed and shown to Tayler.
- Local setup logs a single placement and one cleared prior enemy; all subsequent actions use real controls. Remote requests remain blocked. This is not a full normal/mastery playthrough or physical-device performance/control proof.

- Full normal runner-movement-opening-20260924-01 passes tutorial and East Gate on both engines, with zero deaths/page errors and matching runtime hashes. Tutorial collected4/4coins and1/1enemy; East Gate collected4/10coins and2/2enemies. This proves ordinary completion, not East Gate mastery or physical multi-touch.
- FullLevel10 runner-movement-relay-20260924-01 is terminal and failed in both engines. Android reaches Crown/Flame4 after two Foundry respawns; WebKit clears Foundry without dying, reaches Lock, then exhausts lives on Crown retries. Both have matching frozen hashes, zero page errors and preserved spent powers/earned progress. Traces show Crown jumps during active high beams and Lock descent damage; no finale completion is claimed. All browser runs are closed; the task-owned preview remains available.

## September 24 Shadow Runner Ascent refuge

- Frozen runtime BvWWij5K / Games B3gqxZbo. Full normal checkpoint replay runner-ascent-refuge-20260924-01 failed before Ascent in Foundry on both engines. Zero page errors; no full-route acceptance.
- Local diagnostic runner-ascent-local-2026-09-25T00-03-58-662Z passes932x430Chromium and740x390WebKit: two real-input jumps, supported crouched wind waits, natural Aether pickup, unchanged12HP/3lives. Reviewed both refuge images; custom masonry matches the collision deck. Screenshots shown to Tayler alongside the earlier gameplay and ending captures.
- Setup explicitly teleports once and defeats only the prior Rival; no health restoration, power grant, hazard disabling or clock reset. Remote requests/sockets blocked, no external test data created. This is focused crossing proof, not full gameplay or physical-device evidence.
- Earlier Android runs failed: first blew back off an edge landing, second waited unnecessarily under incoming fire after acquiring Aether. The policy now targets21992on the far floor and confirms the pickup immediately while bracing.405actual-policy Arcade cases cover80-180msobservations, three FPS values, nine arrival phases and offsets+/-8px.

## September 24 Shadow Runner world ignition and ending

- `output/playwright/runner-world-ignition-20260924-03` passes50checks on740x390WebKit and932x430Chromium, with each ending scene also checked at568x320. Reviewed ready/igniting and cinematic screenshots: no stale boss warning, readable captions/actions, existing custom flame visible.
- Actual controls verify held attack cannot ignite on arrival or repeat after pause/resume, crouched arrival stands on delivery, paused ignition freezes time and score, completion awards once, four scenes advance in order, and replay/skip returns to results. Reduced motion and teardown fences have focused unit coverage.
- QA-assisted location/objective/boss setup is explicitly separate from actual delivery inputs. This is not a full campaign playthrough or physical iPhone/Android installed-PWA, audio, thermal or thumb-ergonomics proof. No remote test data created.
- Frozen build Cn4wBTsm / DdIks5Uj. Run02 failed on the harness's incorrect top-level crouch field, corrected to player.crouching for run03. Full-route and final release acceptance remain open; no rebuild deployed.

## September 21 Shadow Circuit directional terrain polish

- Audited normalized top/bottom terrain across all 149 original levels: no missing model mappings. Fixed reverse-facing chevrons on all four force-floor models (4,098 tiles in 62 levels); random force now advertises four directions (111 tiles in 7 levels).
- Rebuilt the teleporter as a cyan circular pad, distinct from the blue square-spiral exit, following bitmap 308 in the supplied original executable. The exit repeats its spiral on the floor and rear face for free-camera visibility. No original level layouts or force movement rules changed.
- Basic checks: 122 game tests including exported arrow geometry versus simulation, thin-wall/corner-ice collision orientation, and portal silhouette/color; source GLB validation; lint, app TypeScript and build. Browser evidence: output/playwright/shadow-circuit-terrain. Campaign report: output/shadow-circuit/terrain-audit/report.json. Physical-device feel and all-level solutions remain user testing; no full campaign certification is claimed.

## September 21 Shadow Circuit camera gestures

- Passed desktop/Android Chromium (including headed), narrow 667x375, large controls/130% text, and iPhone WebKit. WebKit software rendering triggered the existing frame-stall pause; intentional resume was verified. This is not a sustained-performance pass.
- Targeted browser coverage: continuous drag, pointer capture beyond the half-screen boundary, tilt bounds, independent movement/pinch input, cancellation, left-handed swap and portrait/pause cleanup. Chromium uses browser-injected multi-touch; Windows WebKit pinch coverage uses synthetic PointerEvents because its runner lacks multi-touch injection. Neither is physical-device proof.
- Header checks cover desktop, 844x390 phone landscape, narrow landscape and 130% text/large touch controls. Evidence: output/playwright/shadow-circuit-gestures and output/shadow-circuit/gesture-*. No remote messages or uploaded test media are created by this game-only harness.

## September 20 Shadow Circuit reference-polish mobile pass

- Reviewed actual Android/Chromium and iPhone/WebKit 844x390 rendering, 390x844 branded rotation gate, original Lesson 1 and Lesson 3. Full-surface movement pad, independent camera D-pad/zoom, compact HUD and raised controls replace the earlier small arrows/flat panels.
- Browser checks cover all 61 model downloads, 149 original levels, countdown input/timer gating, interrupted introduction, skip-to-countdown, continuous cardinal steering without lifting, camera tilt/turn/zoom/reset, progression/passwords and pause/resume. Reduced-motion and larger-touch layouts have dedicated checks.
- Original Lesson 1 clears through 96 actual D-pad touches in both engines (11 chips, eight locks, retained green key). Three authored fixture solutions and zero WebGL resources after exit pass in WebKit and full Chromium. Packaged headless-shell still intermittently stalls; full Chromium is used for final browser proof.
- Actual CHIP01/CHIP02 recording playback/looping, switching and pause pass in Chromium. Windows WebKit has no Web Audio API. Emulation is not physical-device installed-PWA rotation, audio, safe-area, thermal or real-thumb ergonomics proof.
- Evidence: output/playwright/shadow-circuit-polish, original, and timestamped game smoke reports. Headed authenticated host smoke passed with cleanup verified (no created messages/media retained).

## September 20 Shadow Circuit test build

- Local Android/Chromium and iPhone/WebKit emulation at 844x390 passes menu/touch play, pause/reload, locked levels/password persistence and portrait gate at 390x844. Screens: `output/playwright/shadow-circuit-branding/` and `output/playwright/shadow-circuit-progression/`.
- Chromium audio gesture/mute/pause checks pass. This Windows WebKit has no Web Audio API, so iPhone audio is unverified. Native orientation lock is best-effort with a blocking portrait gate where unsupported.
- Not physical-device proof: installed PWA safe areas, landscape lock, audio, background/foreground and thermal performance remain pending.

# Mobile PWA QA Log

## September 30 shared gesture and native follow-up

Shared swipe/viewport and bottom-scroll ownership fixes passed focused tests
and six probes each across Chromium/WebKit. Probes used actual shared hooks;
WebKit synthetic swipe/keyboard-scroll evidence does not certify physical
touch or UIKeyboard animation. General/DM/Pins native video-paste staging
passed client tests. Tayler confirms native build 16 removes the accessory
toolbar, while PWA variants do not. See
[build 17 evidence](../features/mobile-stability-build17-2026-09-30.md) and
[physical follow-up](real-device-mobile-validation.md).

## September 13 Shadow Checkers Unity landscape checkpoint

- Local candidate only. Android/Chromium and headed iPhone/WebKit emulation passed portrait gate to landscape, actual Unity touch moves for both players, authoritative persistence, realtime turn update, temporary chat and camera controls. Created test matches were removed; no ranked game was completed.
- Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1789330477633/summary.json` and `multiplayer-1789330714568/summary.json`. Reviewed current WebKit screenshots show the scene; an earlier build's black capture is historical, with exact cause unisolated.
- Actual Unity fixture footage covers room reveal, double capture and kinging: `cinematics-1789330399443`. Shared reduced-motion support is implemented; physical-device thermal/frame-rate, installed-PWA lifecycle and rotation policy proof remain open.
- Reference-level room realism remains an active art milestone. No release, push or deploy performed.

## Documentation Status - July 10, 2026

Older artifact paths remain historical evidence. The July 10 web Release A is
deployed, but its mobile/PWA-sensitive behavior still needs a fresh harness
artifact and physical-device pass.

Last updated: 2026-07-18

## July 18 Catch-Up Persistence And Full-Card Dissolve Checkpoint

- Production inspection proved exact read state was durable: recently cleared
  rows were absent from the unread window and their dedupe keys had not
  reappeared. The misleading repeated `30` came from a much larger historical
  unread backlog continuously refilling the capped working page.
- Catch-Up now reports the full unread total, keeps its visible page bounded,
  and provides an authenticated `Mark all read` transaction for the entire
  notification ledger. Individual opens and swipes invalidate the cached
  Catch-Up snapshot only after Supabase confirms the read.
- A one-time July 18 America/New_York baseline marks pre-today notification
  ledger rows read for all users without changing canonical message, Pin, game,
  or Live source state. It is intentionally not a recurring daily clear.
- A failed local retry outside the first 30 rows is retained until an exact
  canonical unread lookup says it is no longer pending.
- Swipe geometry compensates only near the phone's left edge so a gesture that
  begins partway across the card can still travel the complete card width.
  Reversing the finger reverses the card continuously instead of hitting a
  three-quarter stop.
- Full Comfort motion now rasterizes the actual rendered notification and
  turns its own background, PFP, text, and controls into thousands of
  original-color Canvas 2D grains. A noisy left-to-right erosion front and
  leftward wind field produce the visible sand-away sequence. The remaining
  list slides up only after the complete confirmed-read animation.
  Reduced/no-motion modes retain the same persistence contract without capture
  or particles, and CSS fracture is retained only as a capture-failure fallback.
- `qa:catch-up` remains the zero-mutation Pixel Chromium/iPhone WebKit gesture,
  geometry, animation, reload, and diagnostics gate.
  `qa:catch-up:persistence` is the separate guarded linked-backend proof: it
  creates one exact controlled event, reads it through the authenticated RPC,
  verifies a fresh unread query cannot see it, and deletes and verifies the
  fixture.

## July 17 Durable Notification Swipe Checkpoint

- Notification swipe-to-read now queues the exact event ID locally before the
  server call, waits for a confirmed Supabase acknowledgement before removing
  the card, restores the card on failure, and replays interrupted reads before
  the next inbox fetch. This closes the view-switch, reload, and PWA-restart
  return path.
- Gesture arbitration uses a small neutral zone instead of cancelling on the
  first imperfect phone sample. Clear left intent claims the card and locks
  vertical movement only inside the Catch-Up scroller; later downward finger
  drift cannot steal it, while clear vertical-first movement stays native.
- Physical-phone follow-up moved finger input from React pointer arbitration to
  a native non-passive touch lifecycle. Chromium QA now injects a real CDP touch
  stream; WebKit verifies the same native handler contract synthetically, with
  installed-iPhone PWA feel retained as the final acceptance gate.
- Full motion now uses a deterministic 28-piece fracture-and-ash sequence plus
  a brighter fracture band before the remaining cards slide up. Reduced motion
  uses a short fade and no-motion removes immediately, both only after server
  confirmation.
- The focused Catch-Up component/API suites passed 21 tests. The full Jest gate
  passed 235 suites and 1,292 tests with 16 existing todos; ESLint, TypeScript,
  the production build, paused-feature verification, and build budgets passed.
- A controlled notification response and read RPC were intercepted in-browser,
  so no backend rows changed. Pixel Chromium and iPhone WebKit both proved the
  lock/release cycle, all 28 fragments, one confirmed acknowledgement, empty
  retry ledger after success, no return after reload, zero horizontal overflow,
  and clean runtime diagnostics. Evidence:
  `output/playwright/catch-up/summary.json`.

## July 17 Destination Badges, Catch-Up Motion, And Discover Page Checkpoint

- Catch-Up notification cards now track the finger across the measured card
  width, accept deliberate distance or fast-flick intent, dissolve with a
  restrained gold-particle finish, and reflow the remaining list. Comfort
  reduced/no-motion modes keep the read action without decorative motion.
- Play unread state now drills from the bottom badge to Shado Live or Shadow
  Checkers, then to the exact room or match. ShadowPin drills from the bottom
  badge to Discover, category, exact Pin, and separate post/discussion state.
  Exact destination loads clear only their represented event IDs.
- Universal Discover is now the first-class `?view=discover` page. It uses the
  standard themed backdrop and leaves the phone bottom menu visible instead of
  mounting a modal portal.
- The focused notification/Play/Pins/Discover regression set passed 13 suites
  and 134 tests. The full Jest gate passed 235 suites and 1,282 tests with 16
  existing todos. ESLint, TypeScript, production build/budgets, documentation
  integrity, all 43 Node contracts, clean local migration replay, local/linked
  database lint, and the local security contract passed.
- The authenticated Pixel Chromium and iPhone WebKit Universal Discover gate
  passed standard-surface, routed-page, persistent-menu, result, Library,
  diagnostics, and overflow checks. The authenticated read-only Catch-Up gate
  passed both engines with zero acknowledgements or test residue. Evidence:
  `output/playwright/wave2-candidate1-discovery/summary.json` and
  `output/playwright/catch-up/summary.json`.

## July 17 Notification Center PFP And Swipe Checkpoint

- Notification-inbox events now resolve `actor_id` through the current
  API-safe public-profile relationship, so user-originated cards use current
  PFPs and clickable canonical profile actions; system events retain initials.
- Phone cards support swipe-left mark-as-read without opening the source.
  Vertical movement remains native scrolling, short horizontal gestures snap
  back, and the revealed Read button provides a keyboard-accessible equivalent.
- ShadowPin Creator Studio and its SQL contract explicitly accept a blank tag
  list; the phone field now says `Tags (optional)`.
- Focused component/API/model/SQL suites passed 28 tests. The full Jest gate
  passed 233 suites and 1,271 tests with 16 existing todos. ESLint, TypeScript,
  production build/budgets, documentation integrity, and all 43 Node contract
  tests passed.
- The authenticated read-only Catch-Up browser gate passed the same production
  build in Pixel Chromium and iPhone WebKit with no horizontal overflow,
  runtime diagnostics, acknowledgements, fixtures, uploads, or database
  residue. Evidence: `output/playwright/catch-up/summary.json`.

## July 16 Shado Live And DM Production Hotfix Checkpoint

- The deterministic real Shado Live browser verifier passed the fresh
  production build across its Pixel Chromium and iPhone WebKit host/listener
  flows. Evidence: `output/playwright/shado-live-real/summary.json`.
- A fresh, non-reused production preview at `http://127.0.0.1:4176` passed the
  authenticated DM smoke. Evidence:
  `output/playwright/dm-read-position-hotfix/summary.json`.
- Jest covers Live structured server errors, null/stale room recovery, host
  resume, host composer focus during reconnect, global access migration, and
  cursor-bounded DM auto-advance. The full gate passed 228 suites and 1,235
  tests with 16 existing todos.
- ESLint, app TypeScript, production build, paused-feature verification, bundle
  budgets, the 28-function manifest, and the linked migration dry run passed.
- Installed iPhone/Android microphone, keyboard, weak-network reconnect, and DM
  reopen behavior remain the physical-device acceptance check after deploy.

## July 15 Final Acceptance Automated Checkpoint

- Stable isolated deploy `6a5811bc762e6e6704058ca3` passed authenticated
  settings smoke plus `qa:final-acceptance-mobile` on Android Chromium and
  iPhone WebKit.
- The dedicated gate opened Active Users, Weather, presence-notification
  settings, and launcher-badge settings; it asserted zero horizontal overflow,
  exactly five visible in-bounds bottom-nav controls, and zero page errors.
- Active Users and Weather retained the obsidian-and-gold phone layout across
  `412x839` and `390x844` viewports. Presence settings expose independent
  in-app/push toggles and Everyone/Connections scope. Badge settings expose the
  five approved categories, a 99 display cap, and read-driven clearing copy.
- Linked Supabase proof reports no pending migrations or database-lint warnings;
  the security-definer contract and 24-function health manifest pass, and
  `send-push` v41 is active.
- These checks created no messages, notification events, database rows, or
  Storage objects. Evidence:
  `output/playwright/final-acceptance-6a5811bc-mobile/summary.json`.
- Production `main` remains unchanged. Installed iPhone/Android PWA permission,
  foreground/background push split, notification-center clearing, launcher
  badge, GPS, radar gestures, and real notification arrival remain physical-
  device acceptance items.

## July 13 Wave Three Inner Circles Automated Checkpoint

- Immutable isolated deploy `6a55892252f0d306fae5b852` passed the complete
  two-account Pixel Chromium/iPhone WebKit verifier. Stable isolated deploy
  `6a558acc257a6d21fa379fa2` serves byte-identical HTML and all 12 boot assets;
  a fresh stable iPhone WebKit session opened Connections and switched to
  Circles on the canonical route.
- The run covered People/Circles/detail/Back routing, create/rename/delete,
  atomic accepted-only member rejection, picker add/remove/re-add, private
  circle Pin filtering, empty state, universal Search, Theater, comments, and
  route restoration.
- Hub, editor, picker, feed, Theater, and comments remained inside Pixel
  `412x839` and iPhone `390x664` viewports, including compressed keyboard
  heights, with no horizontal overflow.
- Pixel Chromium and iPhone WebKit reported zero console, page, request, or
  HTTP errors. Exact cleanup restored Circle/member and feed-preference
  snapshots and left zero Connection, block, Pin, category, comment,
  notification, activity, or analytics residue. Evidence:
  `output/playwright/wave3-inner-circles/summary.json`.
- Production ShadowChat and `main` remain unchanged. Installed iPhone/Android
  PWA touch, browser-chrome, and resume acceptance remains a real-device gate.

## July 13 Wave Three ShadowPin Feed Modes Automated Checkpoint

- Immutable deploy `6a5575bcbc2a1131aab40695` and the stable isolated URL
  passed the exact same two-account Pixel Chromium/iPhone WebKit verifier.
- The run covered keyboard and touch mode selection, account-synced reload
  persistence, universal Search, waiting and accepted-empty states, exact
  cross-category chronological ordering, Connections-scoped Theater, hearts,
  comments, Browser Back, removal/block fail-closed behavior, and explicit
  reconnect recovery.
- Feed and Theater surfaces remained inside `412x839` and `390x664` visual
  viewports with zero horizontal overflow, runtime errors, failed requests,
  HTTP errors, or unexpected Supabase hosts. Expected report-only WebKit CSP
  messages remained diagnostics only.
- Exact cleanup restored both feed preferences and proved zero scoped
  Connection, block, Pin, category, heart, comment, notification, activity,
  analytics, or preference residue. Evidence:
  `output/playwright/wave3-shadow-pin-feed-modes/summary.json`.
- Production ShadowChat and `main` remain unchanged. Installed iPhone/Android
  PWA touch, browser-chrome, and resume acceptance remains a real-device gate.

## July 13 Wave Three Connections Automated Checkpoint

- Immutable deploy `6a556190a9c126b4758b29f1` passed twice with two
  authenticated accounts across Pixel Chromium and iPhone WebKit.
- The run covered exact `?view=dms&panel=connections` routing, Browser Back,
  Escape, search/profile entry, request/cancel/decline/accept/remove, realtime
  request and accepted banners, request badges, focus refresh, accepted-list
  profile/message entry, and return-focus behavior.
- The Connections sheet stayed within `412x839` and `390x664` visual
  viewports with no horizontal overflow, console errors, page errors, failed
  requests, HTTP error responses, or unexpected Supabase hosts.
- Existing DM history remained unchanged. Exact test pairs and Connection
  events were removed, notification/discovery preferences were restored, and
  the final residue check found no pair, block, event, preference, or DM drift.
- The isolated stable test URL now serves this checkpoint. Production
  ShadowChat and `main` remain unchanged; installed iPhone/Android acceptance
  is still required.

## July 13 ShadowChat 2.0 Phone Regression Hardening

- Physical-iPhone screenshots showed that Creator Studio's whole frame ended
  above the keyboard, leaving a large black band after the action footer. The
  frame now uses stable app height and reserves the iOS keyboard inset inside
  it instead of using visual-viewport height alone. Immutable deploy
  `6a5547c57eceb4541037f4b3` passed all 19 lifecycle checks; a non-zero iOS
  visual-offset simulation measured a `0px` footer-to-keyboard gap and a
  `12.21875px` focused-field-to-footer gap. Cleanup returned every generated
  database and Storage counter to zero. The identical build is live on the
  isolated stable URL as deploy `6a5548df38b181c08f7c4122`; production
  ShadowChat and `main` remain unchanged.
- General Chat thread proof was rerun against a fresh production build on
  Pixel Chromium `412x915` and iPhone WebKit `390x844`. Both engines retained
  the bottom navigation, rendered message actions at layer `150` above the
  sheet, kept the compressed composer against the bottom of the keyboard
  viewport, preserved the underlying Lounge during live replies, and reported
  zero console/page errors.
- The thread run created seven temporary text messages per engine pass and
  deletion-confirmed all of them with zero cleanup errors. Evidence:
  `output/playwright/wave2-candidate2-threads/summary.json`.
- A read-only ShadowPin Theater probe issued two rapid left swipes during the
  first transition. Pixel Chromium and iPhone WebKit both advanced from Pin 1
  to Pin 3 of 18, then remained stable for the post-settle sample with no route
  or title snapback and zero console/page errors. Evidence:
  `output/playwright/shadow-pin-theater-rapid-swipe/summary.json`.
- Creator Studio regression coverage now types title, description, and tags
  character by character while autosave runs, checks focused-field visibility
  in a `620px` simulated keyboard viewport, and requires automatic local image,
  local video, image URL, external-video poster, and authenticated link-preview
  rendering. The final immutable deploy
  `6a552eb8a7705fe8b607a0e5` passed all 19 Studio lifecycle checks with zero
  console, page, media-API, harness, database-cleanup, or Storage-cleanup
  errors.
- The first immutable Studio pass safely stopped on a Netlify media 401 after
  session rotation and removed every scoped draft/message/category artifact.
  The client now performs one locked refresh and exact-request retry on 401;
  focused API/Studio/shared-edge tests cover that recovery before the final
  immutable rerun. Each Netlify media attempt also has a 45-second ceiling, so
  a stalled provider request returns a retryable error instead of freezing the
  mobile editor.
- The remaining double-401 was isolated-site environment drift: its Supabase
  URL was correct, but its function-scoped service-role fingerprint did not
  match the linked project. The test site's production, deploy-preview, and
  branch-deploy values were rotated to the current key and marked secret;
  production ShadowChat was not changed.
- The comprehensive Creator Studio browser harness now bounds response-drain,
  context-close, and browser-close operations, writes harness diagnostics, and
  performs its database/Storage cleanup even when a Playwright engine will not
  close normally.
- General Chat threads and rapid ShadowPin Theater swipes were rerun against
  the same final immutable deploy on Pixel Chromium and iPhone WebKit and both
  passed again. Physical iOS/Android installed-PWA keyboard animation and
  hardware safe-area validation remain the real-device gate.
- The validated frontend was promoted from a draft-only deploy to the isolated
  site's stable test URL, `https://shadowchat-2-0-wave-one.netlify.app`, on
  deploy `6a552eb8a7705fe8b607a0e5`. Stable and immutable HTML/entry-script hashes
  matched exactly; the thread and rapid-swipe probes passed on the stable URL,
  and the 19-check Studio lifecycle passed on its immutable twin. Production
  ShadowChat and `main` were not changed.

## July 13 ShadowChat 2.0 First-Run Activation - Authenticated Checkpoint

- Exact immutable deploy only:
  `https://6a549b1e052c56307d851b7d--shadowchat-2-0-wave-one.netlify.app`.
  The verifier bound the API deploy ID, immutable origin, all 53 JavaScript
  chunks, and expected Supabase project before writes. Production and the
  mutable alias were not used.
- Six future-invite profiles passed 139 checks with 47 screenshots across Pixel
  Chromium and iPhone WebKit. General Chat, DM, and ShadowPin choices each pass
  in both engines with exact invite-hook enrollment, Escape/Browser-Back/reload
  resume, nested DM/Pin Back, focused footer geometry, 130% Comfort, canonical
  receipt completion, foreground success, and optional install behavior.
- Both engines had zero console, page, HTTP, request, navigation, unexpected
  origin/backend, or horizontal-overflow errors. Four exact Chat/DM push
  requests were intercepted and validated; no live push was delivered. Expected
  report-only WebKit CSP messages were recorded separately as diagnostics.
- The Pin flow exposed and fixed a real prefetch race: raw Browser Back could
  remove `?pin=` while locally opened Theater stayed mounted. Route absence now
  closes only the route-owned viewer and leaves the category masonry intact;
  focused Jest and both live engines pass.
- Strict cleanup removed 6 disposable Auth users, 6 invites, 2 Chat messages,
  2 DM messages, 2 conversations, and 2 Pin hearts. All 14 scoped remaining
  counters were zero and no recovery journal remained.
- Evidence:
  `output/playwright/wave2-candidate4-activation/activation-1783930103447-a91d2b7f0b9c/summary.json`.
- The official Supabase generated signup-link path created canonical invited
  users without sending email, so invite redemption/enrollment is proved but
  email delivery is explicitly not claimed. Native OS install-sheet acceptance,
  installed Home Screen launch, VoiceOver, TalkBack, and physical touch comfort
  remain the phone-acceptance scope.

## July 13 ShadowChat 2.0 ShadowPin Creator Studio - Authenticated Checkpoint

- Immutable isolated deploy only:
  `https://6a549b1e052c56307d851b7d--shadowchat-2-0-wave-one.netlify.app`.
  The verifier rejected mutable/unexpected origins and blocked any unexpected
  Supabase project host; production was not used.
- Two controlled accounts passed 19 recorded checks across Pixel Chromium
  `412x915` and iPhone WebKit `390x844`. Studio and Theater matched the visual
  viewport with no horizontal overflow; 130% text, reduced motion, and
  simulated keyboard compression also passed.
- Home, category, General Chat, DM, and existing-Pin edit entry points passed.
  Image upload, local short-video selection/metadata, external-video URL, and
  image URL passed, including one injected media retry and idempotent Storage
  duplicate recovery.
- Account A staged an image in the owner-private draft bucket, saved/exited,
  reloaded, recovered it through an owner-signed URL, and published exactly one
  canonical Pin. Repeating finalization returned the same Pin. Edit, category
  move, and media replacement retained the same Pin and emitted no new event.
- Account B could not read A's draft/asset or mint its signed URL. After
  publication B saw the exact Pin and received exactly one eligible
  notification plus its realtime toast.
- Exact Theater routing and close-to-ShadowPin-origin behavior passed. Both
  engines had zero console errors, page errors, unexpected Supabase hosts, and
  critical media/RPC/Storage responses; report-only CSP diagnostics were
  recorded separately.
- The expanded run found and fixed a real preview-order bug where an existing
  poster masked a newly selected replacement blob. The focused component test
  and exact deploy prove the replacement is visible immediately while the old
  public media remains canonical until finalization.
- Cleanup removed 4 drafts, 5 staged assets, 1 Pin, 24 notification rows, 24
  mirrored activity rows, 13 analytics events, 9 analytics sessions, 9 private
  Storage objects, 7 public objects, 1 Chat row, 1 DM row, and 2 temporary
  categories. Post-cleanup checks reported zero remaining scoped rows/objects.
- Evidence:
  `output/playwright/wave2-candidate3-creator-studio/summary.json` and the paired
  Pixel/iPhone Studio, recovery, and Theater screenshots in that directory.
- Remaining real-device scope: installed-PWA camera/library picker, native
  keyboard and safe areas, background upload/resume, VoiceOver, TalkBack, and
  touch comfort. Native Bunny/TUS provider upload was intentionally not spent
  by browser QA and remains covered by lifecycle/source tests. Automated WebKit
  is not physical-device certification.

## July 12 ShadowChat 2.0 ShadowPin Creator Studio - Historical Local Implementation

This entry records the implementation state before the authenticated checkpoint
above and is retained as historical evidence.

- Branch: `codex/shadowchat-2.0`; production `main` frontend remains
  unchanged.
- Candidate 3 uses one lazy four-stage Media/Details/Preview/Publish Studio
  with owner-private recovery, staged media, honest progress, explicit public
  confirmation, and exact Theater success handoff from ShadowPin, Chat, and DM
  entry points.
- Seven focused model, history, API, component, lazy/share-entry,
  private-media, and SQL source contract suites pass locally with 46 tests;
  the broader route/ShadowPin set passes 9 suites and 107 tests. The hardening
  assertions cover local/server recovery conflicts, draft-switch and Back
  flushes, late save receipts, exact-origin routing, phone touch targets,
  target-version rejection, atomic promotion recovery, private Bunny drafts,
  rate budgets, and asset caps. This is code-level proof, not browser or
  linked-backend acceptance.
- At this checkpoint, the required Pixel Chromium `412x915` and iPhone WebKit
  `390x844` proof still needed to cover home/category/Chat/DM/Edit entry prefills, image/video/URL preview,
  category/tags, close-reload-offline recovery, upload retry/resume, keyboard
  and safe areas, 130% text, large controls, reduced motion, Back/cold close,
  and zero overflow or console/page errors.
- At this checkpoint, required two-account proof still needed to keep Account A's draft/staged media invisible
  to B, deliver one Pin/event only after publish, suppress repeat events on
  edit/move/replacement, and keep old media visible until an atomic replacement
  succeeds.
- This historical entry did not claim a Candidate 3 browser artifact,
  physical-device result, production Pin, notification fanout, or
  test-data/media cleanup. The authenticated checkpoint above now records the
  later browser evidence and cleanup counts.
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

## July 15 Shado Live Real-Beta Automated Checkpoint

- The real client remains excluded from the default build and lazy-loads the
  LiveKit runtime only when `VITE_FEATURE_SHADO_LIVE_REAL=true`.
- Pixel Chromium and iPhone WebKit deterministic host/listener flows passed
  routing, lobby/stage layout, keyboard compression, safe areas, reconnect,
  terminal state, controls, and diagnostics with no camera, display-capture,
  recording, console, page, request, or response errors.
- Evidence: `output/playwright/shado-live-real/summary.json`.
- Physical installed-PWA audio routing, real microphone permission,
  Bluetooth/headphones, lock/unlock, weak-network recovery, and battery/thermal
  behavior remain under RD-030.

## July 16 Blocking Surface And Provider Checkpoint

- Catch-Up's current Pixel Chromium/iPhone WebKit captures show the oversized
  hero removed and the provenance/title/refresh/snapshot identity compressed
  into the standard flat mobile header.
- Six focused suites (21 tests), all 225 Jest suites (1,197 passing tests),
  lint, app TypeScript, build/budgets, and documentation integrity passed after
  the Catch-Up, Weather, radar, and Shado Live changes.
- The deterministic Shado Live browser gate passed Pixel Chromium and iPhone
  WebKit host/listener, keyboard, reconnect, control, and zero-runtime-residue
  checks in `output/playwright/shado-live-real/summary.json`.
- `npm run qa:shado-live:provider` passed against the real Supabase and LiveKit
  services with two controlled Chromium phone contexts. Host microphone
  publishing, listener audio attachment, participant visibility, room close,
  provider cleanup, and temporary Connection cleanup were verified.
- Automatic LiveKit Cloud webhooks remain the one external failure: the
  Supabase endpoint accepts a correctly signed synthetic LiveKit event, while
  real room lifecycle runs still produce zero automatic receipts. Re-run the
  LiveKit dashboard test event after correcting the webhook entry.

## July 18 Notification Presentation v2 Checkpoint

- Mobile bottom navigation now keeps Active Users on the first page, moves
  Play to the second page, and names the page-swap control More.
- The foreground notification banner uses the shared obsidian-and-gold system,
  48px controls, actor PFP/profile navigation, optional media, contextual
  actions, Comfort-aware motion, pause-aware timing, and grouped event ids.
- The native Expo client configures action categories, private lock-screen
  visibility, 14 immutable v2 sound channels, and 12 original bundled sounds.
- Local gates passed: app and mobile lint/typecheck, Expo Doctor 20/20,
  production build and budgets, database reset/lint/security contract, Deno
  check, Node contracts, and focused notification/navigation suites.
- The hardened notification visual gate passed iPhone WebKit and Android
  Chromium with the real service worker controlling both profiles, the real
  coordinator banner routing to Pins, worker-message routing to Active Users,
  48px controls, and zero unexpected console/page/network errors. Evidence:
  `output/playwright/notification-presentation-v2-hardened-r4/summary.json`.
- The final full gate passed 238 Jest suites (1,320 tests plus 16 documented
  TODOs), 47 Node contract tests, and five Deno worker retry tests.
- A transactional two-user local database proof verified truly dormant
  disabled mode, provider-silent shadow planning, native-token ownership
  transfer on account switch, prior-installation revocation, cross-user RLS
  isolation, private token grants, and per-installation claim idempotency.
- Physical installed-PWA and native-development-build notification delivery
  remains required. EAS was not authenticated on this workstation, so no
  native binary or real Expo push token was produced.

## Historical May Summary

The automated mobile PWA visual loop passed across the core installed-home-screen simulations. Final required checks also passed: lint, typecheck, build, Jest, existing mobile smoke, full smoke, and the focused mobile PWA harness. Remaining mobile-specific risk is limited to real-device behavior that Playwright cannot fully reproduce: native keyboard animation, iOS standalone status bar behavior, home indicator safe-area behavior on physical devices, and touch comfort for dense secondary controls.

That statement applies to the recorded May artifact set, not the July 10 local
candidate. Use the candidate checkpoint above until new browser and device
evidence is recorded.
## September 30 Shadow Runner Sovereign and ending

- Frozen runtime `DMlMFKUa` / Games `CrV_mDmd` passes the explicitly QA-assisted
  arena diagnostic on Android Chromium932x430 and iPhone WebKit740x390: boss,
  ignition, four user-advanced cinematic scenes, matching stored results,
  three lives and no page errors. Compact ending screenshot reviewed.
- `runner-boss-local-2026-09-30T14-46-54-393Z` logs objective placement, prior
  guard clearance and initial restore. It does not certify a full campaign route.
- Full `runner-sovereign-beam-route-20260930-01` is unaccepted; Android exhausts
  lives and iPhone reaches five Flames/12HP/three lives then stalls in final wind.
  Follow-up Crown corridor and input-bracing changes await new-build replay.
- Physical installed-PWA touch, media-card/background and sustained device
  performance remain unverified. No rebuild production deploy yet.
