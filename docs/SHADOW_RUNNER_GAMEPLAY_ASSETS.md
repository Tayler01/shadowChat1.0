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
| Touch control button | `public/games/shadow-runner/gameplay-assets/optimized/touch-control-button.webp` | Generated translucent medieval control-face asset used behind the mobile left/right/crouch/jump/attack controls. |
| Hit spark | `public/games/shadow-runner/gameplay-assets/sliced/hit-spark.png` | Phaser hit feedback image used for sword and stomp hits. |
| Coin sparkle strip | `public/games/shadow-runner/gameplay-assets/sliced/coin-sparkle-strip.png` | Phaser coin pickup sparkle strip. |
| Clockwork Sentry strip | `public/games/shadow-runner/sprites/strips/clockwork-sentry-v2-6f-128.png` | First playable enemy runtime strip. |
| Barrel Roller strip | `public/games/shadow-runner/sprites/strips/barrel-roller-v1-5f-128.png` | Level 3 enemy strip with idle, roll, impact, hit, and defeated states. |
| Ivy Viaduct background | `public/games/shadow-runner/level-assets/level-3/background/ivy-viaduct-background.webp` | Level 3 route backdrop. |
| Ivy Viaduct terrain/hazards sheet | `public/games/shadow-runner/level-assets/level-3/terrain/ivy-viaduct-terrain-hazards-v1-transparent.png` | Level 3 platform/ruin visual source registered as Phaser terrain frames. |

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
- Sentry source:
  `public/games/shadow-runner/sprites/raw/clockwork-sentry-v2-source.png`
- Sentry transparent strip:
  `public/games/shadow-runner/sprites/transparent/clockwork-sentry-v2-6f-strip.png`

## Runtime Wiring

- Manifest: `src/features/games/shadow-runner/assets/manifest.ts`
- DOM HUD and level-complete overlay:
  `src/features/games/shadow-runner/ShadowRunnerGame.tsx`
- Phaser preload, sentry animation, overhead health, and pickup/hit effects:
  `src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`
- Level 3 now registers a second terrain frame set for the generated Ivy
  Viaduct sheet and uses kind-aware enemy animation helpers for Clockwork
  Sentry and Barrel Roller runtime states.
