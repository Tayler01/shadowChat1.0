/*
  # Notification Presentation v2 rollout hardening

  Adds explicit category/user canaries and makes disabled mode a hard stop for
  queued delivery. The existing v1 Web Push path remains the production owner.
*/

begin;

do $extensions$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    create extension pg_net with schema extensions;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron;
  end if;
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    create extension supabase_vault with schema vault;
  end if;
end
$extensions$;

alter table public.notification_v2_runtime_config
  add column if not exists enabled_categories text[] not null default '{}'::text[],
  add column if not exists canary_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists all_users_enabled boolean not null default false,
  add column if not exists worker_invocation_enabled boolean not null default false,
  add column if not exists receipt_reconciliation_enabled boolean not null default false,
  add column if not exists worker_url text,
  add column if not exists worker_probe_url text,
  add column if not exists last_delivery_request_at timestamptz,
  add column if not exists last_delivery_request_id bigint,
  add column if not exists last_receipt_request_at timestamptz,
  add column if not exists last_receipt_request_id bigint,
  add column if not exists last_worker_response_at timestamptz,
  add column if not exists last_worker_status_code integer,
  add column if not exists last_worker_success_at timestamptz,
  add column if not exists last_worker_health_url text,
  add column if not exists last_worker_error text;

alter table public.notification_v2_runtime_config
  drop constraint if exists notification_v2_runtime_categories_check,
  add constraint notification_v2_runtime_categories_check check (
    enabled_categories <@ array[
      'dm',
      'general_chat',
      'mentions_replies',
      'reactions_hype',
      'shadow_pin',
      'connections',
      'presence',
      'shado_live',
      'shadow_checkers',
      'shadow_war',
      'weather',
      'security',
      'system'
    ]::text[]
  ),
  drop constraint if exists notification_v2_runtime_canary_users_check,
  add constraint notification_v2_runtime_canary_users_check check (
    array_position(canary_user_ids, null) is null
  ),
  drop constraint if exists notification_v2_runtime_worker_url_check,
  add constraint notification_v2_runtime_worker_url_check check (
    worker_url is null
    or worker_url =
      'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2'
  ),
  drop constraint if exists notification_v2_runtime_worker_probe_url_check,
  add constraint notification_v2_runtime_worker_probe_url_check check (
    worker_probe_url is null
    or worker_probe_url =
      'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2'
  ),
  drop constraint if exists notification_v2_runtime_worker_gate_check,
  add constraint notification_v2_runtime_worker_gate_check check (
    not worker_invocation_enabled
    or (
      delivery_mode = 'active'
      and worker_url is not null
      and cardinality(enabled_categories) > 0
      and (all_users_enabled or cardinality(canary_user_ids) > 0)
    )
  ),
  drop constraint if exists notification_v2_runtime_receipt_gate_check,
  add constraint notification_v2_runtime_receipt_gate_check check (
    not receipt_reconciliation_enabled or worker_url is not null
  ),
  drop constraint if exists notification_v2_runtime_worker_status_check,
  add constraint notification_v2_runtime_worker_status_check check (
    last_worker_status_code is null
    or last_worker_status_code between 100 and 599
  ),
  drop constraint if exists notification_v2_runtime_worker_error_check,
  add constraint notification_v2_runtime_worker_error_check check (
    last_worker_error is null or char_length(last_worker_error) <= 500
  );

alter table public.notification_delivery_targets_v2
  add column if not exists receipt_attempt_count integer not null default 0
    check (receipt_attempt_count between 0 and 12),
  add column if not exists receipt_expires_at timestamptz;

alter table public.notification_outbox_v2
  drop constraint if exists notification_outbox_v2_status_check,
  add constraint notification_outbox_v2_status_check check (
    status in (
      'shadow',
      'pending',
      'processing',
      'accepted',
      'delivered',
      'cancelled',
      'failed'
    )
  );

