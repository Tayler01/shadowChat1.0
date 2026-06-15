# Shadow Runner Asset Generation Backlog

Status: started 2026-06-11 after reviewing the current Shadow Runner docs,
runtime code, asset manifests, generated folders, and concept sheets.

Scope: image and visual assets still needed for Shadow Runner. Audio and
gameplay tuning are out of scope unless they affect image requirements.

## Reviewed Sources

- `docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md`
- `docs/SHADOW_RUNNER_STORY_LORE.md`
- `docs/SHADOW_RUNNER_HOME_ASSETS.md`
- `docs/SHADOW_RUNNER_GAMEPLAY_ASSETS.md`
- `docs/SHADOW_RUNNER_SPRITES.md`
- `docs/ARCHITECTURE.md`
- `src/features/games/shadow-runner/assets/manifest.ts`
- `src/features/games/shadow-runner/ShadowRunnerScreen.tsx`
- `src/features/games/shadow-runner/ShadowRunnerGame.tsx`
- `src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`
- `src/features/games/shadow-runner/game/levelOne.ts`
- `public/games/shadow-runner/home-assets/home-assets-manifest.json`
- `public/games/shadow-runner/sprites/sprite-manifest.json`
- `public/games/shadow-runner/concept-art/*`

## Already Generated And Wired

These assets exist in the repo and are referenced by current runtime code.

### Title, Menu, And Shell

- Entertainment picker banner:
  `public/games/shadow-runner/shadow-runner-picker-banner.webp`
- Title background:
  `public/games/shadow-runner/home-assets/optimized/bg-title-castle-night.webp`
- Title scroll:
  `public/games/shadow-runner/home-assets/optimized/title-scroll-shadow-runner.webp`
- Blank title/access/menu scroll:
  `public/games/shadow-runner/home-assets/optimized/blank-menu-scroll.webp`
- Blank title/access/menu button:
  `public/games/shadow-runner/home-assets/optimized/blank-menu-button.webp`
- Campaign map:
  `public/games/shadow-runner/home-assets/optimized/campaign-map.webp`
- Campaign map location buttons:
  `public/games/shadow-runner/home-assets/optimized/map-location-buttons/*.webp`
- Campaign level-detail popup panel:
  `public/games/shadow-runner/home-assets/optimized/level-detail-panel.webp`
- Campaign level-detail thumbnail frame:
  `public/games/shadow-runner/home-assets/optimized/level-thumbnail-frame.webp`
- Options/pause scroll panel:
  `public/games/shadow-runner/home-assets/optimized/options-scroll-panel.webp`
- Options/pause row button:
  `public/games/shadow-runner/home-assets/optimized/options-menu-row-button.webp`
- Mission scroll stand:
  `public/games/shadow-runner/home-assets/optimized/mission-scroll-stand.webp`
- Star shimmer sheet:
  `public/games/shadow-runner/home-assets/optimized/star-twinkle-sheet.webp`
- Runtime torch strip:
  `public/games/shadow-runner/home-assets/sliced/torch-flame-8f-192.png`
- Purple banner props:
  `public/games/shadow-runner/home-assets/optimized/banner-stand.webp`,
  `public/games/shadow-runner/home-assets/sliced/banner-hanging.png`, and
  `public/games/shadow-runner/home-assets/optimized/banner-pennant.webp`

### Hero And First Enemy

- Hero menu idle cape strip:
  `public/games/shadow-runner/sprites/strips/shadow-runner-menu-idle-cape-8f-128.png`
- Hero run strip:
  `public/games/shadow-runner/sprites/strips/shadow-runner-run-6f-128.png`
- Hero jump-air strip:
  `public/games/shadow-runner/sprites/strips/shadow-runner-jump-air-6f-128.png`
- Hero sword-attack strip:
  `public/games/shadow-runner/sprites/strips/shadow-runner-sword-attack-5f-128.png`
- Clockwork Sentry v2 strip:
  `public/games/shadow-runner/sprites/strips/clockwork-sentry-v2-6f-128.png`
  - Quality status: current working tree points the runtime manifest at the
    clean v2 recreation. Browser gameplay QA is still needed before treating it
    as final.
- Legacy Clockwork Sentry strip:
  `public/games/shadow-runner/sprites/strips/clockwork-sentry-6f-128.png`
  - Quality status: damaged first-pass art with white gaps and missing parts.
    Keep as reference only; do not use as a final production asset.

### Gameplay HUD And Feedback

- HUD status bar:
  `public/games/shadow-runner/gameplay-assets/optimized/hud-status-bar.webp`
- Full and empty hearts:
  `public/games/shadow-runner/gameplay-assets/optimized/heart-full.webp`,
  `public/games/shadow-runner/gameplay-assets/optimized/heart-empty.webp`
- Clean HUD coin icon:
  `public/games/shadow-runner/gameplay-assets/optimized/coin-icon-clean.webp`
- Overhead health frame:
  `public/games/shadow-runner/gameplay-assets/optimized/health-bar-frame-clean.webp`
- Health fill palette swatch:
  `public/games/shadow-runner/gameplay-assets/optimized/health-fill.webp`
- Level-complete banner:
  `public/games/shadow-runner/gameplay-assets/optimized/level-complete-banner.webp`
- Touch control button:
  `public/games/shadow-runner/gameplay-assets/optimized/touch-control-button.webp`
- Hit spark:
  `public/games/shadow-runner/gameplay-assets/sliced/hit-spark.png`
- Coin sparkle strip:
  `public/games/shadow-runner/gameplay-assets/sliced/coin-sparkle-strip.png`

## Generated Runtime Asset Catalog

These assets were generated from this backlog and saved into the repo for
review/runtime integration. Integration status is noted per batch so source,
preview, and runtime files stay easy to audit.

### 2026-06-10 Batch 1 Start

Status on 2026-06-11: the runtime-ready Level 1 files are registered in
`src/features/games/shadow-runner/assets/manifest.ts` and wired in
`src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`.
The game now uses the terrain chunk sheet as platform visual art, the 48 px
gold coin strip for pickups, the 64 x 28 spike row for hazards, the 96 x 180
east gate as the finish marker, and the 64/96 px dust and sword-slash strips
for gameplay VFX. The generated tilt bridge asset is wired as the moving
bridge visual. Source and preview files remain cataloged for review.

- Clockwork Sentry v2:
  - source: `public/games/shadow-runner/sprites/raw/clockwork-sentry-v2-source.png`
  - transparent strip: `public/games/shadow-runner/sprites/transparent/clockwork-sentry-v2-6f-strip.png`
  - runtime strip: `public/games/shadow-runner/sprites/strips/clockwork-sentry-v2-6f-128.png`
  - preview: `public/games/shadow-runner/sprites/previews/clockwork-sentry-v2-6f-preview.png`
  - note: generated as a clean replacement for the damaged first sentry strip;
    content-aware extraction was needed so the spear-thrust frame was not
    clipped. Current working tree manifests now point at this v2 strip, but it
    still needs browser gameplay QA before final sign-off.
