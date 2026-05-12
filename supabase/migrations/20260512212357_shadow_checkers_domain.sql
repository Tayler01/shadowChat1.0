/*
  # Shadow Checkers domain

  Adds the second multiplayer game to the existing games platform. Shadow
  Checkers uses the shared game_sessions/game_session_queue lobby spine and its
  own server-resolved match tables so players cannot write board state, scores,
  results, or champion badges directly from the browser.
*/

ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_game_type_check
  CHECK (game_type IN ('shadow_war', 'shadow_checkers'));

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS checkers_crown boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.shadow_checkers_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')),
  player_one_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  player_two_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  player_one_character_key text NOT NULL,
  player_two_character_key text,
  current_turn_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  board_state jsonb NOT NULL,
  move_count integer NOT NULL DEFAULT 0 CHECK (move_count >= 0),
  winner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  loser_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  win_reason text CHECK (win_reason IS NULL OR win_reason IN ('all_pieces_captured', 'no_legal_moves', 'resignation')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  CHECK (player_two_id IS NULL OR player_two_id <> player_one_id),
  CHECK (player_two_character_key IS NULL OR player_two_character_key <> player_one_character_key)
);

CREATE INDEX IF NOT EXISTS shadow_checkers_matches_session_idx
  ON public.shadow_checkers_matches (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS shadow_checkers_matches_status_idx
  ON public.shadow_checkers_matches (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.shadow_checkers_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.shadow_checkers_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  player_slot text NOT NULL CHECK (player_slot IN ('player_one', 'player_two')),
  move_number integer NOT NULL CHECK (move_number >= 1),
  piece_id text NOT NULL,
  path jsonb NOT NULL,
  captures jsonb NOT NULL DEFAULT '[]'::jsonb,
  crowned boolean NOT NULL DEFAULT false,
  notation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, move_number),
  UNIQUE (match_id, user_id, move_number)
);

CREATE INDEX IF NOT EXISTS shadow_checkers_moves_match_idx
  ON public.shadow_checkers_moves (match_id, move_number DESC);

