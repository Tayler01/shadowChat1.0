# 2026-09-20 reference-polish testing update

- 111 game node tests pass, including original recording lifecycle, model/manifest hashes, full-pad steering, camera follow, progression and introduction timing. All 61 source and runtime GLBs have zero Khronos errors/warnings.
- Full Jest: 252 suites, 1,436 passed, 16 existing todo. Repository node suite: 58 passed. Lint, app TypeScript and budgeted production-format build pass. Audit: zero vulnerabilities. Supabase local inventory: 29 functions verified.
- Original campaign is fetched by verified hash from authorized public game assets: 149 levels plus three authored fixtures. Original Lesson 1 clears by real D-pad input in Chromium/WebKit, with eight locks and retained green key. Lesson 3 original password ECBQ unlocks correctly. All 149 maps are inventoried, not all solved or certified against the original executable.
- Visual/control evidence: output/playwright/shadow-circuit-polish. Covers three viewport/browser profiles, model loading, branding, intro/countdown, background interruption, continuous sliding pad, manual camera controls, original music and orientation gate. Reduced-motion and larger-touch profiles have separate cases.
- Three authored fixtures clear in full Chromium and WebKit; pause/reload and zero tracked WebGL resources after exit pass. Bundled Chromium headless-shell intermittently stalls; full Chromium is the final browser target. Headed host auth smoke passes and cleanup is verified.
- Original recordings use FluidSynth/GeneralUser GS and preserve the supplied compositions. Chromium decodes/loops both tracks and suspends on pause. Windows WebKit lacks Web Audio; real iPhone listening remains required.
- Physical devices, exact character likeness, final skeletal animation/VFX and complete original-game compatibility remain open. This is a personal testing build.

## Earlier initial-release evidence

# 2026-09-20 initial test release checks

- Selected menu/logo/launcher and PCB gameplay background integrated. Desktop 1672x941 and phone landscape 844x390 visual review: `output/playwright/shadow-circuit-branding/`; source comparison is in root `design-qa.md`.
- 70 game tests pass, including camera orbit preservation, actor interpolation, MIDI parsing, progression and all 25 runtime model decoders. All 25 source/runtime GLBs pass Khronos validation with no errors/warnings.
- Full Jest: 252 suites, 1,436 passed, 16 existing todo. Repository node suite: 58 passed. Lint/app TypeScript/build pass; npm audit reports zero vulnerabilities; local Supabase function inventory validates all 29 classified functions.
- Chromium and WebKit: three authored chambers clear by real input; pause, manual Focus rotation, checkpoint/reload, portrait gate, lazy engine loading and zero tracked WebGL resources after teardown pass. Private original Lesson 1 again clears in 96 touches; original Lesson 3 password ECBQ opens the specific locked level.
- Wrong password rejection, case-insensitive accepted password, persisted unlock and untouched later lock pass in both engines: `output/playwright/shadow-circuit-progression/`.
- Chromium desktop/Android audio checks pass gesture start, mute and pause suspension. Windows Playwright WebKit exposes neither AudioContext nor webkitAudioContext, so WebKit audio is explicitly unverified, not passed.
- Public release uses three clearly labeled authored chambers and local DAT/MIDI imports. Original source files are absent from dist. All 149 original layouts are locally inventoried; full campaign solutions and exact historical rules remain open.
- Physical phones, installed-PWA audio/orientation/thermal behavior, exact character likeness, final animation and host authenticated release smoke remain separate evidence gates.

## Historical checkpoints

# 2026-09-20 classic/original checkpoint

- Supplied original DAT: 149/149 records pass structural normalization; independent Python/TypeScript equality covers every upper/lower cell and optional field. Original Windows executable opens through portable WineVDM; screenshot saved in `output/shadow-circuit/original-review/original-lesson1.png`.
- Private atlas: 149 SVG maps and per-level mechanics/stacking inventories; all ten overview contact sheets inspected. This is not 149 solution verifications.
- Thirteen runtime GLBs: 311,356 bytes, zero Khronos errors/warnings; 13 decoder tests pass. Full rules suite: 37 pass. Three build-budget isolation tests pass.
- Original Lesson 1: development replay with save/restore on every move and actual Chromium/WebKit D-pad route both clear in 96 moves. Collects all 11 chips, opens eight locks; final inventory `[0,0,1,0]`. Lesson 3 visual source comparison captured. Evidence: `output/playwright/shadow-circuit-original/`.
- Lint/app typecheck/enabled production build pass. Startup preloads stay 1.20 MiB raw / 323.33 KiB gzip. Total deploy payload 95.10 MiB, within unchanged 100,000,000-byte cap. Private DAT is served separately and not emitted by the build.
- Chromium headless-shell at 1280×800 was intermittent (crashes with software/default rendering and one timeout). Full Chromium (`channel: chromium`) completed the desktop 96-move route; WebKit desktop and both engines at 844×390 also pass. Headless-shell diagnosis remains open; do not call this physical-device/performance acceptance. Desktop evidence: `output/playwright/shadow-circuit-original-desktop/` and `output/shadow-circuit/original-desktop-full-chromium.log`.
- Final classic authored regression: all three development chambers clear through D-pad input in both engines; save/reload, pause, portrait rotation and lazy loading pass. Tracked WebGL resources return to zero after exiting to menu. `output/shadow-circuit/classic-final-browser.log` links the timestamped screenshots/report. Two routing tests and documentation integrity (236 Markdown files) pass. Exact deployment size: 99,714,444 bytes; 285,556 bytes of headroom remain.
- Host backend remains stubbed during game browser QA. Authenticated host/cloud, physical phones, exact MS scheduling, all remaining campaign solutions, final HD roster/animation/audio are not verified.

