# Architecture

This document is a high-signal map of the current ShadowChat codebase.

## Documentation Status - July 10, 2026

This architecture map includes the July 9-10 product pause, profile/role
authority boundaries, Storage constraints, classified Edge Function release
inventory, ESP server-side hold, hosted Auth/security posture, backend-first
release, strict release gates, suspended News worker, and the subsequent local
candidate for private identity, personal blocking, message search/saves,
ShadowPin social notifications, bounded DM state, and resilient push dispatch.
Candidate behavior is not production-proven until its own release completes.
Remaining work is ranked in
[FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Boards, News, Art Board, and ESP Bridge are preserved but compile-time paused
in the default production frontend as of July 9, 2026. Their modules and backend
domains remain documented below as dormant architecture. See
[PAUSED_FEATURES.md](C:/repos/chat2.0/docs/PAUSED_FEATURES.md:1).

## High-Level System

```text
React UI
  -> hooks
  -> lib helpers
  -> Supabase Auth / Postgres / Realtime / Storage / Edge Functions
  -> GitHub Actions backend-first release from main
  -> Netlify CLI-published frontend shell (cloud/Git builds stopped)
  -> preserved, currently suspended Render News scraper worker
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
- [`src/components/search`](C:/repos/chat2.0/src/components/search): caller-visible General Chat/DM search and the private saved-message library
- [`src/components/easter-egg`](C:/repos/chat2.0/src/components/easter-egg): mobile SHADO-logo Golden Egg discovery trigger, award overlay, and bundled badge/banner asset references
- [`src/features/shadow-pin`](C:/repos/chat2.0/src/features/shadow-pin): public Pins feed, tags/search, one-level comments/replies, hearts, media, and notification integration
- [`src/features/games`](C:/repos/chat2.0/src/features/games): Entertainment picker and game surfaces. Shadow Runner currently lives under [`src/features/games/shadow-runner`](C:/repos/chat2.0/src/features/games/shadow-runner) with an asset-driven title screen, Shadow Runner-scoped rotate gate, 10-stop campaign map, lazy-loaded Phaser levels through Level 5, DOM HUD/touch controls, title/options scroll menus, pause/exit confirmation menus, foreground-only Web Audio game soundtracks, and a best-effort Android fullscreen/landscape request from the picker.
- [`src/features/entertainment`](C:/repos/chat2.0/src/features/entertainment): non-game Entertainment surfaces such as Shado TV, Shadow Mystery, and Will & Kirk.

### Hooks

- [`useAuth`](C:/repos/chat2.0/src/hooks/useAuth.tsx:1): session + profile state
- [`useMessages`](C:/repos/chat2.0/src/hooks/useMessages.tsx:1): group chat state, 50-message initial windows, older-message lazy loading, and realtime
- [`useDirectMessages`](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1): stable `(created_at, id)` DM pagination, one signed-in realtime lifecycle, a bounded 200-message loaded window, unread state, and personal-block refresh
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
- [`useBlockedUsers`](C:/repos/chat2.0/src/hooks/useBlockedUsers.tsx:1): private block-list state, mutations, and app-wide block-change signaling
- [`PushSubscriptionSync`](C:/repos/chat2.0/src/components/notifications/PushSubscriptionSync.tsx:1): best-effort foreground repair for already-granted push subscriptions
- [`useTyping`](C:/repos/chat2.0/src/hooks/useTyping.ts:1): typing indicators
- [`useTheme`](C:/repos/chat2.0/src/hooks/useTheme.tsx:1): design-system theme selection

### Lib Helpers

- [`supabase.ts`](C:/repos/chat2.0/src/lib/supabase.ts:1): all Supabase client orchestration
- [`auth.ts`](C:/repos/chat2.0/src/lib/auth.ts:1): auth API wrappers and profile bootstrap
- [`push.ts`](C:/repos/chat2.0/src/lib/push.ts:1): browser push storage and dispatch wiring with bounded retry for network, conflict, and server failures
- [`personalBlocking.ts`](C:/repos/chat2.0/src/lib/personalBlocking.ts:1): block-list RPCs and blocked-relationship error detection
- [`messageLibrary.ts`](C:/repos/chat2.0/src/lib/messageLibrary.ts:1): caller-visible full-text search, private saves, and collections
- [`ai.ts`](C:/repos/chat2.0/src/lib/ai.ts:1): authenticated AI function calls
- [`weather.ts`](C:/repos/chat2.0/src/lib/weather.ts:1): Open-Meteo geocoding/forecast mapping and private weather preference helpers
- [`moderation.ts`](C:/repos/chat2.0/src/lib/moderation.ts:1): channel-ban scopes, durations, and moderation RPC wrappers
- [`uploadLimits.ts`](C:/repos/chat2.0/src/lib/uploadLimits.ts:1): shared client
  MIME, size, filename, and voice-recording limits aligned with Storage buckets
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
- recipient-owned notification events published through Supabase Realtime
- private personal blocks with reciprocal RLS/RPC/trigger enforcement
- owner-private message collections and saved General Chat/DM references
- normalized ShadowPin tags, one-level comments/replies, and bounded activity
- Hype events, per-message Hype summaries, event receipts, daily limits, and bonus-credit grants
- permanent Golden Egg Easter egg claims through `users.gold_easter_egg` and `claim_gold_easter_egg`
- Shadow Runner level catalog, per-user completion ledger, and public completion-medal badge fields
- full-admin automation approval packets and append-only packet events
- ESP bridge control-plane and update-manifest tables

Storage bucket metadata enforces reviewed limits and MIME allowlists for
avatars, banners, message media, and chat uploads. The browser applies the same
limits before upload, but server-side bucket configuration is authoritative.

The verified production schema is aligned through
`20260710002000_remote_security_advisor_cleanup.sql`. That migration removes
broad paused-domain browser grants and bucket-list policies, tightens internal
and trigger Functions, and preserves only reviewed active RPC access. Hosted
database lint is clean and leaked-password screening is enabled. The remaining
hosted security-advisor set is 71 guarded authenticated definer APIs plus the
intentional anonymous username-availability check; reducing that surface is a
ranked architecture refactor, not a blind grant-revocation exercise.

Later migrations through
`20260710044600_personal_blocking_engagement_hardening.sql` are part of the
current local release candidate. They must be applied and verified by the
backend-first `main` workflow before this document treats them as hosted state.

### Edge Functions

- [`openai-chat`](C:/repos/chat2.0/supabase/functions/openai-chat/index.ts:1): validates caller session, proxies allowed AI requests to OpenRouter by default, and can post group-chat AI answers as the dedicated `Shado` assistant profile
- [`send-push`](C:/repos/chat2.0/supabase/functions/send-push/index.ts:1): validates caller session, resolves eligible recipients, enforces preferences/personal blocks, sends VAPID payloads, prunes invalid subscriptions, exposes privacy-safe aggregate results, and returns retryable provider failure state without leaking endpoint or recipient identifiers
- [`link-preview`](C:/repos/chat2.0/supabase/functions/link-preview/index.ts:1): validates a signed-in bearer token, rejects unsafe targets through the shared safe-fetch helper, and fetches Open Graph/oEmbed metadata for chat, DM, and board-chat link cards
- [`delete-account`](C:/repos/chat2.0/supabase/functions/delete-account/index.ts:1): validates caller session in code, removes owned storage objects, and deletes the auth user through service-role access
- [`shadow-pin-video`](C:/repos/chat2.0/supabase/functions/shadow-pin-video/index.ts:1): validates user tokens in code for Bunny upload session creation, processing sync, and external-video import support
- [`shadow-pin-import-image`](C:/repos/chat2.0/supabase/functions/shadow-pin-import-image/index.ts:1): active authenticated public-image import helper using the shared safe-fetch contract
- [`art-board-import-image`](C:/repos/chat2.0/supabase/functions/art-board-import-image/index.ts:1): preserved source classified for remote removal while Art Board is paused
- [`bridge-*`](C:/repos/chat2.0/supabase/functions): preserved bridge functions that all call the shared default-deny hold before request parsing, authentication, or database work
- [`supabase/function-manifest.json`](C:/repos/chat2.0/supabase/function-manifest.json:1): canonical active, deny-paused, and remove classification used by CI/deployment

Audit note: several Edge Functions intentionally run with Supabase gateway JWT verification disabled and enforce custom authentication in code. Any change to those functions must preserve custom auth, rate limits, RLS-equivalent checks, and service-role boundaries.

Remote state must be verified against the manifest after every production
release. A green frontend build alone is not backend parity evidence.
The July 10 proof matched all 23 expected deployed Functions: 8 active and 15
ESP Bridge endpoints in the shared deny-paused state; the removed Art Board
import Function was absent.

### Background Workers

- [`services/news-scraper`](C:/repos/chat2.0/services/news-scraper): preserved Render Docker worker source; production is suspended while News is paused
- [`render.yaml`](C:/repos/chat2.0/render.yaml:1): preserved `shado-news-scraper` blueprint with automatic deploys disabled

## External Systems

### News Scraper

When re-enabled, the News Feed is populated outside the browser: operators add
sources, the worker polls them, and Supabase realtime fans new rows out to
signed-in clients. The default frontend does not mount these hooks or panels,
and the production worker is suspended.

Truth Social can block hosted worker IPs. The production escape hatch is to
connect the worker to a trusted remote browser through `PINCHTAB_CDP_URL` or
`PINCHTAB_WS_ENDPOINT`.

Full runbook: [docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1).

### Admin Access

Admin access is an app-wide role domain. The single full `admin` can grant or
revoke `sub_admin` access from Settings > Admin > Admin Access or from a user's
public profile popup. Sub-admins can use active operator tools such as Feedback
Review but cannot manage roles; News Sources remains absent while News is paused.

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
backend pairing/session lifecycle functions. It is currently on hold: the UI is
omitted, bridge devices/codes/custom sessions are revoked or disabled by
migration, dedicated Auth sessions are removed by release automation, and every
deployed endpoint defaults to `feature_paused`.

The source-of-truth planning and runbook set starts at
[docs/ESP_BRIDGE_FEATURE_ROADMAP.md](C:/repos/chat2.0/docs/ESP_BRIDGE_FEATURE_ROADMAP.md:1)
and [docs/ESP_BRIDGE_TUI_PRODUCTION_READINESS.md](C:/repos/chat2.0/docs/ESP_BRIDGE_TUI_PRODUCTION_READINESS.md:1).

## Important Runtime Flows

### Sign In

1. User signs in through [`src/lib/auth.ts`](C:/repos/chat2.0/src/lib/auth.ts:1)
2. Auth helpers call `ensureSession` and the current working Supabase client before protected profile, upload, AI, GIF, link-preview, or ShadowPin media calls
3. [`useAuth`](C:/repos/chat2.0/src/hooks/useAuth.tsx:1) loads the profile row
4. Realtime auth token is updated on the Supabase client
5. Presence updates start after authentication

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

### Golden Egg Discovery

1. On mobile pointers, a hold on the SHADO logo dispatches the Golden Egg discovery request.
2. `GoldenEggDiscoveryController` calls the authenticated `claim_gold_easter_egg` RPC and refreshes the current profile.
3. The discovery overlay renders a bundled banner backdrop and badge seal from `public/easter-egg`.
4. The permanent `users.gold_easter_egg` field feeds shared achievement badges in chat, profile, DM, Art Board, and search surfaces.

### Direct Message

1. UI resolves or creates a conversation through the reciprocal block-aware RPC.
2. Send path inserts into `dm_messages`; RLS and a trigger reject blocked pairs.
3. The active thread loads stable `(created_at, id)` pages and keeps only the
   newest 200 loaded messages in memory/rendering.
4. One user-scoped realtime lifecycle reconciles thread and inbox state.
5. A personal-block change refreshes conversations and loaded messages; the
   preserved thread shows an unavailable state until unblock.
6. Optional push fan-out triggers through the `send-push` Edge Function.

### Personal Block

1. A member confirms Block from a public profile or DM, or Unblock from that
   surface/Settings.
2. `block_user` or `unblock_user` mutates the caller-owned `user_blocks` row.
3. App-wide block state refreshes immediately.
4. Reciprocal RLS, RPC checks, and triggers enforce discovery, chat, DM, Hype,
   ShadowPin, known-id engagement, aggregate, and notification boundaries.
5. On block creation, unread pair notifications are marked read. Existing DM
   rows remain stored and return after unblock.

Full contract: [docs/PERSONAL_BLOCKING.md](C:/repos/chat2.0/docs/PERSONAL_BLOCKING.md:1).

### Message Library

1. The app-header control opens Search or Saved.
2. `search_my_messages` runs as the authenticated caller; existing General
   Chat, DM, profile, and block RLS filters every result.
3. `save_message_to_library` creates or updates one private save per source
   message, optionally in an owner-private collection.
4. Opening a result routes to General Chat or the relevant DM/message deep link.
5. Deleting a collection leaves its saved messages unfiled rather than deleting
   the source or save.

Full contract: [docs/MESSAGE_LIBRARY.md](C:/repos/chat2.0/docs/MESSAGE_LIBRARY.md:1).

### ShadowPin Social Notification

1. A creator inserts/uploads a pin, which may begin in a processing state.
2. The database creates new-post events only when the pin first becomes
   visible with `processing_status = 'ready'`.
3. Eligible members receive one recipient-owned `notification_events` row;
   preference, self, dedupe, and reciprocal-block rules apply.
4. The Realtime publication delivers the row to the signed-in recipient while
   `send-push` performs best-effort background delivery.
5. Root comments notify the pin creator; one-level replies notify the root
   comment author.

### Dormant News Feed Flow

1. App operator adds or enables a source in Settings > Admin > News Sources
2. Render worker reads enabled `news_sources`
3. Worker extracts normalized post snapshots and updates source health/cursor fields
4. Current Eastern-day snapshots are inserted into `news_feed_items`
5. `useNewsFeed` receives realtime inserts/updates and refreshes the board
6. Reactions are toggled through `toggle_news_feed_reaction`

### Dormant Board Chat Flow

1. Signed-in user opens a chat board such as News Chat, Investing Chat, Learning Chat, Crypto Chat, Vibe Coding, AI News, or Projects Chat from the low-friction Boards bubble map
2. Insert hits `board_chat_messages` with the selected `board_slug`
3. `useBoardChat` receives realtime inserts/updates/deletes for that board
4. The shared chat composer handles text, links, media attachments, voice/audio, GIFs, and replies while preserving the board slug
5. Link text is tokenized client-side and metadata is fetched through `link-preview`
6. Reactions and pins are toggled through board-scoped RPCs
7. `user_read_cursors` tracks last read by `surface = 'board_chat'` and board slug
8. The board content renders directly under the primary Boards header/back control with no duplicate subheader or manual refresh row

### Dormant Boards Landing

1. User opens Boards from the main navigation
2. `BoardBubbleMap` lays out feed boards as pills, chat boards as circles, and static boards as squares
3. Board labels are constrained inside each object so mobile text cannot spill out of the visual shape
4. Dragging a board object applies low-friction motion, no-overlap collision spacing, and collision transfer
5. Collisions can emit a small sparkle burst and a short sound-effects-aware tap; feed pills can spin briefly from corner hits and then settle upright
6. Selecting a board routes into its feed, chat, or static placeholder view
7. Reopening Boards restores the default layout instead of persisting an old ad-hoc arrangement

### Dormant Art Board Flow

1. User opens the square Art Board tile from Boards
2. The client lazy-loads `art_board_items` by generated chunk coordinates and fetches related `art_board_links`
3. Users add uploaded/imported images or sticky notes, then placement autosaves after movement stops
4. `art-board-import-image` copies public URL imports into the public `art-board` Storage bucket before item creation
5. Links are non-directional rows in `art_board_links`; reactions toggle through `toggle_art_board_reaction`
6. `art_board_items`, `art_board_links`, and `art_board_reactions` publish low-frequency realtime updates, but live drag state is not streamed
7. `art_board` and `all_interaction` bans block writes while preserving read/browse access

### Shadow Runner

1. User opens Shadow Runner from the Entertainment picker, which starts the shared Castle Bard lobby music through the foreground-only Web Audio soundtrack controller when the browser allows playback from that gesture
2. The picker makes a best-effort fullscreen plus `screen.orientation.lock('landscape')` request for browsers that support it, then releases fullscreen/orientation on exit
3. The game surface enters the app's immersive Entertainment shell without changing the global PWA manifest, viewport, or app-shell settings
4. Portrait phones still see a Shadow Runner-only rotate gate when the browser cannot or does not rotate; landscape viewports render the fixed 16:9 title/playfield stage
5. The title screen preloads the home/menu assets, animates the menu-idle hero strip, and renders Start Tutorial, Select Level, and Options over blank scroll/button assets
6. Start mounts the tutorial route, while Select Level opens the generated 10-stop campaign map with mission detail popups before launching playable routes through Level 5 in `ShadowRunnerGame`; movement input stays in a React-owned input ref and the Phaser scene stays responsible for the canvas level. Level 5 adds Candle Jesters, shield pickups, offscreen archer volleys, fall damage, and tilt bridges that can dump the player when mistimed
7. DOM HUD and touch controls sit over the canvas; pause/options scroll menus pause the Phaser scene, clear pressed actions, keep SFX toggles in the React shell, and leave gameplay music off by automatically stopping lobby music while the Phaser level is mounted
8. Shadow Runner SFX are original generated WAV assets under `public/games/shadow-runner/audio/sfx`; a single Web Audio controller preloads staged sound groups, throttles high-frequency effects, and Phaser emits named gameplay sound events for menu, map, pause, jump, land, attack, hit, coin, defeat, respawn, failure, and completion feedback
9. Game soundtracks no longer mount a persistent hidden `<audio>` element; Shadow War, Shadow Checkers, and Shadow Runner music use a shared Web Audio controller and close the audio context on background/pagehide so iPhone does not treat game loops like lock-screen media
10. Level completion records through `record_shadow_runner_level_completion`; the private completion ledger derives public sprint/knight medals on `public.users`, and the catalog can revoke stale knight medals when a harder available level is introduced
11. The June 9 rollback intentionally removed app-wide manifest/viewport/fullscreen/orientation behavior because it affected mobile app header, footer, composer, and PWA layout outside Shadow Runner; the current picker request is Shadow Runner-scoped and best-effort

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
4. `PushSubscriptionSync` periodically repairs already-granted current-device subscriptions on sign-in, focus, page show, and visible-state resume without prompting users again
5. Source mutation calls the push trigger helper; network, `409`, and `5xx`
   invocation failures receive two bounded client retries.
6. `send-push` delivers to eligible subscriptions, removes permanently invalid
   endpoints, and returns only aggregate counts.
7. Retryable provider failures return `503` and release the idempotency claim so
   a later attempt can safely reacquire it.
8. Notification status rechecks automatically when the app returns to the foreground, so Settings does not expose a manual refresh button

## UI System

The current product direction is a dark luxury system:

- obsidian shell backgrounds
- smoked glass surfaces
- gold-rimmed call-to-action styling
- restrained accent usage
- mobile-first polish for nav, composer, settings, and inbox behavior

Global tokens live in [`src/index.css`](C:/repos/chat2.0/src/index.css:1).

## Testing Layers

- Node 24 static gates: zero-warning lint, typecheck, docs integrity, classified
  Function verification, and budgeted production build
- Jest: hook/component behavior
- local Supabase reset, migration lint, and security advisors
- dependency audits, gitleaks, Trivy, and CodeQL
- headed browser checks: realtime, mobile layout, and regression validation
- scraper proof and one-cycle checks before scraper deployments

Use [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1) for the practical workflow.
