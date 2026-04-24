# ESP Bridge Auth Model Spec

This document defines the recommended authentication model for `ShadowChat Bridge v1`.

It turns the earlier roadmap and documentation review into a concrete design decision that can guide pairing, backend schema, realtime behavior, and the `Phase 0` feasibility spike.

## Decision Summary

`v1` should use a `bridge-specific first-party user session` for a dedicated bridge user account.

That means:

- the bridge is owned/approved by the paired human user
- the bridge is authenticated to Supabase as its own device user
- the bridge does not reuse or clone the user's browser session
- pairing creates a dedicated device session for that bridge
- the bridge stores and refreshes its own access and refresh tokens
- the offline PC never receives backend credentials
- the backend can revoke the bridge independently of the user's browser sessions

This is the recommended `v1` direction because the current ShadowChat backend is already built around:

- user-scoped Supabase auth
- RLS-protected direct data access
- authenticated RPCs
- Supabase Realtime subscriptions

## Why This Model Fits The Existing Repo

Current ShadowChat data access is user-token centric:

- group chat reads and writes rely on authenticated RLS policies
- DM reads and writes rely on authenticated RLS policies plus authenticated RPCs
- the frontend client already manages session refresh and Realtime auth token updates
- only narrower side-effect domains like AI and push currently use dedicated Edge Functions

Because of that, a bridge-specific first-party session lets the bridge reuse the platform's existing authorization shape instead of forcing `v1` to invent a parallel message API surface.

## Options Considered

### Option A: Reuse Or Clone The Existing Browser Session

Do not use this.

Why:

- the bridge should not receive copied browser-session material
- Supabase refresh tokens are single-use and have reuse-detection behavior
- revocation and auditing become ambiguous
- the browser and bridge would compete for the same session lifecycle in ways that are easy to get wrong

### Option B: Bridge-Specific First-Party User Session

This is the recommended `v1` model.

Why:

- preserves compatibility with existing RLS and RPC patterns
- works naturally with Realtime authorization
- keeps the PC isolated from backend credentials
- allows bridge-specific revocation and observability

### Option C: Opaque Bridge Token Plus Fully Custom Bridge API

This is a valid future option, but not recommended for `v1`.

Why not for `v1`:

- requires building a custom messaging API layer
- likely requires a custom Realtime relay or a narrower event service
- duplicates a lot of existing authenticated user behavior

This is a stronger long-term isolation model, but it is too much surface area for the first bridge release unless the session-issuance path proves unworkable.

## Auth Model Requirements

The chosen model must satisfy all of these:

- one active paired user per bridge in `v1`
- no backend credentials exposed to the PC-side TUI or admin shell
- no reuse of the browser's current live session
- support independent bridge revoke and wipe
- support Realtime token refresh without silent degradation
- support existing RLS and authenticated RPC access patterns where practical
- support secure device-side persistence

## Core Auth Objects

### 1. Owner User Identity

The human ShadowChat account that owns, approves, and revokes the bridge.

### 1a. Bridge User Identity

A normal ShadowChat account/profile created for the physical bridge device. Messages sent from the bridge use this identity, so the owner and other users can receive normal notifications from the ESP account.

### 2. Bridge Device Identity

A persistent record for the physical bridge device.

Suggested record:

- `bridge_devices.id`
- hardware serial or stable hardware identifier
- hardware model
- firmware version
- status
- last_seen_at

### 3. Pairing Record

The explicit approval that binds one user to one bridge.

Suggested record:

- `bridge_pairings.id`
- `device_id`
- `user_id`
- status
- paired_at
- revoked_at

### 4. Bridge Session Record

A bridge-scoped session lifecycle record that tracks the dedicated auth state issued for that bridge.

Suggested record:

- `bridge_device_sessions.id`
- `device_id`
- `user_id`
- status
- issued_at
- expires_at
- `last_rotated_at`
- `revoked_at`
- `last_refresh_at`

This does not necessarily replace Supabase's internal session tracking. It gives the product a bridge-aware control layer even if underlying access still uses Supabase session mechanics.

