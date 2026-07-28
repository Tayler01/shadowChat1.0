# Shadow Runner Level 9: Captain Gate

Status: production-ready release candidate

Last updated: July 28, 2026

## Product Goal

Captain Gate must be the longest, most dynamic, and most replayable Shadow
Runner route so far. It should be harder than Courier Catacombs through
decision pressure and mechanic combinations, not through blind jumps,
unavoidable damage, hidden progression rules, or unreachable score items.

The normal route must be consistently beatable after learning its patterns.
The Full Clear and Perfect Route states should remain difficult enough to
reward route mastery, deliberate power-up timing, and complete enemy control.

## Player Fantasy And Story

The Rival Courier's trail ends at the storm-battered fortress above the old
relay road. The Moonlit Captain sealed the route after discovering that the
Relay carried a false command. The Last Runner must cross the exposed
battlements, break the Captain's watch, and force the truth into the open.

- Campaign title: `Captain Gate`
- Subtitle: `The Stormwatch Siege`
- Main objective: recover four Watchfire Crests and defeat the Moonlit Captain.
- Intro line: `The Captain sealed the road against the false command. Break the watch before dawn.`
- Completion line: `Captain Gate cleared. The last relay burns above.`
- Story handoff: Dawn Relay Spire becomes the final destination.

## Scope

- World width: 20,400 pixels, about 26 percent longer than Level 8.
- Target first-clear time: 12 to 16 minutes.
- Target learned clear time: 9 to 12 minutes.
- Nine bounded checkpoints on stable main-route platforms.
- Four mandatory Watchfire Crests.
- Six optional Captain's Orders.
- About 90 coins across main, crouch, lift, wind, and high mastery routes.
- About 28 enemies, with no more than three active in ordinary encounters.
- Three new enemies: Gate Pikeman, Storm Grenadier, and Moonlit Captain.
- Two new power-ups: Gale Mantle and Sunsteel Edge.
- Reusable storm-wind zones, counterweight lifts, arcing storm bombs, and
  phased boss behavior.
- Existing crouch, shield, Mirror Ward, Chrono, Shadow Surge, Wraithlight,
  archer volley, fall damage, tilt bridge, checkpoint, and sealed-encounter
  systems return in intentional combinations.

## Non-Goals

- No new mobile input button or gesture.
- No mandatory invisible platforms.
- No randomly generated route geometry or attack patterns.
- No normal completion requirement for optional coins, Captain's Orders, or
  non-boss enemies.
- No mandatory timed-power-up route.
- No bottom-of-world bypass around encounters or objectives.
- No remote migration before the app, assets, tests, and phone smoke are ready
  to release together.

## Difficulty And Fairness Contract

- Mandatory unsupported gaps remain at or below the verified double-jump
  envelope. Wider gaps receive a visible lift, bridge, landing, or bounded
  recovery route.
- Every checkpoint sits on a stable platform at least 420 pixels wide and
  occurs about every 1,900 to 2,300 pixels.
- Every crouch lane blocks the standing body, passes the crouched body, and
  places low coins between `y=592` and `y=604`.
- Wind zones always show direction and timing before force is applied.
  Crouching reduces gust force enough to hold position, and solid windbreaks
  divide long zones into safe pockets.
- Gale Mantle is useful for optional routes but is never required for the main
  route.
- Storm bombs show their landing marker before impact and cannot chain damage
  through the existing invulnerability window.
- A maximum of three enemies may pressure the player at once outside the final
  arena. Captain damage phases use no more than two supporting threats.
- Major gauntlets start after a checkpoint and place a strategy resource
  before the highest pressure begins.
- Recovery floors are short, section-bounded basins with visible return steps.
  They cannot connect into a route-wide lower bypass.
- Watchfire Crests, defeated enemies, cleared sealed encounters, and the boss
  state persist across checkpoint deaths.
- The finish reports exact missing requirements with level-authored text.

## New Reusable Systems

### Storm Wind Zones

