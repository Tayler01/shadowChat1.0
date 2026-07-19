/*
  # Notification Presentation v2 foundation

  Additive, dormant infrastructure layered over notification_events. The
  canonical event ledger remains the only unread/read/resolved and badge
  authority. V2 delivery defaults to disabled and this migration never creates
  deliverable jobs for historical events.
*/

begin;

alter table public.notification_preferences
  add column if not exists notification_preview_mode text not null default 'full',
  add column if not exists notification_media_enabled boolean not null default true,
  add column if not exists notification_foreground_sounds_enabled boolean not null default true;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_preview_mode_check,
  add constraint notification_preferences_preview_mode_check check (
    notification_preview_mode in ('full', 'sender_only', 'private')
  );

create table if not exists public.notification_sound_catalog (
  sound_id text primary key,
  display_name text not null,
  native_file_name text,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  check (sound_id ~ '^[a-z0-9_]{2,48}$'),
  check (char_length(display_name) between 1 and 80),
  check (native_file_name is null or native_file_name ~ '^[a-z0-9_]+\.wav$')
);

insert into public.notification_sound_catalog (
  sound_id,
  display_name,
  native_file_name
) values
  ('shadow_whisper', 'Shadow Whisper', 'shadow_whisper.wav'),
  ('low_glass', 'Low Glass', 'low_glass.wav'),
  ('gold_signal', 'Gold Signal', 'gold_signal.wav'),
  ('hype_burst', 'Hype Burst', 'hype_burst.wav'),
  ('pin_shutter', 'Pin Shutter', 'pin_shutter.wav'),
  ('connection_chime', 'Connection Chime', 'connection_chime.wav'),
  ('presence_pulse', 'Presence Pulse', 'presence_pulse.wav'),
  ('live_beacon', 'Live Beacon', 'live_beacon.wav'),
  ('checkers_move', 'Checkers Move', 'checkers_move.wav'),
  ('war_drum', 'War Drum', 'war_drum.wav'),
  ('weather_glass', 'Weather Glass', 'weather_glass.wav'),
  ('security_signal', 'Security Signal', 'security_signal.wav'),
  ('system_default', 'System Default', null),
  ('silent', 'Silent', null)
on conflict (sound_id) do update
set
  display_name = excluded.display_name,
  native_file_name = excluded.native_file_name,
  available = true;

alter table public.notification_sound_catalog enable row level security;
revoke all on table public.notification_sound_catalog
  from public, anon, authenticated, service_role;
grant select on table public.notification_sound_catalog
  to authenticated, service_role;

drop policy if exists "Authenticated users can read notification sounds"
  on public.notification_sound_catalog;
create policy "Authenticated users can read notification sounds"
  on public.notification_sound_catalog
  for select
  to authenticated
  using (available = true);

create table if not exists public.notification_category_presentation_preferences (
  user_id uuid not null references public.users(id) on delete cascade,
  category_key text not null,
  sound_id text not null references public.notification_sound_catalog(sound_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_key),
  check (category_key in (
    'dm',
    'general_chat',
    'mentions_replies',
    'reactions_hype',
    'shadow_pin',
    'connections',
    'presence',
    'shado_live',
    'shadow_checkers',
    'shadow_war',
    'weather',
    'security',
    'system'
  ))
);

alter table public.notification_category_presentation_preferences
  enable row level security;
revoke all on table public.notification_category_presentation_preferences
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.notification_category_presentation_preferences
  to authenticated;
grant select, insert, update, delete
  on table public.notification_category_presentation_preferences
  to service_role;

drop policy if exists "Users manage their notification presentation preferences"
  on public.notification_category_presentation_preferences;
create policy "Users manage their notification presentation preferences"
  on public.notification_category_presentation_preferences
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists update_notification_category_presentation_preferences_updated_at
  on public.notification_category_presentation_preferences;
create trigger update_notification_category_presentation_preferences_updated_at
  before update on public.notification_category_presentation_preferences
  for each row execute function public.update_updated_at_column();

