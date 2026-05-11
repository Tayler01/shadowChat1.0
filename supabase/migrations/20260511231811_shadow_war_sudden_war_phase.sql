-- Add player-selected sudden-war tie breakers for Shadow War.

ALTER TABLE public.shadow_war_matches
  DROP CONSTRAINT IF EXISTS shadow_war_matches_current_phase_check;

ALTER TABLE public.shadow_war_matches
  ADD CONSTRAINT shadow_war_matches_current_phase_check
  CHECK (current_phase IN ('placement', 'reveal', 'sudden_war', 'complete'));

ALTER TABLE public.shadow_war_moves
  DROP CONSTRAINT IF EXISTS shadow_war_moves_move_type_check;

ALTER TABLE public.shadow_war_moves
  ADD CONSTRAINT shadow_war_moves_move_type_check
  CHECK (move_type IN ('placement', 'sudden_war'));

CREATE OR REPLACE FUNCTION public.shadow_war_advance_player_state_with_extras(
  player_state jsonb,
  placement_payload jsonb,
  extra_cards jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  selected_ids text[];
  extra_ids text[];
  old_discard jsonb;
  remaining_hand jsonb;
  played_cards jsonb;
  next_discard jsonb;
  bonus_draw_count integer := 0;
  draw_count integer;
  deck_draw_count integer;
  discard_draw_count integer;
  drawn_cards jsonb;
  drawn_from_discard jsonb;
  remaining_deck jsonb;
  reshuffled_deck jsonb;
BEGIN
  SELECT COALESCE(array_agg(value->>'instanceId'), ARRAY[]::text[])
  INTO extra_ids
  FROM jsonb_array_elements(COALESCE(extra_cards, '[]'::jsonb)) AS extra_card(value);

  selected_ids := ARRAY[
    placement_payload->'left'->>'instanceId',
    placement_payload->'center'->>'instanceId',
    placement_payload->'right'->>'instanceId'
  ] || COALESCE(extra_ids, ARRAY[]::text[]);

  SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
  INTO remaining_hand
  FROM jsonb_array_elements(COALESCE(player_state->'hand', '[]'::jsonb)) WITH ORDINALITY
  WHERE NOT (value->>'instanceId' = ANY(selected_ids));

  played_cards := jsonb_build_array(
    placement_payload->'left',
    placement_payload->'center',
    placement_payload->'right'
  ) || COALESCE(extra_cards, '[]'::jsonb);

  old_discard := COALESCE(player_state->'discard', '[]'::jsonb);
  bonus_draw_count := GREATEST(0, COALESCE((player_state->>'scoutBonusDraws')::integer, 0));
  draw_count := GREATEST(0, 5 + bonus_draw_count - jsonb_array_length(remaining_hand));
  deck_draw_count := LEAST(draw_count, jsonb_array_length(COALESCE(player_state->'deck', '[]'::jsonb)));

  SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
  INTO drawn_cards
  FROM jsonb_array_elements(COALESCE(player_state->'deck', '[]'::jsonb)) WITH ORDINALITY
  WHERE ordinality <= deck_draw_count;

  SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
  INTO remaining_deck
  FROM jsonb_array_elements(COALESCE(player_state->'deck', '[]'::jsonb)) WITH ORDINALITY
  WHERE ordinality > deck_draw_count;

  discard_draw_count := GREATEST(0, draw_count - deck_draw_count);

  IF discard_draw_count > 0 AND jsonb_array_length(old_discard) > 0 THEN
    WITH shuffled AS (
      SELECT
        value,
        row_number() OVER (ORDER BY random()) AS rn
      FROM jsonb_array_elements(old_discard) AS old_card(value)
    )
    SELECT
      COALESCE(jsonb_agg(value ORDER BY rn) FILTER (WHERE rn <= discard_draw_count), '[]'::jsonb),
      COALESCE(jsonb_agg(value ORDER BY rn) FILTER (WHERE rn > discard_draw_count), '[]'::jsonb)
    INTO drawn_from_discard, reshuffled_deck
    FROM shuffled;
  ELSE
    drawn_from_discard := '[]'::jsonb;
    reshuffled_deck := '[]'::jsonb;
  END IF;

  next_discard := CASE
    WHEN discard_draw_count > 0 THEN played_cards
    ELSE old_discard || played_cards
  END;

  RETURN jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(player_state, '{hand}', remaining_hand || drawn_cards || drawn_from_discard, true),
        '{deck}',
        remaining_deck || reshuffled_deck,
        true
      ),
      '{discard}',
      next_discard,
      true
    ),
    '{scoutBonusDraws}',
    '0'::jsonb,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_shadow_war_sudden_war_card(
  target_match_id uuid,
  card_instance_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  match_row public.shadow_war_matches%ROWTYPE;
  session_row public.game_sessions%ROWTYPE;
  player_state_row public.shadow_war_player_states%ROWTYPE;
  placement_move public.shadow_war_moves%ROWTYPE;
  selected_card jsonb;
  placed_ids text[];
  locked_count integer;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO match_row
  FROM public.shadow_war_matches
  WHERE id = target_match_id
  FOR UPDATE;

  IF NOT FOUND OR match_row.status <> 'active' OR match_row.current_phase <> 'sudden_war' THEN
    RAISE EXCEPTION 'Sudden war is not active';
  END IF;

  SELECT *
  INTO session_row
  FROM public.game_sessions
  WHERE id = match_row.session_id
  FOR UPDATE;

  IF current_user_id NOT IN (session_row.player_one_id, session_row.player_two_id) THEN
    RAISE EXCEPTION 'Only active players can submit a sudden-war card';
  END IF;

  SELECT *
  INTO player_state_row
  FROM public.shadow_war_player_states
  WHERE match_id = target_match_id
    AND user_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player state is not available';
  END IF;

  SELECT *
  INTO placement_move
  FROM public.shadow_war_moves
  WHERE match_id = target_match_id
    AND user_id = current_user_id
    AND round_number = match_row.round_number
    AND move_type = 'placement';

  IF placement_move.id IS NULL THEN
    RAISE EXCEPTION 'Lock a formation before sudden war';
  END IF;

  placed_ids := ARRAY[
    placement_move.payload->'left'->>'instanceId',
    placement_move.payload->'center'->>'instanceId',
    placement_move.payload->'right'->>'instanceId'
  ];

  IF card_instance_id IS NULL OR card_instance_id = ANY(placed_ids) THEN
    RAISE EXCEPTION 'Choose an unplayed reserve card';
  END IF;

  selected_card := public.shadow_war_card_from_hand(player_state_row.state, card_instance_id);

  IF selected_card IS NULL THEN
    RAISE EXCEPTION 'Sudden-war card is not in your hand';
  END IF;

  INSERT INTO public.shadow_war_moves (
    match_id,
    user_id,
    player_slot,
    round_number,
    move_type,
    payload
  )
  VALUES (
    target_match_id,
    current_user_id,
    player_state_row.player_slot,
    match_row.round_number,
    'sudden_war',
    jsonb_build_object('card', selected_card)
  );

  SELECT count(*)::integer
  INTO locked_count
  FROM public.shadow_war_moves
  WHERE match_id = target_match_id
    AND round_number = match_row.round_number
    AND move_type = 'sudden_war';

  UPDATE public.shadow_war_matches
  SET state = jsonb_set(
    state,
    '{lockedSuddenWarPlayerIds}',
    (
      SELECT COALESCE(jsonb_agg(user_id::text ORDER BY created_at), '[]'::jsonb)
      FROM public.shadow_war_moves
      WHERE match_id = target_match_id
        AND round_number = match_row.round_number
        AND move_type = 'sudden_war'
    ),
    true
  )
  WHERE id = target_match_id;

  IF locked_count >= 2 THEN
    UPDATE public.shadow_war_moves
    SET revealed_at = now()
    WHERE match_id = target_match_id
      AND round_number = match_row.round_number
      AND move_type = 'sudden_war'
      AND revealed_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'matchId', target_match_id,
    'roundNumber', match_row.round_number,
    'lockedCount', locked_count,
    'revealed', locked_count >= 2
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_shadow_war_round(target_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  lane_index integer;
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
$$;

GRANT EXECUTE ON FUNCTION public.submit_shadow_war_sudden_war_card(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.shadow_war_advance_player_state_with_extras(jsonb, jsonb, jsonb) FROM PUBLIC, authenticated, anon;
