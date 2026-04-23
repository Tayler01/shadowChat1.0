# ESP Bridge Phase 0 Implementation Brief

This document is the first implementation-facing work packet for the ESP bridge feature.

It turns the current planning stack into the exact `Phase 0` spike we would build first.

`Phase 0` is not the full product. Its purpose is to prove the highest-risk technical path:

- bridge registration
- pairing
- dedicated bridge session exchange
- group chat send and receive
- DM send and receive
- auth refresh and revoke basics

## Scope

`Phase 0` should prove one bridge can participate in ShadowChat without giving the connected PC general internet access.

Required outcomes:

- the bridge can connect to Wi-Fi
- the bridge can register itself with backend control-plane logic
- the bridge can begin pairing
- one authenticated ShadowChat user can approve pairing
- the bridge can exchange pairing approval for bridge-specific session material
- the bridge can use that session for one group chat send and receive flow
- the bridge can use that session for one DM send and receive flow
- the bridge can survive at least one auth refresh path
- the bridge can be revoked

## Explicit Non-Goals

Do not build these in `Phase 0`:

- polished chat TUI
- final admin shell UX
- dashboard transport
- media support
- AI support
- update manifests
- full production security hardening beyond what is needed to prove the path
- full account-side bridge management UI

## Hardware And Local Link

Baseline:

- `ESP32-S3`
- `USB CDC serial`

`Phase 0` should explicitly record which serial path is used:

- `USB Serial/JTAG`
- or TinyUSB `CDC-ACM`

This must be written down as part of the spike result, because it affects `v1` transport confidence.

## Backend Deliverables

## Migration Slice 1

Create these tables:

- `bridge_devices`
- `bridge_pairing_codes`
- `bridge_pairings`
- `bridge_device_sessions`
- `bridge_audit_events`

Also create:

- relevant indexes
- status constraints
- `updated_at` triggers where appropriate

## Migration Slice 2

Enable RLS and keep it narrow:

- no broad authenticated mutation access to bridge lifecycle tables
- allow only the minimal future visibility we intentionally want

## Service Slice 1

Create these Supabase Edge Functions as initial scaffolds:

- `bridge-register`
- `bridge-pairing-begin`
- `bridge-pairing-approve`
- `bridge-pairing-status`
- `bridge-session-exchange`
- `bridge-session-refresh`
- `bridge-pairing-revoke`
- `bridge-heartbeat`

Not all of them need full internals on day one, but the spike should define the request and response contracts for all of them.

## Existing Data Plane To Reuse

Do not build a custom messaging API in `Phase 0`.

Reuse current authenticated access patterns:

- `messages`
- `dm_conversations`
- `dm_messages`
- `get_dm_conversations()`
- `get_or_create_dm_conversation()`
- `mark_dm_messages_read()`
- existing Realtime subscriptions

## Firmware Deliverables

The bridge firmware should implement:

- device identity reporting
- Wi-Fi onboarding through local admin interaction
- serial protocol transport for admin and smoke messaging actions
- pairing begin/status flow
- session storage
- session refresh handling
- one group send/receive path
- one DM send/receive path
- revoke handling

## Local Interface Deliverables

For `Phase 0`, the local interface can stay simple.

Required:

- raw admin-shell style interaction over serial
- ability to enter Wi-Fi config
- ability to trigger pairing
- ability to view current pairing and backend state
- ability to send one group message
- ability to send one DM

Not required:

- polished chat layout
- final TUI keymap
- emoji UX

## Exact Build Order

Build in this order:

### 1. Schema

- create bridge tables
- add indexes and constraints
- add minimal security posture

### 2. Register Function

Implement `bridge-register`.

Success:

- bridge can identify itself and backend persists or returns a device record

### 3. Pairing Begin

Implement `bridge-pairing-begin`.

Success:

- bridge receives a short-lived pairing code

### 4. Pairing Approve

Implement `bridge-pairing-approve`.

Success:

- a trusted logged-in ShadowChat user can approve the device

### 5. Pairing Status

Implement `bridge-pairing-status`.

Success:

- bridge can detect transition from pending to approved

### 6. Session Exchange

Implement `bridge-session-exchange`.

Success:

- bridge receives dedicated bridge session material
- no browser session is copied onto the bridge

