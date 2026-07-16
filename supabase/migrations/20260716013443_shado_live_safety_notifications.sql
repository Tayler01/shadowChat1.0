/*
  # Shado Live safety, activity, and notification integration

  Forward-only integration for the disabled-by-default Shado Live beta. The
  existing reporting and moderation ledgers remain authoritative, while legacy
  reporting RPCs deliberately hide the new live_* target values from older
  clients. Live notification state is isolated from Activity HQ and the legacy
  push ledger so this migration cannot create phantom Activity unread counts.
*/

BEGIN;

ALTER TABLE public.member_reports
  DROP CONSTRAINT IF EXISTS member_reports_target_type_check;
ALTER TABLE public.member_reports
  ADD CONSTRAINT member_reports_target_type_check CHECK (target_type IN (
    'user',
    'general_message',
    'dm_message',
    'shadow_pin_image',
    'shadow_pin_comment',
    'live_room',
    'live_participant',
    'live_message'
  ));

ALTER TABLE public.moderation_cases
  DROP CONSTRAINT IF EXISTS moderation_cases_target_type_check;
ALTER TABLE public.moderation_cases
  ADD CONSTRAINT moderation_cases_target_type_check CHECK (target_type IN (
    'user',
    'general_message',
    'dm_message',
    'shadow_pin_image',
    'shadow_pin_comment',
    'live_room',
    'live_participant',
    'live_message'
  ));

ALTER TABLE public.moderation_case_actions
  DROP CONSTRAINT IF EXISTS moderation_case_actions_action_type_check;
ALTER TABLE public.moderation_case_actions
  ADD CONSTRAINT moderation_case_actions_action_type_check CHECK (action_type IN (
    'no_action',
    'remove_content',
    'channel_ban',
    'end_live_room',
    'remove_live_participant',
    'mute_live_participant',
    'set_live_restriction',
    'revoke_live_restriction'
  ));

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS shado_live_in_app_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE public.shado_live_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'room_started',
    'room_ended',
    'speaker_promoted',
    'speaker_demoted',
    'participant_muted',
    'participant_removed'
  )),
  room_id uuid NOT NULL REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.live_room_participants(id) ON DELETE SET NULL,
  source_event_id uuid NOT NULL REFERENCES public.live_room_events(id) ON DELETE CASCADE,
  body_preview text NOT NULL DEFAULT '' CHECK (char_length(body_preview) <= 240),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 16384
  ),
  dedupe_key text NOT NULL UNIQUE CHECK (char_length(dedupe_key) BETWEEN 1 AND 240),
  read_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shado_live_notifications_not_self_check
    CHECK (recipient_user_id <> actor_user_id)
);

CREATE INDEX shado_live_notifications_recipient_recent_idx
  ON public.shado_live_notifications (recipient_user_id, occurred_at DESC, id DESC);
CREATE INDEX shado_live_notifications_recipient_unread_idx
  ON public.shado_live_notifications (recipient_user_id, occurred_at DESC, id DESC)
  WHERE read_at IS NULL;
CREATE INDEX shado_live_notifications_room_idx
  ON public.shado_live_notifications (room_id, occurred_at DESC, id DESC);

ALTER TABLE public.shado_live_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients read own unblocked Shado Live notifications"
  ON public.shado_live_notifications
  FOR SELECT
  TO authenticated
  USING (
    recipient_user_id = (SELECT auth.uid())
    AND NOT private.users_have_block(recipient_user_id, actor_user_id)
  );

REVOKE ALL ON TABLE public.shado_live_notifications
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.shado_live_notifications TO authenticated;

