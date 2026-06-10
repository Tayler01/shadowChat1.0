# Architecture

This document is a high-signal map of the current ShadowChat codebase.

## Documentation Status - June 9, 2026

This architecture map is current for the shipped `main` branch and now includes the June 9 Shadow Runner playable-prototype work, Shadow Runner menu polish, mobile composer focus fix, and chat media-frame polish. Known architecture follow-ups are tracked in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1): remaining Supabase policy/RPC hardening, service-role bypass checks, production deployment/smoke for all shared safe-fetch adopters, frontend polish, and broader realtime/send/scroll helper extraction.

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
- [`src/components/boards`](C:/repos/chat2.0/src/components/boards): draggable Boards map, board routing, and reusable chat boards
- [`src/components/art`](C:/repos/chat2.0/src/components/art): shared Art Board canvas, add/edit flows, links, reactions, and detail popup
- [`src/components/news`](C:/repos/chat2.0/src/components/news): News Feed, feed modal, reactions, and compatibility wrappers
- [`src/components/profile`](C:/repos/chat2.0/src/components/profile): user profile experience, including avatar crop/zoom/position editing before upload
- [`src/components/settings`](C:/repos/chat2.0/src/components/settings): sectioned settings, notification setup, feedback, admin tools, and weather location
- [`src/components/layout`](C:/repos/chat2.0/src/components/layout): shell, nav, and responsive structure
- [`src/features/games`](C:/repos/chat2.0/src/features/games): Entertainment picker and game surfaces. Shadow Runner currently lives under [`src/features/games/shadow-runner`](C:/repos/chat2.0/src/features/games/shadow-runner) with an asset-driven title screen, private access gate, rotate gate, lazy-loaded Phaser level, DOM HUD/touch controls, title/options scroll menus, and pause/exit confirmation menus.
- [`src/features/entertainment`](C:/repos/chat2.0/src/features/entertainment): non-game Entertainment surfaces such as Shado TV, Shadow Mystery, and Will & Kirk.

### Hooks

- [`useAuth`](C:/repos/chat2.0/src/hooks/useAuth.tsx:1): session + profile state
- [`useMessages`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1): group chat state, 50-message initial windows, older-message lazy loading, and realtime
- [`useDirectMessages`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1): DM state, 50-message thread windows, older-message lazy loading, and realtime
- [`useNewsFeed`](C:/repos/chat2.0/src/hooks/useNewsFeed.tsx:1): News Feed fetch, realtime, reactions, modal data, and seen state
- [`useBoardChat`](C:/repos/chat2.0/src/hooks/useBoardChat.tsx:1): group-chat-compatible board-chat windows, older/newer loading, realtime, optimistic send/retry, media/replies/pins, edit/delete, and reactions
- [`useBoardBadges`](C:/repos/chat2.0/src/hooks/useBoardBadges.ts:1): per-board unread counts and combined Boards nav badge
- [`useNewsBadges`](C:/repos/chat2.0/src/hooks/useNewsBadges.ts:1): compatibility wrapper over board badges
- [`useNewsAdmin`](C:/repos/chat2.0/src/hooks/useNewsAdmin.ts:1): News source admin state and source upsert/toggle RPCs
- [`useAdminAccess`](C:/repos/chat2.0/src/hooks/useAdminAccess.ts:1): full-admin/sub-admin access state and role updates
- [`useHype`](C:/repos/chat2.0/src/hooks/useHype.tsx:1): Hype bell/message celebrations, pending event receipts, daily status, and push trigger state
- [`useWeatherPreference`](C:/repos/chat2.0/src/hooks/useWeatherPreference.ts:1): private per-user weather location load/save/clear
- [`useWeatherForecast`](C:/repos/chat2.0/src/hooks/useWeatherForecast.ts:1): Open-Meteo forecast refresh for the header widget after preference changes and on a periodic timer
- [`usePushNotifications`](C:/repos/chat2.0/src/hooks/usePushNotifications.ts:1): push subscription UX
- [`useTyping`](C:/repos/chat2.0/src/hooks/useTyping.ts:1): typing indicators
- [`useTheme`](C:/repos/chat2.0/src/hooks/useTheme.tsx:1): design-system theme selection

