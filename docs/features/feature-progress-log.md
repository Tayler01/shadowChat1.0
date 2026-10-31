## October 26 streamlined release verification

- Fixed a Windows-only module identity split in the edition resolver that
  bundled two authentication providers and stopped the app at startup. The
  build verifier now rejects duplicate module identities; its 11 mode and
  isolation tests pass. The release bundle is 752 kB initial JavaScript,
  227 kB gzip, with chat, radial controls, DMs and ShadowPin retained.
- Lint, both edition typechecks/builds and documentation checks pass. Android
  Chromium and iPhone WebKit pass four core scenarios plus focused DM reload
  checks with exact fixture cleanup; see the [mobile QA log](../qa/mobile-pwa-qa-log.md).
  The harness supports streamlined navigation while preserving the full-app
  default. Local-only preview output is excluded from Git.
- Fresh read-only production checks confirm the expected 243-migration baseline
  and unchanged deletion restrictions. No October backend phase or streamlined
  hosting release has been applied. GitHub rejected the foundation dispatch
  because Actions is disabled for the account, despite repository Actions being
  enabled. Signed streamlined iPhone build 19 is downloaded and inspected;
  App Store Connect has not received it. See store readiness for the exact build,
  source, permission and artifact evidence.
- The [App Review packet](../STREAMLINED_APP_REVIEW_PACKET.md) records listing
  copy, reviewer access, privacy disclosures and signed-artifact checks still
  needed before submission. No App Store submission has occurred.

## October 23 streamlined production-source reconciliation

- Imported the separate streamlined shell, settings, policy routes, adult
  acknowledgement flow and round brand asset into a release worktree based on
  production `main`. The header keeps one Settings destination and one presence
  indicator as reviewed in the local preview.
- Preserved the newer full-app work recorded below. Backend activation and a
  signed streamlined iPhone build remain in progress; the earlier isolated
  results are not production evidence. See
  [store readiness](../STREAMLINED_STORE_READINESS.md) for phase boundaries.

## October 5 Shadow Checkers selection, audio and rendering follow-up

- Fixed board-wide mandatory-capture filtering, same-piece deselection and
  rejected Unity move locks in solo and multiplayer. Added selection regressions.
- Preserved the soundtrack across callback rerenders and recover Safari audio
  interruptions from in-room gestures. Fullscreen now survives mode changes.
- Rebuilt Unity with the installed 6000.6.3f1 editor: 60 FPS target, 1.5 DPR cap,
  2x antialiasing, bounded 512px reflections and fewer camera bridge messages.
  Inverted camera controls remain and respond more quickly. King capture loops
  now animate even when their destination equals their starting square.
- Required lint and TypeScript pass; phone-emulated/runtime verification and
  physical iPhone acceptance are tracked in the finish checklist.

## October 5 Shadow Checkers solo opponent

- Added a fully local computer opponent beside the existing human multiplayer
  mode. The four levels use the existing American-checkers rules and bounded,
  deterministic alpha-beta search in a lazy Web Worker; solo play makes no
  match, chat, ranking or Supabase writes.
- Added a branded one-screen mode/difficulty entrance, immediate local human
  moves, presentation-gated computer replies, result/restart/leave controls and
  keyboard-safe menus/dialogs. Invitation and turn-notification deep links still
  bypass the chooser and open multiplayer directly.
- Focused engine/UI tests and isolated 667x320 at 130% text Chromium/WebKit
  checks pass, including a full human-plus-computer turn, restart and zero
  backend requests. Physical installed-PWA difficulty/performance remains for
  release testing.

## October 5 first-send chat scrolling

- Fixed a shared layout/scroll event race that disabled following before resize
  observation after the first outgoing text. Gesture and elastic ownership stay
  intact. Fixed-footer chat surfaces now clip rows below the composer without
  resizing the scrollport. Pins comments inherit the controller fix.
- Regression and browser evidence plus physical acceptance steps:
  [first-send scrolling](first-send-scroll-2026-10-05.md).

## October 5 Shadow Runner full-finish continuation

- Integrated current main `a40565f5` without losing the Runner patch or unrelated
  chat/upload/native work. No new Runner release.
- Extended the rotation fallback to title/map and suspended hidden dialog/finale
  focus traps without resetting their state. Targeted regressions pass.
- Full Jest passed 322 suites / 2,944 tests, plus 402 Node tests. A bounded
  15-second Relay sample and three retries retained identical entity counts.
  Production dependency audit is clean; the full audit has five development-only
  high findings awaiting security review. No dependency migration or push.
- [Current evidence and remaining gates](../SHADOW_RUNNER_FULL_FINISH_EVIDENCE_2026-10-05.md)
  distinguish shipped features, local fixes, finite-life Relay traversal, older
  save-observer failure, representative browser measurements and device limits.

## October 1 Pins video thumbnails

- Generated Bunny frames replace generic posters during ready polling and
  publication; custom covers are preserved. Cached rows get an image-only
  fallback and a usable Open video state. Four existing ready Pins were repaired
  against verified CDN JPEGs. [Implementation and verification](pins-video-thumbnails-2026-10-01.md).
- Native paste and quiver are accepted in Tayler's reported tests. Direct Home
  Screen movie paste remains unresolved; native push delivery still lacks fresh
  phone enrollment proof. These are separate from the thumbnail fix.

## October 1 bottom-edge and PWA swipe follow-up

- Tayler reports the quiver fixed in both TestFlight and the Home Screen app.
  This accepts his tested interaction; broader rotation, push and multi-device
  acceptance remains separate. Video paste works in TestFlight but remains open
  in the Home Screen app.
- Physical follow-up: Tayler confirms video paste now works in TestFlight,
  but still fails in the Home Screen PWA. Native basic paste is accepted;
  PWA movie paste remains open. [Clipboard source investigation](pwa-video-clipboard-2026-10-01.md)
  rules out a speculative async-Clipboard retry and distinguishes working picker
  import from unverified drag/drop alternatives.

- Physical feedback exposed a real Send CSS cascade override and automatic
  corrections fighting Safari's elastic rebound. Both are repaired in the shared
  paths, preserving natural containment. Empty-format native paste and mixed
  captions are repaired; 35 MiB bounded transfer passed. [Current follow-up](mobile-quiver-paste-followup-2026-10-01.md).
- Empty DM presentation and retrieval of deferred arrivals after rebound are
  repaired. Final lint/types/build and 320 suites/2,918 tests pass; 16 affected
  Chromium/WebKit UI checks pass.
- Build 17 is signed with native module registration and rotation verified.
  Apple account access recovered and the upload is processing. Hosted release,
  TestFlight distribution and physical acceptance are separate gates in the follow-up.

## September 30 shared mobile stability and native build 17

- Physical build 16 toolbar removal is accepted. PWA toolbar remains and modal
  typing is rejected. Shared bottom-scroll and keyboard-swipe fixes, native
  movie paste recovery and rotation support are implemented for the next binary.
- Full Jest 320 suites/2,898 tests, Node 402, Deno 23 and rolled-back native SQL
  17 assertions passed. Production enrollment/bounded-worker migrations applied;
  ACL and guarded worker health passed. Native delivery remains gated pending
  current device enrollment. Integrated browser and build/deploy evidence is
  tracked in [build 17](mobile-stability-build17-2026-09-30.md).
- [App Store readiness](app-store-readiness-2026-09-30.md) identifies member
  reporting/filtering, privacy/AI consent, review access, metadata and physical
  acceptance work. Paused domains remain paused; no public submission occurred.

## September 30 native TestFlight refresh

- Tayler resumed native testing and authorized publishing a fresh signed iPhone build. Build 16 updates Expo/React Native patches, suppresses the WebView keyboard accessory bar and supplies media permission descriptions while retaining the current hosted interface.
- Mobile audit is clean; fresh install, dependency compatibility tests, lint/types, Expo Doctor 20/20 and iOS export passed. Signed compilation and Apple processing passed; Build 16 is VALID and IN_BETA_TESTING in the existing internal group. Apple's direct upload API bypassed stalled EAS submissions. The previous invitation is already accepted; no resend was sent. Physical-device acceptance and Photos video paste remain unresolved. [Release evidence](native-testflight-update-2026-09-30.md).

## September 30 video-size and PWA paste follow-up published

- Client build `fb1d0b58` merges current main and is live through corrected Netlify deploy `6abd41540302b1466c64796c`. Global Storage now matches chat's existing 64 MiB contract; all bucket constraints/visibility remain unchanged. Required restart is active and broadcast; live media guards and operations health passed.
- Chromium/WebKit General/DM 35/55 MiB video sends, progress, captions and recipient playback passed; Pins rejected 55 MiB at its 50 MiB cap with no upload. Merged source gates passed 318 suites/2,862 Jest tests, 402 Node contracts, lint/types and unchanged build budgets. Exact cleanup passed.
- Silent paste feedback covers empty events and missing media bytes, preserving ordinary text. Native app work is parked at Tayler's PWA-only request. Feedback's System text dialog and local clipboard-metadata diagnostic need his physical phone result. [Detailed follow-up](composer-media-followup-2026-09-30.md).

## September 30 Shadow Runner release candidate

- Full campaign redesign retained: phone controls/HUD/map/journal, courier story,
  recovery/save fixes, enemy/terrain repairs, custom chapter art and staged finale.
- Completed nine transparent story landmarks, three act tableaux and separate
  depth props for all ten districts. Selective loading and lossless atlas
  optimization keep the production payload93.55MiB, below its deploy cap.
- Both phone engines pass21 final UI/art/control/pause surfaces. Headed shared
  auth/resume-send passes with verified cleanup. Existing boss/ending/reload and
  critical late-route evidence is retained instead of repeated full bot loops.
- Required production quality gates remain. Physical-phone performance, audio
  and player feedback are explicitly not certified by browser emulation.

## September 30 composer media follow-up published

- Tayler advanced the queued video paste work into this follow-up, along with inline thumbnails, shared caption/attachment Send, picker review, Pins loading bars and small keyboard-dismiss controls. [Implementation and platform investigation](composer-media-followup-2026-09-30.md) tracks verification and release.
- Web build `abb22931` is pushed to main and live through manual Netlify deploy `6abd3281fceefa3eb468e003`. Public health/media guards, hosted two-account smoke/cleanup, server health and the required-restart broadcast passed. Unchanged production budgets passed after deferring optional preview/image-viewer UI.
- Tayler's installed-PWA test found the native up/down/checkmark strip in every keyboard-comparison variant. The supplied screenshot confirms Home Screen context. The editor workaround is unsuccessful on this phone; the existing native wrapper's accessory suppression is prepared separately for signed-client testing. Physical video-preview and broader installed-PWA acceptance remain open.

## September 30 Shadow Runner main integration and boss ending

- Preserved rebuild while fast-forwarding main to `2e876b7d`; reconciled four
  overlapping files and retained the recovery stash. Fresh build passes.
- Both phone engines pass the QA-assisted local Sovereign fight and all four
  ending beats with fresh ignition/results, three lives and no page errors.
  Whole-route evidence remains separate: Chromium life exhaustion and WebKit
  final-wind policy stall are retained, not counted as wins.
- Added visible-beam-aware combat, final-road wind bracing and retry-safe Crown
  beam headroom contracts. Independent Captain Span policy correction passes
  focused checks. Account-save journal coordination and entry/resume medal refresh
  fixes pass112focusedtests; integrated account behavior remains unverified.
- Lint, docs, function inventory and dependency audit pass. Final integrated
  campaign/full regression and production release are still pending; no push.

## September 30 chat smoothness published

- Tayler authorized the full performance/read-position/notifications/attachments audit fixes, goal execution, main push and manual Netlify deployment. [Implementation checkpoints](chat-smoothness-implementation-2026-09-30.md) track the shared General/DM/thread/Pins contract and backend-first release.
- Pushed code `e079a56973341df3c7b3c2928e0c0ff7a1333d1f` to main and manually deployed Netlify `6abd16af68215c0a06c1be8a`. Three migrations, exact function inventory, linked security/Auth checks, public health/media guards, release broadcast and production auth/resume-send/DM smoke passed. Test cleanup was verified.
- Follow-up: required-restart policy is active and broadcast for older builds; Shado's General update `76d7806f-5c36-4559-bb08-0b0651ea0cf3` is posted with maximum visual Hype tier 5 (five system entries, no invented user attribution).
- Full local validation passed 268 Jest suites/1,591 tests, 63 Node tests and 40 integrated Chromium/WebKit assertions; final packaging added 29 passing focused tests. Production build budgets remain unchanged. Work stayed isolated from existing Unity and guide edits; task preview/containers are stopped. Tayler's physical installed-PWA acceptance and the documented WebKit rendering-performance follow-up remain open.

## September 29 Shadow Checkers move sync and camera published

- Published commit/build `fef865dee100b6c6ef92926c62faaab0a2ea1f04` to `https://shadochat.online` via Netlify deploy `6abc7522c70385a4236e9f57`. Public health checked app 200, media endpoint 405 and 11 game assets; production health checked app 200 with News paused. Required restart release `fef865de` was published and broadcast.
- Hosted Android/Chromium and iPhone/WebKit two-player browser-emulated reports passed with 12 ms and 138 ms optimistic animation starts, respectively. Both verified own-side orientation, server persistence without animation replay, opponent realtime reply from the flipped seat, camera controls and exact test-created data cleanup. Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1790735775133/summary.json` and `multiplayer-1790735841210/summary.json`.
- Physical iPhone and Android installed-PWA confirmation remains pending; hosted browser emulation does not complete phone acceptance.

## September 29 Shadow Checkers move sync and camera candidate

- Legal moves begin local animation before RPC completion and reconcile the server acknowledgement without replay. Two-player Android/Chromium and iPhone/WebKit browser-emulated runs passed at 10 ms and 146 ms local animation start respectively; both persisted the move, showed the opponent's realtime turn/reply from the correctly flipped seat, and passed camera controls.
- Reports: `output/playwright/shadow-checkers-unity/multiplayer-1790734760532/summary.json` and `multiplayer-1790734821801/summary.json`. Both report exact test-created data cleanup. These were local browser runs before the published release recorded above; physical iPhone/Android installed-PWA confirmation remains pending.

## September 27 Shadow Checkers paused for the night

- User paused the goal at 10:49 PM ET. Interrupted active implementation agents and saved the next requests in `SHADOW_CHECKERS_FINISH_CHECKLIST.md`: reduce move sync delay, animate validated local moves immediately with authoritative reconciliation, and smooth camera rotation. These three changes are not implemented or verified.
- Opponent-seat fix is committed locally at `5366fb61` with rebuilt Unity assets, 1,200 native picking checks plus 14 seat/motion checks, 28 focused Jest tests, lint/types and Chromium/WebKit seat-switch proof. It has not been published. Live remains `47b0775` / Netlify `6ab9d01510b8d67a73d93cd6`.
- Stopped obsolete packaging job; cleanup found no remaining matching packaging helpers. Resume needs fresh build/release verification and manual Netlify deploy. Preserve unrelated changes and inspect unreviewed Unity scene/project-settings diffs.

## September 27 Shadow Checkers continuation parity and production rules proof

- Follow-up hosted invite-choice/Decline check passed on `47b0775` with no game created and exact cleanup counts zero (`output/playwright/shadow-checkers-choice-decline-1790562575111/summary.json`). Opponent-seat phone report is now being corrected: native reproduction confirms unchanged logical pieces retained their old transforms when the viewer role changed.

- Published build `47b07751782a13f8fa48460b8f0c7e980209a2b1` / Netlify `6ab9d01510b8d67a73d93cd6` at 10:26 PM ET. Health and 11 asset hashes match, Linux media guard/production health pass, restart notice is broadcast. Total payload 99,976,610 bytes, initial 1,267,128 bytes; unchanged limits. No GitHub push. Focused hosted invite-choice/decline QA follows publication.
- User confirmed clear Send, normal zoom and plain chat text on their phone after restarting the preceding patch. Platform/device/PWA mode were unspecified; record as narrow physical feedback, not full mobile certification.
- Corrected the queued loser's forbidden Rematch action, restored lobby queue status/Leave Queue including completed tables, and exposed explicit private-inviter board/character and queue character choices. New own-queue reads remain lobby-only; response generations/account ownership prevent stale viewer state. Scoped API/hook/Screen/picker/styles and regression/layout tests changed; no schema changes.
- Full lint/types and 254 Jest suites pass (1,471 tests, 16 existing TODOs). Chromium/WebKit layout reports `layout-chromium-1790561894601` and `layout-webkit-1790561998328` verify invite choices/action args, completed-queue card containment and touch targets.
- Production rollback proof replays 35 legal moves from the initial board, settles capture/king/win/loss totals once, rejects terminal replay, and resolves repeated rematch calls to one continuation. Exact cleanup is zero; crown ownership is unchanged. `output/playwright/shadow-checkers-complete-sequence/result.json` binds the SQL/sequence hashes. This is not a committed hosted game or browser/physical-device completion proof; an actual QA win would risk the live one-win champion's crown.

## September 27 Shadow Checkers phone chat follow-up published

- Published `c3523dadeacc960878b71b5d12b0fbd30181c402` / Netlify `6ab9cab96d8fcedc0386d2d1` after the user's phone report: visible Send, 16px-minimum checked input, plain message feed, feed hidden only while composing, and accepted-notice placement clear of Skip. Files: `ShadowCheckersScreen.tsx`, `shadow-checkers-ui.css`, invitation CSS, Screen tests and layout QA script.
- Full lint/types/build, 20 focused tests and both browser layout checks pass; exact public health and 11 asset hashes match, Linux media guard and production health pass. Restart notice published; no GitHub push. Physical iPhone keyboard zoom retest remains open.

## September 27 Shadow Checkers closeout published for phone testing

- Manually published `b298f52bc4b6e9539640a3cd26fee3edd51be6b7` to `https://shadochat.online`, Netlify deploy `6ab9c48ad00735ff94c5c11f`, after the authorized backend-first rollout. No GitHub push. Exact hosted health and seven Unity asset hashes match; Linux media function returns expected 405 and production health passes. Required-restart release notice is published.
- Final lint/type/docs/build and 254 Jest suites pass: 1,468 tests, 16 existing TODOs. Unchanged budgets pass at 1,267,128 initial bytes and 99,971,193 total bytes. Small-screen card/Hall-of-Fame clipping corrected and verified at 667×320 with enlarged text.
- Hosted two-account invite/Join/same-match/moves/turn-read/chat QA passed on this build; exact cleanup verifies zero remaining test rows. The accepted notice covered Skip before manual dismissal, and the user's new phone report identified unclear Send, input-induced zoom and unwanted chat panel styling. Follow-up fixes are being verified. Physical phone audio/push/keyboard/performance, fireplace shimmer and user visual acceptance remain open; the goal remains active.

## September 27 Shadow Checkers closeout implementation

- Added real raised shield/star and crown metalwork to the existing marble tokens. The user's correction keeps the crest and band neutral silver, marble visible through open detail, and blue/amber emission confined to the outside ring. Actual Unity Play-mode review and 240 raised-piece/960 destination picking checks pass with no carving shader errors. Retained instancing and single-pass relief lighting reduce the first prototype's 679 draw submissions to 567; final desktop sampling is 30.46 submissions/sec with 33.4 ms p95 intervals and no >50 ms intervals. This is not phone/thermal proof. The final native build is 11,777,792 bytes, including narrow scorched map/folio borders and subtly worn tabletop map silhouettes. A same-dimension, visually reviewed fallback-board recompression saves another 29,146 bytes for the unchanged delivery budget.
- Implemented the revised landscape entrance/lobby and minimal game controls, compact chat composer/feed, shared master/category audio behavior, exact-turn read acknowledgments, and private online-player invitations. The user authorized publication after final checks. Backend-first migration and `send-push` deployment passed live migration/RLS/RPC/security/function-inventory verification; frontend publication and hosted proof remain pending. No GitHub push is claimed.
- Rebuilt Blender/Unity room detail, including deeper aged hearth, ornament, worn leather, aged maps, slow rain and bounded minute-scale wax. Corrected wax deformation to world coordinates for imported FBX transforms. Native camera and flame-energy diagnostics pass; shadow-bias mitigation still requires the user's physical-phone comparison.
- Actual Unity Chromium/WebKit camera and real WebGL-loss recovery pass. Desktop Chromium records 521 draws/frame, 33.4 ms p95 submission interval and no >50 ms intervals over eight seconds, versus the latest 511-draw batching baseline. Do not compare against the older 758-draw pre-batching baseline or call this phone proof.
- Local SQL invitation assertions and full Jest/type/lint/Node/function/audit checks pass at their recorded checkpoints. Production-only payload limits caught small initial/total overages; deferred styles and visually reviewed, same-dimension 2D WebP compression address these without changing the native room or raising budgets. Final candidate checks remain in progress.
- Track release, hosted two-account/concurrent continuation, installed-PWA notification/audio/thermal checks and user fidelity acceptance in [SHADOW_CHECKERS_FINISH_CHECKLIST.md](SHADOW_CHECKERS_FINISH_CHECKLIST.md).

