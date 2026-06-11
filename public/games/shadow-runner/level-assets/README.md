# Shadow Runner Level Assets

Generated gameplay replacement assets for Shadow Runner levels.

Batch 1 runtime files are wired through
`src/features/games/shadow-runner/assets/manifest.ts` and
`src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`.
Source and preview files remain here for review, future slicing, and visual
reference.

## Batch 1 Start - 2026-06-10

### Terrain

- `terrain/stone-ruins-terrain-v1-source.png`: generated chroma-key source.
- `terrain/stone-ruins-terrain-v1.png`: transparent platform/chunk sheet.
- `terrain/stone-ruins-terrain-v1-preview.png`: checkerboard preview.
- Runtime use: `stone-ruins-terrain-v1.png` is cropped into platform visuals
  for Level 1. It is not a strict 32 x 32 tilemap atlas.

### Collectibles

- `collectibles/gold-coin-v1-source.png`: generated chroma-key source.
- `collectibles/gold-coin-v1-transparent-strip.png`: transparent source strip.
- `collectibles/gold-coin-8f-32.png`: compact runtime strip.
- `collectibles/gold-coin-8f-48.png`: larger runtime strip.
- `collectibles/gold-coin-v1-preview.png`: preview strip.
- Runtime use: `gold-coin-8f-48.png` drives the in-world spinning pickup.

### Hazards

- `hazards/floor-spikes-v1-source.png`: generated chroma-key source.
- `hazards/floor-spikes-v1-transparent.png`: transparent source.
- `hazards/floor-spikes-64x28.png`: compact runtime texture.
- `hazards/floor-spikes-128x56.png`: larger runtime texture.
- `hazards/floor-spikes-v1-preview.png`: preview image.
- Runtime use: `floor-spikes-64x28.png` replaces the Phaser-drawn triangle
  spike row.

### Props

- `props/east-gate-v1-source.png`: generated chroma-key source.
- `props/east-gate-v1-transparent.png`: transparent source.
- `props/east-gate-96x180.png`: compact runtime finish marker.
- `props/east-gate-128x240.png`: larger runtime finish marker.
- `props/east-gate-v1-preview.png`: preview image.
- Runtime use: `east-gate-96x180.png` replaces the rectangle finish marker.

### VFX

- `vfx/landing-dust-v1-source.png`: generated chroma-key source.
- `vfx/landing-dust-v1-transparent-strip.png`: transparent source strip.
- `vfx/landing-dust-6f-64.png`: runtime strip.
- `vfx/landing-dust-v1-preview.png`: preview strip.
- `vfx/sword-slash-v1-source.png`: generated chroma-key source.
- `vfx/sword-slash-v1-transparent-strip.png`: transparent source strip.
- `vfx/sword-slash-6f-96.png`: runtime strip.
- `vfx/sword-slash-v1-preview.png`: preview strip.
- Runtime use: `landing-dust-6f-64.png` handles double-jump, respawn, and
  defeat puffs; `sword-slash-6f-96.png` handles the attack VFX.

## Batch 2 Lantern Market Roofs - 2026-06-10

Map 2 source batch for `Lantern Market Roofs`. These are saved for review and
future runtime wiring.

### Background

- `level-2/background/lantern-market-roofs-background-source.png`: generated
  gameplay background source.
- `level-2/background/lantern-market-roofs-background.webp`: optimized gameplay
  background export.

### Props And Terrain

- `level-2/props/lantern-market-props-v1-source.png`: generated chroma-key
  source sheet.
- `level-2/props/lantern-market-props-v1-transparent.png`: transparent source
  sheet with roof platforms, ledge pieces, chimney, hanging lantern states,
  torch brazier, banner, stall awning, sealed-letter crate, route-token table,
  signpost, rope line, and rubble.

### UI

- `level-2/ui/lantern-market-roofs-thumbnail-source.png`: generated thumbnail
  source.
- `level-2/ui/lantern-market-roofs-thumbnail-320x180.webp`: level-select
  thumbnail export.
- `level-2/ui/lantern-market-roofs-thumbnail-160x90.webp`: compact
  level-select thumbnail export.

### Preview

- `level-2/batch-2-lantern-market-contact-sheet.png`: review contact sheet
  combining background, thumbnail, props, and enemy preview.

### Enemy Sprite

The Lantern Bandit Scout enemy strip is stored with the shared sprite assets:

- `../sprites/raw/lantern-bandit-scout-v1-source.png`
- `../sprites/transparent/lantern-bandit-scout-v1-5f-strip.png`
- `../sprites/strips/lantern-bandit-scout-v1-5f-128.png`
- `../sprites/strips/lantern-bandit-scout-v1-5f-192.png`
- `../sprites/previews/lantern-bandit-scout-v1-5f-preview.png`
- `../sprites/frames/lantern-bandit-scout-v1/*.png`

Style note: an earlier hooded bandit source was rejected because it read too
close to the Shadow Runner hero. The saved v1 bandit uses a burgundy cap,
rust-orange scarf/cape, tan vest, visible face, and lantern-pole silhouette so
it is visually distinct from the player.