create table if not exists public.notification_v2_runtime_config (
  singleton boolean primary key default true check (singleton),
  delivery_mode text not null default 'disabled'
    check (delivery_mode in ('disabled', 'shadow', 'active')),
  activation_watermark timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_v2_runtime_config (
  singleton,
  delivery_mode,
  activation_watermark
) values (
  true,
  'disabled',
  now()
)
on conflict (singleton) do nothing;

alter table public.notification_v2_runtime_config enable row level security;
revoke all on table public.notification_v2_runtime_config
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.notification_v2_runtime_config
  to service_role;

alter table public.notification_events
  drop constraint if exists notification_events_id_user_unique,
  add constraint notification_events_id_user_unique unique (id, user_id);

create table if not exists public.notification_envelopes_v2 (
  event_id uuid primary key,
  user_id uuid not null,
  schema_version smallint not null default 2 check (schema_version = 2),
  category_key text not null,
  title text not null,
  body text,
  private_title text not null default 'New ShadowChat notification',
  private_body text default 'Open ShadowChat to view it.',
  actor_id uuid references public.users(id) on delete set null,
  route text not null,
  group_key text not null,
  priority text not null default 'normal',
  privacy_level text not null default 'full',
  action_keys text[] not null default array['open', 'mark_read']::text[],
  sound_id text not null references public.notification_sound_catalog(sound_id),
  android_channel_key text not null,
  badge_category text not null default 'none',
  media_ref jsonb,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  compiled_at timestamptz not null default now(),
  foreign key (event_id, user_id)
    references public.notification_events(id, user_id)
    on delete cascade,
  check (category_key in (
    'dm',
    'general_chat',
    'mentions_replies',
    'reactions_hype',
    'shadow_pin',
    'connections',
    'presence',
    'shado_live',
    'shadow_checkers',
    'shadow_war',
    'weather',
    'security',
    'system'
  )),
  check (char_length(title) between 1 and 120),
  check (body is null or char_length(body) <= 240),
  check (char_length(private_title) between 1 and 120),
  check (private_body is null or char_length(private_body) <= 160),
  check (
    left(route, 1) = '/'
    and left(route, 2) <> '//'
    and char_length(route) <= 1024
  ),
  check (group_key ~ '^[a-z0-9_:-]{1,160}$'),
  check (priority in ('ambient', 'normal', 'high', 'urgent')),
  check (privacy_level in ('full', 'sender_only', 'private')),
  check (action_keys <@ array['open', 'mark_read']::text[]),
  check (cardinality(action_keys) <= 2),
  check (android_channel_key in (
    'messages_v1',
    'mentions_v1',
    'social_v1',
    'live_v1',
    'games_v1',
    'weather_v1',
    'security_v1'
  )),
  check (badge_category in (
    'dm',
    'group',
    'interactions',
    'connections',
    'shadow_pin',
    'games',
    'none'
  )),
  check (
    media_ref is null
    or (
      jsonb_typeof(media_ref) = 'object'
      and pg_column_size(media_ref) <= 2048
    )
  ),
  check (expires_at >= created_at)
);

create index if not exists notification_envelopes_v2_user_created_idx
  on public.notification_envelopes_v2 (user_id, created_at desc, event_id desc);
create index if not exists notification_envelopes_v2_group_idx
  on public.notification_envelopes_v2 (user_id, group_key, created_at desc);

alter table public.notification_envelopes_v2 enable row level security;
revoke all on table public.notification_envelopes_v2
  from public, anon, authenticated;
grant select on table public.notification_envelopes_v2
  to authenticated;
grant select, insert, update, delete on table public.notification_envelopes_v2
  to service_role;

drop policy if exists "Users can read their notification envelopes"
  on public.notification_envelopes_v2;
create policy "Users can read their notification envelopes"
  on public.notification_envelopes_v2
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.notification_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  installation_key uuid not null,
  platform text not null,
  app_id text not null,
  project_id text,
  environment text not null default 'production',
  app_version text,
  build_number text,
  locale text,
  time_zone text,
  channel_schema_version integer not null default 1 check (channel_schema_version >= 1),
  foreground_until timestamptz,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, installation_key),
  unique (id, user_id),
  check (platform in ('web', 'ios', 'android')),
  check (environment in ('development', 'preview', 'production')),
  check (char_length(app_id) between 1 and 160),
  check (project_id is null or char_length(project_id) between 1 and 160),
  check (app_version is null or char_length(app_version) <= 40),
  check (build_number is null or char_length(build_number) <= 40),
  check (locale is null or char_length(locale) <= 40),
  check (time_zone is null or char_length(time_zone) <= 80)
);

create index if not exists notification_installations_user_active_idx
  on public.notification_installations (user_id, last_seen_at desc)
  where revoked_at is null;

alter table public.notification_installations enable row level security;
revoke all on table public.notification_installations
  from public, anon, authenticated;
grant select on table public.notification_installations
  to authenticated;
grant select, insert, update, delete on table public.notification_installations
  to service_role;

drop policy if exists "Users can read their notification installations"
  on public.notification_installations;
create policy "Users can read their notification installations"
  on public.notification_installations
  for select
  to authenticated
  using (auth.uid() = user_id);

alter table public.push_subscriptions
  add column if not exists installation_id uuid
    references public.notification_installations(id) on delete set null;

create index if not exists push_subscriptions_installation_idx
  on public.push_subscriptions (installation_id)
  where installation_id is not null;

