# Shadow Runner Level 8: Courier Catacombs

Status: local production candidate, awaiting launch approval and physical-device
balance validation

Last verified: July 27, 2026

## As-Built Release Record

Courier Catacombs is implemented as Campaign Level 8 with:

- A 16,200-pixel route, 8 bounded checkpoints, 72 coins, 22 enemies, 6 tilt
  bridges, 5 mandatory crouch lanes, 10 multi-height volley lanes, 6 spectral
  platforms, and 9 sleeping encounters.
- Three mandatory Relay Seals, five optional Courier Caches, four Wraithlight
  pickups, three Mirror Wards, and a required final Rival Courier.
- Tomb Lurker, Crypt Warden, and Rival Courier enemy archetypes with reusable
  runtime metadata and behavior.
- Reusable guarded enemies, reflected projectiles, spectral platforms,
  bounded checkpoints, sleeping encounters, and sealed spectral arena gates.
- Full-clear and perfect-route completion states in addition to numerical
  score.
- A complete generated art set for the background, terrain atlas, three enemy
  strips, four collectible strips, campaign button, and two thumbnails.
- A Level 8 catalog migration that advances and immediately recalculates the
  current knight medal without applying remote state before approval.

Playtest fixes completed during the production loop:

- Moved the route-intro timeout behind Phaser readiness so slower phones see
  the story and objective before play begins.
- Replaced the first overhang's blocking 50-pixel pillar with the intended
  hidden floating toe-step, preserving the difficult upper route while opening
  the mandatory crawl path.
- Added visible physics-backed spectral barriers to the two sealed encounters.
- Removed full-screen Wraithlight and Mirror Ward flashes that could remain
  opaque for too long under low-frame-rate WebKit rendering.
- Corrected the Level 8 migration to the canonical `medal_rank` and
  `is_medal_candidate` catalog schema.

Final local evidence:

- `npm run lint`: passed.
- `npx tsc --noEmit -p tsconfig.app.json`: passed.
- `npx jest --runInBand`: 248 suites passed, 1,395 tests passed, 16 existing
  todo tests.
- `npm run build`: passed, including paused-feature verification and bundle
  budgets.
- `node --test tests/shadowRunnerRuntimeAssets.node.test.mjs`: passed.
- Level 8 WebKit 740 by 390 and Android Chromium 932 by 430 production-preview
  smoke: passed with nonblank screenshots, objective gating, powers,
  checkpoints, sealed encounters, bounded pools, fall recovery, and
  completion.
- Level 7 two-profile regression smoke: passed.
- `supabase db push --dry-run`: connected to the linked project and reported
  only `20260727113413_shadow_runner_level8_available.sql`; no remote mutation
  was made.

The remaining launch check is a physical iPhone or Android first-clear and
mastery-route balance run. Headless WebKit validates the iPhone layout,
controls, powers, objectives, and completion, while sustained real-time physics
is covered by Android Chromium because headless WebKit aggressively throttles
Phaser animation frames.

## Product Goal

Ship the longest, most dynamic, and most demanding Shadow Runner route so far
without making normal completion depend on blind jumps, unreachable pickups, or
perfect combat. Courier Catacombs should reward deliberate route planning and
mechanic mastery while remaining beatable through a clearly readable main path.

The level is a production launch, not a prototype. It includes final art,
campaign unlocking, medal-catalog advancement, mobile QA, route regression
coverage, and a complete launch checklist.

## Player Fantasy

The Rival Courier stole the final relay seals and escaped into the abandoned
courier tunnels beneath the city. The Runner descends through old dispatch
vaults, lights spectral paths, turns incoming fire back on hidden archers, and
hunts the rival to the sealed underground relay door.

Courier Catacombs keeps the current campaign-map name while recovering the
older Rival Messenger story hook. This makes the existing map destination and
the preserved story direction agree without renaming the route.

## Scope

- Campaign Level 8 becomes playable after Level 7.
- Target world width: 16,200 pixels, at least 27 percent longer than Level 7.
- Target run time: 9 to 13 minutes for a first clear.
- Main goal: collect three Relay Seals, defeat the final Rival Courier, and
  open the relay door.
- Mastery goal: collect every coin and Courier Cache, defeat every enemy, and
  finish the route.
- Two new reusable power-ups: Wraithlight and Mirror Ward.
- Three new reusable enemy types: Tomb Lurker, Crypt Warden, and Rival Courier.
- New spectral-platform and reflected-projectile systems.
- New background, terrain, enemy, collectible, objective, UI, and thumbnail
  art.
