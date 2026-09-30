# Consistent chat scrolling and read restoration — September 30, 2026

## User requirement and scope

Tayler reports that chats sometimes open at the wrong last-read/first-unread position, jump while loading, and auto-scroll unpredictably. The quality target is an iMessage-like experience: stable, immediate, predictable, and smooth. This is a primary correctness requirement, not optional animation polish.

Apply the behavior and regression checks across General Chat, General reply threads, DMs, and ShadowPin comment conversations. Include opening a conversation through notifications, search, saved/pinned content, or replies. The General Chat pinned-message popup is a separate saved-content list, not a conversation with its own unread cursor. Keep paused Boards/News/Art/ESP surfaces paused.

This document extends the [performance audit](PERFORMANCE_AND_QOL_AUDIT_2026-09-30.md). It defines the required behavior and implementation/validation plan; it does not claim fixes are implemented or that any software can be proven universally bug-free.

## Opening and returning to conversations

| Situation | Required destination |
| --- | --- |
| Explicit notification/search/reply/message link | The exact visible, authorized target; load its page first. An unread or bottom-follow effect must not override it. |
| Return to a conversation still being read in this session | Restore the previously visible message ID and its offset. New arrivals do not erase that reading position. |
| Ordinary fresh open with unread messages | First unread, with enough preceding context to recognize where reading stopped and a stable unread divider. Resolve authoritative cursor and message window before revealing the final position. |
| Ordinary fresh open with everything read | Latest messages at the bottom. No intermediate top/latest/unread flash. |
| Deleted or inaccessible target | Resolve a safe nearest-visible fallback or show an explicit unavailable state. Never expose hidden content or silently mark the entire conversation read. |
| Fresh open without any saved cursor | Use the documented surface default; do not mistake a cursor fetch failure for “everything read.” |

An exact target is an intentional navigation action. Ordinary return restoration should not override an exact link. Saved visual position is distinct from the durable read cursor: moving the viewport must not falsely acknowledge unread messages.

## Scroll ownership and interruption rules

One controller owns scroll intent for each mounted conversation. Existing fetchers/read APIs remain surface-specific; they report results to the controller rather than independently ordering scrolls.

The controller tracks explicit states: resolving initial position, locating an exact target, settling layout, reading history, following latest, prepending history, and an explicit jump to latest. It also tracks user/conversation generation so an old request, animation frame, observer callback, or timer cannot move a newly opened conversation.

- User scrolling away from the bottom cancels automatic following and stale scheduled correction. Incoming messages increment an indicator instead of pulling the reader down.
- At the bottom, new messages and composer/media resizing keep the bottom stable. Internal corrections are immediate and should not create repeated visible animated travel.
- “Jump to latest” is explicit, loads the right window, and enables following only after landing. Sending one's own message deliberately reveals that message; a late completion cannot navigate a different conversation.
- History prepend preserves the top visible message ID and pixel offset. Total scroll-height subtraction is insufficient if a capped list also evicts messages from the other end.
- Keyboard opening/closing, orientation changes, and composer growth preserve the same reading anchor when browsing history. When following latest, keep the newest message above the keyboard/composer.
- Images, video metadata, fonts, link previews, reactions, edits, and reply-summary changes must not shift the reader to a different message. Reserve media dimensions where available and correct layout around a stable visible anchor.
- Reconnect and foreground return reconcile data without replacing a history window with latest. Do not repeat initial unread positioning merely because a background refresh finished.
- Scroll only the intended chat container. Page-level ancestor scrolling must not displace the shell, modal, header, or underlying feed.
- Honor Comfort reduced-motion settings for intentional animated navigation. `scroll-behavior: smooth` everywhere is not a solution to conflicting scroll commands.

## Read-state rules

Read acknowledgement requires an active, visible conversation and a readable message in the settled viewport. Fetch completion, mounting a row outside the viewport, opening a modal over a feed, or beginning an animated jump are not proof the user has seen the latest message.

- Resolve the cursor using stable `(created_at, id)` ordering; support same-timestamp messages and unavailable old cursor targets.
- Fence cursor loads, writes, and post-await effects by account and conversation. A → B → A switching must not reuse stale completion work.
- Do not advance a cursor across an unloaded gap. Do not mark later history read when targeting an older message.
- Preserve a pending cursor write safely across transient failure; flush only a verified observed target on background/close.
- Separate “clear the badge/notification” from “read to the end.” Opening Pins comments cannot by itself prove every offscreen comment has been read.
- Keep unread marker placement stable during the initial reading session; removing/moving the divider must not cause a visual jump.

## Implementation approach

