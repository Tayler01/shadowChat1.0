# ShadowChat 1.0

ShadowChat 1.0 is a premium dark realtime chat app built with React, TypeScript, Vite, and Supabase. Its active production surface combines public group chat, private direct messages, Entertainment, ShadowPin, admin tools, profile customization, AI-assisted chat utilities, browser push notifications, and a per-user weather widget behind a polished black-and-gold interface. Boards, News, Art Board, and ESP Bridge are preserved but intentionally paused; see [docs/PAUSED_FEATURES.md](C:/repos/chat2.0/docs/PAUSED_FEATURES.md:1).

The project is already wired for hosted Supabase and Netlify deployment. It is designed to behave like a product app, not a demo: realtime messaging, uploads, presence, settings, DMs, and notification flows are all first-class parts of the codebase.

## Documentation Status - July 11, 2026

The documentation set has been refreshed for the July 9-10 alignment program
and deployed Release A: paused product domains, Supabase
authority/security hardening, deterministic backend deployment, strict CI,
dependency cleanup, build budgets, notification delivery parity, personal
privacy controls, message discovery, and the active Entertainment/ShadowPin
feature work. The ranked source of truth is
[docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1),
and the full inventory is
[docs/PROJECT_DOCUMENTATION_RUNDOWN_2026-06-01.md](C:/repos/chat2.0/docs/PROJECT_DOCUMENTATION_RUNDOWN_2026-06-01.md:1).

The backend-first `main` workflow has shipped the July 10 Release A frontend,
schema, and classified Edge Function batch to Supabase and Netlify. Linked
verification then found two historical active-table grants outside the reviewed
contract; a forward revocation and follow-up release are the remaining closeout
step. The latest successful `main` workflow plus the public health manifest are
the authority for the live SHA and deployment state.

The isolated `codex/shadowchat-2.0` branch now contains four locally verified
Wave One candidates: Unified Activity HQ, ShadowPin Theater, DM Conversation
Hub, and private member reporting with an operator Safety Case Center. These
are not production claims and have not changed `main`; follow
[docs/SHADOWCHAT_2_0_WAVE_ONE.md](C:/repos/chat2.0/docs/SHADOWCHAT_2_0_WAVE_ONE.md:1)
for the separate-backend-compatible Netlify trial gate.

Release A closes the code-side service-worker, DM pagination
and subscription, reaction rollback, runtime-asset, report-only CSP, dialog,
mobile-header, notification, blocking, message-library, ShadowPin social,
Shado TV, and Shadow Mystery work described below. Remaining follow-ups include
the forward grant revocation and final linked/live proof, staged private-identity
column removal only after that proof, physical-device PWA validation, production
header/advisor verification, and domain-by-domain reduction of the guarded
`SECURITY DEFINER` surface.

## Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- Phaser for the Shadow Runner playable prototype
- Supabase Auth, Postgres, Realtime, Storage, and Edge Functions
- Netlify for static hosting
- Preserved Render worker definition for the currently paused News scraper
- Playwright browser automation for News ingestion and QA
- Jest + Testing Library for unit and hook coverage
- Playwright for headed browser debugging and smoke validation

## What The App Includes

- Realtime group chat with active-user count and per-user weather in the header
- Realtime direct messages
- Unread tracking and in-app DM notifications
- User profiles with adjustable avatar crop/zoom, banner, status, role badges, achievement badges, presence visibility, theme color, and admin moderation controls
- File, image, and voice-message uploads
- Message reactions, pinning, editing, and deletion
- Hype bell and message Hype celebrations with daily limits, bonus credits,
  realtime events, permanent message Hype summaries, and optional Hype push
  notifications
- Hype-aware image/video media frames that keep badges and reactions inside
  shrink-wrapped media cards without changing text/file/audio bubbles
- Slash commands and reply/thread affordances
- Universal authenticated search across visible General Chat messages and the
  signed-in user's DMs, with private saved messages and personal collections
