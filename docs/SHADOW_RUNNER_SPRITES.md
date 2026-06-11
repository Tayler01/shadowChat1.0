# Shadow Runner Sprite Assets

Status: first-pass review assets, with the menu-idle strip currently wired into
the live title screen and gameplay strips feeding the playable prototype.

These files start the production sprite pipeline for the Shadow Runner hero.
They are not final shipping sprites yet, but they are normalized enough to test
motion, frame timing, and home-screen composition.

## Asset Rules

- Frame size: 128 x 128 PNG.
- Anchor: bottom-center.
- Direction: right-facing gameplay unless noted.
- Runtime strips should not include labels baked into the art.
- Human review previews include frame labels on a dark band.
- The hero should remain the same shadow knight messenger: hooded dark cloak,
  gray armor, glowing gold eyes, sword, and messenger satchel.
- Enemy sprites must not read like the hero unless they are intentionally rival
  runners. Give each enemy a distinct silhouette, palette, head shape, posture,
  and tool or weapon. A different cape/scarf color is the minimum bar.

## Generated Strips

| Animation | Frames | Loop | Purpose | Runtime Strip | Preview |
| --- | ---: | --- | --- | --- | --- |
| menu-idle-cape | 8 | yes | Home screen cape wind loop | `public/games/shadow-runner/sprites/strips/shadow-runner-menu-idle-cape-8f-128.png` | `public/games/shadow-runner/sprites/previews/shadow-runner-menu-idle-cape-8f-preview.png` |
| run | 6 | yes | Right-facing gameplay run cycle | `public/games/shadow-runner/sprites/strips/shadow-runner-run-6f-128.png` | `public/games/shadow-runner/sprites/previews/shadow-runner-run-6f-preview.png` |
| jump-air | 6 | no | Takeoff, rise, apex, double jump, fall, land | `public/games/shadow-runner/sprites/strips/shadow-runner-jump-air-6f-128.png` | `public/games/shadow-runner/sprites/previews/shadow-runner-jump-air-6f-preview.png` |
| sword-attack | 5 | no | Ground sword attack | `public/games/shadow-runner/sprites/strips/shadow-runner-sword-attack-5f-128.png` | `public/games/shadow-runner/sprites/previews/shadow-runner-sword-attack-5f-preview.png` |
| clockwork-sentry | 6 | partial | First playable enemy: idle, patrol, attack, hit, defeated | `public/games/shadow-runner/sprites/strips/clockwork-sentry-v2-6f-128.png` | `public/games/shadow-runner/sprites/previews/clockwork-sentry-v2-6f-preview.png` |
| lantern-bandit-scout | 5 | partial | Map 2 enemy: idle, run, lantern-pole jab, hit, defeated | `public/games/shadow-runner/sprites/strips/lantern-bandit-scout-v1-5f-128.png` | `public/games/shadow-runner/sprites/previews/lantern-bandit-scout-v1-5f-preview.png` |
| barrel-roller | 5 | partial | Map 3 trap-enemy: idle, roll, impact, stunned, broken | `public/games/shadow-runner/sprites/strips/barrel-roller-v1-5f-128.png` | `public/games/shadow-runner/sprites/previews/barrel-roller-v1-5f-preview.png` |
| scroll-thief | 5 | partial | Map 4 enemy: idle, dash, satchel swipe, hit, defeated | `public/games/shadow-runner/sprites/strips/scroll-thief-v1-5f-128.png` | `public/games/shadow-runner/sprites/previews/scroll-thief-v1-5f-preview.png` |
| candle-jester | 5 | partial | Map 5 enemy: idle, skip, candle trick, hit, defeated | `public/games/shadow-runner/sprites/strips/candle-jester-v1-5f-128.png` | `public/games/shadow-runner/sprites/previews/candle-jester-v1-5f-preview.png` |

## Frame Labels

### menu-idle-cape

1. rest
2. slight-lift
3. cape-billow-left
4. full-billow
5. cape-curl
6. settling
7. soft-flutter
8. return-rest

