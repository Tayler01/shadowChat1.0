# Full Codebase Audit Next Steps - 2026-06-01

This document turns the June 1, 2026 read-only audit into an implementation backlog and records status updates as fixes land.

## Documentation Status - July 11, 2026

This is the current source of truth for the audit backlog. It preserves the
original June findings, records the July production-alignment evidence, and
ranks the work that remains. Update it when an item is implemented,
intentionally deferred, or replaced by a narrower feature ticket.

The separate `codex/shadowchat-2.0` Wave One track has locally completed four
high-ticket product candidates without changing production `main`: Activity
HQ, ShadowPin Theater, DM Conversation Hub, and Member Reporting/Safety Case
Center. Candidate 5 and the combined shared-backend/Netlify trial gate remain
open; see `docs/SHADOWCHAT_2_0_WAVE_ONE.md` for authoritative status.

## July 9, 2026 Alignment And Cleanup Program

The July 9 full audit revalidated this backlog against local code, linked
Supabase, Netlify, Render, GitHub, browser QA, and the production build. The
alignment work shipped directly through `main`. Commit
`8e69fe498827efa19e211ad0cb9ca9ec506c96ae` passed the complete backend-first
production workflow in GitHub Actions run `29060359268`, aligned Supabase, and
published the verified frontend to Netlify. Local and remote branch inventories
now contain only `main`, and GitHub has zero open pull requests.

### Product decisions now in force

- **Boards, News, and Art Board are paused.** Their source, migrations, rows,
  Storage objects, and tests stay intact. The default build omits their nav,
  routes, providers, realtime subscriptions, and chunks.
- **ESP Bridge is on hold.** Firmware, TUI, migrations, functions, and planning
  history stay intact. The default build omits pairing/admin UI; server-side
  session revocation is deployed, dedicated Auth sessions are removed by the
  release workflow, and all deployed Bridge endpoints deny with
  `feature_paused` before request processing.
- **Render News must remain suspended with automatic deploys off.** Do not
  restore a paid worker until the News product is explicitly reapproved.
- Canonical status and re-enable instructions live in
  [PAUSED_FEATURES.md](C:/repos/chat2.0/docs/PAUSED_FEATURES.md:1).

### Ranked implementation list

### July 10 implementation checkpoint (production aligned)

- All eight P0 alignment items below are implemented on `main` and deployed:
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
- Netlify deploy `6a503fb9aa7a29932306a381` reached `ready` for the alignment
  commit at `https://shadochat.online`; the public root returned 200, the health
  workflow reported `newsMonitoring: paused`, and the live entry bundle carried
  the expected release SHA.
- Follow-up workflow `29061308774` also passed every gate and published smoke-
  harness commit `8e4e2757efe6555b90c6a566b0684c41da0e2b10` as Netlify deploy
  `6a5045191fe53dd504fc4131`; the live entry bundle carries that exact SHA.
- Release A applied linked Supabase migrations through
  `20260710044600_personal_blocking_engagement_hardening.sql`. The remote
  Function inventory is exact: 8 active product Functions plus 15 deny-paused
  Bridge Functions; `art-board-import-image` is absent. A forward revocation of
  two historical extra active-table grants is the remaining linked closeout.
- Remote database lint is clean. Hosted security-advisor warnings fell from 169
  to 72: 71 guarded authenticated SECURITY DEFINER APIs and the intentional
  anonymous `is_username_available(text)` pre-signup check. Broad public-bucket
  listing and leaked-password warnings are zero, and Supabase Auth leaked-
  password protection is enabled.
- Release A completed the reviewed framework/test migration in production CI:
  Expo 57, React Native 0.86, React 19.2, TypeScript
  6 in the mobile package, Jest 30 in the root package, and narrow transitive
  overrides for the remaining Remotion/jsdom/glob warnings. Clean root/mobile
  installs report no deprecation warnings and zero known vulnerabilities.

### July 10 Release A deployment and closeout

The backend-first `main` workflow applied and published the following Release A
batch. Post-release linked verification then found two historical active-table
grants outside the reviewed contract. A forward revocation and follow-up
workflow are the remaining closeout work; use the latest successful workflow,
linked checks, and public health manifest as authority rather than an older SHA:

- service-worker cache v3 with cache-first content-hashed assets,
  revalidate-first stable assets, offline fallback, and stale-cache cleanup