## September 27 Shadow Checkers phone walkthrough and finish scope

- Captured the user's closeout requirements in [SHADOW_CHECKERS_FINISH_CHECKLIST.md](SHADOW_CHECKERS_FINISH_CHECKLIST.md): master audio plus separate piece/music toggles, branded rotation screen, fixed landscape lobby without its top bar/back arrow, integrated rules/audio, Hall of Fame tab, direct online-player invitations and dependable turn notifications.
- Existing notification code is a foundation requiring end-to-end physical-phone validation, not accepted completion. Further in-game observations may follow.
- Latest in-game correction supersedes the separate corner sound control: only bare Chat and three-dot icons remain; exit, help, accessibility and all audio move into the branded menu. Replace the opaque sidebar with a default-visible three/four-message translucent feed, menu hide/show control, and a compact keyboard composer that closes after successful send. Rotation, lobby and loading share consistent branding; the top bar disappears throughout.
- Recorded final room polish: preserve far-side darkness; enlarge/ornament the picture frame; engrave armillary/candlesticks/drinking vessel; improve wax with minute-scale drips; age maps and lightly scorch tabletop edges; add faint book-spine lettering; deepen the firebox and age/detail masonry/columns; finish the blank mantel decoration with suitable art and/or period-appropriate crossed swords; refine tree/window detail and slow exterior rain trails. These remain unchecked acceptance items, not implemented claims.
- Added physical-phone room-tour flicker/shimmer as an explicit rendering defect to reproduce and reduce, distinct from intentional flame lighting. Resolution is only a hypothesis; check depth overlap, shadows, fine reflective/textured detail and frame pacing. Chair polish now includes a worn leather back cushion and detailed frame. User authorizes economical, scoped subagents and MCP/API/CLI-first execution without reducing quality.
- Recorded a publicly available checkers engine/computer opponent as a future addition outside current finish scope. No engine/API selected and no assumption of free hosted service. This checkpoint changes planning documentation only.

## September 27 Shadow Checkers manual testing release

- User explicitly requested manual Netlify deployment while GitHub remains unavailable. Live build bdde5246d73f254f03f04f8c9067b1fbf684f3de, final deploy 6ab8a42a9c6ca3bd2a6de905; health, Unity manifest and required-restart release notice verified. No GitHub push; unrelated main-checkout Runner work preserved.
- Full release checks pass: 252 Jest suites/1,457 tests, 69 Node tests, lint/types/docs/audit/functions and production build. Production-only budget failure resolved by lazily loading camera CSS and saving 536,158 bytes from five same-dimension 2D WebPs; native 3D assets unchanged.
- Applied the sole pending Checkers continuation migration; empty linked dry run, security contract and exact function inventory verified. Corrected the manual Windows function bundle with verified Linux Sharp binaries; live media method guard and production health pass.
- Hosted headed WebKit multiplayer-1790485580354 passes real touch moves, persistence/realtime, notices/chat, landscape and camera controls; exact cleanup verified, no screenshots. Physical phones, final fidelity and hosted continuation concurrency remain open.

## September 27 Shadow Checkers live-update readiness recovery

- Reproduced Fast Refresh expiring an already running Unity player: the new host effect lost its startup-ready flag. Added requestReady/ready handshake in UnityBoard and frame.js; the host sends current state, never an old frame snapshot. Actual-player red/green refresh QA retains the same iframe after the fix.
- Ten lifecycle tests and 25 screen/board tests pass. Accelerated Windows WebKit navigation, capture and real context-loss retry preserve the current board; overhead still works. Lint/types/build pass, payload 99,794,928 bytes below unchanged limit.
- Foreground ready-handshake-20260927; no native rebuild/push/deployment. This proves the false-timeout fix, not the independent cause of the prior MeshCollider console message. Physical-phone, final art and hosted continuation validation remain open.

## September 27 Shadow Checkers invisible camera area and confirmations

- Removed the visible camera strip, labels and border. The 3D room now spans the full width beneath the invisible left-side gesture overlay; help stays in the corner. Chromium/WebKit actual Unity camera QA passes at 915x412 and 667x320, including clear default playable squares. Reviewed the full-width screenshot.
- Replaced browser resign/cancel prompts with themed, focus-managed confirmations. Pending actions cannot be repeated/dismissed; failures remain retryable. 25 screen/board tests pass; four Chromium/WebKit phone/text layouts and actual Unity capture/result/rematch after dismissal pass.
- Lint/types/app build pass; payload 99,794,656 bytes within unchanged budget. Updated camera/layout/ending QA and feature/mobile docs. No native rebuild, push or deployment. Physical-phone, final art and hosted continuation acceptance remain open.

## September 27 Shadow Checkers candle energy synchronization

- Added a 256-render linear HDR energy check to FlameLightingDiagnostics.cs. It found the cast candle light omitted the flame's animated height contribution. MedievalStudyEffects.cs now integrates height and radiance; maximum candle mismatch drops from 3.5854% to 0.0182%. Hearth mismatch is 1.363%; all 45 source-alignment and pause/reduced-motion checks pass.
- No added runtime asset, light or render pass. Unity/lint/types/app build pass; payload 99,793,027 bytes under unchanged 100 MB limit. Accelerated Windows WebKit opening/overhead/reset passes; foreground revision candle-energy-20260927. No additional screenshot, push or deployment. Physical-phone performance and final photographic-fidelity acceptance remain open.

## September 27 Shadow Checkers shadow batching

- Generated the marble shader's own instanced shadow caster instead of using the unbatched Standard fallback. Preserved lights, shadow/reflection resolution and geometry. Added optional post-timing draw/program tracing to shadow-checkers-render-profile.mjs.
- Actual Chromium draws fall from 758 to 511 per frame (32.6%); depth/shadow draws fall from 437 to 190. Reviewed landscape retains contact shadows/reflections. Desktop cadence stays about 31 submissions/sec, so no phone FPS claim.
- All 45 native candle/light alignment samples pass. Accelerated Windows WebKit passes opening/overhead/reset, capture and kinging. Unity build, lint, types and app build pass; payload 99,794,303 bytes remains below 100 MB. Local preview instanced-shadows-20260927; no push/deployment. Real-device and final visual acceptance remain open.

## September 26 Shadow Checkers player details restored

- Fixed a reproduced menu click-through bug: a touch on a checker behind the open menu selected it without dismissing the menu. An outside-tap shield now dismisses without reaching Unity; the next touch plays normally. Escape works from the menu toggle too. Chromium actual-player regression and all 14 screen tests pass.
- Moved the hidden active-match player cards into the game menu: identities, selected characters, champion badge, live piece counts and turn. Menu scrolls within the safe-area viewport, has 44 px targets and Escape focus return. Updated ShadowCheckersScreen.tsx and its tests; expanded layout/ending QA scripts.
- 13 screen tests pass. Chromium/WebKit pass four landscape/text-size profiles, including 667x320 at 130%. Actual Unity Chromium passes capture/king/reduced-motion endings and rematch dispatch; final menu screenshot reviewed. Auth/data transport are isolated fixtures, not hosted settlement proof.
- No push/deployment. Physical-device and final visual acceptance remain open.

## September 26 Shadow Checkers architectural grain

- Added independent wood-detail UVs and a wood-only vertex mask to the two baked room meshes. Grain follows structural members while books, stone and other surfaces retain their existing materials. Updated study_details.py, create_study.py, BakedStudy.shader and MedievalStudy.cs; rebuilt Blender source/models/atlases.
- Reviewed native library close-up and final Chromium landscape. Controlled detail-off/on mean brightness changes less than 0.1%. No added renderer, material, light or texture asset; Chromium remains 758 draws/frame with 38.8 ms p95 and zero >50 ms intervals.
- Unity/lint/types/app build pass. App 99,791,567 bytes remains within the unchanged 100 MB budget, leaving 208,433 bytes of headroom. Local foreground revision architectural-grain-20260926. No push/deployment; physical-phone and final photo-reference acceptance remain open.

## September 26 Shadow Checkers candle source alignment

- Shared flame lean now positions the five candle lights inside their visible moving flames. The existing nearby soft shadow follows this motion; no added lights, shadow maps or render passes. Updated MedievalStudyEffects.cs and StudyFlame.shader.
- New FlameLightingDiagnostics.cs compares GPU-rendered luminous centroids with projected light positions across 45 samples. Corrected the measured vertical offset; final error is below 0.001063 horizontal / 0.000354 vertical scene units. Pause and reduced-motion clocks freeze correctly.
- Unity build, lint, types and app build pass. App 99,553,088 bytes; Chromium retains 758 draws/frame, 38.8 ms p95 and zero >50 ms submission intervals. Local preview revision flame-source-motion-20260926. No push/deployment; physical-phone and final visual acceptance remain open.

## September 26 Shadow Checkers natural charcoal

- Reduced uniform orange log outlines to scattered dim ember fissures; added radial cut-end grain and synchronized warm firelight on the charcoal. StudyCharcoal.shader and StudyHearth.cs retain one combined renderer without added light/texture/pass.
- Native close-up reviewed; Unity shader/build, lint, types and app build pass. App 99,557,564 bytes. Chromium: unchanged 758 draws/frame, 31.60 submissions/sec, 38.7 ms p95, no >50 ms intervals. Accelerated WebKit opening/overhead/reset passes.
- Foreground local preview refreshed to natural-charcoal-20260926. No push/deploy. Photo-reference fidelity and physical-phone performance remain open.

## September 26 Shadow Checkers detailed hearth stone

- Extracted hearth masonry/slab/jambs from the shared room atlas into one StudyStone mesh/material with dedicated CC0 color/normal maps, spatial UVs and baked contact shading. Added darker limestone and localized mottled soot; the stone now receives animated firelight directly.
- Updated study_details.py, MedievalStudy, StudySurface, TextureImport and asset credits; rebuilt Blender source/models/atlases and Unity player. Reviewed native close-up and Chromium seated scene.
- Lint, types and app build pass. Chromium: 758 draws/frame (+8), 31.35 submissions/sec, 38.5 ms p95, no >50 ms intervals. Accelerated WebKit opening/overhead/reset passes. App 99,557,903 bytes remains below 100 MB. Local preview refreshed; no push/deploy. Final photo-level fidelity and physical-device performance/audio remain unverified.
## September 26 Shadow Checkers steep camera range

- Fixed a verified camera tilt plateau at 41.53 degrees. ShadowBoard now follows a constrained orbit arc; optical zoom remains responsive near the ceiling. Reset composition is retained.
- CameraDiagnostics passes 216 native angle/zoom/aspect poses. Expanded PointerDiagnostics passes 240 raised-piece and 960 empty-destination hits, including steep view. Chromium and WebKit camera regressions pass continued tilt, zoom, small landscape layouts, reset and overhead.
- Lint, TypeScript and build pass. Unity 10,590,462 bytes. Local preview refreshed; no push/deploy. Physical iPhone/Android pinch and performance remain unverified.
## September 26 Shadow Checkers camera gestures and flame light

- Replaced the bottom camera toolbar with a dedicated full-height left gesture area using Shadow Circuit's drag/pinch logic. Added upper-right camera help, study-sound and accessible-board icons; reset/overhead remain inside help. Camera bridge validates input and respects pause/cinematic gates.
- Added an original aged scholar portrait with modeled walnut/brass frame and corrected its collision with wall battens. Three static meshes, 116 vertices, 512 px compressed mobile texture.
- Synchronized candle material pulses and their local lights; fireplace lighting follows atlas-frame energy. Added one nearby candle shadow and matching localized modulation of baked room radiance. This approximates bounce and retains baked shadowing; it is not full realtime GI.
- Fourteen host/bridge plus twelve lifecycle/gesture tests pass. Chromium touch pinch, WebKit drag/keyboard zoom, 915x412 and 667x320 layout, capture/kinging/pause and final WebKit rendering pass. Final desktop profile: 30.71 submissions/sec, 750 draws/frame, 38.8 ms p95, zero intervals above 50 ms. Lint/types/build pass; app 98,861,661 bytes. Local preview updated; no push/deploy. Physical-phone pinch, sustained performance and audio remain unverified.
## September 26 Shadow Checkers graphics-loss recovery

- frame.js releases audio/Unity on graphics or startup failure. The host removes the failed iframe, clears cinematic UI and rejects its late messages; Retry uses the latest match snapshot.
- Seven lifecycle and thirteen host/bridge tests pass. Extended the resume harness with real WEBGL_lose_context failure, retry, exact captured-position comparison and overhead controls. Chromium and accelerated Windows WebKit pass without page errors. Lint, TypeScript, build and frame hash pass; app 98,784,382 bytes.
- Local recovery work only; no push/deployment. Forced desktop context loss does not establish physical-phone memory-pressure or OS-eviction behavior.

## September 26 Shadow Checkers cached-page lifecycle

- frame.js now distinguishes cached suspension from permanent unload. Retained pages keep Unity/audio, clear pending presses, resume under existing pause gates and request fresh host state. Late-loading instances after disposal are released.
- Added five lifecycle regression tests and shadow-checkers-resume-qa.mjs. Twelve host/bridge tests, audio verifier, lint, TypeScript and app build pass. App 98,784,256 bytes; source/dist frame hash matched.
- Real Unity synthetic cache-event checks and browser history-return/capture checks pass in Chromium and Windows WebKit. Neither actual history return used cache; physical cached restoration and phone sleep/audio remain unverified. No native rebuild, push or deployment.

## September 26 Shadow Checkers balanced camera timing

- ShadowBoardCinematics.cs now budgets both travel and camera turning along the same continuous 12-second route. Native sampling reduces peak turn from 109.64 to 49.91 degrees/second; peak travel increases 5.32 to 6.60 units/second. Timing remains monotonic and the endpoint matches.
- ShadowCheckersBuild.cs now suppresses duplicate automation request IDs inside the build entry point, fixing bridge timeout retries. Manual menu builds clear the request. Duplicate-request check passes.
- Unity 10,518,617 bytes; app 98,783,380 bytes. Lint, TypeScript, app build and four payload hashes pass. Chromium tour/audio passes at 12.1 seconds, WebKit entrance/overhead/reset passes. One tour recording retained, foreground preview reopened, Editor scene/settings restored. No push/deployment; phone and final subjective acceptance remain open.

## September 25 Shadow Checkers unseen reflection savings

- PlanarBoardReflection.cs now skips the secondary room render when the reflective board is outside the camera frustum. Reuses six planes; conservative bounds include tile bevels. Visible reflections retain their quality and update cadence.
- Actual native camera callbacks verified all 61 sampled positions, with ten avoiding the mirror render and correct resumption on re-entry. Three aspect ratios checked separately; seated-view rendering cost is unchanged.
- Unity 10,521,986 bytes; app 98,786,749 bytes. Lint, TypeScript, build and four hashes pass. WebKit entrance/overhead/reset passes; original Editor scene/settings restored. Local preview refreshed; no push/deployment. Phone performance and final reference fidelity remain open.

## September 25 Shadow Checkers night window and entrance

- Widened the window, moved adjacent bookcases, added layered walnut casing and corrected the sill. Replaced opaque glass with a dark dusk view and smooth bare branches clipped to the opening; no new texture or realtime light.
- Continuous tour now enters through the right pane. Native crossing and six early rendered-frame checks pass; branch mesh 1,344 vertices / 2,352 triangles; shader messages empty. Native detail and final browser frame reviewed.
- Unity 10,518,138 bytes; app 98,782,901 bytes. Lint, TypeScript, build and four hashes pass. WebKit opening/overhead/reset passes; Chromium 30.60 submissions/sec, 658 draws/frame, 33.4 ms p95, no intervals over 50 ms. No push/deployment; physical phones and final reference fidelity remain open.

## September 25 Shadow Checkers mobile texture format

- TextureImport.cs now uses ASTC 6x6 at unchanged resolutions for ten study textures. BuildWeb also refreshes PNG atlases. Audit estimates 6.93 MB compressed mips versus 61.87 MB RGBA32 expansion; this is not measured phone memory.
- Unity 10,474,272 bytes; app 98,739,035 bytes (94.16 MiB), within cap. Lint, TypeScript, build and four hashes pass; Editor scene/settings restored. Chromium/WebKit pass entrance, capture, kinging and pause; final landscape frame reviewed.
- Added texture capability/upload reporting to shadow-checkers-render-profile.mjs. Desktop ASTC support is absent and fallback RGBA uploads work; final profile 30.61 submissions/sec, 658 draws/frame, 33.4 ms p95, no >50 ms intervals. No push/deployment; native phone ASTC uploads, sustained performance and reference fidelity remain open.

## September 25 Shadow Checkers lossless delivery and cache versions

- ShadowCheckersBuild.cs now uses Brotli fallback and omits Unity's optional splash. Player 11,721,131 -> 10,100,720 bytes; app 98,365,483 bytes (93.81 MiB), leaving 1.63 MB under the unchanged cap without reducing art/audio quality.
- Fixed compression cache collisions: native publisher and package-shadow-checkers-unity.mjs version manifest/index URLs by encoded SHA-256. Added shadowCheckersDelivery.node.test.mjs covering compression changes with reused names, stable unchanged assets and idempotent packaging. Actual decoded framework/wasm hashes match the gzip baseline.
- Lint, TypeScript, build, regression test and four source/dist hashes pass. Both browsers pass opening/capture/king/pause. Final Chromium blocks unversioned assets and verifies four versioned requests (`material-chromium-1790323042344`). Editor state restored; preview refreshed. No push/deployment. Physical phones, hosted/PWA cache behavior and final reference fidelity remain open.

## September 25 Shadow Checkers furnished study armchair

- Added StudyChair.cs and its MedievalStudy.cs integration: turned walnut frame, continuous curved crest, padded leather with recessed buttons, brass tacks. Three combined meshes reuse existing textures/materials; no runtime animation or new texture download.
- Native geometry/contact/tour checks pass: 6,021 vertices, 10,496 triangles, floor Y -4.625, table gap 1.248, minimum camera clearance 4.694 over 361 spline samples. Native close-up and final browser frame reviewed.
- Unity 11,721,131 bytes; app 99,985,358 bytes, leaving 14,642 bytes under the cap. Lint, TypeScript, build and four hashes pass. WebKit entrance/overhead/reset passes; Chromium 29.98 submissions/sec, 658 draws/frame, 33.4 ms p95 and no intervals over 50 ms. Editor scene/settings restored/reimported. No push/deployment; physical phones and final reference fidelity remain open.

## September 25 Shadow Checkers photographed leather grain

- Added credited CC0 Brown Leather grain shared by table folios and library bindings. StudySurface.shader preserves existing cover colors/gilding with spatial grain and polish variation; MedievalStudy.cs binds the shared map; TextureImport.cs limits WebGL to 256 px.
- Native close-up and final browser frame reviewed; shader messages empty. Unity 11,710,828 bytes; app 99,975,055 bytes, leaving 24,945 bytes under the unchanged cap. Lint, TypeScript, build and four player hashes pass; Editor scene/settings restored/reimported.
- WebKit opening/overhead/reset passes (`material-webkit-1790321709804`); Chromium 29.98 submissions/sec, 630 draws/frame, 33.4 ms p95, one interval over 50 ms (`render-chromium-2-1790321746527`). Desktop evidence only. No push/deployment; photo-reference fidelity and physical-phone proof remain open.

## September 25 Shadow Checkers dimensioned marble base

