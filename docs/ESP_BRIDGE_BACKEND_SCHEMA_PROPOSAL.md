# ESP Bridge Backend Schema Proposal

This document proposes the backend data and service additions likely needed for the ESP bridge feature.

The current ShadowChat backend is browser-first. The bridge feature introduces new device lifecycle and update-management needs.

## Goals

- model one bridge device per user in `v1`
- support pairing and revocation
- support firmware and asset update flows
- keep auditability for sensitive device operations

## Proposed Entities

### bridge_devices

Purpose:

- persistent device record

Suggested fields:

- `id`
- `device_serial`
- `hardware_model`
- `firmware_version`
- `status`
- `created_at`
- `updated_at`
- `last_seen_at`
- `last_ip_hash` or equivalent safe diagnostic field if needed

### bridge_pairings

Purpose:

- bind one user to one device

Suggested fields:

- `id`
- `device_id`
- `user_id`
- `status`
- `paired_at`
- `revoked_at`
- `revoked_by`

### bridge_pairing_codes

Purpose:

- short-lived pair bootstrap flow

Suggested fields:

- `id`
- `device_id`
- `code`
- `status`
- `expires_at`
- `consumed_at`
- `created_at`

### bridge_update_manifests

Purpose:

- declare current approved firmware and local asset versions

Suggested fields:

- `id`
- `channel`
- `hardware_model`
- `firmware_version`
- `asset_bundle_version`
- `manifest_url`
- `signature`
- `created_at`
- `active`

### bridge_audit_events

Purpose:

- log sensitive lifecycle actions

Suggested fields:

- `id`
- `device_id`
- `user_id`
- `event_type`
- `event_payload`
- `created_at`

## Suggested Status Enums

### bridge_devices.status

- `active`
- `unpaired`
- `revoked`
- `disabled`

### bridge_pairings.status

- `pending`
- `paired`
- `revoked`
- `expired`

### bridge_pairing_codes.status

- `pending`
- `consumed`
- `expired`
- `revoked`

## Service Surface Needed

Likely bridge-specific backend actions:

- begin pairing
- approve pairing
- revoke pairing
- fetch current update manifest
- record device heartbeat
- record device version
- fetch bridge-scoped messaging bootstrap data

## Auth Direction

Preferred direction:

- use bridge-scoped credentials or tokens
- keep them separate from normal browser session tokens where possible
- make them independently revocable

## RLS Considerations

Device tables should not inherit browser-centric assumptions automatically.

Need explicit policy decisions for:

- device self-access
- user account visibility into paired devices
- admin-only update manifest writes
- audit event visibility

## Migration Strategy

Recommended staged rollout:

1. add device identity tables
2. add pairing tables
3. add update manifest table
4. add RPC/functions for pairing and status
5. add audit logging

## Open Questions

- whether update manifests live in Postgres, Storage, or both
- whether bridge devices authenticate via Supabase auth directly or a separate signed token path
- how much device heartbeat detail is worth storing
