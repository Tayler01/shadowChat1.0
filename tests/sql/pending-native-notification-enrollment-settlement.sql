-- Isolated demo/local target only. No runtime/dispatch changes; all rows roll back.
begin;
set local session_replication_role = replica;
insert into public.users(id, username, display_name) values
 ('95000000-0000-4000-8000-000000000097','native_pending_fixture','Native Pending Fixture');
set local session_replication_role = origin;
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000097',true);
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000097","role":"authenticated"}',true);
do $$
declare
  fixture_user constant uuid := '95000000-0000-4000-8000-000000000097';
  device_key constant uuid := '95000000-0000-4000-8000-000000000098';
  verifier constant text := repeat('a',64);
  pending_credential constant text := repeat('b',64);
  prior_credential constant text := repeat('d',64);
  ticket text;
  pending_ticket text;
  signature constant text := 'public.settle_native_notification_enrollment_attempt_v1(uuid,uuid,text,text,text,text)';
begin
  if not has_function_privilege('anon',signature,'execute')
    or has_function_privilege('authenticated',signature,'execute')
    or has_function_privilege('service_role',signature,'execute')
    or exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
      where p.oid=signature::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')
  then raise exception 'Pending settlement ACL mismatch'; end if;
  ticket := public.create_my_native_notification_enrollment_ticket_v2(
    'native-pending-fixture-v1',device_key,encode(extensions.digest(verifier,'sha256'),'hex'),
    encode(extensions.digest(prior_credential,'sha256'),'hex')) ->> 'ticket';
  perform public.redeem_scoped_native_notification_enrollment_ticket_v2(
    ticket,'native-pending-fixture-v1',device_key,verifier,prior_credential,'ios',1,
    '1.0.0','22','en-US','UTC',2,'ExponentPushToken[pending-demo-rollback-fixture]');
  pending_ticket := public.create_my_native_notification_enrollment_ticket_v2(
    'native-pending-fixture-v1',device_key,encode(extensions.digest(verifier,'sha256'),'hex'),
    encode(extensions.digest(pending_credential,'sha256'),'hex')) ->> 'ticket';
  if public.settle_native_notification_enrollment_attempt_v1(fixture_user,device_key,pending_ticket,
    'wrong-pending-request-v1',verifier,pending_credential)
  then raise exception 'Known pending binding mismatch accepted'; end if;
  if not public.settle_native_notification_enrollment_attempt_v1(fixture_user,device_key,pending_ticket,
    'native-pending-fixture-v1',verifier,pending_credential)
  then raise exception 'Never-committed attempt not settled'; end if;
  if not public.settle_native_notification_enrollment_attempt_v1(fixture_user,device_key,pending_ticket,
    'native-pending-fixture-v1',verifier,pending_credential)
  then raise exception 'Settlement retry failed'; end if;
  begin
    perform public.redeem_scoped_native_notification_enrollment_ticket_v2(
      pending_ticket,'native-pending-fixture-v1',device_key,verifier,pending_credential,'ios',1,
      '1.0.0','22','en-US','UTC',2,'ExponentPushToken[pending-demo-rollback-fixture]');
    raise exception 'Late cancelled redemption committed';
  exception when others then
    if sqlerrm <> 'Invalid or expired notification enrollment ticket' then raise; end if;
  end;
  if not exists(select 1 from public.notification_installations i
    where i.user_id=fixture_user and i.installation_key=device_key and i.revoked_at is null)
  then raise exception 'Pending cancellation touched previous valid credential'; end if;
  if not public.revoke_notification_installation_with_proof_v1(fixture_user,device_key,prior_credential)
  then raise exception 'Previous valid credential not independently revoked'; end if;

  pending_ticket := public.create_my_native_notification_enrollment_ticket_v2(
    'native-pending-fixture-v1',device_key,encode(extensions.digest(verifier,'sha256'),'hex'),
    encode(extensions.digest(pending_credential,'sha256'),'hex')) ->> 'ticket';
  perform public.redeem_scoped_native_notification_enrollment_ticket_v2(
    pending_ticket,'native-pending-fixture-v1',device_key,verifier,pending_credential,'ios',1,
    '1.0.0','22','en-US','UTC',2,'ExponentPushToken[pending-demo-rollback-fixture]');
  if not public.settle_native_notification_enrollment_attempt_v1(fixture_user,device_key,pending_ticket,
    'native-pending-fixture-v1',verifier,pending_credential)
  then raise exception 'Committed pending attempt not settled'; end if;
  if not public.revoke_notification_installation_with_proof_v1(fixture_user,device_key,pending_credential)
  then raise exception 'Committed exact pending credential was not revoked'; end if;

  pending_ticket := public.create_my_native_notification_enrollment_ticket_v2(
    'native-pending-fixture-v1',device_key,encode(extensions.digest(verifier,'sha256'),'hex'),
    encode(extensions.digest(pending_credential,'sha256'),'hex')) ->> 'ticket';
  ticket := public.create_my_native_notification_enrollment_ticket_v2(
    'native-pending-fixture-v1',device_key,encode(extensions.digest(verifier,'sha256'),'hex'),
    encode(extensions.digest(prior_credential,'sha256'),'hex')) ->> 'ticket';
  if not public.settle_native_notification_enrollment_attempt_v1(fixture_user,device_key,pending_ticket,
    'native-pending-fixture-v1',verifier,pending_credential)
  then raise exception 'Rotated old pending attempt not settled'; end if;
  perform public.redeem_scoped_native_notification_enrollment_ticket_v2(
    ticket,'native-pending-fixture-v1',device_key,verifier,prior_credential,'ios',1,
    '1.0.0','22','en-US','UTC',2,'ExponentPushToken[pending-demo-rollback-fixture]');
  delete from private.notification_native_enrollment_tickets t where t.user_id=fixture_user;
  if not public.settle_native_notification_enrollment_attempt_v1(fixture_user,device_key,pending_ticket,
    'native-pending-fixture-v1',verifier,pending_credential)
  then raise exception 'Pruned old pending attempt not settled'; end if;
  if not exists(select 1 from public.notification_installations i
    where i.user_id=fixture_user and i.installation_key=device_key and i.revoked_at is null)
  then raise exception 'Old pending settlement touched a replacement generation'; end if;
end;
$$;
select 'PASS: pending attempt cancellation, late redemption rejection, previous credential preservation, committed attempt revoke, rotated/pruned ticket safety and anon-only ACL' as pending_settlement_proof;
rollback;
