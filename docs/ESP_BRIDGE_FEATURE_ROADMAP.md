# ESP Bridge Feature Roadmap

This document defines the planning baseline for the next major feature phase: an ESP-backed bridge that lets an airgapped Windows PC participate in ShadowChat without exposing that PC to the public internet.

This is a product and systems roadmap, not an implementation-complete design. It is intended to guide iterative planning, prototyping, and phased delivery.

## Executive Summary

ShadowChat Bridge is a hardware-assisted access path for users who need messaging on a Windows PC that cannot connect directly to the internet.

The bridge device:

- connects to Wi-Fi
- authenticates to the ShadowChat backend
- maintains realtime sessions to the platform
- exposes a tightly controlled local interface to the offline PC over a wired connection

The PC:

- never receives general internet access
- communicates only with the bridge
- gets a local messaging experience through a terminal-style chat interface in `v1`

The initial product will be:

- single-user per bridge
- text-first
- realtime
- full DM support
- TUI-first
- firmware-update capable
- extensible toward a lightweight local dashboard and later a richer local app bundle

## Goals

### Product Goals

- Allow an airgapped Windows PC to send and receive ShadowChat messages in realtime.
- Preserve the platform's core chat experience for text messaging and DMs.
- Keep the bridge self-contained enough that the user can plug it in, pair it, and use it without installing a large dependency stack.
- Provide a dependable terminal-style chat interface that remains available even if richer UI layers are added later.
- Create a safe upgrade path for firmware and local UI assets.

### Technical Goals

- Ensure the Windows PC cannot browse the internet or use the bridge as a general network gateway.
- Make the ESP the only internet-facing component in the bridge path.
- Keep the local transport predictable, supportable, and easy to reason about.
- Build the bridge around explicit, allowlisted backend actions rather than a generic proxy model.
- Support reconnection and resume behavior robustly enough for a messaging product.

## Non-Goals For V1

- Full parity with the full React web app
- General-purpose web browsing from the offline PC
- Multi-user support on one bridge
- High-volume media handling with no device-level limits
- Push-notification parity on the offline PC itself
- Arbitrary third-party API access through the bridge

## Core Constraints

These are foundational requirements and should be treated as non-negotiable unless explicitly revised.

- The PC must not receive general internet access.
- The bridge may communicate only with approved ShadowChat backend services.
- The bridge must support realtime messaging.
- Full direct-message support is mandatory.
- The TUI must remain a permanent fallback interface even if richer local UI layers are added later.
- Firmware updates must be supported from backend manifests on startup and by explicit command.
- Future richer local app delivery must still preserve the no-internet-to-PC security boundary.

## User Story

The user has a Windows PC that cannot be allowed onto the internet. They connect a bridge device to that PC over a wired link. The bridge joins Wi-Fi, connects to ShadowChat backend services, and presents a local messaging interface to the PC. The user can then read and send group chat messages and DMs in realtime without granting the PC direct network access.

## High-Level Product Shape

`v1` is intentionally text-first and operationally conservative.

It consists of:

- an `ESP32-S3` bridge device
- a `chat-first TUI` for daily use
- a `separate admin shell` for device management
- a secure backend-facing bridge service running on the device

Planned later:

- a lightweight local HTML dashboard
- a richer locally delivered app bundle
- staged media support
- explicit AI tooling support through bridge-controlled commands

## Hardware And Transport Recommendation

### Recommended V1 Hardware

- `ESP32-S3`

Reasoning:

- integrated Wi-Fi
- native USB support
- mature enough ecosystem for a first production-minded bridge prototype
- less complexity than moving immediately to platforms that require external Wi-Fi components

### Recommended V1 PC Link

- `USB CDC serial`

Reasoning:

- easiest way to enforce a no-general-network boundary
- avoids turning the bridge into a general-purpose USB Ethernet device
- simple mental model for support and troubleshooting
- reliable fit for both TUI and admin shell

### Documentation-Backed Transport Guardrail

The official ESP32-S3 USB docs show two different practical paths:

- fixed-function `USB Serial/JTAG`
- configurable `USB Device Stack`/TinyUSB `CDC-ACM`

For `Phase 0` and likely `v1`, we should default to the simplest dependable serial path and avoid silently assuming richer composite USB behavior. Future local dashboard or richer-app work can revisit transport expansion after the serial bridge is proven.

This is an implementation recommendation inferred from the platform docs, not a hard requirement imposed by Espressif.

### Deferred Link Options

Potential later exploration:

- constrained local HTTP transport
- composite USB device modes
- richer local app delivery path

These should be deferred until the core security model is proven.

## Documentation-Backed Guardrails

The current roadmap should be read together with [ESP Bridge Documentation Review](C:/repos/chat2.0/docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md:1).

The highest-impact guardrails from the reviewed platform docs are:

- `v1` should stay serial-first and should not assume a browser-capable local transport yet
- the bridge should not depend on sleep behavior that destabilizes the local USB link
- Windows should be treated as friendly to inbox CDC drivers but not as a true zero-click auto-launch target
- Wi-Fi onboarding can stay in the admin shell for `v1`
- production planning should assume `Secure Boot v2`, flash encryption, NVS encryption, and signed HTTPS OTA with rollback handling
- bridge auth should use a bridge-specific credential model rather than copying a browser session onto the device
- realtime design must own heartbeat and token refresh behavior explicitly

## Security Model

This feature lives or dies on the security boundary. The bridge must be a backend-specific tunnel, not an internet gateway.

### Required Security Properties

- No general proxying
- No arbitrary DNS resolution for the PC
- No arbitrary TCP forwarding from the PC
- No raw internet routing through the device
- Explicit allowlist of backend domains, routes, and operations
- Device identity and user pairing stored securely on device
- Signed firmware update flow
- Signed local asset/app update flow when added

### Production Security Baseline

The production-oriented baseline should assume:

- `Secure Boot v2`
- flash encryption
- encrypted NVS for bridge credentials and Wi-Fi material
- HTTPS OTA with certificate validation
- OTA post-boot validation and rollback handling

That sequence follows the official Espressif security and OTA guidance and should be treated as the expected direction even if the earliest spike does not turn every part on immediately.

### Trust Boundaries

#### Trusted

- ShadowChat backend and its controlled update manifests
- bridge firmware
- bridge-side command parsing and policy enforcement

#### Partially Trusted

- local Windows PC operator
- local serial session

#### Not Trusted By Default

- arbitrary internet destinations
- arbitrary payload types not defined by the bridge protocol
- unsigned update packages

## System Architecture

### Logical Components

1. `Bridge Firmware Core`
- boot and health checks
- Wi-Fi provisioning
- backend connectivity
- pairing and token lifecycle
- realtime connection management
- local protocol handling
- update orchestration

2. `Bridge Messaging Engine`
- group chat sync
- DM sync
- unread state management
- message send queue
- reconnect and replay handling

3. `Local Chat TUI`
- user-facing terminal chat experience
- conversation switching
- message composer
- status bar
- emoji shortcode support

4. `Local Admin Shell`
- Wi-Fi onboarding
- pairing
- diagnostics
- logs
- firmware update controls
- safe reset and wipe actions

5. `Future Local Dashboard`
- lightweight local HTML interface exposed through a later transport or host-assisted local layer
- status and chat overview
- eventually a simpler GUI path for users who do not want the TUI

### Backend Interaction Model

The bridge should not expose Supabase directly to the PC.

Instead:

- ESP authenticates to ShadowChat backend services
- ESP subscribes to realtime events
- ESP exposes a local bridge protocol to the PC
- PC consumes only bridge-approved operations

This preserves policy enforcement on the device and avoids leaking backend credentials into the PC-side interface layer.

## V1 TUI Design

### Design Intent

The TUI should feel like a simple, usable terminal messenger rather than a raw shell.

It should have:

- terminal aesthetic
- matrix-inspired green base styling
- clear visual separation between sent, received, and system messages
- minimal cognitive overhead
- chat-first interaction

### Visual Direction

- received text: phosphor green
- sent text: cyan or blue-green
- system/status text: amber
- errors/disconnects: red
- DM or thread accents: secondary subdued tones when needed

### Interaction Model

Default behavior:

- typing sends messages to the active conversation
- keyboard navigation switches channels or DMs
- slash commands are available but not the dominant interaction pattern

### Recommended Layout

- top status bar
- conversation selector or channel indicator
- main scrollable message pane
- bottom input line

### Emoji V1

- shortcode support is required
- optional native emoji rendering when terminal support is available

Examples:

- `:smile:`
- `:thumbsup:`
- `:fire:`

## V1 Admin Shell

The admin shell is a required part of `v1`, but it should be distinct from the chat-first TUI.

### Responsibilities

- Wi-Fi setup
- account pairing
- session and backend diagnostics
- update checks and apply flow
- logs
- reconnect controls
- safe wipe/reset functions

### Design Principle

Do not overload the chat TUI with operational complexity. The admin shell exists so the daily-use chat interface can stay simple.

## Pairing And Identity Model

### V1 Recommendation

- one ShadowChat account per bridge
- one active paired user session at a time

### Pairing Requirements

- explicit user authorization
- revocable bridge identity
- safe re-pair flow
- wipe and recover flow
- no browser-session cloning onto the bridge

### Open Design Area

The exact pairing UX still needs design. Candidate patterns include:

- one-time pairing code
- account-side approval flow
- bridge bootstrap token

## Realtime And Messaging Requirements

### Mandatory In V1

- realtime group chat send/receive
- realtime DM send/receive
- unread indicators
- reconnect after temporary Wi-Fi disruption
- reconnect after wired local disconnect/reconnect

### Recommended V1 Support

- basic presence/status display
- local outbound queue during brief reconnect windows
- system feedback when bridge is degraded
- explicit token-refresh handling for the realtime connection

## Updates

Updates are a first-class requirement, not a post-launch convenience.

### Firmware Update Requirements

- startup check against backend manifest
- manual update command from admin shell
- signed package validation
- rollback/recovery strategy
- HTTPS transport with certificate verification

### Local UI Asset Update Requirements

Planned foundation for:

- TUI support files
- lightweight dashboard assets
- later full local app bundle delivery

The bridge should own the version check and pull process. The PC should not fetch updates directly from the internet.

Important constraint:

- a serial-only `v1` does not automatically provide a browser transport for a local dashboard

So local dashboard and full local app delivery remain valid roadmap items, but they should be treated as later transport or host-integration work rather than hidden `v1` obligations.

## Backend Work Needed

This feature will likely require backend additions beyond the current browser-focused app.

### Likely Additions

- bridge device identity model
- device pairing and revocation flow
- update manifest endpoint or table
- bridge-specific command/API surface
- scoped tokens or bridge credentials
- telemetry or health reporting for bridge state

### Possible Data Domains

- `bridge_devices`
- `bridge_pairings`
- `bridge_update_manifests`
- `bridge_audit_events`

This should be designed carefully against the existing Supabase auth and session model. The bridge should not be treated as a normal browser client with copied session material.

## Phased Roadmap

### Phase 0: Feasibility Spike

Goal:

- prove the bridge can function end to end

Deliverables:

- ESP32-S3 Wi-Fi connection
- USB serial link to Windows
- basic admin shell
- backend auth proof
- realtime text receive proof
- text send proof
- basic DM proof

Exit criteria:

- one user can send and receive group messages and DMs through the bridge over the wired link

### Phase 1: Bridge Core

Goal:

- dependable text-first bridge product

Deliverables:

- device boot state machine
- Wi-Fi provisioning
- pairing flow
- realtime connection manager
- group chat and DM sync
- chat TUI
- admin shell
- logs and diagnostics
- firmware update flow

Exit criteria:

- single-user bridge is production-usable for text and DMs