- Stone ruins terrain/platform sheet:
  - source: `public/games/shadow-runner/level-assets/terrain/stone-ruins-terrain-v1-source.png`
  - transparent sheet: `public/games/shadow-runner/level-assets/terrain/stone-ruins-terrain-v1.png`
  - preview: `public/games/shadow-runner/level-assets/terrain/stone-ruins-terrain-v1-preview.png`
  - note: wired as registered Phaser texture-frame platform visuals. This is a
    platform/chunk sheet, not a strict 32 x 32 tile atlas.
- Tilt bridge:
  - source: `public/games/shadow-runner/level-assets/terrain/tilt-bridge-v1-source.png`
  - transparent source: `public/games/shadow-runner/level-assets/terrain/tilt-bridge-v1-transparent.png`
  - runtime asset: `public/games/shadow-runner/level-assets/terrain/tilt-bridge-v1-256x80.png`
  - note: wired as the animated moving bridge visual in Level 1.
- Gold coin pickup:
  - source: `public/games/shadow-runner/level-assets/collectibles/gold-coin-v1-source.png`
  - transparent strip: `public/games/shadow-runner/level-assets/collectibles/gold-coin-v1-transparent-strip.png`
  - runtime strips: `public/games/shadow-runner/level-assets/collectibles/gold-coin-8f-32.png` and `public/games/shadow-runner/level-assets/collectibles/gold-coin-8f-48.png`
  - preview: `public/games/shadow-runner/level-assets/collectibles/gold-coin-v1-preview.png`
  - note: wired with the 48 px strip for readable in-world pickups.
- Floor spikes:
  - source: `public/games/shadow-runner/level-assets/hazards/floor-spikes-v1-source.png`
  - transparent source: `public/games/shadow-runner/level-assets/hazards/floor-spikes-v1-transparent.png`
  - runtime options: `public/games/shadow-runner/level-assets/hazards/floor-spikes-64x28.png` and `public/games/shadow-runner/level-assets/hazards/floor-spikes-128x56.png`
  - preview: `public/games/shadow-runner/level-assets/hazards/floor-spikes-v1-preview.png`
  - note: wired with the 64 x 28 runtime texture.
- East gate finish marker:
  - source: `public/games/shadow-runner/level-assets/props/east-gate-v1-source.png`
  - transparent source: `public/games/shadow-runner/level-assets/props/east-gate-v1-transparent.png`
  - runtime options: `public/games/shadow-runner/level-assets/props/east-gate-96x180.png` and `public/games/shadow-runner/level-assets/props/east-gate-128x240.png`
  - preview: `public/games/shadow-runner/level-assets/props/east-gate-v1-preview.png`
  - note: wired with the 96 x 180 runtime finish marker.
- Landing dust:
  - source: `public/games/shadow-runner/level-assets/vfx/landing-dust-v1-source.png`
  - transparent strip: `public/games/shadow-runner/level-assets/vfx/landing-dust-v1-transparent-strip.png`
  - runtime strip: `public/games/shadow-runner/level-assets/vfx/landing-dust-6f-64.png`
  - preview: `public/games/shadow-runner/level-assets/vfx/landing-dust-v1-preview.png`
  - note: wired for double-jump, respawn, and defeat dust puffs.
- Sword slash:
  - source: `public/games/shadow-runner/level-assets/vfx/sword-slash-v1-source.png`
  - transparent strip: `public/games/shadow-runner/level-assets/vfx/sword-slash-v1-transparent-strip.png`
  - runtime strip: `public/games/shadow-runner/level-assets/vfx/sword-slash-6f-96.png`
  - preview: `public/games/shadow-runner/level-assets/vfx/sword-slash-v1-preview.png`
  - note: wired as the attack VFX. The old Phaser-drawn slash arc remains only
    as a fallback.

### 2026-06-10 Batch 2 Lantern Market Roofs

- Lantern Market gameplay background:
  - source: `public/games/shadow-runner/level-assets/level-2/background/lantern-market-roofs-background-source.png`
  - optimized background: `public/games/shadow-runner/level-assets/level-2/background/lantern-market-roofs-background.webp`
- Lantern Market props and terrain source sheet:
  - source: `public/games/shadow-runner/level-assets/level-2/props/lantern-market-props-v1-source.png`
  - transparent sheet: `public/games/shadow-runner/level-assets/level-2/props/lantern-market-props-v1-transparent.png`
  - includes roof chunks, ledge pieces, chimney, hanging lantern states, torch
    brazier, purple banner, stall awning, sealed-letter crate, route-token
    table, signpost, rope line, and rubble.
- Lantern Market level-select thumbnail:
  - source: `public/games/shadow-runner/level-assets/level-2/ui/lantern-market-roofs-thumbnail-source.png`
  - runtime options: `public/games/shadow-runner/level-assets/level-2/ui/lantern-market-roofs-thumbnail-320x180.webp` and `public/games/shadow-runner/level-assets/level-2/ui/lantern-market-roofs-thumbnail-160x90.webp`
- Lantern Bandit Scout v1:
  - source: `public/games/shadow-runner/sprites/raw/lantern-bandit-scout-v1-source.png`
  - transparent strip: `public/games/shadow-runner/sprites/transparent/lantern-bandit-scout-v1-5f-strip.png`
  - runtime strips: `public/games/shadow-runner/sprites/strips/lantern-bandit-scout-v1-5f-128.png` and `public/games/shadow-runner/sprites/strips/lantern-bandit-scout-v1-5f-192.png`
  - frames: `public/games/shadow-runner/sprites/frames/lantern-bandit-scout-v1/*.png`
  - preview: `public/games/shadow-runner/sprites/previews/lantern-bandit-scout-v1-5f-preview.png`
  - note: a first hooded bandit source was rejected because it looked too much
    like the player. Saved v1 uses a burgundy cap, rust-orange scarf/cape, tan
    vest, visible face, and lantern-pole silhouette so it reads as a different
    faction.
- Batch contact sheet:
  `public/games/shadow-runner/level-assets/level-2/batch-2-lantern-market-contact-sheet.png`

### 2026-06-11 Batch 3 Ivy Viaduct

- Ivy Viaduct gameplay background:
  - source: `public/games/shadow-runner/level-assets/level-3/background/ivy-viaduct-background-source.png`
  - optimized background: `public/games/shadow-runner/level-assets/level-3/background/ivy-viaduct-background.webp`
- Ivy Viaduct terrain and hazard source sheet:
  - source: `public/games/shadow-runner/level-assets/level-3/terrain/ivy-viaduct-terrain-hazards-v1-source.png`
  - transparent sheet: `public/games/shadow-runner/level-assets/level-3/terrain/ivy-viaduct-terrain-hazards-v1-transparent.png`
  - includes mossy viaduct blocks, arch underside pieces, ledge caps, vine
    overlays, wet ledges, crumbling bridge planks, falling-stone pieces,
    shallow pit warning marker, spike-pit dressing, broken banner, runner route
    marks, dust puffs, and stone chunks.