create table if not exists private.notification_v2_worker_requests (
  request_id bigint primary key,
  action text not null check (action in ('deliver', 'receipts', 'health')),
  worker_url text not null,
  enqueued_at timestamptz not null default now(),
  completed_at timestamptz,
  status_code integer check (status_code is null or status_code between 100 and 599),
  error text check (error is null or char_length(error) <= 500),
  response_body text check (
    response_body is null or char_length(response_body) <= 2000
  )
);

revoke all on table private.notification_v2_worker_requests
  from public, anon, authenticated, service_role;

revoke insert, update, delete
  on table public.notification_v2_runtime_config
  from service_role;
grant select on table public.notification_v2_runtime_config to service_role;

drop function if exists public.configure_notification_v2_runtime(
  text, text[], uuid[], boolean, boolean, text, timestamptz
);

create or replace function public.configure_notification_v2_runtime(
  target_delivery_mode text,
  target_enabled_categories text[] default '{}'::text[],
  target_canary_user_ids uuid[] default '{}'::uuid[],
  target_all_users_enabled boolean default false,
  target_worker_invocation_enabled boolean default false,
  target_receipt_reconciliation_enabled boolean default null,
  target_worker_url text default null,
  target_activation_watermark timestamptz default now()
)
returns public.notification_v2_runtime_config
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured public.notification_v2_runtime_config;
  current_worker_url text;
  current_worker_success_at timestamptz;
  current_worker_health_url text;
  current_receipt_reconciliation_enabled boolean;
  resolved_worker_url text;
  effective_receipt_reconciliation_enabled boolean;
  effective_watermark timestamptz := greatest(
    coalesce(target_activation_watermark, now()),
    now() - interval '5 minutes'
  );
  normalized_categories text[] := array(
    select distinct lower(trim(category))
    from unnest(coalesce(target_enabled_categories, '{}'::text[])) category
    where trim(category) <> ''
    order by lower(trim(category))
  );
  normalized_canaries uuid[] := array(
    select distinct user_id
    from unnest(coalesce(target_canary_user_ids, '{}'::uuid[])) user_id
    where user_id is not null
    order by user_id
  );
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if target_delivery_mode not in ('disabled', 'shadow', 'active') then
    raise exception 'Invalid notification v2 delivery mode';
  end if;
  if target_delivery_mode <> 'disabled'
    and cardinality(normalized_categories) = 0 then
    raise exception 'A shadow or active rollout requires at least one category';
  end if;
  if target_delivery_mode <> 'disabled'
    and not target_all_users_enabled
    and cardinality(normalized_canaries) = 0 then
    raise exception 'A shadow or active rollout requires canary users';
  end if;
  if target_worker_invocation_enabled and target_delivery_mode <> 'active' then
    raise exception 'The worker can run only in active mode';
  end if;

  perform private.collect_notification_v2_worker_responses();

  select
    runtime.worker_url,
    runtime.last_worker_success_at,
    runtime.last_worker_health_url,
    runtime.receipt_reconciliation_enabled
  into
    current_worker_url,
    current_worker_success_at,
    current_worker_health_url,
    current_receipt_reconciliation_enabled
  from public.notification_v2_runtime_config runtime
  where runtime.singleton = true;

  resolved_worker_url := coalesce(
    nullif(trim(target_worker_url), ''),
    current_worker_url
  );
  effective_receipt_reconciliation_enabled := coalesce(
    target_receipt_reconciliation_enabled,
    current_receipt_reconciliation_enabled,
    false
  );

  if (target_worker_invocation_enabled or effective_receipt_reconciliation_enabled)
    and resolved_worker_url is null then
    raise exception 'The notification v2 worker URL is required';
  end if;
  if (target_worker_invocation_enabled or effective_receipt_reconciliation_enabled)
    and not exists (
      select 1
      from vault.decrypted_secrets secrets
      where secrets.name = 'shadowchat_notification_v2_worker_secret'
        and nullif(secrets.decrypted_secret, '') is not null
    ) then
    raise exception 'The notification v2 worker secret is not configured in Vault';
  end if;
  if target_worker_invocation_enabled
    and (
      current_worker_success_at is null
      or current_worker_success_at < now() - interval '15 minutes'
      or current_worker_health_url is distinct from resolved_worker_url
    ) then
    raise exception 'A recent successful notification v2 worker health probe is required';
  end if;
  if target_receipt_reconciliation_enabled is false
    and exists (
      select 1
      from public.notification_delivery_targets_v2 targets
      where targets.transport = 'expo'
        and targets.status = 'accepted'
    ) then
    raise exception 'Receipt reconciliation cannot stop while Expo receipts are pending';
  end if;

  update public.notification_v2_runtime_config runtime
  set
    delivery_mode = target_delivery_mode,
    enabled_categories = case
      when target_delivery_mode = 'disabled' then '{}'::text[]
      else normalized_categories
    end,
    canary_user_ids = case
      when target_delivery_mode = 'disabled' then '{}'::uuid[]
      else normalized_canaries
    end,
    all_users_enabled = case
      when target_delivery_mode = 'disabled' then false
      else target_all_users_enabled
    end,
    worker_invocation_enabled = target_worker_invocation_enabled,
    receipt_reconciliation_enabled = effective_receipt_reconciliation_enabled,
    worker_url = resolved_worker_url,
    worker_probe_url = case
      when runtime.worker_probe_url = resolved_worker_url then null
      else runtime.worker_probe_url
    end,
    last_worker_error = null,
    activation_watermark = effective_watermark,
    updated_at = now()
  where runtime.singleton = true
  returning runtime.* into configured;

  update public.notification_outbox_v2 outbox
  set
    status = 'cancelled',
    completed_at = coalesce(outbox.completed_at, now()),
    lease_token = null,
    lease_expires_at = null,
    last_error = case
      when target_delivery_mode <> 'active' then 'Notification v2 runtime is disabled'
      else 'Notification is outside the active rollout canary'
    end,
    updated_at = now()
  from public.notification_envelopes_v2 envelopes
  where outbox.event_id = envelopes.event_id
    and outbox.delivery_mode = 'active'
    and outbox.status in ('pending', 'processing')
    and (
      target_delivery_mode <> 'active'
      or outbox.created_at < effective_watermark
      or not (envelopes.category_key = any(normalized_categories))
      or (
        not target_all_users_enabled
        and not (outbox.user_id = any(normalized_canaries))
      )
    );

  update public.notification_delivery_targets_v2 targets
  set
    status = 'cancelled',
    completed_at = coalesce(targets.completed_at, now()),
    last_error = 'Notification outbox was cancelled before provider acceptance',
    updated_at = now()
  where targets.status = 'pending'
    and exists (
      select 1
      from public.notification_outbox_v2 outbox
      where outbox.id = targets.outbox_id
        and outbox.status = 'cancelled'
    );

  return configured;
