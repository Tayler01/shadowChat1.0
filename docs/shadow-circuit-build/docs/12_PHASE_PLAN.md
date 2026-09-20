# Execution plan — P00 through P11

This is a dependency plan, not twelve separate user approvals. Continue automatically through all independently executable work. A blocked content/license or physical-device gate stays blocked; it does not authorize fabricated evidence and does not block unrelated engine/UI production. Never ship an unverified gate. Maintain STATUS, BLOCKERS and requirement/asset/level ledgers as working memory.

Commands shown as existing `npm run` scripts must be checked against current package.json. Commands prefixed `shadow-circuit:*` below are **new implementation deliverables**, not scripts already present in the repository. Add them only with real behavior and documentation.

| Phase | Focus | Dependencies | Required output / exit gate |
|---|---|---|---|
| P00 | Read-only preflight and baseline | None | Repo/tools/branch policy/dependency audit; existing test results; scope and protected files recorded |
| P01 | Embedded 3D mobile proof | P00 | Lazy launch/exit, representative scene, D-pad, sizing, audio unlock, lifecycle and measured first payload |
| P02 | Source data and compatibility contract | P00 | Acquired approved test content, parser results, complete tile/actor/link matrix, versioned rules schedule and reference fixtures |
| P03 | Deterministic simulation | P02 | Every required mechanic and interaction independently tested; frame-rate-invariant replays and snapshots |
| P04 | 3D asset and camera production | P01,P02 | Complete quality calibration, pipeline, manifest, camera/height-map invariants and real scene integration |
| P05 | Finished sample level | P03,P04 | One fully finished representative level with branded boot/menu/HUD/audio/controls/death/results |
| P06 | Complete campaign and guide | P03,P05 | All acquired intended levels normalized, rendered and validated; original-source gate reported separately |
| P07 | Saves and private sync | P03,P05 | Atomic local saves, offline recovery, account isolation, local migration/RLS tests, conflict/outbox behavior |
| P08 | Complete product surfaces | P05,P06,P07 | All menus/settings/records/passwords/assists/credits/loading/recovery states functional and polished |
| P09 | Mobile performance hardening | P06,P08 | Production network/GPU/input/soak tests; optimize/fix; evidence on available actual phones |
| P10 | Full regression and defect closure | P09 | Requirement coverage, full campaign replay/playtest evidence, host regression/security/accessibility review |
| P11 | Release-candidate handoff | P10 and explicit open-gate accounting | Reproducible candidate, honest readiness report, source/rights ledger, rollback and deployment instructions; NO production deploy |

## P00 — baseline
Read root and relevant nested AGENTS; locate actual repo and dirty changes. Read current package/lockfile, game host, routing, feature flags, Comfort, auth/save conventions, service worker, Vite chunking, headers and budgets. Run `preflight.ps1`, package tests, and applicable existing lint/typecheck/unit/build/Node scripts. Record failures before editing; do not label preexisting failures fixed without rerunning. Record whether Blender works headless, Node matches repo baseline, Python works and Playwright browsers are available. Resolve missing tooling via documented workspace-scoped setup; no silent global updates or disabling Windows security.

## P01 — prove the risk first
Create isolated runtime entry with immediate DOM shell and feature flag. Load only on launch. Implement enter/exit/resize/visibility, safe-area controls and best-effort orientation; a simple but representative scene includes instanced board, animated actor, water/fire and loading. Check real production bundle behavior early. Perform available browser tests and expose a local/preview HTTPS build for physical checks through approved existing tooling. A device unavailable gate is NOT RUN; continue independently while preserving uncertainty. If Babylon cannot meet essential constraints after measured targeted fixes, record ADR and fallback analysis before changing engine, never maintain two engines simultaneously.

## P02 — lock behavior before scale
Run acquisition and importer, record source identity and terms. Map every legacy tile and optional field; preserve raw data. Inspect maintained reference implementations/docs for variant-sensitive mechanics without copying license-incompatible code. Author truth-table fixtures for normal movement, simultaneous events, forced moves, collisions, trap/clone wiring, PRNG and scheduling. Freeze `mscc-compat-v1` only when documented expectations support it; unknown behavior stays explicitly unknown. Build `shadow-circuit:content-audit` and `shadow-circuit:test-rules`. Exact original data may still be blocked; no claim of exact original compatibility from community-only tests.