- Ivy Viaduct level-select thumbnail:
  - source: `public/games/shadow-runner/level-assets/level-3/ui/ivy-viaduct-thumbnail-source.png`
  - runtime options: `public/games/shadow-runner/level-assets/level-3/ui/ivy-viaduct-thumbnail-320x180.webp` and `public/games/shadow-runner/level-assets/level-3/ui/ivy-viaduct-thumbnail-160x90.webp`
- Barrel Roller v1:
  - source: `public/games/shadow-runner/sprites/raw/barrel-roller-v1-source.png`
  - transparent strip: `public/games/shadow-runner/sprites/transparent/barrel-roller-v1-5f-strip.png`
  - runtime strips: `public/games/shadow-runner/sprites/strips/barrel-roller-v1-5f-128.png` and `public/games/shadow-runner/sprites/strips/barrel-roller-v1-5f-192.png`
  - frames: `public/games/shadow-runner/sprites/frames/barrel-roller-v1/*.png`
  - preview: `public/games/shadow-runner/sprites/previews/barrel-roller-v1-5f-preview.png`
  - note: generated as a non-humanoid object/trap enemy so it cannot read as
    the Shadow Runner hero.
- Batch contact sheet:
  `public/games/shadow-runner/level-assets/level-3/batch-3-ivy-viaduct-contact-sheet.png`

### 2026-06-11 Batch 4 Bell Tower Archives

- Bell Tower Archives gameplay background:
  - source: `public/games/shadow-runner/level-assets/level-4/background/bell-tower-archives-background-source.png`
  - optimized background: `public/games/shadow-runner/level-assets/level-4/background/bell-tower-archives-background.webp`
- Bell Tower Archives props and hazard source sheet:
  - source: `public/games/shadow-runner/level-assets/level-4/props/bell-tower-archives-props-hazards-v1-source.png`
  - transparent sheet: `public/games/shadow-runner/level-assets/level-4/props/bell-tower-archives-props-hazards-v1-transparent.png`
  - includes tower ledges, narrow wall platforms, bell platform, ladders,
    chains, archive shelves, scroll piles, sealed-letter and message pedestals,
    forged-order scroll, archive seal, arrow-slit hazards, projectile arrows,
    impact sparks, candle stand, bell rope, window slit, purple archive banner,
    and wood supports.
- Bell Tower Archives level-select thumbnail:
  - source: `public/games/shadow-runner/level-assets/level-4/ui/bell-tower-archives-thumbnail-source.png`
  - runtime options: `public/games/shadow-runner/level-assets/level-4/ui/bell-tower-archives-thumbnail-320x180.webp` and `public/games/shadow-runner/level-assets/level-4/ui/bell-tower-archives-thumbnail-160x90.webp`
- Scroll Thief v1:
  - source: `public/games/shadow-runner/sprites/raw/scroll-thief-v1-source.png`
  - transparent strip: `public/games/shadow-runner/sprites/transparent/scroll-thief-v1-5f-strip.png`
  - runtime strips: `public/games/shadow-runner/sprites/strips/scroll-thief-v1-5f-128.png` and `public/games/shadow-runner/sprites/strips/scroll-thief-v1-5f-192.png`
  - frames: `public/games/shadow-runner/sprites/frames/scroll-thief-v1/*.png`
  - preview: `public/games/shadow-runner/sprites/previews/scroll-thief-v1-5f-preview.png`
  - note: teal short cape/sash, cream shirt, burgundy trousers, scholar cap,
    visible face, and scroll/satchel-swipe silhouette keep it distinct from the
    Shadow Runner hero.
- Tower Archer v1:
  - source: `public/games/shadow-runner/sprites/raw/tower-archer-v1-source.png`
  - runtime strip: `public/games/shadow-runner/sprites/strips/tower-archer-v1-5f-128.png`
  - preview: `public/games/shadow-runner/sprites/previews/tower-archer-v1-5f-preview.png`
  - note: generated on 2026-06-15 for the harder Bell Tower route as a new
    ranged enemy with idle, ready, aim, release, and hit/defeated frames.
- Moonheart Crest boost and Bell Tower traversal assets:
  - source sheet:
    `public/games/shadow-runner/level-assets/level-4/generated/bell-tower-boost-and-crouch-assets-v1-source.png`
  - Moonheart runtime strip:
    `public/games/shadow-runner/level-assets/level-4/collectibles/moonheart-crest-4f-64.png`
  - Moonheart preview:
    `public/games/shadow-runner/level-assets/level-4/collectibles/moonheart-crest-4f-preview.png`
  - note: generated on 2026-06-15 to make Level 4 feel fresh while keeping the
    same medieval archive palette. Runtime crouch traversal now uses
    low-clearance platforms assembled from Bell Tower slabs, shelves, and
    blocks instead of archway art, so the obstacle reads correctly in 2D. The
    Moonheart Crest is a high-value pickup that restores health, boosts attack
    damage, and grants temporary damage resistance.
- Moonheart boost aura:
  - source:
    `public/games/shadow-runner/level-assets/level-4/generated/bell-tower-boost-aura-v1-source.png`
  - runtime strip:
    `public/games/shadow-runner/level-assets/level-4/vfx/boost-aura-4f-128.png`
  - preview:
    `public/games/shadow-runner/level-assets/level-4/vfx/boost-aura-4f-preview.png`
  - note: generated separately from the pickup sheet so the in-game aura can
    wrap the existing hero sprite without baking a second hero into the VFX.
- Batch contact sheet:
  `public/games/shadow-runner/level-assets/level-4/batch-4-bell-tower-archives-contact-sheet.png`

### 2026-06-11 Batch 5 Candle Fair Ruins

- Candle Fair Ruins gameplay background:
  - source: `public/games/shadow-runner/level-assets/level-5/background/candle-fair-ruins-background-source.png`
  - optimized background: `public/games/shadow-runner/level-assets/level-5/background/candle-fair-ruins-background.webp`
- Candle Fair Ruins props and hazard source sheet:
  - source: `public/games/shadow-runner/level-assets/level-5/props/candle-fair-props-hazards-v1-source.png`
  - transparent sheet: `public/games/shadow-runner/level-assets/level-5/props/candle-fair-props-hazards-v1-transparent.png`
  - includes fair booth platforms, tattered tent pieces, burned planks, candle
    clusters, torch ember strips, swinging lantern positions, lantern chain,
    fake gold/crest/moon-shard pickups, reveal smoke, ember trails, burned
    scrolls, false-route signs, jester mask icon, fair banner scraps, wax
    puddle, and rubble.
- Candle Fair Ruins level-select thumbnail:
  - source: `public/games/shadow-runner/level-assets/level-5/ui/candle-fair-ruins-thumbnail-source.png`
  - runtime options: `public/games/shadow-runner/level-assets/level-5/ui/candle-fair-ruins-thumbnail-320x180.webp` and `public/games/shadow-runner/level-assets/level-5/ui/candle-fair-ruins-thumbnail-160x90.webp`
