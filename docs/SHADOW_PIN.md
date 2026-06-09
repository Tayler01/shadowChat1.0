# ShadowPin

## Documentation Status - June 8, 2026

Updated after the June 8, 2026 shared safe-fetch and Instagram preview hardening. Repo code now uses the shared safe-fetch contract for ShadowPin image/video URL ingestion paths. Remote function inventory during the evening doc-freshness pass showed `shadow-pin-video` deployed on June 8, while `shadow-pin-import-image` still showed an older deployment timestamp; redeploy and smoke the image import function before claiming production image-import safe-fetch coverage.

ShadowPin is a logged-in public pin board exposed as `Pins` in the mobile
bottom menu and desktop sidebar. Boards stays its own menu item; Pins opens the
same ShadowPin surface directly.

Short video planning and rollout details live in
[`docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md`](C:/repos/chat2.0/docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md:1).

## V1 Scope

- Public categories for authenticated users.
- Public image and short video pins inside categories.
- Device upload or server-side URL import for category covers, category cover replacement, and image pins.
- Native short video uploads through Bunny Stream, plus external video pins for
  YouTube Shorts, X, Pinterest, Instagram, and direct video URLs where possible.
- One heart per user per category or image.
- Creator/operator edit and soft delete controls.
- Hidden score ledger for the public gold push-pin identity badge.
- Admin-only activity analytics for visits, category dwell, pin visibility,
  opens, hearts, shares, creation, edits, and deletes.
- No realtime, notifications, comments, tags, search, or filters.

## Data Model

Migration: `supabase/migrations/20260512203054_shadow_pin_domain.sql`
Score migration: `supabase/migrations/20260519020527_shadow_pin_hidden_score_gold_pin.sql`

- `shadow_pin_categories`: category metadata, cover asset, soft delete fields,
  heart count, and `latest_image_created_at` for mobile category ordering.
- `shadow_pin_images`: canonical pin metadata for image, native video, and
  external video pins; image/poster asset fields; optional `category_id` for
  admin orphaning; soft delete fields; heart count.
- `shadow_pin_category_hearts`: one heart per user/category.
- `shadow_pin_image_hearts`: one heart per user/image.
- `private.shadow_pin_scores`: hidden per-user score totals. Authenticated
  clients cannot read this ledger.
- `users.shadow_pin_gold_pin`: public winner flag used for the gold push-pin
  badge next to the current top scorer's name.
- `shadow_pin_activity_sessions`: logged-in Shadow Pin sessions with qualified
  visit state and active visible duration.
- `shadow_pin_activity_events`: raw append-only activity events with
  privacy-minimal snapshots for admin analytics.

The base migration creates the public Supabase Storage bucket `shadow-pin` with
a 15MB image limit and JPEG, PNG, WebP, and GIF MIME allow-list. Storage paths
are user-prefixed so authenticated users can upload only under their own folder.
Native video files are uploaded directly to Bunny Stream; ShadowPin stores the
poster image in Supabase Storage.

The mobile media derivative migration keeps `latest_image_created_at` current
with a trigger on `shadow_pin_images`. Category lists sort by newest added image
first, with empty categories below categories that have visible images.

## Hidden Score

ShadowPin image posts are worth 1 point. Non-self hearts received on image pins
are worth 2 points. Category covers and category hearts do not count toward the
score.

The score migration refreshes the private score ledger after visible image
changes and image-heart changes. Each refresh recomputes the current top scorer,
sets `users.shadow_pin_gold_pin = true` for that user, and clears the flag from
any previous top scorer. Ties break by total score, received image hearts, image
count, most recent scored activity, then user id for deterministic results.

## Permissions

ShadowPin uses the existing app admin model. `is_app_operator()` is used for admin-class actions, matching nearby operator tooling. Regular users can create categories/images and heart any visible item. Creators can edit their own content and delete their own images. Creators can delete a category only when it has no visible images. Operators can delete populated categories; child images are preserved and uncategorized by setting `category_id` to `NULL`.

Activity analytics are visible only to app operators in Settings > Admin >
Shadow Pin Activity. Normal users can record their own activity through a
guarded RPC but cannot read raw or aggregated analytics rows. The analytics
surface shows display names and usernames, not email addresses.