- Confirmed stone-base streaks came from stretching a unit cube 10.1 x 0.7 x 10.1. Added StoneBaseMesh.cs and updated ShadowBoard.cs to use actual mesh dimensions, unit scale, uniform stone mapping and a small 0.045 bevel.
- Native geometry: 96 vertices/108 triangles, no inward/degenerate triangles, unit normals. Footprint and contact height unchanged (bottom -0.955, top -0.255); collider size and mesh cleanup retained. Native appearance reviewed.
- Unity 11,684,715 bytes; app 95.32 MiB. Lint, TypeScript, build and four player hashes pass. WebKit opening/overhead/reset passes (`material-webkit-1790320978648`). Generated Editor scene/settings restored/reimported. No push/deployment; reference fidelity and physical-phone proof remain open.
## September 25 Shadow Checkers walnut tabletop finish

- Fixed wood polish being overridden by the roughness map. StudySurface.shader now preserves the intended finish with restrained variation and softer grain normals; MedievalStudy.cs retains more of the wood photograph's natural color. No new textures, geometry or passes.
- Native table view reviewed; shader messages empty. Pale streaks on the separate stone board base remain to investigate, especially its scaled object-space texture mapping.
- Unity 11,684,451 bytes; app 95.32 MiB. Lint, TypeScript, build and four source/dist hashes pass. WebKit opening/overhead/reset passes with zero page errors (`material-webkit-1790320507242`). Generated Editor scene/settings restored/reimported. No push/deployment; phone performance and reference fidelity remain open.
## September 25 Shadow Checkers continuous marble surfaces

- Added opt-in object-space triplanar mapping in Marble.shader, preserving stable per-piece cuts and the board tiles' cheaper UV path. Revised silver/slate tint and reduced mineral polish variation. No new texture or geometry. Native close-up reviewed.
- Resolved a mobile SM3 interpolator limit by deriving local coordinates from existing inputs, without raising shader requirements. Final shader messages empty.
- Unity 11,685,136 bytes; app 95.32 MiB; lint, TypeScript, build and four source/dist hashes pass. WebKit opening/overhead/reset passed (`material-webkit-1790320029307`). Generated Editor scene/settings restored/reimported. No push/deployment. Physical-phone cost and reference-photo visual acceptance remain open.
## September 25 Shadow Checkers seated camera and raised-piece selection

- Lowered perspective camera Y from 7.4 to 5.4 for more room depth; the continuous entrance inherits this final position. Kept orbit/reset and overhead behavior. Reviewed native composition and landscape framing.
- Reproduced board-plane picking error: touching a far-side piece top yielded row -1. ShadowBoard.cs now tests cached token mesh bounds first, then the board for empty destinations, including updated crown bounds and both player orientations. No new colliders or per-frame work.
- Added Editor/PointerDiagnostics.cs: 960 native checks pass (192 raised piece/king hits, 768 empty-square hits) across three landscape aspects and four camera modes. Chromium touch/capture/king/pause checks passed (`material-chromium-1790319324571`).
- Unity 11,679,671 bytes; app 95.31 MiB. Lint, TypeScript, build and all four source/dist hashes pass. Generated Editor scene/settings restored/reimported. No push/deployment. Physical-thumb usability and final reference fidelity remain unverified.
## September 25 Shadow Checkers static reflections and window glass

- Excluded moving checker meshes (including crowns/inlays) from the one-time room cubemap while retaining them in the live planar board reflection. Native check: all 48 initial piece renderers excluded from static/included in live reflection. Raised the one-time cubemap from 64 to 128 for room detail.
- Added one luminous, uneven glass surface behind the existing window mullions with no texture download or additional light. Native alignment and reflected highlight reviewed. Sources: ShadowBoard.cs, MedievalStudy.cs, StudyWindow.cs and StudyWindow.shader.
- Unity player 11,677,224 bytes; app 95.31 MiB. Lint, TypeScript, build and four source/dist hashes pass. Chromium and accelerated Windows WebKit opening/capture/king checks passed with zero page errors (`material-chromium-1790318688810`, `material-webkit-1790318774825`). Generated Editor scene/settings restored/reimported. No push/deployment; final reference fidelity and physical-phone performance remain open.
## September 25 Shadow Checkers lighting and highlight control

- Added one-pass HDR tone mapping with protected low-light detail and high-contrast bypass; native HDR/LDR/bypass checks succeeded. Softer warm key, vertex-lit window fill, matched 1.45 candle/flicker intensities and 0.95 baked exposure; no new textures or lights.
- Native/browser views reviewed. Unity 11,675,612 bytes; app 95.31 MiB. Lint, TypeScript, build and four source/dist hashes pass. Chromium: 29.99 submissions/sec, 615 draws/frame, 33.4 ms p95, none over 50 ms (`render-chromium-2-1790318171435`). WebKit opening/overhead/reset passed (`material-webkit-1790318203674`).
- Restored/reimported generated Editor scene/settings. No push/deploy. Physical-phone HDR memory/GPU/thermal performance and final reference-level visual approval remain unverified.
## September 25 Shadow Checkers rounded tabletop folios

- Added `ArtSource/study_folios.py`: rounded leather spines with integrated sewing supports, softened covers and ten uneven page gatherings per book. Kept unequal sizes/offsets, tightened stacking contact, added edge wear and curved gilt spine titles through `study_details.py`. Reused materials/textures.
- Rebuilt editable Blender study, FBXs and bakes. Paper/leather vertices decreased 12,794 to 8,724; with spine lettering, all affected groups decreased 69,816 to 67,654. Final native close-up reviewed in `folios-rounded-native.png`.
- Fixed an observed Windows lock on StudyMetals.fbx by staging FBX/atlas exports outside Assets and replacing atomically; skip unchanged texture copies. Documented `--python-exit-code 1` to surface Blender script failures correctly.
- Lint, TypeScript, app build and source/dist hashes passed. Unity 11,673,324 bytes; app 95.31 MiB within unchanged budget. Generated Editor scene/settings restored and reimported. No push/deployment; final reference-level visual and physical-phone acceptance remain open.
- Chromium and accelerated Windows WebKit opening/overhead/reset checks passed without errors (`material-chromium-1790317143954`, `material-webkit-1790317227291`). Foreground preview refreshed to `rounded-folios-20260925`; no extra browser screenshots.
## September 25 Shadow Checkers banked hearth and ember detail

- Reduced the oversized overlapping fire to staggered tongues with core attenuation. Added four irregular charred logs and 42 ember fragments in one 2,110-vertex mesh, reused oak grain, and a matte charcoal shader with slow ember glow. Pause and reduced-motion clock checks passed; candle animation unchanged.
- Fixed an observed Windows 1224 build-manifest lock with atomic metadata replacement and validated report/output path. Finalized the successful compilation without repeating it, then verified a normal optimized build.
- Preserved the authored fire loop master and added reproducible VBR delivery encoding: 23 seconds, unchanged measured mean/peak (-49.0/-19.9 dB), 29,052 bytes saved. Original music unchanged. Final Unity player 11,719,417 bytes; app 95.35 MiB inside the unchanged budget. Lint, TypeScript, audio lifecycle, build and all four source/dist hashes pass.
- Isolated Chromium: 29.97 submitted frames/second, 653 draws/frame, 33.4 ms p95, no interval over 50 ms (`render-chromium-2-1790316148583`); landscape render reviewed. These are desktop browser measurements, not physical-phone/GPU completion proof. No push/deployment; reference-level visual acceptance and physical-phone validation remain open.
- Accelerated Windows WebKit passed opening/overhead/reset, capture, kinging and pause/resume without errors (`material-webkit-1790316185353`). Final native hearth close-up reviewed; restored the foreground 3D preview at `banked-hearth-20260925`. Generated build-scene/settings churn removed and reimported.
## September 25 Shadow Checkers client/server rules agreement

- Complete-game comparison reproduced a terminal-turn mismatch after black won. Updated `engine/checkers.ts` to retain the winner as the final turn, matching SQL; regression tests cover both sides and immobilization wins.
- Added `scripts/shadow-checkers-rules-parity.mjs` and a shared verbatim SQL-override loader. All 24 seeded games completed with 1,913 matching moves, 52 multi-jumps, 86 promotions and 765 rejected illegal requests. Read-only deployed initial-board/move-function hashes matched the local fixture. Evidence: `rules-parity-1790314779434/report.json`.
- Expanded the continuation fixture to load later stats/crown and SQL lint definitions, including admin crown exclusion. All 31 PostgreSQL 17.5 assertions passed (`sql-continuation-1790314970108/report.json`). Hosted continuation and concurrent transactions remain unverified; migration remains local.
- Lint, TypeScript, 37 targeted tests, documentation integrity and app build passed (95.36 MiB). Native player unchanged. Chromium and accelerated Windows WebKit passed all three ending scenarios (`ending-chromium-1790315040966`, `ending-webkit-1790315105590`). No push/deployment. Scoped diff checks pass; the broader existing native asset diff retains Unity-generated trailing spaces in metadata.
## September 25 Shadow Checkers continuation SQL validation

- Read-only deployed definitions confirmed lost board cosmetics and a conflicting-character fallback. Isolated SQL execution reproduced duplicate rematches and a constraint failure when winner/challenger both chose veil-rogue.
- Prepared `20260925053123_shadow_checkers_continuation_integrity.sql`: one continuation per completed match, retained board/character choices, remaining FIFO queue carried forward, distinct fallback characters, null-safe participant/winner checks and explicit authenticated RPC grants. Added the optional field to `src/lib/supabase.ts`.
- New `scripts/shadow-checkers-sql-qa.mjs` passed 29 assertions on isolated Postgres 17.5, including winning capture/promotion, statistics/crown settlement, retries, two successive challenger handoffs and write/access guards. Production is 17.6; the migration is not applied there. Single-connection fixtures do not prove concurrent transactions, full Auth/REST/Realtime/push or physical devices.
- Docker failed to start on an existing runtime socket error. Removed only the nine verified task-started processes (nine to zero), then used pinned PGlite in ignored output with no app dependency changes. Lint, TypeScript and build passed (95.36 MiB). Native player unchanged; no push/deployment.

## September 25 Shadow Checkers winning animations before results

- Fixed the result overlay masking winning moves. Unity acknowledges the current revision only after camera/piece/victim/ripple motion settles; the screen waits for that exact board. Pause, stale-event rejection, accessible controls and player-error fallback are covered without timing guesses.
- Added `scripts/shadow-checkers-ending-qa.mjs`: full production screen + real Unity and engine, isolated data/auth. Checks final double capture, capture-to-king, pause/resume, reduced motion, result dismissal and rematch dispatch. No ranked server match or global statistics changed.
- Chromium and accelerated Windows WebKit passed all three rendered ending scenarios. Eighteen screen/host tests, lint, application TypeScript, app build and source/dist hashes passed. Evidence: `ending-chromium-1790313850126` and `ending-webkit-1790313914230`.
- Native player rebuilt at 11,696,620 bytes; packaged app passes unchanged budget at 95.36 MiB. All four source/dist player hashes match. Native editor build churn was removed and the original scene reimported. No push/deployment; physical-phone acceptance and remaining visual/server-continuation gaps remain open.

## September 25 Shadow Checkers landscape pickers and results

- Reproduced a 440px character dialog on a 320px-tall phone viewport with an unreachable Create button. Updated `ShadowCheckersScreen.tsx` and scoped `src/index.css` rules for compact landscape board/character pickers and result cards, bounded scrolling, safe-area spacing, 44px close controls and selected-character semantics. Corrected result opacity and artwork cropping after visual review.
- New isolated browser fixture `scripts/shadow-checkers-layout-qa.mjs` checks real React/CSS at four landscape/text-scale profiles in Chromium and Windows WebKit; eight characters, touch targets, bounds, create dispatch, result statistics/dismissal and rematch dispatch passed. Auth/data/actions and the Unity frame are mocked; no server game or ranking changes. Existing 12 screen tests passed.
- Lint, application TypeScript, 12 screen tests, documentation integrity (237 files) and app build passed (95.36 MiB within the unchanged budget). Local only. Physical-phone/PWA/audio/thermal validation, ranked continuation and final reference-level visual acceptance remain open. Native player unchanged in this checkpoint.

## September 25 Shadow Checkers rounded library bindings

- Replaced flat library spine faces/separate metal bands with one textured curved surface and raised sewing supports. Added six horizontal stacks (18 volumes), corrected lean-aware shelf contact and constrained the row end to clear its pillar. Existing tooling atlas remains shared; vertex AO and low model compression preserve shading/ribs.
- Rebuilt the editable Blender study, runtime models and light atlases. Affected mesh vertex total decreased from 170,821 to 169,259. Native close-up reviewed in `library-rounded-native.png`; final reference-level realism remains open.
- Unity Web build succeeded (11,695,252 bytes); app passes unchanged size gate at 95.35 MiB. Lint, TypeScript, source/dist hashes and Chromium/accelerated-WebKit opening/overhead/capture/king/pause checks passed. Updated the foreground preview; no push or deployment. Physical-phone/PWA/audio/thermal validation remains separate.

## September 25 Shadow Checkers Windows WebKit compositor diagnosis

- Isolated the earlier roughly 10 FPS result: Unity's measured loop took about 9 ms; suppressing draw submissions and a real canvas tap did not improve cadence. Playwright 1.61.1 explicitly disables accelerated compositing on Windows WebKit.
- Added opt-in `--accelerated` comparison and loop/rAF timing to `scripts/shadow-checkers-render-profile.mjs`. Removing only that flag reached 30.97 FPS; a visual repeat reached 30.98 with unchanged detail, resolution, 654 draws/frame and player payloads. No sampled submission intervals exceeded 50 ms.
- Accelerated WebKit passed opening/overhead/reset, double capture, kinging and pause/resume (`material-webkit-1790311513960`). Lint, TypeScript and app build (95.31 MiB) passed. Physical-device/thermal/audio and final reference-fidelity acceptance remain open. No production code change or deployment.

## September 25 Shadow Checkers original feature screen checks

- Added eight behavior cases to `tests/ShadowCheckersScreen.test.tsx`; all 12 screen tests passed. Covered both board skins, eight character choices, occupied-character blocking, exact-table queue/spectate routing, disabled spectator Unity input, result totals/dismissal and rematch versus next-challenger selection.
- Tests render the production screen/Unity host with a mocked data hook. They do not prove server ranking/queue continuation or physical-device behavior. Updated the feature parity table to distinguish interface evidence from retained source and live evidence. No production code change, ranked game completion, push or deployment in this checkpoint.
- Lint, application TypeScript, app build (95.31 MiB within the unchanged budget), documentation integrity (237 files) and scoped diff checks passed.

## September 25 Shadow Checkers rendering work reduction

- Added an actual WebGL draw-submission diagnostic (`scripts/shadow-checkers-render-profile.mjs`). Baseline: 970 calls/rendered frame; Chromium approximately 29.96 submitted frames/second, Windows WebKit approximately 9.57. Lowering DPR to 1.5 barely helped WebKit, so resolution remains unchanged.
- Combined 64 stationary beveled board tiles into two color meshes with their original texture cuts. Preserved the FBX root orientation/unit conversion, ray-plane input and material switching. Added a serialized instanced marble template and per-instance stone offsets.
- Final WebKit draw count is 654/frame, 32.6% lower, while its roughly 9.87 submitted frames/second remains a limitation. Reviewed the actual image with marble detail, shadows and reflections retained. Native mesh bounds/vertex counts passed; Chromium and WebKit opening/overhead, paused double capture and paused kinging passed.
- Final WebGL build: 11,653,520 bytes. App build: 95.31 MiB within the unchanged gate. Lint, TypeScript and source/dist hashes passed. Evidence is recorded in `SHADOW_CHECKERS_UNITY.md` and the mobile QA log. Local only; physical-phone performance and remaining full-parity acceptance are still open.

## September 24 Shadow Checkers continuous sweep and rendering corrections

- Replaced the three stop/start entrance segments with a continuous twelve-second curved sweep from the window, around the room and into the board. Corrected the overhead camera height, depth-tested coordinate lettering, wall-map framing/orientation, tabletop map clearance and object contact heights.
- Added armillary graduations and ink-pot glazing/detail; varied complete folio dimensions/angles and shelf-book dimensions/lean. Reduced distant-book bevel geometry and retained the existing mobile size gate.
- Pause/resume now holds capture delays, movement, victim flights, ripples and crowning. A live native probe caught early input unlock after a double capture; the fix waits for victim animation completion. All 17 probe checks now pass. A rendered font-occlusion probe found 3,218 visible glyph pixels and zero pixels through the opaque blocker.
- Native WebGL build succeeded at 11,630,668 bytes. Lint, application TypeScript, targeted component/rules tests (21), audio lifecycle checks, and the 95.29 MiB app build passed. Four Unity payloads and music match the built app by SHA-256. Chromium and WebKit phone fixtures passed opening/overhead, paused double capture and paused kinging. Exact evidence is in the feature/QA checkpoint.
- Current work is local. Physical iPhone/Android PWA, sustained GPU/thermal behavior, sound quality and final photo-reference fidelity remain outside this validation. No push or deployment.

## September 24 Shadow Checkers foreground study detail

- Implemented six shared foreground surface groups for wood, paper, leather, wax, maps and wine, plus upgraded library bindings and brass. Added folio tooling/page edges, candleholder/goblet engraving, wax pooling and curled parchment. Existing oak PBR and Mercator sources supply detail independently of the room light atlases.
- Native close-up review corrected washed-out exported vertex colors, coarse brass grain and protruding wax drips. The reproducible Blender bake now reacquires color layers after baking to avoid an invalid RNA reference. Source and rendering changes are in `ArtSource/study_details.py`, `create_study.py`, `StudySurface.shader`, `MedievalStudy.cs`, `TextureImport.cs` and `StudyDiagnostics.cs`.
- Mobile optimization removed 42,048 subpixel shelf-band bevel faces; maps/books retain 2K textures, wood normals use 512px and the remaining furnishings light atlas uses 1K. The initial over-budget build was rejected; the final app passes the unchanged budget at 95.24 MiB. Original music is now a 128 kb/s stereo delivery copy, with the exact prior file preserved in ArtSource and its encoding recipe recorded.
- Final native/WebGL build (11,578,012 bytes), lint, TypeScript, source-to-dist hashes and Chromium/WebKit opening, capture and kinging fixtures passed. Actual Chromium playback confirmed the original two-minute music, 0.11 gain and mute, plus a 9.12-second room pan. Evidence: `material-chromium-1790306016932`, `material-webkit-1790305877481` and `tour-audio-1790306096757` under `output/playwright/shadow-checkers-unity/`.
- This is a local detail pass, not final photo-reference realism or physical-phone performance/audio/PWA acceptance. No push or deployment. The requested presentation pause/resume audit and real-device acceptance remain open.

## September 24 Shadow Checkers softer sound and panoramic entrance

- Replaced pitched plate placements with four subdued CC0 wood/glass contact mixes, controlled attacks/tails and headroom; reduced slide repetition/gain and removed heavy crown pitch-down. Retained the exact original music file.
- Added a nine-second library/map/hearth pan into the board. Browser timing found startup delta skipping a second; capped camera advancement corrected it to 9.24 seconds. The existing Skip room reveal and reduced-motion paths remain.
- Native/WebGL builds, lint, TypeScript, audio lifecycle and app build passed (95.05 MiB). Actual Chromium capture playback/mute passed; original music decoded, looped and played at 0.11 gain with working Play/Mute. Recorded tour and framing reviewed under `tour-audio-1790303186301`; sound audition under `sounds-1790302999212`. Final iPhone/WebKit opening, captures and kinging passed in `material-webkit-1790303336653`. No push/deployment.
- Table/shelf books, wood, metalwork, wax, drinking vessel and maps still require the requested close-detail upgrade; physical-phone acceptance remains external.

## September 24 Shadow Checkers Unity marble integration

- Restored Editor access after the user's Personal-license repair; fresh launch, MCP connection and Play mode passed.
- Checkpoint: integrate stone contrast, per-piece mineral cuts, polish variation and angle-correct reflections; compile native/WebGL, inspect phone-engine opening/capture/kinging fixtures, then retain a visible local preview. Full room fidelity and physical-device acceptance remain separate outstanding requirements.
- Implemented in `Marble.shader` and `ShadowBoard.cs`; native shader/console checks and a reviewed before/after render passed. Final WebGL build has no marble shader diagnostics; lint, TypeScript, 19 focused engine/bridge/board tests, docs and the app build passed. Final Chromium/WebKit phone fixtures passed room reveal, real touch captures and kinging with no page errors. Packaged Unity assets match source hashes; payload 95.06 MiB. No push or deployment.
- User explicitly expanded close-detail acceptance to table/shelf books, wood grain, candleholders, wax, drinking vessel and maps. Source audit found the furnishings bake loses foreground detail and the runtime metal uses a plain shared material. Next checkpoint is foreground material/geometry detail with bounded phone cost; that work remains open.

