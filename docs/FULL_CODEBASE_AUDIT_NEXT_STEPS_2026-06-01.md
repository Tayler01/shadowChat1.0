# Full Codebase Audit Next Steps - 2026-06-01

This document turns the June 1, 2026 read-only audit into an implementation backlog and records status updates as fixes land.

## Documentation Status - June 1, 2026

This is the current source of truth for the audit backlog. Update this document when an audit item is implemented, intentionally deferred, or replaced by a narrower feature ticket.

## July 9, 2026 Alignment And Cleanup Program

The July 9 full audit revalidated this backlog against local code, linked
Supabase, Netlify, Render, GitHub, browser QA, and the production build. Work is
being completed as separable checkpoints on
`codex/shadowchat-alignment-20260709`; production rollout is authorized for a
direct, quality-gated update to `main` and will be recorded here after live proof.

### Product decisions now in force

- **Boards, News, and Art Board are paused.** Their source, migrations, rows,
  Storage objects, and tests stay intact. The default build omits their nav,
  routes, providers, realtime subscriptions, and chunks.
- **ESP Bridge is on hold.** Firmware, TUI, migrations, functions, and planning
  history stay intact. The default build omits pairing/admin UI; server-side
  session revocation and endpoint hold are implemented locally and await the
  production release gate.
- **Render News must remain suspended with automatic deploys off.** Do not
  restore a paid worker until the News product is explicitly reapproved.
- Canonical status and re-enable instructions live in
  [PAUSED_FEATURES.md](C:/repos/chat2.0/docs/PAUSED_FEATURES.md:1).

### Ranked implementation list

### July 9 implementation checkpoint (production pending)

- All eight P0 alignment items below are implemented in the release branch:
  canonical authority, profile writes, static notification sounds, SECURITY
  DEFINER ACLs/search paths, Storage constraints, the ESP data/Auth/function
  hold, and backend-first deployment parity.
- Default and explicit re-enable builds pass. The paused default emits no
  Boards/News/Art/ESP UI chunks or realtime subscriptions; four phone profiles
  passed 84 pause assertions with verified cleanup.
- CI now requires zero-warning lint, TypeScript, Node contracts, documentation
  integrity, build budgets, all Jest suites, zero-vulnerability audits, Expo
  lint/typecheck/Doctor, and a clean local Supabase reset/lint/advisor pass.
  Production calls this reusable Quality workflow and cannot deploy unless all
  jobs plus gitleaks, Trivy, and CodeQL pass.
- The catch-all `vendor-ui` chunk is removed, deterministic eager/lazy/deploy
  budgets are enforced, and privacy-scrubbed opt-in telemetry plus CodeQL,
  gitleaks, Trivy, Dependabot, staging parity, and uptime monitoring are present.
- Netlify Git builds are stopped so only the backend-first GitHub Actions release
  can publish production. News freshness monitoring is explicitly disabled while
  the Render worker is suspended; app uptime monitoring remains active.
- Safe same-major dependency updates and lockfiles are current with zero known
  vulnerabilities. Remaining install-time deprecation notices come from Expo 54,
  Jest 29/jsdom, and Remotion transitive packages; removing them requires
  dedicated framework/test-runner migrations rather than unsafe overrides.

#### P0 - Production alignment and authority

1. **DB-001 - Apply the pending canonical-authority migration.** Validate and
   deploy `20260620121500_admin_authority_source_cleanup.sql`, capture before
   state, and run channel-ban, protected-delete, and ShadowPin scoring negatives.
2. **SEC-001 - Promote current active Edge Function hardening.** Deploy and
   negatively smoke `openai-chat`, `delete-account`, and
   `shadow-pin-import-image`. Keep `art-board-import-image` undeployed or paused
   while Art Board is unavailable. Do not leave stale service-role code active.
3. **SEC-002 - Enforce the profile write boundary.** Remove table-level
   authenticated writes to `public.users`, grant only approved profile columns,
   add `USING` plus `WITH CHECK`, and move Netlify operator authorization to
   canonical `user_roles`/`is_app_operator`.
4. **SEC-003 - Lock notification sound configuration.** Prefer bundled/static
   sound assets, enable RLS, and remove anonymous/authenticated mutation rights.
