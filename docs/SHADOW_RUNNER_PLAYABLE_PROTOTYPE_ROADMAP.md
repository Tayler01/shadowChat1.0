# Shadow Runner Playable Prototype Roadmap

## Goal

Ship the next Shadow Runner checkpoint as a real phone-first playable
prototype, not a menu-only preview. The phase should prove the core loop:
run, jump, double jump, crouch, attack, collect, survive hazards, defeat one
enemy, and reach a finish gate.

## Product Rules

- Keep the Game Boy Color inspired medieval fantasy tone.
- Use generated assets for new game-facing UI, enemies, and feedback art.
- Preserve movement rules unless playtests reveal a real usability issue.
- Do not tune difficulty because automated tests are poor at platformers.
- Campaign levels must progress in complexity and difficulty. Each new map
  should either introduce a mechanic, combine prior mechanics in a harder way,
  increase speed/timing pressure, or add a new enemy/hazard pattern.
- Campaign-map location buttons should open a level-detail panel first. The
  panel owns Start, Replay, locked, and in-build states so map taps do not
  accidentally launch a route.
- Keep gameplay rules in `simulation.ts` and keep Phaser mostly as renderer,
  camera, physics, animation, and effects.
- Keep mobile controls readable and low-chrome. The playfield should remain
  the main thing on screen.

## Phase 2 - Asset And UI Foundation

1. Gameplay HUD assets
   - Top HUD plaque for health, coins, score, and objective.
   - Tiny health bar frame for hero/enemy overhead health.
   - Coin/score icon treatment that matches the title/menu assets.
   - Level-complete scroll or banner for finish feedback.

2. First enemy asset
   - Clockwork Sentry is the first playable enemy.
   - Required states: idle, patrol/move, attack/thrust, hit, defeated.
   - Use bottom-center anchor and consistent scale.
   - If the generated sheet is not clean enough for animation, ship the best
     static generated sentry first and keep the pose strip as follow-up.

3. Gameplay feedback assets
   - Hit spark.
   - Coin sparkle.
   - Dust puff or landing feedback.
   - Sword slash can remain code-drawn until a clean strip is generated.

## Phase 3 - Playable Level 1 Loop

1. Core route
   - Keep one short left-to-right route.
   - Include one safe starting platform, one spike pit, one double-jump gap,
     one tilt platform, one sentry patrol zone, coins, and a finish gate.
   - Maintain classic challenge: readable and somewhat challenging, not
     punishing.

2. Controls
   - Keep full mobile controls: left, right, crouch, jump, attack.
   - Ensure hold-to-copy remains disabled on every gameplay control.
   - Keep Pause as the only persistent upper-right game menu control.

3. Combat
   - Sentry can be avoided, stomped, or defeated by sword.
   - Sword defeat and stomp defeat both award score.
   - Enemy contact damages the hero with brief invulnerability and knockback.
   - Health reaching zero respawns at the start for this checkpoint.

4. Feedback and state
   - HUD updates for health, coins, score, and objective.
   - Overhead health bars are readable over hero and sentry.
   - Coin pickup sparkles and score increments.
   - Enemy hit/defeat effects are visible.
   - Finish gate shows a level-complete overlay with Return to Map and Next
     Route when a playable next level exists.

## Campaign Difficulty Direction

- Level 1: readable training challenge with one tilt bridge, one sentry, one
  spike pit, and basic double-jump timing.
- Level 2: longer route with more vertical movement, two tilt bridges, more
  coins, and tighter market-roof gaps.
- Each map stop carries a route type, difficulty tier, difficulty label, and
  mechanic preview so future route design can stay ordered from simple to
  complex.
- Later maps should add complexity step-by-step: faster moving/tilting
  platforms, pits or spikes around tilt bridges, more enemy variety,
  chase/timing pressure, hidden collectibles, and mixed mechanics.
- Tilt bridges should eventually tilt far enough to dump the player off if
  they wait too long or land poorly. That should be tuned as a gameplay pass,
  not as an automated-test difficulty adjustment.

## Verification Gates

- `npm run lint`
- `npx tsc --noEmit -p tsconfig.app.json`
- `npm run build`
- Chrome mobile landscape smoke at `740x390` and `932x430`
- Automated route sanity:
  - unlock code gate
  - open/start game
  - verify canvas is nonblank
  - verify HUD values render
  - verify pause/resume still works
  - simulate movement/jump/attack inputs
  - capture screenshots of title, gameplay, pause, and finish or route state

## Done For This Goal

- Roadmap is documented.
- Gameplay assets are documented in
  [`docs/SHADOW_RUNNER_GAMEPLAY_ASSETS.md`](C:/repos/chat2.0/docs/SHADOW_RUNNER_GAMEPLAY_ASSETS.md:1).
- Required new assets are generated, optimized, and referenced in the manifest.
- Level 1 has one playable loop around controls, pickups, hazards, sentry, and
  finish feedback.
- The checkpoint is verified, documented in the progress log, committed, and
  pushed to `main`.
