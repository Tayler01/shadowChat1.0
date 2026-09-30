/* Add an independent, default-paused native canary. Never resume the old
   delivery/receipt/recovery/pg_net response collectors. Web Push is untouched. */
begin;

create table if not exists private.notification_native_worker_lease_v2 (
  singleton boolean primary key default true check (singleton),
  lease_token uuid,
  lease_expires_at timestamptz,
  invocation_reserved_until timestamptz
);
insert into private.notification_native_worker_lease_v2(singleton)
values (true) on conflict (singleton) do nothing;
alter table private.notification_native_worker_lease_v2 enable row level security;
revoke all on private.notification_native_worker_lease_v2
  from public, anon, authenticated, service_role;

-- The watermark starts after the old backlog. These indexes enter by canary
-- account + new event time, rather than scanning every old pending event.
create index if not exists notification_outbox_v2_native_canary_idx
  on public.notification_outbox_v2(user_id, created_at, available_at, id)
  where delivery_mode = 'active' and status in ('pending', 'processing')
    and attempt_count < 3;
create index if not exists notification_targets_v2_native_receipt_canary_idx
  on public.notification_delivery_targets_v2(created_at, next_receipt_check_at, installation_id)
  where transport = 'expo' and status = 'accepted' and receipt_attempt_count < 3;

