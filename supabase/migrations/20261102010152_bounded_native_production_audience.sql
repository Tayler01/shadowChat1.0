-- Explicit production audience, independent of bounded dispatch capacity.
-- Defaults preserve disabled/canary behavior. No schedule or runtime is enabled.
begin;
alter table public.notification_v2_runtime_config
  add column audience_mode text not null default 'canary'
  check (audience_mode in ('canary','production'));
alter table private.notification_native_worker_lease_v2
  add column last_action text check (last_action is null or last_action in ('deliver','receipts'));

-- Service-side member authority, not user-editable metadata. Legacy authenticated
-- native registrations retain their transport contract; scoped installs require
-- their owned active enrollment credential. No identifiers/content are exposed.
create function private.native_notification_recipient_eligible_v1(target_user_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select public.is_active_member_for_service(target_user_id)
   and exists(select 1 from auth.users a where a.id=target_user_id and a.deleted_at is null
     and (a.banned_until is null or a.banned_until<=now()))
   and exists(select 1 from public.notification_installations i
     join private.notification_native_tokens t on t.installation_id=i.id and t.user_id=i.user_id
       and t.environment=i.environment and t.provider='expo' and t.enabled and t.disabled_at is null
       and t.token ~ '^(ExponentPushToken|ExpoPushToken)\[[^]]+\]$'
     where i.user_id=target_user_id and i.environment='production' and i.platform in ('ios','android')
       and i.revoked_at is null and (i.community_scope_version is null or exists(
         select 1 from private.notification_installation_credentials c where c.installation_id=i.id
           and c.user_id=i.user_id and c.revoked_at is null)));
$$;
revoke all on function private.native_notification_recipient_eligible_v1(uuid)
 from public,anon,authenticated,service_role;

-- Global production work no longer has a canary-user leading index predicate.
create index notification_outbox_v2_production_due_idx
 on public.notification_outbox_v2(created_at,available_at,id)
 where delivery_mode='active' and status in ('pending','processing') and attempt_count<3;
create index notification_targets_v2_production_receipt_due_idx
 on public.notification_delivery_targets_v2(next_receipt_check_at,created_at,id)
 where transport='expo' and status='accepted' and receipt_attempt_count<3;

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
    or not ((runtime.audience_mode = 'canary' and not runtime.all_users_enabled and cardinality(runtime.canary_user_ids) between 1 and 10)
      or (runtime.audience_mode = 'production' and runtime.all_users_enabled and cardinality(runtime.canary_user_ids) = 0))
    or cardinality(runtime.enabled_categories) = 0
    or (target_action = 'receipts' and not runtime.receipt_reconciliation_enabled) then
    return null;
  end if;
  if target_action = 'deliver' and not exists (
    select 1 from public.notification_outbox_v2 outbox
    join public.notification_envelopes_v2 envelope on envelope.event_id = outbox.event_id
    join public.notification_events event on event.id = outbox.event_id
    where ((runtime.audience_mode = 'canary' and outbox.user_id = any(runtime.canary_user_ids))
        or (runtime.audience_mode = 'production' and private.native_notification_recipient_eligible_v1(outbox.user_id)))
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
      and (runtime.audience_mode = 'production' or installation.user_id = any(runtime.canary_user_ids))
      and (runtime.audience_mode <> 'production' or installation.environment = 'production')
      and envelope.category_key = any(runtime.enabled_categories)
      and (target.next_receipt_check_at <= now() or target.receipt_expires_at <= now())
  ) then return null; end if;
  update private.notification_native_worker_lease_v2
  set lease_token = gen_random_uuid(), lease_expires_at = now() + interval '30 seconds', last_action=target_action
  where singleton and (lease_expires_at is null or lease_expires_at <= now())
  returning lease_token into acquired;
  return acquired;
end;
$$;

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
  if batch_size is null or batch_size not between 1 and 2
    or lease_seconds is null or lease_seconds not between 15 and 45 then
    raise exception 'Bounded native claim requires batch <=2 and lease 15-45 seconds';
  end if;
  select * into runtime from public.notification_v2_runtime_config where singleton;
  if runtime.singleton is not true or runtime.delivery_mode <> 'active' or not runtime.worker_invocation_enabled
    or not ((runtime.audience_mode = 'canary' and not runtime.all_users_enabled and cardinality(runtime.canary_user_ids) between 1 and 10)
      or (runtime.audience_mode = 'production' and runtime.all_users_enabled and cardinality(runtime.canary_user_ids) = 0)) then
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
    where ((runtime.audience_mode = 'canary' and outbox.user_id = any(runtime.canary_user_ids))
        or (runtime.audience_mode = 'production' and private.native_notification_recipient_eligible_v1(outbox.user_id)))
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
  -- delivery outside the explicit audience or replay events before activation.
  if runtime.singleton is not true or runtime.delivery_mode not in ('shadow', 'active')
    or not ((runtime.audience_mode = 'canary' and not runtime.all_users_enabled and cardinality(runtime.canary_user_ids) between 1 and 10)
      or (runtime.audience_mode = 'production' and runtime.all_users_enabled and cardinality(runtime.canary_user_ids) = 0))
    or not ((runtime.audience_mode = 'canary' and new.user_id = any(runtime.canary_user_ids))
      or (runtime.audience_mode = 'production' and private.native_notification_recipient_eligible_v1(new.user_id)))
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

create or replace function private.request_native_notification_wake_v1(is_continuation boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  runtime public.notification_v2_runtime_config;
  worker_secret text;
  action text;
  request_id bigint;
  worker_state private.notification_native_worker_lease_v2;
  has_delivery boolean;
  has_receipts boolean;
begin
  select * into runtime from public.notification_v2_runtime_config where singleton;
  if runtime.singleton is not true or runtime.delivery_mode <> 'active' or not runtime.worker_invocation_enabled
    or not ((runtime.audience_mode = 'canary' and not runtime.all_users_enabled and cardinality(runtime.canary_user_ids) between 1 and 10)
      or (runtime.audience_mode = 'production' and runtime.all_users_enabled and cardinality(runtime.canary_user_ids) = 0))
    or cardinality(runtime.enabled_categories) = 0
    or runtime.worker_url is distinct from
      'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2' then
    return null;
  end if;
  -- Indexed work checks still precede lease/Vault/HTTP.
  select exists (
    select 1 from public.notification_outbox_v2 outbox
    join public.notification_envelopes_v2 envelope on envelope.event_id = outbox.event_id
    join public.notification_events event on event.id = outbox.event_id
    where ((runtime.audience_mode = 'canary' and outbox.user_id = any(runtime.canary_user_ids))
        or (runtime.audience_mode = 'production' and private.native_notification_recipient_eligible_v1(outbox.user_id)))
      and outbox.created_at >= runtime.activation_watermark
      and outbox.delivery_mode = 'active' and outbox.status in ('pending', 'processing')
      and outbox.attempt_count < 3 and outbox.available_at <= now() and outbox.expires_at > now()
      and (outbox.status = 'pending' or outbox.lease_expires_at <= now())
      and envelope.category_key = any(runtime.enabled_categories)
      and event.read_at is null and event.resolved_at is null
  ) into has_delivery;
  select runtime.receipt_reconciliation_enabled and exists (
    select 1 from public.notification_delivery_targets_v2 target
    join public.notification_installations installation on installation.id = target.installation_id
    join public.notification_envelopes_v2 envelope on envelope.event_id = target.event_id
    where target.transport = 'expo' and target.status = 'accepted' and target.receipt_attempt_count < 3
      and target.created_at >= runtime.activation_watermark
      and (runtime.audience_mode = 'production' or installation.user_id = any(runtime.canary_user_ids))
      and (runtime.audience_mode <> 'production' or installation.environment = 'production')
      and envelope.category_key = any(runtime.enabled_categories)
      and (target.next_receipt_check_at <= now() or target.receipt_expires_at <= now())
  ) into has_receipts;
  if not has_delivery and not has_receipts then return null; end if;
  -- Never make a member INSERT wait on a worker holding this singleton.
  select * into worker_state from private.notification_native_worker_lease_v2
  where singleton for update skip locked;
  if not found then return null; end if;
  -- Production alternates due receipts/delivery; continuous new traffic cannot
  -- starve accepted tickets. Canary retains its prior delivery-first behavior.
  action := case when has_delivery and (not has_receipts or runtime.audience_mode='canary'
    or worker_state.last_action is distinct from 'deliver') then 'deliver' else 'receipts' end;
  if not is_continuation then
    -- A new event/cron tick starts a fresh bounded burst, including when the
    -- previous worker is still running. No HTTP or lease stealing occurs here.
    update private.notification_native_worker_lease_v2
    set wake_continuations_remaining = 4 where singleton;
  elsif worker_state.wake_continuations_remaining <= 0 then return null;
  end if;
  if worker_state.invocation_reserved_until > now()
    or worker_state.lease_expires_at > now() then return null; end if;
  -- Reservation is crash recovery, not a successful-delivery cooldown.
  update private.notification_native_worker_lease_v2
  set invocation_reserved_until = now() + interval '30 seconds',
      wake_continuations_remaining = case when is_continuation
        then wake_continuations_remaining - 1 else 4 end
  where singleton;
  select decrypted_secret into worker_secret from vault.decrypted_secrets
  where name = 'shadowchat_notification_v2_worker_secret' order by updated_at desc limit 1;
  if worker_secret is null or length(worker_secret) < 32 then
    update private.notification_native_worker_lease_v2
    set invocation_reserved_until = null, wake_continuations_remaining = 0 where singleton;
    return null;
  end if;
  select net.http_post(url := runtime.worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-shadowchat-worker-secret', worker_secret),
    body := jsonb_build_object('action', 'bounded_canary', 'task', action),
    timeout_milliseconds := 9000) into request_id;
  return request_id;
end;
$$;

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
        (runtime.audience_mode='canary' and not runtime.all_users_enabled
          and cardinality(runtime.canary_user_ids) between 1 and 10
          and outbox.user_id=any(runtime.canary_user_ids))
        or (runtime.audience_mode='production' and runtime.all_users_enabled
          and cardinality(runtime.canary_user_ids)=0
          and private.native_notification_recipient_eligible_v1(outbox.user_id))
      )
  ) into allowed;

  return coalesce(allowed, false);
