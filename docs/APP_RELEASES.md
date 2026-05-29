# App Release Popups

Shadow Chat publishes app-version notes through the `app_releases` domain instead
of Shado chat posts.

## Release Notes Source

Production deploys generate their release popup title, summary, and sections
from the pushed commit range by default. This keeps each app-update popup tied
to the actual update instead of reusing stale copy from the previous release.

For a hand-authored release, pass an explicit notes file:

```powershell
node scripts/publish-app-release.mjs --release-notes release-notes/current.json --netlify-json netlify-production.json
```

Manual release notes must include a title, summary, and at least one section
with concrete overview bullets. The publisher defaults to `required_restart` so
each production update uses the same overview-plus-restart popup unless a
different policy is chosen explicitly. The supported restart policies are:

- `notice_only`: show notes, no restart request. Use only when a restart prompt
  was intentionally ruled out.
- `optional_restart`: ask users on an older build if they want to restart now,
  but allow the popup to be dismissed.
- `required_restart`: block users on an older build until they restart.
- `critical_force_restart`: block users on an older build and auto-restart after
  a short countdown.

Use `critical_force_restart` only for changes that can break active old clients,
such as incompatible schema/API behavior or security-sensitive fixes.

## Deploy Flow

The production GitHub Action stamps the Vite build with:

- `VITE_APP_BUILD_ID`
- `VITE_APP_COMMIT_SHA`
- `VITE_APP_DEPLOY_CONTEXT=production`

The workflow writes those values into `.env.production.local` before the Netlify
build, then runs `scripts/verify-app-build-metadata.mjs` against `dist`. If the
compiled app bundle is missing the build id or deploy context that controls the
popup gate, the deploy stops before publishing the release row.

After Netlify deploys successfully, the action runs:

```powershell
node scripts/publish-app-release.mjs --netlify-json netlify-production.json
```

The publisher upserts one `public.app_releases` row for the build id. The app
then shows the release popup to signed-in users and records per-user state in
`public.app_release_receipts`.

## Required Secrets

The production workflow needs these GitHub repository secrets:

- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not expose the service-role key through any `VITE_*` variable.

## Verification

Before shipping release-gate changes:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npx jest --runInBand tests/appReleases.test.ts
```

For UI changes to the popup, run a preview/mobile browser check and inspect the
small-phone layout. After production deploy, run the normal production smoke.
