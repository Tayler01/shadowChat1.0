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
- already-approved bridges can recover expired local session material with a stored device recovery token after one owner-approved bootstrap exchange
- direct Supabase user-session minting remains intentionally unproven

### Firmware Workspace

Implemented and pushed on `main`:

- ESP-IDF firmware workspace at [firmware/esp-bridge/README.md](C:/repos/chat2.0/firmware/esp-bridge/README.md:1)
- serial-first admin shell in [firmware/esp-bridge/main/main.c](C:/repos/chat2.0/firmware/esp-bridge/main/main.c:1)
- NVS-backed local config for:
  - Wi-Fi SSID/password
  - bridge device state
  - bridge control-plane tokens
  - bridge recovery token
  - group and active-DM chat cursors
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
- Windows-side Phase 0 chat TUI client at [tools/bridge-tui/bridge-tui.ps1](C:/repos/chat2.0/tools/bridge-tui/bridge-tui.ps1:1) with:
  - group and DM chat modes
  - interval polling
  - raw admin shell escape
  - no-message smoke validation mode

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
- polished Windows-side chat TUI
- structured local protocol framing between Windows and bridge firmware
- automatic receive loop beyond the current TUI polling loop

## Immediate Next Steps

The next implementation steps should happen in this order:

1. Harden the Windows-side TUI into a richer split-pane experience with saved preferences and cleaner input rendering.
2. Add a receive strategy for realtime or near-realtime updates:
   - Realtime WebSocket ownership on device, or
   - short polling/long polling over bridge data-plane functions for the first TUI.
3. Decide whether Phase 1 should keep the narrow bridge data-plane Edge Functions or pursue direct Supabase user-session minting.
4. Add production-hardening follow-ups:
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
- live Wi-Fi onboarding against the current iPhone hotspot
- live backend register, pairing, session exchange, refresh, heartbeat, and wipe proof
- live group chat send/poll proof through bridge-scoped data-plane functions
- live DM send/poll proof through bridge-scoped data-plane functions
- a first ESP-side chat mode over serial for group chat and one active DM thread
- a first Windows-side chat TUI client over the ESP serial shell
- persistent group/DM cursors across firmware flashes
- a self-recovery path for already-approved bridges using a stored recovery token

What does **not** exist yet is the polished, structured-protocol Windows-side chat TUI experience.

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
- Windows TUI `-Smoke`
- `session recover` with stored recovery-token auto-approval

Important implementation discoveries:

- shell task stack needed to be increased for HTTPS/TLS calls
- ESP HTTP response bodies needed to be collected through the HTTP event callback
- token-bearing session responses must be redacted before printing to serial
- raw line-oriented serial input can split longer text; current firmware now discards oversized lines as a whole line instead of executing fragments
- returning full joined user profiles exposed too much data, so bridge data-plane functions now return minimal display profile fields
- bridge sessions expiring while the device is idle exposed the need for an already-approved recovery secret; the current backend now hashes that secret on `bridge_devices`, and the ESP stores only the plaintext copy in local NVS

## Hardware Proof Captured On 2026-04-24

Verified on `COM3` against device `a091ab7f-88de-4b8b-befb-9d8a53d9ff60`:

- device has a dedicated bridge user identity: `ESP Bridge ABF584`
- group messages and DMs to `@caleb` send successfully from the ESP user
- push notifications for ESP-originated messages deliver through the existing `send-push` path
- group and DM chat cursors persist across firmware flash and resume without replaying prior history
- Wi-Fi reconnect is attempted on demand before bridge heartbeat/group/DM/user-search actions
- `session recover` now has two modes:
  - first bootstrap after this change still requires owner approval so the ESP can receive a recovery token
  - later recovery uses the stored recovery token to auto-approve a short-lived pairing code and immediately run `session exchange`
- successful self-recovery test returned `autoApprovedRecovery: true`, exchanged fresh access/refresh/auth material, and reported `recovery_token: (stored)` in firmware status
- follow-up TUI smoke passed group send/poll, DM send/poll, status, and cursor resume after self-recovery
- a foreground soak on `2026-04-24` completed 12 consecutive TUI smoke passes:
  - each pass sent and polled one group message and one DM to `@caleb`
  - pass 4 intentionally ran `session recover`
  - recovery returned `autoApprovedRecovery: true` and exchanged fresh session material without iPhone approval
  - all later passes continued to send/poll group and DM traffic successfully
- the Windows TUI smoke harness now waits longer around send/poll operations and verifies admin-shell sync before sending chat mode commands, after an earlier soak attempt exposed serial desync and valid-but-slow DM sends
- the firmware now supports an opt-in structured serial protocol:
  - `protocol on|off|status` in the admin shell
  - `/protocol on|off` in chat mode
  - line-delimited `@scb:{...}` events for status, mode, sent, and message frames
- the Windows TUI enables structured protocol by default, parses protocol frames, and hides them from the user transcript
- the Windows TUI now renders a split wide-terminal layout with:
  - center recent-message pane with chat messages only
  - ESP bridge messages right-aligned and cyan, with other users left-aligned and green
  - side live-feed pane for status, admin output, protocol activity, and other operational noise
  - fixed input row
  - blinking text-entry cursor
  - protocol/live receive/send state
- `/live` now toggles near-realtime polling for the active group or DM thread
- after updating stored Wi-Fi credentials from the current Windows profile `Camper1407`, a foreground smoke on `2026-04-24` passed:
  - structured protocol enablement
  - auto-approved `session recover`
  - group send/poll
  - DM send/poll to `@caleb`
  - bridge status with Wi-Fi and session material stored
