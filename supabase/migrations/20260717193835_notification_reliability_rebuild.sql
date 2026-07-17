/*
  # Notification reliability rebuild

  Keeps the existing notification_events and send-push contracts compatible
  while separating foreground presentation from durable unread state. The
  migration also makes Checkers turns server-authored, exposes a complete badge
  breakdown, and closes read-through gaps that could leave ghost launcher
  badges.
*/

begin;

alter table public.notification_preferences
  add column if not exists checkers_turn_enabled boolean not null default true,
  add column if not exists badge_games_enabled boolean not null default true;

alter table public.notification_events
  add column if not exists category text,
  add column if not exists actor_id uuid references public.users(id) on delete set null,
  add column if not exists route text,
  add column if not exists presentation_expires_at timestamptz,
  add column if not exists presented_at timestamptz,
  add column if not exists resolved_at timestamptz;

update public.notification_events events
set
  category = case
    when events.type = 'dm_message' then 'dm'
    when events.type = 'group_message' then 'group'
    when events.type in ('mention', 'reply', 'reaction', 'hype_event') then 'interactions'
    when events.type in ('connection_request', 'connection_accepted') then 'connections'
    when events.type in ('shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply') then 'shadow_pin'
    when events.type = 'presence_active' then 'presence'
    when events.type like 'shado_live_%' then 'live'
    when events.type = 'shadow_checkers_turn' then 'games'
    else 'system'
  end,
  route = coalesce(
    nullif(events.route, ''),
    nullif(events.payload ->> 'route', ''),
    nullif(events.payload ->> 'url', '')
  ),
  actor_id = coalesce(
    events.actor_id,
    case
      when coalesce(events.payload #>> '{actor,id}', events.payload ->> 'sender_id') ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      then coalesce(events.payload #>> '{actor,id}', events.payload ->> 'sender_id')::uuid
      else null
    end
  ),
  presentation_expires_at = coalesce(
    events.presentation_expires_at,
    events.created_at + interval '90 seconds'
  )
where events.category is null
   or events.route is null
   or events.actor_id is null
   or events.presentation_expires_at is null;

alter table public.notification_events
  alter column category set default 'system',
  alter column category set not null,
  alter column presentation_expires_at set default (now() + interval '90 seconds'),
  alter column presentation_expires_at set not null;

alter table public.notification_events
  drop constraint if exists notification_events_category_check,
  add constraint notification_events_category_check check (
    category in (
      'dm',
      'group',
      'interactions',
      'connections',
      'shadow_pin',
      'presence',
      'live',
      'games',
      'system'
    )
  ),
  drop constraint if exists notification_events_route_length_check,
  add constraint notification_events_route_length_check check (
    route is null or char_length(route) between 1 and 2048
  ),
  drop constraint if exists notification_events_presentation_window_check,
  add constraint notification_events_presentation_window_check check (
    presentation_expires_at >= created_at
  );

create index if not exists notification_events_user_unread_category_idx
  on public.notification_events (user_id, category, created_at desc, id desc)
  where read_at is null and resolved_at is null;

create index if not exists notification_events_user_unpresented_idx
  on public.notification_events (user_id, presentation_expires_at, created_at desc)
  where presented_at is null and read_at is null and resolved_at is null;

-- Durable delivery work is recorded separately from the user-facing unread
-- ledger. The existing authenticated sender kick remains compatible while a
-- server worker/webhook can later claim these rows without changing event
-- producers again.
create table if not exists public.notification_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid not null unique
    references public.notification_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'delivered', 'cancelled', 'failed')),
  available_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at >= created_at)
);

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid not null
    references public.notification_events(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  response_status integer,
  delivered boolean not null default false,
  retryable boolean not null default false,
  error_message text,
  attempted_at timestamptz not null default now()
);

create index if not exists notification_delivery_jobs_pending_idx
  on public.notification_delivery_jobs (available_at, created_at)
  where status = 'pending';

create index if not exists notification_delivery_attempts_event_idx
  on public.notification_delivery_attempts (notification_event_id, attempted_at desc);

alter table public.notification_delivery_jobs enable row level security;
alter table public.notification_delivery_attempts enable row level security;

revoke all on table public.notification_delivery_jobs
  from public, anon, authenticated;
