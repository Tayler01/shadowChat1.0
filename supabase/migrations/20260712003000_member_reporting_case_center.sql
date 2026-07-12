/*
  # Member reporting and operator case center

  Adds an isolated safety-reporting domain. Existing product feedback, social
  Activity, notification delivery, channel-ban signatures, and old-client
  paths remain unchanged.
*/

begin;

create table public.member_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references public.users(id) on delete set null,
  subject_user_id uuid references public.users(id) on delete set null,
  target_type text not null check (target_type in (
    'user',
    'general_message',
    'dm_message',
    'shadow_pin_image',
    'shadow_pin_comment'
  )),
  target_id uuid not null,
  category text not null check (category in (
    'harassment',
    'immediate_safety',
    'hate_or_abuse',
    'sexual_content',
    'spam_or_scam',
    'privacy_or_impersonation',
    'self_harm',
    'other'
  )),
  details text not null default '' check (char_length(details) <= 2000),
  client_report_id uuid not null,
  submitted_at timestamptz not null default now(),
  constraint member_reports_other_details_check
    check (category <> 'other' or char_length(trim(details)) >= 10),
  constraint member_reports_reporter_client_unique
    unique (reporter_user_id, client_report_id)
);

create index member_reports_reporter_recent_idx
  on public.member_reports (reporter_user_id, submitted_at desc, id desc);
create index member_reports_subject_recent_idx
  on public.member_reports (subject_user_id, submitted_at desc, id desc);
create index member_reports_target_recent_idx
  on public.member_reports (target_type, target_id, submitted_at desc, id desc);

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  case_number bigint generated always as identity unique,
  subject_user_id uuid references public.users(id) on delete set null,
  target_type text not null check (target_type in (
    'user',
    'general_message',
    'dm_message',
    'shadow_pin_image',
    'shadow_pin_comment'
  )),
  target_id uuid not null,
  primary_category text not null check (primary_category in (
    'harassment',
    'immediate_safety',
    'hate_or_abuse',
    'sexual_content',
    'spam_or_scam',
    'privacy_or_impersonation',
    'self_harm',
    'other'
  )),
  status text not null default 'new' check (status in (
    'new',
    'triaged',
    'investigating',
    'waiting',
    'actioned',
    'resolved',
    'dismissed',
    'closed'
  )),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  assigned_to uuid references public.users(id) on delete set null,
  full_admin_only boolean not null default false,
  version integer not null default 1 check (version > 0),
  ack_due_at timestamptz not null,
  resolve_due_at timestamptz not null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  outcome_code text check (
    outcome_code is null or outcome_code in (
      'no_violation',
      'content_removed',
      'channel_restricted',
      'member_warned',
      'duplicate',
      'insufficient_evidence',
      'other'
    )
  ),
  reporter_summary text check (reporter_summary is null or char_length(reporter_summary) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index moderation_cases_one_open_target_idx
  on public.moderation_cases (target_type, target_id)
  where status not in ('resolved', 'dismissed', 'closed');
create index moderation_cases_queue_idx
  on public.moderation_cases (status, severity, updated_at desc, id desc);
create index moderation_cases_assignee_queue_idx
  on public.moderation_cases (assigned_to, status, updated_at desc, id desc);
create index moderation_cases_sla_idx
  on public.moderation_cases (resolve_due_at, id)
  where status not in ('resolved', 'dismissed', 'closed');

create table public.moderation_case_reports (
  case_id uuid not null references public.moderation_cases(id) on delete restrict,
  report_id uuid not null references public.member_reports(id) on delete restrict,
  linked_at timestamptz not null default now(),
  primary key (case_id, report_id),
  unique (report_id)
);

create index moderation_case_reports_case_recent_idx
  on public.moderation_case_reports (case_id, linked_at desc, report_id);

create table public.moderation_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete restrict,
  report_id uuid not null references public.member_reports(id) on delete restrict unique,
  target_type text not null,
  target_id uuid not null,
  source_author_id uuid references public.users(id) on delete set null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz not null default now()
);

create index moderation_evidence_case_recent_idx
  on public.moderation_evidence (case_id, captured_at desc, id desc);

create table public.moderation_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in (
    'case_created',
    'report_linked',
    'assigned',
    'released',
    'status_changed',
    'severity_changed',
    'note_added',
    'reporter_updated',
    'action_applied',
    'action_failed'
  )),
  visibility text not null default 'operator' check (visibility in ('operator', 'reporter')),
  from_status text,
  to_status text,
  internal_note text check (internal_note is null or char_length(internal_note) <= 4000),
  reporter_summary text check (reporter_summary is null or char_length(reporter_summary) <= 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index moderation_case_events_case_recent_idx
  on public.moderation_case_events (case_id, created_at desc, id desc);

create table public.moderation_case_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  action_type text not null check (action_type in ('no_action', 'remove_content', 'channel_ban')),
  status text not null check (status in ('applied', 'failed')),
  public_reason text check (public_reason is null or char_length(public_reason) <= 500),
  internal_note text check (internal_note is null or char_length(internal_note) <= 4000),
  requested_scopes text[] not null default '{}'::text[],
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  before_state jsonb not null default '{}'::jsonb check (jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null default '{}'::jsonb check (jsonb_typeof(after_state) = 'object'),
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  created_at timestamptz not null default now()
);

create index moderation_case_actions_case_recent_idx
  on public.moderation_case_actions (case_id, created_at desc, id desc);

create table public.moderation_action_channel_bans (
  action_id uuid not null references public.moderation_case_actions(id) on delete restrict,
  channel_ban_id uuid not null references public.user_channel_bans(id) on delete restrict,
  primary key (action_id, channel_ban_id)
);

create table public.moderation_report_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.member_reports(id) on delete restrict,
  uploader_user_id uuid references public.users(id) on delete set null,
  bucket text not null default 'moderation-evidence' check (bucket = 'moderation-evidence'),
  path text not null unique check (char_length(path) between 3 and 700),
  name text not null check (char_length(name) between 1 and 180),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  created_at timestamptz not null default now()
);

create index moderation_report_attachments_report_idx
  on public.moderation_report_attachments (report_id, created_at, id);