- Reciprocal personal blocking across profile discovery, General Chat,
  presence, DMs, ShadowPin, Hype, and push delivery while preserving DM history
  for restoration after unblock
- AI reply and summary hooks through a secured Supabase Edge Function
- Preserved, default-off Boards domain with its draggable map, News Feed, board chats, and Art Board mood canvas
- App-wide admin/sub-admin access controls with role badges and operator-only tools
- Operator-managed bans for General Chat, individual chat boards, and all app interaction
- Server-confirmed operator message deletion for normal-user General Chat and board-chat messages
- Admin-managed X/Truth Social source tracking from Settings
- Admin feedback review for submitted bugs, suggestions, and private attachments
- Server-side link previews for chat, DMs, and board chat URLs
- Browser push notifications for DMs, General Chat messages, mentions,
  replies, reactions, Hype, and ShadowPin activity, with master/type controls,
  daily quiet hours, temporary snooze, General Chat mute, and per-DM-thread mute
- Best-effort app-shell repair for already-granted browser push subscriptions
  when signed-in users foreground or reopen the app
- Mobile Golden Egg Easter egg discovery from the SHADO logo, with a permanent
  public profile badge and a bundled badge/banner celebration asset set
- Settings feedback flow for bug reports and feature ideas with private image attachments
- Per-user Open-Meteo weather location preference and forecast popup
- PWA/service-worker foundation for installed mobile and desktop web experiences
- Phone install onboarding and app-release popups for production release communication
- Simple app-reopen loading state with consistent `Loading Shado...` copy
- Entertainment area with Shadow Runner, Shadow War, Shadow Checkers, Shado TV,
  Shadow Mystery, and Will & Kirk surfaces; Shadow Runner is currently a
  landscape-gated campaign prototype with a tutorial, a 10-stop campaign map,
  playable Level 1 through Level 4 routes, generated touch controls,
  tap-toggle crouch, pause/options menus, Castle Bard lobby music through the
  shared foreground-only Web Audio soundtrack controller, original SFX, public
  completion medals backed by a private completion ledger, and a best-effort
  Android fullscreen/landscape request from the picker
- ShadowPin discovery with normalized tags, indexed pin search, threaded
  comments/replies, and in-app plus background notifications for eligible new
  posts, comments, and replies
- Shado TV Bunny playback with WebVTT captions, synchronized premieres,
  Continue Watching, and privacy-bounded operator watch analytics
- Shadow Mystery hybrid bundled/database reader with an operator publishing
  studio, ordered chapters, source credits, and private transformed artwork
- Operator Operations Health showing sanitized release, migration, Function,
  monitor, push-readiness, and paused-domain evidence
- Premium obsidian-and-gold design system across desktop and mobile

## Current Project Shape

Frontend lives under [`src`](C:/repos/chat2.0/src).

- [`App.tsx`](C:/repos/chat2.0/src/App.tsx) owns high-level view switching and app chrome.
- [`src/components`](C:/repos/chat2.0/src/components) contains view and UI components grouped by domain.
- [`src/hooks`](C:/repos/chat2.0/src/hooks) contains most stateful app behavior.
- [`src/lib`](C:/repos/chat2.0/src/lib) contains Supabase, auth, push, AI, env, and utility layers.
- [`src/components/boards`](C:/repos/chat2.0/src/components/boards) contains the Boards map, board routing, and reusable board-chat UI.
- [`src/components/art`](C:/repos/chat2.0/src/components/art) contains the Art Board canvas, add flows, item controls, linking, and detail popup.
- [`src/components/news`](C:/repos/chat2.0/src/components/news) contains the News Feed, feed item, reaction, modal UI, and compatibility wrappers for older imports.
- [`src/features/games`](C:/repos/chat2.0/src/features/games) contains the Entertainment picker and game surfaces, including the Shadow Runner Phaser prototype under [`src/features/games/shadow-runner`](C:/repos/chat2.0/src/features/games/shadow-runner).
- [`src/features/entertainment`](C:/repos/chat2.0/src/features/entertainment) contains non-game Entertainment surfaces such as Shado TV and Shadow Mystery.
- [`src/components/search`](C:/repos/chat2.0/src/components/search) contains the
  global message search, saved-message, and personal-collection surface.
