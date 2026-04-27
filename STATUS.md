# ESP Bridge Update And Offline Software Status

## Current Milestone

Milestone 9: plug-and-play tools polish and Android badge stability.

## Current Live Device Note

- `npm run bridge:tui:smoke` found the ESP on the scanned bridge COM port, but
  the physical bridge could not complete smoke because its stored Wi-Fi
  credentials are no longer authenticating. Reconfigure Wi-Fi from the admin
  shell, then run `session recover`, `bundle check windows_bundle`, and
  `bundle get windows_bundle` to pull `0.1.11-tui-smooth-ai`.

## Completed

- Released Windows tools bundle `0.1.11-tui-smooth-ai` for the bridge TUI production-readiness pass.
- Uploaded Windows tools artifact to Supabase Storage path `windows/0.1.11-tui-smooth-ai/shadowchat-bridge-tools.zip`.
- Windows tools artifact SHA-256: `7485def9b4fbed2d86e2dc2ef53566250dd517f72eef135a0803d4e8eda69fff`; size: `30124` bytes.
- Applied Supabase migration `20260427104500_publish_bridge_tools_0_1_11_tui_smooth_ai.sql`.
- Deployed Supabase Edge Functions `openai-chat` and `bridge-group-send` with shared AI helper support for bridge TUI `@ai`.
- Live `bridge-update-check` smoke returned Windows bundle latest `0.1.11-tui-smooth-ai` with `updateAvailable: true` from `0.1.10-tui-dm-routing`.
- Live `openai-chat` smoke with a stable test account returned the expected `bridge ai ok` answer without posting to general chat.
- Released P0 DM routing/read-state fixes from commit `4f2e45b`.
- Pushed `main` to `origin/main`.
- Added [docs/ESP_BRIDGE_RELEASE_RUNBOOK.md](C:/repos/chat2.0/docs/ESP_BRIDGE_RELEASE_RUNBOOK.md:1) covering bridge versioning, artifact upload, manifest publishing, smoke checks, and rollback.
- Uploaded firmware artifact `0.2.8-p0-dm-routing` to Supabase Storage path `firmware/esp32-s3/0.2.8-p0-dm-routing/shadowchat_bridge.bin`.
- Firmware artifact SHA-256: `26338923502b1bcbfb78220d368208409bf26cf53d7c8e6b4706f97e16d568b6`; size: `1040176` bytes.
- Uploaded Windows tools bundle `0.1.10-tui-dm-routing` to Supabase Storage path `windows/0.1.10-tui-dm-routing/shadowchat-bridge-tools.zip`.
- Windows tools artifact SHA-256: `27d0e43fd7b85c2a68f2653db494ccd1f81f1222db8733b898c737908bd32545`; size: `29470` bytes.
- Applied Supabase migrations `20260426090000_bridge_mark_dm_messages_read.sql` and `20260426144500_publish_bridge_p0_dm_routing.sql`.
- Deployed Supabase Edge Functions `bridge-dm-poll` and `bridge-update-check` to project `shsqqouecvdoifzufkqm`.
- Live `bridge-update-check` smoke returned firmware latest `0.2.8-p0-dm-routing` and Windows bundle latest `0.1.10-tui-dm-routing`, both with `updateAvailable: true` from previous versions.
- Deployed Netlify production deploy `69ee2590933e0d42c4b64b57` to `https://shadowchat-1-0.netlify.app`.
- Production Playwright smoke reached Netlify but could not complete disposable signup because production did not return an active session; stable `PLAYWRIGHT_ACCOUNT_*` smoke accounts are still needed for production auth/resume smoke.
- Connected ESP bridge on scanned `COM4` recovered its expired bridge session, saw the firmware and Windows bundle manifests, and applied OTA from `0.2.7-fat-headroom` to `0.2.8-p0-dm-routing`.
- Post-OTA serial status reported `firmware_version: 0.2.8-p0-dm-routing`, and `update check firmware` reported the device current for `stable`.
- Real serial bundle receive downloaded `windows_bundle 0.1.10-tui-dm-routing` through the ESP and verified SHA-256 on disk.
- Read repo instructions and bridge planning/status docs.
- Confirmed validation commands from AGENTS.md, package scripts, and README.
- Confirmed existing firmware partition layout includes `factory`, `ota_0`, and `ota_1`.
- Confirmed `TASK.md`, `PLAN.md`, and `STATUS.md` were missing and need to be created for this long-running track.
- Created `TASK.md`, `PLAN.md`, and this `STATUS.md`.
- Added [docs/ESP_BRIDGE_OTA_AND_OFFLINE_SOFTWARE_PLAN.md](C:/repos/chat2.0/docs/ESP_BRIDGE_OTA_AND_OFFLINE_SOFTWARE_PLAN.md:1).
- Added migration `20260425123000_bridge_update_manifests.sql`.
- Added `bridge-update-check` Edge Function.
- Added explicit `verify_jwt = false` config for `bridge-update-check`.
- Applied the manifest migration to the linked Supabase project.
- Deployed `bridge-update-check` to Supabase project `shsqqouecvdoifzufkqm`.
- Live smoke call returned `200` with `updateAvailable: false` and `manifest: null`, as expected before publishing a manifest.
- Added firmware config `BRIDGE_UPDATE_CHANNEL`.
- Added firmware structured `update` protocol events.
- Added admin command `update check [firmware|windows_bundle|bootstrap]`.
- Added startup firmware update check after stored Wi-Fi reconnect/session refresh path.
- Updated firmware README with update-check commands and current OTA boundary.
- Built firmware successfully with ESP-IDF v5.3.1 using the managed Python environment.
- Flashed the connected ESP32-S3 on the scanned bridge COM port.
- Live serial check on the scanned bridge COM port returned: `No firmware update manifest: No published update manifest is available for this target.`
- Added Supabase Storage bucket bootstrap migration for `bridge-artifacts`.
- Added firmware command `update apply [firmware]`.
- Added HTTPS OTA artifact download into the next ESP-IDF OTA partition.
- Added streaming SHA-256 verification before selecting the new boot partition.
- Added post-boot OTA validation with `esp_ota_mark_app_valid_cancel_rollback()`.
- Published a temporary `0.1.1-ota-test` firmware manifest and artifact, then revoked that manifest after the live OTA test.
- Live OTA on the connected ESP32-S3 succeeded from `0.1.0-phase0` to `0.1.1-ota-test`, verified SHA-256, rebooted from `ota_0`, and reported current on startup.
- Rebuilt and flashed final working firmware `0.2.0-ota-foundation` to the scanned bridge COM port.
- Final live serial status reported `firmware_version: 0.2.0-ota-foundation`.
- Added `bundle check [windows_bundle|bootstrap]` and `bundle get [windows_bundle|bootstrap]` firmware commands.
- Added forced `@scb:` serial bundle frames: `bundleStart`, `bundleChunk`, and `bundleEnd`.
- Added PC receiver [tools/bridge-tui/bridge-bundle-receive.ps1](C:/repos/chat2.0/tools/bridge-tui/bridge-bundle-receive.ps1:1).
- Added reproducible packer [scripts/package-bridge-bundle.ps1](C:/repos/chat2.0/scripts/package-bridge-bundle.ps1:1).
- Added package scripts `bridge:bundle` and `bridge:bundle:pack`.
- Published `windows_bundle` versions `0.1.0-tools` and `0.1.1-tools` to Supabase Storage and the update manifest table. `0.1.1-tools` is the latest live bundle.
- Live ESP bundle transfer over the scanned bridge COM port reconstructed `shadowchat-bridge-tools.zip` and verified SHA-256 on disk.
- Added first-plug boot banner pointing users to `bootstrap help`.
- Added `bootstrap help` with the offline setup sequence.
- Added `bootstrap script`, which prints a minimal PowerShell receiver script over serial for a PC that has no repo and no internet.
- Built and flashed firmware with the bootstrap commands to the scanned bridge COM port.
- Live serial output confirmed `bootstrap help` and `bootstrap script` render usable instructions and script text.
- Started plug-and-play USB bootstrap drive work on branch `codex/esp-plug-play-bootstrap`.
- Added TinyUSB MSC bootstrap drive support with embedded `README.TXT`, `START.CMD`, `RECEIVE.PS1`, plus obvious setup aliases.
- Added a dedicated `usb_boot` FAT partition for the ESP-hosted bootstrap files.
- Added `bootstrap ping` so receiver scripts can auto-detect the bridge COM port before requesting `bundle get windows_bundle`.
- Added a no-repo Windows bootstrap payload under `tools/bridge-bootstrap`.
- Updated the bundle packer so the hosted Windows bundle also contains bootstrap scripts and instructions.
- Built TinyUSB MSC-only firmware and proved Windows mounts the ESP as a FAT drive at `D:`.
- Live Windows drive listing showed `README.TXT`, `START.CMD`, and `RECEIVE.PS1` served by the ESP.
- Added TinyUSB CDC composite support so the target firmware exposes both the bootstrap drive and a serial console.
- Composite firmware build succeeded with ESP-IDF v5.3.1.
- Packed `windows_bundle` version `0.1.2-tools` with the no-repo bootstrap helpers.
- Published `windows_bundle` version `0.1.2-tools` to Supabase Storage and the update manifest table.
- Flashed the composite firmware image to the connected ESP32-S3 on the scanned bridge COM port.
- Published `windows_bundle` version `0.1.3-tools` with hardened receiver buffering, then revoked `0.1.2-tools` because its null `published_at` sorted ahead of newer manifests.
- Published firmware versions `0.2.1-plug-play-bootstrap` and `0.2.2-plug-play-bootstrap` through Supabase Storage and manifests.
- Applied firmware OTA from `0.2.0-ota-foundation` to `0.2.1-plug-play-bootstrap`, then from `0.2.1-plug-play-bootstrap` to `0.2.2-plug-play-bootstrap`.
- Live Windows enumeration after OTA shows the composite bridge as both `COM4` and a FAT bootstrap drive at `D:`.
- Live ESP-hosted receiver `D:\RECEIVE.PS1` downloaded `windows_bundle 0.1.3-tools` and verified SHA-256.
- Updated the bootstrap receiver to save by default to Windows' real `Desktop\ShadowChatBridge` folder, which fixes OneDrive/Desktop redirection confusion.
- Updated ESP drive scripts so `START.CMD`, `SETUP.CMD`, and `START-HERE.cmd` no longer force `%USERPROFILE%\Desktop`.
- Updated the ESP-hosted README and receiver output to explicitly print the save folder and final ZIP path.
- Updated the receiver to open File Explorer with the completed ZIP selected after SHA-256 verification.
- Published `windows_bundle` version `0.1.4-tools` to Supabase Storage and manifests.
- Published `windows_bundle` version `0.1.5-tools` after the bundled firmware README changed during documentation polish.
- Published `windows_bundle` version `0.1.6-tools` with receiver admin-mode recovery before probe/download.
- Published `windows_bundle` version `0.1.7-tools` with documentation clarifying that the default Desktop download works with or without OneDrive redirection.
- Published firmware version `0.2.3-bootstrap-save-location` to Supabase Storage and manifests.
- Published firmware version `0.2.4-bootstrap-admin-recover` with the same receiver admin-mode recovery embedded on the ESP drive.
- Backfilled bridge manifest `published_at` values and pinned the hotfix manifests as latest so update checks do not get hidden behind older null-timestamp rows.
- Applied firmware OTA on the connected ESP32-S3 from `0.2.2-plug-play-bootstrap` to `0.2.3-bootstrap-save-location`, then to `0.2.4-bootstrap-admin-recover`.
- Live ESP-hosted receiver `D:\RECEIVE.PS1` downloaded `windows_bundle 0.1.6-tools` to `C:\Users\tayle\OneDrive\Desktop\ShadowChatBridge\shadowchat-bridge-tools.zip`, verified SHA-256, and launched File Explorer selection.
- Shrunk the ESP-hosted `usb_boot` FAT partition from `0x80000` to `0x20000`.
- Grew each app slot from `0x120000` to `0x140000` while keeping `factory`, `ota_0`, and `ota_1`.
- Enabled ESP-IDF size optimization for the bridge app defaults.
- Bumped firmware version to `0.2.5-space-headroom`.
- Built `0.2.5-space-headroom`; binary size dropped to `0xfdb40` bytes.
- Confirmed the optimized app still fits the older live `0x120000` slots with `140480` bytes free, so it can be OTA-applied before a future full partition-table flash.
- Published firmware version `0.2.5-space-headroom` to Supabase Storage and manifests.
- Applied OTA on the connected ESP32-S3 from `0.2.4-bootstrap-admin-recover` to `0.2.5-space-headroom`.
- Live status after OTA reported `firmware_version: 0.2.5-space-headroom`, Wi-Fi connected, session stored, auth stored, and `usb_bootstrap: MSC+CDC initialized`.
- Confirmed Windows still enumerates the bridge as `COM4` plus the ESP bootstrap FAT drive at `D:`.
- Added auto-detect to the repo-side Windows bundle receiver so `bridge-bundle-receive.ps1` no longer defaults to a fixed COM port.
- Added bundled `tools/bridge-tui/START-CHAT.CMD` as a double-click launcher for the chat TUI.
- Added bundled `tools/bridge-tui/BRIDGE-TOOLS-HELP.txt` with tool descriptions, normal workflows, and troubleshooting notes.
- Updated the Windows tools installer text, firmware README, and offline software plan so normal setup commands use port auto-detect instead of `-Port COMx`.
- Updated the firmware's serial-only `bootstrap script` fallback so the printed receiver auto-detects the bridge port.
- Published `windows_bundle` version `0.1.8-tools` with launcher/help/auto-detect changes, then superseded it with `0.1.9-tools` after live testing found an output path edge case.
- Published `windows_bundle` version `0.1.9-tools` with corrected receiver output handling for directory names that contain dots.
- Published firmware version `0.2.6-bootstrap-autodetect` with the auto-detecting serial-only fallback receiver script.
- Applied firmware OTA on the connected ESP32-S3 from `0.2.5-space-headroom` to `0.2.6-bootstrap-autodetect`.
- Live post-OTA status reported `firmware_version: 0.2.6-bootstrap-autodetect`.
- Completed the manual full flash after the ESP was placed in ROM bootloader mode. The ROM bootloader port was found by scanning serial devices with `VID_303A&PID_1001`.
- Verified the `0x140000` app-slot layout booted, but the `0x20000` `usb_boot` FAT partition was too small and reported `MSC filesystem mount failed: ESP_FAIL`.
- Adjusted the full-flash partition layout to `0x130000` app slots and a `0x50000` `usb_boot` FAT partition.
- Built and full-flashed firmware version `0.2.7-fat-headroom`, including erasing the new `usb_boot` region at `0x3b0000`.
- Live post-flash USB enumeration returned to ShadowChat app USB `VID_303A&PID_4001`, serial `COM4`, and FAT drive `D:`.
- Live post-flash status reported `firmware_version: 0.2.7-fat-headroom` and `usb_bootstrap: MSC+CDC initialized`.
- Published firmware version `0.2.7-fat-headroom` to Supabase Storage and manifests.
- Updated Android badge sync so a just-cleared local unread count is trusted briefly and stale launcher badge refreshes do not repaint a red dot right after opening a DM.
- Added a focused `AppBadgeSync` regression test for the Android badge repaint behavior.

