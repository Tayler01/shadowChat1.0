# Project Documentation Rundown - 2026-06-01

This rundown captures the current documentation and agent-file surface in `C:\repos\chat2.0`. It is meant to help future updates start from the right source of truth instead of rediscovering stale or overlapping docs.

## Documentation Status - June 12, 2026

This rundown was updated after the June 11 Shadow Runner campaign-map, Level 3, generated gameplay asset, audio, mobile control, orientation, and access-gate removal work, plus the latest Shadow Mystery story expansion. The file remains an inventory and routing guide; the source documents themselves now carry current status notes or current implementation guidance.

## Summary

- The repo has a strong documentation base, but it has grown by feature area rather than through a single current index.
- [AGENTS.md](C:/repos/chat2.0/AGENTS.md:1) is the canonical agent guide. [AGENT.md](C:/repos/chat2.0/AGENT.md:1) is a short compatibility mirror.
- Before this refresh, several current product docs had last been updated in May 2026, especially Admin, App Releases, Deployment, Phone Install, ShadowPin, mobile, and iOS planning.
- Several bridge docs are still useful but date from April 2026 planning. They now carry bridge-specific status notes and should be checked against current firmware/functions before implementation.
- `README.md` and `docs/ARCHITECTURE.md` have been refreshed for the June 1 audit state, the chat-scroll fix, the June 2 auth rollout, the June 8 Hype/safe-fetch/automation queue updates, and the June 11/12 Shadow Runner/Shadow Mystery updates.
- `PLAN.md`, `STATUS.md`, and `TASK.md` are now labeled as bridge-specific status artifacts, not global project status.
- `.agents/` contains local ignored agent skills. They are not tracked or pushed by default because `.gitignore` ignores `.agents/`.

## Recommended Documentation Cleanup

1. Keep [AGENTS.md](C:/repos/chat2.0/AGENTS.md:1) canonical and update it after major workflow changes.
2. Keep [AGENT.md](C:/repos/chat2.0/AGENT.md:1) as a thin compatibility pointer, not a second full handbook.
3. Use [README.md](C:/repos/chat2.0/README.md:1) as the human entrypoint and keep its documentation map current.
4. Use [docs/ARCHITECTURE.md](C:/repos/chat2.0/docs/ARCHITECTURE.md:1) as the technical map and refresh it after planned security and shared architecture changes.
5. Use [docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1) as the current audit backlog until the findings are resolved or moved into implementation tickets.
6. Decide whether local `.agents/` skills should remain machine-local. If any are project-critical, promote sanitized versions into tracked docs or a tracked `docs/agents/` folder instead of force-adding ignored files.
7. Add a quarterly docs review checklist after the auth/security/chat-scroll work lands.

## Agent-Facing Files

| File | Latest tracked update/status date | Role | Refresh guidance |
| --- | --- | --- | --- |
| [AGENTS.md](C:/repos/chat2.0/AGENTS.md:1) | 2026-05-19 | Canonical repo handbook for agents. | Refresh after security, Netlify headers, or Supabase policy workflow changes. |
| [AGENT.md](C:/repos/chat2.0/AGENT.md:1) | 2026-05-02 | Compatibility guide for tools that look for singular `AGENT.md`. | Keep short. Link to `AGENTS.md`; do not duplicate the full handbook. |
| [.agents/](C:/repos/chat2.0/.agents) | ignored local files | Local Codex/agent skill installs. | Not tracked. Documented below for awareness only. Do not push unless the repo intentionally changes `.gitignore` policy. |

## Top-Level Project Docs

| File | Latest tracked update/status date | Role | Refresh guidance |
| --- | --- | --- | --- |
| [README.md](C:/repos/chat2.0/README.md:1) | 2026-06-12 | Human entrypoint, stack, feature list, commands, deployment, documentation map. | Refresh after security, deployment, or major feature work; keep docs map current. |
| [PLAN.md](C:/repos/chat2.0/PLAN.md:1) | 2026-05-02 | ESP bridge update/offline software plan. | Rename or add a top warning that it is bridge-specific, not global product plan. |
| [STATUS.md](C:/repos/chat2.0/STATUS.md:1) | 2026-05-02 | ESP bridge milestone status log. | Archive under `docs/` or rename to bridge-specific status to avoid stale root-level status confusion. |
| [TASK.md](C:/repos/chat2.0/TASK.md:1) | 2026-04-25 | ESP bridge task statement. | Archive or rename with bridge prefix if still needed. |
| [apps/mobile/README.md](C:/repos/chat2.0/apps/mobile/README.md:1) | 2026-05-28 | Mobile app workspace note. | Review when native mobile work resumes. |
| [firmware/esp-bridge/README.md](C:/repos/chat2.0/firmware/esp-bridge/README.md:1) | 2026-04-28 | ESP-IDF firmware workspace instructions. | Refresh before firmware changes; current status may lag later bridge releases. |
| [services/news-scraper/README.md](C:/repos/chat2.0/services/news-scraper/README.md:1) | 2026-04-30 | Render News scraper commands and environment. | Refresh alongside any scraper or Render deploy changes. |

