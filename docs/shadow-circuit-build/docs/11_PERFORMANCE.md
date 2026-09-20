# Performance budgets and measurement

All figures below are proposed acceptance targets, not achieved performance. Record actual supported device/OS/browser versions. Minimum target class: iPhone 11/12 and a real midrange Android device; high-tier test: Tayler's iPhone 16 Pro Max. Device class does not itself guarantee an FPS result. Use the real available baseline device and disclose substitution.

## Non-negotiable host budget
The inspected repo limits initial payload to 1,270,000 raw / 340,000 gzip bytes, individual eager/ordinary JS to 525,000 raw / 160,000 gzip, and total deploy to 100,000,000 raw bytes. Its existing explicitly lazy Phaser/LiveKit exceptions do not automatically include Babylon. See source snapshot S15; reread current values before editing.

Do not disable or globally raise those checks. Keep this game and its engine out of app startup and unrelated routes. Add a narrowly identified lazy-engine exception only when needed, measured and accompanied by a test that catches accidental eager loading. Start proposed Babylon aggregate cap at 650,000 gzip bytes across its engine chunks; optimize/import less when exceeded and record any justified revision. A chunk-name change must not bypass the budget. Test modulepreload and CSS as well as visible network requests. No prefetch of all game content from the Play launcher.

## Game targets
| Measure | Initial target | Measurement |
|---|---:|---|
| Cold first-play transferred bytes | <=8 MiB | Production build; all engine/decoder/font/model/audio/UI bytes until first playable |
| All game runtime content | <=20 MiB | Excludes editable source assets, includes every deployable pack and shared decoder |
| Branded DOM boot feedback | <=100 ms after route mounted | Main-thread mark; engine fetch not prerequisite |
| First playable on defined test network | <=8 s on 20 Mbps/80 ms RTT | Cold cache; separately report 5 Mbps behavior rather than hide throttling |
| High-tier steady play | 60 fps target, p95 frame interval <=20 ms | At least 5 minutes measured; report median,p95,p99,stalls |
| Baseline steady play | stable 30 fps, p95 interval <=35 ms | Fixed 30 fps mode; real phone |
| Draw calls | <=80 baseline / <=120 high | Include shadows, transparent passes and effects |
| Visible triangles | <=120k baseline / <=250k high | Instrument actual engine scene |
| App switch pause response | next event loop / frame | No hidden simulation catch-up |
| Logic/update p95 on baseline | <=3 ms | Separate simulation from GPU/DOM |
| Enter/exit resource stability | no monotonic growth across 20 cycles | Texture/mesh/context/node/listener counters; memory when available |

Loading shader compile spikes are reported separately, not removed from all metrics. Gameplay hitches remain in gameplay statistics. Use real touch/event timestamps for input feedback, proposed p95 visible response <=100 ms; **do not confuse one-tile travel time with input latency**.

## Rendering design
Baked/shared lighting appearance, one restrained directional light, ambient fill and cheap contact shadows. Real-time shadow map at most on high tier with tightly bounded casters/region; low tier uses blob/contact shadows. No SSR/SSAO/depth-of-field, heavy bloom, volumetric fog or full-screen motion blur by default. Cap device pixel ratio (start 1.25 baseline/1.5 high; 2 only when measured). Battery mode 30fps, reduced pixel density and particles, never different puzzle speed.

Use instancing for repeated mesh/material combinations. Thin-instance batches must be spatially chunked; avoid one 32x32 giant batch which can frustrate culling. Keep dynamic actors separate from frozen static batches. Update only changed cells/chunks. Share immutable geometries/materials and animations; pool short-lived particles. Do not create and dispose a mesh or React component per tick. DOM HUD updates only when its values change. No full board DOM mirror per frame.

Estimate texture GPU memory from decoded dimensions/format/mips, not `.glb` download size. Set a proposed game-owned texture cap <=64MiB baseline and measured transient allocation targets; browser total memory cannot be claimed from an unsupported API. Track resources even when total memory APIs are unavailable. Load just current chapter's cosmetic assets and the shared mechanic roster. Source textures and audio buffers should be released after upload/decode when safe.

## Lifecycle and resilience
One scene/engine owner. `AbortController` for loads; generation IDs ignore stale completion. Disposal stops render loops, cancels pending tasks, unbinds pointer/visibility/resize listeners, releases scene/engine/GPU objects and audio, and resolves/cancels UI promises. React StrictMode mount/unmount must not duplicate runtime. Context loss pauses and clears inputs; restore reconstructs from a verified checkpoint, with Retry/Exit fallback. Unsupported WebGL2 gets a clean explanation, never an infinite spinner.

Service worker: namespaced, versioned content manifests; immutable hashed assets. Do not precache private imported levels or all assets at app install. Cache approved download packs only after user requests it. Commit a version only after all required files validate; retain last working manifest until activation. Update only at a safe menu/checkpoint boundary. Remove only game-owned old cache entries. Account auth/API traffic is not cached by new broad rules.

## Measurement protocol
Production build over HTTPS, both browser tab and installed PWA. Log device model, OS, browser, power mode, resolution/DPR, quality tier, network profile, build hash, pack/level hashes and duration. Cover smallest, largest, most actors, most transparent hazards, clone-heavy and rapid transitions. Run at least 15 minutes for sustained thermal behavior; include a 30-minute soak on each primary device if available. No claim that a single desktop run or Playwright emulation measures iPhone heat or memory pressure. Record all missing hardware tests as NOT RUN.
