# Chat performance, notifications, and composer audit — September 30, 2026

This document preserves the pre-implementation audit snapshot. Tayler subsequently approved implementation and release; current changes and verification are tracked in [the implementation record](features/chat-smoothness-implementation-2026-09-30.md).

## Recommendation

Start with reliable read-position restoration and scroll ownership across every active conversation surface, notification privacy, the reproduced message-state bugs, and paste support. Then optimize cache/render work and measure again on real phones. Avoid a broad rewrite: this app already has useful message windowing, lazy feature bundles, upload validation, and reconnect safeguards.

Tayler's follow-up explicitly makes dependable last-read/first-unread placement, stable loading, and predictable auto-scroll a shared requirement for General Chat, DMs, and Pins. The [cross-surface scroll and read-position contract](CHAT_SCROLL_AND_READ_POSITION_CONTRACT_2026-09-30.md) defines destination precedence, user interruption, media/keyboard anchoring, read acknowledgement, and physical-device acceptance. General reply threads and ShadowPin comments are included; a patch to the shared General/DM composer or scroll hook alone does not cover all of them.

This is an investigation and implementation plan. No application source, schema, push settings, or deployment was changed. The audit produced this report, local evidence, and deliberately failing regression reproductions. Existing unrelated Unity and agent-guidance changes were preserved.

## Expected member-facing improvements

- Open at the correct first unread message, even after more than a page of activity; return to the same reading position when revisiting an open conversation.
- Read older messages without incoming content, delayed loads, keyboard movement, or media resizing pulling the screen away.
- Use an explicit new-message indicator and Jump to latest action when browsing history; follow new arrivals smoothly when already at the bottom.
- Open notification/search/reply targets once, with clear unavailable-target fallback and no accidental read-to-latest acknowledgement.
- Paste screenshots/files, review attachments before sending, see upload progress, cancel or retry without choosing the file again, and keep text drafts intact.
- Give Pins comments the same read/scroll expectations and properly designed attachment support; add View in chat to General pinned cards.
- Keep notification privacy and device-disable choices dependable; honor conversation mutes even during retries and retain unread counts through transient network failures.
- Avoid messages appearing under the wrong DM header, disappearing during refresh, or losing reply summaries.
- Reduce visible waiting with bounded server queries, less synchronous cache work, fewer unnecessary renders and duplicate background requests.
- Preserve accessible larger text/spacing, reduced motion, iPhone keyboard behavior, and Android/desktop functionality throughout these changes.

## Scope and evidence

- Checkout: `codex/release-restart-loop-20260814`, HEAD `cae13dda5ebbd09303440edf2a5a73c8382f61d0`.
- Live health manifest reported production commit `fef865dee100b6c6ef92926c62faaab0a2ea1f04`. The diff from that commit to HEAD is empty for `src`, `public/sw.js`, `supabase`, and the scroll probe. This establishes source correspondence for those paths, not deployed Edge Function or database parity.
- Reviews: Sol 6.1 for chat/realtime and notifications; Sol 6 for composer/uploads; Luna for startup/background inventory; one Astra review independently challenged the highest-risk findings.
- Read the current source, applicable contracts, migrations where relevant, and targeted tests. Ran a fresh production build, existing focused tests, fault-injection reproductions, and authenticated local-preview browser probes with the existing test account. No test messages or Storage objects were created.
- Browser activity can exercise normal test-account presence/read-cursor bookkeeping. These were not seeded-message tests. No live push was sent and no production migration or function was deployed.
- Severity: P1 = prioritize because of confidentiality, lost visible state, or a primary requested workflow; P2 = important reliability/performance/QoL work; P3 = follow-up. Effort estimates are relative, not delivery promises.

## What the performance measurements actually show

Fresh `npm run build` passed, including paused-feature and bundle-budget checks:

| Measurement | Result |
| --- | --- |
| Initial HTML/preload assets | 8 files; 1.20 MiB raw / 324.07 KiB gzip |
| Largest eager JavaScript | 475.21 KiB raw / 143.09 KiB gzip |
| Phaser / Babylon | Both lazy; 1.15 MiB / 1.06 MiB raw |
| Total deploy | 94.71 MiB; this is not the initial download |

Unobstructed local-preview probes used six scroll cycles, then three forced-top samples, against existing messages. Both final screens were visually checked. The release-announcement RPC alone was fulfilled with an empty result in the test browser to prevent a production release announcement from covering the local preview.