## Core Setup, Testing, Deployment, And Architecture

| File | Latest tracked update/status date | Role | Refresh guidance |
| --- | --- | --- | --- |
| [docs/ARCHITECTURE.md](C:/repos/chat2.0/docs/ARCHITECTURE.md:1) | 2026-06-12 | System map and data-flow overview. | Update after Edge Function hardening, safe-fetch helpers, lib module splits, new backend domains, or major Entertainment/game runtime changes. |
| [docs/SETUP_GUIDE.md](C:/repos/chat2.0/docs/SETUP_GUIDE.md:1) | 2026-06-01 | Local and hosted setup. | Update for any new auth config, stable smoke accounts, or new secrets. |
| [docs/TESTING_GUIDE.md](C:/repos/chat2.0/docs/TESTING_GUIDE.md:1) | 2026-06-12 | Unit, smoke, and browser testing workflow. | Keep auth, chat-scroll, safe-fetch, Hype, media-frame, composer, and game visual coverage expectations current. |
| [docs/DEPLOYMENT_GUIDE.md](C:/repos/chat2.0/docs/DEPLOYMENT_GUIDE.md:1) | 2026-05-29 | GitHub, Netlify, Supabase deployment. | Update after Netlify headers, Node version alignment, or Auth config changes. |
| [docs/GOAL_PLAYBOOKS.md](C:/repos/chat2.0/docs/GOAL_PLAYBOOKS.md:1) | 2026-05-14 | Goal-mode playbooks. | Add audit-backlog playbook if this becomes a repeated workflow. |
| [docs/DEFERRED_FOLLOWUPS.md](C:/repos/chat2.0/docs/DEFERRED_FOLLOWUPS.md:1) | 2026-06-01 | Small deferred ideas. | Keep small only; larger audit items now live in the dedicated audit next-steps doc. |
| [docs/PRODUCTION_SMOKE_TESTING.md](C:/repos/chat2.0/docs/PRODUCTION_SMOKE_TESTING.md:1) | 2026-05-19 | Production smoke strategy. | Keep stable email-confirmed smoke-account setup current. |

## Current Product And Feature Docs

| File | Latest tracked update/status date | Role | Refresh guidance |
| --- | --- | --- | --- |
| [docs/ADMIN_ACCESS.md](C:/repos/chat2.0/docs/ADMIN_ACCESS.md:1) | 2026-06-08 | Admin/sub-admin behavior and admin review surfaces including Automation Approvals. | Refresh if `users.admin_role` becomes display-only and server authz moves fully to `user_roles`, or if the automation approval queue starts runner actions instead of recording review intent only. |
| [docs/APP_RELEASES.md](C:/repos/chat2.0/docs/APP_RELEASES.md:1) | 2026-05-29 | App release popup behavior. | Current enough unless release UX changes. |
| [docs/ART_BOARD.md](C:/repos/chat2.0/docs/ART_BOARD.md:1) | 2026-06-08 | Art Board domain. | Update after `art-board-import-image` redeploy/smoke or future import/media behavior changes. |
| [docs/CHANNEL_BANS.md](C:/repos/chat2.0/docs/CHANNEL_BANS.md:1) | 2026-05-03 | Channel-ban moderation. | Update when bridge group send and AI post-to-chat enforce ban checks. |
| [docs/FEEDBACK_SUBMISSIONS.md](C:/repos/chat2.0/docs/FEEDBACK_SUBMISSIONS.md:1) | 2026-05-07 | Feedback flow and storage. | Review after storage policy hardening. |
| [docs/LINK_PREVIEWS.md](C:/repos/chat2.0/docs/LINK_PREVIEWS.md:1) | 2026-06-08 | Link preview architecture. | Keep current with provider-specific fallback behavior and safe-fetch deployment status. |
| [docs/NEWS_TAB_AND_SCRAPER.md](C:/repos/chat2.0/docs/NEWS_TAB_AND_SCRAPER.md:1) | 2026-05-03 | News Feed and Render scraper runbook. | Update after live Render settings verification or scraper changes. |
| [docs/NATIVE_IOS_APP_PLAN.md](C:/repos/chat2.0/docs/NATIVE_IOS_APP_PLAN.md:1) | 2026-05-28 | Native iOS planning. | Current enough until native work resumes. |
| [docs/PHONE_INSTALL_ONBOARDING.md](C:/repos/chat2.0/docs/PHONE_INSTALL_ONBOARDING.md:1) | 2026-06-01 | Phone install onboarding. | Current after auth/login redesign. |
| [docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md](C:/repos/chat2.0/docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md:1) | 2026-04-23 | Push planning notes. | Refresh against current implementation before more push work. |
| [docs/SESSION_PERSISTENCE_RUNBOOK.md](C:/repos/chat2.0/docs/SESSION_PERSISTENCE_RUNBOOK.md:1) | 2026-05-02 | Session/mobile resume runbook. | Current for session persistence; refresh after future auth-session changes. |
| [docs/WEATHER_WIDGET.md](C:/repos/chat2.0/docs/WEATHER_WIDGET.md:1) | 2026-05-17 | Weather widget and private preferences. | Current; privacy pattern is a good model for profile data separation. |

