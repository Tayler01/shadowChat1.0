# Shadow Runner Home Screen Assets

Status: first-pass review assets.

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
- The first live home screen uses the generated picker banner, Castle Bard
  music, animated menu-idle cape strip, normalized torch strip, sparkle sheet,
  sliced banner props, title scroll, mission scroll, and bottom menu scroll.
- The background has a useful foreground ledge for the hero, but the approved
  hero stance still needs to be placed against it to verify scale and foot
  alignment.
- The title scroll and menu are currently baked images. That is fine for a
  concept anchor, but live UI may be easier if we later split the menu into
  blank panels and render labels/icons in-game.
- The torch and star sheets should not be blindly sliced by equal dimensions
  without visual review.
- Raw chroma-key sources are preserved under
  `public/games/shadow-runner/home-assets/raw_chromakey/`.

## Manifest

Machine-readable details live at:

`public/games/shadow-runner/home-assets/home-assets-manifest.json`
