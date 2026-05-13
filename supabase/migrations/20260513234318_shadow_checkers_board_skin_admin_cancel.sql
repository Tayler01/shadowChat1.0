ALTER TABLE public.shadow_checkers_matches
  ADD COLUMN IF NOT EXISTS board_skin text NOT NULL DEFAULT 'classic';

ALTER TABLE public.shadow_checkers_matches
  DROP CONSTRAINT IF EXISTS shadow_checkers_matches_board_skin_check;

ALTER TABLE public.shadow_checkers_matches
  ADD CONSTRAINT shadow_checkers_matches_board_skin_check
  CHECK (board_skin IN ('classic', 'cinematic'));

DROP FUNCTION IF EXISTS public.create_shadow_checkers_match(text);

CREATE OR REPLACE FUNCTION public.create_shadow_checkers_match(
  character_key text,
  selected_board_skin text DEFAULT 'classic'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  session_row public.game_sessions%ROWTYPE;
  match_row public.shadow_checkers_matches%ROWTYPE;
  normalized_board_skin text := COALESCE(NULLIF(trim(selected_board_skin), ''), 'classic');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NULLIF(trim(character_key), '') IS NULL THEN
    RAISE EXCEPTION 'Choose a character';
  END IF;
  IF normalized_board_skin NOT IN ('classic', 'cinematic') THEN
    RAISE EXCEPTION 'Choose a valid board';
  END IF;

  INSERT INTO public.game_sessions (game_type, created_by, player_one_id)
  VALUES ('shadow_checkers', current_user_id, current_user_id)
  RETURNING * INTO session_row;

  INSERT INTO public.shadow_checkers_matches (
    session_id,
    status,
    player_one_id,
    player_one_character_key,
    board_skin,
    current_turn_user_id,
    board_state
  )
  VALUES (
    session_row.id,
    'waiting',
    current_user_id,
    character_key,
    normalized_board_skin,
    current_user_id,
    public.shadow_checkers_initial_board()
  )
  RETURNING * INTO match_row;

  RETURN jsonb_build_object('sessionId', session_row.id, 'matchId', match_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_shadow_checkers_match(target_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  match_row public.shadow_checkers_matches%ROWTYPE;
  actor_is_admin boolean := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  actor_is_admin := public.is_app_admin(current_user_id);

  SELECT *
  INTO match_row
  FROM public.shadow_checkers_matches
  WHERE id = target_match_id
    AND status IN ('waiting', 'active')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match is not cancellable';
  END IF;
  IF match_row.player_one_id <> current_user_id AND NOT actor_is_admin THEN
    RAISE EXCEPTION 'Only the creator or admin can delete this match';
  END IF;

  UPDATE public.shadow_checkers_matches
  SET status = 'cancelled', current_turn_user_id = NULL, cancelled_at = now()
  WHERE id = target_match_id;

  UPDATE public.game_sessions
  SET status = 'cancelled', completed_at = COALESCE(completed_at, now())
  WHERE id = match_row.session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_shadow_checkers_match(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_shadow_checkers_match(uuid) TO authenticated;