5. **SEC-004 - Establish a SECURITY DEFINER ACL contract.** Hotfix confirmed
   public/anonymous functions, set fixed `search_path`, add caller guards, and
   add default-privilege protection. Complete the broader allowlist only from
   live `pg_proc`/ACL evidence.
6. **SEC-005 - Complete the ESP hold.** Inventory bridge identities, revoke
   custom and Supabase Auth sessions, disable devices/codes, and remove deployed
   bridge endpoints or make every endpoint deny by default. Re-enable only with
   fresh pairing and sessions.
7. **DB-002 - Add Storage constraints.** Inventory current objects, then add
   reviewed MIME/size limits for avatars, banners, message media, chat uploads,
   and voice recordings without changing existing objects.
8. **PERF-001 - Make backend parity a deployment gate.** CI must prove migration
   state, active/paused function manifest, JWT configuration, negative smokes,
   frontend build SHA, and post-deploy health before reporting success.

#### P1 - Reliability, performance, and mobile UX

1. Repair the mobile QA send-button selector and keep paused feature flows
   optional in the visual harness.
2. Replace service-worker cache-first handling for stable Shadow Runner paths
   with content-hashed or revalidating behavior and test installed-PWA upgrades.
3. Change DM history pagination to stable `(created_at, id)` keysets.
4. Consolidate duplicate DM subscriptions and bound long-thread rendering.
5. Roll back optimistic General Chat reactions when the RPC fails.
6. **Completed locally:** remove the catch-all `vendor-ui` chunk, restore
   route-aware splitting, and enforce measured entry/lazy/deploy budgets.
7. Move nonruntime source/concept/generation assets out of `public`, retain all
   runtime finals, and enforce a deploy-size budget.
8. Add Netlify CSP, frame, content-type, referrer, permissions, and other
   reviewed security headers; serve the manifest with the correct MIME type.
9. Complete installed-PWA checks on physical iPhone and Android devices and
   make a deliberate portrait/Shadow Runner landscape decision.
10. Remove `user-scalable=no`; standardize focus traps, Escape/focus return,
    keyboard menus, `aria-current`, contrast, and phone touch targets.
11. Simplify the contextual phone header and prevent transient celebrations
    from obscuring essential composer/navigation controls.
12. **Completed locally:** add opt-in release-correlated client/worker telemetry
    with privacy scrubbing and an Edge helper for reviewed per-function adoption.

#### P1 - Repository and dependency cleanliness

1. **Completed locally:** require all Jest and standalone Node suites in CI.
2. **Completed locally:** eliminate React `act(...)` test warnings.
3. **Completed locally:** remove unused code, enable TypeScript unused checks,
   and enforce ESLint `--max-warnings=0`.
4. **Completed locally:** resolve advisories and apply safe same-major updates;
   keep framework/test-runner major migrations as reviewed packets.
5. **Completed locally:** add a separate Expo install/audit/lint/typecheck/Doctor job.
6. **Completed locally:** add documentation link/encoding checks and repair known drift.
7. **Release gate:** validate deterministic clean installs, the complete Quality
   workflow, and a clean worktree before production completion.

#### P2 - Product improvements after hardening

1. Finish targeted mention/reply/reaction notifications, quiet hours, and
   conversation mutes so Settings matches backend delivery behavior.
2. Add an Admin Operations Health Center for frontend SHA, migrations,
   functions, smokes, News status, push, and bridge health.
3. Add personal blocking with a security-reviewed visibility/DM/push contract.
4. Add universal search, saved messages, and personal collections.
5. Add a Shadow Mystery publishing studio.
6. Expand ShadowPin tags, full search, comments, and notifications.
7. Add Shado TV captions, premieres, and watch analytics.
8. **On hold with News:** read-later, topic following, and digest features.
9. **On hold with ESP:** the bridge device/session manager.

### Coordinated investigations, not blind migrations

- Moving email out of `public.users` requires refactoring auth/profile/admin and
  bridge consumers first.
- Full SECURITY DEFINER allowlisting requires live function/ACL inventory so
  RLS helpers are not accidentally broken.
- AI dispatch replay/quota needs an atomic idempotency ledger.
- URL fetch protection needs pinned DNS or controlled egress to close the
  DNS-rebinding gap.

## Audit Scope

The audit covered:

