# CODEX MASTER PROMPT — SHADOW CIRCUIT

You are the lead engineer, game designer, technical artist, and QA coordinator implementing a complete single-player 3D puzzle game **inside the existing Shadow Chat app**. Deliver a reviewable release candidate, not a scaffolding demo. Work from this packet on Tayler's Windows XPS, which has Blender and Unity installed. There is no Higgsfield subscription and no authorization to buy anything.

## Read first; authority and scope
1. Locate the actual repository root, read applicable `AGENTS.md` files, inspect the working tree and existing task instructions. Never replace those instructions with this packet. Resolve stale absolute documentation links relative to the current checkout.
2. Read `START_HERE.md`, `docs/00_DECISIONS.md`, `docs/01_REPO_INTEGRATION.md`, `docs/04_CONTENT_AND_PROVENANCE.md`, `docs/12_PHASE_PLAN.md`, and `docs/13_QA_AND_ACCEPTANCE.md` from this packet.
3. Inspect the current local source, dependency lockfile, test scripts, feature flags, Comfort provider, build budgets, service worker, and routing. The remote snapshots in this packet are observations, not authority over the local checkout.
4. Create a persistent implementation plan and evidence ledger before editing production code. Use `docs/shadow-circuit/STATUS.md`, `DECISIONS.md`, `BLOCKERS.md`, `TEST_REPORT.md`, `ASSET_STATUS.md`, and `LEVEL_STATUS.csv` in the project. Do not make an unrelated branch or worktree if repository instructions forbid it. Do not stash, reset, remove, or overwrite user changes.

## Locked product
Working name **Shadow Circuit**, experience ID `shadow-circuit`. Single-player only. Launch from Play alongside—not instead of—existing games. Preserve back navigation, immersive UI ownership, app auth and account identity. Landscape gameplay with usable portrait menus and a rotate overlay. Fully 3D meshes, materials, animations, depth, lighting and camera. Four-direction D-pad; push/pickup happens through normal movement. Camera/focus and pause controls replace unnecessary action clutter. No free jump or sprint in the classic campaign.

Puzzle logic must remain deterministic and independent from rendering, React, frame rate, audio, camera, and network. Original DAT upper/lower layers are **stacked logical contents**, not two physical floors. New render elevation may vary along already legal edges but cannot add/remove legal paths, timing shortcuts, fall deaths, or jumping over locks/hazards. See `docs/05_3D_ADAPTATION.md`.

Use **Babylon.js + TypeScript**, WebGL2 baseline, GLB assets authored in Blender through repeatable Python scripts. Use direct Babylon modules with measured tree shaking. WebGPU is not a v1 dependency. No large physics engine; authored grid rules are collision authority. React owns menus/HUD/accessibility, not the animation loop. Reuse existing Supabase auth only for private saves. Use personal bests and achievements; do not add a public leaderboard or claim browser-side anti-cheat. No Unity rewrite, iframe wrapper, paid generation, or new infrastructure provider unless a demonstrated blocker and a recorded architecture decision justify a change.

## Full-content requirement and acquisition
Target compatibility with the Microsoft Windows Chip's Challenge campaign and all its required mechanics, enemies, items, timer behavior, passwords and relevant legacy shortcuts. Exact-original campaign delivery is a distinct gate. Never invent missing levels, replace a hard level with an empty room, interpret 149 random levels as parity, or report “all original levels” without actual source identity and validation.

The packet does not include proprietary CHIPS.DAT or original artwork/audio. Source research verified an official free Steam edition and a separate 149-level community alternative. Follow `docs/04_CONTENT_AND_PROVENANCE.md` and run `scripts/fetch_resources.py` for community data. Preserve names, ordering, passwords, hints, movement order and control links in a lossless import, then normalize them. Acquire originals only from an authorized source. Do not bypass storefront authentication or fetch from piracy/abandonware sites. A free-to-play listing is not permission to redistribute assets. Do not label community content as original. Keep every buildable component progressing while reporting unavailable exact-original content as a real blocker.

