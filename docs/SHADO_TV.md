# Shado TV

Shado TV is the planned immersive streaming application inside the ShadowChat
Entertainment area. It is not a game. It should feel like a full mobile-first
retro cinema app with its own visual system, admin-managed channels, native
video uploads, external embeds, and smooth authenticated playback.

Planning baseline date: 2026-05-17.

## Current Status

As of 2026-05-17:

- The Cinema Marquee first-pass asset suite is approved.
- Twenty optimized WebP assets are committed under
  `public/entertainment/shado-tv/`.
- The first static Shado TV shell is wired into Entertainment with seeded
  placeholder channels/videos, a Shado TV home screen, channel detail screen,
  video detail/player screen, and an admin studio placeholder screen.
- The Supabase Shado TV domain is applied to the linked project with five
  seeded channels, five seeded videos, five home features, RLS, explicit
  authenticated grants, and realtime publication for channels/videos/features.
- Admin/sub-admin studio controls can create channels/videos, publish or hide
  them, soft-delete them, and restore deleted items as hidden drafts.
- The Shado TV player shell supports release-state-aware playback UI, external
  embed rendering with an open-link fallback, and a Supabase-backed Continue
  Watching contract through `shado_tv_watch_progress`.
- The mobile QA harness includes Shado TV home, channel, and video navigation.
- Foreground headed mobile QA passed across iPhone/WebKit and
  Android/Chromium phone profiles with
  `node scripts/mobile-pwa-visual-qa.mjs --run-name=shado-tv-polish-final2-headed-20260517 --no-reuse-server --headed --slow-mo=70`.
- Supabase smoke-post cleanup was verified after QA: matching group, DM, and
  board-chat test message counts were all `0`.
- Supabase advisor follow-up: the initial Shado TV migration was followed by
  `20260517230544_shado_tv_rls_policy_consolidation.sql`; after that, the
  performance advisor returned no `shado_tv` findings.
- The next gated implementation decision is the native video provider. The
  current recommendation is Mux Video Basic plus Supabase, but no
  provider-specific secrets or paid service setup should be added until that is
  approved.

## Product Direction

- Theme: Cinema Marquee, black velvet, warm gold theater lights, ticket-style
  channel cards, poster art, subtle analog broadcast texture, and premium dark
  ShadowChat polish.
- Entry point: Shado TV appears as a selector card inside the existing
  Entertainment page, alongside Shadow War and Shadow Checkers.
- Immersive mode: opening Shado TV hides the normal ShadowChat menu bar and uses
  a Shado TV-specific header with a bare back arrow to return to Entertainment.
- V1 screens:
  - Home
  - Channel detail
  - Video detail/player
  - Admin management
- Normal users: browse and watch only.
- Admin/sub-admin users: create, edit, hide, restore, and delete channels and
  videos from inside Shado TV through a header gear.
- Authentication: no Shado TV content is public. Users must be signed in.

## V1 Scope Decisions

### Channels

- Channel creation and management is admin/sub-admin only in V1.
- Channels can be draft/hidden while admins work on them.
- Published channels are visible to all signed-in users.
- Channels auto-sort by most recently uploaded or updated visible video.
- Empty channels have lowest priority.
- Channel pages have a custom hero/banner area, then videos newest-first.
- Channel artwork supports multi-asset uploads with a simple mode that can
  derive all needed variants from one uploaded image.
- Dynamic channel artwork must be processed into optimized derivatives for fast
  mobile loading.

### Videos

- V1 supports two video source types:
  - Native uploads managed and processed by Shado TV.
  - External embeds/links, displayed inside the themed Shado TV experience when
    the provider allows it, with an open-source fallback when embedding is
    blocked.
- Native uploads are admin/sub-admin only in V1.
- Native source uploads should be capped around 1080p and about 2 GB unless the
  final pipeline research recommends a better guardrail.
- Target video length is 10-30 minutes.
- Both horizontal and vertical videos must be supported.
- Video pages use orientation-aware framing:
  - horizontal videos in a 16:9 marquee player
  - vertical videos in a centered 9:16 theater frame
  - unknown/loading state in a neutral 16:9 placeholder
- Fullscreen playback is required. Native browser fullscreen controls are fine.
- Background playback can be supported best-effort where mobile browsers allow
  it, but it is not a hard guarantee.
- Captions and analytics are out of scope for V1.

### Premieres And Release States

- Premieres apply only to native uploaded videos.
- External embeds can have scheduled visibility/release metadata, but not synced
  premiere playback in V1.
- A native video can have:
  - optional trailer
  - poster/thumbnail visible before release
  - trailer release time
  - one premiere time
  - full public release time
