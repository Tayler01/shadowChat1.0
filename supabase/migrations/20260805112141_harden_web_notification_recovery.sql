/*
  # Harden production Web Push recovery

  Keeps canonical notification events, unread counts, and foreground
  presentation independent from background provider delivery. The old pg_net
  recovery/collector loops stay paused; a bounded production scheduler calls
  send-push with a dedicated shared secret instead.
*/

begin;

do $pause_notification_cron$
declare
  target_job_id bigint;
begin
  for target_job_id in
    select jobs.jobid
    from cron.job jobs
    where jobs.jobname in (
      'notification-delivery-recovery',
      'shadowchat-notification-v2-delivery-recovery',
      'shadowchat-notification-v2-receipts',
      'shadowchat-notification-v2-worker-response-collector'
    )
  loop
    perform cron.alter_job(job_id := target_job_id, active := false);
  end loop;
end
$pause_notification_cron$;

update public.notification_v2_runtime_config runtime
set
  delivery_mode = 'disabled',
  enabled_categories = '{}'::text[],
  canary_user_ids = '{}'::uuid[],
  all_users_enabled = false,
  worker_invocation_enabled = false,
  receipt_reconciliation_enabled = false,
  worker_url = null,
  worker_probe_url = null,
  last_worker_error = 'Native/TestFlight delivery remains paused; production Web Push uses bounded recovery',
  updated_at = now()
where runtime.singleton = true;

create index if not exists notification_delivery_jobs_expiry_idx
  on public.notification_delivery_jobs (expires_at, id)
  where status in ('pending', 'processing');

create index if not exists notification_delivery_jobs_stale_processing_idx
  on public.notification_delivery_jobs (last_attempt_at, id)
  where status = 'processing' and attempt_count < 3;

create index if not exists notification_delivery_jobs_user_idx
  on public.notification_delivery_jobs (user_id, created_at desc);

create index if not exists notification_delivery_attempts_subscription_idx
  on public.notification_delivery_attempts (subscription_id, attempted_at desc)
  where subscription_id is not null;

create index if not exists notification_delivery_attempts_delivered_pair_idx
  on public.notification_delivery_attempts (notification_event_id, subscription_id)
  where delivered = true and subscription_id is not null;

create index if not exists notification_events_user_unread_type_idx
  on public.notification_events (user_id, type, created_at desc, id desc)
  where read_at is null and resolved_at is null;

revoke all on table public.notification_delivery_jobs from service_role;
revoke all on table public.notification_delivery_attempts from service_role;
grant select, insert, update, delete on table public.notification_delivery_jobs
  to service_role;
grant select, insert, update, delete on table public.notification_delivery_attempts
  to service_role;

create table if not exists private.notification_delivery_recovery_runtime (
  singleton boolean primary key default true check (singleton),
  lease_until timestamptz not null default '-infinity'::timestamptz,
  updated_at timestamptz not null default now()
);

insert into private.notification_delivery_recovery_runtime (singleton)
values (true)
on conflict (singleton) do nothing;

revoke all on table private.notification_delivery_recovery_runtime
  from public, anon, authenticated, service_role;