## Recommended Lifecycle

### State 1: `UNPAIRED`

The bridge has no valid user binding and no active bridge session.

Allowed actions:

- Wi-Fi onboarding
- diagnostics
- pairing begin
- update checks if permitted by policy

### State 2: `PAIRING_PENDING`

The bridge has requested a short-lived pairing code and is waiting for user approval.

Allowed actions:

- pairing status polling
- code refresh or cancel
- diagnostics

### State 3: `PAIRED_ACTIVE`

The bridge has:

- an approved pairing
- valid stored bridge session material
- permission to access user-scoped messaging operations

Allowed actions:

- group chat send and receive
- DM send and receive
- authenticated RPC usage
- Realtime subscribe and refresh

### State 4: `PAIRING_REVOKED`

The backend has revoked the bridge or the local device has been wiped.

Required behavior:

- all bridge auth material becomes unusable
- the bridge falls back to `UNPAIRED`
- chat TUI stops normal messaging and directs the user to admin flow

### State 5: `SESSION_ROTATING`

The bridge is mid-refresh or mid-recovery of auth material.

Required behavior:

- local UX remains responsive
- pending outbound actions are either queued or fail clearly
- no silent "hung send" state

## Pairing Flow

### Recommended Flow

1. Bridge boots unpaired.
2. Admin shell requests `pairing.begin`.
3. Backend creates a short-lived `bridge_pairing_code`.
4. Device shows that code locally.
5. User approves the code from an already authenticated ShadowChat session.
6. Backend marks the pairing as approved.
7. Backend issues bridge-specific session material for that device and user.
8. Bridge stores the issued material locally in encrypted storage.
9. Bridge enters `PAIRED_ACTIVE`.

### Important Rule

The pairing approval flow should create a new bridge-specific session.

It should not:

- copy the browser's current refresh token
- export browser session state to the bridge
- expose any issued tokens to the offline PC

## Session Issuance Strategy

This is the most important implementation caveat in the design.

### Target Outcome

The bridge receives:

- a dedicated access token
- a dedicated refresh token
- session material tied to that bridge lifecycle rather than the browser's live session

### Current Design Position

This is the desired `v1` model, but the exact issuance mechanism must be proven in the spike.

The next implementation investigation should answer:

- can Supabase cleanly issue a dedicated user session for a bridge through an approved server-side flow
- or do we need a bridge-specific token exchange layer that still results in user-scoped access

### Fallback Rule

If dedicated session issuance proves awkward or unsafe, then `v1` should fall back to a narrower bridge API model rather than copying browser-session material.

## Bridge Runtime Responsibilities

Once paired, the bridge runtime owns its own auth lifecycle.

It must:

- load session material from encrypted storage
- initialize a backend client with explicit non-browser storage semantics
- refresh access tokens before expiry
- update the Realtime connection with fresh JWTs
- reconnect Realtime if refresh or transport failures occur
- surface degraded auth state to the local client

The PC-side interfaces must not own any of this.

## Realtime Contract

The bridge auth model must preserve Realtime correctness.

Required runtime behavior:

- maintain heartbeat health
- refresh access tokens before or at expiry
- send the refreshed JWT to Realtime when it changes
- reconnect or reauthorize channels after auth rotation when required
- surface auth-refresh failure as a visible degraded bridge state

This is a first-class requirement, not a later polish step.

## Storage Rules

### On The Bridge

Allowed:

- bridge device identifier
- pairing state
- bridge-issued access token
- bridge-issued refresh token
- session metadata required for rotation
- Wi-Fi credentials

Required production direction:

- encrypted NVS
- flash encryption
- signed firmware path

### On The PC

Not allowed:

- Supabase access token
- Supabase refresh token
- service role or secret keys
- raw bridge credential material

The PC only talks to the bridge protocol.

## Revocation Model

The bridge must be revocable independently of browser use.

### Local Revoke

If the user runs `/wipe` or `/pair revoke` locally:

- local bridge session material is deleted
- backend bridge session is marked revoked if reachable
- bridge returns to `UNPAIRED`

### Remote Revoke