| Browser profile | Final loaded / rendered rows | Chat DOM nodes | Frame samples | Gaps >50 ms | Largest gap |
| --- | --- | --- | --- | --- | --- |
| Chromium / Pixel 7 emulation | 101 / 90 | 2,649 | 330 | 0 | 50 ms rounded |
| WebKit / iPhone 13 emulation | 101 / 90 | 2,649 | 57 | 33 | 505 ms |

WebKit's two-second empty-page control had 125 frames, maximum 25 ms, and no gaps over 50 ms. Chromium's control had 117 frames and one gap over 50 ms. The WebKit result warrants a targeted trace and real-iPhone investigation, but does not identify a particular React component or prove physical iPhone performance. These are single local desktop-emulation observations, with live network/media variability and different viewport dimensions; they are not statistically controlled hardware benchmarks. Zero reported WebKit long tasks is not evidence of zero stalls because observer support is not validated by the probe.

Earlier probe runs are excluded: the original runner selected a hidden `Lounge` label, and later screenshots showed a release modal covering the feed even though metrics reported success. The probe has no performance-threshold assertion. A green status alone is therefore not a responsiveness verdict.

Evidence: `output/audit-2026-09-30/build.log`; `output/playwright/audit-20260930-android-unobstructed/summary.json`; `output/playwright/audit-20260930-webkit-unobstructed/summary.json` and their screenshots. The consolidated disposable runner is `output/audit-2026-09-30/scroll-probe.mjs`.

## Priority fixes

### Read-position addendum — P1

Two additional executable regressions were reproduced in the shared `useReadCursor`: an old scope's delayed fetch overwrites the active scope's cursor, and an older refresh overwrites a successfully advanced newer cursor. `src/hooks/useReadCursor.ts:94-96` publishes the result without a scope/generation fence or monotonic merge. Fix stale result publication first, including loading/error/finally state and account changes.

A third new regression shows that an exact-message route can mark a later visible message read while cursor loading and target restoration are unresolved (`useUnreadScroll.ts:304-306,409-415`). Unify read-readiness gating across ordinary unread restoration and exact routes, including cleanup/background flushes. Together with the first pass, there are now six deliberately failing executable regressions against unchanged app source.

General Chat also explicitly skips its cursor-window fetch when the saved cursor predates the latest loaded page (`MessageList.tsx:264`). Existing tests expect that behavior. Meeting the requested first-unread guarantee therefore requires changing that product contract and its tests, not just speeding up scroll animations. Fetch around the actual boundary, then reveal the stable viewport.

The first implementation packet must cover these cases and validate General, DM, General replies, and Pins independently. Detailed addenda: `output/audit-2026-09-30/read-position.md` and `output/audit-2026-09-30/pins-scroll.md`.

General reply sheets currently ignore the cursor/loading result, initially fetch latest, and have competing exact-target and bottom-follow effects (`GeneralChatThreadSheet.tsx:74,124-149`). Their target/follow/count refs also persist across close/reopen and thread changes. Integrate them explicitly into the shared destination/readiness policy; a change to the General feed hook alone does not fix reply sheets. These are source-confirmed paths; physical/browser race reproduction remains part of implementation acceptance.

### Pins parity addendum — P1/P2

- ShadowPin discussions fetch the latest 40 comments plus an optional exact target, without a per-comment read cursor or first-unread window. Loading invokes a parent callback that clears destination discussion notification events. To match the requested read semantics, add a private per-image comment cursor and bounded window around its boundary, then clear only through readable, settled content. `ShadowPinCommentsDialog.tsx:403-411`; `shadowPinApi.ts:1284-1344`; `ShadowPin.tsx:4877-4882`. This is a server/client contract addition, not a scroll-animation tweak.
- The exact-comment scroll effect depends on the whole comments array and has no settled-target guard (`ShadowPinCommentsDialog.tsx:443-451`). Later edits, reactions, creates, deletes, or older-page merges can reassert the target after the reader moved. Resolve once per pin/target generation, then release control.
- Older-page prepend has no explicit visible-comment/offset restoration (`:419-433,602-614`). Native browser anchoring may help in some layouts; test it rather than claiming every prepend jumps. Require explicit stable-anchor acceptance through reply grouping and media changes.
- An old pin's pending refresh can publish comments into a newly selected pin (`:403-417,435-451`). Fence responses and target/read callbacks by image/account generation. This is source-supported; a production failure was not induced.
- Pins has no intentional follow-latest/new-comments policy. Define own-send reveal, bottom following, and a new-comments indicator while anchored (`:484-499,587-654`).
- The comment textarea is separate and text-only (`:665-681`), so the shared chat paste patch cannot provide Pins attachment parity. Specify attachment records, ownership/validation, uploading, rendering, retry/cleanup, and accessibility for comments as a distinct implementation step.
- The General Chat pinned-message popup offers reactions/unpin but no canonical-context navigation (`PinnedMessagesButton.tsx:73-85`; `PinnedMessageItem.tsx:61-133`). Add **View in chat**, routed through the same exact-target controller, with Back restoring the previous reading position.

