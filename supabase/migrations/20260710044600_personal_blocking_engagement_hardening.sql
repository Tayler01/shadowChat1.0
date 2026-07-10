/*
  # Personal blocking and engagement hardening

  Extends the reciprocal block contract through older SECURITY DEFINER
  engagement paths and their underlying tables. It also bounds ShadowPin
  telemetry/tag creation, delays new-post fanout until media is ready, clears
  stale unread events when a block is created, and keeps comments one level
  deep to match the product UI.
*/

begin;

-- Keep the existing private function identity so the reviewed private-definer
-- inventory stays stable. The legacy name now guards all engagement tables
-- that can otherwise be reached through trusted or SECURITY DEFINER writes.
create or replace function private.enforce_dm_reaction_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  interaction_user_id uuid;
  target_user_id uuid;
  target_message_id uuid;
  target_category_id uuid;
  conversation_participants uuid[];
  recent_count integer;
begin
  if tg_table_schema <> 'public' then
    raise exception 'Unsupported engagement trigger source';
  end if;

  if tg_table_name = 'user_blocks' then
    update public.notification_events events
    set read_at = coalesce(events.read_at, now())
    where events.read_at is null
      and (
        (
          events.user_id = new.blocker_id
          and events.payload #>> '{actor,id}' = new.blocked_id::text
        )
        or (
          events.user_id = new.blocked_id
          and events.payload #>> '{actor,id}' = new.blocker_id::text
        )
      );
    return new;
  end if;

  if tg_table_name = 'shadow_pin_activity_sessions' then
    interaction_user_id := new.user_id;
    if auth.uid() is not null and interaction_user_id is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'Activity session owner is invalid';
    end if;

    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
      and session_user not in ('postgres', 'supabase_admin') then
      select count(*)::integer
      into recent_count
      from public.shadow_pin_activity_sessions sessions
      where sessions.user_id = interaction_user_id
        and sessions.created_at >= now() - interval '1 hour';

      if recent_count >= 120 then
        raise exception using errcode = '54000', message = 'Too many ShadowPin activity sessions';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'shadow_pin_images' then
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
      and session_user not in ('postgres', 'supabase_admin') then
      if auth.uid() is null or new.creator_id is distinct from auth.uid() then
        raise exception using errcode = '42501', message = 'ShadowPin creator is invalid';
      end if;

      select count(*)::integer
      into recent_count
      from public.shadow_pin_images images
      where images.creator_id = new.creator_id
        and images.created_at >= now() - interval '1 minute';

      if recent_count >= 12 then
        raise exception using errcode = '54000', message = 'Too many ShadowPin posts. Try again shortly.';
      end if;

      select count(*)::integer
      into recent_count
      from public.shadow_pin_images images
      where images.creator_id = new.creator_id
        and images.created_at >= now() - interval '1 day';

      if recent_count >= 100 then
        raise exception using errcode = '54000', message = 'Daily ShadowPin post limit reached';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'shadow_pin_tags' then
    if not exists (
      select 1
      from public.shadow_pin_image_tags image_tags
      where image_tags.tag_id = new.id
    ) then
      raise exception using errcode = '23514', message = 'ShadowPin tags must be attached to a pin';
    end if;
    return new;
  end if;

  if tg_table_name = 'shadow_pin_image_tags' then
    if tg_op = 'DELETE' then
      delete from public.shadow_pin_tags tags
      where tags.id = old.tag_id
        and not exists (
          select 1
          from public.shadow_pin_image_tags remaining
          where remaining.tag_id = old.tag_id
        );
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'shadow_pin_activity_events' then
    interaction_user_id := new.user_id;

    if new.source = 'live' then
      if auth.uid() is not null and interaction_user_id is distinct from auth.uid() then
        raise exception using errcode = '42501', message = 'Activity event owner is invalid';
      end if;
      if jsonb_typeof(new.metadata) is distinct from 'object'
        or octet_length(new.metadata::text) > 4096
        or (select count(*) from pg_catalog.jsonb_object_keys(new.metadata)) > 24 then
        raise exception using errcode = '22023', message = 'ShadowPin activity metadata is too large';
      end if;

      select count(*)::integer
      into recent_count
      from public.shadow_pin_activity_events events
      where events.user_id = interaction_user_id
        and events.created_at >= now() - interval '1 minute';

      if recent_count >= 120 then
        raise exception using errcode = '54000', message = 'Too many ShadowPin activity events';
      end if;
    end if;

    if new.image_id is not null then
      select images.creator_id
      into target_user_id
      from public.shadow_pin_images images
      where images.id = new.image_id;
    elsif new.category_id is not null then
      select categories.creator_id
      into target_user_id
      from public.shadow_pin_categories categories
      where categories.id = new.category_id;
    end if;

    if new.event_type in ('pin_created', 'pin_edited', 'pin_deleted',
                          'category_created', 'category_edited', 'category_deleted')
      and target_user_id is distinct from interaction_user_id
      and not public.is_app_operator(interaction_user_id) then
      raise exception using errcode = '42501', message = 'ShadowPin activity action is not authorized';
    end if;

    if new.event_type = 'pin_heart_added'
      and not exists (
        select 1 from public.shadow_pin_image_hearts hearts
        where hearts.image_id = new.image_id and hearts.user_id = interaction_user_id
      ) then
      raise exception using errcode = '42501', message = 'ShadowPin heart activity is not current';
    end if;

    if new.event_type = 'category_heart_added'
      and not exists (
        select 1 from public.shadow_pin_category_hearts hearts
        where hearts.category_id = new.category_id and hearts.user_id = interaction_user_id
      ) then
      raise exception using errcode = '42501', message = 'ShadowPin category heart activity is not current';
    end if;
  elsif tg_table_name = 'message_reactions' then
    if tg_op = 'DELETE' then
      interaction_user_id := old.user_id;
      target_message_id := coalesce(old.dm_message_id, old.message_id);
    else
      interaction_user_id := new.user_id;
      target_message_id := coalesce(new.dm_message_id, new.message_id);
    end if;

    if (case when tg_op = 'DELETE' then old.dm_message_id else new.dm_message_id end) is not null then
      select conversations.participants
      into conversation_participants
      from public.dm_messages messages
      join public.dm_conversations conversations on conversations.id = messages.conversation_id
      where messages.id = target_message_id;

      if conversation_participants is null
        or not (interaction_user_id = any (conversation_participants)) then
        raise exception using errcode = '42501', message = 'Reaction user is not a participant in this conversation';
      end if;

      select participant_id
      into target_user_id
      from unnest(conversation_participants) participant_id
      where participant_id <> interaction_user_id
      limit 1;
    else
      select messages.user_id
      into target_user_id
      from public.messages messages
      where messages.id = target_message_id;

      if not found then
        raise exception using errcode = '42501', message = 'Message is not available';
      end if;
    end if;
  elsif tg_table_name = 'message_hypes' then
    interaction_user_id := new.actor_id;
    target_user_id := new.message_author_id;
  elsif tg_table_name = 'shadow_pin_category_hearts' then
    if tg_op = 'DELETE' then
      interaction_user_id := old.user_id;
      target_category_id := old.category_id;
    else
      interaction_user_id := new.user_id;
      target_category_id := new.category_id;
    end if;
    select categories.creator_id
    into target_user_id
    from public.shadow_pin_categories categories
    where categories.id = target_category_id and categories.deleted_at is null;
  elsif tg_table_name = 'shadow_pin_image_hearts' then
    if tg_op = 'DELETE' then
      interaction_user_id := old.user_id;
      target_message_id := old.image_id;
    else
      interaction_user_id := new.user_id;
      target_message_id := new.image_id;
    end if;
    select images.creator_id
    into target_user_id
    from public.shadow_pin_images images
    where images.id = target_message_id and images.deleted_at is null;
  else
    raise exception 'Unsupported engagement trigger table: %', tg_table_name;
  end if;

  if interaction_user_id is not null
    and target_user_id is not null
    and private.users_have_block(interaction_user_id, target_user_id) then
    raise exception using errcode = '42501', message = 'Interaction is unavailable for this user';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_dm_reaction_not_blocked()
  from public, anon, authenticated;

