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
- bridge-scoped group chat and DM data-plane Edge Function proof exists
- direct Supabase user-session minting remains intentionally unproven

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
  - `bridge wipe`
  - `group send`
  - `group poll`
  - `dm send`
  - `dm poll`
  - `chat group`
  - `chat dm <recipient_user_id>`
- serial chat mode with:
  - plain-line message sending
  - slash commands for poll, thread switching, help, and admin return
  - overflow-safe 1023-byte input line handling

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

- direct Supabase user-session minting on device
- realtime bridge session ownership on device
- full Windows-side chat TUI
- structured local protocol framing between Windows and bridge firmware
- automatic receive loop with device-side cursors/checkpoints

## Immediate Next Steps

The next implementation steps should happen in this order:

1. Build the Windows-side chat-first TUI client against the ESP serial shell/protocol.
2. Add a receive strategy for realtime or near-realtime updates:
   - Realtime WebSocket ownership on device, or
   - short polling/long polling over bridge data-plane functions for the first TUI.
3. Add device-side message cursor/checkpoint storage.
4. Decide whether Phase 1 should keep the narrow bridge data-plane Edge Functions or pursue direct Supabase user-session minting.
5. Add production-hardening follow-ups:
   - encrypted NVS
   - signed OTA
   - more explicit redaction/sanitized serial output

## Current Honest Status

The project is now past planning-only work and past control-plane-only proof.

What exists today is:

- a documented bridge architecture
- a real backend control plane
- a real ESP-IDF firmware workspace
- a successful local `esp32s3` firmware build
- a real ESP32-S3 hardware proof over `USB Serial/JTAG`
- live Wi-Fi onboarding against `Camper1407`
- live backend register, pairing, session exchange, refresh, heartbeat, and wipe proof
- live group chat send/poll proof through bridge-scoped data-plane functions
- live DM send/poll proof through bridge-scoped data-plane functions
- a first ESP-side chat mode over serial for group chat and one active DM thread

What does **not** exist yet is the polished Windows-side chat TUI experience.

That is the next milestone.

## Hardware Proof Captured On 2026-04-23

Board:

- `ESP32-S3`
- Windows port: `COM3`
- USB path: `USB Serial/JTAG`
- derived bridge serial: `esp32s3-348518ABF584`
- backend device id: `a091ab7f-88de-4b8b-befb-9d8a53d9ff60`

Verified against the linked Supabase project:

- `bridge register`
- `pair begin`
- authenticated `bridge-pairing-approve`
- `pair status`
- `session exchange`
- `session refresh`
- `bridge heartbeat`
- `bridge wipe`
- `group send`
- `group poll`
- `dm send`
- `dm poll`
- `chat group`
- `chat dm <recipient_user_id>`

Important implementation discoveries:

- shell task stack needed to be increased for HTTPS/TLS calls
- ESP HTTP response bodies needed to be collected through the HTTP event callback
- token-bearing session responses must be redacted before printing to serial
- raw line-oriented serial input can split longer text; current firmware now discards oversized lines as a whole line instead of executing fragments
- returning full joined user profiles exposed too much data, so bridge data-plane functions now return minimal display profile fields
