# True General Chat Threads

## Status

Wave Two Candidate 2 is implemented and accepted on
`codex/shadowchat-2.0` as of July 12, 2026. The additive shared-backend
migration and exact thread-aware `send-push` route are deployed; the 2.0
frontend remains isolated from production `main` until the full Wave Two
release gate.

## Product Contract

- The ShadowChat 2.0 General Chat feed shows only root messages. Replies live
  in a focused thread so active conversations do not crowd the room.
- A root with replies shows a compact `View thread` summary with reply count,
  unread count, and a small bounded participant preview.
- Replying from the main feed opens the thread. Replying to a reply remains in
  that thread and preserves the direct-parent preview without creating visual
  nesting levels.
- Phones use a full-height, safe-area-aware sheet with the shared mobile chat
  footer: the thread composer stays attached to the software keyboard and the
  primary bottom navigation remains available below it. Desktop uses the same
  surface as a right-side drawer with an inline composer.
- The thread presents the starting message, chronological replies, bounded
  older-page loading, and a `new replies` affordance when realtime content
  arrives while the member is away from the bottom.
- Exact routes use
  `?view=chat&thread=<canonical-root-id>&message=<exact-message-id>`. Opening a
  reply route resolves the root and focuses the exact reply. Closing an
  in-app-opened thread uses browser Back; a cold route closes by replacing the
  thread parameters.
- Existing edit, delete, reactions, attachments, GIFs, moderation, blocking,
  search, saves, push notifications, and direct reply previews remain part of
  the General Chat message contract.
- Thread message action menus render above the sheet layer, so the three-dot
  controls remain visible and usable instead of opening behind the thread.

## Canonical Data And Compatibility

`public.messages` remains the only canonical General Chat content table.
Existing clients continue to insert `reply_to` and can continue reading
`get_general_chat_message_window` as a flat message stream. Candidate 2 does
not change that RPC signature or require the production frontend to understand
threads.

`public.general_chat_thread_replies` is a server-maintained projection:

- `message_id` identifies a reply and cascades when that reply is deleted.
- `thread_id` is the stable canonical root identifier.
- `thread_started_at` preserves the root ordering key.
- `parent_message_id` preserves the reply's direct-parent relationship.

The insert trigger derives the canonical root from the parent mapping. A reply
to a reply therefore joins the original thread. Clients cannot create or
update mappings, and a reply target cannot be moved after insert. The migration
backfills every existing `reply_to` chain and fails if it cannot map the full
legacy set.

Root deletion intentionally does not delete the conversation. Existing reply
rows and their stable mapping survive, the thread reader returns an
`unavailable` starting-message placeholder, and surviving replies do not
reappear as roots in the 2.0 feed. Deleting an individual reply removes its
mapping through the message foreign key.

## Read APIs

- `get_general_chat_threaded_window(...)` preserves the established centered
  and latest-window behavior but returns only roots. Each root includes an
  RLS-aware `thread_summary`; an exact reply target resolves to its canonical
  root.
- `get_general_chat_thread(...)` returns the visible root or its unavailable
  placeholder plus a bounded chronological reply page. It accepts an exact
  target and `(created_at, id)` keyset cursor for older replies.
- `get_general_chat_thread_summaries(uuid[])` accepts at most 50 roots and
  returns visible reply count, unread count, latest reply metadata, and at most
  five recent participants.
- Direct mapping lookup resolves legacy `?view=chat&message=<reply-id>` links
  into the canonical routed thread.

The 2.0 client uses the threaded window when available. The old flat RPC stays
unchanged for the production frontend and is also the compatibility fallback
until the shared additive migration is present.

## Realtime And Read State

The mapping table is in the Supabase Realtime publication. The root feed
subscribes to mapping changes to refresh affected summaries without merging
reply messages back into the main feed. An open thread listens to both its
mapping rows and canonical message changes, then performs a short coalesced
refresh so insert, edit, and delete changes settle through the same RLS-aware
reader. Block visibility is re-evaluated whenever that reader refreshes.

The root feed also treats a canonical reply `messages` insert as a redundant
summary invalidation path: it resolves the server-owned mapping and refreshes
the affected root. This keeps a newly started thread visible immediately if a
mapping-table change event is delayed or missed while Realtime reconnects.

Thread read state reuses owner-private `user_read_cursors` with:

