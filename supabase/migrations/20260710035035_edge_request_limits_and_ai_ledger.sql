begin;

-- Edge Functions use these private tables through the service-role-only RPCs
-- below. Browser roles cannot inspect, increment, or forge request budgets and
-- idempotency claims. The claim table also serves as the durable AI request
-- ledger without exposing prompts or provider responses through the Data API.
create schema if not exists private;

create table if not exists private.edge_request_buckets (
  request_scope text not null,
  subject_id uuid not null references public.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (request_scope, subject_id, window_started_at),
  constraint edge_request_buckets_scope_check
    check (request_scope ~ '^[a-z0-9][a-z0-9:_-]{0,95}$')
);

create index if not exists edge_request_buckets_expiry_idx
  on private.edge_request_buckets (window_started_at);

create index if not exists edge_request_buckets_subject_idx
  on private.edge_request_buckets (subject_id);

alter table private.edge_request_buckets enable row level security;
drop policy if exists "No direct edge request bucket access"
  on private.edge_request_buckets;
create policy "No direct edge request bucket access"
  on private.edge_request_buckets
  for all
  to public
  using (false)
  with check (false);
revoke all on table private.edge_request_buckets
  from public, anon, authenticated, service_role;

comment on table private.edge_request_buckets is
  'Atomic per-user Edge Function request budgets. Accessible only through service-role RPCs.';

create table if not exists private.edge_request_claims (
  request_scope text not null,
  subject_id uuid not null references public.users(id) on delete cascade,
  request_key text not null,
  claim_token uuid not null,
  claim_status text not null default 'processing'
    check (claim_status in ('processing', 'completed', 'failed')),
  response_status integer null
    check (response_status is null or response_status between 100 and 599),
  response_body jsonb null,
  error_message text null,
  attempt_count integer not null default 1 check (attempt_count > 0),
  claimed_at timestamptz not null default statement_timestamp(),
  lease_expires_at timestamptz not null,
  completed_at timestamptz null,
  expires_at timestamptz not null,
  primary key (request_scope, subject_id, request_key),
  constraint edge_request_claims_scope_check
    check (request_scope ~ '^[a-z0-9][a-z0-9:_-]{0,95}$'),
  constraint edge_request_claims_key_check
    check (length(request_key) between 1 and 512)
);

create index if not exists edge_request_claims_expiry_idx
  on private.edge_request_claims (expires_at);

create index if not exists edge_request_claims_subject_expiry_idx
  on private.edge_request_claims (request_scope, subject_id, expires_at);

create index if not exists edge_request_claims_subject_idx
  on private.edge_request_claims (subject_id);

alter table private.edge_request_claims enable row level security;
drop policy if exists "No direct edge request claim access"
  on private.edge_request_claims;
create policy "No direct edge request claim access"
  on private.edge_request_claims
  for all
  to public
  using (false)
  with check (false);
revoke all on table private.edge_request_claims
  from public, anon, authenticated, service_role;

comment on table private.edge_request_claims is
  'Atomic Edge Function idempotency claims and durable responses, including the AI request ledger.';

