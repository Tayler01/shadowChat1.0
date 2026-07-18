/*
  # Notification backlog baseline

  Establishes one clean production baseline for the rebuilt notification
  coordinator. Source content and canonical DM, General Chat, ShadowPin, game,
  and Live read state remain untouched.

  "Today" is fixed to July 18, 2026 in America/New_York so this historical data
  migration remains deterministic when replayed later.
*/

begin;

with updated_notifications as (
  update public.notification_events events
  set
    read_at = coalesce(events.read_at, now()),
    presented_at = coalesce(events.presented_at, now())
  where events.read_at is null
    and events.resolved_at is null
    and events.created_at < timestamptz '2026-07-18 00:00:00 America/New_York'
  returning events.user_id, events.type, events.entity_id
)
update public.activity_events events
set read_at = coalesce(events.read_at, now())
where events.read_at is null
  and exists (
    select 1
    from updated_notifications notifications
    where notifications.user_id = events.user_id
      and notifications.type = events.type
      and notifications.entity_id = events.entity_id
  );

commit;
