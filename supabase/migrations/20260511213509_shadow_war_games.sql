/*
  # Shadow War games platform

  Adds the first multiplayer games domain for Shadow Chat. Shadow War uses
  server-owned session, match, queue, hidden move, and private player-state
  tables so active players cannot directly write scores or inspect opponent
  placements before reveal.
*/

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type text NOT NULL DEFAULT 'shadow_war' CHECK (game_type = 'shadow_war'),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  player_one_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  player_two_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  winner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  loser_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  current_match_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (player_two_id IS NULL OR player_two_id <> player_one_id)
);

CREATE INDEX IF NOT EXISTS game_sessions_lobby_idx
  ON public.game_sessions (game_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS game_sessions_player_idx
  ON public.game_sessions (player_one_id, player_two_id, status, updated_at DESC);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shadow_war_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed', 'cancelled')),
  round_number integer NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  target_score integer NOT NULL DEFAULT 5 CHECK (target_score BETWEEN 1 AND 9),
  player_one_score integer NOT NULL DEFAULT 0 CHECK (player_one_score >= 0),
  player_two_score integer NOT NULL DEFAULT 0 CHECK (player_two_score >= 0),
  current_phase text NOT NULL DEFAULT 'placement' CHECK (current_phase IN ('placement', 'reveal', 'complete')),
  state jsonb NOT NULL DEFAULT jsonb_build_object('lockedPlayerIds', '[]'::jsonb, 'rounds', '[]'::jsonb),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS shadow_war_matches_session_idx
  ON public.shadow_war_matches (session_id, created_at DESC);

ALTER TABLE public.shadow_war_matches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_current_match_id_fkey;

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_current_match_id_fkey
  FOREIGN KEY (current_match_id) REFERENCES public.shadow_war_matches(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.shadow_war_player_states (
  match_id uuid NOT NULL REFERENCES public.shadow_war_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  player_slot text NOT NULL CHECK (player_slot IN ('player_one', 'player_two')),
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS shadow_war_player_states_match_slot_idx
  ON public.shadow_war_player_states (match_id, player_slot);

ALTER TABLE public.shadow_war_player_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shadow_war_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.shadow_war_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  player_slot text NOT NULL CHECK (player_slot IN ('player_one', 'player_two')),
  round_number integer NOT NULL CHECK (round_number >= 1),
  move_type text NOT NULL DEFAULT 'placement' CHECK (move_type IN ('placement')),
  payload jsonb NOT NULL,
  revealed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id, round_number, move_type)
);

CREATE INDEX IF NOT EXISTS shadow_war_moves_match_round_idx
  ON public.shadow_war_moves (match_id, round_number, move_type);

ALTER TABLE public.shadow_war_moves ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.game_session_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 1),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'invited', 'joined', 'skipped', 'left')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_session_queue_session_position_idx
  ON public.game_session_queue (session_id, status, position, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS game_session_queue_one_active_entry_idx
  ON public.game_session_queue (session_id, user_id)
  WHERE status IN ('queued', 'invited');

ALTER TABLE public.game_session_queue ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_game_sessions_updated_at ON public.game_sessions;
CREATE TRIGGER update_game_sessions_updated_at
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shadow_war_matches_updated_at ON public.shadow_war_matches;
CREATE TRIGGER update_shadow_war_matches_updated_at
  BEFORE UPDATE ON public.shadow_war_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_game_session_queue_updated_at ON public.game_session_queue;
CREATE TRIGGER update_game_session_queue_updated_at
  BEFORE UPDATE ON public.game_session_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_shadow_war_session_participant(target_session_id uuid, target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.game_sessions sessions
    WHERE sessions.id = target_session_id
      AND target_user_id IS NOT NULL
      AND target_user_id IN (sessions.player_one_id, sessions.player_two_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.shadow_war_create_deck(slot_name text)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  WITH roster(card_id, name, rank, archetype, ability_key, description) AS (
    VALUES
      ('scout', 'Scout', 1, 'Recon', 'intel', 'If Scout loses its lane, draw 1 extra card next round.'),
      ('spy', 'Spy', 2, 'Infiltrator', 'sabotage', 'If Spy faces rank 8, 9, or 10, reduce that enemy by 3.'),
      ('squire', 'Squire', 3, 'Support', 'rally', 'Gives +1 to the weakest adjacent friendly lane with lower base rank.'),
      ('archer', 'Archer', 4, 'Marksman', 'volley', 'Gives +1 to the lane on the right, or Center if played Right.'),
      ('shieldbearer', 'Shieldbearer', 5, 'Defender', 'guard', 'If this lane would lose by 1 or 2, it becomes contested.'),
      ('knight', 'Knight', 6, 'Vanguard', 'stable', 'Reliable raw strength with no timing risk.'),
      ('captain', 'Captain', 7, 'Commander', 'command', 'Gives +1 to the weakest friendly lane this round.'),
      ('champion', 'Champion', 8, 'Duelist', 'duelist', 'Gains +2 when facing an enemy with higher base rank.'),
      ('warlord', 'Warlord', 9, 'Overlord', 'dominate', 'If Warlord has raw advantage, gives +1 to the weakest adjacent friendly lane.'),
      ('sovereign', 'Sovereign', 10, 'Crown', 'crown', 'Highest raw power, but vulnerable to Spy sabotage.')
  ),
  cards AS (
    SELECT
      jsonb_build_object(
        'instanceId', gen_random_uuid()::text,
        'cardId', roster.card_id,
        'name', roster.name,
        'rank', roster.rank,
        'archetype', roster.archetype,
        'abilityKey', roster.ability_key,
        'description', roster.description,
        'imageUrl', '/games/shadow-war/cards/' || roster.card_id || '.webp'
      ) AS card,
      random() AS shuffle_key
    FROM roster
    CROSS JOIN generate_series(1, 2) copy_index
  )
  SELECT COALESCE(jsonb_agg(card ORDER BY shuffle_key), '[]'::jsonb)
  FROM cards;
$$;

CREATE OR REPLACE FUNCTION public.shadow_war_create_player_state(target_user_id uuid, slot_name text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  full_deck jsonb := public.shadow_war_create_deck(slot_name);
  hand_cards jsonb;
  remaining_deck jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
  INTO hand_cards
  FROM jsonb_array_elements(full_deck) WITH ORDINALITY
  WHERE ordinality <= 5;

  SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
  INTO remaining_deck
  FROM jsonb_array_elements(full_deck) WITH ORDINALITY
  WHERE ordinality > 5;

  RETURN jsonb_build_object(
    'userId', target_user_id,
    'deck', remaining_deck,
    'hand', hand_cards,
    'discard', '[]'::jsonb,
    'scoutBonusDraws', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_shadow_war_session()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  created_session_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.game_sessions (created_by, player_one_id)
  VALUES (current_user_id, current_user_id)
  RETURNING id INTO created_session_id;

  RETURN created_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_shadow_war_session(target_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  session_row public.game_sessions%ROWTYPE;
  created_match_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO session_row
  FROM public.game_sessions
  WHERE id = target_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel is not available';
  END IF;

  IF session_row.player_one_id = current_user_id THEN
    RAISE EXCEPTION 'You are already seated in this duel';
  END IF;

  IF session_row.status <> 'waiting' OR session_row.player_two_id IS NOT NULL THEN
    RAISE EXCEPTION 'Duel already has two players';
  END IF;

  INSERT INTO public.shadow_war_matches (session_id, status, current_phase)
  VALUES (target_session_id, 'active', 'placement')
  RETURNING id INTO created_match_id;

  INSERT INTO public.shadow_war_player_states (match_id, user_id, player_slot, state)
  VALUES
    (created_match_id, session_row.player_one_id, 'player_one', public.shadow_war_create_player_state(session_row.player_one_id, 'player_one')),
    (created_match_id, current_user_id, 'player_two', public.shadow_war_create_player_state(current_user_id, 'player_two'));

  UPDATE public.game_sessions
  SET
    status = 'active',
    player_two_id = current_user_id,
    current_match_id = created_match_id
  WHERE id = target_session_id;

  RETURN jsonb_build_object('sessionId', target_session_id, 'matchId', created_match_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_shadow_war_session(target_session_id uuid)
RETURNS public.game_session_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  session_row public.game_sessions%ROWTYPE;
  next_position integer;
  queue_row public.game_session_queue%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO session_row
  FROM public.game_sessions
  WHERE id = target_session_id
  FOR UPDATE;

  IF NOT FOUND OR session_row.status <> 'active' OR session_row.player_two_id IS NULL THEN
    RAISE EXCEPTION 'Queue is available only after a duel has two active players';
  END IF;

  IF current_user_id IN (session_row.player_one_id, session_row.player_two_id) THEN
    RAISE EXCEPTION 'Players cannot join their own queue';
  END IF;

  SELECT COALESCE(max(position), 0) + 1
  INTO next_position
  FROM public.game_session_queue
  WHERE session_id = target_session_id
    AND status IN ('queued', 'invited');

  INSERT INTO public.game_session_queue (session_id, user_id, position)
  VALUES (target_session_id, current_user_id, next_position)
  ON CONFLICT (session_id, user_id) WHERE status IN ('queued', 'invited') DO UPDATE
  SET updated_at = now()
  RETURNING * INTO queue_row;

  RETURN queue_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_shadow_war_queue(target_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.game_session_queue
  SET status = 'left'
  WHERE session_id = target_session_id
    AND user_id = current_user_id
    AND status IN ('queued', 'invited');
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_war_card_from_hand(player_state jsonb, card_instance_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT value
  FROM jsonb_array_elements(COALESCE(player_state->'hand', '[]'::jsonb)) AS hand_card(value)
  WHERE value->>'instanceId' = card_instance_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.shadow_war_advance_player_state(player_state jsonb, placement_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  selected_ids text[];
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
  selected_ids := ARRAY[
    placement_payload->'left'->>'instanceId',
    placement_payload->'center'->>'instanceId',
    placement_payload->'right'->>'instanceId'
  ];

  SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
  INTO remaining_hand
  FROM jsonb_array_elements(COALESCE(player_state->'hand', '[]'::jsonb)) WITH ORDINALITY
  WHERE NOT (value->>'instanceId' = ANY(selected_ids));

  played_cards := jsonb_build_array(
    placement_payload->'left',
    placement_payload->'center',
    placement_payload->'right'
  );

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

CREATE OR REPLACE FUNCTION public.submit_shadow_war_placement(
  target_match_id uuid,
  left_card_id text,
  center_card_id text,
  right_card_id text
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
  left_card jsonb;
  center_card jsonb;
  right_card jsonb;
  placement_payload jsonb;
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

  IF NOT FOUND OR match_row.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;

  SELECT *
  INTO session_row
  FROM public.game_sessions
  WHERE id = match_row.session_id
  FOR UPDATE;

  IF current_user_id NOT IN (session_row.player_one_id, session_row.player_two_id) THEN
    RAISE EXCEPTION 'Only active players can submit a formation';
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

  IF left_card_id IS NULL OR center_card_id IS NULL OR right_card_id IS NULL
    OR cardinality(ARRAY(SELECT DISTINCT card_id FROM unnest(ARRAY[left_card_id, center_card_id, right_card_id]) AS ids(card_id))) <> 3 THEN
    RAISE EXCEPTION 'Place three unique cards';
  END IF;

  left_card := public.shadow_war_card_from_hand(player_state_row.state, left_card_id);
  center_card := public.shadow_war_card_from_hand(player_state_row.state, center_card_id);
  right_card := public.shadow_war_card_from_hand(player_state_row.state, right_card_id);

  IF left_card IS NULL OR center_card IS NULL OR right_card IS NULL THEN
    RAISE EXCEPTION 'Formation contains a card that is not in your hand';
  END IF;

  placement_payload := jsonb_build_object(
    'left', left_card,
    'center', center_card,
    'right', right_card
  );

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
    'placement',
    placement_payload
  );

  SELECT count(*)::integer
  INTO locked_count
  FROM public.shadow_war_moves
  WHERE match_id = target_match_id
    AND round_number = match_row.round_number
    AND move_type = 'placement';

  UPDATE public.shadow_war_matches
  SET
    current_phase = CASE WHEN locked_count >= 2 THEN 'reveal' ELSE 'placement' END,
    state = jsonb_set(
      state,
      '{lockedPlayerIds}',
      (
        SELECT COALESCE(jsonb_agg(user_id::text ORDER BY created_at), '[]'::jsonb)
        FROM public.shadow_war_moves
        WHERE match_id = target_match_id
          AND round_number = match_row.round_number
          AND move_type = 'placement'
      ),
      true
    )
  WHERE id = target_match_id;

  IF locked_count >= 2 THEN
    UPDATE public.shadow_war_moves
    SET revealed_at = now()
    WHERE match_id = target_match_id
      AND round_number = match_row.round_number
      AND move_type = 'placement'
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
        winners := winners || 'contested';
      ELSE
        winners := winners || 'player_one';
        p1_wins := p1_wins + 1;
        IF p2_ability[lane_index] = 'intel' THEN
          p2_scout_bonus := p2_scout_bonus + 1;
        END IF;
      END IF;
    ELSIF p2_strength[lane_index] > p1_strength[lane_index] THEN
      margin := p2_strength[lane_index] - p1_strength[lane_index];
      IF p1_ability[lane_index] = 'guard' AND margin <= 2 THEN
        winners := winners || 'contested';
      ELSE
        winners := winners || 'player_two';
        p2_wins := p2_wins + 1;
        IF p1_ability[lane_index] = 'intel' THEN
          p1_scout_bonus := p1_scout_bonus + 1;
        END IF;
      END IF;
    ELSE
      winners := winners || 'contested';
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

CREATE OR REPLACE FUNCTION public.shadow_war_create_active_rematch(
  first_player_id uuid,
  second_player_id uuid,
  creator_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_session_id uuid;
  new_match_id uuid;
BEGIN
  IF first_player_id IS NULL OR second_player_id IS NULL OR first_player_id = second_player_id THEN
    RAISE EXCEPTION 'Two distinct players are required';
  END IF;

  INSERT INTO public.game_sessions (
    status,
    created_by,
    player_one_id,
    player_two_id
  )
  VALUES ('active', creator_id, first_player_id, second_player_id)
  RETURNING id INTO new_session_id;

  INSERT INTO public.shadow_war_matches (session_id, status, current_phase)
  VALUES (new_session_id, 'active', 'placement')
  RETURNING id INTO new_match_id;

  INSERT INTO public.shadow_war_player_states (match_id, user_id, player_slot, state)
  VALUES
    (new_match_id, first_player_id, 'player_one', public.shadow_war_create_player_state(first_player_id, 'player_one')),
    (new_match_id, second_player_id, 'player_two', public.shadow_war_create_player_state(second_player_id, 'player_two'));

  UPDATE public.game_sessions
  SET current_match_id = new_match_id
  WHERE id = new_session_id;

  RETURN jsonb_build_object('sessionId', new_session_id, 'matchId', new_match_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rematch_shadow_war_session(target_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  session_row public.game_sessions%ROWTYPE;
  queued_challengers integer;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO session_row
  FROM public.game_sessions
  WHERE id = target_session_id
  FOR UPDATE;

  IF NOT FOUND OR session_row.status <> 'completed' THEN
    RAISE EXCEPTION 'Completed duel is required';
  END IF;

  IF current_user_id NOT IN (session_row.player_one_id, session_row.player_two_id) THEN
    RAISE EXCEPTION 'Only prior players can request rematch';
  END IF;

  SELECT count(*)::integer
  INTO queued_challengers
  FROM public.game_session_queue
  WHERE session_id = target_session_id
    AND status = 'queued';

  IF queued_challengers > 0 THEN
    RAISE EXCEPTION 'A queued challenger is waiting';
  END IF;

  RETURN public.shadow_war_create_active_rematch(session_row.player_one_id, session_row.player_two_id, current_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_shadow_war_next_challenger(target_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  session_row public.game_sessions%ROWTYPE;
  queue_row public.game_session_queue%ROWTYPE;
  result jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO session_row
  FROM public.game_sessions
  WHERE id = target_session_id
  FOR UPDATE;

  IF NOT FOUND OR session_row.status <> 'completed' OR session_row.winner_id IS NULL THEN
    RAISE EXCEPTION 'Completed duel with a winner is required';
  END IF;

  IF current_user_id <> session_row.winner_id THEN
    RAISE EXCEPTION 'Only the standing winner can invite the next challenger';
  END IF;

  SELECT *
  INTO queue_row
  FROM public.game_session_queue
  WHERE session_id = target_session_id
    AND status = 'queued'
  ORDER BY position ASC, created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF queue_row.id IS NULL THEN
    RAISE EXCEPTION 'No queued challenger is available';
  END IF;

  result := public.shadow_war_create_active_rematch(session_row.winner_id, queue_row.user_id, current_user_id);

  UPDATE public.game_session_queue
  SET status = 'joined'
  WHERE id = queue_row.id;

  RETURN result;
END;
$$;

DROP POLICY IF EXISTS "Authenticated users can read game sessions" ON public.game_sessions;
CREATE POLICY "Authenticated users can read game sessions"
ON public.game_sessions
FOR SELECT
TO authenticated
USING (status <> 'cancelled');

DROP POLICY IF EXISTS "Authenticated users can read shadow war matches" ON public.shadow_war_matches;
CREATE POLICY "Authenticated users can read shadow war matches"
ON public.shadow_war_matches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.game_sessions sessions
    WHERE sessions.id = shadow_war_matches.session_id
      AND sessions.status <> 'cancelled'
  )
);

DROP POLICY IF EXISTS "Users can read own shadow war player state" ON public.shadow_war_player_states;
CREATE POLICY "Users can read own shadow war player state"
ON public.shadow_war_player_states
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can read allowed shadow war moves" ON public.shadow_war_moves;
CREATE POLICY "Users can read allowed shadow war moves"
ON public.shadow_war_moves
FOR SELECT
TO authenticated
USING (
  (select auth.uid()) = user_id
  OR (
    revealed_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.shadow_war_matches matches
      JOIN public.game_sessions sessions ON sessions.id = matches.session_id
      WHERE matches.id = shadow_war_moves.match_id
        AND (select auth.uid()) IN (sessions.player_one_id, sessions.player_two_id)
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can read game queues" ON public.game_session_queue;
CREATE POLICY "Authenticated users can read game queues"
ON public.game_session_queue
FOR SELECT
TO authenticated
USING (
  status <> 'left'
  AND EXISTS (
    SELECT 1
    FROM public.game_sessions sessions
    WHERE sessions.id = game_session_queue.session_id
      AND sessions.status <> 'cancelled'
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_sessions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shadow_war_matches'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_war_matches;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shadow_war_moves'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_war_moves;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_session_queue'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.game_session_queue;
    END IF;
  END IF;
END $$;

GRANT SELECT ON public.game_sessions TO authenticated;
GRANT SELECT ON public.shadow_war_matches TO authenticated;
GRANT SELECT ON public.shadow_war_player_states TO authenticated;
GRANT SELECT ON public.shadow_war_moves TO authenticated;
GRANT SELECT ON public.game_session_queue TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_shadow_war_session_participant(uuid, uuid) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_war_create_deck(text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_war_create_player_state(uuid, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_shadow_war_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_shadow_war_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_shadow_war_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_shadow_war_queue(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.shadow_war_card_from_hand(jsonb, text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_war_advance_player_state(jsonb, jsonb) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.submit_shadow_war_placement(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_shadow_war_round(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.shadow_war_create_active_rematch(uuid, uuid, uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rematch_shadow_war_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_shadow_war_next_challenger(uuid) TO authenticated;
