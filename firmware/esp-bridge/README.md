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
wifi set "<ssid with spaces>" "<password with spaces>"
wifi connect
wifi scan
bridge register
bridge wipe
pair begin
pair status
session exchange
session refresh
session recover
bridge heartbeat
group send <text>
group poll
dm send <recipient_user_id|@username> <text>
dm poll <recipient_user_id|@username>
chat group
chat dm <recipient_user_id|@username>
```

Inside `chat group` or `chat dm <recipient_user_id>`, plain lines are sent as chat messages. Slash commands are reserved for mode control:

```text
/poll
/dm <recipient_user_id|@username>
/group
/admin
/help
```

The serial reader accepts lines up to `1023` bytes. Longer lines are discarded as a whole line so overflow fragments are not accidentally executed as commands.

## Windows Chat TUI Client

The Phase 0 Windows-side chat client lives at [tools/bridge-tui/bridge-tui.ps1](C:/repos/chat2.0/tools/bridge-tui/bridge-tui.ps1:1). It opens the ESP serial port, enters chat mode, renders compact group/DM messages, and auto-polls the active thread.

Run the default group-chat TUI:

```powershell
npm run bridge:tui
```

For custom ports or flags, call the PowerShell script directly.

Run a DM thread by username or user id:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/bridge-tui/bridge-tui.ps1 -Port COM3 -Mode dm -DmRecipientUserId @caleb
```

Run a no-message smoke check against the connected bridge:

```powershell
npm run bridge:tui:smoke
```

TUI commands:

```text
/poll
/group
/dm <recipient_user_id|@username>
/poll-interval <seconds>
/status
/admin
/chat
/prefs
/save
/help
/quit
```

Admin shell commands also accept usernames for DMs:

```text
users search caleb
dm send @caleb hello from the bridge
dm poll @caleb
chat dm @caleb
```

Plain text sends to the active chat thread. `/admin` switches into the raw firmware admin shell; `/chat` returns to the last chat thread. The TUI status bar refreshes bridge health with `/status` in the active chat mode, so Wi-Fi and session state stay visible without forcing a thread switch. Use `/status-interval <seconds>` to change that cadence, or `0` for manual status refresh only.

When entering `chat group` or `chat dm` for the first time, the bridge prints the latest messages and stores the last message as the active cursor. Chat cursors are persisted in NVS, so after reboot or flash the bridge resumes from the saved group cursor or saved DM cursor and fetches only newer messages. Follow-up `/poll` calls in chat mode also request only messages after that cursor, so the TUI auto-poll loop stays quiet until new group or DM traffic arrives. Admin `group poll` and `dm poll` still show the latest messages without using the chat cursor.

The TUI stores preferences in `%LOCALAPPDATA%\ShadowChatBridge\bridge-tui.json` on Windows. Mode changes, DM recipient changes, and poll interval changes are saved automatically outside smoke mode; use `/save` for an explicit save, or `-ResetPreferences` to discard saved defaults.

Smoke mode now uses UTF-8 serial I/O and can validate send/poll flows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/bridge-tui/bridge-tui.ps1 -Port COM3 -Smoke -SmokeGroupText "bridge smoke"
powershell -NoProfile -ExecutionPolicy Bypass -File tools/bridge-tui/bridge-tui.ps1 -Port COM3 -Smoke -Mode dm -SmokeDmRecipientUserId "<user_id>" -SmokeDmText "bridge dm smoke"
```

On boot, the firmware waits for stored Wi-Fi to reconnect and checks the stored bridge/auth session material. If session material is missing or close to expiry, it refreshes automatically so the bridge is ready for chat after a reboot or flash. It also reconnects stored Wi-Fi on demand before heartbeat, group, DM, and user-search calls if the station dropped, refreshes stored bridge session material when the stored session expiry is within five minutes, and retries bridge-authenticated calls once after refreshing when it receives an auth-expired response. If refresh fails, the command reports the refresh failure and leaves the device in its current paired state for manual recovery.

If local access or refresh tokens become invalid, run `session recover`. After the first owner-approved exchange, the bridge stores a device recovery token in NVS. Future recovery attempts use that token to auto-approve a short-lived recovery code and immediately exchange fresh session material without asking for iPhone approval again. If the bridge has no recovery token yet, recovery still prompts you to approve the code in ShadowChat Settings > ESP Bridge once, then `session exchange` stores the recovery token for later.

For manual recovery from expired or revoked local session material, run `pair begin` on the bridge, approve the new code from ShadowChat Settings > ESP Bridge, then run `session exchange` on the bridge. The backend accepts a new pending pairing request from an already-paired physical bridge so a device with stale local tokens can be recovered without direct database cleanup.

## Phase 0 Notes

- Wi-Fi credentials and bridge tokens are currently stored in plain NVS for spike speed.
- Production work should move this toward encrypted NVS, signed OTA, and stronger device hardening already captured in the roadmap docs.
- The next firmware milestone after this scaffold is:
  - local pairing UX polish
  - bridge session failure handling
  - near-realtime bridge receive loop
  - richer local TUI framing on the Windows side
