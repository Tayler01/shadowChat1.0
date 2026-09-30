-- Per-device terminal state preserves retries after another device accepts.
-- Unread authority stays in notification_events; native workers remain paused.
begin;

create table public.notification_delivery_targets (
  notification_event_id uuid not null references public.notification_events(id) on delete cascade,
  subscription_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  lease_token uuid,
  lease_until timestamptz,
  response_status integer,
  updated_at timestamptz not null default now(),
  primary key (notification_event_id, subscription_id)
);
alter table public.notification_delivery_targets enable row level security;
revoke all on table public.notification_delivery_targets from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_delivery_targets to service_role;
create index notification_delivery_targets_pending_idx
  on public.notification_delivery_targets (notification_event_id) where status = 'pending';

create or replace function public.claim_notification_delivery_targets(
  target_event_id uuid, target_subscription_ids uuid[], target_lease_token uuid
)
returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare claimed_ids uuid[];
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Service role required'; end if;
  if target_lease_token is null or cardinality(target_subscription_ids) > 100 then
    raise exception 'A lease token and at most 100 device targets are required';
  end if;
  insert into public.notification_delivery_targets (notification_event_id, subscription_id, status)
  select events.id, subscriptions.id,
    case when exists (
      select 1 from public.notification_delivery_attempts attempts
      where attempts.notification_event_id = events.id and attempts.subscription_id = subscriptions.id and attempts.delivered
    ) then 'delivered' else 'pending' end
  from public.notification_events events
  join public.push_subscriptions subscriptions on subscriptions.user_id = events.user_id
  where events.id = target_event_id and subscriptions.id = any(target_subscription_ids)
    and subscriptions.enabled and events.read_at is null and events.resolved_at is null
    and greatest(events.presentation_expires_at, events.created_at + interval '5 minutes') > now()
  on conflict (notification_event_id, subscription_id) do nothing;

  with claimed as (
    update public.notification_delivery_targets targets
    set lease_token = target_lease_token, lease_until = now() + interval '120 seconds', updated_at = now()
    where targets.notification_event_id = target_event_id
      and targets.subscription_id = any(target_subscription_ids)
      and targets.status = 'pending'
      and (targets.lease_until is null or targets.lease_until <= now())
      and exists (select 1 from public.notification_events events
        join public.push_subscriptions subscriptions on subscriptions.user_id = events.user_id
        where events.id = target_event_id and subscriptions.id = targets.subscription_id
        and subscriptions.enabled and events.read_at is null and events.resolved_at is null
        and greatest(events.presentation_expires_at, events.created_at + interval '5 minutes') > now())
    returning targets.subscription_id
  ) select coalesce(array_agg(subscription_id), '{}'::uuid[]) into claimed_ids from claimed;
  return claimed_ids;