## In Progress

- No active implementation work in this milestone.

## Pushed

- Branch: `main`
- Commit: current `main`
- Remote: `origin/main`
- Merged ESP feature branches have been deleted locally and on GitHub.

## Validation Log

Milestone 1 passed:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
supabase db push --yes
supabase functions deploy bridge-update-check
```

Live function smoke:

```text
POST /functions/v1/bridge-update-check
status=200
updateAvailable=false
manifest=null
```

Milestone 2 passed:

```powershell
$env:IDF_PATH='C:\esp\esp-idf-v5.3.1'
python C:\esp\esp-idf-v5.3.1\tools\idf.py build
$env:ESP_PORT='<scanned bridge COM port>'
python C:\esp\esp-idf-v5.3.1\tools\idf.py -p $env:ESP_PORT flash
```

Hardware smoke:

```text
update check
No firmware update manifest: No published update manifest is available for this target.
```

Milestone 3 passed:

```powershell
supabase db push --yes
$env:IDF_PATH='C:\esp\esp-idf-v5.3.1'
python C:\esp\esp-idf-v5.3.1\tools\idf.py build
$env:ESP_PORT='<scanned bridge COM port>'
python C:\esp\esp-idf-v5.3.1\tools\idf.py -p $env:ESP_PORT flash
supabase --experimental storage cp firmware\esp-bridge\build\shadowchat_bridge.bin ss:///bridge-artifacts/firmware/esp32-s3/0.1.1-ota-test/shadowchat_bridge.bin --content-type application/octet-stream --cache-control "max-age=31536000, immutable"
```

Live OTA smoke:

```text
Update available for firmware: 0.1.0-phase0 -> 0.1.1-ota-test
Downloading firmware 0.1.1-ota-test to OTA partition ota_0 at 0x140000
OTA download size: 1056352 bytes
OTA SHA-256 verified for 1056352 bytes
Firmware update staged. Rebooting into version 0.1.1-ota-test.
Startup update check: firmware is current (0.1.1-ota-test)
```

Final flashed firmware:

```text
firmware_version: 0.2.0-ota-foundation
update check
No firmware update manifest: No published update manifest is available for this target.
```

Milestone 4 passed:

```powershell
npm run bridge:bundle:pack
supabase --experimental storage cp output\bridge-bundles\shadowchat-bridge-tools-0.1.1-tools.zip ss:///bridge-artifacts/windows/0.1.1-tools/shadowchat-bridge-tools.zip --content-type application/zip --cache-control "max-age=31536000, immutable"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\bridge-tui\bridge-bundle-receive.ps1 -Target windows_bundle -OutputPath output\bridge-downloads-final -TimeoutSeconds 180
```

Live bundle receiver smoke:

```text
Receiving windows_bundle 0.1.1-tools -> output\bridge-downloads-final\shadowchat-bridge-tools.zip (21369 bytes)
Bundle SHA-256 verified for 21369 bytes
Transfer complete: output\bridge-downloads-final\shadowchat-bridge-tools.zip
SHA256: b5bcb0d9f4a2648c9260b8a89b666396123b9796a99c192590d00802315bc42b
```

Milestone 5 passed:

```powershell
python C:\esp\esp-idf-v5.3.1\tools\idf.py build
$env:ESP_PORT='<scanned bridge COM port>'
python C:\esp\esp-idf-v5.3.1\tools\idf.py -p $env:ESP_PORT flash
```

Live bootstrap smoke:

```text
bootstrap help
ShadowChat Bridge first-plug bootstrap
  1. Open this serial console at 115200 baud.
  2. Connect the ESP to Wi-Fi: wifi set "<ssid>" "<password>" then wifi connect.
  3. If the bridge is new: bridge register, pair begin, approve in ShadowChat, session exchange.
  4. Check approved PC tools: bundle check windows_bundle.
  5. If this PC has no receiver script yet, run bootstrap script and save the printed PowerShell.
  6. Run that PowerShell script on the PC. It asks the ESP for bundle get windows_bundle and verifies SHA-256.

