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
   - Use a split-thumb phone layout: movement/crouch on the lower-left D-pad,
     jump/attack on the lower-right action cluster, and keep the center route
     lane as clear as practical.

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

- Level 1: readable training challenge that is longer than the tutorial, with
  two sentries, two tilt bridges, wider spike gaps, coins, and basic
  double-jump timing.
- Level 2: longer market-roof route with more vertical movement, three
  sentries, three faster tilt bridges, more coins, and denser spikes around
  timing hazards.
- Level 3: Ivy Viaduct combines Barrel Rollers, a Clockwork Sentry, stronger
  tilt bridges, longer jumps, and heavier spike pressure.
- Level 4: Bell Tower Archives is the first long hard route. It requires
  low-clearance archive platforms, mixes Clockwork Sentries, Barrel Roller, Scroll Thieves, and
  Tower Archers, places coins on risky optional lines, and introduces the
  Moonheart Crest boost for temporary attack and damage-resistance pressure.
- Level 5: Candle Fair Ruins is the new hardest route. It is significantly
  longer than Bell Tower, combines old enemies with Candle Jesters, introduces
  shield pickups for archer-fire gauntlets, uses multi-height offscreen volley
  lanes, adds smoother tilt bridges that can dump the player, and adds high
  routes where careless drops cause fall damage. Perfect-score runs require all
  high/low coin lines plus every enemy clear.
- Level 6: Clockmaker Yard is roughly 15 percent longer than Candle Fair and
  increases pressure without becoming a punishment route. It adds four fast
  Lantern Bandit Scouts, stronger mixed patrols, four faster tilt bridges,
  five recovery checkpoints, three low-clearance gear gates, and the Chrono
  Lantern power-up for readable time-control windows through machine
  gauntlets.
- Each map stop carries a route type, difficulty tier, difficulty label, and
  mechanic preview so future route design can stay ordered from simple to
  complex.
- Later maps should add complexity step-by-step: faster moving/tilting
  platforms, pits or spikes around tilt bridges, more enemy variety,
  chase/timing pressure, hidden collectibles, and mixed mechanics.
- Tilt bridges now support tuned fall-through behavior when the player waits on
  the low edge too long. Future levels should reuse that behavior and tune
  bridge timing from playtest evidence rather than weakening route geometry for
  automation.

## Verification Gates

- `npm run lint`
- `npx tsc --noEmit -p tsconfig.app.json`
- `npm run build`
- Chrome mobile landscape smoke at `740x390` and `932x430`
- Automated route sanity:
  - open Shadow Runner from the Entertainment picker
  - verify the access-code gate is not present
  - verify Android/browser landscape request behavior where supported
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
- Level 1 and Level 2 have playable loops around controls, pickups, hazards,
  multiple sentries, tilt bridge influence, and finish feedback.
- The checkpoint is verified, documented in the progress log, committed, and
  pushed to `main`.

## June 11, 2026 - Phone Gameplay Stabilization And Level 3 Foundation

- Added the playable Level 3 foundation: `Ivy Viaduct`, using the generated
  viaduct background, generated ivy terrain/hazard sheet, three Barrel Roller
  patrols, one Clockwork Sentry, tighter spike placement, faster tilt bridges,
  and a longer finish route.
- Extended enemy state from sentry-only to kind-aware runtime state so Barrel
  Roller patrol speed, animation, hit, impact, and defeated frames are handled
  without changing the existing sentry loop.
- Kept Level 1 and Level 2 difficulty direction intact; validation used QA
  teleport plus normal rightward finish movement instead of weakening route
  geometry for automation.
- Converted campaign-map mission detail popups to square thumbnail frames by
  using the generated square map-location frame asset on top of the blank
  scroll panel.
- Latest verification artifacts:
  `output/playwright/shadow-runner-goal-20260611-square-frame/`,
  `output/playwright/shadow-runner-goal-20260611-postbuild/`, and
  `output/playwright/shadow-runner-goal-20260611-routes/`.

## June 11, 2026 - Level 3 Hardening And Control Research

