# ESP Bridge Backend Implementation Proposal

This document translates the existing ESP bridge planning docs into a concrete backend implementation proposal for `v1`.

It is intentionally practical:

- which tables we should actually create first
- which control-plane actions should be Edge Functions versus RPCs
- what the first migration slices should look like
- what `Phase 0` should build before anything broader

This proposal builds on:

- [ESP Bridge Auth Model Spec](C:/repos/chat2.0/docs/ESP_BRIDGE_AUTH_MODEL_SPEC.md:1)
- [ESP Bridge Session Issuance And Pairing Exchange](C:/repos/chat2.0/docs/ESP_BRIDGE_SESSION_ISSUANCE_AND_PAIRING_EXCHANGE.md:1)
- [ESP Bridge Backend Schema Proposal](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_SCHEMA_PROPOSAL.md:1)

## Goal

Define the smallest backend shape that can support:

- one bridge device
- one user
- one pairing flow
- one bridge-specific session lifecycle
- one group chat send and receive path
- one DM send and receive path
- one revoke path

without forcing `v1` into a full custom messaging backend rewrite.

## Backend Strategy

Use a split model:

### Control Plane

Use `Edge Functions` or a similarly narrow server-side surface for:

- device registration
- pairing begin
- pairing approve
- pairing status
- bridge session exchange
- bridge session refresh
- pairing revoke
- device heartbeat

Why:

- these are sensitive lifecycle actions
- they should not be directly exposed as raw table access to the bridge or PC
- they may need service-role access or session-issuance logic

### Data Plane

Keep existing ShadowChat messaging access patterns where practical:

- `messages`
- `dm_conversations`
- `dm_messages`
- current DM RPCs
- Supabase Realtime subscriptions

Why:

- the existing app is already built around authenticated user access plus RLS
- rebuilding group chat and DMs behind a custom bridge API would slow `v1` dramatically

## Proposed `v1` Backend Entities

## Definitely In Scope For `v1`

### 1. `bridge_devices`

Purpose:

- persistent identity for each bridge device

Suggested fields:

- `id uuid primary key default gen_random_uuid()`
- `device_serial text unique not null`
- `hardware_model text not null`
- `firmware_version text not null`
- `status text not null`
- `paired_user_id uuid null references public.users(id)`
- `last_seen_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested statuses:

- `unpaired`
- `pairing_pending`
- `paired`
- `revoked`
- `disabled`

### 2. `bridge_pairing_codes`

Purpose:

- short-lived pairing bootstrap flow

Suggested fields:

- `id uuid primary key default gen_random_uuid()`
- `device_id uuid not null references public.bridge_devices(id) on delete cascade`
- `code text not null unique`
- `status text not null`
- `expires_at timestamptz not null`
- `consumed_at timestamptz null`
- `created_at timestamptz not null default now()`

Suggested statuses:

- `pending`
- `consumed`
- `expired`
- `revoked`

### 3. `bridge_pairings`

Purpose:

- durable user-to-device authorization record

Suggested fields:

- `id uuid primary key default gen_random_uuid()`
- `device_id uuid not null references public.bridge_devices(id) on delete cascade`
- `user_id uuid not null references public.users(id) on delete cascade`
- `status text not null`
- `paired_at timestamptz not null default now()`
- `revoked_at timestamptz null`
- `revoked_by uuid null references public.users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested statuses:

- `pending`
- `paired`
- `revoked`
- `expired`

Suggested uniqueness:

- partial unique index so a device has at most one active pairing

### 4. `bridge_device_sessions`

Purpose:

- bridge-aware record of issued session lifecycle

Suggested fields:

