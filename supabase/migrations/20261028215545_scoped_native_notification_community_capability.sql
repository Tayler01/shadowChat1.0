-- Explicit, opt-in transport capability; build numbers alone do not identify
-- the streamlined edition. Existing installations and enrollment remain legacy.
begin;

alter table public.notification_installations
  add column community_scope_version smallint
  check (community_scope_version is null or community_scope_version = 1);

-- Every enrollment writes registration metadata, even if values are unchanged.
-- A legacy re-enrollment must never inherit a previous scoped build's opt-in.
create function private.reset_notification_community_scope_on_registration_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.community_scope_version := null;
  return new;
end;
$$;
revoke all on function private.reset_notification_community_scope_on_registration_v1()
  from public, anon, authenticated, service_role;

create trigger reset_notification_community_scope_on_registration_v1
before insert or update of app_id, project_id, platform, environment,
  app_version, build_number, channel_schema_version
on public.notification_installations
for each row execute function private.reset_notification_community_scope_on_registration_v1();

-- A distinct RPC avoids ambiguous PostgREST overload resolution. Reuse the
-- canonical single-use ticket/verifier/credential binding in one transaction.
create function public.redeem_scoped_native_notification_enrollment_ticket_v2(
  target_ticket text,
  target_request_id text,
  target_installation_key uuid,
  target_verifier text,
  target_installation_credential text,
  target_platform text,
  target_community_scope_version integer,
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
  enrollment jsonb;
  updated_count integer;
begin
  if target_community_scope_version is distinct from 1
    or target_build_number is null
    or target_build_number !~ '^[1-9][0-9]{0,8}$'
  then
    raise exception 'Unsupported notification community scope capability';
  end if;
  if target_build_number::integer < 22 then
    raise exception 'Unsupported notification community scope build';
  end if;

  enrollment := public.redeem_native_notification_enrollment_ticket_v2(
    target_ticket, target_request_id, target_installation_key, target_verifier,
    target_installation_credential, target_platform, target_app_version,
    target_build_number, target_locale, target_time_zone,
    target_channel_schema_version, target_token
  );

  update public.notification_installations
  set community_scope_version = 1
  where id = (enrollment ->> 'installation_id')::uuid
    and user_id = (enrollment ->> 'user_id')::uuid
    and installation_key = target_installation_key
    and platform = target_platform
    and build_number = target_build_number
    and revoked_at is null;
  get diagnostics updated_count = row_count;
  if enrollment ->> 'enabled' is distinct from 'true' or updated_count <> 1 then
    -- The exception rolls back ticket consumption, token and credential writes.
    raise exception 'Scoped notification enrollment could not be bound';
  end if;
  return enrollment || pg_catalog.jsonb_build_object('community_scope_version', 1);
end;
$$;

revoke all on function public.redeem_scoped_native_notification_enrollment_ticket_v2(
  text, text, uuid, text, text, text, integer, text, text, text, text, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.redeem_scoped_native_notification_enrollment_ticket_v2(
  text, text, uuid, text, text, text, integer, text, text, text, text, integer, text
) to anon;

comment on column public.notification_installations.community_scope_version is
  'Native transport capability explicitly enrolled by scoped RPC; NULL preserves legacy delivery. Not authorization or an app edition inferred from build_number.';
commit;
