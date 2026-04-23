# ESP Bridge Session Issuance And Pairing Exchange

This document defines the recommended control-plane flow for:

- `pairing.begin`
- user approval
- bridge session issuance
- bridge session refresh
- revoke and wipe behavior

It builds directly on [ESP Bridge Auth Model Spec](C:/repos/chat2.0/docs/ESP_BRIDGE_AUTH_MODEL_SPEC.md:1) and narrows that strategy into a concrete `v1` exchange design.

## Goal

Produce a `v1` pairing and session flow that:

- does not copy the browser's current live session onto the bridge
- gives the bridge its own user-scoped backend access
- keeps all backend credentials off the offline PC
- supports Realtime token refresh and reconnect
- supports bridge-specific revoke

## Recommended Control-Plane Split

Use a dedicated backend control surface for pairing and session lifecycle.

Recommended `v1` control-plane operations:

- `bridge.register`
- `pairing.begin`
- `pairing.status`
- `pairing.approve`
- `bridge.session.exchange`
- `bridge.session.refresh`
- `pairing.revoke`
- `bridge.heartbeat`

These should be implemented through Edge Functions or tightly scoped RPC and server logic, not exposed directly to the PC client.

## Actors

### 1. Bridge Device

The ESP bridge firmware.

Responsibilities:

- generates or reports stable device identity
- requests pairing
- stores issued bridge session material
- refreshes its own session
- reports device heartbeat

### 2. Offline PC

The local TUI or admin shell host.

Responsibilities:

- displays bridge state
- triggers local pairing actions through the bridge protocol
- never receives Supabase credentials

### 3. Trusted ShadowChat Session

An already authenticated browser or app session used by the human user to approve pairing.

Responsibilities:

- views pending pair request
- approves or rejects the specific bridge

### 4. Backend Control Plane

The server-side issuance and lifecycle logic.

Responsibilities:

- records device registration
- creates short-lived pairing codes
- validates user approval
- issues bridge session material
- tracks revocation and heartbeat state

## Required Records

### `bridge_devices`

Tracks device identity and lifecycle.

Suggested fields:

- `id`
- `device_serial`
- `hardware_model`
- `firmware_version`
- `status`
- `created_at`
- `updated_at`
- `last_seen_at`

### `bridge_pairing_codes`

Tracks the short-lived pairing bootstrap.

Suggested fields:

- `id`
- `device_id`
- `code`
- `status`
- `expires_at`
- `consumed_at`
- `created_at`

### `bridge_pairings`

Tracks which user has paired which bridge.

Suggested fields:

- `id`
- `device_id`
- `user_id`
- `status`
- `paired_at`
- `revoked_at`
- `revoked_by`

### `bridge_device_sessions`

Tracks bridge-issued session lifecycle at the product level.

Suggested fields:

- `id`
- `device_id`
- `user_id`
- `supabase_session_id` if available
- `status`
- `issued_at`
- `last_refresh_at`
- `last_rotated_at`
- `expires_at`
- `revoked_at`

### `bridge_audit_events`

Tracks sensitive actions.

Suggested fields:

- `id`
- `device_id`
- `user_id`
- `event_type`
- `event_payload`
- `created_at`

## Recommended End-To-End Flow

### 1. Device Registration

### Trigger

Bridge boots for the first time or after a local wipe.

### Backend Action

`bridge.register`

### Bridge Input

- stable device identifier
- hardware model
- firmware version

### Backend Result

- create or upsert `bridge_devices`
- return device status
- return whether the device is already paired, revoked, or unpaired

### Notes

This step should not issue user-scoped session material.

It exists so the backend knows the device before pairing begins.

### 2. Pairing Begin

### Trigger

User runs `/pair` in the admin shell.

### Backend Action

`pairing.begin`

### Preconditions

- device is registered
- device is not currently paired with an active session

### Backend Result

- create a short-lived `bridge_pairing_code`
- store pending status
- return:
  - `pairing_code`
  - `expires_at`
  - optional `pairing_request_id`

### Bridge Behavior

- show code locally
- enter `PAIRING_PENDING`
- allow `pairing.status` polling

### 3. User Approval

### Trigger

User approves the displayed code from a trusted ShadowChat session.

### Backend Action

`pairing.approve`

### Trusted Caller

An already authenticated ShadowChat user session.

### Preconditions

- pairing code exists
- pairing code is pending
- pairing code is not expired
- target device is not revoked

### Backend Result

- create or update `bridge_pairings`
- mark pairing code consumed
- mark device as paired-pending-session or equivalent
- create audit event

### Important Rule

Approving the code should not hand the bridge the browser's existing refresh token.

Approval authorizes the device. It does not export the current session.

### 4. Bridge Session Exchange

### Trigger

Bridge polls `pairing.status` or requests an explicit exchange after approval.

### Backend Action

`bridge.session.exchange`

### Preconditions

- pairing exists and is approved
- device identity matches the approved device
- no revoked state is active

### Required Outcome

The bridge receives new bridge-specific session material:

- `access_token`
- `refresh_token`
- `expires_at`
- session metadata needed for future refresh

### Backend Side Effects

- create or update `bridge_device_sessions`
- record linkage to device and user
- add bridge-specific metadata or claims if supported
- write audit event

### Bridge Side Effects

- store issued material in encrypted NVS
- initialize backend client using explicit non-browser storage semantics
- initialize Realtime auth with the issued access token
- move to `PAIRED_ACTIVE`

