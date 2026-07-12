# Deployment Guide

ShadowChat deploys as a static frontend on Netlify with Supabase as the hosted
backend. The preserved News Feed scraper is a separate Render worker that is
currently suspended with automatic deploys disabled.

Engineering security gates, staging parity, privacy-safe telemetry, real-device
release validation, and production monitoring are defined in
[ENGINEERING_SAFEGUARDS.md](C:/repos/chat2.0/docs/ENGINEERING_SAFEGUARDS.md:1).

## Documentation Status - July 10, 2026

This guide reflects the current GitHub Actions, Netlify, Supabase, Render,
app-release, invite-only signup/email-verification rollout, and production-smoke
flow, including the July 10 Release A deployment. Production deployment validates
and applies migrations, pushes Supabase configuration, aligns the classified
Edge Function inventory, enforces the ESP Bridge hold, captures backend evidence,
and only then publishes the frontend. The latest successful `main` workflow,
linked Supabase evidence, Netlify health manifest, production smoke, and any
required physical-device checks together define current release proof.

Netlify native Git builds are intentionally stopped for this project. The
backend-first GitHub Actions workflow is the only production publisher; it
uploads the already validated build with the Netlify CLI after Supabase
alignment succeeds. This prevents an automatic Netlify build from publishing a
schema-dependent frontend early. PR previews are an exception-only path for a
deliberately approved review branch, not part of the normal main-only release
flow.

The repository is currently main-only: local and remote release history live on
`main`, and there are zero open pull requests. Release A completed the
backend-first workflow; the forward historical-grant correction is the active
closeout release. Read the latest successful workflow and public health manifest
for current SHA/deploy identity instead of retaining a stale run id here.

### July 10 Release A deployment and closeout

Release A shipped schema, Edge Function, notification, privacy, search,
ShadowPin, operations-health, Shado TV, Shadow Mystery, PWA, and dependency
changes through
`20260710044600_personal_blocking_engagement_hardening.sql` via the
backend-first `main` workflow. Post-release linked verification found two
historical active-table grants outside the reviewed contract. The forward
`20260710141315_revoke_unreviewed_active_table_grants.sql` migration and its
follow-up workflow are the remaining closeout step.

Do not use an older successful run as proof for closeout. Require an empty
post-push linked dry run, clean linked security contract/advisor review, exact
Function inventory, a Netlify health manifest matching the latest `main` SHA,
and applicable production/mobile smoke.

## Production Pieces

- Frontend hosting: Netlify
- Backend: Supabase
- News scraper: Render worker from [render.yaml](C:/repos/chat2.0/render.yaml:1)
- Static build output: `dist`
- Netlify config: [netlify.toml](C:/repos/chat2.0/netlify.toml:1)

## Before Deploying

Run:

```powershell
npm run lint
npm run typecheck
npm run test:node
npm run supabase:functions:verify
npm run docs:verify
npm run build
npx jest --runInBand
npm audit --audit-level=low
```

When `apps/mobile` changes, validate the independent Expo 57 workspace too:

```powershell
Push-Location apps/mobile
npm ci
npm audit --audit-level=low
npm run lint
npx tsc --noEmit
npm run doctor
Pop-Location
```

Expo 57, React Native 0.86, and React 19.2 are the local native-client baseline.
Those checks do not deploy the native client and do not replace installed PWA
or production browser smoke.

If the change affects realtime or UI behavior, also run a headed browser smoke before shipping.

If the change affects auth, session recovery, or mobile resume behavior, also run:

```powershell
node scripts/playwright-smoke.mjs --scenario=auth,resume-send --headed --no-reuse-server
```

For invite-only signup or email-verification changes, also complete the rollout
checks below before calling the release production-proven.

For the current login persistence behavior, rollback checkpoints, and production smoke expectations, see [`docs/SESSION_PERSISTENCE_RUNBOOK.md`](C:/repos/chat2.0/docs/SESSION_PERSISTENCE_RUNBOOK.md:1).

