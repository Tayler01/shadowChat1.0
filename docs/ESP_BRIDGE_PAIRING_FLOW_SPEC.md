# ESP Bridge Pairing Flow Spec

This document proposes how a single bridge device becomes authorized for one ShadowChat account.

## Goals

- explicit user consent
- one active user per bridge in `v1`
- revocable device access
- recoverable if device is reset or transferred
- no backend credentials exposed to the offline PC
- no copied browser session living on the bridge

## V1 Recommendation

Use a `one-time pairing code` with account-side approval.

High-level flow:

1. Bridge boots in unpaired state.
2. Admin shell requests `pairing.begin`.
3. Bridge receives a short-lived pairing code from backend.
4. User enters or approves that code from a trusted already-online ShadowChat session.
5. Backend issues bridge-scoped credentials or bridge-specific session state.
6. Bridge stores secure pairing state locally.
7. Bridge transitions to paired and ready state.

## States

- `UNPAIRED`
- `PAIRING_PENDING`
- `PAIRED`
- `PAIRING_REVOKED`
- `PAIRING_ERROR`

## V1 User Journey

### Initial Pair

1. Plug in bridge
2. Open admin shell
3. Configure Wi-Fi
4. Run `/pair`
5. Device shows pairing code
6. User approves code from a trusted online ShadowChat session
7. Bridge confirms pairing success
8. Chat TUI becomes available

### Re-Pair

1. Admin runs `/wipe` or `/revoke`
2. Device clears local pairing state
3. Pair flow begins again

### Remote Revoke

1. User revokes bridge from account controls
2. Backend marks bridge credentials invalid
3. Bridge receives revoke state or fails next auth refresh
4. Bridge falls back to `UNPAIRED`

## Backend Requirements

Likely entities:

- `bridge_devices`
- `bridge_pairings`
- `bridge_pairing_codes`
- possibly `bridge_device_sessions`

## Data Model Draft

### bridge_devices

- `id`
- `device_serial`
- `hardware_model`
- `firmware_version`
- `created_at`
- `last_seen_at`
- `status`

### bridge_pairings

- `id`
- `device_id`
- `user_id`
- `paired_at`
- `revoked_at`
- `status`

### bridge_pairing_codes

- `id`
- `device_id`
- `code`
- `expires_at`
- `consumed_at`
- `status`

## Credential Model

The bridge should not store the user's normal browser session directly if a more scoped credential can be used.

Preferred direction:

- bridge-specific scoped token
- revocable independently of other user sessions
- limited to bridge-approved operations
- stored only on the bridge, never exposed to the PC-side client

If a scoped token is not available immediately, the design should still aim toward it.

Documentation-backed reason:

- Supabase sessions use short-lived access tokens plus single-use refresh tokens
- copying or "sharing" a browser session onto the bridge is the wrong mental model and adds avoidable lifecycle risk

## Local Storage Requirement

The bridge should treat pairing material as sensitive persisted state.

Planned production direction:

- encrypted NVS for stored pairing and device material
- flash encryption enabled in production
- signed firmware path so local secrets are not guarded only by obscurity

## Local UX Requirements

### Admin Shell

Must support:

- `/pair`
- `/pair status`
- `/pair code`
- `/pair revoke`

### Chat TUI

When unpaired:

- should not try to enter normal chat mode
- should show a simple "bridge not paired" state
- should direct the user to the admin shell

## Error Cases

- pairing code expired
- wrong code submitted
- backend unavailable
- user revoked during pairing
- local storage corruption

## Recovery Requirements

- user can always wipe and restart pair flow
- remote revoke must invalidate device access
- bridge must not stay in half-paired state after hard failure

## Open Questions

- whether pairing approval is done in the main ShadowChat app or a dedicated bridge-management page
- how bridge device names are set and displayed
- whether device-to-user binding is permanent until explicit revoke or can be rotated silently
- whether the issued bridge credential is best represented as:
  - a bridge-specific session managed through Supabase auth semantics
  - a bridge-specific signed token exchanged through an Edge Function or custom backend surface
