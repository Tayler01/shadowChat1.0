# Notification reliability implementation — September 30, 2026

## Behavior and rollout

Web Push payloads apply the recipient's private/sender/full preview policy before encryption, strip media when disabled, and omit unknown badge totals. Missing presentation preferences fail closed to private. All immediate and recovery paths pass their fetched preferences through the same helper. Recovery rechecks DM conversation mute and retains canonical DM/reaction routing and tray tags.

`20260930114836_notification_delivery_policy_and_recovery.sql` adds service-only per-device target status and token leases. A successful endpoint sets the event's `sent_at` while another retryable endpoint remains pending; the job completes only when targets are terminal. Claims seed historical provider successes to prevent replay and recheck enabled device ownership, event read/resolution, and expiry. Read/resolution clears pending leases; a late worker result cannot resurrect that target. Provider 401/403 failures preserve valid subscriptions; 404/410 remove expired ones. This is bounded at-least-once delivery: a worker crash after provider acceptance but before durable completion can still retry a device. Provider acceptance does not prove OS display.

The existing minute recovery schedule remains; the dispatcher skips idle queues before Vault or HTTP work. Existing worker singleton/attempt/time/batch bounds and paused collectors/native workers are preserved. Deploy the migration before `send-push`, then the frontend/service worker. Rollout belongs to the parent release task.

Client changes persist explicit device disable intent until explicit enable, use account and preference generation fences after asynchronous work, cache/coalesce installation registration and preferences, debounce badge refreshes, and preserve last-known badge state only for its current account. Recovery walks up to five newest-first keyset pages of 20 (100 maximum), then presents in chronological order. It handles the worker's existing suppressed-push message and online/realtime return without an oldest20 starvation loop. The worker retains schemaVersion2 when normalizing envelopes for click routing.

## Validation

- 14 Jest suites /84 tests passed: notification installation, delivery, envelope, preferences/retry, badge, coordinator, Web Push policy, foreground recovery, worker badge and SQL source contracts.
- `node --test tests/notificationDeliveryRecoveryFaults.node.test.mjs`: 5 tests passed, exercising the extracted actual delivery function with synthetic providers/DB. A 201/B 503 retains pending job; subsequent recovery sends only B and completes; private payload excludes sender/body/avatar;401 preserves valid subscription; unknown badge errors/malformed aggregates stay unknown while confirmed zero remains explicit.
- `tests/sql/notification-delivery-recovery.sql` against isolated `supabase_db_chat-smoothness-20260930`: 10 assertions passed inside a rolled-back transaction. Covers device leasing/contention, partial delivery remaining eligible, canonical DM reaction metadata, disabled-device rejection, successful endpoint exclusion, read/late completion cancellation, service-only privileges and idle request gate. No provider HTTP sent.
- Targeted ESLint passed. `deno check --node-modules-dir=none --no-lock supabase/functions/send-push/index.ts` validates the Edge function without modifying repository locks.
- Parent integration owns full lint, TypeScript/build, merged SQL/security verification and browser/mobile resume checks. Physical installed-PWA push and OS badge delivery remain separate device evidence.

Source changes: `src/features/notifications/NotificationCoordinator.tsx`, notification API/presentation preference mutations, `src/lib/push.ts`, `src/lib/appBadge.ts`, `src/lib/notificationInstallation.ts`, `public/sw.js`, `supabase/functions/send-push/index.ts`, shared Web Push policy, migration, exact public service-only allowlist signatures and focused regression tests.
