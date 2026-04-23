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
- backend data-plane smoke calls for:
  - group send/poll
  - DM send/poll
- chat-first serial mode for group chat and one active DM thread

It does **not** implement the final local TUI yet. The current chat mode is an ESP serial-first Phase 0 proof that uses bridge-scoped Edge Functions for group and DM send/poll.

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
bridge wipe
pair begin
pair status
session exchange
session refresh
bridge heartbeat
group send <text>
group poll
dm send <recipient_user_id> <text>
dm poll <recipient_user_id>
chat group
chat dm <recipient_user_id>
```

Inside `chat group` or `chat dm <recipient_user_id>`, plain lines are sent as chat messages. Slash commands are reserved for mode control:

```text
/poll
/dm <recipient_user_id>
/group
/admin
/help
```

The serial reader accepts lines up to `1023` bytes. Longer lines are discarded as a whole line so overflow fragments are not accidentally executed as commands.

## Phase 0 Notes

- Wi-Fi credentials and bridge tokens are currently stored in plain NVS for spike speed.
- Production work should move this toward encrypted NVS, signed OTA, and stronger device hardening already captured in the roadmap docs.
- The next firmware milestone after this scaffold is:
  - local pairing UX polish
  - bridge session failure handling
  - near-realtime bridge receive loop
  - richer local TUI framing on the Windows side
