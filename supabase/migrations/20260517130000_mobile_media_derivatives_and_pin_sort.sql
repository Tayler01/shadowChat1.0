/*
  # Mobile media derivatives and Shadow Pin recency

  Adds explicit thumbnail/metadata columns for mobile-heavy media surfaces and
  tracks the latest image added to each Shadow Pin category so category order is
  based on fresh pins instead of hearts.
*/

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS media_width integer,
  ADD COLUMN IF NOT EXISTS media_height integer,
  ADD COLUMN IF NOT EXISTS media_processed_at timestamptz;

ALTER TABLE public.dm_messages
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS media_width integer,
  ADD COLUMN IF NOT EXISTS media_height integer,
  ADD COLUMN IF NOT EXISTS media_processed_at timestamptz;

ALTER TABLE public.art_board_items
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS media_processed_at timestamptz;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS avatar_thumbnail_path text,
  ADD COLUMN IF NOT EXISTS banner_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS banner_thumbnail_path text;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_media_dimensions_check,
  ADD CONSTRAINT messages_media_dimensions_check
    CHECK (
      (media_width IS NULL OR media_width > 0)
      AND (media_height IS NULL OR media_height > 0)
    );

ALTER TABLE public.dm_messages
  DROP CONSTRAINT IF EXISTS dm_messages_media_dimensions_check,
  ADD CONSTRAINT dm_messages_media_dimensions_check
    CHECK (
      (media_width IS NULL OR media_width > 0)
      AND (media_height IS NULL OR media_height > 0)
    );

ALTER TABLE public.art_board_items
  DROP CONSTRAINT IF EXISTS art_board_items_image_dimensions_check,
  ADD CONSTRAINT art_board_items_image_dimensions_check
    CHECK (
      (image_width IS NULL OR image_width > 0)
      AND (image_height IS NULL OR image_height > 0)
    );

ALTER TABLE public.shadow_pin_categories
  ADD COLUMN IF NOT EXISTS latest_image_created_at timestamptz;

CREATE OR REPLACE FUNCTION public.refresh_shadow_pin_category_latest_image(target_category_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shadow_pin_categories categories
  SET latest_image_created_at = (
    SELECT max(images.created_at)
    FROM public.shadow_pin_images images
    WHERE images.category_id = target_category_id
      AND images.deleted_at IS NULL
  )
  WHERE categories.id = target_category_id;
$$;

REVOKE ALL ON FUNCTION public.refresh_shadow_pin_category_latest_image(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_shadow_pin_category_latest_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.category_id IS NOT NULL THEN
    PERFORM public.refresh_shadow_pin_category_latest_image(OLD.category_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.category_id IS NOT NULL THEN
    PERFORM public.refresh_shadow_pin_category_latest_image(NEW.category_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_shadow_pin_category_latest_image() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_shadow_pin_category_latest_image_trigger ON public.shadow_pin_images;
CREATE TRIGGER sync_shadow_pin_category_latest_image_trigger
  AFTER INSERT OR UPDATE OF category_id, created_at, deleted_at OR DELETE
  ON public.shadow_pin_images
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_shadow_pin_category_latest_image();

UPDATE public.shadow_pin_categories categories
SET latest_image_created_at = (
  SELECT max(images.created_at)
  FROM public.shadow_pin_images images
  WHERE images.category_id = categories.id
    AND images.deleted_at IS NULL
)
WHERE categories.deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS shadow_pin_categories_latest_image_idx
  ON public.shadow_pin_categories (latest_image_created_at DESC NULLS LAST, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS messages_media_thumbnail_idx
  ON public.messages (created_at DESC)
  WHERE message_type = 'image' AND file_url IS NOT NULL AND thumbnail_url IS NULL;

CREATE INDEX IF NOT EXISTS dm_messages_media_thumbnail_idx
  ON public.dm_messages (created_at DESC)
  WHERE message_type = 'image' AND file_url IS NOT NULL AND thumbnail_url IS NULL;

CREATE INDEX IF NOT EXISTS art_board_items_media_thumbnail_idx
  ON public.art_board_items (created_at DESC)
  WHERE item_type = 'image' AND image_url IS NOT NULL AND thumbnail_url IS NULL AND deleted_at IS NULL;