- Candle Jester v1:
  - source: `public/games/shadow-runner/sprites/raw/candle-jester-v1-source.png`
  - transparent strip: `public/games/shadow-runner/sprites/transparent/candle-jester-v1-5f-strip.png`
  - runtime strips: `public/games/shadow-runner/sprites/strips/candle-jester-v1-5f-128.png` and `public/games/shadow-runner/sprites/strips/candle-jester-v1-5f-192.png`
  - frames: `public/games/shadow-runner/sprites/frames/candle-jester-v1/*.png`
  - preview: `public/games/shadow-runner/sprites/previews/candle-jester-v1-5f-preview.png`
  - note: cream mask, red-and-gold jester cap, red/gold motley tunic, curled
    shoes, candle wand, and fake coin silhouette keep it distinct from the
    Shadow Runner hero.
- Batch contact sheet:
  `public/games/shadow-runner/level-assets/level-5/batch-5-candle-fair-ruins-contact-sheet.png`

## Lore-Driven Missing Assets By Map

This list comes from `docs/SHADOW_RUNNER_STORY_LORE.md`, especially the
10-map campaign table. It separates assets we have only as concept/reference
from production-ready transparent strips, backgrounds, runtime tiles, and UI.

Status key:

- **Generated** means saved in the repo but not necessarily wired into gameplay.
- **Concept-only** means visible in concept art but not production sliced.
- **Missing** means no production image exists in the repo yet.

### Campaign-Wide Missing Packs

- [ ] **Gameplay background/parallax system for all maps**
  - Current state: Map 1 gameplay reuses the title background. Maps 2 and 3
    have generated background plates saved but not wired into gameplay. Maps
    4-10 have no production gameplay backgrounds yet.
  - Generate per map: sky, far background, midground route, foreground
    silhouettes, and optional haze/light layer.
  - Suggested path shape:
    `public/games/shadow-runner/level-assets/level-N/background/*.webp`

- [ ] **Level-specific terrain palettes for maps 2-10**
  - Need: map-specific platform sheets and/or tile atlases for rooftops, mossy
    stone, tower interiors, fair ruins, gearvault metal, caverns, chase roads,
    keep walls, and the final spire.
  - Runtime decision still open: strict tile atlas, large platform chunks, or
    both.

- [ ] **Level-select art for the 10-map campaign**
  - Current state: generated full-screen campaign map background with live
    dotted route markers, plus ten individual location-button assets. Maps 1-5
    use generated level art; Maps 6-10 currently use campaign-map landmark
    crops until those full map packs exist.
  - Need: completion seal marker, perfect-run purple crest, moon-shard glint,
    and final landmark-specific marker variants for Maps 6-10.
  - Suggested detail art: 160 x 90 or 320 x 180 source, exported down for
    phone UI only when a level detail surface is added.

- [ ] **Mission and completion lore objects**
  - Need: sealed letter, wax seal stamp, decoded line plaque, route seal, final
    delivery pedestal, and optional letter-fragment reveal frame.

- [ ] **Hidden-collectible family**
  - Need: purple crest coin, moon shard, bonus scroll, rare pickup sparkle, and
    completion icons for each.

- [ ] **Shared checkpoint and route language**
  - Need: checkpoint banners, route markers, direction signs, message
    pedestals, locked gates, gate-open sparkle, and broken-route warning props.

### Map 1 - East Gate Run

Lore hook: basic route, coins, spikes, double jump, first Clockwork Sentry, and
the east gate.

Have or generated:

- **Generated:** Clockwork Sentry v2 strip.
- **Generated:** stone ruins platform/chunk sheet.
- **Generated:** gold coin pickup strip.
- **Generated:** floor spikes.
- **Generated:** east gate finish marker.
- **Generated:** landing dust and sword slash VFX.
- **Generated:** tilt bridge runtime asset.
- **Generated:** Map 1 level-select thumbnail in 320 x 180 and 160 x 90.

Still missing:

- [ ] Gameplay background/parallax set for the east gate route.
- [ ] Strict 32 x 32 stone terrain tile atlas, if tilemap-first runtime is used.
- [ ] Player-hit stars or invulnerability shimmer.
- [ ] Defeat dust variant separate from landing dust, if desired.
- [ ] Map 1 completion seal.
- [ ] Sealed-letter completion stamp for "East Gate opened."

### Map 2 - Lantern Market Roofs

Lore hook: rooftop jumps, lantern hazards, first bandit scouts, and stolen
sealed letters sold by lantern light.

Have or generated:

- **Generated:** Lantern Market gameplay background source and optimized WebP.
- **Generated:** rooftop/market prop sheet with roof tiles, chimneys, ledge
  caps, lanterns, brazier, banner, awning, sealed-letter crate, route-token
  table, signpost, rope line, and rubble.
- **Generated:** Lantern Bandit Scout v1 production strip and frames.
- **Generated:** Map 2 level-select thumbnail in 320 x 180 and 160 x 90.

Still missing:

- [ ] True split parallax layers for sky, distant city, mid rooftops, foreground
  roof silhouettes, and warm lantern layer.
- [ ] Individual sliced rooftop terrain pieces from the generated source sheet,
  if the runtime does not use the sheet directly.
- [ ] Lantern hazard runtime strips: swinging lantern, break state, spark VFX,
  and optional fire-drop frame.
- [ ] Torch brazier flame variant separated from the static prop sheet.
- [ ] Purple crest coin introduction art, if this map starts challenge coins.
- [ ] Locked/unlocked parchment state for the Map 2 level-select tile.

### Map 3 - Ivy Viaduct

Lore hook: mossy platforms, crumbling bridges, spike pits, moving/falling
stones, and the physical collapse of the Relay roads.

Have or generated:

- **Generated:** Ivy Viaduct gameplay background source and optimized WebP.
- **Generated:** mossy viaduct terrain/hazard source sheet with cracked blocks,
  vine overlays, wet ledges, arch blocks, crumbling bridge plank states,
  falling-stone pieces, pit markers, spike-pit dressing, route marks, dust, and
  broken banner.
- **Generated:** Barrel Roller v1 trap-enemy strip and frames.
- **Generated:** Map 3 level-select thumbnail in 320 x 180 and 160 x 90.

Still missing:

- [ ] True split parallax layers for sky, far arches, mid viaduct, foreground
  ledges, and damp haze/waterfall accents.
- [ ] Individual sliced terrain/hazard pieces from the generated source sheet,
  if the runtime does not use the sheet directly.
- [ ] Moving/falling stone platform runtime strip or state slices.
- [ ] Crumbling bridge runtime strip or break-state slices.
- [ ] Moon-shard slot indicator and hidden-shard UI state for the level-select
  tile.

### Map 4 - Bell Tower Archives

Lore hook: vertical climbs, arrow slits, scroll pickups, thief ambushes, and
the first proof that the lockdown order was forged.

