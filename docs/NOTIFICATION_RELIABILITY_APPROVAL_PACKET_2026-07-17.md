# Approval packet: Notification Reliability Rebuild and Weather Reliability

Category: Reliability / Notifications / Mobile UX

Candidate: `NOTIFY-2026-07-17` at local checkpoint `3167fac`

## Decision

Approve or reject the July 17 notification reliability and Weather patch for a
controlled production rollout. This packet does not authorize an automatic
push, migration, Edge Function deploy, scheduler change, or Netlify deploy.

## Candidate

- Branch: `codex/notification-reliability-rebuild-20260717`
- Base: production `main` at `305953d79397d6bc8e3a74ed20e0043a12e3811c`
- Local checkpoint: `3167fac` (`Rebuild notification delivery and weather sharing`)
- Database: one additive migration,
  `20260717193835_notification_reliability_rebuild.sql`
- Edge Function: compatible `send-push` update with durable recovery worker
- Frontend: unified notification coordinator, rebuilt settings, category
  navigation badges, Catch-Up inbox, Checkers turns, Weather share/radar fixes
- Service worker: universal visible-client suppression and exact clearing

## Outcome

- Candidate is locally accepted and ready for Tayler's rollout decision.
- Nothing is pushed, migrated, scheduled, deployed, or changed in production.

## Why

- Feature-local notification hooks could present the same event independently.
- Push suppression was incomplete outside presence events.
- presentation, unread, route, navigation-badge, launcher-badge, and OS-tray
  state did not share one lifecycle.
- Pin and other unread activity could raise the app-icon count without a clear
  in-app destination.
- Notification Settings had grown incrementally instead of expressing one
  delivery policy.
- Weather sharing could capture an effectively empty off-screen container, and
  radar replaced frames before the next tile layer was ready.

## What Changed

- One recipient-owned notification event lifecycle and one foreground
  coordinator replace independent feature presenters.
- Durable job, lease, retry, attempt, expiry, and read-through primitives back
  the compatible `send-push` worker.
- The service worker and push worker both suppress OS presentation when a
  visible same-origin client is active.
- Settings, category badges, Catch-Up notification inbox, exact routes,
  Shadow Checkers turn alerts, and Shado Live ledger mirroring use the same
  contract.
- Weather capture now proves usable geometry before upload; radar preloads and
  crossfades frames at the faster cadence.

## Files Changed

The exact 49-file implementation list is reproducible with
`git show --name-only --format= 3167fac`. Primary files:

- `supabase/migrations/20260717193835_notification_reliability_rebuild.sql`
- `supabase/functions/send-push/index.ts`
- `supabase/security-definer-allowlist.json`
- `public/sw.js`
- `src/features/notifications/NotificationCoordinator.tsx`
- `src/features/notifications/notificationApi.ts`
- `src/features/notifications/notificationModel.ts`
- `src/hooks/useAppBadgeState.ts`
- `src/lib/appBadge.ts`
- `src/lib/appRouting.ts`
- `src/lib/push.ts`
- `src/App.tsx`
- `src/components/settings/SettingsView.tsx`
- `src/components/layout/MobileNav.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/features/catch-up/CatchUpView.tsx`
- `src/features/catch-up/catchUpApi.ts`
- `src/features/catch-up/catchUpModel.ts`
- `src/features/games/GamesHome.tsx`
- `src/features/games/shadow-checkers/ShadowCheckersScreen.tsx`
- `src/features/games/shadow-checkers/api/shadowCheckersApi.ts`
- `src/features/games/shadow-checkers/hooks/useShadowCheckers.ts`
- `src/features/weather/WeatherView.tsx`
- `src/features/weather/RadarMap.tsx`
- related tests under `tests/`, `deno.lock`, and the notification, Weather,
  Checkers, and real-device QA documentation

## User-Visible Outcome

- Foreground events use one in-app alert with a hard five-second deadline.
- Background/closed events use push; the service worker refuses push when a
  visible same-origin client exists.
