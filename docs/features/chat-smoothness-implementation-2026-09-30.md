# Chat smoothness implementation and release — September 30, 2026

Tayler approved implementing the [audit](../PERFORMANCE_AND_QOL_AUDIT_2026-09-30.md), running this as a goal, pushing to main, and manually deploying Netlify. The [scroll contract](../CHAT_SCROLL_AND_READ_POSITION_CONTRACT_2026-09-30.md) applies to General, DMs, reply threads, and Pins. Physical installed-phone acceptance will be performed by Tayler after release; browser emulation is recorded separately.

## Checkpoints

- [x] Cursor generations, monotonic reads, exact-target readiness and true first-unread windows.
- [x] One scroll owner, stable row/offset anchors, bounded history, predictable latest following across active conversations.
- [x] DM send scope, snapshot/realtime reconciliation, scoped/coalesced summaries, durable outbox and cache/render improvements.
- [x] Staged picker/paste/drop attachments, progress/cancel/retry, MIME consistency, resumable transport and image safeguards.
- [x] Pins private read cursors, bounded comment windows, attachment parity, scoped updates and General pinned-card navigation.
- [x] Web Push preview privacy, per-device retries, recovery mute checks and metadata parity.
- [x] Durable device opt-out, session-safe foreground recovery, preference/badge request reduction and unknown-count preservation.
- [x] Bounded server queries, canonical cursor validation, scoped SQL security/ordering checks and sanitized RPC diagnostics.
- [x] Unchanged presence suppression, hidden release-poll gating, activation refresh reduction and honest performance probes.
- [x] Integrated review, regression suites, lint/types/build, Node contracts, docs, audit and mobile-browser acceptance.
- [ ] Backend-first migrations/functions and parity verification; reviewed main push; manual Netlify deployment and production health/smoke.
- [ ] Final report, release notes, QA logs, task helper cleanup and Notion work note.

## Scope controls

The isolated worktree starts at `cae13dda5ebbd09303440edf2a5a73c8382f61d0`, eleven commits ahead of fetched `origin/main`; those ancestors include the already manually deployed Checkers fixes. Existing dirty Unity and agent-guide changes remain in the original checkout. No new production dependencies were introduced.

Keep paused product domains and the native notification worker paused. Do not perform the separately gated destructive private-identity Release B. Advisor inventories do not justify indiscriminate index changes or an unattended PostgreSQL version upgrade. Speculative startup changes require measured evidence before altering invitation delivery, weather behavior, or animation polish.

## Verification record

Implementation and local acceptance are complete. Baseline evidence and deliberate failing regressions remain in the audit as historical findings. Production release verification is recorded below separately from browser emulation and physical-device acceptance.

### Confirmed implementation evidence

