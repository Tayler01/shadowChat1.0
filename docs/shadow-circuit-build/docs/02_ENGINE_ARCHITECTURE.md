# 02 — Runtime architecture

## Why this engine
Babylon supplies 3D scene/camera/material/animation/audio capabilities and WebGL/WebGPU support [S05]. The architectural choice is to share TypeScript, app integration and test tooling with Shadow Chat, not a claim of universally better performance. Unity currently supports mobile web/PWA [S06], but this game does not need its editor runtime, separate C# bridge or native build targets. Blender remains the asset authoring tool. Do not build two engines in parallel.

## Dependency and version policy
Discover installed Node/package manager versions and repository requirements. Preserve the app's established Node baseline and existing dependencies. Query the registry for Babylon `core`/`loaders` versions, choose compatible stable versions, pin **identical exact versions**, inspect license/advisories, commit the lockfile. Do not globally upgrade Vite/React/TypeScript or add `latest` to a permanent script. Verify Babylon APIs against that selected version. No CDN script tags or production Inspector/debug bundle. Prefer direct module imports, measure the final import graph.

## Boundaries
**Core**: integer logical board coordinates, actor IDs, direction, inventories, counters, PRNG state, event ordering, trigger state, timers, run flags. No DOM, Babylon, React, fetch, Date.now or Math.random. CPU-only Node execution supports replay tests.

**Renderer**: subscribes to immutable logical snapshots plus bounded events; interpolates transforms; owns materials, instance buffers, animation mixers, light budgets and particles. It never decides whether a move is valid. Destroyed/hidden things disappear deterministically from the render model without leaking objects.

**Input**: turns physical contacts into timestamped direction intents with sequence numbers; maps them to the next simulation tick. It does not move meshes directly. Rendering may acknowledge button pressure immediately; gameplay effects remain authoritative.

**UI**: React handles menus, HUD, focus, readable status and dialogs. Update HUD on meaningful events or a capped display cadence, not one state update per mesh per frame. Use an external-store bridge where appropriate; avoid new framework state libraries unless needed.

**Persistence**: durable local transactions, namespaced owners, versioned snapshots/outbox. **Integration**: sole owner of app/session/Comfort coordination. **Audio**: event-driven feedback; audio success never gates gameplay.

## Simulation contract
Use a fixed logical scheduling model. Initial engineering scaffold: 20 simulation ticks per second, normal traversal planned at four ticks (200 ms). Before calling the compatibility mode `mscc-compat-v1`, verify exact MS scheduling and interactions against selected reference fixtures. Change tick phases if required; do not force the reference to match an arbitrary scaffold. Compatibility profile contains scheduling, PRNG, actor ordering and edge-case flags, not just a label.

Every tick receives previous state and accepted input and emits next state + ordered events. Define the precise phases in `RULESET_CONTRACT.md` during P02: command sample; movement eligibility; source/destination edge checks; push attempts; actor movement order; triggered item/hazard effects; trap/clone/toggle effects; time/death/exit resolution. This list is a checklist, **not an assumed original ordering**. Validate simultaneous/swap collisions, cloned actor insertion and pending effects before freezing order. Once frozen, golden cases encode it.

Run an accumulator on monotonic foreground elapsed time; cap catch-up work. A long stall pauses rather than killing the player through hidden catch-up. Background/portrait overlays pause simulation and reset the accumulator. Never vary gameplay speed to rescue rendering frame rate. Test identical final hashes under 30/60/120 Hz render schedules and the same logical input trace.

## State and versioning
Use stable `rulesetVersion`, `campaignId`, `campaignContentHash`, `levelId`, `levelContentHash`, `seed`, `tick`, `runId`, `schemaVersion`. Preserve actor update order explicitly. Random actors use a serializable deterministic generator for the chosen ruleset; seeded behavior alone does not prove historical PRNG parity. Snapshot pending moves, trigger states, random state and time; restore only at validated logical boundaries. A save that omits actor order is incomplete.

Immutable input/seed/level data plus complete core state enable reproducible replays and undo. Ring-buffer snapshots/deltas have bounded memory. Do not run a solver on the UI thread. Solver tasks have explicit state/time budgets and report `unknown`, not `unsolvable`, on exhaustion.

## Reliability cases
Idempotent init/dispose; async cancellation; meaningful error codes; renderer context lost → pause + durable checkpoint → explicit recover; missing asset → labeled recoverable error, not an invisible collider; renderer unavailable → accessible static explanation. No 2D fallback falsely advertised as the 3D game. Font failure falls back to an existing system stack without breaking controls.

## Camera and world coordinates
Use one documented convention: logical x east, row y south; Babylon world X east, Y up, Z south with camera convention verified by tests. File directions are explicitly mapped, not inferred from enumeration order. Choose handedness once and verify Blender/glTF imported forward/up and face culling. Tile-center pivots; source coordinates never become guessed offsets. Level height is separate render metadata, not raw DAT lower-layer contents.
