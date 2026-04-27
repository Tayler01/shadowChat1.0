# ESP Bridge TUI UX Spec

This document defines the `v1` user experience for the bridge-side terminal interfaces.

## UX Principles

- chat first
- terminal aesthetic
- simple everyday workflow
- clear separation between user chat and device administration
- low-friction messaging for non-technical users

## Interfaces

### 1. Chat TUI

Purpose:

- everyday messaging
- group chat
- DMs
- lightweight status awareness

### 2. Admin Shell

Purpose:

- data-link setup
- pairing
- diagnostics
- updates
- reset/recovery

The chat TUI and admin shell must be visually and conceptually separate.

## Chat TUI Visual Style

### Core Feel

- classic terminal
- matrix-inspired green baseline
- dark background
- readable contrast
- subtle multi-color accents to distinguish message types

### Color Roles

- received messages: phosphor green
- sent messages: cyan / blue-green
- system notices: amber
- errors/disconnects: red
- active conversation highlight: brighter green or white-green
- unread markers: amber or cyan accent

## Chat TUI Layout

### Top Status Bar

Should show:

- active mode: `CHAT`
- connection state
- data-link state
- backend/realtime state
- paired user

### Conversation Header

Should show:

- current thread name
- thread type: group or DM
- unread count if relevant

### Message Pane

Should show:

- timestamp
- sender label
- content
- clear distinction for self vs others
- system messages inline but visually distinct
- long messages wrapped across rows without dropping content
- pane text clipped to the pane width so status/feed text cannot corrupt the chat area

### Input Bar

Should show:

- current prompt
- active thread
- optional hint for `/help`
- tail of long draft text while typing so the cursor/current words stay visible

## Chat TUI Navigation

### Default Behavior

- user lands in last active thread if available
- typing sends to active thread
- minimal commands exposed in normal flow

### Suggested Keys

- `Tab`: cycle focus or sections
- `Ctrl+K`: switch thread
- `Ctrl+D`: open DM list
- `Ctrl+G`: jump to group chat
- `Ctrl+R`: refresh current thread
- `Esc`: cancel current transient UI

Exact key map can still evolve, but the interaction should stay shallow.

## Chat TUI Commands

These are user-facing commands, not admin commands.

- `/help`
- `/status`
- `/switch`
- `/dm`
- `/threads`
- `/emoji`

Plain group-chat messages that start with `@ai`, `@shado`, or `@shado_ai` ask
the backend AI assistant and should result in a Shado profile response when the
OpenRouter/OpenAI secrets are configured.

### Non-Goals For Chat TUI Commands

Do not put setup-heavy operations here unless absolutely necessary.

Avoid mixing:

- data-link provisioning
- firmware operations
- deep diagnostics

Those belong in admin shell.

## Message Formatting

### Recommended Structure

```text
[10:42] @tayler: hello there
[10:42] you: replying now
[10:43] system: reconnecting to backend...
```

### DM Distinction

DMs should visibly indicate who the thread is with:

```text
DM with @alex
```

### Emoji V1

Support:

- shortcode input such as `:smile:`
- optional actual emoji rendering if terminal supports it

## Empty States

### Not Paired

- chat UI should not look broken
- show clear direction to use admin shell

### Backend Down

- show degraded mode banner
- keep local interface responsive
- communicate reconnect attempts

### No Messages

- show clear starter text
- especially for first-time DM threads

## Admin Shell UX

### Design Feel

- more shell-like than chat UI
- still readable and structured
- optimized for setup and recovery

### Responsibilities

- `/link scan`
- `/link connect`
- `/pair`
- `/status`
- `/logs`
- `/update`
- `/reconnect`
- `/wipe`

### Required Status Surface

Admin shell should always be able to show:

- firmware version
- bridge device ID
- paired user
- data-link profile
- backend state
- realtime state
- update availability

## Accessibility And Usability

- avoid overly dim green-on-black combinations
- keep timestamps and labels aligned
- keep commands memorable
- keep typing flow uninterrupted during normal messaging

## Future Compatibility

The TUI should remain the permanent fallback even after:

- lightweight dashboard
- richer local app bundle
- media support

That means:

- do not tie core messaging exclusively to GUI assumptions
- keep text-first flows fully functional

## Open Questions

- final keybinding set
- whether thread list is inline, popup, or split-pane
- whether admin shell is launched by command, keybind, or separate executable mode