- [`source-assets`](C:/repos/chat2.0/source-assets) preserves nonruntime source,
  generation, contact-sheet, and preview assets outside the Netlify deploy;
  only runtime-ready finals belong under [`public`](C:/repos/chat2.0/public).
- [`src/components/chat/WeatherWidget.tsx`](C:/repos/chat2.0/src/components/chat/WeatherWidget.tsx:1) contains the General Chat weather pill and forecast popup.
- [`src/components/settings/WeatherLocationSettings.tsx`](C:/repos/chat2.0/src/components/settings/WeatherLocationSettings.tsx:1) contains the per-user weather location picker.
- [`src/hooks/useBoardChat.tsx`](C:/repos/chat2.0/src/hooks/useBoardChat.tsx), [`src/hooks/useBoardBadges.ts`](C:/repos/chat2.0/src/hooks/useBoardBadges.ts), [`src/hooks/useNewsFeed.tsx`](C:/repos/chat2.0/src/hooks/useNewsFeed.tsx), and [`src/hooks/useNewsAdmin.ts`](C:/repos/chat2.0/src/hooks/useNewsAdmin.ts) own the Boards and News client behavior.
- [`src/hooks/useAdminAccess.ts`](C:/repos/chat2.0/src/hooks/useAdminAccess.ts:1) owns admin/sub-admin access state.
- [`src/hooks/useBlockedUsers.tsx`](C:/repos/chat2.0/src/hooks/useBlockedUsers.tsx:1) owns private block-list state and reciprocal UI enforcement.
- [`src/lib/messageLibrary.ts`](C:/repos/chat2.0/src/lib/messageLibrary.ts:1) owns message search, saves, and collections.
- [`src/lib/personalBlocking.ts`](C:/repos/chat2.0/src/lib/personalBlocking.ts:1) owns personal-block RPC helpers and blocked-action messaging.
- [`src/hooks/useWeatherPreference.ts`](C:/repos/chat2.0/src/hooks/useWeatherPreference.ts:1), [`src/hooks/useWeatherForecast.ts`](C:/repos/chat2.0/src/hooks/useWeatherForecast.ts:1), and [`src/lib/weather.ts`](C:/repos/chat2.0/src/lib/weather.ts:1) own weather preference and forecast behavior.

Backend lives under [`supabase`](C:/repos/chat2.0/supabase).

- [`supabase/migrations`](C:/repos/chat2.0/supabase/migrations) is the source of truth for schema and policies.
- [`supabase/functions/openai-chat`](C:/repos/chat2.0/supabase/functions/openai-chat/index.ts) handles authenticated AI requests.
- [`supabase/functions/send-push`](C:/repos/chat2.0/supabase/functions/send-push/index.ts) sends web push notifications.
- [`supabase/functions/link-preview`](C:/repos/chat2.0/supabase/functions/link-preview/index.ts) fetches server-side metadata for chat, DM, and board-chat link cards.
- News data lives in isolated `news_*` tables and RPCs from [`supabase/migrations/20260430041621_news_tab_foundation.sql`](C:/repos/chat2.0/supabase/migrations/20260430041621_news_tab_foundation.sql:1).
- Boards use `public.board_catalog`, `public.board_chat_messages`, `public.board_chat_reactions`, and per-board `user_read_cursors`.
- Art Board data uses `public.art_board_items`, `public.art_board_links`,
  `public.art_board_reactions`, and the public `art-board` Storage bucket. Its
  import Function source is preserved but classified for remote removal while
  the domain is paused.
