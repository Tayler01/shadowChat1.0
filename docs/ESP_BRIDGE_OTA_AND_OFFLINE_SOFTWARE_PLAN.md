# ESP Bridge OTA And Offline Software Delivery Plan

This document defines the implementation direction for firmware OTA updates and offline Windows software delivery through the ESP bridge.

## Product Requirements

The bridge must support three related update paths:

- firmware OTA updates for the ESP bridge
- manual update checks from the admin shell
- ShadowChat bridge software and dependency delivery to an offline Windows PC

The Windows PC must not receive general internet access. The ESP may fetch only signed, allowlisted ShadowChat artifacts described by backend manifests.

## Hosting Model

Use Supabase as the update control plane.

`bridge_update_manifests` stores the release metadata:

- target: `firmware`, `windows_bundle`, or `bootstrap`
- channel: `stable`, `beta`, or `dev`
- hardware model
- version
- artifact URL or Supabase Storage path
- SHA-256 digest
- signature
- size
- release notes
- published/revoked status

Artifacts may live in:

- Supabase Storage for product-managed releases
- GitHub Releases for large public binary bundles

The manifest is the authority either way. The ESP and PC-side tools must not accept arbitrary URLs from the PC operator.

## Security Contract

- Firmware artifacts must be signed before production OTA is considered complete.
- SHA-256 verification is required before install or handoff.
- The ESP must use HTTPS certificate verification for downloads.
- OTA apply must use ESP-IDF OTA partitions and rollback handling.
- The PC can request only named artifact targets and channels.
- The ESP never exposes bridge session tokens or Supabase credentials to the PC.

## Backend Surface

### `bridge-update-check`

Request:

```json
{
  "deviceId": "uuid-or-empty",
  "target": "firmware",
  "channel": "stable",
  "hardwareModel": "esp32-s3",
  "currentVersion": "0.1.0-phase0"
}
```

Headers:

```text
X-Bridge-Access-Token: bridge control-plane access token
```

Response:

```json
{
  "ok": true,
  "target": "firmware",
  "channel": "stable",
  "currentVersion": "0.1.0-phase0",
  "latestVersion": "0.1.1",
  "updateAvailable": true,
  "manifest": {
    "id": "uuid",
    "target": "firmware",
    "channel": "stable",
    "hardwareModel": "esp32-s3",
    "version": "0.1.1",
    "artifactUrl": "https://...",
    "artifactPath": null,
    "artifactSha256": "...",
    "signature": "...",
    "sizeBytes": 123456,
    "releaseNotes": "..."
  }
}
```

## Firmware Milestones

### Update Check

- add `update check`
- run startup check after Wi-Fi/session recovery
- print concise result
- emit structured protocol update event

### OTA Apply

- add `update apply`
- fetch manifest
- fetch artifact
- verify SHA-256
- verify signature
- write to OTA partition
- reboot into new image
- mark app valid after successful startup checks

### Rollback

The first production-ready OTA flow must call `esp_ota_mark_app_valid_cancel_rollback()` only after:

- boot completes
- NVS loads
- serial shell starts
- Wi-Fi reconnect path is not catastrophically broken

## Offline Windows Software Delivery

The offline PC needs a way to receive:

- bridge TUI script/package
- minimal runtime/dependency notes
- future richer local app bundle

The bridge should implement a chunked serial transfer:

1. PC asks for `bundle check`.
2. ESP calls `bridge-update-check` with `target=windows_bundle`.
3. PC asks for `bundle get`.
4. ESP fetches the signed artifact and streams fixed-size chunks over serial.
5. PC receiver writes to disk and validates SHA-256.

This preserves the boundary: the PC receives ShadowChat-approved bytes only, not internet access.

## First-Plug Standalone UX

When plugged into a PC with no helper installed, the ESP must print enough instructions over serial to bootstrap the user:

- port/baud guidance
- `help`
- `wifi set`
- `wifi connect`
- `bridge register`
- `pair begin`
- `bootstrap check`
- `bootstrap get`

True Windows auto-launch is not assumed.

### Plug-And-Play Bootstrap Drive

The improved first-plug path for compatible ESP32-S3 boards is a TinyUSB composite device:

1. MSC exposes a tiny FAT drive with `README.TXT`, `START.CMD`, `SETUP.CMD`, `RECEIVE.PS1`, and `AUTORUN.INF`.
2. CDC exposes a serial console from the same USB connection.
3. `START.CMD` runs `RECEIVE.PS1`.
4. `RECEIVE.PS1` scans COM ports and sends `bootstrap ping`.
5. The bridge responds with `SHADOWCHAT_BRIDGE_READY`.
6. The script requests `bundle get windows_bundle`.
7. The ESP fetches only the approved manifest artifact, streams it over serial, and the script verifies SHA-256.

Windows should not be expected to auto-execute `AUTORUN.INF` from removable media. The file is useful for drive metadata, but the supported user action is double-clicking the visible start script.

## Implemented State

The current firmware implements:

- `update check [firmware|windows_bundle|bootstrap]`
- `update apply firmware`
- `bundle check [windows_bundle|bootstrap]`
- `bundle get [windows_bundle|bootstrap]`
- `bootstrap help`
- `bootstrap ping`
- `bootstrap script`

The current Windows tool bundle path is:

```powershell
npm run bridge:bundle:pack
npm run bridge:bundle -- -Target windows_bundle
```

The ESP resolves `windows_bundle` from `bridge-update-check`, downloads only the manifest-selected artifact, emits `bundleStart`/`bundleChunk`/`bundleEnd` frames over serial, and the receiver verifies the reconstructed file hash before reporting success.

For first-plug PCs with no local tools, compatible firmware exposes a small USB drive with a ready-to-run receiver. Serial-only fallback remains available: `bootstrap help` prints the setup flow and `bootstrap script` prints a minimal PowerShell receiver that can be copied out of any serial terminal. This gives the offline PC a bootstrap path without assuming a browser, dashboard, internet connection, or repo checkout.

Production hardening still needed:

- firmware signature verification before OTA apply
- signed bundle verification in addition to SHA-256
- larger app partition or feature trimming; TinyUSB composite leaves little room in the current 4 MB partition layout
- larger bundle soak tests at slower serial speeds
- automated release publishing instead of manual Storage upload plus REST manifest upsert

For the operational versioning, artifact upload, manifest publishing, smoke,
and rollback workflow, use
[ESP Bridge Release Runbook](C:/repos/chat2.0/docs/ESP_BRIDGE_RELEASE_RUNBOOK.md:1).