bootstrap script
----- BEGIN SHADOWCHAT BRIDGE RECEIVER POWERSHELL -----
param([string]$Port='',[string]$Output='.')
...
----- END SHADOWCHAT BRIDGE RECEIVER POWERSHELL -----
```

Milestone 6 validation passed so far:

```powershell
npm run bridge:bundle:pack
npm run bridge:tui:test
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
git diff --check
```

Firmware final build/flash passed:

```text
shadowchat_bridge.bin binary size 0x103c60 bytes. Smallest app partition is 0x120000 bytes. 0x1c3a0 bytes (10%) free.
```

Milestone 7 validation passed:

```powershell
python C:\esp\esp-idf-v5.3.1\tools\idf.py build
```

Live MSC-only proof:

```text
Windows mounted TinyUSB Flash Storage USB Device as D:
D:\README.TXT
D:\START.CMD
D:\RECEIVE.PS1
```

Composite build proof:

```text
shadowchat_bridge.bin binary size 0x116190 bytes. Smallest app partition is 0x120000 bytes. 0x9e70 bytes (3%) free.
Warning: The smallest app partition is nearly full (3% free space left)!
```

Composite flash proof:

```powershell
$env:ESP_PORT='<scanned bridge COM port>'
python C:\esp\esp-idf-v5.3.1\tools\idf.py -p $env:ESP_PORT flash
```

```text
Wrote 1139088 bytes at 0x00020000
Hash of data verified.
Hard resetting via RTS pin.
```

Published bootstrap-capable Windows bundle:

```powershell
npm run bridge:bundle:pack
supabase --experimental storage cp output\bridge-bundles\shadowchat-bridge-tools-0.1.2-tools.zip ss:///bridge-artifacts/windows/0.1.2-tools/shadowchat-bridge-tools.zip --content-type application/zip --cache-control "max-age=31536000, immutable"
```

```text
windows_bundle stable any 0.1.2-tools
SHA256 f779d26630a1181f3995de84709b6838b9e8adb206b647413ba14c6ea1462861
size 25465
```

Published hardened Windows bundle:

```powershell
npm run bridge:bundle:pack
supabase --experimental storage cp output\bridge-bundles\shadowchat-bridge-tools-0.1.3-tools.zip ss:///bridge-artifacts/windows/0.1.3-tools/shadowchat-bridge-tools.zip --content-type application/zip --cache-control "max-age=31536000, immutable"
```

```text
windows_bundle stable any 0.1.3-tools
SHA256 065b18451b3aaea46f1ca129ebeb059ee05493c19d6cc2608329677b2e487f67
size 25498
```

Live composite USB proof after normal reboot and OTA:

```text
COM4     USB Serial Device (COM4)
D:       FAT 454656 bytes
D:\README.TXT
D:\START.CMD
D:\RECEIVE.PS1
D:\SETUP.CMD
D:\AUTORUN.INF
```

Documentation refresh proof:

```text
windows_bundle stable any 0.1.7-tools
SHA256 30e80fd118bd9482d426bb754a0ca9373960d4343d4bf67c858648ae6ce72a84
size 26133
```

Live drive-hosted receiver proof:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\RECEIVE.PS1 -Output output\plug-play-test
```

