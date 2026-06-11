# Feature Progress Log

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This feature guide is current for the shipped product surface, with any known hardening or polish follow-ups tracked in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Use this log for long-running `/goal` work and feature implementations that span
multiple checkpoints. Keep entries concise, factual, and tied to verification.

## Current Goal

### Shadow Runner Playable Prototype Prep

- Goal: Rebuild the Shadow Runner title/menu surface as clean asset-driven UI,
  keep the gated phone-first flow stable, preserve current gameplay geometry,
  and prepare the next Phaser playable-prototype checkpoint.
- Started: 2026-06-09
- Status: active
- Owner/agent: Codex
- Branch: `main`
- Current checkpoint: Start Tutorial / Select Level split, campaign level-map
  progression, reusable level configs, and first Level 2 prototype route.
- Roadmap: [`docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md`](C:/repos/chat2.0/docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md:1)
- Latest pass, 2026-06-09: generated dedicated options-scroll and options-row
  button assets; removed title back/sound controls; added title Options and
  in-game Pause scroll menus; widened the title menu scroll without increasing
  height; lowered the right mission-scroll pedestal; and hardened long-press
  selection/context-menu suppression across the Shadow Runner surface.
- Latest pass, 2026-06-10: wired the cleaner `clockwork-sentry-v2` runtime
  strip, kept the sentry on deterministic patrol bounds instead of side-block
  direction flips, and documented the clean HUD/heart/coin/health assets.
- Latest pass, 2026-06-11: fixed Level 1 terrain rendering by registering
  named Phaser frames from the generated stone sheet, generated and wired a
  dedicated tilt-bridge asset, added landing/contact/finish feedback polish,
  and cataloged the new Barrel Roller plus Ivy Viaduct asset batch.
- Latest pass, 2026-06-11: split the title actions into `Start Tutorial` and
  `Select Level`, generated a branded level-map scroll plus Level 1 thumbnail,
  added a locked grayscale 10-level campaign map, moved full Level 1 behind the
  map flow, kept the tutorial route short, introduced reusable level metadata
  for future maps, and cataloged the new Candle Jester / Candle Fair assets.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  `npx jest --runInBand` passed. Chrome-channel production-preview visual
  smoke passed for locked map, Level 1 completion unlock, and Level 2 launch;
  evidence in `output/playwright/shadow-runner-level-map-goal/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  `npx jest --runInBand` passed. Chrome-channel production-preview visual
  smoke passed at `932x430`; evidence in
  `output/playwright/shadow-runner-level1-goal/` shows visible generated stone
  chunks, the generated tilt bridge, sentry state, pause menu without `Exit
  Game`, and level-complete actions limited to restart/main menu.
- Verification: `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, and
  `npm run build` passed. Chrome mobile visual smoke passed at `740x390` and
  `932x430` with zero title-button scroll overrun and canceled `selectstart`
  / `contextmenu` events. Evidence:
  `output/playwright/shadow-runner-options-pass/final/`.
- Prototype verification, 2026-06-10: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and Chrome
  production-preview smoke passed. Evidence includes `932x430` and `740x390`
  HUD/pause/sentry captures in
  `output/playwright/shadow-runner-prototype-phase/`, plus foreground Chrome
  screenshots `19-headed-v2-sentry-a-932x430.png` and
  `20-headed-v2-sentry-b-932x430.png` showing the sentry moving across patrol.
- Prototype backlog:
  - Add gameplay HUD assets and DOM overlay: player health, enemy health,
    score/coins, pause, and checkpoint/finish feedback.
  - Keep movement rules in the existing simulation boundary and Phaser scene
    thin; do not tune level difficulty from automated test failures alone.
  - Add one reviewed enemy type first, then sword/jump defeat feedback.
  - Build one short test route around movement, jump, double jump, attack,
    crouch, one enemy, one tilt platform, and one finish marker.
  - Run real iPhone and Android checks for rotation, safe areas, load speed,
    and touch highlight behavior after each pushed visual/gameplay checkpoint.

## Latest Completed Goal - ShadowPin Short Video

- Goal: Add first-class short video pins to ShadowPin while preserving the
  existing mixed category feed, admin activity, hearts, and image-pin behavior.
- Started: 2026-05-29
- Status: complete
- Owner/agent: Codex
- Branch: merged to `main`
- Related roadmap: [`docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md`](C:/repos/chat2.0/docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md:1)
- User decisions: video pins mix with images; category covers stay image-only;
  feed autoplay is muted/focus-based; fullscreen viewer loads high-quality
  video; public users see only ready videos; creators/operators see processing
  failures; limits are 60 seconds, 150 MB, and 5 native uploads/day.

## Initial Interpretation

- User-visible outcome: Users can upload short phone videos, pin supported
  external video URLs, scroll a mixed image/video ShadowPin feed smoothly, turn
  on sound from the details overlay, and open video pins in a full-screen viewer.
- In scope: schema/RLS, Bunny native upload path, external video import path,
  client create/edit/replace flows, autoplay/focus playback, activity metadata,
  docs, focused tests, deployment, and verification.