## Entertainment, Games, And Media Docs

| File | Latest tracked update/status date | Role | Refresh guidance |
| --- | --- | --- | --- |
| [docs/LIQUID_GOLD_DARK_REWORK.md](C:/repos/chat2.0/docs/LIQUID_GOLD_DARK_REWORK.md:1) | 2026-04-20 | Design-direction history. | Historical. Keep unless design system changes again. |
| [docs/MOBILE_PERFORMANCE_OPTIMIZATION_PLAN.md](C:/repos/chat2.0/docs/MOBILE_PERFORMANCE_OPTIMIZATION_PLAN.md:1) | 2026-05-17 | Mobile performance backlog. | Merge relevant fixed-background and scroll smoothness items from the audit if implementation starts. |
| [docs/PRODUCTION_ROLLBACK_AND_MEDIA_FRAME_FIX_2026-06-09.md](C:/repos/chat2.0/docs/PRODUCTION_ROLLBACK_AND_MEDIA_FRAME_FIX_2026-06-09.md:1) | 2026-06-09 | June 9 rollback notes for Shadow Runner orientation/fullscreen changes and the durable chat media-frame fix. | Keep as incident/release context; update only if another production rollback changes the same area. |
| [docs/SHADO_TV.md](C:/repos/chat2.0/docs/SHADO_TV.md:1) | 2026-05-17 | Shado TV feature docs. | Update after any Bunny/media security changes. |
| [docs/SHADO_TV_CRIMP_SHRIMP_LAUNCH_PLAN.md](C:/repos/chat2.0/docs/SHADO_TV_CRIMP_SHRIMP_LAUNCH_PLAN.md:1) | 2026-05-20 | Launch plan. | Historical or campaign-specific. Mark status if campaign is over. |
| [docs/SHADO_TV_STREAMING_RESEARCH.md](C:/repos/chat2.0/docs/SHADO_TV_STREAMING_RESEARCH.md:1) | 2026-05-17 | Streaming research. | Keep as research; verify provider details before implementation. |
| [docs/SHADOW_CHECKERS.md](C:/repos/chat2.0/docs/SHADOW_CHECKERS.md:1) | 2026-05-17 | Shadow Checkers feature docs. | Current enough unless game work resumes. |
| [docs/SHADOW_MYSTERY.md](C:/repos/chat2.0/docs/SHADOW_MYSTERY.md:1) | 2026-06-11 | Shadow Mystery feature docs and hardcoded story expansion status. | Update when stories, source attribution, artwork, or the future admin publishing model changes. |
| [docs/SHADOW_RUNNER_ASSET_GENERATION_BACKLOG.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_ASSET_GENERATION_BACKLOG.md:1) | 2026-06-12 | Shadow Runner generated asset backlog and production notes. | Update after each reviewed generation batch or when generated assets move into runtime. |
| [docs/SHADOW_RUNNER_GAMEPLAY_ASSETS.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_GAMEPLAY_ASSETS.md:1) | 2026-06-12 | Shadow Runner HUD, controls, SFX, enemy, route, and gameplay asset wiring. | Update after gameplay HUD/control/audio assets or Phaser runtime asset wiring changes. |
| [docs/SHADOW_RUNNER_HOME_ASSETS.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_HOME_ASSETS.md:1) | 2026-06-12 | Shadow Runner title/menu/campaign-map assets, runtime wiring, rotate-gate constraints, picker landscape request, and latest visual verification. | Update after title/menu/campaign-map asset changes, playable-prototype shell changes, or mobile visual QA. |
| [docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md:1) | 2026-06-12 | Active Shadow Runner playable-prototype roadmap and checkpoint notes. | Keep concise; update after playable-route, control, difficulty, or verification milestones. |
| [docs/SHADOW_RUNNER_SPRITES.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_SPRITES.md:1) | 2026-06-11 | Shadow Runner hero and enemy sprite strips plus current runtime usage. | Update after sprite pipeline changes, animation cleanup, or Phaser animation wiring changes. |
| [docs/SHADOW_RUNNER_STORY_LORE.md](C:/repos/chat2.0/docs/SHADOW_RUNNER_STORY_LORE.md:1) | 2026-06-11 | Shadow Runner story/lore reference for route and enemy naming. | Update when campaign story, route names, or enemy concepts change. |
| [docs/SHADOW_PIN.md](C:/repos/chat2.0/docs/SHADOW_PIN.md:1) | 2026-06-08 | ShadowPin feature docs. | Update after image-import function redeploy, video-provider fallback changes, or activity analytics changes. |
| [docs/SHADOW_PIN_ACTIVITY_ANALYTICS_PLAN.md](C:/repos/chat2.0/docs/SHADOW_PIN_ACTIVITY_ANALYTICS_PLAN.md:1) | 2026-05-28 | ShadowPin analytics plan. | Review alongside RLS/no-policy advisor warnings for activity tables. |
| [docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md](C:/repos/chat2.0/docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md:1) | 2026-05-29 | ShadowPin video roadmap. | Current. Recheck Bunny/provider assumptions before changes. |
| [docs/SHADOW_WAR.md](C:/repos/chat2.0/docs/SHADOW_WAR.md:1) | 2026-05-17 | Shadow War feature docs. | Current enough unless game work resumes. |
| [docs/SHADOW_WAR_COMPLETION_AUDIT.md](C:/repos/chat2.0/docs/SHADOW_WAR_COMPLETION_AUDIT.md:1) | 2026-05-11 | Shadow War audit. | Historical. Keep as completion evidence. |
| [docs/THEME_REBUILD_GOAL_PLAN.md](C:/repos/chat2.0/docs/THEME_REBUILD_GOAL_PLAN.md:1) | 2026-05-11 | Theme rebuild plan. | Historical/planning. Refresh only if theme work resumes. |