### run

1. contact-a
2. passing-a
3. stride-extension-a
4. contact-b
5. passing-b
6. stride-extension-b

### jump-air

1. takeoff-crouch
2. rising
3. apex-float
4. double-jump-swirl
5. falling
6. landing-impact

### sword-attack

1. ready
2. windup
3. main-slash
4. follow-through
5. recovery

### clockwork-sentry

1. idle
2. patrol-a
3. patrol-b
4. spear-thrust
5. hit-stunned
6. defeated

### lantern-bandit-scout

1. idle
2. run
3. lantern-pole-jab
4. hit-stunned
5. defeated

### barrel-roller

1. idle-barrel
2. rolling
3. charge-impact
4. stunned-cracked
5. broken-defeated

### scroll-thief

1. idle-scroll
2. quick-dash
3. satchel-swipe
4. hit-stunned
5. defeated

### candle-jester

1. idle-grin
2. skipping-run
3. candle-trick
4. hit-stunned
5. defeated

## Review Notes

- `menu-idle-cape` is the strongest first-pass strip and is a good candidate for
  the home screen anchor; it is currently wired into the live title screen.
- `run` has readable movement, but the sword and cloak should be stabilized in a
  stricter second pass. The playable prototype uses it for movement timing.
- `jump-air` includes effect pixels in the double-jump and landing frames. This
  can be useful for concept timing, but final effects may need a separate strip.
  The playable prototype uses it for the jump/double-jump read.
- `sword-attack` has a strong slash read, but the follow-through frame turns the
  hero partly away from the gameplay-facing direction. This should be corrected
  before final implementation. The prototype currently uses it for attack
  feedback, so treat animation cleanup separately from gameplay tuning.
- `clockwork-sentry` now uses the cleaner v2 runtime strip. The first three
  frames loop for patrol, frame 4 is reserved for spear thrust, frame 5 is used
  for hit/stun feedback, and frame 6 is kept visible as the defeated state
  instead of hiding the enemy immediately. The earlier v1 strip is preserved as
  source history but is no longer wired into the playable prototype.
- `lantern-bandit-scout` is generated for Map 2, but is not wired into runtime
  yet. The accepted v1 art intentionally avoids the hero silhouette: burgundy
  cap, rust-orange scarf/cape, tan vest, visible face, hunched thief posture,
  and lantern-pole attack. A hooded first pass was rejected because it looked
  too close to the Shadow Runner hero.
- `barrel-roller` is generated for Map 3, but is not wired into runtime yet.
  It is intentionally non-humanoid, with no hood, cape, satchel, sword, or
  hero-like pose, so it reads as a rolling trap enemy instead of a character
  variant.
- `scroll-thief` is generated for Map 4, but is not wired into runtime yet.
  It uses a teal short cape/sash, cream shirt, burgundy trousers, scholar cap,
  visible face, and scroll/satchel-swipe silhouette so it reads as an archive
  thief rather than another hooded Shadow Runner.
- `candle-jester` is generated for Map 5, but is not wired into runtime yet.
  It uses a cream theatrical mask, red-and-gold jester cap, motley tunic,
  curled shoes, candle wand, and fake coin silhouette so it reads as a trickster
  enemy rather than another hooded Shadow Runner.

## Current Runtime Wiring

- Home/title hero loop: `src/features/games/shadow-runner/ShadowRunnerScreen.tsx`
- Gameplay canvas and DOM controls: `src/features/games/shadow-runner/ShadowRunnerGame.tsx`
- Phaser scene and animation setup: `src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`
- Movement/action state: `src/features/games/shadow-runner/game/input.ts`
- Simulation boundary and HUD state: `src/features/games/shadow-runner/game/simulation.ts`

Keep the React input/shell boundary and Phaser scene boundary separate when
iterating on sprite timing. Visual defects in the first-pass strips should be
fixed in the asset pipeline, not by changing the simulation rules to hide them.

## Manifest

The machine-readable manifest is:

`public/games/shadow-runner/sprites/sprite-manifest.json`
