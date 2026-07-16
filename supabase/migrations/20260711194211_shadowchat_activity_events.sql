-- ShadowChat 2.0 Activity HQ
--
-- This is deliberately separate from public.notification_events. The latter
-- remains the legacy push-delivery/dedupe ledger consumed by the production
-- frontend. Activity events are authoritative, recipient-owned product state
-- created from source-table mutations made by either frontend.

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid not null references public.users(id) on delete cascade,
  type text not null check (
    type in (
      'dm_message',
      'mention',
      'reply',
      'reaction',
      'hype_event',
      'shadow_pin_post',
      'shadow_pin_comment',
      'shadow_pin_reply'
    )
  ),
  entity_id uuid not null,
  conversation_id uuid references public.dm_conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  dm_message_id uuid references public.dm_messages(id) on delete cascade,
  reaction_id uuid references public.message_reactions(id) on delete cascade,
  hype_event_id uuid references public.hype_events(id) on delete cascade,
  shadow_pin_image_id uuid references public.shadow_pin_images(id) on delete cascade,
  shadow_pin_comment_id uuid references public.shadow_pin_comments(id) on delete cascade,
  body_preview text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  read_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint activity_events_body_preview_length
    check (char_length(body_preview) <= 240),
  constraint activity_events_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint activity_events_dedupe_key_length
    check (char_length(dedupe_key) between 1 and 240),
  constraint activity_events_source_shape
    check (
      (type = 'dm_message'
        and conversation_id is not null
        and dm_message_id is not null
        and message_id is null
        and shadow_pin_image_id is null
        and shadow_pin_comment_id is null)
      or
      (type in ('mention', 'reply')
        and message_id is not null
        and dm_message_id is null
        and shadow_pin_image_id is null
        and shadow_pin_comment_id is null)
      or
      (type = 'reaction'
        and reaction_id is not null
        and num_nonnulls(message_id, dm_message_id) = 1
        and shadow_pin_image_id is null
        and shadow_pin_comment_id is null)
      or
      (type = 'hype_event'
        and hype_event_id is not null
        and message_id is not null
        and dm_message_id is null
        and shadow_pin_image_id is null
        and shadow_pin_comment_id is null)
      or
      (type = 'shadow_pin_post'
        and shadow_pin_image_id is not null
        and shadow_pin_comment_id is null
        and message_id is null
        and dm_message_id is null)
      or
      (type in ('shadow_pin_comment', 'shadow_pin_reply')
        and shadow_pin_image_id is not null
        and shadow_pin_comment_id is not null
        and message_id is null
        and dm_message_id is null)
    )
);

create index activity_events_user_occurred_idx
  on public.activity_events (user_id, occurred_at desc, id desc);

create index activity_events_user_unread_idx
  on public.activity_events (user_id, occurred_at desc, id desc)
  where read_at is null;

create index activity_events_user_actor_idx
  on public.activity_events (user_id, actor_id);

alter table public.activity_events enable row level security;

create policy "Users can view their own unblocked activity"
  on public.activity_events
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not private.users_have_block(user_id, actor_id)
  );

create policy "Users can update their own unblocked activity"
  on public.activity_events
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not private.users_have_block(user_id, actor_id)
  )
  with check (
    (select auth.uid()) = user_id
    and not private.users_have_block(user_id, actor_id)
  );

revoke all on table public.activity_events from public, anon, authenticated;
grant select on table public.activity_events to authenticated;
grant update (read_at) on table public.activity_events to authenticated;
grant all on table public.activity_events to service_role;

-- The legacy frontend only updates notification_events.read_at. Restrict that
-- table to the one browser mutation it actually needs so recipients cannot
-- forge delivery evidence, payloads, owners, or dedupe keys.
revoke update on table public.notification_events from authenticated;
grant update (read_at) on table public.notification_events to authenticated;