- Out of scope: TikTok, video category covers, comments, realtime pin feeds,
  provider rehosting where terms or technical constraints make embeds safer for
  v1, direct Bunny pull-zone rendition URLs unless the environment is configured,
  and real-device autoplay/audio validation.
- Assumptions: Bunny Stream credentials already exist for Shado TV; adding a
  Bunny pull-zone URL is acceptable for direct rendition playback.

## Risk Areas

| Area | Risk | Mitigation | Status |
| --- | --- | --- | --- |
| Media delivery | Native video renditions depend on Bunny processing and pull-zone configuration. | Store poster immediately, keep processing state private to creator/operators, document `BUNNY_STREAM_PULL_ZONE_URL`. | active |
| Provider embeds | YouTube, X, Pinterest, and Instagram have provider-controlled autoplay behavior. | Use YouTube iframe autoplay where possible; extract Pinterest direct MP4/HLS URLs when exposed; keep other external providers as best-effort embed/source pins. | active |
| RLS/public visibility | Failed videos must not leak into public feeds. | New select policy only exposes non-image media when ready unless creator/operator. | active |
| Feed smoothness | Autoplay can hurt masonry scrolling. | Use focus IntersectionObserver, direct preview URL when available, muted loop playback, and pause offscreen. | active |
| Existing image behavior | Extending `shadow_pin_images` can regress images. | Keep table/field compatibility and route image flows through existing functions. | active |

## Milestones

| ID | Milestone | Status | Files/areas | Verification |
| --- | --- | --- | --- | --- |
| M1 | Recheck repo, docs, and latest commit | complete | `AGENTS.md`, ShadowPin docs/code, Bunny upload path | Static inspection, clean `main` matching `origin/main` |
| M2 | Define video roadmap and constraints | complete | Roadmap doc, progress log | User decisions captured |
| M3 | Extend schema and RLS | complete | `supabase/migrations/20260529223000_shadow_pin_video_pins.sql` | Remote migration applied |
| M4 | Add video upload/import service | complete | `supabase/functions/shadow-pin-video/index.ts`, `supabase/config.toml` | Edge Function deployed and live Bunny upload verified |
| M5 | Add client API and UI playback | complete | ShadowPin API, hooks, UI | Typecheck passed |
| M6 | Add direct URL replacement and Bunny embed fallback | complete | Netlify media function, ShadowPin UI/API | Lint, module load, focused Jest |
| M7 | Add tests/docs and run gates | complete | ShadowPin tests/docs | Typecheck, lint, build, Jest, preview mobile, production smoke, and live upload checks passed |

## Verification Log

