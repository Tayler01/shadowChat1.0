# Shadow Runner Gameplay Assets

Status: first playable-prototype gameplay UI and enemy asset pass.

## Generated Runtime Assets

| Asset | Runtime path | Purpose |
| --- | --- | --- |
| HUD status bar | `public/games/shadow-runner/gameplay-assets/optimized/hud-status-bar.webp` | Centered DOM gameplay HUD backing with blank compartments only. |
| Full heart | `public/games/shadow-runner/gameplay-assets/optimized/heart-full.webp` | Separate player-health icon removed as health drops. |
| Empty heart | `public/games/shadow-runner/gameplay-assets/optimized/heart-empty.webp` | Separate player-health icon shown for lost health. |
| Clean coin icon | `public/games/shadow-runner/gameplay-assets/optimized/coin-icon-clean.webp` | Runtime HUD coin icon shown beside collected count only. |
| Health bar frame | `public/games/shadow-runner/gameplay-assets/optimized/health-bar-frame-clean.webp` | Phaser overhead health-frame art for hero and enemy health bars. |
| Health fill | `public/games/shadow-runner/gameplay-assets/optimized/health-fill.webp` | Source swatch for the red health fill palette; runtime fill is drawn live so it depletes smoothly. |
| Level-complete banner | `public/games/shadow-runner/gameplay-assets/optimized/level-complete-banner.webp` | DOM level-complete banner backing. |
| Touch control button | `public/games/shadow-runner/gameplay-assets/optimized/touch-control-button.webp` | Earlier shared translucent medieval control-face asset retained for fallback/reference. |
| Baked D-pad control | `public/games/shadow-runner/gameplay-assets/optimized/dpad-control-button.webp` | Generated gold circular left control with baked left/right/crouch arrows; runtime uses this as the visible control while the whole left half of the screen acts as the hit area. |
| Baked sword control | `public/games/shadow-runner/gameplay-assets/optimized/sword-control-button.webp` | Generated gold circular attack control with the sword icon baked into the asset. |
| Baked jump control | `public/games/shadow-runner/gameplay-assets/optimized/jump-control-button.webp` | Generated gold circular jump control with the double-up arrow icon baked into the asset. |
| Hit spark | `public/games/shadow-runner/gameplay-assets/sliced/hit-spark.png` | Phaser hit feedback image used for sword and stomp hits. |
| Coin sparkle strip | `public/games/shadow-runner/gameplay-assets/sliced/coin-sparkle-strip.png` | Phaser coin pickup sparkle strip. |
| Clockwork Sentry strip | `public/games/shadow-runner/sprites/strips/clockwork-sentry-v2-6f-128.png` | First playable enemy runtime strip. |
| Barrel Roller strip | `public/games/shadow-runner/sprites/strips/barrel-roller-v1-5f-128.png` | Level 3 enemy strip with idle, roll, impact, hit, and defeated states. |
| Ivy Viaduct background | `public/games/shadow-runner/level-assets/level-3/background/ivy-viaduct-background.webp` | Level 3 route backdrop. |
| Ivy Viaduct terrain/hazards sheet | `public/games/shadow-runner/level-assets/level-3/terrain/ivy-viaduct-terrain-hazards-v1-transparent.png` | Level 3 platform/ruin visual source registered as Phaser terrain frames. |

## Generated Audio Assets

| Asset group | Runtime path | Purpose |
| --- | --- | --- |
| Lobby music | `public/games/shadow-runner/audio/castle-bard.mp3` | Shared Castle Bard loop used on the Shadow Runner title/lobby/map surfaces. |
| Menu SFX | `public/games/shadow-runner/audio/sfx/menu-click.wav`, `menu-back.wav`, `menu-denied.wav`, `level-select.wav`, `pause.wav`, `resume.wav` | Original generated UI feedback for title buttons, denied/locked actions, level map/details, and pause menus. |
| Movement/combat SFX | `public/games/shadow-runner/audio/sfx/jump.wav`, `double-jump.wav`, `land.wav`, `sword-swing.wav`, `enemy-hit.wav`, `stomp.wav`, `player-hurt.wav` | Original generated gameplay feedback emitted from the Phaser scene at existing visual-event points. |
| Route state SFX | `public/games/shadow-runner/audio/sfx/life-lost.wav`, `respawn.wav`, `coin.wav`, `enemy-defeat.wav`, `level-complete.wav`, `route-failed.wav` | Original generated score, progression, defeat, completion, and failure feedback. |

## Source Preservation

- HUD source:
  `public/games/shadow-runner/gameplay-assets/generated/shadow-runner-gameplay-hud-sheet-imagegen-source.png`
- Clean HUD source:
  `public/games/shadow-runner/gameplay-assets/generated/shadow-runner-gameplay-hud-clean-sheet-imagegen-source.png`
- Transparent HUD sheet:
  `public/games/shadow-runner/gameplay-assets/transparent/shadow-runner-gameplay-hud-sheet-transparent.png`
- Clean transparent HUD sheet:
  `public/games/shadow-runner/gameplay-assets/transparent/shadow-runner-gameplay-hud-clean-sheet-transparent.png`
- Touch control button source:
  `public/games/shadow-runner/gameplay-assets/generated/touch-control-button-source.png`
- Baked touch controls source:
  `public/games/shadow-runner/gameplay-assets/generated/baked-touch-controls-sheet-imagegen-source.png`
- Baked transparent control slices:
  `public/games/shadow-runner/gameplay-assets/generated/dpad-control-button.png`,
  `public/games/shadow-runner/gameplay-assets/generated/sword-control-button.png`, and
  `public/games/shadow-runner/gameplay-assets/generated/jump-control-button.png`
- Sentry source:
  `public/games/shadow-runner/sprites/raw/clockwork-sentry-v2-source.png`
- Sentry transparent strip:
  `public/games/shadow-runner/sprites/transparent/clockwork-sentry-v2-6f-strip.png`
- Audio generator:
  `scripts/generate-shadow-runner-audio.mjs`

## Runtime Wiring

- Manifest: `src/features/games/shadow-runner/assets/manifest.ts`
- DOM HUD and level-complete overlay:
  `src/features/games/shadow-runner/ShadowRunnerGame.tsx`
- Audio preferences and Web Audio short-effect playback:
  `src/features/games/shadow-runner/audio.ts` and
  `src/features/games/shadow-runner/ShadowRunnerScreen.tsx`
- Phaser preload, sentry animation, overhead health, and pickup/hit effects:
  `src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`
- Level 3 now registers a second terrain frame set for the generated Ivy
  Viaduct sheet and uses kind-aware enemy animation helpers for Clockwork
  Sentry and Barrel Roller runtime states.
- Lobby music is enabled by default on title/lobby/map surfaces and is paused
  automatically during gameplay; SFX remain enabled by default in both menus
  and gameplay unless the local Shadow Runner sound preference is disabled.
  Short effects now decode through one Web Audio controller, preload in staged
  groups, and use cooldowns for high-frequency events so sound playback does
  not create pooled `<audio>` churn during gameplay.
- Mobile gameplay controls now use a researched split-thumb layout: one large
  baked bottom-left D-pad visual for left/right/crouch, a full left-side
  movement hit zone, and two separated baked bottom-right action buttons for
  jump/attack. The center of the playfield stays clear while preserving
  oversized touch targets for phone play.
- Route loading is staged: title art loads first, campaign-map art loads only
  when opening the map, and gameplay route art/SFX preload behind a branded
  route loading screen before Phaser mounts.