## September 24 Shadow Checkers marble material study

- Added a reproducible, isolated Blender/Cycles study using the original checker meshes and existing marble/oak textures; reviewed the render and opened the editable scene with a working Blender MCP connection.
- Deliverables: `output/shadow-checkers-material-study/MarbleMaterialStudy.blend`, `silver-black-marble.png`, and README. Source: `native/shadow-checkers-unity/ArtSource/preview_marble_materials.py`.
- Unity Editor launch exposed a missing Personal entitlement. Opened Unity Hub and requested user sign-in/license reactivation. No Unity player assets or production deployment changed. Silver-vein contrast, room fidelity, runtime integration and physical-device validation remain open.

## September 24 Shadow Checkers hosted WebKit verification

- Finished the interrupted hosted iPhone/WebKit gameplay check against current production; actual two-player touches, authoritative moves, realtime turns, chat, landscape layout and camera controls passed with exact QA cleanup.
- Moved the validated late-popup dismissal and foreground settling into the canonical multiplayer script; bounded waits and closed-page failure capture preserve cleanup and useful errors. No game runtime changes or deployment in this pass.
- Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1790296822651/summary.json`. Physical-device acceptance and final reference-level visual polish remain open.
## September 24 Shadow Runner Foundry and Lock route defense

- Foundry east uses16px fresh-calm anchors,200ms second jump and crouched landing.135 sampled Arcade cases and both phone-browser local crossings pass at full health/three lives. Screenshot reviewed; no game geometry or wind changes.
- Added camera-limited arrow bounds/velocity and exact player horizontal bounds to read-only QA snapshots. Input-only Lock defense reacts to visible volleys, permits one ordinary second jump, and stays inside verified clear-headroom corridors.54 actual-Arcade cases pass; rejected early candidates retained in test history.
- Local runner-lock-local-2026-09-25T03-43-33-631Z passes all11steps/both guards/checkpoint on both engines. Three lives, no page errors; Android minimum5HP then normal checkpoint healing, WebKit12HP throughout. Only setup placement is injected. Screenshot reviewed; no full-route claim.
- Lint/typecheck/build and386Node checks pass; runtime D5XrMwCL / Games CJHjhsgw,92.68MiB. Full Jest passes300suites/2,604tests with16existing auth TODOs. A failing-before regression fixed checkpoint retries dropping defense after a consumed power. Full normal replay01 was cancelled for that correction;02 is terminal: WebKit194steps/five Flames reaches Sovereign Last Light at2/24HP before exhausting lives. Chromium20steps stalls healthy under gap04; both attempts have zero page errors and matching hashes.
- The recorded gap04 overshoot now has an actual-Arcade failure control. A20px earlier input takeoff passes45sampled cases and both local phone browsers at12HP/three lives in runner-prism-entry-local-2026-09-25T03-58-17-024Z. Setup is logged; geometry unchanged.202focused Jest,386Node and lint pass after that policy edit; full replay remains needed. No full-route cell closes. Campaign/mastery/finale/device/release gates stay open; no push or backend changes.

## September 24 Shadow Runner Relay muzzle cover

- Reproduced orbs escaping a low roof at 30/60/120fps when their muzzle started inside it. The factory now checks the scaled body across the whole muzzle reach against enabled solids. Eight regressions preserve open-shot damage/speed, clear launches, both directions, multi-orb attacks and disabled cover. No enemy-stat or power-placement change.
- Corrected ten normal and ten mastery checkpoint move targets to finish past the real trigger line despite arrival tolerance. Game checkpoints are unchanged. Both new contracts failed before correction.
- Full Jest passes 300 suites / 2,581 tests (16 existing auth TODOs); lint, app TypeScript, build and final 379 Node checks pass. Runtime BCEXLdJE / Games Cu5aidEp, 92.68 MiB.
- Fresh local crawl probe 03-08-49 passes Chromium/WebKit: full health through cover, both guards defeated, all three lives, final 8/12HP and zero page errors. Setup placement/prior Rival kill are explicit; no restore or power grants. Reviewed screenshot. Full normal runner-relay-cover-route-20260924-01 is terminal: Chromium162steps/four Flames confirms Crown acquisition/recovery then exhausts lives in Lock's arrows; WebKit53steps stalls at Foundry's east wind anchor with12HP/three lives. Both have zero page errors/matching hashes. Next: Lock defense and physics-backed anchor tolerance; no full-route cell closes. Creative/mastery/finale/device/release work remains open; no push.

## September 24 Shadow Runner projectile fire alignment

- Fixed stale impact-sprite placement, storm bounds below the floor, wall/ceiling floor-fire spawning and detached moving-support hazards. Actual Arcade collision surfaces now own fire placement; tilt caps forward their process-callback body. Expiry and pooled reuse clear ownership.
- Six original regressions failed before the fix. Now 96 focused tests, 299 full Jest suites / 2,573 tests (16 existing auth TODOs), 377 Node checks, lint, app TypeScript and build pass. Frozen runtime D3EwwbQ8 / Games Dk5xkFzQ, 92.68 MiB.
- Both phone engines pass 50 QA-assisted systems checks in runner-impact-systems-20260924-02 with precise storm-floor alignment. Corrected the smoke's stale pooled-fire false positive and waited for the preceding sword to finish; physics-route portions explicitly skipped. Fresh late-Ascent local probe 02-54-14 passes both engines with full health, all lives, checkpoint active and no page errors. Screenshots reviewed/shared.
- No full campaign route or mastery acceptance closes from these probes. Crown acquisition and caster-facing crawl/recovery remain next; creative, finale, physical-device and release work still open. No push, backend mutation or announcement.

## September 24 Shadow Runner late Ascent recovery beat

- Lowered/widened the custom-art gap23 perch to22700/520,192pxwide. Normal traversal now uses one ordinary jump and a wind-braced short drop; upper optional routes/rewards remain. Only the final grenadier's throw cooldown changes to4400ms, preserving damage and other enemies.
- Visible grenade-warning readback and bounded input-only evasion have focused tests. Removed a redundant exposed wind wait; checkpoint targeting now crosses its actual trigger line and stays braced through the ground fight.
-225actual-policy Arcade cases and377Node checks pass. Local runner-late-ascent-local-2026-09-25T02-21-10-764Z passes both engines with no damage,12HP/three lives, checkpoint activation and nearby threats active. Explicit setup placement/prior kills mean this is not full-route acceptance. Screenshots reviewed/shared.
- Frozen runtime CfymhNKG / Games gNhltiKh,92.68MiB build. Refreshed regression passes298Jest suites/2564tests (16existing auth TODOs),377Node checks, lint/typecheck/build, docs integrity175 and diff-check. Real-start runner-late-ascent-drop-route-20260924-01 is terminal: Android172steps/four Flames ends at caster-facing crawl06 after Choir/Lock recovery; WebKit152steps/three Flames ends during Crown retries after a death before its checkpoint. Both exhaust natural lives with zero page errors and matching hashes. No full-route cell closes. Next: checkpoint acquisition and defense through consumed-power recovery/crawl approaches; preserve Dispatch8's reserved Dawnfire budget. Storm impact positioning needs a separate actual-Arcade audit. No push, backend mutation or full-goal completion.

## September 24 Shadow Runner Crown defense and Lock separation

- Input-only route driver follows actual alternating beam states, retreats from overhead geometry, carries observations between adjacent steps, and departs on fresh high-beam clearance. Earned Flame4 detours can be omitted only after witnessed checkpoint recovery; no gameplay state mutation.
- Fixed authored Lock arrows reaching back into Crown's beams. Lifetimes3400/3500ms retain the full Lock firing corridor, speed, damage and cadence. Range regression reproduced the original overlap; no other volley or beam change.
- Fixed driver-only pickup crouching/exact-coordinate re-visits and a waiting point beyond its own defensive jump boundary.90real Arcade beam cases and nine safe-anchor departures pass, plus374Node checks.
- QA-assisted local runner-crown-local-2026-09-25T01-26-07-655Z passes both browsers at3lives, Android9HP/WebKit8HP, two guard kills and natural Flame4/Aether acquisition. No page errors. Setup is logged; full-route acceptance remains separate. Frozen runtime CuWoSaKx / Games BenChcKr,92.68MiB. Final regression passes298Jest suites/2547tests (16existing auth TODOs),374Node checks, lint/typecheck/build, docs integrity175 and diff-check. Screenshots shared; no push/backend mutation.
- Full runner-crown-exit-route-20260924-01 is terminal: both engines naturally earn all five Flames and cross Ascent's refuge, but fail at gap-23-step before the boss. Android177completed steps includes Crown/Lock recovery then exhaustion; WebKit178steps includes one late-Ascent death/Lock respawn then a stall at22573/616,1HP/two lives. Zero page errors. Earned Flame4 skipping and spent-resource preservation are naturally exercised. No full-route cell closes. Next: supported late-Ascent wind staging under grenade/arrow pressure, plus combat/descent consistency.

## September 24 Shadow Runner held movement and wind routes

- Fixed shared Arcade drag cancelling held crouched wind control and varying run distance by render FPS. Running/crawling now retain authored speed at30/60/120fps in both directions; release braking and tilt support ownership remain intact.
-145focused Relay/Captain Jest tests and365Node checks pass, including81Foundry/405Ascent sampled crossings. Lint/typecheck pass; full Jest now passes298suites/2537tests with16existing auth TODOs. Build Dj4VLLIi / uXUgEAQo passed with92.68MiBpayload before later test/policy-only edits.
- Captain Moonwell mastery now waits for fresh calm at the actual descent takeoff. Foundry fights both guards before the lift and only jump-strikes on fresh calm; no enemy/health/wind nerfs. Mid-traversal screenshots were delaying controls, so the local probe now captures terminal outcomes only.
- Both-engine Ascent local crossing passes in runner-ascent-local-2026-09-25T00-35-50-743Z. Foundry run00-34-23crosses on both; Android clears the guards/checkpoint, WebKit loses a life fighting the lancer. These are QA-assisted local probes, not full-route acceptance. Screenshots shown to Tayler. Full campaign, creative/finale and release gates remain open; no push or backend change.

- Fresh normal routes runner-movement-opening-20260924-01 pass tutorial/East Gate on both engines, with no deaths or page errors and matching bundle hashes. Four normal cells are verified on this build, not mastery/finale acceptance.
- FullLevel10 runner-movement-relay-20260924-01 failed on both engines by exhausting lives. Android recovered twice at Foundry, then died jumping into Crown's active high beam after Flame4; WebKit cleared Foundry alive, first died at Lock19971/545, then exhausted two Crown retries. No page errors; hashes match. Recovery preserves earned/spent state. Next: Foundry defense, Crown beam-aware fighting/Flame/departure, unnecessary earned-Flame revisits, and Lock volley descent. No boss/full-route acceptance or push.

## September 24 Shadow Runner Ascent recovery refuge

- Added one visible custom-masonry refuge over gap22; normal play now uses two single jumps and fresh calm windows beneath the phase platform. Preserved the upper mastery route, wind/phase timing, enemies and rewards.
- Actual-policy Arcade coverage passes405crossings at30/60/120fps, five input cadences (80-180ms), nine arrival times and three offsets, with natural Aether pickup and no geometry/hazard defects. Three missing-refuge controls fail as expected. Route-specific16pxanchors are bounded and do not relax other routes.
-162focused Jest,362Node, lint, TypeScript and build pass. Three diagnostic `.at()` compatibility errors fixed without changing the library target. Frozen runtime BvWWij5K / Games B3gqxZbo;92.68MiBpayload.
- Both-engine normal checkpoint replay runner-ascent-refuge-20260924-01 failed in Foundry before the refuge (Android42steps/12HP/3lives; WebKit52steps/7HP/2lives). Zero page errors; driver wind anchoring and stair timing remain open. No full-route cell closes.
- Separate QA-assisted local crossing runner-ascent-local-2026-09-25T00-03-58-662Z passes both engines at12HP/3lives with natural Aether pickup. Earlier Android diagnostics exposed edge landing reversal and needless waiting under fire; target moved farther onto floor and redundant wait removed. New script logs setup, inputs, trajectories and screenshots, blocks remote traffic, never reports campaign completion. Gameplay, refuge and ending images shown to Tayler. M4/M5/M6 remain open; no push/deploy/backend mutation.

## September 24 Shadow Runner playable relay ignition

- Level10 now requires a fresh grounded action after the five Flames and Sovereign defeat; the Flame control lights existing custom art in-world before scoring/saving and the four-scene ending. Other finishes and300/700/1200completion tiers are unchanged. Optional perfection never gates the ending.
- Reproduced and fixed simultaneous binding edge leaks, pending pause inputs and Phaser reset/native-repeat edges. Stale boss-requirement toast clears at readiness; crouched delivery safely stands. Active-time ignition freezes on pause and is fenced on disposal/death.
- Full Jest298suites/2507tests passed before final repeat/stance/toast refinements;144focused plus38smoke tests, lint/typecheck/build pass afterward. Build Cn4wBTsm / DdIks5Uj,92.68MiB. No release claims from counts alone.
- Subsequent full regression passes 298 suites/2513 tests with 16 existing auth TODOs, including those final ending refinements. Separate Ascent physics work postdates this run; it is not final release QA.
- Both phone engines pass50checks in runner-world-ignition-20260924-03, including held/repeated keys, crouched touch ignition, pause, exact scoring, four cinematic scenes, compact568x320layout, replay/skip. Reviewed screenshots. Setup uses QA helpers; no full-route proof is claimed. Run02's incorrect crouch readback path was corrected.
- Normal checkpoint route runner-ignition-wind-route-20260924-01 is terminal. Both engines pass through Foundry/Choir/Crown/Lock, recover once at Crown, then stall at Ascent gap-22-step with two lives (Android9HP/150steps; WebKit12HP/152steps). Zero page errors. Jumping during a warning, followed by full gust force, is reproduced; sampled calm-window use of the existing step is next. Crown still needs deliberate alternating-beam combat/Flame timing; no general impossibility or nerf is established. M4/M5/M6 and all full-route gates remain open. No push/deploy/backend mutation.
- Ascent sidecar uses real movement/wind/phase/Arcade and bobbing pickup collection, including late arrivals. Nine old-policy failures reproduce; an adjusted first leg lands234/243times (nine gate timeouts), but full phase-sync/calm candidate only passes15/81strict cases and is rejected. Diagnostic assertions are not acceptance; no production/policy change was integrated. Next: bounded anchoring and phase/wind coordination or revised intermediate landing, then full sequence and browser proof. All361Node checks pass.

## September 24 Shadow Runner Choir landing pocket

- Review exposed a66-second joint lift/beam wait and a post-launch cadence mismatch. Corrected the sidecar to actual route decisions/input events for waiting, crouch, both jumps, steering and landing; old configuration fails later-arrival coverage.
- Moved only the Choir beams' start to12020, retaining endpoint13400, damage and rhythms. The landing pocket separates lift timing from the next beam corridor. Read-only pause-remaining metadata supports a bounded lift-only guard; no game-state injection. Deadline reduced to10seconds.
-63physics crossings pass across30/60/120fps,80-100msinput sampling, offsets+/-8px and arrivals through180seconds.180focused Jest,359Node, lint/typecheck/build pass. Independent review found no additional concrete issue; pickup/crouch transition still needs live evidence.
- Frozen both-engine normal checkpoint replay runner-choir-pocket-20260924-01 is terminal: WebKit clears Choir/Aether/crawl without further damage, then exhausts lives after Lock. Android fails earlier, but naturally respawns at the new Foundry checkpoint with spent resources preserved. Zero page errors; runtime Co0M94ZD / Games Be4nUe83. No full-route cell closes.
- Reproduced driver failures accepting a wind-warning phase launch and a late calm departure after drift/knockback. Guards now require non-warning wind and supported calm onset; misses wait for the next cycle without extending deadlines.360Node checks and scoped lint pass; live replay remains open. Full campaign/creative/finale gates remain intact; S08 contextual in-world ignition implementation is prepared, not completed. No push/deploy/backend mutation.

## September 24 Shadow Runner Foundry retries and Lock refuge

- Natural finite-life replay now verifies two real respawns and retained resources/enemy defeats on both engines, but both runs still fail before completion. No normal/mastery matrix cell is closed.
- Prism bridge walk-back and combined bridge/shelf recovery are bounded ordinary inputs. Independent review found and fixed a stale return flag with a before/after regression. Lock phase waiting now uses an existing ledge above both arrow lanes; physics passes at30/60/120fps with a bounded phase-window margin, not yet live-proven.
- Added Foundry Approach checkpoint6420/616 to shorten spent-power retries from Prism5000. Existing checkpoint heal applies; lives, powers, enemies and rewards are not reset. All prior checkpoints retained. Updated62-point campaign census/source anchors/diagnostic inventory;107checkpoint/config/geometry and98access tests pass.
- Lint/typecheck/build,353Node and fresh full Jest298suites/2471tests pass (16existing auth TODOs). Runtime v4ZWU05V / Games Cu_zwl90,92.68MiBpayload. Subsequent Choir cases pass the full105-test access file; Ascent guard passes24Relay Node checks and scoped lint.
- Fresh runner-foundry-checkpoint-20260924-01 activates the new checkpoint on both engines. Android recovers twice and reaches Flame4 before exhausting lives; WebKit recovers once, clears Lock and the Ascent Rival, then stalls upright in wind with12HP/two lives. The supported Ascent approach now braces, pending replay. No full route accepted or new-anchor respawn claimed. No push/deploy/backend mutation.
- Choir sidecar proves beam hit then lift-underside cancellation, plus36sampled collision/beam-clean gated crossings at30/60/120fps. Candidate timing and evidence limits recorded in the rebuild plan; not yet wired into browser policy. Next: live Choir synchronization, Ascent continuation, Crown defense and full remaining creative/campaign/finale acceptance. Workers and test/browser commands are terminal; owned4176preview retained.

## September 24 Shadow Runner finite-life recovery verifier

- Added opt-in normal-only checkpoint recovery with all ten L10 source-verified anchors. Default and mastery remain deathless. Only ordinary inputs are used; state is read-only, original time/life bounds retained, and completed normal recovery cannot claim Perfect Route.
- Added exact collected power IDs and simulation respawn counter to detached debug snapshots. Revisiting spent pickups uses positional movement, never renewed buffs. Progress regressions, revived/healed enemies, lost checkpoints and late completion fail closed.
- Independent review found and confirmed fixes for checkpoint identity loss, between-death enemy-health resets and post-read deadline acceptance.95targeted Node/110focused Jest, lint/typecheck/build pass; runtime BzdbK_lZ / Games BThqJzjc,92.68MiB. Full Node347predates the final three regression cases; full Jest297/2455is the prior build's result.
- Live finite-life Chromium/WebKit run runner-finite-lives-20260924-01 pending. D09 remains open; no full-route, recovery-branch, physical-device or release acceptance claimed. No push/deploy/backend mutation.

## September 24 Shadow Runner Foundry combat and story continuity

- S01 lore reconciliation complete: ten source-authored districts, required Moon Shards, Captain/Rival and Sovereign continuity. Fixed L8's already-collected seal handoff and clarified L9's other hostile couriers. Playable ignition and visual world presentation remain open.
- Phone chapter-copy smoke61surfaces passed; reviewed compact/iPhone/Comfort screens. Expanded smoke verifies Replay/Return commands can scroll fully into view and Return actually dismisses the chapter.
- Wind-aware power pickup and grounded-road jump-strikes cleared Foundry drone/gap07 on both engines in runner-foundry-calm-jump-20260924-01. Both died during the guard approach before checkpoint.334Node checks pass; this is partial route evidence, not release acceptance.
- Independent review found drone hit reactions could reuse attack deadlines to create an unwarned dive. Separate sprite-owned timing now cancels safely on combat/lifecycle events, preserves rejected-hit attacks and displays hit feedback.148focused Drone/Sovereign tests pass across all six drone configs; lint/typecheck/build pass. New runtime mB4Q3umh / Games D0iW5yjk,92.68MiB. Fresh full Jest297suites/2455tests passes (16existing auth TODOs), including repaired Captain fixture helper extraction without dropping assertions. No push/deploy/backend mutation; full campaign/mastery, finale and real-phone gates remain open.
- Current-build replay runner-drone-reaction-live-20260924-01: Android completed127steps and collected Flame4 before dying in Crown beams at18671/551; WebKit cleared drone/gap07 but died in Foundry guard approach at7281/616. Both have zero page errors and matching hashes. Final UI smoke76surfaces passes across five profiles with reviewed compact/iPhone/Comfort action screens. D09 finite-life recovery and reactive Foundry/Crown defense are next; no new full-route acceptance cell. All test/browser commands are terminal; owned4176preview retained.

## September 24 Shadow Runner route recovery and visible hazard observations

- Foundry interior staging reached Choir on Chromium and WebKit in separate real-input runs. Repeats exposed unsafe unarmed staging and jump-strikes through Choir beam lanes; route candidates now attack during the approach and keep both Choir fights grounded/crouched. No enemy, hazard, reward or power nerfs.
- Added bounded gap02 takeoff retry and Prism recovery-shelf return after actual missed-jump evidence. These use ordinary controls, retain deadlines/attempt caps, and cannot complete a skipped target or restore state. Recovery-branch live acceptance remains separate.
- Added read-only camera-limited active floor-hazard collision bounds and a supported crouched Captain corridor response. Independent worker added28snapshot cases;81focused Jest and329Node checks pass, as do lint/typecheck/build. Final runtime Dlh6S3Ed / Games CzHBB-rc;92.68MiBpayload. Captain visible-fire run passed Murder Hall/Moonwell in both engines but died in Span; no flame was present during guarded steps, so no live avoidance claim.
- Full route/mastery, finite-life recovery, art/story/finale and phone acceptance remain open. No rebuild push/deploy/backend change. Evidence details in SHADOW_RUNNER_REBUILD_2026-09.md.
- Final runner-prism-shelf-recovery-20260924-01 runs crossed Prism without needing fallback, then both died during Foundry staging. Armed approach alone remains insufficient; calm-versus-gust movement is the next investigation. Independent review reproduced and fixed retreat overshoot and out-of-shelf retry edges with exact regressions;138targeted Node checks/scoped ESLint pass after fixes, with no live branch acceptance claim.

## September 24 Shadow Runner Captain and Relay environment depth

- Generated four original ImageGen masters: storm fortress, pre-restoration relay citadel, transparent watch banner and hanging relay cage. Prompts/masters retained in source-assets/shadow-runner/rebuild; six optimized derivatives including thumbnails total472,322bytes, with provenance in processed-manifest.json.
- Captain/Relay use new chapter art, bounded panorama movement and separate architectural layers (14/16 props). Per-level loading deduplicates textures, decor adds no colliders or per-frame allocations, and pause/Comfort freeze positions. Gameplay geometry and combat are unchanged. Dawn restoration remains reserved for the ending.
- 133 focused Jest and320Node checks pass. Fresh full Jest:296suites/2325tests passed,16existingTODOs. Lint, app typecheck, build, docs and diff checks pass;92.68MiBdeploy payload stays below the unchanged100MBcap. Chromium/WebKit short actual-input art probes pass for both chapters, including nonblank canvas, layer movement ratios, asset loading and pause. Evidence: output/playwright/runner-captain-depth-20260924-01 and runner-relay-depth-20260924-01. Final runtime Dia_cFHy/Games Ch5JUuF6 hashes match those browser proofs. Reviewed screenshots show readable terrain/enemies; these are not full-route proofs.
- Independent bounded review found no concrete integration regression and reproduced all six derivatives byte-for-byte in memory. Reviewer closed. Full district landmarks/story/act progression, routes, boss/ending and real-phone release acceptance remain open; no push/deploy/backend change.

## September 24 Shadow Runner main integration and lossless atlases

- Fast-forwarded the dedicated main checkout to bf08a5b9 while preserving rebuild changes and all upstream game work. Resolved four overlapping files; 226 non-overlapping pre-integration files remained byte-identical. Retained the integration autostash as a backup and left the older unrelated stash untouched.
- Preserved shared landscape gating and soundtrack volume controls alongside bounded/cancellable audio lifetimes. Full integrated Jest: 296 suites, 2315 passed, 16 existing TODOs.
- Eight custom terrain atlases now use lossless WebP with archived PNG provenance and exact visible RGBA regression checks. Removed verified duplicate runtime PNGs; saved 5,517,643 bytes. The integrated deployment payload now passes the unchanged 100MB cap at 92.22MiB. Updated runtime URLs and Level8/9/10 processing outputs.
- Post-conversion: 69 focused Jest tests, 320 Node checks, lint, app typecheck and build pass. All 22 chapter/engine launch-pause checks pass; Chromium/WebKit each decode all eight atlases at authored dimensions. Evidence: output/playwright/runner-integrated-atlases-20260924-01. This is not full-route or real-phone performance proof.
- Five-profile UI smoke passed its original checks, but visual review found a title/back-button text overlap. Expanded assertions reproduced it; compact landscape spacing fix passes all 51 surfaces on the rebuilt UI, including WebKit/Comfort, with reviewed screenshots. Evidence: output/playwright/runner-integrated-ui-20260924-02. Final Level10 launch/pause passes both engines; final runtime yfAiSLcB, Games BObss4Y4. Archive-only atlas regeneration reproduces all hashes. Full campaign art/story, Level9/10 routes, finale and release gates remain open. No rebuild commit, push, deploy, backend mutation or announcement.

## September 21 Shadow Circuit directional terrain polish

- Audited normalized top/bottom terrain across all 149 original levels: no missing model mappings. Fixed reverse-facing chevrons on all four force-floor models (4,098 tiles in 62 levels); random force now advertises four directions (111 tiles in 7 levels).
- Rebuilt the teleporter as a cyan circular pad, distinct from the blue square-spiral exit, following bitmap 308 in the supplied original executable. The exit repeats its spiral on the floor and rear face for free-camera visibility. No original level layouts or force movement rules changed.
- Basic checks: 122 game tests including exported arrow geometry versus simulation, thin-wall/corner-ice collision orientation, and portal silhouette/color; source GLB validation; lint, app TypeScript and build. Browser evidence: output/playwright/shadow-circuit-terrain. Campaign report: output/shadow-circuit/terrain-audit/report.json. Physical-device feel and all-level solutions remain user testing; no full campaign certification is claimed.

## September 21 Shadow Circuit gesture camera and header spacing

- Default movement pad is on the right. The entire opposite half is an invisible camera surface, apart from navigation buttons: captured one-finger drag gives continuous 360-degree orbit and horizon-to-overhead tilt; two fingers pinch zoom without changing orbit. Direct distance-based tracking stops on release. The optional left-handed layout swaps both areas.
- Independent pointer ownership supports moving while adjusting the camera. Pinch membership changes rebase without a jump; cancellation, pause, portrait and unmount clear input. Camera updates no longer restart the simulation frame effect. Grid movement maps to the nearest screen-facing cardinal direction.
- Navigation, level/chips, timer/inventory and pause now share one responsive header grid, with aligned heights, consistent gaps, safe-area insets and an icon-only back button on narrow landscape screens. Large Comfort controls are retained. Focus has continuous sliders/reset; the guide explains the new gestures.
- Camera math and follow invariants pass; full release checks and rendered browser evidence are recorded in output/shadow-circuit/gesture-*. Physical iPhone/Android gesture feel remains an external acceptance check.

## September 20 Shadow Circuit reference polish and original campaign

- User confirmed permission to deploy supplied original campaign/music/assets for personal testing. The build loads all 149 original levels plus three authored fixtures, preserves sequential locks/original passwords, and labels the original campaign on the menu.
- 61 validated Blender templates replace all rendered placeholders, including a square blue spiral exit, chip socket, terrain and mechanisms. Dark wall/lock bodies contrast with lighter floors; the explorer has refined eyes, glasses, hair and sleeves. Static art is still short of exact likeness/final animation acceptance.
- Added interruptible character flyover, fixed-camera settling and three-second countdown. Simulation/input remain paused; reduced motion skips the flyover. Full-surface movement pad supports continuous sliding, quadrant hysteresis, neutral-center stopping and pointer capture. Right-hand camera pad offers manual quarter turns, tilt, zoom and reset; top HUD frees both thumb zones.
- Rotation/loading/submenus use the approved PCB/logo and raised rounded silver/green controls. Original CHIP01/CHIP02 recordings use the actual supplied MIDI scores with General MIDI instrumentation, not the temporary score.
- Models/music/campaign use hash-addressed public game-assets Storage objects with runtime SHA checks and no client-write policy. Frontend remains below the unchanged 100 MB cap. Source/provenance and publishing recipe retained. Physical iPhone audio/PWA performance and full campaign compatibility remain open.

## September 20 Shadow Circuit branded test release preparation

- User authorized main deployment and manual Netlify fallback. Integrated selected PCB branding, existing-format Games card, raised rounded buttons and themed loading.
- Twenty-five static Blender models now cover all monster roles/boots/keys/doors; closer explorer sculpt with separate gameplay LOD. Exact likeness and animations remain unfinished.
- Fixed camera follow orbit, smooth actor motion, music/MIDI support, campaign progression and original-password unlocks. Portrait gate and best-effort native landscape lock follow host game behavior.
- 252 Jest suites pass (1,436 tests), 70 game tests and 58 repository node tests pass. Chromium/WebKit touch/progression checks pass; WebKit-on-Windows audio API is unavailable. Physical phones still need validation. Original files remain private pending redistribution permission.

## 2026-09-20 — Shadow Circuit original reference and classic revision

- User supplied original Windows game ZIP; portable WineVDM 0.9.0 opens LESSON 1. Launcher and setup: `tools/shadow-circuit/Start-Original.ps1`, `docs/shadow-circuit/ORIGINAL_REFERENCE.md`.
- All 149 original DAT records match Python/TypeScript parsers, with both layers/metadata retained. Private atlas inventories every map and mechanism; all layout overview sheets inspected. Campaign completion remains unverified.
- 13 classic gray/green Blender models integrated; colored keyhole locks, IC chips, nine-tile camera, silver HUD and readable terrain/mechanism shapes replace the earlier dark/gold game direction.
- Lesson 1 clears by 96 D-pad taps in Chromium and WebKit, collecting 11 chips/opening eight locks and retaining green key. 37 rules tests and 16 model/budget tests pass; lint, app typecheck and enabled build pass. Physical-device and exact Windows compatibility remain open.
- Originals stay ignored/local, preview is loopback-only, no public maps or original audio/sprites included. No push, deploy, linked migration or paid generation.

# Feature Progress Log

## September 19 Shadow Circuit build started

- User-authorized implementation of `docs/shadow-circuit-build/` inside Shadow Chat; Babylon/TypeScript, Blender assets, default-off launch flag. No push, deployment or linked migration.
- Three authored development chambers clear with real D-pad input in Chromium and WebKit; deterministic core, import parity, device checkpoints and six static Blender calibration exports have recorded evidence.
- This is not a finished sample/campaign or release candidate. Exact original source/rights, historical rules oracle, runtime art/audio, cloud/offline work and physical-device gates remain open. Payload headroom is only about 198 KB under the existing cap.
- Current contract and continuation: [Shadow Circuit status](../shadow-circuit/STATUS.md) and [test evidence](../shadow-circuit/TEST_REPORT.md). Preserve unrelated existing Unity/instruction changes.

## September 13 Shadow Checkers Unity rebuild

- Active user-requested goal: a true 3D Unity game integrated into ShadowChat, preserving the original feature set.
- Checkpoints: modeled scene and visible preview; host/game integration and parity; rules, multiplayer, mobile and build verification.
- Contract and evidence: [SHADOW_CHECKERS_UNITY.md](SHADOW_CHECKERS_UNITY.md).
- Existing unrelated AGENT.md, AGENTS.md and docs/AGENT_REFERENCE.md edits remain untouched. The user authorized preparing the production replacement on September 13; main-only release checks are in progress. Routine screenshots are disabled.

## September 8 Shadow Runner Campaign Rebuild

- September24: fixed actual fallen-enemy physics recovery. Sprite-only placement
  carried15px/31px of old fall motion into the floor at60/30fps; body reset now
  preserves spawn contact and existing health. Three NPCs tested at30/60/120fps.
  Relocated the existing Span Shield before the exposed approach with full bob
  reach; WebKit collected it and crossed the bridge before a later death.
  47Shadow Runner suites/894tests,317Node checks, lint/typecheck/build/budgets pass.
  Fresh DNhwPwXV replay: Android cleared the Stalker but died at Murder Hall's
  floor flame; WebKit cleared Span and died at15965 in the Inner pikeman fight.
  Both had zero page errors; neither sampled an enemy-fall recovery, so that
  fix's proof is the installed Arcade regression, not browser recovery yet.
  Full routes/mastery remain unaccepted. All replay processes are terminal.
- Read-only Foundry review identifies likely bomb knockback, not Lancer contact,
  in the earlier west-edge death. Local main is five commits behind origin/main;
  shared audio/orientation/package changes need integration without losing either
  workstream. No push, deploy, backend mutation or scope reduction.

- September12 phase/protection continuation: normal Relay strategy now clears
  all seven phase undersides. CRPBoA1b run reached Flame4, then died while
  waiting in archer fire; crouched-wait retry died earlier to Foundry knockback.
  Full clear/repeatability remain open, not replaced by partial success.
- Independent L9 review led to a finite bridge Shield at5600/558,9seconds,
  4configured charges,0pickup points/no healing; actual block scoring and
  stacking rules preserved. Full bob reach, single collection, expiry,
  depletion and unchanged objectives tested.100focused Jest/317Node plus lint,
  typecheck and D8aKiKum build/budgets pass. Both-engine input replay is pending.
  No release, backend mutation or scope reduction.

- September12 Catacombs depth pass: custom ImageGen panorama and genuine-alpha
  hanging lantern, preserved masters/prompts, optimized derivatives and exact
  manifest provenance. Two separate bounded layers honor live Comfort and pause.
  Di-c5dCm/DnKSvZSp phone art checks pass on Chromium/WebKit, including ordinary
  input, distinct camera rates, actual pixels, loaded assets and one canvas.
  Latest art/catalog checks:315Node,116focused Jest, lint/typecheck/build pass.
  Full-route spectral readability and normal/mastery acceptance remain open.
- Latest late-level replays still fail: L9 died at the Murder Hall Jester before
  reaching the grounded Rival change; L10 hit by a drone during phase boarding.
  New production recovery gate stops Gearwing drones chaining dives outside
  their patrol or before regaining flight height. Nine regression cases failed
  before and pass after;58focused AI/lifecycle/boss tests pass. CRPBoA1b replay
  cleared the full Foundry sequence through both guards, gaps07-09 and Flame2;
  died below phase04 at gap10. Fresh phase boarding is the next strategy to test.
  Full-level/repeated survival remains open. No push, deploy or backend mutation.

- September12 continuation: generated and integrated Candle Fair panorama/thumbnail
  with preserved ImageGen master/prompt, provenance, bounded Comfort-aware movement
  and reviewed Chromium/WebKit phone launch/pause screenshots. Phase02 input strategy
  now witnesses fresh solidity, boards, then descends crouched; late normal routes
  remain under replay. L9 Span/Inner strategy reviewed from actual damage/wind traces.
  Full308Node checks, lint, typecheck and DFLQg13v build/budgets pass. Full Jest refresh
  completed:290suites/2279tests pass,16pre-existing auth-invite TODOs remain.
  No release or scope reduction.
- Latest frozen DFLQg13v input evidence: L10 phase boarding, crouched descent,
  Chrono, stair, drone kill, gap07 and Aether succeeded within a natural run.
  Standing grenade-fight input then released bracing in active wind and died;
  the next fix is supported braced combat. L9 Rival survival is variable and
  prevented the revised Span/Inner strategy from being reached in the latest run.
  Neither level has a full accepted normal clear. Latest Node310/310 pass.

- September12 resume: old workers are confirmed absent; full scope is resumed,
  not reduced to the release-only estimate. Captain's seven access/recovery
  shelves and dedicated optional Moonwell Sunsteel are integrated from passing
  actual-Arcade proposals; the pickup adds no healing or score and preserves
  the ground combat pickup. A failing regression exposed the Moonwell normal
  landing inside a lift shaft; the deck extends30px and normal/mastery target
  its clear east apron after observed wind rest.153focused Jest/35Captain Node
  checks and fresh application typecheck pass. Full browser survival, mastery,
  final campaign/art/finale acceptance and deployment remain open. No push.
- September9 acceptance checkpoint: L8 Android ordinary route now clears with
  all3seals,12HP/3lives and zero deaths/pageerrors on DD4iaELO/BCPRIUrO.
  Actual L9 exact-overlap melee failure is fixed with86focused passing checks.
  Fresh L9/L10 ordinary attempts still expose wind/projectile survival risks;
  bounded observed wind timing and destination-landing input corrections are
  being replayed. Driver/Relay63Node checks pass. Full Jest was284/289suites,
  2206/2231tests passing,9failures/16TODOs, not accepted. Loading dialog overlap
  and stale tutorial smoke text now have18/38passing targeted checks; remaining
  Captain/NPC fixture failures are under review. No release; goal remains open.
- September9 late-route batch: widened the L8 Vault launch corridor, restaged
  ten L9/L10 roof-intersecting NPCs and added ground-NPC roof collision. Four
  Sovereign tell/cancellation/beam defects now have passing regressions. L10
  upper routes and lift shafts are integrated using existing generated masonry;
  91 live-config physics checks include all eight lift board/carry/exit paths.
  Frozen D_fQu21F/BnkhcSnl build passes budgets; ordinary L8/L9 input replays
  run next. Earlier CcpzYQAN natural-death failures remain preserved. All late
  normal/mastery route acceptance and final release remain open; no push.
- September9 resumed: ceiling-safe shared lift carry and calibrated moving deck
  art are integrated. Four Captain shafts now have full-body lateral clearance,
  with unchanged pace/height and no enemy spawn move.67 helper/shaft/bridge and
  70 shaft/geometry/config checks pass; full lint/build/budgets pass. Frozen
  CcpzYQAN/Drx-lVfx build is in ordinary L8/L9 Android replay. Echo route now
  verifies its natural Mirror Ward before exit;34 policy checks pass. Captain
  mastery targets need updating for the new shafts; L10 access/NPC/boss work
  remains active. Neither final acceptance nor release is claimed.
- September9 00:30ET: input-only L9 exposed a real projectile/tilt callback
  argument-order crash. Actual PhysicsGroup regression reproduces it then
  passes with cap-first dispatch.137focused tests/scopedlint/type/build pass.
  Actors now draw above terrain so feet/crouch bodies stay visible. New frozen
  CAWCh3Br/pvZdJTZM build awaits visual retake and ordinary L9 input replay.
  L8 reaches later Echo passages but survival policy is still being refined;
  high mastery access and player lift/ceiling audits remain open. No release.
- September9: L5 Android input-only mastery clears44coins/all10enemies;
  L7 normal clears all3required shards. Both deathless, zero pageerrors.
  Captain bridge art now anchors actual deck row147, not decorative rail101;
  body geometry unchanged.98focused tests/type/build pass. New frozen build
  C-4U6pus/bftSXMf_; fresh two-engine contact screenshots run next.
- M2 behavior accepted with an explicit WebKit unload-fetch diagnostic limit:
  standalone caught-fetch and signed-out non-Runner controls reproduce it.
  Raw80/81,17/18 and23/27 records are preserved, not called console-clean.
- Ten fresh bridge idle/jump cases pass across both engines, with native/capped
  rendering and documented NPC isolation. WebKit actual48-53/20-21fps, not60/30.
  Walk/crouch/end-fall evidence is older uninterrupted trials and physics tests.
  Thirty actual-Arcade crouch checks
  cover29 passages plus a negative control; no geometry correction needed.
  Captain bridge plank contact still has a visual review open. Late routes run next.
- Fresh DRzpbwV9/Cs_BzWrF build fixes browser-confirmed tilt exit cleanup after
  Arcade nulls its world. Actual plugin shutdown/destroy regressions reproduce
  the failure then pass;132 focused tests, scoped lint/typecheck/build pass.
  Fresh WebKit journal and bridge quit/replay browser retakes remain required.
- Moving-lift audit:13 lifts,14 intersecting patrol pairs,90 installed-Phaser
  cases; no enemy trap/fall/reset reproduced. Keep spawns. Transient NPC/lift
  penetration remains a visual collision follow-up, not accepted gameplay.
  Browser matrix retains exclusive use of frozen ahbG1Kyp/DMsuHE_K.
- Direct-main release is explicitly authorized after the remaining gates pass.
  Fresh correlated WebKit narrative retake and late mastery routes remain open;
  no push/deploy or production data mutation has occurred.
- Fresh integrated build ahbG1Kyp/DMsuHE_K passes typecheck/build/budgets
  (86.53MiB417files),161 focused integration tests and19 asset checks. Whole
  enemy poses, actual rotating-deck contact and supported Captain seal layout
  are integrated. Two-engine bridge diagnostics run next; no release yet.
- 23:02ET source checkpoint: L8 recovery crawl and L10 Choir exit traps corrected
  with actual-body tests; original enemy-pose recovery and rotating bridge
  integration underway. L8-L10 normal candidates are wired, not yet played.
  L10 harness now observes powers/objectives/boss death and the four ending
  buttons without fabricating progress.49 focused contracts pass.
- Chromium soundtrack lifecycle passes actual playback; local Windows WebKit
  lacks Web Audio entirely, so only its graceful silent fallback is verified.
  Physical iPhone audio/lock-screen checks remain open.
- Latest verified snapshot CUiitMrL:22/22 all-chapter phone launches/pause pass;
  calibrated ground contact reviewed on Candle/Clockmaker/Relay screenshots;
  compact checkpoint art12/12 checks pass. Rebuilt tutorial/East Gate normal
  and mastery cleared in both engines, eight deathless ordinary-input wins.
- L6 Chromium normal now clears with12HP/three lives,22coins and10of12enemies.
  L7 first shard and two checkpoints traversed, then an optional stalker fight
  stalled. Trace exposed an enemy spawned12px inside its floor and resetting
  under the map. Targeted correction and all-grounded-spawn audit are underway.
- Static terrain art has28 calibrated contact frames. New custom ImageGen
  masonry covers24 Relay and five Captain rectangular steps/cover. Captain is
  source-only after CUiitMrL;84 focused tests and six asset checks pass.
- A newly confirmed Lancer atlas-cutting defect splits nonuniform source poses
  between frames. Replacement sprite source/processing is in progress; rejected
  opaque checkerboard drafts are not runtime assets. Bridge geometry has47
  isolated tests, but integrated rotating-contact work remains open.
- No rebuild commit, push, database mutation, deployment or announcement yet.

- Active goal: audit and rebuild tutorial plus all ten levels on `main` in
  `C:/repos/chat2.0-main`; source/live baseline `aefb1e5c` verified.
- Scope, 29 ranked findings, chapter outline, custom art production brief and
  acceptance gates: [Shadow Runner Rebuild](../SHADOW_RUNNER_REBUILD_2026-09.md).
- Complete: three independent source/geometry/UI-art audits, linked catalog
  read, existing two-engine Level10 smoke, 22 all-level phone launch/pause cases.
- In progress: M1 runtime recovery/timing/collision, account-safe progress and
  loading, impossible-item and crouch geometry repairs. M2 phone presentation
  and story foundation begins alongside disjoint reliability patches.
- Historical first input-only wins: tutorial and route 1, keyboard and button
  movement on both engines; eight wins, no deaths, both route-1 enemies defeated.
  Tutorial geometry has since been rebuilt; its previous proofs are historical.
  These do not prove all coins or perfection. Evidence is retained under
  `output/playwright/runner-input-proof-*` with inputs, trajectories and hashes.
- M2 integration: readable chapter list plus illustrated map, Continue Journey,
  saved best-run display, dispatch journal, portrait menus, Comfort sound gates,
  and truthful save-status details. Engine alone loads required route assets.
- Full app Jest: 259 suites passed, 1,619 tests passed, 16 todo. Subsequent
  ending component adds eight passing focused tests; totals overlap.
- L2-L4 input-only normal/mastery sweep: 11 of 12 engine/mode cases passed.
  Chromium L4 mastery died naturally at the second archer; WebKit full clear
  passed. Preserve that failure for difficulty review, not a completion claim.
- Ending now has player-paced relay ignition, two new custom ImageGen scenes,
  keyboard focus containment, image retry and replay without duplicate credit.
  Fresh two-engine finale/compact acceptance passed. Compact title overlap was caught by
  screenshot review and patched with an explicit overlap regression assertion.
- Lifecycle stale-debug cleanup is fixed: six cases and 78 checks passed on
  both engines, with no retained destroyed-scene references.
- Shared pickup centers now match scaled, bobbing sprites. L5 original crouch
  coin and gauntlet shield passed real-input retakes. Chromium L5 normal cleared
  all ten enemies with no deaths; mastery and L6 route work remain open.
- Tutorial now teaches jump/double-jump/crouch/combat in a forgiving 2,760px
  courtyard. Twenty-two earned local story notes and a paused journal are wired.
- New Ivy, Bell Tower and Clockmaker backgrounds join opening/Market/Causeway
  art. Geometry-aware generated checkpoint wayposts add no collision bodies.
  Fresh build and budgets passed (86.25 MiB payload); 22 phone launch/art checks
  and new narrative UI acceptance are running next.
- Open: remaining input-only complete routes, all mastery paths, new art rollout, combat
  balance, repeated lifecycle/performance and physical-device validation.
- No rebuild release or announcement posted. Passing diagnostic teleports do
  not count as legitimate playthrough proof.

## Documentation Status - July 15, 2026

Refreshed for the July 10 Release A deployment. Historical feature entries
remain below; current shipped-versus-candidate status and follow-ups are tracked
in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Use this log for long-running `/goal` work and feature implementations that span
multiple checkpoints. Keep entries concise, factual, and tied to verification.

## July 27 Shadow Runner Level 8 Production Candidate

- Built Courier Catacombs as a 16,200-pixel campaign level with eight bounded
  checkpoints, 72 coins, 22 enemies, six tilt bridges, five crouch gates, ten
  arrow-volley lanes, six spectral platforms, and nine sleeping encounters.
- Added Tomb Lurkers, Crypt Wardens, the Rival Courier, Wraithlight and Mirror
  Ward powers, three required Relay Seals, five optional Courier Caches,
  guarded enemies, reflected projectiles, sealed arenas, and full-clear versus
  perfect-route completion goals.
- Generated and processed an original Level 8 art suite for the environment,
  terrain, enemies, powers, objectives, campaign button, and thumbnails. Runtime
  assets are isolated behind the Shadow Runner asset catalog and load only for
  Level 8.
- Reworked the route after automated playtesting so crouch lanes, hard upper
  paths, long jumps, under-platform rewards, bridge falls, recovery routes, and
  the final sanctum remain challenging without becoming progression blockers.
- Full design, asset inventory, tuning contract, and as-built release evidence:
  [SHADOW_RUNNER_LEVEL_8_COURIER_CATACOMBS_PLAN.md](../SHADOW_RUNNER_LEVEL_8_COURIER_CATACOMBS_PLAN.md).
- Verification passed: lint, TypeScript, production build, all 248 Jest suites
  and 1,395 tests, runtime asset contract, WebKit and Android Chromium Level 8
  phone smoke, Level 7 regression smoke, and linked Supabase migration dry run.
- Status: local production candidate on `main`. No commit, push, deployment, or
  remote migration has been performed. Physical iPhone and Android balance
  playtesting remains the final launch gate.

## Current Release - Audit Hardening And Social Foundations

Status: shipped through the backend-first `main` workflow. Release closeout is
applying a forward revocation for two historical extra active-table grants and
must finish linked, health-manifest, and live-smoke proof before Release B.

The July 10 candidate includes service-worker and DM lifecycle work,
private-identity Release A consumer cutover (including Expo 57 selectors),
recipient-owned Realtime notification events, privacy-safe bounded push retry,
reciprocal personal blocking, the General Chat/DM Message Library, ShadowPin
tags/search/one-level comments and ready-state notifications, Shadow Mystery
publishing, and Shado TV captions/premieres/analytics.

Canonical detail and release gates live in:

- [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1)
- [PERSONAL_BLOCKING.md](C:/repos/chat2.0/docs/PERSONAL_BLOCKING.md:1)
- [MESSAGE_LIBRARY.md](C:/repos/chat2.0/docs/MESSAGE_LIBRARY.md:1)
- [SHADOW_PIN.md](C:/repos/chat2.0/docs/SHADOW_PIN.md:1)
- [REALTIME_PUSH_NOTIFICATIONS_PLAN.md](C:/repos/chat2.0/docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md:1)
- [DEPLOYMENT_GUIDE.md](C:/repos/chat2.0/docs/DEPLOYMENT_GUIDE.md:1)

## July 24 Supabase-Outage Recovery Candidate

- Direct public Supabase object URLs are now the durable default for chat,
  avatar, and notification media. Persisted Image Transformation URLs are
  canonicalized back to public-object URLs so an unavailable optional
  transformation service cannot make successful uploads appear broken.
- General Chat and DMs use the same upload path. Files over 6 MiB now use
  Supabase's resumable upload endpoint with 6 MiB chunks and bounded retry;
  smaller media retains the standard upload path.
- ShadowPin creator videos no longer attach a fresh Bunny VideoId to an older
  file-fingerprint upload. Draft discard and attention-state cleanup are
  authoritative. The Drafts / Needs attention pill ignores untouched edit
  prefills and edit receipts whose canonical Pin was deleted, while preserving
  real unsynced metadata or media changes. Creator/operator Pin deletion is
  visible in both radial controls and the immersive viewer.
- Native Creator Studio uploads now map Bunny's complete status contract
  correctly, including finished status `3`, and automatically refresh while
  encoding. Publish waits through bounded status checks instead of immediately
  presenting normal provider processing as a failed draft.
- Explicit empty DM unread state no longer falls back to an old read cursor.
  Existing-account sign-in cannot trigger new-account onboarding, and the
  native TestFlight/App Store shell never auto-opens that flow.
- Catch-Up begins its disintegration at the actual swipe release position while
  persistence completes in parallel, then reflows only after both succeed.
- iOS Build `15` canonicalizes Supabase notification attachment URLs before the
  Notification Service Extension downloads ShadowPin media or actor avatars.
- ShadowPin radial controls now assemble from the Share position as a
  direction-aware spinning train: each action materializes at that origin with
  a contained gold/rose wash, Share lands last, and reduced-motion modes render
  the completed control arc immediately.
- The follow-up motion pass slows the standard four-control reveal to 436 ms.
  Releasing without choosing a control keeps the radial mounted for the exact
  reverse orbit and origin-wash sequence; choosing a control still dismisses
  immediately and runs the selected action.
- Mobile-nav More/Back page swaps transfer focus only for keyboard activation.
  Touch activation clears the trigger instead, and hover treatment is limited
  to fine-pointer devices so the hosted web app and native WebView cannot leave
  a random destination visually highlighted.
- Required rollout order: linked migration and notification worker, verified
  `main`/Netlify production deploy, then signed TestFlight Build `15` and
  physical upload/DM/Pin/rich-notification acceptance.

## July 20 Build 13 Rich Notification Presentation Candidate

- The candidate fixes generic native alerts at their source: notification
  events now receive actor, route, title, and body enrichment before the v2
  envelope and outbox are materialized.
- ShadowPin can carry its image into iOS rich content and Android Big Picture;
  the iOS service extension uses an actor PFP fallback for other
  user-originated alerts and keeps private-preview mode media-free.
- Notification sounds are selectable per event in a mobile bottom-sheet picker
  with exact bundled-WAV playback, a category fallback for existing users, and
  separate Default and Silent choices.
- The default Expo artwork is replaced by generated obsidian-and-gold ShadoChat
  launcher/adaptive/splash assets. The next native candidate is iOS Build `13`
  / Android version code `5`.
- Local proof: root and mobile lint/TypeScript, production web build and budgets,
  246 Jest suites / 1,353 passing tests, 12 Deno worker tests, 8 native contract
  tests, Expo Doctor 20/20, iOS JS export, and 14-screen iPhone WebKit/Android
  Chromium notification QA all pass. The linked baseline security contract
  passed before the pending grant allowlist was added; the post-migration
  contract is a required deployment gate.
- Pending approval: apply migration `20260721011500`, deploy
  `deliver-notifications-v2`, publish the hosted settings assets, create and
  submit Build `13` to TestFlight, then run the physical iPhone rich-image/PFP/
  sound/privacy/route/badge matrix. No production deployment is claimed here.

## July 20 Durable TestFlight Notification Enrollment

- Build `10` still showed `Sign in to ShadoChat before enabling
  notifications` for a valid hosted session. Production evidence confirmed
  hosted Auth succeeded while native registration never reached Supabase.
- Notification enrollment is now a device-bound, PKCE-style bridge flow: an
  authenticated hosted session mints a five-minute single-use ticket, native
  proves its retained verifier, and a native-generated installation credential
  owns token refresh, foreground leases, and revocation.
- The secret-bearing custom-URL fallback and duplicate local-storage session
  poller are removed. The bridge now uses exact request correlation,
  same-origin message validation, bounded retries, deduplication, and
  five-minute challenge expiry.
- Linked migrations `20260720152414` and `20260720155850` are applied and
  migration state is aligned. Live transaction checks cover rollback, wrong
  verifier, replay, rotation, refresh, foreground lease, revoke, and
  post-revoke rejection.
- Pre-build proof: root and mobile lint/TypeScript pass; production build and
  budgets pass; 245 Jest suites / 1,348 passing tests; 50 Node contracts;
  documentation integrity; Expo Doctor 20/20; linked security contract and
  migration dry run pass.
- `deliver-notifications-v2` version `12` is deployed and now suppresses native
  system delivery only for installations with a currently active foreground
  lease, preventing duplicate foreground in-app and phone alerts without
  suppressing inactive sibling devices.
- Build `11` is the first compatible TestFlight binary. Physical-device proof
  remains required before native delivery expands beyond its current guarded
  rollout.

## July 17 Production Notification Follow-Up

- Catch-Up swipe-to-read now follows the full gesture, supports distance and
  flick commitment, respects Comfort motion preferences, and provides a clear
  dissolve/reflow completion.
- Migration `20260717233421_notification_destination_badges.sql` extends the
  compatible app-badge RPC with exact ShadowPin and Play destinations. The UI
  exposes the owning experience/category/item and clears only exact event IDs.
- Universal Discover is a standard routed app page with the themed app
  backdrop and persistent desktop/phone navigation, rather than a modal.
- Pre-release proof: 235 Jest suites / 1,282 passing tests, 43 Node contracts,
  clean lint/typecheck/build/docs, clean local migration replay and security
  contract, clean local/linked database lint, and authenticated Pixel
  Chromium/iPhone WebKit Discover and Catch-Up gates with zero data residue.

## July 19 Native Notification Beta Rollout

- EAS is authenticated and linked to the ShadowChat Expo project. Signed iOS
  build `3` was rejected as an obsolete General Chat-only proof shell and
  removed from the internal TestFlight group.
- replacement production build `5`
  (`1635236c-c9ce-4810-8fe2-bfaf8c5e202c`) contains the complete production
  ShadoChat UI, secure web/native session synchronization, native notification
  setup, exact routing, and the rich notification extension. It is valid and
  `IN_BETA_TESTING` in `ShadoChat Internal Beta`; the account holder is
  auto-notified.
- Android Firebase/FCM V1 credentials are configured in Expo and signed preview
  replacement build `ef382e37-f474-4ada-9909-4efb8b36ece1` finished from the
  same full-app source and is ready for phone testing.
- Linked notification-v2 migrations, worker version 3, secrets, and the worker
  health probe are verified. The backend is deliberately limited to a DM-only,
  one-account `shadow` canary with worker delivery disabled.
- Native activation remains gated on the first production Expo token from
  TestFlight build `5`, followed by iPhone and Android foreground/background/
  terminated delivery, route, sound, media, action, badge, clearing, and
  duplicate-suppression proof.
- Physical testing of build `5` found a native safe-area regression and a
  permission-bridge completion race. Commit `c7c4ee7` fixes both without
  changing the PWA layout: the full native WebView now owns top/bottom safe
  areas, Settings requests iOS/Android permission directly, denied permission
  can open the app's phone settings, and `undetermined` is no longer accepted
  as a completed enable request.
- iOS production build `6`
  (`c96adbff-dc49-47c6-896b-483681643b8d`) is processed, attached to
  `ShadoChat Internal Beta`, and carries the focused safe-area/permission test
  plan. It confirmed the safe-area repair, then exposed an early native-mode
  detection freeze and a stale native-session overwrite. The web/native repair
  makes `?nativeApp=1` authoritative, re-sends the current web auth session
  before enable for backward compatibility, and makes the replacement binary
  await that same session in the enable command.
- Android version-code `3` finished as EAS build
  `267873cc-2489-455f-9326-67a76d6433c9`; it is retained as the safe-area
  artifact and superseded for auth/permission acceptance by version-code `4`.
- Commit `ae2d04e` is deployed to the production web app with the complete
  native detection/auth synchronization repair. Replacement iOS build `7`
  (`a6e8d7d1-7c77-4c40-b54c-a6ca206fa15e`) and Android version-code `4`
  (`b443cfe8-5cba-40ec-be54-5410384b162a`) carry that source state. Both builds
  finished; iOS build `7` is processed and attached to
  `ShadoChat Internal Beta`, while Android `4` is available as an internal APK.
  Native delivery remains in DM-only shadow mode pending physical-device
  registration and foreground/background/terminated acceptance.
- The July 19 hosted-web follow-up preserves real native permission state,
  blocks signed-out enable commands while the recoverable Supabase session is
  syncing, exposes switch progress, and distinguishes stale idle bridge state
  from a completed native permission cycle. Build `7` consumes this repair
  without another binary; the next gate is a real iPhone installation/token
  row and the physical delivery matrix.
- Build `8` proved the remaining freeze was before installation persistence,
  not inside APNs: the live iPhone remained authenticated while the linked
  `notification_installations` table stayed empty. Build `9` makes the native
  parser backward-compatible with a cached sessionless enable command, adds a
  deduplicated same-origin fallback control and a short bridge-silence error,
  and disables the native WebView HTTP cache behind bridge epoch `2`.
- Physical build `9` then reproduced a false signed-out result immediately
  after a successful web login. Live Auth/API evidence confirmed the WebView
  account was authenticated, but notification registration was consulting a
  separate provider session ref before its listener caught up. Build `10`
  makes the verified bridge session authoritative for that registration turn
  and passes it directly into the provider.
- Physical build `7` tracing then isolated the persistent switch freeze to an
  unresolved APNs device-token promise before installation registration. The
  build `8` candidate adds correlated bridge request ids, serialized session
  and notification commands, bounded stage timeouts, a fresh native-token retry
  path, and separate passive-native versus explicit-save state. Delivery stays
  disabled/shadow-gated until build `8` creates the first verified iPhone token
  and passes the real-device acceptance matrix.

## Current Goal

### ShadowChat 2.0 Wave Three

- Goal: deliver Connections, ShadowPin Feed Modes, Inner Circles, deterministic
  source-linked Catch-Up, and the isolated real Shado Live beta on
  `codex/shadowchat-2.0` without changing production `main`.
- Started: 2026-07-13
- Status: Candidates 1-3 and the combined Wave Three gate are accepted. The
  polished frontend-only Shado Live prototype remains preserved; its real,
  audio-first LiveKit successor is implemented behind a separate server-gated
  flag with dedicated safety and in-app notification paths. Deterministic
  source-linked Catch-Up remains intact and no private AI trial has started.
  The accepted cumulative frontend and backend have shipped to production
  `main`; the isolated test site remains historical acceptance evidence.
- Final acceptance batch: Active Users and Weather full pages, presence-return
  notifications, unified launcher badges, exact notification/read clearing,
  ShadowPin radial/draft corrections, and composer alignment are production.
  The isolated deploy `6a5811bc762e6e6704058ca3` remains historical
  Android Chromium/iPhone WebKit acceptance evidence. Physical installed-PWA
  notification behavior remains an ongoing iPhone/Android validation surface.
- Backend boundary: reciprocal caller-private relationships, no public graph or
  counts, personal-block teardown with no restore, and compatibility with the
  unchanged production frontend sharing Supabase.
- Delivery boundary: verify each candidate independently before beginning the
  next, then run one combined local/shared-backend/mobile/cleanup/isolated-
  Netlify gate.
- Roadmap: [SHADOWCHAT_2_0_WAVE_THREE.md](C:/repos/chat2.0/docs/SHADOWCHAT_2_0_WAVE_THREE.md:1)
- Candidate 1 contract: [CONNECTIONS.md](C:/repos/chat2.0/docs/CONNECTIONS.md:1)
- Candidate 1 proof: linked migration `20260713190000`, unchanged-production
  compatibility smoke, 192 Jest suites / 1,008 passing tests, 42 Node contract
  tests, clean lint/typecheck/build/budgets, and repeat two-account Pixel
  Chromium/iPhone WebKit proof against immutable deploy
  `6a556190a9c126b4758b29f1` with unchanged DM history and zero residue.
- Candidate 2 contract: [SHADOW_PIN_FEED_MODES.md](C:/repos/chat2.0/docs/SHADOW_PIN_FEED_MODES.md:1)
- Candidate 2 proof: linked migration `20260713223200`, clean unchanged-
  production auth/resume-send smoke, local SQL/security/build/full-regression
  gates, and repeat two-account Pixel Chromium/iPhone WebKit proof against
  immutable deploy `6a5575bcbc2a1131aab40695` and the stable isolated URL.
  The browser gate covered persistence, universal Search, ordered feeds,
  Theater, hearts/comments, Back routes, relationship teardown/reconnect,
  geometry/diagnostics, exact preference restoration, and zero residue.
- Candidate 3 contract: [INNER_CIRCLES.md](C:/repos/chat2.0/docs/INNER_CIRCLES.md:1)
- Candidate 3 proof: linked migration `20260713235745`, clean linked dry run,
  local/remote security parity, unchanged-production compatibility smoke, 201
  Jest suites / 1,065 passing tests, 42 Node contracts, clean lint/typecheck/
  build/budgets, transactional SQL, and complete Pixel Chromium/iPhone WebKit
  lifecycle/feed/Theater/comments/geometry/diagnostics/cleanup proof against
  immutable deploy `6a55892252f0d306fae5b852`. Stable isolated deploy
  `6a558acc257a6d21fa379fa2` serves the byte-identical boot artifact and passed
  a fresh iPhone WebKit Connections -> Circles route check.
- Combined proof: each complete two-account Pixel Chromium/iPhone WebKit
  candidate verifier passed on exact immutable deploy
  `6a558acc257a6d21fa379fa2` with exact cleanup. The core auth, DM, and mobile
  DM Back smoke also passed after its mobile readiness selector was aligned to
  the visible message viewport and composer.
- Shado Live contract: [SHADO_LIVE.md](C:/repos/chat2.0/docs/SHADO_LIVE.md:1)
- Shado Live proof: compile-time default-build exclusion; lazy LiveKit chunk;
  three additive server-authority/safety/access migrations; four authenticated
  Edge Functions; private allowlist; role-scoped audio tokens; signed webhook
  and reconcile paths; live reporting/operator controls; foreground
  notifications; targeted SQL/Edge/frontend tests; and Pixel Chromium/iPhone
  WebKit host/listener routing, focus, keyboard, geometry, diagnostics, and
  zero-residue QA. The retro picker and premium mobile layout remain from the
  accepted July 14 prototype polish.
- Catch-Up contract: [CATCH_UP.md](C:/repos/chat2.0/docs/CATCH_UP.md:1)
- Catch-Up proof: linked additive migration `20260714020000`, clean migration
  parity/dry run, local and linked database lint/security, rollback-only
  two-user SQL proof, unchanged-production compatibility smoke, strict
  frontend/unit/routing coverage, and authenticated Pixel Chromium/iPhone
  WebKit on-demand, source-route, Back/focus, geometry, diagnostics, and zero-
  acknowledgement/residue checks. V1 contains no AI.
- Final-track deploy proof: initial implementation commit `0ff5127` established
  the track; polish commit `47df36f` produced the current flagged, budget-clean
  artifact. Immutable deploy `6a561c97b13a2f301ce618f4` passed Shado Live,
  Catch-Up, auth, DM, and mobile DM Back; stable deploy
  `6a561d93dc105334eca9a5f9` serves the same artifact and repeated those gates
  with zero Shado Live media/backend residue.
- Production `main` and the production Netlify frontend remain unchanged.
- Remaining final-track work: linked provider/backend rollout, isolated
  Netlify proof, RD-030 installed iPhone/Android real-audio acceptance,
  multi-tester feedback and targeted fixes, notification push follow-up, then
  explicit production-merge approval. The private AI Catch-Up trial has not
  started.

### ShadowChat 2.0 Wave Two

- Goal: build Universal Discovery & Library, True General Chat Threads,
  ShadowPin Creator Studio, and the First-Run Activation Journey on the
  isolated `codex/shadowchat-2.0` branch without changing production `main`.
- Started: 2026-07-12
- Status: automated Wave Two gate complete. All four candidates are
  implemented, documented, remotely aligned, and passed their local plus
  authenticated immutable-deploy checkpoints. The isolated trial is ready for
  Tayler's installed-phone acceptance; production `main` remains unchanged.
- Backend boundary: shared Supabase changes are additive and backward
  compatible. Existing production RPC signatures and RLS remain authoritative.
- Delivery boundary: four separate verified checkpoints, then a combined
  regression/mobile gate and isolated Netlify trial deployment.
- Roadmap: [SHADOWCHAT_2_0_WAVE_TWO.md](C:/repos/chat2.0/docs/SHADOWCHAT_2_0_WAVE_TWO.md:1)
- Candidate 1: Universal Discovery & Library with bounded partial-error search,
  exact Chat/DM/Pin/Play routing, Back restoration, and owner-private saves for
  messages, Pins, published TV, and published Mystery stories.
- Candidate 1 backend proof: additive linked migration, clean local replay,
  zero database lint/security-advisor findings, rollback-only operator draft/
  hidden/deleted and cross-owner negative checks, and linked no-pending proof.
- Candidate 1 product proof: 171 Jest suites / 872 passing tests, zero-warning
  lint, TypeScript, production build/paused chunks/budgets, and authenticated
  Pixel Chromium/iPhone WebKit geometry with zero console/page errors.
- Candidate 1 contract: [UNIVERSAL_DISCOVERY_LIBRARY.md](C:/repos/chat2.0/docs/UNIVERSAL_DISCOVERY_LIBRARY.md:1)
- Candidate 2: True General Chat Threads keeps `public.messages` canonical and
  the production flat-window contract intact while adding a server-owned
  reply-to-root projection, root-only 2.0 feed summaries, bounded routed
  thread pages, per-thread read cursors, and canonical push/search handoffs.
- Candidate 2 current UI: full-height phone sheet, right-side desktop drawer,
  fixed thread composer, exact target focus, older-page scroll preservation,
  and a non-disruptive new-replies affordance.
- Candidate 2 security: invoker/RLS readers, read-only mapping, private
  trigger-owned derivation, reciprocal block filtering/rejection, safe profile
  JSON, bounded pages/summaries, and deletion placeholders.
- Candidate 2 backend proof: linked migration `20260712234202`, deployed
  thread-aware `send-push`, clean local replay, rollback-only multi-user
  verifier, zero database lint/security-advisor findings, and aligned linked
  dry-run/history.
- Candidate 2 product proof: 173 Jest suites / 885 passing tests, zero-warning
  lint, TypeScript, production build/paused chunks/budgets, and authenticated
  two-account Pixel Chromium/iPhone WebKit realtime, exact-route, geometry,
  root-anchor, console, and cleanup proof.
- Candidate 2 contract: [GENERAL_CHAT_THREADS.md](C:/repos/chat2.0/docs/GENERAL_CHAT_THREADS.md:1)
- Candidate 3: ShadowPin Creator Studio replaces direct publish with a lazy
  Media/Details/Preview/Publish flow, autosaved recovery, real upload/process
  progress, explicit confirmation, exact Theater success, and atomic safe
  replacement.
- Candidate 3 backend boundary: owner-private creator drafts, server-owned
  staged-asset ledger, private staging bucket, idempotent finalization, and no
  draft participation in public Pin reads/search/score/activity/engagement or
  notifications.
- Candidate 3 verification status: implementation and seven focused model/
  history/API/component/entrypoint/media/SQL suites (46 tests) pass locally;
  the broader route/ShadowPin set passes 9 suites and 107 tests. Hardening adds
  local-draft conflict recovery, safe draft switches, exact-origin routing,
  phone touch sizing, target-version enforcement, atomic leased image publish
  with scheduled orphan recovery, private-until-publish Bunny delivery, and
  bounded media work. The hardening backend gate passes a fresh local reset,
  expanded rollback verifier, database lint/advisors, Deno/Node checks, and 3
  focused suites with 21 tests. The expanded authenticated workflow passed on
  final immutable Netlify deploy `6a549b1e052c56307d851b7d` with two controlled
  accounts, Pixel Chromium `412x915`, and iPhone WebKit `390x844`. Nineteen
  recorded checks cover every entry path, image/local-video/URL selection,
  retry, private recovery, one Pin/event, Theater routing, and atomic edit/move/
  replacement. It found and fixed an existing-poster preview ordering bug; the
  exact deploy and focused regression now pass. Cleanup proved zero remaining
  scoped database/Storage artifacts. Linked history/dry-run and the combined
  Wave Two regression gate are clean.
  Physical installed-PWA proof remains Tayler's separate acceptance gate.
- Candidate 3 contract: [SHADOW_PIN_CREATOR_STUDIO.md](C:/repos/chat2.0/docs/SHADOW_PIN_CREATOR_STUDIO.md:1)
- Candidate 4: a future-invite-only First-Run Activation Journey with
  resumable identity, notification/Comfort review, one server-confirmed first
  action, and optional install guidance.
- Candidate 4 backend proof: additive linked migrations, future-only genuine
  invite enrollment with no backfill, forced owner-private RLS, validated step
  order, revision conflicts, canonical Chat/DM/Pin completion, invoker-only
  public RPC over an unexposed owner-checking definer, fail-closed future
  function defaults, clean local replay, transactional rollback verifier,
  zero linked lint findings, zero activation advisor findings, and linked
  no-pending proof.
- Candidate 4 product proof: immutable deploy `6a549b1e052c56307d851b7d`,
  six Pixel Chromium/iPhone WebKit profiles, 139 checks, and 47 screenshots.
  General Chat, DM, and ShadowPin actions pass in both engines with exact server
  enrollment, Escape/Back/reload resume, focused footer geometry, nested-route
  restoration, cross-owner denial, optional install contracts, zero browser/
  network/backend errors, and four exact intercepted push requests with zero
  live delivery. The run also found and fixed a Pin Browser-Back lookup race.
  Cleanup removed six users/invites, four messages, two conversations, and two
  hearts and proved all 14 counters zero. Email delivery was intentionally
  excluded; the official generated signup-link path created canonical Auth
  users without sending email.
- Candidate 4 contract: [FIRST_RUN_ACTIVATION_JOURNEY.md](C:/repos/chat2.0/docs/FIRST_RUN_ACTIVATION_JOURNEY.md:1)

## Prior Goal

### ShadowChat 2.0 Wave One

- Goal: build five high-impact product upgrades on the isolated
  `codex/shadowchat-2.0` branch, preserve the production frontend and shared
  Supabase contract, then publish a separate installable Netlify test site.
- Started: 2026-07-11
- Status: revision verified, live on the separate Netlify trial branch, and
  accepted for Wave Two. Activity and member report intake remain paused.
- July 12 phone refinement: removed the shared mobile header from all active
  tabs, relocated required nested actions without another bar, tightened the DM
  top controls, fixed neutral radial-release activation, and unified the
  ShadowPin Theater slide stage/source/transition geometry. Focused and full
  verification plus trial redeployment remain the closing gate for this pass.
- Candidate 1: Unified Activity HQ with an authoritative recipient ledger,
  realtime/recovery, exact Chat/DM/Pin routes, five-item phone navigation,
  accessible unread handling, and hard-bounded foreground toast lifetime.
- Current decision: preserve Candidate 1 source/backend but compile its
  navigation, provider, queries, and subscriptions out of the trial frontend.
- Backend proof: clean local database replay, zero Supabase lint findings,
  reviewed security-definer/table-grant contract, and rolled-back producer/RLS/
  cleanup verification across nine event cases.
- Browser proof: Android Chromium and actual WebKit phone layouts, exact
  General Chat/DM/Pin-comment handoffs, live DM-to-Activity prepend and badge
  increment, keyboard/focus review, and no final console errors.
- Roadmap: [SHADOWCHAT_2_0_WAVE_ONE.md](C:/repos/chat2.0/docs/SHADOWCHAT_2_0_WAVE_ONE.md:1)
- Feature contract: [ACTIVITY_HQ.md](C:/repos/chat2.0/docs/ACTIVITY_HQ.md:1)
- Candidate 2: ShadowPin Theater with one-tap immersive viewing, bounded cold
  exact links, horizontal paging and layered history, media lifecycle and
  third-party consent, zoom/swipe arbitration, visual-viewport Comments, and
  keyset comment pages.
- Candidate 2 proof: 84 focused tests plus 151-suite/752-test full regression;
  authenticated two-page PostgREST cursor proof; Android Chromium and actual
  WebKit phone acceptance with 48px control, history, comments, zoom,
  safe-area, and consent verification.
- Candidate 2 contract: [SHADOW_PIN_THEATER.md](C:/repos/chat2.0/docs/SHADOW_PIN_THEATER.md:1)
- Candidate 3: DM Conversation Hub with searchable Inbox/Unread/Archived
  modes, private pin/archive/manual-unread state, rich draft/mute/media rows,
  route-aware phone history, consolidated conversation details, bounded
  in-thread search/shared content, and authoritative old-message windows.
- Candidate 3 backend proof: clean local replay and three-user RLS verifier;
  immutable canonical participant pairs; narrowed message edits; legacy
  client send/edit/delete/read/reaction compatibility; automatic unarchive;
  Realtime preferences; and security-invoker bounded retrieval.
- Candidate 3 product proof: 157 suites / 789 tests, lint/typecheck/build and
  budgets, authenticated two-account DM smoke, plus Android Chromium and
  WebKit phone acceptance for pinning, details, search, exact routing, shared
  filters, 48-pixel controls, and header/system Back.
- Candidate 3 contract: [DM_CONVERSATION_HUB.md](C:/repos/chat2.0/docs/DM_CONVERSATION_HUB.md:1)
- Candidate 4: member reporting plus an operator Safety Case Center with
  private immutable evidence, reporter receipts, RLS-separated queues,
  optimistic versioning, and audited actions.
- Current decision: preserve intake/history source and the complete backend,
  pause all member-facing Report/My Reports UI, and keep the operator Case
  Center active for existing cases.
- Candidate 5: device-local Comfort Profiles for motion, transparency,
  contrast, text scale, message density, touch targets, autoplay, sound, and
  haptics, applied before React paints.
- Combined proof, July 12: 164 Jest suites / 829 passing tests, 41 Node
  contracts, 154 documentation files, clean lint/type/build/budgets, clean local
  and linked database lint/security contracts, and three linked additive
  migrations.
- Trial: `https://shadowchat-2-0-wave-one.netlify.app`; the public health
  manifest is authoritative for the current branch SHA. Full authenticated smoke, Pixel 7 feature probe,
  compact/Android/iPhone comfort matrix, Sharp media Function boundary, and
  controlling service worker passed. Physical installed-phone acceptance is
  the remaining approval step.