end;
$$;

-- A member may own both valid and revoked scoped devices. Per-member eligibility
-- alone must not authorize every token. Keep the existing service-only signature
-- and legacy canary behavior; production additionally gates each chosen device.
create or replace function public.list_notification_native_delivery_tokens_v2(
 target_user_id uuid,target_installation_ids uuid[],target_environment text
)
returns table(id uuid,installation_id uuid,provider text,token text,environment text)
language plpgsql security definer set search_path='' as $$
declare production_mode boolean;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required';end if;
 if target_environment not in('development','preview','production')then raise exception 'Invalid notification delivery environment';end if;
 if target_user_id is null or coalesce(cardinality(target_installation_ids),0)=0 then return;end if;
 select audience_mode='production'into production_mode from public.notification_v2_runtime_config where singleton;
 if production_mode and cardinality(target_installation_ids)>2 then raise exception 'Native production token selection is bounded to two installations';end if;
 return query select t.id,t.installation_id,t.provider,t.token,t.environment
 from private.notification_native_tokens t
 where t.user_id=target_user_id and t.enabled and t.environment=target_environment
   and t.installation_id=any(target_installation_ids)
   and(not coalesce(production_mode,false)or(
     target_environment='production'and t.provider='expo'and t.disabled_at is null
     and t.token ~ '^(ExponentPushToken|ExpoPushToken)\[[^]]+\]$'
     and private.native_notification_recipient_eligible_v1(target_user_id)
     and exists(select 1 from public.notification_installations i
       where i.id=t.installation_id and i.user_id=t.user_id and i.environment=t.environment
        and i.platform in('ios','android')and i.revoked_at is null
        and(i.community_scope_version is null or exists(select 1 from private.notification_installation_credentials c
          where c.installation_id=i.id and c.user_id=i.user_id and c.revoked_at is null)))));
end;
$$;

-- Reassert the existing private/service-only ACLs as well as preserving them.
revoke all on function private.materialize_notification_envelope_v2(),
 private.request_native_notification_wake_v1(boolean) from public,anon,authenticated,service_role;
revoke all on function public.acquire_native_notification_worker_v2(text),
 public.claim_notification_outbox_v2(integer,integer),
 public.validate_notification_outbox_v2_lease(uuid,uuid),
 public.list_notification_native_delivery_tokens_v2(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.acquire_native_notification_worker_v2(text),
 public.claim_notification_outbox_v2(integer,integer),
 public.validate_notification_outbox_v2_lease(uuid,uuid),
 public.list_notification_native_delivery_tokens_v2(uuid,uuid[],text) to service_role;
-- No new SECURITY DEFINER API and no old collector/configuration RPC.
commit;
