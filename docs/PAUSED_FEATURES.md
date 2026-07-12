# Paused Product Domains

## Status - July 12, 2026

Boards, News, Art Board, the ESP Bridge, Activity HQ, and member-facing safety
report intake are intentionally paused. Their implementation history, source,
migrations, stored data, and firmware remain part of ShadowChat so the work can
be resumed later without a destructive rebuild.

Paused does not mean deleted:

- no Board, News, or Art Board rows or Storage objects should be removed;
- no bridge tables, device history, firmware, TUI, or design docs should be
  removed;
- no Activity or moderation case rows, evidence, receipts, source, or migrations
  should be removed;
- direct dormant-feature tests remain in the suite;
- reactivation requires an explicit security, cost, and product review.

## Production Build Gates

The production defaults are compile-time off:

```dotenv
VITE_FEATURE_BOARDS=false
VITE_FEATURE_ESP_ADMIN=false
VITE_FEATURE_ACTIVITY=false
VITE_FEATURE_MEMBER_REPORTING=false
```

Leaving either variable unset also means `false`. Only the literal value
`true` enables that feature.

With the default production build:

- Sidebar and mobile navigation omit Boards;
- legacy `?view=news` and `?view=boards` routes fall back to Chat;
- Board badge, News, and Art Board realtime subscriptions are not mounted;
- Boards/News/Art Board chunks are not emitted in `dist`;
- Settings omits News Sources and ESP Bridge Pairing;
- mobile and desktop navigation omit Activity, `?view=activity` falls back to
  Chat, and the Activity provider performs no fetch or Realtime subscription;
- General Chat, DM, member profile, ShadowPin post, and ShadowPin comment Report
  actions are absent, and Settings omits My Safety Reports;
- the operator Safety Case Center remains available so existing cases can still
  be triaged and audited;
- News and ESP admin panel chunks are not emitted in `dist`.
- Activity View, member report sheet, and My Reports chunks are not emitted in
  `dist`.

`npm run build` runs `scripts/verify-paused-feature-build.mjs` after Vite and
fails if paused feature chunks or known subscription/API markers leak into the
default build.

## Remote Services

The production-alignment release at
`8e69fe498827efa19e211ad0cb9ca9ec506c96ae` verified the following remote
state. A frontend flag is still not sufficient on its own; the backend and
provider controls below are part of the pause contract.

### News

- Live Render service `srv-d7pjc49j2pic73bq5m80` (`shado-news-scraper`) is a
  suspended `background_worker` on branch `main`.
- The live service reports `AutoDeploy=no` and `autoDeployTrigger=off`;
  [render.yaml](C:/repos/chat2.0/render.yaml:1) preserves that setting so code
  pushes do not automatically deploy the worker.
- Supabase News tables, sources, history, and policies remain preserved.
- Repository variable `NEWS_MONITOR_ENABLED=false` keeps the production-health
  workflow pause-aware while the worker is suspended.
- Resuming or changing the Render billing plan is an operator action. Do not do
  either until News is explicitly reapproved.

### Boards And Art Board

- Supabase Board/News/Art Board tables and Storage remain intact.
- No client provider, badge query, or Board/Art realtime channel runs in the
  default build.
- Existing direct component and hook tests remain active to prevent source rot.
- The remote `art-board-import-image` Function is absent. Migration
  [20260710002000_remote_security_advisor_cleanup.sql](C:/repos/chat2.0/supabase/migrations/20260710002000_remote_security_advisor_cleanup.sql:1)
  revokes browser access to paused Art/Boards/News operations and removes broad
  public bucket-list policies without deleting rows or Storage objects. Known
  public object URLs remain available; broad anonymous browsing does not.

### ESP Bridge

- The Settings pairing UI is absent from the default build.
- Firmware, TUI, bootstrap tools, migrations, and Edge Function source remain.
- All 15 deployed `bridge-*` endpoints run the shared hold before request
  parsing, authentication, or database work and return HTTP 503 with
  `code: feature_paused`.
- The release migration and automation verified 0 dedicated Auth sessions, 0
  custom sessions, 0 pending pairing codes, 0 enabled devices, and 1 preserved
  disabled device. This state must be re-verified on every production release.
- Browser table privileges on the six paused Bridge tables are revoked. A
  future reactivation requires deliberate grants plus fresh pairing and
  sessions; it must not revive preserved credentials.

### Activity HQ

- The additive `activity_events` ledger, triggers, RLS, Realtime publication,
  source, and dormant tests remain intact on shared Supabase.
- The default frontend does not mount `ActivityProvider`, query the ledger,
  subscribe to it, show a badge/destination, or honor Activity deep links.
- Re-enable with `VITE_FEATURE_ACTIVITY=true`, then repeat phone navigation,
  exact-target routing, unread, Realtime, and installed-PWA badge review before
  release.

### Member Reporting

- `member_reports`, cases, immutable evidence, reporter updates, private
  Storage, RPCs, migrations, and all dormant UI source remain preserved.
- Member intake and reporter history are compile-time off by default. The
  operator Safety Case Center deliberately stays on to manage existing cases.
- Re-enable with `VITE_FEATURE_MEMBER_REPORTING=true`, then repeat multi-role
  RLS, evidence, Storage cleanup, entry-point, receipt, phone keyboard, and
  operator workflow proof before release.

## Re-enable Checklist

Do not re-enable a flag by itself. A reviewed reactivation must:

1. Confirm product ownership, expected usage, and provider cost.
2. Re-run Supabase migration and Edge Function parity checks.
3. Review current RLS, function/table ACLs, Storage policies and limits, and
   service-role paths. Restore only the grants and list/read behaviors required
   by the approved product design.
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
$env:VITE_FEATURE_ACTIVITY='true'
$env:VITE_FEATURE_MEMBER_REPORTING='true'
npm run build
```

Unset those variables before producing a normal production build.