```text
Checking COM4...
Using COM4
Streaming windows_bundle 0.1.3-tools over serial. Keep the receiver open until bundleEnd.
Receiving shadowchat-bridge-tools.zip to output\plug-play-test\shadowchat-bridge-tools.zip
Bundle SHA-256 verified for 25498 bytes
Transfer complete: output\plug-play-test\shadowchat-bridge-tools.zip
SHA256: 065b18451b3aaea46f1ca129ebeb059ee05493c19d6cc2608329677b2e487f67
```

Save-location hotfix package/publish proof:

```powershell
npm run bridge:bundle:pack
supabase --experimental storage cp output\bridge-bundles\shadowchat-bridge-tools-0.1.6-tools.zip ss:///bridge-artifacts/windows/0.1.6-tools/shadowchat-bridge-tools.zip --content-type application/zip --cache-control "max-age=31536000, immutable"
supabase --experimental storage cp firmware\esp-bridge\build\shadowchat_bridge.bin ss:///bridge-artifacts/firmware/esp32-s3/0.2.4-bootstrap-admin-recover/shadowchat_bridge.bin --content-type application/octet-stream --cache-control "max-age=31536000, immutable"
supabase db push --yes
```

```text
windows_bundle stable any 0.1.6-tools
SHA256 6ca4906698157d0d50b94de5327651b9737a03217638fdef37d8c20f6705085e
size 25842

firmware stable esp32-s3 0.2.4-bootstrap-admin-recover
SHA256 05603470929b57b4210ea6e316026cdf72e4d4e6fba457aa66d7719d27890582
size 1140176
```

