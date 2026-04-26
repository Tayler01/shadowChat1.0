# ESP Bridge Phase 0 Spike Checklist

This checklist defines the first feasibility spike for the ESP bridge feature.

The purpose of Phase 0 is not to build the full product. The purpose is to prove that the core bridge concept works before we invest in full UX, schema, or update systems.

## Spike Goal

Prove that an ESP-based bridge can:

- connect to Wi-Fi
- authenticate to the ShadowChat backend
- receive realtime message events
- send text messages
- support basic DMs
- expose a usable local wired interface to a Windows PC without granting that PC general internet access

## Hardware Baseline

- `ESP32-S3`
- wired PC connection via `USB CDC serial`

## Success Criteria

Phase 0 is successful if all of the following are true:

- [x] device can boot to a usable admin shell
- [x] device can be configured onto Wi-Fi
- [x] device can authenticate to backend in a way that does not require copying a browser session onto the device
- [x] device can send one group-chat message
- [x] device can receive one realtime group-chat message
- [x] device can send one DM
- [x] device can receive one DM
- [x] Windows PC still has no general internet path through the device
- [x] Windows enumerates the device as a usable local serial interface without a custom driver install

Phase 0 status as of `2026-04-25`: success criteria are met on the current `ESP32-S3` hardware proof using a scanned/detected Windows COM port, `USB Serial/JTAG`, bridge-owned auth, Supabase Realtime receive, and the Windows PowerShell TUI.

## Prototype Deliverables

### Device

- boot process
- serial console
- minimal Wi-Fi config flow
- minimal backend auth flow
- minimal realtime subscription
- minimal send/receive logic
- explicit decision note: `USB Serial/JTAG` vs TinyUSB `CDC-ACM`

### Local Interface

- simple terminal interaction from Windows
- raw admin shell acceptable
- no polished chat UI required yet

### Backend

- enough auth and messaging access to prove group and DM paths
- enough credential lifecycle support to document the intended production auth direction

## Test Matrix

### Connectivity

- fresh boot
- Wi-Fi join
- Wi-Fi loss and reconnect
- USB unplug and replug
- serial reconnect after COM port loss

### Messaging

- send group text
- receive group text
- send DM text
- receive DM text

### Security

- confirm PC cannot browse arbitrary URLs through bridge
- confirm no generic proxy behavior exists
- confirm bridge exposes only explicit bridge commands
- document where credentials are stored during the spike and how that differs from the intended encrypted production path

## Nice-To-Have Stretch Goals

- [x] basic unread indicator
- [x] minimal message history fetch
- [x] basic connection status reporting
- [x] reconnect feedback after backend loss
- [x] observe at least one token refresh or document how refresh will be proven next

Additional stretch proof captured:

- stored recovery-token auto-approval after first owner-approved bootstrap
- automatic recovery from expired local session material
- three-hour foreground TUI soak with the bridge maintaining connection
- regression test coverage for TUI layout/unread/scroll/reconnect helpers via `npm run bridge:tui:test`

## Explicit Non-Goals For Phase 0

- polished TUI
- full admin shell
- update system
- media support
- dashboard
- app bundle delivery
- final schema design

## Risks To Watch During Spike

- memory pressure on device
- realtime stability
- token storage approach
- serial UX awkwardness
- message framing robustness
- USB implementation tradeoffs between fixed-function serial and TinyUSB CDC
- hidden assumptions about future GUI transport

## Exit Decision

At the end of Phase 0 we should answer:

1. Is realtime dependable enough to continue?
   - Current answer: yes for Phase 0 and early Phase 1. A three-hour soak held connection; next proof should be overnight plus deliberate interruption testing.
2. Is USB serial the right local transport for `v1`?
   - Current answer: yes for the fallback and chat-first TUI. A richer dashboard may still need a PC-side host helper later.
3. Does the bridge security model remain clean?
   - Current answer: yes. The PC only gets explicit serial commands, the ESP owns backend credentials, and no generic proxy path exists.
4. Are group chat and DMs both practical on the device?
   - Current answer: yes. Group and DM send/receive have both passed smoke and interactive testing.
5. What constraints are likely to shape `v1` scope?
   - Current answer: credential hardening, serial UX, reconnect behavior, and OTA/update safety.
6. Does the future dashboard and full-app direction require a second transport or a PC-side host helper?
   - Current answer: likely yes for a rich local dashboard, but not required for the current chat-first TUI.

Recommended next steps after the Phase 0 success decision:

1. Polish TUI recovery/status copy and hide backend-ish auth chatter.
2. Add explicit user-visible session refreshed/recovered notices.
3. Run and document an overnight soak.
4. Improve thread navigation with a `/threads` or recent-conversations view.
5. Begin production-hardening work: encrypted NVS, signed OTA, and more formal recovery-token lifecycle handling.
