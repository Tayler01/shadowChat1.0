# Full Codebase Audit Next Steps - 2026-06-01

This document turns the June 1, 2026 read-only audit into an implementation backlog. It is intentionally written as next steps, not as a claim that any fixes have been applied.

## Documentation Status - June 1, 2026

This is the current source of truth for the audit backlog. Update this document when an audit item is implemented, intentionally deferred, or replaced by a narrower feature ticket.

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
- `npm run qa:chat-scroll -- --cycles=4 --clean-artifacts` passed, but it does not yet assert read-cursor correctness.
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

Next steps:

1. Add failing tests for a non-null cursor, an unread target older than the latest window, a deep-link target outside the initial window, and a first-unread jump that must not mark the latest row read.
2. Add a cursor-aware fetch path that loads around `last_read_message_id` or `last_read_at` before falling back to the latest window.
3. Make initial unread/deep-link windowing explicit in `MessageList` so the target row is rendered before scroll work starts.
4. Advance the read cursor only when the latest loaded message is actually visible near the bottom, not during first-unread positioning.
5. Keep the scroll container mounted while network refreshes run. Show loading affordances inside the existing container instead of replacing it.
6. Change older-message pagination to a stable `(created_at, id)` keyset contract and align indexes/RPCs if needed.
7. Extend `npm run qa:chat-scroll` or add a focused smoke path that asserts read cursor position, not only scroll metrics.

Validation target:

- Targeted Jest for `useUnreadScroll`, `MessageList`, and cursor helpers.
- `npm run qa:chat-scroll -- --cycles=4 --clean-artifacts`.
- A phone-sized browser smoke with an older unread target, a fully read thread, and a realtime incoming message.

## P0 - Invite-Only Signup And Email Verification

Primary files:

- [src/components/auth/LoginForm.tsx](C:/repos/chat2.0/src/components/auth/LoginForm.tsx:57)
- [src/lib/auth.ts](C:/repos/chat2.0/src/lib/auth.ts:81)
- [src/hooks/useAuth.tsx](C:/repos/chat2.0/src/hooks/useAuth.tsx:473)
- [supabase/migrations](C:/repos/chat2.0/supabase/migrations)

Observed risk:

- The current signup path calls `supabase.auth.signUp` directly without invite enforcement.
- Email confirmation UX is only partially handled by the "no session, check email" branch.
- The login page still contains demo/marketing copy and a larger onboarding explanation than an existing app login needs.
- Signup asks for "Full Name" even though profile rows are broadly readable.

Next steps:

1. Add an invite-code field to the signup form, `SignUpData`, `useAuth.signUp`, and `auth.signUp`.
2. Enforce invite-only signup server-side, preferably with a Supabase Before User Created hook.
3. Store invite codes as hashes only, with expiration, max uses, disabled state, optional allowed email/domain, created_by, redeemed_by, and redeemed_at.
4. Keep invite redemption in private schema/table access. Revoke direct `anon`, `authenticated`, and `public` execute access from internal helpers.
5. Pass invite metadata to Supabase auth only for hook validation, then strip it from public profile metadata.
6. Enable and verify Supabase email confirmation in production. Configure Site URL and redirect allowlist.
7. Pass an explicit `emailRedirectTo` in signup.
8. Add resend-confirmation UX and a pending-verification screen.
9. Replace login-page marketing/demo text with a quiet app login. Keep only brand, credential fields, invite/signup state, and concise errors.
10. Change "Full Name" to "Display name" and avoid storing private identity data on public profile rows.

Validation target:

- Signup without invite fails before an auth user/profile is created.
- Signup with valid invite creates an unconfirmed account and shows verification UX.
- Expired, disabled, reused, and wrong-email invite codes fail.
- Verified account can sign in. Unverified account cannot enter app surfaces if that is the desired product policy.
- Existing smoke-test accounts and test docs are updated for email-confirmed users.

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

Next steps:

1. Move email and other private identity fields out of `public.users` into a private/admin-only table or safe RPC/view.
2. Revoke broad table-level `UPDATE` on `public.users` from `anon` and `authenticated`.
3. Grant update only for approved public profile columns.
4. Treat `users.admin_role` as display-only. Use `user_roles` and operator RPCs for all server-side authority checks.
5. Add a participant guard to `mark_dm_messages_read`, using the bridge DM read helper as a pattern.
6. Add fixed `search_path` to SECURITY DEFINER functions.
7. Revoke generic `EXECUTE` on internal SECURITY DEFINER helpers and grant only an explicit allowlist.
8. Enable RLS or static-config treatment for `notification_sounds`.
9. Add bucket file size and MIME-type limits for avatars, banners, chat uploads, and message media.
10. Sanitize upload filenames server-side or in shared helpers before storage writes.

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

1. Add an `is_user_channel_banned(userId, 'general_chat')` check to `bridge-group-send` before message insert and AI side effects.
2. Add bridge function tests for banned bridge users.
3. Enforce `dm_discoverable IS TRUE` in bridge user search and recipient resolution unless the conversation already exists.
4. Gate `postToChat` on caller eligibility and General Chat ban status.
5. Add per-user AI quotas/rate limits before provider calls.
6. Separate "get an AI answer" from "post the AI answer to chat" permissions.
7. Add rate limits, bootstrap secrets, or recovery-token checks to bridge register/pairing begin flows.
8. Reduce returned identifiers from bridge bootstrap endpoints where they are not needed by the client.

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

Next steps:

1. Create a shared safe-fetch helper for Supabase functions where possible.
2. Use manual redirect handling with `redirect: 'manual'`.
3. Validate each redirect target before following it.
4. Resolve and block unsafe A and AAAA records.
5. Block loopback, private, link-local, ULA, multicast, metadata IPs, `0.0.0.0`, carrier-grade NAT ranges, and IPv4-mapped IPv6 forms.
6. Cap redirects, response size, content type, and fetch duration.
7. Mirror equivalent hardening in the Netlify media helper.

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
- Live Netlify settings were not verified during the audit because the CLI status command failed locally.
- Render config keeps sensitive values unsynced, which is good, but live dashboard secrets/logging were not verified.
- No Vercel project config was found.
- Several Supabase functions intentionally use `verify_jwt = false` and must rely on complete custom auth/rate limiting.

Next steps:

1. Add staged Netlify headers for `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection, and CSP.
2. Build CSP in report-only mode first so Supabase, Bunny, Meta/oEmbed, media, and provider calls can be observed safely.
3. Verify live Netlify site settings, environment variables, deploy hooks, domain redirects, and production headers.
4. Verify Render worker env vars are scoped to server-side secrets and log output does not expose provider credentials.
5. Confirm all `verify_jwt = false` Supabase functions have custom auth, abuse limits, and tests.
6. Align local and CI Node version strategy. Current local Node is newer than the GitHub workflow build runtime.

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