Have or generated:

- **Generated:** Bell Tower Archives gameplay background source and optimized
  WebP.
- **Generated:** props/hazards source sheet with tower ledges, wall platforms,
  bell platform, ladders, chains, archive shelves, scroll piles, pedestals,
  forged-order scroll, archive seal, arrow-slit hazards, projectile arrows,
  impact sparks, candle stand, bell rope, window slit, banner, and wood
  supports.
- **Generated:** Scroll Thief v1 production strip and frames.
- **Generated:** Map 4 level-select thumbnail in 320 x 180 and 160 x 90.

Still missing:

- [ ] True split parallax layers for moonlit exterior, deep tower interior,
  archive shelves, foreground stone, and candlelight overlays.
- [ ] Individual sliced terrain/hazard pieces from the generated source sheet,
  if the runtime does not use the sheet directly.
- [ ] Tower Archer production strip if arrow-slit hazards become active
  enemies instead of only trap props.
- [ ] Bell swing or bell-rope interactive animation, if used in level scripting.
- [ ] Archive-seal completion icon and locked/unlocked level-select tile state.

### Map 5 - Candle Fair Ruins

Lore hook: trick hazards, fake pickups, swinging lanterns, and jester enemies
spreading false signals.

Have or generated:

- **Generated:** Candle Fair Ruins gameplay background source and optimized
  WebP.
- **Generated:** props/hazards source sheet with fair booth platforms, tattered
  tent pieces, burned planks, candles, ember strips, swinging lantern positions,
  fake pickups, reveal smoke, ember trails, burned scrolls, false-route signs,
  jester mask icon, fair banners, wax puddle, and rubble.
- **Generated:** Candle Jester v1 production strip and frames.
- **Generated:** Map 5 level-select thumbnail in 320 x 180 and 160 x 90.

Still missing:

- [ ] True split parallax layers for moonlit sky, ruined fair midground,
  foreground booths, lantern lines, and candlelight overlays.
- [ ] Individual sliced terrain/hazard pieces from the generated source sheet,
  if the runtime does not use the sheet directly.
- [ ] Swinging lantern runtime strip with collision-safe frame bounds.
- [ ] Fake pickup reveal/runtime smoke strip separated from the source sheet.
- [ ] Torch ember and wax puddle runtime slices.
- [ ] Locked/unlocked level-select tile state.

### Map 6 - Gearvault Causeway

Lore hook: clockwork platforms, stronger sentries, pressure plates, levers, and
guard machines following corrupted route commands.

Still missing:

- [ ] Gearvault Causeway gameplay background/parallax set.
- [ ] Gearvault terrain: metal-stone causeway tiles, gear rims, machine blocks,
  chain posts, and piston columns.
- [ ] Shield Squire production strip.
- [ ] Clockwork Sentry Guard variant or upgrade strip.
- [ ] Lever, pressure plate, and clockwork switch props.
- [ ] Clockwork platform art: moving gear platform, piston lift, gear teeth, and
  powered/off state variants.
- [ ] Mechanical sparks, pressure-plate flash, and lever activation VFX.
- [ ] Map 6 level-select thumbnail and gear-lock completion icon.

### Map 7 - Moonshard Hollow

Lore hook: cavern-like ruins, mushroom brigands, hidden moon shards, optional
rooms, and lost route memories.

Still missing:

- [ ] Moonshard Hollow gameplay background/parallax set.
- [ ] Cavern terrain: moon-glass rock, hollow ledges, crystal clusters,
  mushroom platforms, secret-room doors, and soft cave silhouettes.
- [ ] Mushroom Brigand production strip.
- [ ] Moon shard collectible and 10-shard completion icon.
- [ ] Bonus scroll pickup and hidden-room reveal sparkle.
- [ ] Moon-glass memory VFX: glint, route-line reveal, and shard collected
  burst.
- [ ] Optional-room entrance props and hidden wall variants.
- [ ] Map 7 level-select thumbnail and moon-shard collected state.

### Map 8 - The Rival's Road

Lore hook: chase/race map, dash hazards, mounted rival encounter, stolen final
route seal, and fast route tokens.

Still missing:

- [ ] Rival's Road gameplay background/parallax set.
- [ ] Chase-route terrain: long road pieces, speed ramps, narrow bridge
  sections, hazard gates, and shortcut lane markers.
- [ ] Rival Messenger mini-boss production set.
- [ ] Rival encounter rig or mount/vehicle silhouette, if the mounted encounter
  stays in the design.
- [ ] Dash hazard art: warning stripe, active dash trail, collision spark, and
  cooldown/off state.
- [ ] Fast route token collectible and crest coin variant.
- [ ] Stolen route seal prop and steal/recover VFX.
- [ ] Rival dash trail, lunge slash, taunt portrait, and victory/defeat poses.
- [ ] Map 8 level-select thumbnail and route-seal completion icon.

### Map 9 - Captain's Keep

Lore hook: boss climb, guard waves, shielded captain duel, locked gates, and
the reveal that the Captain sealed the Relay to contain a false command.

Still missing:

- [ ] Captain's Keep gameplay background/parallax set.
- [ ] Keep terrain: interior stone walls, tower exterior ledges, guard stairs,
  boss-climb platforms, locked gate frames, and checkpoint banner posts.
- [ ] Moonlit Captain boss production set.
- [ ] Guard-wave enemy variants, likely Shield Squire and upgraded sentry
  palette/state extensions.
- [ ] Boss arena gate, locked gate variants, and gate-lock break VFX.
- [ ] Captain slash, shield bash, block shimmer, stunned stars, and defeat dust.
- [ ] Checkpoint banner full set and wave-start warning art.
- [ ] Captain face detail or portrait for intro/completion UI.
- [ ] Map 9 level-select thumbnail and captain-lock completion icon.

### Map 10 - Dawn Relay Spire

Lore hook: finale map, mixed mechanics, Sentry Chief boss, timed final delivery,
and restoration of the Relay by dawn.

Still missing:

- [ ] Dawn Relay Spire gameplay background/parallax set.
- [ ] Final spire terrain: relay-machine platforms, high tower ledges, dawn sky
  layers, moon-glass machinery, and master-lock arena floor.
- [ ] Clockwork Sentry Chief boss production set.
- [ ] Mixed-mechanic prop set that reuses and upgrades prior map hazards:
  lanterns, pressure plates, bridge breaks, dash gates, and spike variants.
- [ ] Timed-delivery UI art: dawn clock, route countdown, final warning plaque.
- [ ] Relay brazier, final delivery pedestal, master lock, and moon-shard
  socket props.
- [ ] Boss VFX: guard mode, heavy spear thrust, lock pulse, mechanical debris,
  master-lock break, and relay restoration burst.
- [ ] Ending art: dawn relay restored banner, final letter stamp, and optional
  true-ending moon-shard reveal.
- [ ] Map 10 level-select thumbnail and final completion seal.

