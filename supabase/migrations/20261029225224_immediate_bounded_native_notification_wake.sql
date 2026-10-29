-- Immediate bounded native wake. Applying this does not activate a runtime,
-- change any canary/category/watermark, or enable/alter a schedule.
begin;

alter table private.notification_native_worker_lease_v2
  add column wake_continuations_remaining smallint not null default 0
  check (wake_continuations_remaining between 0 and 4);

create or replace function private.request_native_notification_wake_v1(is_continuation boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  runtime public.notification_v2_runtime_config;
  worker_secret text;
  action text;
  request_id bigint;
  worker_state private.notification_native_worker_lease_v2;
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
  -- Never make a member INSERT wait on a worker holding this singleton.
  select * into worker_state from private.notification_native_worker_lease_v2
  where singleton for update skip locked;
  if not found then return null; end if;
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
revoke all on function private.request_native_notification_wake_v1(boolean)
  from public, anon, authenticated, service_role;

-- Preserve the exact existing cron entrypoint and its private ACL.
create or replace function private.request_bounded_native_notification_canary()
returns bigint language sql security definer set search_path = '' as $$
  select private.request_native_notification_wake_v1(false)
$$;
revoke all on function private.request_bounded_native_notification_canary()
  from public, anon, authenticated, service_role;

create or replace function private.wake_new_native_notification_outbox_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A statement with no inserted eligible rows must not wake an old backlog.
  if exists (select 1 from inserted_notification_outbox
    where delivery_mode = 'active' and status = 'pending') then
    perform private.request_native_notification_wake_v1(false);
  end if;
  return null;
exception when others then
  -- Queuing is best effort. A worker/Vault/pg_net failure must not roll back
  -- chat or notification writes; the unchanged minute cron remains recovery.
  return null;
end;
$$;
revoke all on function private.wake_new_native_notification_outbox_v1()
  from public, anon, authenticated, service_role;

create trigger wake_new_native_notification_outbox_v1
  after insert on public.notification_outbox_v2
  referencing new table as inserted_notification_outbox
  for each statement execute function private.wake_new_native_notification_outbox_v1();

create or replace function public.release_native_notification_worker_v2(target_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  update private.notification_native_worker_lease_v2
  set lease_token = null, lease_expires_at = null, invocation_reserved_until = null
  where singleton and lease_token = target_lease_token;
  if not found then return false; end if;
  begin
    -- At most four successors per fresh event/tick. Each still enforces the
    -- original two-event/four-target/eight-second worker bounds and dedupe.
    perform private.request_native_notification_wake_v1(true);
  exception when others then
    -- Keep this owner's release even if continuation cannot be queued.
    null;
  end;
  return true;
end;
$$;
revoke all on function public.release_native_notification_worker_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.release_native_notification_worker_v2(uuid) to service_role;

commit;