create or replace function private.create_dm_activity_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  select participant_id
    into recipient_id
  from public.dm_conversations conversations
  cross join lateral unnest(conversations.participants) participant_id
  where conversations.id = new.conversation_id
    and participant_id <> new.sender_id
  limit 1;

  if recipient_id is null
    or private.users_have_block(new.sender_id, recipient_id) then
    return new;
  end if;

  insert into public.activity_events (
    user_id,
    actor_id,
    type,
    entity_id,
    conversation_id,
    dm_message_id,
    body_preview,
    dedupe_key,
    occurred_at
  ) values (
    recipient_id,
    new.sender_id,
    'dm_message',
    new.id,
    new.conversation_id,
    new.id,
    left(coalesce(nullif(new.content, ''), 'Sent an attachment'), 240),
    concat('activity:dm:', new.id, ':', recipient_id),
    coalesce(new.created_at, now())
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create or replace function private.create_group_activity_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reply_recipient_id uuid;
  mentioned_recipient_id uuid;
begin
  if new.reply_to is not null then
    select parent.user_id
      into reply_recipient_id
    from public.messages parent
    where parent.id = new.reply_to;

    if reply_recipient_id is not null
      and reply_recipient_id <> new.user_id
      and not private.users_have_block(new.user_id, reply_recipient_id) then
      insert into public.activity_events (
        user_id,
        actor_id,
        type,
        entity_id,
        message_id,
        body_preview,
        dedupe_key,
        occurred_at
      ) values (
        reply_recipient_id,
        new.user_id,
        'reply',
        new.id,
        new.id,
        left(coalesce(nullif(new.content, ''), 'Replied with an attachment'), 240),
        concat('activity:reply:', new.id, ':', reply_recipient_id),
        coalesce(new.created_at, now())
      )
      on conflict (dedupe_key) do nothing;
    end if;
  end if;

  for mentioned_recipient_id in
    select distinct mentioned_user.id
    from (
      select lower(matches[2]) as username
      from regexp_matches(
        coalesce(new.content, ''),
        E'(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{1,40})\\y',
        'g'
      ) matches
      limit 20
    ) mentions
    join public.users mentioned_user
      on lower(mentioned_user.username) = mentions.username
    where mentioned_user.id <> new.user_id
      and mentioned_user.id is distinct from reply_recipient_id
      and not private.users_have_block(new.user_id, mentioned_user.id)
  loop
    insert into public.activity_events (
      user_id,
      actor_id,
      type,
      entity_id,
      message_id,
      body_preview,
      dedupe_key,
      occurred_at
    ) values (
      mentioned_recipient_id,
      new.user_id,
      'mention',
      new.id,
      new.id,
      left(coalesce(nullif(new.content, ''), 'Mentioned you in an attachment'), 240),
      concat('activity:mention:', new.id, ':', mentioned_recipient_id),
      coalesce(new.created_at, now())
    )
    on conflict (dedupe_key) do nothing;
  end loop;

  return new;
end;
$$;

create or replace function private.create_reaction_activity_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  target_conversation_id uuid;
  target_preview text;
begin
  if new.message_id is not null then
    select messages.user_id, messages.content
      into recipient_id, target_preview
    from public.messages
    where messages.id = new.message_id;
  else
    select messages.sender_id, messages.conversation_id, messages.content
      into recipient_id, target_conversation_id, target_preview
    from public.dm_messages messages
    where messages.id = new.dm_message_id;
  end if;

  if recipient_id is null
    or recipient_id = new.user_id
    or private.users_have_block(new.user_id, recipient_id) then
    return new;
  end if;

  insert into public.activity_events (
    user_id,
    actor_id,
    type,
    entity_id,
    conversation_id,
    message_id,
    dm_message_id,
    reaction_id,
    body_preview,
    metadata,
    dedupe_key,
    occurred_at
  ) values (
    recipient_id,
    new.user_id,
    'reaction',
    new.id,
    target_conversation_id,
    new.message_id,
    new.dm_message_id,
    new.id,
    left(coalesce(nullif(target_preview, ''), 'Your message'), 240),
    jsonb_build_object('emoji', left(new.emoji, 32)),
    concat('activity:reaction:', new.id, ':', recipient_id),
    coalesce(new.created_at, now())
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create or replace function private.create_hype_activity_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type <> 'message'
    or new.actor_id is null
    or new.message_author_id is null
    or new.message_id is null
    or new.actor_id = new.message_author_id
    or private.users_have_block(new.actor_id, new.message_author_id) then
    return new;
  end if;

  insert into public.activity_events (
    user_id,
    actor_id,
    type,
    entity_id,
    message_id,
    hype_event_id,
    body_preview,
    metadata,
    dedupe_key,
    occurred_at
  ) values (
    new.message_author_id,
    new.actor_id,
    'hype_event',
    new.id,
    new.message_id,
    new.id,
    'Hyped your message',
    jsonb_build_object('event_type', new.event_type),
    concat('activity:hype:', new.id, ':', new.message_author_id),
    new.created_at
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create or replace function private.mirror_shadow_pin_activity_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
  image_id uuid;
  comment_id uuid;
begin
  if new.type not in ('shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply') then
    return new;
  end if;

  begin
    actor_user_id := nullif(new.payload #>> '{actor,id}', '')::uuid;
    image_id := nullif(new.payload ->> 'image_id', '')::uuid;
    comment_id := nullif(new.payload ->> 'comment_id', '')::uuid;
  exception when invalid_text_representation then
    return new;
  end;

  if actor_user_id is null
    or image_id is null
    or actor_user_id = new.user_id
    or private.users_have_block(actor_user_id, new.user_id) then
    return new;
  end if;

  if new.type in ('shadow_pin_comment', 'shadow_pin_reply')
    and comment_id is null then
    return new;
  end if;

  insert into public.activity_events (
    user_id,
    actor_id,
    type,
    entity_id,
    shadow_pin_image_id,
    shadow_pin_comment_id,
    body_preview,
    metadata,
    dedupe_key,
    occurred_at
  ) values (
    new.user_id,
    actor_user_id,
    new.type,
    new.entity_id,
    image_id,
    comment_id,
    left(coalesce(new.payload ->> 'body_preview', new.payload ->> 'body', new.payload ->> 'image_title', ''), 240),
    jsonb_strip_nulls(jsonb_build_object(
      'image_title', new.payload ->> 'image_title',
      'thumbnail_url', new.payload ->> 'thumbnail_url'
    )),
    concat('activity:', new.type, ':', new.entity_id, ':', new.user_id),
    new.created_at
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create or replace function private.cleanup_activity_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'user_blocks' then
    delete from public.activity_events events
    where (events.user_id = new.blocker_id and events.actor_id = new.blocked_id)
       or (events.user_id = new.blocked_id and events.actor_id = new.blocker_id);
    return new;
  end if;

  if tg_table_name = 'shadow_pin_images'
    and new.deleted_at is not null
    and old.deleted_at is null then
    delete from public.activity_events events
    where events.shadow_pin_image_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.create_dm_activity_event()
  from public, anon, authenticated;
revoke all on function private.create_group_activity_events()
  from public, anon, authenticated;
revoke all on function private.create_reaction_activity_event()
  from public, anon, authenticated;
revoke all on function private.create_hype_activity_event()
  from public, anon, authenticated;
revoke all on function private.mirror_shadow_pin_activity_event()
  from public, anon, authenticated;
revoke all on function private.cleanup_activity_events()
  from public, anon, authenticated;

drop trigger if exists create_dm_activity_event on public.dm_messages;
create trigger create_dm_activity_event
  after insert on public.dm_messages
  for each row execute function private.create_dm_activity_event();

drop trigger if exists create_group_activity_events on public.messages;
create trigger create_group_activity_events
  after insert on public.messages
  for each row execute function private.create_group_activity_events();

drop trigger if exists create_reaction_activity_event on public.message_reactions;
create trigger create_reaction_activity_event
  after insert on public.message_reactions
  for each row execute function private.create_reaction_activity_event();

drop trigger if exists create_hype_activity_event on public.hype_events;
create trigger create_hype_activity_event
  after insert on public.hype_events
  for each row execute function private.create_hype_activity_event();

drop trigger if exists mirror_shadow_pin_activity_event on public.notification_events;
create trigger mirror_shadow_pin_activity_event
  after insert on public.notification_events
  for each row execute function private.mirror_shadow_pin_activity_event();

drop trigger if exists cleanup_activity_events_on_block on public.user_blocks;
create trigger cleanup_activity_events_on_block
  after insert on public.user_blocks
  for each row execute function private.cleanup_activity_events();

drop trigger if exists cleanup_activity_events_on_shadow_pin_delete on public.shadow_pin_images;
create trigger cleanup_activity_events_on_shadow_pin_delete
  after update of deleted_at on public.shadow_pin_images
  for each row execute function private.cleanup_activity_events();

-- The blocking hardening trigger previously ran on DELETE as well as INSERT.
-- During an ON DELETE CASCADE from messages, the parent row is already gone by
-- the time the reaction trigger runs, so its source lookup rejected the whole
-- message deletion. Existing RLS/RPC ownership rules already govern reaction
-- removal; blocking needs to prevent only new engagement.
drop trigger if exists enforce_dm_reaction_not_blocked on public.message_reactions;
create trigger enforce_dm_reaction_not_blocked
  before insert on public.message_reactions
  for each row execute function private.enforce_dm_reaction_not_blocked();

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_events'
  ) then
    alter publication supabase_realtime add table public.activity_events;
  end if;
end
$$;

comment on table public.activity_events is
  'Recipient-owned, push-independent Activity HQ ledger for ShadowChat 2.0.';

comment on column public.activity_events.read_at is
  'Activity-only read state. Independent of legacy notification_events.read_at.';
