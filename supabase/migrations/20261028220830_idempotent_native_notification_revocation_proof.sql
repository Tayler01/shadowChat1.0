-- Additive retry-safe exact-credential revocation; prior scoped migration stays immutable.
-- Retain existing RPC signatures, grants and legacy boolean semantics.
begin;

create or replace function private.register_native_notification_token_for_user_v2(
  target_user_id uuid,
  target_installation_key uuid,
  target_provider text,
  target_environment text,
  target_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_installation_id uuid;
  resolved_token text;
  resolved_hash text;
  prior_token_id uuid;
  prior_installation_id uuid;
  prior_user_id uuid;
  prior_installation_key uuid;
begin
  if target_user_id is null then
    raise exception 'Authentication required';
  end if;
  if target_installation_key is null then
    raise exception 'Invalid notification installation';
  end if;
  if target_provider is null or target_provider not in ('expo', 'apns', 'fcm') then
    raise exception 'Invalid native push provider';
  end if;
  if target_environment is null
    or target_environment not in ('development', 'preview', 'production')
  then
    raise exception 'Invalid notification environment';
  end if;
  if target_token is null then
    raise exception 'Invalid native push token';
  end if;
  resolved_token := btrim(target_token);
  if char_length(resolved_token) not between 16 and 4096 then
    raise exception 'Invalid native push token';
  end if;

  -- Serialize against enrollment and both revocation paths before reading state.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_installation_key::text, 0)
  );

  select installations.id
  into resolved_installation_id
  from public.notification_installations installations
  where installations.user_id = target_user_id
    and installations.installation_key = target_installation_key
    and installations.platform in ('ios', 'android')
    and installations.revoked_at is null
  for update of installations;

  if resolved_installation_id is null then
    raise exception 'Notification installation was not registered';
  end if;

  resolved_hash := pg_catalog.encode(
    extensions.digest(resolved_token, 'sha256'),
    'hex'
  );

  select
    tokens.id,
    tokens.installation_id,
    tokens.user_id,
    installations.installation_key
  into
    prior_token_id,
    prior_installation_id,
    prior_user_id,
    prior_installation_key
  from private.notification_native_tokens tokens
  join public.notification_installations installations
    on installations.id = tokens.installation_id
    and installations.user_id = tokens.user_id
  where tokens.token_hash = resolved_hash
    and (
      tokens.installation_id <> resolved_installation_id
      or tokens.provider <> target_provider
      or tokens.environment <> target_environment
    )
  for update of tokens, installations;

  if prior_token_id is not null then
    if prior_installation_key is distinct from target_installation_key then
      raise exception 'Notification token belongs to another installation';
    end if;

    if prior_user_id is distinct from target_user_id then
      update public.notification_installations installations
      set
        revoked_at = coalesce(installations.revoked_at, now()),
        foreground_until = null,
        updated_at = now()
      where installations.id = prior_installation_id
        and installations.user_id = prior_user_id;

      update private.notification_native_tokens tokens
      set
        enabled = false,
        disabled_at = coalesce(tokens.disabled_at, now()),
        disabled_reason = 'Installation account changed',
        updated_at = now()
      where tokens.installation_id = prior_installation_id
        and tokens.user_id = prior_user_id;
    end if;

    delete from private.notification_native_tokens tokens
    where tokens.id = prior_token_id;
  end if;

  insert into private.notification_native_tokens (
    installation_id,
    user_id,
    provider,
    environment,
    token,
    token_hash,
    enabled,
    last_seen_at,
    disabled_at,
    disabled_reason
  ) values (
    resolved_installation_id,
    target_user_id,
    target_provider,
    target_environment,
    resolved_token,
    resolved_hash,
    true,
    now(),
    null,
    null
  )
  on conflict (installation_id, provider, environment) do update
  set
    token = excluded.token,
    token_hash = excluded.token_hash,
    enabled = true,
    last_seen_at = now(),
    disabled_at = null,
    disabled_reason = null,
    updated_at = now();

  return true;
end;
$$;

create function public.revoke_notification_installation_with_proof_v1(
  target_user_id uuid,
  target_installation_key uuid,
  target_credential text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_installation_id uuid;
begin
  if target_user_id is null or target_installation_key is null
    or target_credential is null or octet_length(target_credential) <> 64
    or target_credential !~ '^[0-9a-f]{64}$'
  then return false; end if;

  -- Same lock as enrollment, legacy revoke and token refresh. A proof describes
  -- the exact credential generation at this transaction's linearization point.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_installation_key::text, 0)
  );
  select installations.id into matched_installation_id
  from public.notification_installations installations
  join private.notification_installation_credentials credentials
    on credentials.installation_id = installations.id
    and credentials.user_id = installations.user_id
  where installations.user_id = target_user_id
    and installations.installation_key = target_installation_key
    and installations.platform in ('ios', 'android')
    and credentials.credential_hash = pg_catalog.encode(
      extensions.digest(target_credential, 'sha256'), 'hex'
    )
  for update of installations, credentials;
  if matched_installation_id is null then return false; end if;

  -- A historical credential cannot attest cleanup for another currently active
  -- registration that reused its key. Do not touch that replacement generation.
  if exists(select 1 from public.notification_installations installations
    where installations.installation_key = target_installation_key
      and installations.id <> matched_installation_id
      and installations.revoked_at is null)
  then return false; end if;

  update public.notification_installations
  set revoked_at = coalesce(revoked_at, now()), foreground_until = null, updated_at = now()
  where id = matched_installation_id and user_id = target_user_id;

  update private.notification_native_tokens
  set enabled = false, disabled_at = coalesce(disabled_at, now()),
    disabled_reason = 'Installation revoked', updated_at = now()
  where installation_id = matched_installation_id and user_id = target_user_id;

  update private.notification_installation_credentials
  set revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where installation_id = matched_installation_id and user_id = target_user_id;

  if not exists(select 1 from public.notification_installations installations
      join private.notification_installation_credentials credentials
        on credentials.installation_id = installations.id
        and credentials.user_id = installations.user_id
      where installations.id = matched_installation_id
        and installations.user_id = target_user_id
        and installations.installation_key = target_installation_key
        and installations.revoked_at is not null
        and installations.foreground_until is null
        and credentials.revoked_at is not null
        and credentials.credential_hash = pg_catalog.encode(extensions.digest(target_credential, 'sha256'), 'hex'))
    or exists(select 1 from private.notification_native_tokens tokens
      where tokens.installation_id = matched_installation_id and tokens.user_id = target_user_id
        and (tokens.enabled or tokens.disabled_at is null))
  then
    -- Never return success or leave partial revocation if a write was skipped.
    raise exception 'Notification installation revocation proof failed';
  end if;
  return true;