### Lib Helpers

- [`supabase.ts`](C:/repos/chat2.0/src/lib/supabase.ts:1): all Supabase client orchestration
- [`auth.ts`](C:/repos/chat2.0/src/lib/auth.ts:1): auth API wrappers and profile bootstrap
- [`push.ts`](C:/repos/chat2.0/src/lib/push.ts:1): browser push storage and dispatch wiring
- [`ai.ts`](C:/repos/chat2.0/src/lib/ai.ts:1): authenticated AI function calls
- [`weather.ts`](C:/repos/chat2.0/src/lib/weather.ts:1): Open-Meteo geocoding/forecast mapping and private weather preference helpers
- [`moderation.ts`](C:/repos/chat2.0/src/lib/moderation.ts:1): channel-ban scopes, durations, and moderation RPC wrappers
- [`realtimeSubscription.ts`](C:/repos/chat2.0/src/lib/realtimeSubscription.ts:1): pilot shared Supabase realtime lifecycle helper currently used by News Feed and News Chat
- [`utils.ts`](C:/repos/chat2.0/src/lib/utils.ts:1): shared formatting and UI helpers

## Backend Layers

### Schema And Policies

Canonical schema lives in [supabase/migrations](C:/repos/chat2.0/supabase/migrations).

Important domains:

- users and profile metadata
- group messages
- DM conversations and DM messages
- reactions and pinning helpers
- isolated News sources, feed items, feed reactions, and News seen state
- Boards catalog, shared board-chat messages/reactions, per-board read cursors, and separate Art Board item/link/reaction tables
- uploads and storage policies
- user feedback submissions and private feedback attachments
- app-wide admin/sub-admin roles, audit rows, and role-change notifications
- channel bans for General Chat, individual chat boards, and all interaction
- foreground presence visibility and active-user state
- private per-user weather preferences
- push subscriptions and notification preferences
- Hype events, per-message Hype summaries, event receipts, daily limits, and bonus-credit grants
- full-admin automation approval packets and append-only packet events
- ESP bridge control-plane and update-manifest tables

### Edge Functions

- [`openai-chat`](C:/repos/chat2.0/supabase/functions/openai-chat/index.ts:1): validates caller session, proxies allowed AI requests to OpenRouter by default, and can post group-chat AI answers as the dedicated `Shado` assistant profile
- [`send-push`](C:/repos/chat2.0/supabase/functions/send-push/index.ts:1): validates caller session, looks up recipients, enforces notification preferences, and sends web push payloads
- [`link-preview`](C:/repos/chat2.0/supabase/functions/link-preview/index.ts:1): validates a signed-in bearer token, rejects unsafe targets through the shared safe-fetch helper, and fetches Open Graph/oEmbed metadata for chat, DM, and board-chat link cards
- [`delete-account`](C:/repos/chat2.0/supabase/functions/delete-account/index.ts:1): validates caller session in code, removes owned storage objects, and deletes the auth user through service-role access
- [`shadow-pin-video`](C:/repos/chat2.0/supabase/functions/shadow-pin-video/index.ts:1): validates user tokens in code for Bunny upload session creation, processing sync, and external-video import support
- [`art-board-import-image`](C:/repos/chat2.0/supabase/functions/art-board-import-image/index.ts:1) and [`shadow-pin-import-image`](C:/repos/chat2.0/supabase/functions/shadow-pin-import-image/index.ts:1): authenticated server-side import helpers for public image URLs using the shared safe-fetch contract in repo code
- [`bridge-*`](C:/repos/chat2.0/supabase/functions): bridge pairing, session lifecycle, profile/search, group/DM polling and sending, heartbeat, and update-check functions

