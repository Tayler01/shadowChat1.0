/*
  # Fix notification v2 worker request tracking

  Avoids a PL/pgSQL variable/column ambiguity while the rollout remains
  disabled-safe.
*/

begin;

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

commit;