create table if not exists private.notification_native_tokens (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.notification_installations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  environment text not null,
  token text not null,
  token_hash text not null unique,
  enabled boolean not null default true,
  provider_receipt_id text,
  next_receipt_check_at timestamptz,
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id, provider, environment),
  foreign key (installation_id, user_id)
    references public.notification_installations(id, user_id)
    on delete cascade,
  check (provider in ('expo', 'apns', 'fcm')),
  check (environment in ('development', 'preview', 'production')),
  check (char_length(token) between 16 and 4096),
  check (token_hash ~ '^[0-9a-f]{64}$'),
  check (provider_receipt_id is null or char_length(provider_receipt_id) <= 512),
  check (disabled_reason is null or char_length(disabled_reason) <= 240)
);

revoke all on table private.notification_native_tokens
  from public, anon, authenticated;
grant select, insert, update, delete
  on table private.notification_native_tokens
  to service_role;

create table if not exists public.notification_presentation_receipts_v2 (
  event_id uuid not null,
  user_id uuid not null,
  installation_id uuid not null,
  presentation_family text not null,
  claimed_at timestamptz not null default now(),
  presented_at timestamptz,
  dismissed_at timestamptz,
  opened_at timestamptz,
  primary key (event_id, installation_id, presentation_family),
  foreign key (event_id, user_id)
    references public.notification_events(id, user_id)
    on delete cascade,
  foreign key (installation_id, user_id)
    references public.notification_installations(id, user_id)
    on delete cascade,
  check (presentation_family in ('foreground', 'web_push', 'native_push'))
);

create index if not exists notification_presentation_receipts_v2_user_idx
  on public.notification_presentation_receipts_v2 (user_id, claimed_at desc);

alter table public.notification_presentation_receipts_v2 enable row level security;
revoke all on table public.notification_presentation_receipts_v2
  from public, anon, authenticated;
grant select on table public.notification_presentation_receipts_v2
  to authenticated;
grant select, insert, update, delete
  on table public.notification_presentation_receipts_v2
  to service_role;

drop policy if exists "Users can read their notification presentation receipts"
  on public.notification_presentation_receipts_v2;
create policy "Users can read their notification presentation receipts"
  on public.notification_presentation_receipts_v2
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.notification_outbox_v2 (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  user_id uuid not null,
  delivery_mode text not null,
  status text not null,
  available_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, user_id)
    references public.notification_events(id, user_id)
    on delete cascade,
  check (delivery_mode in ('shadow', 'active')),
  check (status in ('shadow', 'pending', 'processing', 'delivered', 'cancelled', 'failed')),
  check (
    (delivery_mode = 'shadow' and status = 'shadow')
    or delivery_mode = 'active'
  ),
  check (expires_at >= created_at),
  check (last_error is null or char_length(last_error) <= 500)
);

create index if not exists notification_outbox_v2_pending_idx
  on public.notification_outbox_v2 (available_at, created_at)
  where status in ('pending', 'processing');

alter table public.notification_outbox_v2 enable row level security;
revoke all on table public.notification_outbox_v2
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.notification_outbox_v2
  to service_role;

create table if not exists public.notification_delivery_targets_v2 (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox_v2(id) on delete cascade,
  event_id uuid not null references public.notification_events(id) on delete cascade,
  installation_id uuid not null references public.notification_installations(id) on delete cascade,
  transport text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  next_receipt_check_at timestamptz,
  last_status_code integer,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, installation_id, transport),
  check (transport in ('web_push', 'expo', 'apns', 'fcm')),
  check (status in ('shadow', 'pending', 'accepted', 'delivered', 'cancelled', 'failed', 'invalid')),
  check (provider_message_id is null or char_length(provider_message_id) <= 512),
  check (last_error is null or char_length(last_error) <= 500)
);

alter table public.notification_delivery_targets_v2 enable row level security;
revoke all on table public.notification_delivery_targets_v2
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.notification_delivery_targets_v2
  to service_role;