- Researched mobile control guidance and moved gameplay input from a wide
  five-button strip to a split-thumb layout: a large generated D-pad on the
  lower left for left/right/crouch and two large generated action buttons near
  the lower-right edge for jump/attack.
- Extended `Ivy Viaduct` with a longer finish path, more coin/spike pressure,
  a final Barrel Roller, faster tilt-bridge timing, and stronger tilt slide
  influence without weakening the prior movement/combat rules.
- Added local-preview-only enemy/player debug snapshots so automated and
  foreground QA can catch stuck/falling enemies without shipping debug UI to
  normal users.
- Latest verification artifacts:
  `output/playwright/shadow-runner-controls-research/` and
  `output/playwright/shadow-runner-foreground/`.

## June 11, 2026 - Audio, Loading, And Baked Control Stabilization

- Replaced pooled `<audio>` SFX playback with a single Web Audio SFX
  controller. Menu and gameplay sounds preload in staged groups, decoding
  yields between buffers, and high-frequency events use short cooldowns so
  sound effects do not compete with the render loop.
- Generated and wired baked gold circular control assets for movement,
  sword attack, and jump. The left-side control hit area now covers the full
  left side of the gameplay screen for left/right/crouch, while jump and sword
  remain split on the lower-right side.
- Split loading into title, campaign-map, and route groups. Title no longer
  waits on campaign-map thumbnails, map art loads behind a branded map
  interstitial, and playable routes decode needed art/SFX behind a route
  loading screen before Phaser mounts.
- Repaired overhead health bars by updating them every frame and drawing the
  red fill above the frame backing so player/enemy damage is visible again.
- Added local-preview-only tilt-bridge QA teleport (`Digit4`) and verified:
  Level 1/tutorial tilt applies real player X movement, Level 3 stronger tilt
  pushes the player toward the edge, and Level 2 sentries remain grounded with
  nonzero patrol velocity.
- Latest verification artifacts:
  `output/shadow-runner/webkit-title.png`,
  `output/shadow-runner/chrome-game-sfx-on.png`,
  `output/shadow-runner/chrome-map.png`,
  `output/shadow-runner/chrome-map-detail.png`,
  `output/shadow-runner/chrome-strong-tilt-end.png`, and
  `output/shadow-runner/chrome-level2-start.png`.

## June 15, 2026 - Bell Tower Archives Level 4

- Added Bell Tower Archives as the next playable route and made it longer and
  harder than the earlier levels without making route completion impossible.
- Required crouch traversal under low archive platforms, with risky optional
  coin lines above and around the low-clearance sections for harder
  perfect-score play.
- Added Tower Archer runtime behavior with projectile shots, wired Scroll
  Thieves into the enemy loop, and reused older enemies in a denser mixed
  gauntlet.
- Added the Moonheart Crest pickup: it restores health, awards a higher point
  value, temporarily boosts attack damage, and gives temporary guard charges
  for damage resistance.
- Generated and wired fresh Tower Archer, Moonheart Crest, and boost aura
  assets while reusing Bell Tower slabs, shelves, and archive props for the
  low-clearance crawl-under platforms.
- Latest verification artifacts:
  `output/playwright/shadow-runner-bell-tower-20260615/`.

## June 15, 2026 - Bell Tower Polish And Launch QA

- Reworked the required crouch obstacles from archway-style art into
  side-view low-clearance platforms built from Bell Tower slabs, stone blocks,
  and archive shelves. The player now crawls under a heavy overhead structure
  instead of appearing to pass through an arch.
- Lowered crawl-space coins into the crouched hitbox lane, raised coin draw
  depth above the archive platform art, added tiny collision-only steps to make
  top access an intentional bonus route, and added high/top coins above both
  low-clearance archive platforms.
- Rounded Moonheart boost HUD countdown updates to whole-second boundaries so
  the React HUD does not redraw at frame rate while the Phaser scene is
  running.
- Production-preview polish sweep covered title, level map, playable Levels 1
  through 4, completion overlays, Bell Tower low-clearance traversal,
  Moonheart boost state, first enemy encounter, and `740x390` phone-landscape
  map/start checks. Evidence:
  `output/playwright/shadow-runner-polish-final-20260615/`.