create or replace function private.sync_notification_delivery_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_queue boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.type in (
      'dm_message',
      'group_message',
      'mention',
      'reply',
      'reaction',
      'hype_event',
      'shadow_pin_post',
      'shadow_pin_comment',
      'shadow_pin_reply',
      'connection_request',
      'connection_accepted',
      'presence_active',
      'shadow_checkers_turn'
    )
      and new.sent_at is null
      and new.read_at is null
      and new.resolved_at is null then
      select
        exists (
          select 1
          from public.notification_preferences preferences
          where preferences.user_id = new.user_id
            and preferences.notifications_enabled
            and case
              when new.type = 'dm_message' then preferences.dm_enabled
              when new.type = 'group_message' then
                preferences.group_enabled and not preferences.general_chat_muted
              when new.type = 'mention' then
                preferences.mention_enabled and not preferences.general_chat_muted
              when new.type = 'reply' then
                preferences.reply_enabled and not preferences.general_chat_muted
              when new.type = 'reaction' then preferences.reaction_enabled
              when new.type = 'hype_event' then
                preferences.hype_enabled and not preferences.general_chat_muted
              when new.type = 'shadow_pin_post' then preferences.shadow_pin_new_post_enabled
              when new.type = 'shadow_pin_comment' then preferences.shadow_pin_comment_enabled
              when new.type = 'shadow_pin_reply' then preferences.shadow_pin_reply_enabled
              when new.type in ('connection_request', 'connection_accepted') then
                preferences.connection_notifications_enabled
              when new.type = 'presence_active' then preferences.presence_push_enabled
              when new.type = 'shadow_checkers_turn' then preferences.checkers_turn_enabled
              else false
            end
        )
        and exists (
          select 1
          from public.push_subscriptions subscriptions
          where subscriptions.user_id = new.user_id
            and subscriptions.enabled
            and (
              subscriptions.foreground_until is null
              or subscriptions.foreground_until <= now()
            )
        )
      into should_queue;

      if should_queue then
        insert into public.notification_delivery_jobs (
          notification_event_id,
          user_id,
          available_at,
          expires_at
        ) values (
          new.id,
          new.user_id,
          now() + interval '20 seconds',
          greatest(new.presentation_expires_at, new.created_at + interval '5 minutes')
        )
        on conflict (notification_event_id) do nothing;
      end if;
    end if;
    return new;
  end if;

  update public.notification_delivery_jobs jobs
  set
    status = case
      when new.sent_at is not null then 'delivered'
      when new.read_at is not null or new.resolved_at is not null then 'cancelled'
      else jobs.status
    end,
    completed_at = case
      when new.sent_at is not null or new.read_at is not null or new.resolved_at is not null
        then coalesce(jobs.completed_at, now())
      else jobs.completed_at
    end,
    updated_at = now()
  where jobs.notification_event_id = new.id
    and jobs.status in ('pending', 'processing', 'failed');

  return new;
end;
$$;

revoke all on function private.sync_notification_delivery_job()
  from public, anon, authenticated, service_role;

drop function public.claim_notification_delivery_jobs(integer);

