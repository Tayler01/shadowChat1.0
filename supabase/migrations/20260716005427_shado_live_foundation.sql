/*
  # Shado Live audio-first foundation

  Adds a disabled-by-default, Connections-only control plane for one host,
  three additional speakers, listeners, persistent room chat, signed provider
  webhook receipts, and a retryable provider-operation outbox. Browser roles
  receive no direct table authority; authenticated and service callers use
  narrow SECURITY INVOKER wrappers backed by reviewed private implementations.
*/

BEGIN;

CREATE SCHEMA shado_live_private;
REVOKE ALL ON SCHEMA shado_live_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA shado_live_private TO authenticated, service_role;

CREATE TABLE public.shado_live_system_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  access_mode text NOT NULL DEFAULT 'disabled'
    CHECK (access_mode IN ('disabled', 'allowlist', 'enabled')),
  reason text NOT NULL DEFAULT 'Shado Live is not released.'
    CHECK (char_length(reason) BETWEEN 1 AND 500),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shado_live_system_state_mode_check
    CHECK (enabled = (access_mode <> 'disabled'))
);

INSERT INTO public.shado_live_system_state (singleton, enabled, access_mode, reason)
VALUES (true, false, 'disabled', 'Shado Live is not released.')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE public.shado_live_access_members (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 500),
  expires_at timestamptz,
  revoked_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shado_live_access_members_expiry_check
    CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX shado_live_access_members_active_idx
  ON public.shado_live_access_members (expires_at, user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX shado_live_access_members_added_by_idx
  ON public.shado_live_access_members (added_by, updated_at DESC, user_id);

CREATE TABLE public.shado_live_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('host', 'join', 'chat')),
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 500),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  CONSTRAINT shado_live_restrictions_expiry_check
    CHECK (expires_at IS NULL OR expires_at > created_at),
  CONSTRAINT shado_live_restrictions_revocation_check
    CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR revoked_at IS NOT NULL)
);

CREATE UNIQUE INDEX shado_live_restrictions_one_active_scope_idx
  ON public.shado_live_restrictions (target_user_id, scope)
  WHERE revoked_at IS NULL;
CREATE INDEX shado_live_restrictions_active_lookup_idx
  ON public.shado_live_restrictions (target_user_id, scope, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX shado_live_restrictions_created_by_idx
  ON public.shado_live_restrictions (created_by, created_at DESC, id);
CREATE INDEX shado_live_restrictions_revoked_by_idx
  ON public.shado_live_restrictions (revoked_by, revoked_at DESC, id)
  WHERE revoked_by IS NOT NULL;

CREATE TABLE public.live_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  title text NOT NULL DEFAULT 'Shado Live room'
    CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  audience text NOT NULL DEFAULT 'connections' CHECK (audience = 'connections'),
  status text NOT NULL DEFAULT 'green_room'
    CHECK (status IN ('scheduled', 'green_room', 'live', 'ending', 'ended', 'cancelled')),
  provider_room_name text NOT NULL UNIQUE
    CHECK (provider_room_name ~ '^shado-live-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  listener_limit integer NOT NULL DEFAULT 100 CHECK (listener_limit BETWEEN 1 AND 500),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  scheduled_at timestamptz,
  started_at timestamptz,
  ending_at timestamptz,
  ended_at timestamptz,
  host_disconnected_at timestamptz,
  host_grace_expires_at timestamptz,
  ended_reason text CHECK (ended_reason IS NULL OR char_length(ended_reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_rooms_timeline_check CHECK (
    (status IN ('scheduled', 'green_room') AND ending_at IS NULL AND ended_at IS NULL)
    OR (status = 'live' AND started_at IS NOT NULL AND ending_at IS NULL AND ended_at IS NULL)
    OR (status = 'ending' AND ending_at IS NOT NULL AND ended_at IS NULL)
    OR (status IN ('ended', 'cancelled') AND ended_at IS NOT NULL)
  ),
  CONSTRAINT live_rooms_host_grace_check CHECK (
    (host_disconnected_at IS NULL AND host_grace_expires_at IS NULL)
    OR (
      host_disconnected_at IS NOT NULL
      AND host_grace_expires_at IS NOT NULL
      AND host_grace_expires_at >= host_disconnected_at
    )
  )
);

CREATE UNIQUE INDEX live_rooms_one_active_host_idx
  ON public.live_rooms (host_user_id)
  WHERE status IN ('scheduled', 'green_room', 'live', 'ending');
CREATE INDEX live_rooms_host_idx ON public.live_rooms (host_user_id, created_at DESC, id);
CREATE INDEX live_rooms_discovery_idx
  ON public.live_rooms (status, started_at DESC, created_at DESC, id DESC)
  WHERE status IN ('scheduled', 'live');
CREATE INDEX live_rooms_host_grace_idx
  ON public.live_rooms (host_grace_expires_at, id)
  WHERE status = 'live' AND host_grace_expires_at IS NOT NULL;

CREATE TABLE public.live_room_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('host', 'speaker', 'listener')),
  status text NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'left', 'removed')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  token_version integer NOT NULL DEFAULT 1 CHECK (token_version > 0),
  provider_identity text NOT NULL CHECK (provider_identity = user_id::text),
  host_muted boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  removed_at timestamptz,
  removal_reason text CHECK (removal_reason IS NULL OR char_length(removal_reason) <= 500),
  provider_joined_at timestamptz,
  provider_left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_room_participants_room_user_key UNIQUE (room_id, user_id),
  CONSTRAINT live_room_participants_lifecycle_check CHECK (
    (status = 'joined' AND left_at IS NULL AND removed_at IS NULL)
    OR (status = 'left' AND left_at IS NOT NULL AND removed_at IS NULL)
    OR (status = 'removed' AND removed_at IS NOT NULL)
  )
);

CREATE INDEX live_room_participants_stage_idx
  ON public.live_room_participants (room_id, role, joined_at, id)
  WHERE status = 'joined' AND role IN ('host', 'speaker');
CREATE INDEX live_room_participants_listener_idx
  ON public.live_room_participants (room_id, joined_at, id)
  WHERE status = 'joined' AND role = 'listener';
CREATE INDEX live_room_participants_user_idx
  ON public.live_room_participants (user_id, updated_at DESC, id);
CREATE UNIQUE INDEX live_room_participants_room_provider_identity_uidx
  ON public.live_room_participants (room_id, provider_identity);

CREATE TABLE public.live_room_stage_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'raised'
    CHECK (status IN ('raised', 'approved', 'declined', 'cancelled', 'expired')),
  client_request_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT live_room_stage_requests_client_key UNIQUE (room_id, user_id, client_request_id),
  CONSTRAINT live_room_stage_requests_lifecycle_check CHECK (
    (status = 'raised' AND resolved_at IS NULL)
    OR (status <> 'raised' AND resolved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX live_room_stage_requests_one_raised_idx
  ON public.live_room_stage_requests (room_id, user_id)
  WHERE status = 'raised';
CREATE INDEX live_room_stage_requests_queue_idx
  ON public.live_room_stage_requests (room_id, created_at, id)
  WHERE status = 'raised';
CREATE INDEX live_room_stage_requests_user_idx
  ON public.live_room_stage_requests (user_id, updated_at DESC, id);

CREATE TABLE public.live_room_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'speaker' CHECK (role = 'speaker'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  client_invite_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT live_room_invites_client_key UNIQUE (room_id, invited_by, client_invite_id),
  CONSTRAINT live_room_invites_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT live_room_invites_lifecycle_check CHECK (
    (status = 'pending' AND resolved_at IS NULL)
    OR (status <> 'pending' AND resolved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX live_room_invites_one_pending_idx
  ON public.live_room_invites (room_id, invited_user_id)
  WHERE status = 'pending';
CREATE INDEX live_room_invites_recipient_idx
  ON public.live_room_invites (invited_user_id, created_at DESC, id DESC)
  WHERE status = 'pending';
CREATE INDEX live_room_invites_inviter_idx
  ON public.live_room_invites (invited_by, created_at DESC, id);

CREATE TABLE public.live_room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1000),
  client_message_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_room_messages_client_key UNIQUE (room_id, sender_user_id, client_message_id),
  CONSTRAINT live_room_messages_delete_check
    CHECK ((deleted_at IS NULL AND deleted_by IS NULL) OR deleted_at IS NOT NULL)
);

CREATE INDEX live_room_messages_page_idx
  ON public.live_room_messages (room_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX live_room_messages_sender_idx
  ON public.live_room_messages (sender_user_id, created_at DESC, id);
CREATE INDEX live_room_messages_deleted_by_idx
  ON public.live_room_messages (deleted_by, deleted_at DESC, id)
  WHERE deleted_by IS NOT NULL;

CREATE TABLE public.live_room_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES public.live_rooms(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'room_created', 'room_started', 'room_ending', 'room_ended',
    'session_joined', 'session_resumed', 'session_left',
    'hand_raised', 'hand_lowered', 'speaker_promoted', 'speaker_demoted',
    'participant_muted', 'participant_removed', 'message_sent',
    'restriction_changed', 'system_changed', 'block_teardown',
    'provider_operation_prepared', 'provider_operation_completed',
    'provider_webhook_received', 'provider_policy_violation'
  )),
  room_revision integer CHECK (room_revision IS NULL OR room_revision > 0),
  idempotency_key uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX live_room_events_actor_idempotency_idx
  ON public.live_room_events (actor_user_id, event_type, idempotency_key)
  WHERE actor_user_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE INDEX live_room_events_room_recent_idx
  ON public.live_room_events (room_id, created_at DESC, id DESC);
CREATE INDEX live_room_events_actor_recent_idx
  ON public.live_room_events (actor_user_id, created_at DESC, id DESC)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX live_room_events_target_recent_idx
  ON public.live_room_events (target_user_id, created_at DESC, id DESC)
  WHERE target_user_id IS NOT NULL;

CREATE TABLE public.live_provider_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  operation_type text NOT NULL CHECK (operation_type IN (
    'create_room', 'update_permissions', 'mute_track',
    'remove_participant', 'delete_room'
  )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  idempotency_key uuid NOT NULL,
  expected_room_revision integer NOT NULL CHECK (expected_room_revision > 0),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(request_payload) = 'object' AND pg_column_size(request_payload) <= 16384),
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(provider_payload) = 'object' AND pg_column_size(provider_payload) <= 16384),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 120),
  last_error_message text CHECK (last_error_message IS NULL OR char_length(last_error_message) <= 1000),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_provider_operations_actor_key UNIQUE (actor_user_id, idempotency_key)
);

CREATE INDEX live_provider_operations_pending_idx
  ON public.live_provider_operations (status, available_at, created_at, id)
  WHERE status IN ('pending', 'processing');
CREATE INDEX live_provider_operations_room_idx
  ON public.live_provider_operations (room_id, created_at DESC, id);
CREATE INDEX live_provider_operations_target_idx
  ON public.live_provider_operations (target_user_id, created_at DESC, id)
  WHERE target_user_id IS NOT NULL;

CREATE TABLE public.live_provider_webhook_receipts (
  event_id text PRIMARY KEY CHECK (char_length(event_id) BETWEEN 1 AND 240),
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  room_id uuid REFERENCES public.live_rooms(id) ON DELETE SET NULL,
  room_name text CHECK (room_name IS NULL OR char_length(room_name) BETWEEN 1 AND 180),
  participant_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  participant_identity text CHECK (
    participant_identity IS NULL OR char_length(participant_identity) BETWEEN 1 AND 180
  ),
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 32768
  ),
  verified_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX live_provider_webhook_room_idx
  ON public.live_provider_webhook_receipts (room_id, occurred_at DESC, event_id);

CREATE TABLE public.live_room_signals (
  room_id uuid PRIMARY KEY REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  sequence bigint NOT NULL DEFAULT 1 CHECK (sequence > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shado_live_system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shado_live_access_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shado_live_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_room_stage_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_room_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_room_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_provider_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_provider_webhook_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_room_signals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.shado_live_system_state,
  public.shado_live_access_members,
  public.shado_live_restrictions,
  public.live_rooms,
  public.live_room_participants,
  public.live_room_stage_requests,
  public.live_room_invites,
  public.live_room_messages,
  public.live_room_events,
  public.live_provider_operations,
  public.live_provider_webhook_receipts,
  public.live_room_signals
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.shado_live_system_state IS
  'Singleton fail-closed release and emergency state. Modes are disabled, allowlist, and enabled.';
COMMENT ON TABLE public.shado_live_access_members IS
  'Operator-managed private beta eligibility; browser roles receive no direct table authority.';
COMMENT ON TABLE public.live_room_events IS
  'Append-only Shado Live authorization and moderation audit. Provider payloads live in the separate verified receipt ledger.';
COMMENT ON TABLE public.live_provider_operations IS
  'Retryable provider-operation outbox; database authority changes are recorded before provider work.';
COMMENT ON TABLE public.live_provider_webhook_receipts IS
  'Append-only ledger populated only after an Edge Function verifies the provider signature.';

CREATE FUNCTION private.shado_live_is_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT state.enabled
    FROM public.shado_live_system_state state
    WHERE state.singleton
  ), false);
$$;

CREATE FUNCTION private.shado_live_is_enabled_for(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(target_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.shado_live_system_state state
    WHERE state.singleton
      AND (
        state.access_mode = 'enabled'
        OR (
          state.access_mode = 'allowlist'
          AND EXISTS (
            SELECT 1
            FROM public.shado_live_access_members members
            WHERE members.user_id = target_user_id
              AND members.revoked_at IS NULL
              AND (members.expires_at IS NULL OR members.expires_at > now())
          )
        )
      )
  ), false);
