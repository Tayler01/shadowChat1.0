# ESP Bridge Phase 0 Progress

This note records the current implementation state of the ESP bridge `Phase 0` spike as of `2026-04-23`.

It complements the planning stack by answering two practical questions:

- what has already been built and verified
- what still needs to happen next

## Completed So Far

### Backend Control Plane

Implemented and pushed on `main`:

- bridge lifecycle tables:
  - `bridge_devices`
  - `bridge_pairing_codes`
  - `bridge_pairings`
  - `bridge_device_sessions`
  - `bridge_audit_events`
- session-material hash support on `bridge_device_sessions`
- Edge Functions:
  - `bridge-register`
  - `bridge-pairing-begin`
  - `bridge-pairing-approve`
  - `bridge-pairing-status`
  - `bridge-session-exchange`
  - `bridge-session-refresh`
  - `bridge-pairing-revoke`
  - `bridge-heartbeat`

Current backend status:

- pairing lifecycle exists
- bridge-scoped control-plane token lifecycle exists
- refresh, revoke, and heartbeat exist
- data-plane Supabase user-session minting is still not proven

### Firmware Workspace

Implemented and pushed on `main`:

- ESP-IDF firmware workspace at [firmware/esp-bridge/README.md](C:/repos/chat2.0/firmware/esp-bridge/README.md:1)
- serial-first admin shell in [firmware/esp-bridge/main/main.c](C:/repos/chat2.0/firmware/esp-bridge/main/main.c:1)
- NVS-backed local config for:
  - Wi-Fi SSID/password
  - bridge device state
  - bridge control-plane tokens
- admin-shell commands for:
  - `wifi set`
  - `wifi connect`
  - `bridge register`
  - `pair begin`
  - `pair status`
  - `session exchange`
  - `session refresh`
  - `bridge heartbeat`

### Build Validation

Proven on this machine:

- `ESP-IDF v5.3.1` installs successfully on Windows
- firmware project configures successfully for `esp32s3`
- firmware project builds successfully with:

```powershell
idf.py set-target esp32s3
idf.py build
```

Current firmware build baseline:

- `USB Serial/JTAG` chosen for the first spike
- `4 MB` flash layout
- `factory`, `ota_0`, `ota_1` partitions
- `MINIMAL_BUILD` enabled to avoid unrelated component build failures

## Not Yet Proven

These parts are still open:

- flashing to a real `ESP32-S3` board from this workspace
- confirming the admin shell on actual hardware
- end-to-end Wi-Fi onboarding on device
- end-to-end pairing against the live backend from device
- real device-side revoke/wipe flow command
- real Supabase data-plane auth proof for:
  - group chat send/receive
  - DM send/receive
- realtime bridge session ownership on device
- chat TUI

## Immediate Next Steps

The next implementation steps should happen in this order:

1. Connect a real `ESP32-S3` board and detect the correct `COM` port.
2. Flash the current firmware with:

```powershell
idf.py -p COMx flash monitor
```

3. Verify the admin shell appears over USB Serial/JTAG.
4. Run and capture:
   - `wifi set <ssid> <password>`
   - `wifi connect`
   - `bridge register`
   - `pair begin`
5. Confirm pairing approval from a real authenticated ShadowChat session.
6. Run:
   - `pair status`
   - `session exchange`
   - `session refresh`
   - `bridge heartbeat`
7. Add a device-side `revoke/wipe` shell command.
8. Decide and implement the real data-plane auth proof path.
9. Prove one group message send/receive and one DM send/receive from device.

## Current Honest Status

The project is now past planning-only work.

What exists today is:

- a documented bridge architecture
- a real backend control plane
- a real ESP-IDF firmware workspace
- a successful local `esp32s3` firmware build

What does **not** exist yet is a hardware-proven messaging bridge.

That is the next milestone.