- Feedback submissions use `public.feedback_submissions` plus the private `feedback-attachments` Storage bucket.
- Admin roles use `public.user_roles`, `public.admin_role_audit`, `public.admin_role_notifications`, and the synced public `users.admin_role` badge field.
- Channel bans use `public.user_channel_bans` plus RLS/RPC enforcement for General Chat, individual board chats, and all interaction.
- Weather locations use private `public.user_weather_preferences` rows scoped by RLS to the owning user.
- Hype uses `public.hype_events`, `public.message_hypes`,
  `public.hype_event_receipts`, and `public.hype_bonus_grants`.
- Notification delivery uses `public.notification_preferences`, private
  per-user rows in `public.notification_conversation_mutes`, recipient-owned
  `public.notification_events`, and `public.push_subscriptions`.
- Personal blocking uses private owner-visible `public.user_blocks` rows plus
  reciprocal RLS, guarded RPCs, and server-side DM enforcement triggers.
- Message search and saves use `public.message_collections`,
  `public.saved_messages`, and caller-scoped SECURITY INVOKER search/list RPCs.
- ShadowPin social data uses `public.shadow_pin_tags`,
  `public.shadow_pin_image_tags`, and `public.shadow_pin_comments`.
- Shadow Mystery publishing uses isolated story, chapter, image, and source
  tables plus the private `shadow-mystery` Storage bucket.
- Shado TV captions and analytics use `public.shado_tv_captions`,
  `public.shado_tv_watch_events`, existing per-user watch progress, and an
  operator-only aggregate RPC.
- [`supabase/function-manifest.json`](C:/repos/chat2.0/supabase/function-manifest.json:1)
  classifies every Edge Function as active, deny-paused, or removed.
- The Golden Egg Easter egg uses `public.users.gold_easter_egg` and the
  authenticated `claim_gold_easter_egg` RPC.
- Automation approval review packets use `public.automation_approval_packets`
  and `public.automation_approval_packet_events`.
- Shadow Runner completion medals use `public.shadow_runner_level_catalog`,
  `public.shadow_runner_level_completions`, public badge fields on
  `public.users`, and the authenticated
  `record_shadow_runner_level_completion` RPC.

Preserved background-service source lives under [`services`](C:/repos/chat2.0/services).

- [`services/news-scraper`](C:/repos/chat2.0/services/news-scraper) is the paused Render Docker worker source for polling admin-enabled X and Truth Social sources.
- [`render.yaml`](C:/repos/chat2.0/render.yaml:1) preserves the `shado-news-scraper` definition with automatic deploys disabled.

Tests live under [`tests`](C:/repos/chat2.0/tests).

## Quick Start

1. Install dependencies.
2. Create a Supabase project.
3. Add frontend env vars.
4. Link the repo to Supabase and push migrations.
5. Start the app.

```powershell
npm install
Copy-Item .env.example .env
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npm run dev
```

For the full setup flow, use [docs/SETUP_GUIDE.md](C:/repos/chat2.0/docs/SETUP_GUIDE.md:1).

## Environment Variables

Frontend env values live in [`.env`](C:/repos/chat2.0/.env.example:1).

Required:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Common optional values:

- `VITE_PRESENCE_INTERVAL_MS`
- `VITE_MESSAGE_FETCH_LIMIT` (defaults to `50` for chat and DM windows)
- `VITE_DEBUG_LOGS`
- `VITE_WEB_PUSH_PUBLIC_KEY`

Supabase Edge Function secrets are separate from `.env`. The project uses:

- `OPENROUTER_API_KEY`
- `AI_PROVIDER`
- `OPENROUTER_MODEL`
- `AI_ALLOWED_MODELS`
- `OPENROUTER_SITE_URL`
- `OPENROUTER_APP_NAME`
- `OPENAI_API_KEY` or `OPENAI_KEY` only for the legacy direct-OpenAI fallback
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`
- `META_OEMBED_ACCESS_TOKEN`, or `META_APP_ID` plus `META_APP_SECRET`, when Meta/Facebook/Instagram oEmbed previews are needed

Render News scraper secrets are also separate from frontend `.env`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEWS_SCRAPE_INTERVAL_MS`
- `NEWS_SCRAPE_HEADLESS`
- optional `PINCHTAB_CDP_URL` or `PINCHTAB_WS_ENDPOINT`
- optional `X_USERNAME`, `X_EMAIL`, `X_PASSWORD`
- optional `TRUTH_USERNAME`, `TRUTH_EMAIL`, `TRUTH_PASSWORD`
- optional `NEWS_X_SHARED_CONTEXT`

Weather uses the public Open-Meteo forecast and geocoding APIs from the browser. No weather provider key is required for the current integration, and no weather provider token should be stored in `VITE_*` variables.

## Core Commands

```powershell
npm run dev
npm run build
npm run lint
npm test
npx tsc --noEmit -p tsconfig.app.json
npx vite preview
npm run news:scrape:proof
npm run news:scraper
```

Run the full browser smoke after broad app changes or before a larger release handoff:

```powershell
node scripts/playwright-smoke.mjs --scenario=full --run-name=full-smoke-release --headed --slow-mo=100 --no-reuse-server
```

## Realtime, Push, and AI Notes

- Realtime depends on the migrations having been pushed to the target Supabase project.
- Browser push depends on the service worker, VAPID keys, the `send-push` edge function, and at least one active subscription row. Hype notifications use the same function with the `hype_event` event type.
- ShadowPin foreground alerts depend on recipient-owned `notification_events`
  being in the Supabase Realtime publication. Migration
  `20260710044500_publish_notification_events_realtime.sql` adds that
  publication while RLS keeps each event visible only to its recipient.
- Signed-in foreground clients repair already-granted push subscriptions through
  `PushSubscriptionSync` without prompting users again.
- AI features depend on the `openai-chat` edge function and configured Supabase AI provider secrets.
- Active-user dots and the General Chat user-count popup depend on `user_presence`, `users.presence_visibility`, and the `update_user_last_active`, `list_presence_states`, and `get_active_users` RPCs.
- News Feed realtime depends on the isolated News migrations, the `shado-news-scraper` Render worker, and the source health/cursor fields in `news_sources`.
- Board chat realtime depends on `board_chat_messages`, `board_chat_reactions`, `user_read_cursors`, and `get_board_badge_counts`.
- Art Board realtime depends on `art_board_items`, `art_board_links`, and `art_board_reactions`; item movement autosaves after edits instead of streaming live drag state.
- Board and feed detail views share the primary Boards header/back control and intentionally avoid redundant secondary headers or manual refresh buttons.
- Operator message deletes in General Chat and board chats depend on the moderation delete policies returning a deleted row before the client removes it locally.
- Weather preferences are private, and forecasts refresh automatically after preference changes and on a periodic timer. `user_weather_preferences` is not published to Supabase Realtime.
- iPhone web push requires the app to be installed to the Home Screen. Android and Windows work through supported browsers/PWAs.
- iPhone Home Screen resume behavior now depends on the session/realtime hardening in [`src/lib/supabase.ts`](C:/repos/chat2.0/src/lib/supabase.ts:1) and the deferred auth callback flow in [`src/hooks/useAuth.tsx`](C:/repos/chat2.0/src/hooks/useAuth.tsx:1). Avoid reintroducing async Supabase calls directly inside `onAuthStateChange`.

## News Scraper Notes

- News is paused, the Render worker is suspended, and automatic worker deploys
  are disabled. These notes are reactivation guidance, not a normal release step.