end;
$$;

revoke all on function public.revoke_notification_installation_with_proof_v1(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_notification_installation_with_proof_v1(uuid, uuid, text) to anon;

comment on function public.revoke_notification_installation_with_proof_v1(uuid, uuid, text) is
  'Idempotently revoke one exact historical native installation credential. Missing/replaced credentials and another active same-key generation fail closed. Does not recall provider-accepted notifications.';

create or replace function public.revoke_notification_installation_by_credential_v2(
  target_installation_key uuid,
  target_credential text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_installation_id uuid;
  resolved_user_id uuid;
begin
  if target_credential is null then
    return false;
  end if;
  if octet_length(target_credential) <> 64 then
    return false;
  end if;
  if target_credential !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  -- Keep legacy return semantics, but serialize with enrollment/token refresh.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_installation_key::text, 0)
  );

  select resolved.installation_id, resolved.user_id
  into resolved_installation_id, resolved_user_id
  from private.resolve_notification_installation_credential_v2(
    target_installation_key,
    target_credential
  ) resolved;
  if resolved_installation_id is null then
    return false;
  end if;

  update public.notification_installations installations
  set
    revoked_at = now(),
    foreground_until = null,
    updated_at = now()
  where installations.id = resolved_installation_id
    and installations.user_id = resolved_user_id;

  update private.notification_native_tokens tokens
  set
    enabled = false,
    disabled_at = now(),
    disabled_reason = 'Installation revoked',
    updated_at = now()
  where tokens.installation_id = resolved_installation_id
    and tokens.user_id = resolved_user_id;

  update private.notification_installation_credentials credentials
  set
    revoked_at = now(),
    updated_at = now()
  where credentials.installation_id = resolved_installation_id
    and credentials.user_id = resolved_user_id;

  return true;
end;
$$;



create or replace function public.register_native_notification_token_by_credential_v2(
  target_installation_key uuid,
  target_credential text,
  target_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_installation_id uuid;
  resolved_user_id uuid;
begin
  if target_credential is null then
    return false;
  end if;
  if octet_length(target_credential) <> 64 then
    return false;
  end if;
  if target_credential !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  if target_token is null then
    return false;
  end if;
  if octet_length(target_token) not between 20 and 512 then
    return false;
  end if;
  if target_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$' then
    return false;
  end if;
  -- Lock before credential resolution, so a stale request cannot authenticate
  -- one generation then mutate a replacement after waiting on the key.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_installation_key::text, 0)
  );

  select resolved.installation_id, resolved.user_id
  into resolved_installation_id, resolved_user_id
  from private.resolve_notification_installation_credential_v2(
    target_installation_key,
    target_credential
  ) resolved;
  if resolved_installation_id is null then
    return false;
  end if;

  perform private.register_native_notification_token_for_user_v2(
    resolved_user_id,
    target_installation_key,
    'expo',
    'production',
    target_token
  );

  update private.notification_installation_credentials credentials
  set
    last_seen_at = now(),
    updated_at = now()
  where credentials.installation_id = resolved_installation_id
    and credentials.user_id = resolved_user_id;

  return true;
end;
$$;

create or replace function public.set_notification_installation_foreground_by_credential_v2(
  target_installation_key uuid,
  target_credential text,
  target_foreground_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_installation_id uuid;
  resolved_user_id uuid;
begin
  if target_credential is null then
    return false;
  end if;
  if octet_length(target_credential) <> 64 then
    return false;
  end if;
  if target_credential !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  -- Lock before credential resolution, so a stale request cannot authenticate
  -- one generation then mutate a replacement after waiting on the key.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_installation_key::text, 0)
  );

  select resolved.installation_id, resolved.user_id
  into resolved_installation_id, resolved_user_id
  from private.resolve_notification_installation_credential_v2(
    target_installation_key,
    target_credential
  ) resolved;
  if resolved_installation_id is null then
    return false;
  end if;

  update public.notification_installations installations
  set
    foreground_until = case
      when target_foreground_until is null then null
      else least(target_foreground_until, now() + interval '2 minutes')
    end,
    last_seen_at = now(),
    updated_at = now()
  where installations.id = resolved_installation_id
    and installations.user_id = resolved_user_id;

  update private.notification_installation_credentials credentials
  set
    last_seen_at = now(),
    updated_at = now()
  where credentials.installation_id = resolved_installation_id
    and credentials.user_id = resolved_user_id;

  return true;
end;
$$;

commit;
