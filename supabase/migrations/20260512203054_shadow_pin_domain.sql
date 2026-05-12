/*
  # ShadowPin domain

  Adds a public, logged-in-only image board inside Boards:
  - dedicated public storage bucket for copied/uploaded assets
  - categories and image pins with soft deletes
  - simple one-heart-per-user hearts
  - creator/operator edit and delete helpers
  - no realtime publication in v1
*/

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'shadow-pin',
  'shadow-pin',
  true,
  15728640,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read for shadow pin images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own shadow pin images" ON storage.objects;

CREATE POLICY "Public read for shadow pin images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'shadow-pin');

CREATE POLICY "Users can upload their own shadow pin images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shadow-pin'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

INSERT INTO public.board_catalog (
  slug,
  title,
  board_type,
  description,
  moderation_scope,
  unread_contributes_to_nav,
  sort_order,
  is_visible
)
VALUES (
  'shadow-pin',
  'Shadow Pin',
  'static',
  'Shared image categories and pins.',
  NULL,
  false,
  70,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  board_type = EXCLUDED.board_type,
  description = EXCLUDED.description,
  moderation_scope = EXCLUDED.moderation_scope,
  unread_contributes_to_nav = EXCLUDED.unread_contributes_to_nav,
  sort_order = EXCLUDED.sort_order,
  is_visible = EXCLUDED.is_visible,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.shadow_pin_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 60),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  image_url text NOT NULL CHECK (char_length(trim(image_url)) > 0),
  image_path text NOT NULL CHECK (char_length(trim(image_path)) > 0),
  image_content_type text CHECK (image_content_type IS NULL OR image_content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  image_size_bytes integer CHECK (image_size_bytes IS NULL OR image_size_bytes BETWEEN 0 AND 15728640),
  heart_count integer NOT NULL DEFAULT 0 CHECK (heart_count >= 0),
  is_starter boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shadow_pin_categories_visible_sort_idx
  ON public.shadow_pin_categories (heart_count DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS shadow_pin_categories_creator_idx
  ON public.shadow_pin_categories (creator_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shadow_pin_starter_inspiration_idx
  ON public.shadow_pin_categories (lower(title))
  WHERE is_starter IS TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shadow_pin_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.shadow_pin_categories(id) ON DELETE SET NULL,
  creator_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  image_url text NOT NULL CHECK (char_length(trim(image_url)) > 0),
  image_path text NOT NULL CHECK (char_length(trim(image_path)) > 0),
  image_content_type text CHECK (image_content_type IS NULL OR image_content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  image_size_bytes integer CHECK (image_size_bytes IS NULL OR image_size_bytes BETWEEN 0 AND 15728640),
  heart_count integer NOT NULL DEFAULT 0 CHECK (heart_count >= 0),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shadow_pin_images_category_recent_idx
  ON public.shadow_pin_images (category_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS shadow_pin_images_creator_idx
  ON public.shadow_pin_images (creator_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shadow_pin_category_hearts (
  category_id uuid NOT NULL REFERENCES public.shadow_pin_categories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, user_id)
);

CREATE INDEX IF NOT EXISTS shadow_pin_category_hearts_user_idx
  ON public.shadow_pin_category_hearts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shadow_pin_image_hearts (
  image_id uuid NOT NULL REFERENCES public.shadow_pin_images(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (image_id, user_id)
);

CREATE INDEX IF NOT EXISTS shadow_pin_image_hearts_user_idx
  ON public.shadow_pin_image_hearts (user_id, created_at DESC);

ALTER TABLE public.shadow_pin_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_pin_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_pin_category_hearts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_pin_image_hearts ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_shadow_pin_categories_updated_at ON public.shadow_pin_categories;
CREATE TRIGGER update_shadow_pin_categories_updated_at
  BEFORE UPDATE ON public.shadow_pin_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shadow_pin_images_updated_at ON public.shadow_pin_images;
CREATE TRIGGER update_shadow_pin_images_updated_at
  BEFORE UPDATE ON public.shadow_pin_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Authenticated users can read shadow pin categories" ON public.shadow_pin_categories;
CREATE POLICY "Authenticated users can read shadow pin categories"
ON public.shadow_pin_categories
FOR SELECT
TO authenticated
USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "Authenticated users can create shadow pin categories" ON public.shadow_pin_categories;
CREATE POLICY "Authenticated users can create shadow pin categories"
ON public.shadow_pin_categories
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = creator_id);

DROP POLICY IF EXISTS "Creators and operators can update shadow pin categories" ON public.shadow_pin_categories;
CREATE POLICY "Creators and operators can update shadow pin categories"
ON public.shadow_pin_categories
FOR UPDATE
TO authenticated
USING (
  deleted_at IS NULL
  AND (
    (select auth.uid()) = creator_id
    OR public.is_app_operator((select auth.uid()))
  )
)
WITH CHECK (
  (
    (select auth.uid()) = creator_id
    OR public.is_app_operator((select auth.uid()))
  )
);

DROP POLICY IF EXISTS "Authenticated users can read shadow pin images" ON public.shadow_pin_images;
CREATE POLICY "Authenticated users can read shadow pin images"
ON public.shadow_pin_images
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND category_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.shadow_pin_categories categories
    WHERE categories.id = shadow_pin_images.category_id
      AND categories.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "Authenticated users can create shadow pin images" ON public.shadow_pin_images;
CREATE POLICY "Authenticated users can create shadow pin images"
ON public.shadow_pin_images
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = creator_id
  AND category_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.shadow_pin_categories categories
    WHERE categories.id = shadow_pin_images.category_id
      AND categories.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "Creators and operators can update shadow pin images" ON public.shadow_pin_images;
CREATE POLICY "Creators and operators can update shadow pin images"
ON public.shadow_pin_images
FOR UPDATE
TO authenticated
USING (
  deleted_at IS NULL
  AND (
    (select auth.uid()) = creator_id
    OR public.is_app_operator((select auth.uid()))
  )
)
WITH CHECK (
  (
    (select auth.uid()) = creator_id
    OR public.is_app_operator((select auth.uid()))
  )
);

DROP POLICY IF EXISTS "Authenticated users can read shadow pin category hearts" ON public.shadow_pin_category_hearts;
CREATE POLICY "Authenticated users can read shadow pin category hearts"
ON public.shadow_pin_category_hearts
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can add own shadow pin category hearts" ON public.shadow_pin_category_hearts;
CREATE POLICY "Users can add own shadow pin category hearts"
ON public.shadow_pin_category_hearts
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
    FROM public.shadow_pin_categories categories
    WHERE categories.id = shadow_pin_category_hearts.category_id
      AND categories.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "Users can remove own shadow pin category hearts" ON public.shadow_pin_category_hearts;
CREATE POLICY "Users can remove own shadow pin category hearts"
ON public.shadow_pin_category_hearts
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Authenticated users can read shadow pin image hearts" ON public.shadow_pin_image_hearts;
CREATE POLICY "Authenticated users can read shadow pin image hearts"
ON public.shadow_pin_image_hearts
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can add own shadow pin image hearts" ON public.shadow_pin_image_hearts;
CREATE POLICY "Users can add own shadow pin image hearts"
ON public.shadow_pin_image_hearts
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
    FROM public.shadow_pin_images images
    WHERE images.id = shadow_pin_image_hearts.image_id
      AND images.deleted_at IS NULL
      AND images.category_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Users can remove own shadow pin image hearts" ON public.shadow_pin_image_hearts;
CREATE POLICY "Users can remove own shadow pin image hearts"
ON public.shadow_pin_image_hearts
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.toggle_shadow_pin_category_heart(target_category_id uuid)
RETURNS public.shadow_pin_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  updated_category public.shadow_pin_categories%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM 1
  FROM public.shadow_pin_categories categories
  WHERE categories.id = target_category_id
    AND categories.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ShadowPin category is not available';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shadow_pin_category_hearts hearts
    WHERE hearts.category_id = target_category_id
      AND hearts.user_id = current_user_id
  ) THEN
    DELETE FROM public.shadow_pin_category_hearts
    WHERE category_id = target_category_id
      AND user_id = current_user_id;
  ELSE
    INSERT INTO public.shadow_pin_category_hearts (category_id, user_id)
    VALUES (target_category_id, current_user_id);
  END IF;

  UPDATE public.shadow_pin_categories
  SET heart_count = (
    SELECT count(*)::integer
    FROM public.shadow_pin_category_hearts hearts
    WHERE hearts.category_id = target_category_id
  )
  WHERE id = target_category_id
  RETURNING * INTO updated_category;

  RETURN updated_category;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_shadow_pin_image_heart(target_image_id uuid)
RETURNS public.shadow_pin_images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  updated_image public.shadow_pin_images%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM 1
  FROM public.shadow_pin_images images
  WHERE images.id = target_image_id
    AND images.deleted_at IS NULL
    AND images.category_id IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ShadowPin image is not available';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shadow_pin_image_hearts hearts
    WHERE hearts.image_id = target_image_id
      AND hearts.user_id = current_user_id
  ) THEN
    DELETE FROM public.shadow_pin_image_hearts
    WHERE image_id = target_image_id
      AND user_id = current_user_id;
  ELSE
    INSERT INTO public.shadow_pin_image_hearts (image_id, user_id)
    VALUES (target_image_id, current_user_id);
  END IF;

  UPDATE public.shadow_pin_images
  SET heart_count = (
    SELECT count(*)::integer
    FROM public.shadow_pin_image_hearts hearts
    WHERE hearts.image_id = target_image_id
  )
  WHERE id = target_image_id
  RETURNING * INTO updated_image;

  RETURN updated_image;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_shadow_pin_category(target_category_id uuid)
RETURNS public.shadow_pin_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  target_category public.shadow_pin_categories%ROWTYPE;
  visible_image_count integer;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO target_category
  FROM public.shadow_pin_categories categories
  WHERE categories.id = target_category_id
    AND categories.deleted_at IS NULL
  FOR UPDATE;

  IF target_category.id IS NULL THEN
    RAISE EXCEPTION 'ShadowPin category is not available';
  END IF;

  IF target_category.creator_id IS DISTINCT FROM current_user_id
    AND NOT public.is_app_operator(current_user_id) THEN
    RAISE EXCEPTION 'Only the creator or an admin can remove this category';
  END IF;

  SELECT count(*)::integer
  INTO visible_image_count
  FROM public.shadow_pin_images images
  WHERE images.category_id = target_category_id
    AND images.deleted_at IS NULL;

  IF visible_image_count > 0 AND NOT public.is_app_operator(current_user_id) THEN
    RAISE EXCEPTION 'Only an admin can remove a category that still has images';
  END IF;

  IF public.is_app_operator(current_user_id) THEN
    UPDATE public.shadow_pin_images
    SET category_id = NULL
    WHERE category_id = target_category_id
      AND deleted_at IS NULL;
  END IF;

  DELETE FROM public.shadow_pin_category_hearts
  WHERE category_id = target_category_id;

  UPDATE public.shadow_pin_categories
  SET
    heart_count = 0,
    deleted_at = now(),
    deleted_by = current_user_id
  WHERE id = target_category_id
  RETURNING * INTO target_category;

  RETURN target_category;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_shadow_pin_image(target_image_id uuid)
RETURNS public.shadow_pin_images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  target_image public.shadow_pin_images%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO target_image
  FROM public.shadow_pin_images images
  WHERE images.id = target_image_id
    AND images.deleted_at IS NULL
  FOR UPDATE;

  IF target_image.id IS NULL THEN
    RAISE EXCEPTION 'ShadowPin image is not available';
  END IF;

  IF target_image.creator_id IS DISTINCT FROM current_user_id
    AND NOT public.is_app_operator(current_user_id) THEN
    RAISE EXCEPTION 'Only the creator or an admin can remove this image';
  END IF;

  DELETE FROM public.shadow_pin_image_hearts
  WHERE image_id = target_image_id;

  UPDATE public.shadow_pin_images
  SET
    heart_count = 0,
    deleted_at = now(),
    deleted_by = current_user_id
  WHERE id = target_image_id
  RETURNING * INTO target_image;

  RETURN target_image;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_shadow_pin_category_heart(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_shadow_pin_image_heart(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shadow_pin_category(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shadow_pin_image(uuid) TO authenticated;

INSERT INTO public.shadow_pin_categories (
  creator_id,
  title,
  description,
  image_url,
  image_path,
  image_content_type,
  image_size_bytes,
  is_starter
)
SELECT
  (
    SELECT roles.user_id
    FROM public.user_roles roles
    WHERE roles.role = 'admin'
    ORDER BY roles.created_at ASC
    LIMIT 1
  ),
  'Inspiration',
  'A shared starter space for images, ideas, and visual references.',
  '/themes/obsidian-gold/preview.webp',
  'seed/inspiration-cover.webp',
  'image/webp',
  NULL,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.shadow_pin_categories categories
  WHERE categories.is_starter IS TRUE
    AND lower(categories.title) = 'inspiration'
    AND categories.deleted_at IS NULL
);
