# Shadow Checkers finish checklist

September 27, 2026. Working checklist from the user's physical-phone walkthrough. The goal is active. The closeout update is now deployed for phone testing; acceptance requirements below remain open where hosted or physical-device evidence is still needed.

## Completion audit and continuation corrections — September 27 evening

- Hosted invitation choices and Decline passed on exact live build `47b0775`: the selected `veil-rogue`/`cinematic` values persisted, the recipient declined without creating a game, and exact cleanup counts were zero. Evidence: `output/playwright/shadow-checkers-choice-decline-1790562575111/summary.json`.
- New phone report: opponent board remained viewed from White's side. Reproduced a native seat-transition defect with an unchanged piece ID and logical square: `player_one` to `player_two` updated picking/projection but left the existing mesh at the old position. Existing token transforms now snap to the new seat. Idempotent motion cleanup also fixes a reproduced busy-input leak when a seat change interrupts animation. Native checks pass: 240 raised-piece hits, 960 empty-square hits and 14 seat/animation/reset/overhead checks. Screen/bridge tests pass (28), host role changes propagate correctly, lint/types pass. Browser rebuild/deployment and physical opponent confirmation remain pending.

- Published this batch at 10:26 PM ET: build `47b07751782a13f8fa48460b8f0c7e980209a2b1`, Netlify `6ab9d01510b8d67a73d93cd6`. Exact public health/11 asset hashes, Linux media method guard, production health and required-restart broadcast pass. Initial payload remains 1,267,128 bytes; total is 99,976,610 bytes under unchanged limits. No GitHub push or new backend rollout.
- The user confirmed the preceding phone chat patch works after restart: Send is clear, the screen retains normal zoom, and messages show without bubbles. This is real-device feedback on an unspecified phone; it does not establish both iPhone/Android or other physical flows.
- Auditing original-game parity found and corrected the queued loser's invalid Rematch action, missing lobby Leave Queue/status, and missing explicit private-inviter/queue appearance choices. Account-switch refreshes cannot restore another viewer's queue state; own-queue reads are limited to lobby refreshes, not added to each selected-match move. Source and Chromium/WebKit layout checks pass, including 667×320 at 130% text. Final lint/types and all 254 suites pass (1,471 tests, 16 existing TODOs); production packaging follows.
- Current production SQL passed a natural 35-move game from the initial board with four multiple jumps and one king, terminal settlement, rejected terminal replay without duplicate statistics, and both players' rematch requests resolving to one continuation. This used authenticated-role claims inside one bounded transaction and explicitly rolled back. Exact postchecks show zero test game/notification/stat rows and an unchanged eligible crown owner. Evidence: `output/playwright/shadow-checkers-complete-sequence/result.json`, with hashes of the tested SQL and move sequence.
- A committed QA finish was deliberately not run: the existing eligible champion has one win, so a new QA win could change a real member's crown. Rollback-only production SQL evidence does not certify browser result presentation, committed full-match play, a third-player queued handoff, or physical-device acceptance. Those broader requirements remain open below.

## Phone chat follow-up published — September 27, 10:03 PM ET

- Published `c3523dadeacc960878b71b5d12b0fbd30181c402`, Netlify `6ab9cab96d8fcedc0386d2d1`, following the user's immediate republish request. This includes the accepted-notice positioning fix from `c7f84840`.
- Chat now has a visible gold Send button, input text computed at 16px minimum in the checked profiles, and plain recent messages without a panel/bubbles. The feed hides while composing and returns on send/close. No browser zoom-disabling restriction was added.
- Focused 20 Jest tests, full lint/types, production build, and Chromium/WebKit layout checks pass. Input is 16px at standard scale and 20.8px at 130%; Send targets are at least 44px and emulated viewport scale remains 1 through focus/send/close. Physical iPhone/PWA keyboard zoom still needs user retest.
- Exact hosted health and 11 game assets match, media function returns expected 405, production health passes, and the fresh required-restart notice is broadcast. Payload remains within unchanged limits: 1,267,128 initial bytes and 99,971,448 total bytes. No GitHub push.

## Production checkpoint — September 27, 9:38 PM ET

