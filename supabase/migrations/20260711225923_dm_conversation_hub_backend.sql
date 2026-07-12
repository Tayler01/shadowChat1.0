/*
  # ShadowChat 2.0 DM Conversation Hub backend

  This migration adds owner-private conversation organization and bounded DM
  retrieval without changing any existing RPC signature. It also closes the
  historical direct-write paths that allowed authenticated clients to mutate
  conversation membership or non-editable message columns.
*/

begin;

-- Serialize the fail-closed audit with every writer until the canonical pair
-- constraint and unique index are installed.
lock table public.dm_conversations in share row exclusive mode;

-- Fail closed before making one-to-one conversation identity immutable. Every
-- supported writer already stores exactly two distinct UUIDs in sorted order.
do $audit$
begin
  if exists (
    select 1
    from public.dm_conversations conversations
    where cardinality(conversations.participants) <> 2
       or conversations.participants[1] is null
       or conversations.participants[2] is null
       or conversations.participants[1] >= conversations.participants[2]
  ) then
    raise exception 'DM Hub migration blocked: malformed or noncanonical conversation participants';
  end if;

  if exists (
    select conversations.participants
    from public.dm_conversations conversations
    group by conversations.participants
    having count(*) > 1
  ) then
    raise exception 'DM Hub migration blocked: duplicate one-to-one conversations exist';
  end if;
end
$audit$;

alter table public.dm_conversations
  drop constraint if exists dm_conversations_two_sorted_participants_check;
alter table public.dm_conversations
  add constraint dm_conversations_two_sorted_participants_check check (
    cardinality(participants) = 2
    and participants[1] is not null
    and participants[2] is not null
    and participants[1] < participants[2]
  );

create unique index if not exists dm_conversations_participants_pair_key
  on public.dm_conversations (participants);

-- The app has always created conversations through this RPC. Serialize a pair
-- during creation and use the unique key as a second concurrency guarantee.
create or replace function public.get_or_create_dm_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  conversation_id uuid;
  participants_array uuid[];
begin
  if current_user_id is null then
    raise exception 'User not authenticated';
  end if;

  if other_user_id is null then
    raise exception 'Other user is required';
  end if;

  if current_user_id = other_user_id then
    raise exception 'Cannot create conversation with yourself';
  end if;

  if not exists (
    select 1
    from public.users users
    where users.id = get_or_create_dm_conversation.other_user_id
  ) then
    raise exception 'User not found';
  end if;

  if private.users_have_block(current_user_id, other_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Messaging is unavailable for this user';
  end if;

  participants_array := array[
    least(current_user_id, other_user_id),
    greatest(current_user_id, other_user_id)
  ];

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.array_to_string(participants_array, ':'), 0)
  );

  select conversations.id
    into conversation_id
  from public.dm_conversations conversations
  where conversations.participants = participants_array;

  if conversation_id is null then
    insert into public.dm_conversations (participants)
    values (participants_array)
    on conflict (participants) do nothing
    returning id into conversation_id;

    if conversation_id is null then
      select conversations.id
        into strict conversation_id
      from public.dm_conversations conversations
      where conversations.participants = participants_array;
    end if;
  end if;

  return conversation_id;
end;
$$;

revoke all on function public.get_or_create_dm_conversation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_or_create_dm_conversation(uuid)
  to authenticated, service_role;

-- Message inserts still maintain inbox order after direct conversation UPDATE
-- is removed. GREATEST prevents a delayed/offline insert from moving a thread
-- backwards in time.
create or replace function public.update_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.dm_conversations conversations
    set last_message_at = coalesce(
      (
        select max(messages.created_at)
        from public.dm_messages messages
        where messages.conversation_id = old.conversation_id
      ),
      conversations.created_at
    )
    where conversations.id = old.conversation_id;

    return old;
  end if;

  update public.dm_conversations conversations
  set last_message_at = greatest(
    coalesce(conversations.last_message_at, '-infinity'::timestamptz),
    coalesce(new.created_at, now())
  )
  where conversations.id = new.conversation_id;

  return new;
end;
$$;

revoke all on function public.update_conversation_last_message()
  from public, anon, authenticated;

drop trigger if exists update_dm_conversation_after_delete on public.dm_messages;
create trigger update_dm_conversation_after_delete
  after delete on public.dm_messages
  for each row execute function public.update_conversation_last_message();