### 7. Group Chat Proof

Using the issued session:

- send one group message
- receive one group message through realtime or the selected event path

### 8. DM Proof

Using the issued session:

- resolve or open one DM conversation
- send one DM
- receive one DM

### 9. Session Refresh Proof

Implement `bridge-session-refresh`.

Success:

- bridge refreshes its own session
- bridge can continue authenticated access after refresh

### 10. Revoke Proof

Implement `bridge-pairing-revoke`.

Success:

- remote revoke causes the bridge session to become unusable
- bridge falls back to `UNPAIRED`

## Request And Response Contracts

These do not need final production payloads yet, but they should be stable enough to code against.

## `bridge-register`

Request:

- `device_serial`
- `hardware_model`
- `firmware_version`

Response:

- `device_id`
- `status`
- `paired_user_id` or `null`

## `bridge-pairing-begin`

Request:

- `device_id`

Response:

- `pairing_code`
- `expires_at`
- `pairing_request_id` if used

## `bridge-pairing-approve`

Request:

- authenticated user context
- `pairing_code`

Response:

- `ok`
- `device_id`
- `pairing_status`

## `bridge-pairing-status`

Request:

- `device_id`
- `pairing_code` or request id

Response:

- `status`
- `approved`
- `session_exchange_ready`

## `bridge-session-exchange`

Request:

- `device_id`
- approved pairing context

Response:

- `access_token`
- `refresh_token`
- `expires_at`
- `session_metadata`

## `bridge-session-refresh`

Request:

- `device_id`
- bridge refresh material

Response:

- `access_token`
- `refresh_token`
- `expires_at`

## `bridge-pairing-revoke`

Request:

- authenticated user context or authorized device-side revoke context
- `device_id`

Response:

- `ok`
- `status`

## `bridge-heartbeat`

Request:

- `device_id`
- `firmware_version`
- connection health summary

Response:

- `ok`
- optional policy or status hints

## Success Checks

`Phase 0` is complete only if all of these are demonstrated:

1. Bridge registers.
2. Pairing begin returns a short-lived code.
3. A real authenticated user approves that code.
4. The bridge obtains dedicated session material without copying a browser session.
5. The bridge sends one group message.
6. The bridge receives one group message.
7. The bridge sends one DM.
8. The bridge receives one DM.
9. The bridge performs at least one refresh or proves the refresh path end to end in a controlled way.
10. The bridge can be revoked and returns to `UNPAIRED`.
11. The connected PC still does not gain arbitrary internet access.

## Suggested Test Artifacts

Capture these during the spike:

- serial session logs
- pairing code lifecycle log
- session exchange success log
- one group message send and receive transcript
- one DM send and receive transcript
- refresh test result
- revoke test result
- short implementation note on chosen USB serial path

## Decision Log Required At End Of Spike

At the end of `Phase 0`, record:

- chosen serial implementation path
- actual backend session issuance mechanism
- whether Realtime worked directly with the bridge-issued session
- whether the bridge needed any extra mediation for DM or group messaging
- what changed from the planning assumptions

## Files And Areas Likely To Change First

Backend:

- [supabase/migrations](C:/repos/chat2.0/supabase/migrations)
- [supabase/functions](C:/repos/chat2.0/supabase/functions)

Planning references:

- [ESP Bridge Auth Model Spec](C:/repos/chat2.0/docs/ESP_BRIDGE_AUTH_MODEL_SPEC.md:1)
- [ESP Bridge Session Issuance And Pairing Exchange](C:/repos/chat2.0/docs/ESP_BRIDGE_SESSION_ISSUANCE_AND_PAIRING_EXCHANGE.md:1)
- [ESP Bridge Backend Implementation Proposal](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_IMPLEMENTATION_PROPOSAL.md:1)
- [ESP Bridge Protocol Draft](C:/repos/chat2.0/docs/ESP_BRIDGE_PROTOCOL_DRAFT.md:1)
- [ESP Bridge Phase 0 Spike Checklist](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_SPIKE_CHECKLIST.md:1)

## Recommended Next Step After This Brief

After this brief, the next work artifact should be one of:

- a migration plan doc with exact SQL slices
- an Edge Function contract doc with concrete JSON payload examples
- the start of actual implementation