- `surface = 'general_chat_thread'`
- `scope_id = <canonical-root-id>`
- the paired `last_read_at` and `last_read_message_id` ordering key

The client marks the latest visible reply read only while following the bottom
of the thread. Realtime replies received above the bottom increase the local
pending count instead of forcing scroll position.

## Security And Privacy

- Canonical `messages` RLS, channel-ban enforcement, author ownership, and
  reciprocal personal-block rules remain authoritative.
- New reply validation rejects missing/self/cyclic targets, immutable-target
  changes, and replies across an existing reciprocal block.
- Existing replies, mappings, counts, participants, and previews are filtered
  through current message visibility. A blocked or otherwise hidden root uses
  the same unavailable placeholder as a deleted root; the API does not reveal
  why it is unavailable.
- Public readers are authenticated `SECURITY INVOKER` functions with an empty
  `search_path`. `PUBLIC` and `anon` execution is revoked.
- Authenticated members receive read-only, RLS-filtered mapping access. Mapping
  writes remain trigger-owned. The only definer helper is private,
  trigger-only, has an empty `search_path`, and is not executable by public
  roles.
- User metadata in roots, replies, summaries, and participants is emitted
  through `user_public_profile_json`; raw `users` rows are not exposed.
- Summary and page sizes are bounded server-side to prevent unbounded scans or
  response payloads.

## Push And Exact Handoffs

General Chat reply push delivery resolves `general_chat_thread_replies` and
uses the canonical thread route. During an additive rollout, a missing mapping
falls back to the legacy exact-message route. Push preference, self,
reciprocal-block, dedupe, retry, and recipient privacy rules remain unchanged.

Search and Library results may still identify any visible canonical message.
When the target is a reply, the app resolves its thread and opens the exact
message rather than showing that reply as a root in the room.

## Required Verification

### Database

- Clean local migration replay and zero database lint/security-advisor
  findings.
- Legacy direct and nested `reply_to` inserts map to one canonical root.
- The legacy flat window still returns roots and replies unchanged.
- The 2.0 window returns roots only and resolves a reply target to its root.
- Summary counts, unread cursor ordering, page order, keyset pagination, and
  batch/page limits are correct.
- Anonymous access and authenticated mapping writes are denied.
- Cycle/target mutation and reciprocal-block reply attempts are denied.
- Existing blocked replies disappear from pages and summaries.
- Root deletion produces an unavailable placeholder while preserving visible
  replies; an individual reply deletion removes only its mapping.

### Product And Realtime

- Focused API, routing, feed-summary, thread-sheet, and push-route tests pass.
- Two authenticated accounts prove main-feed isolation, live reply arrival,
  unread increment/clear, editing/deleting, block refresh, and exact push/search
  handoff.
- Android/Pixel Chromium and iPhone WebKit verify sheet geometry, safe areas,
  the shared bottom navigation, action-menu foreground layering, composer and
  keyboard behavior, 44-48px controls, exact-target focus, Back/cold-close
  behavior, older-page scroll preservation, reduced motion, and no horizontal
  overflow or console/page errors.
- Lint, TypeScript, production build, paused-domain checks, bundle budgets,
  targeted Jest, and the full Jest suite pass.
- Any test-created messages, uploads, notification rows, and Storage objects
  are removed and cleanup is verified.

## Operational Notes

- Apply the migration before deploying the 2.0 frontend. The old production
  frontend remains functional before and after that additive migration.
- Do not write `general_chat_thread_replies` from application code or reuse it
  as a second content store.
- Do not remove or change `reply_to` or the legacy flat-window RPC while the
  production frontend remains on the old contract.
- Treat mapping publication, thread read cursors, and the open-thread channels
  as realtime-sensitive when changing this feature.
- Checkpoint evidence is recorded in
  [docs/SHADOWCHAT_2_0_WAVE_TWO.md](C:/repos/chat2.0/docs/SHADOWCHAT_2_0_WAVE_TWO.md:1)
  and [docs/qa/mobile-pwa-qa-log.md](C:/repos/chat2.0/docs/qa/mobile-pwa-qa-log.md:1).
- Automated browser artifacts are under
  `output/playwright/wave2-candidate2-threads/`; physical installed-PWA
  keyboard and assistive-technology checks remain release-gate follow-ups.