-- Existing clients use get_or_create_dm_conversation(), never direct writes.
-- Trusted service-role paths retain their table authority.
revoke insert, update on table public.dm_conversations from authenticated;

-- Existing browser editing writes exactly these two columns. Read receipts and
-- reactions continue through their guarded SECURITY DEFINER RPCs; media
-- processing continues under service_role.
revoke update on table public.dm_messages from authenticated;
grant update (content, edited_at) on table public.dm_messages to authenticated;

create table public.dm_conversation_preferences (
  user_id uuid not null references public.users(id) on delete cascade,
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  pinned_at timestamptz,
  archived_at timestamptz,
  marked_unread_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dm_conversation_preferences_pkey primary key (user_id, conversation_id),
  constraint dm_conversation_preferences_active_pin_check check (
    pinned_at is null or archived_at is null
  )
);

comment on table public.dm_conversation_preferences is
  'Owner-private organization state for a DM thread. Notification mute state remains in notification_conversation_mutes.';

alter table public.dm_conversation_preferences enable row level security;

create policy "Users can view own DM conversation preferences"
  on public.dm_conversation_preferences
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert own DM conversation preferences"
  on public.dm_conversation_preferences
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.dm_conversations conversations
      where conversations.id = dm_conversation_preferences.conversation_id
        and (select auth.uid()) = any (conversations.participants)
    )
  );

create policy "Users can update own DM conversation preferences"
  on public.dm_conversation_preferences
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.dm_conversations conversations
      where conversations.id = dm_conversation_preferences.conversation_id
        and (select auth.uid()) = any (conversations.participants)
    )
  );

create policy "Users can delete own DM conversation preferences"
  on public.dm_conversation_preferences
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create index dm_conversation_preferences_conversation_user_idx
  on public.dm_conversation_preferences (conversation_id, user_id);
create index dm_conversation_preferences_pinned_idx
  on public.dm_conversation_preferences (user_id, pinned_at desc, conversation_id)
  where pinned_at is not null and archived_at is null;
create index dm_conversation_preferences_archived_idx
  on public.dm_conversation_preferences (user_id, archived_at desc, conversation_id)
  where archived_at is not null;

create trigger update_dm_conversation_preferences_updated_at
  before update on public.dm_conversation_preferences
  for each row execute function public.update_updated_at_column();

revoke all on table public.dm_conversation_preferences
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.dm_conversation_preferences
  to authenticated;
grant select on table public.dm_conversation_preferences to service_role;

-- Keep preference changes live across signed-in devices. RLS still limits
-- delivered rows to the preference owner.
do $publication$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_conversation_preferences'
  ) then
    alter publication supabase_realtime
      add table public.dm_conversation_preferences;
  end if;
end
$publication$;

-- A new message must never remain hidden in an archived inbox. Clear archive
-- state for every participant that already has a preference row; do not create
-- rows or alter pin/manual-unread choices.
create function private.unarchive_dm_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dm_conversation_preferences preferences
  set archived_at = null
  where preferences.conversation_id = new.conversation_id
    and preferences.archived_at is not null
    and exists (
      select 1
      from public.dm_conversations conversations
      where conversations.id = new.conversation_id
        and preferences.user_id = any (conversations.participants)
    );

  return new;
end;
$$;

revoke all on function private.unarchive_dm_conversation_on_message()
  from public, anon, authenticated, service_role;

create trigger unarchive_dm_conversation_on_message
  after insert on public.dm_messages
  for each row execute function private.unarchive_dm_conversation_on_message();

