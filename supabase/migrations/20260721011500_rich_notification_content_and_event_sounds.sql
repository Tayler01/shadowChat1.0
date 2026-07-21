/*
  # Rich notification content and event-specific sound preferences

  Complete the canonical notification event before the v2 envelope is
  materialized so native delivery never races later legacy enrichment. Keep
  the existing category preference table as a fallback while allowing users
  to choose a sound for each active notification event.
*/

begin;

create table if not exists public.notification_event_presentation_preferences (
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null,
  sound_id text not null references public.notification_sound_catalog(sound_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_type),
  check (event_type in (
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
    'shado_live_room_started',
    'shado_live_room_ended',
    'shado_live_speaker_promoted',
    'shado_live_speaker_demoted',
    'shado_live_participant_muted',
    'shado_live_participant_removed',
    'shadow_checkers_turn',
    'shadow_war_turn',
    'weather_alert',
    'security_alert'
  ))
);

alter table public.notification_event_presentation_preferences
  enable row level security;

revoke all on table public.notification_event_presentation_preferences
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.notification_event_presentation_preferences
  to authenticated, service_role;

drop policy if exists "Users manage their event notification presentation preferences"
  on public.notification_event_presentation_preferences;
create policy "Users manage their event notification presentation preferences"
  on public.notification_event_presentation_preferences
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists update_notification_event_presentation_preferences_updated_at
  on public.notification_event_presentation_preferences;
create trigger update_notification_event_presentation_preferences_updated_at
  before update on public.notification_event_presentation_preferences
  for each row execute function public.update_updated_at_column();

comment on table public.notification_event_presentation_preferences is
  'Owner-private sound overrides for active native and foreground notification event types.';

create or replace function private.enrich_notification_v2_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_payload jsonb := coalesce(new.payload, '{}'::jsonb);
  actor_payload jsonb := '{}'::jsonb;
  actor_label text;
  actor_id_text text;
  derived_title text;
  derived_body text;
begin
  actor_payload := case
    when jsonb_typeof(event_payload -> 'actor') = 'object'
      then event_payload -> 'actor'
    when jsonb_typeof(event_payload -> 'sender') = 'object'
      then event_payload -> 'sender'
    when jsonb_typeof(event_payload -> 'profile') = 'object'
      then event_payload -> 'profile'
    else '{}'::jsonb
  end;

  actor_label := coalesce(
    nullif(actor_payload ->> 'display_name', ''),
    nullif(actor_payload ->> 'username', ''),
    nullif(event_payload ->> 'sender_name', ''),
    nullif(event_payload ->> 'actor_name', ''),
    'Someone'
  );

  actor_id_text := coalesce(
    new.actor_id::text,
    nullif(actor_payload ->> 'id', ''),
    nullif(event_payload ->> 'actor_id', '')
  );
  if new.actor_id is null
    and actor_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    new.actor_id := actor_id_text::uuid;
  end if;

  if nullif(new.route, '') is null then
    new.route := coalesce(
      nullif(event_payload ->> 'route', ''),
      nullif(event_payload ->> 'url', '')
    );
  end if;

  derived_title := case new.type
    when 'dm_message' then actor_label
    when 'group_message' then actor_label || ' in General Chat'
    when 'mention' then actor_label || ' mentioned you'
    when 'reply' then actor_label || ' replied to you'
    when 'reaction' then actor_label || ' reacted to your message'
    when 'hype_event' then actor_label || ' hyped your message'
    when 'shadow_pin_post' then 'New ShadowPin from ' || actor_label
    when 'shadow_pin_comment' then actor_label || ' commented on your ShadowPin'
    when 'shadow_pin_reply' then actor_label || ' replied in ShadowPin'
    when 'connection_request' then actor_label || ' sent a connection request'
    when 'connection_accepted' then actor_label || ' accepted your connection request'
    when 'presence_active' then actor_label || ' is active now'
    when 'shado_live_room_started' then actor_label || ' started a Shado Live room'
    when 'shado_live_room_ended' then 'A Shado Live room ended'
    when 'shado_live_speaker_promoted' then 'You were invited to speak in Shado Live'
    when 'shado_live_speaker_demoted' then 'Your Shado Live role changed'
    when 'shado_live_participant_muted' then 'A Shado Live host muted your microphone'
    when 'shado_live_participant_removed' then 'You were removed from Shado Live'
    when 'shadow_checkers_turn' then 'Your Shadow Checkers turn is ready'
    when 'shadow_war_turn' then 'Your Shadow War turn is ready'
    when 'weather_alert' then 'Weather alert'
    when 'security_alert' then 'Security alert'
    else null
  end;

  derived_body := case new.type
    when 'shadow_pin_post' then coalesce(
      nullif(event_payload ->> 'image_title', ''),
      'Open ShadowPin to see the new post.'
    )
    when 'shadow_pin_comment' then coalesce(
      nullif(event_payload ->> 'body_preview', ''),
      'Open the conversation to read the comment.'
    )
    when 'shadow_pin_reply' then coalesce(
      nullif(event_payload ->> 'body_preview', ''),
      'Open the conversation to read the reply.'
    )
    when 'connection_request' then 'Review the request in Connections.'
    when 'connection_accepted' then 'You are now connected.'
    when 'presence_active' then 'Open Active Users to connect.'
    when 'shadow_checkers_turn' then 'Open the board and make your move.'
    when 'shadow_war_turn' then 'Open Shadow War and make your move.'
    else coalesce(
      nullif(event_payload ->> 'body_preview', ''),
      nullif(event_payload ->> 'preview', '')
    )
  end;

  new.payload := jsonb_strip_nulls(jsonb_build_object(
    'title', derived_title,
    'body', derived_body,
    'route', new.route
  )) || event_payload;

  return new;
end;
$$;

revoke all on function private.enrich_notification_v2_event()
  from public, anon, authenticated;

drop trigger if exists enrich_notification_v2_event_insert
  on public.notification_events;
create trigger enrich_notification_v2_event_insert
  before insert on public.notification_events
  for each row execute function private.enrich_notification_v2_event();

commit;