| Date | Command/check | Result | Notes |
| --- | --- | --- | --- |
| 2026-05-29 | `Get-Command node,npm,npx` | pass | Required repo tooling is available. |
| 2026-05-29 | `git fetch --prune`; `git status --short --branch` | pass | Local `main` matches `origin/main`; worktree started clean. |
| 2026-05-29 | `npx tsc --noEmit -p tsconfig.app.json` | pass | App typecheck clean after video UI/API work. |
| 2026-05-29 | `npm run lint` | pass | ESLint clean. |
| 2026-05-29 | `npx jest --runInBand tests/ShadowPin.test.tsx tests/useShadowPinHeartOptimism.test.tsx` | pass | 2 suites, 24 tests after focused video autoplay/embed/replacement coverage. |
| 2026-05-29 | `npm run build` | pass | Vite build completed; existing large-chunk warning remains. |
| 2026-05-29 | `npx jest --runInBand` | pass | 75 suites, 322 tests. |
| 2026-05-29 | `npm run qa:smoke:mobile -- --base-url=http://127.0.0.1:4174 --skip-build --run-name=shadow-pin-video-mobile-smoke` | pass | Mobile DM smoke passed against preview build. |
| 2026-05-29 | Custom Playwright iPhone preview screenshots | pass | `output/playwright/shadow-pin-video-visual/`; ShadowPin home, category empty state, and add-pin modal rendered without console errors. |
| 2026-05-29 | `supabase db push --dry-run` | pass | Remote project sees `20260529223000_shadow_pin_video_pins.sql` as pending; not applied. |
| 2026-05-29 | `supabase secrets list` | pass | Bunny library/API secrets exist; `BUNNY_STREAM_PULL_ZONE_URL` is not configured. App now falls back to Bunny iframe playback. |
| 2026-05-29 | `node -e "import('./netlify/functions/shadow-pin-media.mjs')"` | pass | Netlify ShadowPin media module loads after URL-replacement action changes. |
| 2026-05-29 | esbuild bundle of `supabase/functions/shadow-pin-video/index.ts` with remote Deno imports externalized | pass | Syntax/bundling sanity check passed without Docker/Deno. |
| 2026-05-29 | `npm run lint` | pass | ESLint clean after replacement/fallback patch. |
| 2026-05-29 | `npx tsc --noEmit -p tsconfig.app.json` | pass | App typecheck clean after replacement/fallback patch. |
| 2026-05-29 | `npm run build` | pass | Vite build completed; existing large-chunk warning remains. |
| 2026-05-29 | `npx jest --runInBand` | pass | 75 suites, 325 tests. |
| 2026-05-29 | `npm run qa:smoke:mobile -- --base-url=http://127.0.0.1:4174 --skip-build --run-name=shadow-pin-video-mobile-smoke-2` | pass | Preview-build mobile smoke passed. |
| 2026-05-29 | `supabase db push` | pass | Applied `20260529223000_shadow_pin_video_pins.sql` to remote project `shsqqouecvdoifzufkqm`. |
| 2026-05-29 | `supabase functions deploy shadow-pin-video --no-verify-jwt --use-api` | pass | Deployed `shadow-pin-video`; latest listed version is 2 after cleanup action. |
| 2026-05-29 | `netlify deploy --build --prod` | pass | Production deploy live at `https://shadowchat-1-0.netlify.app`. |
| 2026-05-29 | `npm run qa:smoke:prod:headless` | pass | Production auth and resume-send smoke passed after Netlify deploy. |
| 2026-05-29 | Live Bunny upload smoke through `shadow-pin-video` | pass | Temporary 31 KB MP4 uploaded through Bunny TUS, synced to `ready`, then pin, Bunny asset, and category were cleaned up. |
| 2026-05-29 | Live Pinterest import smoke through `shadow-pin-video` | pass | Temporary Pinterest pin extracted direct `pinimg.com` MP4/HLS URLs, then pin and category were cleaned up. |
| 2026-05-29 | `supabase db push --dry-run` | pass | Remote database is up to date after deploy. |
| 2026-05-29 | `git diff --check` | pass | Only line-ending warnings from Git on Windows. |
| 2026-05-29 | `npx jest --runInBand tests/ShadowPin.test.tsx tests/useShadowPinHeartOptimism.test.tsx` | pass | 2 suites, 24 tests after final Edge Function cleanup patch. |
| 2026-05-29 | `npx jest --runInBand tests/ShadowPin.test.tsx` | pass | 23 tests after iframe sound controls and feed video-label visibility fix. |
| 2026-05-29 | `npm run lint`; `npx tsc --noEmit -p tsconfig.app.json`; `npm run build` | pass | ESLint clean, app typecheck clean, Vite build completed with existing large-chunk warning. |
| 2026-05-29 | `supabase db push --dry-run` | pass | Remote database remains up to date. |
| 2026-05-29 | `netlify deploy --prod --dir=dist` | pass | Production deploy live at `https://shadowchat-1-0.netlify.app`. |
| 2026-05-29 | `npm run qa:smoke:prod:headless` | pass | Production auth and resume-send smoke passed after deploy. |

## Files Changed So Far

| File | Reason |
| --- | --- |
| `supabase/migrations/20260529223000_shadow_pin_video_pins.sql` | Add mixed-media pin columns, video visibility RLS, heart guard, and score filtering. |
| `supabase/functions/shadow-pin-video/index.ts` | Add Bunny upload sessions, completion/status sync, and external video imports. |
| `supabase/config.toml` | Register `shadow-pin-video` with manual endpoint auth. |
| `netlify/functions/_shared/shadow-pin-media.mjs` | Add direct existing-pin image URL replacement and image URL-import metadata. |
| `netlify/functions/shadow-pin-media.mjs` | Add `update-image-from-url` action for normal pin replacement. |
| `src/features/shadow-pin/types.ts` | Add media/provider/video metadata types. |
| `src/features/shadow-pin/api/shadowPinApi.ts` | Route image/video source creation and replacement, capture posters, upload Bunny TUS files, and sync processing status. |
| `src/features/shadow-pin/hooks/useShadowPinImages.ts` | Poll creator-visible processing video pins and update cache. |
| `src/features/shadow-pin/ShadowPin.tsx` | Add mixed pin copy, video source input, feed autoplay, sound toggles, and video-aware fullscreen viewer. |
| `src/features/shadow-pin/hooks/useShadowPinActivityTracker.ts` | Add media/provider metadata to activity events. |
| `docs/SHADOW_PIN.md` | Document short video behavior and deployment. |
| `docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md` | Capture product decisions, architecture, rollout, env, and verification gates. |
| `tests/ShadowPin.test.tsx`, `tests/useShadowPinHeartOptimism.test.tsx` | Update ShadowPin expectations and add mixed video pin coverage. |

## Current Status

- Implemented and deployed: schema, service surface, frontend API,
  feed/viewer UI, docs, tests, Supabase migration, Supabase Edge Function, and
  Netlify production build.
- Verified: lint, typecheck, build, focused Jest, full Jest, preview mobile
  smoke, production smoke, remote migration status, Edge Function listing, and
  a live native Bunny upload with cleanup.
- Remaining optional follow-up: configure `BUNNY_STREAM_PULL_ZONE_URL` for
  direct CDN playback URLs and run real-device iOS Safari / Android Chrome
  autoplay and audio gesture validation.
