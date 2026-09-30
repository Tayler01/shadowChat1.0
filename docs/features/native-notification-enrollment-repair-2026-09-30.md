# Native notification enrollment repair - September 30, 2026

## Confirmed failure

Physical TestFlight build 16 showed `Failed to update push notifications` when
enabling Phone Push Notifications. The August containment migration
`20260805112141_harden_web_notification_recovery.sql` revoked execute permission
on ticket creation, ticket redemption and all three credential lifecycle RPCs.
The linked production ACL inspection confirms these endpoints are unavailable
to `authenticated`, `anon` and `service_role`. The hosted ticket helper threw a
plain PostgREST error, which Settings replaced with its generic toast.

## Scoped repair

The hosted helper converts enrollment errors into actionable Errors. The hook
marks a failed hosted enrollment stage and keeps an unrelated native idle
snapshot from erasing its error. No new native binary is required for these
hosted changes or the server permission repair.

Migration `20260930215452_restore_native_notification_enrollment.sql` restores
the original complete enrollment boundary:

- Ticket creation is executable only by `authenticated`; `auth.uid()` supplies
  the ticket owner, with no caller-selected user ID.
- Anonymous ticket redemption requires the five-minute unconsumed ticket,
  matching request and installation key, SHA-256 verifier challenge, ticket
  secret and installation credential hash. Row locking prevents replay; owner,
  installation, token and credential registration share the transaction.
- Anonymous token rotation, foreground lease and revocation require the active
  installation's opaque credential. The resolver verifies its hash and checks
  both the installation and credential are unrevoked. The foreground lease is
  capped at two minutes; revocation disables tokens and the credential.
- The old session-based token endpoint and private tables/helpers retain their
  revoked browser permissions. The SECURITY DEFINER allowlist moves only these
  five reviewed signatures into their original roles; no function is added.

## Verification and release boundary

Focused client/enrollment tests and the security allowlist tests cover denial
reporting, ticket authority, guarded lifecycle updates and the exact five grants.
Root lint, app TypeScript and production build passed for the initial hosted
error-path repair. Integration must rerun the applicable final checks.

The parent release applied the enrollment migration and the separate bounded
canary migration to production on September 30. Linked security verification
passed: 158 public definers, 105 authenticated, five anonymous and 49 internal;
zero paused browser-table grants. The exact five endpoint ACLs were read back.
The deployed worker's Vault-authenticated health request returned HTTP 200 with
`environment=production`; this checks the shared secret without revealing it.
Native delivery remains paused pending current physical installation enrollment.

The enrollment migration changes no delivery runtime configuration, worker, collector, cron job,
outbox processing or `pg_net` behavior. All historical native delivery workers
and response collectors remain disabled. Any bounded canary delivery repair is
a separate migration and acceptance surface.

After the authorized migration rollout, verify linked ACLs and invalid-secret
rejection, then enable notifications from physical build 16 and confirm its
installation/token registration. Background and terminated notification
receipt, foreground suppression, sign-out/account-switch revocation and phone
routing still require physical acceptance evidence.
