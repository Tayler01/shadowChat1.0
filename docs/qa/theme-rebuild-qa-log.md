# Theme Rebuild QA Log

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This file is a QA log or validation checklist. Keep older artifact paths as historical evidence, and add new dated entries after the next browser, mobile, or device validation pass.

Last updated: 2026-05-11

## Summary

Theme rebuild QA passed the first end-to-end implementation loop on 2026-05-11.

- All five themes were exercised with the focused theme visual runner on iPhone WebKit and Android Chromium.
- The broader mobile PWA runner passed on iPhone small, iPhone large, Android medium, and Android small profiles.
- The Android/keyboard-related header issue reproduced as a DM thread width overflow in the focused runner and was fixed.
- Remaining risk is real installed-PWA behavior on physical Android/iOS keyboards, because Playwright compression is the closest local simulation.

## Issue Log

| Issue ID | Status | Theme | Device/Viewport | Surface | Reproduction Steps | Screenshot Path | Root Cause | Files Changed | Verification Command | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| THEME-001 | fixed/verified | all non-Obsidian themes | iPhone small WebKit, Android medium Chromium | global tokens/components | Inspect theme picker, chat, DMs, board chat, settings, composer focus/compressed states. | `output/playwright/theme-visual-all/` | Theme model used gold-named compatibility tokens and literal gold/black/white component values. | `src/index.css`, `src/hooks/useTheme.tsx`, `src/components/ui/Button.tsx`, `src/components/settings/SettingsView.tsx`, chat/DM/board/layout surfaces | `npm run qa:themes -- --run-name=theme-visual-all --skip-build` | Compatibility aliases remain intentionally, but now map to active theme accents. |
| THEME-002 | fixed/verified | all themes | Android medium/small compressed viewport | DM thread, chat, board chat headers | Focus composer and simulate compressed keyboard viewport. | `output/playwright/theme-visual-all/android-medium-chromium-*-04-dm-composer-compressed.png`, `output/playwright/mobile-pwa-theme-rebuild-2/android-small-chromium-09-dm-composer-compressed.png` | DM thread pane did not have `min-w-0`, so header/content could retain minimum content width and exceed mobile viewport. | `src/components/dms/DirectMessagesView.tsx`, `scripts/theme-visual-qa.mjs`, `scripts/mobile-pwa-visual-qa.mjs` | `npm run qa:themes -- --run-name=theme-visual-all --skip-build`; `npm run qa:mobile-pwa -- --run-name=mobile-pwa-theme-rebuild-2 --skip-build` | Physical installed Android keyboard should still be checked after deploy. |
| THEME-003 | fixed/verified | all themes | iPhone small WebKit, Android medium Chromium | theme picker | Open Settings -> Color & Layout. | `output/playwright/theme-visual-all/*-09-theme-picker.png` | Theme picker only showed simple gradients and did not preview generated assets. | `src/components/settings/SettingsView.tsx`, `src/hooks/useTheme.tsx`, `public/themes/*/preview.webp` | `npm run qa:themes -- --run-name=theme-visual-all --skip-build` | Picker now uses generated preview imagery plus theme descriptions. |
| THEME-004 | verified warning | default mobile data set | all mobile PWA profiles | reactions/tiny inline controls | Run broad mobile PWA sweep. | `output/playwright/mobile-pwa-theme-rebuild-2/summary.json` | Existing reaction chips and some inline message affordances are smaller than 32px. | none in this pass | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-theme-rebuild-2 --skip-build` | Logged as warnings only because they are existing dense inline controls and not clipped primary actions. |
| THEME-005 | fixed/verified | all themes | Android real keyboard report, Android medium simulated inset, iPhone small/large regression sweep | board chats only | Open a board chat on Android, focus composer, observe composer/nav double-lift into the middle of the screen. | `output/playwright/android-board-keyboard-fix/summary.json`, `output/playwright/mobile-pwa-board-keyboard-fix/summary.json` | Board chat needed to ignore Android keyboard inset because the viewport already shrinks there; applying the inset again double-lifted the mobile footer. | `src/components/layout/MobileChatFooter.tsx`, `src/components/boards/BoardChat.tsx`, `tests/NewsChat.test.tsx`, QA scripts | `npm run qa:themes -- --profiles=android-medium-chromium --run-name=android-board-keyboard-fix --skip-build`; `npm run qa:mobile-pwa -- --run-name=mobile-pwa-board-keyboard-fix --skip-build` | Scoped to board chats; iOS still uses keyboard inset. |

## Final Summary

Implemented and verified:

- New independent themes: Obsidian Gold, Aurora Veil, Ember Slate, Neon Circuit, and Moonstone Light.
- Generated and optimized `backdrop.webp`, `texture.webp`, and `preview.webp` assets for each theme.
- Added semantic theme tokens, compatibility aliases, theme-aware global surfaces, scrollbars, popup/input surfaces, buttons, composer surfaces, sent bubbles, nav badges, sidebars, and theme picker cards.
- Fixed the reproduced Android/DM header width issue with mobile-safe flex constraints.
- Added `npm run qa:themes` and tightened `npm run qa:mobile-pwa` header checks for chat, DM thread, and board chat keyboard simulations.

Verification:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npx jest --runInBand tests/useTheme.test.tsx tests/SettingsView.test.tsx`
- `npm run qa:themes -- --run-name=theme-visual-all --skip-build`
- `npm run qa:mobile-pwa -- --run-name=mobile-pwa-theme-rebuild-2 --skip-build`

Artifacts:

- `output/theme-assets-contact-sheet.png`
- `output/playwright/theme-visual-all/summary.json`
- `output/playwright/mobile-pwa-theme-rebuild-2/summary.json`
