# Shado News Scraper

Always-on browser worker for the News Feed. It polls enabled rows from `news_sources`, extracts the latest tracked X or Truth Social post, and writes normalized snapshots to `news_feed_items` with Supabase service-role credentials.

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
- `TRUTH_USERNAME` or `TRUTH_EMAIL`, plus `TRUTH_PASSWORD`, are optional. The scraper now tries Truth's public profile/API path before attempting any login flow because hosted worker IPs may be blocked before the login form loads.

The production container uses a Playwright browser image. Supabase Edge Functions stay short-lived; this worker owns polling and browser automation.

## One-Cycle Worker Check

```powershell
$env:SUPABASE_URL="..."
$env:SUPABASE_SERVICE_ROLE_KEY="..."
node services/news-scraper/src/index.mjs --once
```

The worker stores only the latest visible post when a source has no cursor yet. After that, it stores every extracted post with a numeric ID newer than `news_sources.last_seen_external_id`, then advances the cursor to the newest extracted post.