drop trigger if exists enforce_dm_reaction_not_blocked on public.message_reactions;
create trigger enforce_dm_reaction_not_blocked
  before insert or delete on public.message_reactions
  for each row execute function private.enforce_dm_reaction_not_blocked();

drop trigger if exists enforce_hype_personal_block on public.message_hypes;
create trigger enforce_hype_personal_block
  before insert on public.message_hypes
  for each row execute function private.enforce_dm_reaction_not_blocked();

drop trigger if exists enforce_shadow_pin_category_heart_block on public.shadow_pin_category_hearts;
create trigger enforce_shadow_pin_category_heart_block
  before insert or delete on public.shadow_pin_category_hearts
  for each row execute function private.enforce_dm_reaction_not_blocked();

drop trigger if exists enforce_shadow_pin_image_heart_block on public.shadow_pin_image_hearts;
create trigger enforce_shadow_pin_image_heart_block
  before insert or delete on public.shadow_pin_image_hearts
  for each row execute function private.enforce_dm_reaction_not_blocked();

drop trigger if exists enforce_shadow_pin_activity_event_contract on public.shadow_pin_activity_events;
create trigger enforce_shadow_pin_activity_event_contract
  before insert on public.shadow_pin_activity_events
  for each row execute function private.enforce_dm_reaction_not_blocked();