Live update-check proof:

```text
windows_bundle currentVersion 0.1.5-tools -> latestVersion 0.1.6-tools
firmware currentVersion 0.2.3-bootstrap-save-location -> latestVersion 0.2.4-bootstrap-admin-recover
```

Live OTA proof:

```text
Returned to admin shell.
Update available for firmware: 0.2.3-bootstrap-save-location -> 0.2.4-bootstrap-admin-recover
Downloading firmware 0.2.4-bootstrap-admin-recover to OTA partition ota_1 at 0x260000
OTA download size: 1140176 bytes
OTA SHA-256 verified for 1140176 bytes
Firmware update staged. Rebooting into version 0.2.4-bootstrap-admin-recover.
```

Live default receiver proof:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\RECEIVE.PS1
```

```text
Saving ShadowChat bridge tools to:
  C:\Users\tayle\OneDrive\Desktop\ShadowChatBridge
Checking COM4...
Using COM4
Already in admin shell.
Streaming windows_bundle 0.1.6-tools over serial. Keep the receiver open until bundleEnd.
Downloading:
  shadowchat-bridge-tools.zip
To:
  C:\Users\tayle\OneDrive\Desktop\ShadowChatBridge\shadowchat-bridge-tools.zip
Bundle SHA-256 verified for 25842 bytes
Download complete.
Saved file:
  C:\Users\tayle\OneDrive\Desktop\ShadowChatBridge\shadowchat-bridge-tools.zip