## July 10, 2026 - Production Gameplay Audit And Level 5 Recovery Pass

- Audited all six playable routes (tutorial plus Campaign Levels 1-5) against
  production builds with real run, crouch, jump, attack, pause/resume, and
  completion input on phone-landscape viewports.
- Added safe health-restoring checkpoints to every long campaign route so a
  late fall no longer erases the full run. Respawns retain earned coins and
  defeated enemies and include the existing damage grace window.
- Rebalanced Candle Fair Ruins without flattening its identity: reduced the
  overlapping volley lanes and enemy pileup, lowered elite health, fixed
  off-platform patrol bounds, created real landing space before both crouch
  corridors, and added a visible lower recovery chain beneath the high route.
- Kept the final tilt bridge meaningful while proving its double-jump landing,
  both crouch corridors, and the recovery chain with repeatable real-input
  route-segment checks on iPhone-sized and Android-sized Chromium profiles.
- Changed the HUD hearts to represent current health and added a separate
  remaining-lives count. The previous HUD only showed lives and hid damage
  until a life was lost.
- Pooled and capped arrow/candle projectile and impact-hazard objects to prevent
  unbounded growth during long waits in volley zones.
- Removed service-worker fetch interception and worker-side Badging API calls
  that could crash Android-sized Chromium during Shadow Runner startup. Push
  notification delivery, notification cleanup, and foreground badge updates
  remain intact; hashed assets use the browser/CDN cache.
- Strengthened `scripts/shadow-runner-phone-smoke.mjs` so it waits for rendered
  title assets, checks nonblank screenshots, enables the real service worker,
  exercises controls and completion, verifies Level 5 checkpoints and pool
  caps, and captures key route states for visual review.
- Final evidence: `output/playwright/shadow-runner-audit-tutorial/`,
  `output/playwright/shadow-runner-audit-level-1/`,
  `output/playwright/shadow-runner-audit-level-2/`,
  `output/playwright/shadow-runner-audit-level-3-final/`,
  `output/playwright/shadow-runner-audit-level-4-final/`, and
  `output/playwright/shadow-runner-audit-level-5-production/`.

## July 10, 2026 - Clockmaker Yard Level 6 And Health Redesign

- Added playable Campaign Level 6, `Clockmaker Yard`, at 10,260 world units
  versus Candle Fair's 8,900. The route uses five recovery checkpoints, four
  tilt bridges, three required crawl gates, a multi-step high route, two
  ranged-pressure zones, 48 coins, and 12 enemies.
- Generated a new clockwork-yard background, transparent terrain/prop atlas,
  level thumbnail, and four-frame Chrono Lantern strip. Promoted the reviewed
  but previously unused Lantern Bandit Scout strip as the new fast melee
  enemy.
- Added the Chrono Lantern power-up: it restores a bounded amount of health
  and temporarily slows patrol movement, ranged attack cadence, projectiles,
  and tilt-bridge dump pressure instead of duplicating Moonheart or shield
  behavior.
- Reworked player durability from three health points to a 12-point scale.
  The HUD's three hearts now represent lives only and empty one at a time when
  a life is spent; a separate proportional `current/max` health bar reflects
  ordinary damage.
- Differentiated damage by source: light contact and flame damage remain low,
  sentries/bandits/jesters deal moderate damage, arrows and spikes deal more,
  Barrel Rollers and heavy falls deal the most, and the existing 820ms damage
  grace prevents rapid multi-hit drain.
- Added Level 6 catalog availability migration, asset-manifest coverage,
  level geometry/patrol/damage tests, simulation tests, life-heart assertions,
  Chrono assertions, and route-segment smoke checks.
- Production-preview phone evidence:
  `output/playwright/shadow-runner-level6-final/`. Regression playthroughs for
  tutorial and Levels 1-5 are under
  `output/playwright/shadow-runner-health-regression-*/`, with Android Level 5
  proof in `output/playwright/shadow-runner-level5-android-health-regression/`.
