/*
  # Repair Tayler Kid and Mills connection

  Their accepted connection was explicitly moved to inactive during the 2.0
  frontend transition. The canonical pair is preserved, neither user blocks
  the other, and the normal 24-hour cooldown prevents an immediate request
  retry. Restore only this exact pair and emit the normal non-push refresh
  events so both clients converge without creating a duplicate relationship.
*/

begin;

do $$
declare
  tayler_id constant uuid := '16353ac6-5830-47fb-a55f-1b1959205020';
  mills_id constant uuid := '766198ed-c9d1-46b5-9675-bf641ed6afb9';
  repaired_connection public.user_connections%rowtype;
begin
  if not exists (
    select 1
    from public.users profiles
    where profiles.id in (tayler_id, mills_id)
    having count(*) = 2
  ) then
    raise notice 'Tayler Kid and Mills connection repair skipped outside the production dataset';
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(tayler_id, mills_id)::text || ':' || greatest(tayler_id, mills_id)::text,
      0
    )
  );

  if private.users_have_block(tayler_id, mills_id) then
    raise exception 'Tayler Kid and Mills connection repair stopped because a personal block exists';
  end if;

  select connections.*
  into repaired_connection
  from public.user_connections connections
  where connections.member_low_id = least(tayler_id, mills_id)
    and connections.member_high_id = greatest(tayler_id, mills_id)
  for update;

  if not found then
    raise notice 'Tayler Kid and Mills connection repair skipped because the canonical pair does not exist';
    return;
  end if;

  if repaired_connection.status = 'accepted' then
    return;
  end if;

  if repaired_connection.status <> 'inactive' then
    raise exception
      'Tayler Kid and Mills connection repair found unexpected status: %',
      repaired_connection.status;
  end if;

  update public.user_connections connections
  set
    status = 'accepted',
    revision = connections.revision + 1,
    accepted_at = now(),
    ended_at = null,
    updated_at = now()
  where connections.id = repaired_connection.id
  returning connections.* into repaired_connection;

  update public.notification_events events
  set read_at = coalesce(events.read_at, now())
  where events.read_at is null
    and events.entity_id = repaired_connection.id
    and events.type in ('connection_request', 'connection_accepted', 'connection_changed');

  perform connections_private.emit_connection_notification(
    repaired_connection,
    tayler_id,
    mills_id,
    'connection_changed',
    'accepted'
  );

  perform connections_private.emit_connection_notification(
    repaired_connection,
    mills_id,
    tayler_id,
    'connection_changed',
    'accepted'
  );
end;
$$;

commit;
