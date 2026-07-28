# Shadow Runner Level 10: Dawn Relay Spire

Status: implementation in progress

Last updated: July 28, 2026

## Product Goal

Dawn Relay Spire is the conclusion of the first Shadow Runner campaign. It
must be longer, more varied, more cinematic, and more memorable than Captain
Gate without becoming a blind endurance test.

The level should feel like a final examination of the full movement and combat
language. Every returning mechanic must appear in a readable combination, and
every new mechanic must be taught safely before it is used under pressure.

Normal completion must be difficult but consistently achievable after learning
the route. Full Clear and Perfect Route should remain aspirational mastery
goals with hard-to-reach coins, optional dispatches, and complete enemy control.

## Player Fantasy And Story

The Moonlit Captain reveals that the Relay was not sealed to stop a courier.
The ancient Sentry Sovereign forged the final command and locked the city into
an endless night so its machine watch could never be relieved.

The Last Runner must climb the Dawn Relay Spire, restore five severed Relay
Flames, destroy the Sovereign's master lock, and deliver the true command before
the last light leaves the horizon.

- Campaign title: `Dawn Relay Spire`
- Subtitle: `The Last Light`
- Main objective: restore five Relay Flames and defeat the Sentry Sovereign.
- Intro line: `The false command began here. Carry the true word to the last light.`
- Completion line: `The Relay burns again. Dawn reaches every road.`
- Final boss: `The Sentry Sovereign`
- Final campaign line: `The Last Runner delivered the dawn.`

## Scope

- World width: 26,400 pixels, about 29 percent longer than Level 9.
- Target first-clear time: 18 to 24 minutes.
- Target learned clear time: 13 to 18 minutes.
- Ten named acts with ten stable checkpoints.
- Five mandatory Relay Flames.
- Eight optional Last Dispatches.
- About 110 coins across main, crouch, aerial, power, and boss-preparation routes.
- About 36 configured enemies with no more than three active in ordinary fights.
- Three new ordinary enemies: Relay Lancer, Prism Caster, and Gearwing Drone.
- One final boss: the Sentry Sovereign.
- Two new power-ups: Dawnfire Aegis and Aether Step.
- Reusable phase platforms and relay beam zones.
- A four-phase final boss with deterministic attack patterns and punish windows.
- A configurable final-campaign cinematic shown before the score summary.
- Existing crouch, shield, Mirror Ward, Wraithlight, Chrono, Shadow Surge, Gale
  Mantle, Sunsteel Edge, wind, lifts, archer volleys, tilt bridges, fall damage,
  sealed encounters, and sticky checkpoint systems return selectively.

## Non-Goals

- No new mobile button or multi-finger gesture.
- No mandatory invisible platforms.
- No random boss sequence that can create unavoidable attack combinations.
- No whole-level countdown that invalidates a careful first clear.
- No normal-completion requirement for coins, Last Dispatches, or ordinary enemies.
- No power-up required for the main route or boss victory.
- No bottom-of-world bypass connecting multiple acts.
- No boss arena pit.
- No release migration before the route, assets, tests, and phone smoke are ready.

## Difficulty And Fairness Contract

- Mandatory unsupported gaps stay inside the verified double-jump envelope.
- Wider gaps have a visible phase platform, lift, tilt bridge, or bounded recovery route.
- Every checkpoint sits on a stable platform at least 440 pixels wide.
- Main-route checkpoints are spaced about every 2,300 to 2,800 pixels.
- Crouch lanes block the standing body and pass the crouched body with visible low coins.
- Relay beams show their lane and charge state before becoming dangerous.
- Phase platforms use a visible warning state before losing collision.
- Aether Step opens mastery routes but is not required for any mandatory gap.
- Dawnfire Aegis improves survival and damage but is not required to hurt the boss.
- Ordinary encounters activate no more than three enemies at once.
- Boss phases never combine more than two simultaneous pressure sources.
- Boss attacks have a tell, an active window, and a meaningful recovery window.
- Recovery floors are section-bounded and contain a visible return path.
- Relay Flames, defeated enemies, cleared encounters, and boss progress remain sticky
  across checkpoint deaths.
- The finish reports exact missing objectives or required enemies.
- The grand ending can be advanced immediately and collapses to a shorter sequence
  under the shared reduced-motion comfort policy.

## New Reusable Systems

### Relay Beam Zones

Relay beam zones are configured rectangles with one or more horizontal lanes,
a cadence, a warning duration, an active duration, and damage.

- Warning rails illuminate before collision is enabled.
- Lane patterns are authored and deterministic.
- Low beams are jumped, high beams are crouched, and stacked beams require cover.
- Shield, Mirror Ward, and Dawnfire Aegis mitigate the configured damage.
- Beam zones do not overlap mandatory blind landings.
- Debug state exposes phase, active lanes, and time to transition.