## Activity Analytics

Shadow Pin activity tracking is logged-in only. Visits qualify after 5 seconds
in Shadow Pin. Category visits qualify after 3 seconds in a category. Pin views
count when a pin is visible in the grid for roughly 1 second and are deduped
once per session per pin.

The admin dashboard defaults to the last 7 days with today, 7-day, 30-day, and
90-day presets. It includes user, category, and pin chart tabs; spreadsheet-like
tables; range comparison deltas; and a filtered event timeline. The weighted
activity score is admin-only and separate from the public gold push-pin score.

## URL Imports

Function: `supabase/functions/shadow-pin-import-image/index.ts`
Video function: `supabase/functions/shadow-pin-video/index.ts`

The Edge Function authenticates the caller, validates the URL through the
shared safe-fetch helper, rejects local/private/reserved hosts and unsafe
redirect hops, checks image MIME and size, copies the image into `shadow-pin`
Storage, then creates the category or image row. The frontend never hotlinks
pasted URLs.

Video-like URLs are routed to `shadow-pin-video`. YouTube Shorts get a playable
iframe URL. Pinterest video pins use direct `pinimg.com` MP4/HLS URLs when the
page exposes them so the feed can autoplay natively; other providers fall back
to provider metadata, embeds, and source links where available.
When a provider exposes a still preview for Instagram, X, or Pinterest, the
video function should copy that first-image poster into `shadow-pin` Storage
and point the card preview at the Shado-owned asset. If the copy is blocked,
the row may still keep provider metadata, but the frontend must fail over
through every candidate and render a nonblank placeholder instead of leaving a
broken image frame.

## Short Video Pins

Native video pins use Bunny Stream and the existing `tus-js-client` upload
pattern from Shado TV. The frontend validates common mobile video formats,
requires 60 seconds or less, rejects files over 150 MB, captures a poster, and
uploads the video directly to Bunny after the Edge Function creates the upload
session.

Feed playback is muted and focus-based. Detail overlays expose the sound toggle,
while the full-screen viewer loads the higher quality playback URL when one is
available. If the Bunny pull-zone URL is not configured, native Bunny uploads
fall back to Bunny iframe playback until direct rendition URLs are available.
Processing and failed videos are visible to creators and app operators, but
non-owners only see ready video pins.

## Image Layout

Category image views use a deterministic JavaScript masonry layout instead of
CSS multi-column layout. Phone widths render two columns, wider screens add
columns, and images are greedily assigned by aspect ratio so mixed image
heights keep the packed staggered flow without row gaps.

Do not replace this with CSS columns without Android Chromium verification; a
previous CSS-column version collapsed to a single visible column on Android. Do
not replace it with a row-locked grid either, because small images beside tall
images leave the gaps that the masonry layout is meant to avoid.

## Local Testing

```powershell
npm run lint
npm run typecheck
npm run build
npx jest --runInBand tests/BoardBubbleMap.test.tsx
npx jest --runInBand tests/safeFetch.test.ts tests/safeFetchIntegrationContract.test.ts
```

For remote use, apply the migration and deploy the Edge Function:

```powershell
supabase db push
supabase functions deploy shadow-pin-import-image
supabase functions deploy shadow-pin-video
npm run shadow-pin:backfill-media -- --apply
```

## Known V1 Limitations

- If derivative processing fails, ShadowPin keeps the uploaded/imported original available and marks the row as failed so the user can still see the cover or pin.
- Stored assets are preserved after soft deletes. A future cleanup job can archive old unused objects.
- Pull-to-refresh is not custom-built; views refetch on open/return and after mutations.

## Future UX Todo

- Explore a Pinterest-style mobile long-press action menu for image pins.
  Desired behavior: press and hold a pin image, tilt/lift the image, show a
  thumb-friendly radial action menu with heart, share, open/save-style actions,
  allow slide-to-select, then confirm the selected action with premium feedback
  such as a heart burst and subtle color wash over the image. Keep this
  mobile-first and verify on iPhone/WebKit and Android/Chromium so the gesture
  does not fight normal masonry scrolling, native image context menus, or
  existing tap-to-open behavior.
