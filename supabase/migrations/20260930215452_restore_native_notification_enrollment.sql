-- Restore the native enrollment/lifecycle boundary removed during the August
-- notification-worker containment. Ticket minting derives its owner from
-- auth.uid(); redemption binds a five-minute single-use ticket to the native
-- verifier, installation key and device credential hash. Credential operations
-- resolve only that live installation. No worker or delivery gate is changed.
begin;

revoke all on function public.create_my_native_notification_enrollment_ticket_v2(
  text, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_my_native_notification_enrollment_ticket_v2(
  text, uuid, text, text
) to authenticated;

revoke all on function public.redeem_native_notification_enrollment_ticket_v2(
  text, text, uuid, text, text, text, text, text, text, text, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.redeem_native_notification_enrollment_ticket_v2(
  text, text, uuid, text, text, text, text, text, text, text, integer, text
) to anon;

revoke all on function public.register_native_notification_token_by_credential_v2(
  uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.register_native_notification_token_by_credential_v2(
  uuid, text, text
) to anon;

revoke all on function public.set_notification_installation_foreground_by_credential_v2(
  uuid, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.set_notification_installation_foreground_by_credential_v2(
  uuid, text, timestamptz
) to anon;

revoke all on function public.revoke_notification_installation_by_credential_v2(
  uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.revoke_notification_installation_by_credential_v2(
  uuid, text
) to anon;

-- The legacy session-based token registration endpoint remains revoked. Keep
-- private table/helper grants, runtime config, outbox, cron and pg_net untouched.
commit;
