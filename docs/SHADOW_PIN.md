# ShadowPin

## Documentation Status - July 24, 2026

Updated for the ShadowPin social/discovery work shipped in Release A. The
production surface includes normalized tags, indexed cross-entity search,
threaded
comments, reciprocal personal-block enforcement, and recipient-owned in-app
plus Web Push notification paths. Use the latest successful `main` workflow and
health manifest for live build identity. Release A grant-revocation closeout is
deployed and the linked database contract is clean.

ShadowPin is a logged-in public pin board exposed as `Pins` in the mobile
bottom menu and desktop sidebar. The separate Boards domain is paused and
omitted from the production navigation; Pins opens ShadowPin directly.

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
- Up to eight normalized tags per pin and indexed search across pin text, tags,
  creator display identity, and category metadata.
- Threaded member comments/replies with creator/operator moderation.
- A mobile-first long-press radial menu with Share, Heart, Comment, and Open;
  pin creators and operators also receive Edit and Delete.
- Recipient-owned in-app notifications and background push for eligible new
  posts, comments, and replies.

## Data Model

Migration: `supabase/migrations/20260512203054_shadow_pin_domain.sql`
Score migration: `supabase/migrations/20260519020527_shadow_pin_hidden_score_gold_pin.sql`
Social/search migration: `supabase/migrations/20260710044050_shadow_pin_social_search.sql`
Comment reactions migration: `supabase/migrations/20260716213000_shadow_pin_comment_reactions.sql`
Notification Realtime publication: `supabase/migrations/20260710044500_publish_notification_events_realtime.sql`
Engagement hardening: `supabase/migrations/20260710044600_personal_blocking_engagement_hardening.sql`

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
- `shadow_pin_tags`: normalized unique tag slugs, limited to 30 characters.
- `shadow_pin_image_tags`: pin/tag join rows; creators and operators can manage
  a pin's tags through `set_shadow_pin_image_tags`.
- `shadow_pin_comments`: comment and parent-reply rows with 1-1000 character
  bodies, author edit rights, author/operator delete rights, and same-pin parent
  validation.
- `shadow_pin_comment_reactions`: member-owned emoji reactions with one row per
  comment/member/emoji. Reads inherit the visible-comment and reciprocal-block
  contract; the security-invoker toggle RPC keeps add/remove behavior atomic.
- `shadow_pin_images.comment_count`: trigger-maintained comment count.
- `notification_preferences.shadow_pin_new_post_enabled`,
  `shadow_pin_comment_enabled`, and `shadow_pin_reply_enabled`: independent
  delivery controls, defaulting to enabled.

The base migration creates the public Supabase Storage bucket `shadow-pin` with
a 15MB image limit and JPEG, PNG, WebP, and GIF MIME allow-list. Storage paths
are user-prefixed so authenticated users can upload only under their own folder.
Native video files are uploaded directly to Bunny Stream; ShadowPin stores the
poster image in Supabase Storage.

Migration
`20260724131717_restore_shadow_pin_upload_returning_select.sql` restores the
narrow authenticated SELECT policy required by Storage's upload response: a
creator can read only objects under their own top-level `shadow-pin` folder.
It does not expose bucket listing to other authenticated users; public delivery
continues through known public object URLs.

Migration
`20260724150115_abandon_deleted_shadow_pin_edit_drafts.sql` closes existing
Creator Studio edit receipts whose target Pin was soft-deleted. The client
shows Drafts / Needs attention only for a real unfinished new Pin or an edit
whose metadata or media differs from the still-live target; merely opening Edit
does not create a persistent attention warning.

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

Personal blocking is separate from operator moderation. A block is reciprocal
for ShadowPin visibility: blocked pairs cannot discover each other's categories
or pins, read or create comments across the pair, reply to each other, or
receive each other's ShadowPin notifications. The blocker alone can read and
manage their private block row.

Activity analytics are visible only to app operators in Settings > Admin >
Shadow Pin Activity. Normal users can record their own activity through a
guarded RPC but cannot read raw or aggregated analytics rows. The analytics
surface shows display names and usernames, not email addresses.

Known-id writes are guarded at the database boundary. Reciprocal blocks reject
category/image hearts, comment replies, and activity targets even if a caller
already knows the row id. Authenticated creators are limited to 12 posts per
minute and 100 per day.

## Activity Analytics

Shadow Pin activity tracking is logged-in only. Visits qualify after 5 seconds
in Shadow Pin. Category visits qualify after 3 seconds in a category. Pin views
count when a pin is visible in the grid for roughly 1 second and are deduped
once per session per pin.

The admin dashboard defaults to the last 7 days with today, 7-day, 30-day, and
90-day presets. It includes user, category, and pin chart tabs; spreadsheet-like
tables; range comparison deltas; and a filtered event timeline. The weighted
activity score is admin-only and separate from the public gold push-pin score.

Live telemetry is bounded to 120 activity events per minute and 120 sessions
per hour per user. Event metadata must be a JSON object no larger than 4 KB with
at most 24 keys, and creator/operator actions are checked against the target.

## Tags, Search, And Comments

`set_shadow_pin_image_tags` lowercases and normalizes requested text into
hyphenated slugs, removes duplicates while preserving first-seen order, and
enforces eight tags per pin with a 30-character maximum. Only the pin creator
or an app operator can change its tags.

`search_shadow_pin_images` runs as the signed-in caller and ranks matches from
pin title/description, tags, creator username/display name, and category
title/description. Existing ShadowPin, profile, and personal-block RLS remains
the visibility authority. The mobile search surface presents category and pin
results without exposing private profile fields.

