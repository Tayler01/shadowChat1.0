# Shadow Checkers finish checklist

September 27, 2026. Working checklist from the user's physical-phone walkthrough. The goal has resumed for implementation. The previous build is deployed for testing; the closeout changes below remain local until validation and release. These are acceptance requirements, not claims of completed implementation.

## Local implementation checkpoint — September 27 evening

- Implemented the bare Chat/menu controls, compact message feed/composer, independent music/piece preferences with master mute, branded landscape entrance and paged lobby. Browser layout checks cover Chromium and WebKit, including 667×320 and enlarged text; physical keyboard/audio acceptance remains open.
- Added private online-member invitations with atomic acceptance, duplicate protection, blocking/presence checks, expiry, themed Join/Decline/Later presentation and durable notification routing. After the user's publication authorization, the invitation migration and only `send-push` were deployed. Linked migrations, RLS/RPC access, security contract and all 28 live function configurations are verified; V2 delivery remains disabled. Hosted two-account invitation/push proof must follow the frontend publication.
- Turn read acknowledgments now target the displayed move revision and its exact events; hidden games do not acknowledge turns. Foreground/browser tests do not establish installed-PWA background push delivery.
- Rebuilt the room with the requested prop, fireplace, frame, leather, map, tree, rain and slow wax detail. Camera diagnostics pass 216 poses; rendered flame-energy diagnostics pass 256 samples. Shadow bias is adjusted following controlled comparisons, but the user's physical-phone blocky fireplace artifact is not yet confirmed fixed.
- Actual Unity camera and context-loss/retry checks pass in Chromium and WebKit. After the carved-piece addition and its instancing/lighting optimization, final desktop Chromium measured 567 draws/frame and 33.4 ms p95 submission interval over eight seconds, with no intervals above 50 ms. The room-only checkpoint was 521 draws/frame and the earlier batching baseline was 511. This is not a physical-device or thermal measurement.
- Full Jest checkpoint: 254 suites, 1,468 passing tests, 16 pre-existing TODOs. Lint, TypeScript, 58 infrastructure Node tests, 13 Checkers audio/lifecycle tests, function manifest and dependency audit pass. Invitation SQL QA passes 51 assertions including blocking, master notification preferences, sound choices, expiry and queued-push cancellation; separate continuation SQL QA passes 31 assertions. Invitation account-switch/expiry regressions are covered. The production build passed unchanged size limits before the user's additional carved-piece request; that native update and final integration checks are in progress.
- The remaining straight-line finish is: finish production checks; review/release the backend and manual Netlify candidate; prove hosted invitations, notifications and full-match continuation; obtain iPhone/Android and visual/audio acceptance. Computer play remains future work.

Checkboxes below remain acceptance gates where they include hosted or physical-device behavior; local implementation alone does not check them off.

## Current finish scope, in order

1. **Minimal in-game controls, audio and chat**
   - [ ] Reproduce the reported quick-control/music failure on the phone; verify the replacement controls and menu actions.
   - [ ] Remove the in-game top bar completely. Leave only Chat and the three-dot menu at the top right, with bare icons rather than visible circles/backgrounds. Retain generous invisible touch targets, readable contrast and keyboard focus indicators.
   - [ ] Put exit/back, help/rules, camera help, accessibility and all sound controls in the compact game-branded context menu. No separate exit/back or sound icon remains over the room.
   - [ ] Keep master sound in that menu for all game audio, including music, piece sounds and room ambience. This supersedes the earlier request for a top-right master-sound button.
   - [ ] Provide clearly distinct Piece Sounds and Music toggles in the menu. Master mute must preserve the individual choices.
   - [ ] Verify the original quiet soundtrack starts, mutes and recovers after background/return; finish the natural piece/fire sound mix.
   - [ ] Replace the large opaque match-chat sidebar with a compact transparent/translucent feed over the room, visible by default. Show approximately three or four messages at a time with contrasting text; newer messages move older messages out of view without deleting chat history.
   - [ ] Add a menu setting to hide/show the on-screen chat feed. Hiding it changes presentation, not other players' ability to send messages.
   - [ ] Make the Chat icon open only a compact message composer. Support the phone keyboard and safe areas without the half-screen sidebar. On successful send, close the composer and dismiss the keyboard; retain the draft and recovery affordance if sending fails.
   - [ ] Fix the user's reported finicky chat dismissal on the physical phone. Verify one-tap close/toggle with the keyboard both open and closed, repeated open/close cycles, and no invisible overlay intercepting game input after dismissal. Distinguish closing the composer from hiding the message feed.
   - [ ] Keep feed/composer/menu placement clear of playable board input and the invisible camera gesture region. Verify focus, keyboard return, menu dismissal and both phone orientations through the landscape gate.
   - [ ] Latest phone correction: invert both drag axes and all four directional camera controls; preserve pinch/wheel zoom direction. This is an inversion of the existing camera controls, not a new first-person camera mode.

2. **Branded entrance and landscape lobby**
   - [ ] Preserve the rotation prompt's working behavior (confirmed by the user), while adding Shadow Checkers branding and the study's visual treatment. Use one consistent visual identity across rotation, lobby, loading and in-game menus.
   - [ ] Use black backgrounds throughout the Checkers entrance/loading/lobby/menu surfaces instead of navy blue, retaining the gold branding and readable contrast.
   - [ ] Replace the simplistic game-loading presentation with the same Checkers branding used for rotation and the lobby. Keep truthful loading progress, readable status and retry/recovery controls.
   - [ ] Replace the vertically scrolling lobby with a fixed, single-screen landscape layout matching the new room.
   - [ ] Remove the top bar and its back arrow completely, including during game loading; integrate rules, audio, navigation and a clear exit action into the single menu.
   - [ ] Keep the primary actions and match navigation visible at phone size. Use bounded pages/tabs for longer lists, retaining usable touch targets and larger-text support.
   - [ ] Make Hall of Fame a button/tab rather than a section reached by scrolling down.
   - [ ] Preserve continue-match, open matches and spectating in the reorganized interface.

3. **Direct invitations and dependable turn notifications**
   - [ ] Show eligible members currently online across ShadowChat, respecting presence visibility and existing blocking rules.
   - [ ] Let a player invite a selected member; deliver a themed invitation with Join and Decline actions that lead to the intended game.
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
   - [ ] Manually deploy to Netlify while GitHub deployment remains unavailable; verify exact live assets, Linux-compatible function bundles and production health.
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