$$;

CREATE FUNCTION private.user_has_shado_live_restriction(
  target_user_id uuid,
  target_scope text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN target_user_id IS NULL OR target_scope NOT IN ('host', 'join', 'chat') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.shado_live_restrictions restrictions
      WHERE restrictions.target_user_id = user_has_shado_live_restriction.target_user_id
        AND restrictions.scope = user_has_shado_live_restriction.target_scope
        AND restrictions.revoked_at IS NULL
        AND (restrictions.expires_at IS NULL OR restrictions.expires_at > now())
    )
  END;
$$;

CREATE FUNCTION shado_live_private.can_access_shado_live_room(
  target_user_id uuid,
  target_room_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN target_user_id IS NULL
      OR target_room_id IS NULL
      OR NOT private.shado_live_is_enabled_for(target_user_id)
      OR private.user_has_shado_live_restriction(target_user_id, 'join')
      THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.live_rooms rooms
      WHERE rooms.id = target_room_id
        AND rooms.status IN ('scheduled', 'green_room', 'live')
        AND (
          rooms.host_user_id = target_user_id
          OR (
            private.users_are_connected(rooms.host_user_id, target_user_id)
            AND (
              rooms.status IN ('scheduled', 'live')
              OR EXISTS (
                SELECT 1
                FROM public.live_room_participants participants
                WHERE participants.room_id = rooms.id
                  AND participants.user_id = target_user_id
                  AND participants.role = 'speaker'
                  AND participants.status <> 'removed'
              )
              OR EXISTS (
                SELECT 1
                FROM public.live_room_invites invites
                WHERE invites.room_id = rooms.id
                  AND invites.invited_user_id = target_user_id
                  AND invites.status IN ('pending', 'accepted')
                  AND invites.expires_at > now()
              )
            )
          )
        )
        AND NOT private.users_have_block(rooms.host_user_id, target_user_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.live_room_participants removed
          WHERE removed.room_id = rooms.id
            AND removed.user_id = target_user_id
            AND removed.status = 'removed'
        )
    )
  END;
$$;

CREATE FUNCTION shado_live_private.can_receive_shado_live_signal(
  target_user_id uuid,
  target_room_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(target_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.live_rooms rooms
    WHERE rooms.id = target_room_id
      AND NOT private.users_have_block(rooms.host_user_id, target_user_id)
      AND (
        rooms.host_user_id = target_user_id
        OR EXISTS (
          SELECT 1
          FROM public.live_room_participants participants
          WHERE participants.room_id = rooms.id
            AND participants.user_id = target_user_id
            AND participants.status <> 'removed'
        )
      )
  ), false);
$$;

CREATE FUNCTION private.enqueue_shado_live_provider_operation(
  target_room_id uuid,
  actor_user_id uuid,
  target_user_id uuid,
  target_operation text,
  target_idempotency_key uuid,
  expected_room_revision integer,
  request_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.live_provider_operations
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  operation_row public.live_provider_operations%ROWTYPE;
BEGIN
  IF target_operation NOT IN (
    'create_room', 'update_permissions', 'mute_track',
    'remove_participant', 'delete_room'
  ) THEN
    RAISE EXCEPTION 'Unsupported provider operation';
  END IF;
  IF target_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Provider operation idempotency key is required';
  END IF;
  IF jsonb_typeof(coalesce(request_payload, '{}'::jsonb)) <> 'object'
    OR pg_column_size(coalesce(request_payload, '{}'::jsonb)) > 16384 THEN
    RAISE EXCEPTION 'Provider operation payload is invalid';
  END IF;

  INSERT INTO public.live_provider_operations (
    room_id,
    actor_user_id,
    target_user_id,
    operation_type,
    idempotency_key,
    expected_room_revision,
    request_payload
  ) VALUES (
    target_room_id,
    actor_user_id,
    target_user_id,
    target_operation,
    target_idempotency_key,
    expected_room_revision,
    coalesce(request_payload, '{}'::jsonb)
  )
  ON CONFLICT ON CONSTRAINT live_provider_operations_actor_key DO UPDATE
  SET updated_at = public.live_provider_operations.updated_at
  RETURNING * INTO operation_row;

  RETURN operation_row;
END;
$$;

CREATE FUNCTION shado_live_private.list_my_shado_live_rooms_impl(
  result_limit integer DEFAULT 30
)
RETURNS TABLE (
  room_id uuid,
  title text,
  status text,
  host jsonb,
  listener_count integer,
  speaker_count integer,
  caller_role text,
  revision integer,
  scheduled_at timestamptz,
  started_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  bounded_limit integer := greatest(1, least(coalesce(result_limit, 30), 50));
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT private.shado_live_is_enabled_for(caller_id)
    OR private.user_has_shado_live_restriction(caller_id, 'join') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    rooms.id,
    rooms.title,
    rooms.status,
    public.user_public_profile_json(host_profile),
    count(participants.id) FILTER (
      WHERE participants.status = 'joined' AND participants.role = 'listener'
    )::integer,
    count(participants.id) FILTER (
      WHERE participants.status = 'joined' AND participants.role = 'speaker'
    )::integer,
    max(caller_participant.role) FILTER (WHERE caller_participant.status <> 'removed'),
    rooms.revision,
    rooms.scheduled_at,
    rooms.started_at
  FROM public.live_rooms rooms
  JOIN public.users host_profile ON host_profile.id = rooms.host_user_id
  LEFT JOIN public.live_room_participants participants ON participants.room_id = rooms.id
  LEFT JOIN public.live_room_participants caller_participant
    ON caller_participant.room_id = rooms.id
   AND caller_participant.user_id = caller_id
  WHERE (
      rooms.status IN ('scheduled', 'live')
      OR (rooms.status = 'green_room' AND rooms.host_user_id = caller_id)
    )
    AND (
      rooms.host_user_id = caller_id
      OR private.users_are_connected(rooms.host_user_id, caller_id)
    )
    AND NOT private.users_have_block(rooms.host_user_id, caller_id)
    AND coalesce(caller_participant.status, 'left') <> 'removed'
  GROUP BY rooms.id, host_profile.id
  ORDER BY coalesce(rooms.started_at, rooms.scheduled_at, rooms.created_at) DESC, rooms.id DESC
  LIMIT bounded_limit;
END;
$$;

CREATE FUNCTION shado_live_private.get_shado_live_room_for_actor_impl(
  caller_id uuid,
  target_room_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  room_row public.live_rooms%ROWTYPE;
  host_profile jsonb;
  speakers jsonb;
  participants_json jsonb;
  stage_requests_json jsonb;
  recent_messages jsonb;
  caller_participant public.live_room_participants%ROWTYPE;
  raised_request_id uuid;
  listener_count integer;
  caller_can_moderate boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT shado_live_private.can_access_shado_live_room(caller_id, target_room_id) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO room_row FROM public.live_rooms rooms WHERE rooms.id = target_room_id;
  SELECT public.user_public_profile_json(profiles)
  INTO host_profile
  FROM public.users profiles
  WHERE profiles.id = room_row.host_user_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'participantId', participants.id,
    'role', participants.role,
    'hostMuted', participants.host_muted,
    'revision', participants.revision,
    'user', public.user_public_profile_json(profiles)
  ) ORDER BY CASE participants.role WHEN 'host' THEN 0 ELSE 1 END, participants.joined_at), '[]'::jsonb)
  INTO speakers
  FROM public.live_room_participants participants
  JOIN public.users profiles ON profiles.id = participants.user_id
  WHERE participants.room_id = room_row.id
    AND participants.status = 'joined'
    AND participants.role IN ('host', 'speaker')
    AND NOT private.users_have_block(caller_id, participants.user_id);

  SELECT * INTO caller_participant
  FROM public.live_room_participants participants
  WHERE participants.room_id = room_row.id AND participants.user_id = caller_id;

  SELECT requests.id INTO raised_request_id
  FROM public.live_room_stage_requests requests
  WHERE requests.room_id = room_row.id
    AND requests.user_id = caller_id
    AND requests.status = 'raised';

  SELECT count(*)::integer INTO listener_count
  FROM public.live_room_participants participants
  WHERE participants.room_id = room_row.id
    AND participants.status = 'joined'
    AND participants.role = 'listener';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'participantId', participants.id,
    'role', participants.role,
    'status', participants.status,
    'hostMuted', participants.host_muted,
    'handRaised', EXISTS (
      SELECT 1
      FROM public.live_room_stage_requests active_request
      WHERE active_request.room_id = participants.room_id
        AND active_request.user_id = participants.user_id
        AND active_request.status = 'raised'
    ),
    'revision', participants.revision,
    'user', public.user_public_profile_json(profiles)
  ) ORDER BY CASE participants.role WHEN 'host' THEN 0 WHEN 'speaker' THEN 1 ELSE 2 END,
    participants.joined_at, participants.id), '[]'::jsonb)
  INTO participants_json
  FROM public.live_room_participants participants
  JOIN public.users profiles ON profiles.id = participants.user_id
  WHERE participants.room_id = room_row.id
    AND participants.status = 'joined'
    AND NOT private.users_have_block(caller_id, participants.user_id);

  caller_can_moderate := room_row.host_user_id = caller_id
    OR public.is_app_operator(caller_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'requestId', requests.id,
    'status', requests.status,
    'revision', requests.revision,
    'requestedAt', requests.created_at,
    'user', public.user_public_profile_json(profiles)
  ) ORDER BY requests.created_at, requests.id), '[]'::jsonb)
  INTO stage_requests_json
  FROM public.live_room_stage_requests requests
  JOIN public.users profiles ON profiles.id = requests.user_id
  WHERE requests.room_id = room_row.id
    AND requests.status = 'raised'
    AND (caller_can_moderate OR requests.user_id = caller_id)
    AND NOT private.users_have_block(caller_id, requests.user_id);

  SELECT coalesce(jsonb_agg(message_page.message_json ORDER BY message_page.created_at, message_page.message_id), '[]'::jsonb)
  INTO recent_messages
  FROM (
    SELECT
      messages.id AS message_id,
      messages.created_at,
      jsonb_build_object(
        'messageId', messages.id,
        'sender', public.user_public_profile_json(profiles),
        'body', messages.body,
        'revision', messages.revision,
        'createdAt', messages.created_at
      ) AS message_json
    FROM public.live_room_messages messages
    JOIN public.users profiles ON profiles.id = messages.sender_user_id
    WHERE messages.room_id = room_row.id
      AND messages.deleted_at IS NULL
      AND NOT private.users_have_block(caller_id, messages.sender_user_id)
    ORDER BY messages.created_at DESC, messages.id DESC
    LIMIT 50
  ) message_page;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'roomId', room_row.id,
    'title', room_row.title,
    'status', room_row.status,
    'audience', room_row.audience,
    'host', host_profile,
    'speakers', speakers,
    'participants', participants_json,
    'stageRequests', stage_requests_json,
    'messages', recent_messages,
    'listenerCount', listener_count,
    'listenerLimit', room_row.listener_limit,
    'callerRole', caller_participant.role,
    'callerStatus', caller_participant.status,
    'callerParticipantRevision', caller_participant.revision,
    'handRaised', raised_request_id IS NOT NULL,
    'revision', room_row.revision,
    'scheduledAt', room_row.scheduled_at,
    'startedAt', room_row.started_at,
    'hostGraceExpiresAt', room_row.host_grace_expires_at
  ));
END;
$$;

