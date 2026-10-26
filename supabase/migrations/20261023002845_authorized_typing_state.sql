-- Authenticated, expiring typing state. No profile labels or DM metadata travel
-- through client-authored Broadcast payloads. Requires active-member boundary.
begin;

-- Keep privileged implementations inaccessible to direct browser-role SQL.
-- Legacy full-app RPCs still require USAGE on the separate private schema.
create schema if not exists member_mutation_private;
revoke all on schema member_mutation_private from public, anon, authenticated, service_role;

create table public.typing_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  scope_key text not null check (length(scope_key) <= 64),
  expires_at timestamptz not null,
  updated_at timestamptz not null,
  unique (user_id, scope_key)
);
alter table public.typing_states enable row level security;
-- Realtime DELETE is not RLS-filtered. Only an opaque UUID may be in old keys.
alter table public.typing_states replica identity default;
create index typing_states_scope_expiry_idx on public.typing_states(scope_key, expires_at);
create index typing_states_expiry_idx on public.typing_states(expires_at);
revoke all on public.typing_states from public, anon, authenticated;
grant select on public.typing_states to authenticated;
grant all on public.typing_states to service_role;

-- This helper is INVOKER so message/conversation RLS decides thread visibility.
-- SQL-standard bodies retain definition-time dependencies on private helpers.
create function private.typing_scope_is_visible(target_scope_key text)
returns boolean language sql stable security invoker set search_path = ''
return (
  select (select private.is_active_member()) and case
    when target_scope_key = 'general' then true
    when target_scope_key ~ '^dm-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
      select 1 from public.dm_conversations conversation
      where conversation.id = substring(target_scope_key from 4)::uuid
        and auth.uid() = any(conversation.participants)
        and not exists (
          select 1 from unnest(conversation.participants) participant(user_id)
          where private.users_have_block(auth.uid(), participant.user_id)
        )
    )
    when target_scope_key ~ '^general-thread:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
      select 1 from public.messages message
      where message.id = substring(target_scope_key from 16)::uuid
        and message.reply_to is null
    )
    else false
  end
);
revoke all on function private.typing_scope_is_visible(text) from public, anon, authenticated;
grant execute on function private.typing_scope_is_visible(text) to authenticated;

create function private.typing_actor_is_visible(target_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and exists (select 1 from public.users where id = target_user_id)
    and not exists (select 1 from private.account_deletion_jobs where user_id = target_user_id)
    and not private.users_have_block(auth.uid(), target_user_id);
$$;
revoke all on function private.typing_actor_is_visible(uuid) from public, anon, authenticated;
grant execute on function private.typing_actor_is_visible(uuid) to authenticated;

create policy "Members read authorized typing state"
  on public.typing_states for select to authenticated
  using (private.typing_scope_is_visible(scope_key) and private.typing_actor_is_visible(user_id));

-- Only the bound invoker wrapper can supply caller-RLS authorization. Browsers
-- have no member_mutation_private USAGE and no table mutation grants, identity/time args,
-- or public path accepting this authorization flag.
create function member_mutation_private.set_typing_status_authorized(
  target_scope_key text,
  p_is_typing boolean,
  p_scope_visible boolean
)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_time_at timestamptz := clock_timestamp();
begin
  if p_scope_visible is distinct from true or not private.is_active_member()
    or actor_id is null or p_is_typing is null then
    raise exception 'Typing is unavailable for this conversation' using errcode = '42501';
  end if;
  if p_is_typing and (target_scope_key = 'general' or target_scope_key like 'general-thread:%')
    and public.is_user_channel_banned(actor_id, 'general_chat') then
    raise exception 'Typing is unavailable for this conversation' using errcode = '42501';
  end if;

  if p_is_typing then
    insert into public.typing_states(user_id, scope_key, expires_at, updated_at)
    values (actor_id, target_scope_key, current_time_at + interval '6 seconds', current_time_at)
    on conflict (user_id, scope_key) do update
      set expires_at = excluded.expires_at, updated_at = excluded.updated_at
      where public.typing_states.expires_at <= current_time_at
        or public.typing_states.updated_at <= current_time_at - interval '2 seconds';
  else
    -- Keep the row selectable after stop so an RLS-checked UPDATE can clear
    -- recipients immediately. The list RPC filters expired state.
    update public.typing_states set expires_at = current_time_at, updated_at = current_time_at
    where user_id = actor_id and scope_key = target_scope_key and expires_at > current_time_at;
  end if;

  -- Best-effort bounded cleanup. Active rows are never touched; old delete
  -- payloads contain only the opaque primary key, never scope/member metadata.
  delete from public.typing_states where id in (
    select id from public.typing_states
    where expires_at < current_time_at - interval '1 hour'
    order by expires_at limit 50
  );
end;
$$;
revoke all on function member_mutation_private.set_typing_status_authorized(text, boolean, boolean) from public, anon, authenticated;
grant execute on function member_mutation_private.set_typing_status_authorized(text, boolean, boolean) to authenticated;

create function public.set_typing_status(target_scope_key text, p_is_typing boolean)
returns void language sql volatile security invoker set search_path = ''
begin atomic
  select member_mutation_private.set_typing_status_authorized(target_scope_key, p_is_typing, private.typing_scope_is_visible(target_scope_key));
end;
revoke all on function public.set_typing_status(text, boolean) from public, anon, authenticated;
grant execute on function public.set_typing_status(text, boolean) to authenticated;

create function public.list_typing_states(target_scope_key text)
returns table (user_id uuid, username text, display_name text, expires_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select state.user_id, profile.username, profile.display_name, state.expires_at
  from public.typing_states state
  join public.users profile on profile.id = state.user_id
  where state.scope_key = target_scope_key and state.expires_at > now()
    and state.user_id <> auth.uid()
  order by state.updated_at desc, state.id
  limit 20;
$$;
revoke all on function public.list_typing_states(text) from public, anon, authenticated;
grant execute on function public.list_typing_states(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.typing_states;
  end if;
end;
$$;
comment on table public.typing_states is
  'Server-authorized typing hints with six-second expiry. Only INSERT/UPDATE should be subscribed to; opaque id is the sole DELETE key. No client-authored names or timestamps.';
commit;