- stable DM `(created_at, id)` keyset pagination, one consolidated realtime
  lifecycle per signed-in user, a bounded 200-message thread window, and a
  `Load latest` recovery action
- deterministic optimistic General Chat reaction rollback
- nonruntime source/generation assets moved from `public` to `source-assets`,
  with a 100 MB deploy budget
- report-only CSP plus frame, content-type, referrer, permissions, manifest
  MIME, and service-worker cache headers
- accessible dialogs, focus return, keyboard message menus, scalable viewport,
  contextual phone headers, and less-obstructive Hype presentation
- atomic Edge request buckets and idempotency claims, including the AI request
  ledger, plus shared endpoint guards and operator Operations Health evidence
- explicit active Data API grants, RLS performance cleanup, and an exact local
  security contract covering public/private definer inventories, active-table
  privileges, paused-domain grants, and profile update columns
- private-identity Release A plus consumer cutover: API projections exclude
  `email`/`full_name`, profile writers no longer copy them, and full-admin email
  lookup reads `auth.users`; web and Expo selectors/types are independent of
  both legacy fields, while the nullable compatibility columns intentionally
  remain until a separately verified Release B drop
- notification delivery parity for General Chat/DM targeted events, global and
  type controls, timezone-aware quiet hours, snooze, General Chat mute, and
  per-DM conversation mute
- reciprocal personal blocking, caller-visible message search, private saved
  messages/collections, Shadow Mystery publishing, ShadowPin social/search and
  notifications, and Shado TV captions/premieres/analytics
- `notification_events` published through
  `20260710044500_publish_notification_events_realtime.sql` so recipient-owned
  ShadowPin events can drive live in-app alerts under RLS
- `20260710044600_personal_blocking_engagement_hardening.sql` closes known-id
  engagement bypasses for reactions, Hype, message pinning, ShadowPin hearts,
  comments, activity, and aggregate helpers; bounds ShadowPin post/activity/tag
  writes; creates new-post events only when a pin first becomes ready; and
  clears stale unread pair notifications when a block is created
- `send-push` now returns privacy-safe aggregate delivery counts, removes only
  permanently invalid subscriptions, reports transient provider failures as
  retryable `503` responses, and releases failed idempotency claims; the client
  retries only network, `409`, and `5xx` failures with two bounded delays

#### P0 - Production alignment and authority

1. **DB-001 - Completed July 10:** deployed
   `20260620121500_admin_authority_source_cleanup.sql` and retained the
   channel-ban, protected-delete, and ShadowPin authority checks.
2. **SEC-001 - Completed July 10:** deployed the current active Function set,
   aligned JWT settings to the manifest, deployed Bridge endpoints only with the
   shared deny-first hold, and removed remote `art-board-import-image`.
3. **SEC-002 - Completed July 10:** removed broad authenticated profile writes,
   granted only approved public-profile columns, and made
   `user_roles`/`is_app_operator` the authority source.
4. **SEC-003 - Completed July 10:** replaced mutable notification-sound data
   with bundled/static behavior and removed browser mutation rights.
5. **SEC-004 - Completed July 10 for the immediate exposure boundary:** fixed
   search paths, caller guards, historical/default EXECUTE grants, internal
   helper exposure, and paused-domain RPC exposure. The remaining authenticated
   SECURITY DEFINER architecture review is ranked first in P1 below.
6. **SEC-005 - Completed July 10:** revoked Bridge custom/Auth sessions,
   disabled devices and pending codes, and deployed all 15 Bridge endpoints with
   the shared default-deny hold. Reactivation requires fresh pairing/sessions.
7. **DB-002 - Completed July 10:** added reviewed MIME/size constraints for
   avatars, banners, message media, chat uploads, and voice recordings without
   deleting existing objects.
8. **PERF-001 - Completed July 10:** production CI now proves migration state,
   exact Function classification/JWT settings, Bridge hold state, frontend build
   identity, backend evidence, and post-deploy health before success.

#### P1 - Reliability, performance, and mobile UX

1. Review the 71 intentional authenticated SECURITY DEFINER APIs one domain at
   a time. Prefer public SECURITY INVOKER wrappers or private implementation
   helpers where that reduces privilege without breaking RLS-backed behavior.
2. Keep the production resume/send harness stable across restored read positions
   and require verified cleanup of every test General Chat and DM row.