- General security posture across React, Supabase, Edge Functions, Netlify, Render, storage, and third-party service boundaries.
- Login and signup UX, including invite-only signup and Supabase email verification planning.
- General Chat read cursor, initial unread position, scroll stability, and loading flicker.
- Frontend polish opportunities across mobile chat, DMs, navigation, login, News, settings, and profile surfaces.
- Codebase architecture, repeated realtime/send/scroll patterns, and optimization opportunities.
- Project documentation and agent-facing guidance.

Coordinator validation during the audit:

- `npm audit --omit=dev --json` passed with zero production vulnerabilities.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- Initial `npm run qa:chat-scroll -- --cycles=4 --clean-artifacts` passed during the audit; the implementation branch now adds seeded read-position scenarios behind `npm run qa:chat-scroll:all`.
- Supabase project `shsqqouecvdoifzufkqm` was checked through read-only connector/advisor queries.
- Netlify local config was checked. Live Netlify dashboard settings were not verified because `netlify status` timed out locally.

## P0 - General Chat Read Position And Loading Stability

Primary files:

- [src/hooks/useMessages.tsx](C:/repos/chat2.0/src/hooks/useMessages.tsx:294)
- [src/hooks/useUnreadScroll.ts](C:/repos/chat2.0/src/hooks/useUnreadScroll.ts:287)
- [src/components/chat/MessageList.tsx](C:/repos/chat2.0/src/components/chat/MessageList.tsx:321)
- [src/lib/readCursors.ts](C:/repos/chat2.0/src/lib/readCursors.ts:1)
- [scripts/group-chat-scroll-probe.mjs](C:/repos/chat2.0/scripts/group-chat-scroll-probe.mjs:1)

Observed risk:

- The first unread message can be outside the latest loaded window.
- The unread jump can be marked complete before the target DOM row exists.
- `markLatestRead` can advance the cursor too early during initial jumps or deep links.
- Cached messages can be replaced by a loading panel, creating visible flicker and layout changes.
- Pagination uses `created_at` only, which can skip or duplicate rows when timestamps collide.

Implementation status on June 1, 2026:

- Added RPC-backed bounded General Chat windows, separate pinned-message returns, and stable `(created_at, id)` keyset pagination.
- Added cursor-aware window resolution before the first-unread jump, explicit deep-link/feed states, visibility-based read flushing, and cached-message refresh rendering.
- Added seeded browser QA scenarios for read position, deep links, same-timestamp windows, realtime anchored reads, and media-layout stability.
- Applied the production Supabase migrations `20260601181119_general_chat_message_window` and `20260601182251_lock_general_chat_read_rpc_acl`.
- Verified the remote RPC contract, tightened read RPC grants so `anon` cannot execute them, and smoke-tested the production RPC with count-only output.
- Verified production Netlify deploy `6a1decce55a2f6cfa3f8a5ba` on commit `6ab128c8046d01884246002b44819352d65ffc71`.
- Ran a live phone-sized seeded read-position smoke against production, then deleted all seeded messages and restored the smoke account cursor.

Completed feed work in this branch:

1. Add failing tests for a non-null cursor, an unread target older than the latest window, a deep-link target outside the initial window, and a first-unread jump that must not mark the latest row read.
2. Add a cursor-aware fetch path that loads around `last_read_message_id` or `last_read_at` before falling back to the latest window.
3. Make initial unread/deep-link windowing explicit in `MessageList` so the target row is rendered before scroll work starts.
4. Advance the read cursor only when the latest loaded message is actually visible near the bottom, not during first-unread positioning.
5. Keep the scroll container mounted while network refreshes run. Show loading affordances inside the existing container instead of replacing it.
6. Change older-message pagination to a stable `(created_at, id)` keyset contract and align indexes/RPCs if needed.
7. Extend `npm run qa:chat-scroll` or add a focused smoke path that asserts read cursor position, not only scroll metrics. A seeded browser probe now exists behind `npm run qa:chat-scroll:all`.

Completed validation:

- Targeted Jest for `useUnreadScroll`, `MessageList`, `useMessages`, `readCursors`, and `useReadCursor`: passed.
- Full Jest suite: passed.
- `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build`: passed.
- `npm run qa:chat-scroll:metrics -- --cycles=4 --clean-artifacts`: passed locally and against production.
- Production auth smoke with stable accounts: passed.
- Production phone-sized seeded first-unread and Jump to latest validation: passed, with cleanup verified.

## P0 - Invite-Only Signup And Email Verification