- Old unread items stay findable without replaying as fresh alerts.
- Chat, DMs, Catch-Up, Pins, and Play show category-local unread counts.
- Catch-Up provides a durable route to unread interaction, connection,
  ShadowPin, Live, and Checkers sources.
- Notification settings are one coherent mobile-first surface.
- Shadow Checkers can notify the correct opponent when it becomes their turn.
- Weather sharing no longer captures a black/one-pixel image.
- Radar advances at least twice as fast and crossfades without an empty frame.

## Verification

- Lint: passed
- TypeScript: passed
- Production build and bundle budgets: passed
- Jest: 233 suites; 1,267 passed; 16 todo
- Node contracts: 43 passed
- Documentation integrity: passed
- `send-push` Deno check: passed
- Clean local migration replay: passed
- Local and linked database lint at error level: zero findings
- Local Supabase security contract: passed
- Linked dry run: only the new migration is pending
- Authenticated iPhone WebKit and Android Chromium: passed
  - real Weather shares: 720x788, nonblank
  - foreground tray: one presentation and hard auto-dismiss
  - unread event: findable in Catch-Up
  - Settings, Weather, Catch-Up: zero horizontal overflow
- Test users, messages, notification events, uploaded Weather assets, preview
  server, browsers, and local Supabase containers: cleaned up

## Screenshots / Demo

- No public preview or production URL was created because the workflow forbids
  deploy before approval.
- Authenticated automated phone rendering was exercised directly at 390x844
  iPhone WebKit and 412x915 Android Chromium sizes. The measured evidence is in
  the verification section; no temporary screenshots were retained.

## Risk

- The migration is additive and rollback keeps its dormant primitives rather
  than destructively removing them.
- `send-push`, migration, scheduler, service worker, and frontend must ship in
  the stated order; skipping the scheduler would leave server recovery
  dependent on compatibility client kicks.
- Multi-device OS delivery remains provider- and physical-device-sensitive.
- Browser automation intentionally blocked service workers while proving the
  foreground path, preventing a false claim of OS-push acceptance.

## Push / Deploy Plan

1. Record the production release SHA and take the normal database backup.
2. Push the additive migration and verify the remote migration list.
3. Deploy `send-push` and verify its version/health.
4. Configure a secure server-side schedule or Database Webhook that calls
   `send-push` with `{ "type": "notification_delivery_recovery" }` using
   service-role authorization. Never place that credential in `VITE_*`.
5. Verify one claimed job, retry/expiry behavior, and privacy-safe telemetry.
6. Deploy the frontend/service worker from the same approved commit.
7. Run installed iPhone and Android checks RD-031 through RD-033.
8. Observe delivery failures, duplicate rates, pending jobs, invalid
   subscriptions, and badge/read clearing before declaring the rollout closed.

## Rollback

- Frontend/service worker: redeploy the previous production commit.
- Edge Function: redeploy the previous `send-push` version and disable the new
  recovery schedule first.
- Database: keep the additive columns/tables/RPCs in place during rollback;
  they are compatible and removing them would be riskier than leaving them
  dormant.
- Checkers: the preserved client delivery kick provides temporary compatibility
  while the server worker is disabled.

## Not Verified

- Installed iPhone Home Screen and Android PWA foreground/background/closed
  arbitration.
- OS notification replacement and exact tray clearing after source read.
- Home Screen badge persistence and clearing across restart.
- Multiple subscriptions/devices for one recipient.
- Real radar network cadence and installed-PWA Weather image rendering.

## Cleanup

- Deleted both local QA Auth users and their cascaded rows.
- Verified zero residual QA Weather messages and notification events.
- Removed uploaded Weather share objects.
- Stopped the task's Vite preview, browser contexts, and local Supabase
  containers.
- Removed the temporary browser QA script and verified no QA credential remains
  in source.

## Approval Needed

Reply with explicit approval to push checkpoint `3167fac` plus this packet to
`main`, apply the migration, deploy `send-push`, activate the server-owned
recovery schedule, deploy Netlify, and run the installed-phone production smoke
in the rollout order above.