- Existing crouch, shield, Chrono, Shadow Surge, archer volley, fall damage,
  tilt bridge, and mixed-enemy systems return in deliberate combinations.

## Non-Goals

- No new player input button or gesture.
- No mandatory invisible platforming.
- No randomized route geometry.
- No requirement to kill every enemy for a normal clear, except the explicitly
  marked final Rival Courier.
- No remote Supabase mutation before launch approval.
- No redesign of the Shadow Runner shell, campaign map, or shared controls.

## Difficulty Contract

Normal completion is harder than Moonlit Causeway but fair:

- All three Relay Seals sit on readable, physically reachable main-route
  encounters.
- The finish gate reports exact missing requirements.
- No mandatory horizontal jump exceeds the verified movement envelope without
  a visible intermediate landing, tilt bridge, or recovery floor.
- Long falls either land on a recovery route or use existing checkpoint and
  life rules.
- Wraithlight routes are optional mastery routes. Missing or losing the
  power-up never blocks the main route.
- Mirror Ward makes remote archer eliminations practical, but players can pass
  those encounters using shield pockets and cover.
- Every major gauntlet begins near a checkpoint and a strategy resource.

Mastery is intentionally difficult:

- Five Courier Caches appear only while Wraithlight is active.
- Several coin lines use spectral upper routes, crouch lanes, and high-risk
  drops.
- Remote archers and optional enemies require Mirror Ward timing, platform
  routing, or backtracking.
- A full clear requires all coins, all caches, all enemies, all seals, and a
  successful finish.
- A perfect route adds all three lives remaining and zero checkpoint respawns.
  Health damage is allowed, while the numerical score preserves a separate
  hitless challenge for elite runs.

## New Reusable Systems

### Wraithlight

Wraithlight is a timed lantern power-up that reveals and solidifies configured
spectral platforms, exposes hidden Courier Caches, restores a small amount of
health, and awards score.

- Default duration: 11 seconds.
- Default health restore: 2.
- Spectral platforms show a faint non-colliding hint while inactive.
- Active platforms become bright, solid, and collision-enabled.
- Expiration must never strand the player over an unavoidable death. Every
  spectral branch returns to a visible route or recovery floor.
- The system is level-config driven so later routes can reuse it.

### Mirror Ward

Mirror Ward is a timed projectile-reflection power-up.

- Default duration: 10 seconds.
- Default reflection charges: 5.
- Incoming arrows and thrown candles reverse direction, change visual state,
  and can damage enemies.
- A reflected projectile cannot hurt the player who reflected it.
- Reflection uses the existing bounded projectile pool.
- The system is level-config driven and can be reused in later boss routes.

### Relay Seals

Three Relay Seals are mandatory objective pickups.

- Each seal has a score value and animated pickup art.
- HUD and debug state report exact collected and total counts.
- The relay door stays closed until all seals are collected and all configured
  required enemies are defeated.
- Missing requirements are surfaced as readable checkpoint-style feedback.

### Courier Caches

Courier Caches are optional mastery collectibles.

- Five caches are configured in Level 8.
- Caches are collectible only while Wraithlight is active.
- HUD and completion results show exact cache progress.
- Caches contribute to mastery but never block normal completion.

### Guarded Enemies

Crypt Wardens introduce a reusable guard meter.

- Frontal sword strikes break guard before health.
- Stomps, rear attacks, reflected projectiles, and attack boosts bypass or
  break guard more efficiently.
- Guard state is visible in the enemy health treatment and debug snapshot.
- Guard logic is data driven rather than hard-coded to one enemy instance.

### Branch-Aware Checkpoints And Sleeping Encounters

The Catacombs uses vertical branches, so checkpoint and encounter activation
must use configured rectangular bounds rather than horizontal position alone.

- Each checkpoint can declare minimum and maximum trigger Y values.
- Optional upper or lower routes cannot accidentally arm a checkpoint intended
  for another branch.
- Ambush enemies remain asleep until the player enters their encounter bounds.
- Sleeping enemies do not patrol, attack, or allocate projectiles.
- Sealed encounter doors reopen only when the configured enemy IDs are
  defeated.
- Every optional branch rejoins before the next mandatory checkpoint.

## New Enemy Set

### Tomb Lurker

A broken grave marker that erupts into a fast jade-lit ambusher.

- Role: telegraphed surprise pressure and secret-room defense.
- Health target: 3.
- Contact damage: 2.
- Behavior: remains dormant until its encounter activates, shows a bright
  700-millisecond grave-rune tell, then performs a short committed lunge.