## P03 — complete headless logic
Build parser normalization, tile/actor registry, deterministic scheduler, input queue, inventory, triggers, hazards, level outcomes, snapshot/replay and diagnostics. Keep DOM/engine imports out of core. Test each requirement including negative/edge cases. Add intentional authored tiny levels proving combinations; never derive expected outcomes by running the same new engine and blessing its output. Build `shadow-circuit:replay` and `shadow-circuit:validate-levels`; seeded random states/property tests supplement, not replace reference truth fixtures.

## P04 — real art pipeline
Build Blender recipe scripts and parameterized palette, export quality samples, inspect at gameplay scale, refine. Create all assets and animations in manifest; validate glTF and load final files in game. Implement camera/screen-relative controls, focus mode, near-wall occlusion and height-map projection. Test no new legal edges and no changed travel time from slopes. Asset path existence alone does not pass visuals. Keep unapproved sources out of runtime output.

## P05 — polished sample
Finish a complete representative level containing essential combinations. It should launch from Shadow Chat with final-quality branding, staged loader, sound, input, readable camera, meaningful death and immediate retry, completion and safe exit. Automated and human visual/feel review must assess it. Fix placeholder/ugly/ambiguous art here; don't replicate it through the whole campaign. Persist chosen art tokens/camera/control conventions and screenshots as baseline. This phase is a checkpoint, never the final deliverable.

## P06 — campaign scale
Import all levels from the verified intended source, preserving order/IDs/title/hints/passwords/links/actor order. Add render-only skins/elevation as versioned overlays. Build level-select chapter virtualization, guide/bestiary and per-level status. Replay supplied authorized solutions with matching rules when available; otherwise solve/playtest and record real traces. A static BFS cannot prove dynamic puzzle solvability. For unsolved levels, keep status UNVERIFIED rather than remove or simplify them. Distinguish original, community and synthetic sets in every screen and report. Verify secret/source level visibility rules deliberately.

## P07 — durability
Implement local data schema/migrations, checkpoint/journal, crash recovery, results dedupe, identity namespaces and export/import. Add private cloud tables/RLS via local workflow, sync/outbox and conflict tests. Offline mode is not blocked by cloud. Cloud writes must not upload imported source maps. No production migrations in this task. Tests require normal authenticated contexts A/B plus anon, never solely service role.

## P08 — finish every surface
Implement the full UI state table, all settings, game controls, guide, records/achievements, new assists and verified source passwords. Add real loading/error/offline/update content, all artwork/audio/credits, and quality/battery/Comfort behaviors. Check text scaling and focus. Remove debug panels from release UI while retaining safe development diagnostics behind non-production gating. No inert buttons or navigation dead ends. Debug/import text cannot inject HTML.

## P09 — optimize the actual built game
Capture cold/warm payload, timing and full device matrix. Fix resource leaks, GPU budgets, excessive DPR, first shader compile, retries, long sessions, touch failure and orientation/visibility issues. Test HTTP headers/asset content types against the actual preview; CSP must permit only needed self-hosted resources and decoders. Re-run app build budgets and all protected-route checks. Never optimize by altering gameplay speed or deleting hard levels/art requirements.

## P10 — independent verification
Run applicable `npm run lint`, `npm run typecheck`, unit tests, `npm run test:node`, build, existing mobile/Play smoke commands and all added game commands. Validate clean/assist scores, all menu paths, injected errors, real mobile input, every level's status and full asset roster. An independent QA pass should attempt to break assumptions. Track severity: release-blocking, major, minor. No open release-blocking bugs; all major unresolved issues explicitly block release. No screenshots/test data claimed from devices that never ran.

## P11 — package and stop before production
Produce diff summary, exact build commands/tool versions, asset recipes/source files, documentation, compatible save/version migration notes, manifests and SHA256 hashes, preview instructions, evidence and remaining gates. Include ENGINEERING, VISUAL/CONTENT, ORIGINAL-CAMPAIGN and DEVICE/RELEASE statuses separately. Human prerequisites should be precise, not “test it sometime.” Document feature flag off/rollback and data-preservation steps. Do not auto-push/deploy/apply linked migrations.

## Recovery and session continuity
After each phase update a short NEXT_ACTION with exact file/tests to resume. On repeated tool failure change approach after 2–3 attempts; do not spend the session retrying identical calls. A failed test gets diagnosis/fix/rerun, not deletion or an inflated threshold. If a context limit interrupts, leave a truthful resumable checkpoint. No asynchronous promise and no final “complete” while work is incomplete.