### Shadow Runner Playable Prototype Prep

- Goal: Rebuild the Shadow Runner title/menu surface as clean asset-driven UI,
  keep the phone-first landscape flow stable, preserve current gameplay
  geometry, and prepare the next Phaser playable-prototype checkpoint.
- Started: 2026-06-09
- Status: active
- Owner/agent: Codex
- Branch: `main`
- Current checkpoint: direct Shadow Runner entry without an access-code gate,
  campaign level-map progression, reusable level configs, Level 1 through
  Level 7 production routes, and mobile landscape/orientation handling.
- Roadmap: [`docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md`](C:/repos/chat2.0/docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md:1)
- Latest pass, 2026-07-16: shipped playable Level 7 `Moonlit Causeway`, a
  generated moonstone causeway asset set, the new Moon Stalker lunge enemy,
  Shadow Surge power-ups, required Moon Shard goals, six checkpoints, 60 coins,
  15 enemies, and a route longer/harder than Clockmaker Yard without allowing a
  bottom-map bypass to count as completion.
- Medal pass, 2026-07-16: added the Level 7 availability migration so the
  public Shadow Runner knight medal now targets Moonlit Causeway and refreshes
  stale medals through the existing catalog trigger/function contract.
- Latest pass, 2026-07-10: shipped playable Level 6 `Clockmaker Yard`, a
  generated background/terrain/Chrono asset set, the new Lantern Bandit Scout,
  a time-slowing Chrono Lantern power-up, five recovery checkpoints, and a
  route roughly 15 percent longer than Candle Fair without removing readable
  landing and recovery space.
