# Bounded native notification canary — September 30, 2026

Current rollout: the explicit production audience is active in Demo and
production as of November 2. The [verified activation section](#november-2-verified-bounded-production-audience-activation)
records the current eligibility, ten-second recovery cadence and evidence.
The September 30 and October 29 sections preserve the original named-canary
contract; their ten-account audience limit and minute cadence are historical.

This additive repair creates an independent native canary. Applying the migration
does not enable delivery. The August containment remains: the legacy delivery,
recovery, receipt and `pg_net` response collector jobs stay paused. The active
bounded Web Push fallback and its schedule are unchanged.

## September 30 original delivery and database bounds

`20260930215719_bounded_native_notification_canary.sql` adds a private singleton
lease, a new paused `shadowchat-native-push-canary` minute schedule, service-only
lease RPCs, and a bounded replacement for the existing outbox claim RPC. The new
dispatcher checks the singleton runtime and indexed eligible work before Vault
or HTTP. It never reads `net._http_response` or the historical worker-request
ledger. An enqueue reservation and a worker lease each expire after 30 seconds.

Only `delivery_mode = active`, an enabled worker, one to ten explicitly named
canary accounts, enabled categories and events at/after `activation_watermark`
qualify. `all_users_enabled = true` fails closed. Materialization checks these
account/category/time gates before projecting content or creating an outbox.
The old after-insert delivery dispatch hook is removed, because it called the
legacy response collector inside the inserting transaction. Shadow inspection
does not seed per-installation delivery targets.

The Edge worker accepts only its dedicated secret and `action: bounded_canary`
with `task: deliver` or `task: receipts`. Old `deliver`/`receipts` actions are
rejected. Delivery has one round of two events, at most two latest native
installations each, and concurrency two: no more than four provider messages.
The entire delivery/receipt operation, including Supabase fetches and lease
release, shares an eight-second abort deadline. A provider request gets at most
three seconds with two seconds reserved for persistence. Claims require a live
singleton lease, use `SKIP LOCKED`, and stop after three attempts. A whole worker
deadline leaves the lease to expire naturally rather than launching more work.

Receipt work touches at most five newly created canary targets in total per
invocation, including expiration cleanup. Receipt attempts are reserved before
provider HTTP, so network failures count toward the three-attempt ceiling.
Accepted tickets remain accepted until an Expo receipt is returned; even an
Expo success receipt establishes provider delivery, not OS display.

Native preference, quiet-hours, snooze, category, private DM mute, reciprocal
block and per-installation foreground checks remain enforced before sending.
Missing preferences suppress delivery. Privacy/media policy and the existing
canonical routes, sound and badge envelope are reused. Event/installation/
transport uniqueness and accepted-target exclusion prevent recovery resends.
An uncertain provider submission is marked terminal before HTTP; a worker crash
or lost response can lose that notification, but cannot automatically duplicate
it. Explicit provider throttle/server rejection or retryable ticket errors may
reset it to pending, within three attempts. This tradeoff is deliberate for the
small native canary; it does not alter Web Push retry semantics.

## September 30 canary activation sequence and rollback

1. Validate/apply enrollment-grant repair and bounded delivery migrations.
2. Deploy the new `deliver-notifications-v2`. Verify its guarded health action,
   `NOTIFICATION_DELIVERY_ENVIRONMENT=production`, and matching Edge
   `NOTIFICATION_V2_WORKER_SECRET` / Vault
   `shadowchat_notification_v2_worker_secret`, without printing either secret.
3. Confirm the intended physical TestFlight installation completes enrollment,
   has a current Expo token and production environment, and survives backgrounding.
4. Atomically set the existing private-ACL runtime to active for the verified
   Tayler account and one category (DM first), `all_users_enabled=false`, both
   worker and receipt reconciliation enabled, the exact deployed worker URL,
   and a fresh `activation_watermark=now()`. Enable only the new canary job.
   Do not call the historical `configure_notification_v2_runtime` or probe RPC:
   those invoke the old collector. Do not enable any former native jobs.
5. Send a normal new event after the watermark. Verify enrollment, outbox,
   accepted ticket, receipt and physical lock-screen display/open separately.
   Repeat for General Chat and ShadowPin only after their category is explicitly
   added. Check cold-start routing, foreground suppression and privacy modes.
6. Pause immediately for auth/chat latency regression, repeated errors or
   duplicate display. Disable the new job and atomically set delivery disabled,
   worker/receipt gates false and empty category/canary lists. Preserve canonical
   events/read state and the active Web Push fallback. Broad rollout stays off.

## November 2 verified bounded production audience activation

The reviewed migration `20261102010152_bounded_native_production_audience.sql`
separates audience eligibility from dispatch capacity. `audience_mode` defaults
to `canary`; that mode still requires 1–10 named users and
`all_users_enabled=false`. Production requires an explicit `production` mode,
`all_users_enabled=true` and an empty canary list. The migration itself enables
no runtime or schedule. Root separately applied its exact version/history,
deployed and read back the worker, checked protected health and explicitly
activated the production audience in Demo and production.

Demo activated at `2026-11-02T01:54:00.846861Z` with Edge version 8; production
activated at `2026-11-02T02:03:59.301786Z` with Edge version 66. Both deployments
verified all eight source files, preserved `verify_jwt=false` with no import map,
preserved unrelated functions and confirmed the new audience column through
service-role PostgREST. Protected health returned HTTP 200, runtime contract 2,
production environment and the exact delivery limits. Both explicit activations
use all nine approved categories, empty named canaries and fresh forward
watermarks. Exact migration statements/history were read back; unrelated
additive account-deletion history was preserved. This status is remote backend
evidence, independent of any later Git commit or web/native binary release.

Production recipients must satisfy the existing active-member service authority,
an undeleted/unbanned Auth row and an active owned production Expo installation
with a valid token. Scoped installations additionally require their owned active
credential. Token selection repeats the credential check per device and caps
selection at two devices; a valid device cannot authorize a revoked second one.
Legacy unscoped native registrations remain supported. Accepted receipts drain
even after member/device revocation, while production receipt selection remains
restricted to production installations. Due delivery and receipts alternate when
both exist, preventing receipt starvation.

The limits remain two events, two installations per event, concurrency two,
eight seconds per worker, three seconds per provider request, three attempts and
an initial invocation plus four continuations. Root enabled only
`shadowchat-native-push-canary` at a ten-second cadence (Demo job 5, production
job 7). With twenty
simultaneously eligible recipients, a burst covers ten; remaining recipients may
wait up to ten seconds plus worker/provider delay. No instantaneous delivery or
APNs latency guarantee is implied. Former native collectors/recovery/receipt
jobs remain off and Web Push recovery remains on.

Local evidence: 33 focused Deno tests passed, the isolated PostgreSQL production
suite passed, lint/typecheck/build passed, and `git diff --check` passed. The SQL
suite covers twenty simultaneous recipients, denied memberships/installations,
per-device credential revocation, legacy compatibility, token cap, lease-time
revocation, enqueue recovery, receipt fairness and environment isolation,
retained canary cap and no historical replay. One thousand idle ticks with ten
thousand historical pending rows took 169.172 ms total and generated no new
Vault reads or HTTP calls. The due-work plan used the production partial index.
These are local PostgreSQL/simulated-provider measurements, not cloud latency.

Build 26 physical DM/General long-history opening, read/badge clearing and
minimize/reopen checks were accepted separately; fixtures were fully removed.
This release changes no payload/auth/routing behavior, so those accepted phone
checks are reused. Scoped payloads contain no actor/media or rich attachment,
and the streamlined iOS extension clears attachments without fetching URLs.

Read-only monitoring verified three observations in each environment. Demo had
zero eligible native members and seven distinct sampled cron executions all
succeeded. Production had one eligible native member; observations at
`02:04:54.491218`, `02:05:29.923872` and `02:05:42.546798` UTC verified the exact
active window, empty bounded pending/receipt samples, no worker error or lingering
lease/reservation, and eight distinct sampled successful cron executions.
Production recipient-indexed reads through `02:06:05.900616` UTC found no ordinary
postactivation notification events for that eligible member. No synthetic send,
enrollment or fixture was created by monitoring. These are bounded idle/control
checks: this rollout did not newly exercise a live provider submission, receipt
or OS display, and did not measure interactive auth/chat latency or cloud/APNs
delivery time. The earlier accepted phone proof and local twenty-recipient
provider simulation remain separate evidence.

Root-only staged SQL, exact source hashes, migration/Edge/activation receipts,
bounded monitoring evidence, rollout/stop order and exact-version helpers are under
`output/release-evidence/native-notification-repair-20261030/production-rollout-20261102/`.
The helpers preserve unrelated additive migration history and reject replay.
Use the exact saved activation watermark with the guarded stop procedure; retain
accepted ledger/user content and never enable the old collectors to drain it.

## Local validation

- Deno worker tests exercise disabled/legacy action guards, shared time budget,
  two-event concurrency, ambiguous provider failure, accepted-target exclusion,
  throttle recovery, presentation/privacy and existing Expo payload contracts.
- `tests/sql/native-notification-canary.sql` runs with the migration in one
  rolled-back local transaction. Its 17 assertions cover default pause, idle
  dispatch before credentials/HTTP, worker ACLs, removal of the old insertion
  dispatcher, exact projection account/category/watermark gates, singleton
  contention, wrong-owner rejection, per-event leases and three-attempt ceiling.
- Physical TestFlight registration, lock-screen delivery and receipt proof
  require the actual signed build and phone. Local tests do not establish them.

The implementation lane performed local edits and read-only remote verification.
Root executed the remote migration, Edge deployment and activation; Git commit,
push and the wider store release remain tracked by the parent release task.

## October 29 immediate wake (isolated demo only; production held)

`20261029225224_immediate_bounded_native_notification_wake.sql` wakes the
existing bounded worker after an eligible outbox INSERT statement, once the
canonical event and envelope exist in the transaction. `pg_net` dispatches only
after commit. This is a new lightweight trigger; it does not restore the old
response collector, scan `net._http_response`, or alter any schedule/runtime gate.

The private dispatcher retains the exact project URL, canary, category,
watermark and eligible-work checks. Disabled production exits before Vault/HTTP.
Its singleton uses `FOR UPDATE SKIP LOCKED`, so a concurrent worker cannot make
a chat INSERT wait for this row. Queuing failures leave durable outbox work for
the unchanged minute fallback rather than rolling back the message.

Only the matching service-role lease owner clears the successful invocation's
30-second reservation. It can immediately enqueue up to four successor workers:
five invocations total cover ten eligible events, matching the maximum canary
fanout. Every worker still handles two events/four targets within eight seconds;
accepted-target exclusion, preferences, quiet hours, foreground suppression and
all other delivery guards are unchanged. A new eligible insertion or fallback
cron tick starts a fresh bounded burst. An arrival during an existing worker
refreshes the continuation budget without stealing its lease or dispatching a
second concurrent worker.

Heavy traffic beyond a burst, retry backoff, a crashed worker, and the narrow
race where an inserting transaction skips a row held by a release that cannot
yet see that uncommitted insertion still rely on fallback recovery. The change
reduces ordinary idle-path queue latency; it does not promise instantaneous OS
presentation or remove the ten-account rollout gate.

Local PostgreSQL validation uses `tests/sql/immediate-native-notification-wake.sql`
in one rolled-back transaction, a synthetic Vault value and a transactional
`net.http_post` stub. It verifies immediate insert wake, arrivals during a lease,
wrong-owner denial, reservation clearing, continuation ceiling/reset, idle
behavior, enqueue failure recovery, exact project binding and private ACLs.
No provider request is made. A second schema-only local database verified real
two-connection contention: while another session held the singleton for 40
seconds, the dispatcher returned in 2.873ms and an actual event INSERT completed
in 10.258ms without queuing HTTP. Recovery after release queued in 6.117ms. That
database was dropped and the source local database remained unchanged. Physical
latency remains a separate acceptance gate; no production rollout is implied.

The reviewed migration is installed in the isolated Apple demo as exact version
`20261029225224` (270 to 271 migrations). Its single project URL is explicitly
adapted to that demo; the four function bodies, private ACLs, full security
contract, runtime and schedules were read back. Production remains disabled
and has not received this migration. The first speed-test preflight was held
without sending because the reviewer iPhone enrollment was revoked. After the
user restored notifications, fresh preflight verified the scoped build-23
installation and one authorized ordinary DM was sent at 23:23:43.678 UTC.
Its event/outbox was created at 23:23:45.283; Expo accepted its single target
on the first attempt at 23:23:46.821 (3.143 seconds from message creation,
1.538 seconds from event creation). Worker HTTP 200 at 23:23:46.950, before
the next cron minute, verifies the immediate path. The user confirmed the
physical alert arrived and felt faster, but did not measure OS display time;
the 3.143-second figure is provider acceptance, not physical delivery latency.
Tapping remained on Settings in build 23; the separate build-24 routing fix
still needs phone validation. The exact test message and derived events/targets
were removed and zero remaining rows verified. Other content, group mute and
the user's active device enrollment were preserved; both helper sessions were
revoked locally. No group test or preference mutation occurred.

The demo security-advisor read at 23:09:51 UTC retained 19 informational
RLS-without-policy findings and existing definer warnings (8 anonymous, 105
authenticated). The new private functions grant no browser/service execution;
the full security contract passed and public definers remain 161. This is not
a claim that the project has zero advisor warnings. Reviewed receipts and the
guarded, exact-version deployment record are under
`output/release-evidence/native-push-readiness-20261028/`.
