# Mobile Viewport Audit

Last updated: 2026-05-10

## Viewport Meta Status

- `index.html` sets `width=device-width, initial-scale=1.0, user-scalable=no`.
- iOS Home Screen meta tags are present:
  - `apple-mobile-web-app-capable=yes`
  - `apple-mobile-web-app-status-bar-style=black-translucent`
  - `apple-mobile-web-app-title=ShadowChat`
- The app disables pinch zoom to preserve the native-like installed PWA feel.

## Manifest And Service Worker Status

- `public/manifest.webmanifest` uses `display: standalone`, `orientation: portrait-primary`, `start_url: /`, and app icons.
- `src/main.tsx` registers the push service worker through `registerPushServiceWorker`.
- `public/sw.js` handles static asset caching, notifications, app badges, and notification click routing.

## Safe-Area Handling

- Mobile chat, DM, and board footers use `pb-[env(safe-area-inset-bottom)]`.
- Chat, DM, and board scroll containers pad bottom content by safe area plus measured mobile footer height.
- Toast top positioning uses `env(safe-area-inset-top)` plus visual viewport offset CSS variables.
- Latest automated screenshots show composers clearing the footer and bottom edge across iPhone small, iPhone large, Android medium, and Android small profiles.

## Root/HTML/Body Height Strategy

- `html`, `body`, and `#root` use `height: 100vh` with `100dvh` support when available.
- Mobile `.app-viewport` uses `--shadowchat-app-height`, falling back to `--shadowchat-visual-viewport-height` and `100dvh`.
- `src/lib/mobileViewport.ts` centralizes the visual viewport and keyboard inset calculations.

## App Shell Height Strategy

- `src/App.tsx` listens to `visualViewport`, resize, orientation, focus, and pageshow events.
- `computeMobileViewportState` derives stable app height, visual viewport height, keyboard inset, scroll keyboard inset, and toast top variables.
- iOS keeps a stable app height during keyboard compression while moving fixed footers by keyboard inset.

## Scroll Container Strategy

- General Chat: `MessageList` owns the scroll container and pads for the mobile chat footer.
- DMs: `DirectMessagesView` owns the thread scroll container and pads for the mobile chat footer.
- Boards: `BoardChat` owns the board chat scroll container and pads for the mobile chat footer.
- Settings/profile screens use internal vertical overflow and bottom safe-area padding.

## Composer Positioning Strategy

- Shared chat and DM composers render in `MobileChatFooter` on mobile.
- Board chat composer also renders in `MobileChatFooter` for active chat boards.
- `MobileChatFooter` measures its height with `ResizeObserver` and writes `--shadowchat-mobile-chat-footer-height`.
- The mobile QA harness validates focused and compressed-viewport composer states for chat, DMs, and board chat.

## Modal Positioning Strategy

- Feedback and install guide modals use fixed overlays, viewport max heights, and internal overflow.
- Public profile uses a centered fixed overlay with max height and internal scroll.
- Feedback modal coverage passed on all automated mobile profiles.
- Admin-only feedback review modals were not part of this user-flow audit and should be covered separately with an admin account.

## DM Header And Panel Notes

- The DM list panel no longer uses full-panel horizontal entrance motion on mobile, avoiding transient clipping on route entry and return-to-list.
- The DM mobile masthead now constrains the logo/title group below 380px and keeps the new-conversation plus button inside the viewport.

## QA Harness Status

- `scripts/mobile-pwa-visual-qa.mjs` runs production-preview mobile visual checks without adding a new Playwright framework.
- It writes screenshots, console logs, network failures, and `summary.json` under `output/playwright/<run-name>/`.
- Current passing artifact set: `output/playwright/mobile-pwa-final/`.

## Known Real-Device Risks

- Playwright can simulate mobile viewports and WebKit/Chromium engines, but it cannot fully reproduce installed Home Screen browser chrome, native keyboard animation, or iOS standalone status-bar behavior.
- The mobile QA harness uses viewport compression after composer focus as the closest repeatable keyboard simulation.
- Dense secondary controls, especially reaction chips and reply links, are documented as warnings and should be comfort-checked by hand.
- Final production confidence still needs at least one real iPhone Home Screen install and one Android Home Screen install.