- Combat pass, 2026-07-10: expanded health from 3 to 12 points, made the three
  HUD hearts represent lives and empty when lives are spent, added a separate
  proportional health bar, and assigned different damage values to enemy
  contact, projectiles, spikes, flames, and falls.
- Verification, 2026-07-10: targeted TypeScript/Jest/runtime-asset checks
  passed; production-preview phone play passed at `740x390` and `932x430` for
  Level 6 detail/start, checkpoints, Chrono activation, life-heart removal,
  all crawl/high/final route segments, pool caps, and completion. Tutorial and
  Levels 1-5 also passed landscape regression playthroughs, with an additional
  Android Level 5 pass. Evidence is in
  `output/playwright/shadow-runner-level6-final/`,
  `output/playwright/shadow-runner-health-regression-*/`, and
  `output/playwright/shadow-runner-level5-android-health-regression/`.
- Latest pass, 2026-06-09: generated dedicated options-scroll and options-row
  button assets; removed title back/sound controls; added title Options and
  in-game Pause scroll menus; widened the title menu scroll without increasing
  height; lowered the right mission-scroll pedestal; and hardened long-press
  selection/context-menu suppression across the Shadow Runner surface.
- Latest pass, 2026-06-10: wired the cleaner `clockwork-sentry-v2` runtime
  strip, kept the sentry on deterministic patrol bounds instead of side-block
  direction flips, and documented the clean HUD/heart/coin/health assets.