end;
$$;
revoke all on function public.claim_notification_delivery_targets(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.claim_notification_delivery_targets(uuid, uuid[], uuid) to service_role;

create or replace function public.complete_notification_delivery_targets(
  target_event_id uuid, target_lease_token uuid, target_results jsonb
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Service role required'; end if;
  if jsonb_typeof(target_results) <> 'array' or jsonb_array_length(target_results) > 100 then
    raise exception 'At most 100 device results are required';
  end if;
  update public.notification_delivery_targets targets
  set status = result.status, response_status = result.response_status,
    lease_token = null, lease_until = null, updated_at = now()
  from jsonb_to_recordset(target_results) as result(subscription_id uuid, status text, response_status integer)
  where targets.notification_event_id = target_event_id
    and targets.subscription_id = result.subscription_id
    and targets.lease_token = target_lease_token
    and result.status in ('pending', 'delivered', 'failed');
end;
$$;
revoke all on function public.complete_notification_delivery_targets(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_notification_delivery_targets(uuid, uuid, jsonb) to service_role;

create or replace function private.sync_notification_delivery_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_queue boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.type in (
      'dm_message',
      'group_message',
      'mention',
      'reply',
      'reaction',
      'hype_event',
      'shadow_pin_post',
      'shadow_pin_comment',
      'shadow_pin_reply',
      'connection_request',
      'connection_accepted',
      'presence_active',
      'shadow_checkers_turn'
    )
      and new.sent_at is null
      and new.read_at is null
      and new.resolved_at is null then
      select
        exists (
          select 1
          from public.notification_preferences preferences
          where preferences.user_id = new.user_id
            and preferences.notifications_enabled
            and case
              when new.type = 'dm_message' then preferences.dm_enabled
              when new.type = 'group_message' then
                preferences.group_enabled and not preferences.general_chat_muted
              when new.type = 'mention' then
                preferences.mention_enabled and not preferences.general_chat_muted
              when new.type = 'reply' then
                preferences.reply_enabled and not preferences.general_chat_muted
              when new.type = 'reaction' then preferences.reaction_enabled
              when new.type = 'hype_event' then
                preferences.hype_enabled and not preferences.general_chat_muted
              when new.type = 'shadow_pin_post' then preferences.shadow_pin_new_post_enabled
              when new.type = 'shadow_pin_comment' then preferences.shadow_pin_comment_enabled
              when new.type = 'shadow_pin_reply' then preferences.shadow_pin_reply_enabled
              when new.type in ('connection_request', 'connection_accepted') then
                preferences.connection_notifications_enabled
              when new.type = 'presence_active' then preferences.presence_push_enabled
              when new.type = 'shadow_checkers_turn' then preferences.checkers_turn_enabled
              else false
            end
        )
        and exists (
          select 1
          from public.push_subscriptions subscriptions
          where subscriptions.user_id = new.user_id
            and subscriptions.enabled
            and (
              subscriptions.foreground_until is null
              or subscriptions.foreground_until <= now()
            )
        )
      into should_queue;

      if should_queue then
        insert into public.notification_delivery_jobs (
          notification_event_id,
          user_id,
          available_at,
          expires_at
        ) values (
          new.id,
          new.user_id,
          now() + interval '20 seconds',
          greatest(new.presentation_expires_at, new.created_at + interval '5 minutes')
        )
        on conflict (notification_event_id) do nothing;
      end if;
    end if;
    return new;
  end if;

  if new.read_at is not null or new.resolved_at is not null then
    update public.notification_delivery_targets targets
    set status = 'failed', lease_token = null, lease_until = null, updated_at = now()
    where targets.notification_event_id = new.id and targets.status = 'pending';
  end if;

  update public.notification_delivery_jobs jobs
  set
    status = case
      when new.sent_at is not null and not exists (
        select 1 from public.notification_delivery_targets targets
        where targets.notification_event_id = new.id and targets.status = 'pending'
      ) then 'delivered'
      when new.read_at is not null or new.resolved_at is not null then 'cancelled'
      else jobs.status
    end,
    completed_at = case
      when (new.sent_at is not null and not exists (
        select 1 from public.notification_delivery_targets targets
        where targets.notification_event_id = new.id and targets.status = 'pending'
      )) or new.read_at is not null or new.resolved_at is not null
        then coalesce(jobs.completed_at, now())
      else jobs.completed_at
    end,
    updated_at = now()
  where jobs.notification_event_id = new.id
    and jobs.status in ('pending', 'processing', 'failed');

  return new;
end;
$$;

create or replace function public.claim_notification_delivery_jobs(
  batch_size integer default 5
)
returns table (
  job_id uuid,
  notification_event_id uuid,
  user_id uuid,
  event_type text,
  entity_id uuid,
  actor_id uuid,
  route text,
  payload jsonb,
  expires_at timestamptz,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lease_acquired_until timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if batch_size < 1 or batch_size > 10 then
    raise exception 'Batch size must be between 1 and 10';
  end if;

  insert into private.notification_delivery_recovery_runtime (
    singleton,
    lease_until,
    updated_at
  ) values (
    true,
    now() + interval '45 seconds',
    now()
  )
  on conflict (singleton) do update
  set
    lease_until = excluded.lease_until,
    updated_at = excluded.updated_at
  where private.notification_delivery_recovery_runtime.lease_until <= now()
  returning lease_until into lease_acquired_until;

  if lease_acquired_until is null then
    return;
  end if;

  with expired as (
    select jobs.id
    from public.notification_delivery_jobs jobs
    where jobs.status in ('pending', 'processing')
      and jobs.expires_at <= now()
      and (
        jobs.status = 'pending'
        or jobs.last_attempt_at < now() - interval '45 seconds'
      )
    order by jobs.expires_at, jobs.id
    for update skip locked
    limit 200
  )
  update public.notification_delivery_jobs jobs
  set
    status = 'cancelled',
    completed_at = coalesce(jobs.completed_at, now()),
    last_error = 'Notification delivery window expired',
    updated_at = now()
  from expired
  where jobs.id = expired.id;

  with exhausted as (
    select jobs.id
    from public.notification_delivery_jobs jobs
    where jobs.attempt_count >= 3
      and (
        jobs.status = 'pending'
        or (
          jobs.status = 'processing'
          and jobs.last_attempt_at < now() - interval '45 seconds'
        )
      )
    order by jobs.last_attempt_at nulls first, jobs.id
    for update skip locked
    limit 200
  )
  update public.notification_delivery_jobs jobs
  set
    status = 'failed',
    completed_at = coalesce(jobs.completed_at, now()),
    last_error = coalesce(jobs.last_error, 'Notification delivery attempt limit reached'),
    updated_at = now()
  from exhausted
  where jobs.id = exhausted.id;

  with stale as (
    select jobs.id
    from public.notification_delivery_jobs jobs
    where jobs.status = 'processing'
      and jobs.attempt_count < 3
      and jobs.expires_at > now()
      and jobs.last_attempt_at < now() - interval '45 seconds'
    order by jobs.last_attempt_at, jobs.id
    for update skip locked
    limit 200
  )
  update public.notification_delivery_jobs jobs
  set
    status = 'pending',
    available_at = now(),
    updated_at = now()
  from stale
  where jobs.id = stale.id;

  return query
  with candidates as (
    select jobs.id
    from public.notification_delivery_jobs jobs
    join public.notification_events events
      on events.id = jobs.notification_event_id
    where jobs.status = 'pending'
      and jobs.attempt_count < 3
      and jobs.available_at <= now()
      and jobs.expires_at > now()
      and (events.sent_at is null or exists (
        select 1 from public.notification_delivery_targets targets
        where targets.notification_event_id = events.id and targets.status = 'pending'
      ))
      and events.read_at is null
      and events.resolved_at is null
    order by jobs.available_at, jobs.created_at
    for update of jobs skip locked
    limit batch_size
  ),
  claimed as (
    update public.notification_delivery_jobs jobs
    set
      status = 'processing',
      attempt_count = jobs.attempt_count + 1,
      last_attempt_at = now(),
      last_error = null,
      updated_at = now()
    from candidates
    where jobs.id = candidates.id
    returning jobs.*
  )
  select
    claimed.id,
    events.id,
    events.user_id,
    events.type,
    events.entity_id,
    events.actor_id,
    events.route,
    coalesce(events.payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'conversation_id', events.conversation_id,
      'message_id', coalesce(events.dm_message_id, events.message_id),
      'is_dm', events.dm_message_id is not null or events.type = 'dm_message'
    )),
    claimed.expires_at,
    claimed.attempt_count
  from claimed
  join public.notification_events events
    on events.id = claimed.notification_event_id;
end;
$$;

create or replace function private.request_web_push_recovery()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovery_url text;
  recovery_secret text;
  request_id bigint;
begin
  -- Keep the existing once/minute schedule, but avoid empty Edge invocations.
  -- Expired/exhausted jobs still wake the bounded cleanup phase.
  if not exists (
    select 1 from public.notification_delivery_jobs jobs
    join public.notification_events events on events.id = jobs.notification_event_id
    where jobs.status in ('pending', 'processing')
      and (
        (jobs.status = 'pending' and jobs.expires_at <= now())
        or (jobs.status = 'pending' and jobs.attempt_count >= 3)
        or (jobs.status = 'processing' and jobs.last_attempt_at < now() - interval '45 seconds')
        or (jobs.status = 'pending' and jobs.available_at <= now()
          and jobs.expires_at > now() and jobs.attempt_count < 3
          and events.read_at is null and events.resolved_at is null
          and (events.sent_at is null or exists (
            select 1 from public.notification_delivery_targets targets
            where targets.notification_event_id = events.id and targets.status = 'pending'
          )))
      )
  ) then return null; end if;

  select secrets.decrypted_secret
  into recovery_url
  from vault.decrypted_secrets secrets
  where secrets.name = 'shadowchat_web_push_recovery_url'
  order by secrets.updated_at desc
  limit 1;

  select secrets.decrypted_secret
  into recovery_secret
  from vault.decrypted_secrets secrets
  where secrets.name = 'shadowchat_web_push_recovery_secret'
  order by secrets.updated_at desc
  limit 1;

  if recovery_url is null
    or recovery_url !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/send-push$'
    or recovery_secret is null
    or length(recovery_secret) < 32 then
    return null;
  end if;

  select net.http_post(
    url := recovery_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-shadowchat-recovery-secret', recovery_secret
    ),
    body := jsonb_build_object('type', 'notification_delivery_recovery'),
    timeout_milliseconds := 25000
  )
  into request_id;

  return request_id;
end;
$$;


-- Only the bounded Web Push path changes. No cron, native token, receipt,
-- or legacy response-collector grants/schedules are re-enabled.
commit;
