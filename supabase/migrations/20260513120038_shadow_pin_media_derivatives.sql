/*
  # ShadowPin media derivatives

  Adds first-class thumbnail and medium image fields so ShadowPin grids no
  longer serve full originals into dense mobile masonry layouts.
*/

ALTER TABLE public.shadow_pin_categories
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS medium_url text,
  ADD COLUMN IF NOT EXISTS medium_path text,
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE public.shadow_pin_images
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS medium_url text,
  ADD COLUMN IF NOT EXISTS medium_path text,
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE public.shadow_pin_categories
  DROP CONSTRAINT IF EXISTS shadow_pin_categories_processing_status_check,
  ADD CONSTRAINT shadow_pin_categories_processing_status_check
    CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed'));

ALTER TABLE public.shadow_pin_images
  DROP CONSTRAINT IF EXISTS shadow_pin_images_processing_status_check,
  ADD CONSTRAINT shadow_pin_images_processing_status_check
    CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed'));

ALTER TABLE public.shadow_pin_categories
  DROP CONSTRAINT IF EXISTS shadow_pin_categories_image_dimensions_check,
  ADD CONSTRAINT shadow_pin_categories_image_dimensions_check
    CHECK (
      (image_width IS NULL OR image_width > 0)
      AND (image_height IS NULL OR image_height > 0)
    );

ALTER TABLE public.shadow_pin_images
  DROP CONSTRAINT IF EXISTS shadow_pin_images_image_dimensions_check,
  ADD CONSTRAINT shadow_pin_images_image_dimensions_check
    CHECK (
      (image_width IS NULL OR image_width > 0)
      AND (image_height IS NULL OR image_height > 0)
    );

CREATE INDEX IF NOT EXISTS shadow_pin_categories_processing_idx
  ON public.shadow_pin_categories (processing_status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS shadow_pin_images_processing_idx
  ON public.shadow_pin_images (processing_status, created_at DESC)
  WHERE deleted_at IS NULL;

UPDATE public.shadow_pin_categories
SET processing_status = CASE
    WHEN image_path LIKE 'seed/%' THEN 'ready'
    WHEN thumbnail_url IS NOT NULL AND medium_url IS NOT NULL THEN 'ready'
    ELSE 'pending'
  END,
  processing_error = NULL
WHERE deleted_at IS NULL;

UPDATE public.shadow_pin_images
SET processing_status = CASE
    WHEN thumbnail_url IS NOT NULL AND medium_url IS NOT NULL THEN 'ready'
    ELSE 'pending'
  END,
  processing_error = NULL
WHERE deleted_at IS NULL;