Wind zones are configured rectangles with direction, force, cadence, and
active duration.

- A visible pre-gust tell precedes each force window.
- Standing and airborne players are pushed.
- Crouching reduces force by at least 75 percent.
- Gale Mantle cancels forced movement while active.
- Wind cannot push the player through solid terrain or directly past a
  checkpoint trigger.
- Debug state exposes the active zone, direction, and next cadence phase.

### Counterweight Lifts

Counterweight lifts are reusable moving platforms configured with a vertical
range, speed, and pause time.

- The player is carried smoothly while standing on the platform.
- Lifts pause at both endpoints long enough for a deliberate jump.
- A missed lift always returns or drops to a bounded recovery route.
- Enemies are not placed on moving lifts.
- Debug state exposes current position, direction, and endpoint state.

### Arcing Storm Bombs

Storm Grenadiers use a bounded projectile pool with deterministic ballistic
throws.

- The target point is captured at release time.
- A visible marker appears before impact.
- Impact creates a short electrical hazard and then returns every object to its
  pool.
- Mirror Ward reflects the airborne bomb.
- Sunsteel Edge can destroy an airborne bomb with an active sword strike.
- Pool totals are capped and verified during repeated encounters.

### Moonlit Captain Phases

The final enemy uses a reusable phased-enemy contract rather than a
level-specific timer pile.

- Phase 1 teaches shield brace, sword sweep, and punishable recovery.
- Phase 2 adds a telegraphed charge and deterministic overhead pressure.
- Phase 3 removes supporting pressure and uses a faster double charge with a
  clear tell and long recovery.
- Guard, health, phase, and stagger windows are visible in debug state.
- Boss health and defeat persist after a checkpoint death.

## New Power-Ups

### Gale Mantle

- Duration: 10 seconds.
- Health restore: 2.
- Movement speed multiplier: 1.08.
- Cancels authored wind force.
- Caps a qualifying high-fall hit at one damage while active.
- Does not provide a mandatory extra jump.

### Sunsteel Edge

- Duration: 9 seconds.
- Charges: 6 empowered attacks.
- Health restore: 2.
- Adds one attack damage.
- Deals two guard damage and extends sword reach for each charged swing.
- Destroys one overlapping airborne storm bomb.
- Charges and duration are both visible in the HUD and debug state.

## New Enemies

### Gate Pikeman

- Health target: 5 to 7.
- Guard target: 3.
- Role: shield-wall spacing and long-lane pressure.
- Tell: visible brace before the long pike thrust.
- Counterplay: crouch under the high thrust, stomp, rear attack, reflected
  projectile, or Sunsteel guard break.

### Storm Grenadier

- Health target: 3 to 4.
- Role: displacement and anti-camping pressure.
- Tell: low wind-up plus visible target marker.
- Counterplay: move after the throw, close distance, reflect with Mirror Ward,
  or cut the bomb with Sunsteel Edge.

### Moonlit Captain

- Health target: 15.
- Guard target: 4.
- Role: final three-phase duel.
- The arena contains stable ground, two cover plinths, no lethal pit, and a
  checkpoint immediately before the seal.
- The player can win without a power-up, while Gale Mantle and Sunsteel Edge
  reward preparation.

## Route Outline

| Section | Range | Main experience |
| --- | ---: | --- |
| Outer Curtain | 0-2,200 | Familiar patrols, crouch brace tutorial, first safe Gale Mantle, checkpoint |
| Signal Stair | 2,200-4,400 | Gate Pikeman tutorial, first lift loop, Watchfire Crest 1 |
| Murder Hall | 4,400-6,700 | Multi-height arrows, crouch cover, Sunsteel tutorial |
| Banner Ramparts | 6,700-9,100 | Two lifts, wind pockets, tilt bridge, optional high Order |
| Lower Barracks | 9,100-11,300 | Pikeman and Grenadier composition, sealed encounter, Crest 2 |
| Moonwell Rise | 11,300-13,600 | Tall climb, fall choices, recovery basin, two Orders |
| Captain's Span | 13,600-15,900 | Long gust-and-volley sequence with readable windbreak pockets |
| Inner Watch | 15,900-18,100 | Hardest mixed encounters, Crest 3 and Crest 4, final Order branches |
| Captain Gate | 18,100-20,400 | Preparation chamber, Moonlit Captain phases, final portcullis |

