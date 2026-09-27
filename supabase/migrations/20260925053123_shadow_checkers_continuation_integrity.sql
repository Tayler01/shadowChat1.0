-- Keep one continuation per completed game, carry table cosmetics and preserve
-- the remaining challenger queue. This migration is prepared locally only.
ALTER TABLE public.shadow_checkers_matches
  ADD COLUMN IF NOT EXISTS continuation_match_id uuid
  REFERENCES public.shadow_checkers_matches(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.rematch_shadow_checkers_match(target_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  old_match public.shadow_checkers_matches%ROWTYPE;
  new_session public.game_sessions%ROWTYPE;
  new_match public.shadow_checkers_matches%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO old_match FROM public.shadow_checkers_matches
  WHERE id = target_match_id AND status = 'completed' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Completed match not found';
  END IF;
  IF current_user_id IS DISTINCT FROM old_match.player_one_id
     AND current_user_id IS DISTINCT FROM old_match.player_two_id THEN
    RAISE EXCEPTION 'Only players can rematch';
  END IF;

  -- The row lock serializes both players, retries and next-challenger requests.
  IF old_match.continuation_match_id IS NOT NULL THEN
    SELECT * INTO new_match FROM public.shadow_checkers_matches
    WHERE id = old_match.continuation_match_id;
    RETURN jsonb_build_object('sessionId', new_match.session_id, 'matchId', new_match.id);
  END IF;
  IF old_match.player_two_id IS NULL THEN
    RAISE EXCEPTION 'Both players must be available for rematch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_session_queue
    WHERE session_id = old_match.session_id AND status IN ('queued', 'invited')) THEN
    RAISE EXCEPTION 'A queued challenger is waiting';
  END IF;

  INSERT INTO public.game_sessions (game_type, status, created_by, player_one_id, player_two_id)
  VALUES ('shadow_checkers', 'active', current_user_id, old_match.player_one_id, old_match.player_two_id)
  RETURNING * INTO new_session;

  INSERT INTO public.shadow_checkers_matches (
    session_id, status, player_one_id, player_two_id,
    player_one_character_key, player_two_character_key, board_skin,
    current_turn_user_id, board_state
  ) VALUES (
    new_session.id, 'active', old_match.player_one_id, old_match.player_two_id,
    old_match.player_one_character_key, old_match.player_two_character_key, old_match.board_skin,
    old_match.player_one_id, public.shadow_checkers_initial_board()
  ) RETURNING * INTO new_match;

  UPDATE public.shadow_checkers_matches SET continuation_match_id = new_match.id
  WHERE id = old_match.id;
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
  SELECT * INTO old_match FROM public.shadow_checkers_matches
  WHERE id = target_match_id AND status = 'completed' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Completed match not found';
  END IF;
  IF old_match.winner_id IS DISTINCT FROM current_user_id THEN
    RAISE EXCEPTION 'Only the winner can start the next challenger match';
  END IF;
  IF old_match.continuation_match_id IS NOT NULL THEN
    SELECT * INTO new_match FROM public.shadow_checkers_matches
    WHERE id = old_match.continuation_match_id;
    RETURN jsonb_build_object('sessionId', new_match.session_id, 'matchId', new_match.id);
  END IF;

  SELECT * INTO queue_row FROM public.game_session_queue
  WHERE session_id = old_match.session_id AND status IN ('queued', 'invited')
  ORDER BY position ASC, created_at ASC, id ASC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No queued challenger';
  END IF;

  winner_character := public.shadow_checkers_character_for_winner(old_match);
  challenger_character := COALESCE(NULLIF(queue_row.metadata->>'characterKey', ''), 'amber-vow');
  IF challenger_character = winner_character THEN
    challenger_character := CASE WHEN winner_character = 'veil-rogue'
      THEN 'amber-vow' ELSE 'veil-rogue' END;
  END IF;

  INSERT INTO public.game_sessions (game_type, status, created_by, player_one_id, player_two_id)
  VALUES ('shadow_checkers', 'active', current_user_id, current_user_id, queue_row.user_id)
  RETURNING * INTO new_session;

  INSERT INTO public.shadow_checkers_matches (
    session_id, status, player_one_id, player_two_id,
    player_one_character_key, player_two_character_key, board_skin,
    current_turn_user_id, board_state
  ) VALUES (
    new_session.id, 'active', current_user_id, queue_row.user_id,
    winner_character, challenger_character, old_match.board_skin,
    current_user_id, public.shadow_checkers_initial_board()
  ) RETURNING * INTO new_match;

  UPDATE public.game_session_queue SET status = 'joined', updated_at = now()
  WHERE id = queue_row.id;
  UPDATE public.game_session_queue SET session_id = new_session.id, updated_at = now()
  WHERE session_id = old_match.session_id AND status IN ('queued', 'invited');
  UPDATE public.shadow_checkers_matches SET continuation_match_id = new_match.id
  WHERE id = old_match.id;

  RETURN jsonb_build_object('sessionId', new_session.id, 'matchId', new_match.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rematch_shadow_checkers_match(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_shadow_checkers_next_challenger(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rematch_shadow_checkers_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_shadow_checkers_next_challenger(uuid) TO authenticated;
