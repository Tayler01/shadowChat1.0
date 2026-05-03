# Channel Ban Moderation

Channel bans let app operators limit where a user can participate without
touching DMs or account access. Banned users can still read visible content.

## Admin Surface

Admins and sub-admins can open another user's public profile popup from an
avatar and use the Admin Moderation section to manage channel bans. Full admins
can also grant or remove sub-admin access from the same profile popup.

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
- `all_interaction`: blocks posting, editing, deleting, and emoji reactions
  app-wide, including News Feed reactions.

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

Main table:

- `public.user_channel_bans`: active and historical channel-ban records.

Main RPCs:

- `list_user_channel_bans`
- `set_user_channel_bans`
- `is_user_channel_banned`
- `is_board_interaction_banned`
- `toggle_board_chat_reaction`

Ban enforcement happens at the database boundary:

- `messages` insert/update policies check `general_chat`.
- `message_reactions` insert policy and `toggle_message_reaction` check
  `general_chat` for group chat while leaving DM reactions alone.
- `board_chat_messages` insert/update/delete policies check the board's
  moderation scope and `all_interaction`.
- `board_chat_reactions` insert/delete policies and `toggle_board_chat_reaction`
  check the board's moderation scope and `all_interaction`.
- `news_feed_reactions` insert policy and `toggle_news_feed_reaction` check
  `all_interaction`.

Every ban change inserts a public General Chat moderation notice from the Shado
account with the target user, scope, reason, and duration. Expired timed bans
are swept by `expire_user_channel_bans()` and announced the same way.