### 1. Web Push ignores the lock-screen preview privacy setting — P1

Settings offers “Private — Generic lock-screen copy,” but the legacy Web Push sender does not fetch `notification_preview_mode`. It constructs a DM payload with sender identity and message preview, which the service worker displays directly. “Sender only” can likewise receive message content. OS preview settings can independently hide it, but the app setting is not enforced by this path.

Evidence: `src/components/settings/SettingsView.tsx:1013`; `supabase/functions/send-push/index.ts:329,985`; `public/sw.js:303`. The native v2 delivery function does apply privacy policy; that does not protect the separate PWA/Web Push route. Independently confirmed by a second reviewer. Do not infer a separate rich-media leak: legacy payloads currently contain no avatar/image fields.

Fix: construct all push previews through a common privacy policy, selected before payload creation. Cover full/sender-only/private for DM, mentions, replies, and reactions. Validate actual background lock-screen delivery on iPhone and Android. **Medium effort; medium compatibility risk; backend release required.**

### 2. A delayed DM send can appear in the newly selected conversation — P1

Send in conversation A, switch to B while the insert is pending, let B finish loading, then resolve A's insert. The completion unconditionally merges A's message into the active messages array. A scratch hook regression reproduces `messagesConversationId = B` alongside A's message.

Evidence: `src/hooks/useDirectMessages.tsx:1114`; `src/components/dms/DirectMessagesView.tsx:913,1628`. Fetch/realtime guards already exist but do not guard this completion. This is incorrect display of an authorized message; it does **not** send A's text to B.

Fix: scope completion, optimistic reconciliation, and failure recovery to the captured conversation ID/generation. Preserve A's outbox while leaving B's visible state untouched. **Small to medium effort; medium state-management risk.**

### 3. A refresh can erase a newly received realtime message from the visible feed — P1

A latest-window request starts, a realtime root arrives and is accepted, then the older request snapshot resolves. Replacement preserves pending local messages but not the accepted realtime row. A scratch test verifies that the row is present before the response and absent afterward. This is visible-state loss, not database deletion.

Evidence: `src/hooks/useMessages.tsx:459-467,891-895`. Fix with snapshot/event reconciliation or generation-aware replay, while honoring deletions, moderation, and visibility changes. Simply unioning every old row forever would be unsafe. **Medium effort; higher reconciliation risk.**

### 4. Refreshing one thread clears other threads' summaries — P1

`refreshThreadSummaries([rootId])` fetches the selected root, then maps all loaded messages and treats every missing map entry as `null`. Other roots lose reply/unread summaries. A scratch regression reproduces an unrelated root's five-reply summary becoming null.

Evidence: `src/hooks/useMessages.tsx:835-855`. Fix by restricting updates to requested IDs and distinguishing “not requested” from “requested and absent.” Test multiple populated roots and out-of-order refresh responses. **Small effort; low to medium risk.**

### 5. Add paste through the shared composer, with attachment review — P1

The textarea has `onChange` and `onKeyDown`, but no binary clipboard or drop handler. Hidden picker inputs are the only file intake. General Chat, DMs, and thread replies all use this component, so one shared implementation can address all three.

Evidence: `src/components/chat/MessageInput.tsx:448-534,856-895`; `tests/MessageInput.test.tsx:246-265` tests pasted URL text by changing the value, not a binary paste event.

Recommended behavior: paste an exposed screenshot/file into a small attachment tray with name/size/preview, remove/retry controls, and explicit Send. Keep existing text and caret intact. Use the same MIME/size validation, image optimization, thumbnail generation, and uploader as the picker. Share one intake function between picker, paste, and later drop support. The existing picker immediately sends a selection, so staging is an intentional QoL change that should be applied consistently.

Use `ClipboardEvent.clipboardData` within the user's paste event. Accept only file data the browser exposes, deduplicate `files`/`items`, and leave plain text and URLs on the normal paste path. Do not fetch arbitrary HTML image URLs from clipboard markup. Browser/file-manager/phone clipboard combinations vary; retain the picker fallback. [MDN clipboardData](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent/clipboardData), [MDN DataTransfer files](https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files).