## Feature Progress And QA Docs

| File | Latest tracked update/status date | Role | Refresh guidance |
| --- | --- | --- | --- |
| [docs/features/feature-progress-log.md](C:/repos/chat2.0/docs/features/feature-progress-log.md:1) | 2026-06-12 | Feature progress log. | Keep active Shadow Runner checkpoints concise and tied to verification; add a note when audit backlog implementation starts. |
| [docs/features/refetch-optimization-backlog.md](C:/repos/chat2.0/docs/features/refetch-optimization-backlog.md:1) | 2026-05-18 | Refetch optimization backlog. | Merge with architecture/performance backlog when optimizing realtime/refetch flows. |
| [docs/qa/mobile-pwa-qa-log.md](C:/repos/chat2.0/docs/qa/mobile-pwa-qa-log.md:1) | 2026-05-17 | Mobile PWA QA log. | Add phone QA after login/chat fixes. |
| [docs/qa/mobile-viewport-audit.md](C:/repos/chat2.0/docs/qa/mobile-viewport-audit.md:1) | 2026-05-18 | Mobile viewport audit. | Update after mobile header/nav/login polish. |
| [docs/qa/real-device-mobile-validation.md](C:/repos/chat2.0/docs/qa/real-device-mobile-validation.md:1) | 2026-05-14 | Real device validation checklist. | Update after auth and PWA login changes. |
| [docs/qa/shado-tv-asset-log.md](C:/repos/chat2.0/docs/qa/shado-tv-asset-log.md:1) | 2026-05-17 | Shado TV asset QA log. | Feature-specific; current enough. |
| [docs/qa/shadow-mystery-asset-log.md](C:/repos/chat2.0/docs/qa/shadow-mystery-asset-log.md:1) | 2026-06-11 | Shadow Mystery asset QA log. | Update after each new story artwork/source batch. |
| [docs/qa/theme-asset-log.md](C:/repos/chat2.0/docs/qa/theme-asset-log.md:1) | 2026-05-11 | Theme asset log. | Historical unless theme assets change. |
| [docs/qa/theme-rebuild-qa-log.md](C:/repos/chat2.0/docs/qa/theme-rebuild-qa-log.md:1) | 2026-05-11 | Theme rebuild QA log. | Historical unless theme QA resumes. |
| [docs/STABILITY_AND_QA_UPDATES_2026-04.md](C:/repos/chat2.0/docs/STABILITY_AND_QA_UPDATES_2026-04.md:1) | 2026-04-29 | April stabilization record. | Historical. Keep as release context. |
| [docs/SUPABASE_REALTIME_AUDIT_2026-05-02.md](C:/repos/chat2.0/docs/SUPABASE_REALTIME_AUDIT_2026-05-02.md:1) | 2026-05-03 | Supabase realtime publication audit. | Refresh if realtime publication or read cursor behavior changes. |

