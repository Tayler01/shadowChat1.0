/*
  # Presence notifications, dependable read state, and unified launcher badges

  This migration is additive for the production frontend. The legacy presence
  RPC keeps its void signature while the 2.0 client opts into the activation-
  returning v2 RPC. All activation and cooldown clocks are server-owned.
*/

begin;

alter table public.notification_preferences
  add column if not exists presence_in_app_enabled boolean not null default true,
  add column if not exists presence_push_enabled boolean not null default true,
  add column if not exists presence_notification_scope text not null default 'connections',
  add column if not exists badge_dm_enabled boolean not null default true,
  add column if not exists badge_group_enabled boolean not null default true,
  add column if not exists badge_interactions_enabled boolean not null default true,
  add column if not exists badge_connections_enabled boolean not null default true,
  add column if not exists badge_shadow_pin_enabled boolean not null default true;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_presence_scope_check,
  add constraint notification_preferences_presence_scope_check
    check (presence_notification_scope in ('connections', 'all'));

alter table public.notification_preferences
  alter column group_enabled set default true,
  alter column reaction_enabled set default true;

-- Preserve deliberate choices. Only untouched rows receive the new default-on
-- group and reaction behavior.
update public.notification_preferences
set
  group_enabled = true,
  reaction_enabled = true
where updated_at <= created_at + interval '5 seconds';

alter table public.push_subscriptions
  add column if not exists foreground_until timestamptz;

create index if not exists push_subscriptions_foreground_lease_idx
  on public.push_subscriptions (user_id, foreground_until desc)
  where enabled = true and foreground_until is not null;

create table if not exists public.presence_notification_state (
  user_id uuid primary key references public.users(id) on delete cascade,
  last_heartbeat_at timestamptz,
  last_activation_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.presence_activation_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.users(id) on delete cascade,
  previous_heartbeat_at timestamptz,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  constraint presence_activation_expiry_check check (expires_at > activated_at)
);

create index if not exists presence_activation_actor_created_idx
  on public.presence_activation_events (actor_id, created_at desc);

create index if not exists presence_activation_pending_idx
  on public.presence_activation_events (expires_at, created_at)
  where dispatched_at is null;

create table if not exists public.presence_notification_cooldowns (
  recipient_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid not null references public.users(id) on delete cascade,
  last_notified_at timestamptz not null,
  primary key (recipient_id, actor_id),
  constraint presence_notification_not_self_check check (recipient_id <> actor_id)
);

alter table public.presence_notification_state enable row level security;
alter table public.presence_activation_events enable row level security;
alter table public.presence_notification_cooldowns enable row level security;

revoke all on table public.presence_notification_state
  from public, anon, authenticated;
revoke all on table public.presence_activation_events
  from public, anon, authenticated;
revoke all on table public.presence_notification_cooldowns
  from public, anon, authenticated;

grant select, insert, update, delete on table public.presence_notification_state
  to service_role;
grant select, insert, update, delete on table public.presence_activation_events
  to service_role;
grant select, insert, update, delete on table public.presence_notification_cooldowns
  to service_role;