Acceptance: text/multiline/URL paste; screenshot; supported document; empty MIME with supported extension; rejected MIME/oversize; mixed text+file; explicit multiple-file policy; duplicate clipboard representations; cancel/retry; busy/disabled controls; navigation/auth interruption; General/DM/thread parity; iPhone keyboard retention. **Medium effort; medium browser/lifecycle risk.**

### 6. Partial multi-device push delivery loses retry eligibility — P2

When device A accepts a push and device B returns a transient failure, any success marks the event `sent_at`. Subsequent sender/recovery paths skip the aggregate event or mark its job delivered. A fault-injection harness ran the extracted delivery function with responses 201 and 503: it reported both a success and a retryable failure, yet wrote `sent_at`.

Evidence: `supabase/functions/send-push/index.ts:798-827,972,2468`; `supabase/migrations/20260805112141_harden_web_notification_recovery.sql:176,323`. A per-subscription success ledger already exists, but outer aggregate gates prevent failed endpoints from reaching retries.

Fix: retain per-endpoint retry eligibility and derive event completion from all eligible endpoints reaching a terminal outcome. Do not resend to successful endpoints. Test success+temporary failure, permanent 404/410, retry exhaustion, and concurrent workers. **Medium to large effort; high duplicate/loss risk; backend/migration review.**

### 7. Device-level Disable does not survive automatic resynchronization — P2

Disable deletes/unsubscribes without storing durable device opt-out. Browser permission remains granted, and automatic synchronization can create and enable another subscription. Settings cache and the global six-hour throttle can postpone the effect; it is not necessarily immediate.

Evidence: `src/lib/push.ts:529,609,628`; `src/hooks/usePushNotifications.ts:50`; `src/components/notifications/PushSubscriptionSync.tsx:46`. Fix by distinguishing explicit user opt-out from a missing/expired subscription. Only an explicit Enable should clear that device choice. Test reload, Settings reopen, focus, and account switching. **Small to medium effort; medium enrollment risk.**

## Optimization and additional QoL backlog

These candidates are ranked within their areas. Source-level work is confirmed where described; speedup claims require before/after measurement.

