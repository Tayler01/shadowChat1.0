# Boards News Feed And Scraper Runbook

This document describes the shipped News Feed board, its Supabase backend, and
the Render-hosted scraper that keeps the feed current.

## Product Shape

The old `News` tab has been rebuilt as `Boards`. Opening `view=news` still
routes to Boards for compatibility, but the app now writes `view=boards`.

The Boards landing surface is a low-friction draggable bubble map. Bubbles keep
motion after a drag, bounce gently against bounds, and pass diminishing force to
other bubbles on collision. The layout resets to the default arrangement each
time users open Boards from navigation.

Current boards are:

- `News Feed`: a shared today-only feed board populated by tracked X and Truth
  Social accounts. Users can open a nearly full-screen post modal, react, copy
  links, and share original links. Users cannot post messages in this feed.
- `News Chat`, `Investing Chat`, `Learning Chat`, `Crypto Chat`, `Vibe Coding`,
  `AI News`, and `Projects Chat`: public chat boards backed by the shared
  `board_chat_messages` table. They open with the latest 50 messages, lazy-load
  older history from the top of the scroller, and support text, link previews,
  edits, deletes, read cursors, unread dividers, and emoji reactions.
- `Art Board`: a static placeholder that currently renders `Coming soon`.

Opened boards use the primary Boards header with a clear back button. The feed
and chat surfaces intentionally do not render secondary title/refresh rows, so
the content starts directly under the primary board header.

News Feed remains intentionally isolated from the general chat, DMs, and board
chat message tables so the scraper does not disturb realtime chat contracts,
bridge behavior, push, or message history.

## Frontend Map

- [src/components/boards/BoardsView.tsx](C:/repos/chat2.0/src/components/boards/BoardsView.tsx:1): top-level Boards experience.
- [src/components/boards/BoardBubbleMap.tsx](C:/repos/chat2.0/src/components/boards/BoardBubbleMap.tsx:1): low-friction draggable board bubble map with collision transfer.
- [src/components/boards/BoardChat.tsx](C:/repos/chat2.0/src/components/boards/BoardChat.tsx:1): reusable board-chat surface.
- [src/components/news/NewsFeed.tsx](C:/repos/chat2.0/src/components/news/NewsFeed.tsx:1): today board rendering and refresh.
- [src/components/news/NewsFeedItem.tsx](C:/repos/chat2.0/src/components/news/NewsFeedItem.tsx:1): compact feed tile.
- [src/components/news/NewsFeedModal.tsx](C:/repos/chat2.0/src/components/news/NewsFeedModal.tsx:1): expanded post/media view.
- [src/components/news/NewsView.tsx](C:/repos/chat2.0/src/components/news/NewsView.tsx:1): compatibility wrapper for older imports.
- [src/components/news/NewsChat.tsx](C:/repos/chat2.0/src/components/news/NewsChat.tsx:1): compatibility wrapper for the News Chat board.
- [src/hooks/useBoardChat.tsx](C:/repos/chat2.0/src/hooks/useBoardChat.tsx:1): generic board-chat fetch, realtime, send/edit/delete, reactions, and cursor-facing message shape.
- [src/hooks/useBoardBadges.ts](C:/repos/chat2.0/src/hooks/useBoardBadges.ts:1): board unread counts and Sidebar/MobileNav badge count.
- [src/hooks/useNewsFeed.tsx](C:/repos/chat2.0/src/hooks/useNewsFeed.tsx:1): feed fetch, realtime, reactions, and seen state.
- [src/hooks/useNewsBadges.ts](C:/repos/chat2.0/src/hooks/useNewsBadges.ts:1): compatibility wrapper over board badges.
- [src/hooks/useNewsAdmin.ts](C:/repos/chat2.0/src/hooks/useNewsAdmin.ts:1): admin source management.

News source management lives in Settings > Admin > News Sources. It is shown
only to app operators with the `admin` or `sub_admin` role. Operators can add,
pause, re-enable, and delete tracked accounts from the scraper list. Full admins
manage the sub-admin list from Settings > Admin > Admin Access or directly from
a user's public profile popup. App operators can channel-ban users from General
Chat, individual chat boards, or `All Interaction` from the user's public
profile popup. Feed-specific bans are intentionally not exposed; `All
Interaction` blocks feed emoji reactions while preserving read access.

## Backend Map

Canonical schema is in
[supabase/migrations/20260430041621_news_tab_foundation.sql](C:/repos/chat2.0/supabase/migrations/20260430041621_news_tab_foundation.sql:1),
with follow-up migrations for admin bootstrap and normalized source handles.

Main tables:

- `board_catalog`: visible board metadata and moderation scope mapping.
- `board_chat_messages`: shared message stream for all chat boards.
- `board_chat_reactions`: per-user board-chat reactions, aggregated back onto
  `board_chat_messages`.
- `user_roles`: app-wide admin role table for `admin` and `sub_admin`.
- `news_sources`: tracked X/Truth accounts, cursors, health, and admin state.
- `news_feed_items`: normalized post snapshots for the today board.
- `news_feed_reactions`: per-user feed reactions, aggregated back onto items.
- `news_chat_messages`: legacy News Chat messages retained for compatibility.
- `news_chat_reactions`: legacy News Chat reactions retained for compatibility.
- `news_user_state`: per-user seen timestamps for feed/chat badge counts.
- `user_read_cursors`: per-user chat read cursors. Board chat uses
  `surface = 'board_chat'` and `scope_id = board slug`.
- `user_channel_bans`: app-wide moderation records that can block General Chat,
  individual chat boards, or all interaction.

Main RPCs:

- `is_app_operator`
- `upsert_news_source`
- `set_news_source_enabled`
- `hide_news_feed_item`
- `toggle_news_feed_reaction`
- `toggle_board_chat_reaction`
- `get_board_badge_counts`
- `mark_news_seen`
- `count_news_badge_items`
- `clear_expired_news_feed_items`
- `list_user_channel_bans`
- `set_user_channel_bans`

Realtime publication includes `news_feed_items`, `news_sources`,
`news_user_state`, `board_catalog`, `board_chat_messages`, `user_read_cursors`,
and `user_channel_bans`. The reaction detail tables are not published because
their RPCs aggregate reaction state back onto the published parent rows.

For the app-wide role model, see
[docs/ADMIN_ACCESS.md](C:/repos/chat2.0/docs/ADMIN_ACCESS.md:1).

## Feed Lifecycle

The scraper polls enabled rows in `news_sources`. It extracts multiple visible
post candidates, sorts them by numeric external ID first and timestamp second,
and compares them to `news_sources.last_seen_external_id`.

Rules:

- A source with no cursor stores only the latest visible post if it belongs to
  the current Eastern day.
- A source with a cursor stores every extracted candidate newer than the cursor
  and belonging to the current Eastern day.
- The cursor advances to the newest extracted post even if that post is not
  stored because it is older than today's Eastern board.
- `clear_expired_news_feed_items()` deletes feed items whose `visible_day` is
  before the current `America/New_York` date.
- Source cursors are not cleared daily, so old posts do not reappear after the
  board resets.

## Scraper Service

The worker lives in [services/news-scraper](C:/repos/chat2.0/services/news-scraper).
Production uses the Render blueprint in [render.yaml](C:/repos/chat2.0/render.yaml:1).

Required Render secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended Render values:

- `NEWS_SCRAPE_INTERVAL_MS=90000`
- `NEWS_SCRAPE_HEADLESS=true`
- Render plan `standard` or larger. Signed-in Playwright/Chromium scraping can
  exceed the 512 MB starter limit.

Optional browser/session values:

- `PINCHTAB_CDP_URL`
- `PINCHTAB_WS_ENDPOINT`
- `X_USERNAME`
- `X_EMAIL`
- `X_SECONDARY_IDENTIFIER`
- `X_PASSWORD`
- `X_AUTH_TOKEN`
- `X_CT0`
- `NEWS_X_COOKIE_HEADER`
- `NEWS_X_AUTH_STATE_PATH`
- `NEWS_X_SCROLL_STEPS`
- `NEWS_X_MAX_CANDIDATES`
- `TRUTH_USERNAME`
- `TRUTH_EMAIL`
- `TRUTH_PASSWORD`
- `NEWS_TRUTH_COOKIE_HEADER`
- `NEWS_TRUTH_AUTH_STATE_PATH`
- `NEWS_X_SHARED_CONTEXT=true`

The default path launches a fresh Playwright browser per source. This costs more
startup time but prevents one platform/session failure from poisoning every
source in the cycle. `NEWS_X_SHARED_CONTEXT=true` is available only as an
optimization experiment.

When X credentials are configured, the worker saves a successful login to
`NEWS_X_AUTH_STATE_PATH` and reuses that browser storage on later cycles. This
keeps Render from attempting a fresh login for every source on every poll.
If X blocks hosted password login, seed a trusted session with Render-only
secrets: either `X_AUTH_TOKEN` plus `X_CT0`, or `NEWS_X_COOKIE_HEADER`.
If Truth Social blocks hosted public scraping or password login, seed a signed-in
session with the Render-only `NEWS_TRUTH_COOKIE_HEADER` secret.

