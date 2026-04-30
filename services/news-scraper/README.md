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
- `X_USERNAME`, `X_PASSWORD`, `TRUTH_USERNAME`, and `TRUTH_PASSWORD` are reserved for later read-only login support and must stay server-only

The production container uses a Playwright browser image. Supabase Edge Functions stay short-lived; this worker owns polling and browser automation.
