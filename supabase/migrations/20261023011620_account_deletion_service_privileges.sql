-- The Live domain intentionally withheld direct service grants. The new
-- deletion routines remain SECURITY INVOKER and receive only their required
-- read/update/delete capabilities; browser roles gain no privileges.
begin;
grant select (id,host_user_id,provider_room_name,ended_at,revision,status)
  on public.live_rooms to service_role;
grant update (title,description,status,ended_at,host_disconnected_at,
  host_grace_expires_at,ended_reason,revision,updated_at)
  on public.live_rooms to service_role;
grant select (room_id,user_id) on public.live_room_participants to service_role;
grant select (actor_user_id,target_user_id) on public.live_room_events to service_role;
grant delete on public.live_room_events to service_role;
grant select (participant_user_id,participant_identity)
  on public.live_provider_webhook_receipts to service_role;
grant delete on public.live_provider_webhook_receipts to service_role;
grant select (actor_user_id,target_user_id,room_id)
  on public.live_provider_operations to service_role;
grant delete on public.live_provider_operations to service_role;
notify pgrst,'reload schema';
commit;
