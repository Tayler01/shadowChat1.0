# Shadow Runner Gameplay Assets

Status: first playable-prototype gameplay UI and enemy asset pass.

## Generated Runtime Assets

| Asset | Runtime path | Purpose |
| --- | --- | --- |
| HUD plaque | `public/games/shadow-runner/gameplay-assets/optimized/hud-plaque.webp` | DOM gameplay HUD backing for health, coins, score, and objective area. |
| Health bar frame | `public/games/shadow-runner/gameplay-assets/optimized/health-bar-frame.webp` | Phaser overhead health-frame art for hero and enemy health bars. |
| Coin icon | `public/games/shadow-runner/gameplay-assets/optimized/coin-icon.webp` | Runtime coin/icon reference for HUD and future pickup polish. |
| Level-complete banner | `public/games/shadow-runner/gameplay-assets/optimized/level-complete-banner.webp` | DOM level-complete banner backing. |
| Hit spark | `public/games/shadow-runner/gameplay-assets/sliced/hit-spark.png` | Phaser hit feedback image used for sword and stomp hits. |
| Coin sparkle strip | `public/games/shadow-runner/gameplay-assets/sliced/coin-sparkle-strip.png` | Phaser coin pickup sparkle strip. |
| Clockwork Sentry strip | `public/games/shadow-runner/sprites/strips/clockwork-sentry-6f-128.png` | First playable enemy runtime strip. |

## Source Preservation

- HUD source:
  `public/games/shadow-runner/gameplay-assets/generated/shadow-runner-gameplay-hud-sheet-imagegen-source.png`
- Transparent HUD sheet:
  `public/games/shadow-runner/gameplay-assets/transparent/shadow-runner-gameplay-hud-sheet-transparent.png`
- Sentry source:
  `public/games/shadow-runner/sprites/raw/clockwork-sentry-6f-source.png`
- Sentry transparent strip:
  `public/games/shadow-runner/sprites/transparent/clockwork-sentry-6f-strip-transparent.png`

## Runtime Wiring

- Manifest: `src/features/games/shadow-runner/assets/manifest.ts`
- DOM HUD and level-complete overlay:
  `src/features/games/shadow-runner/ShadowRunnerGame.tsx`
- Phaser preload, sentry animation, overhead health, and pickup/hit effects:
  `src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`
