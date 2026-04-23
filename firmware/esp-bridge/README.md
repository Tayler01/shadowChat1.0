# ShadowChat ESP Bridge Firmware

This is the first `Phase 0` ESP-IDF firmware workspace for the ShadowChat airgapped bridge.

## Current Scope

This firmware spike intentionally focuses on the lowest-risk device path first:

- `ESP32-S3`
- `USB Serial/JTAG` console for the admin shell
- Wi-Fi station onboarding through the shell
- backend control-plane calls for:
  - `bridge-register`
  - `bridge-pairing-begin`
  - `bridge-pairing-status`
  - `bridge-session-exchange`
  - `bridge-session-refresh`
  - `bridge-heartbeat`

It does **not** implement the final chat TUI yet, and it does **not** implement Supabase data-plane messaging auth yet. The current exchange and refresh flow is for the bridge control plane only, matching the current backend proof state.

## Current Build Baseline

The current spike is configured for a `4 MB` flash layout with:

- `factory`
- `ota_0`
- `ota_1`

That keeps OTA planning in the project without assuming a larger flash size than the first spike needs.

## Why USB Serial/JTAG First

The bridge roadmap and documentation review called out two likely serial paths on `ESP32-S3`:

- fixed-function `USB Serial/JTAG`
- TinyUSB `CDC-ACM`

For this first spike, the firmware uses `USB Serial/JTAG` because it is the simplest dependable serial-first path for:

- admin shell bring-up
- pairing proof
- Wi-Fi onboarding
- no-internet-to-PC transport discipline

We can revisit TinyUSB later if `v1` needs a richer composite USB transport.

## Build Requirements

- ESP-IDF installed locally
- target set to `esp32s3`

This workspace has been build-validated locally with `ESP-IDF v5.3.1` using:

```powershell
idf.py set-target esp32s3
idf.py build
```

## Configure

Use `menuconfig` to set:

- `ShadowChat Bridge -> Supabase project URL`
- `ShadowChat Bridge -> Supabase anon key`
- optional device serial override

## Build And Flash

```powershell
cd C:\repos\chat2.0\firmware\esp-bridge
idf.py set-target esp32s3
idf.py menuconfig
idf.py build
idf.py -p COMx flash monitor
```

## Admin Shell Commands

```text
help
status
wifi set <ssid> <password>
wifi connect
bridge register
pair begin
pair status
session exchange
session refresh
bridge heartbeat
```

## Phase 0 Notes

- Wi-Fi credentials and bridge tokens are currently stored in plain NVS for spike speed.
- Production work should move this toward encrypted NVS, signed OTA, and stronger device hardening already captured in the roadmap docs.
- The next firmware milestone after this scaffold is:
  - local pairing UX polish
  - device-side revoke/wipe command
  - bridge session failure handling
  - real data-plane auth proof for group chat and DMs
