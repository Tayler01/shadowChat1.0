# Channel Ban Moderation

Channel bans let app operators limit where a user can participate without
touching DMs or account access.

## Admin Surface

Admins and sub-admins can open another user's public profile popup from an
avatar and use the Admin Moderation section to manage channel bans.

Available scopes:

- `general_chat`: blocks General Chat messages, edits, and reactions.
- `news_chat`: blocks News Chat messages, edits, and reactions.
- `news_feed`: blocks reactions on News Feed articles.

Available durations:

- 1 hour
- 24 hours
- 7 days
- 30 days
- Permanent

Clearing every checkbox and saving revokes active channel bans for that user.
The single full admin account cannot be channel banned.

## Backend Surface

The canonical schema lives in
[`20260502070543_channel_bans_moderation.sql`](C:/repos/chat2.0/supabase/migrations/20260502070543_channel_bans_moderation.sql:1).

Main table:

- `public.user_channel_bans`: active and historical channel-ban records.

Main RPCs:

- `list_user_channel_bans`
- `set_user_channel_bans`
- `is_user_channel_banned`

Ban enforcement happens at the database boundary:

- `messages` insert/update policies check `general_chat`.
- `message_reactions` insert policy and `toggle_message_reaction` check
  `general_chat` for group chat while leaving DM reactions alone.
- `news_chat_messages` insert/update policies check `news_chat`.
- `news_chat_reactions` insert policy and `toggle_news_chat_reaction` check
  `news_chat`.
- `news_feed_reactions` insert policy and `toggle_news_feed_reaction` check
  `news_feed`.

Deletes are still allowed for a user's own existing messages or reactions so a
ban does not trap old content in place.
