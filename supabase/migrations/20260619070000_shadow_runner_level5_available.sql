/*
  # Shadow Runner Level 5 availability

  Launches Candle Fair Ruins as the current hardest available Shadow Runner
  route. The catalog trigger recalculates public runner/knight medals and
  revokes stale Level 4 knight medals for users who have not cleared Level 5.
*/

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
  ('level-5', 5, 'Candle Fair Ruins', 5, false, true, true)
ON CONFLICT (level_id) DO UPDATE
SET
  level_number = EXCLUDED.level_number,
  title = EXCLUDED.title,
  medal_rank = EXCLUDED.medal_rank,
  is_tutorial = EXCLUDED.is_tutorial,
  is_available = true,
  is_medal_candidate = EXCLUDED.is_medal_candidate,
  updated_at = now();

SELECT private.refresh_shadow_runner_medals();