If the user revokes the bridge from the account side:

- backend marks bridge pairing and bridge session revoked
- refresh attempts fail
- existing access token eventually expires
- bridge falls back to `UNPAIRED`

### Security Goal

Bridge revocation should not require signing the user out of the web app or other normal devices.

## Recommended Backend Surface

### Control Plane

Use dedicated Edge Functions or RPCs for:

- `pairing.begin`
- `pairing.approve`
- `pairing.revoke`
- bridge session issuance or exchange
- update checks
- device heartbeat or diagnostics

### Data Plane

Reuse existing authenticated data access where practical:

- group chat table access
- DM table access
- authenticated RPCs like conversation resolution and mark-read
- Realtime subscriptions

This split matches the current repo's existing pattern much better than a full custom bridge gateway.

## Schema Impact

### Definitely Needed

- `bridge_devices`
- `bridge_pairings`
- `bridge_pairing_codes`

### Strongly Recommended

- `bridge_device_sessions`
- `bridge_audit_events`

### Later But Likely

- `bridge_update_manifests`

## JWT And Claims Guidance

The bridge should behave like a normal authenticated user for data access, but the system should still know that the session belongs to a bridge.

Recommended direction:

- add bridge-aware claims or metadata to the issued access token if practical
- keep the standard authenticated role for existing RLS compatibility
- use bridge-aware metadata for observability, policy hardening, or future restrictions

This should not break current chat and DM RLS assumptions.

## Phase 0 Proof Requirements

The auth spike should prove all of the following:

- pairing can produce bridge-specific session material without copying the browser session
- bridge can persist that material locally in a designed storage layer
- bridge can use that material to perform one group send and receive path
- bridge can use that material to perform one DM send and receive path
- bridge can refresh auth without hanging local sends
- bridge can refresh or reauthorize Realtime cleanly
- remote revoke returns the device to `UNPAIRED`

## Risks

### 1. Session Issuance Complexity

The biggest risk is not the steady state. It is whether Supabase gives us a clean way to issue a dedicated session for a bridge after approval.

Mitigation:

- spike this first
- do not let `v1` proceed on an unproven issuance assumption

### 2. Refresh Token Concurrency

Supabase refresh tokens are single-use with reuse-detection semantics.

Mitigation:

- one bridge owns one bridge session
- the bridge serializes refresh behavior locally
- browser and bridge do not share the same refresh token lineage

### 3. Realtime Drift

If auth refresh and Realtime token updates are not tightly coordinated, the bridge can appear connected but stop receiving events.

Mitigation:

- make Realtime token rotation part of the auth runtime contract

## Open Questions

- exact server-side session issuance mechanism
- whether `bridge_device_sessions` mirrors or supplements Supabase internal session state
- whether we want bridge-specific JWT claims in `v1`
- whether some bridge operations should still be forced through Edge Functions even after pairing

## Related Docs

- [ESP Bridge Documentation Review](C:/repos/chat2.0/docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md:1)
- [ESP Bridge Feature Roadmap](C:/repos/chat2.0/docs/ESP_BRIDGE_FEATURE_ROADMAP.md:1)
- [ESP Bridge Pairing Flow Spec](C:/repos/chat2.0/docs/ESP_BRIDGE_PAIRING_FLOW_SPEC.md:1)
- [ESP Bridge Protocol Draft](C:/repos/chat2.0/docs/ESP_BRIDGE_PROTOCOL_DRAFT.md:1)
- [ESP Bridge Backend Schema Proposal](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_SCHEMA_PROPOSAL.md:1)
- [ESP Bridge Phase 0 Spike Checklist](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_SPIKE_CHECKLIST.md:1)

## Official References

- [Supabase User sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Auth overview](https://supabase.com/docs/reference/javascript/auth-api)
- [Supabase Realtime protocol](https://supabase.com/docs/guides/realtime/protocol)
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [Espressif NVS Encryption](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/storage/nvs_encryption.html)
- [Espressif Secure Boot v2](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/security/secure-boot-v2.html)
- [Espressif OTA Updates](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/ota.html)
