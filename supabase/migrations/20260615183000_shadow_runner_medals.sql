/*
  # Shadow Runner completion medals

  Adds public identity medals for Shadow Runner:
  - runner medal: completed the tutorial route
  - knight medal: completed the currently hardest available campaign route

  The knight medal is derived from the level catalog instead of being permanent.
  When a future migration marks a harder level available, the catalog trigger
  recalculates every user and revokes stale knight medals in realtime through
  the existing public.users row updates.
*/

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS shadow_runner_sprint_medal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shadow_runner_knight_medal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shadow_runner_knight_level_id text;

COMMENT ON COLUMN public.users.shadow_runner_sprint_medal IS
  'Visible Shadow Runner badge awarded after completing the tutorial route.';

COMMENT ON COLUMN public.users.shadow_runner_knight_medal IS
  'Visible Shadow Runner badge awarded after completing the currently hardest available route.';

COMMENT ON COLUMN public.users.shadow_runner_knight_level_id IS
  'Current hardest Shadow Runner level id that awarded the knight medal, or null when not held.';

REVOKE UPDATE (shadow_runner_sprint_medal, shadow_runner_knight_medal, shadow_runner_knight_level_id)
  ON public.users FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.shadow_runner_level_catalog (
  level_id text PRIMARY KEY,
  level_number integer,
  title text NOT NULL,
  medal_rank integer NOT NULL DEFAULT 0,
  is_tutorial boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT false,
  is_medal_candidate boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shadow_runner_level_catalog_level_number_nonnegative
    CHECK (level_number IS NULL OR level_number >= 0),
  CONSTRAINT shadow_runner_level_catalog_medal_rank_nonnegative
    CHECK (medal_rank >= 0),
  CONSTRAINT shadow_runner_level_catalog_tutorial_not_medal_candidate
    CHECK (NOT is_tutorial OR is_medal_candidate IS FALSE)
);

COMMENT ON TABLE public.shadow_runner_level_catalog IS
  'Shadow Runner route catalog used to derive completion medals and future hardest-level revokes.';

CREATE TABLE IF NOT EXISTS public.shadow_runner_level_completions (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  level_id text NOT NULL REFERENCES public.shadow_runner_level_catalog(level_id) ON UPDATE CASCADE,
  score integer CHECK (score IS NULL OR score >= 0),
  coins_collected integer CHECK (coins_collected IS NULL OR coins_collected >= 0),
  total_coins integer CHECK (total_coins IS NULL OR total_coins >= 0),
  enemies_defeated integer CHECK (enemies_defeated IS NULL OR enemies_defeated >= 0),
  total_enemies integer CHECK (total_enemies IS NULL OR total_enemies >= 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  last_reported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, level_id)
);

COMMENT ON TABLE public.shadow_runner_level_completions IS
  'Per-user Shadow Runner completion ledger. Public medals are derived from this table.';

ALTER TABLE public.shadow_runner_level_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_runner_level_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read Shadow Runner level catalog"
  ON public.shadow_runner_level_catalog;
CREATE POLICY "Authenticated users can read Shadow Runner level catalog"
  ON public.shadow_runner_level_catalog
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can read own Shadow Runner completions"
  ON public.shadow_runner_level_completions;
CREATE POLICY "Users can read own Shadow Runner completions"
  ON public.shadow_runner_level_completions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_shadow_runner_level_catalog_updated_at
  ON public.shadow_runner_level_catalog;
CREATE TRIGGER update_shadow_runner_level_catalog_updated_at
  BEFORE UPDATE ON public.shadow_runner_level_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shadow_runner_level_completions_updated_at
  ON public.shadow_runner_level_completions;