| ID | Priority / evidence | Improvement and verification |
| --- | --- | --- |
| PERF-1 | P1; avoidable work confirmed | `useMessages.tsx:665-680` reads/parses/sorts `chatHistory` in an immediately executed initializer on every provider render. Make initialization lazy and account-aware; test render count/cache reads and sign-out switching. Small effort. |
| PERF-2 | P2; avoidable work confirmed | `useMessages.tsx:176-184,1168` synchronously serializes/writes history after message changes. Coalesce cache writes outside the immediate interaction path, retain only needed fields, and preserve recovery semantics. Measure serialization/write cost with realistic history/media metadata. Small/medium effort. |
| PERF-3 | P2; architecture candidate | Narrow broad message/DM context invalidation and stabilize row props/actions. Profile reaction, typing, send, badge, and presence updates before adding memoization. Memoization alone does not prevent context-driven renders. Medium effort. |
| PERF-4 | P2; bounded DOM, growing history | General Chat caps rendered rows, but anchored historical state can continue accumulating. Bound retained pages with stable reloadable cursors and row-ID/offset anchoring. Do not mistake the 90-row render window for a bound on all retained state. Medium/high risk. |
| PERF-5 | P2; source-level scroll risk | Review DM prepend anchoring once the 200-message cap evicts newer rows: total `scrollHeight` delta no longer equals prepended height. Anchor a stable visible message ID plus pixel offset. Verify 200+ history with mixed media. Medium effort. |
| PERF-6 | P2; periodic work confirmed | `usePresence.tsx:57-62,143-164,326-342` polls full state every 30 seconds while visible and emits subscribers even for unchanged snapshots. Compare normalized state before emitting; retain stale-presence recovery. Medium effort. |
| PERF-7 | P2; hidden-tab work confirmed | `AppReleaseGate.tsx:295-300,330-336` polls releases every minute without checking visibility. Skip hidden interval refreshes and retain focus/reconnect refresh. Small effort. |
| PERF-8 | P2; limited cohort | `FirstRunActivationCoordinator.tsx:88-96,175-190` refreshes every 3.5 seconds during first-action onboarding. Prefer action-triggered refresh plus slower fallback. Small effort; not a general explanation for established-user lag. |
| PERF-9 | P2; startup hypothesis | Trace simultaneous weather, push, release, invitation, presence, and chat startup. Defer only nonessential work that a trace shows competing with chat. Invitation host is only about 10.7 KB; do not remove working invitations for a speculative gain. Medium effort. |
| PERF-10 | P2; measured bundle, unknown startup cost | Initial gzip transfer already passes budget. Investigate the eager Motion/chat closure and optional feature imports after interaction-path fixes; retain lazy engines. Measure time-to-usable-composer, not only raw bundle size. Medium effort. |
| PERF-11 | P2; memoization defeated | `MessageList.tsx:717-732` and `DirectMessagesView.tsx:1350-1373,1628-1644` recreate jump callbacks when the message array changes, so unchanged memoized rows receive changed props. Stabilize callbacks with current refs; compare row commit counts on inserts/reactions. Small/medium effort. |
| PERF-12 | P2; layout-work candidate | `useUnreadScroll.ts:208-257,402-407,559-605` scans mounted row geometry during scrolling and observer callbacks; message-map changes recreate observers. Track candidate visible IDs and avoid reconnecting when mounted IDs are unchanged. Preserve read thresholds. Medium effort/risk. |
| PERF-13 | P2; redundant fetch paths | One reply can trigger canonical-message, broadcast, and mapping summary invalidations (`useMessages.tsx:1256-1281,1345-1348`). Batch per-root invalidations and guard response ordering while retaining fallback event paths. Measure request count before/after. Medium effort. |
| PERF-14 | P2; source-level interaction risk | Thread summary refresh restores captured scrollTop synchronously, twice via animation frames, and after 120 ms (`useMessages.tsx:842-865`). Cancel stale restoration on user movement and use stable row anchoring. Also preserve anchored history during reconnect instead of always loading latest (`:1141-1155`). Browser reproduction required. |
| QA-1 | P1; reproduced harness weakness | Replace hidden-text startup selector with visible chat readiness, assert no blocking overlay, record observer support, and add meaningful frame/interaction budgets. Current green metrics status can conceal blocked screens and 500 ms gaps. Small/medium effort. |
| QA-2 | P2; instrumentation gap | `src/lib/telemetry.ts:38` disables tracing. Add narrowly sampled, content-free timing for input-to-paint, send-to-optimistic-row, send acknowledgement, realtime arrival, reconnect catch-up, and notification delivery stages. Preserve telemetry redaction and avoid message bodies/identities. Medium effort. |
| UP-1 | P2; concurrency bug | Picker handlers each set one shared upload boolean true/false; concurrent uploads let one completion clear the other's busy state. Controls do not consistently guard disabled/busy state. Use one composer upload controller or pending count for every intake path and thread surface. `MessageInput.tsx:448-534,790-879`. |
| UP-2 | P2; progress/recovery gap | Expose tus progress and cancellation; distinguish optimizing/uploading/sending; retain the selected File for retry. `supabase.ts:647-690`; `MessageInput.tsx:448-534`. Medium effort. |
| UP-3 | P2; cleanup risk | Upload succeeds before message insertion; failure paths do not clean up unreferenced assets. Track object paths and ownership; delete only after a definite unreferenced outcome, never while an ambiguous send/outbox may refer to them. `MessageInput.tsx:455-530`. Medium consistency risk. |
| UP-4 | P2; type mismatch | Picker classification reads `file.type`, while validation can infer MIME from extension. A valid empty-MIME MP4 can become a generic file. Classify and record metadata using the validator's resolved MIME. `MessageInput.tsx:504-509`; `uploadLimits.ts:153-184`. Small effort. |
| UP-5 | P2; performance hypothesis | Large image decode/canvas work is on the main thread; failed optimization and GIF/SVG can retain large originals, while image uploads bypass the generic file tus threshold. Measure image import on phones; add pixel safeguards and appropriate resumable transport. `imageOptimization.ts:26-113`; `supabase.ts:749-790`. |
| UP-6 | P2; interruption durability gap | Text clears before durable pending-send persistence; outbox persistence happens on catch. Terminating the PWA before catch can lose the pending draft. Persist intent before clearing and reconcile by client ID. `MessageInput.tsx:260-275`; `useMessages.tsx:1453-1489,1551-1565`; `useDirectMessages.tsx:1038-1064,1127-1139`. Higher recovery risk. |
| UP-7 | P3; product gap | All picker handlers read only the first file and inputs are single-select. Define an explicit one-file or bounded-batch policy for paste instead of silently dropping extras. `MessageInput.tsx:449,473,498,856-877`. |

Additional notification findings need targeted tests before release:

| ID | Priority / evidence | Improvement and verification |
| --- | --- | --- |
| NOTIF-1 | P1; policy gap confirmed in source | Recovery omits the conversation-mute check used by immediate DM/reaction delivery (`send-push/index.ts:940-946,1253-1255,2339-2447`). If the first delivery fails and the user then mutes that conversation, a queued retry can still deliver. Return canonical conversation metadata and recheck the shared eligibility policy immediately before retry. Test 503 → mute → recovery cancellation. |
| NOTIF-2 | P2; degraded-channel gap | SW suppresses push for a visible window and emits `SHADOWCHAT_FOREGROUND_PUSH_SUPPRESSED`, but no runtime receiver handles it (`public/sw.js:282-301`; `App.tsx:348`). A stalled Realtime connection can therefore lose its fallback. Handle the receipt with debounced, event-ID-deduplicated canonical recovery and session guards. |
| NOTIF-3 | P2; recovery starvation | Foreground recovery fetches only the oldest 20 events without paging; handled/installation-claimed events can remain in that page (`notificationApi.ts:63-71`; `NotificationCoordinator.tsx:229,268-271`). Add bounded cursor recovery or receipt-aware selection; test 25+ missed events without an unbounded banner storm. |
| NOTIF-4 | P1; source-level privacy race, no executable repro yet | Coordinator checks event ownership before awaiting preferences/claim, then can enqueue after the account changes (`NotificationCoordinator.tsx:217-253,307-316`). Fence post-await publication by auth generation and user ID. Test a deferred A claim resolving after B signs in; server RLS does not cancel a response already authorized for A. |
| NOTIF-5 | P2; redundant work | Routine events force-refresh preferences despite a 30-second cache, read three settings sources, and re-register the installation for claims (`NotificationCoordinator.tsx:134-143,237`; `notificationApi.ts:39-48`; `notificationInstallation.ts:117-122`). Reuse fresh data, explicitly invalidate on settings changes, and coalesce badge bursts. Preserve privacy/mute freshness. |
| NOTIF-6 | P2; incorrect unknown-as-zero behavior | Transient badge RPC failure publishes empty counts (`appBadge.ts:259-270`) and backend badge lookup returns zero (`send-push/index.ts:574`). Retain per-user last-known counts or omit an unknown push badge; clear only on successful zero or logout. Test error/recovery/account isolation. |
| NOTIF-7 | P2; recovery metadata parity | Recovered DM reactions omit `isDm` and canonical target metadata needed for conversation-based tray clearing (`send-push/index.ts:2426-2445`; `public/sw.js:160-173`). Share immediate/recovery payload construction and verify clear-on-read. Canonical routing is retained; do not call this a proven routing failure. |
| NOTIF-8 | P3; documentation drift | Primary notification plan describes Netlify scheduling while the later bounded recovery migration schedules Supabase Cron (`20260805135200_enable_bounded_web_push_recovery_cron.sql:47-84`). Reconcile the docs after verifying actual deployed scheduler identity. Keep the separate native worker and old heavy response collector paused. |

See the focused reports for counterevidence, full source references, and composer acceptance cases.

## Live server review added at Tayler's request

The later server pass used read-only production metadata, definitions, aggregates, advisors, and bounded logs. It did not run migrations, change configuration, send push notifications, invoke recovery jobs, or execute query plans with ANALYZE. Healthy status is a point-in-time observation, not a blanket certification.