- The News scraper does not use the paid X API. It uses browser extraction, optional read-only X credentials, and per-source browser isolation.
- The feed board stores only current Eastern-day posts. Source cursors persist across the daily board clear so older posts do not reappear.
- Truth Social may block hosted worker IPs even when credentials are configured. If `news_sources.health_status` stays `blocked`, move the browser session to PinchTab or another trusted browser/IP path instead of exposing credentials to the client.
- Start every scraper change with `npm run news:scrape:proof`, then run a real one-cycle check with `node services/news-scraper/src/index.mjs --once` using service-role credentials.

Full runbook: [docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1).

## Testing And Debugging

The minimum quality gates for normal code changes are:

```powershell
npm run lint
npm run typecheck
npm run test:node
npm run supabase:functions:verify
npm run docs:verify
npm run build
npx jest --runInBand
npm audit --audit-level=low
```

For deeper testing guidance, including headed Playwright debugging, use [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1).

## Deployment

Production is hosted on Netlify and Supabase. Pushing to `main` triggers the
backend-first GitHub Actions release: all Quality jobs must pass, then migrations,
configuration, classified Functions, and the bridge hold align before the
workflow publishes the built artifact through the Netlify CLI. Netlify cloud/Git
builds are stopped so this single workflow owns production publication. The
preserved Render News worker remains suspended.

- Netlify config: [netlify.toml](C:/repos/chat2.0/netlify.toml:1)
- Netlify workflow: [.github/workflows/netlify-production.yml](C:/repos/chat2.0/.github/workflows/netlify-production.yml:1)
- Render worker config: [render.yaml](C:/repos/chat2.0/render.yaml:1)
- Deployment guide: [docs/DEPLOYMENT_GUIDE.md](C:/repos/chat2.0/docs/DEPLOYMENT_GUIDE.md:1)
- Engineering safeguards: [docs/ENGINEERING_SAFEGUARDS.md](C:/repos/chat2.0/docs/ENGINEERING_SAFEGUARDS.md:1)

## Documentation Map

