# ESP Bridge Update And Offline Software Status

## Current Milestone

Milestone 6: Live ESP Validation And Ship

## Completed

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
- Flashed the connected ESP32-S3 on `COM3`.
- Live serial check on `COM3` returned: `No firmware update manifest: No published update manifest is available for this target.`
- Added Supabase Storage bucket bootstrap migration for `bridge-artifacts`.
- Added firmware command `update apply [firmware]`.
- Added HTTPS OTA artifact download into the next ESP-IDF OTA partition.
- Added streaming SHA-256 verification before selecting the new boot partition.
- Added post-boot OTA validation with `esp_ota_mark_app_valid_cancel_rollback()`.
- Published a temporary `0.1.1-ota-test` firmware manifest and artifact, then revoked that manifest after the live OTA test.
- Live OTA on the connected ESP32-S3 succeeded from `0.1.0-phase0` to `0.1.1-ota-test`, verified SHA-256, rebooted from `ota_0`, and reported current on startup.
- Rebuilt and flashed final working firmware `0.2.0-ota-foundation` to `COM3`.
- Final live serial status reported `firmware_version: 0.2.0-ota-foundation`.
- Added `bundle check [windows_bundle|bootstrap]` and `bundle get [windows_bundle|bootstrap]` firmware commands.
- Added forced `@scb:` serial bundle frames: `bundleStart`, `bundleChunk`, and `bundleEnd`.
- Added PC receiver [tools/bridge-tui/bridge-bundle-receive.ps1](C:/repos/chat2.0/tools/bridge-tui/bridge-bundle-receive.ps1:1).
- Added reproducible packer [scripts/package-bridge-bundle.ps1](C:/repos/chat2.0/scripts/package-bridge-bundle.ps1:1).
- Added package scripts `bridge:bundle` and `bridge:bundle:pack`.
- Published `windows_bundle` versions `0.1.0-tools` and `0.1.1-tools` to Supabase Storage and the update manifest table. `0.1.1-tools` is the latest live bundle.
- Live ESP bundle transfer over `COM3` reconstructed `shadowchat-bridge-tools.zip` and verified SHA-256 on disk.
- Added first-plug boot banner pointing users to `bootstrap help`.
- Added `bootstrap help` with the offline setup sequence.
- Added `bootstrap script`, which prints a minimal PowerShell receiver script over serial for a PC that has no repo and no internet.
- Built and flashed firmware with the bootstrap commands to `COM3`.
- Live serial output confirmed `bootstrap help` and `bootstrap script` render usable instructions and script text.

## In Progress

- Final validation, documentation review, and GitHub push.

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
python C:\esp\esp-idf-v5.3.1\tools\idf.py -p COM3 flash
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
python C:\esp\esp-idf-v5.3.1\tools\idf.py -p COM3 flash
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
powershell -NoProfile -ExecutionPolicy Bypass -File tools\bridge-tui\bridge-bundle-receive.ps1 -Port COM3 -Target windows_bundle -OutputPath output\bridge-downloads-final -TimeoutSeconds 180
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
python C:\esp\esp-idf-v5.3.1\tools\idf.py -p COM3 flash
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
param([string]$Port='COM3',[string]$Output='.')
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