create table public.moderation_report_updates (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.member_reports(id) on delete restrict,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  update_type text not null check (update_type in ('received', 'in_review', 'resolved', 'dismissed', 'info')),
  message text not null check (char_length(message) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index moderation_report_updates_owner_recent_idx
  on public.moderation_report_updates (recipient_user_id, created_at desc, id desc);
create index moderation_report_updates_owner_unread_idx
  on public.moderation_report_updates (recipient_user_id, created_at desc, id desc)
  where read_at is null;

create or replace function private.reject_moderation_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE' then
    if tg_table_name = 'member_reports'
      and new_row - 'reporter_user_id' - 'subject_user_id' = old_row - 'reporter_user_id' - 'subject_user_id'
      and (new_row->'reporter_user_id' = old_row->'reporter_user_id' or new_row->'reporter_user_id' = 'null'::jsonb)
      and (new_row->'subject_user_id' = old_row->'subject_user_id' or new_row->'subject_user_id' = 'null'::jsonb) then
      return new;
    end if;
    if tg_table_name = 'moderation_evidence'
      and new_row - 'source_author_id' = old_row - 'source_author_id'
      and (new_row->'source_author_id' = old_row->'source_author_id' or new_row->'source_author_id' = 'null'::jsonb) then
      return new;
    end if;
    if tg_table_name = 'moderation_case_events'
      and new_row - 'actor_user_id' = old_row - 'actor_user_id'
      and (new_row->'actor_user_id' = old_row->'actor_user_id' or new_row->'actor_user_id' = 'null'::jsonb) then
      return new;
    end if;
    if tg_table_name = 'moderation_case_actions'
      and new_row - 'actor_user_id' = old_row - 'actor_user_id'
      and (new_row->'actor_user_id' = old_row->'actor_user_id' or new_row->'actor_user_id' = 'null'::jsonb) then
      return new;
    end if;
    if tg_table_name = 'moderation_report_attachments'
      and new_row - 'uploader_user_id' = old_row - 'uploader_user_id'
      and (new_row->'uploader_user_id' = old_row->'uploader_user_id' or new_row->'uploader_user_id' = 'null'::jsonb) then
      return new;
    end if;
  end if;
  raise exception 'Moderation intake and audit rows are immutable';
end;
$$;

create trigger member_reports_immutable
  before update or delete on public.member_reports
  for each row execute function private.reject_moderation_audit_mutation();
create trigger moderation_case_reports_immutable
  before update or delete on public.moderation_case_reports
  for each row execute function private.reject_moderation_audit_mutation();
create trigger moderation_evidence_immutable
  before update or delete on public.moderation_evidence
  for each row execute function private.reject_moderation_audit_mutation();
create trigger moderation_case_events_immutable
  before update or delete on public.moderation_case_events
  for each row execute function private.reject_moderation_audit_mutation();
create trigger moderation_case_actions_immutable
  before update or delete on public.moderation_case_actions
  for each row execute function private.reject_moderation_audit_mutation();
create trigger moderation_action_channel_bans_immutable
  before update or delete on public.moderation_action_channel_bans
  for each row execute function private.reject_moderation_audit_mutation();
create trigger moderation_report_attachments_immutable
  before update or delete on public.moderation_report_attachments
  for each row execute function private.reject_moderation_audit_mutation();

create trigger update_moderation_cases_updated_at
  before update on public.moderation_cases
  for each row execute function public.update_updated_at_column();

create or replace function private.can_operator_access_moderation_case(
  actor_user_id uuid,
  target_case_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_app_admin(actor_user_id)
    or (
      public.is_app_operator(actor_user_id)
      and exists (
        select 1
        from public.moderation_cases cases
        where cases.id = target_case_id
          and cases.full_admin_only is false
      )
    );
$$;

create or replace function private.can_operator_read_moderation_evidence(
  actor_user_id uuid,
  target_case_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_app_admin(actor_user_id)
    or (
      private.can_operator_access_moderation_case(actor_user_id, target_case_id)
      and exists (
        select 1
        from public.moderation_cases cases
        where cases.id = target_case_id
          and cases.assigned_to = actor_user_id
      )
    );
$$;

create or replace function private.can_read_moderation_attachment(
  actor_user_id uuid,
  object_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    split_part(object_path, '/', 1) = actor_user_id::text
    or exists (
      select 1
      from public.moderation_report_attachments attachments
      join public.moderation_case_reports links on links.report_id = attachments.report_id
      where attachments.path = object_path
        and private.can_operator_read_moderation_evidence(actor_user_id, links.case_id)
    );
$$;

create or replace function private.is_submitted_moderation_attachment(object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.moderation_report_attachments attachments
    where attachments.path = object_path
  );
$$;

revoke all on function private.reject_moderation_audit_mutation() from public, anon, authenticated;
revoke all on function private.can_operator_access_moderation_case(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_operator_read_moderation_evidence(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_read_moderation_attachment(uuid, text) from public, anon, authenticated;
revoke all on function private.is_submitted_moderation_attachment(text) from public, anon, authenticated;

alter table public.member_reports enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.moderation_case_reports enable row level security;
alter table public.moderation_evidence enable row level security;
alter table public.moderation_case_events enable row level security;
alter table public.moderation_case_actions enable row level security;
alter table public.moderation_action_channel_bans enable row level security;
alter table public.moderation_report_attachments enable row level security;
alter table public.moderation_report_updates enable row level security;

create policy "Reporters and eligible operators read member reports"
  on public.member_reports for select to authenticated
  using (
    reporter_user_id = (select auth.uid())
    or exists (
      select 1
      from public.moderation_case_reports links
      where links.report_id = member_reports.id
        and private.can_operator_read_moderation_evidence((select auth.uid()), links.case_id)
    )
  );

create policy "Eligible operators read moderation cases"
  on public.moderation_cases for select to authenticated
  using (
    public.is_app_admin((select auth.uid()))
    or (
      public.is_app_operator((select auth.uid()))
      and full_admin_only is false
    )
  );

create policy "Eligible operators read case report links"
  on public.moderation_case_reports for select to authenticated
  using (private.can_operator_read_moderation_evidence((select auth.uid()), case_id));

create policy "Assigned operators read moderation evidence"
  on public.moderation_evidence for select to authenticated
  using (private.can_operator_read_moderation_evidence((select auth.uid()), case_id));

create policy "Assigned operators read moderation events"
  on public.moderation_case_events for select to authenticated
  using (private.can_operator_read_moderation_evidence((select auth.uid()), case_id));

create policy "Assigned operators read moderation actions"
  on public.moderation_case_actions for select to authenticated
  using (private.can_operator_read_moderation_evidence((select auth.uid()), case_id));

create policy "Assigned operators read action ban links"
  on public.moderation_action_channel_bans for select to authenticated
  using (
    exists (
      select 1
      from public.moderation_case_actions actions
      where actions.id = moderation_action_channel_bans.action_id
        and private.can_operator_read_moderation_evidence((select auth.uid()), actions.case_id)
    )
  );

create policy "Reporters and assigned operators read report attachments"
  on public.moderation_report_attachments for select to authenticated
  using (
    exists (
      select 1
      from public.member_reports reports
      where reports.id = moderation_report_attachments.report_id
        and (
          reports.reporter_user_id = (select auth.uid())
          or exists (
            select 1
            from public.moderation_case_reports links
            where links.report_id = reports.id
              and private.can_operator_read_moderation_evidence((select auth.uid()), links.case_id)
          )
        )
    )
  );

create policy "Recipients read own moderation report updates"
  on public.moderation_report_updates for select to authenticated
  using (recipient_user_id = (select auth.uid()));
create policy "Recipients mark own moderation report updates read"
  on public.moderation_report_updates for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

revoke all on table public.member_reports from public, anon, authenticated;
revoke all on table public.moderation_cases from public, anon, authenticated;
revoke all on table public.moderation_case_reports from public, anon, authenticated;
revoke all on table public.moderation_evidence from public, anon, authenticated;
revoke all on table public.moderation_case_events from public, anon, authenticated;
revoke all on table public.moderation_case_actions from public, anon, authenticated;
revoke all on table public.moderation_action_channel_bans from public, anon, authenticated;
revoke all on table public.moderation_report_attachments from public, anon, authenticated;
revoke all on table public.moderation_report_updates from public, anon, authenticated;

grant select on table public.moderation_cases to authenticated;
grant select, update (read_at) on table public.moderation_report_updates to authenticated;
grant all on table public.member_reports to service_role;
grant all on table public.moderation_cases to service_role;
grant all on table public.moderation_case_reports to service_role;
grant all on table public.moderation_evidence to service_role;
grant all on table public.moderation_case_events to service_role;
grant all on table public.moderation_case_actions to service_role;
grant all on table public.moderation_action_channel_bans to service_role;
grant all on table public.moderation_report_attachments to service_role;
grant all on table public.moderation_report_updates to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'moderation-evidence',
  'moderation-evidence',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Members upload own staged moderation evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'moderation-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Members read own moderation evidence uploads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'moderation-evidence'
    and private.can_read_moderation_attachment((select auth.uid()), storage.objects.name)
  );

create policy "Members delete own staged moderation evidence"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'moderation-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not private.is_submitted_moderation_attachment(storage.objects.name)
  );

create or replace function public.submit_member_report(
  p_target_type text,
  p_target_id uuid,
  p_category text,
  p_client_report_id uuid,
  p_details text default '',
  p_attachments jsonb default '[]'::jsonb
)
returns table (
  report_id uuid,
  case_id uuid,
  case_number bigint,
  case_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_target_type text := lower(trim(coalesce(p_target_type, '')));
  normalized_category text := lower(trim(coalesce(p_category, '')));
  normalized_details text := trim(coalesce(p_details, ''));
  resolved_subject_id uuid;
  target_snapshot jsonb;
  subject_snapshot jsonb;
  resolved_report_id uuid;
  resolved_case_id uuid;
  resolved_case_number bigint;
  resolved_case_status text;
  source_created_at timestamptz;
  initial_severity text;
  ack_interval interval;
  resolve_interval interval;
  attachment jsonb;
  attachment_path text;
  attachment_name text;
  attachment_object storage.objects%rowtype;
  attachment_size bigint;
  attachment_type text;
  existing_severity text;
  existing_full_admin_only boolean;
  report_requires_full_admin boolean;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if p_target_id is null or p_client_report_id is null then
    raise exception 'A target and client report id are required';
  end if;

  if normalized_target_type not in (
    'user', 'general_message', 'dm_message', 'shadow_pin_image', 'shadow_pin_comment'
  ) then
    raise exception 'Unsupported report target';
  end if;

  if normalized_category not in (
    'harassment', 'immediate_safety', 'hate_or_abuse', 'sexual_content',
    'spam_or_scam', 'privacy_or_impersonation', 'self_harm', 'other'
  ) then
    raise exception 'Choose a valid report reason';
  end if;

  if char_length(normalized_details) > 2000 then
    raise exception 'Report details are too long';
  end if;

  if normalized_category = 'other' and char_length(normalized_details) < 10 then
    raise exception 'Add at least 10 characters of detail for Other';
  end if;

  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 5 then
    raise exception 'Attach up to 5 evidence images';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text, 742031)
  );

  select
    reports.id,
    links.case_id,
    cases.case_number,
    cases.status
  into
    resolved_report_id,
    resolved_case_id,
    resolved_case_number,
    resolved_case_status
  from public.member_reports reports
  join public.moderation_case_reports links on links.report_id = reports.id
  join public.moderation_cases cases on cases.id = links.case_id
  where reports.reporter_user_id = caller_id
    and reports.client_report_id = p_client_report_id;

  if found then
    return query select
      resolved_report_id,
      resolved_case_id,
      resolved_case_number,
      resolved_case_status;
    return;
  end if;

  if (
    select count(*)
    from public.member_reports reports
    where reports.reporter_user_id = caller_id
      and reports.submitted_at >= now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Too many reports were submitted. Wait a few minutes and try again';
  end if;

  if (
    select count(*)
    from public.member_reports reports
    where reports.reporter_user_id = caller_id
      and reports.submitted_at >= now() - interval '24 hours'
  ) >= 20 then
    raise exception 'Daily report limit reached';
  end if;

  if normalized_target_type = 'user' then
    select
      users.id,
      users.created_at,
      jsonb_build_object(
        'targetType', 'user',
        'targetId', users.id,
        'username', users.username,
        'displayName', users.display_name,
        'avatarUrl', users.avatar_url,
        'avatarThumbnailUrl', users.avatar_thumbnail_url,
        'statusMessage', users.status_message,
        'createdAt', users.created_at
      )
    into resolved_subject_id, source_created_at, target_snapshot
    from public.users users
    where users.id = p_target_id
      and not private.users_have_block(caller_id, users.id);
  elsif normalized_target_type = 'general_message' then
    select
      messages.user_id,
      messages.created_at,
      jsonb_build_object(
        'targetType', 'general_message',
        'targetId', messages.id,
        'authorId', messages.user_id,
        'content', messages.content,
        'messageType', messages.message_type,
        'fileUrl', messages.file_url,
        'thumbnailUrl', messages.thumbnail_url,
        'audioUrl', messages.audio_url,
        'createdAt', messages.created_at,
        'editedAt', messages.edited_at
      )
    into resolved_subject_id, source_created_at, target_snapshot
    from public.messages messages
    where messages.id = p_target_id
      and not private.users_have_block(caller_id, messages.user_id);
  elsif normalized_target_type = 'dm_message' then
    select
      messages.sender_id,
      messages.created_at,
      jsonb_build_object(
        'targetType', 'dm_message',
        'targetId', messages.id,
        'authorId', messages.sender_id,
        'content', messages.content,
        'messageType', messages.message_type,
        'fileUrl', messages.file_url,
        'thumbnailUrl', messages.thumbnail_url,
        'audioUrl', messages.audio_url,
        'createdAt', messages.created_at,
        'editedAt', messages.edited_at
      )
    into resolved_subject_id, source_created_at, target_snapshot
    from public.dm_messages messages
    join public.dm_conversations conversations on conversations.id = messages.conversation_id
    where messages.id = p_target_id
      and caller_id = any(conversations.participants)
      and not private.users_have_block(caller_id, messages.sender_id);
  elsif normalized_target_type = 'shadow_pin_image' then
    select
      images.creator_id,
      images.created_at,
      jsonb_build_object(
        'targetType', 'shadow_pin_image',
        'targetId', images.id,
        'authorId', images.creator_id,
        'title', images.title,
        'description', images.description,
        'imageUrl', images.image_url,
        'thumbnailUrl', images.thumbnail_url,
        'mediaType', images.media_type,
        'sourceUrl', images.source_url,
        'createdAt', images.created_at
      )
    into resolved_subject_id, source_created_at, target_snapshot
    from public.shadow_pin_images images
    where images.id = p_target_id
      and images.deleted_at is null
      and images.category_id is not null
      and images.creator_id is not null
      and not private.users_have_block(caller_id, images.creator_id);
  else
    select
      comments.author_id,
      comments.created_at,
      jsonb_build_object(
        'targetType', 'shadow_pin_comment',
        'targetId', comments.id,
        'authorId', comments.author_id,
        'body', comments.body,
        'imageId', comments.image_id,
        'imageTitle', images.title,
        'parentCommentId', comments.parent_comment_id,
        'createdAt', comments.created_at,
        'updatedAt', comments.updated_at
      )
    into resolved_subject_id, source_created_at, target_snapshot
    from public.shadow_pin_comments comments
    join public.shadow_pin_images images on images.id = comments.image_id
    where comments.id = p_target_id
      and images.deleted_at is null
      and not private.users_have_block(caller_id, comments.author_id);
  end if;

  if target_snapshot is null or resolved_subject_id is null then
    raise exception 'This report target is not available';
  end if;

  if resolved_subject_id = caller_id then
    raise exception 'You cannot report your own content or profile';
  end if;

  select jsonb_build_object(
    'id', users.id,
    'username', users.username,
    'displayName', users.display_name,
    'avatarUrl', users.avatar_url,
    'avatarThumbnailUrl', users.avatar_thumbnail_url,
    'adminRole', users.admin_role
  )
  into subject_snapshot
  from public.users users
  where users.id = resolved_subject_id;

  select exists (
    select 1
    from public.user_roles roles
    where roles.user_id in (caller_id, resolved_subject_id)
      and roles.role in ('admin', 'sub_admin')
  ) into report_requires_full_admin;

  target_snapshot := target_snapshot || jsonb_build_object(
    'subject', coalesce(subject_snapshot, '{}'::jsonb),
    'capturedAt', now(),
    'sourceCreatedAt', source_created_at
  );

  select
    reports.id,
    links.case_id,
    cases.case_number,
    cases.status
  into
    resolved_report_id,
    resolved_case_id,
    resolved_case_number,
    resolved_case_status
  from public.member_reports reports
  join public.moderation_case_reports links on links.report_id = reports.id
  join public.moderation_cases cases on cases.id = links.case_id
  where reports.reporter_user_id = caller_id
    and reports.target_type = normalized_target_type
    and reports.target_id = p_target_id
    and reports.category = normalized_category
    and reports.details = normalized_details
    and reports.submitted_at >= now() - interval '5 minutes'
  order by reports.submitted_at desc
  limit 1;

  if found then
    return query select
      resolved_report_id,
      resolved_case_id,
      resolved_case_number,
      resolved_case_status;
    return;
  end if;

  initial_severity := case normalized_category
    when 'immediate_safety' then 'critical'
    when 'hate_or_abuse' then 'high'
    when 'sexual_content' then 'high'
    when 'privacy_or_impersonation' then 'high'
    when 'self_harm' then 'high'
    when 'harassment' then 'medium'
    when 'spam_or_scam' then 'medium'
    else 'low'
  end;

  ack_interval := case initial_severity
    when 'critical' then interval '15 minutes'
    when 'high' then interval '1 hour'
    when 'medium' then interval '8 hours'
    else interval '24 hours'
  end;
  resolve_interval := case initial_severity
    when 'critical' then interval '4 hours'
    when 'high' then interval '24 hours'
    when 'medium' then interval '72 hours'
    else interval '7 days'
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_target_type || ':' || p_target_id::text, 742032)
  );

  select cases.id, cases.case_number, cases.status, cases.severity, cases.full_admin_only
  into resolved_case_id, resolved_case_number, resolved_case_status, existing_severity, existing_full_admin_only
  from public.moderation_cases cases
  where cases.target_type = normalized_target_type
    and cases.target_id = p_target_id
    and cases.status not in ('resolved', 'dismissed', 'closed')
  for update;

  if not found then
    insert into public.moderation_cases as created_case (
      subject_user_id,
      target_type,
      target_id,
      primary_category,
      severity,
      full_admin_only,
      ack_due_at,
      resolve_due_at
    ) values (
      resolved_subject_id,
      normalized_target_type,
      p_target_id,
      normalized_category,
      initial_severity,
      report_requires_full_admin,
      now() + ack_interval,
      now() + resolve_interval
    )
    returning created_case.id, created_case.case_number, created_case.status
    into resolved_case_id, resolved_case_number, resolved_case_status;

    existing_full_admin_only := report_requires_full_admin;

    insert into public.moderation_case_events (
      case_id,
      event_type,
      metadata
    ) values (
      resolved_case_id,
      'case_created',
      jsonb_build_object('severity', initial_severity, 'targetType', normalized_target_type)
    );
  elsif (
    case initial_severity
      when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1
    end
  ) > (
    case existing_severity
      when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1
    end
  ) then
    update public.moderation_cases
    set
      severity = initial_severity,
      ack_due_at = least(ack_due_at, now() + ack_interval),
      resolve_due_at = least(resolve_due_at, now() + resolve_interval),
      version = version + 1
    where id = resolved_case_id;

    insert into public.moderation_case_events (
      case_id,
      event_type,
      metadata
    ) values (
      resolved_case_id,
      'severity_changed',
      jsonb_build_object('from', existing_severity, 'to', initial_severity, 'reason', 'new_report')
    );
  end if;

  if report_requires_full_admin and not coalesce(existing_full_admin_only, false) then
    update public.moderation_cases cases
    set
      full_admin_only = true,
      version = cases.version + 1
    where cases.id = resolved_case_id
      and cases.full_admin_only is false;
  end if;

  resolved_report_id := gen_random_uuid();
  insert into public.member_reports (
    id,
    reporter_user_id,
    subject_user_id,
    target_type,
    target_id,
    category,
    details,
    client_report_id
  ) values (
    resolved_report_id,
    caller_id,
    resolved_subject_id,
    normalized_target_type,
    p_target_id,
    normalized_category,
    normalized_details,
    p_client_report_id
  );

  insert into public.moderation_case_reports (case_id, report_id)
  values (resolved_case_id, resolved_report_id);

  insert into public.moderation_evidence (
    case_id,
    report_id,
    target_type,
    target_id,
    source_author_id,
    snapshot,
    content_hash
  ) values (
    resolved_case_id,
    resolved_report_id,
    normalized_target_type,
    p_target_id,
    resolved_subject_id,
    target_snapshot,
    pg_catalog.encode(extensions.digest(target_snapshot::text, 'sha256'), 'hex')
  );

  for attachment in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    if jsonb_typeof(attachment) <> 'object' then
      raise exception 'Invalid evidence attachment';
    end if;

    attachment_path := trim(coalesce(attachment->>'path', ''));
    attachment_name := left(trim(coalesce(attachment->>'name', 'Evidence image')), 180);

    if attachment_path not like caller_id::text || '/' || p_client_report_id::text || '/%'
      or attachment_name = '' then
      raise exception 'Invalid evidence attachment path';
    end if;

    select objects.*
    into attachment_object
    from storage.objects objects
    where objects.bucket_id = 'moderation-evidence'
      and objects.name = attachment_path;

    if not found then
      raise exception 'Evidence attachment upload is missing';
    end if;

    attachment_size := coalesce((attachment_object.metadata->>'size')::bigint, 0);
    attachment_type := coalesce(
      attachment_object.metadata->>'mimetype',
      attachment_object.metadata->>'contentType',
      ''
    );

    if attachment_size < 1 or attachment_size > 10485760
      or attachment_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') then
      raise exception 'Evidence attachment does not meet file limits';
    end if;

    insert into public.moderation_report_attachments (
      report_id,
      uploader_user_id,
      path,
      name,
      size_bytes,
      content_type
    ) values (
      resolved_report_id,
      caller_id,
      attachment_path,
      attachment_name,
      attachment_size,
      attachment_type
    );
  end loop;

  insert into public.moderation_case_events (
    case_id,
    event_type,
    metadata
  ) values (
    resolved_case_id,
    'report_linked',
    jsonb_build_object('reportId', resolved_report_id, 'category', normalized_category)
  );

  insert into public.moderation_report_updates (
    report_id,
    recipient_user_id,
    update_type,
    message
  ) values (
    resolved_report_id,
    caller_id,
    'received',
    'Your report was received and is ready for safety review.'
  );

  select cases.status
  into resolved_case_status
  from public.moderation_cases cases
  where cases.id = resolved_case_id;

  return query select
    resolved_report_id,
    resolved_case_id,
    resolved_case_number,
    resolved_case_status;
end;
$$;

create or replace function public.list_my_member_reports(
  p_limit integer default 30,
  p_before_submitted_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  report_id uuid,
  case_number bigint,
  target_type text,
  category text,
  status text,
  target_preview text,
  reporter_summary text,
  submitted_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if (p_before_submitted_at is null) <> (p_before_id is null) then
    raise exception 'Report cursor must include timestamp and id';
  end if;

  return query
  select
    reports.id,
    cases.case_number,
    reports.target_type,
    reports.category,
    cases.status,
    left(coalesce(
      evidence.snapshot->>'title',
      evidence.snapshot->>'content',
      evidence.snapshot->>'body',
      evidence.snapshot->>'displayName',
      evidence.snapshot->'subject'->>'displayName',
      replace(reports.target_type, '_', ' ')
    ), 180),
    cases.reporter_summary,
    reports.submitted_at,
    cases.updated_at
  from public.member_reports reports
  join public.moderation_case_reports links on links.report_id = reports.id
  join public.moderation_cases cases on cases.id = links.case_id
  join public.moderation_evidence evidence on evidence.report_id = reports.id
  where reports.reporter_user_id = caller_id
    and (
      p_before_submitted_at is null
      or (reports.submitted_at, reports.id) < (p_before_submitted_at, p_before_id)
    )
  order by reports.submitted_at desc, reports.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
end;
$$;

create or replace function public.list_moderation_cases(
  p_queue text default 'new',
  p_status text default null,
  p_severity text default null,
  p_target_type text default null,
  p_category text default null,
  p_search text default null,
  p_limit integer default 30,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  case_id uuid,
  case_number bigint,
  status text,
  severity text,
  target_type text,
  primary_category text,
  subject_user_id uuid,
  subject_username text,
  subject_display_name text,
  subject_avatar_url text,
  assigned_to uuid,
  assignee_username text,
  assignee_display_name text,
  report_count bigint,
  ack_due_at timestamptz,
  resolve_due_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_queue text := lower(trim(coalesce(p_queue, 'new')));
  normalized_search text := lower(trim(coalesce(p_search, '')));
begin
  if caller_id is null or not public.is_app_operator(caller_id) then
    raise exception 'Operator access required';
  end if;

  if normalized_queue not in ('new', 'mine', 'in_review', 'resolved', 'all') then
    raise exception 'Invalid case queue';
  end if;

  if char_length(normalized_search) > 100 then
    raise exception 'Case search is too long';
  end if;

  if (p_before_updated_at is null) <> (p_before_id is null) then
    raise exception 'Case cursor must include timestamp and id';
  end if;

  return query
  select
    cases.id,
    cases.case_number,
    cases.status,
    cases.severity,
    cases.target_type,
    cases.primary_category,
    cases.subject_user_id,
    subjects.username,
    subjects.display_name,
    coalesce(subjects.avatar_thumbnail_url, subjects.avatar_url),
    cases.assigned_to,
    assignees.username,
    assignees.display_name,
    count(links.report_id),
    cases.ack_due_at,
    cases.resolve_due_at,
    cases.created_at,
    cases.updated_at,
    cases.version
  from public.moderation_cases cases
  left join public.users subjects on subjects.id = cases.subject_user_id
  left join public.users assignees on assignees.id = cases.assigned_to
  left join public.moderation_case_reports links on links.case_id = cases.id
  where private.can_operator_access_moderation_case(caller_id, cases.id)
    and (
      normalized_queue = 'all'
      or (normalized_queue = 'new' and cases.status = 'new')
      or (normalized_queue = 'mine' and cases.assigned_to = caller_id and cases.status not in ('resolved', 'dismissed', 'closed'))
      or (normalized_queue = 'in_review' and cases.status in ('triaged', 'investigating', 'waiting', 'actioned'))
      or (normalized_queue = 'resolved' and cases.status in ('resolved', 'dismissed', 'closed'))
    )
    and (p_status is null or cases.status = p_status)
    and (p_severity is null or cases.severity = p_severity)
    and (p_target_type is null or cases.target_type = p_target_type)
    and (p_category is null or cases.primary_category = p_category)
    and (
      normalized_search = ''
      or cases.case_number::text like '%' || normalized_search || '%'
      or lower(coalesce(subjects.username, '')) like '%' || normalized_search || '%'
      or lower(coalesce(subjects.display_name, '')) like '%' || normalized_search || '%'
    )
    and (
      p_before_updated_at is null
      or (cases.updated_at, cases.id) < (p_before_updated_at, p_before_id)
    )
  group by cases.id, subjects.id, assignees.id
  order by
    case cases.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
    cases.updated_at desc,
    cases.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
end;
$$;

create or replace function public.get_moderation_case(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_case public.moderation_cases%rowtype;
begin
  if caller_id is null or not public.is_app_operator(caller_id) then
    raise exception 'Operator access required';
  end if;

  select * into target_case
  from public.moderation_cases cases
  where cases.id = p_case_id;

  if not found or not private.can_operator_access_moderation_case(caller_id, p_case_id) then
    raise exception 'Case is not available';
  end if;

  if not public.is_app_admin(caller_id)
    and target_case.assigned_to is distinct from caller_id then
    raise exception 'Claim this case before opening private evidence';
  end if;

  return jsonb_build_object(
    'case', to_jsonb(target_case) || jsonb_build_object(
      'subject', (
        select to_jsonb(users)
        from (
          select id, username, display_name, avatar_url, avatar_thumbnail_url, color, admin_role, created_at
          from public.users
          where id = target_case.subject_user_id
        ) users
      ),
      'assignee', (
        select to_jsonb(users)
        from (
          select id, username, display_name, avatar_url, avatar_thumbnail_url
          from public.users
          where id = target_case.assigned_to
        ) users
      )
    ),
    'reports', coalesce((
      select jsonb_agg(
        to_jsonb(reports) || jsonb_build_object(
          'reporter', (
            select to_jsonb(users)
            from (
              select id, username, display_name, avatar_url, avatar_thumbnail_url, color, admin_role
              from public.users
              where id = reports.reporter_user_id
            ) users
          ),
          'attachments', coalesce((
            select jsonb_agg(to_jsonb(attachments) order by attachments.created_at, attachments.id)
            from public.moderation_report_attachments attachments
            where attachments.report_id = reports.id
          ), '[]'::jsonb)
        ) order by reports.submitted_at, reports.id
      )
      from public.moderation_case_reports links
      join public.member_reports reports on reports.id = links.report_id
      where links.case_id = target_case.id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(to_jsonb(evidence) order by evidence.captured_at, evidence.id)
      from public.moderation_evidence evidence
      where evidence.case_id = target_case.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        to_jsonb(events) || jsonb_build_object(
          'actor', (
            select to_jsonb(users)
            from (
              select id, username, display_name, avatar_url, avatar_thumbnail_url
              from public.users
              where id = events.actor_user_id
            ) users
          )
        ) order by events.created_at, events.id
      )
      from public.moderation_case_events events
      where events.case_id = target_case.id
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(to_jsonb(actions) order by actions.created_at, actions.id)
      from public.moderation_case_actions actions
      where actions.case_id = target_case.id
    ), '[]'::jsonb),
    'activeBans', coalesce((
      select jsonb_agg(to_jsonb(bans) order by bans.scope, bans.created_at)
      from public.user_channel_bans bans
      where bans.target_user_id = target_case.subject_user_id
        and bans.revoked_at is null
        and (bans.expires_at is null or bans.expires_at > now())
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.assign_moderation_case(
  p_case_id uuid,
  p_expected_version integer,
  p_assignee_id uuid
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_case public.moderation_cases%rowtype;
  next_status text;
  event_name text;
  previous_status text;
begin
  if caller_id is null or not public.is_app_operator(caller_id) then
    raise exception 'Operator access required';
  end if;

  select * into target_case
  from public.moderation_cases cases
  where cases.id = p_case_id
  for update;

  if not found or not private.can_operator_access_moderation_case(caller_id, p_case_id) then
    raise exception 'Case is not available';
  end if;

  if target_case.version <> p_expected_version then
    raise exception 'Case changed. Refresh before saving';
  end if;

  if p_assignee_id is not null and not public.is_app_operator(p_assignee_id) then
    raise exception 'Assignee must be an operator';
  end if;

  if not public.is_app_admin(caller_id) then
    if p_assignee_id is distinct from caller_id and p_assignee_id is not null then
      raise exception 'Only the full admin can assign another operator';
    end if;
    if target_case.assigned_to is not null
      and target_case.assigned_to <> caller_id
      and p_assignee_id is distinct from target_case.assigned_to then
      raise exception 'This case is assigned to another operator';
    end if;
  end if;

  if p_assignee_id is not null
    and not private.can_operator_access_moderation_case(p_assignee_id, p_case_id) then
    raise exception 'That operator cannot access this protected case';
  end if;

  next_status := case
    when p_assignee_id is not null and target_case.status = 'new' then 'triaged'
    else target_case.status
  end;
  event_name := case when p_assignee_id is null then 'released' else 'assigned' end;
  previous_status := target_case.status;

  update public.moderation_cases cases
  set
    assigned_to = p_assignee_id,
    status = next_status,
    first_response_at = case
      when p_assignee_id is not null then coalesce(cases.first_response_at, now())
      else cases.first_response_at
    end,
    version = cases.version + 1
  where cases.id = p_case_id
  returning * into target_case;

  insert into public.moderation_case_events (
    case_id,
    actor_user_id,
    event_type,
    from_status,
    to_status,
    metadata
  ) values (
    p_case_id,
    caller_id,
    event_name,
    previous_status,
    next_status,
    jsonb_build_object('assigneeId', p_assignee_id)
  );

  return target_case;
end;
$$;

create or replace function public.transition_moderation_case(
  p_case_id uuid,
  p_expected_version integer,
  p_status text default null,
  p_severity text default null,
  p_outcome_code text default null,
  p_internal_note text default null,
  p_reporter_summary text default null
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_case public.moderation_cases%rowtype;
  next_status text;
  next_severity text;
  next_outcome text;
  normalized_note text := nullif(trim(coalesce(p_internal_note, '')), '');
  normalized_summary text := nullif(trim(coalesce(p_reporter_summary, '')), '');
  update_type text;
  previous_status text;
  previous_severity text;
begin
  if caller_id is null or not public.is_app_operator(caller_id) then
    raise exception 'Operator access required';
  end if;

  select * into target_case
  from public.moderation_cases cases
  where cases.id = p_case_id
  for update;

  if not found or not private.can_operator_access_moderation_case(caller_id, p_case_id) then
    raise exception 'Case is not available';
  end if;

  if not public.is_app_admin(caller_id)
    and target_case.assigned_to is distinct from caller_id then
    raise exception 'Claim this case before updating it';
  end if;

  if target_case.version <> p_expected_version then
    raise exception 'Case changed. Refresh before saving';
  end if;

  if normalized_note is not null and char_length(normalized_note) > 4000 then
    raise exception 'Internal note is too long';
  end if;
  if normalized_summary is not null and char_length(normalized_summary) > 1000 then
    raise exception 'Reporter update is too long';
  end if;

  next_status := coalesce(nullif(trim(p_status), ''), target_case.status);
  next_severity := coalesce(nullif(trim(p_severity), ''), target_case.severity);
  next_outcome := coalesce(nullif(trim(p_outcome_code), ''), target_case.outcome_code);

  if next_status not in ('new', 'triaged', 'investigating', 'waiting', 'actioned', 'resolved', 'dismissed', 'closed') then
    raise exception 'Invalid case status';
  end if;
  if next_severity not in ('low', 'medium', 'high', 'critical') then
    raise exception 'Invalid case severity';
  end if;
  if next_outcome is not null and next_outcome not in (
    'no_violation', 'content_removed', 'channel_restricted', 'member_warned',
    'duplicate', 'insufficient_evidence', 'other'
  ) then
    raise exception 'Invalid case outcome';
  end if;

  if target_case.status in ('resolved', 'dismissed', 'closed')
    and next_status not in ('resolved', 'dismissed', 'closed')
    and not public.is_app_admin(caller_id) then
    raise exception 'Only the full admin can reopen a completed case';
  end if;

  if target_case.status is distinct from next_status
    and not (
      (target_case.status = 'new' and next_status in ('triaged', 'investigating', 'resolved', 'dismissed'))
      or (target_case.status = 'triaged' and next_status in ('investigating', 'waiting', 'actioned', 'resolved', 'dismissed'))
      or (target_case.status = 'investigating' and next_status in ('waiting', 'actioned', 'resolved', 'dismissed'))
      or (target_case.status = 'waiting' and next_status in ('investigating', 'actioned', 'resolved', 'dismissed'))
      or (target_case.status = 'actioned' and next_status in ('investigating', 'resolved', 'dismissed'))
      or (target_case.status in ('resolved', 'dismissed') and next_status = 'closed' and public.is_app_admin(caller_id))
      or (target_case.status in ('resolved', 'dismissed', 'closed') and next_status = 'investigating' and public.is_app_admin(caller_id))
    ) then
    raise exception 'Invalid case status transition';
  end if;

  if next_status in ('resolved', 'dismissed', 'closed')
    and normalized_summary is null
    and target_case.reporter_summary is null then
    raise exception 'Add a reporter-visible resolution summary';
  end if;

  if next_status in ('resolved', 'dismissed', 'closed') and next_outcome is null then
    raise exception 'Choose a case outcome';
  end if;

  previous_status := target_case.status;
  previous_severity := target_case.severity;

  update public.moderation_cases cases
  set
    status = next_status,
    severity = next_severity,
    outcome_code = next_outcome,
    reporter_summary = coalesce(normalized_summary, cases.reporter_summary),
    resolved_at = case
      when next_status in ('resolved', 'dismissed', 'closed') then coalesce(cases.resolved_at, now())
      else null
    end,
    version = cases.version + 1
  where cases.id = p_case_id
  returning * into target_case;

  if previous_status is distinct from next_status then
    insert into public.moderation_case_events (
      case_id, actor_user_id, event_type, from_status, to_status, internal_note
    ) values (
      p_case_id, caller_id, 'status_changed', previous_status, next_status, normalized_note
    );
  elsif next_severity is distinct from previous_severity then
    insert into public.moderation_case_events (
      case_id, actor_user_id, event_type, internal_note, metadata
    ) values (
      p_case_id, caller_id, 'severity_changed', normalized_note,
      jsonb_build_object('from', previous_severity, 'to', next_severity)
    );
  elsif normalized_note is not null then
    insert into public.moderation_case_events (
      case_id, actor_user_id, event_type, internal_note
    ) values (
      p_case_id, caller_id, 'note_added', normalized_note
    );
  end if;

  if normalized_summary is not null then
    insert into public.moderation_case_events (
      case_id, actor_user_id, event_type, visibility, reporter_summary
    ) values (
      p_case_id, caller_id, 'reporter_updated', 'reporter', normalized_summary
    );

    update_type := case
      when next_status = 'dismissed' then 'dismissed'
      when next_status in ('resolved', 'closed') then 'resolved'
      when next_status in ('triaged', 'investigating', 'waiting', 'actioned') then 'in_review'
      else 'info'
    end;

    insert into public.moderation_report_updates (
      report_id,
      recipient_user_id,
      update_type,
      message
    )
    select
      reports.id,
      reports.reporter_user_id,
      update_type,
      normalized_summary
    from public.moderation_case_reports links
    join public.member_reports reports on reports.id = links.report_id
    where links.case_id = p_case_id
      and reports.reporter_user_id is not null;
  end if;

  select * into target_case
  from public.moderation_cases cases
  where cases.id = p_case_id;

  return target_case;
end;
$$;

create or replace function public.apply_moderation_case_action(
  p_case_id uuid,
  p_expected_version integer,
  p_action_type text,
  p_requested_scopes text[] default '{}'::text[],
  p_duration_minutes integer default null,
  p_public_reason text default null,
  p_internal_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_case public.moderation_cases%rowtype;
  normalized_action text := lower(trim(coalesce(p_action_type, '')));
  normalized_public_reason text := nullif(trim(coalesce(p_public_reason, '')), '');
  normalized_note text := nullif(trim(coalesce(p_internal_note, '')), '');
  clean_scopes text[];
  target_role text;
  resolved_action_id uuid := gen_random_uuid();
  before_state jsonb := '{}'::jsonb;
  after_state jsonb := '{}'::jsonb;
  action_error text;
  removed_count integer := 0;
  resulting_ban public.user_channel_bans%rowtype;
  resulting_ban_ids uuid[] := '{}'::uuid[];
  previous_case_status text;
begin
  if caller_id is null or not public.is_app_operator(caller_id) then
    raise exception 'Operator access required';
  end if;

  select * into target_case
  from public.moderation_cases cases
  where cases.id = p_case_id
  for update;

  if not found or not private.can_operator_access_moderation_case(caller_id, p_case_id) then
    raise exception 'Case is not available';
  end if;

  if not public.is_app_admin(caller_id)
    and target_case.assigned_to is distinct from caller_id then
    raise exception 'Claim this case before applying an action';
  end if;

  if target_case.version <> p_expected_version then
    raise exception 'Case changed. Refresh before applying an action';
  end if;

  if normalized_action not in ('no_action', 'remove_content', 'channel_ban') then
    raise exception 'Invalid case action';
  end if;

  if normalized_note is not null and char_length(normalized_note) > 4000 then
    raise exception 'Internal note is too long';
  end if;
  if normalized_public_reason is not null and char_length(normalized_public_reason) > 500 then
    raise exception 'Public reason is too long';
  end if;

  select roles.role into target_role
  from public.user_roles roles
  where roles.user_id = target_case.subject_user_id
    and roles.role in ('admin', 'sub_admin')
  order by case roles.role when 'admin' then 0 else 1 end
  limit 1;

  if normalized_action <> 'no_action' then
    if target_case.subject_user_id is null then
      raise exception 'This case no longer has an actionable member';
    end if;
    if target_case.subject_user_id = caller_id then
      raise exception 'Operators cannot take action against themselves';
    end if;
    if target_role = 'admin' then
      raise exception 'The full admin account cannot be sanctioned';
    end if;
    if target_role = 'sub_admin' and not public.is_app_admin(caller_id) then
      raise exception 'Only the full admin can sanction a sub-admin';
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(bans) order by bans.scope, bans.created_at), '[]'::jsonb)
  into before_state
  from public.user_channel_bans bans
  where bans.target_user_id = target_case.subject_user_id
    and bans.revoked_at is null
    and (bans.expires_at is null or bans.expires_at > now());

  before_state := jsonb_build_object(
    'activeBans', before_state,
    'targetType', target_case.target_type,
    'targetId', target_case.target_id
  );

  begin
    if normalized_action = 'channel_ban' then
      if normalized_public_reason is null then
        raise exception 'A public channel-ban reason is required';
      end if;

      select coalesce(array_agg(distinct scope order by scope), '{}'::text[])
      into clean_scopes
      from unnest(coalesce(p_requested_scopes, '{}'::text[])) scope
      where scope in ('general_chat', 'all_interaction');

      if exists (
        select 1
        from public.user_channel_bans bans
        where bans.target_user_id = target_case.subject_user_id
          and bans.revoked_at is null
          and (bans.expires_at is null or bans.expires_at > now())
          and bans.scope not in ('general_chat', 'all_interaction')
      ) then
        raise exception 'This member has legacy scoped restrictions. Review the full ban set from their profile first';
      end if;

      for resulting_ban in
        select *
        from public.set_user_channel_bans(
          target_case.subject_user_id,
          clean_scopes,
          p_duration_minutes,
          normalized_public_reason
        )
      loop
        resulting_ban_ids := array_append(resulting_ban_ids, resulting_ban.id);
      end loop;

      select jsonb_build_object(
        'activeBans', coalesce(jsonb_agg(to_jsonb(bans) order by bans.scope, bans.created_at), '[]'::jsonb)
      )
      into after_state
      from public.user_channel_bans bans
      where bans.target_user_id = target_case.subject_user_id
        and bans.revoked_at is null
        and (bans.expires_at is null or bans.expires_at > now());
    elsif normalized_action = 'remove_content' then
      if target_case.target_type = 'general_message' then
        delete from public.messages messages
        where messages.id = target_case.target_id;
        get diagnostics removed_count = row_count;
      elsif target_case.target_type = 'shadow_pin_comment' then
        delete from public.shadow_pin_comments comments
        where comments.id = target_case.target_id;
        get diagnostics removed_count = row_count;
      elsif target_case.target_type = 'shadow_pin_image' then
        perform public.delete_shadow_pin_image(target_case.target_id);
        removed_count := 1;
      else
        raise exception 'Content removal is not supported for this target';
      end if;

      if removed_count = 0 then
        raise exception 'The reported content is no longer available';
      end if;

      after_state := jsonb_build_object('removed', true, 'removedCount', removed_count);
    else
      after_state := jsonb_build_object('action', 'no_action');
    end if;

    insert into public.moderation_case_actions (
      id,
      case_id,
      actor_user_id,
      action_type,
      status,
      public_reason,
      internal_note,
      requested_scopes,
      duration_minutes,
      before_state,
      after_state
    ) values (
      resolved_action_id,
      p_case_id,
      caller_id,
      normalized_action,
      'applied',
      normalized_public_reason,
      normalized_note,
      coalesce(clean_scopes, '{}'::text[]),
      p_duration_minutes,
      before_state,
      after_state
    );

    insert into public.moderation_action_channel_bans (action_id, channel_ban_id)
    select resolved_action_id, ban_id
    from unnest(resulting_ban_ids) ban_id;

    previous_case_status := target_case.status;

    update public.moderation_cases cases
    set
      status = 'actioned',
      outcome_code = case normalized_action
        when 'no_action' then 'no_violation'
        when 'remove_content' then 'content_removed'
        when 'channel_ban' then 'channel_restricted'
      end,
      version = cases.version + 1
    where cases.id = p_case_id
    returning * into target_case;

    insert into public.moderation_case_events (
      case_id,
      actor_user_id,
      event_type,
      from_status,
      to_status,
      internal_note,
      metadata
    ) values (
      p_case_id,
      caller_id,
      'action_applied',
      previous_case_status,
      'actioned',
      normalized_note,
      jsonb_build_object('actionId', resolved_action_id, 'actionType', normalized_action)
    );

    return jsonb_build_object(
      'ok', true,
      'actionId', resolved_action_id,
      'case', to_jsonb(target_case)
    );
  exception when others then
    action_error := left(sqlerrm, 1000);

    insert into public.moderation_case_actions (
      id,
      case_id,
      actor_user_id,
      action_type,
      status,
      public_reason,
      internal_note,
      requested_scopes,
      duration_minutes,
      before_state,
      error_message
    ) values (
      resolved_action_id,
      p_case_id,
      caller_id,
      normalized_action,
      'failed',
      normalized_public_reason,
      normalized_note,
      coalesce(clean_scopes, '{}'::text[]),
      p_duration_minutes,
      before_state,
      action_error
    );

    update public.moderation_cases cases
    set version = cases.version + 1
    where cases.id = p_case_id
    returning * into target_case;

    insert into public.moderation_case_events (
      case_id,
      actor_user_id,
      event_type,
      internal_note,
      metadata
    ) values (
      p_case_id,
      caller_id,
      'action_failed',
      normalized_note,
      jsonb_build_object('actionId', resolved_action_id, 'actionType', normalized_action, 'error', action_error)
    );

    return jsonb_build_object(
      'ok', false,
      'actionId', resolved_action_id,
      'error', action_error,
      'case', to_jsonb(target_case)
    );
  end;
end;
$$;

revoke all on function public.submit_member_report(text, uuid, text, uuid, text, jsonb)
  from public, anon;
revoke all on function public.list_my_member_reports(integer, timestamptz, uuid)
  from public, anon;
revoke all on function public.list_moderation_cases(text, text, text, text, text, text, integer, timestamptz, uuid)
  from public, anon;
revoke all on function public.get_moderation_case(uuid)
  from public, anon;
revoke all on function public.assign_moderation_case(uuid, integer, uuid)
  from public, anon;
revoke all on function public.transition_moderation_case(uuid, integer, text, text, text, text, text)
  from public, anon;
revoke all on function public.apply_moderation_case_action(uuid, integer, text, text[], integer, text, text)
  from public, anon;

grant execute on function public.submit_member_report(text, uuid, text, uuid, text, jsonb)
  to authenticated;
grant execute on function public.list_my_member_reports(integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.list_moderation_cases(text, text, text, text, text, text, integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.get_moderation_case(uuid)
  to authenticated;
grant execute on function public.assign_moderation_case(uuid, integer, uuid)
  to authenticated;
grant execute on function public.transition_moderation_case(uuid, integer, text, text, text, text, text)
  to authenticated;
grant execute on function public.apply_moderation_case_action(uuid, integer, text, text[], integer, text, text)
  to authenticated;

alter table public.moderation_cases replica identity full;
alter table public.moderation_report_updates replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moderation_cases'
  ) then
    alter publication supabase_realtime add table public.moderation_cases;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moderation_report_updates'
  ) then
    alter publication supabase_realtime add table public.moderation_report_updates;
  end if;
end;
$$;

commit;
