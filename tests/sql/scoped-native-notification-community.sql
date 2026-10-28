-- Explicit isolated demo/local target only. All synthetic rows roll back.
-- Do not run against production. Does not enable runtime, cron or dispatch.
begin;
set local session_replication_role = replica;
insert into public.users(id, username, display_name) values
 ('95000000-0000-4000-8000-000000000081','scoped_native_fixture','Scoped Native Fixture');
set local session_replication_role = origin;
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000081',true);
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000081","role":"authenticated"}',true);

do $$
declare
  fixture_user_id constant uuid := '95000000-0000-4000-8000-000000000081';
  device_key constant uuid := '95000000-0000-4000-8000-000000000082';
  verifier constant text := repeat('a',64);
  credential constant text := repeat('b',64);
  ticket text;
  enrollment jsonb;
  signature constant text := 'public.redeem_scoped_native_notification_enrollment_ticket_v2(text,text,uuid,text,text,text,integer,text,text,text,text,integer,text)';
begin
  if not has_function_privilege('anon',signature,'execute')
    or has_function_privilege('authenticated',signature,'execute')
    or has_function_privilege('service_role',signature,'execute')
    or exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
      where p.oid=signature::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')
  then raise exception 'Scoped RPC ACL mismatch'; end if;

  ticket := public.create_my_native_notification_enrollment_ticket_v2(
    'scoped-native-fixture-v1',device_key,
    encode(extensions.digest(verifier,'sha256'),'hex'),
    encode(extensions.digest(credential,'sha256'),'hex')) ->> 'ticket';
  begin
    perform public.redeem_scoped_native_notification_enrollment_ticket_v2(
      ticket,'scoped-native-fixture-v1',device_key,verifier,credential,'ios',1,
      '1.0.0','21','en-US','UTC',2,'ExponentPushToken[scoped-demo-rollback-fixture]');
    raise exception 'Build21 unexpectedly enrolled';
  exception when others then
    if sqlerrm <> 'Unsupported notification community scope build' then raise; end if;
  end;
  if exists(select 1 from private.notification_native_enrollment_tickets t
    where t.user_id=fixture_user_id and t.consumed_at is not null)
  then raise exception 'Rejected build consumed ticket'; end if;

  enrollment := public.redeem_scoped_native_notification_enrollment_ticket_v2(
    ticket,'scoped-native-fixture-v1',device_key,verifier,credential,'ios',1,
    '1.0.0','22','en-US','UTC',2,'ExponentPushToken[scoped-demo-rollback-fixture]');
  if enrollment ->> 'user_id' is distinct from fixture_user_id::text
    or enrollment ->> 'community_scope_version' is distinct from '1'
    or not exists(select 1 from public.notification_installations i
      where i.id=(enrollment->>'installation_id')::uuid and i.user_id=fixture_user_id
      and i.installation_key=device_key and i.community_scope_version=1
      and i.build_number='22' and i.app_version='1.0.0')
  then raise exception 'Scoped canonical binding failed'; end if;
  begin
    perform public.redeem_scoped_native_notification_enrollment_ticket_v2(
      ticket,'scoped-native-fixture-v1',device_key,verifier,credential,'ios',1,
      '1.0.0','22','en-US','UTC',2,'ExponentPushToken[scoped-demo-rollback-fixture]');
    raise exception 'Consumed ticket unexpectedly redeemed';
  exception when others then
    if sqlerrm <> 'Invalid or expired notification enrollment ticket' then raise; end if;
  end;

  perform public.set_notification_installation_foreground_by_credential_v2(device_key,credential,null);
  if not exists(select 1 from public.notification_installations i
    where i.installation_key=device_key and i.community_scope_version=1)
  then raise exception 'Credential refresh cleared capability'; end if;

  ticket := public.create_my_native_notification_enrollment_ticket_v2(
    'scoped-native-fixture-v1',device_key,
    encode(extensions.digest(verifier,'sha256'),'hex'),
    encode(extensions.digest(credential,'sha256'),'hex')) ->> 'ticket';
  perform public.redeem_native_notification_enrollment_ticket_v2(
    ticket,'scoped-native-fixture-v1',device_key,verifier,credential,'ios',
    '1.0.0','22','en-US','UTC',2,'ExponentPushToken[scoped-demo-rollback-fixture]');
  if not exists(select 1 from public.notification_installations i
    where i.installation_key=device_key and i.community_scope_version is null)
  then raise exception 'Legacy re-enrollment retained capability'; end if;
end;
$$;
select 'PASS: ACL, build21 rejection, canonical scoped binding, single use, credential refresh and legacy clearing' as scoped_enrollment_proof;
rollback;