Production deploys publish an in-app release popup after Netlify succeeds. The
popup content is generated from the pushed commit range by default, with
[`release-notes/current.json`](C:/repos/chat2.0/release-notes/current.json:1)
available only for explicit manual overrides. See
[`docs/APP_RELEASES.md`](C:/repos/chat2.0/docs/APP_RELEASES.md:1).
The GitHub workflow also verifies that the compiled app bundle contains the
release build id and deploy context before it deploys, because the popup gate
depends on that metadata to know whether users need a restart.

The following News checks are reactivation-only. Do not run them during a normal
release while News and the Render worker are paused. If News has been explicitly
approved for reactivation, run:

```powershell
npm run news:scrape:proof
```

Then run one Supabase-backed cycle with service-role credentials in the shell or Render after deployment:

```powershell
node services/news-scraper/src/index.mjs --once
```

## GitHub Push

```powershell
git status --short
git add .
git commit -m "Describe the change"
git push origin main
```

Pushing `main` automatically starts the GitHub Actions workflow in
[.github/workflows/netlify-production.yml](C:/repos/chat2.0/.github/workflows/netlify-production.yml:1).
That workflow runs the release checks, applies pending Supabase migrations and
configuration, deploys the exact active/default-deny Function manifest, revokes
dedicated ESP Bridge Auth sessions, stores backend parity evidence, builds with
Netlify, deploys production, and publishes the in-app release record.

The credentialed deploy job depends on reusable Quality, Security Scans, and
CodeQL workflows. No Supabase or Netlify release step starts until all of their
jobs pass.

The repository currently has no open pull requests and does not use PRs for the
normal release path. As an explicit review-branch exception, opening or updating
a same-repository pull request against `main` starts the GitHub Actions workflow
in
[.github/workflows/netlify-preview.yml](C:/repos/chat2.0/.github/workflows/netlify-preview.yml:1).
That workflow first validates untrusted PR code without secrets. For eligible
same-repository, non-Dependabot PRs, a protected `netlify-preview` environment
then authorizes the alias preview at `pr-<pull-request-number>` and publishes a
sticky PR comment with the preview URL.

## Netlify PR Preview Deploys (Exception Only)

This path is dormant during normal main-only operation. Use it only when a
specific change has been approved for review on a temporary same-repository
branch, then remove that branch after it is integrated or discarded. The
secretless validation job needs no deployment credentials. The protected
preview job requires:

- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`

Production app-release publishing also requires:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Backend alignment in the production workflow also requires:

- `SUPABASE_ACCESS_TOKEN`: a newline-free Supabase personal access token matching
  `sbp_` plus 40 lowercase hexadecimal characters, with the optional
  `oauth_` marker accepted by the workflow.
- `SUPABASE_DB_PASSWORD`: the linked production project's database password; it
  is not interchangeable with the personal access token.
- repository variable `SUPABASE_PROJECT_ID`

The production workflow validates all required Netlify and Supabase values,
validates the access-token shape, links the exact project, and runs a migration
dry run before dependency installation. A missing, malformed, newline-polluted,
or swapped credential therefore fails early before any backend or frontend
publication step.

### Operations health evidence

Every production build writes a public, no-store manifest at
`/.well-known/shadowchat-health.json`. It contains only the build id, commit
SHA, deploy context, and whether a valid browser push public key was compiled;
it never contains Supabase keys or provider credentials.

After migrations and the classified Edge Function manifest are aligned, the
production workflow records a sanitized row in
`public.operations_health_snapshot`. It includes the latest migration version,
function-manifest digest and counts, push requirement names, Netlify deploy
identity, and GitHub workflow link. The service role is the only writer; RLS
limits reads to app operators. The immediate post-deploy check and the
15-minute Production Health workflow then update the smoke status and deployed
frontend SHA. Operators can review the result in Settings > Admin > Operations
Health without receiving management tokens or raw logs.

The Supabase secret inventory used for push readiness stays in the temporary
GitHub runner directory and is not uploaded with the backend evidence artifact.
Only missing configuration names, never values or hashes, reach the snapshot.

The preview workflow intentionally does not deploy to production. It publishes
the built `dist` directory with:

```powershell
npx netlify deploy --context deploy-preview --dir=dist --alias="pr-<number>"
```

Use the sticky PR comment or the Netlify check output as the source of truth for
the preview URL during admin verification.

## Netlify Production Deploy

The normal publisher is the Netlify CLI invocation inside the protected GitHub
Actions production workflow. Netlify's native Git build service remains stopped.
A human-run CLI deploy is a break-glass fallback only and must preserve the same
backend-first checks. From the repo root:

```powershell
npx netlify deploy --prod
```

This project already includes:

- linked Netlify metadata under [`.netlify`](C:/repos/chat2.0/.netlify/state.json:1)
- a production build command in [netlify.toml](C:/repos/chat2.0/netlify.toml:1)
- GitHub Actions production deployment on every push to `main`

## Supabase Deployment Steps

### Schema

```powershell
supabase db push --yes
```

Run schema deployment before publishing frontend changes that depend on new
tables or buckets. For example, Settings feedback submissions require
`public.feedback_submissions` and the private `feedback-attachments` Storage
bucket before the production UI can submit reports, and the weather widget
requires `public.user_weather_preferences` before users can save weather
locations.
Channel bans require `public.user_channel_bans` plus the updated channel and
reaction policies before the production moderation UI can reliably block
participation.
Boards require `public.board_catalog`, `public.board_chat_messages`,
`public.board_chat_reactions`, and `get_board_badge_counts` before the
production Boards UI can load chat boards or unread counts.
Art Board requires `public.art_board_items`, `public.art_board_links`,
`public.art_board_reactions`, the public `art-board` Storage bucket policies,
and the deployed `art-board-import-image` Edge Function before image URL imports
and shared canvas updates work.
Operator message deletion requires the latest message-delete policies before
the production UI can delete normal-user General Chat or board-chat messages
for everyone.

Before marking a release complete, compare local and linked migration state:

```powershell
supabase migration list --linked
supabase db push --linked --dry-run
```

If the dry run lists pending migrations, apply them before or with the frontend
deploy:

```powershell
supabase db push --linked --yes
```

Recent app-surface migrations to confirm in fresh projects:

- `20260501233924_admin_roles_foundation.sql`: app-wide admin/sub-admin model.
- `20260502020855_presence_visibility_active_users.sql`: tracked/invisible presence and active users.
- `20260502034206_feedback_admin_review_access.sql`: operator feedback review access.
- `20260502034941_feedback_review_read_policy_consolidation.sql`: consolidated feedback read policies.
- `20260502042003_user_weather_preferences.sql`: private per-user weather location preferences.
- `20260502070543_channel_bans_moderation.sql`: profile-popup moderation controls and channel-ban enforcement.
- `20260502193604_boards_domain.sql`: Boards catalog, reusable board-chat stream, per-board unread counts, and Boards moderation scopes.
- `20260503191500_add_new_chat_boards.sql`: Vibe Coding, AI News, and Projects Chat catalog rows plus their board moderation scopes.
- `20260503191532_admin_delete_non_admin_chat_messages.sql`: operator deletion of normal-user General Chat and board-chat messages.
- `20260504012117_art_board_domain.sql`: Art Board tables, RLS, realtime publication, public Storage bucket, and moderation scope.
- `20260504021602_art_board_z_index_bigint.sql`: widens Art Board ordering values for timestamp-based layering.
- `20260601181119_general_chat_message_window.sql`: bounded General Chat windows for stable read-position loading.
- `20260601182251_lock_general_chat_read_rpc_acl.sql`: read-position RPC ACL hardening.
- `20260602012149_invite_only_signup_auth.sql`: private invite ledger, invite validation hook, and auth metadata cleanup.
- `20260602013640_lock_signup_invite_rpc_acl.sql`: invite RPC and hook execute-grant hardening.
- `20260620121500_admin_authority_source_cleanup.sql`: canonical
  `user_roles`/operator authority and display-only public role badges.
- `20260709215208_notification_sound_static_lockdown.sql`: static notification
  sound configuration and mutation lockdown.
- `20260709215314_user_profile_write_boundary.sql`: approved profile-column
  writes with protected identity and authority fields.
- `20260709215321_security_definer_and_database_lint_cleanup.sql`: explicit
  function ACLs, caller guards, and fixed search paths.
- `20260709215718_bridge_hold_and_session_revocation.sql`: paused ESP Bridge
  data/session hold and device disablement.
- `20260709215933_database_function_lint_cleanup.sql`: remaining function lint
  and search-path cleanup.
- `20260709220428_storage_bucket_constraints.sql`: reviewed MIME and file-size
  constraints for active upload buckets.
- `20260710002000_remote_security_advisor_cleanup.sql`: hosted ACL/default-
  privilege cleanup, paused-domain RPC lockdown, and guarded reaction/ban APIs.
- `20260710035027_private_identity_release_a.sql`: API-safe public-profile JSON
  and General Chat/DM payloads that exclude authentication email and legacy
  `full_name`.
- `20260710042228_notification_delivery_parity.sql`: master/type preferences,
  quiet-hours timezone, General Chat mute, and owner-private DM mutes.
- `20260710042548_private_identity_release_a_consumers.sql`: cuts profile writers
  and guarded admin email reads over to public presentation fields and
  `auth.users`, while retaining nullable compatibility columns for a deployment
  interval.
- `20260710042701_personal_blocking_privacy_contract.sql`: private block rows and
  reciprocal discovery/chat/DM/Hype/notification enforcement.
- `20260710043132_universal_search_saved_collections.sql`: caller-visible
  General Chat/DM search plus private saves and collections.
- `20260710044050_shadow_pin_social_search.sql`: normalized tags, indexed
  ShadowPin search, comments/replies, and ShadowPin notification types.
- `20260710044500_publish_notification_events_realtime.sql`: recipient-owned
  notification event delivery through Supabase Realtime.
- `20260710044600_personal_blocking_engagement_hardening.sql`: known-id
  engagement guards, ShadowPin write bounds, one-level replies, stale-event
  cleanup, and ready-state new-post fanout.
- `20260710141315_revoke_unreviewed_active_table_grants.sql`: forward-only
  removal of the two historical active-table grants found by linked Release A
  verification.

The July 10 Release A migrations are deployed through `20260710044600`, remote
database lint passed, and Supabase Auth leaked-password protection remains
enabled. The follow-up `20260710141315` grant-revocation migration is release
closeout until its own backend-first workflow produces an empty linked dry run,
clean linked security/advisor evidence, and matching health manifest. Do not
reuse the earlier hosted-advisor count as final closeout proof.

### Edge Functions

Do not maintain a second hand-written deployment list. Validate and deploy the
canonical classification in `supabase/function-manifest.json`:

```powershell
npm run supabase:functions:verify
npm run supabase:functions:deploy
```

The deploy command aligns the active functions, deploys every paused ESP Bridge
endpoint with its shared default-deny gate, removes the paused Art Board import
endpoint, verifies the remote inventory and JWT flags, and unsets any accidental
`BRIDGE_API_ENABLED` override. It requires `SUPABASE_PROJECT_ID` and
`SUPABASE_ACCESS_TOKEN` in the process environment.

The confirmed production inventory is 23 functions: eight active functions and
15 ESP Bridge endpoints deployed in deny-paused mode. The paused
`art-board-import-image` function is absent, and the manifest verification found
no unexpected, missing, or JWT-mode drift. This is the required target state for
each production release.

Any function whose gateway JWT check is disabled must keep equivalent
endpoint-level authentication, authorization, rate limiting, and service-role
boundaries. A paused bridge endpoint must return the server-side hold before it
does authentication, parsing, or database work.

### Secrets

Keep these configured in Supabase:

- `OPENROUTER_API_KEY`
- `AI_PROVIDER=openrouter`
- `OPENROUTER_MODEL=mistralai/mistral-nemo`
- `AI_ALLOWED_MODELS=mistralai/mistral-nemo`
- `OPENROUTER_SITE_URL=https://shadochat.online`
- `OPENROUTER_APP_NAME=ShadowChat`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

