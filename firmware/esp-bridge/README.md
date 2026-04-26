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

## USB Bootstrap Path

The bridge roadmap and documentation review called out two likely local USB paths on `ESP32-S3`:

- fixed-function `USB Serial/JTAG`
- TinyUSB `CDC-ACM`

The first spike used `USB Serial/JTAG` because it was the simplest dependable serial-first path for:

- admin shell bring-up
- pairing proof
- Wi-Fi onboarding
- no-internet-to-PC transport discipline

The plug-and-play bootstrap milestone adds a TinyUSB composite target on compatible boards. It exposes:

- a tiny FAT bootstrap drive with `README.TXT`, `START.CMD`, `SETUP.CMD`, `RECEIVE.PS1`, and `AUTORUN.INF`
- a TinyUSB CDC serial console used by the receiver script and normal bridge shell

Windows security policy should be expected to block true USB auto-run. The supported no-repo flow is to plug in the bridge, open the small ESP drive, and double-click `START.CMD` or `SETUP.CMD`.

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
update check [firmware|windows_bundle|bootstrap]
update apply [firmware]
bundle check [windows_bundle|bootstrap]
bundle get [windows_bundle|bootstrap]
bootstrap help
bootstrap script
protocol on|off|status
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
/protocol on|off
/admin
/help
```

The serial reader accepts lines up to `1023` bytes. Longer lines are discarded as a whole line so overflow fragments are not accidentally executed as commands.

## Update Checks

The firmware checks the `stable` update channel at startup after stored Wi-Fi reconnects and session recovery/refresh has had a chance to run. Manual checks are available from the admin shell:

```text
update check
update check firmware
update check windows_bundle
update check bootstrap
update apply firmware
```

`update apply firmware` fetches the latest published firmware manifest, downloads the allowlisted artifact URL over HTTPS, streams it into the next ESP-IDF OTA partition, verifies the downloaded bytes against the manifest SHA-256, selects the new boot partition, and reboots. On the next boot, the firmware marks the image valid so ESP-IDF rollback state is cleared after a successful start.

The manifest has a `signature` field reserved for production signing, but this milestone enforces SHA-256 integrity only. Do not treat firmware signature verification as complete until the device verifies a backend signing key before OTA apply.

## Offline Windows Bundle Transfer

The bridge can tunnel approved ShadowChat tool bundles to a Windows PC that has no direct internet connection.

From a PC that already has this repo:

```powershell
npm run bridge:bundle -- -Port COM3 -Target windows_bundle -OutputPath output\bridge-downloads
```

From a bare PowerShell prompt after receiving the script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\bridge-tui\bridge-bundle-receive.ps1 -Port COM3 -Target windows_bundle
```

The receiver opens the serial port, sends `bundle get windows_bundle`, reconstructs base64 chunk frames, writes the zip, and verifies SHA-256 before reporting success. The ESP never accepts an arbitrary URL from the PC; it only fetches artifacts returned by `bridge-update-check`.

To create the current Windows tools package:

```powershell
npm run bridge:bundle:pack
```

## First-Plug Bootstrap

On compatible TinyUSB builds, plugging the ESP into a Windows PC exposes a small bootstrap drive. Open that drive and double-click:

```text
START.CMD
```

or:

```text
SETUP.CMD
```

The script auto-detects the bridge COM port with `bootstrap ping`, asks the ESP for the approved `windows_bundle`, reconstructs `shadowchat-bridge-tools.zip`, and verifies SHA-256. By default it saves the ZIP into `Desktop\ShadowChatBridge`, using Windows' real Desktop path even when Desktop is redirected to OneDrive, prints the full save path, and opens File Explorer with the completed ZIP selected. The PC does not receive general internet access; the ESP fetches only manifest-selected ShadowChat artifacts.

If the ESP drive is unavailable, or if you are using a serial-only build, open any serial terminal at `115200` baud and run:

```text
bootstrap help
```

The ESP prints the no-internet setup sequence: connect Wi-Fi on the ESP, register/pair if needed, check the approved `windows_bundle`, and receive it through serial.

If the PC does not have the receiver script yet and the ESP drive is unavailable, run:

```text
bootstrap script
```

Copy the text between `BEGIN SHADOWCHAT BRIDGE RECEIVER POWERSHELL` and `END SHADOWCHAT BRIDGE RECEIVER POWERSHELL` into `Receive-ShadowChatBridge.ps1`, then run it from PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Receive-ShadowChatBridge.ps1 -Port COM3 -Output .
```

That minimal receiver asks the ESP to run `bundle get windows_bundle`, reconstructs the zip from serial frames, and checks the SHA-256 hash before reporting success.

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
/users <name_or_username>
/dms
/poll-interval <seconds>
/live on|off
/status
/protocol on|off
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

The TUI now enables the firmware's opt-in structured serial protocol with `protocol on`. Protocol frames are line-delimited JSON prefixed with `@scb:` and are used for message, mode, sent, and status events. The human-readable admin shell remains the default when protocol mode is not enabled, so normal serial monitors stay clean. Use `-NoProtocol` or `/protocol off` to fall back to text parsing.

Interactive mode renders a split console layout on wide terminals. The center pane is reserved for recent chat messages only, while status, admin output, protocol activity, and other live feed details stay in a side pane. Messages from the ESP bridge user are right-aligned and cyan; everyone else's messages stay left-aligned and green. The input row has a blinking cursor so the entry field remains visually obvious while incoming messages redraw. `/live` toggles near-realtime polling for the active group or DM thread without leaving the chat view.

Use `/users <name_or_username>` to search users without permanently leaving the active chat; results appear in the side live feed. The TUI remembers recent DM targets in preferences, `/dms` lists them, and Tab cycles through group chat plus recent DMs.

When entering `chat group` or `chat dm` for the first time, the bridge prints the latest messages and stores the last message as the active cursor. Chat cursors are persisted in NVS, so after reboot or flash the bridge resumes from the saved group cursor or saved DM cursor and fetches only newer messages. Follow-up `/poll` calls in chat mode also request only messages after that cursor, so the TUI auto-poll loop stays quiet until new group or DM traffic arrives. Admin `group poll` and `dm poll` still show the latest messages without using the chat cursor.

The TUI stores preferences in `%LOCALAPPDATA%\ShadowChatBridge\bridge-tui.json` on Windows. Mode changes, DM recipient changes, and poll interval changes are saved automatically outside smoke mode; use `/save` for an explicit save, or `-ResetPreferences` to discard saved defaults.

Smoke mode now uses UTF-8 serial I/O and can validate send/poll flows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/bridge-tui/bridge-tui.ps1 -Port COM3 -Smoke -SmokeGroupText "bridge smoke"
powershell -NoProfile -ExecutionPolicy Bypass -File tools/bridge-tui/bridge-tui.ps1 -Port COM3 -Smoke -Mode dm -SmokeDmRecipientUserId "<user_id>" -SmokeDmText "bridge dm smoke"
```

On boot, the firmware waits for stored Wi-Fi to reconnect and checks the stored bridge/auth session material. If session material is missing or close to expiry, it refreshes automatically so the bridge is ready for chat after a reboot or flash. It also reconnects stored Wi-Fi on demand before heartbeat, group, DM, and user-search calls if the station dropped, refreshes stored bridge session material when the stored session expiry is within five minutes, and retries bridge-authenticated calls once after refreshing when it receives an auth-expired response. If refresh fails and a recovery token is stored, the firmware auto-recovers by issuing a short-lived recovery pairing code and exchanging fresh session material without another approval.

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
