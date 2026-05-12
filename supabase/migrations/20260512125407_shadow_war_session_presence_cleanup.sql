/*
  # Shadow War session presence cleanup

  Tracks which active players are currently inside a Shadow War duel and uses
  that heartbeat to keep the public lobby free of abandoned waiting/active
  sessions. Sessions are cancelled rather than hard-deleted so match/debug
  history remains available for later admin tooling.
*/

CREATE TABLE IF NOT EXISTS public.game_session_presence (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS game_session_presence_recent_idx
  ON public.game_session_presence (session_id, last_seen_at DESC);

ALTER TABLE public.game_session_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read recent game session presence" ON public.game_session_presence;
CREATE POLICY "Authenticated users can read recent game session presence"
ON public.game_session_presence
FOR SELECT
TO authenticated
USING (
  last_seen_at > now() - interval '2 minutes'
  AND EXISTS (
    SELECT 1
    FROM public.game_sessions sessions
    WHERE sessions.id = game_session_presence.session_id
      AND sessions.game_type = 'shadow_war'
      AND sessions.status IN ('waiting', 'active')
  )
);

CREATE OR REPLACE FUNCTION public.touch_shadow_war_session_presence(target_session_id uuid)
RETURNS public.game_session_presence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  session_row public.game_sessions%ROWTYPE;
  presence_row public.game_session_presence%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO session_row
  FROM public.game_sessions
  WHERE id = target_session_id
    AND game_type = 'shadow_war'
    AND status IN ('waiting', 'active')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel is not available';
  END IF;

  IF current_user_id <> session_row.player_one_id
    AND (session_row.player_two_id IS NULL OR current_user_id <> session_row.player_two_id) THEN
    RAISE EXCEPTION 'Only active duel players can enter this table';
  END IF;

  INSERT INTO public.game_session_presence (session_id, user_id, last_seen_at)
  VALUES (target_session_id, current_user_id, now())
  ON CONFLICT (session_id, user_id) DO UPDATE
  SET last_seen_at = EXCLUDED.last_seen_at
  RETURNING * INTO presence_row;

  RETURN presence_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_shadow_war_session_presence(target_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.game_session_presence
  WHERE session_id = target_session_id
    AND user_id = current_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_shadow_war_empty_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stale_cutoff timestamptz := now() - interval '2 minutes';
  cancelled_session_ids uuid[];
  cancelled_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.game_session_presence
  WHERE last_seen_at <= stale_cutoff;

  WITH stale_sessions AS (
    SELECT sessions.id
    FROM public.game_sessions sessions
    WHERE sessions.game_type = 'shadow_war'
      AND sessions.status IN ('waiting', 'active')
      AND sessions.created_at <= stale_cutoff
      AND sessions.updated_at <= stale_cutoff
      AND NOT EXISTS (
        SELECT 1
        FROM public.game_session_presence presence
        WHERE presence.session_id = sessions.id
          AND presence.last_seen_at > stale_cutoff
      )
  ),
  cancelled AS (
    UPDATE public.game_sessions sessions
    SET
      status = 'cancelled',
      completed_at = COALESCE(sessions.completed_at, now())
    WHERE sessions.id IN (SELECT id FROM stale_sessions)
    RETURNING sessions.id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), count(*)::integer
  INTO cancelled_session_ids, cancelled_count
  FROM cancelled;

  UPDATE public.shadow_war_matches matches
  SET
    status = 'cancelled',
    current_phase = 'complete',
    completed_at = COALESCE(matches.completed_at, now())
  WHERE matches.session_id = ANY(cancelled_session_ids)
    AND matches.status <> 'completed';

  RETURN jsonb_build_object(
    'cancelledCount', cancelled_count,
    'cancelledSessionIds', COALESCE(to_jsonb(cancelled_session_ids), '[]'::jsonb)
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_session_presence'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.game_session_presence;
    END IF;
  END IF;
END $$;

GRANT SELECT ON public.game_session_presence TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_shadow_war_session_presence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_shadow_war_session_presence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_shadow_war_empty_sessions() TO authenticated;