CREATE TRIGGER update_shadow_runner_level_completions_updated_at
  BEFORE UPDATE ON public.shadow_runner_level_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.shadow_runner_level_catalog (
  level_id,
  level_number,
  title,
  medal_rank,
  is_tutorial,
  is_available,
  is_medal_candidate
)
VALUES
  ('tutorial', 0, 'Tutorial Run', 0, true, true, false),
  ('level-1', 1, 'East Gate Run', 1, false, true, true),
  ('level-2', 2, 'Lantern Market Roofs', 2, false, true, true),
  ('level-3', 3, 'Ivy Viaduct', 3, false, true, true),
  ('level-4', 4, 'Bell Tower Archives', 4, false, true, true),
  ('level-5', 5, 'Candle Fair Ruins', 5, false, false, true),
  ('level-6', 6, 'Clockmaker Yard', 6, false, false, true),
  ('level-7', 7, 'Moonlit Causeway', 7, false, false, true),
  ('level-8', 8, 'Courier Catacombs', 8, false, false, true),
  ('level-9', 9, 'Captain Gate', 9, false, false, true),
  ('level-10', 10, 'Dawn Relay Spire', 10, false, false, true)
ON CONFLICT (level_id) DO UPDATE
SET
  level_number = EXCLUDED.level_number,
  title = EXCLUDED.title,
  medal_rank = EXCLUDED.medal_rank,
  is_tutorial = EXCLUDED.is_tutorial,
  is_available = public.shadow_runner_level_catalog.is_available OR EXCLUDED.is_available,
  is_medal_candidate = EXCLUDED.is_medal_candidate,
  updated_at = now();

CREATE INDEX IF NOT EXISTS shadow_runner_level_catalog_available_rank_idx
  ON public.shadow_runner_level_catalog (is_available, is_medal_candidate, medal_rank DESC, level_number DESC);

CREATE INDEX IF NOT EXISTS shadow_runner_level_completions_level_idx
  ON public.shadow_runner_level_completions (level_id, user_id);

CREATE OR REPLACE FUNCTION private.refresh_shadow_runner_medals_for_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_hardest_level_id text;
  sprint_awarded boolean := false;
  knight_awarded boolean := false;
  next_knight_level_id text := null;