- Counterplay: move through the tell, jump and stomp, or strike during the
  post-lunge recovery.
- Art strip: six 128 by 128 bottom-centered frames for dormant, warning,
  emerge, lunge, hit, and defeated.

### Crypt Warden

A heavy armored tomb guard with a lantern shield and hooked polearm.

- Role: lane controller and route-choice pressure.
- Health target: 6.
- Guard target: 2.
- Contact damage: 3.
- Behavior: slow patrol, faces nearby player, braces, then performs a short
  charge.
- Counterplay: rear attack, stomp, boost, reflected projectile, or repeated
  frontal guard breaks.
- Art strip: six 128 by 128 bottom-centered frames for idle, walk, brace,
  charge, hit, and defeated.

### Rival Courier

A readable rival-runner silhouette with a pale half-cape, crimson route sash,
and hooked courier blade. The rival must be distinct from the player at phone
scale.

- Role: chase pressure and final required duel.
- Health target: 9 for the finale.
- Contact damage: 3.
- Behavior: fast patrol, telegraphed dash, short recovery window, and a stronger
  final encounter.
- Counterplay: jump over the dash, attack during recovery, use Mirror Ward
  against supporting ranged enemies, or use Shadow Surge for a shorter duel.
- Art strip: six 128 by 128 bottom-centered frames for ready, run, dash,
  blade attack, hit, and defeated.

## Returning Enemy Set

- Tower Archers create long-range, multi-height pressure.
- Moon Stalkers punish hesitation in open tunnels.
- Candle Jesters create short-range area denial.
- Scroll Thieves guard optional branches.
- Clockwork Sentries and Lantern Bandit Scouts fill lower-intensity transition
  encounters.
- Barrel Rollers appear only where recovery space makes their knockback fair.

## Encounter Outline

### Zone 1: Burial Descent, x 0 to 2,100

- Establish high-contrast catacomb terrain and the first checkpoint.
- One sentry and one bandit teach the new palette at familiar intensity.
- First Wraithlight sits on the visible route.
- A short spectral branch previews one optional coin line and returns safely.
- First crouch tunnel is mandatory and contains reachable low-lane coins.
- One Tomb Lurker introduces its clearly visible emergence tell on flat ground.

### Zone 2: Forked Galleries, x 2,100 to 4,300

- Visible lower route is slower and guarded.
- Wraithlight upper route contains Cache 1 and a dense coin line.
- First Crypt Warden introduces guard and rear-attack counterplay.
- Relay Seal 1 sits after the routes rejoin.
- Oversized gaps use visible recovery chips or lower catch floors.

### Zone 3: Dispatch Vaults, x 4,300 to 6,500

- Scroll Thieves and a Candle Jester create a mixed close-range ambush.
- Two Tomb Lurkers wake in sequence rather than simultaneously.
- Cache 2 sits behind a timed spectral ledge sequence.
- A Chrono Lantern gives one optional solution to the faster tilt bridge.
- The section ends with a safe checkpoint and a clear view into the Ossuary.

### Zone 4: Arrow Ossuary, x 6,500 to 9,000

- Multi-level volleys begin before the source archers are visible.
- Cover pockets support stand, crouch, and jump-level timing.
- Mirror Ward is placed before the first unavoidable pressure lane.
- Reflected arrows can eliminate remote archers for mastery.
- A shield pickup provides the simpler completion strategy.
- Relay Seal 2 is on the visible exit route.

### Zone 5: Chain Bridge Pursuit, x 9,000 to 11,300

- Rival Courier appears for the first chase encounter.
- A stable main bridge and an optional spectral upper line create route choice.
- Tilt bridges use the shared fall-through logic and lead to recoverable lower
  routes rather than full-map skips.
- Cache 3 and a high coin arc reward beating the rival to the branch.

### Zone 6: Echo Tunnels, x 11,300 to 13,800

- Wraithlight powers the longest optional spectral route.
- Main route combines crouch timing, Moon Stalker pressure, and short archer
  lanes.
- Cache 4 is above the main path; Cache 5 is in a low Wraithlight crawl pocket.
- A Shadow Surge pickup prepares the final combat without making it mandatory.

### Zone 7: Relay Sanctum, x 13,800 to 16,200

- Relay Seal 3 follows a Crypt Warden encounter.
- Final checkpoint restores health before the duel.
- Rival Courier finale uses a wide readable arena with one supporting archer
  and cover that prevents unavoidable crossfire.
- The relay door opens only with three seals and the final rival defeated.
- Final optional coins sit above the arena exit so mastery requires one last
  route decision instead of automatic collection.