Primary files:

- [src/components/auth/LoginForm.tsx](C:/repos/chat2.0/src/components/auth/LoginForm.tsx:57)
- [src/lib/auth.ts](C:/repos/chat2.0/src/lib/auth.ts:81)
- [src/hooks/useAuth.tsx](C:/repos/chat2.0/src/hooks/useAuth.tsx:473)
- [supabase/migrations](C:/repos/chat2.0/supabase/migrations)

Original observed risk:

- Signup called `supabase.auth.signUp` directly without invite enforcement.
- Email confirmation UX was only partially handled by the "no session, check email" branch.
- The login page still contained demo/marketing copy and a larger onboarding explanation than an existing app login needed.
- Signup asked for "Full Name" even though profile rows are broadly readable.

Implementation status on June 2, 2026:

- Added invite-code signup, pending verification, resend verification, forgot-password, and password-reset flows in the login UI.
- Replaced login-page marketing/demo copy with a quiet app login and changed signup identity copy to "Display name".
- Added admin/sub-admin invite management under Settings > Admin > Invites.
- Added private invite schema and server-side invite enforcement with [20260602012149_invite_only_signup_auth.sql](C:/repos/chat2.0/supabase/migrations/20260602012149_invite_only_signup_auth.sql:1).
- Added explicit invite RPC and hook ACL hardening with [20260602013640_lock_signup_invite_rpc_acl.sql](C:/repos/chat2.0/supabase/migrations/20260602013640_lock_signup_invite_rpc_acl.sql:1).
- Pushed both migrations to linked Supabase project `shsqqouecvdoifzufkqm`.
- Pushed Supabase Auth config for email confirmation, Site URL, redirect allowlist, and the Before User Created hook in [supabase/config.toml](C:/repos/chat2.0/supabase/config.toml:1).

Completed validation:

- Focused Jest for auth helpers, `useAuth`, invite SQL contracts, admin invite UI, and Settings admin wiring: passed.
- `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build`: passed.
- Remote Supabase migration state confirmed versions `20260602012149` and `20260602013640`.
- Remote function ACLs confirmed invite public RPCs execute only for `authenticated`, and the hook executes only for `supabase_auth_admin`.
- Remote hook smoke confirmed missing invite returns a 403 error and valid invite validation returns success, with the temporary smoke invite deleted afterward.
- Supabase config push returned remote API, DB, Auth, and Storage config up to date.

Remaining validation before calling the rollout fully production-proven:

- Deploy the frontend to production and run `npm run qa:smoke:prod` with stable email-confirmed accounts.
- Run one approved real-email invite signup proof with a disposable inbox or real test inbox, then expire/delete the test invite and clean up any test profile if created.
- Review optional SMTP/email template polish in the Supabase dashboard before broad user onboarding.

Useful Supabase docs:

- [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)

## P1 - Supabase Authorization And Data Privacy

Primary areas:

- `public.users`
- `public.user_roles`
- DM read cursor RPCs
- SECURITY DEFINER functions
- Storage buckets and object policies
- Supabase security and performance advisors

Observed risk:

- `public.users` contains email/public profile fields and broad authenticated read access.
- Remote checks indicated authenticated users may still have update privileges wider than intended on sensitive columns.
- Some server-side logic treats `users.admin_role` as authority even though canonical authorization should come from `user_roles`.
- `mark_dm_messages_read` needs a participant authorization guard.
- Supabase advisors flagged mutable function search paths, authenticated-callable SECURITY DEFINER functions, public-table RLS gaps, and storage policy concerns.

Implementation status through July 9, 2026:

- Added and remotely applied
  [20260608132000_harden_dm_read_participant_guard.sql](C:/repos/chat2.0/supabase/migrations/20260608132000_harden_dm_read_participant_guard.sql:1),
  which blocks `mark_dm_messages_read` unless the caller participates in the
  conversation. The linked Supabase migration list and `supabase db push
  --dry-run` both showed the remote database current through
  `20260608200000`.
- The July 9 hardening migrations restrict profile writes to approved columns,
  make `users.admin_role` display-only, lock static notification-sound config,
  constrain Storage MIME/size metadata, fix SECURITY DEFINER search paths and
  ACLs, and clear local warning-level lint/security-advisor output. Production
  application remains part of the backend-first release gate.

Status and remaining coordinated follow-up:

1. Move email and other private identity fields out of `public.users` into a private/admin-only table or safe RPC/view.
2. **Completed locally:** revoke broad profile-table writes and grant only
   approved public profile columns with `USING` and `WITH CHECK` enforcement.
3. **Completed locally:** make `users.admin_role` display-only and use
   `user_roles`/operator helpers for authority.
4. **Completed June 8:** enforce the `mark_dm_messages_read` participant guard.
5. **Completed locally:** fix SECURITY DEFINER search paths, caller guards,
   explicit ACLs, and future default privileges.
6. **Completed locally:** replace mutable notification-sound data with bundled
   WebAudio behavior and lock the legacy table.
7. **Completed locally:** add bucket MIME/size constraints and shared client
   filename/type/size validation, including a bounded voice-recording path.

Validation target:

- Read-only SQL checks for column privileges and policy counts.
- Negative tests for updating protected `users` columns.
- Negative tests for `mark_dm_messages_read` on a non-participant conversation.
- Supabase security advisors rerun clean or documented.

## P1 - Service-Role Edge Function Bypasses

Primary files:

- [supabase/functions/bridge-group-send/index.ts](C:/repos/chat2.0/supabase/functions/bridge-group-send/index.ts:76)
- [supabase/functions/bridge-dm-send/index.ts](C:/repos/chat2.0/supabase/functions/bridge-dm-send/index.ts:1)
- [supabase/functions/_shared/bridge.ts](C:/repos/chat2.0/supabase/functions/_shared/bridge.ts:242)
- [supabase/functions/openai-chat/index.ts](C:/repos/chat2.0/supabase/functions/openai-chat/index.ts:61)
- [supabase/functions/_shared/ai.ts](C:/repos/chat2.0/supabase/functions/_shared/ai.ts:274)

Observed risk:

- `bridge-group-send` authenticates a bridge token and inserts with the admin client without a visible General Chat ban check.
- Bridge user search and recipient resolution should respect `dm_discoverable` except for existing conversations or explicit operator flows.
- `openai-chat` lets any authenticated caller request `postToChat`, then posts as Shado through service-role writes.
- Public bridge bootstrap endpoints are intentionally unauthenticated, but need spoofing and rate-limit review.

Next steps:

1. Keep every bridge endpoint default-deny while ESP is paused; the shared hold
   now runs before authentication, parsing, or service-role work.
2. Before bridge reactivation, re-audit channel bans, `dm_discoverable`,
   bootstrap/rate limits, returned identifiers, and banned-user tests.
3. Keep AI `postToChat` caller eligibility and General Chat bans covered by
   negative tests when changing that active endpoint.
4. Add an atomic per-user AI quota/idempotency ledger before expanding provider
   use or separating answer and post permissions.

Validation target:

- Edge Function tests for bridge group send, bridge DM search/send, and AI `postToChat`.
- Live smoke with a normal user, banned user, and operator account.
- Supabase function logs checked for expected 403/429 behavior.

## P1 - URL Fetch And SSRF Hardening

Primary files:

- [supabase/functions/link-preview/index.ts](C:/repos/chat2.0/supabase/functions/link-preview/index.ts:96)
- [supabase/functions/shadow-pin-import-image/index.ts](C:/repos/chat2.0/supabase/functions/shadow-pin-import-image/index.ts:120)
- [supabase/functions/shadow-pin-video/index.ts](C:/repos/chat2.0/supabase/functions/shadow-pin-video/index.ts:218)
- [supabase/functions/art-board-import-image/index.ts](C:/repos/chat2.0/supabase/functions/art-board-import-image/index.ts:116)
- [netlify/functions/_shared/shadow-pin-media.mjs](C:/repos/chat2.0/netlify/functions/_shared/shadow-pin-media.mjs:105)

Observed risk:

- URL fetchers have some protections, but they mainly resolve A records and validate final URLs after fetch redirects.
- IPv6, AAAA records, private/reserved ranges, redirect hops, and DNS rebinding behavior need a shared hardened contract.

Implementation status on June 8, 2026:

- Added shared safe-fetch helpers for Supabase Edge Functions and Netlify
  functions. The helpers normalize public HTTP(S) URLs, reject URL
  credentials, block local/private/reserved IPv4 and IPv6 targets including
  IPv4-mapped IPv6 forms, resolve A and AAAA records, follow redirects
  manually, validate each hop before fetching it, cap redirect count, and
  enforce response byte limits.
