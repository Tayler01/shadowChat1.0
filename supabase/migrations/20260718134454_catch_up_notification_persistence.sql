/*
  # Catch-Up notification persistence

  Gives the recipient one explicit, server-owned way to clear the canonical
  notification inbox without changing DM, General Chat, or destination read
  cursors. Matching Activity projections are cleared in the same transaction.
*/

begin;

create or replace function public.mark_all_my_notification_events_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  changed_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.notification_events events
  set
    read_at = coalesce(events.read_at, now()),
    presented_at = coalesce(events.presented_at, now())
  where events.user_id = current_user_id
    and events.read_at is null
    and events.resolved_at is null;

  get diagnostics changed_count = row_count;

  update public.activity_events events
  set read_at = coalesce(events.read_at, now())
  where events.user_id = current_user_id
    and events.read_at is null
    and exists (
      select 1
      from public.notification_events notifications
      where notifications.user_id = current_user_id
        and notifications.type = events.type
        and notifications.entity_id = events.entity_id
        and notifications.read_at is not null
    );

  return changed_count;
end;
$$;

revoke all on function public.mark_all_my_notification_events_read()
  from public, anon, authenticated, service_role;
grant execute on function public.mark_all_my_notification_events_read()
  to authenticated;

comment on function public.mark_all_my_notification_events_read() is
  'Marks every unread, unresolved caller-owned notification and its matching Activity projection read.';

commit;
