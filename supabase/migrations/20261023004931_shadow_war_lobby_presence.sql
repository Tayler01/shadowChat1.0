-- Preserve the full app's lobby roster without client-authored public Presence.
begin;

create table public.shadow_war_lobby_presence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  joined_at timestamptz not null,
  updated_at timestamptz not null,
  expires_at timestamptz not null
);
alter table public.shadow_war_lobby_presence enable row level security;
alter table public.shadow_war_lobby_presence replica identity default;
create index shadow_war_lobby_presence_expiry_idx on public.shadow_war_lobby_presence(expires_at);
revoke all on public.shadow_war_lobby_presence from public, anon, authenticated;
grant select on public.shadow_war_lobby_presence to authenticated;
grant all on public.shadow_war_lobby_presence to service_role;

create function private.lobby_actor_is_visible(target_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and exists (select 1 from public.users where id = target_user_id and presence_visibility = 'tracked')
    and not exists (select 1 from private.account_deletion_jobs where user_id = target_user_id)
    and not private.users_have_block(auth.uid(), target_user_id);
$$;
revoke all on function private.lobby_actor_is_visible(uuid) from public, anon, authenticated;
grant execute on function private.lobby_actor_is_visible(uuid) to authenticated;

create policy "Members read visible lobby members"
on public.shadow_war_lobby_presence for select to authenticated
using ((select private.is_active_member()) and private.lobby_actor_is_visible(user_id));

create function public.set_shadow_war_lobby_presence(p_is_present boolean)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_time_at timestamptz := clock_timestamp();
begin
  if not private.is_active_member() or actor_id is null or p_is_present is null then
    raise exception 'Lobby presence is unavailable' using errcode = '42501';
  end if;
  if p_is_present and exists (select 1 from public.users where id = actor_id and presence_visibility = 'tracked') then
    insert into public.shadow_war_lobby_presence(user_id, joined_at, updated_at, expires_at)
    values (actor_id, current_time_at, current_time_at, current_time_at + interval '45 seconds')
    on conflict (user_id) do update set
      joined_at = case when public.shadow_war_lobby_presence.expires_at <= current_time_at then excluded.joined_at else public.shadow_war_lobby_presence.joined_at end,
      updated_at = excluded.updated_at, expires_at = excluded.expires_at
    where public.shadow_war_lobby_presence.expires_at <= current_time_at
      or public.shadow_war_lobby_presence.updated_at <= current_time_at - interval '15 seconds';
  else
    update public.shadow_war_lobby_presence set expires_at = current_time_at, updated_at = current_time_at
    where user_id = actor_id and expires_at > current_time_at;
  end if;
  delete from public.shadow_war_lobby_presence where id in (
    select id from public.shadow_war_lobby_presence
    where expires_at < current_time_at - interval '1 hour'
    order by expires_at limit 50
  );
end;
$$;
revoke all on function public.set_shadow_war_lobby_presence(boolean) from public, anon, authenticated;
grant execute on function public.set_shadow_war_lobby_presence(boolean) to authenticated;

create function public.list_shadow_war_lobby_presence()
returns table (user_id uuid, username text, display_name text, avatar_url text, joined_at timestamptz, expires_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select state.user_id, profile.username, profile.display_name, profile.avatar_url, state.joined_at, state.expires_at
  from public.shadow_war_lobby_presence state
  join public.users profile on profile.id = state.user_id
  where state.expires_at > now()
  order by state.joined_at, state.id limit 100;
$$;
revoke all on function public.list_shadow_war_lobby_presence() from public, anon, authenticated;
grant execute on function public.list_shadow_war_lobby_presence() to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shadow_war_lobby_presence;
  end if;
end; $$;
commit;
