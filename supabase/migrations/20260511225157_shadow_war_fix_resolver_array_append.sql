-- Fix Shadow War SQL resolver text-array appends found by the DB smoke test.
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
  p1_state public.shadow_war_player_states%ROWTYPE;
  p2_state public.shadow_war_player_states%ROWTYPE;
  lanes text[] := ARRAY['left', 'center', 'right'];
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
  round_result jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO match_row
  FROM public.shadow_war_matches
  WHERE id = target_match_id
  FOR UPDATE;

  IF NOT FOUND OR match_row.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active';
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
    'roundWinner', CASE WHEN p1_round_winner THEN 'player_one' WHEN p2_round_winner THEN 'player_two' ELSE 'draw' END,
    'laneResults', jsonb_build_array(
      jsonb_build_object('lane', 'left', 'winner', winners[1], 'playerOneStrength', p1_strength[1], 'playerTwoStrength', p2_strength[1], 'playerOneCard', p1_move.payload->'left', 'playerTwoCard', p2_move.payload->'left'),
      jsonb_build_object('lane', 'center', 'winner', winners[2], 'playerOneStrength', p1_strength[2], 'playerTwoStrength', p2_strength[2], 'playerOneCard', p1_move.payload->'center', 'playerTwoCard', p2_move.payload->'center'),
      jsonb_build_object('lane', 'right', 'winner', winners[3], 'playerOneStrength', p1_strength[3], 'playerTwoStrength', p2_strength[3], 'playerOneCard', p1_move.payload->'right', 'playerTwoCard', p2_move.payload->'right')
    ),
    'notes', jsonb_build_array('Server resolved hidden formations after both players locked.')
  );

  UPDATE public.shadow_war_player_states
  SET state = public.shadow_war_advance_player_state(
    jsonb_set(p1_state.state, '{scoutBonusDraws}', to_jsonb(p1_scout_bonus), true),
    p1_move.payload
  )
  WHERE match_id = target_match_id AND player_slot = 'player_one';

  UPDATE public.shadow_war_player_states
  SET state = public.shadow_war_advance_player_state(
    jsonb_set(p2_state.state, '{scoutBonusDraws}', to_jsonb(p2_scout_bonus), true),
    p2_move.payload
  )
  WHERE match_id = target_match_id AND player_slot = 'player_two';

  UPDATE public.shadow_war_matches
  SET
    player_one_score = next_p1_score,
    player_two_score = next_p2_score,
    round_number = CASE WHEN final_winner IS NULL THEN match_row.round_number + 1 ELSE match_row.round_number END,
    status = CASE WHEN final_winner IS NULL THEN 'active' ELSE 'completed' END,
    current_phase = CASE WHEN final_winner IS NULL THEN 'placement' ELSE 'complete' END,
    completed_at = CASE WHEN final_winner IS NULL THEN NULL ELSE now() END,
    state = jsonb_set(
      jsonb_set(
        match_row.state,
        '{lockedPlayerIds}',
        '[]'::jsonb,
        true
      ),
      '{rounds}',
      COALESCE(match_row.state->'rounds', '[]'::jsonb) || jsonb_build_array(round_result),
      true
    )
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shadow_war_player_states'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_war_player_states;
    END IF;
  END IF;
END $$;
