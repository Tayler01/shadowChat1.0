/*
  # Native notification enrollment tickets

  Removes the TestFlight notification setup path's dependency on a second
  persisted user session. The authenticated hosted app mints a short-lived,
  single-use ticket. The native container can redeem that ticket exactly once
  to register its installation and Expo token.
*/

begin;

create table if not exists private.notification_native_enrollment_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  request_id text not null,
  installation_key uuid not null,
  challenge_hash text not null,
  installation_credential_hash text not null,
  secret_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  check (char_length(request_id) between 16 and 160),
  check (request_id ~ '^[A-Za-z0-9._:-]+$'),
  check (challenge_hash ~ '^[0-9a-f]{64}$'),
  check (installation_credential_hash ~ '^[0-9a-f]{64}$'),
  check (secret_hash ~ '^[0-9a-f]{64}$'),
  check (expires_at > created_at)
);

create index if not exists notification_native_enrollment_tickets_expiry_idx
  on private.notification_native_enrollment_tickets (expires_at)
  where consumed_at is null;

create index if not exists notification_installations_native_key_active_idx
  on public.notification_installations (installation_key)
  where platform in ('ios', 'android') and revoked_at is null;

alter table private.notification_native_enrollment_tickets
  enable row level security;

revoke all on table private.notification_native_enrollment_tickets
  from public, anon, authenticated, service_role;
grant select, insert, update, delete
  on table private.notification_native_enrollment_tickets
  to service_role;

create table if not exists private.notification_installation_credentials (
  installation_id uuid primary key,
  user_id uuid not null,
  credential_hash text not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (installation_id, user_id)
    references public.notification_installations(id, user_id)
    on delete cascade,
  check (credential_hash ~ '^[0-9a-f]{64}$')
);

alter table private.notification_installation_credentials
  enable row level security;

revoke all on table private.notification_installation_credentials
  from public, anon, authenticated, service_role;
grant select, insert, update, delete
  on table private.notification_installation_credentials
  to service_role;

create or replace function private.register_notification_installation_for_user_v2(
  target_user_id uuid,
  target_installation_key uuid,
  target_platform text,
  target_app_id text,
  target_project_id text default null,
  target_environment text default 'production',
  target_app_version text default null,
  target_build_number text default null,
  target_locale text default null,
  target_time_zone text default null,
  target_channel_schema_version integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_id uuid;
begin
  if target_user_id is null then
    raise exception 'Authentication required';
  end if;
  if target_installation_key is null then
    raise exception 'Invalid notification installation';
  end if;
  if target_platform is null or target_platform not in ('web', 'ios', 'android') then
    raise exception 'Invalid notification platform';
  end if;
  if target_environment is null
    or target_environment not in ('development', 'preview', 'production')
  then
    raise exception 'Invalid notification environment';
  end if;
  if target_app_id is null or char_length(target_app_id) not between 1 and 160 then
    raise exception 'Invalid app id';
  end if;
  if target_project_id is not null and char_length(target_project_id) not between 1 and 160 then
    raise exception 'Invalid project id';
  end if;
  if target_channel_schema_version is null
    or target_channel_schema_version < 1
    or target_channel_schema_version > 100
  then
    raise exception 'Invalid channel schema version';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_installation_key::text, 0)
  );

  update private.notification_native_tokens tokens
  set
    enabled = false,
    disabled_at = coalesce(tokens.disabled_at, now()),
    disabled_reason = 'Installation account changed',
    updated_at = now()
  where tokens.installation_id in (
    select installations.id
    from public.notification_installations installations
    where installations.installation_key = target_installation_key
      and installations.user_id <> target_user_id
  );

  update private.notification_installation_credentials credentials
  set
    revoked_at = coalesce(credentials.revoked_at, now()),
    updated_at = now()
  where credentials.installation_id in (
    select installations.id
    from public.notification_installations installations
    where installations.installation_key = target_installation_key
      and installations.user_id <> target_user_id
  );

  update public.notification_installations installations
  set
    revoked_at = coalesce(installations.revoked_at, now()),
    foreground_until = null,
    updated_at = now()
  where installations.installation_key = target_installation_key
    and installations.user_id <> target_user_id;

  insert into public.notification_installations (
    user_id,
    installation_key,
    platform,
    app_id,
    project_id,
    environment,
    app_version,
    build_number,
    locale,
    time_zone,
    channel_schema_version,
    last_seen_at,
    revoked_at
  ) values (
    target_user_id,
    target_installation_key,
    target_platform,
    target_app_id,
    nullif(target_project_id, ''),
    target_environment,
    nullif(left(target_app_version, 40), ''),
    nullif(left(target_build_number, 40), ''),
    nullif(left(target_locale, 40), ''),
    nullif(left(target_time_zone, 80), ''),
    target_channel_schema_version,
    now(),
    null
  )
  on conflict (user_id, installation_key) do update
  set
    platform = excluded.platform,
    app_id = excluded.app_id,
    project_id = excluded.project_id,
    environment = excluded.environment,
    app_version = excluded.app_version,
    build_number = excluded.build_number,
    locale = excluded.locale,
    time_zone = excluded.time_zone,
    channel_schema_version = excluded.channel_schema_version,
    last_seen_at = now(),
    revoked_at = null,
    updated_at = now()
  returning id into resolved_id;

  return resolved_id;
