# ESP Bridge Protocol Draft

This document proposes the local protocol between the Windows PC client and the ESP bridge.

It is intended to support:

- the chat-first TUI
- the separate admin shell
- a future lightweight local dashboard
- a future richer local app bundle

The protocol must never become a generic network tunnel. It exists only to expose approved ShadowChat bridge operations to the offline PC.

## Goals

- simple to implement on constrained hardware
- easy to inspect and debug over serial
- expressive enough for chat, DMs, admin, diagnostics, and updates
- forward-compatible with richer clients later

## Transport

### V1

- `USB CDC serial`

### Recommended Implementation Baseline

For the earliest bridge spike, we should assume a straightforward serial link first and avoid tying `v1` to composite USB behavior.

Based on the ESP32-S3 platform docs, the first spike should explicitly evaluate whether the local serial path is implemented with:

- the fixed-function `USB Serial/JTAG` controller
- TinyUSB `CDC-ACM`

The protocol itself should stay transport-neutral enough that this choice can be finalized during `Phase 0`.

### Framing Recommendation

- line-delimited JSON (`NDJSON`)

Reasoning:

- easy to debug manually
- easy to log
- easy to test from scripts and terminals
- avoids a bespoke binary protocol in `v1`

Each message is one JSON object per line.

## Protocol Model

Two categories of messages:

1. `commands`
- sent from PC client to bridge

2. `events`
- sent from bridge to PC client

There should also be `responses` to correlate command outcomes.

## Common Envelope

### Command Envelope

```json
{
  "type": "command",
  "protocol_version": "1.0",
  "id": "cmd-001",
  "action": "chat.send_message",
  "payload": {}
}
```

### Response Envelope

```json
{
  "type": "response",
  "protocol_version": "1.0",
  "id": "cmd-001",
  "ok": true,
  "payload": {}
}
```

### Event Envelope

```json
{
  "type": "event",
  "protocol_version": "1.0",
  "event": "chat.message_received",
  "payload": {}
}
```

### Hello Response Requirements

`bridge.hello` should return enough information for a local client to adapt without guessing:

- `protocol_version`
- `device_id`
- `hardware_model`
- `firmware_version`
- `transport`
- `capabilities`
- `pairing_state`
- `chat_available`
- `admin_available`

## Required Command Groups

### Session And Status

- `bridge.hello`
- `bridge.status`
- `bridge.ping`
- `bridge.get_logs`
- `bridge.reconnect`

### Pairing

- `pairing.begin`
- `pairing.submit_code`
- `pairing.status`
- `pairing.revoke`

### Wi-Fi

- `wifi.scan`
- `wifi.configure`
- `wifi.status`
- `wifi.disconnect`

### Chat

- `chat.list_threads`
- `chat.open_thread`
- `chat.send_message`
- `chat.mark_read`
- `chat.fetch_history`

### DMs

- `dm.list_conversations`
- `dm.open_conversation`
- `dm.send_message`
- `dm.mark_read`

### Updates

- `update.check`
- `update.download`
- `update.apply`
- `update.status`

### Device Admin

- `device.info`
- `device.wipe`
- `device.restart`
- `device.export_diag`

## Required Event Groups

### Bridge Events

- `bridge.ready`
- `bridge.degraded`
- `bridge.error`
- `bridge.log`

### Connectivity Events

- `transport.connected`
- `transport.disconnected`
- `wifi.connected`
- `wifi.disconnected`
- `backend.connected`
- `backend.disconnected`
- `realtime.connected`
- `realtime.disconnected`

### Pairing Events

- `pairing.required`
- `pairing.pending`
- `pairing.completed`
- `pairing.revoked`
- `pairing.failed`

### Chat Events

- `chat.message_received`
- `chat.message_updated`
- `chat.message_deleted`
- `chat.thread_changed`
- `chat.unread_changed`

### Update Events

- `update.available`
- `update.downloading`
- `update.ready`
- `update.failed`

### Auth Events

- `auth.token_expiring`
- `auth.token_refreshed`
- `auth.revoked`

## Message Payload Drafts

### Send Message Command

```json
{
  "type": "command",
  "id": "cmd-101",
  "action": "chat.send_message",
  "payload": {
    "thread_type": "group",
    "thread_id": "general",
    "content": "hello world :smile:",
    "format": "text"
  }
}
```

### Send DM Command

```json
{
  "type": "command",
  "id": "cmd-102",
  "action": "dm.send_message",
  "payload": {
    "conversation_id": "conv-123",
    "content": "checking in",
    "format": "text"
  }
}
```

### Incoming Message Event

```json
{
  "type": "event",
  "event": "chat.message_received",
  "payload": {
    "thread_type": "group",
    "thread_id": "general",
    "message": {
      "id": "msg-1",
      "sender_id": "user-2",
      "sender_name": "tayler",
      "content": "reply text",
      "created_at": "2026-04-23T10:00:00Z",
      "source": "realtime",
      "direction": "received"
    }
  }
}
```

For DM message events, include the conversation identifier and the message
source (`poll`, `realtime`, or `send`) so the TUI can route inactive DM
threads to unread state instead of rendering them in the currently open DM.

## Error Model

Responses should return structured errors.

```json
{
  "type": "response",
  "id": "cmd-101",
  "ok": false,
  "error": {
    "code": "BACKEND_UNAVAILABLE",
    "message": "Realtime connection is down."
  }
}
```

### Suggested Error Codes

- `NOT_PAIRED`
- `WIFI_NOT_CONFIGURED`
- `BACKEND_UNAVAILABLE`
- `REALTIME_UNAVAILABLE`
- `AUTH_REFRESH_FAILED`
- `INVALID_COMMAND`
- `INVALID_PAYLOAD`
- `UPDATE_IN_PROGRESS`
- `FORBIDDEN_OPERATION`

## Client Modes

The same protocol should support two local clients.

### Chat TUI

- primarily consumes chat and DM commands/events
- receives status summaries

### Admin Shell

- primarily consumes Wi-Fi, pairing, diagnostics, and update commands/events

## Security Constraints

- no command for arbitrary URL fetches
- no command for arbitrary TCP forwarding
- no command for raw backend query execution
- no generic HTTP proxy behavior
- no command that exposes raw Supabase credentials or session material to the PC

Every command should map to a specific bridge-approved action.

## V1 Serialization Constraints

- UTF-8 text
- line-delimited payloads
- bounded payload size
- explicit max message length
- explicit timeout and retry handling on the bridge side
- explicit line-length limit to prevent serial framing abuse

## Realtime Runtime Requirements

The bridge runtime must own realtime health explicitly.

Documentation-backed requirements:

- the realtime connection must keep heartbeats within the server's expected interval
- if JWTs rotate, the bridge must update the realtime connection with the new token
- token refresh failure should be surfaced as a bridge-level degraded state, not a silent hang

The exact implementation may use `supabase-js` or a lower-level client, but the runtime contract stays the same.

## Future Local UI Note

This protocol is intended to support:

- `v1` serial chat and admin clients directly
- later host-assisted or transport-expanded GUI clients

It should not assume that a browser can speak to the bridge directly in `v1`. That depends on a later transport or host-integration decision.

## Open Questions

- whether `Phase 0` should use `USB Serial/JTAG` or TinyUSB `CDC-ACM` as the concrete serial path
- exact buffering strategy and back-pressure behavior
- whether local history fetches are paged or windowed
- whether protocol version negotiation beyond `bridge.hello` is needed in `v1`
- whether admin shell and chat TUI share one session or use separate local channels