- Published the user-authorized manual Netlify update at `https://shadochat.online`: source/build `b298f52bc4b6e9539640a3cd26fee3edd51be6b7`, deploy `6ab9c48ad00735ff94c5c11f`. No GitHub push was performed. Backend migration and `send-push` were deployed first.
- Fresh final lint, TypeScript, documentation checks, production build and all 254 Jest suites pass (1,468 tests; 16 pre-existing TODOs). Initial payload is 1,267,128 bytes and total deploy payload is 99,971,193 bytes, within unchanged limits.
- Public health matches the exact source/build, all seven checked Unity assets match local SHA-256 values, and the Linux-compatible media function returns its expected 405 method guard. Production health passes; paused News monitoring remains disabled. The standard required-restart release notice is published and broadcast.
- Final small-landscape/enlarged-text tests now assert entire visible match cards and Hall of Fame rows fit their panels. Actual Unity camera inversion checks pass in Chromium and WebKit. Final native art includes neutral metal relief, faction-colored outer glow only, and restrained worn/scorched map and folio edges.
- Hosted two-account invitation/turn/chat verification passed on this build: private invite, distinct-character acceptance into one match, authoritative moves by both players, recipient turn-read and compact chat delivery. Report `output/playwright/shadow-checkers-invite-hosted-1790560134591/summary.json` verifies zero remaining QA sessions, matches, moves, chat, invitations, events and delivery jobs. The test dismissed the accepted-match notice normally to bypass its discovered overlap with Skip; the follow-up fixes that positioning. Physical iPhone/Android audio, background push, keyboard, sustained performance and fireplace-artifact comparison remain open; this is a testing release, not final goal acceptance.

## Local implementation checkpoint — September 27 evening

- Implemented the bare Chat/menu controls, compact message feed/composer, independent music/piece preferences with master mute, branded landscape entrance and paged lobby. Browser layout checks cover Chromium and WebKit, including 667×320 and enlarged text; physical keyboard/audio acceptance remains open.
- Added private online-member invitations with atomic acceptance, duplicate protection, blocking/presence checks, expiry, themed Join/Decline/Later presentation and durable notification routing. After the user's publication authorization, the invitation migration and only `send-push` were deployed. Linked migrations, RLS/RPC access, security contract and all 28 live function configurations are verified; V2 delivery remains disabled. Hosted two-account invitation/push proof must follow the frontend publication.
- Turn read acknowledgments now target the displayed move revision and its exact events; hidden games do not acknowledge turns. Foreground/browser tests do not establish installed-PWA background push delivery.
- Rebuilt the room with the requested prop, fireplace, frame, leather, map, tree, rain and slow wax detail. Camera diagnostics pass 216 poses; rendered flame-energy diagnostics pass 256 samples. Shadow bias is adjusted following controlled comparisons, but the user's physical-phone blocky fireplace artifact is not yet confirmed fixed.
- Actual Unity camera and context-loss/retry checks pass in Chromium and WebKit. After the carved-piece addition and its instancing/lighting optimization, final desktop Chromium measured 567 draws/frame and 33.4 ms p95 submission interval over eight seconds, with no intervals above 50 ms. The room-only checkpoint was 521 draws/frame and the earlier batching baseline was 511. This is not a physical-device or thermal measurement.
- Full Jest checkpoint: 254 suites, 1,468 passing tests, 16 pre-existing TODOs. Lint, TypeScript, 58 infrastructure Node tests, 13 Checkers audio/lifecycle tests, function manifest and dependency audit pass. Invitation SQL QA passes 51 assertions including blocking, master notification preferences, sound choices, expiry and queued-push cancellation; separate continuation SQL QA passes 31 assertions. Invitation account-switch/expiry regressions are covered. The production build passed unchanged size limits before the user's additional carved-piece request; that native update and final integration checks are in progress.
- The remaining straight-line finish is: finish production checks; review/release the backend and manual Netlify candidate; prove hosted invitations, notifications and full-match continuation; obtain iPhone/Android and visual/audio acceptance. Computer play remains future work.

Checkboxes distinguish verified implementation from remaining acceptance. Checked interface items are supported by the source and Chromium/WebKit reports named above; they do not certify physical-phone behavior. Requirements that explicitly include physical devices, sustained performance, background push or final user approval stay open until that evidence exists.

## Current finish scope, in order