1. Add failing behavior coverage for initial unread restoration, exact targets, async surface changes, and history anchors before reorganizing the controllers. Reuse existing `useUnreadScroll`, cursor APIs, and bounded-window helpers where their contracts fit.
2. Establish one tested scroll/read contract with surface adapters. General and DMs already share parts of this; General reply sheets and ShadowPin comments need separate integration work. Do not assume a General Chat patch reaches all surfaces.
3. Replace competing timers/listeners incrementally. A typed scroll intent plus a cancellable layout-settle operation should replace independent “scroll now, next frame, then again later” code where that code is proven redundant. Preserve necessary Safari keyboard handling until physical-device validation replaces it.
4. Keep cached content readable while resolving new data, but do not expose an incorrect initial viewport. Use a stable sized loading placeholder where the correct target is not available. Reserve initial position before revealing content.
5. Add or extend missing read/window contracts for Pins if needed. This requires an explicit backend design with existing privacy/RLS and notification semantics retained; a DOM scroll helper alone cannot create unread restoration.
6. Unify attachment intake and busy/focus behavior across the applicable composers. The earlier paste proposal covers the shared General/DM/thread composer; Pins has to be audited and wired into the same policy separately.

## Cross-surface acceptance matrix

Every applicable scenario runs against General Chat, a General reply thread, a DM, and ShadowPin comments. A surface without a prerequisite must implement it or explicitly record the gap; it cannot be counted as passing by omission.

| Scenario | Passing behavior |
| --- | --- |
| Cold open, cached open, slow cursor, slow messages | Correct first unread/context on first settled presentation; no flash at another position. |
| More unread than one page; more history than the retained window | Load around the correct boundary and preserve stable ordering without skipping or duplicating rows. |
| Delayed or failed cursor fetch | Retry/recovery state; no silent “all read” fallback. |
| Exact target above/below loaded window | Correct target remains visible after all initial effects settle. |
| Deleted/blocked target or cursor row | Safe deterministic fallback; no early read advancement. |
| A → B and A → B → A during fetch, send, read flush, or jump | Old completions cannot alter current viewport, content, or read state. |
| Load older at the 200-message DM cap | Same visible anchor and offset despite eviction at the other end. |
| Incoming message/reaction/reply while reading history | Anchor remains stable; pending indicator updates; no forced jump. |
| Incoming message while following latest | Latest remains visible without repeated animation or oscillation. |
| User touch/wheel interrupts restoration or animation | User intent wins immediately; no delayed snap-back. |
| Own send, upload completion, failure and retry | Intended sent/pending row is visible in the right conversation; focus and draft remain usable. |
| Keyboard open/close, growing multiline composer, orientation | Bottom or history anchor retained according to current intent; no shell/ancestor scroll. |
| Slow images/video/link preview and edit/reaction height changes | Anchor remains stable before and after content size changes. |
| Reconnect, foreground return, offline/online | Restore/reconcile at the current anchor; no duplicate reset to latest. |
| Open/close Pins comments or a reply sheet | Underlying feed retains its location; reopened conversation follows the destination rules above. |
| Reduced motion, larger text and comfort spacing | Same correctness with accessible, appropriately reduced transitions. |

Record target ID, top-visible ID plus offset, cursor before/after, scroll intent, pending count, data-window bounds, and any unexpected scroll commands. Tests must assert position and read state after delayed work settles, not merely the presence of a scroll container.

For stable-layout automation, use a narrow pixel tolerance around the same visible anchor (initially 2 CSS pixels); account explicitly for legitimate viewport and font rounding changes. Record frame gaps and input latency on representative devices. The user-facing gate is no wrong destination, no unintended read acknowledgement, and no unsolicited viewport jump in the matrix, not a single green screenshot or an average frame rate.

## Release evidence required

- Focused unit/integration tests plus deterministic browser fixtures that reorder cursor, snapshot, realtime, media, and send completions.
- Phone-sized WebKit and Chromium, followed by physical installed iPhone and Android PWA testing, plus desktop sanity coverage.
- Two-account send/realtime/unread checks on an approved isolated test environment; no unapproved production seeding.
- Repeat the matrix with populated, media-heavy, long conversations. Capture failures and verify test-created message/media cleanup.
- Compare performance before/after with equivalent content and conditions. The earlier WebKit emulation stalls are an investigation lead, not physical-phone certification.
- Complete normal lint, TypeScript, build, targeted regression, documentation, and applicable deployment gates after actual code changes. No release completion while cross-surface or physical-device gaps are silently untested.

## Audit addendum evidence

Focused findings are recorded in `output/audit-2026-09-30/read-position.md` and `output/audit-2026-09-30/pins-scroll.md`. Source-level risks must remain distinguished from executable or physical-device reproductions.
