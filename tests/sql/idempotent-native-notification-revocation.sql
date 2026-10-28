-- Isolated demo/local target only. All synthetic data and writes roll back.
begin;
set local session_replication_role = replica;
insert into public.users(id, username, display_name) values
 ('95000000-0000-4000-8000-000000000088','native_revoke_fixture','Native Revoke Fixture');
set local session_replication_role = origin;
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000088',true);
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000088","role":"authenticated"}',true);
do $$
declare
  fixture_user constant uuid := '95000000-0000-4000-8000-000000000088';
  device_key constant uuid := '95000000-0000-4000-8000-000000000089';
  verifier constant text := repeat('a',64);
  credential constant text := repeat('b',64);
  replacement constant text := repeat('d',64);
  ticket text;
  signature constant text := 'public.revoke_notification_installation_with_proof_v1(uuid,uuid,text)';
begin
  if not has_function_privilege('anon',signature,'execute')
    or has_function_privilege('authenticated',signature,'execute')
    or has_function_privilege('service_role',signature,'execute')
    or exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
      where p.oid=signature::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')
  then raise exception 'Revocation proof ACL mismatch'; end if;
  if public.revoke_notification_installation_with_proof_v1(fixture_user,device_key,credential)
  then raise exception 'Missing installation attested'; end if;

  ticket := public.create_my_native_notification_enrollment_ticket_v2(
    'native-revocation-fixture-v1',device_key,
    encode(extensions.digest(verifier,'sha256'),'hex'),
    encode(extensions.digest(credential,'sha256'),'hex')) ->> 'ticket';
  perform public.redeem_scoped_native_notification_enrollment_ticket_v2(
    ticket,'native-revocation-fixture-v1',device_key,verifier,credential,'ios',1,
    '1.0.0','22','en-US','UTC',2,'ExponentPushToken[revoke-demo-rollback-fixture]');
  if public.revoke_notification_installation_with_proof_v1(fixture_user,device_key,repeat('f',64))
  then raise exception 'Wrong credential attested'; end if;

  -- Lose a successful legacy response, then recover through the proof RPC.
  if not public.revoke_notification_installation_by_credential_v2(device_key,credential)
    or public.revoke_notification_installation_by_credential_v2(device_key,credential)
  then raise exception 'Legacy revocation behavior changed'; end if;
  if not public.revoke_notification_installation_with_proof_v1(fixture_user,device_key,credential)
    or not public.revoke_notification_installation_with_proof_v1(fixture_user,device_key,credential)
  then raise exception 'Lost-response retry could not prove exact historical revoke'; end if;
  if public.register_native_notification_token_by_credential_v2(device_key,credential,
    'ExponentPushToken[stale-revoke-demo-refresh]')
  then raise exception 'Stale credential re-enabled token'; end if;

  ticket := public.create_my_native_notification_enrollment_ticket_v2(
    'native-revocation-fixture-v1',device_key,
    encode(extensions.digest(verifier,'sha256'),'hex'),
    encode(extensions.digest(replacement,'sha256'),'hex')) ->> 'ticket';
  perform public.redeem_scoped_native_notification_enrollment_ticket_v2(
    ticket,'native-revocation-fixture-v1',device_key,verifier,replacement,'ios',1,
    '1.0.0','22','en-US','UTC',2,'ExponentPushToken[revoke-demo-rollback-fixture]');
  if public.revoke_notification_installation_with_proof_v1(fixture_user,device_key,credential)
    or not exists(select 1 from public.notification_installations i
      where i.installation_key=device_key and i.revoked_at is null)
  then raise exception 'Stale proof touched a replacement credential generation'; end if;
  if not public.revoke_notification_installation_with_proof_v1(fixture_user,device_key,replacement)
  then raise exception 'Replacement exact revoke failed'; end if;
  if exists(select 1 from public.notification_installations i
      join private.notification_native_tokens t on t.installation_id=i.id
      where i.installation_key=device_key and (t.enabled or t.disabled_at is null))
  then raise exception 'Replacement exact revoke failed'; end if;
end;
$$;
select 'PASS: anon-only ACL, missing/wrong credentials denied, legacy lost-response recovery, duplicate proof, stale refresh and replacement generation safety' as native_revocation_proof;
rollback;
