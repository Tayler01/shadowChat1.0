/*
  # Fix Shadow Pin score refresh under production API safety checks

  The hidden-score refresh runs from the image-heart trigger. Production rejects
  bare DELETE statements on the API path, so keep the same full-ledger rebuild
  behavior with an explicit predicate.
*/

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

REVOKE ALL ON FUNCTION private.refresh_shadow_pin_scores() FROM PUBLIC, anon, authenticated;
