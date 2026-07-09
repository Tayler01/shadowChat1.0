# Engineering safeguards

This is the operating guide for ShadowChat telemetry, security automation,
staging parity, device validation, and production monitoring. Integrations are
safe to merge without vendor credentials; credentialed jobs fail closed or
remain dormant until their protected environment is configured.

## Privacy-scrubbed telemetry

Frontend and News-worker Sentry reporting is disabled unless the appropriate
DSN is present. The frontend uses `VITE_SENTRY_DSN`; the worker and future Edge
Function wrappers use server-only `SENTRY_DSN`. Use separate Sentry projects
for frontend, Edge, and worker, and separate staging from production.

The implementation disables default PII, tracing, session replay, request
capture, user identity, breadcrumbs, and arbitrary extra/context data. It
strips chat/message bodies, email, usernames, auth/session/cookie/token data,
device/pairing identifiers, URL query strings, and provider details. Never pass
`Request`, `Response`, Supabase errors, source handles, raw HTML, or application
state to a capture helper.

`SENTRY_AUTH_TOKEN` is not a runtime setting. If source-map upload is added,
keep it in a protected CI environment, upload during release, and do not
publish source maps with the site.

Edge Functions can opt in through
`supabase/functions/_shared/telemetry.ts`. Initialize with a stable function
name and capture only bounded operation names. Roll this through sensitive
functions one at a time with negative authorization tests; do not bulk-wrap
handlers before their error contracts are reviewed.

## CI security gates

- `quality.yml`: secretless lint, typecheck, build, Jest, and worker lockfile.
- `codeql.yml`: JavaScript/TypeScript CodeQL on PRs, main, and weekly.
- `security-scans.yml`: full-history redacted gitleaks plus Trivy filesystem and
  configuration scans; high/critical findings fail.
- `.github/dependabot.yml`: grouped weekly npm, worker, Actions, and Docker
updates. Dependabot never receives deployment secrets.

`.gitleaksignore` contains five exact historical fingerprints only: three
Firebase web-client identifiers from removed files and two README examples.
Firebase browser API keys are not server secrets, but the retired
`shadowchat-99822` project key should still be disabled or API/referrer-
restricted in Google Cloud if that legacy project remains active. Do not add
rule-wide or path-wide allowlists; investigate each new fingerprint.

Netlify preview first validates PR code with no secrets. Preview deployment is
available only for same-repository, non-Dependabot PRs through the protected
`netlify-preview` GitHub Environment. Configure required reviewers before
adding Netlify secrets. Never use `pull_request_target` to run PR code.

## Supabase staging parity

Create a separate Supabase project with synthetic data only. Never reuse the
production ref, database password, service role, smoke accounts, scraper
cookies, auth rows, or chat/DM data. Use the committed migrations and function
sources. Review auth URLs/hooks and provider secrets independently because
`supabase/config.toml` contains production URLs.

Configure protected GitHub Environment `staging`:

- secret `STAGING_SUPABASE_ACCESS_TOKEN`
- secret `STAGING_SUPABASE_DB_PASSWORD`
- variable `STAGING_SUPABASE_PROJECT_REF`
- variable `PRODUCTION_SUPABASE_PROJECT_REF`

Run `Supabase Staging Parity` manually. It refuses missing configuration and
refuses staging equal to production, then lists migrations, performs
`db push --dry-run`, and lists functions. It never pushes changes.

Supabase preview branches can replace long-lived staging on a paid plan; a
separate CLI-managed staging project works without that feature.

## Production uptime and News freshness

The scheduled workflow checks the public app and uses server-only credentials
to assess enabled `news_sources` by last success and bounded health state. It
prints counts only, never handles, posts, or `last_error`. Configure protected
environment `production-monitoring` with:

- variable `PRODUCTION_APP_URL`
- variable `NEWS_MAX_AGE_MINUTES` (start at 10; keep above several cycles)
- secrets `MONITOR_SUPABASE_URL` and `MONITOR_SUPABASE_SERVICE_ROLE_KEY`
- optional secret `SLACK_WEBHOOK_URL`

The workflow fails when News credentials are absent, so green means uptime and
freshness were both checked. Slack receives only the workflow URL and status.
Replace the service role with a least-privilege health endpoint when available.

GitHub Actions is not an independent uptime provider. Also configure an
external HTTPS monitor (Better Stack, UptimeRobot, or equivalent) for the root
with 2xx expectation, two consecutive failures, and email/SMS escalation. No
account is created by this repo change.

## Real-device testing

Until BrowserStack/Sauce credentials and an Appium contract exist, the existing
physical workflow in `docs/qa/real-device-mobile-validation.md` is the release
gate. Test a preview/staging URL on one current iPhone/Safari installed PWA and
one Android/Chrome installed PWA after automated mobile QA. Record device,
OS/browser versions, tester/date, result, evidence, and test-data cleanup.

If cloud devices are purchased, keep credentials in a protected `device-cloud`
environment and run only against preview/staging with synthetic accounts. An
explicit cloud run must fail when credentials are missing rather than silently
fall back to emulation.
