/*
  # Personal blocking privacy contract

  A block is stored as a private, self-owned row. Pair-level enforcement is
  reciprocal for discovery, General Chat visibility, DM creation/sending,
  presence, Hype, and notification delivery. Existing DM conversations and
  their rows are preserved so unblocking restores history; while blocked, the
  other participant's content and inbox preview are not returned.
*/

begin;

create table public.user_blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_pkey primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);

comment on table public.user_blocks is
  'Private personal blocks. Only the blocker may read or mutate their rows; pair-level product enforcement is reciprocal.';

alter table public.user_blocks enable row level security;

revoke all on table public.user_blocks from public, anon, authenticated, service_role;
grant select, insert, delete on table public.user_blocks to authenticated;
grant select on table public.user_blocks to service_role;

create policy "Users can read their own blocks"
  on public.user_blocks
  for select
  to authenticated
  using ((select auth.uid()) = blocker_id);

create policy "Users can create their own blocks"
  on public.user_blocks
  for insert
  to authenticated
  with check (
    (select auth.uid()) = blocker_id
    and blocked_id <> (select auth.uid())
  );

create policy "Users can remove their own blocks"
  on public.user_blocks
  for delete
  to authenticated
  using ((select auth.uid()) = blocker_id);

-- The primary key covers blocker-first lookups. This reverse index keeps
-- reciprocal pair checks and account deletion fast.
create index user_blocks_blocked_blocker_idx
  on public.user_blocks (blocked_id, blocker_id);

