-- Contain legacy identity without deleting columns or changing profile data.
-- Apply only after the existing explicit PUBLIC_PROFILE_SELECT consumers pass
-- web/native and Realtime QA. This is independent of the destructive Release B.
begin;

revoke select on table public.users from public, anon, authenticated;
revoke select (email, full_name) on table public.users from public, anon, authenticated;

-- Keep synchronized with functions/_shared/public-profile.ts.
grant select (
  id, username, display_name,
  avatar_url, avatar_thumbnail_url, avatar_thumbnail_path,
  banner_url, banner_thumbnail_url, banner_thumbnail_path,
  status, status_message, presence_visibility, color, chat_color, admin_role,
  checkers_crown, war_sword, shadow_pin_gold_pin, shadow_runner_sprint_medal,
  shadow_runner_knight_medal, shadow_runner_knight_level_id, gold_easter_egg,
  dm_discoverable, last_active, created_at, updated_at
) on table public.users to authenticated;

-- Trusted backend/admin RPCs retain their existing privileges and RLS remains
-- unchanged. A column revoke alone cannot override a table-wide SELECT grant.
commit;