### 5. Steady-State Refresh

### Trigger

The bridge detects token nearing expiry or receives an auth-failure path that requires refresh.

### Backend Action

`bridge.session.refresh`

### Preconditions

- refresh token is present
- device session is not revoked
- pairing is still active

### Required Outcome

Return:

- new `access_token`
- new `refresh_token`
- updated `expires_at`

### Backend Side Effects

- update `bridge_device_sessions.last_refresh_at`
- update `bridge_device_sessions.last_rotated_at` if token lineage changes
- optionally track `supabase_session_id`

### Bridge Side Effects

- atomically replace stored session material
- update Realtime auth token
- reconnect or reauthorize Realtime if needed

### 6. Heartbeat

### Trigger

Periodic bridge health report while paired.

### Backend Action

`bridge.heartbeat`

### Suggested Payload

- `device_id`
- firmware version
- pair status
- backend connectivity state
- realtime connectivity state
- last successful refresh time

### Purpose

- operational visibility
- stale device detection
- troubleshooting

This should not become a heavy telemetry pipeline in `v1`.

### 7. Remote Revoke

### Trigger

User revokes the bridge from account controls.

### Backend Actions

- `pairing.revoke`
- mark `bridge_pairings` revoked
- mark `bridge_device_sessions` revoked
- add audit event

### Bridge Effect

- next refresh fails
- existing access token eventually expires
- device falls back to `UNPAIRED`

### UX Requirement

The bridge should show a clear revoked state, not just generic auth failure.

### 8. Local Wipe

### Trigger

User runs `/wipe` locally.

### Bridge Actions

- delete local stored session material
- delete local pairing material
- return to `UNPAIRED`

### Backend Actions

If reachable:

- mark pairing revoked or cleared
- mark bridge session revoked
- add audit event

If not reachable:

- device still wipes local material immediately
- backend cleanup occurs next time the device can reach the control plane or via later user revoke

## Sequence Recommendation

```text
Bridge -> bridge.register -> Backend
Bridge -> pairing.begin -> Backend
Backend -> pairing code -> Bridge
User -> pairing.approve -> Backend
Bridge -> pairing.status / bridge.session.exchange -> Backend
Backend -> dedicated bridge session -> Bridge
Bridge -> group chat / DM / Realtime -> Supabase data plane
Bridge -> bridge.session.refresh -> Backend
Bridge -> pairing.revoke or Backend remote revoke -> revoked state
```

## Recommended Bridge Storage Model

Store locally on the bridge:

- device identifier
- pairing identifier
- pairing status
- access token
- refresh token
- expiry metadata
- last successful refresh time

Store only in encrypted device storage.

Do not expose any of these to the PC protocol.

## Recommended Backend Service Surface

### Keep Narrow

The control plane should stay small and explicit.

Recommended `v1` operations:

- pair begin
- pair approve
- pair status
- session exchange
- session refresh
- revoke
- heartbeat

### Do Not Add

- generic SQL execution
- generic token inspection to the PC
- arbitrary proxy behavior

## Session Issuance Strategy Notes

This is still the highest-risk part of the design.

The target model is clear:

- dedicated bridge session
- not browser-session cloning

The `Phase 0` spike must prove which backend mechanism gives us that cleanly.

Possible implementation directions:

1. A true bridge-issued Supabase session created through a server-approved path
2. A bridge-specific exchange layer that results in user-scoped access tokens compatible with the current data plane

### Fallback Rule

If we cannot prove a clean dedicated session issuance path, then we should move the bridge toward a narrower custom data-plane surface rather than compromising by sharing browser session material.

## Realtime Requirements

The exchange design must explicitly support Realtime.

Required bridge behavior:

- set the current JWT on the Realtime client at startup
- update the JWT whenever refresh succeeds
- reconnect or reauthorize after token rotation when necessary
- surface auth degradation to the local client

Required backend expectation:

- bridge-issued sessions must be usable for the same authenticated Realtime access model that current ShadowChat clients rely on

## Required Phase 0 Proofs

The spike should prove:

- `bridge.register`
- `pairing.begin`
- approval from a trusted user session
- `bridge.session.exchange`
- one successful group chat send and receive path
- one successful DM send and receive path
- one successful auth refresh path
- one successful Realtime auth update after refresh
- one successful remote revoke path

## Open Questions

- exact server-side implementation for session issuance
- whether `pairing.status` returns session material directly or only signals readiness for a separate exchange call
- whether `bridge.heartbeat` should be authenticated only by the live bridge session or also accept a device-bound control token
- whether bridge-aware claims can be attached to issued JWTs cleanly in `v1`

## Related Docs

- [ESP Bridge Auth Model Spec](C:/repos/chat2.0/docs/ESP_BRIDGE_AUTH_MODEL_SPEC.md:1)
- [ESP Bridge Pairing Flow Spec](C:/repos/chat2.0/docs/ESP_BRIDGE_PAIRING_FLOW_SPEC.md:1)
- [ESP Bridge Backend Schema Proposal](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_SCHEMA_PROPOSAL.md:1)
- [ESP Bridge Protocol Draft](C:/repos/chat2.0/docs/ESP_BRIDGE_PROTOCOL_DRAFT.md:1)
- [ESP Bridge Phase 0 Spike Checklist](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_SPIKE_CHECKLIST.md:1)