- The General root-window benchmark used the same 4,000 roots, 1,000 replies and 80 pins with authenticated RLS. Three baseline runs averaged 234.400 ms; three revised runs averaged 86.524 ms (about 63% lower). Complete returned message and pinned JSON digests matched. This is synthetic local query evidence, not production latency or phone frame-rate proof.
- Notification tests execute partial-device delivery and retry behavior, privacy sanitization, transient authorization failure, and unknown-versus-zero badge handling. The recovery worker preserves successful endpoint receipts and retries failed endpoints.
- Live Auth configuration inspection confirmed leaked-password protection was disabled. The authorized change enabled only `password_hibp_enabled`; readback preserved the production site URL, email confirmation and signup invite hook.
- The initial integrated build exceeded the existing eager payload budget. Deferring optional release presentation brought the local build back under the unchanged limit; the GIF picker also loads on demand. No new production dependency was introduced. Transitive `brace-expansion` and `fast-uri` patch updates remove the two reported dependency advisories; the audit now reports zero vulnerabilities.
- Browser QA uses a separate local Supabase project with synthetic General/DM histories longer than the mounted window, reply threads, and Pins comments. The original checkout and existing local Supabase project remain untouched. The first Pins browser pass exposed a disappearing unread-divider layout shift; the corrected stable divider passed desktop Chromium, Android Chromium and iPhone WebKit, with exact comment/file cleanup.
- Final automated source gate: 268 Jest suites, 1,591 tests passed; 16 pre-existing TODOs remain. All 63 Node contracts, lint, TypeScript and dependency audit passed. Local build 5 passes unchanged budgets at 329.44 KiB initial gzip; optional Golden Egg presentation is also lazy. All 241 migrations applied on a fresh database, six transactional SQL suites passed, and exact security inventories/ACLs passed on both isolated databases.
- Final shared-composer clipboard-image proof staged without sending, then explicitly uploaded/sent and appeared live for the second account. The exact message and Storage object were deleted and absence verified. Earlier Chromium/WebKit runs separately verified mixed text caret insertion, staging and removal. The probe caught and fixed a resumable endpoint that omitted a local backend's port; hosted Storage URL mapping is preserved.
- Final build 5 passed all 20 integrated scenarios in Chromium and all 20 in WebKit: first visible unread frame across long histories, correct header/composer bounds, saved-row return, realtime/reconnect while reading, actual two-account sends, capped DM prepend, reply-sheet close restoration and covered Lounge read state, General pinned-card navigation, missing-target recovery, and delayed A send completion while B retains an identical draft. Each run removed five General messages, three DMs, one temporary conversation and one temporary Auth user; exact cleanup readback passed.
- Chromium reported no page errors. WebKit reported two `ResizeObserver loop completed with undelivered notifications` events while all behavior and geometry assertions passed. These are retained as a diagnostic limitation, not counted as proof of an application crash or silently discarded. Physical-device smoothness remains unverified.
- Final scrolling probes rendered 50 rows / 835 DOM nodes. Headed Chromium sampled 317 frames, maximum interval 14 ms, no intervals above 50 ms and no observed long tasks. WebKit sampled 29 frames, all above 50 ms, maximum 185 ms; its long-task observer is unsupported. The metrics command passing means it completed, not that WebKit met a smoothness target. A blank-page control was fast (maximum 18 ms), and disabling backdrop filters alone did not resolve the app result (maximum 152 ms). This remains a rendering-performance investigation for a representative physical iPhone; no unsupported CSS redesign or device-performance claim is included. These different datasets/profiles do not establish a before/after app-wide speedup.

### Local performance diagnostics

`src/lib/chatPerformance.ts` samples 5% of instrumented operations into the browser User Timing buffer, retaining at most 64 bookkeeping entries. Labels contain only a fixed surface and stage; numerical start/end timestamps are the only measure data. No message text, IDs, media URLs, routes, credentials, or network telemetry are added. Diagnostics fail closed without interrupting chat.

`input-frame` measures time to the next animation-frame callback and is a responsiveness proxy, not proof of a completed paint. Send, restoration and notification measurements cover only the explicitly instrumented client stages; they do not establish end-to-end push delivery or production server timing. Existing Sentry tracing remains disabled.

### Findings and implemented changes

