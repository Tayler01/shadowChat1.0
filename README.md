# ShadowChat 1.0

ShadowChat 1.0 is a premium dark realtime chat app built with React, TypeScript, Vite, and Supabase. It combines a public group chat, private direct messages, a realtime Boards surface, admin tools, profile customization, AI-assisted chat utilities, browser push notifications, and a per-user weather widget behind a polished black-and-gold interface.

The project is already wired for hosted Supabase and Netlify deployment. It is designed to behave like a product app, not a demo: realtime messaging, uploads, presence, settings, DMs, and notification flows are all first-class parts of the codebase.

## Documentation Status - June 1, 2026

The documentation set has been refreshed against the current `main` branch after the full codebase audit. The freshest planning source is [docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1), and the full documentation inventory is [docs/PROJECT_DOCUMENTATION_RUNDOWN_2026-06-01.md](C:/repos/chat2.0/docs/PROJECT_DOCUMENTATION_RUNDOWN_2026-06-01.md:1).

Current known follow-up areas are documentation-backed but not yet implemented: invite-only signup, email-verification UX, General Chat read-position stabilization, Supabase policy/RPC hardening, URL fetch/SSRF hardening, Netlify security headers, and deployment/provider live-setting verification.

## Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- Supabase Auth, Postgres, Realtime, Storage, and Edge Functions
- Netlify for static hosting
- Render worker service for the always-on News scraper
- Playwright browser automation for News ingestion and QA
- Jest + Testing Library for unit and hook coverage
- Playwright for headed browser debugging and smoke validation

## What The App Includes

- Realtime group chat with active-user count and per-user weather in the header
- Realtime direct messages
- Unread tracking and in-app DM notifications
- User profiles with adjustable avatar crop/zoom, banner, status, role badges, presence visibility, theme color, and admin moderation controls
- File, image, and voice-message uploads
- Message reactions, pinning, editing, and deletion
- Slash commands and reply/thread affordances
- AI reply and summary hooks through a secured Supabase Edge Function
- Boards tab with a low-friction draggable board map, feed pills, chat circles, static board squares, collision sparkle/sound feedback, the existing News Feed, News Chat, Investing Chat, Learning Chat, Crypto Chat, and a shared Art Board mood canvas
- App-wide admin/sub-admin access controls with role badges and operator-only tools
- Operator-managed bans for General Chat, individual chat boards, and all app interaction
- Server-confirmed operator message deletion for normal-user General Chat and board-chat messages
- Admin-managed X/Truth Social source tracking from Settings
- Admin feedback review for submitted bugs, suggestions, and private attachments
- Server-side link previews for chat, DMs, and board chat URLs
- Browser push notifications for DMs and group chat
- Settings feedback flow for bug reports and feature ideas with private image attachments
- Per-user Open-Meteo weather location preference and forecast popup
- PWA/service-worker foundation for installed mobile and desktop web experiences
- Phone install onboarding and app-release popups for production release communication
- Simple app-reopen loading state with consistent `Loading Shado...` copy
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
- [`src/components/chat/WeatherWidget.tsx`](C:/repos/chat2.0/src/components/chat/WeatherWidget.tsx:1) contains the General Chat weather pill and forecast popup.
- [`src/components/settings/WeatherLocationSettings.tsx`](C:/repos/chat2.0/src/components/settings/WeatherLocationSettings.tsx:1) contains the per-user weather location picker.
- [`src/hooks/useBoardChat.tsx`](C:/repos/chat2.0/src/hooks/useBoardChat.tsx), [`src/hooks/useBoardBadges.ts`](C:/repos/chat2.0/src/hooks/useBoardBadges.ts), [`src/hooks/useNewsFeed.tsx`](C:/repos/chat2.0/src/hooks/useNewsFeed.tsx), and [`src/hooks/useNewsAdmin.ts`](C:/repos/chat2.0/src/hooks/useNewsAdmin.ts) own the Boards and News client behavior.
- [`src/hooks/useAdminAccess.ts`](C:/repos/chat2.0/src/hooks/useAdminAccess.ts:1) owns admin/sub-admin access state.
- [`src/hooks/useWeatherPreference.ts`](C:/repos/chat2.0/src/hooks/useWeatherPreference.ts:1), [`src/hooks/useWeatherForecast.ts`](C:/repos/chat2.0/src/hooks/useWeatherForecast.ts:1), and [`src/lib/weather.ts`](C:/repos/chat2.0/src/lib/weather.ts:1) own weather preference and forecast behavior.

Backend lives under [`supabase`](C:/repos/chat2.0/supabase).