-- Bounded newest-first search within one caller-visible conversation. RLS on
-- dm_messages and users remains authoritative, including reciprocal blocking.
create function public.search_dm_conversation_messages(
  target_conversation_id uuid,
  search_query text,
  result_limit integer default 30,
  before_created_at timestamptz default null,
  before_id uuid default null
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  message_type text,
  file_url text,
  thumbnail_url text,
  audio_url text,
  audio_duration integer,
  reply_to uuid,
  reactions jsonb,
  edited_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  sender jsonb
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  bounded_limit integer := greatest(1, least(coalesce(result_limit, 30), 50));
  normalized_query text := left(trim(coalesce(search_query, '')), 200);
begin
  if target_conversation_id is null then
    raise exception 'Conversation is required';
  end if;

  if normalized_query = '' then
    return;
  end if;

  if (before_created_at is null) <> (before_id is null) then
    raise exception 'DM search cursor must include both created_at and id';
  end if;

  if not exists (
    select 1
    from public.dm_conversations conversations
    where conversations.id = target_conversation_id
  ) then
    raise exception using errcode = '42501', message = 'Conversation is unavailable';
  end if;

  return query
  select
    messages.id,
    messages.conversation_id,
    messages.sender_id,
    messages.content,
    messages.message_type,
    messages.file_url,
    messages.thumbnail_url,
    messages.audio_url,
    messages.audio_duration,
    messages.reply_to,
    messages.reactions,
    messages.edited_at,
    messages.created_at,
    messages.updated_at,
    public.user_public_profile_json(profiles) as sender
  from public.dm_messages messages
  join public.users profiles on profiles.id = messages.sender_id
  where messages.conversation_id = target_conversation_id
    and to_tsvector('simple', coalesce(messages.content, ''))
      @@ websearch_to_tsquery('simple', normalized_query)
    and (
      before_created_at is null
      or (messages.created_at, messages.id) < (before_created_at, before_id)
    )
  order by messages.created_at desc, messages.id desc
  limit bounded_limit;
end;
$$;

revoke all on function public.search_dm_conversation_messages(uuid, text, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.search_dm_conversation_messages(uuid, text, integer, timestamptz, uuid)
  to authenticated;

comment on function public.search_dm_conversation_messages(uuid, text, integer, timestamptz, uuid) is
  'Returns a bounded keyset page of caller-visible text matches inside one DM conversation.';

-- Shared media/files/links use the same chronological keyset. Link matching is
-- deliberately conservative and returns the original message for client-side
-- rich rendering rather than extracting or fetching untrusted URLs in SQL.
create function public.list_dm_shared_content(
  target_conversation_id uuid,
  content_filter text default 'all',
  result_limit integer default 30,
  before_created_at timestamptz default null,
  before_id uuid default null
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  message_type text,
  content_kind text,
  file_url text,
  thumbnail_url text,
  audio_url text,
  audio_duration integer,
  media_width integer,
  media_height integer,
  created_at timestamptz,
  sender jsonb
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  bounded_limit integer := greatest(1, least(coalesce(result_limit, 30), 50));
  normalized_filter text := lower(trim(coalesce(content_filter, 'all')));
begin
  if target_conversation_id is null then
    raise exception 'Conversation is required';
  end if;

  if normalized_filter not in ('all', 'media', 'files', 'links') then
    raise exception 'Shared content filter must be all, media, files, or links';
  end if;

  if (before_created_at is null) <> (before_id is null) then
    raise exception 'Shared content cursor must include both created_at and id';
  end if;

  if not exists (
    select 1
    from public.dm_conversations conversations
    where conversations.id = target_conversation_id
  ) then
    raise exception using errcode = '42501', message = 'Conversation is unavailable';
  end if;

  return query
  with classified as (
    select
      messages.*,
      case
        when messages.message_type = 'file' then 'files'
        when messages.message_type in ('image', 'video', 'audio')
          or messages.audio_url is not null then 'media'
        when messages.content ~* 'https?://[^[:space:]]+' then 'links'
        else null
      end as resolved_kind
    from public.dm_messages messages
    where messages.conversation_id = target_conversation_id
      and (
        messages.message_type in ('image', 'video', 'audio', 'file')
        or messages.audio_url is not null
        or messages.content ~* 'https?://[^[:space:]]+'
      )
      and (
        before_created_at is null
        or (messages.created_at, messages.id) < (before_created_at, before_id)
      )
  )
  select
    classified.id,
    classified.conversation_id,
    classified.sender_id,
    classified.content,
    classified.message_type,
    classified.resolved_kind,
    classified.file_url,
    classified.thumbnail_url,
    classified.audio_url,
    classified.audio_duration,
    classified.media_width,
    classified.media_height,
    classified.created_at,
    public.user_public_profile_json(profiles) as sender
  from classified
  join public.users profiles on profiles.id = classified.sender_id
  where normalized_filter = 'all' or classified.resolved_kind = normalized_filter
  order by classified.created_at desc, classified.id desc
  limit bounded_limit;
end;
$$;

revoke all on function public.list_dm_shared_content(uuid, text, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_dm_shared_content(uuid, text, integer, timestamptz, uuid)
  to authenticated;

comment on function public.list_dm_shared_content(uuid, text, integer, timestamptz, uuid) is
  'Returns a bounded keyset page of caller-visible DM media, files, or link messages.';

-- Resolve an exact historical target into a bounded chronological window.
-- Missing, cross-conversation, and RLS-hidden targets all fail closed as
-- target_status=missing without falling back to an unrelated latest page.
create function public.get_dm_message_window(
  target_conversation_id uuid,
  target_message_id uuid,
  target_limit integer default 50
)
returns table (
  messages jsonb,
  has_older boolean,
  has_newer boolean,
  target_status text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  bounded_limit integer := greatest(1, least(coalesce(target_limit, 50), 100));
  before_count integer;
  after_count integer;
begin
  if target_conversation_id is null or target_message_id is null then
    raise exception 'Conversation and target message are required';
  end if;

  if not exists (
    select 1
    from public.dm_conversations conversations
    where conversations.id = target_conversation_id
  ) then
    raise exception using errcode = '42501', message = 'Conversation is unavailable';
  end if;

  if not exists (
    select 1
    from public.dm_messages target
    where target.id = target_message_id
      and target.conversation_id = target_conversation_id
  ) then
    return query select '[]'::jsonb, false, false, 'missing'::text;
    return;
  end if;

  before_count := (bounded_limit - 1) / 2;
  after_count := bounded_limit - before_count - 1;

  return query
  with anchor as (
    select target.created_at, target.id
    from public.dm_messages target
    where target.id = target_message_id
      and target.conversation_id = target_conversation_id
  ),
  older as (
    select messages.*
    from public.dm_messages messages
    cross join anchor
    where messages.conversation_id = target_conversation_id
      and (messages.created_at, messages.id) < (anchor.created_at, anchor.id)
    order by messages.created_at desc, messages.id desc
    limit before_count
  ),
  newer as (
    select messages.*
    from public.dm_messages messages
    cross join anchor
    where messages.conversation_id = target_conversation_id
      and (messages.created_at, messages.id) > (anchor.created_at, anchor.id)
    order by messages.created_at asc, messages.id asc
    limit after_count
  ),
  selected as (
    select * from older
    union all
    select target.*
    from public.dm_messages target
    where target.id = target_message_id
      and target.conversation_id = target_conversation_id
    union all
    select * from newer
  ),
  projected as (
    select
      to_jsonb(selected)
        || jsonb_build_object('sender', public.user_public_profile_json(profiles)) as message_json,
      selected.created_at,
      selected.id
    from selected
    join public.users profiles on profiles.id = selected.sender_id
  ),
  bounds as (
    select
      (select projected.created_at from projected order by projected.created_at, projected.id limit 1) as first_created_at,
      (select projected.id from projected order by projected.created_at, projected.id limit 1) as first_id,
      (select projected.created_at from projected order by projected.created_at desc, projected.id desc limit 1) as last_created_at,
      (select projected.id from projected order by projected.created_at desc, projected.id desc limit 1) as last_id
  )
  select
    coalesce(
      (select jsonb_agg(projected.message_json order by projected.created_at, projected.id) from projected),
      '[]'::jsonb
    ),
    exists (
      select 1
      from public.dm_messages candidates
      cross join bounds
      where candidates.conversation_id = target_conversation_id
        and (candidates.created_at, candidates.id) < (bounds.first_created_at, bounds.first_id)
    ),
    exists (
      select 1
      from public.dm_messages candidates
      cross join bounds
      where candidates.conversation_id = target_conversation_id
        and (candidates.created_at, candidates.id) > (bounds.last_created_at, bounds.last_id)
    ),
    'resolved'::text;
end;
$$;

revoke all on function public.get_dm_message_window(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_dm_message_window(uuid, uuid, integer)
  to authenticated;

comment on function public.get_dm_message_window(uuid, uuid, integer) is
  'Returns a bounded caller-visible chronological DM window centered on an exact message target.';

commit;