- `id uuid primary key default gen_random_uuid()`
- `device_id uuid not null references public.bridge_devices(id) on delete cascade`
- `user_id uuid not null references public.users(id) on delete cascade`
- `supabase_session_id uuid null`
- `status text not null`
- `issued_at timestamptz not null default now()`
- `last_refresh_at timestamptz null`
- `last_rotated_at timestamptz null`
- `expires_at timestamptz null`
- `revoked_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested statuses:

- `active`
- `rotating`
- `revoked`
- `expired`

This table is important even if underlying access still uses Supabase's own session system, because it gives the product a bridge-specific revocation and observability layer.

### 5. `bridge_audit_events`

Purpose:

- audit sensitive lifecycle actions

Suggested fields:

- `id uuid primary key default gen_random_uuid()`
- `device_id uuid null references public.bridge_devices(id) on delete cascade`
- `user_id uuid null references public.users(id) on delete set null`
- `event_type text not null`
- `event_payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Suggested event types:

- `device_registered`
- `pairing_started`
- `pairing_approved`
- `pairing_consumed`
- `session_issued`
- `session_refreshed`
- `pairing_revoked`
- `device_wiped`

## Recommended But Can Be Deferred Slightly

### 6. `bridge_update_manifests`

This is likely needed soon, but it does not have to block the first auth and messaging spike.

Suggested fields:

- `id uuid primary key default gen_random_uuid()`
- `channel text not null`
- `hardware_model text not null`
- `firmware_version text not null`
- `asset_bundle_version text null`
- `manifest_url text not null`
- `signature text not null`
- `active boolean not null default false`
- `created_at timestamptz not null default now()`

## Not Needed In The First Backend Slice

- bridge media tables
- bridge-local history cache tables
- fleet-management tables
- dashboard-specific transport tables

## RLS Recommendation

Do not expose bridge lifecycle tables directly to the bridge as ordinary client-managed table access in `v1`.

Recommended policy direction:

- users can read their own bridge device records from normal ShadowChat account UI later
- lifecycle mutation happens through server-side control-plane functions
- bridge lifecycle tables should not become a generic public API

That means:

- minimal or no direct client `INSERT/UPDATE/DELETE` on bridge control tables
- narrow `SELECT` exposure only where clearly needed

## Service Surface Proposal

## Use Edge Functions For `v1`

Recommended functions:

### `bridge-register`

Responsibilities:

- upsert `bridge_devices`
- return current device state

### `bridge-pairing-begin`

Responsibilities:

- create short-lived pairing code
- mark device `pairing_pending`
- write audit event

### `bridge-pairing-approve`

Responsibilities:

- validate approved code from a trusted logged-in user session
- create or update `bridge_pairings`
- mark code consumed
- write audit event

### `bridge-pairing-status`

Responsibilities:

- let bridge poll current pending or approved state
- optionally signal that session exchange is ready

### `bridge-session-exchange`

Responsibilities:

- perform the dedicated bridge session issuance or exchange
- create or update `bridge_device_sessions`
- return bridge session material

### `bridge-session-refresh`

Responsibilities:

- refresh the bridge-specific session
- update bridge session record
- return refreshed tokens and expiry

### `bridge-pairing-revoke`

Responsibilities:

- revoke pairing
- revoke bridge session record
- write audit event

### `bridge-heartbeat`

Responsibilities:

- update `bridge_devices.last_seen_at`
- optionally record health metadata

## Keep Existing RPCs For Messaging

Continue using the current authenticated RPCs where possible:

- `get_dm_conversations()`
- `get_or_create_dm_conversation()`
- `mark_dm_messages_read()`
- `toggle_message_reaction()`

This keeps the bridge aligned with the existing app until we have evidence that a narrower custom data-plane is necessary.

## Why Edge Functions Instead Of RPCs For Session Issuance

The control-plane work is closer to app/backend orchestration than pure SQL:

- pairing code lifecycle
- device identity checks
- session issuance
- token refresh
- service-role usage
- audit writes across multiple tables

That makes Edge Functions the safer default for the bridge control plane.

Pure SQL RPCs are still good fits for:

- narrow read helpers
- lightweight user-scoped data access
- existing DM helpers we already rely on