### Concept-Only Enemies Not Yet Assigned To A Production Map

These appear in planning/concept material but still need a final gameplay home
or can be used as optional variants.

- [ ] Barrel Roller trap/enemy.
  - Good fit: Lantern Market, Ivy Viaduct, or Candle Fair.
  - Need: idle, roll, charge, stunned, broken, and barrel impact VFX.
- [ ] Broom Golem Sweeper.
  - Good fit: Bell Tower Archives, Candle Fair, or Gearvault cleanup rooms.
  - Need: idle, move, sweep attack, hit, defeated, and sweep dust strip.
- [ ] Tower Archer.
  - Good fit: Bell Tower Archives and Captain's Keep guard waves.
  - Need: idle, aim, shoot, hit, defeated, arrow projectile, and impact spark.

## Runtime Placeholders To Replace First

These are the highest-confidence missing images because current playable code
draws them with Phaser graphics or reuses title art.

### P0 - Level 1 Image Replacements

- [x] **Clockwork Sentry full recreation**
  - Current state: the damaged first-pass `clockwork-sentry-6f-128.png` has
    been replaced by `clockwork-sentry-v2-6f-128.png` in the current working
    tree manifests.
  - Generated: clean transparent strip from scratch, not a patch over the
    damaged file.
  - Included states: idle, patrol A, patrol B, spear thrust, hit/stunned, and
    defeated.
  - Requirements met in source pass: 128 x 128 frames, bottom-center anchor, no
    labels, no white matte gaps, consistent scale, readable spear/shield
    silhouette, matching Shadow Runner hero style.
  - Suggested files:
    - `public/games/shadow-runner/sprites/raw/clockwork-sentry-v2-source.png`
    - `public/games/shadow-runner/sprites/transparent/clockwork-sentry-v2-6f-strip.png`
    - `public/games/shadow-runner/sprites/strips/clockwork-sentry-v2-6f-128.png`
    - `public/games/shadow-runner/sprites/previews/clockwork-sentry-v2-6f-preview.png`

- [ ] **Level 1 gameplay background and parallax set**
  - Current state: `createBackground()` reuses the title background as a fixed
    sky plate.
  - Generate: side-scrolling castle-ruins gameplay background for a 2240 x 540
    world, plus optional layers for sky/moon, far castle, mid ruins, foreground
    silhouettes, and ground haze.
  - Suggested files:
    - `public/games/shadow-runner/level-assets/level-1/background/sky.webp`
    - `public/games/shadow-runner/level-assets/level-1/background/far-ruins.webp`
    - `public/games/shadow-runner/level-assets/level-1/background/mid-ruins.webp`
    - `public/games/shadow-runner/level-assets/level-1/background/foreground.webp`

- [ ] **Stone terrain tileset**
  - Current state: Level 1 uses cropped visuals from
    `stone-ruins-terrain-v1.png`; `shadow-runner-stone` remains only as a
    fallback. A strict tilemap atlas is still open.
  - Generate: 32 x 32 transparent tiles matching the concept sheet: stone
    walkway top, cracked stone, mossy edge, left ledge cap, right ledge cap,
    underside blocks, arch background blocks, and broken wall blocks.
  - Suggested runtime form: PNG atlas plus WebP preview/contact sheet.
  - Suggested files:
    - `public/games/shadow-runner/level-assets/terrain/stone-tileset-32.png`
    - `public/games/shadow-runner/level-assets/terrain/stone-tileset-preview.png`
    - `public/games/shadow-runner/level-assets/terrain/stone-tileset-manifest.json`
  - Batch 1 note: generated `stone-ruins-terrain-v1.png` as a platform/chunk
    sheet. A strict 32 x 32 tile atlas is still open if the runtime moves to a
    tilemap-first level builder.

- [x] **Walkway platform and ledge trims**
  - Current state: Level 1 platforms are visually skinned with cropped
    platform/chunk art from `stone-ruins-terrain-v1.png`.
  - Generate: long top-walkway pieces, underside pieces, edge caps, mossy
    overlays, rubble end caps, and broken-gap trim pieces.
  - Use cases: `west-walkway`, `broken-step-a`, `broken-step-b`,
    `center-walkway`, `east-ledge`, and `upper-coin-shelf`.

- [ ] **Tilt bridge / wobble platform**
  - Current state: generated `tilt-bridge-v1-256x80.png` is wired in runtime
    and aligned to the collision platform. The rectangular
    `shadow-runner-tilt-stone` remains a fallback only.
  - Generate: short floating stone platform, crumbling bridge plank, or chain
    bridge variant with bottom-center or center anchor.
  - Gameplay direction: later levels should use more aggressive tilt angles,
    faster wobble timing, and pits or spikes on either side so the bridge can
    eventually dump the player off if they wait too long.
  - Suggested files:
    - `public/games/shadow-runner/level-assets/platforms/tilt-bridge.png`
    - `public/games/shadow-runner/level-assets/platforms/tilt-bridge-damaged.png`

- [x] **Spike hazard strip**
  - Current state: `shadow-runner-spike-row` is wired to
    `floor-spikes-64x28.png`.
  - Generate: floor spike strip matching the concept sheet, with repeatable
    32 px and 64 px variants for `pit-spikes` and `sentry-spikes`.
  - Suggested files:
    - `public/games/shadow-runner/level-assets/hazards/floor-spikes-32.png`
    - `public/games/shadow-runner/level-assets/hazards/floor-spikes-64.png`
    - `public/games/shadow-runner/level-assets/hazards/floor-spikes-endcaps.png`

- [x] **In-world coin pickup animation**
  - Current state: in-level `shadow-runner-coin` is wired to the generated
    `gold-coin-8f-48.png` sprite strip. The HUD coin icon remains separate.
  - Generate: 6 to 8 frame spinning gold coin strip, transparent, readable at
    roughly 28 x 28 to 36 x 36 runtime size.
  - Suggested files:
    - `public/games/shadow-runner/level-assets/collectibles/gold-coin-8f-32.png`
    - `public/games/shadow-runner/level-assets/collectibles/gold-coin-preview.png`

- [x] **East gate / finish marker**
  - Current state: the finish gate is three rectangles in `createLevel()`.
  - Generate: level-end locked gate, moonlit east gate, and/or purple banner
    post marker sized for the existing finish rectangle.
  - Suggested files:
    - `public/games/shadow-runner/level-assets/props/east-gate.png`
    - `public/games/shadow-runner/level-assets/props/level-end-banner-post.png`
    - `public/games/shadow-runner/level-assets/props/gate-open-sparkle-4f.png`

- [x] **Landing dust and defeat dust strip**
  - Current state: `addDustPuff()` uses a fading Phaser circle.
  - Generate: 4 to 6 frame dust puff strip for landing, double jump, respawn,
    and enemy defeat.
  - Suggested files:
    - `public/games/shadow-runner/level-assets/vfx/landing-dust-6f-64.png`
    - `public/games/shadow-runner/level-assets/vfx/defeat-dust-6f-64.png`

