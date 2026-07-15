-- Preserve the activation row lock while avoiding an unused PL/pgSQL record.

create or replace function public.claim_presence_activation_recipients(
  target_activation_id uuid,
  target_actor_id uuid
)
returns table (
  recipient_id uuid,
  event_id uuid,
  push_enabled boolean,
  in_app_enabled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile jsonb;
  recipient record;
  claimed_recipient_id uuid;
  inserted_event_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  perform 1
  from public.presence_activation_events activation
  where activation.id = target_activation_id
    and activation.actor_id = target_actor_id
    and activation.dispatched_at is null
    and activation.expires_at > now()
  for update;

  if not found then
    return;
  end if;

  if not exists (
    select 1
    from public.users users
    where users.id = target_actor_id
      and users.presence_visibility = 'tracked'
  ) then
    update public.presence_activation_events
    set dispatched_at = now()
    where id = target_activation_id;
    return;
  end if;

  select public.user_public_profile_json(users)
  into actor_profile
  from public.users users
  where users.id = target_actor_id;

  if actor_profile is null then
    return;
  end if;

  for recipient in
    select
      preferences.user_id,
      preferences.presence_push_enabled,
      preferences.presence_in_app_enabled
    from public.notification_preferences preferences
    where preferences.user_id <> target_actor_id
      and (preferences.presence_push_enabled or preferences.presence_in_app_enabled)
      and not private.users_have_block(preferences.user_id, target_actor_id)
      and (
        preferences.presence_notification_scope = 'all'
        or private.users_are_connected(preferences.user_id, target_actor_id)
      )
  loop
    claimed_recipient_id := null;
    insert into public.presence_notification_cooldowns (
      recipient_id,
      actor_id,
      last_notified_at
    ) values (
      recipient.user_id,
      target_actor_id,
      now()
    )
    on conflict on constraint presence_notification_cooldowns_pkey do update
      set last_notified_at = excluded.last_notified_at
      where public.presence_notification_cooldowns.last_notified_at
        <= excluded.last_notified_at - interval '1 hour'
    returning public.presence_notification_cooldowns.recipient_id
      into claimed_recipient_id;

    if claimed_recipient_id is null then
      continue;
    end if;

    insert into public.notification_events (
      user_id,
      type,
      entity_id,
      payload,
      dedupe_key
    ) values (
      recipient.user_id,
      'presence_active',
      target_activation_id,
      jsonb_build_object(
        'activation_id', target_activation_id,
        'actor_id', target_actor_id,
        'actor', actor_profile,
        'notify_push', recipient.presence_push_enabled,
        'notify_in_app', recipient.presence_in_app_enabled,
        'url', '/?view=active-users'
      ),
      'presence_active:' || target_activation_id::text || ':' || recipient.user_id::text
    )
    on conflict (dedupe_key) do update
      set payload = excluded.payload
    returning id into inserted_event_id;

    recipient_id := recipient.user_id;
    event_id := inserted_event_id;
    push_enabled := recipient.presence_push_enabled;
    in_app_enabled := recipient.presence_in_app_enabled;
    return next;
  end loop;
end;
$$;

revoke all on function public.claim_presence_activation_recipients(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_presence_activation_recipients(uuid, uuid)
  to service_role;
