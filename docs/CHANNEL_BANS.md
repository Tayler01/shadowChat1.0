# Channel Ban Moderation

## Documentation Status - July 10, 2026

This doc reflects shipped channel-ban behavior and the July 9-10 service-role
and RPC hardening. AI post-to-chat preserves the canonical ban/authority checks. Bridge
service-role paths are additionally protected by the shared server-side
default-deny pause before request work begins.

Board scopes remain preserved in schema and moderation history while Boards are
paused. ESP service-role paths are disabled by the shared server hold and
release verification and must remain so; frontend hiding is not an
authorization control. See
[PAUSED_FEATURES.md](C:/repos/chat2.0/docs/PAUSED_FEATURES.md:1).

The July 10 hosted cleanup revokes browser execution of paused Boards, News, and
Art mutation RPCs while retaining their source and migration history. Active
General Chat moderation remains available through explicitly reviewed grants.

Channel bans let app operators limit where a user can participate without
touching DMs or account access. Banned users can still read visible content.

## Admin Surface

Admins and sub-admins can open another user's public profile popup from an
avatar and use the Admin Moderation section to manage channel bans. Full admins
can also grant or remove sub-admin access from the same profile popup.

Admins and sub-admins can also delete normal-user messages from General Chat and
board chats through the message action menu. Messages authored by admins or
sub-admins are protected from other operators; DMs are not part of operator
message deletion. These deletes are server-confirmed deletes, not local hides:
the client asks Supabase to return the deleted row and leaves the message in
place if RLS or migration drift prevents the database delete.

Available scopes:

- `general_chat`: blocks General Chat messages, edits, and reactions.
- `board_news_chat`: blocks News Chat messages, edits, deletes, and reactions.
- `board_investing_chat`: blocks Investing Chat messages, edits, deletes, and
  reactions.
- `board_learning_chat`: blocks Learning Chat messages, edits, deletes, and
  reactions.
- `board_crypto_chat`: blocks Crypto Chat messages, edits, deletes, and
  reactions.
- `board_vibe_coding`: blocks Vibe Coding messages, edits, deletes, and
  reactions.
- `board_ai_news`: blocks AI News messages, edits, deletes, and reactions.
- `board_projects_chat`: blocks Projects Chat messages, edits, deletes, and
  reactions.
- `art_board`: blocks Art Board adds, edits, deletes, links, and reactions
  while leaving browsing open.
- `all_interaction`: blocks posting, editing, deleting, and emoji reactions
  app-wide, including News Feed and Art Board reactions.

Available durations:

- 1 hour
- 24 hours
- 7 days
- 30 days
- Permanent

Clearing every checkbox and saving revokes active channel bans for that user.
The single full admin account cannot be channel banned. Only the full admin can
ban a sub-admin.

## Backend Surface

The canonical schema lives in
[`20260502070543_channel_bans_moderation.sql`](C:/repos/chat2.0/supabase/migrations/20260502070543_channel_bans_moderation.sql:1).
Boards-era scopes and shared board-chat enforcement live in
[`20260502193604_boards_domain.sql`](C:/repos/chat2.0/supabase/migrations/20260502193604_boards_domain.sql:1).
Operator deletion of normal-user General Chat and board-chat messages is
enabled by
[`20260503191532_admin_delete_non_admin_chat_messages.sql`](C:/repos/chat2.0/supabase/migrations/20260503191532_admin_delete_non_admin_chat_messages.sql:1).
Art Board scope, item policies, and soft-delete RPCs live in
[`20260504012117_art_board_domain.sql`](C:/repos/chat2.0/supabase/migrations/20260504012117_art_board_domain.sql:1).
The current hosted execution boundary and paused-domain revocations live in
[`20260710002000_remote_security_advisor_cleanup.sql`](C:/repos/chat2.0/supabase/migrations/20260710002000_remote_security_advisor_cleanup.sql:1).

Main table:

- `public.user_channel_bans`: active and historical channel-ban records.

Main RPCs:

- `list_user_channel_bans`
- `set_user_channel_bans`
- `is_user_channel_banned`
- `is_board_interaction_banned`
- `toggle_board_chat_reaction`
- `delete_art_board_item`
- `toggle_art_board_reaction`

Ban enforcement happens at the database boundary:

- `messages` insert/update policies check `general_chat`.
- `message_reactions` insert policy and `toggle_message_reaction` check
  `general_chat` for group chat while leaving DM reactions alone.
- `board_chat_messages` insert/update/delete policies check the board's
  moderation scope and `all_interaction`.
- `messages` and `board_chat_messages` delete policies also allow app operators
  to remove normal-user messages while protecting admin/sub-admin-authored
  messages.
- `board_chat_reactions` insert/delete policies and `toggle_board_chat_reaction`
  check the board's moderation scope and `all_interaction`.
- `news_feed_reactions` insert policy and `toggle_news_feed_reaction` check
  `all_interaction`.
- `art_board_items`, `art_board_links`, and Art Board RPCs check `art_board`
  and `all_interaction`; banned users can still browse the board.

Every ban change inserts a public General Chat moderation notice from the Shado
account with the target user, scope, reason, and duration. Expired timed bans
are swept by `expire_user_channel_bans()` and announced the same way.

## Deployment Check

Before trusting moderation deletes in production, confirm the linked Supabase
project includes both `20260503191532_admin_delete_non_admin_chat_messages.sql`
and `20260710002000_remote_security_advisor_cleanup.sql`:

```powershell
supabase migration list --linked
```

If either migration is missing, admins may see delete failures or a stale RPC
authority boundary. The current client deliberately does not remove the message
locally unless Supabase returns the deleted row.
