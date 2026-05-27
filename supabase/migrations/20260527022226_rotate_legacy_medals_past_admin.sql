/*
  # Rotate legacy medals past the primary admin

  The primary admin can still appear on game and Shadow Pin leaderboards, but
  rotating medals should be owned by the highest-ranked non-admin user.
*/

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

  SELECT stats.user_id
  INTO champion_id
  FROM public.shadow_checkers_stats stats
  JOIN public.users users
    ON users.id = stats.user_id
   AND users.admin_role IS DISTINCT FROM 'admin'
  WHERE stats.total_games > 0
  ORDER BY
    stats.wins DESC,
    stats.losses ASC,
    (stats.wins::numeric / GREATEST(stats.total_games, 1)) DESC,
    stats.last_win_at DESC NULLS LAST,
    stats.user_id ASC
  LIMIT 1;

  UPDATE public.users users
  SET checkers_crown = (champion_id IS NOT NULL AND users.id = champion_id)
  WHERE users.checkers_crown IS DISTINCT FROM (champion_id IS NOT NULL AND users.id = champion_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_war_refresh_champion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champion_id uuid;
BEGIN
  SELECT stats.user_id
  INTO champion_id
  FROM public.shadow_war_stats stats
  JOIN public.users users
    ON users.id = stats.user_id
   AND users.admin_role IS DISTINCT FROM 'admin'
  WHERE stats.total_games > 0
  ORDER BY
    stats.wins DESC,
    stats.losses ASC,
    (stats.wins::numeric / GREATEST(stats.total_games, 1)) DESC,
    stats.last_win_at DESC NULLS LAST,
    stats.user_id ASC
  LIMIT 1;

  UPDATE public.users users
  SET war_sword = (champion_id IS NOT NULL AND users.id = champion_id)
  WHERE users.war_sword IS DISTINCT FROM (champion_id IS NOT NULL AND users.id = champion_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_shadow_pin_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champion_id uuid;
BEGIN
  DELETE FROM private.shadow_pin_scores
  WHERE user_id IS NOT NULL;

  INSERT INTO private.shadow_pin_scores (
    user_id,
    image_count,
    received_like_count,
    image_points,
    like_points,
    total_score,
    last_scored_at,
    updated_at
  )
  SELECT
    images.creator_id AS user_id,
    count(DISTINCT images.id)::integer AS image_count,
    count(hearts.user_id)::integer AS received_like_count,
    count(DISTINCT images.id)::integer AS image_points,
    (count(hearts.user_id)::integer * 2) AS like_points,
    (count(DISTINCT images.id)::integer + (count(hearts.user_id)::integer * 2)) AS total_score,
    max(GREATEST(images.created_at, COALESCE(hearts.created_at, images.created_at))) AS last_scored_at,
    now() AS updated_at
  FROM public.shadow_pin_images images
  LEFT JOIN public.shadow_pin_image_hearts hearts
    ON hearts.image_id = images.id
   AND hearts.user_id IS DISTINCT FROM images.creator_id
  WHERE images.creator_id IS NOT NULL
    AND images.deleted_at IS NULL
    AND images.category_id IS NOT NULL
  GROUP BY images.creator_id
  HAVING count(DISTINCT images.id) > 0;

  SELECT scores.user_id
  INTO champion_id
  FROM private.shadow_pin_scores scores
  JOIN public.users users
    ON users.id = scores.user_id
   AND users.admin_role IS DISTINCT FROM 'admin'
  WHERE scores.total_score > 0
  ORDER BY
    scores.total_score DESC,
    scores.received_like_count DESC,
    scores.image_count DESC,
    scores.last_scored_at DESC NULLS LAST,
    scores.user_id ASC
  LIMIT 1;

  UPDATE public.users users
  SET shadow_pin_gold_pin = (champion_id IS NOT NULL AND users.id = champion_id)
  WHERE users.shadow_pin_gold_pin IS DISTINCT FROM (champion_id IS NOT NULL AND users.id = champion_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shadow_checkers_update_stats_and_crown(uuid, uuid, integer, integer, integer, integer) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_war_refresh_champion() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION private.refresh_shadow_pin_scores() FROM PUBLIC, anon, authenticated;

WITH champion AS (
  SELECT stats.user_id
  FROM public.shadow_checkers_stats stats
  JOIN public.users users
    ON users.id = stats.user_id
   AND users.admin_role IS DISTINCT FROM 'admin'
  WHERE stats.total_games > 0
  ORDER BY
    stats.wins DESC,
    stats.losses ASC,
    (stats.wins::numeric / GREATEST(stats.total_games, 1)) DESC,
    stats.last_win_at DESC NULLS LAST,
    stats.user_id ASC
  LIMIT 1
)
UPDATE public.users users
SET checkers_crown = COALESCE(users.id = (SELECT user_id FROM champion), false)
WHERE users.checkers_crown IS DISTINCT FROM COALESCE(users.id = (SELECT user_id FROM champion), false);

SELECT public.shadow_war_refresh_champion();
SELECT private.refresh_shadow_pin_scores();
