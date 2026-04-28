# Architecture

This document is a high-signal map of the current ShadowChat codebase.

## High-Level System

```text
React UI
  -> hooks
  -> lib helpers
  -> Supabase Auth / Postgres / Realtime / Storage / Edge Functions
  -> Netlify-hosted frontend shell
```

## Frontend Layers

### App Shell

- [`src/App.tsx`](C:/repos/chat2.0/src/App.tsx:1) controls:
  - active view
  - mobile vs desktop shell
  - DM deep-link routing
  - global toasts
  - lazy loading for major views

### Domain Views

- [`src/components/chat`](C:/repos/chat2.0/src/components/chat): group chat
- [`src/components/dms`](C:/repos/chat2.0/src/components/dms): inbox and DM thread
- [`src/components/profile`](C:/repos/chat2.0/src/components/profile): user profile experience
- [`src/components/settings`](C:/repos/chat2.0/src/components/settings): settings and notification setup
- [`src/components/layout`](C:/repos/chat2.0/src/components/layout): shell, nav, and responsive structure

### Hooks

- [`useAuth`](C:/repos/chat2.0/src/hooks/useAuth.tsx:1): session + profile state
- [`useMessages`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1): group chat state and realtime
- [`useDirectMessages`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1): DM state and realtime
- [`usePushNotifications`](C:/repos/chat2.0/src/hooks/usePushNotifications.ts:1): push subscription UX
- [`useTyping`](C:/repos/chat2.0/src/hooks/useTyping.ts:1): typing indicators
- [`useTheme`](C:/repos/chat2.0/src/hooks/useTheme.tsx:1): design-system theme selection

### Lib Helpers

- [`supabase.ts`](C:/repos/chat2.0/src/lib/supabase.ts:1): all Supabase client orchestration
- [`auth.ts`](C:/repos/chat2.0/src/lib/auth.ts:1): auth API wrappers and profile bootstrap
- [`push.ts`](C:/repos/chat2.0/src/lib/push.ts:1): browser push storage and dispatch wiring
- [`ai.ts`](C:/repos/chat2.0/src/lib/ai.ts:1): authenticated AI function calls
- [`utils.ts`](C:/repos/chat2.0/src/lib/utils.ts:1): shared formatting and UI helpers

## Backend Layers

### Schema And Policies

Canonical schema lives in [supabase/migrations](C:/repos/chat2.0/supabase/migrations).

Important domains:

- users and profile metadata
- group messages
- DM conversations and DM messages
- reactions and pinning helpers
- uploads and storage policies
- user feedback submissions and private feedback attachments
- push subscriptions and notification preferences

### Edge Functions

- [`openai-chat`](C:/repos/chat2.0/supabase/functions/openai-chat/index.ts:1): validates caller session, proxies allowed AI requests to OpenRouter by default, and can post group-chat AI answers as the dedicated `Shado` assistant profile
- [`send-push`](C:/repos/chat2.0/supabase/functions/send-push/index.ts:1): validates caller session, looks up recipients, enforces notification preferences, and sends web push payloads

## Planned External System

The next planned major feature is an `ESP bridge` for airgapped Windows PCs.

This is not implemented yet, but the roadmap is defined in [docs/ESP_BRIDGE_FEATURE_ROADMAP.md](C:/repos/chat2.0/docs/ESP_BRIDGE_FEATURE_ROADMAP.md:1).

Planned high-level shape:

- ESP device connects to Wi-Fi and approved ShadowChat backend services
- offline Windows PC connects only to the device over a wired local transport
- PC receives no general internet access
- device provides a chat-first TUI, a separate admin shell, and later a lightweight local dashboard
- future richer local app delivery still remains behind the same bridge security boundary

## Important Runtime Flows

### Sign In

1. User signs in through [`src/lib/auth.ts`](C:/repos/chat2.0/src/lib/auth.ts:1)
2. [`useAuth`](C:/repos/chat2.0/src/hooks/useAuth.tsx:1) loads the profile row
3. Realtime auth token is updated on the Supabase client
4. Presence updates start after authentication

### Group Message

1. UI sends via [`useMessages`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
2. Message insert hits `messages`
3. Local state updates optimistically
4. Realtime subscription reconciles inserts and updates across clients
5. Optional push fan-out can be triggered for group notifications

### Direct Message

1. UI resolves or creates conversation
2. Send path inserts into `dm_messages`
3. Active thread hook updates messages list
4. Conversations list hook reorders thread and updates unread counts
5. Optional push fan-out triggers through the `send-push` edge function

### Push Notification

1. Browser registers service worker
2. User grants permission and creates a subscription
3. Subscription row is saved in Supabase
4. Message send path calls the push trigger helper
5. `send-push` edge function delivers to eligible recipient subscriptions

## UI System

The current product direction is a dark luxury system:

- obsidian shell backgrounds
- smoked glass surfaces
- gold-rimmed call-to-action styling
- restrained accent usage
- mobile-first polish for nav, composer, settings, and inbox behavior

Global tokens live in [`src/index.css`](C:/repos/chat2.0/src/index.css:1).

## Testing Layers

- static gates: lint, typecheck, build
- Jest: hook/component behavior
- headed browser checks: realtime, mobile layout, and regression validation

Use [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1) for the practical workflow.
