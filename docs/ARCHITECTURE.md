# Architecture

This document is a high-signal map of the current ShadowChat codebase.

## High-Level System

```text
React UI
  -> hooks
  -> lib helpers
  -> Supabase Auth / Postgres / Realtime / Storage / Edge Functions
  -> Netlify-hosted frontend shell
  -> Render-hosted News scraper worker
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
- [`src/components/news`](C:/repos/chat2.0/src/components/news): News Feed, News Chat, feed modal, and News reactions
- [`src/components/profile`](C:/repos/chat2.0/src/components/profile): user profile experience
- [`src/components/settings`](C:/repos/chat2.0/src/components/settings): settings and notification setup
- [`src/components/layout`](C:/repos/chat2.0/src/components/layout): shell, nav, and responsive structure

### Hooks

- [`useAuth`](C:/repos/chat2.0/src/hooks/useAuth.tsx:1): session + profile state
- [`useMessages`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1): group chat state and realtime
- [`useDirectMessages`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1): DM state and realtime
- [`useNewsFeed`](C:/repos/chat2.0/src/hooks/useNewsFeed.tsx:1): News Feed fetch, realtime, reactions, modal data, and seen state
- [`useNewsChat`](C:/repos/chat2.0/src/hooks/useNewsChat.tsx:1): News Chat fetch, realtime, send/edit/delete, reactions, and seen state
- [`useNewsBadges`](C:/repos/chat2.0/src/hooks/useNewsBadges.ts:1): News unread/new-item badge counts
- [`useNewsAdmin`](C:/repos/chat2.0/src/hooks/useNewsAdmin.ts:1): News source admin state and source upsert/toggle RPCs
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
- isolated News sources, feed items, News Chat messages, News reactions, and News seen state
- uploads and storage policies
- user feedback submissions and private feedback attachments
- push subscriptions and notification preferences
- ESP bridge control-plane and update-manifest tables

### Edge Functions

- [`openai-chat`](C:/repos/chat2.0/supabase/functions/openai-chat/index.ts:1): validates caller session, proxies allowed AI requests to OpenRouter by default, and can post group-chat AI answers as the dedicated `Shado` assistant profile
- [`send-push`](C:/repos/chat2.0/supabase/functions/send-push/index.ts:1): validates caller session, looks up recipients, enforces notification preferences, and sends web push payloads
- [`link-preview`](C:/repos/chat2.0/supabase/functions/link-preview/index.ts:1): validates a signed-in bearer token, rejects unsafe targets, and fetches Open Graph/oEmbed metadata for chat and News Chat link cards
- [`bridge-*`](C:/repos/chat2.0/supabase/functions): bridge pairing, session lifecycle, profile/search, group/DM polling and sending, heartbeat, and update-check functions

### Background Workers

- [`services/news-scraper`](C:/repos/chat2.0/services/news-scraper): Render Docker worker that polls enabled `news_sources`, scrapes X/Truth Social snapshots with Playwright browser automation, and writes normalized `news_feed_items` using Supabase service-role credentials
- [`render.yaml`](C:/repos/chat2.0/render.yaml:1): Render blueprint for the `shado-news-scraper` worker and its required secrets

## External Systems

### News Scraper

The News Feed is populated outside the browser. Admins add sources in Settings,
the worker polls those sources, and Supabase realtime fans new feed rows out to
signed-in clients. The scraper intentionally avoids the paid X API and uses
browser extraction plus optional read-only platform credentials.

Truth Social can block hosted worker IPs. The production escape hatch is to
connect the worker to a trusted remote browser through `PINCHTAB_CDP_URL` or
`PINCHTAB_WS_ENDPOINT`.

Full runbook: [docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1).

### ESP Bridge

The ESP bridge track supports an airgapped Windows PC through an ESP32-S3 data
link, USB CDC serial, a chat-first PowerShell TUI, a separate admin shell, and
backend pairing/session lifecycle functions.

The source-of-truth planning and runbook set starts at
[docs/ESP_BRIDGE_FEATURE_ROADMAP.md](C:/repos/chat2.0/docs/ESP_BRIDGE_FEATURE_ROADMAP.md:1)
and [docs/ESP_BRIDGE_TUI_PRODUCTION_READINESS.md](C:/repos/chat2.0/docs/ESP_BRIDGE_TUI_PRODUCTION_READINESS.md:1).

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

### News Feed

1. News admin adds or enables a source in Settings
2. Render worker reads enabled `news_sources`
3. Worker extracts normalized post snapshots and updates source health/cursor fields
4. Current Eastern-day snapshots are inserted into `news_feed_items`
5. `useNewsFeed` receives realtime inserts/updates and refreshes the board
6. Reactions are toggled through `toggle_news_feed_reaction`

### News Chat

1. Signed-in user sends text in News Chat
2. Insert hits `news_chat_messages`
3. `useNewsChat` receives realtime inserts/updates/deletes
4. Link text is tokenized client-side and metadata is fetched through `link-preview`
5. Reactions are toggled through `toggle_news_chat_reaction`

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
- scraper proof and one-cycle checks before scraper deployments

Use [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1) for the practical workflow.