CREATE TABLE IF NOT EXISTS public.shadow_checkers_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.shadow_checkers_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shadow_checkers_chat_recent_idx
  ON public.shadow_checkers_chat_messages (match_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shadow_checkers_stats (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  total_games integer NOT NULL DEFAULT 0 CHECK (total_games >= 0),
  captures_made integer NOT NULL DEFAULT 0 CHECK (captures_made >= 0),
  kings_crowned integer NOT NULL DEFAULT 0 CHECK (kings_crowned >= 0),
  last_win_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shadow_checkers_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_checkers_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_checkers_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_checkers_stats ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_shadow_checkers_matches_updated_at ON public.shadow_checkers_matches;
CREATE TRIGGER update_shadow_checkers_matches_updated_at
  BEFORE UPDATE ON public.shadow_checkers_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shadow_checkers_stats_updated_at ON public.shadow_checkers_stats;
CREATE TRIGGER update_shadow_checkers_stats_updated_at
  BEFORE UPDATE ON public.shadow_checkers_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.shadow_checkers_is_playable_square(row_index integer, col_index integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT row_index BETWEEN 0 AND 7
    AND col_index BETWEEN 0 AND 7
    AND ((row_index + col_index) % 2 = 1);
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_initial_board()
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  pieces jsonb := '[]'::jsonb;
  row_index integer;
  col_index integer;
BEGIN
  FOR row_index IN 0..2 LOOP
    FOR col_index IN 0..7 LOOP
      IF public.shadow_checkers_is_playable_square(row_index, col_index) THEN
        pieces := pieces || jsonb_build_object(
          'id', format('p2-%s-%s', row_index, col_index),
          'owner', 'player_two',
          'row', row_index,
          'col', col_index,
          'king', false
        );
      END IF;
    END LOOP;
  END LOOP;

  FOR row_index IN 5..7 LOOP
    FOR col_index IN 0..7 LOOP
      IF public.shadow_checkers_is_playable_square(row_index, col_index) THEN
        pieces := pieces || jsonb_build_object(
          'id', format('p1-%s-%s', row_index, col_index),
          'owner', 'player_one',
          'row', row_index,
          'col', col_index,
          'king', false
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'pieces', pieces,
    'turn', 'player_one',
    'winner', NULL,
    'loser', NULL,
    'winReason', NULL,
    'moveNumber', 0,
    'moveHistory', '[]'::jsonb,
    'stats', jsonb_build_object(
      'player_one', jsonb_build_object('captures', 0, 'kings', 0),
      'player_two', jsonb_build_object('captures', 0, 'kings', 0)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_piece_at(pieces jsonb, row_index integer, col_index integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  piece jsonb;
BEGIN
  FOR piece IN SELECT value FROM jsonb_array_elements(pieces) LOOP
    IF (piece->>'row')::integer = row_index AND (piece->>'col')::integer = col_index THEN
      RETURN piece;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_piece_has_capture(pieces jsonb, piece jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  row_delta integer;
  col_delta integer;
  middle_row integer;
  middle_col integer;
  destination_row integer;
  destination_col integer;
  captured jsonb;
  owner text := piece->>'owner';
  is_king boolean := COALESCE((piece->>'king')::boolean, false);
BEGIN
  FOR row_delta IN SELECT * FROM unnest(CASE WHEN is_king THEN ARRAY[-1, 1] ELSE ARRAY[CASE WHEN owner = 'player_one' THEN -1 ELSE 1 END] END) LOOP
    FOREACH col_delta IN ARRAY ARRAY[-1, 1] LOOP
      middle_row := (piece->>'row')::integer + row_delta;
      middle_col := (piece->>'col')::integer + col_delta;
      destination_row := (piece->>'row')::integer + (row_delta * 2);
      destination_col := (piece->>'col')::integer + (col_delta * 2);
      captured := public.shadow_checkers_piece_at(pieces, middle_row, middle_col);

      IF public.shadow_checkers_is_playable_square(destination_row, destination_col)
        AND captured IS NOT NULL
        AND captured->>'owner' <> owner
        AND public.shadow_checkers_piece_at(pieces, destination_row, destination_col) IS NULL THEN
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_player_has_capture(state jsonb, player_slot text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  piece jsonb;
  pieces jsonb := state->'pieces';
BEGIN
  FOR piece IN SELECT value FROM jsonb_array_elements(pieces) LOOP
    IF piece->>'owner' = player_slot AND public.shadow_checkers_piece_has_capture(pieces, piece) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_player_has_move(state jsonb, player_slot text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  piece jsonb;
  pieces jsonb := state->'pieces';
  row_delta integer;
  col_delta integer;
  destination_row integer;
  destination_col integer;
  owner text;
  is_king boolean;
BEGIN
  IF public.shadow_checkers_player_has_capture(state, player_slot) THEN
    RETURN true;
  END IF;

  FOR piece IN SELECT value FROM jsonb_array_elements(pieces) LOOP
    IF piece->>'owner' <> player_slot THEN
      CONTINUE;
    END IF;

    owner := piece->>'owner';
    is_king := COALESCE((piece->>'king')::boolean, false);
    FOR row_delta IN SELECT * FROM unnest(CASE WHEN is_king THEN ARRAY[-1, 1] ELSE ARRAY[CASE WHEN owner = 'player_one' THEN -1 ELSE 1 END] END) LOOP
      FOREACH col_delta IN ARRAY ARRAY[-1, 1] LOOP
        destination_row := (piece->>'row')::integer + row_delta;
        destination_col := (piece->>'col')::integer + col_delta;
        IF public.shadow_checkers_is_playable_square(destination_row, destination_col)
          AND public.shadow_checkers_piece_at(pieces, destination_row, destination_col) IS NULL THEN
          RETURN true;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_without_piece_at(pieces jsonb, row_index integer, col_index integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  next_pieces jsonb := '[]'::jsonb;
  piece jsonb;
BEGIN
  FOR piece IN SELECT value FROM jsonb_array_elements(pieces) LOOP
    IF NOT ((piece->>'row')::integer = row_index AND (piece->>'col')::integer = col_index) THEN
      next_pieces := next_pieces || piece;
    END IF;
  END LOOP;

  RETURN next_pieces;
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_replace_piece(pieces jsonb, replacement jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  next_pieces jsonb := '[]'::jsonb;
  piece jsonb;
BEGIN
  FOR piece IN SELECT value FROM jsonb_array_elements(pieces) LOOP
    IF piece->>'id' = replacement->>'id' THEN
      next_pieces := next_pieces || replacement;
    ELSE
      next_pieces := next_pieces || piece;
    END IF;
  END LOOP;

  RETURN next_pieces;
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_count_pieces(pieces jsonb, player_slot text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT count(*)::integer
  FROM jsonb_array_elements(pieces) piece
  WHERE piece->>'owner' = player_slot;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_position_label(row_index integer, col_index integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT chr(65 + col_index) || (8 - row_index)::text;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_apply_move_state(current_state jsonb, player_slot text, piece_id text, move_path jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  pieces jsonb := current_state->'pieces';
  piece jsonb;
  current_piece jsonb;
  path_length integer := jsonb_array_length(move_path);
  path_index integer;
  start_pos jsonb;
  destination jsonb;
  from_row integer;
  from_col integer;
  to_row integer;
  to_col integer;
  row_delta integer;
  col_delta integer;
  middle_row integer;
  middle_col integer;
  captured_piece jsonb;
  captures jsonb := '[]'::jsonb;
  notation_parts text[] := ARRAY[]::text[];
  capture_required boolean := public.shadow_checkers_player_has_capture(current_state, player_slot);
  did_capture boolean := false;
  crowned boolean := false;
  current_king boolean;
  opponent_slot text := CASE WHEN player_slot = 'player_one' THEN 'player_two' ELSE 'player_one' END;
  next_turn text := opponent_slot;
  winner text := NULL;
  loser text := NULL;
  win_reason text := NULL;
  next_state jsonb;
  next_stats jsonb := current_state->'stats';
  move_number integer := COALESCE((current_state->>'moveNumber')::integer, 0) + 1;
  history jsonb := COALESCE(current_state->'moveHistory', '[]'::jsonb);
  move_record jsonb;
BEGIN
  IF current_state->>'turn' <> player_slot THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;

  IF path_length < 2 THEN
    RAISE EXCEPTION 'Move must include a start and destination';
  END IF;

  FOR piece IN SELECT value FROM jsonb_array_elements(pieces) LOOP
    IF piece->>'id' = piece_id THEN
      current_piece := piece;
      EXIT;
    END IF;
  END LOOP;

  IF current_piece IS NULL OR current_piece->>'owner' <> player_slot THEN
    RAISE EXCEPTION 'Piece is not available';
  END IF;

  start_pos := move_path->0;
  IF (start_pos->>'row')::integer <> (current_piece->>'row')::integer
    OR (start_pos->>'col')::integer <> (current_piece->>'col')::integer THEN
    RAISE EXCEPTION 'Move starts from the wrong square';
  END IF;

  notation_parts := notation_parts || public.shadow_checkers_position_label((current_piece->>'row')::integer, (current_piece->>'col')::integer);

  FOR path_index IN 1..(path_length - 1) LOOP
    destination := move_path->path_index;
    from_row := (current_piece->>'row')::integer;
    from_col := (current_piece->>'col')::integer;
    to_row := (destination->>'row')::integer;
    to_col := (destination->>'col')::integer;
    row_delta := to_row - from_row;
    col_delta := to_col - from_col;
    current_king := COALESCE((current_piece->>'king')::boolean, false);

    IF NOT public.shadow_checkers_is_playable_square(to_row, to_col) THEN
      RAISE EXCEPTION 'Illegal move';
    END IF;

    IF public.shadow_checkers_piece_at(pieces, to_row, to_col) IS NOT NULL THEN
      RAISE EXCEPTION 'Destination is occupied';
    END IF;

    IF abs(row_delta) = 1 AND abs(col_delta) = 1 THEN
      IF capture_required THEN
        RAISE EXCEPTION 'Capture required';
      END IF;
      IF path_length <> 2 THEN
        RAISE EXCEPTION 'Illegal move';
      END IF;
      IF NOT current_king AND row_delta <> (CASE WHEN player_slot = 'player_one' THEN -1 ELSE 1 END) THEN
        RAISE EXCEPTION 'Illegal move';
      END IF;
    ELSIF abs(row_delta) = 2 AND abs(col_delta) = 2 THEN
      IF NOT current_king AND row_delta <> (CASE WHEN player_slot = 'player_one' THEN -2 ELSE 2 END) THEN
        RAISE EXCEPTION 'Illegal move';
      END IF;

      middle_row := from_row + (row_delta / 2);
      middle_col := from_col + (col_delta / 2);
      captured_piece := public.shadow_checkers_piece_at(pieces, middle_row, middle_col);

      IF captured_piece IS NULL OR captured_piece->>'owner' = player_slot THEN
        RAISE EXCEPTION 'Illegal capture';
      END IF;

      pieces := public.shadow_checkers_without_piece_at(pieces, middle_row, middle_col);
      captures := captures || jsonb_build_object('row', middle_row, 'col', middle_col);
      did_capture := true;
    ELSE
      RAISE EXCEPTION 'Illegal move';
    END IF;

    current_piece := jsonb_set(current_piece, '{row}', to_jsonb(to_row), false);
    current_piece := jsonb_set(current_piece, '{col}', to_jsonb(to_col), false);

    IF NOT COALESCE((current_piece->>'king')::boolean, false)
      AND ((player_slot = 'player_one' AND to_row = 0) OR (player_slot = 'player_two' AND to_row = 7)) THEN
      current_piece := jsonb_set(current_piece, '{king}', 'true'::jsonb, false);
      crowned := true;
      IF did_capture AND path_index < path_length - 1 THEN
        RAISE EXCEPTION 'Promotion ends the move';
      END IF;
    END IF;

    pieces := public.shadow_checkers_replace_piece(pieces, current_piece);
    notation_parts := notation_parts || public.shadow_checkers_position_label(to_row, to_col);
  END LOOP;

  IF capture_required AND NOT did_capture THEN
    RAISE EXCEPTION 'Capture required';
  END IF;

  IF did_capture AND NOT crowned AND public.shadow_checkers_piece_has_capture(pieces, current_piece) THEN
    RAISE EXCEPTION 'Multi-jump required';
  END IF;

  IF public.shadow_checkers_count_pieces(pieces, opponent_slot) = 0 THEN
    winner := player_slot;
    loser := opponent_slot;
    win_reason := 'all_pieces_captured';
  ELSE
    next_state := jsonb_set(current_state, '{pieces}', pieces, false);
    next_state := jsonb_set(next_state, '{turn}', to_jsonb(opponent_slot), false);
    IF NOT public.shadow_checkers_player_has_move(next_state, opponent_slot) THEN
      winner := player_slot;
      loser := opponent_slot;
      win_reason := 'no_legal_moves';
    END IF;
  END IF;

  next_stats := jsonb_set(
    next_stats,
    ARRAY[player_slot, 'captures'],
    to_jsonb(COALESCE((next_stats->player_slot->>'captures')::integer, 0) + jsonb_array_length(captures)),
    true
  );

  IF crowned THEN
    next_stats := jsonb_set(
      next_stats,
      ARRAY[player_slot, 'kings'],
      to_jsonb(COALESCE((next_stats->player_slot->>'kings')::integer, 0) + 1),
      true
    );
  END IF;

  move_record := jsonb_build_object(
    'pieceId', piece_id,
    'path', move_path,
    'captures', captures,
    'crowned', crowned,
    'player', player_slot,
    'moveNumber', move_number,
    'notation', array_to_string(notation_parts, CASE WHEN did_capture THEN 'x' ELSE '-' END)
      || CASE WHEN jsonb_array_length(captures) > 0 THEN ' • ' || jsonb_array_length(captures)::text || ' capture' || CASE WHEN jsonb_array_length(captures) = 1 THEN '' ELSE 's' END ELSE ' • moved' END
      || CASE WHEN crowned THEN ' • crowned' ELSE '' END,
    'createdAt', now()
  );

  SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
  INTO history
  FROM (
    SELECT value
    FROM jsonb_array_elements(history || move_record) WITH ORDINALITY AS history_items(value, ordinal)
    ORDER BY ordinal DESC
    LIMIT 5
  ) recent;

  SELECT COALESCE(jsonb_agg(value ORDER BY (value->>'moveNumber')::integer), '[]'::jsonb)
  INTO history
  FROM jsonb_array_elements(history) AS ordered_history(value);

  next_state := jsonb_build_object(
    'pieces', pieces,
    'turn', CASE WHEN winner IS NULL THEN next_turn ELSE player_slot END,
    'winner', winner,
    'loser', loser,
    'winReason', win_reason,
    'moveNumber', move_number,
    'moveHistory', history,
    'stats', next_stats
  );

  RETURN jsonb_build_object('state', next_state, 'move', move_record);
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_update_stats_and_crown(
  winner_user_id uuid,
  loser_user_id uuid,
  winner_captures integer DEFAULT 0,
  loser_captures integer DEFAULT 0,
  winner_kings integer DEFAULT 0,
  loser_kings integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champion_id uuid;
BEGIN
  IF winner_user_id IS NULL OR loser_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.shadow_checkers_stats (user_id, wins, losses, total_games, captures_made, kings_crowned, last_win_at)
  VALUES (winner_user_id, 1, 0, 1, GREATEST(winner_captures, 0), GREATEST(winner_kings, 0), now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    wins = shadow_checkers_stats.wins + 1,
    total_games = shadow_checkers_stats.total_games + 1,
    captures_made = shadow_checkers_stats.captures_made + GREATEST(winner_captures, 0),
    kings_crowned = shadow_checkers_stats.kings_crowned + GREATEST(winner_kings, 0),
    last_win_at = now();

  INSERT INTO public.shadow_checkers_stats (user_id, wins, losses, total_games, captures_made, kings_crowned)
  VALUES (loser_user_id, 0, 1, 1, GREATEST(loser_captures, 0), GREATEST(loser_kings, 0))
  ON CONFLICT (user_id) DO UPDATE
  SET
    losses = shadow_checkers_stats.losses + 1,
    total_games = shadow_checkers_stats.total_games + 1,
    captures_made = shadow_checkers_stats.captures_made + GREATEST(loser_captures, 0),
    kings_crowned = shadow_checkers_stats.kings_crowned + GREATEST(loser_kings, 0);

  SELECT user_id
  INTO champion_id
  FROM public.shadow_checkers_stats
  WHERE total_games > 0
  ORDER BY wins DESC, losses ASC, (wins::numeric / GREATEST(total_games, 1)) DESC, last_win_at DESC NULLS LAST
  LIMIT 1;

  UPDATE public.users
  SET checkers_crown = (id = champion_id)
  WHERE checkers_crown IS DISTINCT FROM (id = champion_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_shadow_checkers_match(character_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  session_row public.game_sessions%ROWTYPE;
  match_row public.shadow_checkers_matches%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NULLIF(trim(character_key), '') IS NULL THEN
    RAISE EXCEPTION 'Choose a character';
  END IF;

  INSERT INTO public.game_sessions (game_type, created_by, player_one_id)
  VALUES ('shadow_checkers', current_user_id, current_user_id)
  RETURNING * INTO session_row;

  INSERT INTO public.shadow_checkers_matches (
    session_id,
    status,
    player_one_id,
    player_one_character_key,
    current_turn_user_id,
    board_state
  )
  VALUES (
    session_row.id,
    'waiting',
    current_user_id,
    character_key,
    current_user_id,
    public.shadow_checkers_initial_board()
  )
  RETURNING * INTO match_row;

  RETURN jsonb_build_object('sessionId', session_row.id, 'matchId', match_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_shadow_checkers_match(target_session_id uuid, character_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  session_row public.game_sessions%ROWTYPE;
  match_row public.shadow_checkers_matches%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NULLIF(trim(character_key), '') IS NULL THEN
    RAISE EXCEPTION 'Choose a character';
  END IF;

  SELECT *
  INTO session_row
  FROM public.game_sessions
  WHERE id = target_session_id
    AND game_type = 'shadow_checkers'
    AND status = 'waiting'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match is not open';
  END IF;
  IF session_row.player_one_id = current_user_id THEN
    RAISE EXCEPTION 'You are already in this match';
  END IF;

  SELECT *
  INTO match_row
  FROM public.shadow_checkers_matches
  WHERE session_id = target_session_id
    AND status = 'waiting'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match is not open';
  END IF;
  IF match_row.player_one_character_key = character_key THEN
    RAISE EXCEPTION 'Character already taken';
  END IF;

  UPDATE public.game_sessions
  SET status = 'active', player_two_id = current_user_id
  WHERE id = target_session_id
  RETURNING * INTO session_row;

  UPDATE public.shadow_checkers_matches
  SET
    status = 'active',
    player_two_id = current_user_id,
    player_two_character_key = character_key,
    current_turn_user_id = player_one_id
  WHERE id = match_row.id
  RETURNING * INTO match_row;

  RETURN jsonb_build_object('sessionId', session_row.id, 'matchId', match_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_shadow_checkers_move(target_match_id uuid, piece_id text, move_path jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  match_row public.shadow_checkers_matches%ROWTYPE;
  session_row public.game_sessions%ROWTYPE;
  player_slot text;
  apply_result jsonb;
  next_state jsonb;
  move_record jsonb;
  winner_slot text;
  loser_slot text;
  winner_user_id uuid;
  loser_user_id uuid;
  winner_captures integer := 0;
  loser_captures integer := 0;
  winner_kings integer := 0;
  loser_kings integer := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO match_row
  FROM public.shadow_checkers_matches
  WHERE id = target_match_id
  FOR UPDATE;

  IF NOT FOUND OR match_row.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;

  SELECT *
  INTO session_row
  FROM public.game_sessions
  WHERE id = match_row.session_id
    AND game_type = 'shadow_checkers'
  FOR UPDATE;

  IF current_user_id = match_row.player_one_id THEN
    player_slot := 'player_one';
  ELSIF current_user_id = match_row.player_two_id THEN
    player_slot := 'player_two';
  ELSE
    RAISE EXCEPTION 'Only active players can move';
  END IF;

  IF match_row.current_turn_user_id <> current_user_id THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;

  apply_result := public.shadow_checkers_apply_move_state(match_row.board_state, player_slot, piece_id, move_path);
  next_state := apply_result->'state';
  move_record := apply_result->'move';

  UPDATE public.shadow_checkers_matches
  SET
    board_state = next_state,
    move_count = (move_record->>'moveNumber')::integer,
    status = CASE WHEN next_state->>'winner' IS NULL THEN 'active' ELSE 'completed' END,
    current_turn_user_id = CASE
      WHEN next_state->>'winner' IS NOT NULL THEN NULL
      WHEN next_state->>'turn' = 'player_one' THEN player_one_id
      ELSE player_two_id
    END,
    winner_id = CASE
      WHEN next_state->>'winner' = 'player_one' THEN player_one_id
      WHEN next_state->>'winner' = 'player_two' THEN player_two_id
      ELSE NULL
    END,
    loser_id = CASE
      WHEN next_state->>'loser' = 'player_one' THEN player_one_id
      WHEN next_state->>'loser' = 'player_two' THEN player_two_id
      ELSE NULL
    END,
    win_reason = next_state->>'winReason',
    completed_at = CASE WHEN next_state->>'winner' IS NOT NULL THEN now() ELSE completed_at END
  WHERE id = target_match_id
  RETURNING * INTO match_row;

  INSERT INTO public.shadow_checkers_moves (
    match_id,
    user_id,
    player_slot,
    move_number,
    piece_id,
    path,
    captures,
    crowned,
    notation
  )
  VALUES (
    target_match_id,
    current_user_id,
    player_slot,
    (move_record->>'moveNumber')::integer,
    piece_id,
    move_record->'path',
    move_record->'captures',
    COALESCE((move_record->>'crowned')::boolean, false),
    move_record->>'notation'
  );

  IF match_row.status = 'completed' THEN
    UPDATE public.game_sessions
    SET
      status = 'completed',
      winner_id = match_row.winner_id,
      loser_id = match_row.loser_id,
      completed_at = COALESCE(completed_at, now())
    WHERE id = match_row.session_id;

    winner_slot := next_state->>'winner';
    loser_slot := next_state->>'loser';
    winner_user_id := match_row.winner_id;
    loser_user_id := match_row.loser_id;
    winner_captures := COALESCE((next_state->'stats'->winner_slot->>'captures')::integer, 0);
    loser_captures := COALESCE((next_state->'stats'->loser_slot->>'captures')::integer, 0);
    winner_kings := COALESCE((next_state->'stats'->winner_slot->>'kings')::integer, 0);
    loser_kings := COALESCE((next_state->'stats'->loser_slot->>'kings')::integer, 0);

    PERFORM public.shadow_checkers_update_stats_and_crown(
      winner_user_id,
      loser_user_id,
      winner_captures,
      loser_captures,
      winner_kings,
      loser_kings
    );
  END IF;

  RETURN jsonb_build_object('matchId', target_match_id, 'move', move_record, 'completed', match_row.status = 'completed');
END;
$$;

CREATE OR REPLACE FUNCTION public.resign_shadow_checkers_match(target_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  match_row public.shadow_checkers_matches%ROWTYPE;
  player_slot text;
  winner_slot text;
  winner_user_id uuid;
  loser_user_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO match_row
  FROM public.shadow_checkers_matches
  WHERE id = target_match_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;

  IF current_user_id = match_row.player_one_id THEN
    player_slot := 'player_one';
    winner_slot := 'player_two';
    winner_user_id := match_row.player_two_id;
    loser_user_id := match_row.player_one_id;
  ELSIF current_user_id = match_row.player_two_id THEN
    player_slot := 'player_two';
    winner_slot := 'player_one';
    winner_user_id := match_row.player_one_id;
    loser_user_id := match_row.player_two_id;
  ELSE
    RAISE EXCEPTION 'Only active players can resign';
  END IF;

  UPDATE public.shadow_checkers_matches
  SET
    status = 'completed',
    board_state = jsonb_set(jsonb_set(jsonb_set(board_state, '{winner}', to_jsonb(winner_slot), true), '{loser}', to_jsonb(player_slot), true), '{winReason}', to_jsonb('resignation'::text), true),
    current_turn_user_id = NULL,
    winner_id = winner_user_id,
    loser_id = loser_user_id,
    win_reason = 'resignation',
    completed_at = now()
  WHERE id = target_match_id
  RETURNING * INTO match_row;

  UPDATE public.game_sessions
  SET status = 'completed', winner_id = winner_user_id, loser_id = loser_user_id, completed_at = COALESCE(completed_at, now())
  WHERE id = match_row.session_id;

  PERFORM public.shadow_checkers_update_stats_and_crown(winner_user_id, loser_user_id);

  RETURN jsonb_build_object('matchId', target_match_id, 'winnerId', winner_user_id);
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
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO match_row
  FROM public.shadow_checkers_matches
  WHERE id = target_match_id
    AND status IN ('waiting', 'active')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match is not cancellable';
  END IF;
  IF match_row.player_one_id <> current_user_id THEN
    RAISE EXCEPTION 'Only the creator can cancel this match';
  END IF;

  UPDATE public.shadow_checkers_matches
  SET status = 'cancelled', current_turn_user_id = NULL, cancelled_at = now()
  WHERE id = target_match_id;

  UPDATE public.game_sessions
  SET status = 'cancelled', completed_at = COALESCE(completed_at, now())
  WHERE id = match_row.session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_shadow_checkers_match(target_session_id uuid)
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

  INSERT INTO public.game_session_queue (session_id, user_id, position, status)
  VALUES (target_session_id, current_user_id, next_position, 'queued')
  ON CONFLICT (session_id, user_id) WHERE status IN ('queued', 'invited')
  DO UPDATE SET updated_at = now()
  RETURNING * INTO queue_row;

  RETURN queue_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_shadow_checkers_queue(target_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.game_session_queue
  SET status = 'left'
  WHERE session_id = target_session_id
    AND user_id = auth.uid()
    AND status IN ('queued', 'invited');
END;
$$;

CREATE OR REPLACE FUNCTION public.post_shadow_checkers_chat_message(target_match_id uuid, body text)
RETURNS public.shadow_checkers_chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  trimmed_body text := left(trim(body), 120);
  message_row public.shadow_checkers_chat_messages%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF char_length(trimmed_body) = 0 THEN
    RAISE EXCEPTION 'Message is empty';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shadow_checkers_matches
    WHERE id = target_match_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Match chat is closed';
  END IF;

  INSERT INTO public.shadow_checkers_chat_messages (match_id, user_id, body)
  VALUES (target_match_id, current_user_id, trimmed_body)
  RETURNING * INTO message_row;

  RETURN message_row;
END;
$$;

DROP POLICY IF EXISTS "Authenticated users can read shadow checkers matches" ON public.shadow_checkers_matches;
CREATE POLICY "Authenticated users can read shadow checkers matches"
ON public.shadow_checkers_matches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.game_sessions sessions
    WHERE sessions.id = shadow_checkers_matches.session_id
      AND sessions.game_type = 'shadow_checkers'
      AND sessions.status <> 'cancelled'
  )
);

DROP POLICY IF EXISTS "Authenticated users can read shadow checkers moves" ON public.shadow_checkers_moves;
CREATE POLICY "Authenticated users can read shadow checkers moves"
ON public.shadow_checkers_moves
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.shadow_checkers_matches matches
    WHERE matches.id = shadow_checkers_moves.match_id
      AND matches.status <> 'cancelled'
  )
);

DROP POLICY IF EXISTS "Authenticated users can read active shadow checkers chat" ON public.shadow_checkers_chat_messages;
CREATE POLICY "Authenticated users can read active shadow checkers chat"
ON public.shadow_checkers_chat_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.shadow_checkers_matches matches
    WHERE matches.id = shadow_checkers_chat_messages.match_id
      AND matches.status = 'active'
  )
);

DROP POLICY IF EXISTS "Authenticated users can read shadow checkers stats" ON public.shadow_checkers_stats;
CREATE POLICY "Authenticated users can read shadow checkers stats"
ON public.shadow_checkers_stats
FOR SELECT
TO authenticated
USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shadow_checkers_matches'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_checkers_matches;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shadow_checkers_moves'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_checkers_moves;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shadow_checkers_chat_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_checkers_chat_messages;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shadow_checkers_stats'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_checkers_stats;
    END IF;
  END IF;
END $$;

GRANT SELECT ON public.shadow_checkers_matches TO authenticated;
GRANT SELECT ON public.shadow_checkers_moves TO authenticated;
GRANT SELECT ON public.shadow_checkers_chat_messages TO authenticated;
GRANT SELECT ON public.shadow_checkers_stats TO authenticated;

REVOKE EXECUTE ON FUNCTION public.shadow_checkers_is_playable_square(integer, integer) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_initial_board() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_piece_at(jsonb, integer, integer) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_piece_has_capture(jsonb, jsonb) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_player_has_capture(jsonb, text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_player_has_move(jsonb, text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_without_piece_at(jsonb, integer, integer) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_replace_piece(jsonb, jsonb) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_count_pieces(jsonb, text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_position_label(integer, integer) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_apply_move_state(jsonb, text, text, jsonb) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_checkers_update_stats_and_crown(uuid, uuid, integer, integer, integer, integer) FROM PUBLIC, authenticated, anon;

GRANT EXECUTE ON FUNCTION public.create_shadow_checkers_match(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_shadow_checkers_match(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_shadow_checkers_move(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resign_shadow_checkers_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_shadow_checkers_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_shadow_checkers_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_shadow_checkers_queue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_shadow_checkers_chat_message(uuid, text) TO authenticated;