## Earlier checkpoint evidence

# Shadow Circuit test evidence

Development evidence recorded 2026-09-19. A passing development profile is not exact Microsoft rules compatibility or release readiness.

## P00 baseline

Artifacts: `output/shadow-circuit/p00/`. Node 24.15.0, npm 11.14.1, Python 3.13.14, Blender 4.5.10 LTS; installed Playwright Chromium and WebKit.

Before implementation: supplied archive has 54 original files and all 47 supplied file checksums matched. Repository documentation check passed (226 files); repository-wide whitespace check reports pre-existing Unity texture metadata issues.

- Baseline TypeScript and build passed. Baseline Jest: 251 suites / 1,434 tests passed, 16 todo. Node suite: 57 passed. Package Python tests: 45 passed.
- Baseline lint failed on a generated copy under `output/checkers-release-source/`. Excluding generated `output/` in the root ESLint config resolved it; the full lint command was rerun successfully.
- Package validation initially failed because Windows path separators prevented tile-registry lookup. Changed the extracted verifier to `as_posix()` and refreshed only its supplied checksum entry. Package verification passes; the original ZIP is unchanged. Optional Python jsonschema validation was unavailable, so that check remains NOT_RUN.

## Game and host checks

- `npm run lint` and `npx tsc --noEmit -p tsconfig.app.json`: PASS after implementation.
- `node --test tests/shadowCircuitCore.node.test.mjs tests/buildBudgets.node.test.mjs`: 37/37 PASS (34 core, 3 budget checks). Includes corrupt snapshots, terminal outcomes, inventory/hazards, direction policies, PRNG restore, input ownership, 30/60/120 Hz determinism and package parser fixtures.
- Targeted existing host Jest suites (`appRouting`, `AuthGuard`, `GamesHomeDestinationBadges`): 23/23 PASS. New enabled/disabled routing tests: 2/2 PASS.
- TypeScript/Python importer parity: 149/149 CCLP1 records, all upper/lower cells, optional field bytes, numbers, timers and required chip counts preserved. Structural normalization/restore: 149/149 PASS. Their solutions and legacy behavior remain unverified.
- Three original ASCII chambers: all hand-authored route expectations replay to the expected exits, with snapshot/restore at every move boundary. Expected chip/key/door/push events are asserted. These are not a legacy oracle.
- Production-format enabled build: PASS including paused-feature checks and existing startup/deploy budgets. Babylon remains absent from initial/modulepreload dependencies and game-menu requests.
- Default-off build: PASS; no `ShadowCircuitScreen`, `circuitScene` or Babylon chunks in its manifest. Initial 1,256,152 raw / 331,035 gzip bytes; deploy 98,201,285 bytes. The Babylon manual-chunk rule is conditional so a disabled build does not emit even an empty engine chunk. Report: `output/shadow-circuit/flag-off-budget.json`.
- Documentation integrity: 235 Markdown files PASS. Scoped implementation `git diff --check`: PASS. Existing unrelated Unity metadata whitespace remains unchanged.

## Browser evidence

Final complete chamber run: `output/playwright/shadow-circuit-1789839805820/report.json` and sibling screenshots. Chromium uses software SwiftShader; WebKit uses its default Windows renderer. Both use an 844×390 touch viewport, plus 390×844 portrait checks. These are desktop browser engines, not physical phones or installed PWAs.

Both engines PASS: menu-first lazy loading, D-pad movement, stable paused ticks, focus rotation, portrait pause, saved Continue, reload restore, all three authored chambers completed using D-pad taps only, and exactly three deduplicated result rows. No state injection or direct win calls. The WebGL buffer/texture/program/shader/framebuffer/renderbuffer counters all return to zero after scene disposal.

The game browser suite stubs host Supabase fetches before boot and blocks live backend requests. An earlier unstubbed WebKit reload emitted an existing host notification foreground RPC access-control error. Authenticated chat/DM, real backend notification behavior and cloud saves are NOT proven by this suite. Two-account host smoke remains open.

## Measured build and art

Enabled build: initial 1,256,244 raw / 331,087 gzip bytes; Babylon 354,174 gzip bytes; entire deploy 99,802,170 raw bytes. Only 197,830 bytes remain under the unchanged 100,000,000-byte cap. Source `.blend`, calibration GLBs and CCLP1 maps are outside runtime output. Build report: `output/shadow-circuit/build-budget.json`.

Blender: six static samples generated, contact sheet inspected, 135,552 total GLB bytes. Official Khronos glTF validator: zero errors/warnings across all six; actual triangle counts match the manifest and budgets. Report: `output/shadow-circuit/p04/asset-validation.json`. They are not runtime-integrated, optimized, animated or final-quality accepted assets.

## Open evidence

No original campaign source/rights, exact MS oracle, complete mechanics interaction coverage, full final roster/music, cloud/RLS, imported-pack persistence, offline content cache, 20-cycle leak soak, measured cold-network loading, 15-minute thermal run, actual device checks or release acceptance. Full host suite was recorded as the pre-change baseline; focused affected suites were rerun afterward. `BLOCKERS.md` separates unavailable prerequisites from unfinished engineering.