CREATE FUNCTION shado_live_private.get_my_shado_live_room_impl(target_room_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT shado_live_private.get_shado_live_room_for_actor_impl(auth.uid(), target_room_id);
$$;

CREATE FUNCTION shado_live_private.list_my_shado_live_messages_impl(
  target_room_id uuid,
  result_limit integer DEFAULT 50,
  before_created_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  message_id uuid,
  sender jsonb,
  body text,
  revision integer,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  bounded_limit integer := greatest(1, least(coalesce(result_limit, 50), 100));
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF (before_created_at IS NULL) <> (before_id IS NULL) THEN
    RAISE EXCEPTION 'Message cursor must include created_at and id';
  END IF;
  IF NOT shado_live_private.can_access_shado_live_room(caller_id, target_room_id) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    messages.id,
    public.user_public_profile_json(profiles),
    messages.body,
    messages.revision,
    messages.created_at
  FROM public.live_room_messages messages
  JOIN public.users profiles ON profiles.id = messages.sender_user_id
  WHERE messages.room_id = target_room_id
    AND messages.deleted_at IS NULL
    AND NOT private.users_have_block(caller_id, messages.sender_user_id)
    AND (
      before_created_at IS NULL
      OR (messages.created_at, messages.id) < (before_created_at, before_id)
    )
  ORDER BY messages.created_at DESC, messages.id DESC
  LIMIT bounded_limit;
END;
$$;

CREATE FUNCTION shado_live_private.send_my_shado_live_message_impl(
  target_room_id uuid,
  message_body text,
  client_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_body text := trim(coalesce(message_body, ''));
  message_row public.live_room_messages%ROWTYPE;
  room_revision integer;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF client_message_id IS NULL THEN RAISE EXCEPTION 'Client message id is required'; END IF;
  IF char_length(normalized_body) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Message must be between 1 and 1000 characters';
  END IF;
  IF private.user_has_shado_live_restriction(caller_id, 'chat') THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Live chat is unavailable';
  END IF;
  IF NOT shado_live_private.can_access_shado_live_room(caller_id, target_room_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Room is unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.live_room_participants participants
    WHERE participants.room_id = target_room_id
      AND participants.user_id = caller_id
      AND participants.status = 'joined'
  ) THEN
    RAISE EXCEPTION 'Join the room before sending chat';
  END IF;
  SELECT rooms.revision INTO room_revision
  FROM public.live_rooms rooms
  WHERE rooms.id = target_room_id AND rooms.status = 'live';
  IF NOT FOUND THEN RAISE EXCEPTION 'Live chat is closed'; END IF;

  INSERT INTO public.live_room_messages (room_id, sender_user_id, body, client_message_id)
  VALUES (target_room_id, caller_id, normalized_body, client_message_id)
  ON CONFLICT ON CONSTRAINT live_room_messages_client_key DO UPDATE
  SET updated_at = public.live_room_messages.updated_at
  RETURNING * INTO message_row;

  INSERT INTO public.live_room_events (
    room_id, actor_user_id, event_type, room_revision, idempotency_key,
    metadata
  ) VALUES (
    target_room_id, caller_id, 'message_sent', room_revision, client_message_id,
    jsonb_build_object('messageId', message_row.id)
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'messageId', message_row.id,
    'roomId', message_row.room_id,
    'body', message_row.body,
    'revision', message_row.revision,
    'createdAt', message_row.created_at
  );
END;
$$;

CREATE FUNCTION shado_live_private.mutate_my_shado_live_stage_request_impl(
  target_room_id uuid,
  target_action text,
  client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_action text := lower(trim(coalesce(target_action, '')));
  request_row public.live_room_stage_requests%ROWTYPE;
  room_revision integer;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF client_request_id IS NULL THEN RAISE EXCEPTION 'Client request id is required'; END IF;
  IF normalized_action NOT IN ('raise_hand', 'lower_hand') THEN
    RAISE EXCEPTION 'Unsupported stage action';
  END IF;
  IF NOT shado_live_private.can_access_shado_live_room(caller_id, target_room_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Room is unavailable';
  END IF;
  SELECT rooms.revision INTO room_revision
  FROM public.live_rooms rooms
  WHERE rooms.id = target_room_id AND rooms.status = 'live'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage requests are closed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.live_room_participants participants
    WHERE participants.room_id = target_room_id
      AND participants.user_id = caller_id
      AND participants.status = 'joined'
      AND participants.role = 'listener'
  ) THEN
    RAISE EXCEPTION 'Only joined listeners can raise a hand';
  END IF;

  IF normalized_action = 'raise_hand' THEN
    SELECT * INTO request_row
    FROM public.live_room_stage_requests requests
    WHERE requests.room_id = target_room_id
      AND requests.user_id = caller_id
      AND requests.status = 'raised';
    IF NOT FOUND THEN
      INSERT INTO public.live_room_stage_requests (room_id, user_id, client_request_id)
      VALUES (target_room_id, caller_id, client_request_id)
      ON CONFLICT ON CONSTRAINT live_room_stage_requests_client_key DO UPDATE
      SET updated_at = public.live_room_stage_requests.updated_at
      RETURNING * INTO request_row;
    END IF;
  ELSE
    UPDATE public.live_room_stage_requests requests
    SET status = 'cancelled',
        revision = requests.revision + 1,
        resolved_at = now(),
        updated_at = now()
    WHERE requests.room_id = target_room_id
      AND requests.user_id = caller_id
      AND requests.status = 'raised'
    RETURNING * INTO request_row;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('roomId', target_room_id, 'status', 'cancelled', 'changed', false);
    END IF;
  END IF;

  INSERT INTO public.live_room_events (
    room_id, actor_user_id, event_type, room_revision, idempotency_key,
    metadata
  ) VALUES (
    target_room_id,
    caller_id,
    CASE WHEN normalized_action = 'raise_hand' THEN 'hand_raised' ELSE 'hand_lowered' END,
    room_revision,
    client_request_id,
    jsonb_build_object('stageRequestId', request_row.id, 'revision', request_row.revision)
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'stageRequestId', request_row.id,
    'roomId', request_row.room_id,
    'status', request_row.status,
    'revision', request_row.revision,
    'changed', true
  );
END;
$$;

CREATE FUNCTION shado_live_private.shado_live_prepare_session_impl(
  actor_user_id uuid,
  target_action text,
  target_room_id uuid,
  idempotency_key uuid,
  p_request jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_action text := lower(trim(coalesce(target_action, '')));
  request_body jsonb := coalesce(p_request, '{}'::jsonb);
  event_kind text;
  previous_receipt jsonb;
  room_row public.live_rooms%ROWTYPE;
  participant_row public.live_room_participants%ROWTYPE;
  provider_operation public.live_provider_operations%ROWTYPE;
  generated_room_id uuid;
  normalized_title text;
  normalized_description text;
  listener_count integer;
  receipt jsonb;
BEGIN
  IF actor_user_id IS NULL OR idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Actor and idempotency key are required';
  END IF;
  IF normalized_action NOT IN ('create', 'join', 'resume', 'leave') THEN
    RAISE EXCEPTION 'Unsupported live session action';
  END IF;
  IF jsonb_typeof(request_body) <> 'object' OR pg_column_size(request_body) > 16384 THEN
    RAISE EXCEPTION 'Session request payload is invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users users WHERE users.id = actor_user_id) THEN
    RAISE EXCEPTION 'Member is unavailable';
  END IF;
  IF normalized_action <> 'leave' AND NOT private.shado_live_is_enabled_for(actor_user_id) THEN
    RAISE EXCEPTION USING errcode = '55000', message = 'Shado Live is disabled';
  END IF;

  event_kind := CASE normalized_action
    WHEN 'create' THEN 'room_created'
    WHEN 'join' THEN 'session_joined'
    WHEN 'resume' THEN 'session_resumed'
    ELSE 'session_left'
  END;

  SELECT events.metadata -> 'receipt'
  INTO previous_receipt
  FROM public.live_room_events events
  WHERE events.actor_user_id = shado_live_prepare_session_impl.actor_user_id
    AND events.event_type = event_kind
    AND events.idempotency_key = shado_live_prepare_session_impl.idempotency_key;
  IF previous_receipt IS NOT NULL THEN RETURN previous_receipt; END IF;

  IF normalized_action = 'create' THEN
    IF target_room_id IS NOT NULL THEN RAISE EXCEPTION 'Create does not accept an existing room id'; END IF;
    IF private.user_has_shado_live_restriction(actor_user_id, 'host') THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'Live hosting is unavailable';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('shado-live-host:' || actor_user_id::text, 0)
    );
    IF EXISTS (
      SELECT 1 FROM public.live_rooms rooms
      WHERE rooms.host_user_id = actor_user_id
        AND rooms.status IN ('scheduled', 'green_room', 'live', 'ending')
    ) THEN
      RAISE EXCEPTION 'A hosted room is already active';
    END IF;

    normalized_title := trim(coalesce(request_body ->> 'title', 'Shado Live room'));
    normalized_description := trim(coalesce(request_body ->> 'description', ''));
    IF char_length(normalized_title) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Room title must be between 1 and 120 characters';
    END IF;
    IF char_length(normalized_description) > 500 THEN
      RAISE EXCEPTION 'Room description is too long';
    END IF;

    generated_room_id := gen_random_uuid();
    INSERT INTO public.live_rooms (
      id, host_user_id, title, description, provider_room_name, status
    ) VALUES (
      generated_room_id,
      actor_user_id,
      normalized_title,
      normalized_description,
      'shado-live-' || generated_room_id::text,
      'green_room'
    ) RETURNING * INTO room_row;

    INSERT INTO public.live_room_participants (
      room_id, user_id, role, status, provider_identity
    ) VALUES (
      room_row.id, actor_user_id, 'host', 'joined', actor_user_id::text
    ) RETURNING * INTO participant_row;

    provider_operation := private.enqueue_shado_live_provider_operation(
      room_row.id,
      actor_user_id,
      actor_user_id,
      'create_room',
      idempotency_key,
      room_row.revision,
      jsonb_build_object(
        'roomName', room_row.provider_room_name,
        'emptyTimeoutSeconds', 60,
        'maxParticipants', room_row.listener_limit + 4,
        'recordingAllowed', false
      )
    );
  ELSE
    IF target_room_id IS NULL THEN RAISE EXCEPTION 'Room id is required'; END IF;
    SELECT * INTO room_row
    FROM public.live_rooms rooms
    WHERE rooms.id = target_room_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room is unavailable'; END IF;

    IF normalized_action = 'leave' THEN
      SELECT * INTO participant_row
      FROM public.live_room_participants participants
      WHERE participants.room_id = room_row.id
        AND participants.user_id = actor_user_id
      FOR UPDATE;
      IF NOT FOUND THEN
        receipt := jsonb_build_object(
          'action', 'leave', 'roomId', room_row.id, 'changed', false,
          'roomRevision', room_row.revision
        );
      ELSIF participant_row.status = 'removed' THEN
        receipt := jsonb_build_object(
          'action', 'leave', 'roomId', room_row.id, 'changed', false,
          'participantRevision', participant_row.revision,
          'roomRevision', room_row.revision
        );
      ELSE
        UPDATE public.live_room_participants participants
        SET status = 'left',
            revision = participants.revision + 1,
            token_version = participants.token_version + 1,
            provider_identity = participants.user_id::text,
            left_at = now(),
            provider_left_at = coalesce(participants.provider_left_at, now()),
            updated_at = now()
        WHERE participants.id = participant_row.id
        RETURNING * INTO participant_row;

        IF participant_row.role = 'host'
          AND room_row.status IN ('scheduled', 'green_room', 'live') THEN
          UPDATE public.live_rooms rooms
          SET status = 'ending',
              revision = rooms.revision + 1,
              ending_at = now(),
              ended_reason = 'host_left',
              host_disconnected_at = NULL,
              host_grace_expires_at = NULL,
              updated_at = now()
          WHERE rooms.id = room_row.id
          RETURNING * INTO room_row;
          provider_operation := private.enqueue_shado_live_provider_operation(
            room_row.id, actor_user_id, actor_user_id, 'delete_room',
            idempotency_key, room_row.revision,
            jsonb_build_object('roomName', room_row.provider_room_name, 'reason', 'host_left')
          );
        ELSE
          provider_operation := private.enqueue_shado_live_provider_operation(
            room_row.id, actor_user_id, actor_user_id, 'remove_participant',
            idempotency_key, room_row.revision,
            jsonb_build_object('participantIdentity', participant_row.provider_identity, 'reason', 'left')
          );
        END IF;

        receipt := jsonb_strip_nulls(jsonb_build_object(
          'action', 'leave',
          'roomId', room_row.id,
          'changed', true,
          'participantRevision', participant_row.revision,
          'roomRevision', room_row.revision,
          'providerOperationId', provider_operation.id
        ));
      END IF;
    ELSE
      IF private.user_has_shado_live_restriction(actor_user_id, 'join') THEN
        RAISE EXCEPTION USING errcode = '42501', message = 'Live room access is unavailable';
      END IF;
      IF NOT shado_live_private.can_access_shado_live_room(actor_user_id, room_row.id) THEN
        RAISE EXCEPTION USING errcode = '42501', message = 'Room is unavailable';
      END IF;
      IF normalized_action = 'join' AND room_row.status <> 'live' THEN
        RAISE EXCEPTION 'Room is not live';
      END IF;
      IF normalized_action = 'resume' AND room_row.status NOT IN ('green_room', 'live') THEN
        RAISE EXCEPTION 'Room cannot be resumed';
      END IF;

      SELECT * INTO participant_row
      FROM public.live_room_participants participants
      WHERE participants.room_id = room_row.id
        AND participants.user_id = actor_user_id
      FOR UPDATE;

      IF FOUND AND participant_row.status = 'removed' THEN
        RAISE EXCEPTION USING errcode = '42501', message = 'Room is unavailable';
      END IF;

      IF NOT FOUND THEN
        IF room_row.host_user_id <> actor_user_id THEN
          SELECT count(*)::integer INTO listener_count
          FROM public.live_room_participants participants
          WHERE participants.room_id = room_row.id
            AND participants.status = 'joined'
            AND participants.role = 'listener';
          IF listener_count >= room_row.listener_limit THEN
            RAISE EXCEPTION USING errcode = '54000', message = 'Room is full';
          END IF;
        END IF;

        INSERT INTO public.live_room_participants (
          room_id, user_id, role, status, provider_identity
        ) VALUES (
          room_row.id,
          actor_user_id,
          CASE WHEN room_row.host_user_id = actor_user_id THEN 'host' ELSE 'listener' END,
          'joined',
          actor_user_id::text
        ) RETURNING * INTO participant_row;
      ELSE
        UPDATE public.live_room_participants participants
        SET status = 'joined',
            revision = participants.revision + 1,
            token_version = participants.token_version + 1,
            provider_identity = participants.user_id::text,
            joined_at = now(),
            left_at = NULL,
            removed_at = NULL,
            removal_reason = NULL,
            updated_at = now()
        WHERE participants.id = participant_row.id
        RETURNING * INTO participant_row;
      END IF;

      IF participant_row.role = 'host' THEN
        UPDATE public.live_provider_operations operations
        SET status = 'cancelled', completed_at = now(), updated_at = now()
        WHERE operations.room_id = room_row.id
          AND operations.operation_type = 'delete_room'
          AND operations.status = 'pending'
          AND operations.request_payload ->> 'reason' = 'host_disconnected';
        UPDATE public.live_rooms rooms
        SET host_disconnected_at = NULL,
            host_grace_expires_at = NULL,
            revision = CASE WHEN rooms.host_disconnected_at IS NULL THEN rooms.revision ELSE rooms.revision + 1 END,
            updated_at = now()
        WHERE rooms.id = room_row.id
        RETURNING * INTO room_row;
      END IF;

      receipt := jsonb_build_object(
        'action', normalized_action,
        'roomId', room_row.id,
        'roomName', room_row.provider_room_name,
        'roomStatus', room_row.status,
        'roomRevision', room_row.revision,
        'participantId', participant_row.id,
        'participantIdentity', participant_row.provider_identity,
        'participantRevision', participant_row.revision,
        'tokenVersion', participant_row.token_version,
        'role', participant_row.role,
        'canSubscribe', true,
        'canPublishData', false,
        'canPublish', participant_row.role IN ('host', 'speaker'),
        'publishSources', CASE
          WHEN participant_row.role IN ('host', 'speaker') THEN jsonb_build_array('microphone')
          ELSE '[]'::jsonb
        END,
        'recordingAllowed', false
      );
    END IF;
  END IF;

  IF normalized_action = 'create' THEN
    receipt := jsonb_build_object(
      'action', 'create',
      'roomId', room_row.id,
      'roomName', room_row.provider_room_name,
      'roomStatus', room_row.status,
      'roomRevision', room_row.revision,
      'participantId', participant_row.id,
      'participantIdentity', participant_row.provider_identity,
      'participantRevision', participant_row.revision,
      'tokenVersion', participant_row.token_version,
      'role', 'host',
      'canSubscribe', true,
      'canPublishData', false,
      'canPublish', true,
      'publishSources', jsonb_build_array('microphone'),
      'recordingAllowed', false,
      'providerOperationId', provider_operation.id
    );
  END IF;

  receipt := receipt || jsonb_strip_nulls(jsonb_build_object(
    'roomName', room_row.provider_room_name,
    'roomStatus', room_row.status,
    'roomTitle', room_row.title,
    'roomDescription', room_row.description,
    'participantId', participant_row.id,
    'participantIdentity', participant_row.provider_identity,
    'participantRevision', participant_row.revision,
    'tokenVersion', participant_row.token_version,
    'role', participant_row.role,
    'providerOperationType', provider_operation.operation_type
  ));

  INSERT INTO public.live_room_events (
    room_id, actor_user_id, target_user_id, event_type,
    room_revision, idempotency_key, metadata
  ) VALUES (
    coalesce(room_row.id, target_room_id),
    actor_user_id,
    actor_user_id,
    event_kind,
    room_row.revision,
    idempotency_key,
    jsonb_build_object('receipt', receipt)
  ) ON CONFLICT DO NOTHING;

  RETURN receipt;
END;
$$;

CREATE FUNCTION shado_live_private.shado_live_prepare_command_impl(
  actor_user_id uuid,
  target_command text,
  target_room_id uuid,
  target_user_id uuid,
  expected_version integer,
  idempotency_key uuid,
  p_request jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_command text := lower(trim(coalesce(target_command, '')));
  request_body jsonb := coalesce(p_request, '{}'::jsonb);
  event_kind text;
  previous_receipt jsonb;
  room_row public.live_rooms%ROWTYPE;
  target_participant public.live_room_participants%ROWTYPE;
  stage_request public.live_room_stage_requests%ROWTYPE;
  message_row public.live_room_messages%ROWTYPE;
  provider_operation public.live_provider_operations%ROWTYPE;
  speaker_count integer;
  actor_is_operator boolean;
  actor_is_host boolean;
  client_entity_id uuid;
  normalized_body text;
  receipt jsonb;
BEGIN
  IF actor_user_id IS NULL OR target_room_id IS NULL OR idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Actor, room, and idempotency key are required';
  END IF;
  IF normalized_command NOT IN (
    'start', 'raise_hand', 'lower_hand', 'send_message',
    'promote', 'demote', 'mute', 'remove', 'end'
  ) THEN
    RAISE EXCEPTION 'Unsupported live command';
  END IF;
  IF jsonb_typeof(request_body) <> 'object' OR pg_column_size(request_body) > 16384 THEN
    RAISE EXCEPTION 'Command request payload is invalid';
  END IF;
  IF normalized_command NOT IN ('raise_hand', 'lower_hand', 'send_message')
    AND (expected_version IS NULL OR expected_version < 1) THEN
    RAISE EXCEPTION 'Expected room version is required';
  END IF;
  IF NOT private.shado_live_is_enabled_for(actor_user_id)
    AND normalized_command NOT IN ('demote', 'mute', 'remove', 'end') THEN
    RAISE EXCEPTION USING errcode = '55000', message = 'Shado Live is disabled';
  END IF;

  event_kind := CASE normalized_command
    WHEN 'start' THEN 'room_started'
    WHEN 'raise_hand' THEN 'hand_raised'
    WHEN 'lower_hand' THEN 'hand_lowered'
    WHEN 'send_message' THEN 'message_sent'
    WHEN 'promote' THEN 'speaker_promoted'
    WHEN 'demote' THEN 'speaker_demoted'
    WHEN 'mute' THEN 'participant_muted'
    WHEN 'remove' THEN 'participant_removed'
    ELSE 'room_ending'
  END;

  SELECT events.metadata -> 'receipt'
  INTO previous_receipt
  FROM public.live_room_events events
  WHERE events.actor_user_id = shado_live_prepare_command_impl.actor_user_id
    AND events.event_type = event_kind
    AND events.idempotency_key = shado_live_prepare_command_impl.idempotency_key;
  IF previous_receipt IS NOT NULL THEN RETURN previous_receipt; END IF;

  SELECT * INTO room_row
  FROM public.live_rooms rooms
  WHERE rooms.id = target_room_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room is unavailable'; END IF;
  IF expected_version IS NOT NULL AND room_row.revision <> expected_version THEN
    RAISE EXCEPTION 'Room changed. Refresh before retrying the command';
  END IF;

  actor_is_operator := public.is_app_operator(actor_user_id);
  actor_is_host := room_row.host_user_id = actor_user_id;

  IF normalized_command IN ('start', 'promote', 'demote', 'mute', 'remove', 'end')
    AND NOT actor_is_host AND NOT actor_is_operator THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Host or operator access required';
  END IF;

  IF normalized_command = 'start' THEN
    IF room_row.status = 'live' THEN
      receipt := jsonb_build_object(
        'command', 'start', 'roomId', room_row.id,
        'roomRevision', room_row.revision, 'changed', false,
        'providerRequired', false
      );
    ELSIF room_row.status <> 'green_room' THEN
      RAISE EXCEPTION 'Only a green room can start';
    ELSE
      UPDATE public.live_rooms rooms
      SET status = 'live',
          revision = rooms.revision + 1,
          started_at = now(),
          updated_at = now()
      WHERE rooms.id = room_row.id
      RETURNING * INTO room_row;
      receipt := jsonb_build_object(
        'command', 'start', 'roomId', room_row.id,
        'roomRevision', room_row.revision, 'changed', true,
        'providerRequired', false
      );
    END IF;
  ELSIF normalized_command IN ('raise_hand', 'lower_hand') THEN
    IF target_user_id IS NOT NULL AND target_user_id <> actor_user_id THEN
      RAISE EXCEPTION 'Members can change only their own hand state';
    END IF;
    SELECT * INTO target_participant
    FROM public.live_room_participants participants
    WHERE participants.room_id = room_row.id
      AND participants.user_id = actor_user_id
      AND participants.status = 'joined'
      AND participants.role = 'listener'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only joined listeners can raise a hand'; END IF;
    client_entity_id := coalesce((request_body ->> 'clientRequestId')::uuid, idempotency_key);

    IF normalized_command = 'raise_hand' THEN
      SELECT * INTO stage_request
      FROM public.live_room_stage_requests requests
      WHERE requests.room_id = room_row.id
        AND requests.user_id = actor_user_id
        AND requests.status = 'raised';
      IF NOT FOUND THEN
        INSERT INTO public.live_room_stage_requests (room_id, user_id, client_request_id)
        VALUES (room_row.id, actor_user_id, client_entity_id)
        ON CONFLICT ON CONSTRAINT live_room_stage_requests_client_key DO UPDATE
        SET updated_at = public.live_room_stage_requests.updated_at
        RETURNING * INTO stage_request;
      END IF;
    ELSE
      UPDATE public.live_room_stage_requests requests
      SET status = 'cancelled', revision = requests.revision + 1,
          resolved_at = now(), updated_at = now()
      WHERE requests.room_id = room_row.id
        AND requests.user_id = actor_user_id
        AND requests.status = 'raised'
      RETURNING * INTO stage_request;
    END IF;
    receipt := jsonb_strip_nulls(jsonb_build_object(
      'command', normalized_command,
      'roomId', room_row.id,
      'roomRevision', room_row.revision,
      'stageRequestId', stage_request.id,
      'stageRequestRevision', stage_request.revision,
      'changed', stage_request.id IS NOT NULL,
      'providerRequired', false
    ));
  ELSIF normalized_command = 'send_message' THEN
    IF private.user_has_shado_live_restriction(actor_user_id, 'chat') THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'Live chat is unavailable';
    END IF;
    IF NOT shado_live_private.can_access_shado_live_room(actor_user_id, room_row.id)
      OR room_row.status <> 'live' THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'Live chat is closed';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.live_room_participants participants
      WHERE participants.room_id = room_row.id
        AND participants.user_id = actor_user_id
        AND participants.status = 'joined'
    ) THEN
      RAISE EXCEPTION 'Join the room before sending chat';
    END IF;
    normalized_body := trim(coalesce(request_body ->> 'body', ''));
    IF char_length(normalized_body) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Message must be between 1 and 1000 characters';
    END IF;
    client_entity_id := coalesce((request_body ->> 'clientMessageId')::uuid, idempotency_key);
    INSERT INTO public.live_room_messages (room_id, sender_user_id, body, client_message_id)
    VALUES (room_row.id, actor_user_id, normalized_body, client_entity_id)
    ON CONFLICT ON CONSTRAINT live_room_messages_client_key DO UPDATE
    SET updated_at = public.live_room_messages.updated_at
    RETURNING * INTO message_row;
    receipt := jsonb_build_object(
      'command', 'send_message',
      'roomId', room_row.id,
      'roomRevision', room_row.revision,
      'messageId', message_row.id,
      'messageRevision', message_row.revision,
      'providerRequired', false
    );
  ELSIF normalized_command IN ('promote', 'demote', 'mute', 'remove') THEN
    IF target_user_id IS NULL OR target_user_id = room_row.host_user_id THEN
      RAISE EXCEPTION 'A non-host target participant is required';
    END IF;
    SELECT * INTO target_participant
    FROM public.live_room_participants participants
    WHERE participants.room_id = room_row.id
      AND participants.user_id = target_user_id
    FOR UPDATE;
    IF NOT FOUND OR target_participant.status <> 'joined' THEN
      RAISE EXCEPTION 'Participant is unavailable';
    END IF;

    IF normalized_command = 'promote' THEN
      IF target_participant.role = 'speaker' THEN
        NULL;
      ELSIF target_participant.role <> 'listener' THEN
        RAISE EXCEPTION 'Only a listener can be promoted';
      ELSE
        SELECT count(*)::integer INTO speaker_count
        FROM public.live_room_participants participants
        WHERE participants.room_id = room_row.id
          AND participants.status = 'joined'
          AND participants.role = 'speaker';
        IF speaker_count >= 3 THEN
          RAISE EXCEPTION USING errcode = '54000', message = 'The room already has three speakers';
        END IF;
        UPDATE public.live_room_participants participants
        SET role = 'speaker', revision = participants.revision + 1,
            token_version = participants.token_version + 1,
            provider_identity = participants.user_id::text,
            host_muted = false, updated_at = now()
        WHERE participants.id = target_participant.id
        RETURNING * INTO target_participant;
        UPDATE public.live_room_stage_requests requests
        SET status = 'approved', revision = requests.revision + 1,
            resolved_at = now(), updated_at = now()
        WHERE requests.room_id = room_row.id
          AND requests.user_id = target_user_id
          AND requests.status = 'raised';
      END IF;
    ELSIF normalized_command = 'demote' THEN
      IF target_participant.role = 'listener' THEN
        NULL;
      ELSIF target_participant.role <> 'speaker' THEN
        RAISE EXCEPTION 'Only a speaker can be demoted';
      ELSE
        UPDATE public.live_room_participants participants
        SET role = 'listener', revision = participants.revision + 1,
            token_version = participants.token_version + 1,
            provider_identity = participants.user_id::text,
            host_muted = false, updated_at = now()
        WHERE participants.id = target_participant.id
        RETURNING * INTO target_participant;
      END IF;
    ELSIF normalized_command = 'mute' THEN
      UPDATE public.live_room_participants participants
      SET host_muted = true, revision = participants.revision + 1, updated_at = now()
      WHERE participants.id = target_participant.id
      RETURNING * INTO target_participant;
    ELSE
      UPDATE public.live_room_participants participants
      SET status = 'removed', revision = participants.revision + 1,
          token_version = participants.token_version + 1,
          provider_identity = participants.user_id::text,
          removed_at = now(), left_at = NULL, removal_reason = 'host_or_operator_removed',
          updated_at = now()
      WHERE participants.id = target_participant.id
      RETURNING * INTO target_participant;
      UPDATE public.live_room_stage_requests requests
      SET status = 'declined', revision = requests.revision + 1,
          resolved_at = now(), updated_at = now()
      WHERE requests.room_id = room_row.id
        AND requests.user_id = target_user_id
        AND requests.status = 'raised';
      UPDATE public.live_room_invites invites
      SET status = 'revoked', revision = invites.revision + 1,
          resolved_at = now(), updated_at = now()
      WHERE invites.room_id = room_row.id
        AND invites.invited_user_id = target_user_id
        AND invites.status = 'pending';
    END IF;

    UPDATE public.live_rooms rooms
    SET revision = rooms.revision + 1, updated_at = now()
    WHERE rooms.id = room_row.id
    RETURNING * INTO room_row;

    provider_operation := private.enqueue_shado_live_provider_operation(
      room_row.id,
      actor_user_id,
      target_user_id,
      CASE normalized_command
        WHEN 'mute' THEN 'mute_track'
        WHEN 'remove' THEN 'remove_participant'
        ELSE 'update_permissions'
      END,
      idempotency_key,
      room_row.revision,
      jsonb_build_object(
        'participantIdentity', target_participant.provider_identity,
        'role', target_participant.role,
        'tokenVersion', target_participant.token_version,
        'canPublish', target_participant.role = 'speaker' AND NOT target_participant.host_muted,
        'publishSources', CASE WHEN target_participant.role = 'speaker'
          THEN jsonb_build_array('microphone') ELSE '[]'::jsonb END,
        'muted', target_participant.host_muted,
        'reason', CASE WHEN normalized_command = 'remove' THEN 'host_or_operator_removed' ELSE NULL END
      )
    );

    receipt := jsonb_build_object(
      'command', normalized_command,
      'roomId', room_row.id,
      'roomRevision', room_row.revision,
      'targetUserId', target_user_id,
      'participantRevision', target_participant.revision,
      'tokenVersion', target_participant.token_version,
      'role', target_participant.role,
      'providerRequired', true,
      'providerOperationId', provider_operation.id
    );
  ELSE
    IF room_row.status IN ('ended', 'cancelled') THEN
      receipt := jsonb_build_object(
        'command', 'end', 'roomId', room_row.id,
        'roomRevision', room_row.revision, 'changed', false,
        'providerRequired', false
      );
    ELSE
      UPDATE public.live_rooms rooms
      SET status = 'ending', revision = rooms.revision + 1,
          ending_at = coalesce(rooms.ending_at, now()),
          ended_reason = left(coalesce(nullif(trim(request_body ->> 'reason'), ''), 'host_or_operator_ended'), 500),
          host_disconnected_at = NULL, host_grace_expires_at = NULL,
          updated_at = now()
      WHERE rooms.id = room_row.id
      RETURNING * INTO room_row;
      provider_operation := private.enqueue_shado_live_provider_operation(
        room_row.id, actor_user_id, NULL, 'delete_room', idempotency_key,
        room_row.revision,
        jsonb_build_object('roomName', room_row.provider_room_name, 'reason', room_row.ended_reason)
      );
      receipt := jsonb_build_object(
        'command', 'end', 'roomId', room_row.id,
        'roomRevision', room_row.revision, 'changed', true,
        'providerRequired', true,
        'providerOperationId', provider_operation.id
      );
    END IF;
  END IF;

  receipt := receipt || jsonb_strip_nulls(jsonb_build_object(
    'roomName', room_row.provider_room_name,
    'roomStatus', room_row.status,
    'roomTitle', room_row.title,
    'roomDescription', room_row.description,
    'participantId', target_participant.id,
    'participantIdentity', target_participant.provider_identity,
    'tokenVersion', target_participant.token_version,
    'role', target_participant.role,
    'hostMuted', target_participant.host_muted,
    'providerOperationType', provider_operation.operation_type
  ));

  INSERT INTO public.live_room_events (
    room_id, actor_user_id, target_user_id, event_type,
    room_revision, idempotency_key, metadata
  ) VALUES (
    room_row.id, actor_user_id, target_user_id, event_kind,
    room_row.revision, idempotency_key,
    jsonb_build_object('receipt', receipt)
  ) ON CONFLICT DO NOTHING;

  RETURN receipt;
END;
$$;

CREATE FUNCTION shado_live_private.shado_live_claim_provider_operations_impl(
  actor_user_id uuid,
  result_limit integer DEFAULT 20
)
RETURNS TABLE (
  operation_id uuid,
  room_id uuid,
  room_version integer,
  provider_operation text,
  target_user_id uuid,
  target_role text,
  token_version integer,
  provider_can_publish boolean,
  request_payload jsonb,
  attempt_count integer,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  bounded_limit integer := greatest(1, least(coalesce(result_limit, 20), 50));
  actor_is_operator boolean;
BEGIN
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Actor is required';
  END IF;
  actor_is_operator := public.is_app_operator(actor_user_id);

  RETURN QUERY
  WITH claimable AS (
    SELECT
      operations.id,
      target_participant.role AS target_role,
      target_participant.token_version,
      target_participant.role IN ('host', 'speaker')
        AND NOT target_participant.host_muted AS provider_can_publish
    FROM public.live_provider_operations operations
    JOIN public.live_rooms rooms ON rooms.id = operations.room_id
    LEFT JOIN public.live_room_participants target_participant
      ON target_participant.room_id = operations.room_id
     AND target_participant.user_id = operations.target_user_id
    WHERE operations.available_at <= now()
      AND (
        operations.status = 'pending'
        OR (
          operations.status = 'processing'
          AND operations.lease_expires_at IS NOT NULL
          AND operations.lease_expires_at <= now()
        )
      )
      AND (
        actor_is_operator
        OR operations.actor_user_id = shado_live_claim_provider_operations_impl.actor_user_id
        OR rooms.host_user_id = shado_live_claim_provider_operations_impl.actor_user_id
        OR EXISTS (
          SELECT 1
          FROM public.live_room_participants participants
          WHERE participants.room_id = rooms.id
            AND participants.user_id = shado_live_claim_provider_operations_impl.actor_user_id
            AND participants.status = 'joined'
        )
      )
    ORDER BY operations.available_at, operations.created_at, operations.id
    FOR UPDATE OF operations SKIP LOCKED
    LIMIT bounded_limit
  )
  UPDATE public.live_provider_operations operations
  SET status = 'processing',
      attempt_count = operations.attempt_count + 1,
      lease_expires_at = now() + interval '60 seconds',
      updated_at = now()
  FROM claimable
  WHERE operations.id = claimable.id
  RETURNING
    operations.id,
    operations.room_id,
    operations.expected_room_revision,
    CASE operations.operation_type
      WHEN 'update_permissions' THEN 'update_participant'
      WHEN 'mute_track' THEN 'update_participant'
      ELSE operations.operation_type
    END,
    operations.target_user_id,
    claimable.target_role,
    claimable.token_version,
    claimable.provider_can_publish,
    operations.request_payload,
    operations.attempt_count,
    operations.lease_expires_at;
END;
$$;

CREATE FUNCTION shado_live_private.shado_live_complete_provider_operation_impl(
  operation_id uuid,
  target_status text,
  provider_payload jsonb DEFAULT '{}'::jsonb,
  error_code text DEFAULT NULL,
  error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_status text := lower(trim(coalesce(target_status, '')));
  response_payload jsonb := coalesce(provider_payload, '{}'::jsonb);
  operation_row public.live_provider_operations%ROWTYPE;
  room_row public.live_rooms%ROWTYPE;
BEGIN
  IF operation_id IS NULL OR normalized_status NOT IN ('succeeded', 'failed', 'retryable') THEN
    RAISE EXCEPTION 'Operation id and valid completion status are required';
  END IF;
  IF jsonb_typeof(response_payload) <> 'object' OR pg_column_size(response_payload) > 16384 THEN
    RAISE EXCEPTION 'Provider response payload is invalid';
  END IF;
  IF error_code IS NOT NULL AND char_length(error_code) > 120 THEN
    RAISE EXCEPTION 'Provider error code is too long';
  END IF;
  IF error_message IS NOT NULL AND char_length(error_message) > 1000 THEN
    RAISE EXCEPTION 'Provider error message is too long';
  END IF;

  SELECT * INTO operation_row
  FROM public.live_provider_operations operations
  WHERE operations.id = operation_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Provider operation was not found'; END IF;
  IF operation_row.status IN ('succeeded', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'operationId', operation_row.id,
      'status', operation_row.status,
      'duplicate', true
    );
  END IF;

  UPDATE public.live_provider_operations operations
  SET status = CASE WHEN normalized_status = 'retryable' THEN 'pending' ELSE normalized_status END,
      provider_payload = response_payload,
      last_error_code = nullif(left(coalesce(error_code, ''), 120), ''),
      last_error_message = nullif(left(coalesce(error_message, ''), 1000), ''),
      available_at = CASE
        WHEN normalized_status = 'retryable'
          THEN now() + make_interval(secs => least(300, greatest(2, operation_row.attempt_count * 5)))
        ELSE operations.available_at
      END,
      lease_expires_at = NULL,
      completed_at = CASE WHEN normalized_status IN ('succeeded', 'failed') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE operations.id = operation_row.id
  RETURNING * INTO operation_row;

  SELECT * INTO room_row FROM public.live_rooms rooms WHERE rooms.id = operation_row.room_id FOR UPDATE;
  IF normalized_status = 'succeeded' AND operation_row.operation_type = 'delete_room' AND FOUND THEN
    UPDATE public.live_rooms rooms
    SET status = 'ended',
        revision = CASE WHEN rooms.status = 'ended' THEN rooms.revision ELSE rooms.revision + 1 END,
        ending_at = coalesce(rooms.ending_at, now()),
        ended_at = coalesce(rooms.ended_at, now()),
        ended_reason = coalesce(rooms.ended_reason, 'provider_room_deleted'),
        host_disconnected_at = NULL,
        host_grace_expires_at = NULL,
        updated_at = now()
    WHERE rooms.id = operation_row.room_id
    RETURNING * INTO room_row;

    UPDATE public.live_room_participants participants
    SET status = CASE WHEN participants.status = 'removed' THEN 'removed' ELSE 'left' END,
        left_at = CASE WHEN participants.status = 'removed' THEN participants.left_at ELSE coalesce(participants.left_at, now()) END,
        provider_left_at = coalesce(participants.provider_left_at, now()),
        revision = participants.revision + 1,
        token_version = participants.token_version + 1,
        provider_identity = participants.user_id::text,
        updated_at = now()
    WHERE participants.room_id = operation_row.room_id
      AND participants.status = 'joined';

    INSERT INTO public.live_room_events (
      room_id, actor_user_id, event_type, room_revision, metadata
    ) VALUES (
      room_row.id, operation_row.actor_user_id, 'room_ended', room_row.revision,
      jsonb_build_object('providerOperationId', operation_row.id, 'reason', room_row.ended_reason)
    );
  ELSIF normalized_status = 'succeeded'
    AND operation_row.operation_type = 'remove_participant'
    AND operation_row.target_user_id IS NOT NULL THEN
    UPDATE public.live_room_participants participants
    SET provider_left_at = coalesce(participants.provider_left_at, now()), updated_at = now()
    WHERE participants.room_id = operation_row.room_id
      AND participants.user_id = operation_row.target_user_id;
  END IF;

  INSERT INTO public.live_room_events (
    room_id, actor_user_id, target_user_id, event_type,
    room_revision, metadata
  ) VALUES (
    operation_row.room_id,
    operation_row.actor_user_id,
    operation_row.target_user_id,
    'provider_operation_completed',
    coalesce(room_row.revision, operation_row.expected_room_revision),
    jsonb_build_object(
      'providerOperationId', operation_row.id,
      'operationType', operation_row.operation_type,
      'status', operation_row.status,
      'attemptCount', operation_row.attempt_count,
      'errorCode', operation_row.last_error_code
    )
  );

  RETURN jsonb_build_object(
    'operationId', operation_row.id,
    'status', operation_row.status,
    'attemptCount', operation_row.attempt_count,
    'roomId', operation_row.room_id,
    'roomRevision', coalesce(room_row.revision, operation_row.expected_room_revision),
    'duplicate', false
  );
END;
$$;

CREATE FUNCTION shado_live_private.shado_live_ingest_provider_webhook_impl(
  event_id text,
  event_type text,
  target_room_id uuid,
  room_name text,
  participant_user_id uuid,
  occurred_at timestamptz,
  payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  clean_event_id text := trim(coalesce(event_id, ''));
  clean_event_type text := lower(trim(coalesce(event_type, '')));
  clean_room_name text := nullif(trim(coalesce(room_name, '')), '');
  clean_identity text := participant_user_id::text;
  event_payload jsonb := coalesce(payload, '{}'::jsonb);
  event_token_version integer := CASE
    WHEN coalesce(event_payload ->> 'tokenVersion', event_payload ->> 'token_version', '') ~ '^[1-9][0-9]*$'
      THEN coalesce(event_payload ->> 'tokenVersion', event_payload ->> 'token_version')::integer
    ELSE NULL
  END;
  inserted_count integer;
  room_row public.live_rooms%ROWTYPE;
  participant_row public.live_room_participants%ROWTYPE;
  removal_operation public.live_provider_operations%ROWTYPE;
  generated_key uuid := gen_random_uuid();
BEGIN
  IF char_length(clean_event_id) NOT BETWEEN 1 AND 240
    OR char_length(clean_event_type) NOT BETWEEN 1 AND 120
    OR occurred_at IS NULL THEN
    RAISE EXCEPTION 'Verified webhook identity, type, and occurrence time are required';
  END IF;
  IF jsonb_typeof(event_payload) <> 'object' OR pg_column_size(event_payload) > 32768 THEN
    RAISE EXCEPTION 'Webhook payload is invalid';
  END IF;

  INSERT INTO public.live_provider_webhook_receipts (
    event_id, event_type, room_id, room_name, participant_user_id,
    participant_identity, occurred_at, payload
  ) VALUES (
    clean_event_id, clean_event_type, target_room_id, clean_room_name, participant_user_id,
    clean_identity, occurred_at, event_payload
  ) ON CONFLICT ON CONSTRAINT live_provider_webhook_receipts_pkey DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    RETURN jsonb_build_object('eventId', clean_event_id, 'duplicate', true, 'applied', false);
  END IF;

  SELECT * INTO room_row
  FROM public.live_rooms rooms
  WHERE (target_room_id IS NULL OR rooms.id = target_room_id)
    AND (clean_room_name IS NULL OR rooms.provider_room_name = clean_room_name)
    AND (target_room_id IS NOT NULL OR clean_room_name IS NOT NULL)
  FOR UPDATE;

  IF FOUND THEN
    IF clean_event_type IN ('room_finished', 'room_deleted')
      AND room_row.status NOT IN ('ended', 'cancelled') THEN
      UPDATE public.live_rooms rooms
      SET status = 'ended', revision = rooms.revision + 1,
          ending_at = coalesce(rooms.ending_at, occurred_at),
          ended_at = occurred_at,
          ended_reason = coalesce(rooms.ended_reason, 'provider_room_finished'),
          host_disconnected_at = NULL, host_grace_expires_at = NULL,
          updated_at = now()
      WHERE rooms.id = room_row.id
      RETURNING * INTO room_row;
      UPDATE public.live_room_participants participants
      SET status = CASE WHEN participants.status = 'removed' THEN 'removed' ELSE 'left' END,
          left_at = CASE WHEN participants.status = 'removed' THEN participants.left_at ELSE coalesce(participants.left_at, occurred_at) END,
          provider_left_at = coalesce(participants.provider_left_at, occurred_at),
          revision = participants.revision + 1,
          token_version = participants.token_version + 1,
          provider_identity = participants.user_id::text,
          updated_at = now()
      WHERE participants.room_id = room_row.id AND participants.status = 'joined';
    ELSIF clean_event_type IN ('participant_joined', 'participant_connected') THEN
      SELECT * INTO participant_row
      FROM public.live_room_participants participants
      WHERE participants.room_id = room_row.id
        AND participants.provider_identity = clean_identity
      FOR UPDATE;
      IF FOUND
        AND participant_row.status = 'joined'
        AND (event_token_version IS NULL OR event_token_version = participant_row.token_version) THEN
        UPDATE public.live_room_participants participants
        SET provider_joined_at = greatest(coalesce(participants.provider_joined_at, occurred_at), occurred_at),
            provider_left_at = NULL,
            updated_at = now()
        WHERE participants.id = participant_row.id;
      ELSE
        removal_operation := private.enqueue_shado_live_provider_operation(
          room_row.id,
          NULL,
          CASE WHEN FOUND THEN participant_row.user_id ELSE NULL END,
          'remove_participant',
          generated_key,
          room_row.revision,
          jsonb_build_object(
            'participantIdentity', clean_identity,
            'reason', 'stale_or_unauthorized_identity',
            'providerEventId', clean_event_id
          )
        );
      END IF;
    ELSIF clean_event_type IN ('participant_left', 'participant_disconnected') THEN
      SELECT * INTO participant_row
      FROM public.live_room_participants participants
      WHERE participants.room_id = room_row.id
        AND participants.provider_identity = clean_identity
      FOR UPDATE;
      IF FOUND
        AND (event_token_version IS NULL OR event_token_version = participant_row.token_version) THEN
        UPDATE public.live_room_participants participants
        SET provider_left_at = greatest(coalesce(participants.provider_left_at, occurred_at), occurred_at),
            updated_at = now()
        WHERE participants.id = participant_row.id;
        IF participant_row.role = 'host'
          AND room_row.status = 'live'
          AND occurred_at >= coalesce(participant_row.provider_joined_at, participant_row.joined_at) THEN
          UPDATE public.live_rooms rooms
          SET host_disconnected_at = occurred_at,
              host_grace_expires_at = occurred_at + interval '60 seconds',
              revision = rooms.revision + 1,
              updated_at = now()
          WHERE rooms.id = room_row.id
          RETURNING * INTO room_row;
          removal_operation := private.enqueue_shado_live_provider_operation(
            room_row.id, NULL, NULL, 'delete_room', generated_key,
            room_row.revision,
            jsonb_build_object('roomName', room_row.provider_room_name, 'reason', 'host_disconnected')
          );
          UPDATE public.live_provider_operations operations
          SET available_at = room_row.host_grace_expires_at, updated_at = now()
          WHERE operations.id = removal_operation.id;
        END IF;
      END IF;
    ELSIF clean_event_type IN ('track_published', 'track_started') THEN
      SELECT * INTO participant_row
      FROM public.live_room_participants participants
      WHERE participants.room_id = room_row.id
        AND participants.provider_identity = clean_identity;
      IF NOT FOUND
        OR participant_row.status <> 'joined'
        OR (event_token_version IS NOT NULL AND event_token_version <> participant_row.token_version)
        OR participant_row.role = 'listener'
        OR coalesce(event_payload ->> 'source', '') <> 'microphone' THEN
        removal_operation := private.enqueue_shado_live_provider_operation(
          room_row.id,
          NULL,
          CASE WHEN FOUND THEN participant_row.user_id ELSE NULL END,
          'remove_participant',
          generated_key,
          room_row.revision,
          jsonb_build_object(
            'participantIdentity', clean_identity,
            'reason', 'audio_only_policy_violation',
            'providerEventId', clean_event_id
          )
        );
        INSERT INTO public.live_room_events (
          room_id, target_user_id, event_type, room_revision, metadata
        ) VALUES (
          room_row.id,
          CASE WHEN FOUND THEN participant_row.user_id ELSE NULL END,
          'provider_policy_violation',
          room_row.revision,
          jsonb_build_object(
            'providerEventId', clean_event_id,
            'providerOperationId', removal_operation.id,
            'source', event_payload ->> 'source'
          )
        );
      END IF;
    END IF;

    INSERT INTO public.live_room_events (
      room_id, target_user_id, event_type, room_revision, metadata
    ) VALUES (
      room_row.id,
      participant_row.user_id,
      'provider_webhook_received',
      room_row.revision,
      jsonb_build_object('providerEventId', clean_event_id, 'providerEventType', clean_event_type)
    );
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'eventId', clean_event_id,
    'duplicate', false,
    'applied', room_row.id IS NOT NULL,
    'roomId', room_row.id,
    'roomRevision', room_row.revision,
    'providerOperationId', removal_operation.id
  ));
END;
$$;

CREATE FUNCTION shado_live_private.shado_live_set_access_mode_impl(
  actor_user_id uuid,
  target_access_mode text,
  target_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_reason text := trim(coalesce(target_reason, ''));
  normalized_access_mode text := lower(trim(coalesce(target_access_mode, '')));
  target_enabled boolean := lower(trim(coalesce(target_access_mode, ''))) <> 'disabled';
  state_row public.shado_live_system_state%ROWTYPE;
  room_row public.live_rooms%ROWTYPE;
  operation_row public.live_provider_operations%ROWTYPE;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Full admin access required';
  END IF;
  IF normalized_access_mode NOT IN ('disabled', 'allowlist', 'enabled')
    OR char_length(normalized_reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A valid access mode and bounded reason are required';
  END IF;

  UPDATE public.shado_live_system_state state
  SET enabled = target_enabled,
      access_mode = normalized_access_mode,
      reason = normalized_reason,
      revision = state.revision + 1,
      updated_by = actor_user_id,
      updated_at = now()
  WHERE state.singleton
  RETURNING * INTO state_row;

  IF NOT target_enabled THEN
    FOR room_row IN
      UPDATE public.live_rooms rooms
      SET status = 'ending',
          revision = rooms.revision + 1,
          ending_at = coalesce(rooms.ending_at, now()),
          ended_reason = 'emergency_shutdown',
          host_disconnected_at = NULL,
          host_grace_expires_at = NULL,
          updated_at = now()
      WHERE rooms.status IN ('scheduled', 'green_room', 'live')
      RETURNING *
    LOOP
      operation_row := private.enqueue_shado_live_provider_operation(
        room_row.id, actor_user_id, NULL, 'delete_room', gen_random_uuid(),
        room_row.revision,
        jsonb_build_object('roomName', room_row.provider_room_name, 'reason', 'emergency_shutdown')
      );
      INSERT INTO public.live_room_events (
        room_id, actor_user_id, event_type, room_revision, metadata
      ) VALUES (
        room_row.id, actor_user_id, 'room_ending', room_row.revision,
        jsonb_build_object('reason', 'emergency_shutdown', 'providerOperationId', operation_row.id)
      );
    END LOOP;
  END IF;

  INSERT INTO public.live_room_events (
    actor_user_id, event_type, metadata
  ) VALUES (
    actor_user_id,
    'system_changed',
    jsonb_build_object(
      'enabled', state_row.enabled,
      'accessMode', state_row.access_mode,
      'revision', state_row.revision,
      'reason', state_row.reason
    )
  );

  RETURN jsonb_build_object(
    'enabled', state_row.enabled,
    'accessMode', state_row.access_mode,
    'revision', state_row.revision,
    'reason', state_row.reason,
    'updatedAt', state_row.updated_at
  );
END;
$$;

CREATE FUNCTION shado_live_private.shado_live_set_system_enabled_impl(
  actor_user_id uuid,
  target_enabled boolean,
  target_reason text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT shado_live_private.shado_live_set_access_mode_impl(
    actor_user_id,
    CASE
      WHEN target_enabled IS NULL THEN NULL
      WHEN target_enabled THEN 'enabled'
      ELSE 'disabled'
    END,
    target_reason
  );
$$;

CREATE FUNCTION shado_live_private.shado_live_set_access_member_impl(
  actor_user_id uuid,
  target_user_id uuid,
  target_enabled boolean,
  target_expires_at timestamptz,
  target_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_reason text := trim(coalesce(target_reason, ''));
  member_row public.shado_live_access_members%ROWTYPE;
  changed boolean := false;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Full admin access required';
  END IF;
  IF target_user_id IS NULL OR target_enabled IS NULL
    OR char_length(normalized_reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Target, enabled state, and a bounded reason are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users users WHERE users.id = target_user_id) THEN
    RAISE EXCEPTION 'Member is unavailable';
  END IF;
  IF target_enabled AND target_expires_at IS NOT NULL AND target_expires_at <= now() THEN
    RAISE EXCEPTION 'Allowlist expiry must be in the future';
  END IF;

  SELECT * INTO member_row
  FROM public.shado_live_access_members members
  WHERE members.user_id = target_user_id
  FOR UPDATE;

  IF target_enabled THEN
    INSERT INTO public.shado_live_access_members (
      user_id, added_by, reason, expires_at
    ) VALUES (
      target_user_id, actor_user_id, normalized_reason, target_expires_at
    )
    ON CONFLICT ON CONSTRAINT shado_live_access_members_pkey DO UPDATE
    SET added_by = excluded.added_by,
        reason = excluded.reason,
        expires_at = excluded.expires_at,
        revoked_at = NULL,
        revision = public.shado_live_access_members.revision + 1,
        updated_at = now()
    RETURNING * INTO member_row;
    changed := true;
  ELSIF FOUND AND member_row.revoked_at IS NULL THEN
    UPDATE public.shado_live_access_members members
    SET revoked_at = now(),
        reason = normalized_reason,
        revision = members.revision + 1,
        updated_at = now()
    WHERE members.user_id = target_user_id
    RETURNING * INTO member_row;
    changed := true;
  END IF;

  INSERT INTO public.live_room_events (
    actor_user_id, target_user_id, event_type, metadata
  ) VALUES (
    actor_user_id, target_user_id, 'system_changed',
    jsonb_build_object(
      'accessMemberEnabled', target_enabled,
      'changed', changed,
      'revision', member_row.revision,
      'expiresAt', member_row.expires_at
    )
  );

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'userId', target_user_id,
    'enabled', target_enabled AND member_row.revoked_at IS NULL,
    'changed', changed,
    'revision', member_row.revision,
    'expiresAt', member_row.expires_at
  ));
END;
$$;

CREATE FUNCTION shado_live_private.shado_live_set_restriction_impl(
  actor_user_id uuid,
  target_user_id uuid,
  target_scope text,
  target_enabled boolean,
  target_expires_at timestamptz,
  target_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_scope text := lower(trim(coalesce(target_scope, '')));
  normalized_reason text := trim(coalesce(target_reason, ''));
  target_role text;
  restriction_row public.shado_live_restrictions%ROWTYPE;
  participant_row public.live_room_participants%ROWTYPE;
  room_row public.live_rooms%ROWTYPE;
  operation_row public.live_provider_operations%ROWTYPE;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_operator(actor_user_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Operator access required';
  END IF;
  IF target_user_id IS NULL OR target_user_id = actor_user_id THEN
    RAISE EXCEPTION 'A different target member is required';
  END IF;
  IF normalized_scope NOT IN ('host', 'join', 'chat') OR target_enabled IS NULL THEN
    RAISE EXCEPTION 'A valid live restriction scope and state are required';
  END IF;
  IF char_length(normalized_reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A bounded public restriction reason is required';
  END IF;
  IF target_enabled AND target_expires_at IS NOT NULL AND target_expires_at <= now() THEN
    RAISE EXCEPTION 'Restriction expiry must be in the future';
  END IF;

  SELECT roles.role INTO target_role
  FROM public.user_roles roles
  WHERE roles.user_id = target_user_id AND roles.role IN ('admin', 'sub_admin')
  ORDER BY CASE roles.role WHEN 'admin' THEN 0 ELSE 1 END
  LIMIT 1;
  IF target_role = 'admin' THEN RAISE EXCEPTION 'The full admin cannot be restricted'; END IF;
  IF target_role = 'sub_admin' AND NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Only the full admin can restrict a sub-admin';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shado-live-restriction:' || target_user_id::text || ':' || normalized_scope, 0)
  );

  IF target_enabled THEN
    UPDATE public.shado_live_restrictions restrictions
    SET reason = normalized_reason,
        created_by = actor_user_id,
        created_at = now(),
        expires_at = target_expires_at,
        revoked_at = NULL,
        revoked_by = NULL,
        revision = restrictions.revision + 1
    WHERE restrictions.target_user_id = shado_live_set_restriction_impl.target_user_id
      AND restrictions.scope = normalized_scope
      AND restrictions.revoked_at IS NULL
    RETURNING * INTO restriction_row;
    IF NOT FOUND THEN
      INSERT INTO public.shado_live_restrictions (
        target_user_id, scope, reason, created_by, expires_at
      ) VALUES (
        target_user_id, normalized_scope, normalized_reason, actor_user_id, target_expires_at
      ) RETURNING * INTO restriction_row;
    END IF;
  ELSE
    UPDATE public.shado_live_restrictions restrictions
    SET revoked_at = now(), revoked_by = actor_user_id,
        revision = restrictions.revision + 1
    WHERE restrictions.target_user_id = shado_live_set_restriction_impl.target_user_id
      AND restrictions.scope = normalized_scope
      AND restrictions.revoked_at IS NULL
    RETURNING * INTO restriction_row;
  END IF;

  IF target_enabled AND normalized_scope IN ('host', 'join') THEN
    FOR participant_row IN
      SELECT participants.*
      FROM public.live_room_participants participants
      JOIN public.live_rooms rooms ON rooms.id = participants.room_id
      WHERE participants.user_id = target_user_id
        AND participants.status = 'joined'
        AND rooms.status IN ('scheduled', 'green_room', 'live', 'ending')
      FOR UPDATE OF participants
    LOOP
      SELECT * INTO room_row FROM public.live_rooms rooms
      WHERE rooms.id = participant_row.room_id FOR UPDATE;
      IF participant_row.role = 'host' THEN
        UPDATE public.live_rooms rooms
        SET status = 'ending', revision = rooms.revision + 1,
            ending_at = coalesce(rooms.ending_at, now()),
            ended_reason = 'live_restriction',
            host_disconnected_at = NULL, host_grace_expires_at = NULL,
            updated_at = now()
        WHERE rooms.id = room_row.id
        RETURNING * INTO room_row;
        operation_row := private.enqueue_shado_live_provider_operation(
          room_row.id, actor_user_id, target_user_id, 'delete_room', gen_random_uuid(),
          room_row.revision,
          jsonb_build_object('roomName', room_row.provider_room_name, 'reason', 'live_restriction')
        );
      ELSE
        UPDATE public.live_room_participants participants
        SET status = 'removed', revision = participants.revision + 1,
            token_version = participants.token_version + 1,
            provider_identity = participants.user_id::text,
            removed_at = now(), left_at = NULL, removal_reason = 'live_restriction',
            updated_at = now()
        WHERE participants.id = participant_row.id
        RETURNING * INTO participant_row;
        UPDATE public.live_rooms rooms
        SET revision = rooms.revision + 1, updated_at = now()
        WHERE rooms.id = room_row.id RETURNING * INTO room_row;
        operation_row := private.enqueue_shado_live_provider_operation(
          room_row.id, actor_user_id, target_user_id, 'remove_participant', gen_random_uuid(),
          room_row.revision,
          jsonb_build_object('participantIdentity', participant_row.provider_identity, 'reason', 'live_restriction')
        );
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.live_room_events (
    actor_user_id, target_user_id, event_type, metadata
  ) VALUES (
    actor_user_id, target_user_id, 'restriction_changed',
    jsonb_build_object(
      'restrictionId', restriction_row.id,
      'scope', normalized_scope,
      'enabled', target_enabled,
      'revision', restriction_row.revision,
      'expiresAt', restriction_row.expires_at
    )
  );

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'restrictionId', restriction_row.id,
    'targetUserId', target_user_id,
    'scope', normalized_scope,
    'enabled', target_enabled AND restriction_row.revoked_at IS NULL,
    'revision', restriction_row.revision,
    'expiresAt', restriction_row.expires_at
  ));
END;
$$;

CREATE FUNCTION private.reject_shado_live_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', tg_table_name;
END;
$$;

CREATE FUNCTION private.teardown_shado_live_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  room_row public.live_rooms%ROWTYPE;
  participant_row public.live_room_participants%ROWTYPE;
  removed_user_id uuid;
  operation_row public.live_provider_operations%ROWTYPE;
BEGIN
  UPDATE public.live_room_invites invites
  SET status = 'revoked', revision = invites.revision + 1,
      resolved_at = now(), updated_at = now()
  FROM public.live_rooms rooms
  WHERE rooms.id = invites.room_id
    AND invites.status = 'pending'
    AND (
      (rooms.host_user_id = new.blocker_id AND invites.invited_user_id = new.blocked_id)
      OR (rooms.host_user_id = new.blocked_id AND invites.invited_user_id = new.blocker_id)
    );

  UPDATE public.live_room_stage_requests requests
  SET status = 'cancelled', revision = requests.revision + 1,
      resolved_at = now(), updated_at = now()
  FROM public.live_rooms rooms
  WHERE rooms.id = requests.room_id
    AND requests.status = 'raised'
    AND (
      (rooms.host_user_id = new.blocker_id AND requests.user_id = new.blocked_id)
      OR (rooms.host_user_id = new.blocked_id AND requests.user_id = new.blocker_id)
    );

  FOR room_row IN
    SELECT rooms.*
    FROM public.live_rooms rooms
    WHERE rooms.status IN ('scheduled', 'green_room', 'live', 'ending')
      AND EXISTS (
        SELECT 1 FROM public.live_room_participants first_participant
        WHERE first_participant.room_id = rooms.id
          AND first_participant.user_id = new.blocker_id
          AND first_participant.status = 'joined'
      )
      AND EXISTS (
        SELECT 1 FROM public.live_room_participants second_participant
        WHERE second_participant.room_id = rooms.id
          AND second_participant.user_id = new.blocked_id
          AND second_participant.status = 'joined'
      )
    FOR UPDATE
  LOOP
    removed_user_id := CASE
      WHEN room_row.host_user_id = new.blocker_id THEN new.blocked_id
      ELSE new.blocker_id
    END;
    SELECT * INTO participant_row
    FROM public.live_room_participants participants
    WHERE participants.room_id = room_row.id
      AND participants.user_id = removed_user_id
    FOR UPDATE;

    UPDATE public.live_room_participants participants
    SET status = 'removed', revision = participants.revision + 1,
        token_version = participants.token_version + 1,
        provider_identity = participants.user_id::text,
        removed_at = now(), left_at = NULL, removal_reason = 'personal_block',
        updated_at = now()
    WHERE participants.id = participant_row.id
    RETURNING * INTO participant_row;

    UPDATE public.live_rooms rooms
    SET revision = rooms.revision + 1, updated_at = now()
    WHERE rooms.id = room_row.id
    RETURNING * INTO room_row;

    operation_row := private.enqueue_shado_live_provider_operation(
      room_row.id, new.blocker_id, removed_user_id, 'remove_participant', gen_random_uuid(),
      room_row.revision,
      jsonb_build_object('participantIdentity', participant_row.provider_identity, 'reason', 'personal_block')
    );

    INSERT INTO public.live_room_events (
      room_id, target_user_id, event_type, room_revision, metadata
    ) VALUES (
      room_row.id, removed_user_id, 'block_teardown', room_row.revision,
      jsonb_build_object('providerOperationId', operation_row.id)
    );
  END LOOP;

  RETURN new;
END;
$$;

CREATE FUNCTION private.touch_shado_live_room_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_room_id uuid;
  target_revision integer;
BEGIN
  IF tg_table_name = 'live_rooms' THEN
    IF tg_op = 'DELETE' THEN RETURN old; END IF;
    target_room_id := new.id;
    target_revision := new.revision;
  ELSE
    target_room_id := CASE WHEN tg_op = 'DELETE' THEN old.room_id ELSE new.room_id END;
    SELECT rooms.revision INTO target_revision
    FROM public.live_rooms rooms
    WHERE rooms.id = target_room_id;
    IF NOT FOUND THEN
      IF tg_op = 'DELETE' THEN RETURN old; ELSE RETURN new; END IF;
    END IF;
  END IF;

  INSERT INTO public.live_room_signals (room_id, revision)
  VALUES (target_room_id, target_revision)
  ON CONFLICT (room_id) DO UPDATE
  SET revision = excluded.revision,
      sequence = public.live_room_signals.sequence + 1,
      updated_at = clock_timestamp();
  IF tg_op = 'DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END;
$$;

CREATE POLICY live_room_signals_select_visible
  ON public.live_room_signals
  FOR SELECT
  TO authenticated
  USING (shado_live_private.can_receive_shado_live_signal(auth.uid(), room_id));

GRANT SELECT ON TABLE public.live_room_signals TO authenticated, service_role;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_room_signals;

CREATE TRIGGER live_room_events_append_only
  BEFORE UPDATE OR DELETE ON public.live_room_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_shado_live_append_only_mutation();
CREATE TRIGGER live_provider_webhook_receipts_append_only
  BEFORE UPDATE OR DELETE ON public.live_provider_webhook_receipts
  FOR EACH ROW EXECUTE FUNCTION private.reject_shado_live_append_only_mutation();
CREATE TRIGGER teardown_shado_live_on_personal_block
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION private.teardown_shado_live_on_block();
CREATE TRIGGER touch_shado_live_room_signal
  AFTER INSERT OR UPDATE ON public.live_rooms
  FOR EACH ROW EXECUTE FUNCTION private.touch_shado_live_room_signal();
CREATE TRIGGER touch_shado_live_participant_signal
  AFTER INSERT OR UPDATE OR DELETE ON public.live_room_participants
  FOR EACH ROW EXECUTE FUNCTION private.touch_shado_live_room_signal();
CREATE TRIGGER touch_shado_live_stage_signal
  AFTER INSERT OR UPDATE OR DELETE ON public.live_room_stage_requests
  FOR EACH ROW EXECUTE FUNCTION private.touch_shado_live_room_signal();
CREATE TRIGGER touch_shado_live_message_signal
  AFTER INSERT OR UPDATE OR DELETE ON public.live_room_messages
  FOR EACH ROW EXECUTE FUNCTION private.touch_shado_live_room_signal();

CREATE FUNCTION public.list_my_shado_live_rooms(result_limit integer DEFAULT 30)
RETURNS TABLE (
  room_id uuid,
  title text,
  status text,
  host jsonb,
  listener_count integer,
  speaker_count integer,
  caller_role text,
  revision integer,
  scheduled_at timestamptz,
  started_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM shado_live_private.list_my_shado_live_rooms_impl(result_limit);
$$;

CREATE FUNCTION public.get_my_shado_live_room(target_room_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.get_my_shado_live_room_impl(target_room_id);
$$;

CREATE FUNCTION public.list_my_shado_live_messages(
  target_room_id uuid,
  result_limit integer DEFAULT 50,
  before_created_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  message_id uuid,
  sender jsonb,
  body text,
  revision integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM shado_live_private.list_my_shado_live_messages_impl(
    target_room_id, result_limit, before_created_at, before_id
  );
$$;

CREATE FUNCTION public.send_my_shado_live_message(
  target_room_id uuid,
  message_body text,
  client_message_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.send_my_shado_live_message_impl(
    target_room_id, message_body, client_message_id
  );
$$;

CREATE FUNCTION public.mutate_my_shado_live_stage_request(
  target_room_id uuid,
  target_action text,
  client_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.mutate_my_shado_live_stage_request_impl(
    target_room_id, target_action, client_request_id
  );
$$;

CREATE FUNCTION public.shado_live_prepare_session(
  p_actor_user_id uuid,
  p_action text,
  p_room_id uuid,
  p_idempotency_key uuid,
  p_request jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  receipt jsonb;
  normalized_provider_operation text;
  operation_id uuid;
BEGIN
  receipt := shado_live_private.shado_live_prepare_session_impl(
    p_actor_user_id, p_action, p_room_id, p_idempotency_key, p_request
  );
  operation_id := nullif(receipt ->> 'providerOperationId', '')::uuid;
  normalized_provider_operation := CASE
    WHEN operation_id IS NULL THEN 'none'
    WHEN receipt ->> 'providerOperationType' = 'create_room' THEN 'create_room'
    WHEN receipt ->> 'providerOperationType' = 'delete_room' THEN 'delete_room'
    WHEN receipt ->> 'providerOperationType' = 'remove_participant' THEN 'remove_participant'
    ELSE 'none'
  END;

  IF normalized_provider_operation <> 'none' AND operation_id IS NULL THEN
    RAISE EXCEPTION 'Provider operation receipt is missing its operation id';
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'room_id', nullif(receipt ->> 'roomId', '')::uuid,
    'room_version', nullif(receipt ->> 'roomRevision', '')::integer,
    'room_state', receipt ->> 'roomStatus',
    'provider_room_name', receipt ->> 'roomName',
    'participant_id', nullif(receipt ->> 'participantId', '')::uuid,
    'participant_user_id', nullif(receipt ->> 'participantIdentity', '')::uuid,
    'participant_role', receipt ->> 'role',
    'token_version', nullif(receipt ->> 'tokenVersion', '')::integer,
    'target_user_id', CASE
      WHEN lower(receipt ->> 'action') = 'leave'
        AND normalized_provider_operation = 'remove_participant'
        THEN p_actor_user_id
      ELSE NULL
    END,
    'provider_can_publish', CASE
      WHEN receipt ? 'canPublish' THEN (receipt ->> 'canPublish')::boolean
      ELSE NULL
    END,
    'room_title', receipt ->> 'roomTitle',
    'room_description', receipt ->> 'roomDescription',
    'max_participants', CASE WHEN normalized_provider_operation = 'create_room' THEN 104 ELSE NULL END,
    'empty_timeout_seconds', CASE WHEN normalized_provider_operation = 'create_room' THEN 60 ELSE NULL END,
    'provider_operation', normalized_provider_operation,
    'response', coalesce(shado_live_private.get_shado_live_room_for_actor_impl(
      p_actor_user_id, nullif(receipt ->> 'roomId', '')::uuid
    ), '{}'::jsonb),
    'receipt', receipt
  )) || jsonb_build_object('operation_id', operation_id);
END;
$$;

CREATE FUNCTION public.shado_live_prepare_command(
  p_actor_user_id uuid,
  p_action text,
  p_room_id uuid,
  p_target_user_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_request jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  receipt jsonb;
  normalized_command text := lower(trim(coalesce(p_action, '')));
  normalized_provider_operation text;
  operation_id uuid;
  target_role text;
  target_muted boolean;
BEGIN
  receipt := shado_live_private.shado_live_prepare_command_impl(
    p_actor_user_id, p_action, p_room_id, p_target_user_id,
    p_expected_version, p_idempotency_key, p_request
  );
  operation_id := nullif(receipt ->> 'providerOperationId', '')::uuid;
  normalized_provider_operation := CASE
    WHEN operation_id IS NULL THEN 'none'
    WHEN normalized_command IN ('promote', 'demote', 'mute') THEN 'update_participant'
    WHEN normalized_command = 'remove' THEN 'remove_participant'
    WHEN normalized_command = 'end' THEN 'delete_room'
    ELSE 'none'
  END;
  target_role := receipt ->> 'role';
  target_muted := CASE
    WHEN receipt ? 'hostMuted' THEN (receipt ->> 'hostMuted')::boolean
    ELSE false
  END;

  IF normalized_provider_operation <> 'none' AND operation_id IS NULL THEN
    RAISE EXCEPTION 'Provider operation receipt is missing its operation id';
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'room_id', nullif(receipt ->> 'roomId', '')::uuid,
    'room_version', nullif(receipt ->> 'roomRevision', '')::integer,
    'room_state', receipt ->> 'roomStatus',
    'provider_room_name', receipt ->> 'roomName',
    'participant_id', nullif(receipt ->> 'participantId', '')::uuid,
    'participant_user_id', nullif(receipt ->> 'participantIdentity', '')::uuid,
    'participant_role', target_role,
    'token_version', nullif(receipt ->> 'tokenVersion', '')::integer,
    'target_user_id', p_target_user_id,
    'target_role', target_role,
    'provider_can_publish', CASE
      WHEN normalized_provider_operation = 'update_participant'
        THEN target_role IN ('host', 'speaker') AND NOT target_muted
      ELSE NULL
    END,
    'room_title', receipt ->> 'roomTitle',
    'room_description', receipt ->> 'roomDescription',
    'provider_operation', normalized_provider_operation,
    'response', coalesce(shado_live_private.get_shado_live_room_for_actor_impl(
      p_actor_user_id, nullif(receipt ->> 'roomId', '')::uuid
    ), '{}'::jsonb),
    'receipt', receipt
  )) || jsonb_build_object('operation_id', operation_id);
END;
$$;

CREATE FUNCTION public.shado_live_claim_provider_operations(
  p_actor_user_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  operation_id uuid,
  room_id uuid,
  room_version integer,
  provider_operation text,
  target_user_id uuid,
  target_role text,
  token_version integer,
  provider_can_publish boolean,
  request_payload jsonb,
  attempt_count integer,
  lease_expires_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM shado_live_private.shado_live_claim_provider_operations_impl(p_actor_user_id, p_limit);
$$;

CREATE FUNCTION public.shado_live_complete_provider_operation(
  p_operation_id uuid,
  p_operation_status text,
  p_provider_payload jsonb DEFAULT '{}'::jsonb,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  receipt jsonb;
BEGIN
  receipt := shado_live_private.shado_live_complete_provider_operation_impl(
    p_operation_id, p_operation_status, p_provider_payload,
    p_error_code, p_error_message
  );
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'operation_id', nullif(receipt ->> 'operationId', '')::uuid,
    'status', receipt ->> 'status',
    'attempt_count', nullif(receipt ->> 'attemptCount', '')::integer,
    'room_id', nullif(receipt ->> 'roomId', '')::uuid,
    'room_version', nullif(receipt ->> 'roomRevision', '')::integer,
    'duplicate', coalesce((receipt ->> 'duplicate')::boolean, false),
    'response', receipt
  ));
END;
$$;

CREATE FUNCTION public.shado_live_ingest_provider_webhook(
  p_event_id text,
  p_event_type text,
  p_room_id uuid,
  p_room_name text,
  p_participant_user_id uuid,
  p_occurred_at timestamptz,
  p_provider_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  receipt jsonb;
BEGIN
  receipt := shado_live_private.shado_live_ingest_provider_webhook_impl(
    p_event_id, p_event_type, p_room_id, p_room_name,
    p_participant_user_id, p_occurred_at, p_provider_payload
  );
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'event_id', receipt ->> 'eventId',
    'duplicate', coalesce((receipt ->> 'duplicate')::boolean, false),
    'applied', coalesce((receipt ->> 'applied')::boolean, false),
    'room_id', nullif(receipt ->> 'roomId', '')::uuid,
    'response', receipt
  ));
END;
$$;

CREATE FUNCTION public.shado_live_set_system_enabled(
  p_actor_user_id uuid,
  p_enabled boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.shado_live_set_system_enabled_impl(
    p_actor_user_id, p_enabled, p_reason
  );
$$;

CREATE FUNCTION public.shado_live_set_access_mode(
  p_actor_user_id uuid,
  p_access_mode text,
  p_reason text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.shado_live_set_access_mode_impl(
    p_actor_user_id, p_access_mode, p_reason
  );
$$;

CREATE FUNCTION public.shado_live_set_access_member(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_enabled boolean,
  p_expires_at timestamptz,
  p_reason text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.shado_live_set_access_member_impl(
    p_actor_user_id, p_target_user_id, p_enabled, p_expires_at, p_reason
  );
$$;

CREATE FUNCTION public.shado_live_set_restriction(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_scope text,
  p_enabled boolean,
  p_expires_at timestamptz,
  p_reason text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.shado_live_set_restriction_impl(
    p_actor_user_id, p_target_user_id, p_scope,
    p_enabled, p_expires_at, p_reason
  );
$$;

REVOKE ALL ON FUNCTION shado_live_private.list_my_shado_live_rooms_impl(integer),
  shado_live_private.get_my_shado_live_room_impl(uuid),
  shado_live_private.list_my_shado_live_messages_impl(uuid, integer, timestamptz, uuid),
  shado_live_private.send_my_shado_live_message_impl(uuid, text, uuid),
  shado_live_private.mutate_my_shado_live_stage_request_impl(uuid, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.list_my_shado_live_rooms_impl(integer),
  shado_live_private.get_my_shado_live_room_impl(uuid),
  shado_live_private.list_my_shado_live_messages_impl(uuid, integer, timestamptz, uuid),
  shado_live_private.send_my_shado_live_message_impl(uuid, text, uuid),
  shado_live_private.mutate_my_shado_live_stage_request_impl(uuid, text, uuid)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION shado_live_private.can_access_shado_live_room(uuid, uuid),
  shado_live_private.can_receive_shado_live_signal(uuid, uuid),
  shado_live_private.get_shado_live_room_for_actor_impl(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.can_access_shado_live_room(uuid, uuid),
  shado_live_private.can_receive_shado_live_signal(uuid, uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.get_shado_live_room_for_actor_impl(uuid, uuid)
TO service_role;

REVOKE ALL ON FUNCTION shado_live_private.shado_live_prepare_session_impl(uuid, text, uuid, uuid, jsonb),
  shado_live_private.shado_live_prepare_command_impl(uuid, text, uuid, uuid, integer, uuid, jsonb),
  shado_live_private.shado_live_claim_provider_operations_impl(uuid, integer),
  shado_live_private.shado_live_complete_provider_operation_impl(uuid, text, jsonb, text, text),
  shado_live_private.shado_live_ingest_provider_webhook_impl(text, text, uuid, text, uuid, timestamptz, jsonb),
  shado_live_private.shado_live_set_access_member_impl(uuid, uuid, boolean, timestamptz, text),
  shado_live_private.shado_live_set_access_mode_impl(uuid, text, text),
  shado_live_private.shado_live_set_system_enabled_impl(uuid, boolean, text),
  shado_live_private.shado_live_set_restriction_impl(uuid, uuid, text, boolean, timestamptz, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION shado_live_private.shado_live_prepare_session_impl(uuid, text, uuid, uuid, jsonb),
  shado_live_private.shado_live_prepare_command_impl(uuid, text, uuid, uuid, integer, uuid, jsonb),
  shado_live_private.shado_live_claim_provider_operations_impl(uuid, integer),
  shado_live_private.shado_live_complete_provider_operation_impl(uuid, text, jsonb, text, text),
  shado_live_private.shado_live_ingest_provider_webhook_impl(text, text, uuid, text, uuid, timestamptz, jsonb),
  shado_live_private.shado_live_set_access_member_impl(uuid, uuid, boolean, timestamptz, text),
  shado_live_private.shado_live_set_access_mode_impl(uuid, text, text),
  shado_live_private.shado_live_set_system_enabled_impl(uuid, boolean, text),
  shado_live_private.shado_live_set_restriction_impl(uuid, uuid, text, boolean, timestamptz, text)
TO service_role;

REVOKE ALL ON FUNCTION private.reject_shado_live_append_only_mutation(),
  private.teardown_shado_live_on_block(),
  private.touch_shado_live_room_signal()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_my_shado_live_rooms(integer),
  public.get_my_shado_live_room(uuid),
  public.list_my_shado_live_messages(uuid, integer, timestamptz, uuid),
  public.send_my_shado_live_message(uuid, text, uuid),
  public.mutate_my_shado_live_stage_request(uuid, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_shado_live_rooms(integer),
  public.get_my_shado_live_room(uuid),
  public.list_my_shado_live_messages(uuid, integer, timestamptz, uuid),
  public.send_my_shado_live_message(uuid, text, uuid),
  public.mutate_my_shado_live_stage_request(uuid, text, uuid)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.shado_live_prepare_session(uuid, text, uuid, uuid, jsonb),
  public.shado_live_prepare_command(uuid, text, uuid, uuid, integer, uuid, jsonb),
  public.shado_live_claim_provider_operations(uuid, integer),
  public.shado_live_complete_provider_operation(uuid, text, jsonb, text, text),
  public.shado_live_ingest_provider_webhook(text, text, uuid, text, uuid, timestamptz, jsonb),
  public.shado_live_set_access_member(uuid, uuid, boolean, timestamptz, text),
  public.shado_live_set_access_mode(uuid, text, text),
  public.shado_live_set_system_enabled(uuid, boolean, text),
  public.shado_live_set_restriction(uuid, uuid, text, boolean, timestamptz, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shado_live_prepare_session(uuid, text, uuid, uuid, jsonb),
  public.shado_live_prepare_command(uuid, text, uuid, uuid, integer, uuid, jsonb),
  public.shado_live_claim_provider_operations(uuid, integer),
  public.shado_live_complete_provider_operation(uuid, text, jsonb, text, text),
  public.shado_live_ingest_provider_webhook(text, text, uuid, text, uuid, timestamptz, jsonb),
  public.shado_live_set_access_member(uuid, uuid, boolean, timestamptz, text),
  public.shado_live_set_access_mode(uuid, text, text),
  public.shado_live_set_system_enabled(uuid, boolean, text),
  public.shado_live_set_restriction(uuid, uuid, text, boolean, timestamptz, text)
TO service_role;

COMMIT;