- [`supabase/migrations`](C:/repos/chat2.0/supabase/migrations) is the source of truth for schema and policies.
- [`supabase/functions/openai-chat`](C:/repos/chat2.0/supabase/functions/openai-chat/index.ts) handles authenticated AI requests.
- [`supabase/functions/send-push`](C:/repos/chat2.0/supabase/functions/send-push/index.ts) sends web push notifications.
- [`supabase/functions/link-preview`](C:/repos/chat2.0/supabase/functions/link-preview/index.ts) fetches server-side metadata for chat, DM, and board-chat link cards.
- News data lives in isolated `news_*` tables and RPCs from [`supabase/migrations/20260430041621_news_tab_foundation.sql`](C:/repos/chat2.0/supabase/migrations/20260430041621_news_tab_foundation.sql:1).
- Boards use `public.board_catalog`, `public.board_chat_messages`, `public.board_chat_reactions`, and per-board `user_read_cursors`.
- Art Board uses `public.art_board_items`, `public.art_board_links`, `public.art_board_reactions`, the public `art-board` Storage bucket, and the `art-board-import-image` Edge Function.
- Feedback submissions use `public.feedback_submissions` plus the private `feedback-attachments` Storage bucket.
- Admin roles use `public.user_roles`, `public.admin_role_audit`, `public.admin_role_notifications`, and the synced public `users.admin_role` badge field.
- Channel bans use `public.user_channel_bans` plus RLS/RPC enforcement for General Chat, individual board chats, and all interaction.
- Weather locations use private `public.user_weather_preferences` rows scoped by RLS to the owning user.

Always-on background services live under [`services`](C:/repos/chat2.0/services).

- [`services/news-scraper`](C:/repos/chat2.0/services/news-scraper) is a Render Docker worker that polls admin-enabled X and Truth Social sources and writes normalized snapshots to Supabase with service-role credentials.
- [`render.yaml`](C:/repos/chat2.0/render.yaml:1) defines the `shado-news-scraper` worker service and its required secrets.

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
- Browser push depends on the service worker, VAPID keys, the `send-push` edge function, and at least one active subscription row.
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

- The News scraper does not use the paid X API. It uses browser extraction, optional read-only X credentials, and per-source browser isolation.
- The feed board stores only current Eastern-day posts. Source cursors persist across the daily board clear so older posts do not reappear.
- Truth Social may block hosted worker IPs even when credentials are configured. If `news_sources.health_status` stays `blocked`, move the browser session to PinchTab or another trusted browser/IP path instead of exposing credentials to the client.
- Start every scraper change with `npm run news:scrape:proof`, then run a real one-cycle check with `node services/news-scraper/src/index.mjs --once` using service-role credentials.

Full runbook: [docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1).

## Testing And Debugging

The minimum quality gates for normal code changes are:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

For deeper testing guidance, including headed Playwright debugging, use [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1).

## Deployment

Production is hosted on Netlify, the backend is hosted on Supabase, and the News scraper runs as a Render worker. Pushing to `main` triggers the GitHub Actions Netlify production deploy workflow.

- Netlify config: [netlify.toml](C:/repos/chat2.0/netlify.toml:1)
- Netlify workflow: [.github/workflows/netlify-production.yml](C:/repos/chat2.0/.github/workflows/netlify-production.yml:1)
- Render worker config: [render.yaml](C:/repos/chat2.0/render.yaml:1)
- Deployment guide: [docs/DEPLOYMENT_GUIDE.md](C:/repos/chat2.0/docs/DEPLOYMENT_GUIDE.md:1)

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
- [docs/ART_BOARD.md](C:/repos/chat2.0/docs/ART_BOARD.md:1): shared Art Board canvas, schema, storage, moderation, and validation
- [docs/WEATHER_WIDGET.md](C:/repos/chat2.0/docs/WEATHER_WIDGET.md:1): General Chat weather widget, private location preferences, and validation
- [docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1): Boards-era News Feed backend, scraper lifecycle, Render setup, and troubleshooting
- [services/news-scraper/README.md](C:/repos/chat2.0/services/news-scraper/README.md:1): worker-local command and environment reference
- [docs/LINK_PREVIEWS.md](C:/repos/chat2.0/docs/LINK_PREVIEWS.md:1): server-side link preview architecture and validation
- [docs/FEEDBACK_SUBMISSIONS.md](C:/repos/chat2.0/docs/FEEDBACK_SUBMISSIONS.md:1): Settings feedback flow, Supabase storage model, and validation notes
- [docs/APP_RELEASES.md](C:/repos/chat2.0/docs/APP_RELEASES.md:1): production app-release popup behavior
- [docs/PHONE_INSTALL_ONBOARDING.md](C:/repos/chat2.0/docs/PHONE_INSTALL_ONBOARDING.md:1): phone install tutorial and notification onboarding
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
- [docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md](C:/repos/chat2.0/docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md:1): notification planning notes

## Status

This repo is active product code, not a skeleton starter. Before changing behavior, read the relevant hook and lib layers, especially:

- [src/hooks/useMessages.tsx](C:/repos/chat2.0/src/hooks/useMessages.tsx:1)
- [src/hooks/useDirectMessages.tsx](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1)
- [src/hooks/useAuth.tsx](C:/repos/chat2.0/src/hooks/useAuth.tsx:1)
- [src/lib/supabase.ts](C:/repos/chat2.0/src/lib/supabase.ts:1)
- [src/lib/push.ts](C:/repos/chat2.0/src/lib/push.ts:1)

That is where most of the realtime, session, push, and chat behavior is coordinated.
