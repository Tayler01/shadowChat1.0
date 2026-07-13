# First-Run Activation Journey

## Status

Candidate 4 of ShadowChat 2.0 Wave Two is implemented as an additive,
backend-authoritative activation domain on `codex/shadowchat-2.0` and deployed
only to immutable trial deploy `6a549b1e052c56307d851b7d`. Production `main`
and the production Netlify site remain unchanged.

The journey is non-blocking and resumable. Dismissing it minimizes the
presentation rather than marking progress complete.

## Enrollment Contract

Only a genuine invite signup created after the `first_run_activation_v1`
rollout marker is enrolled. Enrollment runs from an `AFTER INSERT` trigger on
`public.users` and requires both:

- an `auth.users.created_at` at or after the rollout marker; and
- a matching `private.signup_invite_redemptions` receipt at or after the marker.

There is no backfill statement. Existing profiles, pre-rollout auth users, and
new users without a matching invite redemption do not receive a journey.

## Core Journey

The three core steps are:

1. Identity review.
2. Notification choice and device-local comfort-control review.
3. One selected first action: General Chat message, direct message, or
   ShadowPin image heart.

Install guidance is optional and never gates completion. The database records
that comfort controls were reviewed, but the actual comfort preferences remain
device-local as defined by `docs/ACCESSIBILITY_COMFORT.md`.

Before the third step can complete, the member selects
`group_message`, `direct_message`, or `shadow_pin_heart`. Database triggers on
the canonical action tables record the action only when its kind matches that
selection. A different action does not advance the journey. The first matching
receipt is immutable and later actions are idempotent no-ops for activation.
When that action completes the journey, the server restores the expanded
presentation and clears `dismissed_at` so the compact success/install card is
visible on the next refresh.

## Data And Access

`public.user_activation_journeys` is owner-private:

- RLS is enabled and forced;
- authenticated users receive `SELECT` only for their own row;
- browsers have no direct `INSERT`, `UPDATE`, or `DELETE` grant; and
- private trigger functions and the bounded update RPC own mutations.

Validated database constraints enforce identity before preferences,
preferences before first-action selection, and core completion before an
install receipt. PostgreSQL's global default function execution is revoked for
future postgres-owned functions, so new APIs fail closed until a migration
grants intended roles explicitly.

The row includes a monotonically increasing `revision`. Stale update requests
fail with SQLSTATE `40001` so clients can refetch rather than overwrite progress
from another device.

## RPC Contract

### `get_my_activation_journey()`

Returns the caller's snake-case journey JSON, or `null` when the caller was not
enrolled. This RPC is `SECURITY INVOKER`, so table RLS remains authoritative.

### `update_my_activation_journey(expected_revision, step, choice)`

The authenticated, owner-scoped mutation accepts:

- `identity` with no choice;
- `preferences` with `notifications_enabled`, `notifications_later`,
  `notifications_denied`, or `notifications_unsupported`;
- `first_action` with `group_message`, `direct_message`, or
  `shadow_pin_heart`;
- `install` with `installed`, `later`, or `unsupported`; or
- `presentation` with `expanded` or `minimized`.

It returns the updated snake-case journey JSON. `minimized` records
`dismissed_at`; `expanded` clears it. Presentation and install changes may be
made after core completion.

The public signature is `SECURITY INVOKER`. It delegates to the unchanged
owner-checking, row-locking implementation in the unexposed
`activation_private` schema. Anonymous callers cannot execute either function;
authenticated members receive only schema `USAGE` plus helper/wrapper
`EXECUTE`. Hosted PostgREST rejects both a public lookup for the helper
(`PGRST202`) and an explicit `activation_private` profile (`PGRST106`).

There is intentionally no member completion RPC. Completion is derived
transactionally when identity, preferences, and the selected canonical action
are all present, which avoids an extra `SECURITY DEFINER` surface and prevents
clients from fabricating activation.

Manual TypeScript row and normalized model contracts live in
`src/features/activation/activationTypes.ts`.

## Shared-Backend Compatibility

The migration is additive. It does not modify existing app RPC signatures,
canonical message/DM/ShadowPin columns, or legacy frontend behavior. The action
triggers perform one indexed owner-row update only for enrolled users with an
unfinished matching selection. The production frontend can continue using the
same Supabase project while the 2.0 frontend exercises the new journey.

## Verification

Run the source contract test:

```powershell
npx jest --runInBand tests/firstRunActivationJourneySqlContract.test.ts
```

Run the transactional local verifier after a fresh reset:

```powershell
npx supabase db reset --local --yes
$dbContainer = docker ps --filter "name=supabase_db_chat2" --format "{{.Names}}" | Select-Object -First 1
Get-Content -Raw scripts/verify-first-run-activation-local.sql | docker exec -i $dbContainer psql -v ON_ERROR_STOP=1 -U postgres -d postgres
```

The verifier rolls back all fixture rows. It proves future-only invite
enrollment, non-enrollment for existing/non-invite users, RLS isolation, denied
direct writes, revision conflicts, presentation resume state, selected-action
matching, all three action routes, optional install behavior, and first-receipt
idempotency.

Current automated proof:

- fresh local migration replay: passed through
  `20260713055523_harden_function_default_execute_privileges.sql`;
- transactional activation verifier: passed and rolled back all fixtures;
- local database lint/advisors: zero findings;
- linked migrations: aligned, with `supabase db push --linked --dry-run`
  reporting the remote database up to date;
- hosted activation security-advisor filter: zero activation findings;
- repository regression: 188 Jest suites, 972 passing tests, 16 intentional
  todos, and zero failures; and
- lint, TypeScript, production build, paused-feature verification, and bundle
  budgets: passed.

Authenticated immutable-deploy proof also passed:

- exact deploy `6a549b1e052c56307d851b7d`; mutable alias and production were
  rejected by the verifier;
- six future-invite profiles across Pixel 7 Chromium and iPhone 14 WebKit:
  139 checks and 47 screenshots spanning General Chat, DM, and ShadowPin action
  choices in both engines;
- genuine invite redemption, Auth/profile creation, revision-1 server
  enrollment, Escape/Browser-Back minimize, reload resume, focused-input/footer
  geometry, nested DM/Pin Back restoration, canonical completion, foreground
  success restoration, and optional install behavior;
- every deployed JavaScript chunk was bound to the expected Supabase project;
  no unexpected backend host or navigation origin was accepted;
- zero console, page, HTTP, request, navigation, or horizontal-overflow errors;
  four exact Chat/DM push requests were intercepted and validated with zero live
  delivery; and
- strict cleanup removed six users, six invites, two Chat messages, two DM
  messages, two DM conversations, and two Pin hearts, then proved all 14 scoped
  database/Storage/event counters zero. The recovery journal was removed.

The expanded run exposed and fixed a real ShadowPin URL/local-state race:
Browser Back could remove `?pin=` before exact-image lookup resolved and leave
Theater open. Route absence is now authoritative, preserves the category grid,
and has focused component plus Pixel/WebKit live regression proof.

The live verifier used Supabase's official generated signup-link path to create
the canonical invited Auth users without sending email, avoiding the hosted
provider's two-email-per-hour test limit. Invite-hook redemption and enrollment
were verified; email delivery itself was intentionally not tested. Evidence is
in
`output/playwright/wave2-candidate4-activation/activation-1783930103447-a91d2b7f0b9c/summary.json`.

Native OS install-sheet acceptance, installed Home Screen launch, VoiceOver,
and TalkBack remain real-device acceptance items and are not claimed by browser
emulation.
