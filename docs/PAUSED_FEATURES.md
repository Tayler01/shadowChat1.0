# Paused Product Domains

## Status - July 9, 2026

Boards, News, Art Board, and the ESP Bridge product surfaces are intentionally
paused. Their implementation history, source, migrations, stored data, and
firmware remain part of ShadowChat so the work can be resumed later without a
destructive rebuild.

Paused does not mean deleted:

- no Board, News, or Art Board rows or Storage objects should be removed;
- no bridge tables, device history, firmware, TUI, or design docs should be
  removed;
- direct dormant-feature tests remain in the suite;
- reactivation requires an explicit security, cost, and product review.

## Production Build Gates

The production defaults are compile-time off:

```dotenv
VITE_FEATURE_BOARDS=false
VITE_FEATURE_ESP_ADMIN=false
```

Leaving either variable unset also means `false`. Only the literal value
`true` enables that feature.

With the default production build:

- Sidebar and mobile navigation omit Boards;
- legacy `?view=news` and `?view=boards` routes fall back to Chat;
- Board badge, News, and Art Board realtime subscriptions are not mounted;
- Boards/News/Art Board chunks are not emitted in `dist`;
- Settings omits News Sources and ESP Bridge Pairing;
- News and ESP admin panel chunks are not emitted in `dist`.

`npm run build` runs `scripts/verify-paused-feature-build.mjs` after Vite and
fails if paused feature chunks or known subscription/API markers leak into the
default build.

## Remote Services

### News

- The Render `shado-news-scraper` worker is suspended and should remain so.
- `render.yaml` sets `autoDeployTrigger: off` to prevent code pushes from
  automatically deploying the worker.
- Supabase News tables, sources, history, and policies remain preserved.
- A Render billing-plan cancellation or continued suspension is an operator
  action; a frontend flag alone cannot stop a paid worker.

### Boards And Art Board

- Supabase Board/News/Art Board tables and Storage remain intact.
- No client provider, badge query, or Board/Art realtime channel runs in the
  default build.
- Existing direct component and hook tests remain active to prevent source rot.

### ESP Bridge

- The Settings pairing UI is absent from the default build.
- Firmware, TUI, bootstrap tools, migrations, and Edge Function source remain.
- Frontend hiding does not stop a powered bridge from calling deployed Edge
  Functions. The production security-alignment rollout must revoke existing
  bridge sessions and either remove the deployed `bridge-*` endpoints or
  deploy a shared deny-by-default server hold before the pause is complete.

## Re-enable Checklist

Do not re-enable a flag by itself. A reviewed reactivation must:

1. Confirm product ownership, expected usage, and provider cost.
2. Re-run Supabase migration and Edge Function parity checks.
3. Review current RLS, function ACLs, storage limits, and service-role paths.
4. Restore or create the required Render/provider service deliberately.
5. Build with the relevant flag set to `true` and confirm feature chunks return.
6. Run dormant unit tests plus phone-sized browser and real-device QA.
7. Run production negative security smokes and clean up all test data.
8. Update this file, the feature runbooks, README, architecture, deployment,
   and audit backlog before release.

## Proof Commands

Default paused build:

```powershell
npm run build
```

Explicit local re-enable proof:

```powershell
$env:VITE_FEATURE_BOARDS='true'
$env:VITE_FEATURE_ESP_ADMIN='true'
npm run build
```

Unset those variables before producing a normal production build.