## ESP Bridge Documentation

| File | Latest tracked update/status date | Role | Refresh guidance |
| --- | --- | --- | --- |
| [docs/ESP_BRIDGE_AUTH_MODEL_SPEC.md](C:/repos/chat2.0/docs/ESP_BRIDGE_AUTH_MODEL_SPEC.md:1) | 2026-04-23 | Bridge auth model. | Refresh before bridge security work. |
| [docs/ESP_BRIDGE_BACKEND_IMPLEMENTATION_PROPOSAL.md](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_IMPLEMENTATION_PROPOSAL.md:1) | 2026-04-23 | Bridge backend proposal. | Mark which parts are implemented vs planned. |
| [docs/ESP_BRIDGE_BACKEND_SCHEMA_PROPOSAL.md](C:/repos/chat2.0/docs/ESP_BRIDGE_BACKEND_SCHEMA_PROPOSAL.md:1) | 2026-04-23 | Bridge schema proposal. | Compare against current migrations before using. |
| [docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md](C:/repos/chat2.0/docs/ESP_BRIDGE_DOCUMENTATION_REVIEW.md:1) | 2026-04-23 | Platform documentation review. | Re-check external provider docs before new implementation. |
| [docs/ESP_BRIDGE_FEATURE_ROADMAP.md](C:/repos/chat2.0/docs/ESP_BRIDGE_FEATURE_ROADMAP.md:1) | 2026-04-23 | Bridge feature roadmap. | Refresh with shipped OTA/TUI work and current security findings. |
| [docs/ESP_BRIDGE_OTA_AND_OFFLINE_SOFTWARE_PLAN.md](C:/repos/chat2.0/docs/ESP_BRIDGE_OTA_AND_OFFLINE_SOFTWARE_PLAN.md:1) | 2026-04-26 | OTA and offline bundle plan. | Refresh against latest release status before more OTA work. |
| [docs/ESP_BRIDGE_PAIRING_FLOW_SPEC.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PAIRING_FLOW_SPEC.md:1) | 2026-04-23 | Pairing flow. | Update after bootstrap spoofing/rate-limit review. |
| [docs/ESP_BRIDGE_PHASE0_IMPLEMENTATION_BRIEF.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_IMPLEMENTATION_BRIEF.md:1) | 2026-04-23 | Phase 0 implementation brief. | Historical. Mark complete or superseded. |
| [docs/ESP_BRIDGE_PHASE0_PROGRESS_2026-04-23.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_PROGRESS_2026-04-23.md:1) | 2026-04-27 | Phase 0 progress. | Historical. Confirm whether status still matters. |
| [docs/ESP_BRIDGE_PHASE0_SPIKE_CHECKLIST.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PHASE0_SPIKE_CHECKLIST.md:1) | 2026-04-26 | Phase 0 checklist. | Historical if Phase 0 is done. |
| [docs/ESP_BRIDGE_PROTOCOL_DRAFT.md](C:/repos/chat2.0/docs/ESP_BRIDGE_PROTOCOL_DRAFT.md:1) | 2026-04-26 | Local protocol draft. | Compare to current firmware/TUI before edits. |
| [docs/ESP_BRIDGE_RELEASE_RUNBOOK.md](C:/repos/chat2.0/docs/ESP_BRIDGE_RELEASE_RUNBOOK.md:1) | 2026-04-28 | Bridge release runbook. | Refresh after next firmware or bundle release. |
| [docs/ESP_BRIDGE_SESSION_ISSUANCE_AND_PAIRING_EXCHANGE.md](C:/repos/chat2.0/docs/ESP_BRIDGE_SESSION_ISSUANCE_AND_PAIRING_EXCHANGE.md:1) | 2026-04-23 | Session issuance design. | Update after bridge bootstrap/session security hardening. |
| [docs/ESP_BRIDGE_TUI_PRODUCTION_READINESS.md](C:/repos/chat2.0/docs/ESP_BRIDGE_TUI_PRODUCTION_READINESS.md:1) | 2026-04-28 | TUI production readiness. | Refresh with current `STATUS.md` details or move status into this doc. |
| [docs/ESP_BRIDGE_TUI_UX_SPEC.md](C:/repos/chat2.0/docs/ESP_BRIDGE_TUI_UX_SPEC.md:1) | 2026-04-27 | TUI UX spec. | Refresh before TUI UX changes. |