create or replace function private.users_have_block(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when first_user_id is null
      or second_user_id is null
      or first_user_id = second_user_id
      then false
    else exists (
      select 1
      from public.user_blocks blocks
      where (blocks.blocker_id = first_user_id and blocks.blocked_id = second_user_id)
         or (blocks.blocker_id = second_user_id and blocks.blocked_id = first_user_id)
    )
  end;
$$;

revoke all on function private.users_have_block(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.users_have_block(uuid, uuid)
  to authenticated, service_role;

comment on function private.users_have_block(uuid, uuid) is
  'Indexed reciprocal block lookup used by RLS and guarded product APIs. The private schema is not exposed through the Data API.';

create or replace function public.block_user(target_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
  inserted_count integer := 0;
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null or target_user_id = caller_user_id then
    raise exception 'A different user is required';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (caller_user_id, target_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count > 0;
end;
$$;

revoke all on function public.block_user(uuid) from public, anon, authenticated;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(target_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
  deleted_count integer := 0;
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null or target_user_id = caller_user_id then
    raise exception 'A different user is required';
  end if;

  delete from public.user_blocks blocks
  where blocks.blocker_id = caller_user_id
    and blocks.blocked_id = target_user_id;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.unblock_user(uuid) from public, anon, authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.get_my_blocked_users()
returns table (
  blocked_user jsonb,
  blocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    public.user_public_profile_json(user_row) as blocked_user,
    blocks.created_at as blocked_at
  from public.user_blocks blocks
  join public.users user_row on user_row.id = blocks.blocked_id
  where blocks.blocker_id = caller_user_id
  order by blocks.created_at desc, blocks.blocked_id;
end;
$$;

revoke all on function public.get_my_blocked_users()
  from public, anon, authenticated;
grant execute on function public.get_my_blocked_users() to authenticated;

comment on function public.get_my_blocked_users() is
  'Returns only the caller-owned block list with the API-safe public profile projection.';

-- Hide reciprocal block relationships from direct profile discovery. Existing
-- DM APIs deliberately return the already-known counterpart using the safe
-- profile projection so a preserved thread can show a generic unavailable UI.
create policy "Blocked pairs cannot read each other profiles"
  on public.users
  as restrictive
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or not private.users_have_block((select auth.uid()), id)
  );

create policy "Blocked pairs cannot read each other presence"
  on public.user_presence
  as restrictive
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or not private.users_have_block((select auth.uid()), user_id)
  );

create policy "Blocked users are hidden from General Chat"
  on public.messages
  as restrictive
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or not private.users_have_block((select auth.uid()), user_id)
  );

create policy "Blocked users are hidden from Hype events"
  on public.hype_events
  as restrictive
  for select
  to authenticated
  using (
    actor_id is null
    or actor_id = (select auth.uid())
    or not private.users_have_block((select auth.uid()), actor_id)
  );

create policy "Blocked users are hidden from message Hype"
  on public.message_hypes
  as restrictive
  for select
  to authenticated
  using (
    actor_id is null
    or actor_id = (select auth.uid())
    or not private.users_have_block((select auth.uid()), actor_id)
  );

create policy "Blocked users are hidden from reaction rows"
  on public.message_reactions
  as restrictive
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or not private.users_have_block((select auth.uid()), user_id)
  );

-- Preserve the current user's own DM rows for account/history continuity while
-- hiding every row authored by the other participant during a block.
create policy "Blocked users are hidden from direct message history"
  on public.dm_messages
  as restrictive
  for select
  to authenticated
  using (
    sender_id = (select auth.uid())
    or not private.users_have_block((select auth.uid()), sender_id)
  );

create policy "Blocked pairs cannot create conversations"
  on public.dm_conversations
  as restrictive
  for insert
  to authenticated
  with check (
    not exists (
      select 1
      from unnest(participants) participant_id
      where participant_id <> (select auth.uid())
        and private.users_have_block((select auth.uid()), participant_id)
    )
  );

create policy "Blocked pairs cannot send direct messages"
  on public.dm_messages
  as restrictive
  for insert
  to authenticated
  with check (
    not exists (
      select 1
      from public.dm_conversations conversations
      cross join lateral unnest(conversations.participants) participant_id
      where conversations.id = dm_messages.conversation_id
        and participant_id <> (select auth.uid())
        and private.users_have_block((select auth.uid()), participant_id)
    )
  );

-- Triggers keep the same contract for trusted/server-side inserts that bypass
-- RLS, including any future reactivation of the preserved ESP bridge paths.
create or replace function private.enforce_dm_conversation_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_user_id uuid;
  second_user_id uuid;
begin
  if cardinality(new.participants) = 2 then
    first_user_id := new.participants[1];
    second_user_id := new.participants[2];

    if private.users_have_block(first_user_id, second_user_id) then
      raise exception using
        errcode = '42501',
        message = 'Messaging is unavailable for this user';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_dm_conversation_not_blocked()
  from public, anon, authenticated;

drop trigger if exists enforce_dm_conversation_not_blocked
  on public.dm_conversations;
create trigger enforce_dm_conversation_not_blocked
  before insert on public.dm_conversations
  for each row execute function private.enforce_dm_conversation_not_blocked();

create or replace function private.enforce_dm_message_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_participants uuid[];
  other_user_id uuid;
begin
  select conversations.participants
  into conversation_participants
  from public.dm_conversations conversations
  where conversations.id = new.conversation_id;

  if conversation_participants is null
    or not (new.sender_id = any (conversation_participants)) then
    raise exception using
      errcode = '42501',
      message = 'Sender is not a participant in this conversation';
  end if;

  select participant_id
  into other_user_id
  from unnest(conversation_participants) participant_id
  where participant_id <> new.sender_id
  limit 1;

  if private.users_have_block(new.sender_id, other_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Messaging is unavailable for this user';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_dm_message_not_blocked()
  from public, anon, authenticated;

drop trigger if exists enforce_dm_message_not_blocked on public.dm_messages;
create trigger enforce_dm_message_not_blocked
  before insert on public.dm_messages
  for each row execute function private.enforce_dm_message_not_blocked();

create or replace function private.enforce_dm_reaction_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_participants uuid[];
  other_user_id uuid;
begin
  if new.dm_message_id is null then
    return new;
  end if;

  select conversations.participants
  into conversation_participants
  from public.dm_messages messages
  join public.dm_conversations conversations
    on conversations.id = messages.conversation_id
  where messages.id = new.dm_message_id;

  if conversation_participants is null
    or not (new.user_id = any (conversation_participants)) then
    raise exception using
      errcode = '42501',
      message = 'Reaction user is not a participant in this conversation';
  end if;

  select participant_id
  into other_user_id
  from unnest(conversation_participants) participant_id
  where participant_id <> new.user_id
  limit 1;

  if private.users_have_block(new.user_id, other_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Messaging is unavailable for this user';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_dm_reaction_not_blocked()
  from public, anon, authenticated;

drop trigger if exists enforce_dm_reaction_not_blocked
  on public.message_reactions;
create trigger enforce_dm_reaction_not_blocked
  before insert on public.message_reactions
  for each row execute function private.enforce_dm_reaction_not_blocked();

drop function if exists public.get_or_create_dm_conversation(uuid);

create or replace function public.get_or_create_dm_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  conversation_id uuid;
  participants_array uuid[];
begin
  if current_user_id is null then
    raise exception 'User not authenticated';
  end if;

  if other_user_id is null then
    raise exception 'Other user is required';
  end if;

  if current_user_id = other_user_id then
    raise exception 'Cannot create conversation with yourself';
  end if;

  if not exists (
    select 1 from public.users users
    where users.id = get_or_create_dm_conversation.other_user_id
  ) then
    raise exception 'User not found';
  end if;

  if private.users_have_block(current_user_id, other_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Messaging is unavailable for this user';
  end if;

  participants_array := array[
    least(current_user_id, other_user_id),
    greatest(current_user_id, other_user_id)
  ];

  select conversations.id
  into conversation_id
  from public.dm_conversations conversations
  where conversations.participants = participants_array;

  if conversation_id is null then
    insert into public.dm_conversations (participants)
    values (participants_array)
    returning id into conversation_id;
  end if;

  return conversation_id;
end;
$$;

revoke all on function public.get_or_create_dm_conversation(uuid)
  from public, anon, authenticated;
grant execute on function public.get_or_create_dm_conversation(uuid)
  to authenticated, service_role;

drop function if exists public.get_dm_conversations();

create or replace function public.get_dm_conversations()
returns table (
  id uuid,
  participants uuid[],
  last_message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  other_user jsonb,
  last_message jsonb,
  unread_count integer,
  is_blocked boolean,
  blocked_by_me boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
begin
  if caller_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    conversation_row.id,
    conversation_row.participants,
    conversation_row.last_message_at,
    conversation_row.created_at,
    conversation_row.updated_at,
    (
      select public.user_public_profile_json(other_user_row)
      from public.users other_user_row
      where other_user_row.id <> caller_user_id
        and other_user_row.id = any (conversation_row.participants)
      limit 1
    ) as other_user,
    case
      when relationship.is_blocked then null
      else (
        select to_jsonb(message_row)
        from public.dm_messages message_row
        where message_row.conversation_id = conversation_row.id
        order by message_row.created_at desc, message_row.id desc
        limit 1
      )
    end as last_message,
    case
      when relationship.is_blocked then 0
      else (
        select count(*)::integer
        from public.dm_messages unread_message_row
        where unread_message_row.conversation_id = conversation_row.id
          and unread_message_row.sender_id <> caller_user_id
          and (
            unread_message_row.read_by is null
            or not (caller_user_id = any (unread_message_row.read_by))
          )
      )
    end as unread_count,
    relationship.is_blocked,
    relationship.blocked_by_me
  from public.dm_conversations conversation_row
  cross join lateral (
    select
      private.users_have_block(
        caller_user_id,
        (
          select participant_id
          from unnest(conversation_row.participants) participant_id
          where participant_id <> caller_user_id
          limit 1
        )
      ) as is_blocked,
      exists (
        select 1
        from public.user_blocks blocks
        where blocks.blocker_id = caller_user_id
          and blocks.blocked_id = (
            select participant_id
            from unnest(conversation_row.participants) participant_id
            where participant_id <> caller_user_id
            limit 1
          )
      ) as blocked_by_me
  ) relationship
  where caller_user_id = any (conversation_row.participants)
  order by conversation_row.last_message_at desc, conversation_row.id desc;
end;
$$;

revoke all on function public.get_dm_conversations()
  from public, anon, authenticated;
grant execute on function public.get_dm_conversations() to authenticated;

comment on function public.get_dm_conversations() is
  'Returns preserved DM threads with safe profiles and a direction-private pair-block state. Blocked previews and unread counts are suppressed.';

create or replace function public.count_unread_dm_messages(
  target_user_id uuid default auth.uid()
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_role text := auth.role();
  unread_count integer;
begin
  if target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if caller_role is distinct from 'service_role'
    and (caller_user_id is null or target_user_id is distinct from caller_user_id) then
    raise exception 'Users may only count their own unread messages';
  end if;

  select count(*)::integer
  into unread_count
  from public.dm_messages message
  join public.dm_conversations conversation
    on conversation.id = message.conversation_id
  where target_user_id = any (conversation.participants)
    and message.sender_id <> target_user_id
    and not private.users_have_block(target_user_id, message.sender_id)
    and (
      message.read_by is null
      or not (target_user_id = any (message.read_by))
    );

  return unread_count;
end;
$$;

revoke all on function public.count_unread_dm_messages(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.count_unread_dm_messages(uuid)
  to authenticated, service_role;

create or replace function public.search_users(term text)
returns table(
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_thumbnail_url text,
  color text,
  status text,
  admin_role text,
  checkers_crown boolean,
  war_sword boolean,
  shadow_pin_gold_pin boolean,
  shadow_runner_sprint_medal boolean,
  shadow_runner_knight_medal boolean,
  shadow_runner_knight_level_id text,
  gold_easter_egg boolean,
  presence_visibility text,
  dm_discoverable boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
begin
  if caller_user_id is null then
    raise exception 'User not authenticated';
  end if;

  if length(trim(coalesce(search_users.term, ''))) < 2 then
    return;
  end if;

  return query
  select
    users.id,
    users.username,
    users.display_name,
    users.avatar_url,
    users.avatar_thumbnail_url,
    users.color,
    users.status,
    users.admin_role,
    users.checkers_crown,
    users.war_sword,
    users.shadow_pin_gold_pin,
    users.shadow_runner_sprint_medal,
    users.shadow_runner_knight_medal,
    users.shadow_runner_knight_level_id,
    users.gold_easter_egg,
    users.presence_visibility,
    users.dm_discoverable
  from public.users users
  where users.id <> caller_user_id
    and users.dm_discoverable is true
    and not private.users_have_block(caller_user_id, users.id)
    and (
      users.username ilike '%' || trim(search_users.term) || '%'
      or users.display_name ilike '%' || trim(search_users.term) || '%'
    )
  order by lower(coalesce(users.display_name, users.username, '')), lower(users.username)
  limit 30;
end;
$$;

revoke all on function public.search_users(text)
  from public, anon, authenticated;
grant execute on function public.search_users(text)
  to authenticated, service_role;

create or replace function public.list_presence_states()
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  color text,
  presence_visibility text,
  presence_state text,
  is_active boolean,
  last_seen timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    users.id as user_id,
    users.username,
    users.display_name,
    users.avatar_url,
    users.color,
    users.presence_visibility,
    case
      when users.presence_visibility = 'invisible' then 'invisible'
      when user_presence.status = 'online'
        and user_presence.last_seen > now() - interval '2 minutes'
        then 'online'
      else 'offline'
    end as presence_state,
    (
      users.presence_visibility = 'tracked'
      and user_presence.status = 'online'
      and user_presence.last_seen > now() - interval '2 minutes'
    ) as is_active,
    user_presence.last_seen
  from public.users users
  left join public.user_presence user_presence
    on user_presence.user_id = users.id
  where users.id = caller_user_id
    or not private.users_have_block(caller_user_id, users.id)
  order by lower(coalesce(users.display_name, users.username, ''));
end;
$$;

revoke all on function public.list_presence_states()
  from public, anon, authenticated;
grant execute on function public.list_presence_states() to authenticated;

create or replace function public.get_active_users()
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  color text,
  last_seen timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
begin
  if caller_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    users.id as user_id,
    users.username,
    users.display_name,
    users.avatar_url,
    users.color,
    user_presence.last_seen
  from public.users users
  inner join public.user_presence user_presence
    on user_presence.user_id = users.id
  where users.presence_visibility = 'tracked'
    and user_presence.status = 'online'
    and user_presence.last_seen > now() - interval '2 minutes'
    and (
      users.id = caller_user_id
      or not private.users_have_block(caller_user_id, users.id)
    )
  order by lower(coalesce(users.display_name, users.username, ''));
end;
$$;

revoke all on function public.get_active_users()
  from public, anon, authenticated;
grant execute on function public.get_active_users() to authenticated;

commit;