## Migration Proposal

Implement the backend in narrow slices.

## Migration Slice 1: Core Tables

Create:

- `bridge_devices`
- `bridge_pairing_codes`
- `bridge_pairings`
- `bridge_device_sessions`
- `bridge_audit_events`

Also add:

- indexes
- status constraints
- `updated_at` triggers where relevant

Exit condition:

- schema exists and is internally coherent

## Migration Slice 2: Control-Plane Security

Add:

- RLS enablement on bridge tables
- minimal policies for later account-side visibility
- no broad client mutation access

Exit condition:

- control-plane state is not writable through broad authenticated client access

## Migration Slice 3: Pairing Functions And Audit Helpers

Add helper SQL only where useful:

- audit event helper
- code expiry helper
- maybe a device lookup helper

Exit condition:

- backend-side control-plane functions have the DB primitives they need

## Service Slice 1: Edge Function Scaffolds

Create:

- `bridge-register`
- `bridge-pairing-begin`
- `bridge-pairing-approve`
- `bridge-pairing-status`
- `bridge-session-exchange`
- `bridge-session-refresh`
- `bridge-pairing-revoke`
- `bridge-heartbeat`

Exit condition:

- endpoints exist with request and response contracts, even if some internals are still stubbed

## Service Slice 2: Session Issuance Proof

This is the highest-risk milestone.

Goal:

- prove a dedicated bridge session can be issued cleanly without copying the browser session

Exit condition:

- one device gets its own session material and can use it for authenticated messaging access

## Service Slice 3: Revoke And Refresh Hardening

Goal:

- prove revoke and refresh behave predictably

Exit condition:

- remote revoke works
- refresh updates the active bridge session
- bridge can update Realtime auth after refresh

## `Phase 0` Backend Build Order

If we were starting implementation tomorrow, I would do it in this order:

1. Create migration slice 1 tables.
2. Create `bridge-register`, `bridge-pairing-begin`, and `bridge-pairing-approve`.
3. Create `bridge-pairing-status`.
4. Solve `bridge-session-exchange`.
5. Use the issued session for one real group send and receive path.
6. Use the issued session for one real DM send and receive path.
7. Add `bridge-session-refresh`.
8. Add `bridge-pairing-revoke`.
9. Add `bridge-heartbeat`.

That sequence attacks the actual risk in the right order.

## `v1` Backend Acceptance Criteria

The backend proposal is successful when:

- one device can register itself
- one device can begin pairing
- one logged-in user can approve that pairing
- the bridge can obtain dedicated session material
- the bridge can use that session for one group chat send and receive flow
- the bridge can use that session for one DM send and receive flow
- the bridge can refresh its own session
- the bridge can be revoked independently of the user's browser session

## Major Risks

### 1. Session Issuance Path

This is still the biggest uncertainty.

If the backend cannot produce a clean bridge-specific session, the rest of the design must pivot before too much is built.

### 2. Too Much Control Plane In SQL

If we try to force all lifecycle orchestration into SQL functions, we may make the system harder to evolve and audit.

Mitigation:

- keep lifecycle orchestration in Edge Functions
- use SQL for table shape, policies, and narrow helpers

### 3. Premature Data-Plane Rewrite

If we replace existing chat and DM access with a custom bridge API too early, we multiply backend scope before the auth path is proven.

Mitigation:

- reuse the current authenticated data plane first

## Open Questions

- exact mechanism used by `bridge-session-exchange`
- whether `bridge-pairing-status` should ever return session material directly
- whether `bridge-heartbeat` should write only `last_seen_at` in `v1` or also store a health payload
- whether bridge-aware claims are worth requiring in the first auth spike

## Recommended Next Deliverable

After this doc, the next planning artifact should be:

- a `Phase 0 implementation brief`

That brief should map:

- tables
- Edge Functions
- request and response contracts
- exact spike success checks

into the first actual engineering work package.