create or replace function public.acquire_native_notification_worker_v2(target_action text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  runtime public.notification_v2_runtime_config;
  acquired uuid;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if target_action not in ('deliver', 'receipts') then
    raise exception 'Unsupported bounded native worker action';
  end if;
  select * into runtime from public.notification_v2_runtime_config where singleton;
  if runtime.singleton is not true or runtime.delivery_mode <> 'active' or not runtime.worker_invocation_enabled
    or runtime.all_users_enabled or cardinality(runtime.canary_user_ids) not between 1 and 10
    or cardinality(runtime.enabled_categories) = 0
    or (target_action = 'receipts' and not runtime.receipt_reconciliation_enabled) then
    return null;
  end if;
  if target_action = 'deliver' and not exists (
    select 1 from public.notification_outbox_v2 outbox
    join public.notification_envelopes_v2 envelope on envelope.event_id = outbox.event_id
    join public.notification_events event on event.id = outbox.event_id
    where outbox.user_id = any(runtime.canary_user_ids)
      and outbox.created_at >= runtime.activation_watermark
      and outbox.delivery_mode = 'active' and outbox.status in ('pending', 'processing')
      and outbox.attempt_count < 3 and outbox.available_at <= now() and outbox.expires_at > now()
      and (outbox.status = 'pending' or outbox.lease_expires_at <= now())
      and envelope.category_key = any(runtime.enabled_categories)
      and event.read_at is null and event.resolved_at is null
  ) then return null; end if;
  if target_action = 'receipts' and not exists (
    select 1 from public.notification_delivery_targets_v2 target
    join public.notification_installations installation on installation.id = target.installation_id
    join public.notification_envelopes_v2 envelope on envelope.event_id = target.event_id
    where target.transport = 'expo' and target.status = 'accepted' and target.receipt_attempt_count < 3
      and target.created_at >= runtime.activation_watermark
      and installation.user_id = any(runtime.canary_user_ids)
      and envelope.category_key = any(runtime.enabled_categories)
      and (target.next_receipt_check_at <= now() or target.receipt_expires_at <= now())
  ) then return null; end if;
  update private.notification_native_worker_lease_v2
  set lease_token = gen_random_uuid(), lease_expires_at = now() + interval '30 seconds'
  where singleton and (lease_expires_at is null or lease_expires_at <= now())
  returning lease_token into acquired;
  return acquired;
end;
$$;
revoke all on function public.acquire_native_notification_worker_v2(text) from public, anon, authenticated;
grant execute on function public.acquire_native_notification_worker_v2(text) to service_role;

create or replace function public.release_native_notification_worker_v2(target_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  update private.notification_native_worker_lease_v2
  set lease_token = null, lease_expires_at = null
  where singleton and lease_token = target_lease_token;
  return found;
end;
$$;
revoke all on function public.release_native_notification_worker_v2(uuid) from public, anon, authenticated;
grant execute on function public.release_native_notification_worker_v2(uuid) to service_role;

-- Keep the existing worker API signature, but remove all broad cancellation
-- sweeps. Only new, unread canary rows can be touched; retries stop after three.
create or replace function public.claim_notification_outbox_v2(
  batch_size integer default 2, lease_seconds integer default 30
)
returns table(outbox_id uuid, lease_token uuid, event_id uuid, user_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare runtime public.notification_v2_runtime_config;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if batch_size is null or batch_size not between 1 and 5
    or lease_seconds is null or lease_seconds not between 15 and 45 then
    raise exception 'Bounded native claim requires batch <=5 and lease 15-45 seconds';
  end if;
  select * into runtime from public.notification_v2_runtime_config where singleton;
  if runtime.singleton is not true or runtime.delivery_mode <> 'active' or not runtime.worker_invocation_enabled
    or runtime.all_users_enabled or cardinality(runtime.canary_user_ids) not between 1 and 10 then
    return;
  end if;
  if not exists (select 1 from private.notification_native_worker_lease_v2
    where singleton and lease_expires_at > now()) then return; end if;
  return query
  with candidates as (
    select outbox.id from public.notification_outbox_v2 outbox
    join public.notification_envelopes_v2 envelope on envelope.event_id = outbox.event_id
      and envelope.user_id = outbox.user_id
    join public.notification_events event on event.id = outbox.event_id and event.user_id = outbox.user_id
    where outbox.user_id = any(runtime.canary_user_ids)
      and outbox.created_at >= runtime.activation_watermark
      and outbox.delivery_mode = 'active' and outbox.status in ('pending', 'processing')
      and outbox.attempt_count < least(outbox.max_attempts, 3)
      and outbox.attempt_count < 3
      and outbox.available_at <= now() and outbox.expires_at > now()
      and (outbox.status = 'pending' or outbox.lease_expires_at <= now())
      and envelope.category_key = any(runtime.enabled_categories)
      and event.read_at is null and event.resolved_at is null
    order by outbox.created_at, outbox.available_at, outbox.id
    for update of outbox skip locked limit batch_size
  ), claimed as (
    update public.notification_outbox_v2 outbox set status = 'processing',
      attempt_count = outbox.attempt_count + 1, max_attempts = least(outbox.max_attempts, 3),
      lease_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => lease_seconds),
      last_error = null, updated_at = now()
    from candidates where outbox.id = candidates.id returning outbox.*
  ) select claimed.id, claimed.lease_token, claimed.event_id, claimed.user_id, claimed.expires_at from claimed;
end;
$$;
revoke all on function public.claim_notification_outbox_v2(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_outbox_v2(integer, integer) to service_role;

create or replace function private.request_bounded_native_notification_canary()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  runtime public.notification_v2_runtime_config;
  worker_secret text;
  action text;
  request_id bigint;
begin
  select * into runtime from public.notification_v2_runtime_config where singleton;
  if runtime.singleton is not true or runtime.delivery_mode <> 'active' or not runtime.worker_invocation_enabled
    or runtime.all_users_enabled or cardinality(runtime.canary_user_ids) not between 1 and 10
    or cardinality(runtime.enabled_categories) = 0
    or runtime.worker_url is distinct from
      'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2' then
    return null;
  end if;
  -- Alternate only when receipts are actually due; delivery has priority.
  if exists (
    select 1 from public.notification_outbox_v2 outbox
    join public.notification_envelopes_v2 envelope on envelope.event_id = outbox.event_id
    join public.notification_events event on event.id = outbox.event_id
    where outbox.user_id = any(runtime.canary_user_ids)
      and outbox.created_at >= runtime.activation_watermark
      and outbox.delivery_mode = 'active' and outbox.status in ('pending', 'processing')
      and outbox.attempt_count < 3 and outbox.available_at <= now() and outbox.expires_at > now()
      and (outbox.status = 'pending' or outbox.lease_expires_at <= now())
      and envelope.category_key = any(runtime.enabled_categories)
      and event.read_at is null and event.resolved_at is null
  ) then action := 'deliver';
  elsif runtime.receipt_reconciliation_enabled and exists (
    select 1 from public.notification_delivery_targets_v2 target
    join public.notification_installations installation on installation.id = target.installation_id
    join public.notification_envelopes_v2 envelope on envelope.event_id = target.event_id
    where target.transport = 'expo' and target.status = 'accepted' and target.receipt_attempt_count < 3
      and target.created_at >= runtime.activation_watermark
      and installation.user_id = any(runtime.canary_user_ids)
      and envelope.category_key = any(runtime.enabled_categories)
      and (target.next_receipt_check_at <= now() or target.receipt_expires_at <= now())
  ) then action := 'receipts';
  else return null; end if;
  -- Reserve BEFORE Vault and HTTP. There is no net._http_response collector.
  update private.notification_native_worker_lease_v2
  set invocation_reserved_until = now() + interval '30 seconds'
  where singleton
    and (invocation_reserved_until is null or invocation_reserved_until <= now())
    and (lease_expires_at is null or lease_expires_at <= now());
  if not found then return null; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets
  where name = 'shadowchat_notification_v2_worker_secret' order by updated_at desc limit 1;
  if worker_secret is null or length(worker_secret) < 32 then return null; end if;
  select net.http_post(url := runtime.worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-shadowchat-worker-secret', worker_secret),
    body := jsonb_build_object('action', 'bounded_canary', 'task', action),
    timeout_milliseconds := 9000) into request_id;
  return request_id;
end;
$$;
revoke all on function private.request_bounded_native_notification_canary()
  from public, anon, authenticated, service_role;

do $schedule$
declare existing_id bigint; new_id bigint;
begin
  for existing_id in select jobid from cron.job where jobname = 'shadowchat-native-push-canary'
  loop perform cron.unschedule(existing_id); end loop;
  select cron.schedule('shadowchat-native-push-canary', '* * * * *',
    'select private.request_bounded_native_notification_canary();') into new_id;
  perform cron.alter_job(job_id := new_id, active := false);
end;
$schedule$;

-- The old statement trigger calls the former collector in the inserting
-- transaction. Remove its dispatch hook; the new bounded cron is the owner.
drop trigger if exists request_notification_delivery_v2_after_insert on public.notification_outbox_v2;
create or replace function private.materialize_notification_envelope_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_route text;
  resolved_category text;
  resolved_sound text;
  resolved_channel text;
  resolved_badge text;
  resolved_group text;
  resolved_title text;
  resolved_body text;
  resolved_priority text;
  resolved_media jsonb;
  runtime public.notification_v2_runtime_config;
  runtime_mode text;
  runtime_watermark timestamptz;
  resolved_outbox_id uuid;
begin
  select * into runtime from public.notification_v2_runtime_config where singleton;
  -- Gate before content projection or outbox work. Never fan out native
  -- delivery across all accounts, or replay events before activation.
  if runtime.singleton is not true or runtime.delivery_mode not in ('shadow', 'active')
    or runtime.all_users_enabled or cardinality(runtime.canary_user_ids) not between 1 and 10
    or not (new.user_id = any(runtime.canary_user_ids))
    or new.created_at < runtime.activation_watermark then
    return new;
  end if;
  resolved_category := private.notification_v2_category(new.type);
  if not (resolved_category = any(runtime.enabled_categories)) then return new; end if;
  runtime_mode := runtime.delivery_mode;
  runtime_watermark := runtime.activation_watermark;
  resolved_sound := private.notification_v2_sound(new.type);
  resolved_channel := private.notification_v2_channel(new.type);
  resolved_badge := private.notification_v2_badge_category(new.type);
  resolved_route := private.notification_v2_safe_route(
    coalesce(nullif(new.route, ''), nullif(new.payload ->> 'route', ''), '/?view=catchup')
  );
  resolved_group := private.notification_v2_group_key(
    new.type,
    new.entity_id,
    new.actor_id,
    new.conversation_id,
    new.message_id,
    new.payload
  );
  resolved_title := left(
    coalesce(nullif(new.payload ->> 'title', ''), 'New ShadowChat update'),
    120
  );
  resolved_body := nullif(left(
    coalesce(
      nullif(new.payload ->> 'body', ''),
      nullif(new.payload ->> 'body_preview', ''),
      nullif(new.payload ->> 'preview', '')
    ),
    240
  ), '');
  resolved_priority := case
    when new.type in ('presence_active', 'shado_live_room_ended') then 'ambient'
    when new.type in (
      'dm_message',
      'mention',
      'reply',
      'shadow_pin_reply',
      'connection_request',
      'shado_live_room_started',
      'shado_live_speaker_promoted',
      'shado_live_participant_muted',
      'shadow_checkers_turn',
      'shadow_war_turn'
    ) then 'high'
    when new.type in ('shado_live_participant_removed', 'weather_alert', 'security_alert') then 'urgent'
    else 'normal'
  end;
  resolved_media := case
    when new.type like 'shadow_pin_%'
      and coalesce(new.payload ->> 'image_id', new.entity_id::text) is not null
      then jsonb_build_object(
        'kind', 'shadow_pin',
        'image_id', coalesce(new.payload ->> 'image_id', new.entity_id::text)
      )
    else null
  end;

  insert into public.notification_envelopes_v2 (
    event_id,
    user_id,
    category_key,
    title,
    body,
    actor_id,
    route,
    group_key,
    priority,
    action_keys,
    sound_id,
    android_channel_key,
    badge_category,
    media_ref,
    created_at,
    expires_at
  ) values (
    new.id,
    new.user_id,
    resolved_category,
    resolved_title,
    resolved_body,
    new.actor_id,
    resolved_route,
    resolved_group,
    resolved_priority,
    array['open', 'mark_read']::text[],
    resolved_sound,
    resolved_channel,
    resolved_badge,
    resolved_media,
    new.created_at,
    new.presentation_expires_at
  )
  on conflict (event_id) do nothing;

  if runtime_mode in ('shadow', 'active')
    and new.created_at >= runtime_watermark
    and new.sent_at is null
    and new.read_at is null
    and new.resolved_at is null
    and new.presentation_expires_at > now()
    and new.type not in ('shadow_war_turn', 'weather_alert', 'security_alert') then
    insert into public.notification_outbox_v2 (
      event_id,
      user_id,
      delivery_mode,
      status,
      expires_at
    ) values (
      new.id,
      new.user_id,
      runtime_mode,
      case when runtime_mode = 'shadow' then 'shadow' else 'pending' end,
      new.presentation_expires_at
    )
    on conflict (event_id) do nothing
    returning id into resolved_outbox_id;

  end if;

  return new;
end;
$$;

revoke all on function private.materialize_notification_envelope_v2() from public, anon, authenticated, service_role;

-- Applying the migration alone never activates native delivery or any old job.
commit;