- Latest pass, 2026-06-11: fixed Level 1 terrain rendering by registering
  named Phaser frames from the generated stone sheet, generated and wired a
  dedicated tilt-bridge asset, added landing/contact/finish feedback polish,
  and cataloged the new Barrel Roller plus Ivy Viaduct asset batch.
- Latest pass, 2026-06-11: split the title actions into `Start Tutorial` and
  `Select Level`, generated a branded level-map scroll plus Level 1 thumbnail,
  added a locked grayscale 10-level campaign map, moved full Level 1 behind the
  map flow, kept the tutorial route short, introduced reusable level metadata
  for future maps, and cataloged the new Candle Jester / Candle Fair assets.
- Latest pass, 2026-06-11: replaced the card-grid level selector with a
  generated full-screen parchment campaign map, ten individual generated
  location-button assets, and a dotted route overlay that reflects
  locked/unlocked/completed progression.
- Latest pass, 2026-06-11: fixed the campaign-map back arrow hit area, changed
  the level-complete overlay to `Return to Map` / `Next Route`, aligned the
  generated tilt-bridge art to its collision plane, and documented progressive
  campaign difficulty plus future stronger tilt/dump-off bridge behavior.
- Latest pass, 2026-06-11: generated and wired a blank parchment
  level-detail popup for the full-screen campaign map, changed map stops to
  inspect before start/replay, added route type/difficulty/mechanic metadata
  for all 10 stops, preloaded campaign thumbnails to avoid black popup frames,
  and made Level 2 tilt-bridge wobble metadata slightly faster without
  changing collision.
