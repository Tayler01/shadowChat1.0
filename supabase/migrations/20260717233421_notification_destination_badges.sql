/*
  # Notification destination badges (generated 2026-07-17)

  Makes Play and ShadowPin launcher badges traceable to the exact experience,
  category, match, room, and Pin that owns the unread state. The existing
  get_app_badge_state_v2 signature remains compatible; new destination arrays
  are additive.
*/

begin;

-- Active turns created before the server-owned Checkers trigger shipped still
-- need one canonical unread row. The move-specific dedupe key keeps this
-- backfill idempotent and preserves already-read rows.
insert into public.notification_events (
  user_id,
  type,
  entity_id,
  actor_id,
  category,
  route,
  payload,
  dedupe_key,
  presentation_expires_at,
  created_at
)
select
  matches.current_turn_user_id,
  'shadow_checkers_turn',
  matches.id,
  case
    when matches.player_one_id = matches.current_turn_user_id then matches.player_two_id
    else matches.player_one_id
  end,
  'games',
  '/?view=games&experience=shadow-checkers&item=' || matches.id::text,
  jsonb_build_object(
    'title', 'Your turn in Shadow Checkers',
    'body', 'It is your turn. Open the match to make your play.',
    'route', '/?view=games&experience=shadow-checkers&item=' || matches.id::text,
    'match_id', matches.id,
    'session_id', matches.session_id,
    'move_count', matches.move_count,
    'actor', public.user_public_profile_json(actors)
  ),
  concat(
    'shadow_checkers_turn:',
    matches.id,
    ':',
    matches.move_count,
    ':',
    matches.current_turn_user_id
  ),
  now() + interval '90 seconds',
  now()
from public.shadow_checkers_matches matches
left join public.users actors
  on actors.id = case
    when matches.player_one_id = matches.current_turn_user_id then matches.player_two_id
    else matches.player_one_id
  end
where matches.status = 'active'
  and matches.current_turn_user_id is not null
on conflict (dedupe_key) do nothing;

