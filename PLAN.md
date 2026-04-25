# ESP Bridge Update And Offline Software Plan

## Milestone 1: Manifest Foundation

Status: complete

Deliverables:

- create/update task tracking files
- document the OTA and offline software delivery architecture
- add `bridge_update_manifests`
- add `bridge-update-check`
- configure function JWT behavior explicitly
- validate frontend gates still pass

Acceptance:

- repo has a concrete signed-manifest contract
- backend can answer whether an update is available for firmware, Windows bundle, or bootstrap assets
- no generic proxy behavior is introduced

## Milestone 2: Firmware Update Check UX

Status: complete

Deliverables:

- firmware command: `update check`
- firmware startup check after Wi-Fi/session readiness
- structured protocol event for update status
- TUI display for available update notices

Acceptance:

- connected ESP can check the manifest live
- manual check produces human-readable output
- startup check is non-blocking and safe when offline

## Milestone 3: Firmware OTA Apply

Status: complete

Deliverables:

- firmware command: `update apply`
- HTTPS artifact download
- SHA-256 verification
- signature verification hook recorded for the manifest contract
- ESP-IDF OTA partition write
- post-boot validation and rollback handling

Acceptance:

- firmware can download and stage an OTA image
- bad hash refuses to install; signature enforcement remains a hardening follow-up
- successful boot marks app valid

## Milestone 4: Offline Windows Software Bundle Tunnel

Status: complete

Deliverables:

- manifest target for `windows_bundle`
- bridge command to list bundle availability
- chunked, allowlisted artifact transfer over serial
- PC-side receiver in the TUI/tools folder
- dependency bundle documentation

Acceptance:

- offline PC can receive only ShadowChat bridge-approved bundle chunks
- transfer validates hash before use
- no arbitrary URL fetch is possible

## Milestone 5: First-Plug Standalone Bootstrap

Status: complete

Deliverables:

- minimal serial first-run instructions
- bootstrap manifest target
- command help optimized for a user with no local software installed
- optional tiny bootstrap text/package transfer path

Acceptance:

- a user can plug in the ESP, open a serial console, and see exactly how to pull the bridge tools through the ESP
- no internet is required on the PC

## Milestone 6: Live ESP Validation And Ship

Status: in progress

Deliverables:

- flash/test on connected ESP
- smoke firmware update check
- smoke Windows bundle manifest check
- update docs with results and failed approaches
- deploy Supabase function(s)
- push to GitHub

Acceptance:

- every implemented path has a command transcript or test output
- STATUS.md reflects the final state and next risks