SHA256: 6ca4906698157d0d50b94de5327651b9737a03217638fdef37d8c20f6705085e
```

Milestone 8 build proof:

```powershell
python C:\esp\esp-idf-v5.3.1\tools\idf.py build
```

```text
Partition table binary generated:
factory  app factory 0x20000  1280K
ota_0    app ota_0   0x160000 1280K
ota_1    app ota_1   0x2a0000 1280K
usb_boot data fat    0x3e0000 128K

shadowchat_bridge.bin binary size 0xfdb40 bytes.
Smallest app partition is 0x140000 bytes.
0x424c0 bytes (21%) free.
```

Compatibility check against old live slot size:

```text
old 0x120000 slot free with optimized app: 140480 bytes
new 0x140000 slot free with optimized app: 271552 bytes
```

Milestone 8 publish and live OTA proof:

```powershell
supabase --experimental storage cp firmware\esp-bridge\build\shadowchat_bridge.bin ss:///bridge-artifacts/firmware/esp32-s3/0.2.5-space-headroom/shadowchat_bridge.bin --content-type application/octet-stream --cache-control "max-age=31536000, immutable"
supabase db push --yes
```

```text
firmware stable esp32-s3 0.2.5-space-headroom
SHA256 760e3a7ad8932beb00b014f49f95753388b92b7ff389b81cd796391d3aa01996
size 1039168
```

```text
Downloading firmware 0.2.5-space-headroom to OTA partition ota_0 at 0x140000
OTA download size: 1039168 bytes
OTA SHA-256 verified for 1039168 bytes
Firmware update staged. Rebooting into version 0.2.5-space-headroom.
```

Live post-OTA status proof:

```text
firmware_version: 0.2.5-space-headroom
wifi_connected: yes
usb_bootstrap: MSC+CDC initialized
```

Live Windows enumeration proof:

```text
COM4     USB Serial Device (COM4)
D:       FAT bootstrap drive
D:\README.TXT
D:\START.CMD
D:\RECEIVE.PS1
D:\SETUP.CMD
D:\AUTORUN.INF
```

Milestone 9 validation passed:

```powershell
npm run bridge:bundle:pack
npm run bridge:bundle:pack
npm test -- --runInBand tests/AppBadgeSync.test.tsx
npm run bridge:tui:test
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
python C:\esp\esp-idf-v5.3.1\tools\idf.py build
supabase db push --yes
```

Deterministic tools bundle proof:

```text
windows_bundle stable any 0.1.9-tools
SHA256 5d123df78cc10faec0bed5db1f5a903be6d741fc2d77353804a0b114561bbccd
size 29048
```

Live receiver proof with no explicit port:

```text
Auto-detecting ShadowChat bridge serial port...
Checking COM4...
Using COM4
Streaming windows_bundle 0.1.9-tools over serial. Keep the receiver open until bundleEnd.
Receiving windows_bundle 0.1.9-tools -> output\bridge-downloads-0.1.9\shadowchat-bridge-tools.zip (29048 bytes)
Bundle SHA-256 verified for 29048 bytes
Transfer complete: output\bridge-downloads-0.1.9\shadowchat-bridge-tools.zip
SHA256: 5d123df78cc10faec0bed5db1f5a903be6d741fc2d77353804a0b114561bbccd
```

Firmware publish and live OTA proof:

```text
firmware stable esp32-s3 0.2.6-bootstrap-autodetect
SHA256 17778abeb42eb3f6e8f2c2406036399fb26fa513368d0fd4d1c1a03cb029f0ec
size 1040160