revoke all on table public.notification_delivery_attempts
  from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_delivery_jobs
  to service_role;
grant select, insert, update, delete on table public.notification_delivery_attempts
  to service_role;

create or replace function private.sync_notification_delivery_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
      and new.resolved_at is null
      and new.presentation_expires_at > now() then
      insert into public.notification_delivery_jobs (
        notification_event_id,
        user_id,
        expires_at
      ) values (
        new.id,
        new.user_id,
        new.presentation_expires_at
      )
      on conflict (notification_event_id) do nothing;
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

drop trigger if exists sync_notification_delivery_job_insert
  on public.notification_events;
drop trigger if exists sync_notification_delivery_job_update
  on public.notification_events;
create trigger sync_notification_delivery_job_insert
  after insert on public.notification_events
  for each row execute function private.sync_notification_delivery_job();
create trigger sync_notification_delivery_job_update
  after update of sent_at, read_at, resolved_at on public.notification_events
  for each row
  when (
    old.sent_at is distinct from new.sent_at
    or old.read_at is distinct from new.read_at
    or old.resolved_at is distinct from new.resolved_at
  )
  execute function private.sync_notification_delivery_job();

revoke all on function private.sync_notification_delivery_job()
  from public, anon, authenticated;

insert into public.notification_delivery_jobs (
  notification_event_id,
  user_id,
  expires_at
)
select
  events.id,
  events.user_id,
  events.presentation_expires_at