## Local Commands

Proof mode does not require Supabase credentials:

```powershell
npm run news:scrape:proof
```

Use specific proof handles:

```powershell
$env:NEWS_PROOF_X_HANDLE="OpenAI"
$env:NEWS_PROOF_TRUTH_HANDLE="realDonaldTrump"
npm run news:scrape:proof
```

Run one real Supabase-backed cycle:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
node services/news-scraper/src/index.mjs --once
```

Backfill recently missed posts after fixing credentials/session access:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
node services/news-scraper/src/index.mjs --backfill --hours 6
```

Run the continuous worker locally:

```powershell
npm run news:scraper
```

## Production Verification

Check source health:

```sql
select
  platform,
  handle,
  enabled,
  health_status,
  last_checked_at,
  last_success_at,
  last_seen_external_id,
  left(coalesce(last_error, ''), 220) as last_error
from public.news_sources
order by platform, handle;
```

Check today's feed:

```sql
select
  platform,
  author_handle,
  external_id,
  headline,
  posted_at,
  detected_at,
  jsonb_array_length(media) as media_count
from public.news_feed_items
where visible_day = ((now() at time zone 'America/New_York')::date)
  and hidden = false
order by detected_at desc;
```

Check the worker cadence by watching Render logs for lines like:

```text
Stored 1 x:<external_id> for <handle>
Skipped seen x:<external_id> for <handle>
Source truth:<handle> failed: ...
```

## Known Platform Realities

X logged-out profile pages can be partial or stale. Optional read-only X
credentials improve the chance of seeing the current timeline, but this project
does not use the paid X API.

Truth Social exposes Mastodon-style public API routes, but hosted worker IPs
can still be blocked before the profile/API path is usable. If a Truth source
reports `blocked` from Render even with credentials configured, treat that as an
infrastructure/network block and move the worker to a trusted browser/IP path
such as PinchTab CDP/WebSocket or a different allowed host.

As of April 30, 2026, the Render worker has been verified to recover X sources
with the per-source browser isolation patch. The Truth Social source was still
blocked by the hosted worker environment.

## Troubleshooting

`health_status = blocked` for Truth:

- Confirm `TRUTH_USERNAME` or `TRUTH_EMAIL` and `TRUTH_PASSWORD` are present in
  Render.
- Redeploy/restart the worker after changing secrets.
- If the same source still reports a block, use PinchTab or another trusted
  browser host, or seed `NEWS_TRUTH_COOKIE_HEADER` from a signed-in browser
  session, rather than repeatedly changing app code.

X sources grab the first post but never update:

- Confirm `NEWS_SCRAPE_INTERVAL_MS` is reasonable and Render logs show repeated
  cycles.
- Check `last_seen_external_id`; it should advance when a newer visible post is
  extracted.
- If `health_status = degraded` and `last_error` says the provider returned a
  stale timeline, the worker is polling but X is serving old logged-out profile
  content. Add `X_USERNAME`, optional `X_EMAIL`, and `X_PASSWORD`, or route the
  worker through PinchTab/a trusted browser session.
- After adding X credentials in Render, restart or redeploy the worker so it can
  create and reuse its saved X auth state.
- Pinned X posts are ignored for feed freshness. A pinned-only timeline is
  treated as degraded instead of being stored as a new feed item.
- Add `X_USERNAME`, optional `X_EMAIL`, and `X_PASSWORD` if logged-out X pages
  are stale.
- Review `last_error` for login challenge, blocked page, or extraction errors.

Old posts appear on the board:

- Confirm the source had no cursor before it was added. The initial bootstrap
  can store the latest visible post only if that post belongs to today Eastern.
- Confirm the worker is running the current commit and the feed row has the
  expected `visible_day`.

Feed is empty but sources are `ok`:

- The newest visible posts may be older than today's Eastern date. The cursor
  still advances so those old posts do not backfill the board later.
- Check `last_seen_at` and `last_success_at` to separate "no current post" from
  scraper failure.

Media does not display:

- The feed hotlinks source media. If a provider expires or blocks a media URL,
  the stored snapshot remains but the image may not render.
- Verify `media` contains at least one object with a public `url` or
  `thumbnail_url`.

## Related Docs

- [services/news-scraper/README.md](C:/repos/chat2.0/services/news-scraper/README.md:1)
- [docs/LINK_PREVIEWS.md](C:/repos/chat2.0/docs/LINK_PREVIEWS.md:1)
- [docs/DEPLOYMENT_GUIDE.md](C:/repos/chat2.0/docs/DEPLOYMENT_GUIDE.md:1)
- [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1)