- Integrated the Supabase helper in `link-preview`, `art-board-import-image`,
  `shadow-pin-import-image`, `shadow-pin-video`, and `send-push` repo code, and
  mirrored the Netlify helper in the ShadowPin media helper path.
- Added focused unit/contract coverage in `tests/safeFetch.test.ts`,
  `tests/safeFetchIntegrationContract.test.ts`, and
  `tests/netlifySafeFetch.node.test.mjs`.
- Remote function inventory showed June 8 deployments for `link-preview` and
  `shadow-pin-video`. `art-board-import-image`, `shadow-pin-import-image`, and
  `send-push` still reported older deployment timestamps, so production
  coverage for those adopters remains an open deployment/smoke item.

Next steps:

1. Deploy and smoke active `shadow-pin-import-image` and `send-push`; remove
   remote `art-board-import-image` while Art Board is paused.
2. Run deployed function smoke with known safe public URLs and blocked private
   URL cases.
3. Keep adding provider-specific allow/deny tests as URL import and preview
   behavior expands.

Validation target:

- Unit tests for IPv4 private, IPv6 private, metadata IP, redirect-to-private, long redirect chain, oversized response, and allowed public media URLs.
- Deployed function smoke with known safe public URLs.

## P1 - Deployment And Third-Party Configuration

Primary files:

- [netlify.toml](C:/repos/chat2.0/netlify.toml:1)
- [render.yaml](C:/repos/chat2.0/render.yaml:1)
- [.github/workflows/netlify-production.yml](C:/repos/chat2.0/.github/workflows/netlify-production.yml:1)
- [.github/workflows/netlify-preview.yml](C:/repos/chat2.0/.github/workflows/netlify-preview.yml:1)
- [supabase/config.toml](C:/repos/chat2.0/supabase/config.toml:1)

Observed risk:

- `netlify.toml` does not define security headers.
- Live Netlify project settings were verified on July 9; automatic Git builds
  were then stopped so the GitHub backend-first workflow is the only publisher.
- Render config keeps sensitive values unsynced, which is good, but live dashboard secrets/logging were not verified.
- No Vercel project config was found.
- Several Supabase functions intentionally use `verify_jwt = false` and must rely on complete custom auth/rate limiting.

Next steps:

1. Add staged Netlify headers for `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection, and CSP.
2. Build CSP in report-only mode first so Supabase, Bunny, Meta/oEmbed, media, and provider calls can be observed safely.
3. Verify production headers after the staged header/CSP packet; project,
   deploy-hook, domain, and publisher settings were verified July 9.
4. Verify Render worker env vars are scoped to server-side secrets and log output does not expose provider credentials.
5. Confirm all `verify_jwt = false` Supabase functions have custom auth, abuse limits, and tests.
6. **Completed:** local, Netlify config, and GitHub workflows use Node 24.

Validation target:

- `curl -I` or browser network check against production headers.
- Netlify production deploy log check after docs/config changes.
- Render worker log check after any worker config change.
- Supabase function auth matrix reviewed after each Edge Function change.

## P2 - Frontend Polish Backlog

Primary files and surfaces:

- [src/components/auth/LoginForm.tsx](C:/repos/chat2.0/src/components/auth/LoginForm.tsx:91)
- [src/components/layout/MobileAppHeader.tsx](C:/repos/chat2.0/src/components/layout/MobileAppHeader.tsx:154)
- [src/components/layout/MobileNav.tsx](C:/repos/chat2.0/src/components/layout/MobileNav.tsx:36)
- [src/components/dms/DirectMessagesView.tsx](C:/repos/chat2.0/src/components/dms/DirectMessagesView.tsx:927)
- [src/components/news/NewsFeed.tsx](C:/repos/chat2.0/src/components/news/NewsFeed.tsx:46)
- [src/components/settings/SettingsView.tsx](C:/repos/chat2.0/src/components/settings/SettingsView.tsx:1247)
- [src/index.css](C:/repos/chat2.0/src/index.css:164)

Next steps:

1. Simplify login to a normal app sign-in surface.
2. Make mobile header actions view-specific so Weather, Active Users, Pinned, and other controls do not crowd every surface.
3. Tighten mobile nav labels and badge caps.
4. Separate DM loading, empty, and selected-thread states so "Say hello" does not flash incorrectly.
5. Remove admin/setup hints from user-facing News empty states unless the current user is an operator.
6. Review profile/settings modal overflow on small screens.
7. Disable expensive fixed backgrounds on mobile if browser traces show scroll smoothness cost.

Implementation status on June 8, 2026:

- DM loading and empty-state handling was tightened in
  [src/components/dms/DirectMessagesView.tsx](C:/repos/chat2.0/src/components/dms/DirectMessagesView.tsx:1)
  and [src/hooks/useDirectMessages.tsx](C:/repos/chat2.0/src/hooks/useDirectMessages.tsx:1),
  with focused coverage in `tests/useDirectMessages.test.tsx`.
- Message send touch handling and active-send composer disables were hardened
  across General Chat, DMs, and board chat. Mobile visual/browser validation is
  still needed before closing the broader frontend polish item.

Validation target:

- Preview build visual pass on iPhone-sized and Android-sized Chromium viewports.
- Browser smoke for login, chat, DMs, settings, and News.
- Screenshots saved only if needed, then cleaned up unless a QA doc needs them.

## P2 - Architecture And Performance Backlog

Primary areas:

- Realtime subscriptions across messages, DMs, News, boards, and presence.
- Optimistic send fallback logic.
- Scroll anchoring/history loaders.
- Large `src/lib/supabase.ts` helper surface.
- Bundle chunking and lazy loading.
- Supabase performance advisor warnings.

Next steps:

1. Extract a shared realtime subscription lifecycle helper after the chat/read-position work is stable.
2. Extract shared optimistic send fallback helpers for group chat and DMs.
3. Extract shared scroll anchoring/history helpers for General Chat, DMs, and board chat.
4. Split `src/lib/supabase.ts` into domain modules as touched, not as a broad standalone rewrite.
5. Revisit Rollup manual chunks for emoji picker, games/entertainment, Supabase/vendor, and lower-frequency settings/admin surfaces.
6. Review unindexed foreign keys and RLS initplan warnings from Supabase performance advisors.
7. Treat unused-index warnings carefully; do not drop indexes only because stats are currently quiet.

Implementation status on June 8, 2026:

- A pilot shared realtime subscription lifecycle helper landed in
  [src/lib/realtimeSubscription.ts](C:/repos/chat2.0/src/lib/realtimeSubscription.ts:1)
  and is now used by News Feed and News Chat with focused Jest coverage. This
  starts the extraction track but does not yet cover General Chat, DMs, boards,
  or presence.
- The July 9 build removed the broad `vendor-ui` chunk and added deterministic
  eager, lazy Phaser, single-chunk, and total-deploy budgets. The large lazy
  Phaser payload remains intentional and separately budgeted.

Validation target:

- Build chunk comparison before and after manual chunk changes.
- Focused Jest for extracted helpers.
- Supabase performance advisor comparison after DB migrations.
- `npm run qa:smoke` or narrower browser smoke for touched realtime surfaces.

## Suggested Implementation Order

1. Chat read-position tests and fix.
2. Invite-only signup, email verification, and login cleanup.
3. `public.users` privilege/privacy migration and server-side admin authority cleanup.
4. Bridge and AI service-role bypass checks.
5. SSRF safe-fetch helper.
6. Netlify headers and live deployment settings verification.
7. Mobile/header/DM/frontend polish.
8. Realtime/send/scroll shared helpers and bundle optimization.
9. Documentation refresh after the security/auth/chat changes are merged.

## Release Checklist For Each Work Packet

For frontend or TypeScript changes:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

For behavior already covered by tests:

```powershell
npx jest --runInBand
```

For chat, DM, auth, or realtime changes:

```powershell
npm run qa:smoke
```

Use narrower smoke scripts when the change is scoped, especially `npm run qa:chat-scroll`, `npm run qa:smoke:dm`, and `npm run qa:smoke:resume`.

For Supabase changes:

- Inspect the relevant migration before describing behavior.
- Apply migrations in a staging or linked environment before claiming readiness.
- Re-run Supabase advisors.
- Verify RLS, grants, and function auth with negative tests.

For deployment changes:

- Verify production headers and redirects after deploy.
- Verify Netlify and Render live settings directly, not only local config.
- Do not expose service-role or provider secrets in `VITE_*`.