end;
$$;

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

  select installations.id
  into resolved_installation_id
  from public.notification_installations installations
  where installations.user_id = target_user_id
    and installations.installation_key = target_installation_key
    and installations.platform in ('ios', 'android')
    and installations.revoked_at is null;

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

revoke all on function private.register_notification_installation_for_user_v2(
  uuid, uuid, text, text, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function private.register_native_notification_token_for_user_v2(
  uuid, uuid, text, text, text
) from public, anon, authenticated, service_role;

create or replace function private.resolve_notification_installation_credential_v2(
  target_installation_key uuid,
  target_credential text
)
returns table (
  installation_id uuid,
  user_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    installations.id,
    installations.user_id
  from public.notification_installations installations
  join private.notification_installation_credentials credentials
    on credentials.installation_id = installations.id
    and credentials.user_id = installations.user_id
  where installations.installation_key = target_installation_key
    and installations.platform in ('ios', 'android')
    and installations.revoked_at is null
    and credentials.revoked_at is null
    and char_length(target_credential) = 64
    and credentials.credential_hash = pg_catalog.encode(
      extensions.digest(target_credential, 'sha256'),
      'hex'
    )
  limit 1;
$$;

revoke all on function private.resolve_notification_installation_credential_v2(
  uuid, text
) from public, anon, authenticated, service_role;

create or replace function public.create_my_native_notification_enrollment_ticket_v2(
  target_request_id text,
  target_installation_key uuid,
  target_challenge text,
  target_credential_challenge text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  resolved_secret text;
  resolved_ticket_id uuid;
  resolved_expires_at timestamptz := now() + interval '5 minutes';
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if target_request_id is null then
    raise exception 'Invalid notification enrollment request id';
  end if;
  if octet_length(target_request_id) not between 16 and 160 then
    raise exception 'Invalid notification enrollment request id';
  end if;
  if target_request_id !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'Invalid notification enrollment request id';
  end if;
  if target_installation_key is null then
    raise exception 'Invalid notification installation';
  end if;
  if target_challenge is null then
    raise exception 'Invalid notification enrollment challenge';
  end if;
  if octet_length(target_challenge) <> 64 then
    raise exception 'Invalid notification enrollment challenge';
  end if;
  if target_challenge !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid notification enrollment challenge';
  end if;
  if target_credential_challenge is null then
    raise exception 'Invalid notification credential challenge';
  end if;
  if octet_length(target_credential_challenge) <> 64 then
    raise exception 'Invalid notification credential challenge';
  end if;
  if target_credential_challenge !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid notification credential challenge';
  end if;

  delete from private.notification_native_enrollment_tickets tickets
  where tickets.expires_at <= now()
    or (
      tickets.consumed_at is not null
      and tickets.updated_at < now() - interval '1 day'
    );

  resolved_secret := pg_catalog.encode(
    extensions.gen_random_bytes(32),
    'hex'
  );

  insert into private.notification_native_enrollment_tickets (
    user_id,
    request_id,
    installation_key,
    challenge_hash,
    installation_credential_hash,
    secret_hash,
    expires_at,
    consumed_at,
    updated_at
  ) values (
    caller_id,
    target_request_id,
    target_installation_key,
    target_challenge,
    target_credential_challenge,
    pg_catalog.encode(extensions.digest(resolved_secret, 'sha256'), 'hex'),
    resolved_expires_at,
    null,
    now()
  )
  on conflict (user_id) do update
  set
    request_id = excluded.request_id,
    secret_hash = excluded.secret_hash,
    installation_key = excluded.installation_key,
    challenge_hash = excluded.challenge_hash,
    installation_credential_hash = excluded.installation_credential_hash,
    expires_at = excluded.expires_at,
    consumed_at = null,
    updated_at = now()
  returning id into resolved_ticket_id;

  return jsonb_build_object(
    'ticket', resolved_ticket_id::text || '.' || resolved_secret,
    'expires_at', resolved_expires_at
  );
end;
$$;

create or replace function public.redeem_native_notification_enrollment_ticket_v2(
  target_ticket text,
  target_request_id text,
  target_installation_key uuid,
  target_verifier text,
  target_installation_credential text,
  target_platform text,
  target_app_version text default null,
  target_build_number text default null,
  target_locale text default null,
  target_time_zone text default null,
  target_channel_schema_version integer default 1,
  target_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket_id uuid;
  ticket_secret text;
  resolved_user_id uuid;
  resolved_installation_id uuid;
begin
  if target_request_id is null then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if octet_length(target_request_id) not between 16 and 160 then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if target_request_id !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if target_installation_key is null then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if target_platform is null or target_platform not in ('ios', 'android') then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if target_verifier is null then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if octet_length(target_verifier) <> 64 then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if target_verifier !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if target_installation_credential is null then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if octet_length(target_installation_credential) <> 64 then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if target_installation_credential !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if target_token is null then
    raise exception 'Invalid native push token';
  end if;
  if octet_length(target_token) not between 20 and 512 then
    raise exception 'Invalid native push token';
  end if;
  if target_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Invalid native push token';
  end if;
  if target_channel_schema_version is null
    or target_channel_schema_version < 1
    or target_channel_schema_version > 100
  then
    raise exception 'Invalid notification channel schema version';
  end if;
  if target_ticket is null then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if octet_length(target_ticket) <> 101 then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;
  if split_part(target_ticket, '.', 3) <> '' then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;

  begin
    ticket_id := split_part(target_ticket, '.', 1)::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid or expired notification enrollment ticket';
  end;
  ticket_secret := split_part(target_ticket, '.', 2);
  if ticket_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;

  select tickets.user_id
  into resolved_user_id
  from private.notification_native_enrollment_tickets tickets
  where tickets.id = ticket_id
    and tickets.request_id = target_request_id
    and tickets.installation_key = target_installation_key
    and tickets.challenge_hash = pg_catalog.encode(
      extensions.digest(target_verifier, 'sha256'),
      'hex'
    )
    and tickets.installation_credential_hash = pg_catalog.encode(
      extensions.digest(target_installation_credential, 'sha256'),
      'hex'
    )
    and tickets.consumed_at is null
    and tickets.expires_at > now()
    and tickets.secret_hash = pg_catalog.encode(
      extensions.digest(ticket_secret, 'sha256'),
      'hex'
    )
  for update;

  if resolved_user_id is null then
    raise exception 'Invalid or expired notification enrollment ticket';
  end if;

  update private.notification_native_enrollment_tickets tickets
  set
    consumed_at = now(),
    updated_at = now()
  where tickets.id = ticket_id;

  resolved_installation_id :=
    private.register_notification_installation_for_user_v2(
      resolved_user_id,
      target_installation_key,
      target_platform,
      'com.shadowchat.mobile',
      '1deb0022-9ec4-4e90-8fc8-8b71c3737ff2',
      'production',
      target_app_version,
      target_build_number,
      target_locale,
      target_time_zone,
      target_channel_schema_version
    );

  perform private.register_native_notification_token_for_user_v2(
    resolved_user_id,
    target_installation_key,
    'expo',
    'production',
    target_token
  );

  insert into private.notification_installation_credentials (
    installation_id,
    user_id,
    credential_hash,
    last_seen_at,
    revoked_at,
    updated_at
  ) values (
    resolved_installation_id,
    resolved_user_id,
    pg_catalog.encode(
      extensions.digest(target_installation_credential, 'sha256'),
      'hex'
    ),
    now(),
    null,
    now()
  )
  on conflict (installation_id) do update
  set
    user_id = excluded.user_id,
    credential_hash = excluded.credential_hash,
    last_seen_at = now(),
    revoked_at = null,
    updated_at = now();

  return jsonb_build_object(
    'enabled', true,
    'user_id', resolved_user_id,
    'installation_id', resolved_installation_id
  );
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

revoke all on function public.create_my_native_notification_enrollment_ticket_v2(
  text, uuid, text, text
)
  from public, anon, authenticated, service_role;
grant execute on function public.create_my_native_notification_enrollment_ticket_v2(
  text, uuid, text, text
)
  to authenticated;

revoke all on function public.redeem_native_notification_enrollment_ticket_v2(
  text, text, uuid, text, text, text, text, text, text, text, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.redeem_native_notification_enrollment_ticket_v2(
  text, text, uuid, text, text, text, text, text, text, text, integer, text
) to anon;

revoke all on function public.set_notification_installation_foreground_by_credential_v2(
  uuid, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.set_notification_installation_foreground_by_credential_v2(
  uuid, text, timestamptz
) to anon;

revoke all on function public.register_native_notification_token_by_credential_v2(
  uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.register_native_notification_token_by_credential_v2(
  uuid, text, text
) to anon;

revoke all on function public.revoke_notification_installation_by_credential_v2(
  uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.revoke_notification_installation_by_credential_v2(
  uuid, text
) to anon;

comment on function public.create_my_native_notification_enrollment_ticket_v2(
  text, uuid, text, text
) is
  'Creates a five-minute, single-use ticket binding an authenticated web session to one native installation handshake.';
comment on function public.redeem_native_notification_enrollment_ticket_v2(
  text, text, uuid, text, text, text, text, text, text, text, integer, text
) is
  'Redeems one opaque enrollment ticket to atomically register a native notification installation and provider token without a second user session.';
comment on function public.set_notification_installation_foreground_by_credential_v2(
  uuid, text, timestamptz
) is
  'Refreshes one native installation foreground lease using its revocable installation-scoped credential.';
comment on function public.register_native_notification_token_by_credential_v2(
  uuid, text, text
) is
  'Rotates one native provider token using its revocable installation-scoped credential.';
comment on function public.revoke_notification_installation_by_credential_v2(
  uuid, text
) is
  'Revokes one native installation, provider token, and installation-scoped credential.';

commit;