Audit note: several Edge Functions intentionally run with Supabase gateway JWT verification disabled and enforce custom authentication in code. Any change to those functions must preserve custom auth, rate limits, RLS-equivalent checks, and service-role boundaries.

Remote function status checked on June 8, 2026: `link-preview` and
`shadow-pin-video` had June 8 deployments, while `art-board-import-image`,
`shadow-pin-import-image`, and `send-push` still reported older deployment
timestamps. Do not claim production-safe-fetch coverage for those older remote
functions until they are redeployed and smoked.

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

### Admin Access

Admin access is an app-wide role domain. The single full `admin` can grant or
revoke `sub_admin` access from Settings > Admin > Admin Access or from a user's
public profile popup. Sub-admins can use operator tools, including News Sources
and Feedback Review, but cannot manage roles.

Role badges are intentionally public identity metadata. Full admins render with
a gold shield and sub-admins render with a silver shield in chat/profile
surfaces.

Channel bans are an admin moderation subdomain exposed from another user's
public profile popup. Operators can block General Chat, individual chat boards,
or all app interaction for timed or permanent durations. DMs are deliberately
not part of channel-ban enforcement.

Operator message deletion is part of the same moderation surface for General
Chat and board chats. The client only removes a message locally after Supabase
returns the deleted row, which keeps RLS or migration drift from becoming a
false local-only delete.

Full runbook: [docs/ADMIN_ACCESS.md](C:/repos/chat2.0/docs/ADMIN_ACCESS.md:1).
Moderation runbook: [docs/CHANNEL_BANS.md](C:/repos/chat2.0/docs/CHANNEL_BANS.md:1).

### Weather

Weather is a client-side product surface backed by private Supabase preference
rows. Users choose a location in Account & Profile settings; the General Chat
header calls Open-Meteo directly for current conditions and forecast data.

Weather preferences are not public profile data and are not in Supabase
Realtime. The widget has no manual refresh button; it refreshes on preference
changes and periodic forecast polling.

Full runbook: [docs/WEATHER_WIDGET.md](C:/repos/chat2.0/docs/WEATHER_WIDGET.md:1).

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
6. Profile/role/presence decorations are joined or resolved from public user and presence state

### Hype Event

1. User rings the Hype bell or Hypes another user's General Chat message.
2. The client calls `ring_hype_bell` or `hype_message`.
3. The RPC enforces authentication, General Chat channel-ban status, the normal
   two-per-day allowance, and any available bonus Hype credits.
4. `hype_events` publishes a short-lived realtime event; message Hypes also
   update the permanent `messages.hype_count` and `messages.hype_users`
   summary.
5. Clients render the celebration overlay once per event receipt and can trigger
   optional `hype_event` push delivery through `send-push`.

### Direct Message

1. UI resolves or creates conversation
2. Send path inserts into `dm_messages`
3. Active thread hook updates messages list
4. Conversations list hook reorders thread and updates unread counts
5. Optional push fan-out triggers through the `send-push` edge function

### News Feed

1. App operator adds or enables a source in Settings > Admin > News Sources
2. Render worker reads enabled `news_sources`
3. Worker extracts normalized post snapshots and updates source health/cursor fields
4. Current Eastern-day snapshots are inserted into `news_feed_items`
5. `useNewsFeed` receives realtime inserts/updates and refreshes the board
6. Reactions are toggled through `toggle_news_feed_reaction`

### Board Chat

1. Signed-in user opens a chat board such as News Chat, Investing Chat, Learning Chat, Crypto Chat, Vibe Coding, AI News, or Projects Chat from the low-friction Boards bubble map
2. Insert hits `board_chat_messages` with the selected `board_slug`
3. `useBoardChat` receives realtime inserts/updates/deletes for that board
4. The shared chat composer handles text, links, media attachments, voice/audio, GIFs, and replies while preserving the board slug
5. Link text is tokenized client-side and metadata is fetched through `link-preview`
6. Reactions and pins are toggled through board-scoped RPCs
7. `user_read_cursors` tracks last read by `surface = 'board_chat'` and board slug
8. The board content renders directly under the primary Boards header/back control with no duplicate subheader or manual refresh row

