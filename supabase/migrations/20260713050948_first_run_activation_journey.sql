/*
  # First-run activation journey

  Enroll only genuine invite signups created after this migration, preserve the
  journey as owner-private state, and let canonical product actions complete the
  final core step. Existing users are intentionally not backfilled.
*/

CREATE TABLE private.activation_rollouts (
  rollout_key text PRIMARY KEY,
  started_at timestamptz NOT NULL
);

ALTER TABLE private.activation_rollouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.activation_rollouts FROM PUBLIC, anon, authenticated;

INSERT INTO private.activation_rollouts (rollout_key, started_at)
VALUES ('first_run_activation_v1', clock_timestamp());

CREATE TABLE public.user_activation_journeys (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  enrollment_source text NOT NULL DEFAULT 'invite_signup'
    CHECK (enrollment_source = 'invite_signup'),
  identity_completed_at timestamptz,
  preferences_completed_at timestamptz,
  notification_choice text
    CHECK (
      notification_choice IS NULL OR notification_choice IN (
        'notifications_enabled',
        'notifications_later',
        'notifications_denied',
        'notifications_unsupported'
      )
    ),
  comfort_reviewed_at timestamptz,
  selected_first_action_kind text
    CHECK (
      selected_first_action_kind IS NULL OR selected_first_action_kind IN (
        'group_message',
        'direct_message',
        'shadow_pin_heart'
      )
    ),
  first_action_kind text
    CHECK (
      first_action_kind IS NULL OR first_action_kind IN (
        'group_message',
        'direct_message',
        'shadow_pin_heart'
      )
    ),
  first_action_id uuid,
  first_action_completed_at timestamptz,
  install_choice text
    CHECK (install_choice IS NULL OR install_choice IN ('installed', 'later', 'unsupported')),
  install_completed_at timestamptz,
  presentation_state text NOT NULL DEFAULT 'expanded'
    CHECK (presentation_state IN ('expanded', 'minimized')),
  dismissed_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  current_step text GENERATED ALWAYS AS (
    CASE
      WHEN completed_at IS NOT NULL THEN 'complete'
      WHEN identity_completed_at IS NULL THEN 'identity'
      WHEN preferences_completed_at IS NULL THEN 'preferences'
      WHEN first_action_completed_at IS NULL THEN 'first_action'
      ELSE 'complete'
    END
  ) STORED,
  CONSTRAINT user_activation_journeys_preferences_coherent_check
    CHECK (
      (preferences_completed_at IS NULL AND notification_choice IS NULL AND comfort_reviewed_at IS NULL)
      OR
      (preferences_completed_at IS NOT NULL AND notification_choice IS NOT NULL AND comfort_reviewed_at IS NOT NULL)
    ),
  CONSTRAINT user_activation_journeys_first_action_coherent_check
    CHECK (
      (first_action_completed_at IS NULL AND first_action_kind IS NULL AND first_action_id IS NULL)
      OR
      (
        first_action_completed_at IS NOT NULL
        AND first_action_kind IS NOT NULL
        AND first_action_id IS NOT NULL
        AND first_action_kind = selected_first_action_kind
      )
    ),
  CONSTRAINT user_activation_journeys_install_coherent_check
    CHECK (
      (install_completed_at IS NULL AND install_choice IS NULL)
      OR
      (install_completed_at IS NOT NULL AND install_choice IS NOT NULL)
    ),
  CONSTRAINT user_activation_journeys_completion_requires_core_steps_check
    CHECK (
      completed_at IS NULL OR (
        identity_completed_at IS NOT NULL
        AND preferences_completed_at IS NOT NULL
        AND first_action_completed_at IS NOT NULL
      )
    ),
  CONSTRAINT user_activation_journeys_presentation_coherent_check
    CHECK (
      (presentation_state = 'expanded' AND dismissed_at IS NULL)
      OR
      (presentation_state = 'minimized' AND dismissed_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.user_activation_journeys IS
  'Owner-private, resumable first-run state for invite signups enrolled after the activation-v1 rollout.';
COMMENT ON COLUMN public.user_activation_journeys.install_completed_at IS
  'When the optional install choice was resolved; it does not gate core journey completion.';
COMMENT ON COLUMN public.user_activation_journeys.comfort_reviewed_at IS
  'Records that device-local comfort controls were reviewed; it does not synchronize their values.';

ALTER TABLE public.user_activation_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activation_journeys FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_activation_journeys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_activation_journeys TO authenticated;

CREATE POLICY user_activation_journeys_owner_select
ON public.user_activation_journeys
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION private.enroll_invite_user_activation_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rollout_started_at timestamptz;
BEGIN
  SELECT rollout.started_at
  INTO rollout_started_at
  FROM private.activation_rollouts rollout
  WHERE rollout.rollout_key = 'first_run_activation_v1';

  IF rollout_started_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users auth_user
    JOIN private.signup_invite_redemptions redemption
      ON redemption.redeemed_by = auth_user.id
    WHERE auth_user.id = NEW.id
      AND auth_user.created_at >= rollout_started_at
      AND redemption.redeemed_at >= rollout_started_at
  ) THEN
    INSERT INTO public.user_activation_journeys (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enroll_invite_user_activation_journey()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enroll_invite_user_activation_journey ON public.users;
CREATE TRIGGER enroll_invite_user_activation_journey
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.enroll_invite_user_activation_journey();

CREATE OR REPLACE FUNCTION private.capture_activation_first_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  action_payload jsonb := to_jsonb(NEW);
  actor_id uuid;
  action_id uuid;
  action_kind text := TG_ARGV[0];
BEGIN
  actor_id := NULLIF(action_payload ->> TG_ARGV[1], '')::uuid;
  action_id := NULLIF(action_payload ->> TG_ARGV[2], '')::uuid;

  IF actor_id IS NULL OR action_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.user_activation_journeys journey
  SET
    first_action_kind = action_kind,
    first_action_id = action_id,
    first_action_completed_at = clock_timestamp(),
    completed_at = CASE
      WHEN journey.identity_completed_at IS NOT NULL
        AND journey.preferences_completed_at IS NOT NULL
      THEN COALESCE(journey.completed_at, clock_timestamp())
      ELSE journey.completed_at
    END,
    presentation_state = 'expanded',
    dismissed_at = NULL,
    revision = journey.revision + 1,
    updated_at = clock_timestamp()
  WHERE journey.user_id = actor_id
    AND journey.selected_first_action_kind = action_kind
    AND journey.first_action_completed_at IS NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_activation_first_action()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS capture_group_message_activation ON public.messages;
CREATE TRIGGER capture_group_message_activation
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_activation_first_action('group_message', 'user_id', 'id');

DROP TRIGGER IF EXISTS capture_direct_message_activation ON public.dm_messages;
CREATE TRIGGER capture_direct_message_activation
  AFTER INSERT ON public.dm_messages
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_activation_first_action('direct_message', 'sender_id', 'id');

DROP TRIGGER IF EXISTS capture_shadow_pin_heart_activation ON public.shadow_pin_image_hearts;
CREATE TRIGGER capture_shadow_pin_heart_activation
  AFTER INSERT ON public.shadow_pin_image_hearts
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_activation_first_action('shadow_pin_heart', 'user_id', 'image_id');

CREATE OR REPLACE FUNCTION public.get_my_activation_journey()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT to_jsonb(journey)
  FROM public.user_activation_journeys journey
  WHERE journey.user_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_my_activation_journey() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_activation_journey() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_activation_journey(
  target_expected_revision integer,
  target_step text,
  target_choice text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  current_journey public.user_activation_journeys%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT journey.*
  INTO current_journey
  FROM public.user_activation_journeys journey
  WHERE journey.user_id = caller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activation journey not enrolled' USING ERRCODE = 'P0002';
  END IF;

  IF current_journey.revision IS DISTINCT FROM target_expected_revision THEN
    RAISE EXCEPTION 'Activation journey changed on another device' USING ERRCODE = '40001';
  END IF;

  CASE target_step
    WHEN 'identity' THEN
      IF target_choice IS NOT NULL THEN
        RAISE EXCEPTION 'Identity step does not accept a choice';
      END IF;

      IF current_journey.identity_completed_at IS NULL THEN
        UPDATE public.user_activation_journeys journey
        SET
          identity_completed_at = clock_timestamp(),
          completed_at = CASE
            WHEN journey.preferences_completed_at IS NOT NULL
              AND journey.first_action_completed_at IS NOT NULL
            THEN COALESCE(journey.completed_at, clock_timestamp())
            ELSE journey.completed_at
          END,
          revision = journey.revision + 1,
          updated_at = clock_timestamp()
        WHERE journey.user_id = caller_id;
      END IF;

    WHEN 'preferences' THEN
      IF target_choice IS NULL OR target_choice NOT IN (
        'notifications_enabled',
        'notifications_later',
        'notifications_denied',
        'notifications_unsupported'
      ) THEN
        RAISE EXCEPTION 'Unsupported notification choice';
      END IF;

      IF current_journey.preferences_completed_at IS NULL
        OR current_journey.notification_choice IS DISTINCT FROM target_choice
      THEN
        UPDATE public.user_activation_journeys journey
        SET
          preferences_completed_at = COALESCE(journey.preferences_completed_at, clock_timestamp()),
          notification_choice = target_choice,
          comfort_reviewed_at = COALESCE(journey.comfort_reviewed_at, clock_timestamp()),
          completed_at = CASE
            WHEN journey.identity_completed_at IS NOT NULL
              AND journey.first_action_completed_at IS NOT NULL
            THEN COALESCE(journey.completed_at, clock_timestamp())
            ELSE journey.completed_at
          END,
          revision = journey.revision + 1,
          updated_at = clock_timestamp()
        WHERE journey.user_id = caller_id;
      END IF;

    WHEN 'install' THEN
      IF target_choice IS NULL OR target_choice NOT IN ('installed', 'later', 'unsupported') THEN
        RAISE EXCEPTION 'Unsupported install choice';
      END IF;

      IF current_journey.install_completed_at IS NULL
        OR current_journey.install_choice IS DISTINCT FROM target_choice
      THEN
        UPDATE public.user_activation_journeys journey
        SET
          install_choice = target_choice,
          install_completed_at = COALESCE(journey.install_completed_at, clock_timestamp()),
          revision = journey.revision + 1,
          updated_at = clock_timestamp()
        WHERE journey.user_id = caller_id;
      END IF;

    WHEN 'first_action' THEN
      IF target_choice IS NULL OR target_choice NOT IN (
        'group_message',
        'direct_message',
        'shadow_pin_heart'
      ) THEN
        RAISE EXCEPTION 'Unsupported first action choice';
      END IF;

      IF current_journey.identity_completed_at IS NULL
        OR current_journey.preferences_completed_at IS NULL
      THEN
        RAISE EXCEPTION 'Identity and preferences must be completed before selecting a first action';
      END IF;

      IF current_journey.first_action_completed_at IS NOT NULL
        AND current_journey.selected_first_action_kind IS DISTINCT FROM target_choice
      THEN
        RAISE EXCEPTION 'Completed first action cannot be changed';
      END IF;

      IF current_journey.selected_first_action_kind IS DISTINCT FROM target_choice THEN
        UPDATE public.user_activation_journeys journey
        SET
          selected_first_action_kind = target_choice,
          revision = journey.revision + 1,
          updated_at = clock_timestamp()
        WHERE journey.user_id = caller_id;
      END IF;

    WHEN 'presentation' THEN
      IF target_choice IS NULL OR target_choice NOT IN ('expanded', 'minimized') THEN
        RAISE EXCEPTION 'Unsupported presentation choice';
      END IF;

      IF current_journey.presentation_state IS DISTINCT FROM target_choice THEN
        UPDATE public.user_activation_journeys journey
        SET
          presentation_state = target_choice,
          dismissed_at = CASE
            WHEN target_choice = 'minimized' THEN clock_timestamp()
            ELSE NULL
          END,
          revision = journey.revision + 1,
          updated_at = clock_timestamp()
        WHERE journey.user_id = caller_id;
      END IF;

    ELSE
      RAISE EXCEPTION 'Unsupported activation step';
  END CASE;

  SELECT journey.*
  INTO current_journey
  FROM public.user_activation_journeys journey
  WHERE journey.user_id = caller_id;

  RETURN to_jsonb(current_journey);
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_activation_journey(integer, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_activation_journey(integer, text, text)
  TO authenticated;
