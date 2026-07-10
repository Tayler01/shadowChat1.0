# Shadow Runner Home Screen Asset Bundle

First-pass production assets for the Shadow Runner landscape home/title screen.

Generated: 2026-06-08  
Scope: home screen background, parchment UI, decorative props, and small effect sprite sheets.  
Excluded: the main character, because Tayler is working on the hero character sheet separately.

## Contents

- `assets/background/` - final opaque background plate.
- `assets/ui/` - final transparent parchment title/menu/mission-scroll UI assets.
- `generated/blank-menu-scroll-imagegen-source.png`, `sliced/blank-menu-scroll.png`, and `optimized/blank-menu-scroll.webp` - generated blank parchment scroll base for the private-build gate and future separated menu buttons.
- `generated/blank-menu-button-imagegen-source.png`, `sliced/blank-menu-button.png`, and `optimized/blank-menu-button.webp` - generated blank parchment button panel for future separate menu controls and tighter hit areas.
- `generated/campaign-map-imagegen-source.png` and `optimized/campaign-map.webp` - generated full-screen parchment world map for the campaign level-select screen.
- `generated/level-detail-panel-imagegen-source.png`, `sliced/level-detail-panel.png`, and `optimized/level-detail-panel.webp` - generated blank parchment popup panel for campaign-map level details.
- `generated/map-location-button-frame-imagegen-source.png`, `sliced/map-location-button-frame.png`, and `optimized/map-location-buttons/*.webp` - generated frame plus ten individual campaign-map location button assets.
- `generated/level-map-scroll-panel-chromakey-source.png`, `sliced/level-map-scroll-panel.png`, and `optimized/level-map-scroll-panel.webp` - generated wide blank parchment panel for the 10-map level-select screen.
- `assets/props/` - final transparent decorative banner props.
- `assets/effects/` - final transparent torch and star animation sheets.
- `raw_chromakey/` - original green-screen files used to create transparent PNGs.
- `previews/` - contact sheet for quick visual review.
- `docs/` - prompt manifest and asset index.

## Suggested Layer Order

1. `assets/background/bg_title_castle_night_clean.png`
2. Optional subtle star shimmer overlays from `assets/effects/fx_star_twinkle_sheet.png`
3. Decorative banners from `assets/props/prop_purple_banners_sheet.png`
4. Torch/brazier animation from `assets/effects/fx_torch_flame_strip.png`
5. Character sprite, once approved
6. `assets/ui/prop_mission_scroll_stand.png`
7. `assets/ui/ui_title_scroll_shadow_runner.png`
8. `assets/ui/ui_bottom_menu_scroll.png`

## Implementation Notes

- Final cutout files are RGBA PNGs with transparent corners.
- Raw `_chromakey` files are preserved in case a cleaner alpha pass is needed later.
- The torch sheet should be sliced into 8 horizontal frames.
- The star sheet should be sliced into 12 small sprites: 3 sizes by 4 shimmer phases.
- The bottom menu is currently a single baked menu asset with START, LEVELS, and OPTIONS included.
- For a more flexible build, create later variants with blank button panels and render text/icons in-game.

## Review Notes

This is a strong first pass for art direction and layout blocking. Before final integration, review:

- Whether the background ledge lines up with the hero stance.
- Whether the title/menu scale works after phone-safe-area layout is applied.
- Whether the bottom menu should be split into separate button assets.
- Whether torch and star sheets need normalized frame slicing.

## Regeneration

The exact prompts used for this pass are in `docs/asset_prompts.md`.