## Geometry Targets

- Main floor baseline: y 616.
- Standard safe pickup lane: y 532 to 568.
- Crouch pickup lane: y 596 to 604, based on the verified crouched body range.
- High route tiers: y 470, 360, and 250.
- Mandatory unsupported gaps: target 120 to 260 pixels.
- Wider gaps: always include a visible intermediate landing, tilt bridge, or
  safe recovery route.
- Crouch blockers: collision geometry must require the reduced hitbox, while
  visible tops remain difficult but intentionally reachable only where a small
  step or mastery route is supplied.
- No platform collider may sit materially below its visible top.

## Asset Deliverables

All final project assets require source preservation, runtime optimization,
manifest wiring, dimension checks, alpha checks where relevant, and visual QA.

1. `courier-catacombs-background-source.png`
   - Wide 16:9 underground courier-vault environment.
   - Warm amber and spectral cyan navigation lights against cool stone.
   - Quiet lower gameplay band with no baked collision platforms.
   - Runtime export: 1920 by 1080 WebP.

2. `courier-catacombs-terrain-props-v1-source.png`
   - Isolated wide floor, rubble floor, medium ledge, spectral bridge, narrow
     recovery slab, crouch overhang, relay gate, seal altar, cache pedestal,
     and chain anchor.
   - Flat chroma-key source and alpha runtime atlas.
   - Collision tops must read clearly against the background.

3. `tomb-lurker-v1-6f-source.png`
   - Six equal frames, bottom-centered, isolated on chroma key.
   - Runtime strip: 768 by 128 transparent PNG.

4. `crypt-warden-v1-6f-source.png`
   - Six equal frames, bottom-centered, isolated on chroma key.
   - Runtime strip: 768 by 128 transparent PNG.

5. `rival-courier-v1-6f-source.png`
   - Six equal frames, bottom-centered, isolated on chroma key.
   - Runtime strip: 768 by 128 transparent PNG.

6. `wraithlight-lantern-4f-source.png`
   - Four equal collectible frames.
   - Runtime strip: 256 by 64 transparent PNG.

7. `mirror-ward-4f-source.png`
   - Four equal collectible frames with a strong mirrored shield silhouette.
   - Runtime strip: 256 by 64 transparent PNG.

8. `relay-seal-4f-source.png`
   - Four equal objective-item frames.
   - Runtime strip: 256 by 64 transparent PNG.

9. `courier-cache-4f-source.png`
   - Four equal spectral cache frames.
   - Runtime strip: 256 by 64 transparent PNG.

10. Level-select thumbnails
   - 320 by 180 and 160 by 90 WebP crops derived from the accepted background.

11. Documentation
    - Final prompt set, asset paths, frame labels, and runtime use recorded in
      the Shadow Runner asset docs.

## Visual Direction

- Keep the premium medieval-fantasy pixel-art language.
- New palette: charcoal stone, weathered bronze, parchment gold, burgundy route
  marks, and spectral cyan-green.
- Collision surfaces use warm edge highlights so they do not disappear into
  the background.
- Spectral elements use cyan-green only as an accent, not as the whole screen
  palette.
- Enemy silhouettes must remain distinct at the 740 by 390 phone profile.
- Do not use generic dark slabs, flat placeholder rectangles, or nearly black
  platform art.

## Technical Touch Points

- `src/features/games/shadow-runner/game/levels.ts`
- `src/features/games/shadow-runner/game/levelEight.ts`
- `src/features/games/shadow-runner/game/runtimeCatalog.ts`
- `src/features/games/shadow-runner/game/simulation.ts`
- `src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`
- `src/features/games/shadow-runner/assets/manifest.ts`
- `src/features/games/shadow-runner/ShadowRunnerGame.tsx`
- `src/features/games/shadow-runner/ShadowRunnerScreen.tsx`
- `scripts/shadow-runner-phone-smoke.mjs`
- `tests/shadowRunnerLevelConfigs.test.ts`
- `tests/shadowRunnerSimulation.test.ts`
- `tests/shadowRunnerRuntimeAssets.node.test.mjs`
- `tests/shadowRunnerSmokeScript.test.ts`
- `supabase/migrations/<generated>_shadow_runner_level8_available.sql`
- Shadow Runner asset and story documentation

## Implementation Shape

- `levelEight.ts` owns the large Level 8 route configuration so `levels.ts`
  remains a readable registry and shared contract.
- `runtimeCatalog.ts` maps terrain sets, enemy archetypes, objectives, and
  power-ups to runtime art and behavior metadata. Level 8 does not add another
  chain of level-ID-specific preload checks.
