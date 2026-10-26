-- Read-only identical parent/isolated definition, 2026-10-23. No source rows.
create schema if not exists connections_private;
revoke all on schema connections_private from public,anon,authenticated,service_role;
grant usage on schema connections_private to authenticated,service_role;
create table if not exists public.user_connections ();
alter table public.user_connections add column if not exists id uuid;
alter table public.user_connections add column if not exists member_low_id uuid;
alter table public.user_connections add column if not exists member_high_id uuid;
alter table public.user_connections add column if not exists requested_by uuid;
alter table public.user_connections add column if not exists status text;
alter table public.user_connections add column if not exists revision integer;
alter table public.user_connections add column if not exists requested_at timestamp with time zone;
alter table public.user_connections add column if not exists accepted_at timestamp with time zone;
alter table public.user_connections add column if not exists ended_at timestamp with time zone;
alter table public.user_connections add column if not exists created_at timestamp with time zone;
alter table public.user_connections add column if not exists updated_at timestamp with time zone;
create table if not exists public.notification_preferences ();
alter table public.notification_preferences add column if not exists user_id uuid;
alter table public.notification_preferences add column if not exists dm_enabled boolean;
alter table public.notification_preferences add column if not exists mention_enabled boolean;
alter table public.notification_preferences add column if not exists reply_enabled boolean;
alter table public.notification_preferences add column if not exists reaction_enabled boolean;
alter table public.notification_preferences add column if not exists group_enabled boolean;
alter table public.notification_preferences add column if not exists quiet_hours_start time without time zone;
alter table public.notification_preferences add column if not exists quiet_hours_end time without time zone;
alter table public.notification_preferences add column if not exists mute_until timestamp with time zone;
alter table public.notification_preferences add column if not exists created_at timestamp with time zone;
alter table public.notification_preferences add column if not exists updated_at timestamp with time zone;
alter table public.notification_preferences add column if not exists hype_enabled boolean;
alter table public.notification_preferences add column if not exists notifications_enabled boolean;
alter table public.notification_preferences add column if not exists general_chat_muted boolean;
alter table public.notification_preferences add column if not exists quiet_hours_timezone text;
alter table public.notification_preferences add column if not exists shadow_pin_new_post_enabled boolean;
alter table public.notification_preferences add column if not exists shadow_pin_comment_enabled boolean;
alter table public.notification_preferences add column if not exists shadow_pin_reply_enabled boolean;
alter table public.notification_preferences add column if not exists connection_notifications_enabled boolean;
alter table public.notification_preferences add column if not exists presence_in_app_enabled boolean;
alter table public.notification_preferences add column if not exists presence_push_enabled boolean;
alter table public.notification_preferences add column if not exists presence_notification_scope text;
alter table public.notification_preferences add column if not exists badge_dm_enabled boolean;
alter table public.notification_preferences add column if not exists badge_group_enabled boolean;
alter table public.notification_preferences add column if not exists badge_interactions_enabled boolean;
alter table public.notification_preferences add column if not exists badge_connections_enabled boolean;
alter table public.notification_preferences add column if not exists badge_shadow_pin_enabled boolean;
alter table public.notification_preferences add column if not exists shado_live_in_app_enabled boolean;
alter table public.notification_preferences add column if not exists checkers_turn_enabled boolean;
alter table public.notification_preferences add column if not exists badge_games_enabled boolean;
alter table public.notification_preferences add column if not exists notification_preview_mode text;
alter table public.notification_preferences add column if not exists notification_media_enabled boolean;
alter table public.notification_preferences add column if not exists notification_foreground_sounds_enabled boolean;
create table if not exists public.notification_events ();
alter table public.notification_events add column if not exists id uuid;
alter table public.notification_events add column if not exists user_id uuid;
alter table public.notification_events add column if not exists type text;
alter table public.notification_events add column if not exists entity_id uuid;
alter table public.notification_events add column if not exists conversation_id uuid;
alter table public.notification_events add column if not exists message_id uuid;
alter table public.notification_events add column if not exists payload jsonb;
alter table public.notification_events add column if not exists dedupe_key text;
alter table public.notification_events add column if not exists sent_at timestamp with time zone;
alter table public.notification_events add column if not exists read_at timestamp with time zone;
alter table public.notification_events add column if not exists created_at timestamp with time zone;
alter table public.notification_events add column if not exists dm_message_id uuid;
alter table public.notification_events add column if not exists category text;
alter table public.notification_events add column if not exists actor_id uuid;
alter table public.notification_events add column if not exists route text;
alter table public.notification_events add column if not exists presentation_expires_at timestamp with time zone;
alter table public.notification_events add column if not exists presented_at timestamp with time zone;
alter table public.notification_events add column if not exists resolved_at timestamp with time zone;
create unique index if not exists notification_events_dedupe_key_fixture on public.notification_events(dedupe_key);
CREATE OR REPLACE FUNCTION connections_private.emit_connection_notification(connection_row user_connections, recipient_id uuid, actor_id uuid, event_type text, change_kind text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  actor_profile jsonb;
  notification_enabled boolean;
BEGIN
  IF event_type NOT IN ('connection_request', 'connection_accepted', 'connection_changed') THEN
    RAISE EXCEPTION 'Unsupported connection notification type';
  END IF;

  IF recipient_id IS NULL OR actor_id IS NULL OR recipient_id = actor_id THEN
    RETURN;
  END IF;

  IF private.users_have_block(recipient_id, actor_id) THEN
    RETURN;
  END IF;

  SELECT public.user_public_profile_json(profiles)
  INTO actor_profile
  FROM public.users profiles
  WHERE profiles.id = actor_id;

  IF actor_profile IS NULL THEN
    RETURN;
  END IF;

  SELECT preferences.connection_notifications_enabled
  INTO notification_enabled
  FROM public.notification_preferences preferences
  WHERE preferences.user_id = recipient_id;

  INSERT INTO public.notification_events (
    user_id,
    type,
    entity_id,
    payload,
    dedupe_key
  ) VALUES (
    recipient_id,
    event_type,
    connection_row.id,
    jsonb_strip_nulls(jsonb_build_object(
      'connection_id', connection_row.id,
      'revision', connection_row.revision,
      'status', connection_row.status,
      'change', change_kind,
      'actor', actor_profile,
      'notify', CASE
        WHEN event_type = 'connection_changed' THEN false
        ELSE coalesce(notification_enabled, true)
      END,
      'url', '/?view=dms&panel=connections'
    )),
    event_type || ':' || connection_row.id::text || ':'
      || connection_row.revision::text || ':' || recipient_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$function$;
revoke all on function connections_private.emit_connection_notification(public.user_connections,uuid,uuid,text,text) from public,anon,authenticated,service_role;