Downloading firmware 0.2.6-bootstrap-autodetect to OTA partition ota_1 at 0x260000
OTA download size: 1040160 bytes
OTA SHA-256 verified for 1040160 bytes
Firmware update staged. Rebooting into version 0.2.6-bootstrap-autodetect.

firmware_version: 0.2.6-bootstrap-autodetect
```

Full partition-table flash proof:

```text
ROM bootloader serial: scanned bootloader COM port
USB ROM identity: VID_303A&PID_1001

Wrote 20928 bytes at 0x00000000
Wrote 1040160 bytes at 0x00020000
Wrote 3072 bytes at 0x00008000
Wrote 8192 bytes at 0x0000f000
Hash of data verified.
```

Corrected layout proof:

```text
factory app factory 0x20000  1216K
ota_0   app ota_0   0x150000 1216K
ota_1   app ota_1   0x280000 1216K
usb_boot data fat   0x3b0000 320K

shadowchat_bridge.bin binary size 0xfdf20 bytes.
Smallest app partition is 0x130000 bytes.
0x320e0 bytes (16%) free.
```

Live corrected flash proof:

```text
USB app identity: VID_303A&PID_4001
Serial: COM4
Drive: D: FAT, size 258048 bytes

firmware_version: 0.2.7-fat-headroom
usb_bootstrap: MSC+CDC initialized
```

Manifest proof:

```text
firmware stable esp32-s3 0.2.7-fat-headroom
SHA256 c246e2cb573d3aa82129c0738b9065151ff14f27081fd81fb2131f718d586f24
size 1040160
```

## Failed Approaches / Notes

- Do not use Netlify for ESP update artifacts; Netlify account credits previously disabled the site and update availability must not depend on that path.
- Do not expose a generic PC-driven proxy or arbitrary URL downloader; all future downloads must be selected from backend manifests.
- `deno check` is not available on this Windows environment because `deno` is not installed. Use Supabase CLI deploy plus live function smoke until Deno is installed.
- `idf.py` is not on PATH in a fresh shell, and `export.ps1` currently trips over the Windows `python` app alias. Use `C:\Users\tayle\.espressif\python_env\idf5.3_py3.13_env\Scripts\python.exe C:\esp\esp-idf-v5.3.1\tools\idf.py ...` with the ESP-IDF tool exports loaded from `idf_tools.py`.
- The Supabase CLI `projects api-keys -o env` values are quoted on this machine. Trim wrapping quotes before using those values in REST smoke scripts.
- Milestone 3 verifies OTA artifacts with manifest SHA-256 before booting them. Cryptographic signature verification is still a production hardening task and must not be described as complete yet.
- First bundle receiver test proved the transfer, but passing a new path like `output\bridge-downloads` was treated as a filename. The receiver now treats extensionless paths as directories; retest passed.
- After a serial timeout, direct `status`/`help` produced no shell output. Reflashing the same firmware restored the serial shell, and the bundle receiver retest passed. Track if this repeats during larger transfers.
- Attempted to capture the printed bootstrap script programmatically for syntax checking, but subsequent serial opens left the ESP reporting only `ESP-ROM:esp32s3-20210327` and no script markers. Treat this as a USB Serial/JTAG DTR/RTS handling issue in the ad hoc capture script; do not repeat that validation path until the receiver/open settings are hardened.
- `f_setlabel("SHADOWBRDG")` is not linked in the current FATFS build, so the firmware does not set a volume label directly. Use visible root files and `AUTORUN.INF` metadata instead.
- Long filenames failed on the ESP-hosted FAT volume during live MSC testing. Keep on-device bootstrap filenames 8.3-safe: `README.TXT`, `START.CMD`, `SETUP.CMD`, `RECEIVE.PS1`, and `AUTORUN.INF`.
- MSC-only TinyUSB firmware successfully mounted as a Windows drive but removed the COM port, which prevents the receiver script and normal shell from working. The production target for this feature is composite MSC + CDC.
- The composite build leaves only about 3% free in the smallest app partition. Before production, either trim firmware features, move to a larger flash/partition layout, or split optional USB bootstrap behavior behind release-specific builds.
- Windows generally will not auto-execute USB drive scripts for security. The supported no-repo flow is plug in ESP, open the small ESP drive, and double-click `START.CMD` or `SETUP.CMD`.
- A Kconfig help indentation mismatch caused one rebuild failure after a docstring polish edit. Fixed the help indentation before the next build.
- Direct `idf.py flash` over the TinyUSB CDC app port does not enter the ROM bootloader. Use OTA for app-to-app updates, or hold BOOT for a manual ROM flash.
- The initial drive-hosted receiver failed because the ESP emitted large bundle frames faster than PowerShell could drain its default serial buffer. Fixed with a 1 MB receiver buffer, 128-byte bundle chunks, and 35 ms firmware pacing.
- Supabase manifest rows with null `published_at` sort ahead of dated rows when ordering descending. Revoked affected `0.1.2-tools` and `0.2.1-plug-play-bootstrap` manifests; release publishing should always set `published_at`.
- The first save-location hotfix manifest publish used fixed timestamps that were older than one backfilled firmware row. Added a follow-up migration pinning `0.1.4-tools` and `0.2.3-bootstrap-save-location` to the newest publish time, then verified both update checks.
- Documentation polish changed a file included in the Windows bundle after `0.1.4-tools` had already been published. Do not overwrite immutable storage objects; publish a new bundle version instead.
- `Compress-Archive` produced timestamp-sensitive ZIP hashes. Replaced it with a deterministic sorted `ZipArchive` writer using fixed entry timestamps, then verified two consecutive `0.1.6-tools` packs produced the same SHA-256.
- If the ESP is left in chat mode, a bare `bootstrap ping` can be treated as chat input. The receiver now sends `/admin` before `bootstrap ping` and before `bundle get windows_bundle`.
- OTA cannot rewrite the partition table. `0.2.5-space-headroom` can be OTA-applied because it still fits old app slots, but the enlarged `0x140000` slots only take effect after a manual full flash that includes the partition table.
- A direct full-flash retry after TinyUSB composite firmware built successfully failed with `Failed to connect to ESP32-S3: No serial data received.` Do not retry a normal `idf.py -p <scanned app COM port> flash` until the board is placed in ROM bootloader mode with BOOT/RESET.
- `0.1.8-tools` was published successfully, but live receiver testing with `-OutputPath output\bridge-downloads-0.1.8` exposed that dotted directory names could be treated as filenames. Do not reuse that artifact; `0.1.9-tools` supersedes it.
- The first successful partition-table full flash used `0x140000` app slots and a `0x20000` `usb_boot` partition. The app booted, but FAT/MSC mount failed because that partition was too small for the wear-leveling-backed FAT volume. Use the corrected `0.2.7-fat-headroom` layout instead.
