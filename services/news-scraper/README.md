# Shado News Scraper

Always-on browser worker for the News Feed. It polls enabled rows from `news_sources`, extracts the latest tracked X or Truth Social post, and writes normalized snapshots to `news_feed_items` with Supabase service-role credentials.

The worker is intentionally outside Supabase Edge Functions. Browser scraping is
long-running and stateful enough that a Render Docker worker is a better fit
than a short-lived function invocation.

## Local Proof

```powershell
npm run news:scrape:proof
```

Optional handles:

```powershell
$env:NEWS_PROOF_X_HANDLE="OpenAI"
$env:NEWS_PROOF_TRUTH_HANDLE="realDonaldTrump"
npm run news:scrape:proof
```

Proof mode does not require Supabase credentials. It exits non-zero unless both platforms return a stable external ID, text/headline, author data, media array, and source link.

## Runtime Environment

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEWS_SCRAPE_INTERVAL_MS` defaults to `90000`
- `NEWS_SCRAPE_HEADLESS` defaults to `true`; set `false` only for local debugging
- `PINCHTAB_CDP_URL` or `PINCHTAB_WS_ENDPOINT` may point the worker at a managed browser session
- `X_USERNAME`, `X_PASSWORD`, and optional `X_EMAIL` enable read-only X login for a more current timeline than logged-out profile pages expose
- `X_SECONDARY_IDENTIFIER` is optional; set it to the account email, phone, or username if X asks for an extra identifier before the password step
- `X_AUTH_TOKEN` and `X_CT0`, or `NEWS_X_COOKIE_HEADER`, can seed a trusted signed-in browser session when X blocks hosted password login. Set these only as Render secrets.
- `NEWS_X_AUTH_STATE_PATH` defaults to `.news-scraper/x-auth-state.json`; the worker saves a successful X login here and reuses it on later cycles
- `NEWS_X_SCROLL_STEPS` defaults to `1`; increase carefully if the worker needs to collect more visible X candidates per source
- `NEWS_X_MAX_CANDIDATES` defaults to `12`
- `TRUTH_USERNAME` or `TRUTH_EMAIL`, plus `TRUTH_PASSWORD`, are optional. The scraper now tries Truth's public profile/API path before attempting any login flow because hosted worker IPs may be blocked before the login form loads.
- `NEWS_X_SHARED_CONTEXT` defaults to `false`; set `true` only when deliberately testing a shared X browser context optimization

The production container uses a Playwright browser image. Supabase Edge Functions stay short-lived; this worker owns polling and browser automation.

## One-Cycle Worker Check

```powershell
$env:SUPABASE_URL="..."
$env:SUPABASE_SERVICE_ROLE_KEY="..."
node services/news-scraper/src/index.mjs --once
```

The worker stores only the latest visible post when a source has no cursor yet. After that, it stores every extracted post with a numeric ID newer than `news_sources.last_seen_external_id`, then advances the cursor to the newest extracted post.

To manually recover recently missed posts after fixing X credentials or a trusted
browser session:

```powershell
$env:SUPABASE_URL="..."
$env:SUPABASE_SERVICE_ROLE_KEY="..."
node services/news-scraper/src/index.mjs --backfill --hours 6
```

Backfill inserts visible posts from the requested recent window and only advances
a source cursor when the newest recovered post is newer than the stored cursor.

## Feed Rules

- The board is today-only in `America/New_York`.
- `clear_expired_news_feed_items()` runs at the start of every cycle.
- Source cursors persist across the daily board clear.
- If the newest visible source post is older than today's Eastern date, the
  cursor still advances but no feed item is inserted.
- A fresh browser is launched per source by default so one blocked page or
  closed context does not break the whole cycle.

## Render Deployment

Production is defined in [../../render.yaml](C:/repos/chat2.0/render.yaml:1) as
the `shado-news-scraper` worker. Browser scraping needs more than the 512 MB
starter memory limit once signed-in X sessions are enabled, so the blueprint uses
the `standard` plan.

Deploy checklist:

1. Push the current commit.
2. Confirm Render builds the worker image.
3. Confirm required secrets are set.
4. Restart/redeploy after changing credentials.
5. Watch logs for `Stored`, `Skipped seen`, and `Source ... failed` lines.

## Health Queries

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

## Troubleshooting

- X source is `ok` but no board row: the newest visible post may be older than
  today's Eastern date.
- X source is `degraded` with a stale timeline error: the worker is polling, but
  X is serving old logged-out profile content. Add `X_USERNAME`, optional
  `X_EMAIL`, and `X_PASSWORD`, or route the worker through PinchTab/a trusted
  browser session.
- After adding X credentials, restart/redeploy the Render worker so it can create
  and reuse `NEWS_X_AUTH_STATE_PATH`.
- Pinned X posts are ignored for feed freshness. A pinned-only timeline is
  marked degraded instead of being stored as a new post.
- X source is stale: add `X_USERNAME`, optional `X_EMAIL`, and `X_PASSWORD` so
  the worker can see a signed-in timeline instead of a logged-out profile page.
- Truth source is `blocked`: Render's IP/browser path is likely blocked by
  Truth Social. Use `PINCHTAB_CDP_URL` or `PINCHTAB_WS_ENDPOINT`, or pause that
  source until a trusted browser path is available.
- Repeated browser/context errors: keep the default per-source browser behavior
  and do not enable `NEWS_X_SHARED_CONTEXT` while debugging.

Full operational runbook: [../../docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1).