create or replace function private.record_presence_heartbeat(
  create_activation boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_visibility text;
  prior_heartbeat_at timestamptz;
  activation_id uuid;
begin
  if current_user_id is null then
    return null;
  end if;

  select coalesce(users.presence_visibility, 'tracked')
  into current_visibility
  from public.users users
  where users.id = current_user_id;

  insert into public.presence_notification_state (
    user_id,
    last_heartbeat_at,
    updated_at
  )
  select
    current_user_id,
    presence.last_seen,
    now()
  from (select 1) seed
  left join public.user_presence presence
    on presence.user_id = current_user_id
  on conflict (user_id) do nothing;

  select state.last_heartbeat_at
  into prior_heartbeat_at
  from public.presence_notification_state state
  where state.user_id = current_user_id
  for update;

  if current_visibility = 'invisible' then
    insert into public.user_presence (
      user_id, status, last_seen, current_channel, typing_in, updated_at
    ) values (
      current_user_id, 'invisible', null, null, null, now()
    )
    on conflict (user_id) do update set
      status = 'invisible',
      last_seen = null,
      current_channel = null,
      typing_in = null,
      updated_at = now();

    update public.presence_notification_state
    set last_heartbeat_at = null, updated_at = now()
    where user_id = current_user_id;
    return null;
  end if;

  update public.users
  set status = 'online', last_active = now(), updated_at = now()
  where id = current_user_id;

  insert into public.user_presence (user_id, status, last_seen, updated_at)
  values (current_user_id, 'online', now(), now())
  on conflict (user_id) do update set
    status = 'online',
    last_seen = now(),
    updated_at = now();

  if create_activation
    and (prior_heartbeat_at is null or prior_heartbeat_at <= now() - interval '15 minutes') then
    insert into public.presence_activation_events (
      actor_id,
      previous_heartbeat_at,
      activated_at,
      expires_at
    ) values (
      current_user_id,
      prior_heartbeat_at,
      now(),
      now() + interval '10 minutes'
    )
    returning id into activation_id;
  end if;

  update public.presence_notification_state
  set
    last_heartbeat_at = now(),
    last_activation_at = case when activation_id is null then last_activation_at else now() end,
    updated_at = now()
  where user_id = current_user_id;

  return activation_id;
end;
$$;

revoke all on function private.record_presence_heartbeat(boolean)
  from public, anon, authenticated;

create or replace function public.update_user_last_active()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.record_presence_heartbeat(false);
end;
$$;

create or replace function public.update_user_last_active_v2()
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.record_presence_heartbeat(true);
$$;

revoke all on function public.update_user_last_active()
  from public, anon, authenticated;
revoke all on function public.update_user_last_active_v2()
  from public, anon, authenticated;
grant execute on function public.update_user_last_active()
  to authenticated;
grant execute on function public.update_user_last_active_v2()
  to authenticated;

create or replace function public.claim_presence_activation_recipients(
  target_activation_id uuid,
  target_actor_id uuid
)
returns table (
  recipient_id uuid,
  event_id uuid,
  push_enabled boolean,
  in_app_enabled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation_row public.presence_activation_events%rowtype;
  actor_profile jsonb;
  recipient record;
  claimed_recipient_id uuid;
  inserted_event_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  select activation.*
  into activation_row
  from public.presence_activation_events activation
  where activation.id = target_activation_id
    and activation.actor_id = target_actor_id
    and activation.dispatched_at is null
    and activation.expires_at > now()
  for update;

  if not found then
    return;
  end if;

  if not exists (
    select 1
    from public.users users
    where users.id = target_actor_id
      and users.presence_visibility = 'tracked'
  ) then
    update public.presence_activation_events
    set dispatched_at = now()
    where id = target_activation_id;
    return;
  end if;

  select public.user_public_profile_json(users)
  into actor_profile
  from public.users users
  where users.id = target_actor_id;

  if actor_profile is null then
    return;
  end if;

  for recipient in
    select
      preferences.user_id,
      preferences.presence_push_enabled,
      preferences.presence_in_app_enabled
    from public.notification_preferences preferences
    where preferences.user_id <> target_actor_id
      and (preferences.presence_push_enabled or preferences.presence_in_app_enabled)
      and not private.users_have_block(preferences.user_id, target_actor_id)
      and (
        preferences.presence_notification_scope = 'all'
        or private.users_are_connected(preferences.user_id, target_actor_id)
      )
  loop
    claimed_recipient_id := null;
    insert into public.presence_notification_cooldowns (
      recipient_id,
      actor_id,
      last_notified_at
    ) values (
      recipient.user_id,
      target_actor_id,
      now()
    )
    on conflict (recipient_id, actor_id) do update
      set last_notified_at = excluded.last_notified_at
      where public.presence_notification_cooldowns.last_notified_at
        <= excluded.last_notified_at - interval '1 hour'
    returning public.presence_notification_cooldowns.recipient_id
      into claimed_recipient_id;

    if claimed_recipient_id is null then
      continue;
    end if;

    insert into public.notification_events (
      user_id,
      type,
      entity_id,
      payload,
      dedupe_key
    ) values (
      recipient.user_id,
      'presence_active',
      target_activation_id,
      jsonb_build_object(
        'activation_id', target_activation_id,
        'actor_id', target_actor_id,
        'actor', actor_profile,
        'notify_push', recipient.presence_push_enabled,
        'notify_in_app', recipient.presence_in_app_enabled,
        'url', '/?view=active-users'
      ),
      'presence_active:' || target_activation_id::text || ':' || recipient.user_id::text
    )
    on conflict (dedupe_key) do update
      set payload = excluded.payload
    returning id into inserted_event_id;

    recipient_id := recipient.user_id;
    event_id := inserted_event_id;
    push_enabled := recipient.presence_push_enabled;
    in_app_enabled := recipient.presence_in_app_enabled;
    return next;
  end loop;
end;
$$;

revoke all on function public.claim_presence_activation_recipients(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_presence_activation_recipients(uuid, uuid)
  to service_role;

create or replace function public.finish_presence_activation_dispatch(
  target_activation_id uuid,
  target_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  update public.presence_activation_events
  set dispatched_at = coalesce(dispatched_at, now())
  where id = target_activation_id
    and actor_id = target_actor_id;
end;
$$;

revoke all on function public.finish_presence_activation_dispatch(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.finish_presence_activation_dispatch(uuid, uuid)
  to service_role;

create or replace function public.mark_dm_messages_read_through(
  conversation_id uuid,
  through_message_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_created_at timestamptz;
  remaining_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.dm_conversations conversations
    where conversations.id = mark_dm_messages_read_through.conversation_id
      and current_user_id = any(conversations.participants)
  ) then
    raise exception 'Reader is not a participant in this DM conversation';
  end if;

  select messages.created_at
  into target_created_at
  from public.dm_messages messages
  where messages.id = through_message_id
    and messages.conversation_id = mark_dm_messages_read_through.conversation_id;

  if target_created_at is null then
    raise exception 'Target DM message was not found';
  end if;

  update public.dm_messages messages
  set
    read_at = coalesce(messages.read_at, now()),
    read_by = case
      when messages.read_by is null then array[current_user_id]::uuid[]
      when not (current_user_id = any(messages.read_by))
        then array_append(messages.read_by, current_user_id)
      else messages.read_by
    end,
    updated_at = now()
  where messages.conversation_id = mark_dm_messages_read_through.conversation_id
    and messages.sender_id <> current_user_id
    and (
      messages.created_at < target_created_at
      or (messages.created_at = target_created_at and messages.id <= through_message_id)
    )
    and (
      messages.read_by is null
      or not (current_user_id = any(messages.read_by))
    );

  select count(*)::integer
  into remaining_count
  from public.dm_messages messages
  where messages.conversation_id = mark_dm_messages_read_through.conversation_id
    and messages.sender_id <> current_user_id
    and (
      messages.read_by is null
      or not (current_user_id = any(messages.read_by))
    );

  return remaining_count;
end;
$$;

revoke all on function public.mark_dm_messages_read_through(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_dm_messages_read_through(uuid, uuid)
  to authenticated;

create or replace function public.mark_general_notification_events_read_through(
  through_message_id uuid,
  target_thread_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_created_at timestamptz;
  updated_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select messages.created_at
  into target_created_at
  from public.messages messages
  where messages.id = through_message_id;

  if target_created_at is null then
    return 0;
  end if;

  update public.notification_events events
  set read_at = now()
  from public.messages messages
  where events.user_id = current_user_id
    and events.read_at is null
    and events.message_id = messages.id
    and events.type in ('group_message', 'mention', 'reply', 'reaction', 'hype_event')
    and (
      (
        target_thread_id is null
        and not exists (
          select 1
          from public.general_chat_thread_replies main_mapping
          where main_mapping.message_id = messages.id
        )
      )
      or (
        target_thread_id is not null
        and (
          messages.id = target_thread_id
          or exists (
            select 1
            from public.general_chat_thread_replies mapping
            where mapping.message_id = messages.id
              and mapping.thread_id = target_thread_id
          )
        )
      )
    )
    and (
      messages.created_at < target_created_at
      or (messages.created_at = target_created_at and messages.id <= through_message_id)
    );

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_general_notification_events_read_through(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_general_notification_events_read_through(uuid, uuid)
  to authenticated;

create or replace function public.get_app_badge_state(
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
  preferences public.notification_preferences%rowtype;
  read_cursor public.user_read_cursors%rowtype;
  dm_count integer := 0;
  group_count integer := 0;
  interaction_count integer := 0;
  connection_count integer := 0;
  shadow_pin_count integer := 0;
begin
  if target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if caller_role is distinct from 'service_role'
    and (caller_user_id is null or target_user_id is distinct from caller_user_id) then
    raise exception 'Users may only count their own unread items';
  end if;

  select notification_preferences.*
  into preferences
  from public.notification_preferences
  where user_id = target_user_id;

  if not found then
    return jsonb_build_object(
      'total', 0,
      'dm', 0,
      'group', 0,
      'interactions', 0,
      'connections', 0,
      'shadow_pin', 0
    );
  end if;

  if preferences.badge_dm_enabled then
    select count(*)::integer
    into dm_count
    from public.dm_messages messages
    join public.dm_conversations conversations
      on conversations.id = messages.conversation_id
    where target_user_id = any(conversations.participants)
      and messages.sender_id <> target_user_id
      and not private.users_have_block(target_user_id, messages.sender_id)
      and (messages.read_by is null or not (target_user_id = any(messages.read_by)));
  end if;

  if preferences.badge_group_enabled
    and preferences.group_enabled
    and not preferences.general_chat_muted then
    select cursors.*
    into read_cursor
    from public.user_read_cursors cursors
    where cursors.user_id = target_user_id
      and cursors.surface = 'general_chat'
      and cursors.scope_id = 'main';

    if found then
      select count(*)::integer
      into group_count
      from public.messages messages
      where messages.user_id <> target_user_id
        and not private.users_have_block(target_user_id, messages.user_id)
        and not exists (
          select 1
          from public.general_chat_thread_replies mapping
          where mapping.message_id = messages.id
        )
        and (
          read_cursor.last_read_at is null
          or messages.created_at > read_cursor.last_read_at
          or (
            messages.created_at = read_cursor.last_read_at
            and (read_cursor.last_read_message_id is null or messages.id > read_cursor.last_read_message_id)
          )
        );
    end if;
  end if;

  if preferences.badge_interactions_enabled then
    select count(*)::integer
    into interaction_count
    from public.notification_events events
    where events.user_id = target_user_id
      and events.read_at is null
      and (
        (
          events.type in ('mention', 'reply')
          and (
            (events.type = 'mention' and preferences.mention_enabled)
            or (events.type = 'reply' and preferences.reply_enabled)
          )
          and not (
            group_count > 0
            and exists (
              select 1
              from public.messages event_message
              where event_message.id = events.message_id
                and not exists (
                  select 1
                  from public.general_chat_thread_replies event_mapping
                  where event_mapping.message_id = event_message.id
                )
                and (
                  read_cursor.last_read_at is null
                  or event_message.created_at > read_cursor.last_read_at
                  or (
                    event_message.created_at = read_cursor.last_read_at
                    and (
                      read_cursor.last_read_message_id is null
                      or event_message.id > read_cursor.last_read_message_id
                    )
                  )
                )
            )
          )
        )
        or (events.type = 'reaction' and preferences.reaction_enabled)
        or (events.type = 'hype_event' and preferences.hype_enabled)
      );
  end if;

  if preferences.badge_connections_enabled then
    select count(*)::integer
    into connection_count
    from public.notification_events events
    where events.user_id = target_user_id
      and events.read_at is null
      and events.type in ('connection_request', 'connection_accepted');
  end if;

  if preferences.badge_shadow_pin_enabled then
    select count(*)::integer
    into shadow_pin_count
    from public.notification_events events
    where events.user_id = target_user_id
      and events.read_at is null
      and (
        (events.type = 'shadow_pin_post' and preferences.shadow_pin_new_post_enabled)
        or (events.type = 'shadow_pin_comment' and preferences.shadow_pin_comment_enabled)
        or (events.type = 'shadow_pin_reply' and preferences.shadow_pin_reply_enabled)
      );
  end if;

  return jsonb_build_object(
    'total', dm_count + group_count + interaction_count + connection_count + shadow_pin_count,
    'dm', dm_count,
    'group', group_count,
    'interactions', interaction_count,
    'connections', connection_count,
    'shadow_pin', shadow_pin_count
  );
end;
$$;

revoke all on function public.get_app_badge_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_app_badge_state(uuid)
  to authenticated, service_role;

comment on function public.get_app_badge_state(uuid) is
  'Caller-owned launcher badge total and category breakdown. Presence awareness events are intentionally excluded.';

commit;
