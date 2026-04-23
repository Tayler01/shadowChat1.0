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
  "id": "cmd-001",
  "action": "chat.send_message",
  "payload": {}
}
```

### Response Envelope

```json
{
  "type": "response",
  "id": "cmd-001",
  "ok": true,
  "payload": {}
}
```

### Event Envelope

```json
{
  "type": "event",
  "event": "chat.message_received",
  "payload": {}
}
```

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
      "direction": "received"
    }
  }
}
```

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

Every command should map to a specific bridge-approved action.

## V1 Serialization Constraints

- UTF-8 text
- line-delimited payloads
- bounded payload size
- explicit max message length
- explicit timeout and retry handling on the bridge side

## Open Questions

- exact serial baud and buffering strategy
- whether local history fetches are paged or windowed
- whether protocol version negotiation is needed in `v1`
- whether admin shell and chat TUI share one session or use separate local channels
