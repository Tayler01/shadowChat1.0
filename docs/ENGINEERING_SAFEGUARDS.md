# Engineering safeguards

This is the operating guide for ShadowChat telemetry, security automation,
staging parity, device validation, and production monitoring. Integrations are
safe to merge without vendor credentials; credentialed jobs fail closed or
remain dormant until their protected environment is configured.

Current release policy is main-only. The local and remote repository currently
contain only `main`, with zero open pull requests. Netlify native Git builds are
stopped; GitHub Actions owns backend-first production publication through a
Netlify CLI upload. Workflow run `29062308434` completed successfully for commit
`2790efff528d31ac61a383a787d4883e9d7d8932`; Netlify deploy
`6a504b0eaa7a29b30706a2cf` reached `ready`. The later July 10 privacy,
notification, search, ShadowPin, operations, PWA, and dependency work remains a
local release candidate until the final SHA has its own workflow and production
proof.

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

- `quality.yml`: secretless lint, typecheck, Node contract tests, classified
  Supabase Function manifest validation, documentation integrity, production
  build budgets, the full Jest suite, and zero-tolerance npm audits. Separate
  jobs validate the Expo 57 / React Native 0.86 app (`npm ci`, audit, lint,
  TypeScript, Expo Doctor) and rebuild/lint the complete local Supabase migration
  chain from scratch.
- `codeql.yml`: JavaScript/TypeScript CodeQL on PRs, main, and weekly.
- `security-scans.yml`: full-history redacted gitleaks plus Trivy filesystem and
  configuration scans; high/critical findings fail.
- `.github/dependabot.yml`: the npm, worker, Actions, and Docker update scopes
  remain documented, but scheduled update PR creation is disabled with
  `open-pull-requests-limit: 0` to enforce the repository's main-only branch
  policy. Dependency audits and vulnerability scans remain release gates;
  reviewed updates are applied directly to `main` in tested batches.

On `main`, the production workflow calls Quality, Security Scans, and CodeQL as
reusable workflows and cannot enter the credentialed deploy job until every job
passes. Pull-request execution remains available only for an explicitly approved
temporary review-branch exception; weekly schedules still run the relevant
safeguards directly.

`.gitleaksignore` contains five exact historical fingerprints only: three
Firebase web-client identifiers from removed files and two README examples.
Firebase browser API keys are not server secrets, but the retired
`shadowchat-99822` project key should still be disabled or API/referrer-
restricted in Google Cloud if that legacy project remains active. Do not add
rule-wide or path-wide allowlists; investigate each new fingerprint.

The Netlify preview workflow is an exception-only facility and is dormant during
normal main-only operation. If a temporary review branch is explicitly approved,
the workflow first validates PR code with no secrets; preview deployment is then
available only for same-repository, non-Dependabot PRs through the protected
`netlify-preview` GitHub Environment. Configure required reviewers before adding
Netlify secrets. Never use `pull_request_target` to run PR code, and remove the
temporary branch after integration or rejection.

## Main-only repository policy

Production history lives on `main`. Do not leave feature, automation, or
dependency-update branches behind after their commits are integrated or
discarded. The production workflow is the release authority: every push to
`main` must pass Quality, Security Scans, CodeQL, Supabase parity, and the
Netlify deploy before it is considered shipped. Re-enable scheduled update PRs
only if the repository deliberately returns to a review-branch workflow.

## Production release authority and remote parity

Netlify's native Git build service is stopped so it cannot publish a frontend
before its backend. The protected `netlify-production.yml` workflow is the only
normal publisher. It validates the repository, links and aligns Supabase,
captures backend evidence, then uploads the already validated `dist` and
functions directories with the pinned Netlify CLI.

The credential gate requires nonempty Netlify and Supabase values and validates
that `SUPABASE_ACCESS_TOKEN` is a newline-free `sbp_` personal access token. The
project database password remains a separate `SUPABASE_DB_PASSWORD`; swapping
the two or injecting newline/BOM data fails before dependency installation.
Never expose either value through `VITE_*` variables.

Confirmed production Supabase parity is:

- migrations aligned through `20260710002000`, with linked dry run reporting no
  pending migrations;
- remote database lint at zero warnings;
- 23 classified functions: eight active plus 15 ESP Bridge endpoints in
  deny-paused mode, with `art-board-import-image` absent and no manifest/JWT
  drift;
- hosted advisor residuals explicitly documented as 71 guarded authenticated
  `SECURITY DEFINER` APIs plus the single intentional anonymous pre-signup
  username check;
- leaked-password protection enabled with `password_hibp_enabled=true`.

Each production run must capture migration and function evidence for its own
SHA. A prior green artifact does not prove a newer commit. The latest verified
implementation release is workflow `29062308434` for commit `2790eff`, with
backend evidence artifact
`supabase-release-2790efff528d31ac61a383a787d4883e9d7d8932`.

The July 10 local release candidate intentionally has migrations after
`20260710002000`; its linked dry run is not expected to be empty until the
backend-first workflow applies them. Local reset/lint/test evidence is candidate
evidence only, not hosted parity.

Boards, News, Art Board, and ESP Bridge checks are reactivation-only. Routine
release smoke verifies that their compiled surfaces stay absent/default-deny;
it must not resume providers or exercise dormant mutation paths. The live Render
`shado-news-scraper` worker is suspended, and both live and committed automatic
deploy controls are off.

Routine production smoke must also avoid creating a ShadowPin post just to prove
the submit path. A new pin fans out notification rows and web push to eligible
members; row cleanup cannot recall already delivered notifications. Use
local/staging transactional proof or existing production content unless a real,
controlled production post has explicit approval.

## Two-stage private identity safeguard

Release A is a compatibility release. The local candidate introduces an API-safe
public-profile serializer, moves General Chat/DM consumers away from private
identity, stops database/Edge writers from mirroring identity, and keeps guarded
admin email sourced from `auth.users`. The nullable
`public.users.email` and `public.users.full_name` columns remain during the
deployment interval.

Release B is destructive and must not share Release A's production push. Drop
the compatibility columns only after all of these are true:

- Release A's final SHA has a successful backend-first workflow and an empty
  post-push linked dry run.
- Stable-account production auth, General Chat, DM, resume-send, profile, and
  full-admin access smoke passes.
- Public payload inspection confirms authentication email and `full_name` are
  absent outside the guarded admin contract.
- Repository/runtime searches and contract tests show no remaining web, Edge,
  script, or Expo/native selector that reads either compatibility column.

If any consumer remains, hold Release B and repair Release A. Local schema reset
or unit coverage alone is not authorization for the column drop.

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

## Production uptime and optional News freshness

The scheduled workflow always checks the public app. News freshness is
feature-controlled so suspending the News product does not create a false
production incident. Keep repository variable `NEWS_MONITOR_ENABLED=false`
while News and its Render worker are paused. When News is explicitly restored,
set it to `true`; the workflow then uses server-only credentials to assess
enabled `news_sources` by last success and bounded health state. It prints
counts only, never handles, posts, or `last_error`. Configure protected
environment `production-monitoring` with:

- variable `PRODUCTION_APP_URL`
- variable `NEWS_MONITOR_ENABLED` (`false` while News is paused)
- variable `NEWS_MAX_AGE_MINUTES` (start at 10; keep above several cycles)
- secrets `MONITOR_SUPABASE_URL` and `MONITOR_SUPABASE_SERVICE_ROLE_KEY` when
  News monitoring is enabled
- optional secret `SLACK_WEBHOOK_URL`

When News monitoring is enabled, missing credentials fail closed, so green
means uptime and freshness were both checked. While it is disabled, green means
the app uptime check passed and the log records `newsMonitoring: paused`. Slack
receives only the workflow URL and status. Replace the service role with a
least-privilege health endpoint when available.

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

The Expo 57 native workspace has its own clean-install, audit, lint, TypeScript,
Expo Doctor, and static-export checks. Those local checks establish toolchain
health only; they do not substitute for the installed iPhone/Android PWA gate or
prove a native App Store/TestFlight release.