### Boards Landing

1. User opens Boards from the main navigation
2. `BoardBubbleMap` lays out feed boards as pills, chat boards as circles, and static boards as squares
3. Board labels are constrained inside each object so mobile text cannot spill out of the visual shape
4. Dragging a board object applies low-friction motion, no-overlap collision spacing, and collision transfer
5. Collisions can emit a small sparkle burst and a short sound-effects-aware tap; feed pills can spin briefly from corner hits and then settle upright
6. Selecting a board routes into its feed, chat, or static placeholder view
7. Reopening Boards restores the default layout instead of persisting an old ad-hoc arrangement

### Art Board

1. User opens the square Art Board tile from Boards
2. The client lazy-loads `art_board_items` by generated chunk coordinates and fetches related `art_board_links`
3. Users add uploaded/imported images or sticky notes, then placement autosaves after movement stops
4. `art-board-import-image` copies public URL imports into the public `art-board` Storage bucket before item creation
5. Links are non-directional rows in `art_board_links`; reactions toggle through `toggle_art_board_reaction`
6. `art_board_items`, `art_board_links`, and `art_board_reactions` publish low-frequency realtime updates, but live drag state is not streamed
7. `art_board` and `all_interaction` bans block writes while preserving read/browse access

### Shadow Runner

1. User opens Shadow Runner from the Entertainment picker, which starts the shared Castle Bard audio from the picker click when the browser allows autoplay from that gesture
2. The game surface enters the app's immersive Entertainment shell without changing global PWA orientation, viewport, fullscreen, manifest, or app-shell settings
3. A local private-build access gate stores unlock state in session storage
4. Portrait phones see a Shadow Runner-only rotate gate; landscape viewports render the fixed 16:9 title/playfield stage
5. The title screen preloads the home/menu assets, animates the menu-idle hero strip, and renders Start, Levels, and Options over blank scroll/button assets
6. Start mounts the lazy-loaded Phaser `ShadowRunnerLevelScene` through `ShadowRunnerGame`; movement input stays in a React-owned input ref and the Phaser scene stays responsible for the canvas level
7. DOM HUD and touch controls sit over the canvas; pause/options scroll menus pause the Phaser scene, clear pressed actions, and keep music/sound toggles in the React shell
8. The June 9 rollback intentionally removed global orientation/fullscreen behavior because it affected mobile app header, footer, composer, and PWA layout outside Shadow Runner

### Channel Ban Enforcement

1. An app operator opens a user's public profile popup
2. The profile popup loads active bans through `list_user_channel_bans`
3. Operator saves scopes and duration through `set_user_channel_bans`
4. RLS blocks banned inserts/updates in `messages` or `board_chat_messages`
5. Reaction RPCs block banned group, board-chat, or all-interaction feed reactions
6. General Chat receives the public Shado moderation notice with reason/duration

### Active Presence

1. Authenticated foreground clients call `update_user_last_active`
2. `user_presence` stores a recent heartbeat for tracked users
3. `users.presence_visibility = invisible` clears active presence and renders
   invisible identity indicators
4. `list_presence_states` and `get_active_users` feed app-wide dots and the
   General Chat active-user popup

### Weather Widget

1. User saves a city/postal-code result from Account & Profile settings
2. The selected row is upserted into `user_weather_preferences`
3. General Chat loads the preference for the signed-in user
4. The widget calls Open-Meteo forecast for current conditions and a short forecast
5. The popup displays current temp, condition, humidity, wind, rain, and daily highs/lows

### Push Notification

1. Browser registers service worker
2. User grants permission and creates a subscription
3. Subscription row is saved in Supabase
4. Message send path calls the push trigger helper
5. `send-push` edge function delivers to eligible recipient subscriptions
6. Notification status rechecks automatically when the app returns to the foreground, so Settings does not expose a manual refresh button

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