3. **Shipped in Release A; physical-device proof pending:** stable assets now
   revalidate before cache fallback, content-hashed assets remain cache-first,
   and old worker caches are removed. Validate an installed-PWA upgrade on real
   iPhone and Android devices after deployment.
4. **Shipped in Release A:** DM history uses stable `(created_at, id)` keysets.
5. **Shipped in Release A:** DM realtime subscriptions are consolidated and
   thread rendering is bounded to the latest 200 loaded messages.
6. **Shipped in Release A:** optimistic General Chat reactions roll back when
   the RPC fails.
7. **Completed:** remove the catch-all `vendor-ui` chunk, restore
   route-aware splitting, and enforce measured entry/lazy/deploy budgets.
8. **Shipped in Release A:** nonruntime source/concept/generation assets live in
   `source-assets`; runtime finals remain in `public`; the build enforces a
   100 MB deploy-size budget.
9. **Shipped in Release A; latest-header proof pending:** Netlify defines a
   report-only CSP plus frame, content-type, referrer, permissions, manifest
   MIME, and worker cache headers.
10. Complete installed-PWA checks on physical iPhone and Android devices and
   make a deliberate portrait/Shadow Runner landscape decision.
11. **Shipped in Release A:** removed `user-scalable=no`; standardized the
    touched focus traps, Escape/focus return, keyboard menus, `aria-current`,
    and phone touch targets. Physical-device accessibility review remains.
12. **Shipped in Release A:** the phone header is contextual and Hype
    celebrations avoid essential composer/navigation controls.
13. **Completed:** add opt-in release-correlated client/worker telemetry
   with privacy scrubbing and an Edge helper for reviewed per-function adoption.
14. **Shipped in Release A:** personal-block changes immediately refresh loaded
   DM state, while trigger/RPC guards cover known-id engagement paths and stale
   pair notifications. Production two-account proof is still pending.

#### P1 - Repository and dependency cleanliness

1. **Completed in production:** require all Jest and standalone Node suites in CI.
2. **Completed in production:** eliminate React `act(...)` test warnings.
3. **Completed in production:** remove unused code, enable TypeScript unused checks,
   and enforce ESLint `--max-warnings=0`.
4. **Completed in production:** safe dependency updates remain gated, while
   Release A moves Jest to 30 and Expo to 57 with warning-free clean installs.
5. **Completed in production:** add a separate Expo
   install/audit/lint/typecheck/Doctor job. Release A runs that job
   against Expo 57.
6. **Completed in production:** add documentation link/encoding checks and repair known drift.
7. **Completed in production:** deterministic clean installs, the complete
   Quality workflow, security scans, CodeQL, and the credentialed backend-first
   release all passed before publication.

#### P2 - Product improvements after hardening

1. **Shipped in Release A:** targeted mention/reply/reaction delivery, master
   and per-type preferences, timezone-aware quiet hours, temporary snooze,
   General Chat mute, and per-DM conversation mutes now share one backend
   delivery contract. Normal-device push verification remains.
2. **Shipped in Release A:** Admin Operations Health now
   reports the running/deployed frontend SHA, migration and exact Function
   manifest parity, latest production monitor result, release-time push
   readiness, and explicit paused News/ESP state from an operator-only,
   sanitized snapshot. The live health manifest and latest workflow are the
   release-state authority.
3. **Shipped in Release A:** reciprocal personal blocking covers discovery,
   General Chat, presence, reactions, Hype, message pinning, DMs, ShadowPin
   visibility/comments/hearts/activity, aggregate helpers, and notification
   delivery while preserving DM history for unblock restoration. Loaded DM
   state refreshes immediately after a block change.
4. **Shipped in Release A:** universal caller-visible General Chat/DM search,
   private saved messages, and personal collections.
5. **Shipped in Release A:** Shadow Mystery operator publishing studio and
   private artwork domain.
6. **Shipped in Release A:** normalized ShadowPin tags, indexed search,
   root comments plus one-level replies, bounded post/activity writes, and
   ready-state new-post/comment/reply notifications. Recipient events are now
   included in the Realtime publication under RLS.
7. **Shipped in Release A:** Shado TV WebVTT captions, synchronized premieres,
   watch events, and operator aggregates.
8. **On hold with News:** read-later, topic following, and digest features.
9. **On hold with ESP:** the bridge device/session manager.

### Coordinated investigations, not blind migrations