create or replace function private.notification_v2_category(target_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when target_type = 'dm_message' then 'dm'
    when target_type = 'group_message' then 'general_chat'
    when target_type in ('mention', 'reply') then 'mentions_replies'
    when target_type in ('reaction', 'hype_event') then 'reactions_hype'
    when target_type in ('shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply') then 'shadow_pin'
    when target_type in ('connection_request', 'connection_accepted') then 'connections'
    when target_type = 'presence_active' then 'presence'
    when target_type like 'shado_live_%' then 'shado_live'
    when target_type = 'shadow_checkers_turn' then 'shadow_checkers'
    when target_type = 'shadow_war_turn' then 'shadow_war'
    when target_type = 'weather_alert' then 'weather'
    when target_type = 'security_alert' then 'security'
    else 'system'
  end
$$;

create or replace function private.notification_v2_sound(target_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when target_type = 'dm_message' then 'shadow_whisper'
    when target_type = 'group_message' then 'low_glass'
    when target_type in ('mention', 'reply') then 'gold_signal'
    when target_type in ('reaction', 'hype_event') then 'hype_burst'
    when target_type in ('shadow_pin_post', 'shadow_pin_comment') then 'pin_shutter'
    when target_type = 'shadow_pin_reply' then 'gold_signal'
    when target_type in ('connection_request', 'connection_accepted') then 'connection_chime'
    when target_type = 'presence_active' then 'presence_pulse'
    when target_type like 'shado_live_%' then 'live_beacon'
    when target_type = 'shadow_checkers_turn' then 'checkers_move'
    when target_type = 'shadow_war_turn' then 'war_drum'
    when target_type = 'weather_alert' then 'weather_glass'
    when target_type = 'security_alert' then 'security_signal'
    else 'system_default'
  end
$$;

create or replace function private.notification_v2_channel(target_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when target_type in ('dm_message', 'group_message') then 'messages_v1'
    when target_type in ('mention', 'reply') then 'mentions_v1'
    when target_type like 'shado_live_%' then 'live_v1'
    when target_type in ('shadow_checkers_turn', 'shadow_war_turn') then 'games_v1'
    when target_type = 'weather_alert' then 'weather_v1'
    when target_type = 'security_alert' then 'security_v1'
    else 'social_v1'
  end
$$;

create or replace function private.notification_v2_badge_category(target_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when target_type = 'dm_message' then 'dm'
    when target_type = 'group_message' then 'group'
    when target_type in ('mention', 'reply', 'reaction', 'hype_event', 'security_alert') then 'interactions'
    when target_type in ('connection_request', 'connection_accepted') then 'connections'
    when target_type in ('shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply') then 'shadow_pin'
    when target_type like 'shado_live_%'
      or target_type in ('shadow_checkers_turn', 'shadow_war_turn') then 'games'
    else 'none'
  end
$$;

create or replace function private.notification_v2_group_key(
  target_type text,
  target_entity_id uuid,
  target_actor_id uuid,
  target_conversation_id uuid,
  target_message_id uuid,
  target_payload jsonb
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when target_type = 'dm_message'
      then 'dm:' || coalesce(target_conversation_id, target_entity_id)::text
    when target_type = 'group_message'
      then 'group:' || coalesce(nullif(target_payload ->> 'thread_id', ''), target_message_id::text, 'general')
    when target_type in ('reaction', 'hype_event')
      then 'message:' || coalesce(target_message_id, target_entity_id)::text || ':reactions'
    when target_type in ('shadow_pin_comment', 'shadow_pin_reply')
      then 'pin:' || coalesce(nullif(target_payload ->> 'image_id', ''), target_entity_id::text) || ':conversation'
    when target_type = 'shadow_pin_post'
      then 'pin:' || target_entity_id::text
    when target_type in ('connection_request', 'connection_accepted')
      then 'connection:' || coalesce(target_actor_id, target_entity_id)::text
    when target_type = 'presence_active'
      then 'presence:' || coalesce(target_actor_id, target_entity_id)::text
    when target_type like 'shado_live_%'
      then 'live:' || coalesce(nullif(target_payload ->> 'room_id', ''), target_entity_id::text)
    when target_type = 'shadow_checkers_turn'
      then 'checkers:' || target_entity_id::text
    when target_type = 'shadow_war_turn'
      then 'shadow-war:' || target_entity_id::text
    when target_type = 'weather_alert'
      then 'weather:' || target_entity_id::text
    when target_type = 'security_alert'
      then 'security:' || target_entity_id::text
    else 'system:' || target_entity_id::text
  end
$$;

create or replace function private.notification_v2_safe_route(target_route text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when left(target_route, 1) = '/'
      and left(target_route, 2) <> '//'
      and char_length(target_route) <= 1024
      then target_route
    else '/?view=catchup'
  end
$$;

create or replace function private.materialize_notification_envelope_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_route text;
  resolved_category text;
  resolved_sound text;
  resolved_channel text;
  resolved_badge text;
  resolved_group text;
  resolved_title text;
  resolved_body text;
  resolved_priority text;
  resolved_media jsonb;
  runtime_mode text;
  runtime_watermark timestamptz;
  resolved_outbox_id uuid;
begin
  select delivery_mode, activation_watermark
  into runtime_mode, runtime_watermark
  from public.notification_v2_runtime_config
  where singleton = true;

  -- Disabled is a true dormant mode: canonical notification inserts continue
  -- without creating a V2 projection, outbox row, or delivery plan.
  if coalesce(runtime_mode, 'disabled') = 'disabled' then
    return new;
  end if;

  resolved_category := private.notification_v2_category(new.type);
  resolved_sound := private.notification_v2_sound(new.type);
  resolved_channel := private.notification_v2_channel(new.type);
  resolved_badge := private.notification_v2_badge_category(new.type);
  resolved_route := private.notification_v2_safe_route(
    coalesce(nullif(new.route, ''), nullif(new.payload ->> 'route', ''), '/?view=catchup')
  );
  resolved_group := private.notification_v2_group_key(
    new.type,
    new.entity_id,
    new.actor_id,
    new.conversation_id,
    new.message_id,
    new.payload
  );
  resolved_title := left(
    coalesce(nullif(new.payload ->> 'title', ''), 'New ShadowChat update'),
    120
  );
  resolved_body := nullif(left(
    coalesce(
      nullif(new.payload ->> 'body', ''),
      nullif(new.payload ->> 'body_preview', ''),
      nullif(new.payload ->> 'preview', '')
    ),
    240
  ), '');
  resolved_priority := case
    when new.type in ('presence_active', 'shado_live_room_ended') then 'ambient'
    when new.type in (
      'dm_message',
      'mention',
      'reply',
      'shadow_pin_reply',
      'connection_request',
      'shado_live_room_started',
      'shado_live_speaker_promoted',
      'shado_live_participant_muted',
      'shadow_checkers_turn',
      'shadow_war_turn'
    ) then 'high'
    when new.type in ('shado_live_participant_removed', 'weather_alert', 'security_alert') then 'urgent'
    else 'normal'
  end;
  resolved_media := case
    when new.type like 'shadow_pin_%'
      and coalesce(new.payload ->> 'image_id', new.entity_id::text) is not null
      then jsonb_build_object(
        'kind', 'shadow_pin',
        'image_id', coalesce(new.payload ->> 'image_id', new.entity_id::text)
      )
    else null
  end;

  insert into public.notification_envelopes_v2 (
    event_id,
    user_id,
    category_key,
    title,
    body,
    actor_id,
    route,
    group_key,
    priority,
    action_keys,
    sound_id,
    android_channel_key,
    badge_category,
    media_ref,
    created_at,
    expires_at
  ) values (
    new.id,
    new.user_id,
    resolved_category,
    resolved_title,
    resolved_body,
    new.actor_id,
    resolved_route,
    resolved_group,
    resolved_priority,
    array['open', 'mark_read']::text[],
    resolved_sound,
    resolved_channel,
    resolved_badge,
    resolved_media,
    new.created_at,
    new.presentation_expires_at
  )
  on conflict (event_id) do nothing;

  if runtime_mode in ('shadow', 'active')
    and new.created_at >= runtime_watermark
    and new.sent_at is null
    and new.read_at is null
    and new.resolved_at is null
    and new.presentation_expires_at > now()
    and new.type not in ('shadow_war_turn', 'weather_alert', 'security_alert') then
    insert into public.notification_outbox_v2 (
      event_id,
      user_id,
      delivery_mode,
      status,
      expires_at
    ) values (
      new.id,
      new.user_id,
      runtime_mode,
      case when runtime_mode = 'shadow' then 'shadow' else 'pending' end,
      new.presentation_expires_at
    )
    on conflict (event_id) do nothing
    returning id into resolved_outbox_id;

    -- Shadow mode exercises the installation/token selection contract while
    -- remaining provider-silent. These rows are inspection evidence only; the
    -- outbox claimant continues to claim active rows exclusively.
    if runtime_mode = 'shadow' and resolved_outbox_id is not null then
      insert into public.notification_delivery_targets_v2 (
        outbox_id,
        event_id,
        installation_id,
        transport,
        status
      )
      select distinct
        resolved_outbox_id,
        new.id,
        installations.id,
        'web_push',
        'shadow'
      from public.notification_installations installations
      join public.push_subscriptions subscriptions
        on subscriptions.installation_id = installations.id
        and subscriptions.user_id = installations.user_id
      where installations.user_id = new.user_id
        and installations.platform = 'web'
        and installations.revoked_at is null
        and (
          installations.foreground_until is null
          or installations.foreground_until <= now()
        )
        and subscriptions.enabled = true
      union all
      select distinct
        resolved_outbox_id,
        new.id,
        installations.id,
        tokens.provider,
        'shadow'
      from public.notification_installations installations
      join private.notification_native_tokens tokens
        on tokens.installation_id = installations.id
        and tokens.user_id = installations.user_id
        and tokens.environment = installations.environment
      where installations.user_id = new.user_id
        and installations.platform in ('ios', 'android')
        and installations.revoked_at is null
        and (
          installations.foreground_until is null
          or installations.foreground_until <= now()
        )
        and tokens.enabled = true
      on conflict (event_id, installation_id, transport) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists materialize_notification_envelope_v2_insert
  on public.notification_events;
create trigger materialize_notification_envelope_v2_insert
  after insert on public.notification_events
  for each row execute function private.materialize_notification_envelope_v2();

revoke all on function private.materialize_notification_envelope_v2()
  from public, anon, authenticated;

-- Backfill presentation projections only. Historical outbox rows are
-- intentionally never created.
insert into public.notification_envelopes_v2 (
  event_id,
  user_id,
  category_key,
  title,
  body,
  actor_id,
  route,
  group_key,
  priority,
  action_keys,
  sound_id,
  android_channel_key,
  badge_category,
  media_ref,
  created_at,
  expires_at
)
select
  events.id,
  events.user_id,
  private.notification_v2_category(events.type),
  left(coalesce(nullif(events.payload ->> 'title', ''), 'New ShadowChat update'), 120),
  nullif(left(coalesce(
    nullif(events.payload ->> 'body', ''),
    nullif(events.payload ->> 'body_preview', ''),
    nullif(events.payload ->> 'preview', '')
  ), 240), ''),
  events.actor_id,
  private.notification_v2_safe_route(
    coalesce(nullif(events.route, ''), nullif(events.payload ->> 'route', ''), '/?view=catchup')
  ),
  private.notification_v2_group_key(
    events.type,
    events.entity_id,
    events.actor_id,
    events.conversation_id,
    events.message_id,
    events.payload
  ),
  case
    when events.type in ('presence_active', 'shado_live_room_ended') then 'ambient'
    when events.type in (
      'dm_message',
      'mention',
      'reply',
      'shadow_pin_reply',
      'connection_request',
      'shado_live_room_started',
      'shado_live_speaker_promoted',
      'shado_live_participant_muted',
      'shadow_checkers_turn'
    ) then 'high'
    when events.type = 'shado_live_participant_removed' then 'urgent'
    else 'normal'
  end,
  array['open', 'mark_read']::text[],
  private.notification_v2_sound(events.type),
  private.notification_v2_channel(events.type),
  private.notification_v2_badge_category(events.type),
  case
    when events.type like 'shadow_pin_%'
      then jsonb_build_object(
        'kind', 'shadow_pin',
        'image_id', coalesce(events.payload ->> 'image_id', events.entity_id::text)
      )
    else null
  end,
  events.created_at,
  events.presentation_expires_at
from public.notification_events events
where (
    events.created_at >= now() - interval '30 days'
    or (events.read_at is null and events.resolved_at is null)
  )
  and exists (
    select 1
    from public.notification_v2_runtime_config runtime
    where runtime.singleton = true
      and runtime.delivery_mode in ('shadow', 'active')
  )
on conflict (event_id) do nothing;

create or replace function public.register_my_notification_installation_v2(
  target_installation_key uuid,
  target_platform text,
  target_app_id text,
  target_project_id text default null,
  target_environment text default 'production',
  target_app_version text default null,
  target_build_number text default null,
  target_locale text default null,
  target_time_zone text default null,
  target_channel_schema_version integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  resolved_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if target_platform not in ('web', 'ios', 'android') then
    raise exception 'Invalid notification platform';
  end if;
  if target_environment not in ('development', 'preview', 'production') then
    raise exception 'Invalid notification environment';
  end if;
  if target_app_id is null or char_length(target_app_id) not between 1 and 160 then
    raise exception 'Invalid app id';
  end if;
  if target_project_id is not null and char_length(target_project_id) not between 1 and 160 then
    raise exception 'Invalid project id';
  end if;
  if target_channel_schema_version < 1 or target_channel_schema_version > 100 then
    raise exception 'Invalid channel schema version';
  end if;

  insert into public.notification_installations (
    user_id,
    installation_key,
    platform,
    app_id,
    project_id,
    environment,
    app_version,
    build_number,
    locale,
    time_zone,
    channel_schema_version,
    last_seen_at,
    revoked_at
  ) values (
    caller_id,
    target_installation_key,
    target_platform,
    target_app_id,
    nullif(target_project_id, ''),
    target_environment,
    nullif(left(target_app_version, 40), ''),
    nullif(left(target_build_number, 40), ''),
    nullif(left(target_locale, 40), ''),
    nullif(left(target_time_zone, 80), ''),
    target_channel_schema_version,
    now(),
    null
  )
  on conflict (user_id, installation_key) do update
  set
    platform = excluded.platform,
    app_id = excluded.app_id,
    project_id = excluded.project_id,
    environment = excluded.environment,
    app_version = excluded.app_version,
    build_number = excluded.build_number,
    locale = excluded.locale,
    time_zone = excluded.time_zone,
    channel_schema_version = excluded.channel_schema_version,
    last_seen_at = now(),
    revoked_at = null,
    updated_at = now()
  returning id into resolved_id;

  return resolved_id;
end;
$$;

create or replace function public.set_my_notification_installation_foreground_v2(
  target_installation_key uuid,
  target_foreground_until timestamptz
)
returns boolean
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

  update public.notification_installations installations
  set
    foreground_until = case
      when target_foreground_until is null then null
      else least(target_foreground_until, now() + interval '2 minutes')
    end,
    last_seen_at = now(),
    updated_at = now()
  where installations.user_id = caller_id
    and installations.installation_key = target_installation_key
    and installations.revoked_at is null;

  return found;
end;
$$;

create or replace function public.register_my_native_notification_token_v2(
  target_installation_key uuid,
  target_provider text,
  target_environment text,
  target_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  resolved_installation_id uuid;
  resolved_token text := btrim(target_token);
  resolved_hash text;
  prior_token_id uuid;
  prior_installation_id uuid;
  prior_user_id uuid;
  prior_installation_key uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if target_provider not in ('expo', 'apns', 'fcm') then
    raise exception 'Invalid native push provider';
  end if;
  if target_environment not in ('development', 'preview', 'production') then
    raise exception 'Invalid notification environment';
  end if;
  if char_length(resolved_token) not between 16 and 4096 then
    raise exception 'Invalid native push token';
  end if;

  select installations.id
  into resolved_installation_id
  from public.notification_installations installations
  where installations.user_id = caller_id
    and installations.installation_key = target_installation_key
    and installations.platform in ('ios', 'android')
    and installations.revoked_at is null;

  if resolved_installation_id is null then
    raise exception 'Notification installation was not registered';
  end if;

  resolved_hash := pg_catalog.encode(
    extensions.digest(resolved_token, 'sha256'),
    'hex'
  );

  select
    tokens.id,
    tokens.installation_id,
    tokens.user_id,
    installations.installation_key
  into
    prior_token_id,
    prior_installation_id,
    prior_user_id,
    prior_installation_key
  from private.notification_native_tokens tokens
  join public.notification_installations installations
    on installations.id = tokens.installation_id
    and installations.user_id = tokens.user_id
  where tokens.token_hash = resolved_hash
    and (
      tokens.installation_id <> resolved_installation_id
      or tokens.provider <> target_provider
      or tokens.environment <> target_environment
    )
  for update of tokens, installations;

  if prior_token_id is not null then
    -- A provider token may move between accounts only when the device proves
    -- continuity with the same installation key. This supports account
    -- switching without allowing an unrelated installation to seize a token.
    if prior_installation_key is distinct from target_installation_key then
      raise exception 'Notification token belongs to another installation';
    end if;

    if prior_user_id is distinct from caller_id then
      update public.notification_installations installations
      set
        revoked_at = coalesce(installations.revoked_at, now()),
        foreground_until = null,
        updated_at = now()
      where installations.id = prior_installation_id
        and installations.user_id = prior_user_id;

      update private.notification_native_tokens tokens
      set
        enabled = false,
        disabled_at = coalesce(tokens.disabled_at, now()),
        disabled_reason = 'Installation account changed',
        updated_at = now()
      where tokens.installation_id = prior_installation_id
        and tokens.user_id = prior_user_id;
    end if;

    -- Release the globally unique provider token only after the continuity
    -- check and prior-owner revocation have completed in this transaction.
    delete from private.notification_native_tokens tokens
    where tokens.id = prior_token_id;
  end if;

  insert into private.notification_native_tokens (
    installation_id,
    user_id,
    provider,
    environment,
    token,
    token_hash,
    enabled,
    last_seen_at,
    disabled_at,
    disabled_reason
  ) values (
    resolved_installation_id,
    caller_id,
    target_provider,
    target_environment,
    resolved_token,
    resolved_hash,
    true,
    now(),
    null,
    null
  )
  on conflict (installation_id, provider, environment) do update
  set
    token = excluded.token,
    token_hash = excluded.token_hash,
    enabled = true,
    last_seen_at = now(),
    disabled_at = null,
    disabled_reason = null,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.revoke_my_notification_installation_v2(
  target_installation_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  resolved_installation_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  update public.notification_installations installations
  set
    revoked_at = now(),
    foreground_until = null,
    updated_at = now()
  where installations.user_id = caller_id
    and installations.installation_key = target_installation_key
    and installations.revoked_at is null
  returning installations.id into resolved_installation_id;

  if resolved_installation_id is null then
    return false;
  end if;

  update private.notification_native_tokens tokens
  set
    enabled = false,
    disabled_at = now(),
    disabled_reason = 'Installation revoked',
    updated_at = now()
  where tokens.installation_id = resolved_installation_id
    and tokens.user_id = caller_id;

  return true;
end;
$$;

create or replace function public.claim_my_notification_presentation_v2(
  target_event_id uuid,
  target_installation_key uuid,
  target_presentation_family text default 'foreground'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  resolved_installation_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if target_presentation_family not in ('foreground', 'web_push', 'native_push') then
    raise exception 'Invalid presentation family';
  end if;

  select installations.id
  into resolved_installation_id
  from public.notification_installations installations
  where installations.user_id = caller_id
    and installations.installation_key = target_installation_key
    and installations.revoked_at is null;

  if resolved_installation_id is null then
    return false;
  end if;

  insert into public.notification_presentation_receipts_v2 (
    event_id,
    user_id,
    installation_id,
    presentation_family,
    claimed_at
  )
  select
    events.id,
    events.user_id,
    resolved_installation_id,
    target_presentation_family,
    now()
  from public.notification_events events
  where events.id = target_event_id
    and events.user_id = caller_id
    and events.read_at is null
    and events.resolved_at is null
    and events.presentation_expires_at > now()
  on conflict (event_id, installation_id, presentation_family) do nothing;

  return found;
end;
$$;

create or replace function public.claim_notification_outbox_v2(
  batch_size integer default 20,
  lease_seconds integer default 45
)
returns table (
  outbox_id uuid,
  lease_token uuid,
  event_id uuid,
  user_id uuid,
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
  if lease_seconds < 15 or lease_seconds > 180 then
    raise exception 'Lease seconds must be between 15 and 180';
  end if;

  update public.notification_outbox_v2 outbox
  set
    status = 'cancelled',
    completed_at = coalesce(outbox.completed_at, now()),
    last_error = case
      when outbox.expires_at <= now() then 'Notification presentation expired'
      else 'Canonical event is no longer unread'
    end,
    updated_at = now()
  from public.notification_events events
  where outbox.event_id = events.id
    and outbox.status in ('pending', 'processing')
    and (
      outbox.expires_at <= now()
      or events.read_at is not null
      or events.resolved_at is not null
    );

  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox_v2 outbox
    join public.notification_events events
      on events.id = outbox.event_id
    where outbox.delivery_mode = 'active'
      and outbox.status in ('pending', 'processing')
      and outbox.available_at <= now()
      and outbox.expires_at > now()
      and outbox.attempt_count < outbox.max_attempts
      and events.read_at is null
      and events.resolved_at is null
      and (
        outbox.status = 'pending'
        or outbox.lease_expires_at is null
        or outbox.lease_expires_at <= now()
      )
    order by outbox.available_at, outbox.created_at
    for update of outbox skip locked
    limit batch_size
  ),
  claimed as (
    update public.notification_outbox_v2 outbox
    set
      status = 'processing',
      attempt_count = outbox.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => lease_seconds),
      last_error = null,
      updated_at = now()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select
    claimed.id,
    claimed.lease_token,
    claimed.event_id,
    claimed.user_id,
    claimed.expires_at
  from claimed;
end;
$$;

create or replace function public.complete_notification_outbox_v2(
  target_outbox_id uuid,
  target_lease_token uuid,
  target_status text,
  target_error text default null,
  retry_after_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if target_status not in ('pending', 'delivered', 'cancelled', 'failed') then
    raise exception 'Invalid completion status';
  end if;
  if retry_after_seconds is not null and retry_after_seconds not between 1 and 3600 then
    raise exception 'Invalid retry delay';
  end if;

  update public.notification_outbox_v2 outbox
  set
    status = target_status,
    available_at = case
      when target_status = 'pending'
        then now() + make_interval(secs => coalesce(retry_after_seconds, 15))
      else outbox.available_at
    end,
    lease_token = null,
    lease_expires_at = null,
    last_error = nullif(left(target_error, 500), ''),
    completed_at = case when target_status = 'pending' then null else now() end,
    updated_at = now()
  where outbox.id = target_outbox_id
    and outbox.lease_token = target_lease_token
    and outbox.status = 'processing';

  return found;
end;
$$;

revoke all on function public.register_my_notification_installation_v2(
  uuid, text, text, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.register_my_notification_installation_v2(
  uuid, text, text, text, text, text, text, text, text, integer
) to authenticated;

revoke all on function public.set_my_notification_installation_foreground_v2(
  uuid, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.set_my_notification_installation_foreground_v2(
  uuid, timestamptz
) to authenticated;

revoke all on function public.register_my_native_notification_token_v2(
  uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.register_my_native_notification_token_v2(
  uuid, text, text, text
) to authenticated;

revoke all on function public.revoke_my_notification_installation_v2(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_my_notification_installation_v2(uuid)
  to authenticated;

revoke all on function public.claim_my_notification_presentation_v2(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_my_notification_presentation_v2(
  uuid, uuid, text
) to authenticated;

revoke all on function public.claim_notification_outbox_v2(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_outbox_v2(integer, integer)
  to service_role;

revoke all on function public.complete_notification_outbox_v2(
  uuid, uuid, text, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.complete_notification_outbox_v2(
  uuid, uuid, text, text, integer
) to service_role;

commit;