drop trigger if exists enforce_shadow_pin_activity_session_budget on public.shadow_pin_activity_sessions;
create trigger enforce_shadow_pin_activity_session_budget
  before insert on public.shadow_pin_activity_sessions
  for each row execute function private.enforce_dm_reaction_not_blocked();

drop trigger if exists enforce_shadow_pin_post_budget on public.shadow_pin_images;
create trigger enforce_shadow_pin_post_budget
  before insert on public.shadow_pin_images
  for each row execute function private.enforce_dm_reaction_not_blocked();

drop trigger if exists clear_blocked_shadow_pin_notifications on public.user_blocks;
create trigger clear_blocked_shadow_pin_notifications
  after insert on public.user_blocks
  for each row execute function private.enforce_dm_reaction_not_blocked();

drop trigger if exists remove_orphan_shadow_pin_tag on public.shadow_pin_image_tags;
create trigger remove_orphan_shadow_pin_tag
  after delete on public.shadow_pin_image_tags
  for each row execute function private.enforce_dm_reaction_not_blocked();

drop trigger if exists require_shadow_pin_tag_link on public.shadow_pin_tags;
create constraint trigger require_shadow_pin_tag_link
  after insert or update on public.shadow_pin_tags
  deferrable initially deferred
  for each row execute function private.enforce_dm_reaction_not_blocked();

-- A Hype event can name both an actor and a message author. Hide the row when
-- either relationship is blocked, including the three-party recipient case.
drop policy if exists "Blocked users are hidden from Hype events" on public.hype_events;
create policy "Blocked users are hidden from Hype events"
  on public.hype_events
  as restrictive
  for select
  to authenticated
  using (
    (
      actor_id is null
      or actor_id = (select auth.uid())
      or not private.users_have_block((select auth.uid()), actor_id)
    )
    and (
      message_author_id is null
      or message_author_id = (select auth.uid())
      or not private.users_have_block((select auth.uid()), message_author_id)
    )
  );

drop policy if exists "Blocked users are hidden from message Hype" on public.message_hypes;
create policy "Blocked users are hidden from message Hype"
  on public.message_hypes
  as restrictive
  for select
  to authenticated
  using (
    (
      actor_id is null
      or actor_id = (select auth.uid())
      or not private.users_have_block((select auth.uid()), actor_id)
    )
    and (
      message_author_id is null
      or message_author_id = (select auth.uid())
      or not private.users_have_block((select auth.uid()), message_author_id)
    )
  );

-- Keep reply depth aligned with the one-level comment UI.
create or replace function private.enforce_shadow_pin_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_image_id uuid;
  parent_author_id uuid;
  parent_parent_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select comments.image_id, comments.author_id, comments.parent_comment_id
  into parent_image_id, parent_author_id, parent_parent_id
  from public.shadow_pin_comments comments
  where comments.id = new.parent_comment_id;

  if not found or parent_image_id is distinct from new.image_id then
    raise exception 'Reply target must belong to the same ShadowPin image';
  end if;

  if parent_parent_id is not null then
    raise exception 'ShadowPin replies must target a root comment';
  end if;

  if private.users_have_block(auth.uid(), parent_author_id) then
    raise exception 'Reply target is not available';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_shadow_pin_comment_parent()
  from public, anon, authenticated;

-- Notify members only after the pin has reached its visible ready state.
create or replace function private.create_shadow_pin_post_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile jsonb;
begin
  if new.creator_id is null
    or new.deleted_at is not null
    or new.processing_status <> 'ready' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.processing_status = 'ready'
    and old.deleted_at is null then
    return new;
  end if;

  select public.user_public_profile_json(profiles)
  into actor_profile
  from public.users profiles
  where profiles.id = new.creator_id;

  insert into public.notification_events (
    user_id,
    type,
    entity_id,
    payload,
    dedupe_key
  )
  select
    profiles.id,
    'shadow_pin_post',
    new.id,
    jsonb_build_object(
      'image_id', new.id,
      'category_id', new.category_id,
      'image_title', new.title,
      'thumbnail_url', coalesce(new.thumbnail_url, new.medium_url, new.image_url),
      'actor', actor_profile,
      'url', '/?view=pins'
    ),
    'shadow_pin_post:' || new.id::text || ':' || profiles.id::text
  from public.users profiles
  left join public.notification_preferences preferences
    on preferences.user_id = profiles.id
  where profiles.id <> new.creator_id
    and coalesce(preferences.shadow_pin_new_post_enabled, true)
    and not private.users_have_block(profiles.id, new.creator_id)
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function private.create_shadow_pin_post_notifications()
  from public, anon, authenticated;

