/*
  Admin Operations Health Center.

  Release and monitoring automation write one sanitized production snapshot
  with the service role. Authenticated app operators may read it; normal
  members and anonymous callers cannot. No credential values, provider
  responses, user data, or raw logs are stored here.
*/

create table if not exists public.operations_health_snapshot (
  environment text primary key
    check (environment in ('production')),
  frontend_sha text
    check (frontend_sha is null or char_length(frontend_sha) <= 80),
  frontend_build_id text
    check (frontend_build_id is null or char_length(frontend_build_id) <= 160),
  deploy_id text
    check (deploy_id is null or char_length(deploy_id) <= 160),
  deploy_url text
    check (deploy_url is null or char_length(deploy_url) <= 600),
  release_workflow_url text
    check (release_workflow_url is null or char_length(release_workflow_url) <= 600),
  deployed_at timestamptz,
  migration_version text
    check (migration_version is null or migration_version ~ '^[0-9]{14}$'),
  migrations_current boolean not null default false,
  function_manifest_sha256 text
    check (
      function_manifest_sha256 is null
      or function_manifest_sha256 ~ '^[a-f0-9]{64}$'
    ),
  active_function_count integer not null default 0
    check (active_function_count >= 0),
  paused_function_count integer not null default 0
    check (paused_function_count >= 0),
  removed_function_count integer not null default 0
    check (removed_function_count >= 0),
  functions_current boolean not null default false,
  backend_checked_at timestamptz,
  smoke_status text not null default 'pending'
    check (smoke_status in ('pending', 'passed', 'failed')),
  smoke_checked_at timestamptz,
  app_http_status integer
    check (app_http_status is null or app_http_status between 100 and 599),
  push_ready boolean not null default false,
  push_missing_requirements text[] not null default '{}'::text[],
  news_state text not null default 'paused'
    check (news_state in ('paused')),
  bridge_state text not null default 'paused'
    check (bridge_state in ('paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.operations_health_snapshot enable row level security;

create or replace function private.is_operations_health_operator(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles roles
    where roles.user_id = target_user_id
      and roles.role in ('admin', 'sub_admin')
  );
$$;

revoke all on function private.is_operations_health_operator(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_operations_health_operator(uuid) to authenticated;

drop policy if exists "App operators can read operations health" on public.operations_health_snapshot;
create policy "App operators can read operations health"
on public.operations_health_snapshot
for select
to authenticated
using ((select private.is_operations_health_operator((select auth.uid()))));

drop trigger if exists update_operations_health_snapshot_updated_at
  on public.operations_health_snapshot;
create trigger update_operations_health_snapshot_updated_at
  before update on public.operations_health_snapshot
  for each row execute function public.update_updated_at_column();

revoke all on table public.operations_health_snapshot from public, anon, authenticated;
grant select on table public.operations_health_snapshot to authenticated;
grant all on table public.operations_health_snapshot to service_role;

comment on table public.operations_health_snapshot is
  'Sanitized production release and monitor evidence readable only by app operators.';
comment on column public.operations_health_snapshot.push_missing_requirements is
  'Configuration names only; never credential values.';