## Scoring And Completion

Normal completion requires:

- Four Watchfire Crests.
- Moonlit Captain defeated.
- Finish gate reached.

Full Clear additionally requires:

- Every coin.
- Every Captain's Order.
- Every configured enemy.

Perfect Route additionally requires:

- All three lives remaining.
- Zero checkpoint respawns.

Health damage remains allowed so Perfect Route measures route control rather
than duplicating the numerical hitless-score challenge.

## Asset Set

- Captain Gate 16:9 gameplay background.
- Captain Gate terrain and props atlas with floors, ledges, counterweight
  bridge, recovery step, low overhang, lift, barricade, portcullis, beacon,
  command chest, and windbreak anchor.
- Gate Pikeman six-frame strip.
- Storm Grenadier six-frame strip.
- Moonlit Captain eight-frame strip.
- Gale Mantle four-frame strip.
- Sunsteel Edge four-frame strip.
- Watchfire Crest four-frame strip.
- Captain's Orders four-frame strip.
- Storm Bomb four-frame strip.
- Campaign-map location marker and two route thumbnails.

## Release Verification

- Full repository lint, TypeScript, production build, and build-budget checks pass.
- All 248 Jest suites pass: 1,406 tests passed and 16 remain explicitly todo.
- Runtime asset validation passes for manifest parity, authored dimensions,
  transparent animation strips, and terrain crop bounds.
- Level 9 passes the complete iPhone/WebKit gameplay and visual smoke.
- Level 9 passes headed Android/Chromium bridge, crouch, power-up, encounter,
  boss-phase, fall-recovery, and completion smoke.
- Level 8 passes the complete iPhone/WebKit and Android/Chromium regression
  smoke after the shared-engine changes.
- The linked Supabase migration adds Captain Gate as medal rank 9 and invokes
  the existing medal refresh so stale Level 8 knight medals are revoked.

All generated source masters live under
`source-assets/shadow-runner/level-assets/level-9`. Runtime assets are produced
deterministically by `scripts/process-shadow-runner-level9-assets.mjs`.

## Verification Plan

- Config tests for registration, counts, unique IDs, world bounds, checkpoint
  order, mandatory gap support, crouch clearance, objective reachability,
  enemy platform support, bounded recovery routes, and finish requirements.
- Simulation tests for both power-ups, objective persistence, boss requirement,
  normal clear, Full Clear, Perfect Route, and post-death sticky state.
- Runtime asset tests for existence, dimensions, MIME, atlas crop bounds,
  alpha-bearing animation frames, and nonempty frames.
- Phone smoke on landscape WebKit and Android Chromium.
- Physics segment traversal for every main-route section, every crouch lane,
  every lift exit, every major mandatory gap, and every recovery path.
- Ordinary completion without optional items and a separate Full Clear state
  proof.
- Partial and complete sealed-encounter tests, including death before clear,
  death after clear, and fresh-run reset.
- Two-minute busiest-encounter stress with bounded projectile and hazard pools,
  no console errors, and no monotonic pool growth.
- Final Level 8 regression smoke before release.
- Lint, app typecheck, full Jest, production build, Supabase linked dry run,
  direct `main` push, Netlify deployment watch, and independent production
  health verification.

## Release Contract

The Level 9 catalog migration advances the current hardest available route to
Captain Gate and runs `private.refresh_shadow_runner_medals()`. This
intentionally revokes the Level 8 Knight medal until a player completes Level
9. The migration must ship only in the same production deployment as the
playable route and complete runtime asset set.
