-- Notification v2 delivery runs through PostgREST from an Edge Function. The
-- native token table deliberately lives in the unexposed private schema, so
-- the worker must use narrow, service-role-only SECURITY DEFINER RPCs instead
-- of attempting to select or update the private table through PostgREST.

create or replace function public.list_notification_native_delivery_tokens_v2(
  target_user_id uuid,
  target_installation_ids uuid[],
  target_environment text
)
returns table (
  id uuid,
  installation_id uuid,
  provider text,
  token text,
  environment text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if target_environment not in ('development', 'preview', 'production') then
    raise exception 'Invalid notification delivery environment';
  end if;
  if target_user_id is null
    or coalesce(cardinality(target_installation_ids), 0) = 0 then
    return;
  end if;

  return query
  select
    tokens.id,
    tokens.installation_id,
    tokens.provider,
    tokens.token,
    tokens.environment
  from private.notification_native_tokens tokens
  where tokens.user_id = target_user_id
    and tokens.enabled = true
    and tokens.environment = target_environment
    and tokens.installation_id = any(target_installation_ids);
end;
$$;

revoke all on function public.list_notification_native_delivery_tokens_v2(
  uuid, uuid[], text
) from public, anon, authenticated;
grant execute on function public.list_notification_native_delivery_tokens_v2(
  uuid, uuid[], text
) to service_role;

create or replace function public.disable_notification_native_token_v2(
  target_environment text,
  target_token_id uuid default null,
  target_installation_id uuid default null,
  target_reason text default 'DeviceNotRegistered'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer := 0;
  normalized_reason text := left(
    coalesce(nullif(trim(target_reason), ''), 'DeviceNotRegistered'),
    240
  );
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if target_environment not in ('development', 'preview', 'production') then
    raise exception 'Invalid notification delivery environment';
  end if;
  if (target_token_id is null) = (target_installation_id is null) then
    raise exception 'Exactly one notification token selector is required';
  end if;

  update private.notification_native_tokens tokens
  set
    enabled = false,
    disabled_at = now(),
    disabled_reason = normalized_reason,
    updated_at = now()
  where tokens.environment = target_environment
    and tokens.provider = 'expo'
    and tokens.enabled = true
    and (
      (target_token_id is not null and tokens.id = target_token_id)
      or (
        target_installation_id is not null
        and tokens.installation_id = target_installation_id
      )
    );
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.disable_notification_native_token_v2(
  text, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.disable_notification_native_token_v2(
  text, uuid, uuid, text
) to service_role;
