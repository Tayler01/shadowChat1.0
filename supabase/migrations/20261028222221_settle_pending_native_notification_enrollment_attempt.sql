-- Additive exact-attempt cancellation. Previously applied267/268 stay unchanged.
begin;

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

  -- Same key-before-ticket order as pending-attempt settlement. A delayed
  -- redemption cannot commit after cancellation has confirmed settlement.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_installation_key::text, 0)
  );

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

create function public.settle_native_notification_enrollment_attempt_v1(
  target_user_id uuid,
  target_installation_key uuid,
  target_ticket text,
  target_request_id text,
  target_verifier text,
  target_credential text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket_id uuid;
  ticket_secret text;
  stored private.notification_native_enrollment_tickets%rowtype;
  matching_active_installation uuid;
begin
  if target_user_id is null or target_installation_key is null
    or target_ticket is null or octet_length(target_ticket) <> 101
    or split_part(target_ticket, '.', 3) <> ''
    or target_request_id is null or octet_length(target_request_id) not between 16 and 160
    or target_request_id !~ '^[A-Za-z0-9._:-]+$'
    or target_verifier is null or octet_length(target_verifier) <> 64 or target_verifier !~ '^[0-9a-f]{64}$'
    or target_credential is null or octet_length(target_credential) <> 64 or target_credential !~ '^[0-9a-f]{64}$'
  then return false; end if;
  begin
    ticket_id := split_part(target_ticket, '.', 1)::uuid;
  exception when invalid_text_representation then return false;
  end;
  ticket_secret := split_part(target_ticket, '.', 2);
  if ticket_secret !~ '^[0-9a-f]{64}$' then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_installation_key::text, 0)
  );
  select tickets.* into stored
  from private.notification_native_enrollment_tickets tickets
  where tickets.id = ticket_id
  for update;

  if found and stored.secret_hash = pg_catalog.encode(extensions.digest(ticket_secret, 'sha256'), 'hex') then
    -- Possession of a still-known ticket secret cannot bypass its exact request,
    -- verifier, installation, credential or canonical owner binding.
    if stored.user_id <> target_user_id
      or stored.installation_key <> target_installation_key
      or stored.request_id <> target_request_id
      or stored.challenge_hash <> pg_catalog.encode(extensions.digest(target_verifier, 'sha256'), 'hex')
      or stored.installation_credential_hash <> pg_catalog.encode(extensions.digest(target_credential, 'sha256'), 'hex')
    then return false; end if;
    update private.notification_native_enrollment_tickets
    set consumed_at = coalesce(consumed_at, now()), updated_at = now()
    where id = ticket_id;
  end if;
  -- A missing/pruned ticket or a rotated secret also cannot redeem this exact
  -- old attempt. That establishes cancellation only, never revocation of an
  -- unknown credential. Native must retain/revoke its previous valid credential
  -- separately using the exact-credential proof RPC.

  select installations.id into matching_active_installation
  from public.notification_installations installations
  join private.notification_installation_credentials credentials
    on credentials.installation_id = installations.id and credentials.user_id = installations.user_id
  where installations.user_id = target_user_id
    and installations.installation_key = target_installation_key
    and installations.platform in ('ios', 'android')
    and installations.revoked_at is null
    and credentials.credential_hash = pg_catalog.encode(extensions.digest(target_credential, 'sha256'), 'hex')
  for update of installations, credentials;
  if found and not public.revoke_notification_installation_with_proof_v1(
    target_user_id, target_installation_key, target_credential
  ) then
    raise exception 'Pending notification enrollment could not be settled';
  end if;

  -- Check after all writes: a skipped cancellation must not report success.
  if exists(select 1 from private.notification_native_enrollment_tickets tickets
    where tickets.id = ticket_id and tickets.consumed_at is null
      and tickets.secret_hash = pg_catalog.encode(extensions.digest(ticket_secret, 'sha256'), 'hex'))
  then raise exception 'Pending notification enrollment could not be settled'; end if;
  return true;
end;
$$;

revoke all on function public.settle_native_notification_enrollment_attempt_v1(uuid, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.settle_native_notification_enrollment_attempt_v1(uuid, uuid, text, text, text, text) to anon;
comment on function public.settle_native_notification_enrollment_attempt_v1(uuid, uuid, text, text, text, text) is
  'Settle only this pending ticket attempt so it cannot redeem later, and revoke an exact matching active new credential. Missing/replaced ticket does not attest any other installation or credential revocation.';
commit;

