# ESP Bridge Documentation Review

This document captures the official platform documentation review for the ESP bridge feature planning phase.

It is not the product spec itself. Its job is to record the platform constraints and implementation guardrails we should treat as source-backed inputs while designing the bridge.

## Review Scope

The review focused on the areas that can most easily derail the bridge if we plan from intuition instead of platform behavior:

- ESP32-S3 USB transport choices
- ESP-IDF provisioning options
- ESP-IDF secure storage and firmware update guidance
- Supabase auth/session behavior outside a normal browser app
- Supabase realtime token and heartbeat behavior
- Windows USB CDC support and launch assumptions

## Official Sources Reviewed

### Espressif

- [USB Device Stack - ESP32-S3](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/peripherals/usb_device.html)
- [USB Serial/JTAG Controller Console - ESP32-S3](https://docs.espressif.com/projects/esp-idf/en/release-v5.2/esp32s3/api-guides/usb-serial-jtag-console.html)
- [USB OTG Console - ESP32-S3](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-guides/usb-otg-console.html)
- [Provisioning API - ESP32-S3](https://docs.espressif.com/projects/esp-idf/en/release-v5.3/esp32s3/api-reference/provisioning/index.html)
- [Unified Provisioning](https://docs.espressif.com/projects/esp-idf/en/v4.3.5/esp32s2/api-reference/provisioning/provisioning.html)
- [NVS Encryption](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/storage/nvs_encryption.html)
- [Flash Encryption](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/security/flash-encryption.html)
- [Secure Boot v2 - ESP32-S3](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/security/secure-boot-v2.html)
- [OTA Updates](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/ota.html)
- [ESP HTTPS OTA - ESP32-S3](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/system/esp_https_ota.html)

### Supabase

- [Auth Overview](https://supabase.com/docs/reference/javascript/auth-api)
- [Listen to auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [User sessions](https://supabase.com/docs/guides/auth/sessions)
- [Realtime Protocol](https://supabase.com/docs/guides/realtime/protocol)
- [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Realtime: Handling Silent Disconnections in Background Applications](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794)

### Microsoft

- [USB serial driver (Usbser.sys)](https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/usb-driver-installation-based-on-compatible-ids)
- [Enabling and Disabling AutoRun](https://learn.microsoft.com/en-us/windows/win32/shell/autoplay-reg)

## Documentation-Backed Findings

### 1. `v1` should treat `USB serial` as a product decision, not just a transport placeholder

Espressif documents two relevant USB paths on `ESP32-S3`:

- the fixed-function `USB Serial/JTAG Controller`
- the configurable `USB Device Stack` built on TinyUSB

The fixed-function controller is simpler for a serial-first bridge and already maps well to the TUI/admin-shell requirement. The TinyUSB path is more flexible for composite devices and future transport expansion, but it introduces more moving pieces.

Important constraint from Espressif docs:

- the `USB OTG` peripheral and `USB Serial/JTAG` share a single PHY
- using TinyUSB device functionality while also relying on the serial/JTAG path has hardware and debugging implications

Planning consequence:

- `Phase 0` and `v1` should default to the simplest dependable serial path
- richer local transport experiments should be treated as a later milestone, not silently assumed inside `v1`

This recommendation is an inference from the docs, not a direct Espressif prescription.

### 2. Sleep and USB behavior matter for bridge reliability

Espressif explicitly notes that the USB Serial/JTAG controller becomes unavailable or unresponsive in sleep scenarios, and the USB OTG console docs call USB CDC more fragile than UART-like console paths.

Planning consequence:

- the bridge should not rely on light sleep or deep sleep while an active local session exists
- power management must be considered a reliability feature, not just an optimization task

### 3. Windows CDC support is favorable, but zero-click launch should not be assumed

Microsoft documents that `Usbser.sys` loads automatically for CDC devices with the expected class and subclass codes, which is good for a plug-in serial workflow.

Microsoft also documents that `AutoRun` on removable media is constrained, registry-controlled, and discouraged for general application distribution.

Planning consequence:

- we can reasonably target a no-extra-driver serial experience on Windows
- we should not promise true automatic app launch from the device in `v1`
- the safe planning assumption is: serial is automatic, UI launch is not

### 4. Wi-Fi onboarding does not need to start with BLE or SoftAP

ESP-IDF's provisioning framework supports BLE and SoftAP transport, custom endpoints, and proof-of-possession based security. That is useful, but our bridge already has a trusted local wired/admin-shell path.

Planning consequence:

- `v1` Wi-Fi onboarding can happen through the admin shell over the local wired link
- BLE or SoftAP provisioning is optional future work, not a required foundation for `v1`
- if we later add phone-assisted onboarding, the official provisioning stack is the right place to start

### 5. Device-side credential storage should assume encrypted persistence

Espressif's flash encryption and NVS encryption guidance makes it clear that sensitive configuration should not be treated like plain settings.

Planning consequence:

- device pairing state, refresh material, and Wi-Fi credentials should be stored in encrypted NVS
- the production design should assume flash encryption and NVS encryption, not plain flash persistence

### 6. Signed firmware and rollback are not optional quality extras

Espressif documents:

- `Secure Boot v2` for signed bootloader and app verification
- HTTPS OTA server verification
- OTA rollback validation with `esp_ota_mark_app_valid_cancel_rollback()`

Planning consequence:

- production firmware planning should assume signed builds
- OTA should be HTTPS-based with certificate verification
- the update design should include post-boot validation and rollback handling from the start

### 7. Bridge auth should not be modeled as "copy the browser session onto the device"

Supabase sessions consist of an access token plus a refresh token, and refresh tokens are single-use. Supabase also documents that non-browser environments need explicit storage behavior if they persist sessions.

Planning consequence:

- do not design pairing as a browser-session clone or raw token copy
- prefer a bridge-specific credential or bridge-specific issued session
- if any Supabase client is used in a non-browser runtime, its storage model must be explicitly designed

### 8. Realtime token rotation is part of the bridge contract

Supabase documents two relevant facts:

- the Realtime protocol expects heartbeats at least every 25 seconds
- Realtime channel authorization is refreshed when a new JWT is sent; if a new JWT is not sent, a client can be disconnected when the JWT expires

Planning consequence:

- bridge runtime design must include heartbeat ownership
- bridge runtime design must include explicit access-token rotation for Realtime, not just HTTP or API refresh
- this belongs in the bridge core design, not as a later reliability pass

### 9. Browser-specific Supabase guidance still matters for future local UI layers

Supabase documents that:

- `onAuthStateChange` callbacks should stay quick and should not call other Supabase methods synchronously inside the callback
- backgrounded browser apps may need worker-backed heartbeats and reconnect hooks for Realtime stability

Planning consequence:

- these are not `v1` TUI blockers
- they do matter for the future local dashboard and any richer locally delivered web app
- we should carry forward the session and realtime lessons already learned in the main ShadowChat app

### 10. The lightweight dashboard and future full app are not "free" extensions of a serial-only `v1`

This is a design inference from the reviewed material plus the current product constraints:

- serial-first `v1` cleanly supports TUI and admin shell
- serial-first `v1` does not automatically create a browser transport for a local dashboard

Planning consequence:

- local HTML dashboard work should be treated as a later transport or host-integration design step
- future local app delivery remains on the roadmap, but it should not distort `v1` into a half-finished multi-transport system

## Recommended Guardrails For The Next Design Pass

- Keep `Phase 0` and `v1` focused on `USB serial`, `chat TUI`, and `admin shell`
- Treat `bridge-specific auth` as a hard requirement, not a nice-to-have
- Treat `signed OTA`, `rollback`, `flash encryption`, and `NVS encryption` as part of the production path
- Keep `Wi-Fi onboarding` inside the admin shell for `v1`
- Require explicit `Realtime heartbeat` and `JWT refresh` ownership in the runtime design
- Do not promise true `auto-popup` behavior on Windows
- Treat `local dashboard` and `future full app bundle` as later transport-expansion milestones

## Design Areas Still Open

- whether `v1` serial transport should use the fixed-function USB Serial/JTAG path or TinyUSB CDC-ACM in the first spike
- exact bridge-issued credential model
- whether later local GUI work is best served by a constrained secondary transport or a PC-side local host helper
- how much local history should live on the bridge versus the PC
