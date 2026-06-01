# Theme Asset Log

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This file is a QA log or validation checklist. Keep older artifact paths as historical evidence, and add new dated entries after the next browser, mobile, or device validation pass.

Last updated: 2026-05-11

## Purpose

Track generated theme assets, prompts, optimization notes, final repo paths, and usage decisions for the theme rebuild goal.

## Asset Standards

- Generated assets must be low-contrast UI backdrops or textures, not busy illustrations.
- No readable text, mock UI, watermarks, or fake logos.
- Final assets must be moved into `public/themes/<theme-id>/`.
- Prefer WebP for production references.
- Keep each final asset below roughly 350 KB when practical.
- Preserve enough prompt detail to regenerate a close replacement later.

## Prompt Set

| Theme ID | Asset | Prompt Draft | Status | Generated Source | Final Path | Optimization Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `obsidian-gold` | backdrop | Cinematic low-contrast abstract background for a premium chat app: deep obsidian black glass, subtle liquid gold veins, brushed dark metal depth, faint radial light, no text, no logo, no UI, no recognizable objects, safe behind readable white text. | generated/optimized | `C:\Users\tayle\.codex\generated_images\019dfce8-e06f-75c3-9b61-5b41f51ba7d2\ig_046c8ae98abce4f2016a01b12f014c8199bd05f3f57e8bb525.png` | `public/themes/obsidian-gold/backdrop.webp` | 1600x1000 WebP, 55,316 bytes, q82 |
| `obsidian-gold` | texture | Seamless-feeling dark obsidian microtexture with barely visible gold dust and glass grain, flat enough for UI panels, no text, no logo, no objects. | generated/optimized | same generated source as backdrop | `public/themes/obsidian-gold/texture.webp` | 1024x1024 WebP, 18,756 bytes, q76, softened crop |
| `aurora-veil` | backdrop | Low-contrast night-sky abstract for a chat app: charcoal glass, soft aurora ribbons in teal, violet, and cool blue, quiet luminous mist, no stars as dots, no text, no logo, no UI, safe behind readable text. | generated/optimized | `C:\Users\tayle\.codex\generated_images\019dfce8-e06f-75c3-9b61-5b41f51ba7d2\ig_046c8ae98abce4f2016a01b1bc5df08199a95ddd4215267d9f.png` | `public/themes/aurora-veil/backdrop.webp` | 1600x1000 WebP, 52,136 bytes, q82 |
| `aurora-veil` | texture | Subtle translucent aurora grain texture, dark charcoal base, teal-violet shimmer, soft blur, no text, no logo, no objects. | generated/optimized | same generated source as backdrop | `public/themes/aurora-veil/texture.webp` | 1024x1024 WebP, 16,918 bytes, q76, softened crop |
| `ember-slate` | backdrop | Low-contrast abstract background: dark slate stone, smoky ember glow, copper heat lines, gentle ash particles, warm but restrained, no flames as objects, no text, no logo, no UI. | generated/optimized | `C:\Users\tayle\.codex\generated_images\019dfce8-e06f-75c3-9b61-5b41f51ba7d2\ig_046c8ae98abce4f2016a01b1e016cc819996fc2a5b1f2a6ff0.png` | `public/themes/ember-slate/backdrop.webp` | 1600x1000 WebP, 114,828 bytes, q82 |
| `ember-slate` | texture | Brushed slate and ember dust texture, charcoal base, muted copper flecks, subtle smoky depth, no text, no logo, no objects. | generated/optimized | same generated source as backdrop | `public/themes/ember-slate/texture.webp` | 1024x1024 WebP, 37,094 bytes, q76, softened crop |
| `neon-circuit` | backdrop | Low-contrast cyber glass abstract: near-black acrylic, faint circuit traces, electric cyan and magenta edge glows with tiny lime accents, sophisticated not loud, no text, no logo, no UI. | generated/optimized | `C:\Users\tayle\.codex\generated_images\019dfce8-e06f-75c3-9b61-5b41f51ba7d2\ig_046c8ae98abce4f2016a01b203a2cc819987e80245442027fe.png` | `public/themes/neon-circuit/backdrop.webp` | 1600x1000 WebP, 39,370 bytes, q82 |
| `neon-circuit` | texture | Dark acrylic micro-grid texture with faint cyan-magenta circuit shimmer, low contrast, no text, no logo, no objects. | generated/optimized | same generated source as backdrop | `public/themes/neon-circuit/texture.webp` | 1024x1024 WebP, 11,002 bytes, q76, softened crop |
| `moonstone-light` | backdrop | Light mode abstract background for a premium chat app: pearlescent paper, moonstone sheen, soft mist blue and pale lavender shadows, gentle daylight glass, no text, no logo, no UI, subtle enough for dark text. | generated/optimized | `C:\Users\tayle\.codex\generated_images\019dfce8-e06f-75c3-9b61-5b41f51ba7d2\ig_046c8ae98abce4f2016a01b22cae788199a7638affb06761dd.png` | `public/themes/moonstone-light/backdrop.webp` | 1600x1000 WebP, 40,358 bytes, q82 |
| `moonstone-light` | texture | Soft pearl paper texture with subtle prism grain and very pale blue-lavender sheen, clean light UI background, no text, no logo, no objects. | generated/optimized | same generated source as backdrop | `public/themes/moonstone-light/texture.webp` | 1024x1024 WebP, 14,448 bytes, q76, softened crop |

## Optimization Log

- 2026-05-11: Generated one source plate per theme with the built-in image generation tool, then optimized project-bound WebP assets with bundled Python/Pillow.
- 2026-05-11: Created `backdrop.webp`, `texture.webp`, and `preview.webp` for each theme under `public/themes/<theme-id>/`.
- 2026-05-11: Contact sheet for visual inspection created at `output/theme-assets-contact-sheet.png`.
- 2026-05-11: Verified theme asset references in browser via `npm run qa:themes -- --run-name=theme-visual-all --skip-build`; each theme reported its expected `--theme-backdrop-image` and `--theme-texture-image`.

## Final Asset Inventory

| Theme ID | Backdrop | Texture | Preview |
| --- | --- | --- | --- |
| `obsidian-gold` | `public/themes/obsidian-gold/backdrop.webp` | `public/themes/obsidian-gold/texture.webp` | `public/themes/obsidian-gold/preview.webp` |
| `aurora-veil` | `public/themes/aurora-veil/backdrop.webp` | `public/themes/aurora-veil/texture.webp` | `public/themes/aurora-veil/preview.webp` |
| `ember-slate` | `public/themes/ember-slate/backdrop.webp` | `public/themes/ember-slate/texture.webp` | `public/themes/ember-slate/preview.webp` |
| `neon-circuit` | `public/themes/neon-circuit/backdrop.webp` | `public/themes/neon-circuit/texture.webp` | `public/themes/neon-circuit/preview.webp` |
| `moonstone-light` | `public/themes/moonstone-light/backdrop.webp` | `public/themes/moonstone-light/texture.webp` | `public/themes/moonstone-light/preview.webp` |