- [AGENTS.md](C:/repos/chat2.0/AGENTS.md:1): agent-focused working guide for coding, testing, and debugging
- [docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1): current audit backlog for security, auth, chat-scroll, frontend polish, deployment, and architecture follow-ups
- [docs/PROJECT_DOCUMENTATION_RUNDOWN_2026-06-01.md](C:/repos/chat2.0/docs/PROJECT_DOCUMENTATION_RUNDOWN_2026-06-01.md:1): documentation and agent-file inventory with refresh guidance
- [docs/SETUP_GUIDE.md](C:/repos/chat2.0/docs/SETUP_GUIDE.md:1): first-time local and hosted setup
- [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1): lint, typecheck, unit tests, smoke tests, and Playwright usage
- [docs/DEPLOYMENT_GUIDE.md](C:/repos/chat2.0/docs/DEPLOYMENT_GUIDE.md:1): GitHub, Netlify, and Supabase deployment workflow
- [docs/ARCHITECTURE.md](C:/repos/chat2.0/docs/ARCHITECTURE.md:1): codebase map and key data flows
- [docs/ADMIN_ACCESS.md](C:/repos/chat2.0/docs/ADMIN_ACCESS.md:1): app-wide admin/sub-admin roles, badges, settings, and RPCs
- [docs/CHANNEL_BANS.md](C:/repos/chat2.0/docs/CHANNEL_BANS.md:1): profile-popup moderation controls and database-enforced channel bans
- [docs/PERSONAL_BLOCKING.md](C:/repos/chat2.0/docs/PERSONAL_BLOCKING.md:1): reciprocal private blocks across discovery, chat, DMs, ShadowPin, and notifications
- [docs/MESSAGE_LIBRARY.md](C:/repos/chat2.0/docs/MESSAGE_LIBRARY.md:1): caller-visible message search, private saves, and collections
- [docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md](C:/repos/chat2.0/docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md:1): current in-app/Web Push delivery, preferences, privacy, retries, and device QA
- [docs/ART_BOARD.md](C:/repos/chat2.0/docs/ART_BOARD.md:1): shared Art Board canvas, schema, storage, moderation, and validation
- [docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md:1): active Shadow Runner playable-prototype roadmap, route checkpoints, and verification notes
- [docs/SHADOW_RUNNER_HOME_ASSETS.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_HOME_ASSETS.md:1): Shadow Runner title/menu/campaign-map asset pack, current playable-prototype wiring, and asset follow-ups
- [docs/SHADOW_RUNNER_GAMEPLAY_ASSETS.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_GAMEPLAY_ASSETS.md:1): Shadow Runner HUD, controls, SFX, enemy, and route gameplay asset wiring
- [docs/SHADOW_RUNNER_SPRITES.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_SPRITES.md:1): Shadow Runner hero/enemy sprite strips, gameplay usage, and pending sprite cleanup
- [docs/SHADOW_RUNNER_STORY_LORE.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_STORY_LORE.md:1): Shadow Runner route, campaign, and lore reference
- [docs/PRODUCTION_ROLLBACK_AND_MEDIA_FRAME_FIX_2026-06-09.md](C:/repos/chat2.0/docs/PRODUCTION_ROLLBACK_AND_MEDIA_FRAME_FIX_2026-06-09.md:1): June 9 orientation rollback notes and durable chat media-frame fix
- [docs/WEATHER_WIDGET.md](C:/repos/chat2.0/docs/WEATHER_WIDGET.md:1): General Chat weather widget, private location preferences, and validation
- [docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1): Boards-era News Feed backend, scraper lifecycle, Render setup, and troubleshooting
- [services/news-scraper/README.md](C:/repos/chat2.0/services/news-scraper/README.md:1): worker-local command and environment reference
- [docs/LINK_PREVIEWS.md](C:/repos/chat2.0/docs/LINK_PREVIEWS.md:1): server-side link preview architecture and validation
- [docs/FEEDBACK_SUBMISSIONS.md](C:/repos/chat2.0/docs/FEEDBACK_SUBMISSIONS.md:1): Settings feedback flow, Supabase storage model, and validation notes
- [docs/APP_RELEASES.md](C:/repos/chat2.0/docs/APP_RELEASES.md:1): production app-release popup behavior
- [docs/PHONE_INSTALL_ONBOARDING.md](C:/repos/chat2.0/docs/PHONE_INSTALL_ONBOARDING.md:1): phone install tutorial and notification onboarding
- [docs/SHADOW_PIN.md](C:/repos/chat2.0/docs/SHADOW_PIN.md:1): ShadowPin media, discovery, comments, notifications, permissions, and validation
- [docs/SHADO_TV.md](C:/repos/chat2.0/docs/SHADO_TV.md:1): Shado TV catalog, Bunny playback, captions, premieres, progress, and analytics
- [docs/SHADOW_MYSTERY.md](C:/repos/chat2.0/docs/SHADOW_MYSTERY.md:1): bundled/database story reader and operator publishing studio
- [docs/SUPABASE_REALTIME_AUDIT_2026-05-02.md](C:/repos/chat2.0/docs/SUPABASE_REALTIME_AUDIT_2026-05-02.md:1): table-by-table realtime publication decisions
- [docs/DEFERRED_FOLLOWUPS.md](C:/repos/chat2.0/docs/DEFERRED_FOLLOWUPS.md:1): small follow-up ideas preserved after pruning stale branches
- [docs/ESP_BRIDGE_FEATURE_ROADMAP.md](C:/repos/chat2.0/docs/ESP_BRIDGE_FEATURE_ROADMAP.md:1): planning baseline and phased roadmap for the airgapped ESP bridge feature
- [docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md](C:/repos/chat2.0/docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md:1): official platform constraints and implementation guardrails for bridge planning
- [docs/ESP_BRIDGE_AUTH_MODEL_SPEC.md](C:/repos/chat2.0/docs/ESP_BRIDGE_AUTH_MODEL_SPEC.md:1): recommended `v1` bridge session model, pairing lifecycle, revocation, and realtime auth responsibilities
- [docs/ESP_BRIDGE_SESSION_ISSUANCE_AND_PAIRING_EXCHANGE.md](C:/repos/chat2.0/docs/ESP_BRIDGE_SESSION_ISSUANCE_AND_PAIRING_EXCHANGE.md:1): exact control-plane design for session issuance, refresh, heartbeat, and revoke
- [docs/ESP_BRIDGE_BACKEND_IMPLEMENTATION_PROPOSAL.md](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_IMPLEMENTATION_PROPOSAL.md:1): concrete `v1` backend tables, service split, migration slices, and build order
- [docs/ESP_BRIDGE_PHASE0_IMPLEMENTATION_BRIEF.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_IMPLEMENTATION_BRIEF.md:1): first implementation work packet for the bridge feasibility spike
- [docs/ESP_BRIDGE_PROTOCOL_DRAFT.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PROTOCOL_DRAFT.md:1): proposed local command/event protocol between the offline PC client and the bridge
- [docs/ESP_BRIDGE_PAIRING_FLOW_SPEC.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PAIRING_FLOW_SPEC.md:1): proposed single-user bridge pairing and revocation flow
- [docs/ESP_BRIDGE_TUI_UX_SPEC.md](C:/repos/chat2.0/docs/ESP_BRIDGE_TUI_UX_SPEC.md:1): chat TUI and admin shell experience goals for `v1`
- [docs/ESP_BRIDGE_TUI_PRODUCTION_READINESS.md](C:/repos/chat2.0/docs/ESP_BRIDGE_TUI_PRODUCTION_READINESS.md:1): shipped TUI hardening, Shado bridge AI flow, data-link labels, release workflow, and rollback
- [docs/ESP_BRIDGE_BACKEND_SCHEMA_PROPOSAL.md](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_SCHEMA_PROPOSAL.md:1): backend entities and service surface likely needed for bridge support
- [docs/ESP_BRIDGE_PHASE0_SPIKE_CHECKLIST.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_SPIKE_CHECKLIST.md:1): prototype success criteria for the first bridge feasibility spike
- [docs/ESP_BRIDGE_PHASE0_PROGRESS_2026-04-23.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_PROGRESS_2026-04-23.md:1): current implementation status, proven milestones, and next hardware steps
- [docs/ESP_BRIDGE_RELEASE_RUNBOOK.md](C:/repos/chat2.0/docs/ESP_BRIDGE_RELEASE_RUNBOOK.md:1): versioning, artifact publishing, manifest, and rollback workflow for ESP bridge releases
- [firmware/esp-bridge/README.md](C:/repos/chat2.0/firmware/esp-bridge/README.md:1): ESP-IDF firmware workspace and admin-shell bring-up path for the bridge spike
- [docs/STABILITY_AND_QA_UPDATES_2026-04.md](C:/repos/chat2.0/docs/STABILITY_AND_QA_UPDATES_2026-04.md:1): stabilization work, QA improvements, and mobile resume fixes completed before the next feature phase
- [docs/LIQUID_GOLD_DARK_REWORK.md](C:/repos/chat2.0/docs/LIQUID_GOLD_DARK_REWORK.md:1): design-direction history
- [docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md](C:/repos/chat2.0/docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md:1): implemented notification architecture, settings, suppression, and remaining device QA

## Status

This repo is active product code, not a skeleton starter. Before changing behavior, read the relevant hook and lib layers, especially:

- [src/hooks/useMessages.tsx](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [src/hooks/useDirectMessages.tsx](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
- [src/hooks/useAuth.tsx](C:/repos/chat2.0/src/hooks/useAuth.tsx:1)
- [src/lib/supabase.ts](C:/repos/chat2.0/src/lib/supabase.ts:1)
- [src/lib/push.ts](C:/repos/chat2.0/src/lib/push.ts:1)

That is where most of the realtime, session, push, and chat behavior is coordinated.