BEGIN
  IF target_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT catalog.level_id
  INTO current_hardest_level_id
  FROM public.shadow_runner_level_catalog catalog
  WHERE catalog.is_available IS TRUE
    AND catalog.is_medal_candidate IS TRUE
  ORDER BY catalog.medal_rank DESC, catalog.level_number DESC NULLS LAST, catalog.level_id DESC
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.shadow_runner_level_completions completions
    JOIN public.shadow_runner_level_catalog catalog
      ON catalog.level_id = completions.level_id
     AND catalog.is_tutorial IS TRUE
    WHERE completions.user_id = target_user_id
  )
  INTO sprint_awarded;

  IF current_hardest_level_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.shadow_runner_level_completions completions
      WHERE completions.user_id = target_user_id
        AND completions.level_id = current_hardest_level_id
    )
    INTO knight_awarded;
  END IF;

  IF knight_awarded THEN
    next_knight_level_id := current_hardest_level_id;
  END IF;

  UPDATE public.users users
  SET
    shadow_runner_sprint_medal = sprint_awarded,
    shadow_runner_knight_medal = knight_awarded,
    shadow_runner_knight_level_id = next_knight_level_id,
    updated_at = now()
  WHERE users.id = target_user_id
    AND (
      users.shadow_runner_sprint_medal IS DISTINCT FROM sprint_awarded
      OR users.shadow_runner_knight_medal IS DISTINCT FROM knight_awarded
      OR users.shadow_runner_knight_level_id IS DISTINCT FROM next_knight_level_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_shadow_runner_medals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH current_hardest AS (
    SELECT (
      SELECT catalog.level_id
      FROM public.shadow_runner_level_catalog catalog
      WHERE catalog.is_available IS TRUE
        AND catalog.is_medal_candidate IS TRUE
      ORDER BY catalog.medal_rank DESC, catalog.level_number DESC NULLS LAST, catalog.level_id DESC
      LIMIT 1
    ) AS level_id
  ),
  medal_state AS (
    SELECT
      users.id AS user_id,
      EXISTS (
        SELECT 1
        FROM public.shadow_runner_level_completions completions
        JOIN public.shadow_runner_level_catalog catalog
          ON catalog.level_id = completions.level_id
         AND catalog.is_tutorial IS TRUE
        WHERE completions.user_id = users.id
      ) AS sprint_awarded,
      (
        current_hardest.level_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.shadow_runner_level_completions completions
          WHERE completions.user_id = users.id
            AND completions.level_id = current_hardest.level_id
        )
      ) AS knight_awarded,
      current_hardest.level_id AS hardest_level_id
    FROM public.users users
    CROSS JOIN current_hardest
  )
  UPDATE public.users users
  SET
    shadow_runner_sprint_medal = medal_state.sprint_awarded,
    shadow_runner_knight_medal = medal_state.knight_awarded,
    shadow_runner_knight_level_id = CASE
      WHEN medal_state.knight_awarded THEN medal_state.hardest_level_id
      ELSE null
    END,
    updated_at = now()
  FROM medal_state
  WHERE users.id = medal_state.user_id
    AND (
      users.shadow_runner_sprint_medal IS DISTINCT FROM medal_state.sprint_awarded
      OR users.shadow_runner_knight_medal IS DISTINCT FROM medal_state.knight_awarded
      OR users.shadow_runner_knight_level_id IS DISTINCT FROM CASE
        WHEN medal_state.knight_awarded THEN medal_state.hardest_level_id
        ELSE null
      END
    );
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_shadow_runner_medals_for_user(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.refresh_shadow_runner_medals()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_shadow_runner_completion_medals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM private.refresh_shadow_runner_medals_for_user(OLD.user_id);
    RETURN OLD;
  END IF;

  PERFORM private.refresh_shadow_runner_medals_for_user(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_shadow_runner_catalog_medals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.refresh_shadow_runner_medals();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_shadow_runner_completion_medals()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_shadow_runner_catalog_medals()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS shadow_runner_sync_medals_on_completion
  ON public.shadow_runner_level_completions;
CREATE TRIGGER shadow_runner_sync_medals_on_completion
  AFTER INSERT OR UPDATE OR DELETE
  ON public.shadow_runner_level_completions
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_shadow_runner_completion_medals();

DROP TRIGGER IF EXISTS shadow_runner_sync_medals_on_catalog
  ON public.shadow_runner_level_catalog;
CREATE TRIGGER shadow_runner_sync_medals_on_catalog
  AFTER INSERT OR UPDATE OF medal_rank, is_tutorial, is_available, is_medal_candidate OR DELETE
  ON public.shadow_runner_level_catalog
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.sync_shadow_runner_catalog_medals();

CREATE OR REPLACE FUNCTION public.record_shadow_runner_level_completion(
  completed_level_id text,
  completion_score integer DEFAULT NULL,
  completion_coins_collected integer DEFAULT NULL,
  completion_total_coins integer DEFAULT NULL,
  completion_enemies_defeated integer DEFAULT NULL,
  completion_total_enemies integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  normalized_level_id text := lower(trim(completed_level_id));
  level_available boolean;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF normalized_level_id IS NULL OR normalized_level_id = '' THEN
    RAISE EXCEPTION 'Shadow Runner level id is required';
  END IF;

  SELECT catalog.is_available
  INTO level_available
  FROM public.shadow_runner_level_catalog catalog
  WHERE catalog.level_id = normalized_level_id;

  IF level_available IS NULL THEN
    RAISE EXCEPTION 'Unknown Shadow Runner level: %', normalized_level_id;
  END IF;

  IF level_available IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Shadow Runner level is not available yet: %', normalized_level_id;
  END IF;

  IF completion_score < 0
    OR completion_coins_collected < 0
    OR completion_total_coins < 0
    OR completion_enemies_defeated < 0
    OR completion_total_enemies < 0 THEN
    RAISE EXCEPTION 'Shadow Runner completion values cannot be negative';
  END IF;

  INSERT INTO public.shadow_runner_level_completions (
    user_id,
    level_id,
    score,
    coins_collected,
    total_coins,
    enemies_defeated,
    total_enemies,
    completed_at,
    last_reported_at,
    updated_at
  )
  VALUES (
    current_user_id,
    normalized_level_id,
    completion_score,
    completion_coins_collected,
    completion_total_coins,
    completion_enemies_defeated,
    completion_total_enemies,
    now(),
    now(),
    now()
  )
  ON CONFLICT (user_id, level_id) DO UPDATE
  SET
    score = CASE
      WHEN public.shadow_runner_level_completions.score IS NULL THEN EXCLUDED.score
      WHEN EXCLUDED.score IS NULL THEN public.shadow_runner_level_completions.score
      ELSE GREATEST(public.shadow_runner_level_completions.score, EXCLUDED.score)
    END,
    coins_collected = CASE
      WHEN public.shadow_runner_level_completions.coins_collected IS NULL THEN EXCLUDED.coins_collected
      WHEN EXCLUDED.coins_collected IS NULL THEN public.shadow_runner_level_completions.coins_collected
      ELSE GREATEST(public.shadow_runner_level_completions.coins_collected, EXCLUDED.coins_collected)
    END,
    total_coins = COALESCE(EXCLUDED.total_coins, public.shadow_runner_level_completions.total_coins),
    enemies_defeated = CASE
      WHEN public.shadow_runner_level_completions.enemies_defeated IS NULL THEN EXCLUDED.enemies_defeated
      WHEN EXCLUDED.enemies_defeated IS NULL THEN public.shadow_runner_level_completions.enemies_defeated
      ELSE GREATEST(public.shadow_runner_level_completions.enemies_defeated, EXCLUDED.enemies_defeated)
    END,
    total_enemies = COALESCE(EXCLUDED.total_enemies, public.shadow_runner_level_completions.total_enemies),
    completed_at = LEAST(public.shadow_runner_level_completions.completed_at, EXCLUDED.completed_at),
    last_reported_at = now(),
    updated_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_shadow_runner_level_completion(text, integer, integer, integer, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_shadow_runner_level_completion(text, integer, integer, integer, integer, integer)
  TO authenticated;

DROP FUNCTION IF EXISTS public.search_users(text);

CREATE OR REPLACE FUNCTION public.search_users(term text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_thumbnail_url text,
  color text,
  status text,
  admin_role text,
  checkers_crown boolean,
  war_sword boolean,
  shadow_pin_gold_pin boolean,
  shadow_runner_sprint_medal boolean,
  shadow_runner_knight_medal boolean,
  shadow_runner_knight_level_id text,
  gold_easter_egg boolean,
  presence_visibility text,
  dm_discoverable boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    users.id,
    users.username,
    users.display_name,
    users.avatar_url,
    users.avatar_thumbnail_url,
    users.color,
    users.status,
    users.admin_role,
    users.checkers_crown,
    users.war_sword,
    users.shadow_pin_gold_pin,
    users.shadow_runner_sprint_medal,
    users.shadow_runner_knight_medal,
    users.shadow_runner_knight_level_id,
    users.gold_easter_egg,
    users.presence_visibility,
    users.dm_discoverable
  FROM public.users users
  WHERE users.dm_discoverable IS TRUE
    AND (
      users.username ILIKE '%' || search_users.term || '%'
      OR users.display_name ILIKE '%' || search_users.term || '%'
    )
  ORDER BY lower(coalesce(users.display_name, users.username, '')), lower(users.username)
  LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;

GRANT SELECT ON public.shadow_runner_level_catalog TO authenticated;
GRANT SELECT ON public.shadow_runner_level_completions TO authenticated;

DO $$
BEGIN
  PERFORM private.refresh_shadow_runner_medals();
END $$;
