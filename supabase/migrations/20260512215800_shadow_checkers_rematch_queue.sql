/*
  # Shadow Checkers rematch and next challenger

  Adds lightweight queue metadata and handoff RPCs for completed Shadow Checkers
  matches. Queue metadata stores the queued player's cosmetic character choice.
*/

ALTER TABLE public.game_session_queue
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP FUNCTION IF EXISTS public.queue_shadow_checkers_match(uuid);

CREATE OR REPLACE FUNCTION public.queue_shadow_checkers_match(target_session_id uuid, character_key text DEFAULT NULL)
RETURNS public.game_session_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  next_position integer;
  queue_row public.game_session_queue%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.game_sessions
    WHERE id = target_session_id
      AND game_type = 'shadow_checkers'
      AND status = 'active'
      AND current_user_id NOT IN (player_one_id, player_two_id)
  ) THEN
    RAISE EXCEPTION 'Match is not available for queue';
  END IF;

  SELECT COALESCE(max(position), 0) + 1
  INTO next_position
  FROM public.game_session_queue
  WHERE session_id = target_session_id
    AND status IN ('queued', 'invited');

  INSERT INTO public.game_session_queue (session_id, user_id, position, status, metadata)
  VALUES (
    target_session_id,
    current_user_id,
    next_position,
    'queued',
    jsonb_build_object('characterKey', NULLIF(trim(COALESCE(character_key, '')), ''))
  )
  ON CONFLICT (session_id, user_id) WHERE status IN ('queued', 'invited')
  DO UPDATE SET
    updated_at = now(),
    metadata = CASE
      WHEN NULLIF(trim(COALESCE(character_key, '')), '') IS NULL THEN game_session_queue.metadata
      ELSE jsonb_build_object('characterKey', NULLIF(trim(character_key), ''))
    END
  RETURNING * INTO queue_row;

  RETURN queue_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_character_for_winner(match_row public.shadow_checkers_matches)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN match_row.winner_id = match_row.player_one_id THEN match_row.player_one_character_key
    WHEN match_row.winner_id = match_row.player_two_id THEN match_row.player_two_character_key
    ELSE match_row.player_one_character_key
  END;
$$;

CREATE OR REPLACE FUNCTION public.rematch_shadow_checkers_match(target_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  old_match public.shadow_checkers_matches%ROWTYPE;
  old_session public.game_sessions%ROWTYPE;
  new_session public.game_sessions%ROWTYPE;
  new_match public.shadow_checkers_matches%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO old_match
  FROM public.shadow_checkers_matches
  WHERE id = target_match_id
    AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Completed match not found';
  END IF;
  IF current_user_id NOT IN (old_match.player_one_id, old_match.player_two_id) THEN
    RAISE EXCEPTION 'Only players can rematch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.game_session_queue
    WHERE session_id = old_match.session_id
      AND status IN ('queued', 'invited')
  ) THEN
    RAISE EXCEPTION 'A queued challenger is waiting';
  END IF;

  INSERT INTO public.game_sessions (game_type, status, created_by, player_one_id, player_two_id)
  VALUES ('shadow_checkers', 'active', current_user_id, old_match.player_one_id, old_match.player_two_id)
  RETURNING * INTO new_session;

  INSERT INTO public.shadow_checkers_matches (
    session_id,
    status,
    player_one_id,
    player_two_id,
    player_one_character_key,
    player_two_character_key,
    current_turn_user_id,
    board_state
  )
  VALUES (
    new_session.id,
    'active',
    old_match.player_one_id,
    old_match.player_two_id,
    old_match.player_one_character_key,
    old_match.player_two_character_key,
    old_match.player_one_id,
    public.shadow_checkers_initial_board()
  )
  RETURNING * INTO new_match;

  RETURN jsonb_build_object('sessionId', new_session.id, 'matchId', new_match.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_shadow_checkers_next_challenger(target_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  old_match public.shadow_checkers_matches%ROWTYPE;
  queue_row public.game_session_queue%ROWTYPE;
  new_session public.game_sessions%ROWTYPE;
  new_match public.shadow_checkers_matches%ROWTYPE;
  winner_character text;
  challenger_character text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO old_match
  FROM public.shadow_checkers_matches
  WHERE id = target_match_id
    AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Completed match not found';
  END IF;
  IF old_match.winner_id <> current_user_id THEN
    RAISE EXCEPTION 'Only the winner can start the next challenger match';
  END IF;

  SELECT *
  INTO queue_row
  FROM public.game_session_queue
  WHERE session_id = old_match.session_id
    AND status IN ('queued', 'invited')
  ORDER BY position ASC, created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No queued challenger';
  END IF;

  winner_character := public.shadow_checkers_character_for_winner(old_match);
  challenger_character := COALESCE(NULLIF(queue_row.metadata->>'characterKey', ''), 'amber-vow');
  IF challenger_character = winner_character THEN
    challenger_character := 'veil-rogue';
  END IF;

  INSERT INTO public.game_sessions (game_type, status, created_by, player_one_id, player_two_id)
  VALUES ('shadow_checkers', 'active', current_user_id, current_user_id, queue_row.user_id)
  RETURNING * INTO new_session;

  INSERT INTO public.shadow_checkers_matches (
    session_id,
    status,
    player_one_id,
    player_two_id,
    player_one_character_key,
    player_two_character_key,
    current_turn_user_id,
    board_state
  )
  VALUES (
    new_session.id,
    'active',
    current_user_id,
    queue_row.user_id,
    winner_character,
    challenger_character,
    current_user_id,
    public.shadow_checkers_initial_board()
  )
  RETURNING * INTO new_match;

  UPDATE public.game_session_queue
  SET status = 'joined', updated_at = now()
  WHERE id = queue_row.id;

  RETURN jsonb_build_object('sessionId', new_session.id, 'matchId', new_match.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shadow_checkers_character_for_winner(public.shadow_checkers_matches) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.queue_shadow_checkers_match(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rematch_shadow_checkers_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_shadow_checkers_next_challenger(uuid) TO authenticated;
