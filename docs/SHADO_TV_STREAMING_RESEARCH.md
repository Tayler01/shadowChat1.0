# Shado TV Streaming Pipeline Research

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This document is historical context or planning evidence, not the current implementation checklist. Check [README.md](C:/repos/chat2.0/README.md:1), [AGENTS.md](C:/repos/chat2.0/AGENTS.md:1), and the audit backlog before using it for new work.

Last updated: 2026-05-17

This document compares Shado TV V1 video processing and playback options. It is
an approval gate: do not set up a new paid provider or wire production secrets
until the recommendation is approved.

## V1 Requirements Recap

- Authenticated ShadowChat users only.
- Admin/sub-admin native uploads from phone or desktop.
- 10-30 minute source videos, up to 1080p, with a source upload cap around 2 GB.
- HLS playback with smooth mobile streaming.
- Direct/resumable uploads where practical.
- Processing status: uploaded, queued, processing, ready, failed.
- Posters/thumbnails from custom uploads or generated fallback.
- External embeds supported, but native uploads are required for premieres.
- Premiere mode:
  - scheduled one-time premiere
  - everyone watches from the same timestamp
  - no rewind/scrub during premiere
  - locked again after premiere until full release
- Continue Watching only for fully released on-demand playback.
- Keep costs low where possible, but not at the cost of user experience.

## Current Repo Context

- The app already uses Netlify for the web app and Netlify Functions.
- Supabase remains the app database, auth, realtime, and storage backbone.
- The repo already has a Sharp-based Netlify media processor for images under
  `netlify/functions/_shared/shadow-pin-media.mjs`.
- Package dependencies include `sharp`, but not `ffmpeg`, `hls.js`, Mux, or a
  dedicated video SDK.
- Netlify Functions are a poor fit for 10-30 minute video transcodes. They can
  coordinate webhooks/tokens, but should not run the video encoder.

## Options Compared

### Option A - Mux Video plus Supabase

Use Mux for native uploaded video ingest, processing, storage, signed HLS
playback, and delivery. Use Supabase for Shado TV metadata, permissions,
release windows, admin management, watch progress, and external embeds.

Evidence from current official docs:

- Mux Direct Uploads let clients upload directly to Mux through authenticated
  upload URLs without using our server as a file relay:
  [Mux Direct Uploads](https://www.mux.com/docs/guides/upload-files-directly).
- Mux HLS playback uses playback IDs and `.m3u8` URLs:
  [Mux Play your videos](https://www.mux.com/docs/guides/play-your-videos).
- Mux supports public and signed playback policies, where signed playback uses
  server-generated JWTs:
  [Mux secure playback](https://www.mux.com/docs/guides/secure-video-playback).
- Mux pricing currently lists Basic input as free, 720p storage from
  `$0.0024/min/month`, 1080p storage at `1.25x`, and the first 100,000 delivery
  minutes free monthly:
  [Mux pricing](https://www.mux.com/pricing).

Pros:

- Best fit for the V1 user experience with the least custom infrastructure.
- HLS, signed playback, processing, thumbnails, and webhooks are first-class.
- Browser/mobile uploads do not pass through Netlify or Render.
- Good match for premiere enforcement because we can issue signed playback only
  when our Supabase release-state rules allow it.
- Likely low V1 cost for a small library because on-demand Basic input is free
  and delivery has a large monthly free tier.

Cons:

- New provider/account/secrets.
- Basic is on-demand only; true live streaming later would require a different
  quality/live path.
- Provider lock-in around video assets and playback IDs.

### Option B - Cloudflare Stream plus Supabase

Use Cloudflare Stream for upload, processing, signed HLS playback, and delivery.
Use Supabase for product metadata and release rules.

Evidence from current official docs:

- Cloudflare Stream bills on minutes stored and minutes delivered, with ingress
  and encoding included:
  [Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/).
- Storage is sold in `$5 per 1,000 minutes stored` increments and delivery is
  `$1 per 1,000 minutes delivered`:
  [Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/).
- Direct creator uploads allow end users to upload directly without exposing the
  API token, and files over 200 MB must use TUS:
  [Cloudflare Direct Creator Uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/).
- Cloudflare exposes HLS manifests for custom players:
  [Cloudflare own player](https://developers.cloudflare.com/stream/viewing-videos/using-own-player/).
- Cloudflare Stream supports signed URL tokens:
  [Cloudflare Stream API token endpoint](https://developers.cloudflare.com/api/resources/stream/).

Pros:

- Simple pricing model by video minutes, not file size.
- Encoding and bandwidth are included in Stream billing dimensions.
- TUS direct upload is a good mobile upload fit.
- Strong if we want Cloudflare ecosystem later.

Cons:

- The `$5/1,000 stored minutes` increment can be more expensive than Mux at very
  small scale.
- Requires Cloudflare account/product setup.
- We still need to implement Supabase-side release-state/token mediation.

### Option C - Bunny Stream plus Supabase

Use Bunny Stream for upload, transcoding, storage, CDN, and playback; use
Supabase for metadata and release rules.

Evidence from current official docs:

- Bunny Stream pricing advertises free encoding, storage from `$0.01/GB`, CDN
  from `$0.005/GB`, and a low monthly minimum:
  [Bunny Stream pricing](https://bunny.net/pricing/stream/).
- Bunny Stream API manages videos and playback:
  [Bunny Stream API](https://docs.bunny.net/api-reference/stream).
- Bunny supports TUS resumable/presigned uploads:
  [Bunny TUS uploads](https://docs.bunny.net/stream/tus-resumable-uploads).
- Bunny documents HLS playlist URLs for stored videos:
  [Bunny storage structure](https://docs.bunny.net/stream/storage-structure).

Pros:

- Lowest apparent raw storage/CDN cost.
- Free encoding and TUS upload support.
- Good candidate if cost becomes the dominant concern.

Cons:

- More integration risk around signed/authenticated HLS compared with Mux or
  Cloudflare.
- Costs are GB-based, so high-bitrate source/output choices matter more.
- Needs additional security validation before we trust it for authenticated-only
  Shado TV playback.

### Option D - Render worker plus Supabase Storage or Cloudflare R2

Build our own pipeline with FFmpeg on a Render Background Worker or Web Service.
Store HLS outputs in Supabase Storage or Cloudflare R2.

Evidence from current official docs:

- Render paid service sizes start at `$7/month` for Starter and `$25/month` for
  Standard, with background workers supported:
  [Render pricing](https://render.com/pricing/).
- Render persistent disks are listed at `$0.25/GB/month`, and bandwidth over
  included quotas is listed at `$0.15/GB`:
  [Render pricing](https://render.com/pricing/).
- Supabase Storage is `$0.021/GB/month` over plan quota, and Supabase Pro
  includes 100 GB storage:
  [Supabase Storage pricing](https://supabase.com/docs/guides/storage/pricing).
- Cloudflare R2 is S3-compatible, has no egress charge, and standard storage is
  `$0.015/GB/month`:
  [Cloudflare R2](https://www.cloudflare.com/products/r2/).

Pros:

- Most control over FFmpeg presets, storage layout, and long-term portability.
- Can keep more of the app under familiar infrastructure.
- R2 can reduce delivery-cost risk if we build tokenized HLS correctly.

Cons:

- Highest engineering and operational risk for V1.
- We would own FFmpeg jobs, retries, thumbnails, manifests, cleanup, signed HLS
  segment access, queueing, logs, worker scaling, and failure handling.
- Render bandwidth or Supabase egress can become expensive if video delivery is
  routed through the wrong place.
- Authenticated HLS is easy to get subtly wrong because the manifest and every
  segment request must be authorized.

## Recommendation For V1

Use **Mux Video Basic plus Supabase** for V1 native uploads.

Why:

- It satisfies the required user experience without making us build a video
  platform before we build Shado TV.
- It supports direct browser uploads, HLS playback, signed playback, processing
  lifecycle, and webhooks.
- The V1 feature is on-demand video with a synchronized-premiere rule, not true
  live broadcasting, so Mux Basic is a good fit.
- Current pricing appears favorable for a small V1 library: Basic input is free,
  storage is minute-based, and the first 100,000 delivery minutes are free each
  month.
- Supabase stays the source of truth for auth, admin/sub-admin access, channel
  CRUD, release states, premiere windows, and watch progress.

Recommended fallback if the user prefers the Cloudflare ecosystem:

- **Cloudflare Stream plus Supabase**. It is still a good V1 choice, just likely
  a little less cost-efficient at tiny scale because storage is bought in
  1,000-minute increments.

Not recommended for V1:

- **Render + self-hosted FFmpeg**. It is technically viable, but it delays the
  product and puts too much video-infrastructure responsibility on us before we
  know Shado TV usage patterns.

## Proposed V1 Architecture With Mux

### Native Upload Flow

1. Admin/sub-admin creates a Shado TV video draft in Supabase.
2. App calls an authenticated backend endpoint to request a direct upload URL.
3. Backend verifies admin/sub-admin role and creates a Mux Direct Upload with a
   signed playback policy.
4. Browser uploads directly to Mux.
5. Mux webhook notifies our backend when upload/asset processing changes state.
6. Backend updates `shado_tv_videos` and `shado_tv_video_assets` with provider
   IDs, duration, status, aspect ratio, playback ID, and errors.
7. Once ready, admins can schedule trailer release, premiere, and full release.

### Playback Flow

1. Viewer opens a video page.
2. App asks the backend for a playback descriptor.
3. Backend checks auth and Supabase release-state rules.
4. For native videos, backend returns a short-lived signed HLS URL only when
   watch is allowed.
5. Player uses:
   - native HLS on iPhone/Safari when supported
   - `hls.js` on Chromium/Android if we choose a custom `<video>` player
6. During premiere mode:
   - backend returns the server-computed current timestamp
   - player starts at that timestamp
   - app disables scrubbing and corrects seek attempts back to live timestamp
   - progress is not saved
7. During full release:
   - normal seek/scrub is allowed
   - watch progress saves to Supabase

### External Embed Flow

1. Admin creates a video with source type `external_embed`.
2. App stores canonical URL, provider, embed URL, poster, and schedule metadata.
3. Shado TV embeds inside the themed video page when allowed by the provider.
4. If embed fails or is blocked, the page shows a themed "Open video" fallback.
5. External embeds do not support synced premiere mode in V1.

## Approval Needed

Before implementation wires provider-specific code or secrets, approve one:

1. `Mux Video Basic + Supabase` - recommended V1 path.
2. `Cloudflare Stream + Supabase` - simpler Cloudflare ecosystem path.
3. `Bunny Stream + Supabase` - lowest apparent raw cost, needs extra auth proof.
4. `Render/R2/Supabase self-managed HLS` - most control, not recommended for V1.