1. **Minimal in-game controls, audio and chat**
   - [ ] Reproduce the reported quick-control/music failure on the phone; verify the replacement controls and menu actions.
   - [x] Remove the in-game top bar completely. Leave only Chat and the three-dot menu at the top right, with bare icons rather than visible circles/backgrounds. Retain generous invisible touch targets, readable contrast and keyboard focus indicators.
   - [x] Put exit/back, help/rules, camera help, accessibility and all sound controls in the compact game-branded context menu. No separate exit/back or sound icon remains over the room.
   - [ ] Keep master sound in that menu for all game audio, including music, piece sounds and room ambience. This supersedes the earlier request for a top-right master-sound button.
   - [ ] Provide clearly distinct Piece Sounds and Music toggles in the menu. Master mute must preserve the individual choices.
   - [ ] Verify the original quiet soundtrack starts, mutes and recovers after background/return; finish the natural piece/fire sound mix.
   - [x] Replace the large opaque match-chat sidebar with a compact transparent/translucent feed over the room, visible by default. Show approximately three or four messages at a time with contrasting text; newer messages move older messages out of view without deleting chat history. Latest correction uses plain text without a panel or bubbles; composing temporarily hides the feed.
   - [x] Add a menu setting to hide/show the on-screen chat feed. Hiding it changes presentation, not other players' ability to send messages.
   - [ ] Make the Chat icon open only a compact message composer. Support the phone keyboard and safe areas without the half-screen sidebar. On successful send, close the composer and dismiss the keyboard; retain the draft and recovery affordance if sending fails.
   - [ ] Fix the user's reported finicky chat dismissal on the physical phone. Verify one-tap close/toggle with the keyboard both open and closed, repeated open/close cycles, and no invisible overlay intercepting game input after dismissal. Distinguish closing the composer from hiding the message feed.
   - [ ] Keep feed/composer/menu placement clear of playable board input and the invisible camera gesture region. Verify focus, keyboard return, menu dismissal and both phone orientations through the landscape gate.
   - [x] Latest phone correction: invert both drag axes and all four directional camera controls; preserve pinch/wheel zoom direction. This is an inversion of the existing camera controls, not a new first-person camera mode. Actual Unity browser checks verify direction and input isolation; physical finger-pinch remains under phone acceptance.

2. **Branded entrance and landscape lobby**
   - [ ] Preserve the rotation prompt's working behavior (confirmed by the user), while adding Shadow Checkers branding and the study's visual treatment. Use one consistent visual identity across rotation, lobby, loading and in-game menus.
   - [x] Use black backgrounds throughout the Checkers entrance/loading/lobby/menu surfaces instead of navy blue, retaining the gold branding and readable contrast.
   - [x] Replace the simplistic game-loading presentation with the same Checkers branding used for rotation and the lobby. Keep truthful loading progress, readable status and retry/recovery controls.
   - [x] Replace the vertically scrolling lobby with a fixed, single-screen landscape layout matching the new room.
   - [x] Remove the top bar and its back arrow completely, including during game loading; integrate rules, audio, navigation and a clear exit action into the single menu.
   - [x] Keep the primary actions and match navigation visible at phone size. Use bounded pages/tabs for longer lists, retaining usable touch targets and larger-text support. Verified browser profiles include 667×320 and 130% text with complete card containment.
   - [x] Make Hall of Fame a button/tab rather than a section reached by scrolling down.
   - [ ] Preserve continue-match, open matches and spectating in the reorganized interface.

3. **Direct invitations and dependable turn notifications**
   - [ ] Show eligible members currently online across ShadowChat, respecting presence visibility and existing blocking rules.
   - [x] Let a player invite a selected member; deliver a themed invitation with Join and Decline actions that lead to the intended game. Hosted Join into one intended match is verified; decline/expiry are covered by SQL and interface tests, with background notification acceptance separate below.
   - [ ] Handle repeated taps, declined/expired invitations and unavailable players without duplicate matches.
   - [ ] Audit and finish the existing Checkers turn-notification foundation. Its current code is not proof of dependable delivery.
   - [ ] Verify invitation/turn delivery while the recipient is elsewhere in ShadowChat and while the app is backgrounded, including supported installed-PWA push with permission enabled.
   - [ ] Verify notification taps open the correct match, turn/read state clears correctly, and retries do not create duplicate or stale alerts.

4. **Complete-match acceptance**
   - [ ] Verify two real players through captures, multiple jumps, kinging, game completion, results/statistics and reconnect.
   - [ ] Verify rematches and queued challengers against the hosted continuation update, including duplicate requests.
   - [ ] Verify resign/cancel, accessible-board recovery and match chat through the complete flow.