- [x] **Sword slash VFX strip**
  - Current state: sword arc is drawn with `Graphics.arc()`.
  - Generate: 4 to 6 frame crescent slash strip that matches the hero attack
    timing and can be flipped for left-facing attacks.
  - Suggested file:
    - `public/games/shadow-runner/level-assets/vfx/sword-slash-6f-96.png`

- [ ] **Player damage / invulnerability feedback**
  - Current state: damage feedback uses a tint.
  - Generate: small star stun, shield shimmer, or impact glint frames that can
    sit over the hero without changing collision.
  - Suggested files:
    - `public/games/shadow-runner/level-assets/vfx/player-hit-stars-4f-64.png`
    - `public/games/shadow-runner/level-assets/vfx/invulnerability-shimmer-4f-96.png`

## Hero Sprite Work Still Needed

Current hero strips are good enough for prototype timing, but the sprite docs
call them first-pass review assets. These should be regenerated or cleaned
before a more public build.

- [ ] **Hero model sheet / style lock**
  - Generate a stable transparent reference sheet for the shadow knight
    messenger: hooded dark cloak, gray armor, glowing gold eyes, sword, and
    messenger satchel.
  - Include front, side, three-quarter, and gameplay side pose.

- [ ] **Gameplay idle strip**
  - Current state: gameplay idle uses the menu-idle cape strip.
  - Generate: right-facing 4 to 6 frame idle strip with minimal movement and a
    bottom-center anchor.

- [ ] **Run strip v2**
  - Current state: usable, but sword and cloak need stabilization.
  - Generate: 6 to 8 consistent right-facing frames with stable sword, satchel,
    hood, and foot contact points.

- [ ] **Jump / fall / land split**
  - Current state: one `jump-air` strip covers takeoff, rise, apex, double jump,
    falling, and landing.
  - Generate:
    - takeoff strip
    - rising/apex/fall frames
    - landing strip without baked dust
    - separate double-jump VFX strip

- [ ] **Crouch strip**
  - Current state: crouch changes collision and speed but does not change the
    hero sprite.
  - Generate: 2 to 4 frame crouch/duck strip, right-facing, bottom-center.

- [ ] **Sword attack v2**
  - Current state: readable, but one follow-through frame turns the hero away
    from the gameplay-facing direction.
  - Generate: 5 to 6 frame consistent ground slash, with slash VFX separated or
    supplied as a paired strip.

- [ ] **Hurt / knockback strip**
  - Current state: damage uses tint plus velocity.
  - Generate: 3 to 4 frame hurt/stagger strip.

- [ ] **Respawn / defeat strip**
  - Current state: player respawns at start after health reaches zero; no death
    or respawn art exists.
  - Generate: small defeat collapse and respawn poof/stand-up strip.

- [ ] **Victory / level-clear pose**
  - Current state: level completion is a DOM overlay only.
  - Generate: 4 frame victory or banner-raise pose for future finish feedback.

## Enemy And Boss Assets Still Needed

Only the Clockwork Sentry currently exists as a production runtime strip. The
concept sheets provide the rest of the enemy roster, but they are not final
transparent sprite strips.

### P1 - Improve Current Enemy

- [x] **Clockwork Sentry implementation swap**
  - Current state: `src/features/games/shadow-runner/assets/manifest.ts` and
    `public/games/shadow-runner/sprites/sprite-manifest.json` point at the v2
    strip in the current working tree.
  - Remaining: run browser gameplay QA and keep the damaged first-pass strip as
    source/reference only.

- [ ] **Clockwork Sentry attack VFX**
  - Generate: spear jab spark or thrust streak that can be layered during the
    attack frame.

### P2 - Regular Enemy Production Strips

- [ ] **Lantern Bandit Scout**
  - States: idle, move, attack, hit, defeated.
  - Notes: hooded scout with lantern and dagger; likely first stealth enemy.

- [ ] **Mushroom Brigand**
  - States: idle, move, attack, hit, defeated.
  - Notes: whimsical mushroom-cap enemy; useful for lighter castle-garden areas.

- [ ] **Barrel Roller trap**
  - States: idle, roll/move, charge attack, stunned, broken.
  - Notes: can double as a trap/hazard and enemy.

- [ ] **Shield Squire**
  - States: idle, move, block/attack, hit, defeated.
  - Notes: shielded guard for teaching attack timing.

- [ ] **Scroll Thief**
  - States: idle, move, dash attack, hit, defeated.
  - Notes: fast messenger-like enemy, good for mid-level pressure.

- [ ] **Candle Jester**
  - States: idle, move, trick attack, hit, defeated.
  - Notes: also appears on the villain pose sheet with richer fire-trick states.

- [ ] **Broom Golem Sweeper**
  - States: idle, move, sweep attack, hit, defeated.
  - Notes: broad floor-control enemy.

- [ ] **Tower Archer**
  - States: idle, aim/move, shoot attack, hit, defeated.
  - Notes: ranged enemy; also requires projectile arrows and impact VFX.

### P3 - Mini-Boss And Boss Strips

- [ ] **Rival Messenger mini-boss**
  - States from pose sheet: front idle, side idle, run, jump, lunge attack,
    special dash, hit/stunned, defeated, victory/taunt, face detail.
  - Suggested frame counts: 4, 4, 8, 6, 6, 8, 3, 3, 4.

- [ ] **Moonlit Captain boss**
  - States from pose sheet: front idle, side idle, run, jump, slash attack,
    shield bash special, hit/stunned, defeated, victory/taunt, face detail.
  - Suggested frame counts: 4, 4, 8, 6, 6, 8, 3, 5, 4.

- [ ] **Clockwork Sentry Chief boss**
  - States from pose sheet: front idle, side idle, run, jump, thrust attack,
    guard-mode special, hit/stunned, defeated, victory/taunt, face detail.
  - Suggested frame counts: 4, 4, 8, 6, 6, 8, 3, 5, 4.

- [ ] **Candle Jester expanded enemy/boss variant**
  - States from pose sheet: front idle, side idle, run, jump, wave attack,
    fire-trick special, hit/stunned, defeated, victory/taunt, face detail.
  - Suggested frame counts: 4, 4, 8, 6, 6, 8, 3, 5, 4.

## Collectibles, Props, And Interactive Objects

Concept-sheet items that are not yet production runtime assets.

### Collectibles

- [ ] Purple crest coin
- [ ] Sealed letter
- [ ] Moon shard
- [ ] Health heart pickup
- [ ] Torch ember
- [ ] Bonus scroll
- [ ] Pickup sparkle variants for rare collectibles

### Interactive Props

- [ ] Checkpoint banner
- [ ] Locked gate
- [ ] Lever
- [ ] Pressure plate
- [ ] Torch brazier for gameplay levels
- [ ] Message pedestal
- [ ] Level-end banner post
- [ ] Small foreground rubble clusters
- [ ] Moss/vine overlays for ruins
- [ ] Direction sign or parchment marker for tutorial prompts