### Phase Platforms

Phase platforms cycle through solid, warning, and intangible states.

- Each platform stays solid long enough for a deliberate crossing.
- The warning state lasts at least 650 ms.
- Intangible time is bounded and the platform always returns.
- Main-route use includes a stable staging platform on both sides.
- Misses fall into a section-bounded recovery path or a checkpoint-safe fall.
- Aether Step gives experts more route options but never hides the intended path.
- Debug state exposes collision state, phase, and next transition.

### Dawnfire Aegis

- Duration: 12 seconds.
- Health restore: 3.
- Attack damage bonus: 1.
- Damage received multiplier: 0.6.
- Guard damage: 2.
- Destroys one overlapping hostile relay orb on an active sword strike.
- Shows duration and resistance in the HUD and debug state.

### Aether Step

- Duration: 12 seconds.
- Health restore: 2.
- Speed multiplier: 1.08.
- Grants one additional air jump per airborne sequence.
- Cancels qualifying fall damage while active.
- Does not bypass sealed encounters or objective gates.
- Shows duration and the available bonus jump in the HUD and debug state.

## New Enemies

### Relay Lancer

- Health target: 6 to 8.
- Guard target: 3.
- Role: measured lane control and anti-rush pressure.
- Alternates a high lance sweep with a grounded charge.
- High sweep is countered by crouching.
- Charge is countered by jumping, shielding, a rear attack, or guard break.

### Prism Caster

- Health target: 4 to 5.
- Role: readable ranged lane pressure.
- Charges a relay orb before firing toward the captured player position.
- The orb can be blocked, reflected, or destroyed by an empowered sword.
- The caster pauses after each cast and is vulnerable at close range.

### Gearwing Drone

- Health target: 3 to 4.
- Role: aerial timing and anti-camping pressure.
- Hovers on an authored patrol band and uses a telegraphed diagonal dive.
- The drone returns to its patrol band after a missed dive.
- It can be stomped, struck during recovery, or hit by a reflected projectile.

### Sentry Sovereign

- Health target: 24.
- Guard target: 6.
- Role: final four-phase campaign boss.
- The arena is wide stable ground with two cover pylons and no lethal pit.
- The checkpoint and preparation resources sit immediately before the seal.
- The boss can be defeated without an active power-up.

Phase 1, `Iron Decree`:

- Teaches a high halberd sweep, shield brace, and long punish window.
- High sweep is crouchable.
- Guard can be broken through patient attacks, stomps, reflection, or Dawnfire.

Phase 2, `Lockstorm`:

- Adds relay-orb volleys and one clearly marked beam lane.
- No charge attack overlaps the beam's active damage window.
- Reflected or destroyed orbs stagger the boss.

Phase 3, `Crownfall`:

- Adds one telegraphed arena charge and a ground shockwave.
- Jumping clears the shockwave; cover or spacing clears the charge.
- The phase has no supporting ordinary enemies.

Phase 4, `Last Light`:

- Removes guard and alternates two deterministic attack pairs.
- The second attack is faster, followed by the boss's longest recovery window.
- No new attack is introduced in the final health quarter.

## Route Outline

| Act | Range | Main experience |
| --- | ---: | --- |
| Last Road | 0-2,500 | Confident opening, first Relay Lancer, Dawnfire tutorial, checkpoint |
| Orrery Base | 2,500-5,100 | First phase platforms, lift timing, Relay Flame 1 |
| Arrow Choir | 5,100-7,700 | Multi-height archer fire, crouch shelters, Mirror Ward route |
| Gearwind Ascent | 7,700-10,300 | Wind pockets, tall lifts, Aether Step tutorial |
| Cinder Galleries | 10,300-12,900 | Prism Caster tutorial, sealed mixed encounter, Relay Flame 2 |
| Moon-Glass Crossing | 12,900-15,500 | Phase-platform chain, spectral recovery, two Dispatches |
| Courier's Last Road | 15,500-18,100 | Fast mixed route, tilt bridges, Relay Flame 3 |
| Relay Crown | 18,100-20,700 | Gearwing Drone pressure, beam lanes, Relay Flame 4 |
| Master Lock | 20,700-23,200 | Hardest ordinary gauntlet, Relay Flame 5, final preparation |
| Dawn Chamber | 23,200-26,400 | Four-phase Sentry Sovereign, ignition pedestal, grand ending |

## Scoring And Completion

Normal completion requires:

- Five Relay Flames.
- Sentry Sovereign defeated.
- Dawn Relay ignition pedestal reached.

Full Clear additionally requires:

- Every coin.
- Every Last Dispatch.
- Every configured enemy.

Perfect Route additionally requires:

- All three lives remaining.
- Zero checkpoint respawns.

Health damage remains allowed so Perfect Route measures route control instead
of duplicating the numerical hitless-score challenge.

## Grand Ending

The Level 10 completion overlay is a configurable finale sequence rather than
the standard score banner appearing immediately.

Beat 1, `Master Lock Broken`:

- The arena darkens and the Sovereign's lock fractures.
- The ending banner begins in moonlit blue.

Beat 2, `Relay Restored`:

- Gold light climbs the spire and the generated ending art transitions to dawn.
- Copy: `The false command is ash.`

Beat 3, `Every Road Answers`:

- The five Relay Flames illuminate in sequence.
- Copy: `For the first time in a generation, every road can answer.`

Beat 4, `Campaign Complete`:

- Final line: `The Last Runner delivered the dawn.`
- The normal score, Full Clear, or Perfect Route summary then appears.
- The player can advance the sequence early.
- Reduced motion uses short crossfades and shows the final beat without repeated motion.

## Custom Asset Set

- Dawn Relay Spire 16:9 gameplay background.
- Spire terrain and machinery atlas:
  - wide relay floor
  - cracked relay floor
  - moon-glass ledge
  - phase bridge
  - recovery step
  - low conduit overhang
  - counterweight lift
  - cover pylon
  - master-lock gate
  - relay brazier
  - ignition pedestal
  - beam emitter
- Relay Lancer six-frame strip.
- Prism Caster six-frame strip.
- Gearwing Drone six-frame strip.
- Sentry Sovereign ten-frame strip.
- Dawnfire Aegis four-frame strip.
- Aether Step four-frame strip.
- Relay Flame four-frame strip.
- Last Dispatch four-frame strip.
- Relay Orb four-frame strip.
- Dawn restored cinematic banner.
- Campaign-map location marker.
- 160x90 and 320x180 route thumbnails.

## Implementation Boundaries

- New route configuration lives in `game/levelTen.ts`.
- Shared types and registration remain in `game/levels.ts`.
- Reusable systems live in `createShadowRunnerPhaserGame.ts` and `simulation.ts`.
- Art lookup and crop contracts live in `assets/manifest.ts` and `runtimeCatalog.ts`.
- Finale presentation lives in `ShadowRunnerGame.tsx` and is driven by level config.
- Progression keeps the existing local and Supabase completion paths.
- A new additive Supabase migration advances the medal candidate to rank 10.
- Generated source masters live under
  `source-assets/shadow-runner/level-assets/level-10`.
- Runtime assets are produced deterministically by
  `scripts/process-shadow-runner-level10-assets.mjs`.

## Verification Plan

- Config tests:
  - registration and campaign unlock
  - exact route counts and unique IDs
  - world bounds and checkpoint order
  - mandatory gap support
  - crouch clearance
  - objective and collectible reachability
  - enemy platform support
  - phase-platform staging and recovery
  - beam-zone safe response windows
  - finish requirements
- Simulation tests:
  - Dawnfire duration, resistance, damage, and health restore
  - Aether Step duration, extra jump, fall protection, and reset
  - sticky Relay Flames, encounters, and boss progress
  - normal clear, Full Clear, and Perfect Route
  - failure at the finish with exact requirement text
- Runtime asset tests:
  - files, MIME, dimensions, and alpha
  - terrain crop bounds
  - nonempty animation frames
  - cinematic and campaign images
- Phone smoke:
  - complete landscape WebKit and Android Chromium runs
  - every checkpoint and mandatory gap
  - crouch lanes, lifts, phase platforms, beam lanes, and recovery routes
  - all new pickups and enemy types
  - all four boss phases
  - grand ending sequence and final score summary
- Stress:
  - repeated beam and projectile cycles
  - busiest ordinary encounter
  - final boss projectile and warning pools
  - no console errors or monotonic object growth
- Regression:
  - complete Level 9 iPhone/WebKit and Android/Chromium smoke
  - targeted Level 8 sticky-gate regression
- Repository gates:
  - lint
  - app typecheck
  - full Jest
  - runtime asset validation
  - production build and budgets
  - linked Supabase dry run
  - clean direct main push
  - GitHub/Netlify production deployment
  - exact production health verification
  - verified Shado General Chat launch post

## Release Contract

The Level 10 catalog migration advances the hardest available route to Dawn
Relay Spire and runs `private.refresh_shadow_runner_medals()`. This
intentionally revokes the Level 9 Knight medal until a player completes Level
10.

The migration, route code, complete asset pack, progression wiring, grand
ending, and phone smoke must ship as one release. No partial production launch
is acceptable.
