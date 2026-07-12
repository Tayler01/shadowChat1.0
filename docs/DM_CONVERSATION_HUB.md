# DM Conversation Hub

## Product Contract

The Wave One DM checkpoint turns the existing flat conversation list into a
phone-first private communications hub. It deliberately preserves the proven
one-to-one message path: optimistic and offline sends, reactions, replies,
keyset history, the bounded runtime window, read cursors, notification mutes,
personal blocking, and the fixed mobile composer remain authoritative.

The Hub adds:

- a searchable inbox with `Inbox`, `Unread`, and `Archived` modes
- owner-private pinned, archived, and manually-unread conversation state
- pinned-first deterministic ordering and richer rows with local draft, mute,
  delivery-direction, media-type, blocked, and unread cues
- accessible row actions for Pin, Archive, Mark read/unread, and Mute
- route-aware inbox, thread, and exact-message history on phones
- one conversation-details sheet for Search, Shared media/files/links,
  Notifications, Profile, and Block
- bounded conversation-scoped search and shared-content retrieval
- authoritative exact historical message loading outside the latest page
- realtime delete recovery without adding per-conversation subscriptions
- accessible list/log/status semantics, focus return, named media, and
  phone-comfortable controls

## Shared-Backend Boundary

Production `main` and the ShadowChat 2.0 frontend share one Supabase project.
This checkpoint therefore uses additive contracts and forward hardening only:

- `dm_conversation_preferences` is owner-private and participant-validated.
- Existing `notification_conversation_mutes` remains the only mute authority.
- Existing `get_dm_conversations()` is not replaced or given a new signature.
- New search and target-window functions run with caller-visible DM rules and
  return bounded deterministic pages.
- Direct conversation participant mutation is removed while the existing
  server-maintained last-message path remains functional.
- Direct message updates are narrowed to the columns the existing frontend
  uses for editing.

The unchanged production frontend must continue to create conversations,
send/receive/edit/delete messages, mark read, mute, and block after the
migration is applied.

## Implementation Slices

1. Add and prove the owner-private preference and bounded retrieval contracts.
2. Add the Hub state/model layer with optimistic mutations and rollback.
3. Rebuild the inbox with search, modes, rich rows, and action parity.
4. Add route-aware thread navigation and exact historical targeting.
5. Add the conversation-details, search, and shared-content surfaces.
6. Close delete/reload and transient-refresh reliability gaps.
7. Complete DM-specific accessibility, two-account realtime, and phone QA.

## Explicitly Deferred

Group DMs, calls, end-to-end encryption, disappearing messages, cloud-synced
drafts, per-participant read receipts, and a desktop-only three-pane redesign
are separate product domains. Attachment staging and voice review remain a
future composer checkpoint so this release can keep the existing proven send
contract and focus on organization, retrieval, navigation, and reliability.

## Completion Gate

This checkpoint is complete only after:

- SQL tests prove owner isolation, participant validation, blocked visibility,
  exact target bounds, immutable participants, and old-client compatibility.
- Jest proves sorting/filtering, optimistic rollback, archive/unarchive,
  manual unread, draft cues, transient refresh retention, target loading, and
  delete recovery.
- two authenticated accounts prove insert, reorder, unread, edit/reaction,
  delete, read clearing, mute, block, and exact-old-message behavior.
- iPhone/WebKit and Android/Chromium prove history Back, inbox modes, row
  actions, details/search/media sheets, keyboard stability, safe areas,
  focus return, and 48-pixel controls.
- lint, TypeScript, production build/budgets, and full Jest remain clean.

## Local Verification - July 11, 2026

- A clean local Supabase reset applied the complete migration chain and the
  executable three-user verifier proved preference isolation, participant
  checks, legacy send/edit/delete/read/reaction compatibility, automatic
  unarchive, exact windows, keyset retrieval, grants, and Realtime publication.
- Focused DM Hub coverage passes 68 tests; the full repository gate passes 157
  suites and 789 tests with 16 existing todos.
- ESLint, app TypeScript, production build, paused-feature verification, and
  build budgets passed. The secondary search/shared sheet is lazy-loaded; the
  main Direct Messages chunk is about 61 KiB raw / 18 KiB gzip.
- The authenticated two-account smoke passed auth, live DM delivery/unread,
  reload restoration, exact-result system Back, and one-tap exact-result
  header Back to Inbox. A stale unread-label selector exposed by the richer
  accessible badge was corrected in the smoke runner.
- Android Chromium at 412x839 and WebKit at 390x844 passed pin/unpin,
  48-pixel inbox/details/filter controls, details-to-search, exact historical
  message targeting, shared-content filters, header Back, and browser/system
  Back with no page errors. Temporary accounts and message data were removed
  by a final local database reset.
- No migration was applied remotely and no frontend was deployed. The linked
  dry run passed and lists only the additive Activity HQ and DM Hub migrations;
  old-production-client compatibility remains part of the combined Wave One
  shared-backend gate.