- Private-identity Release A and its consumer cutover are deployed, including
  the Expo selector/type cleanup. Release B must not drop the legacy
  `public.users.email` and `full_name` columns until the forward grant-revocation
  release and its linked/live proof are final.
- The exact SECURITY DEFINER and privilege contracts are implemented; the two
  historical extra active-table grants found after Release A are being removed
  by a forward migration. After that closeout,
  architectural reduction of the authenticated surface still requires
  domain-by-domain review rather than blind ACL removal.
- AI dispatch replay/quota now uses an atomic private idempotency/rate ledger;
  production behavior still needs release evidence.
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

Coordinator validation during the original June audit:

- `npm audit --omit=dev --json` passed with zero production vulnerabilities.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- Initial `npm run qa:chat-scroll -- --cycles=4 --clean-artifacts` passed during
  the audit; later work added seeded read-position scenarios behind
  `npm run qa:chat-scroll:all`.
- Supabase project `shsqqouecvdoifzufkqm` was checked through read-only connector/advisor queries.
- Netlify local config was checked. Live Netlify dashboard settings were not
  verified in that original pass because `netlify status` timed out locally;
  the July alignment subsequently verified the live project, stopped native Git
  builds, unlocked publishing, and proved the GitHub-owned CLI release path.

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

Implementation status through July 10, 2026:

- Added and remotely applied
  [20260608132000_harden_dm_read_participant_guard.sql](C:/repos/chat2.0/supabase/migrations/20260608132000_harden_dm_read_participant_guard.sql:1),
  which blocks `mark_dm_messages_read` unless the caller participates in the
  conversation.
- The July hardening migrations restrict profile writes to approved columns,
  make `users.admin_role` display-only, lock static notification-sound config,
  constrain Storage MIME/size metadata, fix SECURITY DEFINER search paths and
  ACLs, revoke paused-domain browser access, and remove broad public-bucket list
  policies. Release A brought the linked database through
  [20260710044600_personal_blocking_engagement_hardening.sql](C:/repos/chat2.0/supabase/migrations/20260710044600_personal_blocking_engagement_hardening.sql:1).
  The forward closeout migration
  `20260710141315_revoke_unreviewed_active_table_grants.sql` is the only pending
  linked change until its backend-first `main` workflow completes.
- Local reset/lint/security advisors and remote database lint are clean. The
  hosted security advisor now reports 72 documented warnings: 71 guarded
  authenticated SECURITY DEFINER APIs and the sole intentional anonymous
  `is_username_available(text)` check. Supabase Auth leaked-password protection
  is enabled; stronger minimum-length/complexity rules remain a separate auth UX
  rollout so existing sign-in behavior is not changed accidentally.
- The deployed Release A migrations add one explicit public-profile JSON
  projection for General Chat/DM and Edge consumers, remove email/full-name
  copying from profile writers, and source the guarded admin email list from
  `auth.users`. The legacy public columns remain nullable and deprecated for a
  deployment interval; Release B is the actual column-removal step.
- The local security contract now gates the exact public authenticated,
  anonymous, internal, and private SECURITY DEFINER inventories; active core
  table privileges; paused-domain browser grants; dangerous grants; and the 11
  allowed authenticated `users` update columns.

Status and remaining coordinated follow-up:

1. Finish Release A linked-grant closeout, then apply the separately reviewed
   Release B migration that drops legacy `public.users.email` and `full_name`.
   Do not mark this complete while the compatibility columns remain queryable.
2. Review authenticated SECURITY DEFINER APIs domain by domain and replace them
   with private implementations or SECURITY INVOKER wrappers when the privilege
   boundary can be narrowed without breaking RLS-backed behavior.
3. **Completed in production:** revoke broad profile-table writes and grant only
   approved public profile columns with `USING` and `WITH CHECK` enforcement.
4. **Completed in production:** make `users.admin_role` display-only and use
   `user_roles`/operator helpers for authority.
5. **Completed June 8:** enforce the `mark_dm_messages_read` participant guard.
6. **Completed in production:** fix SECURITY DEFINER search paths, caller guards,
   explicit ACLs, and future default privileges.
7. **Completed in production:** replace mutable notification-sound data with bundled
   WebAudio behavior and lock the legacy table.
8. **Completed in production:** add bucket MIME/size constraints and shared client
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
   negative tests when changing that active endpoint. Release A also
   applies the shared Edge request guard.