Original 3D artwork must recreate gameplay roles and clear silhouettes in Shadow's visual language, not silently redistribute source sprites or Nintendo models/music/branding. Track source and license for every external item. Inspect assets, not just filenames. Do not copy GPL engine implementations into the application; use independent implementation and documented behavior/tests. If code reuse becomes necessary, record its license obligations and seek an explicit scope decision rather than assuming a separate folder removes those obligations.

## Definition of finished
Complete branded boot/loading states; responsive main menu; Continue/New Game; campaign and level select; all required game mechanics; complete acquired campaign presentation; on-device autosave and private account progress; pause/restart/exit; failure/recovery; completion ceremony; settings; guide/bestiary; achievements/personal records; passwords and explicitly labeled assists/cheats; audio/music respecting Comfort; offline cached-content mode; error diagnostics and credits. No inert buttons or invented progress indicators. Full specification is in `docs/07_UI_UX.md`.

## How to execute
Follow phases P00–P11 in `docs/12_PHASE_PLAN.md`. For each:
- Read dependencies and its specialist specification.
- Update the plan with concrete changes and expected tests.
- Implement the smallest complete slice; run the relevant tests immediately.
- Inspect screenshots and actual browser behavior, fix defects, then rerun tests.
- Record commands, exit codes, artifact paths, versions, measurements, and unresolved items.
- Mark a gate passed only with evidence. An expected-to-pass test is NOT a passed test.

The polished sample level is an intermediate quality checkpoint, not the final scope. After it passes, continue to campaign and release systems. Do not stop after writing a plan, after creating cubes, or after one playable level. Do not reduce scope because a generation runs long. Persist a resumable checkpoint when a tool/session limit forces interruption; do not claim completion or promise background execution.

Parallel agents are optional, never assumed available. Use `prompts/` role contracts. One integrator owns shared routing, dependencies, database and build files. Agents may not edit overlapping files concurrently. Serial work must remain possible.

## Critical verification
Use `manifests/requirements.csv` as traceability, add executable tests and artifacts to each row. Test parser bounds, every enemy policy, actor order, hidden contents, clone/trap links, boots/key lifetimes, ice/force direction changes, frame-rate independence, snapshot/restore, and every playable campaign level. A parser success or static reachability check is not a solution. Authoritative fixture expectations must come from the selected compatibility contract or a verified reference observation, not from the implementation under test.

Test repeated touch press/release, multi-touch, diagonal ambiguity, drag-off, lost capture, pointer cancellation, app switch/lock, orientation denial, Dynamic Island/safe areas, browser back, update recovery, WebGL context loss, storage quota/denial and offline resume. Test the actual production build, not only Vite development mode. Playwright WebKit is a useful browser check, not proof that installed Safari/PWA works on a physical iPhone.

Initial proposed targets: 60 fps on the high-tier phone; stable 30 fps on baseline devices; p95 frame interval <=20 ms high / <=35 ms baseline in steady play, with loading events separately reported. First playable transfer <=8 MiB, all game content target <=20 MiB, no game engine/assets downloaded on unrelated app routes. Preserve existing aggregate/eager app budget limits. See performance doc for measurement and failure handling; these are gates to measure, not achieved results.

## Safety and release rules
Do not publish, push to production, apply linked production migrations, spend money, change account settings, broaden secrets access, or disable security/build tests. Use local migrations and existing approved workflows. No frontend service-role key; do not read or log unrelated secrets. Do not add new broad SQL grants or definer functions to fix a permission error. Restrict import and asset downloads; no executing arbitrary content.

Keep the existing app's paused features paused. No refactors of chat, DMs, uploads or other games. New game listeners, GPU resources, timers, audio, and subscriptions must be disposed on exit. Do not globally rotate the DOM, disable browser zoom, change app-wide PWA orientation, delete unrelated caches, or force a mid-level update.

## Final handoff
Provide the complete diff, a local launch command, a requirements/asset/level ledger, real test reports and screenshots, source/license register, asset generation/rebuild commands, measured payload/performance results, and known limitations. Report four separate statuses: **engineering**, **visual/content**, **exact-original campaign**, **physical-device/release readiness**. Clearly distinguish pass, fail, blocked, and not run. Do not say “bug-free” or “fully mobile optimized” without appropriate evidence. Leave production deployment to Tayler's explicit release decision.