Comments render as root discussions with one level of parent-linked replies.
Authors can edit their own comment; authors and app operators can delete.
Database checks keep replies on the same pin, reject replies to replies and
blocked reply targets, and maintain the pin's comment count after
insert/delete. Deleting a root leaves its replies on the pin as roots through
`ON DELETE SET NULL`; the dialog mirrors that promotion immediately.

The comment UI follows the same compact text-message language as General Chat:
author identity and time sit above a content-sized bubble, quick reactions open
from a deliberate tap without firing during scroll, and Copy, Reply, Add
Reaction, Edit, Delete, and the feature-gated Report action live in the shared
three-dot context menu rather than an always-visible action row.

Tags must finish a transaction attached to a pin. Deleting the last pin/tag
link removes the orphan tag, preventing direct tag-table spam.

## Notifications

When a pin first reaches `processing_status = 'ready'`, it creates one
`shadow_pin_post` event for every other eligible member. A processing insert
does not notify, and updating an already-ready pin does not fan out again.
Recipients who disabled new-post notifications or have a personal block with
the creator are excluded. A root comment creates a
`shadow_pin_comment` event for the pin creator; a reply creates a
`shadow_pin_reply` event for the parent author. Self-notifications are skipped.

`notification_events` is recipient-owned under RLS and is included in the
Supabase Realtime publication by
`20260710044500_publish_notification_events_realtime.sql`, allowing the signed-
in app to show live in-app toasts. After a successful client mutation, the
current `send-push` Function is invoked best-effort for background delivery.
ShadowPin in-app toasts inherit the normal four-second app timer and hide as
soon as their visible lifecycle ends, rather than remaining painted during the
toast removal delay.
The service enforces the recipient's master switch, temporary snooze, daily
quiet hours/timezone, matching ShadowPin type toggle, and reciprocal block
contract before contacting a push endpoint. Notification clicks route to
`/?view=pins`. Delivery responses expose aggregate counts only; transient
provider failures return retryable status and the client performs two bounded
retries, while permanently invalid subscriptions are removed.

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

Every new Bunny upload session is bound to the fresh server-created VideoId.
The client retries within that exact session and does not resume a file-based
tus fingerprint from an older Pin, which would leave the new asset empty.
Creator-draft discard is server-authoritative: successful draft abandonment
clears local recovery state even when best-effort provider or Storage cleanup
must be retried later. Untouched blank editing drafts do not produce the
`Needs attention` launcher pill.

## Image Layout

Category image views use a deterministic JavaScript masonry layout instead of
CSS multi-column layout. Phone widths render two columns, wider screens add
columns, and images are greedily assigned by aspect ratio so mixed image
heights keep the packed staggered flow without row gaps.

Do not replace this with CSS columns without Android Chromium verification; a
previous CSS-column version collapsed to a single visible column on Android. Do
not replace it with a row-locked grid either, because small images beside tall
images leave the gaps that the masonry layout is meant to avoid.

## ShadowPin Theater

ShadowPin Theater is the phone-first primary viewer for a Pin. A single card
tap opens an edge-to-edge, safe-area-aware dialog with horizontal paging,
visible Previous and Next controls, keyboard equivalents, accessible Heart,
Comment, Share, Details, and operator Edit actions, and exact
`/?view=pins&pin=<id>` history.

The viewer keeps category ordering deterministic by `(created_at DESC, id
DESC)`. Normal category sessions can request the next existing 30-Pin page near
the loaded boundary. Cold exact/search links are intentionally isolated from
offset pagination: they load only the target and one RLS-visible neighbor in
each direction, retain every visited Pin for reverse navigation, and never
sweep all intervening category pages.

Browser history has three deliberate layers. Opening Theater pushes a viewer
entry, paging replaces its Pin, and opening Comments pushes a comments entry.
Back therefore closes Comments, then Theater, then returns to the category.
Markerless cold links preserve their markerless state during paging and close
by URL replacement so Close cannot navigate out of ShadowChat.

Only active media mounts. Opening Comments replaces active video or an iframe
with its poster, and hidden-tab cleanup pauses native video. Third-party
interactive providers require consent for the current Theater session before
their iframe can mount. Image zoom has visible 48px controls; while zoomed,
horizontal Pin paging is disabled. A second touch cancels pending paging before
pinch zoom begins.

Comments render as a visual-viewport-aware bottom sheet. Reads use bounded
40-item `(created_at, id)` keyset pages. Exact comment links fetch the target
and missing parent without loading the full thread. Local mutation deltas patch
the trigger-maintained `comment_count`; a caller-visible RLS subset never
overwrites the canonical count.

## Local Testing

```powershell
npm run lint
npm run typecheck
npm run build
npx jest --runInBand tests/BoardBubbleMap.test.tsx
npx jest --runInBand tests/safeFetch.test.ts tests/safeFetchIntegrationContract.test.ts
npx jest --runInBand tests/ShadowPin.test.tsx tests/ShadowPinCommentsDialog.test.tsx tests/useShadowPinCommentNotifications.test.tsx tests/shadowPinSocialSql.test.ts tests/personalBlockingSql.test.ts tests/notificationDelivery.test.ts tests/pushDeliveryRetry.test.ts
npm run supabase:security-contract:local
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
- Background delivery is best-effort and still needs normal-device iPhone,
  Android, and desktop PWA proof after deployment. Do not create a production
  test pin casually: a new pin targets every eligible other member.

## Radial Controls

Press and hold a pin to lift it and open the thumb-friendly radial menu. Slide
to Share, Heart, Comment, or Open and release to select; creators and operators
also see Edit. Comment opens the same responsive ShadowPin conversation dialog
used by the visible comment-count control. The menu mirrors for the opposite
masonry column, clamps to the viewport, locks gesture scrolling only while
active, and confirms actions with the existing premium feedback treatment.
