# Admin Access

ShadowChat now uses one app-wide admin model instead of a News-only operator
role.

## Roles

- `admin`: the single full administrator. This role can manage sub-admin access
  and use all admin-class tools.
- `sub_admin`: an operator role. Sub-admins can use admin-class product tools
  such as News source management and feedback review, but cannot add or remove
  admins.

The schema enforces exactly one full `admin` through
[`20260501233924_admin_roles_foundation.sql`](C:/repos/chat2.0/supabase/migrations/20260501233924_admin_roles_foundation.sql:1).

## User-Facing Behavior

- Admin and sub-admin badges are visible app-wide.
- Full admin users show a gold shield.
- Sub-admin users show a silver shield.
- The badges appear next to names in chat surfaces and on public profiles.
- All signed-in users can read visible role badges because the role is part of
  the public identity layer.

## Settings Surfaces

Admin settings are split into subpages under Settings > Admin:

- Admin Access: full-admin-only sub-admin management from the complete user
  list.
- ESP Bridge Pairing: operator bridge approval controls.
- Shado TV Studio: operator episode, trailer, cover, cast, update, visibility,
  and Bunny-upload controls.
- Shadow Pin Activity: operator analytics for Shadow Pin visits, active time,
  users, categories, pins, and raw activity drilldown.
- News Sources: operator add, pause, enable, and delete controls for tracked
  X/Truth Social accounts.
- Feedback Review: operator review and deletion for submitted bugs and
  suggestions.
- Public Profile Admin Access: full admins can grant or remove sub-admin access
  from another user's profile popup.
- Channel Bans: operator controls shown in another user's public profile popup
  for General Chat, individual chat boards, and all-interaction participation
  limits.
- Message Moderation: operators can delete normal-user messages in General Chat
  and board chats from the message action menu. Admin/sub-admin-authored
  messages and all DMs are excluded. The delete hooks require Supabase to
  return the deleted row before the UI removes it locally.

## Backend Surface

Main tables:

- `public.user_roles`: canonical admin/sub-admin assignment table.
- `public.admin_role_audit`: role grant/revoke/change history.
- `public.admin_role_notifications`: one-time user notices for role grants.
- `public.users.admin_role`: synced public role badge field.
- `public.user_channel_bans`: active and historical channel-ban records.
- `messages` and `board_chat_messages`: protected by operator delete policies
  for normal-user message moderation.

Main RPCs:

- `get_my_admin_role`
- `list_admin_access_users`
- `set_sub_admin_status`
- `get_pending_admin_role_notifications`
- `mark_admin_role_notification_seen`
- `is_app_admin`
- `is_app_operator`
- `list_user_channel_bans`
- `set_user_channel_bans`
- `is_user_channel_banned`

Only full admins can call the role-management RPCs that list users or grant and
revoke sub-admin access. App operators can use admin-class product tools guarded
by `is_app_operator`.

For the channel-ban model and enforcement map, see
[docs/CHANNEL_BANS.md](C:/repos/chat2.0/docs/CHANNEL_BANS.md:1).

## Realtime

`user_roles`, `admin_role_notifications`, and `users` are in the Supabase
Realtime publication. This keeps role badges and one-time access notices fresh
without publishing audit rows.

## Validation

After admin-access changes, run:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npx jest --runInBand tests/SettingsView.test.tsx
```

For UI changes, also run a headed browser check against a preview build and
verify the Admin subpages on desktop and mobile.