drop trigger if exists create_shadow_pin_post_notifications on public.shadow_pin_images;
create trigger create_shadow_pin_post_notifications
  after insert or update of processing_status, deleted_at on public.shadow_pin_images
  for each row execute function private.create_shadow_pin_post_notifications();

-- The pin RPC is SECURITY DEFINER, so enforce reciprocal visibility explicitly.
create or replace function public.toggle_message_pin(message_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id uuid := auth.uid();
  message_author_id uuid;
  is_pinned boolean;
begin
  if actor_user_id is null then
    raise exception 'User not authenticated';
  end if;

  select messages.user_id, messages.pinned
  into message_author_id, is_pinned
  from public.messages
  where messages.id = toggle_message_pin.message_id;

  if not found then
    raise exception 'Message not found';
  end if;

  if private.users_have_block(actor_user_id, message_author_id) then
    raise exception using errcode = '42501', message = 'Message is not available';
  end if;

  if is_pinned then
    update public.messages
    set pinned = false, pinned_by = null, pinned_at = null
    where messages.id = toggle_message_pin.message_id;
  else
    update public.messages
    set pinned = false, pinned_by = null, pinned_at = null
    where messages.pinned = true;

    update public.messages
    set pinned = true, pinned_by = actor_user_id, pinned_at = now()
    where messages.id = toggle_message_pin.message_id;
  end if;
end;
$$;

revoke all on function public.toggle_message_pin(uuid) from public, anon, authenticated;
grant execute on function public.toggle_message_pin(uuid) to authenticated;

-- Keep public-profile aggregate helpers from becoming blocked-user side channels.
create or replace function public.count_user_reactions(target_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  reaction_count integer;
begin
  if auth.uid() is null
    and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'User not authenticated';
  end if;

  if auth.uid() is not null
    and target_user_id is distinct from auth.uid()
    and private.users_have_block(auth.uid(), target_user_id) then
    return 0;
  end if;

  select count(*)::integer into reaction_count
  from public.message_reactions reactions
  where reactions.user_id = count_user_reactions.target_user_id;
  return coalesce(reaction_count, 0);
end;
$$;

create or replace function public.count_reactions_to_user_messages_v2(target_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  reaction_count integer;
begin
  if auth.uid() is null
    and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'User not authenticated';
  end if;

  if auth.uid() is not null
    and target_user_id is distinct from auth.uid()
    and private.users_have_block(auth.uid(), target_user_id) then
    return 0;
  end if;

  select count(reactions.*)::integer into reaction_count
  from public.message_reactions reactions
  join public.messages messages on reactions.message_id = messages.id
  where messages.user_id = count_reactions_to_user_messages_v2.target_user_id;
  return coalesce(reaction_count, 0);
end;
$$;

create or replace function public.count_reactions_to_user_dm_messages_v2(target_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  reaction_count integer;
begin
  if auth.uid() is null
    and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'User not authenticated';
  end if;

  if auth.uid() is not null
    and target_user_id is distinct from auth.uid()
    and private.users_have_block(auth.uid(), target_user_id) then
    return 0;
  end if;

  select count(reactions.*)::integer into reaction_count
  from public.message_reactions reactions
  join public.dm_messages messages on reactions.dm_message_id = messages.id
  where messages.sender_id = count_reactions_to_user_dm_messages_v2.target_user_id;
  return coalesce(reaction_count, 0);
end;
$$;

revoke all on function public.count_user_reactions(uuid) from public, anon, authenticated;
revoke all on function public.count_reactions_to_user_messages_v2(uuid) from public, anon, authenticated;
revoke all on function public.count_reactions_to_user_dm_messages_v2(uuid) from public, anon, authenticated;
grant execute on function public.count_user_reactions(uuid) to authenticated, service_role;
grant execute on function public.count_reactions_to_user_messages_v2(uuid) to authenticated, service_role;
grant execute on function public.count_reactions_to_user_dm_messages_v2(uuid) to authenticated, service_role;

commit;