4. **Shipped in Release A:** atomic per-user AI quota/idempotency claims and
   durable bounded responses live in the private Edge request ledger. Verify
   deployed 429/replay behavior before expanding provider use.

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
- The July production release aligned the exact remote manifest: 8 active
  product Functions, 15 deny-paused Bridge Functions, and no deployed
  `art-board-import-image`. Active `shadow-pin-import-image`, `send-push`,
  `link-preview`, and `shadow-pin-video` now use the current source.

Next steps:

1. Run deployed function smoke with known safe public URLs and blocked private
   URL cases.
2. Keep adding provider-specific allow/deny tests as URL import and preview
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

Observed risk and release status:

- The deployed `netlify.toml` defines the reviewed header packet, with CSP
  intentionally report-only for staged compatibility review. Verify the latest
  follow-up deploy headers rather than relying on an older release.
- Live Netlify project settings were verified on July 9; automatic Git builds
  were then stopped so the GitHub backend-first workflow is the only publisher.
- Render service `srv-d7pjc49j2pic73bq5m80` was verified as a suspended
  `background_worker` on `main` with `AutoDeploy=no` and
  `autoDeployTrigger=off`. Secret values and log redaction were not inspected
  while the worker was suspended.
- No Vercel project config was found.
- Several Supabase functions intentionally use `verify_jwt = false` and must rely on complete custom auth/rate limiting.

Next steps:

1. **Shipped in Release A:** staged `X-Content-Type-Options`,
   `Referrer-Policy`, `Permissions-Policy`, frame protection, manifest MIME,
   worker caching, and CSP headers.
2. **Shipped in Release A:** CSP is report-only so Supabase, Bunny,
   Meta/oEmbed, media, and provider calls can be observed safely.
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
2. **Shipped in Release A:** mobile header actions are contextual so Weather,
   Active Users, Pinned, global search, and other controls do not crowd every
   surface.
3. Tighten mobile nav labels and badge caps.
4. Separate DM loading, empty, and selected-thread states so "Say hello" does not flash incorrectly.
5. **On hold with News:** remove admin/setup hints from user-facing News empty states unless the current user is an operator.
6. **Shipped in Release A for the touched surfaces:** shared dialog focus traps,
   Escape/focus return, and viewport-bounded modal layout cover profile,
   settings, feedback, notification setup, image, emoji, ShadowPin comment,
   search/library, and studio dialogs. Physical-device review remains.
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
- Browser smoke for login, chat, DMs, and settings. Treat News as
  reactivation-only while the domain is paused.
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
- Release A extends the shared realtime lifecycle into the
  DM domain, replaces duplicate conversation/thread channels with one
  consolidated subscription path, and bounds long-thread state.
- `20260710034032_rls_performance_cleanup.sql` addresses the reviewed RLS
  initplan/policy duplication set locally. Compare hosted performance advisors
  after deployment; do not drop quiet indexes solely from unused-index output.

Validation target:

- Build chunk comparison before and after manual chunk changes.
- Focused Jest for extracted helpers.
- Supabase performance advisor comparison after DB migrations.
- `npm run qa:smoke` or narrower browser smoke for touched realtime surfaces.

## Suggested Implementation Order

1. Review and narrow the remaining authenticated SECURITY DEFINER API surface.
2. Finish General Chat read-position and production resume/send regression
   coverage, including verified test-data cleanup.
3. Validate the implemented service-worker upgrade behavior on installed
   physical iPhone and Android PWAs.
4. Deploy/prove private-identity Release A, then apply and verify Release B.
5. Verify the implemented DM pagination/subscription/thread-bound work in the
   production browser flow.
6. Verify the implemented report-only Netlify header packet in production and
   review CSP reports before enforcement.
7. Complete physical-device accessibility, orientation, notification, and
   mobile-polish review for the implemented UI changes.
8. Continue domain-scoped realtime/send/scroll extraction and performance-
   advisor work without broad rewrites.

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
- Run `npm run supabase:security-contract:local`; after deployment run the
  linked contract and compare the exact Function/migration evidence.
- Re-run Supabase advisors.
- Verify RLS, grants, and function auth with negative tests.

For deployment changes:

- Verify production headers and redirects after deploy.
- Verify Netlify and Render live settings directly, not only local config.
- Do not expose service-role or provider secrets in `VITE_*`.
