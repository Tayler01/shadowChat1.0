# Theme Rebuild Goal Plan

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This document is historical context or planning evidence, not the current implementation checklist. Check [README.md](C:/repos/chat2.0/README.md:1), [AGENTS.md](C:/repos/chat2.0/AGENTS.md:1), and the audit backlog before using it for new work.

Last updated: 2026-05-11

## Goal

Rebuild Shadow Chat themes so each selectable theme is visually distinct, fully integrated across the app, backed by optimized custom assets, and verified across mobile PWA chat, DMs, boards, settings, modals, menus, and desktop surfaces. The same workstream also tracks Android keyboard/header displacement issues found during mobile QA.

## Current Findings

- Current dark themes are mostly hue swaps around the same black/gold material model.
- The light theme has a deeper token override, but many surfaces still carry dark/gold assumptions.
- Theme-specific values are split between root CSS variables, `useTheme` swatches, and many component-level literal colors.
- The compatibility layer still uses gold-named tokens such as `--gold-*`, `--text-gold`, `--shadow-gold-soft`, and `--shadow-gold-cta`.
- Several high-traffic surfaces still contain hard-coded gold, black, white, and dark overlay values:
  - app shell and toast styling
  - buttons
  - chat and DM message bubbles
  - mobile nav and footer
  - boards and art board tools
  - settings/admin cards and modals
  - profile banner/buttons
  - weather and onboarding popups
- The existing `qa:mobile-pwa` harness already covers mobile chat, DMs, boards, settings, feedback modal, profile, message actions, and compressed-viewport composer states.

## Theme Lineup

The themes should not be mild variants of the same palette. Each theme gets its own color story, background material, accent behavior, and asset treatment.

| Theme ID | Working Name | Mode | Personality | Primary Asset Direction |
| --- | --- | --- | --- | --- |
| `obsidian-gold` | Obsidian Gold | dark | Existing premium black/gold identity, polished rather than replaced. | dark liquid metal, subtle gold veins, deep obsidian glass |
| `aurora-veil` | Aurora Veil | dark | Night-sky, teal, violet, ion glow; energetic but still readable. | soft aurora ribbons over charcoal glass |
| `ember-slate` | Ember Slate | dark | Charcoal, ember, copper, heat shimmer; rugged and warm. | smoky ember particles and brushed slate |
| `neon-circuit` | Neon Circuit | dark | Cyber, electric cyan/magenta/lime accents; sharper and more playful. | faint circuit grid, neon edge glow, dark acrylic |
| `moonstone-light` | Moonstone Light | light | Clean luminous light mode; pearl, mist, soft blue, restrained gold only when intentional. | pearlescent paper, soft prism sheen, daylight glass |

Theme names can still change before implementation, but the important rule is that each theme owns a distinct material system.

## Token Model

Phase the old gold-specific naming into neutral semantic tokens while keeping compatibility aliases until all components are migrated.

### New Semantic Token Groups

- `--theme-accent`, `--theme-accent-strong`, `--theme-accent-soft`
- `--theme-accent-text`, `--theme-accent-contrast`
- `--theme-ring`, `--theme-ring-soft`
- `--theme-metal-1` through `--theme-metal-5`
- `--surface-page`, `--surface-shell`, `--surface-panel`, `--surface-panel-strong`, `--surface-elevated`
- `--surface-input`, `--surface-input-focus`, `--surface-overlay`, `--surface-muted`
- `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverse`
- `--border-subtle`, `--border-panel`, `--border-strong`, `--border-glow`
- `--shadow-panel`, `--shadow-panel-strong`, `--shadow-accent-soft`, `--shadow-cta`
- `--asset-theme-backdrop`, `--asset-theme-texture`, `--asset-theme-logo-filter`

### Compatibility Aliases

Keep these during migration so component changes can be incremental:

- `--gold-1` through `--gold-5`
- `--gold-accent`, `--gold-accent-strong`
- `--gold-text`
- `--text-gold`
- `--shadow-gold-soft`
- `--shadow-gold-cta`

They should map to the active theme accent tokens, not always to gold.

## Asset Workflow

Use built-in image generation for theme bitmap assets. Final project-bound assets must live in the repo, not only under Codex generated image storage.

Target path:

- `public/themes/<theme-id>/backdrop.webp`
- `public/themes/<theme-id>/texture.webp`
- optional `public/themes/<theme-id>/preview.webp`

Asset type:

- wide ambient backdrop, around 1600x1000 before optimization
- square or tileable texture, around 1024x1024 before optimization
- no readable text in generated assets
- no logos or brand marks unless manually approved
- low-contrast enough to sit behind chat text

Optimization:

- Use bundled Python/Pillow for resize, WebP conversion, and contrast/size checks.
- `magick`, `cwebp`, `avifenc`, and `pngquant` are not currently available locally.
- Keep each production WebP under roughly 350 KB when practical.
- Preserve source prompts and generated asset notes in `docs/qa/theme-asset-log.md`.

## Implementation Workflow

1. Foundation
   - Add theme metadata and asset paths to `useTheme`.
   - Expand `index.css` with semantic tokens and compatibility aliases.
   - Move theme preview swatches to richer material previews.

2. Global primitives
   - Rebuild `Button`, input utilities, popup surfaces, focus rings, selection, scrollbars, badges, and mobile footer/nav tokens.
   - Keep behavior unchanged.

3. High-traffic surfaces
   - Chat shell, message list, message bubbles, composer, active users, weather.
   - DMs list/thread/composer.
   - Boards map, board chat, art board, news surfaces.
   - Settings, admin feedback, feedback modal, profile/public profile, onboarding modals.

4. Hard-coded carryover cleanup
   - Replace literal gold/black/white RGBA styling with semantic surface/accent utilities.
   - Keep legitimate media backgrounds such as video black where needed.

5. Android keyboard/header fix
   - Extend or supplement `scripts/mobile-pwa-visual-qa.mjs` with explicit Android compressed-viewport header checks.
   - Confirm chat, DM thread, and board chat headers remain visible and do not get pushed out when composer focus compresses viewport.
   - Patch app shell/mobile viewport/header/footer logic only where reproduced.

6. Per-theme QA loop
   - Run every core flow once per theme on desktop and mobile where practical.
   - Capture screenshots under `output/playwright/theme-rebuild-<run>/`.
   - Record issues and fixes in `docs/qa/theme-rebuild-qa-log.md`.

## QA Matrix

Required surfaces per theme:

- login/session restore
- main chat
- composer focused and compressed viewport
- message actions/reactions
- DMs list
- DM thread
- boards list
- board chat
- art board
- news feed/news chat
- settings hub
- color scheme selector
- feedback modal
- admin feedback review when admin account is available
- profile and public profile dialogs
- onboarding/install and notification setup modals
- toast styles
- unread badges and nav badges

Required viewports:

- desktop 1440x960
- iPhone small 390x844
- iPhone large 430x932
- Android medium 412x915
- Android small 360x800 when issues appear
- Android compressed keyboard simulation for chat, DMs, and board chat

## Verification Commands

Run as the implementation stabilizes:

```powershell
npm run lint
npm run typecheck
npm run build
npx jest --runInBand
npm run qa:smoke:mobile
npm run qa:smoke:full
npm run qa:mobile-pwa -- --run-name=theme-mobile-final --no-reuse-server
```

Additional theme-specific visual QA scripts may be added if they stay focused and do not introduce a full new test framework.

## Stop Conditions

This goal is complete only when:

- every selectable theme is visibly unique
- no theme has obvious black/gold carryover except intentional Obsidian Gold compatibility
- Moonstone Light no longer has dark/gold menu carryovers in primary flows
- custom theme assets are generated, optimized, committed, and referenced
- Android keyboard/header displacement is fixed or documented with exact remaining real-device limits
- QA docs contain final evidence and remaining risk
- lint, typecheck, build, Jest, smoke, and focused visual QA pass
- final work is committed and pushed to `main`

## Implementation Notes From First Loop

- Theme metadata now lives in `src/hooks/useTheme.tsx` with generated asset paths and legacy scheme migration.
- The global token layer in `src/index.css` now owns the unique visual identity for each theme and keeps old gold-named aliases mapped to active theme values.
- Shared primitives were moved toward semantic utility classes such as `theme-app-surface`, `theme-accent-chip`, `theme-floating-action`, `theme-sent-bubble`, and `theme-composer-surface`.
- Theme picker cards now use generated preview assets and descriptions instead of simple gradient-only swatches.
- Android keyboard/header QA caught a real DM thread overflow; `src/components/dms/DirectMessagesView.tsx` now constrains the thread pane/header with mobile-safe `min-w-0`, `max-w-full`, and smaller logo sizing.
- `scripts/theme-visual-qa.mjs` was added for per-theme mobile visual sweeps.
- `scripts/mobile-pwa-visual-qa.mjs` now checks header geometry on chat, DM thread, and board chat compressed composer states.

## First Loop Verification

Passed:

```powershell
npm run lint
npm run typecheck
npm run build
npx jest --runInBand tests/useTheme.test.tsx tests/SettingsView.test.tsx
npm run qa:themes -- --run-name=theme-visual-all --skip-build
npm run qa:mobile-pwa -- --run-name=mobile-pwa-theme-rebuild-2 --skip-build
```

Artifacts:

- `output/theme-assets-contact-sheet.png`
- `output/playwright/theme-visual-all/summary.json`
- `output/playwright/mobile-pwa-theme-rebuild-2/summary.json`
