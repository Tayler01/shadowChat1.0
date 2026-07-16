# Production Social Hotfix Design QA

Date: 2026-07-16
Production origin: `https://shadochat.online`
Frontend commit reviewed: `eecd772c3186a507aac45c73a376950fb2ba05d7`

## Catch-Up profile identity

- Source screenshot: `C:\Users\tayle\OneDrive\Pictures\2.0\photo_2026-07-16_16-47-42.jpg`
- Production screenshots:
  - `C:\repos\chat2.0-main\output\playwright\production-social-hotfix\pixel-chromium-catch-up-clean.png`
  - `C:\repos\chat2.0-main\output\playwright\production-social-hotfix\iphone-webkit-catch-up-clean.png`
- State compared: authenticated Catch-Up list with ShadowPin activity.
- Result: all eight visible actor controls loaded real avatar images in both Pixel Chromium and iPhone WebKit. The avatar controls opened the existing public-profile dialog and closed normally.
- Visible change: the initial-only fallback circles in the source are replaced by the same profile photos and circular treatment used elsewhere in ShadowChat.

## ShadowPin conversation and composer

- Source screenshots:
  - `C:\Users\tayle\OneDrive\Pictures\2.0\photo_2026-07-16_16-47-08.jpg`
  - `C:\Users\tayle\OneDrive\Pictures\2.0\photo_2026-07-16_16-47-35.jpg`
  - `C:\Users\tayle\OneDrive\Pictures\2.0\photo_2026-07-16_16-47-38.jpg`
  - `C:\Users\tayle\OneDrive\Pictures\2.0\photo_2026-07-16_16-47-45.jpg`
- Production screenshots:
  - `C:\repos\chat2.0-main\output\playwright\production-social-hotfix\pixel-chromium-pin-comments-clean.png`
  - `C:\repos\chat2.0-main\output\playwright\production-social-hotfix\iphone-webkit-pin-comments-clean.png`
  - `C:\repos\chat2.0-main\output\playwright\production-social-hotfix\pixel-chromium-pin-comment-menu-clean.png`
  - `C:\repos\chat2.0-main\output\playwright\production-social-hotfix\iphone-webkit-pin-comment-menu-clean.png`
  - `C:\repos\chat2.0-main\output\playwright\production-social-hotfix\pixel-chromium-pin-comment-quick-reactions-clean.png`
  - `C:\repos\chat2.0-main\output\playwright\production-social-hotfix\iphone-webkit-pin-comment-quick-reactions-clean.png`
- State compared: authenticated full-screen ShadowPin conversation with an existing comment and the composer focused.
- Result: the dialog stayed inside each visual viewport. The focused composer ended at 826px in an 839px Pixel viewport and 651px in a 664px iPhone WebKit visual viewport.
- Visible change: comments now use compact content-sized General Chat message rows, clickable author identity, a three-dot context menu, tap quick reactions, and no always-visible action shelf.
- Interaction check: Copy, Reply, and Add Reaction were present in the context menu; the quick-reaction rail stayed completely inside both phone viewports.

## Shado Live message consistency

- The production database exposes the new list/toggle reaction RPCs.
- Component tests cover the compact message row, clickable avatar, three-dot menu, quick reactions, reaction summaries, and report action.
- No controlled active production room was available, so the live-room visual was not recreated with production user content during this pass.

## Review history

1. The first automated capture was obscured by queued in-app notification cards.
2. The pass was repeated after the normal notification window and the phone-setup overlay was explicitly dismissed.
3. Pixel Chromium and iPhone WebKit then passed with no console errors, page errors, failed app requests, or HTTP error responses.

final result: passed
