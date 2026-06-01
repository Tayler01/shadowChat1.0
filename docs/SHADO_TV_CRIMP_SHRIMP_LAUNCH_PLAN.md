# Shado TV Crimp & Shrimp Launch Plan

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This document is historical context or planning evidence, not the current implementation checklist. Check [README.md](C:/repos/chat2.0/README.md:1), [AGENTS.md](C:/repos/chat2.0/AGENTS.md:1), and the audit backlog before using it for new work.

This plan tracks the work needed to move Shado TV from the old multi-channel
placeholder surface to the single-series Crimp & Shrimp launch hub.

## Launch Scope

- Public viewer is a series hub for `The Crimp & Shrimp Show`.
- Episode 1 is `The Chicken Snatchers`.
- Admins and sub-admins manage all episode text, dates, artwork, trailer video,
  episode video, cast text, update text/dates, visibility, hide, delete, and
  restore controls from Settings.
- Bunny Stream handles trailer and episode video hosting.
- The first launch state is coming soon with countdowns, trailer release,
  premiere, then now-streaming availability.

## Required Secrets

Store real values only in `.env`, deployment environment variables, and Supabase
Edge Function secrets. Do not expose them through `VITE_*`.

- `BUNNY_STREAM_LIBRARY_ID`: required before real Bunny upload testing.
- `BUNNY_STREAM_API_KEY`: required for server-side video creation/signing.
- `BUNNY_STREAM_SIGNING_KEY`: optional, only needed if private signed playback
  is enabled later.

## Content Assets

- Series hero: `public/entertainment/shado-tv/crimp-shrimp/series-hub-hero.webp`
- Countdown/status background:
  `public/entertainment/shado-tv/crimp-shrimp/status-coming-soon-bg.webp`
- Episode frame:
  `public/entertainment/shado-tv/crimp-shrimp/featured-episode-frame.webp`
- Episode 1 cover:
  `public/entertainment/shado-tv/crimp-shrimp/episode-1-cover.webp`
- Trailer promo test video:
  `output/shado-tv-remotion/crimp-shrimp-trailer.mp4`
- Main upload promo test video:
  `output/shado-tv-remotion/crimp-shrimp-main-upload-promo.mp4`

The MP4 files are ignored local artifacts for upload testing. Their Remotion
source is committed under `src/remotion`.

## Admin Workflow

1. Open Settings, Admin, Shado TV Studio.
2. Create or select the Crimp & Shrimp series episode.
3. Edit episode title, label, description, release state, runtime, and dates.
4. Upload the episode cover and thumbnail as needed.
5. Upload the trailer video to Bunny.
6. Upload the episode/main video to Bunny.
7. Publish the episode after verifying the viewer state.
8. Edit Cast and Updates tabs for global show-page text/date blocks.
9. Use Hide or Delete to confirm hidden/deleted content disappears from the
   viewer catalog.

## Bunny Upload Flow

1. Admin selects a trailer or episode video file.
2. The app calls the `shado-tv-bunny-upload` Edge Function.
3. The Edge Function checks the Supabase session and `is_app_operator`.
4. The Edge Function creates the Bunny video using `BUNNY_STREAM_API_KEY`.
5. The Edge Function returns TUS upload headers and an embed URL.
6. The browser uploads directly to Bunny with `tus-js-client`.
7. The app calls the Edge Function again to mark upload completion.
8. The Shado TV row stores Bunny provider metadata and the public embed URL.

## Production Rollout

1. Verify no real Bunny values are present in tracked files.
2. Push the Crimp & Shrimp launch migration.
3. Deploy `shado-tv-bunny-upload`.
4. Set Supabase secrets:
   - `BUNNY_STREAM_LIBRARY_ID`
   - `BUNNY_STREAM_API_KEY`
   - optional `BUNNY_STREAM_SIGNING_KEY`
5. Build and deploy the app.
6. Run public viewer checks on mobile and desktop.
7. Run admin Studio checks with a sub-admin account.
8. Upload the trailer promo and main upload promo to Bunny.
9. Confirm trailer page, episode page, hidden state, delete state, and restore
   state.
10. Push code after verification.

## Verification Checklist

- `npm run lint`
- `npx tsc --noEmit -p tsconfig.app.json`
- `npm run build`
- `supabase db push --dry-run`
- `supabase migration list --linked`
- Remotion composition list and MP4 render checks
- Mobile viewer screenshot: home and episode page
- Admin Studio render and button/input availability
- Bunny upload test after `BUNNY_STREAM_LIBRARY_ID` is available
- Production smoke after deploy