`mistralai/mistral-nemo` is the current cheap paid OpenRouter test model. As of April 26, 2026, OpenRouter lists it around $0.01 per million input tokens and $0.03 per million output tokens. Recheck the [OpenRouter model catalog](https://openrouter.ai/models) and [pricing page](https://openrouter.ai/pricing) before changing this default.

The `@ai` group-chat flow posts answers as the dedicated `Shado` assistant profile (`shado_ai`). Keep `SUPABASE_SERVICE_ROLE_KEY` configured for Edge Functions so `openai-chat` can create/repair that profile and insert Shado's answer.

Bridge TUI `@ai` support uses the same AI secrets through `bridge-group-send`, so deploy both `openai-chat` and `bridge-group-send` after changing shared AI code.

Chat link previews use the `link-preview` Edge Function. Deploy it with `--no-verify-jwt`; the function validates the signed-in user's bearer token in code before fetching remote metadata.

Optional Meta/Facebook/Instagram previews can use these server-only secrets:

- `META_OEMBED_ACCESS_TOKEN`
- or `META_APP_ID` plus `META_APP_SECRET`

Do not put provider preview tokens in frontend `VITE_*` env vars.

## Render News Scraper Deployment

The News scraper is preserved in [render.yaml](C:/repos/chat2.0/render.yaml:1)
as the `shado-news-scraper` Docker worker. Its live Render state was verified as
suspended, and both the live automatic-deploy setting and committed
`autoDeployTrigger` are `off`. Do not resume or redeploy it until News is
explicitly reapproved under the paused-feature checklist.

Required Render secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Expected Render values:

- `NEWS_SCRAPE_INTERVAL_MS=90000`
- `NEWS_SCRAPE_HEADLESS=true`

Optional Render secrets:

- `PINCHTAB_CDP_URL`
- `PINCHTAB_WS_ENDPOINT`
- `X_USERNAME`
- `X_EMAIL`
- `X_SECONDARY_IDENTIFIER`
- `X_PASSWORD`
- `X_AUTH_TOKEN`
- `X_CT0`
- `NEWS_X_COOKIE_HEADER`
- `TRUTH_USERNAME`
- `TRUTH_EMAIL`
- `TRUTH_PASSWORD`
- `NEWS_TRUTH_COOKIE_HEADER`

Reactivation notes (not part of a normal release):

1. Push the commit to the branch Render watches.
2. Confirm the Render worker build finishes and the service is running.
3. Watch logs for `Stored`, `Skipped seen`, or `Source ... failed` lines.
4. Query `news_sources` to confirm `last_checked_at`, `last_success_at`, `health_status`, and `last_seen_external_id`.

Truth Social can block hosted worker IPs even with credentials configured. If Render shows a persistent `blocked` state for Truth, use a trusted remote browser path with `PINCHTAB_CDP_URL` or `PINCHTAB_WS_ENDPOINT` instead of exposing credentials to the browser client.

## Frontend Env Requirements

Netlify needs the frontend equivalents of:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_WEB_PUSH_PUBLIC_KEY` when push subscriptions are enabled in the UI
- `VITE_MESSAGE_FETCH_LIMIT` only when deliberately changing chat/DM fetch windows
- `VITE_FEATURE_BOARDS=false` while Boards/News/Art Board remain paused
- `VITE_FEATURE_ESP_ADMIN=false` while ESP Bridge remains on hold
- `VITE_FEATURE_ACTIVITY=false` while Activity HQ remains paused
- `VITE_FEATURE_MEMBER_REPORTING=false` while member intake remains paused

Check [`.env.example`](C:/repos/chat2.0/.env.example:1) for the expected names.

Do not place Supabase service-role keys, provider API tokens, Render scraper credentials, Bunny keys, or Meta/OpenRouter secrets in `VITE_*` variables.

The two feature variables are browser-safe compile-time booleans. Only literal
`true` enables them. Follow
[PAUSED_FEATURES.md](C:/repos/chat2.0/docs/PAUSED_FEATURES.md:1) for remote-state
and reactivation requirements.

## Two-Stage Private Identity Rollout

Private identity hardening is deliberately split across two production releases
so a column drop cannot race an older browser, Edge Function, or native client.

### Release A: consumer cutover and compatibility interval

Release A consists of
`20260710035027_private_identity_release_a.sql` and
`20260710042548_private_identity_release_a_consumers.sql`. It introduces the
API-safe public-profile contract, removes `email` and `full_name` from General
Chat and DM profile payloads, stops profile bootstrap and AI/Bridge upserts from
mirroring those values, and sources full-admin email from guarded `auth.users`.
The legacy `public.users.email` and `public.users.full_name` columns remain
nullable during this interval.

Release A is deployed. Before authorizing Release B, finish its closeout:

1. Complete the forward grant-revocation `main` workflow and confirm the linked
   dry run and linked security contract are clean.
2. Run stable-account production auth, General Chat, DM, resume-send, and
   Settings/Admin Access checks.
3. Confirm public profile, message-window, search, and realtime payloads do not
   expose authentication email or legacy `full_name`.
4. Verify every frontend, Edge Function, script, and `apps/mobile` selector is
   independent of the compatibility columns. The Expo selectors/types are
   already cut over locally; their Expo 57 checks still need release evidence.

### Release B: destructive column removal

Release B must be a later, separate migration that drops
`public.users.email` and `public.users.full_name`. Do not create or apply that
migration merely because local tests pass. First require a successful Release A
production interval, current production smoke, no linked/runtime consumer
references, and an updated Expo/native selector contract. If any deployed
consumer still reads either column, fix and re-prove Release A instead of
advancing to Release B.

## Invite-Only Signup And Email Verification Rollout Checklist

Invite-only signup and required email verification are implemented. Use this
checklist for fresh projects, production deploys, and any future auth changes.

### Supabase Preflight

1. Inspect the invite migration, auth hook, and helper RPCs before
   describing behavior. Confirm invite codes are stored as hashes only, helper
   access is private, and `anon`/`authenticated` cannot execute internal
   redemption helpers directly.
2. Compare local and linked migration state:

```powershell
supabase migration list --linked
supabase db push --linked --dry-run
```

3. Apply pending auth rollout migrations only after the production frontend can
   send the required invite field:

```powershell
supabase db push --linked --yes
```

4. Push and verify Supabase Auth config from [supabase/config.toml](C:/repos/chat2.0/supabase/config.toml:1):

```powershell
supabase config push --project-ref YOUR_PROJECT_REF --yes
```

5. Verify the Supabase Auth hook or database function used for invite
   validation, then run negative checks for missing, expired, disabled, reused,
   and wrong-email invites.
6. Verify email confirmation only after Supabase Auth Site URL and redirect
   allowlist are correct. Include the production Netlify URL, any custom app
   domain, local preview URLs used for QA, and the PR preview pattern if email
   links are tested from deploy previews.
7. Review confirmation email templates and optional SMTP settings before the
   first production proof. A valid invite signup is not ready until the user can
   receive and complete the confirmation link.
8. Confirm the two stable production smoke users exist, are email-confirmed,
   have passwords, and have matching `public.users` profiles.

### Netlify Preflight

1. Confirm Netlify has only browser-safe `VITE_*` variables for Supabase URL,
   anon key, push public key, and deliberate frontend settings.
2. Confirm no service-role keys, invite secrets, provider tokens, or SMTP
   credentials are exposed through Netlify frontend env vars.
3. If a deploy preview is used for email-link QA, add the preview URL or alias
   pattern to the Supabase redirect allowlist before sending test links.
4. Verify the production deploy domain that users open matches the Supabase
   Auth Site URL or an allowlisted redirect target.

### Release Sequence

1. Run local lint, typecheck, build, focused auth Jest, and preview browser QA.
2. Run a staging or preview invite-signup proof with one disposable invite and
   test email.
3. Repair and confirm stable production smoke accounts before production
   enforcement changes.
4. Deploy the frontend that includes invite/email-verification UX.
5. Apply or verify the Supabase invite/auth migration and hook configuration.
6. Verify required email confirmation in Supabase Auth.
7. Run `npm run qa:smoke:prod` with stable email-confirmed accounts.
8. If explicitly approved, run one production invite-signup proof, then disable
   or expire the test invite and document cleanup.

### Rollback Notes

- If sign-in breaks for existing confirmed users, disable the invite hook or
  revert the auth migration before changing unrelated session code.
- If signup emails do not arrive, keep existing users live, pause new invite
  issuance, verify SMTP/templates/Site URL/redirects, and rerun with a single
  test invite.
- If production smoke reports signup without an active session, verify
  `PLAYWRIGHT_ACCOUNT_*` env vars first; routine production smoke should not use
  disposable signup after this rollout.

## Post-Deploy Smoke

After deploy, verify:

1. Sign in works
2. For invite/email auth rollouts, stable confirmed users still sign in and an
   approved one-off invite signup proof completes email confirmation
3. Group chat loads
4. DM list loads
5. Realtime group message works
6. Realtime DM works
7. Resume-send works after a background/foreground cycle
8. Settings page renders cleanly on mobile and desktop
9. A message containing an `https://` or `www.` link renders as a clickable link and loads a compact preview card
10. Settings feedback can submit a bug or feature report with an image attachment after feedback schema changes
11. General Chat header shows active-user count, active-user popup, and weather widget without mobile overlap
12. Settings > Account & Profile can save or clear a weather location
13. Settings > Admin > Feedback Review lists submitted feedback for an app operator
14. An app operator can open another user's profile popup and see Channel bans
15. A General Chat-banned user is blocked from participating while DMs and read access still work
16. An app operator can delete a normal-user General Chat message, and it disappears for other signed-in users without refresh

For private-identity Release A, also verify that normal profile/message payloads
omit `email` and `full_name`, while the full-admin access screen can still show
the guarded Auth email. Release B needs a later smoke window after its separate
column-drop migration.

Do not create a production ShadowPin post merely to smoke-test posting. A new
pin fans out notification events to eligible members and can immediately send
web push; deleting the pin does not retract notifications already delivered.
Use local/staging transactional proof or existing production content for routine
checks. A controlled production post requires explicit approval, a real content
purpose, an audience/notification plan, and verified cleanup.

Paused-domain checks are reactivation-only and are not part of routine
production smoke. When Boards, News, Art Board, or ESP Bridge is explicitly
approved to return, additionally verify its navigation/runtime chunks, realtime
flows, moderation behavior, admin surfaces, provider worker, server-side hold
removal, and test-data cleanup according to
[PAUSED_FEATURES.md](C:/repos/chat2.0/docs/PAUSED_FEATURES.md:1). Do not resume the
Render worker, expose Bridge endpoints, or enable a compile-time flag merely to
make a routine release smoke exercise dormant code.

Recommended production smoke for local post-deploy validation:

```powershell
npm run qa:smoke:prod
```

The default production smoke opens a visible browser. For CI-style environments where headless Chromium is stable, use:

```powershell
npm run qa:smoke:prod:headless
```

Production smoke requires the two stable, email-confirmed `PLAYWRIGHT_ACCOUNT_*` users from local `.env.testing.local` or CI secrets. Disposable signup is not reliable against production when email confirmation is enabled. See [`docs/PRODUCTION_SMOKE_TESTING.md`](C:/repos/chat2.0/docs/PRODUCTION_SMOKE_TESTING.md:1).

For larger releases, run the full headed local smoke from a fresh preview build and keep its artifact path in the release notes:

```powershell
node scripts/playwright-smoke.mjs --scenario=full --run-name=full-smoke-release --headed --slow-mo=100 --no-reuse-server
```

## Production Gotchas

### Invite Signup Or Email Confirmation Fails

After the invite/email rollout lands, a healthy frontend can still block new
signup if Supabase Auth settings are wrong. Check the invite hook/migration,
Site URL, redirect allowlist, email templates, SMTP or provider delivery, and
test-invite state before changing unrelated login/session code. Existing
confirmed users should still be able to sign in during this investigation.

### AI Not Working

The frontend deploy can be healthy while AI still fails if the Supabase `OPENROUTER_API_KEY` secret is missing, the `openai-chat` function was not redeployed, or the OpenRouter account has no usable credits/model access.

### Push Not Working

The frontend deploy can be healthy while push still fails if:

- VAPID keys are missing
- `send-push` is not deployed
- devices are not actually subscribed

Settings > Admin > Operations Health distinguishes release-time push
configuration readiness from device-specific subscription problems. A ready
status proves the frontend public key, the three server-side Web Push secret
names, and the deployed `send-push` Function were present; it does not prove a
particular phone granted permission or retained a valid subscription.

### Realtime Looks Stale

The frontend deploy can be healthy while realtime still fails if the target Supabase project is not on the latest migrations.

### Operator Delete Only Changes One Screen

The frontend deploy can be healthy while admin/sub-admin message deletion fails
server-side if the target Supabase project is missing
`20260503191532_admin_delete_non_admin_chat_messages.sql`. The current client
expects Supabase to return the deleted row; if no row is returned, it keeps the
message visible and reports the failure instead of pretending the delete worked.

### Weather Widget Is Empty

The frontend deploy can be healthy while the weather widget still prompts for
setup if the signed-in user has no saved weather location. If location save
fails, confirm `20260502042003_user_weather_preferences.sql` has been applied
and that the signed-in user has an authenticated session. Open-Meteo does not
require a project secret for the current browser-side integration.

### Channel Bans Do Not Apply

The frontend deploy can show moderation controls while enforcement still fails
if the target Supabase project is missing
`20260502070543_channel_bans_moderation.sql` or
`20260502193604_boards_domain.sql`. Confirm `supabase migration list` shows the
migrations on both local and remote, then retest General Chat, board chats,
News Feed reactions, and DMs.

### News Feed Is Stale

The frontend deploy can be healthy while the News Feed is stale if:

- the Render worker did not redeploy or is stopped
- `SUPABASE_SERVICE_ROLE_KEY` is missing or rotated
- source rows are disabled
- X logged-out pages are stale and no X credentials are configured
- Truth Social is blocking the worker IP

Start with [docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1), then check `news_sources.last_checked_at`, `health_status`, and `last_error`.

### iPhone Home Screen Still Hangs After Resume

If sends still hang only in the installed Home Screen app:

- verify the deployed build contains the latest `useAuth` and `supabase` session changes
- confirm no async Supabase work has been reintroduced inside `onAuthStateChange`
- rerun the production `auth,resume-send` smoke
- then do a real-device Home Screen validation pass, because iOS standalone mode can diverge from normal Safari behavior