create or replace function public.get_app_badge_state_v2(
  target_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_role text := auth.role();
  base_state jsonb;
  preferences public.notification_preferences%rowtype;
  pin_destinations jsonb := '[]'::jsonb;
  game_destinations jsonb := '[]'::jsonb;
  pin_count integer := 0;
  games_count integer := 0;
  base_pin_count integer := 0;
  base_total integer := 0;
begin
  if target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if caller_role is distinct from 'service_role'
    and (caller_user_id is null or target_user_id is distinct from caller_user_id) then
    raise exception 'Users may only count their own unread items';
  end if;

  base_state := public.get_app_badge_state(target_user_id);

  select notification_preferences.*
  into preferences
  from public.notification_preferences
  where user_id = target_user_id;

  if found and preferences.badge_shadow_pin_enabled then
    with pin_events as (
      select
        events.id,
        events.type,
        events.created_at,
        images.id as image_id,
        categories.id as category_id
      from public.notification_events events
      join public.shadow_pin_images images
        on images.id = case
          when events.type = 'shadow_pin_post' then events.entity_id
          when coalesce(events.payload ->> 'image_id', '') ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
            then (events.payload ->> 'image_id')::uuid
          else null
        end
       and images.deleted_at is null
      join public.shadow_pin_categories categories
        on categories.id = images.category_id
       and categories.deleted_at is null
      left join public.shadow_pin_comments comments
        on comments.id = events.entity_id
       and comments.image_id = images.id
      where events.user_id = target_user_id
        and events.read_at is null
        and events.resolved_at is null
        and events.type in (
          'shadow_pin_post',
          'shadow_pin_comment',
          'shadow_pin_reply'
        )
        and (
          (events.type = 'shadow_pin_post' and preferences.shadow_pin_new_post_enabled)
          or (
            events.type = 'shadow_pin_comment'
            and preferences.shadow_pin_comment_enabled
            and comments.id is not null
          )
          or (
            events.type = 'shadow_pin_reply'
            and preferences.shadow_pin_reply_enabled
            and comments.id is not null
          )
        )
        and (
          events.actor_id is null
          or not private.users_have_block(target_user_id, events.actor_id)
        )
    ),
    grouped as (
      select
        category_id,
        image_id,
        count(*)::integer as unread_count,
        count(*) filter (where type = 'shadow_pin_post')::integer as post_count,
        count(*) filter (
          where type in ('shadow_pin_comment', 'shadow_pin_reply')
        )::integer as discussion_count,
        coalesce(
          array_agg(id order by created_at, id)
            filter (where type = 'shadow_pin_post'),
          array[]::uuid[]
        ) as post_event_ids,
        coalesce(
          array_agg(id order by created_at, id)
            filter (where type in ('shadow_pin_comment', 'shadow_pin_reply')),
          array[]::uuid[]
        ) as discussion_event_ids,
        max(created_at) as latest_at
      from pin_events
      group by category_id, image_id
    )
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'category_id', grouped.category_id,
            'image_id', grouped.image_id,
            'unread_count', grouped.unread_count,
            'post_count', grouped.post_count,
            'discussion_count', grouped.discussion_count,
            'post_event_ids', grouped.post_event_ids,
            'discussion_event_ids', grouped.discussion_event_ids,
            'latest_at', grouped.latest_at
          )
          order by grouped.latest_at desc, grouped.image_id
        ),
        '[]'::jsonb
      ),
      coalesce(sum(grouped.unread_count), 0)::integer
    into pin_destinations, pin_count
    from grouped;
  end if;

  if found and preferences.badge_games_enabled then
    with checkers_destinations as (
      select
        'shadow-checkers'::text as experience,
        matches.id as item_id,
        count(*)::integer as unread_count,
        array_agg(events.id order by events.created_at, events.id) as event_ids,
        max(events.created_at) as latest_at
      from public.notification_events events
      join public.shadow_checkers_matches matches
        on matches.id = events.entity_id
       and matches.status = 'active'
       and matches.current_turn_user_id = target_user_id
      where events.user_id = target_user_id
        and events.type = 'shadow_checkers_turn'
        and events.read_at is null
        and events.resolved_at is null
        and preferences.checkers_turn_enabled
      group by matches.id
    ),
    live_destinations as (
      select
        'shado-live'::text as experience,
        rooms.id as item_id,
        count(*)::integer as unread_count,
        array_agg(events.id order by events.created_at, events.id) as event_ids,
        max(events.created_at) as latest_at
      from public.notification_events events
      join public.live_rooms rooms
        on rooms.id = case
          when coalesce(events.payload ->> 'room_id', '') ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
            then (events.payload ->> 'room_id')::uuid
          else null
        end
       and rooms.status not in ('ended', 'cancelled')
      where events.user_id = target_user_id
        and events.category = 'live'
        and events.read_at is null
        and events.resolved_at is null
        and preferences.shado_live_in_app_enabled
        and shado_live_private.can_access_shado_live_room(target_user_id, rooms.id)
      group by rooms.id
    ),
    grouped as (
      select * from checkers_destinations
      union all
      select * from live_destinations
    )
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'experience', grouped.experience,
            'item_id', grouped.item_id,
            'unread_count', grouped.unread_count,
            'event_ids', grouped.event_ids,
            'latest_at', grouped.latest_at
          )
          order by grouped.latest_at desc, grouped.experience, grouped.item_id
        ),
        '[]'::jsonb
      ),
      coalesce(sum(grouped.unread_count), 0)::integer
    into game_destinations, games_count
    from grouped;
  end if;

  base_total := coalesce((base_state ->> 'total')::integer, 0);
  base_pin_count := coalesce((base_state ->> 'shadow_pin')::integer, 0);

  return base_state || jsonb_build_object(
    'shadow_pin', pin_count,
    'shadow_pin_destinations', pin_destinations,
    'games', games_count,
    'game_destinations', game_destinations,
    'total', greatest(0, base_total - base_pin_count) + pin_count + games_count
  );
end;
$$;

revoke all on function public.get_app_badge_state_v2(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_app_badge_state_v2(uuid)
  to authenticated, service_role;

comment on function public.get_app_badge_state_v2(uuid) is
  'Caller-owned launcher badge total, category breakdown, and exact Play/ShadowPin destination counts derived from unread notification events.';

commit;
