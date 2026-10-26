-- Revoke access as soon as account deletion starts, including already-issued
-- JWTs. This does not alter the platform-owned auth.uid() implementation.
begin;

create table private.account_deletion_jobs (
  user_id uuid primary key,
  receipt_digest text not null check (receipt_digest ~ '^[0-9a-f]{64}$'),
  state text not null default 'requested'
    check (state in ('requested','providers_removed','storage_removed','data_removed','completed')),
  manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(manifest) = 'object'),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  receipt_expires_at timestamptz,
  check ((state = 'completed') = (completed_at is not null)),
  check (receipt_expires_at is null or receipt_expires_at > completed_at)
);
alter table private.account_deletion_jobs enable row level security;
revoke all on private.account_deletion_jobs from public, anon, authenticated;
grant select, insert, update, delete on private.account_deletion_jobs to service_role;
grant usage on schema private to service_role;
create unique index account_deletion_jobs_receipt_digest_idx on private.account_deletion_jobs(receipt_digest);

create function private.is_active_member()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (select 1 from public.users u where u.id = auth.uid())
    and not exists (select 1 from private.account_deletion_jobs d where d.user_id = auth.uid());
$$;
revoke all on function private.is_active_member() from public, anon, authenticated;
grant execute on function private.is_active_member() to authenticated, service_role;

-- Serialize managed object/content writes with deletion startup. The volatile
-- trigger's query runs after the per-member lock is acquired, so a writer that
-- waited behind deletion observes its committed job instead of a stale RLS
-- snapshot. DELETE remains available to the trusted cleanup worker.
create function private.guard_account_deletion_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb := to_jsonb(new); previous jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  candidates text[] := array[]::text[]; candidate text; member_id uuid; inferred_owner uuid; object_name text;
begin
  if tg_table_schema <> 'storage' and tg_op = 'UPDATE'
    and row_data->tg_argv[0] = 'null'::jsonb
    and row_data - tg_argv[0] = previous - tg_argv[0] then
    return new; -- exact FK anonymization during Auth deletion
  end if;
  if tg_table_schema = 'storage' then
    if row_data->>'bucket_id' <> all(array['avatars','banners','message-media','chat-uploads','art-board','shadow-pin','shadow-pin-comments','shadow-pin-drafts','shado-tv','feedback-attachments','moderation-evidence']) then return new; end if;
    candidates := array[row_data->>'owner',row_data->>'owner_id',split_part(row_data->>'name','/',1),
      previous->>'owner',previous->>'owner_id',split_part(previous->>'name','/',1),auth.uid()::text];
    foreach object_name in array array[row_data->>'name',previous->>'name'] loop
      if object_name ~ '^derivatives/(images|categories)/[0-9a-f-]{36}/' then
        if split_part(object_name,'/',2) = 'images' then
          select creator_id into inferred_owner from public.shadow_pin_images where id::text = split_part(object_name,'/',3);
        else
          select creator_id into inferred_owner from public.shadow_pin_categories where id::text = split_part(object_name,'/',3);
        end if;
        candidates := array_append(candidates,inferred_owner::text);
      end if;
    end loop;
  else
    candidates := array[row_data->>tg_argv[0],previous->>tg_argv[0]];
  end if;
  for candidate in select distinct value from unnest(candidates) value
    where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' order by value
  loop
    member_id := candidate::uuid;
    perform pg_advisory_xact_lock(hashtextextended('account-deletion:' || member_id::text,0));
    if exists(select 1 from private.account_deletion_jobs where user_id = member_id) and not coalesce((
      current_setting('role',true) = 'service_role' and current_setting('shadowchat.account_deletion_user',true) = member_id::text
      and exists(select 1 from private.account_deletion_jobs where user_id = member_id and state = 'storage_removed')
    ),false) then raise exception using errcode = '42501', message = 'Account deletion has started; new uploads and content changes are disabled'; end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.guard_account_deletion_write() from public, anon, authenticated;
do $$ declare guarded record; begin
  for guarded in select * from (values
    ('storage.objects',''),('public.shadow_pin_images','creator_id'),('public.shadow_pin_categories','creator_id'),
    ('public.shadow_pin_draft_assets','creator_id'),('public.shado_tv_videos','created_by'),('public.live_rooms','host_user_id')
  ) domains(relation_name,owner_column) loop
    if to_regclass(guarded.relation_name) is not null then
      execute format('create trigger account_deletion_write_guard before insert or update on %s for each row execute function private.guard_account_deletion_write(%L)',guarded.relation_name,guarded.owner_column);
    end if;
  end loop;
end; $$;

-- The service role must validate the end-user before privileged Edge/Netlify
-- work. This exposes only a boolean and is not executable by browser roles.
create function public.is_active_member_for_service(target_user_id uuid)
returns boolean language sql stable security invoker
set search_path = ''
begin atomic
  select target_user_id is not null
    and exists (select 1 from public.users u where u.id = target_user_id)
    and not exists (select 1 from private.account_deletion_jobs d where d.user_id = target_user_id);
end;
revoke all on function public.is_active_member_for_service(uuid) from public, anon, authenticated;
grant execute on function public.is_active_member_for_service(uuid) to service_role;

create function private.require_active_member_request()
returns void language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' and not private.is_active_member() then
    raise exception using errcode = '42501',
      message = 'This account no longer has access. Account deletion can be retried from the deletion screen.';
  end if;
end;
$$;
revoke all on function private.require_active_member_request() from public, anon, authenticated;
grant execute on function private.require_active_member_request() to anon, authenticated, service_role;

-- SQL-standard bodies bind the private function at definition time. Browser
-- roles retain no USAGE on private and gain no direct private RPC surface.
create function public.require_active_member_request()
returns void language sql stable security invoker
set search_path = ''
begin atomic
  select private.require_active_member_request();
end;
revoke all on function public.require_active_member_request() from public, anon, authenticated;
grant execute on function public.require_active_member_request() to anon, authenticated, service_role;

-- Postgres Changes uses table RLS, not the PostgREST pre-request hook. Restrict
-- every existing protected public table without changing its grants/permissive
-- rules. SELECT subqueries make the stable member check an InitPlan per query.
do $$
declare relation record;
begin
  for relation in
    select n.nspname, c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','p') and c.relrowsecurity
      and (n.nspname = 'public'
        or (n.nspname = 'storage' and c.relname = 'objects')
        or (n.nspname = 'realtime' and c.relname = 'messages'))
  loop
    execute format('create policy active_member_required on %I.%I as restrictive for all to authenticated using ((select private.is_active_member())) with check ((select private.is_active_member()))', relation.nspname, relation.relname);
  end loop;
end;
$$;

-- Fail rather than silently replace another request hook if deployment state
-- has drifted. The linked read-only check found no pre-existing hook.
do $$
declare existing_hook text;
begin
  select split_part(setting, '=', 2) into existing_hook
  from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
  cross join unnest(s.setconfig) setting
  where r.rolname = 'authenticator' and setting like 'pgrst.db_pre_request=%'
    and split_part(setting, '=', 2) <> '' limit 1;
  if existing_hook is not null and existing_hook <> 'public.require_active_member_request' then
    raise exception 'Existing PostgREST pre-request hook must be composed before applying active-member enforcement';
  end if;
end;
$$;
alter role authenticator set pgrst.db_pre_request = 'public.require_active_member_request';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

comment on table private.account_deletion_jobs is
  'Service-only retry manifest. Pending jobs deny member access; completed manifests are cleared and receipts expire after 24 hours.';
commit;