from public.notification_events events
where events.type in (
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
  and events.sent_at is null
  and events.read_at is null
  and events.resolved_at is null
  and events.presentation_expires_at > now()
on conflict (notification_event_id) do nothing;

create or replace function public.claim_notification_delivery_jobs(
  batch_size integer default 20
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
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if batch_size < 1 or batch_size > 50 then
    raise exception 'Batch size must be between 1 and 50';
  end if;

  update public.notification_delivery_jobs jobs
  set
    status = 'cancelled',
    completed_at = coalesce(jobs.completed_at, now()),
    updated_at = now()
  where jobs.status in ('pending', 'processing', 'failed')
    and jobs.expires_at <= now();

  return query
  with candidates as (
    select jobs.id
    from public.notification_delivery_jobs jobs
    join public.notification_events events
      on events.id = jobs.notification_event_id
    where jobs.expires_at > now()
      and events.sent_at is null
      and events.read_at is null
      and events.resolved_at is null
      and (
        jobs.status in ('pending', 'failed')
        or (
          jobs.status = 'processing'
          and jobs.last_attempt_at < now() - interval '2 minutes'
        )
      )
      and jobs.available_at <= now()
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
    claimed.expires_at
  from claimed
  join public.notification_events events
    on events.id = claimed.notification_event_id;
end;
$$;

revoke all on function public.claim_notification_delivery_jobs(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_delivery_jobs(integer)
  to service_role;

create or replace function private.normalize_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload_actor_id text;
begin
  new.category := case
    when new.type = 'dm_message' then 'dm'
    when new.type = 'group_message' then 'group'
    when new.type in ('mention', 'reply', 'reaction', 'hype_event') then 'interactions'
    when new.type in ('connection_request', 'connection_accepted') then 'connections'
    when new.type in ('shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply') then 'shadow_pin'
    when new.type = 'presence_active' then 'presence'
    when new.type like 'shado_live_%' then 'live'
    when new.type in ('shadow_checkers_turn') then 'games'
    else coalesce(nullif(new.category, ''), 'system')
  end;

  new.route := coalesce(
    nullif(new.route, ''),
    nullif(new.payload ->> 'route', ''),
    nullif(new.payload ->> 'url', '')
  );

  if new.actor_id is null then
    payload_actor_id := coalesce(
      new.payload #>> '{actor,id}',
      new.payload ->> 'sender_id',
      new.payload ->> 'actor_id'
    );
    if payload_actor_id ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      new.actor_id := payload_actor_id::uuid;
    end if;
  end if;

  new.presentation_expires_at := coalesce(
    new.presentation_expires_at,
    new.created_at + interval '90 seconds'
  );
  return new;
end;
$$;

drop trigger if exists normalize_notification_event
  on public.notification_events;
drop trigger if exists normalize_notification_event_insert
  on public.notification_events;
drop trigger if exists normalize_notification_event_update
  on public.notification_events;
create trigger normalize_notification_event_insert
  before insert
  on public.notification_events
  for each row execute function private.normalize_notification_event();
create trigger normalize_notification_event_update
  before update of type, payload, category, actor_id, route, presentation_expires_at
  on public.notification_events
  for each row execute function private.normalize_notification_event();

revoke all on function private.normalize_notification_event()
  from public, anon, authenticated;

create or replace function public.claim_my_notification_event(
  target_event_id uuid
)
returns boolean
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
  set presented_at = now()
  where events.id = target_event_id
    and events.user_id = current_user_id
    and events.presented_at is null
    and events.read_at is null
    and events.resolved_at is null
    and events.presentation_expires_at > now();

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create or replace function public.mark_my_notification_event_read(
  target_event_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_type text;
  target_entity_id uuid;
  changed_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.notification_events events
  set
    read_at = coalesce(events.read_at, now()),
    presented_at = coalesce(events.presented_at, now())
  where events.id = target_event_id
    and events.user_id = current_user_id
  returning events.type, events.entity_id
  into target_type, target_entity_id;

  get diagnostics changed_count = row_count;

  if changed_count = 1 then
    update public.activity_events events
    set read_at = coalesce(events.read_at, now())
    where events.user_id = current_user_id
      and events.type = target_type
      and events.entity_id = target_entity_id
      and events.read_at is null;
  end if;

  return changed_count = 1;
end;
$$;

create or replace function public.mark_my_shadow_pin_notifications_read(
  target_image_id uuid,
  target_comment_id uuid default null
)
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
    and events.type in ('shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply')
    and events.payload ->> 'image_id' = target_image_id::text
    and (
      target_comment_id is null
      or events.payload ->> 'comment_id' = target_comment_id::text
    );

  get diagnostics changed_count = row_count;

  update public.activity_events events
  set read_at = coalesce(events.read_at, now())
  where events.user_id = current_user_id
    and events.read_at is null
    and events.shadow_pin_image_id = target_image_id
    and (
      target_comment_id is null
      or events.shadow_pin_comment_id = target_comment_id
    );

  return changed_count;
end;
$$;

create or replace function public.mark_my_checkers_turn_read(
  target_match_id uuid
)
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
    and events.type = 'shadow_checkers_turn'
    and events.entity_id = target_match_id
    and events.read_at is null;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.claim_my_notification_event(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_my_notification_event_read(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_my_shadow_pin_notifications_read(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_my_checkers_turn_read(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.claim_my_notification_event(uuid)
  to authenticated;
grant execute on function public.mark_my_notification_event_read(uuid)
  to authenticated;
grant execute on function public.mark_my_shadow_pin_notifications_read(uuid, uuid)
  to authenticated;
grant execute on function public.mark_my_checkers_turn_read(uuid)
  to authenticated;

comment on function public.claim_my_notification_event(uuid) is
  'Atomically claims one recent caller-owned notification for foreground presentation without marking it read.';
comment on function public.mark_my_notification_event_read(uuid) is
  'Marks one caller-owned notification and its matching Activity event read.';

-- Keep DM source reads and notification/activity ledgers synchronized.
create or replace function private.sync_dm_notification_reads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  newly_read_by uuid[];
begin
  select coalesce(array_agg(reader_id), array[]::uuid[])
  into newly_read_by
  from unnest(coalesce(new.read_by, array[]::uuid[])) reader_id
  where not (reader_id = any(coalesce(old.read_by, array[]::uuid[])));

  if cardinality(newly_read_by) = 0 then
    return new;
  end if;

  update public.notification_events events
  set read_at = coalesce(events.read_at, now())
  where events.user_id = any(newly_read_by)
    and events.dm_message_id = new.id
    and events.type in ('dm_message', 'reaction')
    and events.read_at is null;

  update public.activity_events events
  set read_at = coalesce(events.read_at, now())
  where events.user_id = any(newly_read_by)
    and events.dm_message_id = new.id
    and events.read_at is null;

  return new;
end;
$$;

drop trigger if exists sync_dm_notification_reads
  on public.dm_messages;
create trigger sync_dm_notification_reads
  after update of read_by on public.dm_messages
  for each row
  when (old.read_by is distinct from new.read_by)
  execute function private.sync_dm_notification_reads();

revoke all on function private.sync_dm_notification_reads()
  from public, anon, authenticated;

-- Hype notification rows created before this migration did not retain the
-- source message id, so General Chat read-through could not clear them.
update public.notification_events events
set message_id = hype.message_id
from public.hype_events hype
where events.type = 'hype_event'
  and events.entity_id = hype.id
  and events.message_id is null
  and hype.message_id is not null;

-- Reading a Catch-Up Activity card must also clear the matching launcher event.
create or replace function public.acknowledge_my_catch_up_events(
  target_event_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_ids uuid[];
  changed_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if cardinality(coalesce(target_event_ids, array[]::uuid[])) > 50 then
    raise exception 'At most 50 Catch-Up events may be acknowledged';
  end if;

  select coalesce(array_agg(distinct requested_id), array[]::uuid[])
  into normalized_ids
  from unnest(coalesce(target_event_ids, array[]::uuid[])) requested_id
  where requested_id is not null;

  with selected_events as (
    select events.type, events.entity_id
    from public.activity_events events
    where events.user_id = caller_id
      and events.id = any(normalized_ids)
  )
  update public.notification_events notifications
  set read_at = coalesce(notifications.read_at, now())
  where notifications.user_id = caller_id
    and notifications.read_at is null
    and exists (
      select 1
      from selected_events selected
      where selected.type = notifications.type
        and selected.entity_id = notifications.entity_id
    );

  update public.activity_events events
  set read_at = coalesce(events.read_at, now())
  where events.user_id = caller_id
    and events.id = any(normalized_ids)
    and events.read_at is null;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.acknowledge_my_catch_up_events(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.acknowledge_my_catch_up_events(uuid[])
  to authenticated, service_role;

-- Shado Live originally kept a separate caller-owned notification ledger.
-- Mirror it into the canonical ledger so the notification inbox, read state,
-- routes, and badge reconciliation all have one source of truth. Live remains
-- in-app only in this release, so these event types are intentionally excluded
-- from sync_notification_delivery_job.
create or replace function private.mirror_shado_live_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_type text;
  actor_profile jsonb;
  actor_name text;
  room_title text;
  target_title text;
  target_route text;
begin
  canonical_type := case new.type
    when 'room_started' then 'shado_live_room_started'
    when 'room_ended' then 'shado_live_room_ended'
    when 'speaker_promoted' then 'shado_live_speaker_promoted'
    when 'speaker_demoted' then 'shado_live_speaker_demoted'
    when 'participant_muted' then 'shado_live_participant_muted'
    when 'participant_removed' then 'shado_live_participant_removed'
    else null
  end;

  if canonical_type is null then
    return new;
  end if;

  select
    public.user_public_profile_json(users),
    coalesce(
      nullif(users.display_name, ''),
      nullif(users.username, ''),
      'Someone'
    )
  into actor_profile, actor_name
  from public.users users
  where users.id = new.actor_user_id;

  select rooms.title
  into room_title
  from public.live_rooms rooms
  where rooms.id = new.room_id;

  if actor_profile is null or room_title is null then
    return new;
  end if;

  target_title := case new.type
    when 'room_started' then actor_name || ' is live now'
    when 'room_ended' then 'Shado Live room ended'
    when 'speaker_promoted' then 'You were invited to speak'
    when 'speaker_demoted' then 'You returned to the audience'
    when 'participant_muted' then 'A Shado Live host muted your microphone'
    else 'You were removed from the Shado Live room'
  end;
  target_route := '/?view=games&experience=shado-live&item=' || new.room_id::text;

  insert into public.notification_events (
    user_id,
    type,
    entity_id,
    actor_id,
    category,
    route,
    payload,
    dedupe_key,
    read_at,
    presentation_expires_at,
    created_at
  ) values (
    new.recipient_user_id,
    canonical_type,
    new.id,
    new.actor_user_id,
    'live',
    target_route,
    jsonb_build_object(
      'title', target_title,
      'body', new.body_preview,
      'actor', actor_profile,
      'room_id', new.room_id,
      'room_title', room_title,
      'source_notification_id', new.id,
      'route', target_route
    ),
    'shado-live-canonical:' || new.id::text || ':' || new.recipient_user_id::text,
    new.read_at,
    new.occurred_at + interval '90 seconds',
    new.occurred_at
  )
  on conflict (dedupe_key) do update
  set
    read_at = case
      when excluded.read_at is not null
        then coalesce(public.notification_events.read_at, excluded.read_at)
      else public.notification_events.read_at
    end,
    payload = excluded.payload,
    actor_id = excluded.actor_id,
    route = excluded.route;

  return new;
end;
$$;

create or replace function private.sync_shado_live_source_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.read_at is null or old.read_at is not distinct from new.read_at then
    return new;
  end if;

  update public.shado_live_notifications notifications
  set read_at = coalesce(notifications.read_at, new.read_at)
  where notifications.recipient_user_id = new.user_id
    and notifications.id::text = new.payload ->> 'source_notification_id'
    and notifications.read_at is null;

  return new;
end;
$$;

drop trigger if exists mirror_shado_live_notification_insert
  on public.shado_live_notifications;
drop trigger if exists mirror_shado_live_notification_read
  on public.shado_live_notifications;
create trigger mirror_shado_live_notification_insert
  after insert on public.shado_live_notifications
  for each row execute function private.mirror_shado_live_notification();
create trigger mirror_shado_live_notification_read
  after update of read_at on public.shado_live_notifications
  for each row
  when (old.read_at is distinct from new.read_at)
  execute function private.mirror_shado_live_notification();

drop trigger if exists sync_shado_live_source_read
  on public.notification_events;
create trigger sync_shado_live_source_read
  after update of read_at on public.notification_events
  for each row
  when (
    old.read_at is distinct from new.read_at
    and new.read_at is not null
    and new.category = 'live'
  )
  execute function private.sync_shado_live_source_read();

revoke all on function private.mirror_shado_live_notification()
  from public, anon, authenticated;
revoke all on function private.sync_shado_live_source_read()
  from public, anon, authenticated;

-- Preserve the source ledger's seven-day product window while preventing an
-- old row from ever becoming a fresh toast: occurred_at owns the 90-second
-- presentation deadline.
insert into public.notification_events (
  user_id,
  type,
  entity_id,
  actor_id,
  category,
  route,
  payload,
  dedupe_key,
  read_at,
  presentation_expires_at,
  created_at
)
select
  notifications.recipient_user_id,
  case notifications.type
    when 'room_started' then 'shado_live_room_started'
    when 'room_ended' then 'shado_live_room_ended'
    when 'speaker_promoted' then 'shado_live_speaker_promoted'
    when 'speaker_demoted' then 'shado_live_speaker_demoted'
    when 'participant_muted' then 'shado_live_participant_muted'
    else 'shado_live_participant_removed'
  end,
  notifications.id,
  notifications.actor_user_id,
  'live',
  '/?view=games&experience=shado-live&item=' || notifications.room_id::text,
  jsonb_build_object(
    'title', case notifications.type
      when 'room_started' then coalesce(
        nullif(actors.display_name, ''),
        nullif(actors.username, ''),
        'Someone'
      ) || ' is live now'
      when 'room_ended' then 'Shado Live room ended'
      when 'speaker_promoted' then 'You were invited to speak'
      when 'speaker_demoted' then 'You returned to the audience'
      when 'participant_muted' then 'A Shado Live host muted your microphone'
      else 'You were removed from the Shado Live room'
    end,
    'body', notifications.body_preview,
    'actor', public.user_public_profile_json(actors),
    'room_id', notifications.room_id,
    'room_title', rooms.title,
    'source_notification_id', notifications.id,
    'route', '/?view=games&experience=shado-live&item=' || notifications.room_id::text
  ),
  'shado-live-canonical:' || notifications.id::text || ':' ||
    notifications.recipient_user_id::text,
  notifications.read_at,
  notifications.occurred_at + interval '90 seconds',
  notifications.occurred_at
from public.shado_live_notifications notifications
join public.users actors on actors.id = notifications.actor_user_id
join public.live_rooms rooms on rooms.id = notifications.room_id
where notifications.occurred_at >= now() - interval '7 days'
on conflict (dedupe_key) do update
set
  read_at = case
    when excluded.read_at is not null
      then coalesce(public.notification_events.read_at, excluded.read_at)
    else public.notification_events.read_at
  end,
  payload = excluded.payload,
  actor_id = excluded.actor_id,
  route = excluded.route;

-- Shadow Checkers is server authoritative, so turn events are created in the
-- same transaction that changes current_turn_user_id.
create or replace function private.create_shadow_checkers_turn_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  actor_user_id uuid;
  actor_profile jsonb;
  recipient_preferences public.notification_preferences%rowtype;
  target_route text;
begin
  if tg_op = 'UPDATE' then
    if old.status is not distinct from new.status
      and old.current_turn_user_id is not distinct from new.current_turn_user_id
      and old.move_count is not distinct from new.move_count
      and old.player_two_id is not distinct from new.player_two_id then
      return new;
    end if;
  end if;

  update public.notification_events events
  set
    resolved_at = coalesce(events.resolved_at, now()),
    read_at = coalesce(events.read_at, now())
  where events.type = 'shadow_checkers_turn'
    and events.entity_id = new.id
    and events.resolved_at is null
    and (
      new.status <> 'active'
      or new.current_turn_user_id is null
      or events.user_id <> new.current_turn_user_id
      or events.payload ->> 'move_count' is distinct from new.move_count::text
    );

  if new.status <> 'active' or new.current_turn_user_id is null then
    return new;
  end if;

  recipient_id := new.current_turn_user_id;
  actor_user_id := case
    when recipient_id = new.player_one_id then new.player_two_id
    else new.player_one_id
  end;

  if actor_user_id is null
    or actor_user_id = recipient_id
    or private.users_have_block(actor_user_id, recipient_id) then
    return new;
  end if;

  select preferences.*
  into recipient_preferences
  from public.notification_preferences preferences
  where preferences.user_id = recipient_id;

  if not found
    or not recipient_preferences.notifications_enabled
    or not recipient_preferences.checkers_turn_enabled then
    return new;
  end if;

  select public.user_public_profile_json(users)
  into actor_profile
  from public.users users
  where users.id = actor_user_id;

  target_route := format(
    '/?view=games&experience=shadow-checkers&item=%s',
    new.id
  );

  insert into public.notification_events (
    user_id,
    type,
    entity_id,
    actor_id,
    category,
    route,
    payload,
    dedupe_key,
    presentation_expires_at
  ) values (
    recipient_id,
    'shadow_checkers_turn',
    new.id,
    actor_user_id,
    'games',
    target_route,
    jsonb_build_object(
      'title', 'Your turn in Shadow Checkers',
      'body', 'It is your turn. Open the match to make your play.',
      'route', target_route,
      'match_id', new.id,
      'session_id', new.session_id,
      'move_count', new.move_count,
      'actor', actor_profile
    ),
    concat(
      'shadow_checkers_turn:',
      new.id,
      ':',
      new.move_count,
      ':',
      recipient_id
    ),
    now() + interval '90 seconds'
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists create_shadow_checkers_turn_notification
  on public.shadow_checkers_matches;
drop trigger if exists create_shadow_checkers_turn_notification_insert
  on public.shadow_checkers_matches;
drop trigger if exists create_shadow_checkers_turn_notification_update
  on public.shadow_checkers_matches;
create trigger create_shadow_checkers_turn_notification_insert
  after insert
  on public.shadow_checkers_matches
  for each row execute function private.create_shadow_checkers_turn_notification();
create trigger create_shadow_checkers_turn_notification_update
  after update of status, current_turn_user_id, move_count, player_two_id
  on public.shadow_checkers_matches
  for each row execute function private.create_shadow_checkers_turn_notification();

revoke all on function private.create_shadow_checkers_turn_notification()
  from public, anon, authenticated;

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
  games_count integer := 0;
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

  if found and preferences.badge_games_enabled then
    select count(*)::integer
    into games_count
    from public.shadow_checkers_matches matches
    where matches.status = 'active'
      and matches.current_turn_user_id = target_user_id;
  end if;

  base_total := coalesce((base_state ->> 'total')::integer, 0);
  return base_state || jsonb_build_object(
    'games', games_count,
    'total', base_total + games_count
  );
end;
$$;

revoke all on function public.get_app_badge_state_v2(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_app_badge_state_v2(uuid)
  to authenticated, service_role;

comment on function public.get_app_badge_state_v2(uuid) is
  'Caller-owned launcher badge total and complete category breakdown, including active Shadow Checkers turns.';

commit;
