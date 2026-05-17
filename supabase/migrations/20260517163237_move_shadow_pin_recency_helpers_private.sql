CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_shadow_pin_category_latest_image_trigger ON public.shadow_pin_images;

CREATE OR REPLACE FUNCTION private.refresh_shadow_pin_category_latest_image(target_category_id uuid)
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

REVOKE ALL ON FUNCTION private.refresh_shadow_pin_category_latest_image(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_shadow_pin_category_latest_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.category_id IS NOT NULL THEN
    PERFORM private.refresh_shadow_pin_category_latest_image(OLD.category_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.category_id IS NOT NULL THEN
    PERFORM private.refresh_shadow_pin_category_latest_image(NEW.category_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION private.sync_shadow_pin_category_latest_image() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_shadow_pin_category_latest_image_trigger
  AFTER INSERT OR UPDATE OF category_id, created_at, deleted_at OR DELETE
  ON public.shadow_pin_images
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_shadow_pin_category_latest_image();

UPDATE public.shadow_pin_categories categories
SET latest_image_created_at = (
  SELECT max(images.created_at)
  FROM public.shadow_pin_images images
  WHERE images.category_id = categories.id
    AND images.deleted_at IS NULL
)
WHERE latest_image_created_at IS DISTINCT FROM (
  SELECT max(images.created_at)
  FROM public.shadow_pin_images images
  WHERE images.category_id = categories.id
    AND images.deleted_at IS NULL
);

DROP FUNCTION IF EXISTS public.sync_shadow_pin_category_latest_image();
DROP FUNCTION IF EXISTS public.refresh_shadow_pin_category_latest_image(uuid);