create or replace function public.consume_edge_request_bucket(
  target_subject_id uuid,
  request_scope text,
  window_seconds integer,
  request_limit integer,
  request_cost integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  observed_at timestamptz := clock_timestamp();
  bucket_started_at timestamptz;
  bucket_resets_at timestamptz;
  used_count integer;
  allowed boolean := false;
begin
  if auth.role() is distinct from 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if target_subject_id is null then
    raise exception 'target_subject_id is required' using errcode = '22023';
  end if;
  if request_scope is null
    or request_scope !~ '^[a-z0-9][a-z0-9:_-]{0,95}$' then
    raise exception 'request_scope is invalid' using errcode = '22023';
  end if;
  if window_seconds < 1 or window_seconds > 86400 then
    raise exception 'window_seconds is invalid' using errcode = '22023';
  end if;
  if request_limit < 1 or request_limit > 100000 then
    raise exception 'request_limit is invalid' using errcode = '22023';
  end if;
  if request_cost < 1 or request_cost > request_limit then
    raise exception 'request_cost is invalid' using errcode = '22023';
  end if;

  bucket_started_at := to_timestamp(
    floor(extract(epoch from observed_at) / window_seconds) * window_seconds
  );
  bucket_resets_at := bucket_started_at + make_interval(secs => window_seconds);

  delete from private.edge_request_buckets as buckets
  where buckets.request_scope = consume_edge_request_bucket.request_scope
    and buckets.subject_id = target_subject_id
    and buckets.window_started_at < bucket_started_at;

  insert into private.edge_request_buckets (
    request_scope,
    subject_id,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    request_scope,
    target_subject_id,
    bucket_started_at,
    0,
    observed_at
  )
  on conflict do nothing;

  update private.edge_request_buckets as buckets
  set
    request_count = buckets.request_count + request_cost,
    updated_at = observed_at
  where buckets.request_scope = consume_edge_request_bucket.request_scope
    and buckets.subject_id = target_subject_id
    and buckets.window_started_at = bucket_started_at
    and buckets.request_count <= request_limit - request_cost
  returning buckets.request_count into used_count;

  if found then
    allowed := true;
  else
    select buckets.request_count
    into used_count
    from private.edge_request_buckets as buckets
    where buckets.request_scope = consume_edge_request_bucket.request_scope
      and buckets.subject_id = target_subject_id
      and buckets.window_started_at = bucket_started_at;
  end if;

  return jsonb_build_object(
    'allowed', allowed,
    'limit', request_limit,
    'used', coalesce(used_count, 0),
    'remaining', greatest(0, request_limit - coalesce(used_count, 0)),
    'reset_at', bucket_resets_at,
    'retry_after_seconds', case
      when allowed then 0
      else greatest(1, ceil(extract(epoch from bucket_resets_at - observed_at))::integer)
    end
  );
end;
$function$;

create or replace function public.claim_edge_request(
  target_subject_id uuid,
  request_scope text,
  request_key text,
  lease_seconds integer default 30,
  retention_seconds integer default 86400
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  observed_at timestamptz := clock_timestamp();
  next_claim_token uuid := gen_random_uuid();
  claim_row private.edge_request_claims%rowtype;
  acquired boolean := false;
begin
  if auth.role() is distinct from 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if target_subject_id is null then
    raise exception 'target_subject_id is required' using errcode = '22023';
  end if;
  if request_scope is null
    or request_scope !~ '^[a-z0-9][a-z0-9:_-]{0,95}$' then
    raise exception 'request_scope is invalid' using errcode = '22023';
  end if;
  if request_key is null or length(request_key) not between 1 and 512 then
    raise exception 'request_key is invalid' using errcode = '22023';
  end if;
  if lease_seconds < 5 or lease_seconds > 300 then
    raise exception 'lease_seconds is invalid' using errcode = '22023';
  end if;
  if retention_seconds < 60 or retention_seconds > 604800 then
    raise exception 'retention_seconds is invalid' using errcode = '22023';
  end if;

  delete from private.edge_request_claims as claims
  where claims.request_scope = claim_edge_request.request_scope
    and claims.subject_id = target_subject_id
    and claims.expires_at <= observed_at;

  insert into private.edge_request_claims as claims (
    request_scope,
    subject_id,
    request_key,
    claim_token,
    claim_status,
    response_status,
    response_body,
    error_message,
    attempt_count,
    claimed_at,
    lease_expires_at,
    completed_at,
    expires_at
  )
  values (
    request_scope,
    target_subject_id,
    request_key,
    next_claim_token,
    'processing',
    null,
    null,
    null,
    1,
    observed_at,
    observed_at + make_interval(secs => lease_seconds),
    null,
    observed_at + make_interval(secs => retention_seconds)
  )
  on conflict on constraint edge_request_claims_pkey do update
  set
    claim_token = excluded.claim_token,
    claim_status = 'processing',
    response_status = null,
    response_body = null,
    error_message = null,
    attempt_count = claims.attempt_count + 1,
    claimed_at = excluded.claimed_at,
    lease_expires_at = excluded.lease_expires_at,
    completed_at = null,
    expires_at = excluded.expires_at
  where claims.claim_status = 'failed'
    or (
      claims.claim_status = 'processing'
      and claims.lease_expires_at <= observed_at
    )
    or claims.expires_at <= observed_at
  returning claims.* into claim_row;

  if found then
    acquired := true;
  else
    select claims.*
    into claim_row
    from private.edge_request_claims as claims
    where claims.request_scope = claim_edge_request.request_scope
      and claims.subject_id = target_subject_id
      and claims.request_key = claim_edge_request.request_key;
  end if;

  if claim_row.request_key is null then
    raise exception 'Unable to acquire or read request claim';
  end if;

  return jsonb_build_object(
    'acquired', acquired,
    'claim_token', case when acquired then claim_row.claim_token else null end,
    'status', claim_row.claim_status,
    'response_status', claim_row.response_status,
    'response_body', claim_row.response_body,
    'error_message', claim_row.error_message,
    'attempt_count', claim_row.attempt_count,
    'lease_expires_at', claim_row.lease_expires_at,
    'expires_at', claim_row.expires_at
  );
end;
$function$;

create or replace function public.read_edge_request_claim(
  target_subject_id uuid,
  request_scope text,
  request_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  claim_row private.edge_request_claims%rowtype;
begin
  if auth.role() is distinct from 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select claims.*
  into claim_row
  from private.edge_request_claims as claims
  where claims.request_scope = read_edge_request_claim.request_scope
    and claims.subject_id = target_subject_id
    and claims.request_key = read_edge_request_claim.request_key
    and claims.expires_at > statement_timestamp();

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'acquired', false,
    'claim_token', null,
    'status', claim_row.claim_status,
    'response_status', claim_row.response_status,
    'response_body', claim_row.response_body,
    'error_message', claim_row.error_message,
    'attempt_count', claim_row.attempt_count,
    'lease_expires_at', claim_row.lease_expires_at,
    'expires_at', claim_row.expires_at
  );
end;
$function$;

create or replace function public.complete_edge_request_claim(
  target_subject_id uuid,
  request_scope text,
  request_key text,
  claim_token uuid,
  response_status integer,
  response_body jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.role() is distinct from 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if response_status not between 100 and 599 then
    raise exception 'response_status is invalid' using errcode = '22023';
  end if;

  update private.edge_request_claims as claims
  set
    claim_status = 'completed',
    response_status = complete_edge_request_claim.response_status,
    response_body = coalesce(complete_edge_request_claim.response_body, 'null'::jsonb),
    error_message = null,
    lease_expires_at = clock_timestamp(),
    completed_at = clock_timestamp()
  where claims.request_scope = complete_edge_request_claim.request_scope
    and claims.subject_id = target_subject_id
    and claims.request_key = complete_edge_request_claim.request_key
    and claims.claim_token = complete_edge_request_claim.claim_token
    and claims.claim_status = 'processing';

  return found;
end;
$function$;

create or replace function public.fail_edge_request_claim(
  target_subject_id uuid,
  request_scope text,
  request_key text,
  claim_token uuid,
  error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.role() is distinct from 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update private.edge_request_claims as claims
  set
    claim_status = 'failed',
    response_status = null,
    response_body = null,
    error_message = left(fail_edge_request_claim.error_message, 500),
    lease_expires_at = clock_timestamp(),
    completed_at = clock_timestamp()
  where claims.request_scope = fail_edge_request_claim.request_scope
    and claims.subject_id = target_subject_id
    and claims.request_key = fail_edge_request_claim.request_key
    and claims.claim_token = fail_edge_request_claim.claim_token
    and claims.claim_status = 'processing';

  return found;
end;
$function$;

revoke all on function public.consume_edge_request_bucket(uuid, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_edge_request(uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.read_edge_request_claim(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.complete_edge_request_claim(uuid, text, text, uuid, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_edge_request_claim(uuid, text, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.consume_edge_request_bucket(uuid, text, integer, integer, integer)
  to service_role;
grant execute on function public.claim_edge_request(uuid, text, text, integer, integer)
  to service_role;
grant execute on function public.read_edge_request_claim(uuid, text, text)
  to service_role;
grant execute on function public.complete_edge_request_claim(uuid, text, text, uuid, integer, jsonb)
  to service_role;
grant execute on function public.fail_edge_request_claim(uuid, text, text, uuid, text)
  to service_role;

comment on function public.consume_edge_request_bucket(uuid, text, integer, integer, integer) is
  'Service-role-only atomic Edge Function request budget.';
comment on function public.claim_edge_request(uuid, text, text, integer, integer) is
  'Service-role-only atomic Edge Function idempotency claim.';
comment on function public.read_edge_request_claim(uuid, text, text) is
  'Service-role-only read of an unexpired Edge Function claim.';
comment on function public.complete_edge_request_claim(uuid, text, text, uuid, integer, jsonb) is
  'Completes an owned Edge Function claim with a replayable JSON response.';
comment on function public.fail_edge_request_claim(uuid, text, text, uuid, text) is
  'Releases an owned Edge Function claim after a failed side effect.';

commit;
