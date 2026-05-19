/*
  # Shadow Pin hidden score and golden pin badge

  Keeps a private score ledger for Shadow Pin:
  - visible image created by a user: 1 point
  - non-self image heart received: 2 points

  Only the public winner flag is exposed through users.shadow_pin_gold_pin.
*/

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS shadow_pin_gold_pin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.shadow_pin_gold_pin IS
  'Visible identity badge for the current hidden Shadow Pin top scorer.';

CREATE TABLE IF NOT EXISTS private.shadow_pin_scores (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  image_count integer NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  received_like_count integer NOT NULL DEFAULT 0 CHECK (received_like_count >= 0),
  image_points integer NOT NULL DEFAULT 0 CHECK (image_points >= 0),
  like_points integer NOT NULL DEFAULT 0 CHECK (like_points >= 0),
  total_score integer NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  last_scored_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE private.shadow_pin_scores IS
  'Private Shadow Pin scoring ledger. Do not expose score totals to app clients.';

REVOKE ALL ON TABLE private.shadow_pin_scores FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.refresh_shadow_pin_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champion_id uuid;
BEGIN
  DELETE FROM private.shadow_pin_scores;

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

CREATE OR REPLACE FUNCTION private.sync_shadow_pin_scores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.refresh_shadow_pin_scores();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_shadow_pin_scores() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_shadow_pin_scores_on_images ON public.shadow_pin_images;
CREATE TRIGGER sync_shadow_pin_scores_on_images
  AFTER INSERT OR UPDATE OF creator_id, category_id, deleted_at OR DELETE
  ON public.shadow_pin_images
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.sync_shadow_pin_scores();

DROP TRIGGER IF EXISTS sync_shadow_pin_scores_on_image_hearts ON public.shadow_pin_image_hearts;
CREATE TRIGGER sync_shadow_pin_scores_on_image_hearts
  AFTER INSERT OR UPDATE OR DELETE
  ON public.shadow_pin_image_hearts
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.sync_shadow_pin_scores();

DO $$
BEGIN
  PERFORM private.refresh_shadow_pin_scores();
END $$;