### Hazards And Traps

- [ ] Retracting spikes
- [ ] Rolling barrel hazard
- [ ] Arrow slit wall hazard
- [ ] Swinging lantern hazard
- [ ] Collapsing stone hazard
- [ ] Shallow pit marker
- [ ] Projectile arrow strip
- [ ] Projectile impact spark

### Platform Variants

- [ ] Short moving platform
- [ ] Falling platform
- [ ] Crumbling bridge plank
- [ ] Swinging chain platform
- [ ] Small floating stone
- [ ] Arch background blocks
- [ ] Broken wall blocks

## UI And Menu Images Still Needed

- [ ] **Pressed/focused/disabled button variants**
  - Current state: title, options, pause, confirm, and level-complete buttons
    use the same blank button art plus live labels/icons.
  - Generate: normal, pressed, focused, disabled, and danger row variants for
    menu buttons.

- [ ] **Final Levels screen art**
  - Current state: Select Level opens the generated 10-stop campaign map with
    mission detail popups, locked/completed states, and square thumbnail frames.
  - Generate: final map-state variants, completion crest icons, alternate
    locked/complete treatments, and future route thumbnail frames.

- [ ] **Pixel-art menu icons**
  - Current state: menu controls use Lucide icons.
  - Generate optional pixel-art replacements for start sword, levels castle,
    options gear, music on/off, sound on/off, pause, resume, restart, home, and
    exit.

- [ ] **Rotate-phone gate art**
  - Current state: rotate gate is text-only over black.
  - Generate optional sideways phone silhouette or rotate glyph in Shadow
    Runner style.

- [ ] **Star atlas cleanup**
  - Current state: runtime uses the star sheet, but notes say final explicit
    atlas regions are still needed.
  - Generate or slice: clean 4 x 3 atlas with documented regions.

- [ ] **Torch strip cleanup**
  - Current state: normalized runtime torch strip exists, but the original width
    was not evenly divisible by 8.
  - Generate or confirm: clean 8-frame equal-slot strip with fixed base and
    bottom-center anchor.

## Generation Standards

- Use transparent PNG for sprites, props, VFX, and UI cutouts.
- Preserve source images under a `generated/` or `raw/` folder.
- Export runtime-ready optimized WebP only for non-sprites or static UI where
  alpha and loading behavior are verified.
- Keep sprite frames 128 x 128 unless the target calls for smaller VFX or
  32 x 32 terrain tiles.
- Keep gameplay actors bottom-center anchored.
- Make every enemy visibly different from the Shadow Runner hero. Avoid
  player-like dark hood/cape silhouettes unless the character is intentionally a
  rival runner. At minimum, give each enemy a distinct cape/scarf color,
  faction palette, head shape, posture, and weapon/tool silhouette.
- Keep runtime strips free of labels, frame numbers, borders, and baked text
  unless the asset is intentionally a title/banner.
- Create a preview/contact sheet for every batch.
- Update `src/features/games/shadow-runner/assets/manifest.ts` when an asset is
  wired into runtime.
- Update the relevant doc after each batch:
  - home/menu work: `docs/SHADOW_RUNNER_HOME_ASSETS.md`
  - gameplay/HUD/VFX work: `docs/SHADOW_RUNNER_GAMEPLAY_ASSETS.md`
  - hero/enemy strips: `docs/SHADOW_RUNNER_SPRITES.md`

## Recommended Next Generation Batches

### Batch 1 - Replace Current Level 1 Placeholders

Most image generation from this batch is complete in the current working tree.
Remaining work is Level 1 background art, optional strict tile-atlas work, a
player damage feedback strip, and future runtime slices for any strict tilemap
path.

1. [x] Clockwork Sentry full recreation.
2. [ ] Strict 32 x 32 stone terrain tileset, if tilemap-first runtime is used.
3. [x] Walkway/ledge trims.
4. [x] Tilt bridge platform.
5. [x] Spike hazard strip.
6. [x] In-world coin pickup strip.
7. [x] East gate / finish marker.
8. [x] Landing dust strip.
9. [x] Sword slash strip.
10. [ ] Level 1 gameplay background/parallax set.
11. [ ] Player-hit or invulnerability feedback strip.

### Batch 2 - Hero Cleanup

Generate the stable hero model sheet, gameplay idle, run v2, crouch, sword
attack v2, hurt, respawn/defeat, and victory strips.

### Batch 3 - Enemy Expansion

With the recreated Clockwork Sentry in place, generate Lantern Bandit Scout,
Barrel Roller, Shield Squire, Scroll Thief, and Tower Archer as the most
gameplay-useful next enemies.

### Batch 4 - Level Atmosphere And UI Polish

Generate parallax gameplay backgrounds, checkpoint/prop packs, level-select UI,
button states, rotate-gate art, and cleaned star/torch atlases.

### Batch 5 - Map 2 Playable Expansion

Generate Lantern Market Roofs as the first post-prototype map pack:
background/parallax layers, rooftop terrain, Lantern Bandit Scout strip,
lantern hazards, torch brazier, stolen-letter props, and Map 2 level-select
thumbnail.

### Batch 6 - Route Collapse And Archive Maps

Generate Ivy Viaduct and Bell Tower Archives support assets: mossy viaduct
backgrounds, crumbling bridge/falling stone pieces, tower/archive background,
Scroll Thief strip, arrow-slit hazard, projectile arrow, message pedestal, and
sealed-letter/archive props.

### Batch 7 - Trick And Machine Maps

Generate Candle Fair Ruins and Gearvault Causeway support assets: Candle Jester
strip, fake pickup variants, swinging lanterns, fair props, gearvault terrain,
Shield Squire strip, upgraded sentry guard variant, levers, pressure plates, and
clockwork platforms.

### Batch 8 - Secrets And Rival Chase

Generate Moonshard Hollow and The Rival's Road support assets: cavern/moon-glass
backgrounds, Mushroom Brigand strip, moon shard, bonus scroll, secret-room
props, chase-road terrain, Rival Messenger mini-boss set, dash hazards, fast
route tokens, and route seal props.

### Batch 9 - Boss Keep And Finale

Generate Captain's Keep and Dawn Relay Spire support assets: Moonlit Captain
boss set, Clockwork Sentry Chief boss set, keep/spire backgrounds, checkpoint
banners, locked gate variants, timed-delivery UI, relay brazier, final delivery
pedestal, master lock, restoration VFX, and ending banner art.

## Open Decisions

- Which enemy after Clockwork Sentry should become the second implemented enemy?
- Should Level 1 use the castle-ruin theme from the title background or a darker
  side-scrolling interior/rooftop variant?
- Should generated terrain be tilemap-first, large hand-painted chunks, or both?
- Should the current HUD remain DOM-rendered over art, or move more HUD elements
  into Phaser for future effects?
- Should the Levels button stay hidden/disabled until multiple levels exist, or
  get placeholder level-select art now?