CREATE FUNCTION shado_live_private.emit_shado_live_notification(
  target_recipient_id uuid,
  target_actor_id uuid,
  target_type text,
  target_room public.live_rooms,
  target_participant_id uuid,
  target_event public.live_room_events
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_profile jsonb;
  notification_enabled boolean;
  preview text;
BEGIN
  IF target_recipient_id IS NULL
    OR target_actor_id IS NULL
    OR target_recipient_id = target_actor_id
    OR target_room.id IS NULL
    OR target_room.audience <> 'connections'
    OR target_type NOT IN (
      'room_started', 'room_ended', 'speaker_promoted',
      'speaker_demoted', 'participant_muted', 'participant_removed'
    )
    OR private.users_have_block(target_recipient_id, target_actor_id)
    OR NOT private.users_are_connected(target_recipient_id, target_room.host_user_id)
  THEN
    RETURN;
  END IF;

  SELECT preferences.shado_live_in_app_enabled
  INTO notification_enabled
  FROM public.notification_preferences preferences
  WHERE preferences.user_id = target_recipient_id;

  IF NOT coalesce(notification_enabled, true) THEN
    RETURN;
  END IF;

  SELECT public.user_public_profile_json(users)
  INTO actor_profile
  FROM public.users users
  WHERE users.id = target_actor_id;

  IF actor_profile IS NULL THEN
    RETURN;
  END IF;

  preview := CASE target_type
    WHEN 'room_started' THEN 'Started a Shado Live room'
    WHEN 'room_ended' THEN 'The Shado Live room ended'
    WHEN 'speaker_promoted' THEN 'You were invited to speak'
    WHEN 'speaker_demoted' THEN 'You returned to the audience'
    WHEN 'participant_muted' THEN 'Your microphone was muted'
    ELSE 'You were removed from the Shado Live room'
  END;

  INSERT INTO public.shado_live_notifications (
    recipient_user_id,
    actor_user_id,
    type,
    room_id,
    participant_id,
    source_event_id,
    body_preview,
    metadata,
    dedupe_key,
    occurred_at
  ) VALUES (
    target_recipient_id,
    target_actor_id,
    target_type,
    target_room.id,
    target_participant_id,
    target_event.id,
    preview,
    jsonb_build_object(
      'room_id', target_room.id,
      'room_title', target_room.title,
      'room_status', target_room.status,
      'actor', actor_profile,
      'url', '/?view=games&experience=shado-live&item=' || target_room.id::text,
      'legacy_url', '/?view=games',
      'route', jsonb_build_object(
        'view', 'games',
        'experience', 'shado-live',
        'item', target_room.id
      ),
      'source_event_id', target_event.id,
      'source_event_type', target_event.event_type
    ),
    'shado-live:' || target_event.id::text || ':' || target_recipient_id::text,
    target_event.created_at
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

CREATE FUNCTION shado_live_private.create_shado_live_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  room_row public.live_rooms%ROWTYPE;
  recipient_id uuid;
  actor_id uuid;
  participant_id uuid;
BEGIN
  IF new.room_id IS NULL OR new.event_type NOT IN (
    'room_started', 'room_ended', 'speaker_promoted',
    'speaker_demoted', 'participant_muted', 'participant_removed'
  ) THEN
    RETURN new;
  END IF;

  SELECT * INTO room_row
  FROM public.live_rooms rooms
  WHERE rooms.id = new.room_id;

  IF NOT FOUND OR room_row.audience <> 'connections' THEN
    RETURN new;
  END IF;

  actor_id := coalesce(new.actor_user_id, room_row.host_user_id);

  IF new.event_type = 'room_started' THEN
    FOR recipient_id IN
      SELECT CASE
        WHEN connections.member_low_id = room_row.host_user_id
          THEN connections.member_high_id
        ELSE connections.member_low_id
      END
      FROM public.user_connections connections
      WHERE room_row.host_user_id IN (connections.member_low_id, connections.member_high_id)
        AND connections.status = 'accepted'
    LOOP
      PERFORM shado_live_private.emit_shado_live_notification(
        recipient_id, actor_id, new.event_type, room_row, NULL, new
      );
    END LOOP;
  ELSIF new.event_type = 'room_ended' THEN
    FOR recipient_id, participant_id IN
      SELECT participants.user_id, participants.id
      FROM public.live_room_participants participants
      WHERE participants.room_id = room_row.id
        AND participants.user_id <> room_row.host_user_id
        AND participants.status <> 'removed'
    LOOP
      PERFORM shado_live_private.emit_shado_live_notification(
        recipient_id, actor_id, new.event_type, room_row, participant_id, new
      );
    END LOOP;
  ELSIF new.target_user_id IS NOT NULL THEN
    SELECT participants.id INTO participant_id
    FROM public.live_room_participants participants
    WHERE participants.room_id = room_row.id
      AND participants.user_id = new.target_user_id;

    PERFORM shado_live_private.emit_shado_live_notification(
      new.target_user_id, actor_id, new.event_type, room_row, participant_id, new
    );
  END IF;

  RETURN new;
END;
$$;

CREATE FUNCTION shado_live_private.cleanup_shado_live_notifications_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.shado_live_notifications notifications
  WHERE (notifications.recipient_user_id = new.blocker_id AND notifications.actor_user_id = new.blocked_id)
     OR (notifications.recipient_user_id = new.blocked_id AND notifications.actor_user_id = new.blocker_id);
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION shado_live_private.emit_shado_live_notification(
  uuid, uuid, text, public.live_rooms, uuid, public.live_room_events
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION shado_live_private.create_shado_live_notifications()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION shado_live_private.cleanup_shado_live_notifications_on_block()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER create_shado_live_notifications
  AFTER INSERT ON public.live_room_events
  FOR EACH ROW EXECUTE FUNCTION shado_live_private.create_shado_live_notifications();

CREATE TRIGGER cleanup_shado_live_notifications_on_block
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION shado_live_private.cleanup_shado_live_notifications_on_block();

CREATE FUNCTION shado_live_private.list_my_shado_live_notifications_impl(
  result_limit integer DEFAULT 30,
  before_occurred_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  notification_id uuid,
  type text,
  room_id uuid,
  participant_id uuid,
  actor jsonb,
  body_preview text,
  metadata jsonb,
  read_at timestamptz,
  occurred_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF (before_occurred_at IS NULL) <> (before_id IS NULL) THEN
    RAISE EXCEPTION 'Notification cursor must include timestamp and id';
  END IF;

  RETURN QUERY
  SELECT
    notifications.id,
    notifications.type,
    notifications.room_id,
    notifications.participant_id,
    public.user_public_profile_json(actors),
    notifications.body_preview,
    notifications.metadata,
    notifications.read_at,
    notifications.occurred_at
  FROM public.shado_live_notifications notifications
  JOIN public.users actors ON actors.id = notifications.actor_user_id
  WHERE notifications.recipient_user_id = caller_id
    AND NOT private.users_have_block(caller_id, notifications.actor_user_id)
    AND (
      before_occurred_at IS NULL
      OR (notifications.occurred_at, notifications.id) < (before_occurred_at, before_id)
    )
  ORDER BY notifications.occurred_at DESC, notifications.id DESC
  LIMIT greatest(1, least(coalesce(result_limit, 30), 50));
END;
$$;

CREATE FUNCTION shado_live_private.mark_my_shado_live_notifications_read_impl(
  target_notification_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  changed_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF coalesce(pg_catalog.array_length(target_notification_ids, 1), 0) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Choose between 1 and 100 notifications';
  END IF;

  UPDATE public.shado_live_notifications notifications
  SET read_at = coalesce(notifications.read_at, now())
  WHERE notifications.recipient_user_id = caller_id
    AND notifications.id = ANY(target_notification_ids)
    AND NOT private.users_have_block(caller_id, notifications.actor_user_id)
    AND notifications.read_at IS NULL;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

REVOKE ALL ON FUNCTION shado_live_private.list_my_shado_live_notifications_impl(
  integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION shado_live_private.mark_my_shado_live_notifications_read_impl(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.list_my_shado_live_notifications_impl(
  integer, timestamptz, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.mark_my_shado_live_notifications_read_impl(uuid[])
  TO authenticated, service_role;

CREATE FUNCTION public.list_my_shado_live_notifications(
  p_limit integer DEFAULT 30,
  p_before_occurred_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  notification_id uuid,
  type text,
  room_id uuid,
  participant_id uuid,
  actor jsonb,
  body_preview text,
  metadata jsonb,
  read_at timestamptz,
  occurred_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM shado_live_private.list_my_shado_live_notifications_impl(
    p_limit, p_before_occurred_at, p_before_id
  );
$$;

CREATE FUNCTION public.mark_my_shado_live_notifications_read(
  p_notification_ids uuid[]
)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.mark_my_shado_live_notifications_read_impl(p_notification_ids);
$$;

REVOKE ALL ON FUNCTION public.list_my_shado_live_notifications(integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_my_shado_live_notifications_read(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_shado_live_notifications(integer, timestamptz, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_my_shado_live_notifications_read(uuid[])
  TO authenticated, service_role;

CREATE FUNCTION shado_live_private.submit_shado_live_report_impl(
  p_target_type text,
  p_target_id uuid,
  p_category text,
  p_client_report_id uuid,
  p_details text DEFAULT ''
)
RETURNS TABLE (
  report_id uuid,
  case_id uuid,
  case_number bigint,
  case_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_target_type text := lower(trim(coalesce(p_target_type, '')));
  normalized_category text := lower(trim(coalesce(p_category, '')));
  normalized_details text := trim(coalesce(p_details, ''));
  resolved_subject_id uuid;
  resolved_room_id uuid;
  source_created_at timestamptz;
  target_snapshot jsonb;
  subject_snapshot jsonb;
  resolved_report_id uuid;
  resolved_case_id uuid;
  resolved_case_number bigint;
  resolved_case_status text;
  initial_severity text;
  ack_interval interval;
  resolve_interval interval;
  existing_severity text;
  existing_full_admin_only boolean;
  report_requires_full_admin boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_target_id IS NULL OR p_client_report_id IS NULL THEN
    RAISE EXCEPTION 'A target and client report id are required';
  END IF;
  IF normalized_target_type NOT IN ('live_room', 'live_participant', 'live_message') THEN
    RAISE EXCEPTION 'Unsupported Shado Live report target';
  END IF;
  IF normalized_category NOT IN (
    'harassment', 'immediate_safety', 'hate_or_abuse', 'sexual_content',
    'spam_or_scam', 'privacy_or_impersonation', 'self_harm', 'other'
  ) THEN
    RAISE EXCEPTION 'Choose a valid report reason';
  END IF;
  IF char_length(normalized_details) > 2000
    OR (normalized_category = 'other' AND char_length(normalized_details) < 10) THEN
    RAISE EXCEPTION 'Report details are invalid';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shado-live-report:' || caller_id::text, 742041)
  );

  SELECT
    reports.id,
    links.case_id,
    cases.case_number,
    cases.status
  INTO
    resolved_report_id,
    resolved_case_id,
    resolved_case_number,
    resolved_case_status
  FROM public.member_reports reports
  JOIN public.moderation_case_reports links ON links.report_id = reports.id
  JOIN public.moderation_cases cases ON cases.id = links.case_id
  WHERE reports.reporter_user_id = caller_id
    AND reports.client_report_id = p_client_report_id
    AND reports.target_type = normalized_target_type
    AND reports.target_id = p_target_id;

  IF FOUND THEN
    RETURN QUERY SELECT
      resolved_report_id, resolved_case_id, resolved_case_number, resolved_case_status;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.member_reports reports
    WHERE reports.reporter_user_id = caller_id
      AND reports.client_report_id = p_client_report_id
  ) THEN
    RAISE EXCEPTION 'This client report id was already used for another target';
  END IF;

  IF (
    SELECT count(*)
    FROM public.member_reports reports
    WHERE reports.reporter_user_id = caller_id
      AND reports.submitted_at >= now() - interval '10 minutes'
  ) >= 5 OR (
    SELECT count(*)
    FROM public.member_reports reports
    WHERE reports.reporter_user_id = caller_id
      AND reports.submitted_at >= now() - interval '24 hours'
  ) >= 20 THEN
    RAISE EXCEPTION 'Too many reports were submitted. Wait before trying again';
  END IF;

  IF normalized_target_type = 'live_room' THEN
    SELECT
      rooms.host_user_id,
      rooms.id,
      rooms.created_at,
      jsonb_build_object(
        'targetType', 'live_room',
        'targetId', rooms.id,
        'roomId', rooms.id,
        'title', rooms.title,
        'description', rooms.description,
        'status', rooms.status,
        'audience', rooms.audience,
        'hostId', rooms.host_user_id,
        'revision', rooms.revision,
        'startedAt', rooms.started_at,
        'createdAt', rooms.created_at
      )
    INTO resolved_subject_id, resolved_room_id, source_created_at, target_snapshot
    FROM public.live_rooms rooms
    WHERE rooms.id = p_target_id
      AND rooms.audience = 'connections'
      AND (
        shado_live_private.can_access_shado_live_room(caller_id, rooms.id)
        OR EXISTS (
          SELECT 1 FROM public.live_room_participants viewer
          WHERE viewer.room_id = rooms.id AND viewer.user_id = caller_id
        )
      )
      AND NOT private.users_have_block(caller_id, rooms.host_user_id);
  ELSIF normalized_target_type = 'live_participant' THEN
    SELECT
      participants.user_id,
      rooms.id,
      participants.created_at,
      jsonb_build_object(
        'targetType', 'live_participant',
        'targetId', participants.id,
        'roomId', rooms.id,
        'roomTitle', rooms.title,
        'roomStatus', rooms.status,
        'participantId', participants.id,
        'participantUserId', participants.user_id,
        'role', participants.role,
        'status', participants.status,
        'hostMuted', participants.host_muted,
        'revision', participants.revision,
        'joinedAt', participants.joined_at,
        'createdAt', participants.created_at
      )
    INTO resolved_subject_id, resolved_room_id, source_created_at, target_snapshot
    FROM public.live_room_participants participants
    JOIN public.live_rooms rooms ON rooms.id = participants.room_id
    WHERE participants.id = p_target_id
      AND rooms.audience = 'connections'
      AND (
        shado_live_private.can_access_shado_live_room(caller_id, rooms.id)
        OR EXISTS (
          SELECT 1 FROM public.live_room_participants viewer
          WHERE viewer.room_id = rooms.id AND viewer.user_id = caller_id
        )
      )
      AND NOT private.users_have_block(caller_id, participants.user_id);
  ELSE
    SELECT
      messages.sender_user_id,
      rooms.id,
      messages.created_at,
      jsonb_build_object(
        'targetType', 'live_message',
        'targetId', messages.id,
        'roomId', rooms.id,
        'roomTitle', rooms.title,
        'roomStatus', rooms.status,
        'messageId', messages.id,
        'authorId', messages.sender_user_id,
        'body', messages.body,
        'revision', messages.revision,
        'createdAt', messages.created_at,
        'updatedAt', messages.updated_at
      )
    INTO resolved_subject_id, resolved_room_id, source_created_at, target_snapshot
    FROM public.live_room_messages messages
    JOIN public.live_rooms rooms ON rooms.id = messages.room_id
    WHERE messages.id = p_target_id
      AND messages.deleted_at IS NULL
      AND rooms.audience = 'connections'
      AND (
        shado_live_private.can_access_shado_live_room(caller_id, rooms.id)
        OR EXISTS (
          SELECT 1 FROM public.live_room_participants viewer
          WHERE viewer.room_id = rooms.id AND viewer.user_id = caller_id
        )
      )
      AND NOT private.users_have_block(caller_id, messages.sender_user_id);
  END IF;

  IF target_snapshot IS NULL OR resolved_subject_id IS NULL OR resolved_room_id IS NULL THEN
    RAISE EXCEPTION 'This Shado Live report target is not available';
  END IF;
  IF resolved_subject_id = caller_id THEN
    RAISE EXCEPTION 'You cannot report your own Shado Live room, participation, or message';
  END IF;
  IF NOT private.users_are_connected(caller_id, (
    SELECT rooms.host_user_id FROM public.live_rooms rooms WHERE rooms.id = resolved_room_id
  )) THEN
    RAISE EXCEPTION 'This Shado Live report target is not available';
  END IF;

  SELECT public.user_public_profile_json(users)
  INTO subject_snapshot
  FROM public.users users
  WHERE users.id = resolved_subject_id;

  target_snapshot := target_snapshot || jsonb_build_object(
    'subject', coalesce(subject_snapshot, '{}'::jsonb),
    'capturedAt', now(),
    'sourceCreatedAt', source_created_at,
    'deepLink', jsonb_build_object(
      'url', '/?view=games&experience=shado-live&item=' || resolved_room_id::text,
      'legacyUrl', '/?view=games',
      'view', 'games',
      'experience', 'shado-live',
      'item', resolved_room_id
    )
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles roles
    WHERE roles.user_id IN (caller_id, resolved_subject_id)
      AND roles.role IN ('admin', 'sub_admin')
  ) INTO report_requires_full_admin;

  initial_severity := CASE normalized_category
    WHEN 'immediate_safety' THEN 'critical'
    WHEN 'hate_or_abuse' THEN 'high'
    WHEN 'sexual_content' THEN 'high'
    WHEN 'privacy_or_impersonation' THEN 'high'
    WHEN 'self_harm' THEN 'high'
    WHEN 'harassment' THEN 'medium'
    WHEN 'spam_or_scam' THEN 'medium'
    ELSE 'low'
  END;
  ack_interval := CASE initial_severity
    WHEN 'critical' THEN interval '15 minutes'
    WHEN 'high' THEN interval '1 hour'
    WHEN 'medium' THEN interval '8 hours'
    ELSE interval '24 hours'
  END;
  resolve_interval := CASE initial_severity
    WHEN 'critical' THEN interval '4 hours'
    WHEN 'high' THEN interval '24 hours'
    WHEN 'medium' THEN interval '72 hours'
    ELSE interval '7 days'
  END;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_target_type || ':' || p_target_id::text, 742042)
  );

  SELECT cases.id, cases.case_number, cases.status, cases.severity, cases.full_admin_only
  INTO resolved_case_id, resolved_case_number, resolved_case_status, existing_severity, existing_full_admin_only
  FROM public.moderation_cases cases
  WHERE cases.target_type = normalized_target_type
    AND cases.target_id = p_target_id
    AND cases.status NOT IN ('resolved', 'dismissed', 'closed')
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.moderation_cases AS created_case (
      subject_user_id,
      target_type,
      target_id,
      primary_category,
      severity,
      full_admin_only,
      ack_due_at,
      resolve_due_at
    ) VALUES (
      resolved_subject_id,
      normalized_target_type,
      p_target_id,
      normalized_category,
      initial_severity,
      report_requires_full_admin,
      now() + ack_interval,
      now() + resolve_interval
    )
    RETURNING created_case.id, created_case.case_number, created_case.status
    INTO resolved_case_id, resolved_case_number, resolved_case_status;

    INSERT INTO public.moderation_case_events (case_id, event_type, metadata)
    VALUES (
      resolved_case_id,
      'case_created',
      jsonb_build_object(
        'severity', initial_severity,
        'targetType', normalized_target_type,
        'roomId', resolved_room_id
      )
    );
  ELSE
    IF (
      CASE initial_severity
        WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1
      END
    ) > (
      CASE existing_severity
        WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1
      END
    ) THEN
      UPDATE public.moderation_cases cases
      SET severity = initial_severity,
          ack_due_at = least(cases.ack_due_at, now() + ack_interval),
          resolve_due_at = least(cases.resolve_due_at, now() + resolve_interval),
          version = cases.version + 1
      WHERE cases.id = resolved_case_id;
    END IF;
    IF report_requires_full_admin AND NOT coalesce(existing_full_admin_only, false) THEN
      UPDATE public.moderation_cases cases
      SET full_admin_only = true,
          version = cases.version + 1
      WHERE cases.id = resolved_case_id;
    END IF;
  END IF;

  resolved_report_id := gen_random_uuid();
  INSERT INTO public.member_reports (
    id,
    reporter_user_id,
    subject_user_id,
    target_type,
    target_id,
    category,
    details,
    client_report_id
  ) VALUES (
    resolved_report_id,
    caller_id,
    resolved_subject_id,
    normalized_target_type,
    p_target_id,
    normalized_category,
    normalized_details,
    p_client_report_id
  );

  INSERT INTO public.moderation_case_reports (case_id, report_id)
  VALUES (resolved_case_id, resolved_report_id);

  INSERT INTO public.moderation_evidence (
    case_id,
    report_id,
    target_type,
    target_id,
    source_author_id,
    snapshot,
    content_hash
  ) VALUES (
    resolved_case_id,
    resolved_report_id,
    normalized_target_type,
    p_target_id,
    resolved_subject_id,
    target_snapshot,
    pg_catalog.encode(extensions.digest(target_snapshot::text, 'sha256'), 'hex')
  );

  INSERT INTO public.moderation_case_events (case_id, event_type, metadata)
  VALUES (
    resolved_case_id,
    'report_linked',
    jsonb_build_object(
      'reportId', resolved_report_id,
      'category', normalized_category,
      'roomId', resolved_room_id
    )
  );

  INSERT INTO public.moderation_report_updates (
    report_id,
    recipient_user_id,
    update_type,
    message
  ) VALUES (
    resolved_report_id,
    caller_id,
    'received',
    'Your Shado Live report was received and is ready for safety review.'
  );

  SELECT cases.status INTO resolved_case_status
  FROM public.moderation_cases cases
  WHERE cases.id = resolved_case_id;

  RETURN QUERY SELECT
    resolved_report_id, resolved_case_id, resolved_case_number, resolved_case_status;
END;
$$;

REVOKE ALL ON FUNCTION shado_live_private.submit_shado_live_report_impl(
  text, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.submit_shado_live_report_impl(
  text, uuid, text, uuid, text
) TO authenticated, service_role;

CREATE FUNCTION public.submit_shado_live_report(
  p_target_type text,
  p_target_id uuid,
  p_category text,
  p_client_report_id uuid,
  p_details text DEFAULT ''
)
RETURNS TABLE (
  report_id uuid,
  case_id uuid,
  case_number bigint,
  case_status text
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM shado_live_private.submit_shado_live_report_impl(
    p_target_type, p_target_id, p_category, p_client_report_id, p_details
  );
$$;

REVOKE ALL ON FUNCTION public.submit_shado_live_report(text, uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_shado_live_report(text, uuid, text, uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_my_member_reports(
  p_limit integer DEFAULT 30,
  p_before_submitted_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF (p_before_submitted_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Report cursor must include timestamp and id';
  END IF;

  RETURN QUERY
  SELECT
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
  FROM public.member_reports reports
  JOIN public.moderation_case_reports links ON links.report_id = reports.id
  JOIN public.moderation_cases cases ON cases.id = links.case_id
  JOIN public.moderation_evidence evidence ON evidence.report_id = reports.id
  WHERE reports.reporter_user_id = caller_id
    AND reports.target_type NOT IN ('live_room', 'live_participant', 'live_message')
    AND (
      p_before_submitted_at IS NULL
      OR (reports.submitted_at, reports.id) < (p_before_submitted_at, p_before_id)
    )
  ORDER BY reports.submitted_at DESC, reports.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

CREATE FUNCTION shado_live_private.list_my_shado_live_reports_impl(
  result_limit integer DEFAULT 30,
  before_submitted_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL
)
RETURNS TABLE (
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF (before_submitted_at IS NULL) <> (before_id IS NULL) THEN
    RAISE EXCEPTION 'Report cursor must include timestamp and id';
  END IF;

  RETURN QUERY
  SELECT
    reports.id,
    cases.case_number,
    reports.target_type,
    reports.category,
    cases.status,
    left(coalesce(
      evidence.snapshot->>'title',
      evidence.snapshot->>'roomTitle',
      evidence.snapshot->>'body',
      evidence.snapshot->'subject'->>'displayName',
      'Shado Live report'
    ), 180),
    cases.reporter_summary,
    reports.submitted_at,
    cases.updated_at
  FROM public.member_reports reports
  JOIN public.moderation_case_reports links ON links.report_id = reports.id
  JOIN public.moderation_cases cases ON cases.id = links.case_id
  JOIN public.moderation_evidence evidence ON evidence.report_id = reports.id
  WHERE reports.reporter_user_id = caller_id
    AND reports.target_type IN ('live_room', 'live_participant', 'live_message')
    AND (
      before_submitted_at IS NULL
      OR (reports.submitted_at, reports.id) < (before_submitted_at, before_id)
    )
  ORDER BY reports.submitted_at DESC, reports.id DESC
  LIMIT greatest(1, least(coalesce(result_limit, 30), 50));
END;
$$;

REVOKE ALL ON FUNCTION shado_live_private.list_my_shado_live_reports_impl(
  integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.list_my_shado_live_reports_impl(
  integer, timestamptz, uuid
) TO authenticated, service_role;

CREATE FUNCTION public.list_my_shado_live_reports(
  p_limit integer DEFAULT 30,
  p_before_submitted_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM shado_live_private.list_my_shado_live_reports_impl(
    p_limit, p_before_submitted_at, p_before_id
  );
$$;

REVOKE ALL ON FUNCTION public.list_my_shado_live_reports(integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_shado_live_reports(integer, timestamptz, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_moderation_cases(
  p_queue text DEFAULT 'new',
  p_status text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_before_updated_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_queue text := lower(trim(coalesce(p_queue, 'new')));
  normalized_search text := lower(trim(coalesce(p_search, '')));
BEGIN
  IF caller_id IS NULL OR NOT public.is_app_operator(caller_id) THEN
    RAISE EXCEPTION 'Operator access required';
  END IF;
  IF normalized_queue NOT IN ('new', 'mine', 'in_review', 'resolved', 'all') THEN
    RAISE EXCEPTION 'Invalid case queue';
  END IF;
  IF char_length(normalized_search) > 100 THEN
    RAISE EXCEPTION 'Case search is too long';
  END IF;
  IF (p_before_updated_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Case cursor must include timestamp and id';
  END IF;

  RETURN QUERY
  SELECT
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
  FROM public.moderation_cases cases
  LEFT JOIN public.users subjects ON subjects.id = cases.subject_user_id
  LEFT JOIN public.users assignees ON assignees.id = cases.assigned_to
  LEFT JOIN public.moderation_case_reports links ON links.case_id = cases.id
  WHERE private.can_operator_access_moderation_case(caller_id, cases.id)
    AND cases.target_type NOT IN ('live_room', 'live_participant', 'live_message')
    AND (
      normalized_queue = 'all'
      OR (normalized_queue = 'new' AND cases.status = 'new')
      OR (normalized_queue = 'mine' AND cases.assigned_to = caller_id AND cases.status NOT IN ('resolved', 'dismissed', 'closed'))
      OR (normalized_queue = 'in_review' AND cases.status IN ('triaged', 'investigating', 'waiting', 'actioned'))
      OR (normalized_queue = 'resolved' AND cases.status IN ('resolved', 'dismissed', 'closed'))
    )
    AND (p_status IS NULL OR cases.status = p_status)
    AND (p_severity IS NULL OR cases.severity = p_severity)
    AND (p_target_type IS NULL OR cases.target_type = p_target_type)
    AND (p_category IS NULL OR cases.primary_category = p_category)
    AND (
      normalized_search = ''
      OR cases.case_number::text LIKE '%' || normalized_search || '%'
      OR lower(coalesce(subjects.username, '')) LIKE '%' || normalized_search || '%'
      OR lower(coalesce(subjects.display_name, '')) LIKE '%' || normalized_search || '%'
    )
    AND (
      p_before_updated_at IS NULL
      OR (cases.updated_at, cases.id) < (p_before_updated_at, p_before_id)
    )
  GROUP BY cases.id, subjects.id, assignees.id
  ORDER BY
    CASE cases.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    cases.updated_at DESC,
    cases.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

CREATE FUNCTION shado_live_private.list_shado_live_moderation_cases_impl(
  p_queue text DEFAULT 'new',
  p_status text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_before_updated_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_queue text := lower(trim(coalesce(p_queue, 'new')));
  normalized_search text := lower(trim(coalesce(p_search, '')));
BEGIN
  IF caller_id IS NULL OR NOT public.is_app_operator(caller_id) THEN
    RAISE EXCEPTION 'Operator access required';
  END IF;
  IF normalized_queue NOT IN ('new', 'mine', 'in_review', 'resolved', 'all') THEN
    RAISE EXCEPTION 'Invalid case queue';
  END IF;
  IF char_length(normalized_search) > 100 THEN
    RAISE EXCEPTION 'Case search is too long';
  END IF;
  IF (p_before_updated_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Case cursor must include timestamp and id';
  END IF;
  IF p_target_type IS NOT NULL
    AND p_target_type NOT IN ('live_room', 'live_participant', 'live_message') THEN
    RAISE EXCEPTION 'Invalid Shado Live case target';
  END IF;

  RETURN QUERY
  SELECT
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
  FROM public.moderation_cases cases
  LEFT JOIN public.users subjects ON subjects.id = cases.subject_user_id
  LEFT JOIN public.users assignees ON assignees.id = cases.assigned_to
  LEFT JOIN public.moderation_case_reports links ON links.case_id = cases.id
  WHERE private.can_operator_access_moderation_case(caller_id, cases.id)
    AND cases.target_type IN ('live_room', 'live_participant', 'live_message')
    AND (
      normalized_queue = 'all'
      OR (normalized_queue = 'new' AND cases.status = 'new')
      OR (normalized_queue = 'mine' AND cases.assigned_to = caller_id AND cases.status NOT IN ('resolved', 'dismissed', 'closed'))
      OR (normalized_queue = 'in_review' AND cases.status IN ('triaged', 'investigating', 'waiting', 'actioned'))
      OR (normalized_queue = 'resolved' AND cases.status IN ('resolved', 'dismissed', 'closed'))
    )
    AND (p_status IS NULL OR cases.status = p_status)
    AND (p_severity IS NULL OR cases.severity = p_severity)
    AND (p_target_type IS NULL OR cases.target_type = p_target_type)
    AND (p_category IS NULL OR cases.primary_category = p_category)
    AND (
      normalized_search = ''
      OR cases.case_number::text LIKE '%' || normalized_search || '%'
      OR lower(coalesce(subjects.username, '')) LIKE '%' || normalized_search || '%'
      OR lower(coalesce(subjects.display_name, '')) LIKE '%' || normalized_search || '%'
    )
    AND (
      p_before_updated_at IS NULL
      OR (cases.updated_at, cases.id) < (p_before_updated_at, p_before_id)
    )
  GROUP BY cases.id, subjects.id, assignees.id
  ORDER BY
    CASE cases.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    cases.updated_at DESC,
    cases.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

CREATE FUNCTION public.list_shado_live_moderation_cases(
  p_queue text DEFAULT 'new',
  p_status text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_before_updated_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM shado_live_private.list_shado_live_moderation_cases_impl(
    p_queue, p_status, p_severity, p_target_type, p_category,
    p_search, p_limit, p_before_updated_at, p_before_id
  );
$$;

CREATE FUNCTION shado_live_private.get_shado_live_moderation_case_impl(
  p_case_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  target_type text;
BEGIN
  IF caller_id IS NULL OR NOT public.is_app_operator(caller_id) THEN
    RAISE EXCEPTION 'Operator access required';
  END IF;

  SELECT cases.target_type INTO target_type
  FROM public.moderation_cases cases
  WHERE cases.id = p_case_id
    AND private.can_operator_access_moderation_case(caller_id, cases.id);

  IF NOT FOUND OR target_type NOT IN ('live_room', 'live_participant', 'live_message') THEN
    RAISE EXCEPTION 'Shado Live case is not available';
  END IF;

  RETURN public.get_moderation_case(p_case_id);
END;
$$;

CREATE FUNCTION public.get_shado_live_moderation_case(p_case_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.get_shado_live_moderation_case_impl(p_case_id);
$$;

CREATE FUNCTION shado_live_private.apply_shado_live_case_action_impl(
  p_case_id uuid,
  p_expected_version integer,
  p_action_type text,
  p_requested_scopes text[] DEFAULT '{}'::text[],
  p_duration_minutes integer DEFAULT NULL,
  p_public_reason text DEFAULT NULL,
  p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  target_case public.moderation_cases%ROWTYPE;
  room_row public.live_rooms%ROWTYPE;
  participant_row public.live_room_participants%ROWTYPE;
  provider_operation public.live_provider_operations%ROWTYPE;
  normalized_action text := lower(trim(coalesce(p_action_type, '')));
  normalized_public_reason text := nullif(trim(coalesce(p_public_reason, '')), '');
  normalized_note text := nullif(trim(coalesce(p_internal_note, '')), '');
  clean_scopes text[] := '{}'::text[];
  target_role text;
  evidence_snapshot jsonb;
  resolved_room_id uuid;
  resolved_participant_user_id uuid;
  resolved_action_id uuid := gen_random_uuid();
  before_state jsonb := '{}'::jsonb;
  after_state jsonb := '{}'::jsonb;
  restriction_results jsonb := '[]'::jsonb;
  restriction_result jsonb;
  current_scope text;
  action_error text;
  previous_case_status text;
BEGIN
  IF caller_id IS NULL OR NOT public.is_app_operator(caller_id) THEN
    RAISE EXCEPTION 'Operator access required';
  END IF;

  SELECT * INTO target_case
  FROM public.moderation_cases cases
  WHERE cases.id = p_case_id
  FOR UPDATE;

  IF NOT FOUND
    OR target_case.target_type NOT IN ('live_room', 'live_participant', 'live_message')
    OR NOT private.can_operator_access_moderation_case(caller_id, p_case_id) THEN
    RAISE EXCEPTION 'Shado Live case is not available';
  END IF;
  IF NOT public.is_app_admin(caller_id)
    AND target_case.assigned_to IS DISTINCT FROM caller_id THEN
    RAISE EXCEPTION 'Claim this case before applying an action';
  END IF;
  IF target_case.version <> p_expected_version THEN
    RAISE EXCEPTION 'Case changed. Refresh before applying an action';
  END IF;
  IF normalized_action NOT IN (
    'no_action', 'end_live_room', 'remove_live_participant',
    'mute_live_participant', 'set_live_restriction', 'revoke_live_restriction'
  ) THEN
    RAISE EXCEPTION 'Invalid Shado Live case action';
  END IF;
  IF normalized_note IS NOT NULL AND char_length(normalized_note) > 4000 THEN
    RAISE EXCEPTION 'Internal note is too long';
  END IF;
  IF normalized_public_reason IS NOT NULL AND char_length(normalized_public_reason) > 500 THEN
    RAISE EXCEPTION 'Public reason is too long';
  END IF;
  IF p_duration_minutes IS NOT NULL
    AND p_duration_minutes NOT BETWEEN 1 AND 525600 THEN
    RAISE EXCEPTION 'Restriction duration is invalid';
  END IF;

  SELECT evidence.snapshot INTO evidence_snapshot
  FROM public.moderation_evidence evidence
  WHERE evidence.case_id = p_case_id
    AND evidence.target_type = target_case.target_type
    AND evidence.target_id = target_case.target_id
  ORDER BY evidence.captured_at DESC, evidence.id DESC
  LIMIT 1;

  IF evidence_snapshot IS NULL THEN
    RAISE EXCEPTION 'Server-captured Shado Live evidence is unavailable';
  END IF;

  BEGIN
    resolved_room_id := nullif(evidence_snapshot ->> 'roomId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    resolved_room_id := NULL;
  END;
  IF resolved_room_id IS NULL THEN
    RAISE EXCEPTION 'Server-captured Shado Live room evidence is invalid';
  END IF;

  SELECT * INTO room_row
  FROM public.live_rooms rooms
  WHERE rooms.id = resolved_room_id
  FOR UPDATE;
  IF NOT FOUND OR room_row.audience <> 'connections' THEN
    RAISE EXCEPTION 'The reported Shado Live room is unavailable';
  END IF;

  resolved_participant_user_id := target_case.subject_user_id;
  IF target_case.target_type = 'live_participant' THEN
    SELECT * INTO participant_row
    FROM public.live_room_participants participants
    WHERE participants.id = target_case.target_id
      AND participants.room_id = room_row.id
      AND participants.user_id = target_case.subject_user_id
    FOR UPDATE;
  ELSIF target_case.target_type = 'live_message' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.live_room_messages messages
      WHERE messages.id = target_case.target_id
        AND messages.room_id = room_row.id
        AND messages.sender_user_id = target_case.subject_user_id
    ) THEN
      RAISE EXCEPTION 'The reported Shado Live message does not match its evidence';
    END IF;
    SELECT * INTO participant_row
    FROM public.live_room_participants participants
    WHERE participants.room_id = room_row.id
      AND participants.user_id = target_case.subject_user_id
    FOR UPDATE;
  ELSE
    resolved_participant_user_id := room_row.host_user_id;
  END IF;

  IF target_case.subject_user_id IS DISTINCT FROM resolved_participant_user_id THEN
    RAISE EXCEPTION 'The reported Shado Live subject does not match its evidence';
  END IF;

  SELECT roles.role INTO target_role
  FROM public.user_roles roles
  WHERE roles.user_id = target_case.subject_user_id
    AND roles.role IN ('admin', 'sub_admin')
  ORDER BY CASE roles.role WHEN 'admin' THEN 0 ELSE 1 END
  LIMIT 1;

  IF normalized_action <> 'no_action' THEN
    IF target_case.subject_user_id IS NULL THEN
      RAISE EXCEPTION 'This case no longer has an actionable member';
    END IF;
    IF target_case.subject_user_id = caller_id THEN
      RAISE EXCEPTION 'Operators cannot take action against themselves';
    END IF;
    IF target_role = 'admin' THEN
      RAISE EXCEPTION 'The full admin account cannot be sanctioned';
    END IF;
    IF target_role = 'sub_admin' AND NOT public.is_app_admin(caller_id) THEN
      RAISE EXCEPTION 'Only the full admin can sanction a sub-admin';
    END IF;
  END IF;

  IF normalized_action IN ('remove_live_participant', 'mute_live_participant') THEN
    IF participant_row.id IS NULL
      OR participant_row.user_id = room_row.host_user_id
      OR participant_row.status <> 'joined' THEN
      RAISE EXCEPTION 'A joined non-host participant is required';
    END IF;
  END IF;
  IF normalized_action = 'mute_live_participant' AND participant_row.role <> 'speaker' THEN
    RAISE EXCEPTION 'Only a joined speaker can be muted';
  END IF;
  IF normalized_action IN ('set_live_restriction', 'revoke_live_restriction') THEN
    SELECT coalesce(array_agg(DISTINCT scope ORDER BY scope), '{}'::text[])
    INTO clean_scopes
    FROM unnest(coalesce(p_requested_scopes, '{}'::text[])) scope
    WHERE scope IN ('host', 'join', 'chat');
    IF coalesce(pg_catalog.array_length(clean_scopes, 1), 0) NOT BETWEEN 1 AND 3
      OR coalesce(pg_catalog.array_length(clean_scopes, 1), 0)
        <> coalesce(pg_catalog.array_length(p_requested_scopes, 1), 0) THEN
      RAISE EXCEPTION 'Choose one or more valid Shado Live restriction scopes';
    END IF;
    IF normalized_public_reason IS NULL THEN
      RAISE EXCEPTION 'A public Shado Live restriction reason is required';
    END IF;
  ELSIF coalesce(pg_catalog.array_length(p_requested_scopes, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Restriction scopes are only valid for restriction actions';
  END IF;

  before_state := jsonb_build_object(
    'caseTargetType', target_case.target_type,
    'caseTargetId', target_case.target_id,
    'room', to_jsonb(room_row),
    'participant', CASE WHEN participant_row.id IS NULL THEN NULL ELSE to_jsonb(participant_row) END,
    'evidenceHash', pg_catalog.encode(extensions.digest(evidence_snapshot::text, 'sha256'), 'hex')
  );

  BEGIN
    IF normalized_action = 'end_live_room' THEN
      IF room_row.status IN ('ended', 'cancelled') THEN
        after_state := jsonb_build_object('changed', false, 'room', to_jsonb(room_row));
      ELSE
        UPDATE public.live_rooms rooms
        SET status = 'ending', revision = rooms.revision + 1,
            ending_at = coalesce(rooms.ending_at, now()),
            ended_reason = left(coalesce(normalized_public_reason, 'safety_operator_ended'), 500),
            host_disconnected_at = NULL, host_grace_expires_at = NULL,
            updated_at = now()
        WHERE rooms.id = room_row.id
        RETURNING * INTO room_row;
        provider_operation := private.enqueue_shado_live_provider_operation(
          room_row.id, caller_id, NULL, 'delete_room', gen_random_uuid(),
          room_row.revision,
          jsonb_build_object('roomName', room_row.provider_room_name, 'reason', room_row.ended_reason)
        );
        INSERT INTO public.live_room_events (
          room_id, actor_user_id, event_type, room_revision, idempotency_key, metadata
        ) VALUES (
          room_row.id, caller_id, 'room_ending', room_row.revision,
          provider_operation.idempotency_key,
          jsonb_build_object('source', 'safety_case', 'caseId', p_case_id,
            'providerOperationId', provider_operation.id)
        );
        after_state := jsonb_build_object(
          'changed', true, 'room', to_jsonb(room_row),
          'providerOperationId', provider_operation.id
        );
      END IF;
    ELSIF normalized_action = 'remove_live_participant' THEN
      UPDATE public.live_room_participants participants
      SET status = 'removed', revision = participants.revision + 1,
          token_version = participants.token_version + 1,
          provider_identity = participants.user_id::text,
          removed_at = now(), left_at = NULL,
          removal_reason = left(coalesce(normalized_public_reason, 'safety_operator_removed'), 500),
          updated_at = now()
      WHERE participants.id = participant_row.id
      RETURNING * INTO participant_row;
      UPDATE public.live_room_stage_requests requests
      SET status = 'declined', revision = requests.revision + 1,
          resolved_at = now(), updated_at = now()
      WHERE requests.room_id = room_row.id
        AND requests.user_id = participant_row.user_id
        AND requests.status = 'raised';
      UPDATE public.live_room_invites invites
      SET status = 'revoked', revision = invites.revision + 1,
          resolved_at = now(), updated_at = now()
      WHERE invites.room_id = room_row.id
        AND invites.invited_user_id = participant_row.user_id
        AND invites.status = 'pending';
      UPDATE public.live_rooms rooms
      SET revision = rooms.revision + 1, updated_at = now()
      WHERE rooms.id = room_row.id
      RETURNING * INTO room_row;
      provider_operation := private.enqueue_shado_live_provider_operation(
        room_row.id, caller_id, participant_row.user_id,
        'remove_participant', gen_random_uuid(), room_row.revision,
        jsonb_build_object(
          'participantIdentity', participant_row.provider_identity,
          'reason', participant_row.removal_reason,
          'caseId', p_case_id
        )
      );
      INSERT INTO public.live_room_events (
        room_id, actor_user_id, target_user_id, event_type,
        room_revision, idempotency_key, metadata
      ) VALUES (
        room_row.id, caller_id, participant_row.user_id, 'participant_removed',
        room_row.revision, provider_operation.idempotency_key,
        jsonb_build_object('source', 'safety_case', 'caseId', p_case_id,
          'participantId', participant_row.id,
          'providerOperationId', provider_operation.id)
      );
      after_state := jsonb_build_object(
        'room', to_jsonb(room_row), 'participant', to_jsonb(participant_row),
        'providerOperationId', provider_operation.id
      );
    ELSIF normalized_action = 'mute_live_participant' THEN
      UPDATE public.live_room_participants participants
      SET host_muted = true, revision = participants.revision + 1, updated_at = now()
      WHERE participants.id = participant_row.id
      RETURNING * INTO participant_row;
      UPDATE public.live_rooms rooms
      SET revision = rooms.revision + 1, updated_at = now()
      WHERE rooms.id = room_row.id
      RETURNING * INTO room_row;
      provider_operation := private.enqueue_shado_live_provider_operation(
        room_row.id, caller_id, participant_row.user_id,
        'mute_track', gen_random_uuid(), room_row.revision,
        jsonb_build_object(
          'participantIdentity', participant_row.provider_identity,
          'role', participant_row.role,
          'tokenVersion', participant_row.token_version,
          'canPublish', false,
          'publishSources', jsonb_build_array('microphone'),
          'muted', true,
          'reason', coalesce(normalized_public_reason, 'safety_operator_muted'),
          'caseId', p_case_id
        )
      );
      INSERT INTO public.live_room_events (
        room_id, actor_user_id, target_user_id, event_type,
        room_revision, idempotency_key, metadata
      ) VALUES (
        room_row.id, caller_id, participant_row.user_id, 'participant_muted',
        room_row.revision, provider_operation.idempotency_key,
        jsonb_build_object('source', 'safety_case', 'caseId', p_case_id,
          'participantId', participant_row.id,
          'providerOperationId', provider_operation.id)
      );
      after_state := jsonb_build_object(
        'room', to_jsonb(room_row), 'participant', to_jsonb(participant_row),
        'providerOperationId', provider_operation.id
      );
    ELSIF normalized_action IN ('set_live_restriction', 'revoke_live_restriction') THEN
      FOREACH current_scope IN ARRAY clean_scopes LOOP
        restriction_result := shado_live_private.shado_live_set_restriction_impl(
          caller_id,
          target_case.subject_user_id,
          current_scope,
          normalized_action = 'set_live_restriction',
          CASE
            WHEN normalized_action = 'set_live_restriction' AND p_duration_minutes IS NOT NULL
              THEN now() + pg_catalog.make_interval(mins => p_duration_minutes)
            ELSE NULL
          END,
          normalized_public_reason
        );
        restriction_results := restriction_results || jsonb_build_array(restriction_result);
      END LOOP;
      after_state := jsonb_build_object('restrictions', restriction_results);
    ELSE
      after_state := jsonb_build_object('action', 'no_action');
    END IF;

    INSERT INTO public.moderation_case_actions (
      id, case_id, actor_user_id, action_type, status,
      public_reason, internal_note, requested_scopes, duration_minutes,
      before_state, after_state
    ) VALUES (
      resolved_action_id, p_case_id, caller_id, normalized_action, 'applied',
      normalized_public_reason, normalized_note, clean_scopes, p_duration_minutes,
      before_state, after_state
    );

    previous_case_status := target_case.status;
    UPDATE public.moderation_cases cases
    SET status = 'actioned', outcome_code = CASE normalized_action
          WHEN 'no_action' THEN 'no_violation'
          ELSE 'other'
        END,
        version = cases.version + 1,
        updated_at = now()
    WHERE cases.id = p_case_id
    RETURNING * INTO target_case;

    INSERT INTO public.moderation_case_events (
      case_id, actor_user_id, event_type, from_status, to_status,
      internal_note, metadata
    ) VALUES (
      p_case_id, caller_id, 'action_applied', previous_case_status, 'actioned',
      normalized_note,
      jsonb_build_object('actionId', resolved_action_id, 'actionType', normalized_action)
    );

    RETURN jsonb_build_object(
      'ok', true, 'actionId', resolved_action_id, 'case', to_jsonb(target_case)
    );
  EXCEPTION WHEN OTHERS THEN
    action_error := left(sqlerrm, 1000);

    INSERT INTO public.moderation_case_actions (
      id, case_id, actor_user_id, action_type, status,
      public_reason, internal_note, requested_scopes, duration_minutes,
      before_state, error_message
    ) VALUES (
      resolved_action_id, p_case_id, caller_id, normalized_action, 'failed',
      normalized_public_reason, normalized_note, clean_scopes, p_duration_minutes,
      before_state, action_error
    );

    UPDATE public.moderation_cases cases
    SET version = cases.version + 1, updated_at = now()
    WHERE cases.id = p_case_id
    RETURNING * INTO target_case;

    INSERT INTO public.moderation_case_events (
      case_id, actor_user_id, event_type, internal_note, metadata
    ) VALUES (
      p_case_id, caller_id, 'action_failed', normalized_note,
      jsonb_build_object(
        'actionId', resolved_action_id, 'actionType', normalized_action, 'error', action_error
      )
    );

    RETURN jsonb_build_object(
      'ok', false, 'actionId', resolved_action_id,
      'error', action_error, 'case', to_jsonb(target_case)
    );
  END;
END;
$$;

CREATE FUNCTION public.apply_shado_live_case_action(
  p_case_id uuid,
  p_expected_version integer,
  p_action_type text,
  p_requested_scopes text[] DEFAULT '{}'::text[],
  p_duration_minutes integer DEFAULT NULL,
  p_public_reason text DEFAULT NULL,
  p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.apply_shado_live_case_action_impl(
    p_case_id, p_expected_version, p_action_type, p_requested_scopes,
    p_duration_minutes, p_public_reason, p_internal_note
  );
$$;

REVOKE ALL ON FUNCTION shado_live_private.list_shado_live_moderation_cases_impl(
  text, text, text, text, text, text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION shado_live_private.get_shado_live_moderation_case_impl(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION shado_live_private.apply_shado_live_case_action_impl(
  uuid, integer, text, text[], integer, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.list_shado_live_moderation_cases_impl(
  text, text, text, text, text, text, integer, timestamptz, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.get_shado_live_moderation_case_impl(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.apply_shado_live_case_action_impl(
  uuid, integer, text, text[], integer, text, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_shado_live_moderation_cases(
  text, text, text, text, text, text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_shado_live_moderation_case(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_shado_live_case_action(
  uuid, integer, text, text[], integer, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_shado_live_moderation_cases(
  text, text, text, text, text, text, integer, timestamptz, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_shado_live_moderation_case(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_shado_live_case_action(
  uuid, integer, text, text[], integer, text, text
) TO authenticated, service_role;

-- Preserve the existing older-client contracts after replacing their bodies.
REVOKE ALL ON FUNCTION public.list_my_member_reports(integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_member_reports(integer, timestamptz, uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_moderation_cases(
  text, text, text, text, text, text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_moderation_cases(
  text, text, text, text, text, text, integer, timestamptz, uuid
) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables publication_tables
    WHERE publication_tables.pubname = 'supabase_realtime'
      AND publication_tables.schemaname = 'public'
      AND publication_tables.tablename = 'shado_live_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shado_live_notifications;
  END IF;
END;
$$;

COMMENT ON TABLE public.shado_live_notifications IS
  'Recipient-owned Shado Live in-app beta notifications. This ledger is intentionally separate from activity_events and notification_events so it cannot create Activity HQ unread state or invoke the legacy push pipeline.';
COMMENT ON FUNCTION public.list_my_shado_live_notifications(integer, timestamptz, uuid) IS
  'Lists private Shado Live in-app notifications. Push delivery is intentionally not wired in this beta migration and remains a separately reviewed integration gap.';
COMMENT ON FUNCTION public.submit_shado_live_report(text, uuid, text, uuid, text) IS
  'Submits a Shado Live safety report using server-resolved room, participant, or message evidence; clients never write moderation evidence directly.';
COMMENT ON FUNCTION public.apply_shado_live_case_action(uuid, integer, text, text[], integer, text, text) IS
  'Applies an operator-only Shado Live safety action from immutable case evidence and records retryable provider outbox work with room-revision guards.';

COMMIT;