| Area | Verified result | Meaning and recommended action |
| --- | --- | --- |
| Database health | Linked project `shsqqouecvdoifzufkqm` ACTIVE_HEALTHY; PostgreSQL 17.6.1.104, us-east-2. Snapshot: 22/60 connections, no lock waiters/ungranted locks/idle transactions, approximately 318 MiB database, 99.99892% reported cache hit. | No capacity exhaustion was observed. Do not buy larger compute as the first response to client races or inefficient queries. This snapshot cannot rule out earlier spikes. |
| Migration versions | All 238 local versions match all 238 live versions; latest September 27. | No version-list drift found. Matching history is not a checksum of every object; selected live read/recovery definitions were inspected separately. |
| General Chat query cost | Cumulative `pg_stat_statements` since July 23: threaded-window RPC 631 calls, mean 617.742 ms, max 7,532.54 ms; thread summaries 2,224 calls, mean 127.7 ms, max 6,287.96 ms. | Prioritize the live window definition's materialized root set and per-row lateral summary work. Select the authorized bounded page first, then hydrate summaries for its IDs where semantics permit. Preserve stable ordering, visibility, pins, cursor/deep-link windows, and legacy compatibility. Historical means/maxima are not current p95 and may span previous definitions. |
| Query-plan corroboration | Focused EXPLAIN without ANALYZE plans a full root materialization/scan and sort before LIMIT 50; ordinary General and DM keyset probes use their existing created-at/id indexes. | The next step is a narrowly scoped query rewrite and realistic RLS-aware benchmark, not indiscriminate new indexes or an assumption that every feed query is unindexed. |
| DM inbox query cost | Same cumulative statistics: 4,472 calls, mean 141.121 ms, max 5,488.75 ms. | Inspect bounded inbox aggregation and repeated client refreshes together; benchmark realistic identities/data on an isolated copy before choosing indexes or rewrites. |
| DM read failures | Rolling 24-hour logs recorded 19 HTTP 400 requests to `mark_dm_messages_read_through`. Live signature matches client argument names; participant and target-conversation guards and stable-key bound are present. | Unresolved production symptom directly relevant to unread reliability. Obtain sanitized SQLSTATE/request correlation and reproduce with controlled accounts. Do not label a signature mismatch or relax guards without evidence. |
| Read-cursor enforcement | General setter has same-scope monotonic ordering; thread cursor path lacks equivalent canonical thread/message validation, and own-row direct writes remain permitted. Legacy all-read RPC is used when no through-message ID is supplied. | Harden normal server/client contracts and confirm intentional Mark all read stays explicit. Own-row write capability is not evidence of cross-user access. The frontend's premature selection of a later target can still legitimately advance a monotonic server cursor. |
| Deployed push implementation | `send-push` v111 ACTIVE; normalized deployed source matches local source. Privacy-mode omission, any-device event completion, and missing recovery conversation-mute recheck are present live. | These are deployed code defects, even though no private push or mixed-device failure was induced during the audit. Fix and validate both immediate and recovery paths. |
| Edge authorization | `verify_jwt=false` is paired with custom ordinary-user authentication and protected recovery authorization. | The metadata flag alone is not an auth vulnerability. Preserve the custom guards; do not mechanically toggle the flag as an audit fix. |
| Notification recovery health | Once-per-minute cron active; rolling 24 hours: 1,440 successful SQL enqueue runs, average about 25 ms/max 180 ms. No pending/processing/expired nonterminal queue jobs. 221 provider attempts were all HTTP 201 accepted. | Scheduler/queue snapshot looks healthy. SQL enqueue success is not OS display proof; provider acceptance is not device receipt. Partial-delivery edge cases remain valid defects. |
| Paused notification workers | Four old/native/collector schedules inactive; native outbox has no nonterminal items. | Preserve this state; do not activate native delivery to repair Web Push. Function ACTIVE metadata alone does not mean its scheduled worker is running. |
| API/log observations | send-push: 1,506 HTTP 200 calls, mean about 834 ms/max 9.9 s in the explicit 24-hour window. Also 12 link-preview HTTP 400s, 17 Checkers join HTTP 400s, and limited Realtime warn/error events. | Classify expected validation versus actual failures with safe request/error codes. HTTP 200 is not a per-device-delivery guarantee; aggregate duration includes recovery calls. Do not treat all 4xx as application defects. |
| Netlify production | Deploy `6abc7522c70385a4236e9f57` ready, two Node 24 functions present, Pins janitor scheduled every ten minutes. Health/SW HTTP 200 with no-store/no-cache respectively. Unauthenticated empty Pins media POST rejected with HTTP 401. | No missing deployed function or obvious hosting outage found. Netlify runtime error/latency history and successful authenticated media processing were not verified. |
| Security advisors | Live notices include 104 authenticated-callable SECURITY DEFINER functions, one intentionally anonymous username API, pg_net in public, and a leaked-password-protection warning. | Triage against the existing reviewed function allowlist/ownership guards. Counts are not counts of exploitable bugs. Verify Auth protection configuration because the live warning conflicts with older enabled-status documentation; no Auth configuration was changed or exposed. |
| Performance advisors | One WARN for `live_room_signals` auth initplan; informational notices include 127 unindexed foreign keys, 165 unused indexes, and one absolute Auth connection setting. | Rank only active, measured workloads. Do not drop quiet indexes or add 127 indexes blindly; paused features and write overhead matter. |

Explicit server log window: September 29, 2026 11:20:19 UTC through September 30, 2026 11:20:19 UTC. Queue/connection observations are later point-in-time samples, not guarantees for the whole day. No message bodies, push subscription endpoints, credential values, or private payloads were needed for these checks.

Server evidence: `output/audit-2026-09-30/server-database.md`, `server-notifications.md`, and `server-hosting.md`. The final database report includes advisor/index details and the precise limits of selected live definition comparisons.