- Premiere flow:
  1. Before trailer release: poster/thumbnail can be visible, full video locked.
  2. After trailer release: trailer is watchable if provided, full video locked.
  3. During premiere: everyone watches from the same timestamp.
  4. During premiere: late joiners jump to the current shared timestamp.
  5. During premiere: no rewind or scrubbing.
  6. After premiere before full release: locked again, trailer only.
  7. After full release: normal on-demand playback.
- Continue Watching / resume applies only to fully released on-demand playback,
  not premiere mode.

### Playback Contract

The app shell now has a provider-neutral playback boundary:

- `external_embed` videos can render in the Shado TV theater frame when an
  embeddable URL is available.
- External videos also expose an `Open` fallback for providers or URLs that do
  not allow iframe playback.
- `native_upload` videos intentionally do not fake playback before a provider is
  approved. They display the release/processing state and wait for the future
  playback descriptor.
- Watch progress is stored in `public.shado_tv_watch_progress` by signed-in
  user and video. The home screen can render a Continue Watching rail when
  progress exists.
- Progress writes are allowed only for released, published videos by RLS.
- The future native HLS implementation should plug into the current video page
  by saving real `<video>` `currentTime` updates through the existing
  `saveShadoTvWatchProgress` API helper.

### Home Page Featuring

- Admins control one prime featured / now-playing video for the Shado TV home.
- Admins control the videos shown in the Featured row below channels.
- Featured/prime settings are home-page-level only, not per-channel.
- Channel videos still sort newest-first inside their own channel page.

## Asset Strategy

Shipped static Shado TV theme assets should be committed to the repo, following
the existing game pattern:

- final assets: `public/entertainment/shado-tv/...`
- feature manifest: `src/features/entertainment/shado-tv/assets/manifest.ts`
- detailed generation ledger: `docs/qa/shado-tv-asset-log.md`

Admin-uploaded channel and video assets should live in Supabase Storage and be
processed into fast-loading derivatives by the backend media pipeline.

The first implementation phase was asset-library-first and is now approved:

1. Create the full asset manifest and prompt list.
2. Generate a full first-pass suite as individual assets.
3. Optimize assets into production WebP files.
4. Record prompts, generated source paths, final repo paths, dimensions, sizes,
   usage, and approval status.
5. Get user approval before deeper app implementation.

Status: completed and approved on 2026-05-17. Production app code should use
the optimized WebP paths, not the raw generated review images under `output/`.

## Static Asset Manifest

The first Shado TV asset pass should include:

| Asset ID | Purpose | Target path | Shape |
| --- | --- | --- | --- |
| `shado-tv-picker-banner` | Entertainment selector card background | `public/entertainment/shado-tv/picker-banner.webp` | wide responsive art, safe crop from 16:9 to tall mobile card |
| `shado-tv-logo-marquee` | Main Shado TV logo/header art with readable text | `public/entertainment/shado-tv/logo-marquee.webp` | wide transparent or dark-backed banner |
| `shado-tv-home-backdrop` | App home background texture | `public/entertainment/shado-tv/home-backdrop.webp` | portrait mobile backdrop |
| `shado-tv-marquee-frame` | Reusable hero/player marquee frame | `public/entertainment/shado-tv/marquee-frame.webp` | wide UI frame, low text |
| `shado-tv-ticket-classic` | Channel ticket template, cream/gold | `public/entertainment/shado-tv/tickets/classic.webp` | vertical ticket |
| `shado-tv-ticket-neon` | Channel ticket template, muted red/pink | `public/entertainment/shado-tv/tickets/neon.webp` | vertical ticket |
| `shado-tv-ticket-rewind` | Channel ticket template, teal/blue | `public/entertainment/shado-tv/tickets/rewind.webp` | vertical ticket |
| `shado-tv-ticket-late` | Channel ticket template, green/sage | `public/entertainment/shado-tv/tickets/late.webp` | vertical ticket |
| `shado-tv-ticket-pixel` | Channel ticket template, purple | `public/entertainment/shado-tv/tickets/pixel.webp` | vertical ticket |
| `shado-tv-channel-hero-fallback` | Channel banner fallback | `public/entertainment/shado-tv/channel-hero-fallback.webp` | wide hero |
| `shado-tv-poster-classic-cinema` | Seed video poster placeholder | `public/entertainment/shado-tv/posters/classic-cinema.webp` | 2:3 poster |
| `shado-tv-poster-neon-nights` | Seed video poster placeholder | `public/entertainment/shado-tv/posters/neon-nights.webp` | 2:3 poster |
| `shado-tv-poster-retro-rewind` | Seed video poster placeholder | `public/entertainment/shado-tv/posters/retro-rewind.webp` | 2:3 poster |
| `shado-tv-poster-late-shift` | Seed video poster placeholder | `public/entertainment/shado-tv/posters/late-shift.webp` | 2:3 poster |
| `shado-tv-poster-pixel-planet` | Seed video poster placeholder | `public/entertainment/shado-tv/posters/pixel-planet.webp` | 2:3 poster |
| `shado-tv-thumbnail-horizontal` | Generic 16:9 video fallback | `public/entertainment/shado-tv/placeholders/video-horizontal.webp` | 16:9 |
| `shado-tv-thumbnail-vertical` | Generic 9:16 video fallback | `public/entertainment/shado-tv/placeholders/video-vertical.webp` | 9:16 |
| `shado-tv-empty-channel` | Empty channel state | `public/entertainment/shado-tv/placeholders/empty-channel.webp` | wide or square |
| `shado-tv-processing` | Processing/upload status art | `public/entertainment/shado-tv/placeholders/processing.webp` | wide or square |
| `shado-tv-locked-premiere` | Locked countdown/trailer state | `public/entertainment/shado-tv/placeholders/locked-premiere.webp` | wide hero |

