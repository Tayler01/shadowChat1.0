# Shadow Runner Home Screen Asset Index

## Final Assets

| Asset | File | Dimensions | Alpha | Use |
| --- | --- | ---: | --- | --- |
| Clean castle-night background | `assets/background/bg_title_castle_night_clean.png` | 1672 x 941 | No | Full-screen background plate with moon, sky, distant buildings, ruins, foliage, and stone ledge. |
| Title parchment | `assets/ui/ui_title_scroll_shadow_runner.png` | 1536 x 1024 | Yes | Foreground title banner with baked `SHADOW RUNNER` text. |
| Blank menu scroll | `generated/blank-menu-scroll-imagegen-source.png` / `sliced/blank-menu-scroll.png` / `optimized/blank-menu-scroll.webp` | 1792 x 462 runtime | Yes | Generated blank parchment scroll base for the private-build gate and separated menu buttons. |
| Blank menu button | `generated/blank-menu-button-imagegen-source.png` / `sliced/blank-menu-button.png` / `optimized/blank-menu-button.webp` | 1141 x 642 runtime | Yes | Generated blank parchment button panel for future separate menu controls and tighter hit areas. |
| Bottom menu scroll | `assets/ui/ui_bottom_menu_scroll.png` | 1912 x 823 | Yes | Bottom parchment menu with baked `START`, `LEVELS`, and `OPTIONS` panels. |
| Mission scroll stand | `assets/ui/prop_mission_scroll_stand.png` | 1254 x 1254 | Yes | Small blank parchment notice board/scroll prop for the foreground. |
| Torch flame strip | `assets/effects/fx_torch_flame_strip.png` | 2172 x 724 | Yes | 8-frame horizontal torch/brazier animation strip. |
| Star twinkle sheet | `assets/effects/fx_star_twinkle_sheet.png` | 1536 x 1024 | Yes | 12 shimmer/star sprites, intended as small overlay animations around the moon. |
| Purple banner sheet | `assets/props/prop_purple_banners_sheet.png` | 1774 x 887 | Yes | Three decorative purple banner props for castle/ruin framing. |

## Preview

| File | Use |
| --- | --- |
| `previews/contact_sheet.png` | Contact sheet showing the generated batch together. |

## Documentation

| File | Use |
| --- | --- |
| `README.md` | Bundle overview, folder structure, suggested layer order, and review notes. |
| `docs/ASSET_INDEX.md` | This asset index. |
| `docs/asset_prompts.md` | Exact image-generation prompts used for the first pass. |

## Raw Source Files

These files are preserved in `raw_chromakey/` for future alpha cleanup or regeneration reference:

- `ui_title_scroll_shadow_runner_chromakey.png`
- `ui_bottom_menu_scroll_chromakey.png`
- `prop_mission_scroll_stand_chromakey.png`
- `fx_torch_flame_strip_chromakey.png`
- `fx_star_twinkle_sheet_chromakey.png`
- `prop_purple_banners_sheet_chromakey.png`

## Next Production Steps

1. Slice `fx_torch_flame_strip.png` into 8 equal frame slots.
2. Slice `fx_star_twinkle_sheet.png` into separate sparkle sprites or atlas regions.
3. Decide whether the menu stays baked or gets split into blank panel, icons, and live text.
4. Compose a quick title-screen mockup with the approved hero stance.
5. Generate button state variants if the menu will be interactive.
