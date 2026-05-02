# Supabase Realtime Audit - 2026-05-02

This audit reviews public Supabase tables, their product purpose, and whether
they should be included in the `supabase_realtime` publication.

Supabase Realtime Postgres Changes requires each listened table to be included
in the `supabase_realtime` publication. Publishing every table is avoided here
because each change event has auth/performance cost, and some tables contain
security-sensitive or high-churn operational data.

## Published Tables

| Table | Purpose | Realtime decision |
| --- | --- | --- |
| `admin_role_notifications` | One-time user notices when admin access changes. | Keep published. Useful for admin-access notice delivery. |
| `board_catalog` | Visible Boards metadata and moderation-scope mapping. | Keep published. Lets board badges/layout refresh if board metadata changes. |
| `board_chat_messages` | Shared chat stream for News, Investing, Learning, and Crypto boards. | Keep published. Needed for live board chats and board unread counts. |
| `dm_conversations` | DM conversation records and participant membership. | Keep published. Needed for DM inbox/unread refresh. |
| `dm_messages` | Direct message rows, read state, reactions, and attachments. | Keep published. Needed for live DMs and unread counts. |
| `messages` | General group chat messages. | Keep published. Needed for live group chat. |
| `news_chat_messages` | Legacy News channel chat messages. | Keep published for compatibility until legacy clients/imports age out. |
| `news_feed_items` | Scraped News Feed items. | Keep published. Needed for live feed and badge refresh. |
| `news_sources` | Admin-managed tracked News accounts and scraper health. | Keep published. Needed for admin source controls and scraper visibility. |
| `news_user_state` | Per-user News Feed seen timestamp. | Keep published. Needed for accurate News Feed unread clearing across tabs/devices. |
| `user_channel_bans` | Active and historical moderation bans for General Chat, board chats, and all interaction. | Keep published. Needed for live avatar/profile ban indicators and operator popup freshness. |
| `user_read_cursors` | Per-user read positions for General Chat, DMs, and board chats. | Keep published. Needed for realtime unread count clearing across tabs/devices. |
| `user_roles` | App-wide admin/sub-admin roles. | Keep published. Role visibility is intentional app-wide. |
| `user_presence` | Foreground heartbeat rows for tracked/invisible presence and active-user state. | Keep published. Needed for app-wide status dots and the General Chat active-user popup. |
| `users` | Public user profiles, presence-ish profile fields, and visible admin badges. | Keep published. Supports profile/identity freshness. |

## Not Published

| Table | Purpose | Realtime decision |
| --- | --- | --- |
| `admin_role_audit` | Historical audit trail for admin role changes. | Do not publish. Read on demand by full admins; low need for live updates. |
| `bridge_audit_events` | Bridge control-plane audit logs. | Do not publish. Operational/audit data, service-role writes, not live UI. |
| `bridge_device_sessions` | Bridge session lifecycle and token hash metadata. | Do not publish. Sensitive and high churn; edge functions poll/query as needed. |
| `bridge_devices` | Bridge device registration, pairing status, heartbeat timestamps. | Do not publish yet. Firmware/admin flows currently poll through functions. |
| `bridge_pairing_codes` | Short-lived bridge pairing codes. | Do not publish. Sensitive short-lived data, polled by bridge status function. |
| `bridge_pairings` | Device-to-user bridge pairing records. | Do not publish yet. Pairing lifecycle is handled by functions. |
| `bridge_update_manifests` | Firmware/tools release metadata. | Do not publish. Firmware checks are request/response, not live UI. |
| `feedback_submissions` | User feedback and attachments metadata. | Do not publish. User submit/read-own plus operator review/delete are on-demand, not live. |
| `board_chat_reactions` | Normalized board-chat reaction rows. | Do not publish. RPCs aggregate reactions back onto `board_chat_messages`, which is published. |
| `message_reactions` | Normalized group-message reaction rows. | Do not publish. RPCs aggregate reactions back onto `messages`, which is published. |
| `news_chat_reactions` | Normalized News Chat reaction rows. | Do not publish. RPCs aggregate reactions back onto `news_chat_messages`, which is published. |
| `news_feed_reactions` | Normalized News Feed reaction rows. | Do not publish. RPCs aggregate reactions back onto `news_feed_items`, which is published. |
| `notification_events` | Push notification event/delivery/read tracking. | Do not publish. No live notification center currently subscribes to it. |
| `notification_preferences` | Per-user push notification settings. | Do not publish. Settings are user-driven and refreshed on demand. |
| `notification_sounds` | Static notification sound catalog. | Do not publish. Static lookup table. |
| `push_subscriptions` | Browser push endpoints and keys. | Do not publish. Sensitive endpoint material. |
| `user_weather_preferences` | Private per-user weather location and temperature-unit preference. | Do not publish. Personal setting refreshed on demand by the owning user only. |
| `user_sessions` | App session tracking table. | Do not publish. Session lifecycle is auth-sensitive and not used for live UI. |