Only `shado-tv-logo-marquee` should contain required readable text. Other
assets should be reusable and mostly text-free so real channel and video labels
can be rendered by the app.

## Dynamic Media Pipeline

The goal will research and choose the final streaming pipeline before new paid
services are set up. Cost should be kept low where possible, but not at the
expense of smooth mobile playback.

Current research and recommendation:

- [docs/SHADO_TV_STREAMING_RESEARCH.md](C:/repos/chat2.0/docs/SHADO_TV_STREAMING_RESEARCH.md:1)

The recommended V1 path is Mux Video Basic plus Supabase, pending user approval.
Cloudflare Stream plus Supabase is the preferred fallback if the user wants the
Cloudflare ecosystem. No provider-specific secrets or paid service setup should
be added before approval.

Required pipeline capabilities:

- direct admin upload from phone or desktop
- asynchronous processing with status
- clear processing states: uploaded, queued, processing, ready, failed
- limited automatic retry and manual retry after failure
- poster/thumbnail generation from video when custom art is absent
- custom poster/banner/image uploads
- HLS output for native videos
- recommended renditions:
  - 360p
  - 720p
  - conditional 1080p when useful
- storage cleanup for deleted assets
- soft-delete first, hide immediately, async storage cleanup later
- admin restore for soft-deleted channels/videos while assets remain

## Candidate Data Model

The implementation should inspect existing admin/sub-admin helpers before final
SQL, but Shado TV likely needs a dedicated domain:

- `shado_tv_channels`
- `shado_tv_videos`
- `shado_tv_video_sources`
- `shado_tv_video_assets`
- `shado_tv_processing_jobs`
- `shado_tv_home_features`
- `shado_tv_watch_progress`

All tables in the public exposed schema need RLS. Normal users can read
published/available content only. Admin/sub-admin users can manage draft,
hidden, deleted, and processing content through approved policies/RPCs.

## Implementation Phases

Phases should run back-to-back under the active Shado TV goal, with foreground
mobile QA checkpoints where useful.

1. Asset library and docs: completed 2026-05-17.
   - finalize this spec and the asset log
   - generate first-pass assets
   - optimize into repo paths
   - get user approval
2. App shell: initial static shell completed 2026-05-17.
   - create `src/features/entertainment` structure
   - add Shado TV to the Entertainment selector
   - build Home, Channel, Video, and Admin screens with seeded placeholder data
3. Backend domain and admin CRUD: completed 2026-05-17 for v1 catalog
   management.
   - add migrations/RLS for channels, videos, features, progress, and jobs
   - seed editable placeholder channels/videos
   - implement admin/sub-admin management
4. Streaming pipeline research and approval: research drafted, approval pending.
   - compare familiar-stack options, such as Render/Supabase Storage, with
     managed video services
   - present recommendation and costs before any new service setup
5. Video processing and playback:
   - implement approved native upload/processing path
   - support external embed-first playback with fallback
   - implement release states, premieres, and watch progress
6. Verification and shipping:
   - run lint/typecheck/build
   - run targeted Jest
   - run foreground iPhone/WebKit and Android/Chromium QA
   - clean all generated test data/posts
   - update docs and push to `main`

## Out Of Scope For V1

- user comments/social features around premieres
- captions/subtitles
- analytics dashboards
- push reminders for upcoming premieres
- public unauthenticated viewing
