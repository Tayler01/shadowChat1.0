-- Forward-only lint alignment for the already-applied settlement function.
-- The selected installation id is a non-null primary key, so checking it has
-- the same behavior as FOUND after the preceding SELECT INTO, while reading
-- the variable explicitly for plpgsql_check. Signatures/grants stay unchanged.
begin;

create or replace function public.settle_native_notification_enrollment_attempt_v1(
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
  if matching_active_installation is not null and not public.revoke_notification_installation_with_proof_v1(
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

commit;