### Phase 1.5: Lightweight Local Dashboard

Goal:

- provide a simple optional local GUI without changing the security boundary

Deliverables:

- constrained local dashboard path
- chat status pages
- basic messaging UI
- DM inbox overview
- explicit transport or host-helper decision for how the PC opens the dashboard without gaining general internet access

Exit criteria:

- users can use either the TUI or the lightweight local dashboard for normal text messaging

### Phase 2: Rich Messaging Foundation

Goal:

- prepare for parity expansion

Deliverables:

- stable local bridge API
- message cache and sync checkpoints
- richer metadata support
- attachment metadata path
- reaction/reply support planning

Exit criteria:

- bridge architecture is ready for richer content without redesigning the core transport/security model

### Phase 3: Media Support

Goal:

- add controlled media support

Deliverables:

- image receive and local view path
- file receive and retrieval path
- audio receive and playback path
- staged upload support

Exit criteria:

- media support exists within explicit device-enforced limits

### Phase 4: Local App Bundle Delivery

Goal:

- enable richer local UI parity while preserving the offline security model

Deliverables:

- signed local app manifest
- asset pull and local setup flow
- locally served or installed richer app experience

Exit criteria:

- richer local app runs entirely through the bridge without exposing general internet access to the PC

## Acceptance Criteria For V1

- User can pair one ShadowChat account to one bridge.
- User can send and receive group chat text in realtime.
- User can send and receive DMs in realtime.
- PC receives no general internet access through the bridge.
- Chat TUI is usable enough for day-to-day messaging.
- Admin shell supports setup, diagnostics, and update operations.
- Firmware update checks work at startup and on command.
- Bridge can recover from temporary Wi-Fi interruptions without requiring full re-provisioning.

## Major Risks

### Realtime On Constrained Hardware

Maintaining dependable realtime behavior on a small device is non-trivial.

Mitigation:

- keep `v1` text-first
- aggressively instrument reconnect behavior
- prefer explicit local queues and clear degraded-state UX

### Pairing And Token Security

Improper token handling would undermine the whole design.

Mitigation:

- keep bridge credentials scoped
- support revocation
- avoid giving the PC direct backend credentials

### UX Risk

A terminal-style interface can still be hard to use if overdesigned like a shell.

Mitigation:

- make chat the default mode
- keep commands minimal in the user-facing TUI
- keep operations in the separate admin shell

### Future Scope Creep

Demand for "full parity immediately" could destabilize the roadmap.

Mitigation:

- ship text-first value in `v1`
- stage dashboard, media, and app-bundle work deliberately

## Open Questions

These still need deeper design before implementation:

- exact pairing UX
- exact local protocol framing between PC and bridge
- whether the local dashboard is served over a constrained local HTTP channel or another limited transport
- how much local message history is stored on the PC versus on the bridge
- update package signing and recovery model
- practical device resource limits for media support

## Recommended Next Deliverables

The next planning outputs should be:

1. [ESP Bridge Protocol Draft](C:/repos/chat2.0/docs/ESP_BRIDGE_PROTOCOL_DRAFT.md:1)
- local command and event model between PC and ESP

2. [ESP Bridge Pairing Flow Spec](C:/repos/chat2.0/docs/ESP_BRIDGE_PAIRING_FLOW_SPEC.md:1)
- how a bridge becomes authorized for one user

3. [ESP Bridge TUI UX Spec](C:/repos/chat2.0/docs/ESP_BRIDGE_TUI_UX_SPEC.md:1)
- screens, navigation, keyboard shortcuts, color rules, and command grammar

4. [ESP Bridge Backend Schema Proposal](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_SCHEMA_PROPOSAL.md:1)
- device, pairing, and update-manifest schema additions

5. [ESP Bridge Phase 0 Spike Checklist](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_SPIKE_CHECKLIST.md:1)
- exact prototype success criteria and test plan

6. [ESP Bridge Documentation Review](C:/repos/chat2.0/docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md:1)
- official-platform constraints and implementation guardrails that shape the roadmap