- Latest pass, 2026-06-11: extended Level 1 and Level 2 into longer routes
  with multiple Clockwork Sentries, denser Level 2 spike placement, raised
  tilt-bridge visuals, gameplay slide influence from tilting bridges,
  functional crouch/crawl movement, generated translucent mobile control
  buttons, and a generated level-detail thumbnail frame.
- Latest pass, 2026-06-11: generated original Shadow Runner WAV sound effects,
  added a reusable audio manifest/preferences layer, wired menu/map/pause and
  Phaser gameplay events to pooled SFX playback, and changed music behavior so
  the Castle Bard loop is on by default in the lobby/title/map but pauses
  automatically during playable levels.
- Latest pass, 2026-06-11: hardened the Level 3 `Ivy Viaduct` route with a
  longer finish path, faster/heavier tilt bridges, extra spikes/coins/enemy
  pressure, safer Barrel Roller patrol bounds, local-preview enemy debug
  snapshots, story-facing mission/completion text, and a researched split-thumb
  mobile control layout with a large D-pad plus right-corner jump/attack
  controls.
- Latest pass, 2026-06-11: removed the Shadow Runner access-code gate, kept
  the rotate gate as the unsupported-orientation fallback, and added a
  picker-level best-effort fullscreen/landscape request that is released on
  Shadow Runner exit.
- Latest pass, 2026-06-15: added the playable Level 4 `Bell Tower Archives`
  route with required low-clearance archive platforms, risky optional coin
  lines, Scroll Thieves, Tower Archers with projectiles, mixed old enemies, and
  the Moonheart Crest health-restore/attack/damage-resistance boost.
- Verification, 2026-06-15: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  `npx jest --runInBand` passed. Chrome production-preview smoke passed at
  `932x430` and `740x390`, covering Bell Tower detail/start, required crouch
  traversal, Moonheart boost HUD, Tower Archer encounter, finish overlay, and a
  debug snapshot with grounded archers and moving patrol enemies. Evidence in
  `output/playwright/shadow-runner-bell-tower-20260615/`.
- Polish follow-up, 2026-06-15: replaced the Bell Tower arch-style crouch
  obstacle visuals with low-clearance overhead platforms assembled from Bell
  Tower slabs, blocks, and archive shelves, and rounded Moonheart boost HUD
  countdown updates to whole seconds for lighter React overlay churn.
  Production-preview evidence in
  `output/playwright/shadow-runner-polish-final-20260615/` covers title, map,
  playable Levels 1-4, Bell Tower low-clearance traversal, boost, enemy,
  completion, and `740x390` phone-landscape checks.
- Game audio follow-up, 2026-06-15: replaced the shared hidden `<audio>`
  soundtrack element for Shadow War, Shadow Checkers, and Shadow Runner with a
  foreground-only Web Audio soundtrack controller, hard-stopped game music on
  background/pagehide to avoid iPhone lock-screen media cards, and fixed the
  Shadow Runner title music action so stopped foreground music can restart from
  a user tap without disabling the saved music preference.
- Bell Tower crouch-control follow-up, 2026-06-15: lowered the low-clearance
  blocker bottoms so standing movement collides while crouched movement fits,
  raised the blocker tops so climbing onto the archive platforms is much
  harder, and changed the mobile D-pad crouch action from hold-to-crouch to
  tap-toggle crouch with jump clearing the crouch state.
- Bell Tower coin-route follow-up, 2026-06-15: lowered the crawl-space coins
  into the crouched hitbox lane, raised coin rendering above the archive
  platforms, added collision-only micro-steps for the optional top route, and
  placed six new high/top coins above the two low-clearance archive platforms.
- Shadow Runner medals, 2026-06-15: added generated runner and knight badge
  icons to the shared name-badge renderer; added a server-side Shadow Runner
  level catalog plus per-user completion ledger; seeded Level 4 `Bell Tower
  Archives` as the current hardest available route; and wired catalog/completion
  triggers so future harder level releases recalculate and revoke stale knight
  medals through `public.users` realtime updates.
- Latest pass, 2026-06-19: added playable Level 5 `Candle Fair Ruins` as the
  longest and hardest route so far, using the Candle Fair background/props
  sheet, Candle Jester enemies with short-range candle throws, multi-lane
  offscreen archer volley zones, shield pickups, improved tilt-bridge fall-off
  behavior, high-route fall damage, harder optional coin lines, and completion
  reporting for enemy clears. Added a forward migration that marks Level 5 as
  available and recalculates Shadow Runner knight medals against the new
  hardest route.
- Verification, 2026-06-19: removed eager `image.decode()` from Shadow Runner
  preload to stabilize constrained landscape title loads, added direct
  localhost entertainment preview entry for Shadow Runner QA, and verified
  Level 5 with `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`,
  `npm run build`, `npx jest --runInBand`, and installed-Chrome
  production-preview smoke at `740x390` plus a `932x430` full flow covering
  Level 5 start, tilt shortcut, shield pickup HUD, and completion dialog.
  Evidence in `output/playwright/shadow-runner-level5-20260619/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build` passed.
  WebKit mobile landscape captures verified the revised controls at `932x430`
  and `740x390`; headed Chrome-channel foreground playtest verified Level 3
  patrol snapshots, combat/health, jump/crouch/attack input, and a focused
  Level 3 completion check. Evidence in
  `output/playwright/shadow-runner-controls-research/` and
  `output/playwright/shadow-runner-foreground/`.
- Verification, 2026-06-11: `npm run shadow-runner:audio`,
  generated WAV header validation, `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  `npx jest --runInBand` passed. Chrome-channel production-preview audio
  probes verified lobby music start, gameplay music pause, lobby resume on
  main-menu return, no in-game music button, all 19 SFX files fetch as RIFF
  WAVs, and touch gameplay SFX for jump, double jump, sword swing, land, and
  pause. Evidence in `output/playwright/shadow-runner-audio-pass/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build` passed.
  Chrome-channel production-preview visual smoke passed for Level 1/2 detail
  popups and Level 1/2 gameplay controls/enemy/hazard captures at `932x430`
  and `740x390`; evidence in
  `output/playwright/shadow-runner-next-goal/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, manifest JSON
  parse, and Chrome-channel production-preview smoke passed for playable,
  locked, completed, return-to-map, Level 2 unlock/start, and canvas launch
  flows at `932x430` and `740x390`; evidence in
  `output/playwright/shadow-runner-level-detail-goal/final/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  Chrome-channel production-preview smoke passed for map back navigation,
  Level 1 completion actions, return-to-map unlock state, and tilt-bridge
  visual alignment; evidence in
  `output/playwright/shadow-runner-map-actions-pass/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, manifest JSON
  parse, and Chrome-channel production-preview visual smoke passed for the
  full-screen campaign map at `932x430` and `740x390`; evidence in
  `output/playwright/shadow-runner-campaign-map-pass/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  `npx jest --runInBand` passed. Chrome-channel production-preview visual
  smoke passed for locked map, Level 1 completion unlock, and Level 2 launch;
  evidence in `output/playwright/shadow-runner-level-map-goal/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  `npx jest --runInBand` passed. Chrome-channel production-preview visual
  smoke passed at `932x430`; evidence in
  `output/playwright/shadow-runner-level1-goal/` shows visible generated stone
  chunks, the generated tilt bridge, sentry state, pause menu without `Exit
  Game`, and level-complete actions limited to restart/main menu.
- Verification: `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, and
  `npm run build` passed. Chrome mobile visual smoke passed at `740x390` and
  `932x430` with zero title-button scroll overrun and canceled `selectstart`
  / `contextmenu` events. Evidence:
  `output/playwright/shadow-runner-options-pass/final/`.
- Prototype verification, 2026-06-10: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and Chrome
  production-preview smoke passed. Evidence includes `932x430` and `740x390`
  HUD/pause/sentry captures in
  `output/playwright/shadow-runner-prototype-phase/`, plus foreground Chrome
  screenshots `19-headed-v2-sentry-a-932x430.png` and
  `20-headed-v2-sentry-b-932x430.png` showing the sentry moving across patrol.
- Prototype backlog:
  - Add gameplay HUD assets and DOM overlay: player health, enemy health,
    score/coins, pause, and checkpoint/finish feedback.
  - Keep movement rules in the existing simulation boundary and Phaser scene
    thin; do not tune level difficulty from automated test failures alone.
  - Add one reviewed enemy type first, then sword/jump defeat feedback.
  - Build one short test route around movement, jump, double jump, attack,
    crouch, one enemy, one tilt platform, and one finish marker.
  - Run real iPhone and Android checks for rotation, safe areas, load speed,
    and touch highlight behavior after each pushed visual/gameplay checkpoint.

## Latest Completed Goal - ShadowPin Short Video

- Goal: Add first-class short video pins to ShadowPin while preserving the
  existing mixed category feed, admin activity, hearts, and image-pin behavior.
- Started: 2026-05-29
- Status: complete
- Owner/agent: Codex
- Branch: merged to `main`
- Related roadmap: [`docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md`](C:/repos/chat2.0/docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md:1)
- User decisions: video pins mix with images; category covers stay image-only;
  feed autoplay is muted/focus-based; fullscreen viewer loads high-quality
  video; public users see only ready videos; creators/operators see processing
  failures; limits are 60 seconds, 150 MB, and 5 native uploads/day.

## Initial Interpretation

- User-visible outcome: Users can upload short phone videos, pin supported
  external video URLs, scroll a mixed image/video ShadowPin feed smoothly, turn
  on sound from the details overlay, and open video pins in a full-screen viewer.
- In scope: schema/RLS, Bunny native upload path, external video import path,
  client create/edit/replace flows, autoplay/focus playback, activity metadata,
  docs, focused tests, deployment, and verification.
- Out of scope: TikTok, video category covers, comments, realtime pin feeds,
  provider rehosting where terms or technical constraints make embeds safer for
  v1, direct Bunny pull-zone rendition URLs unless the environment is configured,
  and real-device autoplay/audio validation.
- Assumptions: Bunny Stream credentials already exist for Shado TV; adding a
  Bunny pull-zone URL is acceptable for direct rendition playback.

## Risk Areas

| Area | Risk | Mitigation | Status |
| --- | --- | --- | --- |
| Media delivery | Native video renditions depend on Bunny processing and pull-zone configuration. | Store poster immediately, keep processing state private to creator/operators, document `BUNNY_STREAM_PULL_ZONE_URL`. | active |
| Provider embeds | YouTube, X, Pinterest, and Instagram have provider-controlled autoplay behavior. | Use YouTube iframe autoplay where possible; extract Pinterest direct MP4/HLS URLs when exposed; keep other external providers as best-effort embed/source pins. | active |
| RLS/public visibility | Failed videos must not leak into public feeds. | New select policy only exposes non-image media when ready unless creator/operator. | active |
| Feed smoothness | Autoplay can hurt masonry scrolling. | Use focus IntersectionObserver, direct preview URL when available, muted loop playback, and pause offscreen. | active |
| Existing image behavior | Extending `shadow_pin_images` can regress images. | Keep table/field compatibility and route image flows through existing functions. | active |

## Milestones

| ID | Milestone | Status | Files/areas | Verification |
| --- | --- | --- | --- | --- |
| M1 | Recheck repo, docs, and latest commit | complete | `AGENTS.md`, ShadowPin docs/code, Bunny upload path | Static inspection, clean `main` matching `origin/main` |
| M2 | Define video roadmap and constraints | complete | Roadmap doc, progress log | User decisions captured |
| M3 | Extend schema and RLS | complete | `supabase/migrations/20260529223000_shadow_pin_video_pins.sql` | Remote migration applied |
| M4 | Add video upload/import service | complete | `supabase/functions/shadow-pin-video/index.ts`, `supabase/config.toml` | Edge Function deployed and live Bunny upload verified |
| M5 | Add client API and UI playback | complete | ShadowPin API, hooks, UI | Typecheck passed |
| M6 | Add direct URL replacement and Bunny embed fallback | complete | Netlify media function, ShadowPin UI/API | Lint, module load, focused Jest |
| M7 | Add tests/docs and run gates | complete | ShadowPin tests/docs | Typecheck, lint, build, Jest, preview mobile, production smoke, and live upload checks passed |

## Verification Log

| Date | Command/check | Result | Notes |
| --- | --- | --- | --- |
| 2026-05-29 | `Get-Command node,npm,npx` | pass | Required repo tooling is available. |
| 2026-05-29 | `git fetch --prune`; `git status --short --branch` | pass | Local `main` matches `origin/main`; worktree started clean. |
| 2026-05-29 | `npx tsc --noEmit -p tsconfig.app.json` | pass | App typecheck clean after video UI/API work. |
| 2026-05-29 | `npm run lint` | pass | ESLint clean. |
| 2026-05-29 | `npx jest --runInBand tests/ShadowPin.test.tsx tests/useShadowPinHeartOptimism.test.tsx` | pass | 2 suites, 24 tests after focused video autoplay/embed/replacement coverage. |
| 2026-05-29 | `npm run build` | pass | Vite build completed; existing large-chunk warning remains. |
| 2026-05-29 | `npx jest --runInBand` | pass | 75 suites, 322 tests. |
| 2026-05-29 | `npm run qa:smoke:mobile -- --base-url=http://127.0.0.1:4174 --skip-build --run-name=shadow-pin-video-mobile-smoke` | pass | Mobile DM smoke passed against preview build. |
| 2026-05-29 | Custom Playwright iPhone preview screenshots | pass | `output/playwright/shadow-pin-video-visual/`; ShadowPin home, category empty state, and add-pin modal rendered without console errors. |
| 2026-05-29 | `supabase db push --dry-run` | pass | Remote project sees `20260529223000_shadow_pin_video_pins.sql` as pending; not applied. |
| 2026-05-29 | `supabase secrets list` | pass | Bunny library/API secrets exist; `BUNNY_STREAM_PULL_ZONE_URL` is not configured. App now falls back to Bunny iframe playback. |
| 2026-05-29 | `node -e "import('./netlify/functions/shadow-pin-media.mjs')"` | pass | Netlify ShadowPin media module loads after URL-replacement action changes. |
| 2026-05-29 | esbuild bundle of `supabase/functions/shadow-pin-video/index.ts` with remote Deno imports externalized | pass | Syntax/bundling sanity check passed without Docker/Deno. |
| 2026-05-29 | `npm run lint` | pass | ESLint clean after replacement/fallback patch. |
| 2026-05-29 | `npx tsc --noEmit -p tsconfig.app.json` | pass | App typecheck clean after replacement/fallback patch. |
| 2026-05-29 | `npm run build` | pass | Vite build completed; existing large-chunk warning remains. |
| 2026-05-29 | `npx jest --runInBand` | pass | 75 suites, 325 tests. |
| 2026-05-29 | `npm run qa:smoke:mobile -- --base-url=http://127.0.0.1:4174 --skip-build --run-name=shadow-pin-video-mobile-smoke-2` | pass | Preview-build mobile smoke passed. |
| 2026-05-29 | `supabase db push` | pass | Applied `20260529223000_shadow_pin_video_pins.sql` to remote project `shsqqouecvdoifzufkqm`. |
| 2026-05-29 | `supabase functions deploy shadow-pin-video --no-verify-jwt --use-api` | pass | Deployed `shadow-pin-video`; latest listed version is 2 after cleanup action. |
| 2026-05-29 | `netlify deploy --build --prod` | pass | Production deploy live at `https://shadowchat-1-0.netlify.app`. |
| 2026-05-29 | `npm run qa:smoke:prod:headless` | pass | Production auth and resume-send smoke passed after Netlify deploy. |
| 2026-05-29 | Live Bunny upload smoke through `shadow-pin-video` | pass | Temporary 31 KB MP4 uploaded through Bunny TUS, synced to `ready`, then pin, Bunny asset, and category were cleaned up. |
| 2026-05-29 | Live Pinterest import smoke through `shadow-pin-video` | pass | Temporary Pinterest pin extracted direct `pinimg.com` MP4/HLS URLs, then pin and category were cleaned up. |
| 2026-05-29 | `supabase db push --dry-run` | pass | Remote database is up to date after deploy. |
| 2026-05-29 | `git diff --check` | pass | Only line-ending warnings from Git on Windows. |
| 2026-05-29 | `npx jest --runInBand tests/ShadowPin.test.tsx tests/useShadowPinHeartOptimism.test.tsx` | pass | 2 suites, 24 tests after final Edge Function cleanup patch. |
| 2026-05-29 | `npx jest --runInBand tests/ShadowPin.test.tsx` | pass | 23 tests after iframe sound controls and feed video-label visibility fix. |
| 2026-05-29 | `npm run lint`; `npx tsc --noEmit -p tsconfig.app.json`; `npm run build` | pass | ESLint clean, app typecheck clean, Vite build completed with existing large-chunk warning. |
| 2026-05-29 | `supabase db push --dry-run` | pass | Remote database remains up to date. |
| 2026-05-29 | `netlify deploy --prod --dir=dist` | pass | Production deploy live at `https://shadowchat-1-0.netlify.app`. |
| 2026-05-29 | `npm run qa:smoke:prod:headless` | pass | Production auth and resume-send smoke passed after deploy. |

## Files Changed So Far

| File | Reason |
| --- | --- |
| `supabase/migrations/20260529223000_shadow_pin_video_pins.sql` | Add mixed-media pin columns, video visibility RLS, heart guard, and score filtering. |
| `supabase/functions/shadow-pin-video/index.ts` | Add Bunny upload sessions, completion/status sync, and external video imports. |
| `supabase/config.toml` | Register `shadow-pin-video` with manual endpoint auth. |
| `netlify/functions/_shared/shadow-pin-media.mjs` | Add direct existing-pin image URL replacement and image URL-import metadata. |
| `netlify/functions/shadow-pin-media.mjs` | Add `update-image-from-url` action for normal pin replacement. |
| `src/features/shadow-pin/types.ts` | Add media/provider/video metadata types. |
| `src/features/shadow-pin/api/shadowPinApi.ts` | Route image/video source creation and replacement, capture posters, upload Bunny TUS files, and sync processing status. |
| `src/features/shadow-pin/hooks/useShadowPinImages.ts` | Poll creator-visible processing video pins and update cache. |
| `src/features/shadow-pin/ShadowPin.tsx` | Add mixed pin copy, video source input, feed autoplay, sound toggles, and video-aware fullscreen viewer. |
| `src/features/shadow-pin/hooks/useShadowPinActivityTracker.ts` | Add media/provider metadata to activity events. |
| `docs/SHADOW_PIN.md` | Document short video behavior and deployment. |
| `docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md` | Capture product decisions, architecture, rollout, env, and verification gates. |
| `tests/ShadowPin.test.tsx`, `tests/useShadowPinHeartOptimism.test.tsx` | Update ShadowPin expectations and add mixed video pin coverage. |

## Current Status

- Implemented and deployed: schema, service surface, frontend API,
  feed/viewer UI, docs, tests, Supabase migration, Supabase Edge Function, and
  Netlify production build.
- Verified: lint, typecheck, build, focused Jest, full Jest, preview mobile
  smoke, production smoke, remote migration status, Edge Function listing, and
  a live native Bunny upload with cleanup.
- Remaining optional follow-up: configure `BUNNY_STREAM_PULL_ZONE_URL` for
  direct CDN playback URLs and run real-device iOS Safari / Android Chrome
  autoplay and audio gesture validation.

## October 30, 2026 — Will & Kirk Friday audio stories

- Replaced the coming-soon screen with a single-column, vertically scrolling story feed, ordered by release timestamp newest first. Reuses the existing Shado TV catalog/upload/playback infrastructure; the channel slug is `will-kirk`. No schema or provider configuration changes.
- Only published, ready, released stories with a valid release timestamp at or before now appear. Hidden/deleted channels and stories are excluded. Cover art opens one player at a time; no player loads until selected. Catalog refreshes every minute while visible, with retry on errors.
- User requested agent-managed MP4 uploads; no admin uploader added. Upload each finished 15–20 minute MP4 through the existing authenticated video path, associate it with the published `will-kirk` channel, set its cover and release timestamp, wait for processing to become ready, then publish. Keep future uploads hidden until release: UI date filtering is not a server access gate or an automatic Friday publishing job.
- Unit coverage verifies release ordering and all exclusion cases. Phone/desktop fixture browser evidence and physical-device limitations are recorded in the mobile QA log. First actual story file has not been supplied or uploaded.