5. **Final visual pass**
   - [ ] Latest addition: preserve the existing marble checker bodies, add shield/star-style carved regular tops and crown carvings for kings using the supplied medallion reference. The raised designs and surrounding bands use matching neutral metal, with original marble visible through their open details. Blue on white/silver and gold on black/gray belong only to a subtle outer-edge glow, not colored shield/crown faces. Verify actual 3D relief, faction mapping, promotion, picking, reflections and mobile draw/size budgets.
   - [ ] Investigate the user's physical-phone report of gray/black blocky patches, especially on fireplace bricks, which change with camera movement and settle when the camera stops. Compare shadow receiving/bias, surface overlap, normal/procedural detail and phone rendering; low resolution is not an established diagnosis. Editor-only comparisons do not establish that the physical-phone defect is fixed.
   - [ ] Reduce objectionable camera-motion flicker without removing the intended candle/fire lighting. Compare moving and settled views on phones, retaining material detail and the mobile performance budget.
   - [ ] Preserve the user-approved fade into black on the far/non-player side of the room; do not brighten it away during lighting polish.
   - [ ] Make the existing picture frame larger and more ornate while keeping it correctly fitted to the artwork and wall.
   - [ ] Add finer engraving and ornament to the armillary sphere (the hoop/globe ornament behind a candle), including its rings and base.
   - [ ] Improve candlestick engraving and wax detail. Add restrained wax drips that evolve over several minutes, rather than visibly racing or looping over seconds.
   - [ ] Improve the drinking vessel's engraving, surface detail and material response.
   - [ ] Age and refine the back-wall map. Give tabletop maps subtle scorched/burned edges and wear without hiding their cartography or reintroducing clipping.
   - [ ] Refine tabletop books with worn binding detail and faint, indistinct title-like lettering on their visible spines; avoid a uniform modern-book appearance.
   - [ ] Replace the fireplace's modern-looking masonry treatment with aged, irregular brick and more detailed columns.
   - [ ] Recess the lower firebox and flames farther into the hearth; bring the upper surround/mantel forward enough to suggest a believable chimney mass and a visibly deep fire opening. A modeled interior chimney is not required.
   - [ ] Give the blank dark framed area above the mantel a finished decorative purpose. Explore suitable artwork and/or crossed swords, checking their design against the chosen study period before adding them.
   - [ ] Add detail to the tree outside and the window panes, plus restrained rain droplets or water trails moving slowly down the outside of the glass.
   - [ ] Give the chair a period-compatible worn leather back cushion rather than the current fabric-like appearance, and refine its frame/woodwork detail.
   - [ ] Review opening camera motion, board/prop placement, clipping, material detail, reflections, contact shadows and synchronized flame lighting.
   - [ ] Verify move, capture and kinging presentations and themed notices.
   - [ ] Sequence geometry/composition fixes before surface ornament and ambient animation. Keep wax/rain effects bounded for mobile, honoring the shared reduced-motion and background-pause behavior; measure the finished room on phones.
   - [ ] Obtain the user's final acceptance of visual fidelity and sound against the agreed reference direction.

6. **Physical-phone acceptance and final release**
   - [ ] Complete iPhone and Android landscape/installed-PWA checks, including pan/pinch, background/return, sound and a sustained match for responsiveness, heat and crashes.
   - [ ] Fix remaining release-blocking defects and rerun affected checks plus required release gates.
   - [x] Manually deploy to Netlify while GitHub deployment remains unavailable; verify exact live assets, Linux-compatible function bundles and production health. Published September 27 at the production checkpoint above.
   - [ ] Repeat a short live phone check and record remaining optional enhancements separately before marking the goal complete.

## Execution constraints

- Prefer existing MCP, API, CLI and focused source edits over computer-use interaction whenever they can do the work reliably.
- Use screenshots and visual inspection only when needed to judge appearance or verify interaction; do not take routine duplicate screenshots.
- The user explicitly authorizes subagents with cheaper/smaller models or lower reasoning effort for suitably bounded tasks, provided quality is preserved. Use concise handoffs and scoped ownership; avoid delegation overhead for trivial work.
- Keep architecture, tricky debugging, security-sensitive notification/invitation behavior and final integration/review at the capability level the work needs. Review delegated changes and run appropriate checks before accepting them.
- Batch independent reads, bound output, reuse verified evidence and avoid unnecessary rebuilds or repeated tests. Cost efficiency must not weaken the acceptance criteria.

## Future addition — computer opponent (outside current finish scope)

- [ ] Add a quick game against a computer when another member is unavailable, alongside human multiplayer.
- [ ] Evaluate a publicly available checkers game engine, rather than a language model, compatible with the game's American checkers rules.
- [ ] Research license, cost, mobile performance and integration before choosing an engine. A free hosted API is not yet established; compare it with an engine that can run locally.
- [ ] Define difficulty, local/offline behavior and separation from human multiplayer statistics before implementation.

No engine or API has been selected, installed, purchased or integrated. This future feature is not a condition for completing the current multiplayer goal.
