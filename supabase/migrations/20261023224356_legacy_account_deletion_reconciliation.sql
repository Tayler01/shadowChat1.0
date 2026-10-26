-- Resume only deletions already authorized by the published full client's
-- verified-bearer adapter. This additive foundation installs no scheduler.
begin;

create table private.account_deletion_legacy_reconciliation (
  user_id uuid primary key references private.account_deletion_jobs(user_id) on delete cascade,
  worker_id uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_claimed_at timestamptz,
  last_finished_at timestamptz,
  last_result text check (last_result in ('retry', 'completed')),
  check ((worker_id is null) = (lease_expires_at is null))
);
alter table private.account_deletion_legacy_reconciliation enable row level security;
revoke all on private.account_deletion_legacy_reconciliation from public, anon, authenticated;
grant select, insert, update on private.account_deletion_legacy_reconciliation to service_role;

create function public.claim_legacy_account_deletion_job(worker_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  job private.account_deletion_jobs%rowtype;
  claimed_at timestamptz := clock_timestamp();
begin
  if worker_id is null then raise exception 'A reconciliation worker is required'; end if;
  -- Lock the existing durable job, not a client-supplied account. Two workers
  -- cannot obtain the same lease, and a busy job never stalls the queue.
  select j.* into job
  from private.account_deletion_jobs j
  left join private.account_deletion_legacy_reconciliation r on r.user_id = j.user_id
  where j.state <> 'completed'
    and j.updated_at <= claimed_at - interval '5 minutes'
    and exists (select 1 from private.account_deletion_legacy_bearers b where b.user_id = j.user_id)
    and (r.user_id is null or (r.next_attempt_at <= claimed_at
      and (r.lease_expires_at is null or r.lease_expires_at <= claimed_at)))
  order by coalesce(r.next_attempt_at, j.updated_at), j.requested_at, j.user_id
  limit 1 for update of j skip locked;
  if not found then return null; end if;

  insert into private.account_deletion_legacy_reconciliation as r
    (user_id, worker_id, lease_expires_at, next_attempt_at, attempt_count, last_claimed_at)
  values (job.user_id, worker_id, claimed_at + interval '5 minutes',
    claimed_at + interval '5 minutes', 1, claimed_at)
  on conflict (user_id) do update set
    worker_id = excluded.worker_id,
    lease_expires_at = excluded.lease_expires_at,
    next_attempt_at = excluded.next_attempt_at,
    attempt_count = least(r.attempt_count::bigint + 1, 2147483647)::integer,
    last_claimed_at = excluded.last_claimed_at;

  return jsonb_build_object('user_id', job.user_id, 'state', job.state, 'manifest', job.manifest);
end;
$$;

create function public.finish_legacy_account_deletion_attempt(
  target_user_id uuid, worker_id uuid, completed boolean
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  job_state text;
  attempt private.account_deletion_legacy_reconciliation%rowtype;
  finished_at timestamptz := clock_timestamp();
begin
  if target_user_id is null or worker_id is null or completed is null then
    raise exception 'A reconciliation attempt is required';
  end if;
  -- Use the same lock order as claim. This function records an outcome only;
  -- the normal evidence/provider/Storage/data/Auth-last workflow owns progress.
  select state into job_state from private.account_deletion_jobs
    where user_id = target_user_id for update;
  if not found then raise exception 'Unknown reconciliation job'; end if;
  select * into attempt from private.account_deletion_legacy_reconciliation
    where user_id = target_user_id for update;
  if not found or attempt.worker_id is distinct from worker_id
    or attempt.lease_expires_at is null or attempt.lease_expires_at <= finished_at then
    raise exception 'The reconciliation lease is not active';
  end if;
  if completed and job_state <> 'completed' then
    raise exception 'Deletion has not completed';
  end if;

  update private.account_deletion_legacy_reconciliation set
    worker_id = null,
    lease_expires_at = null,
    next_attempt_at = case when job_state = 'completed' then finished_at else
      finished_at + make_interval(secs => least(3600,
        60 * power(2, least(greatest(attempt.attempt_count - 1, 0), 6))::integer)) end,
    last_finished_at = finished_at,
    last_result = case when job_state = 'completed' then 'completed' else 'retry' end
  where user_id = target_user_id;
end;
$$;

create function public.get_legacy_account_deletion_reconciliation_status()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'pending_jobs', count(*) filter (where j.state <> 'completed'),
    'eligible_jobs', count(*) filter (where j.state <> 'completed'
      and j.updated_at <= now() - interval '5 minutes'
      and (r.user_id is null or (r.next_attempt_at <= now()
        and (r.lease_expires_at is null or r.lease_expires_at <= now())))),
    'leased_jobs', count(*) filter (where j.state <> 'completed' and r.lease_expires_at > now()),
    'completed_jobs', count(*) filter (where j.state = 'completed'),
    'attempted_jobs', count(r.user_id),
    'total_attempts', coalesce(sum(r.attempt_count), 0),
    'max_attempts', coalesce(max(r.attempt_count), 0),
    'oldest_pending_at', min(j.requested_at) filter (where j.state <> 'completed'),
    'last_claimed_at', max(r.last_claimed_at),
    'last_finished_at', max(r.last_finished_at)
  ) from private.account_deletion_jobs j
  left join private.account_deletion_legacy_reconciliation r on r.user_id = j.user_id
  where exists (select 1 from private.account_deletion_legacy_bearers b where b.user_id = j.user_id);
$$;

revoke all on function public.claim_legacy_account_deletion_job(uuid),
  public.finish_legacy_account_deletion_attempt(uuid,uuid,boolean),
  public.get_legacy_account_deletion_reconciliation_status() from public, anon, authenticated;
grant execute on function public.claim_legacy_account_deletion_job(uuid),
  public.finish_legacy_account_deletion_attempt(uuid,uuid,boolean),
  public.get_legacy_account_deletion_reconciliation_status() to service_role;
comment on table private.account_deletion_legacy_reconciliation is
  'Bounded service-worker leases for existing verified legacy deletion jobs; no tokens, new deletion authority, or scheduler. Removed when completed job receipts are pruned.';

-- The hosted database disallows a custom function SET parameter. Keep the
-- reviewed dispatch target in an owner-only singleton instead; callers cannot
-- supply it through a session GUC or a public/service API.
create table private.legacy_account_deletion_dispatch_config (
  singleton boolean primary key default true check (singleton),
  project_ref text check (project_ref ~ '^[a-z]{20}$'),
  credential_sha256 text not null check (credential_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
alter table private.legacy_account_deletion_dispatch_config enable row level security;
revoke all on private.legacy_account_deletion_dispatch_config from public, anon, authenticated, service_role;
comment on table private.legacy_account_deletion_dispatch_config is
  'Owner-only reviewed project and credential fingerprint for the dormant legacy deletion dispatcher. Empty until explicit operations setup; never contains credentials.';

-- Dormant until an operator binds this exact dispatcher to a reviewed project.
-- No cron schedule, Vault mutation or HTTP request is performed by foundation.
create or replace function private.request_legacy_account_deletion_reconciliation()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  worker_url text;
  worker_key text;
  payload_segment text;
  key_claims jsonb;
  project_ref text;
  credential_sha256 text;
  request_headers jsonb;
  request_id bigint;
begin
  select configured.project_ref, configured.credential_sha256 into project_ref, credential_sha256
    from private.legacy_account_deletion_dispatch_config configured where configured.singleton;
  if project_ref is null or project_ref !~ '^[a-z]{20}$'
    or credential_sha256 is null or credential_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Legacy deletion reconciliation is not configured';
  end if;
  -- The Edge action independently claims at most one eligible job under a
  -- five-minute lease. A queued HTTP timeout never releases that lease early.
  if not exists(select 1 from private.account_deletion_jobs j
    join private.account_deletion_legacy_bearers b on b.user_id = j.user_id
    where j.state <> 'completed') then
    return null;
  end if;
  if (select count(*) from vault.decrypted_secrets where name = 'shadowchat_legacy_deletion_reconcile_url') <> 1
    or (select count(*) from vault.decrypted_secrets where name = 'shadowchat_legacy_deletion_service_role_key') <> 1 then
    raise exception 'Reconciliation credentials are unavailable';
  end if;
  select decrypted_secret into worker_url from vault.decrypted_secrets
    where name = 'shadowchat_legacy_deletion_reconcile_url';
  select decrypted_secret into worker_key from vault.decrypted_secrets
    where name = 'shadowchat_legacy_deletion_service_role_key';
  -- The owner-only configuration fixes the reviewed target and key fingerprint.
  -- Opaque API keys do not encode a project; their source is verified during
  -- operations setup, then every dispatch pins these exact bytes and URL.
  if project_ref is null or project_ref !~ '^[a-z]{20}$'
    or worker_url is distinct from 'https://' || project_ref || '.supabase.co/functions/v1/delete-account'
    or worker_key is null
    or encode(sha256(convert_to(worker_key, 'UTF8')), 'hex') is distinct from credential_sha256 then
    raise exception 'Reconciliation endpoint or service credential is invalid';
  end if;
  if worker_key ~ '^sb_secret_[A-Za-z0-9_-]+$' and length(worker_key) between 30 and 266 then
    request_headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', worker_key);
  elsif worker_key ~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    begin
      payload_segment := split_part(worker_key, '.', 2);
      key_claims := convert_from(decode(translate(payload_segment, '-_', '+/')
        || repeat('=', (4 - length(payload_segment) % 4) % 4), 'base64'), 'UTF8')::jsonb;
    exception when others then
      raise exception 'Reconciliation service credential is invalid';
    end;
    -- Legacy target-mismatch check only; the Edge handler still requires an
    -- exact configured credential match before any administrative work.
    if key_claims->>'role' is distinct from 'service_role'
      or key_claims->>'ref' is distinct from project_ref then
      raise exception 'Reconciliation service credential belongs to another role or project';
    end if;
    request_headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || worker_key);
  else
    raise exception 'Reconciliation service credential is invalid';
  end if;
  select net.http_post(
    url := worker_url,
    headers := request_headers,
    body := jsonb_build_object('action', 'reconcile-legacy'),
    timeout_milliseconds := 30000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function private.request_legacy_account_deletion_reconciliation()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