- Existing Moon Shards and legacy power-ups keep their current behavior through
  compatibility adapters while the finish gate consumes generic required
  objectives.
- Encounter bounds wake only nearby enemies and provide reusable sealed-room
  behavior.
- Explicit `fullClear` and `perfectRoute` results sit alongside raw score so
  strength boosts cannot make completion quality mathematically ambiguous.

## Test Strategy

### Configuration And Simulation

- Level 8 is registered as playable and is longer than Level 7.
- Three Relay Seals and five Courier Caches exist.
- Required rival ID resolves to a real enemy.
- Tomb Lurker warning, lunge, recovery, and defeat rules are deterministic.
- Main-route gaps and recovery platforms stay within declared constraints.
- Branch checkpoints activate only inside their configured vertical bounds.
- Sleeping encounters remain inert before activation.
- Crouch-lane pickups use measured body bounds.
- Wraithlight activation, expiration, health restore, and cache collection are
  deterministic.
- Mirror Ward consumes charges, reflects projectiles, and cannot double-hit the
  player.
- Crypt Warden guard and Rival Courier damage/defeat rules are deterministic.
- Finish requirements block and unblock correctly.
- Mastery requires all coins, caches, and enemies.
- Perfect Route additionally requires all lives and no checkpoint respawn.

### Runtime Assets

- Every Level 8 manifest asset exists.
- Background and thumbnails have exact dimensions.
- Enemy and collectible strips have exact frame-strip dimensions.
- Alpha assets have transparent corners and meaningful non-transparent content.
- Runtime files stay within reasonable size limits.

### Phone Smoke

Run both the 740 by 390 iPhone-like profile and 932 by 430 Android profile.

- Level 8 detail and intro copy render.
- Canvas, HUD, controls, and status pills fit the viewport.
- All checkpoints activate.
- Main route segments are traversable.
- Mandatory crouch segment requires and accepts crouch.
- Wraithlight activates spectral platforms and exposes a cache.
- Mirror Ward reflects a projectile and consumes a charge.
- Relay Seals reach 3 of 3.
- Final rival requirement blocks the gate until defeated.
- Finish completes after all mandatory requirements.
- Projectile and hazard pools remain bounded.
- Screenshots are nonblank and visually reviewed.

### Full Gates

- Targeted Shadow Runner Jest suites.
- `npm run lint`
- `npx tsc --noEmit -p tsconfig.app.json`
- `npm run build`
- Level 8 phone smoke with `--no-reuse-server`.
- Existing Level 7 phone smoke regression.
- Supabase migration contract test and linked dry run before any approved push.

## Performance Budget

- Reuse pooled projectiles and existing Phaser groups.
- Cap projectile growth at the existing pool maximum.
- Avoid per-frame object allocation in enemy and power-up updates.
- Keep distant encounter enemies asleep so the longest route does not update
  every actor on every frame.
- Keep Level 8 runtime art compressed and route-loaded only for Level 8.
- Maintain responsive play in both phone smoke profiles with no blank canvas,
  runaway pool, or repeated console error.

## Launch And Medal Behavior

The Level 8 migration adds Courier Catacombs to
`shadow_runner_level_catalog` as available and medal eligible. The existing
catalog trigger then recalculates medals for all users, revoking the Level 7
knight medal from users who have not completed Level 8 and awarding it to users
who complete the new hardest route.

Remote migration application, push, and deploy require explicit launch
approval. Local implementation includes the migration and dry-run proof so the
release is ready.

## Production Stopping Criteria

The goal is complete only when:

- Level 8 is selectable after Level 7 and can be completed normally.
- All mandatory items, gaps, crouch lanes, and combat encounters are reachable.
- Mastery is possible but demonstrably harder than a normal clear.
- New art is used in runtime and visually matches the game.
- New systems are config driven and reusable.
- Targeted and baseline checks pass.
- Level 8 and Level 7 mobile smokes pass in both phone profiles.
- No task-owned preview servers, browser processes, or disposable artifacts are
  left running.
- The worktree is clean except for the intentional Level 8 change set.
- Launch notes state exactly what was verified and what still requires a
  physical-device playtest or final approval.

## Rollback

Level 8 is isolated behind `playableLevelId: 'level-8'` and its catalog
migration. Before launch, rollback is removal of the local Level 8 registration
and assets. After launch, a forward migration can mark Level 8 unavailable,
which causes the existing catalog trigger to recalculate medals against the
previous hardest available route.