| Area | Confirmed problem | Resulting behavior |
| --- | --- | --- |
| Opening conversations | Cursor loading, authoritative window commits and independent scroll effects could disagree about when the target was ready. | A shared controller waits for the correct mounted row and settled offset before first presentation; cursor-aware windows include the real first unread. |
| Reading history | Height-delta restoration breaks when a capped page also evicts rows; deferred callbacks could override fresh user movement. | ID-plus-offset anchors, bounded retained history and user-intent cancellation preserve the visible message through paging, media layout and reconnect. |
| Read state | Stale account/scope responses and early target acknowledgement could advance the wrong cursor. | Account generations, canonical server validation, monotonic cursors and visible-row acknowledgement constrain updates. Covered General history is not marked read behind a reply sheet. |
| Message delivery | Snapshot refresh could remove realtime arrivals; delayed DM completion could touch another conversation. | Snapshot/realtime reconciliation and account/conversation fencing preserve messages and the current conversation's draft/reply. Durable queued intents allow distinct rapid sends without waiting for the previous acknowledgement. |
| Thread summaries | A scoped refresh could replace unrelated summaries, while multiple events triggered redundant work. | Scoped merges, bounded batches and coalesced refreshes retain other threads and reduce requests. |
| Attachments | No shared paste path; pickers uploaded immediately; ambiguous busy state, MIME mismatch and weak retry/cleanup. | Picker/paste/drop share bounded staging, review/remove, MIME resolution, progress/cancel/retry, resumable large uploads, pixel safeguards and ownership-aware cleanup. Text paste retains normal caret behavior. |
| Pins | Comments lacked read-cursor/window parity and general pinned cards lacked a context action. | Private comment cursors, bounded windows, stable opening unread divider, exact targets, private attachments, accurate counts and General "View in chat". Existing owner comment editing was verified; it did not require a new edit RPC. |
| Notifications | Hidden-preview preference was omitted from Web Push, partial device success stopped retries, mute/account races existed in recovery. | Shared fail-closed privacy policy, per-endpoint delivery leases/receipts, retry eligibility, canonical mute checks and session-fenced recovery. |
| Device choices and badges | Automatic registration could undo Disable; failed badge reads looked like zero. | Durable device opt-out, cached/coalesced preferences and registration, preserved last-known badge state, bounded recovery paging and service-worker fallback handling. |
| Background work | Repeated cache parsing/writes, unchanged presence publication and hidden polling added avoidable work. | Lazy/coalesced cache work, stable row callbacks, observer reuse, unchanged-presence suppression, visible-only release polling and slower event-assisted onboarding refresh. Optional release, GIF and Golden Egg presentation load on demand. |
| Server | General windows materialized a broad root set; cursor integrity and recovery policy needed tightening. | Bounded-page query planning, explicit cursor guards, scoped read windows, service-only retry ledger and idle recovery-job gating. Existing RLS, paused workers and the definer allowlist remain enforced. |
| Security/diagnostics | Live leaked-password protection was disabled; two transitive dependency advisories were present. | Auth protection enabled and read back; lockfile patch updates remove the advisories; sanitized diagnostics and stricter browser readiness improve future investigations. |

### Draft and attachment recovery

New General, DM and thread drafts use authenticated account plus conversation identity, including DM list previews. In-flight completions and the first render after an account switch are scoped to that identity. Existing legacy drafts had no owner metadata: their original local storage keys are preserved, but they are not automatically displayed or assigned to the next account. This deliberate privacy transition is not an automatic migration of old drafts.

Text clears after durable local outbox acceptance and optimistic insertion; the server acknowledgement may arrive later. Retry reuses the message intent ID. Storage-pressure failure leaves the draft available instead of silently clearing it.

Picker, clipboard and desktop drop share bounded staging, resolved MIME validation, progress, cancel and retry. Definitely unsent upload cleanup failures enter a bounded account-specific local retry queue; offline or account-switched drains stop. Ambiguous sends retain their media because an accepted message or outbox may still refer to it. Pins also protects referenced private files with a database foreign key. Local storage loss or quota failure can still prevent device-local recovery; physical phone image-decode and OS clipboard behavior require device testing.

### Acceptance still requiring physical devices

After the verified release, Tayler will test installed iPhone/Android PWAs: keyboard opening/closing, caret and paste behavior, media layout while reading, rapid conversation switching, lock/reopen and reconnect, and foreground/background/lock-screen notification privacy, sounds and badges. Browser automation and local synthetic timings do not certify these device behaviors or guarantee absence of all bugs.

### Deliberate follow-ups, not established defects

The audit's PERF-3 broad-context split, PERF-9 additional weather/invitation startup deferral, and PERF-10 Motion extraction remain profiling candidates. Current evidence does not attribute a measured bottleneck to those components. Stable row callbacks, observer reuse, cache/coalescing changes, reduced background polling and genuinely optional lazy UI address the demonstrated work. A larger context or startup rewrite needs React commit counts and a cold-start network/main-thread trace first.

The historical 19 production DM read-through HTTP 400 responses remain unclassified. Canonical cursor validation, safe deleted-anchor behavior and content-free error codes are implemented; those changes are not evidence of the historical cause. No blind index additions/removals or PostgreSQL upgrade were performed. Existing reviewed function privileges and paused product domains remain part of the release contract.
