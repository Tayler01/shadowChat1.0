# ShadowPin Short Video Roadmap

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This feature guide is current for the shipped product surface, with any known hardening or polish follow-ups tracked in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

## Product Target

ShadowPin video pins are first-class pins mixed directly with image pins in the
existing category feed. There is no separate video feed, category mode, or
filter. The newest created pins still sort first.

## V1 Decisions

- Native uploads: MP4, MOV, WebM, and common mobile video MIME types.
- Limits: 60 seconds max, 150 MB max, 5 native video uploads per user per day.
- Category covers stay image-only.
- Video assets may be publicly reachable CDN URLs.
- Feed videos autoplay muted, loop, and pause when scrolled out of focus.
- A single tap opens the existing detail overlay; video pins expose a mute /
  unmute control there.
- The radial open action and double tap open a full-screen viewer. Native
  videos load the higher-quality playback URL there.
- Failed or processing native videos are visible to their creator and app
  operators only. Other users see only ready videos.
- Admin Shadow Pin Activity records video pins through the same pin activity
  events as image pins, with `media_type` and `provider` metadata.
- Normal edit, delete, heart, share, and replace flows remain available.

## Architecture

The existing `shadow_pin_images` table remains the canonical pin table. It now
stores image, native video, and external video pins via media metadata columns.
This avoids a second activity, hearts, score, category, and moderation surface.

Native video uploads use Bunny Stream because ShadowChat already has a Bunny
TUS upload path for Shado TV. The browser captures a poster image, stores that
poster in Supabase Storage, asks the `shadow-pin-video` Edge Function for a
Bunny upload session, then uploads the video directly to Bunny with TUS.

External video pins use embeds or direct playback URLs where rehosting is not a
good first version fit. YouTube Shorts get iframe playback. Pinterest video
pins use direct `pinimg.com` MP4/HLS URLs when the page exposes them so masonry
autoplay can use native muted video playback. X and Instagram remain
best-effort embed/open-source behavior because their autoplay/embed behavior is
provider-controlled.

## Data Flow

1. User creates or replaces a pin with a file or URL.
2. Image files and image URLs continue through the existing ShadowPin image
   path.
3. Native video files validate size and duration client-side before upload.
4. Native video poster is uploaded to the public `shadow-pin` bucket.
5. `shadow-pin-video` creates or updates the pin row with `processing_status =
   processing` and returns Bunny TUS credentials.
6. Browser uploads the video to Bunny Stream.
7. The app periodically calls `sync-status` for processing video pins visible to
   the creator/operator.
8. Ready videos become public. Failed videos remain visible only to the
   creator/operator.

## Rollout Checklist

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Extend schema, RLS, hearts, score refresh for mixed media pins. | implemented |
| 2 | Add Bunny/external video Edge Function. | implemented |
| 3 | Add client create/replace/upload/sync API. | implemented |
| 4 | Add feed autoplay, audio toggle, and fullscreen viewer. | implemented |
| 5 | Update docs and focused tests. | implemented |
| 6 | Run lint, typecheck, build, targeted Jest, and mobile visual smoke. | passed |
| 7 | Apply migration and deploy `shadow-pin-video` to remote Supabase. | deployed |
| 8 | Deploy Netlify frontend/function changes and test a real upload. | deployed and verified |

## Environment

Required for native video uploads:

```text
BUNNY_STREAM_LIBRARY_ID
BUNNY_STREAM_API_KEY
```

Recommended for direct Bunny playback URLs:

```text
BUNNY_STREAM_PULL_ZONE_URL
```

If the pull-zone URL is missing, the function still creates Bunny embed URLs and
the app falls back to Bunny iframe playback. Direct pull-zone renditions remain
recommended for the smoothest masonry-feed autoplay.

Optional for Instagram oEmbed metadata:

```text
META_OEMBED_ACCESS_TOKEN
```

## Verification Gates

- `npm run lint`
- `npx tsc --noEmit -p tsconfig.app.json`
- `npm run build`
- `npx jest --runInBand tests/ShadowPin.test.tsx tests/useShadowPinHeartOptimism.test.tsx`
- Live production smoke: create a temporary category, upload a small native MP4
  through `shadow-pin-video` and Bunny TUS, sync to `ready`, then delete the
  pin, Bunny asset, and category.
- Preview-build mobile check on iPhone-sized Chromium viewport:
  - mixed image/video masonry order
  - muted autoplay focus behavior
  - pause offscreen
  - detail overlay sound toggle
  - fullscreen native video playback
  - failed processing visibility copy

Real-device validation is still recommended for installed PWA media autoplay
and audio gesture behavior on iOS Safari and Android Chrome.