## Suggested implementation packets and stopping conditions

1. **Read/scroll correctness and paste:** fence stale cursor results; restore the actual unread window; establish one scroll owner per conversation; protect conversation-scoped send completion; reconcile latest snapshots with realtime; preserve unrelated thread summaries; make cache initialization lazy; add staged picker/paste intake and consistent busy guards, including the separate Pins composer. Finish when all reproduced regressions and the cross-surface scroll/clipboard matrices pass. Keep changes in small reviewable commits.
2. **Notification privacy and reliability:** enforce Web Push preview policy, persist device opt-out, repair endpoint retry completion, and review recovery mute/suppression findings. Finish only with local contracts plus linked backend review and real device foreground/background/lock-screen proof. Backend changes need a separate release plan.
3. **Measured client/server responsiveness:** optimize the bounded General Chat window and related summaries using the live query-cost evidence; investigate the DM read failures; profile WebKit and a physical iPhone; coalesce cache writes, reduce context/row invalidation, stabilize long-history anchoring, and remove proven redundant background work. Re-run equivalent content, identity, device, and network scenarios before claiming improvement. Preserve RLS, scroll anchors, unread counts, and reconnect behavior.
4. **Larger QoL:** progress/cancel/retry for attachments, safe orphan cleanup, durable pending send, optional drag/drop or bounded batch uploads. Avoid mixing these lifecycle changes into an unreviewable performance rewrite.

Do not set a numeric speedup promise before a physical-device baseline. Practical release targets should include stable keyboard/caret, immediate local input response, no message disappearance or cross-thread display, correct background notification privacy, and no new unread/scroll regressions.

## Verification and remaining limits

- Fresh production build and bundle/paused-feature budgets: passed.
- Existing focused Jest tests: **14 suites / 187 tests passed** (chat 121, composer/upload 24, notifications 42). The separate Node notification scheduler test also passed. Exact commands are recorded in the linked subreports. No image-optimization test file exists; the composer command did not test that nonexistent path.
- Expanded read-position checks passed 3 suites/21 tests; Pins cross-surface checks passed 4 suites/42 tests. These runs overlap earlier suites and must not be added as unique totals. Another 14 Node hosting/safe-fetch/operations-contract tests passed.
- Six scratch regression cases intentionally fail against current code: unrelated thread summary preservation, realtime message survival across refresh, late DM send after conversation switch, cross-scope cursor refresh, cursor regression after an advance, and premature exact-target read acknowledgement. These are audit evidence outside the normal Jest roots, not new passing regression coverage.
- Partial push delivery fault injection reproduced terminal aggregate completion despite a retryable endpoint failure.
- Local browser probes: Android/Chromium and iPhone/WebKit, with existing live data and announcement RPC fixture; screenshots reviewed. This is not physical installed-PWA, keyboard, clipboard, background push, or power/network proof.
- No source implementation means lint/typecheck/full-suite reruns were not used as a substitute for behavior evidence. Final `npm run docs:verify` passed for 240 Markdown files; both audit/contract whitespace checks passed. The whole-worktree diff check reports pre-existing Unity whitespace, which was preserved.
- The expanded server pass verified migration versions, selected live definitions, deployed send-push source, advisors, query statistics, capacity, recovery, and bounded error logs. No packet-loss test, multi-account live send exercise, actual lock-screen notification, or physical-device clipboard test was completed. Production query plans were not executed with ANALYZE. The intermittent lag's dominant cause is not yet established.
- The preview server used port 4174; probes closed their owned browser/server processes and no listener remained. No test-created messages/media require cleanup. Audit evidence is retained locally.
- No commit, push, or deployment was performed.

## Focused evidence

- [Chat/realtime review](../output/audit-2026-09-30/chat-performance.md)
- [Notification review](../output/audit-2026-09-30/notifications.md)
- [Composer/upload review](../output/audit-2026-09-30/composer-uploads.md)
- [Startup/background review](../output/audit-2026-09-30/startup-background.md)
- [Read-position addendum](../output/audit-2026-09-30/read-position.md)
- [Pins addendum](../output/audit-2026-09-30/pins-scroll.md)
- [Live database review](../output/audit-2026-09-30/server-database.md)
- [Live notification operations review](../output/audit-2026-09-30/server-notifications.md)
- [Live hosting checks](../output/audit-2026-09-30/server-hosting.md)

The files under `output/` are local audit artifacts. This report is the durable repository deliverable; preserve the accompanying evidence if transferring the audit to another checkout.