end;
$$;

revoke all on function public.configure_notification_v2_runtime(
  text, text[], uuid[], boolean, boolean, boolean, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.configure_notification_v2_runtime(
  text, text[], uuid[], boolean, boolean, boolean, text, timestamptz
) to service_role;

create or replace function private.guard_notification_outbox_v2_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  runtime public.notification_v2_runtime_config;
  category_key text;
begin
  select * into runtime
  from public.notification_v2_runtime_config
  where singleton = true;

  if runtime.delivery_mode not in ('shadow', 'active')
    or new.delivery_mode <> runtime.delivery_mode
    or new.created_at < runtime.activation_watermark then
    return null;
  end if;

  select envelopes.category_key into category_key
  from public.notification_envelopes_v2 envelopes
  where envelopes.event_id = new.event_id
    and envelopes.user_id = new.user_id;

  if category_key is null
    or not (category_key = any(runtime.enabled_categories))
    or (
      not runtime.all_users_enabled
      and not (new.user_id = any(runtime.canary_user_ids))
    ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_notification_outbox_v2_insert
  on public.notification_outbox_v2;
create trigger guard_notification_outbox_v2_insert
  before insert on public.notification_outbox_v2
  for each row execute function private.guard_notification_outbox_v2_insert();

revoke all on function private.guard_notification_outbox_v2_insert()
  from public, anon, authenticated;

create or replace function public.claim_notification_outbox_v2(
  batch_size integer default 20,
  lease_seconds integer default 45
)
returns table (
  outbox_id uuid,
  lease_token uuid,
  event_id uuid,
  user_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  runtime public.notification_v2_runtime_config;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if batch_size < 1 or batch_size > 50 then
    raise exception 'Batch size must be between 1 and 50';
  end if;
  if lease_seconds < 15 or lease_seconds > 180 then
    raise exception 'Lease seconds must be between 15 and 180';
  end if;

  select * into runtime
  from public.notification_v2_runtime_config
  where singleton = true;

  update public.notification_outbox_v2 outbox
  set
    status = 'cancelled',
    completed_at = coalesce(outbox.completed_at, now()),
    lease_token = null,
    lease_expires_at = null,
    last_error = 'Notification v2 runtime is disabled',
    updated_at = now()
  where outbox.delivery_mode = 'active'
    and outbox.status in ('pending', 'processing')
    and coalesce(runtime.delivery_mode, 'disabled') <> 'active';

  if coalesce(runtime.delivery_mode, 'disabled') <> 'active'
    or not runtime.worker_invocation_enabled then
    return;
  end if;

  update public.notification_outbox_v2 outbox
  set
    status = 'cancelled',
    completed_at = coalesce(outbox.completed_at, now()),
    lease_token = null,
    lease_expires_at = null,
    last_error = 'Notification is outside the active rollout canary',
    updated_at = now()
  from public.notification_envelopes_v2 envelopes
  where outbox.event_id = envelopes.event_id
    and outbox.delivery_mode = 'active'
    and outbox.status in ('pending', 'processing')
    and (
      outbox.created_at < runtime.activation_watermark
      or
      not (envelopes.category_key = any(runtime.enabled_categories))
      or (
        not runtime.all_users_enabled
        and not (outbox.user_id = any(runtime.canary_user_ids))
      )
    );

  update public.notification_outbox_v2 outbox
  set
    status = 'cancelled',
    completed_at = coalesce(outbox.completed_at, now()),
    lease_token = null,
    lease_expires_at = null,
    last_error = case
      when outbox.expires_at <= now() then 'Notification presentation expired'
      else 'Canonical event is no longer unread'
    end,
    updated_at = now()
  from public.notification_events events
  where outbox.event_id = events.id
    and outbox.status in ('pending', 'processing')
    and (
      outbox.expires_at <= now()
      or events.read_at is not null
      or events.resolved_at is not null
    );

  update public.notification_delivery_targets_v2 targets
  set
    status = 'cancelled',
    completed_at = coalesce(targets.completed_at, now()),
    last_error = 'Notification outbox was cancelled before provider acceptance',
    updated_at = now()
  where targets.status = 'pending'
    and exists (
      select 1
      from public.notification_outbox_v2 outbox
      where outbox.id = targets.outbox_id
        and outbox.status = 'cancelled'
    );

  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox_v2 outbox
    join public.notification_events events
      on events.id = outbox.event_id
    join public.notification_envelopes_v2 envelopes
      on envelopes.event_id = outbox.event_id
      and envelopes.user_id = outbox.user_id
    where outbox.delivery_mode = 'active'
      and envelopes.category_key = any(runtime.enabled_categories)
      and (
        runtime.all_users_enabled
        or outbox.user_id = any(runtime.canary_user_ids)
      )
      and outbox.status in ('pending', 'processing')
      and outbox.created_at >= runtime.activation_watermark
      and outbox.available_at <= now()
      and outbox.expires_at > now()
      and outbox.attempt_count < outbox.max_attempts
      and events.read_at is null
      and events.resolved_at is null
      and (
        outbox.status = 'pending'
        or outbox.lease_expires_at is null
        or outbox.lease_expires_at <= now()
      )
    order by outbox.available_at, outbox.created_at
    for update of outbox skip locked
    limit batch_size
  ),
  claimed as (
    update public.notification_outbox_v2 outbox
    set
      status = 'processing',
      attempt_count = outbox.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => lease_seconds),
      last_error = null,
      updated_at = now()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select
    claimed.id,
    claimed.lease_token,
    claimed.event_id,
    claimed.user_id,
    claimed.expires_at
  from claimed;
end;
$$;

revoke all on function public.claim_notification_outbox_v2(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_outbox_v2(integer, integer)
  to service_role;

create or replace function public.validate_notification_outbox_v2_lease(
  target_outbox_id uuid,
  target_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select exists (
    select 1
    from public.notification_outbox_v2 outbox
    join public.notification_envelopes_v2 envelopes
      on envelopes.event_id = outbox.event_id
      and envelopes.user_id = outbox.user_id
    join public.notification_events events
      on events.id = outbox.event_id
      and events.user_id = outbox.user_id
    join public.notification_v2_runtime_config runtime
      on runtime.singleton = true
    where outbox.id = target_outbox_id
      and outbox.lease_token = target_lease_token
      and outbox.status = 'processing'
      and outbox.lease_expires_at > now()
      and outbox.expires_at > now()
      and outbox.created_at >= runtime.activation_watermark
      and events.read_at is null
      and events.resolved_at is null
      and runtime.delivery_mode = 'active'
      and runtime.worker_invocation_enabled
      and envelopes.category_key = any(runtime.enabled_categories)
      and (
        runtime.all_users_enabled
        or outbox.user_id = any(runtime.canary_user_ids)
      )
  ) into allowed;

  return coalesce(allowed, false);
end;
$$;

revoke all on function public.validate_notification_outbox_v2_lease(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.validate_notification_outbox_v2_lease(uuid, uuid)
  to service_role;

create or replace function public.complete_notification_outbox_v2(
  target_outbox_id uuid,
  target_lease_token uuid,
  target_status text,
  target_error text default null,
  retry_after_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if target_status not in (
    'pending',
    'accepted',
    'delivered',
    'cancelled',
    'failed'
  ) then
    raise exception 'Invalid completion status';
  end if;
  if retry_after_seconds is not null and retry_after_seconds not between 1 and 3600 then
    raise exception 'Invalid retry delay';
  end if;

  update public.notification_outbox_v2 outbox
  set
    status = target_status,
    available_at = case
      when target_status = 'pending'
        then now() + make_interval(secs => coalesce(retry_after_seconds, 15))
      else outbox.available_at
    end,
    lease_token = null,
    lease_expires_at = null,
    last_error = nullif(left(target_error, 500), ''),
    completed_at = case
      when target_status in ('pending', 'accepted') then null
      else now()
    end,
    updated_at = now()
  where outbox.id = target_outbox_id
    and outbox.lease_token = target_lease_token
    and outbox.status = 'processing';

  return found;
end;
$$;

revoke all on function public.complete_notification_outbox_v2(
  uuid, uuid, text, text, integer
) from public, anon, authenticated;
grant execute on function public.complete_notification_outbox_v2(
  uuid, uuid, text, text, integer
) to service_role;

create or replace function private.request_notification_delivery_v2(
  target_action text default 'deliver'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_action text := lower(trim(coalesce(target_action, '')));
  resolved_worker_url text;
  resolved_worker_secret text;
  queued_request_id bigint;
begin
  if normalized_action not in ('deliver', 'receipts', 'health') then
    raise exception 'Invalid notification v2 worker action';
  end if;
  if normalized_action in ('deliver', 'receipts')
    and not pg_try_advisory_xact_lock(
      hashtextextended('shadowchat.notification-v2.' || normalized_action, 0)
    ) then
    return null;
  end if;

  if normalized_action = 'deliver' then
    update public.notification_v2_runtime_config runtime
    set
      last_delivery_request_at = now(),
      last_worker_error = null
    where runtime.singleton = true
      and runtime.delivery_mode = 'active'
      and runtime.worker_invocation_enabled
      and (
        runtime.last_delivery_request_at is null
        or runtime.last_delivery_request_at <= now() - interval '2 seconds'
      )
    returning runtime.worker_url into resolved_worker_url;
  elsif normalized_action = 'receipts' then
    update public.notification_v2_runtime_config runtime
    set
      last_receipt_request_at = now(),
      last_worker_error = null
    where runtime.singleton = true
      and runtime.receipt_reconciliation_enabled
      and exists (
        select 1
        from public.notification_delivery_targets_v2 targets
        where targets.transport = 'expo'
          and targets.status = 'accepted'
          and (
            targets.receipt_expires_at <= now()
            or targets.next_receipt_check_at <= now()
          )
      )
      and (
        runtime.last_receipt_request_at is null
        or runtime.last_receipt_request_at <= now() - interval '30 seconds'
      )
    returning runtime.worker_url into resolved_worker_url;
  else
    update public.notification_v2_runtime_config runtime
    set last_worker_error = null
    where runtime.singleton = true
      and coalesce(runtime.worker_probe_url, runtime.worker_url) is not null
      and (
        runtime.last_worker_response_at is null
        or runtime.last_worker_response_at <= now() - interval '15 seconds'
      )
    returning coalesce(runtime.worker_probe_url, runtime.worker_url)
      into resolved_worker_url;
  end if;

  if resolved_worker_url is null then
    return null;
  end if;

  select secrets.decrypted_secret
  into resolved_worker_secret
  from vault.decrypted_secrets secrets
  where secrets.name = 'shadowchat_notification_v2_worker_secret'
  order by secrets.updated_at desc
  limit 1;

  if nullif(resolved_worker_secret, '') is null then
    update public.notification_v2_runtime_config runtime
    set last_worker_error = 'Notification v2 worker secret is missing from Vault'
    where runtime.singleton = true;
    return null;
  end if;

  select net.http_post(
    url := resolved_worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-shadowchat-worker-secret', resolved_worker_secret
    ),
    body := jsonb_build_object('action', normalized_action),
    timeout_milliseconds := 30000
  )
  into queued_request_id;

  insert into private.notification_v2_worker_requests (
    request_id,
    action,
    worker_url
  ) values (
    queued_request_id,
    normalized_action,
    resolved_worker_url
  )
  on conflict (request_id) do nothing;

  if normalized_action = 'deliver' then
    update public.notification_v2_runtime_config runtime
    set last_delivery_request_id = queued_request_id
    where runtime.singleton = true;
  elsif normalized_action = 'receipts' then
    update public.notification_v2_runtime_config runtime
    set last_receipt_request_id = queued_request_id
    where runtime.singleton = true;
  end if;

  return queued_request_id;
exception
  when others then
    update public.notification_v2_runtime_config runtime
    set last_worker_error = left(sqlerrm, 500)
    where runtime.singleton = true;
    return null;
end;
$$;

revoke all on function private.request_notification_delivery_v2(text)
  from public, anon, authenticated, service_role;

create or replace function private.collect_notification_v2_worker_responses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  response_row record;
  collected_count integer := 0;
  timed_out_count integer := 0;
  response_error text;
begin
  update private.notification_v2_worker_requests requests
  set
    completed_at = now(),
    error = 'Notification v2 worker request timed out'
  where requests.completed_at is null
    and requests.enqueued_at < now() - interval '45 seconds'
    and not exists (
      select 1
      from net._http_response responses
      where responses.id = requests.request_id
    );
  get diagnostics timed_out_count = row_count;

  if timed_out_count > 0 then
    update public.notification_v2_runtime_config runtime
    set
      last_worker_response_at = now(),
      last_worker_status_code = null,
      last_worker_error = format(
        '%s notification v2 worker request%s timed out',
        timed_out_count,
        case when timed_out_count = 1 then '' else 's' end
      )
    where runtime.singleton = true;
  end if;

  for response_row in
    select
      requests.request_id,
      requests.action,
      requests.worker_url,
      responses.status_code,
      responses.error_msg,
      responses.content
    from private.notification_v2_worker_requests requests
    join net._http_response responses
      on responses.id = requests.request_id
    where requests.completed_at is null
    order by requests.enqueued_at
    limit 200
  loop
    response_error := case
      when response_row.error_msg is not null
        then left(response_row.error_msg, 500)
      when response_row.status_code not between 200 and 299
        then left(
          format(
            'Notification v2 worker returned HTTP %s',
            response_row.status_code
          ),
          500
        )
      else null
    end;

    update private.notification_v2_worker_requests requests
    set
      completed_at = now(),
      status_code = response_row.status_code,
      error = response_error,
      response_body = left(response_row.content::text, 2000)
    where requests.request_id = response_row.request_id
      and requests.completed_at is null;

    update public.notification_v2_runtime_config runtime
    set
      last_worker_response_at = now(),
      last_worker_status_code = response_row.status_code,
      last_worker_error = response_error,
      last_worker_success_at = case
        when response_row.action = 'health'
          and response_row.status_code between 200 and 299
          and response_error is null
          then now()
        else runtime.last_worker_success_at
      end,
      last_worker_health_url = case
        when response_row.action = 'health'
          and response_row.status_code between 200 and 299
          and response_error is null
          then response_row.worker_url
        else runtime.last_worker_health_url
      end,
      worker_probe_url = case
        when response_row.action = 'health'
          and response_row.status_code between 200 and 299
          and response_error is null
          and runtime.worker_probe_url = response_row.worker_url
          then null
        else runtime.worker_probe_url
      end
    where runtime.singleton = true;

    collected_count := collected_count + 1;
  end loop;

  delete from private.notification_v2_worker_requests requests
  where requests.enqueued_at < now() - interval '7 days';

  return collected_count + timed_out_count;
end;
$$;

revoke all on function private.collect_notification_v2_worker_responses()
  from public, anon, authenticated, service_role;

create or replace function public.probe_notification_v2_worker(
  target_worker_url text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_worker_url text := nullif(trim(target_worker_url), '');
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if normalized_worker_url is null then
    raise exception 'The notification v2 worker URL is required';
  end if;
  if normalized_worker_url <>
    'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2'
  then
    raise exception 'The notification v2 worker URL must match the linked project';
  end if;
  if not exists (
    select 1
    from vault.decrypted_secrets secrets
    where secrets.name = 'shadowchat_notification_v2_worker_secret'
      and nullif(secrets.decrypted_secret, '') is not null
  ) then
    raise exception 'The notification v2 worker secret is not configured in Vault';
  end if;

  update public.notification_v2_runtime_config runtime
  set
    worker_probe_url = normalized_worker_url,
    last_worker_error = null,
    last_worker_status_code = null
  where runtime.singleton = true;

  return private.request_notification_delivery_v2('health');
end;
$$;

revoke all on function public.probe_notification_v2_worker(text)
  from public, anon, authenticated;
grant execute on function public.probe_notification_v2_worker(text)
  to service_role;

create or replace function private.request_notification_delivery_v2_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from inserted_notification_outbox_v2 inserted
    where inserted.delivery_mode = 'active'
      and inserted.status = 'pending'
  ) then
    perform private.request_notification_delivery_v2('deliver');
  end if;
  return null;
end;
$$;

revoke all on function private.request_notification_delivery_v2_after_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists request_notification_delivery_v2_after_insert
  on public.notification_outbox_v2;
create trigger request_notification_delivery_v2_after_insert
  after insert on public.notification_outbox_v2
  referencing new table as inserted_notification_outbox_v2
  for each statement
  execute function private.request_notification_delivery_v2_after_insert();

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobs.jobid
    from cron.job jobs
    where jobs.jobname in (
      'shadowchat-notification-v2-delivery-recovery',
      'shadowchat-notification-v2-receipts',
      'shadowchat-notification-v2-worker-response-collector'
    )
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'shadowchat-notification-v2-delivery-recovery',
  '* * * * *',
  $command$select private.request_notification_delivery_v2('deliver');$command$
);

select cron.schedule(
  'shadowchat-notification-v2-receipts',
  '* * * * *',
  $command$select private.request_notification_delivery_v2('receipts');$command$
);

select cron.schedule(
  'shadowchat-notification-v2-worker-response-collector',
  '* * * * *',
  $command$select private.collect_notification_v2_worker_responses();$command$
);

commit;
