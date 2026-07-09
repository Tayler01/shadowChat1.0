-- Remove PL/pgSQL compiler warnings without changing game behavior.
--
-- Loop indices declared by integer FOR loops are implicit PL/pgSQL variables;
-- the matching DECLARE entries only shadowed those variables and were unused.
-- The submit-move session lookup remains a row lock, expressed as PERFORM so
-- no unused row variable is needed. The initial-board function is STABLE
-- because its helper call is not immutable, matching PostgreSQL's volatility
-- contract. CREATE OR REPLACE preserves each function's existing ACL.

CREATE OR REPLACE FUNCTION public.shadow_checkers_initial_board()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  pieces jsonb := '[]'::jsonb;
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
$function$;

CREATE OR REPLACE FUNCTION public.shadow_checkers_apply_move_state(current_state jsonb, player_slot text, piece_id text, move_path jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  pieces jsonb := current_state->'pieces';
  piece jsonb;
  current_piece jsonb;
  path_length integer := jsonb_array_length(move_path);
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
$function$;

CREATE OR REPLACE FUNCTION public.resolve_shadow_war_round(target_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  match_row public.shadow_war_matches%ROWTYPE;
  session_row public.game_sessions%ROWTYPE;
  p1_move public.shadow_war_moves%ROWTYPE;
  p2_move public.shadow_war_moves%ROWTYPE;
  p1_sudden_move public.shadow_war_moves%ROWTYPE;
  p2_sudden_move public.shadow_war_moves%ROWTYPE;
  p1_state public.shadow_war_player_states%ROWTYPE;
  p2_state public.shadow_war_player_states%ROWTYPE;
  p1_rank integer[];
  p2_rank integer[];
  p1_strength integer[];
  p2_strength integer[];
  p1_ability text[];
  p2_ability text[];
  winners text[] := ARRAY[]::text[];
  p1_wins integer := 0;
  p2_wins integer := 0;
  margin integer;
  target_lane integer;
  weakest_rank integer;
  p1_scout_bonus integer := 0;
  p2_scout_bonus integer := 0;
  p1_round_winner boolean := false;
  p2_round_winner boolean := false;
  next_p1_score integer;
  next_p2_score integer;
  final_winner uuid;
  final_loser uuid;
  sudden_war_result jsonb;
  round_winner_label text;
  round_result jsonb;
  next_state jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO match_row
  FROM public.shadow_war_matches
  WHERE id = target_match_id
  FOR UPDATE;

  IF NOT FOUND OR match_row.status <> 'active' OR match_row.current_phase NOT IN ('reveal', 'sudden_war') THEN
    RAISE EXCEPTION 'Match is not ready to resolve';
  END IF;

  SELECT *
  INTO session_row
  FROM public.game_sessions
  WHERE id = match_row.session_id
  FOR UPDATE;

  IF current_user_id NOT IN (session_row.player_one_id, session_row.player_two_id) THEN
    RAISE EXCEPTION 'Only active players can resolve this match';
  END IF;

  SELECT * INTO p1_move
  FROM public.shadow_war_moves
  WHERE match_id = target_match_id
    AND round_number = match_row.round_number
    AND player_slot = 'player_one'
    AND move_type = 'placement';

  SELECT * INTO p2_move
  FROM public.shadow_war_moves
  WHERE match_id = target_match_id
    AND round_number = match_row.round_number
    AND player_slot = 'player_two'
    AND move_type = 'placement';

  IF p1_move.id IS NULL OR p2_move.id IS NULL THEN
    RAISE EXCEPTION 'Both players must lock before reveal';
  END IF;

  SELECT * INTO p1_state
  FROM public.shadow_war_player_states
  WHERE match_id = target_match_id AND player_slot = 'player_one'
  FOR UPDATE;

  SELECT * INTO p2_state
  FROM public.shadow_war_player_states
  WHERE match_id = target_match_id AND player_slot = 'player_two'
  FOR UPDATE;

  p1_rank := ARRAY[
    (p1_move.payload->'left'->>'rank')::integer,
    (p1_move.payload->'center'->>'rank')::integer,
    (p1_move.payload->'right'->>'rank')::integer
  ];
  p2_rank := ARRAY[
    (p2_move.payload->'left'->>'rank')::integer,
    (p2_move.payload->'center'->>'rank')::integer,
    (p2_move.payload->'right'->>'rank')::integer
  ];
  p1_strength := p1_rank;
  p2_strength := p2_rank;
  p1_ability := ARRAY[
    p1_move.payload->'left'->>'abilityKey',
    p1_move.payload->'center'->>'abilityKey',
    p1_move.payload->'right'->>'abilityKey'
  ];
  p2_ability := ARRAY[
    p2_move.payload->'left'->>'abilityKey',
    p2_move.payload->'center'->>'abilityKey',
    p2_move.payload->'right'->>'abilityKey'
  ];

  FOR lane_index IN 1..3 LOOP
    IF p1_ability[lane_index] = 'sabotage' AND p2_rank[lane_index] >= 8 THEN
      p2_strength[lane_index] := p2_strength[lane_index] - 3;
    END IF;
    IF p2_ability[lane_index] = 'sabotage' AND p1_rank[lane_index] >= 8 THEN
      p1_strength[lane_index] := p1_strength[lane_index] - 3;
    END IF;
    IF p1_ability[lane_index] = 'duelist' AND p2_rank[lane_index] > p1_rank[lane_index] THEN
      p1_strength[lane_index] := p1_strength[lane_index] + 2;
    END IF;
    IF p2_ability[lane_index] = 'duelist' AND p1_rank[lane_index] > p2_rank[lane_index] THEN
      p2_strength[lane_index] := p2_strength[lane_index] + 2;
    END IF;
    IF p1_ability[lane_index] = 'volley' THEN
      target_lane := CASE WHEN lane_index = 3 THEN 2 ELSE lane_index + 1 END;
      p1_strength[target_lane] := p1_strength[target_lane] + 1;
    END IF;
    IF p2_ability[lane_index] = 'volley' THEN
      target_lane := CASE WHEN lane_index = 3 THEN 2 ELSE lane_index + 1 END;
      p2_strength[target_lane] := p2_strength[target_lane] + 1;
    END IF;
  END LOOP;

  FOR lane_index IN 1..3 LOOP
    IF p1_ability[lane_index] = 'rally' THEN
      target_lane := NULL;
      weakest_rank := 999;
      IF lane_index > 1 AND p1_rank[lane_index - 1] < p1_rank[lane_index] AND p1_rank[lane_index - 1] < weakest_rank THEN
        target_lane := lane_index - 1;
        weakest_rank := p1_rank[target_lane];
      END IF;
      IF lane_index < 3 AND p1_rank[lane_index + 1] < p1_rank[lane_index] AND p1_rank[lane_index + 1] < weakest_rank THEN
        target_lane := lane_index + 1;
      END IF;
      IF target_lane IS NOT NULL THEN
        p1_strength[target_lane] := p1_strength[target_lane] + 1;
      END IF;
    END IF;

    IF p2_ability[lane_index] = 'rally' THEN
      target_lane := NULL;
      weakest_rank := 999;
      IF lane_index > 1 AND p2_rank[lane_index - 1] < p2_rank[lane_index] AND p2_rank[lane_index - 1] < weakest_rank THEN
        target_lane := lane_index - 1;
        weakest_rank := p2_rank[target_lane];
      END IF;
      IF lane_index < 3 AND p2_rank[lane_index + 1] < p2_rank[lane_index] AND p2_rank[lane_index + 1] < weakest_rank THEN
        target_lane := lane_index + 1;
      END IF;
      IF target_lane IS NOT NULL THEN
        p2_strength[target_lane] := p2_strength[target_lane] + 1;
      END IF;
    END IF;

    IF p1_ability[lane_index] = 'command' THEN
      target_lane := 1;
      IF p1_rank[2] < p1_rank[target_lane] THEN
        target_lane := 2;
      END IF;
      IF p1_rank[3] < p1_rank[target_lane] THEN
        target_lane := 3;
      END IF;
      p1_strength[target_lane] := p1_strength[target_lane] + 1;
    END IF;

    IF p2_ability[lane_index] = 'command' THEN
      target_lane := 1;
      IF p2_rank[2] < p2_rank[target_lane] THEN
        target_lane := 2;
      END IF;
      IF p2_rank[3] < p2_rank[target_lane] THEN
        target_lane := 3;
      END IF;
      p2_strength[target_lane] := p2_strength[target_lane] + 1;
    END IF;

    IF p1_ability[lane_index] = 'dominate' AND p1_rank[lane_index] > p2_rank[lane_index] THEN
      target_lane := NULL;
      weakest_rank := 999;
      IF lane_index > 1 AND p1_rank[lane_index - 1] < weakest_rank THEN
        target_lane := lane_index - 1;
        weakest_rank := p1_rank[target_lane];
      END IF;
      IF lane_index < 3 AND p1_rank[lane_index + 1] < weakest_rank THEN
        target_lane := lane_index + 1;
      END IF;
      IF target_lane IS NOT NULL THEN
        p1_strength[target_lane] := p1_strength[target_lane] + 1;
      END IF;
    END IF;

    IF p2_ability[lane_index] = 'dominate' AND p2_rank[lane_index] > p1_rank[lane_index] THEN
      target_lane := NULL;
      weakest_rank := 999;
      IF lane_index > 1 AND p2_rank[lane_index - 1] < weakest_rank THEN
        target_lane := lane_index - 1;
        weakest_rank := p2_rank[target_lane];
      END IF;
      IF lane_index < 3 AND p2_rank[lane_index + 1] < weakest_rank THEN
        target_lane := lane_index + 1;
      END IF;
      IF target_lane IS NOT NULL THEN
        p2_strength[target_lane] := p2_strength[target_lane] + 1;
      END IF;
    END IF;
  END LOOP;

  FOR lane_index IN 1..3 LOOP
    IF p1_strength[lane_index] > p2_strength[lane_index] THEN
      margin := p1_strength[lane_index] - p2_strength[lane_index];
      IF p2_ability[lane_index] = 'guard' AND margin <= 2 THEN
        winners := array_append(winners, 'contested');
      ELSE
        winners := array_append(winners, 'player_one');
        p1_wins := p1_wins + 1;
        IF p2_ability[lane_index] = 'intel' THEN
          p2_scout_bonus := p2_scout_bonus + 1;
        END IF;
      END IF;
    ELSIF p2_strength[lane_index] > p1_strength[lane_index] THEN
      margin := p2_strength[lane_index] - p1_strength[lane_index];
      IF p1_ability[lane_index] = 'guard' AND margin <= 2 THEN
        winners := array_append(winners, 'contested');
      ELSE
        winners := array_append(winners, 'player_two');
        p2_wins := p2_wins + 1;
        IF p1_ability[lane_index] = 'intel' THEN
          p1_scout_bonus := p1_scout_bonus + 1;
        END IF;
      END IF;
    ELSE
      winners := array_append(winners, 'contested');
    END IF;
  END LOOP;

  p1_round_winner := p1_wins >= 2;
  p2_round_winner := p2_wins >= 2;

  IF NOT p1_round_winner AND NOT p2_round_winner AND match_row.current_phase = 'reveal' THEN
    round_result := jsonb_build_object(
      'roundNumber', match_row.round_number,
      'resolvedAt', now(),
      'roundWinner', NULL,
      'needsSuddenWar', true,
      'laneResults', jsonb_build_array(
        jsonb_build_object('lane', 'left', 'winner', winners[1], 'playerOneStrength', p1_strength[1], 'playerTwoStrength', p2_strength[1], 'playerOneCard', p1_move.payload->'left', 'playerTwoCard', p2_move.payload->'left'),
        jsonb_build_object('lane', 'center', 'winner', winners[2], 'playerOneStrength', p1_strength[2], 'playerTwoStrength', p2_strength[2], 'playerOneCard', p1_move.payload->'center', 'playerTwoCard', p2_move.payload->'center'),
        jsonb_build_object('lane', 'right', 'winner', winners[3], 'playerOneStrength', p1_strength[3], 'playerTwoStrength', p2_strength[3], 'playerOneCard', p1_move.payload->'right', 'playerTwoCard', p2_move.payload->'right')
      ),
      'postRound', jsonb_build_object('playerOneScoutBonus', p1_scout_bonus, 'playerTwoScoutBonus', p2_scout_bonus),
      'notes', jsonb_build_array('Lane result requires sudden war. Each player must lock one unplayed reserve card.')
    );

    UPDATE public.shadow_war_matches
    SET
      current_phase = 'sudden_war',
      state = jsonb_set(
        jsonb_set(state, '{lockedPlayerIds}', '[]'::jsonb, true),
        '{pendingSuddenWar}',
        round_result,
        true
      )
    WHERE id = target_match_id;

    RETURN round_result;
  END IF;

  IF match_row.current_phase = 'sudden_war' THEN
    SELECT * INTO p1_sudden_move
    FROM public.shadow_war_moves
    WHERE match_id = target_match_id
      AND round_number = match_row.round_number
      AND player_slot = 'player_one'
      AND move_type = 'sudden_war';

    SELECT * INTO p2_sudden_move
    FROM public.shadow_war_moves
    WHERE match_id = target_match_id
      AND round_number = match_row.round_number
      AND player_slot = 'player_two'
      AND move_type = 'sudden_war';

    IF p1_sudden_move.id IS NULL OR p2_sudden_move.id IS NULL THEN
      RAISE EXCEPTION 'Both players must lock sudden-war cards before reveal';
    END IF;

    IF (p1_sudden_move.payload->'card'->>'rank')::integer > (p2_sudden_move.payload->'card'->>'rank')::integer THEN
      p1_round_winner := true;
      p2_round_winner := false;
      round_winner_label := 'player_one';
    ELSIF (p2_sudden_move.payload->'card'->>'rank')::integer > (p1_sudden_move.payload->'card'->>'rank')::integer THEN
      p1_round_winner := false;
      p2_round_winner := true;
      round_winner_label := 'player_two';
    ELSE
      p1_round_winner := false;
      p2_round_winner := false;
      round_winner_label := 'draw';
    END IF;

    sudden_war_result := jsonb_build_object(
      'playerOneCard', p1_sudden_move.payload->'card',
      'playerTwoCard', p2_sudden_move.payload->'card',
      'playerOneStrength', (p1_sudden_move.payload->'card'->>'rank')::integer,
      'playerTwoStrength', (p2_sudden_move.payload->'card'->>'rank')::integer,
      'winner', CASE WHEN round_winner_label = 'draw' THEN 'contested' ELSE round_winner_label END
    );
  ELSE
    round_winner_label := CASE WHEN p1_round_winner THEN 'player_one' WHEN p2_round_winner THEN 'player_two' ELSE 'draw' END;
  END IF;

  next_p1_score := match_row.player_one_score + CASE WHEN p1_round_winner THEN 1 ELSE 0 END;
  next_p2_score := match_row.player_two_score + CASE WHEN p2_round_winner THEN 1 ELSE 0 END;

  IF next_p1_score >= match_row.target_score THEN
    final_winner := session_row.player_one_id;
    final_loser := session_row.player_two_id;
  ELSIF next_p2_score >= match_row.target_score THEN
    final_winner := session_row.player_two_id;
    final_loser := session_row.player_one_id;
  END IF;

  round_result := jsonb_build_object(
    'roundNumber', match_row.round_number,
    'resolvedAt', now(),
    'roundWinner', round_winner_label,
    'needsSuddenWar', false,
    'suddenWar', sudden_war_result,
    'laneResults', jsonb_build_array(
      jsonb_build_object('lane', 'left', 'winner', winners[1], 'playerOneStrength', p1_strength[1], 'playerTwoStrength', p2_strength[1], 'playerOneCard', p1_move.payload->'left', 'playerTwoCard', p2_move.payload->'left'),
      jsonb_build_object('lane', 'center', 'winner', winners[2], 'playerOneStrength', p1_strength[2], 'playerTwoStrength', p2_strength[2], 'playerOneCard', p1_move.payload->'center', 'playerTwoCard', p2_move.payload->'center'),
      jsonb_build_object('lane', 'right', 'winner', winners[3], 'playerOneStrength', p1_strength[3], 'playerTwoStrength', p2_strength[3], 'playerOneCard', p1_move.payload->'right', 'playerTwoCard', p2_move.payload->'right')
    ),
    'postRound', jsonb_build_object('playerOneScoutBonus', p1_scout_bonus, 'playerTwoScoutBonus', p2_scout_bonus),
    'notes', jsonb_build_array(
      CASE
        WHEN sudden_war_result IS NULL THEN 'Server resolved hidden formations after both players locked.'
        ELSE 'Sudden war resolved with each player revealing one reserve card.'
      END
    )
  );

  UPDATE public.shadow_war_player_states
  SET state = public.shadow_war_advance_player_state_with_extras(
    jsonb_set(p1_state.state, '{scoutBonusDraws}', to_jsonb(p1_scout_bonus), true),
    p1_move.payload,
    CASE WHEN p1_sudden_move.id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p1_sudden_move.payload->'card') END
  )
  WHERE match_id = target_match_id AND player_slot = 'player_one';

  UPDATE public.shadow_war_player_states
  SET state = public.shadow_war_advance_player_state_with_extras(
    jsonb_set(p2_state.state, '{scoutBonusDraws}', to_jsonb(p2_scout_bonus), true),
    p2_move.payload,
    CASE WHEN p2_sudden_move.id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p2_sudden_move.payload->'card') END
  )
  WHERE match_id = target_match_id AND player_slot = 'player_two';

  next_state := match_row.state - 'pendingSuddenWar';
  next_state := jsonb_set(next_state, '{lockedPlayerIds}', '[]'::jsonb, true);
  next_state := jsonb_set(next_state, '{lockedSuddenWarPlayerIds}', '[]'::jsonb, true);
  next_state := jsonb_set(
    next_state,
    '{rounds}',
    COALESCE(match_row.state->'rounds', '[]'::jsonb) || jsonb_build_array(round_result),
    true
  );

  UPDATE public.shadow_war_matches
  SET
    player_one_score = next_p1_score,
    player_two_score = next_p2_score,
    round_number = CASE WHEN final_winner IS NULL THEN match_row.round_number + 1 ELSE match_row.round_number END,
    status = CASE WHEN final_winner IS NULL THEN 'active' ELSE 'completed' END,
    current_phase = CASE WHEN final_winner IS NULL THEN 'placement' ELSE 'complete' END,
    completed_at = CASE WHEN final_winner IS NULL THEN NULL ELSE now() END,
    state = next_state
  WHERE id = target_match_id;

  IF final_winner IS NOT NULL THEN
    UPDATE public.game_sessions
    SET
      status = 'completed',
      winner_id = final_winner,
      loser_id = final_loser,
      completed_at = now()
    WHERE id = match_row.session_id;
  END IF;

  RETURN round_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_shadow_checkers_move(target_match_id uuid, piece_id text, move_path jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  match_row public.shadow_checkers_matches%ROWTYPE;
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

  PERFORM 1
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
$function$;

CREATE OR REPLACE FUNCTION public.rematch_shadow_checkers_match(target_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  old_match public.shadow_checkers_matches%ROWTYPE;
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
$function$;