## Ignored Local Agent Skill Inventory

These files exist under `.agents/`, but `.gitignore` excludes that directory. They are listed here because they affect local agent behavior on this workstation but will not be pushed unless the ignore policy changes.

| Local file | Role |
| --- | --- |
| `.agents/skills/higgsfield-generate/SKILL.md` | Higgsfield generation skill. |
| `.agents/skills/higgsfield-generate/references/marketing-ad-references.md` | Marketing ad references. |
| `.agents/skills/higgsfield-generate/references/marketing-avatars.md` | Marketing avatars. |
| `.agents/skills/higgsfield-generate/references/marketing-brand-kits.md` | Marketing brand kits. |
| `.agents/skills/higgsfield-generate/references/marketing-dtc-ads.md` | DTC ads engine. |
| `.agents/skills/higgsfield-generate/references/marketing-modes.md` | Marketing modes. |
| `.agents/skills/higgsfield-generate/references/marketing-products.md` | Products reference. |
| `.agents/skills/higgsfield-generate/references/marketing-setup-items.md` | Marketing hooks and setup items. |
| `.agents/skills/higgsfield-generate/references/media-inputs.md` | Media input guidance. |
| `.agents/skills/higgsfield-generate/references/model-catalog.md` | Model catalog. |
| `.agents/skills/higgsfield-generate/references/prompt-engineering.md` | Prompt engineering. |
| `.agents/skills/higgsfield-generate/references/troubleshooting.md` | Troubleshooting. |
| `.agents/skills/higgsfield-marketplace-cards/SKILL.md` | Marketplace card generation skill. |
| `.agents/skills/higgsfield-product-photoshoot/SKILL.md` | Product photoshoot skill. |
| `.agents/skills/higgsfield-soul-id/SKILL.md` | Soul Character training skill. |
| `.agents/skills/higgsfield-soul-id/references/photo-guide.md` | Soul photo guide. |
| `.agents/skills/higgsfield-soul-id/references/troubleshooting.md` | Soul troubleshooting. |
| `.agents/skills/shado-short-film-production/SKILL.md` | Shado short film production workflow. |
| `.agents/skills/shado-short-film-production/agents/openai.yaml` | Local OpenAI agent config for the short-film workflow. |
| `.agents/skills/shado-short-film-production/references/higgsfield-runbook.md` | Higgsfield short-film runbook. |
| `.agents/skills/shado-short-film-production/references/ledger-template.md` | Production ledger template. |
| `.agents/skills/shado-short-film-production/references/production-bible-template.md` | Production bible template. |
| `.agents/skills/shado-short-film-production/references/shot-list-template.md` | Shot list template. |
| `.agents/skills/shado-short-film-production/references/tutorial-notes.md` | Tutorial notes. |

## Refresh Order

1. Keep the new audit next-steps doc current as work begins.
2. Update security docs after the next Supabase hardening pass lands.
3. Update deployment docs after Netlify headers and live settings are verified.
4. Update `ARCHITECTURE.md` after shared realtime/send/scroll helpers or Supabase module splits land.
5. Decide whether root-level bridge status files should be archived or renamed.
6. Decide whether any `.agents` content should become tracked project documentation.
