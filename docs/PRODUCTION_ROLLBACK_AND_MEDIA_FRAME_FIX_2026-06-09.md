# Production Rollback And Media Frame Fix - 2026-06-09

## Current Production State

Current `main` is intentionally past the Shadow Runner orientation rollback:

- `a0f63ce` - `Revert "Reapply "Fix Shadow Runner orientation handling""`

That means the global orientation/fullscreen behavior from `b3b1d19` is not active.

## What Was Undone

### Local Chat Media/Hype Patch

The first chat media frame attempt was restored before commit and was never pushed.

Files restored locally:

- `src/components/chat/MessageItem.tsx`
- `src/components/chat/VideoAttachment.tsx`
- `tests/MessageItem.test.tsx`
- `tests/serviceWorkerBadge.test.ts`

Reason: the first patch changed media framing and tests locally, but Tayler reported production layout breakage before that work was committed. It was removed to keep the rollback clean.

### `b3b1d19` - `Fix Shadow Runner orientation handling`

This commit was undone by `2f4e694`, then temporarily reintroduced by `7c8586b`, then undone again by `a0f63ce`.

Files changed by the orientation commit:

- `index.html`
- `public/manifest.webmanifest`
- `src/features/games/GamesHome.tsx`
- `src/features/games/shadow-runner/ShadowRunnerScreen.tsx`

Intent: make Shadow Runner behave more like a landscape game by entering fullscreen, locking landscape orientation where supported, and changing the PWA/browser orientation behavior.

Why it likely broke header, footer, and whole-app layout:

- `index.html` added `viewport-fit=cover`, which changes safe-area behavior for the entire app, not only Shadow Runner.
- `public/manifest.webmanifest` changed orientation from `portrait-primary` to `any`, allowing the installed PWA to rotate globally.
- `GamesHome.tsx` called `document.documentElement.requestFullscreen({ navigationUI: 'hide' })`, targeting the full app document.
- `GamesHome.tsx` called `screen.orientation.lock('landscape')`, which is also browser/document-level state.
- Those global changes can alter `innerHeight`, `visualViewport`, safe-area insets, browser chrome, and fixed-position layout assumptions used by the app header, footer, composer, and mobile nav.

The Shadow Runner-only asset position tweaks in `ShadowRunnerScreen.tsx` were less likely to affect the main chat layout. The likely culprit was the global browser/PWA state.

### `2f4e694` - `Revert "Fix Shadow Runner orientation handling"`

This rollback removed `b3b1d19`.

Reason: production layout was reported broken after the orientation-handling change.

### `7c8586b` - `Reapply "Fix Shadow Runner orientation handling"`

This commit reintroduced `b3b1d19`.

Reason: Tayler asked to undo the last push during emergency rollback triage. It was a normal revert of the rollback commit, not a force push.

### `a0f63ce` - `Revert "Reapply "Fix Shadow Runner orientation handling""`

This commit removed `7c8586b`, returning production to the state where `b3b1d19` is not active.

Reason: Tayler reported the previous undo did not fix layout and asked to roll back another commit. This was the rollback that restored the expected layout.

## Game Assets Kept

The generated Shadow Runner assets remain intentionally tracked and were not rolled back.

### `6bdd11f` - `Fix Shadow Runner mobile layout and asset loading`

Kept assets and asset references:

- `public/games/shadow-runner/home-assets/optimized/banner-pennant.webp`
- `public/games/shadow-runner/home-assets/optimized/banner-stand.webp`
- `public/games/shadow-runner/home-assets/optimized/bg-title-castle-night.webp`
- `public/games/shadow-runner/home-assets/optimized/bottom-menu-scroll.webp`
- `public/games/shadow-runner/home-assets/optimized/mission-scroll-stand.webp`
- `public/games/shadow-runner/home-assets/optimized/star-twinkle-sheet.webp`
- `public/games/shadow-runner/home-assets/optimized/title-scroll-shadow-runner.webp`
- `public/games/shadow-runner/home-assets/home-assets-manifest.json`
- `src/features/games/shadow-runner/assets/manifest.ts`

Reason kept: these are Shadow Runner home/title-screen assets and asset wiring, separate from the global orientation/fullscreen change.

### `9ebfddc` - `Add Shadow Runner enemy and asset concept sheets`

Kept concept/reference sheets:

- `public/games/shadow-runner/concept-art/enemy-character-sheet-2026-06-09.png`
- `public/games/shadow-runner/concept-art/game-asset-sheet-2026-06-09.png`
- `public/games/shadow-runner/concept-art/villain-pose-sheet-2026-06-09.png`
- `public/games/shadow-runner/concept-art/README.md`

Reason kept: these are planning/reference assets only. They do not modify global app layout.

## Durable Chat Media Frame Fix

The replacement chat patch keeps media layout local to chat messages:

- image/video Hype frames are applied to a shrink-wrapped `data-chat-media-frame` wrapper
- Hype badges and reaction chips are absolutely positioned inside the media frame
- badges/reactions no longer participate in the measured media width
- text/file/audio message bubbles keep the existing Hype bubble behavior
- no global viewport, manifest, fullscreen, orientation, app-shell, or Supabase changes are involved