create or replace function public.claim_notification_delivery_jobs(
  batch_size integer default 5
)
returns table (
  job_id uuid,
  notification_event_id uuid,
  user_id uuid,
  event_type text,
  entity_id uuid,
  actor_id uuid,
  route text,
  payload jsonb,
  expires_at timestamptz,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lease_acquired_until timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if batch_size < 1 or batch_size > 10 then
    raise exception 'Batch size must be between 1 and 10';
  end if;

  insert into private.notification_delivery_recovery_runtime (
    singleton,
    lease_until,
    updated_at
  ) values (
    true,
    now() + interval '45 seconds',
    now()
  )
  on conflict (singleton) do update
  set
    lease_until = excluded.lease_until,
    updated_at = excluded.updated_at
  where private.notification_delivery_recovery_runtime.lease_until <= now()
  returning lease_until into lease_acquired_until;

  if lease_acquired_until is null then
    return;
  end if;

  with expired as (
    select jobs.id
    from public.notification_delivery_jobs jobs
    where jobs.status in ('pending', 'processing')
      and jobs.expires_at <= now()
      and (
        jobs.status = 'pending'
        or jobs.last_attempt_at < now() - interval '45 seconds'
      )
    order by jobs.expires_at, jobs.id
    for update skip locked
    limit 200
  )
  update public.notification_delivery_jobs jobs
  set
    status = 'cancelled',
    completed_at = coalesce(jobs.completed_at, now()),
    last_error = 'Notification delivery window expired',
    updated_at = now()
  from expired
  where jobs.id = expired.id;

  with exhausted as (
    select jobs.id
    from public.notification_delivery_jobs jobs
    where jobs.attempt_count >= 3
      and (
        jobs.status = 'pending'
        or (
          jobs.status = 'processing'
          and jobs.last_attempt_at < now() - interval '45 seconds'
        )
      )
    order by jobs.last_attempt_at nulls first, jobs.id
    for update skip locked
    limit 200
  )
  update public.notification_delivery_jobs jobs
  set
    status = 'failed',
    completed_at = coalesce(jobs.completed_at, now()),
    last_error = coalesce(jobs.last_error, 'Notification delivery attempt limit reached'),
    updated_at = now()
  from exhausted
  where jobs.id = exhausted.id;

  with stale as (
    select jobs.id
    from public.notification_delivery_jobs jobs
    where jobs.status = 'processing'
      and jobs.attempt_count < 3
      and jobs.expires_at > now()
      and jobs.last_attempt_at < now() - interval '45 seconds'
    order by jobs.last_attempt_at, jobs.id
    for update skip locked
    limit 200
  )
  update public.notification_delivery_jobs jobs
  set
    status = 'pending',
    available_at = now(),
    updated_at = now()
  from stale
  where jobs.id = stale.id;

  return query
  with candidates as (
    select jobs.id
    from public.notification_delivery_jobs jobs
    join public.notification_events events
      on events.id = jobs.notification_event_id
    where jobs.status = 'pending'
      and jobs.attempt_count < 3
      and jobs.available_at <= now()
      and jobs.expires_at > now()
      and events.sent_at is null
      and events.read_at is null
      and events.resolved_at is null
    order by jobs.available_at, jobs.created_at
    for update of jobs skip locked
    limit batch_size
  ),
  claimed as (
    update public.notification_delivery_jobs jobs
    set
      status = 'processing',
      attempt_count = jobs.attempt_count + 1,
      last_attempt_at = now(),
      last_error = null,
      updated_at = now()
    from candidates
    where jobs.id = candidates.id
    returning jobs.*
  )
  select
    claimed.id,
    events.id,
    events.user_id,
    events.type,
    events.entity_id,
    events.actor_id,
    events.route,
    events.payload,
    claimed.expires_at,
    claimed.attempt_count
  from claimed
  join public.notification_events events
    on events.id = claimed.notification_event_id;
end;
$$;

revoke all on function public.claim_notification_delivery_jobs(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_delivery_jobs(integer)
  to service_role;

update public.notification_delivery_jobs jobs
set
  status = 'cancelled',
  completed_at = coalesce(jobs.completed_at, now()),
  last_error = 'Expired before bounded Web Push recovery activation',
  updated_at = now()
where jobs.status in ('pending', 'processing')
  and jobs.expires_at <= now();

-- TestFlight/native-only enrollment and token surfaces remain paused. The
-- shared web installation/presentation RPCs intentionally stay available.
revoke all on function public.register_my_native_notification_token_v2(
  uuid, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.create_my_native_notification_enrollment_ticket_v2(
  text, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.redeem_native_notification_enrollment_ticket_v2(
  text, text, uuid, text, text, text, text, text, text, text, integer, text
) from public, anon, authenticated, service_role;
revoke all on function public.set_notification_installation_foreground_by_credential_v2(
  uuid, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.register_native_notification_token_by_credential_v2(
  uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.revoke_notification_installation_by_credential_v2(
  uuid, text
) from public, anon, authenticated, service_role;

create or replace function public.get_app_badge_state(
  target_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_role text := auth.role();
  preferences public.notification_preferences%rowtype;
  read_cursor public.user_read_cursors%rowtype;
  blocked_user_ids uuid[] := '{}'::uuid[];
  dm_count integer := 0;
  group_count integer := 0;
  interaction_count integer := 0;
  connection_count integer := 0;
  shadow_pin_count integer := 0;
begin
  if target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if caller_role is distinct from 'service_role'
    and (caller_user_id is null or target_user_id is distinct from caller_user_id) then
    raise exception 'Users may only count their own unread items';
  end if;

  select notification_preferences.*
  into preferences
  from public.notification_preferences
  where user_id = target_user_id;

  if not found then
    return jsonb_build_object(
      'total', 0,
      'dm', 0,
      'group', 0,
      'interactions', 0,
      'connections', 0,
      'shadow_pin', 0
    );
  end if;

  select coalesce(array_agg(blocked.user_id), '{}'::uuid[])
  into blocked_user_ids
  from (
    select blocks.blocked_id as user_id
    from public.user_blocks blocks
    where blocks.blocker_id = target_user_id
    union
    select blocks.blocker_id as user_id
    from public.user_blocks blocks
    where blocks.blocked_id = target_user_id
  ) blocked;

  if preferences.badge_dm_enabled then
    select count(*)::integer
    into dm_count
    from public.dm_messages messages
    join public.dm_conversations conversations
      on conversations.id = messages.conversation_id
    where target_user_id = any(conversations.participants)
      and messages.sender_id <> target_user_id
      and not (messages.sender_id = any(blocked_user_ids))
      and (messages.read_by is null or not (target_user_id = any(messages.read_by)));
  end if;

  if preferences.badge_group_enabled
    and preferences.group_enabled
    and not preferences.general_chat_muted then
    select cursors.*
    into read_cursor
    from public.user_read_cursors cursors
    where cursors.user_id = target_user_id
      and cursors.surface = 'general_chat'
      and cursors.scope_id = 'main';

    if found then
      select count(*)::integer
      into group_count
      from public.messages messages
      where messages.user_id <> target_user_id
        and not (messages.user_id = any(blocked_user_ids))
        and not exists (
          select 1
          from public.general_chat_thread_replies mapping
          where mapping.message_id = messages.id
        )
        and (
          read_cursor.last_read_at is null
          or messages.created_at > read_cursor.last_read_at
          or (
            messages.created_at = read_cursor.last_read_at
            and (
              read_cursor.last_read_message_id is null
              or messages.id > read_cursor.last_read_message_id
            )
          )
        );
    end if;
  end if;

  if preferences.badge_interactions_enabled then
    select count(*)::integer
    into interaction_count
    from public.notification_events events
    where events.user_id = target_user_id
      and events.read_at is null
      and events.resolved_at is null
      and (
        (
          events.type in ('mention', 'reply')
          and (
            (events.type = 'mention' and preferences.mention_enabled)
            or (events.type = 'reply' and preferences.reply_enabled)
          )
          and not (
            group_count > 0
            and exists (
              select 1
              from public.messages event_message
              where event_message.id = events.message_id
                and not exists (
                  select 1
                  from public.general_chat_thread_replies event_mapping
                  where event_mapping.message_id = event_message.id
                )
                and (
                  read_cursor.last_read_at is null
                  or event_message.created_at > read_cursor.last_read_at
                  or (
                    event_message.created_at = read_cursor.last_read_at
                    and (
                      read_cursor.last_read_message_id is null
                      or event_message.id > read_cursor.last_read_message_id
                    )
                  )
                )
            )
          )
        )
        or (events.type = 'reaction' and preferences.reaction_enabled)
        or (events.type = 'hype_event' and preferences.hype_enabled)
      );
  end if;

  if preferences.badge_connections_enabled then
    select count(*)::integer
    into connection_count
    from public.notification_events events
    where events.user_id = target_user_id
      and events.read_at is null
      and events.resolved_at is null
      and events.type in ('connection_request', 'connection_accepted');
  end if;

  if preferences.badge_shadow_pin_enabled then
    select count(*)::integer
    into shadow_pin_count
    from public.notification_events events
    where events.user_id = target_user_id
      and events.read_at is null
      and events.resolved_at is null
      and (
        (events.type = 'shadow_pin_post' and preferences.shadow_pin_new_post_enabled)
        or (events.type = 'shadow_pin_comment' and preferences.shadow_pin_comment_enabled)
        or (events.type = 'shadow_pin_reply' and preferences.shadow_pin_reply_enabled)
      );
  end if;

  return jsonb_build_object(
    'total', dm_count + group_count + interaction_count + connection_count + shadow_pin_count,
    'dm', dm_count,
    'group', group_count,
    'interactions', interaction_count,
    'connections', connection_count,
    'shadow_pin', shadow_pin_count
  );
end;
$$;

revoke all on function public.get_app_badge_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_app_badge_state(uuid)
  to authenticated, service_role;

create or replace function public.get_app_badge_state_v2(
  target_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_role text := auth.role();
  base_state jsonb;
  preferences public.notification_preferences%rowtype;
  blocked_user_ids uuid[] := '{}'::uuid[];
  pin_destinations jsonb := '[]'::jsonb;
  game_destinations jsonb := '[]'::jsonb;
  pin_count integer := 0;
  games_count integer := 0;
  base_pin_count integer := 0;
  base_total integer := 0;
begin
  if target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if caller_role is distinct from 'service_role'
    and (caller_user_id is null or target_user_id is distinct from caller_user_id) then
    raise exception 'Users may only count their own unread items';
  end if;

  base_state := public.get_app_badge_state(target_user_id);

  select notification_preferences.*
  into preferences
  from public.notification_preferences
  where user_id = target_user_id;

  select coalesce(array_agg(blocked.user_id), '{}'::uuid[])
  into blocked_user_ids
  from (
    select blocks.blocked_id as user_id
    from public.user_blocks blocks
    where blocks.blocker_id = target_user_id
    union
    select blocks.blocker_id as user_id
    from public.user_blocks blocks
    where blocks.blocked_id = target_user_id
  ) blocked;

  if found and preferences.badge_shadow_pin_enabled then
    with pin_events as (
      select
        events.id,
        events.type,
        events.created_at,
        images.id as image_id,
        categories.id as category_id
      from public.notification_events events
      join public.shadow_pin_images images
        on images.id = case
          when events.type = 'shadow_pin_post' then events.entity_id
          when coalesce(events.payload ->> 'image_id', '') ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
            then (events.payload ->> 'image_id')::uuid
          else null
        end
       and images.deleted_at is null
      join public.shadow_pin_categories categories
        on categories.id = images.category_id
       and categories.deleted_at is null
      left join public.shadow_pin_comments comments
        on comments.id = events.entity_id
       and comments.image_id = images.id
      where events.user_id = target_user_id
        and events.read_at is null
        and events.resolved_at is null
        and events.type in (
          'shadow_pin_post',
          'shadow_pin_comment',
          'shadow_pin_reply'
        )
        and (
          (events.type = 'shadow_pin_post' and preferences.shadow_pin_new_post_enabled)
          or (
            events.type = 'shadow_pin_comment'
            and preferences.shadow_pin_comment_enabled
            and comments.id is not null
          )
          or (
            events.type = 'shadow_pin_reply'
            and preferences.shadow_pin_reply_enabled
            and comments.id is not null
          )
        )
        and (
          events.actor_id is null
          or not (events.actor_id = any(blocked_user_ids))
        )
    ),
    grouped as (
      select
        category_id,
        image_id,
        count(*)::integer as unread_count,
        count(*) filter (where type = 'shadow_pin_post')::integer as post_count,
        count(*) filter (
          where type in ('shadow_pin_comment', 'shadow_pin_reply')
        )::integer as discussion_count,
        coalesce(
          array_agg(id order by created_at, id)
            filter (where type = 'shadow_pin_post'),
          array[]::uuid[]
        ) as post_event_ids,
        coalesce(
          array_agg(id order by created_at, id)
            filter (where type in ('shadow_pin_comment', 'shadow_pin_reply')),
          array[]::uuid[]
        ) as discussion_event_ids,
        max(created_at) as latest_at
      from pin_events
      group by category_id, image_id
    )
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'category_id', grouped.category_id,
            'image_id', grouped.image_id,
            'unread_count', grouped.unread_count,
            'post_count', grouped.post_count,
            'discussion_count', grouped.discussion_count,
            'post_event_ids', grouped.post_event_ids,
            'discussion_event_ids', grouped.discussion_event_ids,
            'latest_at', grouped.latest_at
          )
          order by grouped.latest_at desc, grouped.image_id
        ),
        '[]'::jsonb
      ),
      coalesce(sum(grouped.unread_count), 0)::integer
    into pin_destinations, pin_count
    from grouped;
  end if;

  if found and preferences.badge_games_enabled then
    with checkers_destinations as (
      select
        'shadow-checkers'::text as experience,
        matches.id as item_id,
        count(*)::integer as unread_count,
        array_agg(events.id order by events.created_at, events.id) as event_ids,
        max(events.created_at) as latest_at
      from public.notification_events events
      join public.shadow_checkers_matches matches
        on matches.id = events.entity_id
       and matches.status = 'active'
       and matches.current_turn_user_id = target_user_id
      where events.user_id = target_user_id
        and events.type = 'shadow_checkers_turn'
        and events.read_at is null
        and events.resolved_at is null
        and preferences.checkers_turn_enabled
      group by matches.id
    ),
    live_destinations as (
      select
        'shado-live'::text as experience,
        rooms.id as item_id,
        count(*)::integer as unread_count,
        array_agg(events.id order by events.created_at, events.id) as event_ids,
        max(events.created_at) as latest_at
      from public.notification_events events
      join public.live_rooms rooms
        on rooms.id = case
          when coalesce(events.payload ->> 'room_id', '') ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
            then (events.payload ->> 'room_id')::uuid
          else null
        end
       and rooms.status not in ('ended', 'cancelled')
      where events.user_id = target_user_id
        and events.category = 'live'
        and events.read_at is null
        and events.resolved_at is null
        and preferences.shado_live_in_app_enabled
        and shado_live_private.can_access_shado_live_room(target_user_id, rooms.id)
      group by rooms.id
    ),
    grouped as (
      select * from checkers_destinations
      union all
      select * from live_destinations
    )
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'experience', grouped.experience,
            'item_id', grouped.item_id,
            'unread_count', grouped.unread_count,
            'event_ids', grouped.event_ids,
            'latest_at', grouped.latest_at
          )
          order by grouped.latest_at desc, grouped.experience, grouped.item_id
        ),
        '[]'::jsonb
      ),
      coalesce(sum(grouped.unread_count), 0)::integer
    into game_destinations, games_count
    from grouped;
  end if;

  base_total := coalesce((base_state ->> 'total')::integer, 0);
  base_pin_count := coalesce((base_state ->> 'shadow_pin')::integer, 0);

  return base_state || jsonb_build_object(
    'shadow_pin', pin_count,
    'shadow_pin_destinations', pin_destinations,
    'games', games_count,
    'game_destinations', game_destinations,
    'total', greatest(0, base_total - base_pin_count) + pin_count + games_count
  );
end;
$$;

revoke all on function public.get_app_badge_state_v2(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_app_badge_state_v2(uuid)
  to authenticated, service_role;

comment on function public.claim_notification_delivery_jobs(integer) is
  'Claims at most ten bounded Web Push recovery jobs under a singleton lease; failed jobs are terminal after three attempts.';
comment on function public.get_app_badge_state(uuid) is
  'Caller-owned launcher badge total using one reciprocal block-list lookup per request.';
comment on function public.get_app_badge_state_v2(uuid) is
  'Caller-owned launcher badge total and exact destination counts using one reciprocal block-list lookup per request.';

commit;
