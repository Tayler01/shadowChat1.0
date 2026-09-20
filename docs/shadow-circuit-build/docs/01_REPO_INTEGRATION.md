# 01 — Existing app integration

## Observed repository, not an instruction to overwrite it
Repository: `Tayler01/shadowChat1.0`. Inspection date: 2026-09-17. Prior-turn reads verified React 18, TypeScript, Vite, Phaser, Supabase, Jest and Playwright in package.json; re-read the local lockfile and instructions. Existing `GamesHome.tsx` owns experience selection, music, immersive entry/exit and orientation assistance. Existing root guidance mandates mobile-first and shared Comfort policies and preserves paused features. Source paths are linked in the source register.

Current inspected routing has a `PlayExperience` union, `PLAY_EXPERIENCES`, `PLAY_EXPERIENCES_WITH_ITEMS`, `normalizePlayExperience`, and `resolvePlayRouteMutation` in `src/lib/appRouting.ts`. Add `shadow-circuit` consistently; missing any one can make links fail despite a visible launcher tile. Add level `item` IDs only with validated campaign-qualified IDs; do not reuse match IDs.

## Inspect before editing
`AGENTS.md`; any local scoped instructions; `package.json` and lockfile; `src/features/games/GamesHome.tsx`; `src/lib/appRouting.ts`; `src/config/featureFlags.ts`; `src/types/navigation.ts`; current shared Comfort provider and `docs/ACCESSIBILITY_COMFORT.md`; current service worker and PWA manifest; Netlify headers/CSP; `scripts/verify-build-budgets.mjs`; `tests/buildBudgets.node.test.mjs`; existing game QA and asset manifests. Source snapshot file SHAs are in `manifests/repository_observations.json`.

## Proposed file boundaries
```
src/features/games/shadow-circuit/
  ShadowCircuitScreen.tsx
  integration/       # app bridge, Comfort bridge, back/pause coordination
  ui/                # menus, dialogs, HUD, control surface, styles
  core/              # browser/renderer-independent deterministic simulation
  renderer/          # Babylon scene, actor views, camera, asset lifetime
  input/             # pointer/keyboard intent collection
  content/           # normalized content index; importer separate
  persistence/       # IndexedDB, private progress sync, migrations
  audio/             # event-to-sound bridge, lifecycle and mixing
  diagnostics/       # bounded debug overlay, QA state export
  assets/manifest.ts # runtime file references, no source .blend
  tests/
tools/shadow-circuit/ # Blender source/scripts, source content outside public/
public/games/shadow-circuit/ # optimized, licensed runtime assets only
scripts/shadow-circuit/     # import, package, QA, content validation
```
These are proposed new paths; adapt names to local conventions without changing ownership boundaries.

## Lifecycle contract
`mount` creates no renderer until the game is selected. `enter` coordinates immersive mode and audio ownership, loads resources with cancellation and shows branded progress. `pause(reason)` freezes gameplay time and clears physical input. `resume` requires an intentional gesture after interruptions. `exit` persists a checkpoint before in-memory teardown when feasible, then releases GPU objects, aborts pending downloads, stops sound, removes listeners, releases orientation/fullscreen only if this feature acquired them, and restores app navigation.

StrictMode mount → dispose → mount must work. Use an instance/session token to ignore stale async asset completion. One renderer/canvas per game instance. Switching to another game cannot retain Shadow Circuit's soundtrack. A denied fullscreen/orientation request must not reject game startup; use rotate UI. Deep links should open the game menu/level-intro safely, never immediately run a timer under a dialog.

Do not rewrite global app routing. Use the existing route action conventions and test cold links, in-app entry, item → menu → Play, browser back and forward, and exit to prior app state. Add a development preview path only when explicitly guarded by development mode/localhost; no authentication bypass on production hosts.

## Comfort integration
The current Comfort contract is device-local; do not describe it as account-synchronized. The provider governs motion, transparency, contrast, text, target size, autoplay, interface/celebration sounds and haptics. New game code consumes the provider and maps it into camera/particle/audio policies. Game-specific music/SFX preferences can live under a namespaced record but must obey the effective app policy. Do not add independent matchMedia/localStorage/vibration checks to components.

## Budget integration pitfall
The inspected verifier caps initial raw payload at 1,270,000 bytes and gzip at 340,000; regular JS chunks at 525,000 raw / 160,000 gzip; total deployed files at 100,000,000 bytes. Exceptions are specifically named Phaser and optional LiveKit chunks. A Babylon chunk may require a narrow, measured **lazy-only game-engine exception** with matching verifier tests. Do not raise all existing caps or rename Babylon as Phaser. Preserve aggregate initial load and prove no Babylon preload/import on non-game routes. Prefer measured modular splitting before adding a new exception.

## Integration proof
Baseline vs candidate: initial manifest graph and transfer size; no new game network requests while opening Chat/DM/Play without launching; old games still open/close; paused surfaces remain omitted; background notifications/auth unaffected; new game storage scoped by owner; game exit leaves no recurring work. Database changes are additive/local and never applied to linked production without release authorization.
