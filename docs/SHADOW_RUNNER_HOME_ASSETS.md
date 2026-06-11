# Shadow Runner Home Screen Assets

Status: current title/menu asset pack for the private playable prototype.

The home-screen asset pack from the Desktop has been copied into:

`public/games/shadow-runner/home-assets/`

The Desktop source remains untouched:

`C:/Users/tayle/OneDrive/Desktop/Shadow Runner Home Assets`

## Contents

| Asset | Repo Path | Notes |
| --- | --- | --- |
| Picker banner | `public/games/shadow-runner/shadow-runner-picker-banner.webp` | Entertainment picker card image generated to match the home screen branding. |
| Music | `public/games/shadow-runner/audio/castle-bard.mp3` | Background music started from the Entertainment picker click. |
| Background plate | `public/games/shadow-runner/home-assets/assets/background/bg_title_castle_night_clean.png` | Strong moonlit castle layout with room for title, hero, and menu. |
| Title scroll | `public/games/shadow-runner/home-assets/assets/ui/ui_title_scroll_shadow_runner.png` | Baked `SHADOW RUNNER` title, readable and correctly spelled. |
| Runtime title scroll | `public/games/shadow-runner/home-assets/sliced/title-scroll-shadow-runner.png` | Trimmed title scroll used by the live home screen to avoid transparent padding taking layout space. |
| Bottom menu scroll | `public/games/shadow-runner/home-assets/assets/ui/ui_bottom_menu_scroll.png` | Baked `START`, `LEVELS`, and `OPTIONS` menu. |
| Runtime bottom menu scroll | `public/games/shadow-runner/home-assets/sliced/bottom-menu-scroll.png` | Trimmed menu strip used by the live home screen for tighter button areas on landscape phones. |
| Runtime blank menu scroll | `public/games/shadow-runner/home-assets/optimized/blank-menu-scroll.webp` | Blank scroll used by the title menu and private-build access gate so labels and controls can be rendered live. |
| Runtime blank menu button | `public/games/shadow-runner/home-assets/optimized/blank-menu-button.webp` | Blank row/button panel used for live Start, Levels, and Options hit targets. |
| Runtime campaign map | `public/games/shadow-runner/home-assets/optimized/campaign-map.webp` | Generated full-screen parchment world map used by the campaign level-select route screen. |
| Runtime campaign map location buttons | `public/games/shadow-runner/home-assets/optimized/map-location-buttons/*.webp` | Ten individual generated location-button assets used as tappable map stops. |
| Runtime level-detail panel | `public/games/shadow-runner/home-assets/optimized/level-detail-panel.webp` | Legacy generated detail panel with baked rectangular thumbnail treatment; retained as source reference but no longer used by the live popup. |
| Runtime level-map scroll panel | `public/games/shadow-runner/home-assets/optimized/level-map-scroll-panel.webp` | Generated blank parchment panel used by the 10-map level-select screen and the current mission detail popup. |
| Runtime square thumbnail frame | `public/games/shadow-runner/home-assets/optimized/level-thumbnail-square-frame.webp` | Generated square frame used for mission detail popup thumbnails. |
| Options scroll panel | `public/games/shadow-runner/home-assets/optimized/options-scroll-panel.webp` | Scroll panel used by title Options and in-game Pause menus. |
| Options row button | `public/games/shadow-runner/home-assets/optimized/options-menu-row-button.webp` | Dedicated row-button asset for scroll-menu actions. |
| Mission scroll stand | `public/games/shadow-runner/home-assets/assets/ui/prop_mission_scroll_stand.png` | Blank foreground prop for mission text or decorative menu staging. |
| Torch strip | `public/games/shadow-runner/home-assets/assets/effects/fx_torch_flame_strip.png` | Intended 8-frame strip, but needs reviewed slicing because the width is not evenly divisible by 8. |
| Runtime torch strip | `public/games/shadow-runner/home-assets/sliced/torch-flame-8f-192.png` | Normalized 8-frame `192 x 192` strip used by the first home screen. |
| Star sheet | `public/games/shadow-runner/home-assets/assets/effects/fx_star_twinkle_sheet.png` | Intended 12-sprite sparkle atlas, but needs explicit atlas regions or cleanup slicing. |
| Purple banners | `public/games/shadow-runner/home-assets/assets/props/prop_purple_banners_sheet.png` | Three decorative banner props. |
| Runtime banner props | `public/games/shadow-runner/home-assets/sliced/banner-*.png` | Automatically sliced banner stand, hanging banner, and pennant. |
| Contact sheet | `public/games/shadow-runner/home-assets/previews/contact_sheet.png` | Fast visual reference for the bundle. |

## Suggested Layer Order

1. Background plate.
2. Star shimmer overlays.
3. Purple banners.
4. Torch or brazier flame.
5. Approved hero menu-idle-cape sprite.
6. Mission scroll stand.
7. Title scroll.
8. Bottom menu scroll.

## Review Notes

- The core direction is strong enough for a title-screen composition pass.
- The live Shadow Runner surface uses the generated picker banner, Castle Bard
  music, animated menu-idle cape strip, normalized torch strip, sparkle sheet,
  sliced banner props, title scroll, mission scroll, blank menu panels, options
  scroll panels, and live React-rendered labels/icons.
- The background has a useful foreground ledge for the hero, but the approved
  hero stance still needs to be placed against it to verify scale and foot
  alignment.
- The title menu now uses blank panels with live Start Tutorial, Select Level,
  and Options controls instead of relying on baked labels for interaction.
- Select Level opens a generated full-screen parchment campaign map with live
  dotted route lines, ten individual location-button assets, a generated blank
  parchment popup, square mission thumbnail frames, and
  locked/unlocked/completed states.
- The torch and star sheets should not be blindly sliced by equal dimensions
  without visual review.
- Raw chroma-key sources are preserved under
  `public/games/shadow-runner/home-assets/raw_chromakey/`.

## Current Runtime Wiring

- Picker entry: `src/features/games/GamesHome.tsx`
- Title/access/rotate gate: `src/features/games/shadow-runner/ShadowRunnerScreen.tsx`
- Playable level shell: `src/features/games/shadow-runner/ShadowRunnerGame.tsx`
- Phaser scene factory: `src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`
- Asset manifest: `src/features/games/shadow-runner/assets/manifest.ts`

The current prototype is intentionally Shadow Runner-scoped: it uses an
in-surface rotate gate and 16:9 playfield sizing instead of changing the global
PWA manifest, viewport, fullscreen state, or browser orientation lock. The
June 9 rollback notes are in
[`docs/PRODUCTION_ROLLBACK_AND_MEDIA_FRAME_FIX_2026-06-09.md`](C:/repos/chat2.0/docs/PRODUCTION_ROLLBACK_AND_MEDIA_FRAME_FIX_2026-06-09.md:1).

## Latest Verification

The June 11 Shadow Runner phone-gameplay pass recorded `npm run lint`,
`npx tsc --noEmit -p tsconfig.app.json`, and `npm run build` as passing, then
captured Chrome-channel mobile checks for landscape `932x430` and `740x390`,
portrait rotate-gate `390x740`, Level 1 and Level 2 finish flows, and the
square mission-detail popup. Artifacts live under
`output/playwright/shadow-runner-goal-20260611-square-frame/`,
`output/playwright/shadow-runner-goal-20260611-postbuild/`, and
`output/playwright/shadow-runner-goal-20260611-routes/`.

## Manifest

Machine-readable details live at:

`public/games/shadow-runner/home-assets/home-assets-manifest.json`
