/*
  # Shadow Mystery publishing studio

  Creates an isolated longform-story domain for operator-authored mysteries.
  Published rows are readable by signed-in members; drafts and all writes are
  restricted to the existing app operator role. Artwork remains private and is
  delivered through short-lived signed transformation URLs.
*/

CREATE TABLE IF NOT EXISTS public.shadow_mystery_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_story_id text UNIQUE CHECK (
    legacy_story_id IS NULL
    OR legacy_story_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  subtitle text NOT NULL DEFAULT '' CHECK (char_length(subtitle) <= 240),
  location_label text NOT NULL DEFAULT '' CHECK (char_length(location_label) <= 160),
  deck text NOT NULL DEFAULT '' CHECK (char_length(deck) <= 1200),
  read_time_minutes integer NOT NULL DEFAULT 10 CHECK (read_time_minutes BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at date,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shadow_mystery_published_date_required CHECK (
    status <> 'published' OR published_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS shadow_mystery_stories_published_idx
  ON public.shadow_mystery_stories (published_at DESC, created_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS shadow_mystery_stories_operator_idx
  ON public.shadow_mystery_stories (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.shadow_mystery_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.shadow_mystery_stories(id) ON DELETE CASCADE,
  chapter_key text NOT NULL CHECK (chapter_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 180),
  kicker text CHECK (kicker IS NULL OR char_length(kicker) <= 160),
  body text[] NOT NULL CHECK (cardinality(body) BETWEEN 1 AND 100),
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 100000),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shadow_mystery_chapters_story_key_unique UNIQUE (story_id, chapter_key),
  CONSTRAINT shadow_mystery_chapters_id_story_unique UNIQUE (id, story_id)
);

CREATE INDEX IF NOT EXISTS shadow_mystery_chapters_story_sort_idx
  ON public.shadow_mystery_chapters (story_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.shadow_mystery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.shadow_mystery_stories(id) ON DELETE CASCADE,
  chapter_id uuid,
  role text NOT NULL CHECK (role IN ('cover', 'header', 'chapter')),
  storage_path text NOT NULL UNIQUE CHECK (
    char_length(storage_path) BETWEEN 3 AND 500
    AND storage_path !~ '(^|/)\.\.(/|$)'
  ),
  alt_text text NOT NULL DEFAULT '' CHECK (char_length(alt_text) <= 300),
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 2000),
  source_label text CHECK (source_label IS NULL OR char_length(source_label) <= 240),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  credit text CHECK (credit IS NULL OR char_length(credit) <= 240),
  license text CHECK (license IS NULL OR char_length(license) <= 160),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shadow_mystery_images_chapter_story_fk
    FOREIGN KEY (chapter_id, story_id)
    REFERENCES public.shadow_mystery_chapters(id, story_id)
    ON DELETE CASCADE,
  CONSTRAINT shadow_mystery_images_role_target_check CHECK (
    (role = 'chapter' AND chapter_id IS NOT NULL)
    OR (role IN ('cover', 'header') AND chapter_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS shadow_mystery_images_story_singleton_idx
  ON public.shadow_mystery_images (story_id, role)
  WHERE role IN ('cover', 'header');

CREATE UNIQUE INDEX IF NOT EXISTS shadow_mystery_images_chapter_singleton_idx
  ON public.shadow_mystery_images (chapter_id)
  WHERE role = 'chapter';

CREATE INDEX IF NOT EXISTS shadow_mystery_images_story_sort_idx
  ON public.shadow_mystery_images (story_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.shadow_mystery_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.shadow_mystery_stories(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 240),
  url text NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 1000),
  usage text NOT NULL DEFAULT '' CHECK (char_length(usage) <= 2000),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shadow_mystery_sources_story_sort_idx
  ON public.shadow_mystery_sources (story_id, sort_order, created_at);

ALTER TABLE public.shadow_mystery_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_mystery_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_mystery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_mystery_sources ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_shadow_mystery_stories_updated_at ON public.shadow_mystery_stories;
CREATE TRIGGER update_shadow_mystery_stories_updated_at
  BEFORE UPDATE ON public.shadow_mystery_stories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shadow_mystery_chapters_updated_at ON public.shadow_mystery_chapters;
CREATE TRIGGER update_shadow_mystery_chapters_updated_at
  BEFORE UPDATE ON public.shadow_mystery_chapters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shadow_mystery_images_updated_at ON public.shadow_mystery_images;
CREATE TRIGGER update_shadow_mystery_images_updated_at
  BEFORE UPDATE ON public.shadow_mystery_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shadow_mystery_sources_updated_at ON public.shadow_mystery_sources;
CREATE TRIGGER update_shadow_mystery_sources_updated_at
  BEFORE UPDATE ON public.shadow_mystery_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_shadow_mystery_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.shadow_mystery_chapters chapters
      WHERE chapters.story_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'A published Shadow Mystery story requires at least one chapter.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.shadow_mystery_images images
      WHERE images.story_id = NEW.id AND images.role = 'cover'
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.shadow_mystery_images images
      WHERE images.story_id = NEW.id AND images.role = 'header'
    ) THEN
      RAISE EXCEPTION 'A published Shadow Mystery story requires cover and header artwork.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.shadow_mystery_sources sources
      WHERE sources.story_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'A published Shadow Mystery story requires at least one source credit.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_shadow_mystery_publication() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_shadow_mystery_publication_trigger ON public.shadow_mystery_stories;
CREATE TRIGGER validate_shadow_mystery_publication_trigger
  BEFORE INSERT OR UPDATE OF status, published_at
  ON public.shadow_mystery_stories
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_shadow_mystery_publication();

CREATE OR REPLACE FUNCTION public.guard_published_shadow_mystery_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  remaining_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.shadow_mystery_stories stories
    WHERE stories.id = OLD.story_id
      AND stories.status = 'published'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'shadow_mystery_chapters'
    AND (TG_OP = 'DELETE' OR NEW.story_id IS DISTINCT FROM OLD.story_id) THEN
    SELECT count(*) INTO remaining_count
    FROM public.shadow_mystery_chapters chapters
    WHERE chapters.story_id = OLD.story_id
      AND chapters.id <> OLD.id;
    IF remaining_count < 1 THEN
      RAISE EXCEPTION 'Unpublish this Shadow Mystery story before removing its final chapter.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'shadow_mystery_sources'
    AND (TG_OP = 'DELETE' OR NEW.story_id IS DISTINCT FROM OLD.story_id) THEN
    SELECT count(*) INTO remaining_count
    FROM public.shadow_mystery_sources sources
    WHERE sources.story_id = OLD.story_id
      AND sources.id <> OLD.id;
    IF remaining_count < 1 THEN
      RAISE EXCEPTION 'Unpublish this Shadow Mystery story before removing its final source.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'shadow_mystery_images'
    AND OLD.role IN ('cover', 'header')
    AND (
      TG_OP = 'DELETE'
      OR NEW.story_id IS DISTINCT FROM OLD.story_id
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.chapter_id IS DISTINCT FROM OLD.chapter_id
    ) THEN
    RAISE EXCEPTION 'Unpublish this Shadow Mystery story before removing required artwork.'
      USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_published_shadow_mystery_children() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_published_mystery_chapter_delete ON public.shadow_mystery_chapters;
CREATE TRIGGER guard_published_mystery_chapter_delete
  BEFORE DELETE ON public.shadow_mystery_chapters
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_shadow_mystery_children();

DROP TRIGGER IF EXISTS guard_published_mystery_chapter_move ON public.shadow_mystery_chapters;
CREATE TRIGGER guard_published_mystery_chapter_move
  BEFORE UPDATE OF story_id ON public.shadow_mystery_chapters
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_shadow_mystery_children();

DROP TRIGGER IF EXISTS guard_published_mystery_source_delete ON public.shadow_mystery_sources;
CREATE TRIGGER guard_published_mystery_source_delete
  BEFORE DELETE ON public.shadow_mystery_sources
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_shadow_mystery_children();

DROP TRIGGER IF EXISTS guard_published_mystery_source_move ON public.shadow_mystery_sources;
CREATE TRIGGER guard_published_mystery_source_move
  BEFORE UPDATE OF story_id ON public.shadow_mystery_sources
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_shadow_mystery_children();

DROP TRIGGER IF EXISTS guard_published_mystery_image_delete ON public.shadow_mystery_images;
CREATE TRIGGER guard_published_mystery_image_delete
  BEFORE DELETE ON public.shadow_mystery_images
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_shadow_mystery_children();

DROP TRIGGER IF EXISTS guard_published_mystery_image_move ON public.shadow_mystery_images;
CREATE TRIGGER guard_published_mystery_image_move
  BEFORE UPDATE OF story_id, chapter_id, role ON public.shadow_mystery_images
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_shadow_mystery_children();

DROP POLICY IF EXISTS "Members read published mysteries and operators read all" ON public.shadow_mystery_stories;
CREATE POLICY "Members read published mysteries and operators read all"
ON public.shadow_mystery_stories
FOR SELECT
TO authenticated
USING (
  status = 'published'
  OR public.is_app_operator((select auth.uid()))
);

DROP POLICY IF EXISTS "Operators create mystery stories" ON public.shadow_mystery_stories;
CREATE POLICY "Operators create mystery stories"
ON public.shadow_mystery_stories
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND (created_by IS NULL OR created_by = (select auth.uid()))
  AND (updated_by IS NULL OR updated_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Operators update mystery stories" ON public.shadow_mystery_stories;
CREATE POLICY "Operators update mystery stories"
ON public.shadow_mystery_stories
FOR UPDATE
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND (updated_by IS NULL OR updated_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Operators delete mystery stories" ON public.shadow_mystery_stories;
CREATE POLICY "Operators delete mystery stories"
ON public.shadow_mystery_stories
FOR DELETE
TO authenticated
USING (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Members read published mystery chapters and operators read all" ON public.shadow_mystery_chapters;
CREATE POLICY "Members read published mystery chapters and operators read all"
ON public.shadow_mystery_chapters
FOR SELECT
TO authenticated
USING (
  public.is_app_operator((select auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.shadow_mystery_stories stories
    WHERE stories.id = shadow_mystery_chapters.story_id
      AND stories.status = 'published'
  )
);

DROP POLICY IF EXISTS "Operators create mystery chapters" ON public.shadow_mystery_chapters;
CREATE POLICY "Operators create mystery chapters"
ON public.shadow_mystery_chapters
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND (created_by IS NULL OR created_by = (select auth.uid()))
  AND (updated_by IS NULL OR updated_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Operators update mystery chapters" ON public.shadow_mystery_chapters;
CREATE POLICY "Operators update mystery chapters"
ON public.shadow_mystery_chapters
FOR UPDATE
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND (updated_by IS NULL OR updated_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Operators delete mystery chapters" ON public.shadow_mystery_chapters;
CREATE POLICY "Operators delete mystery chapters"
ON public.shadow_mystery_chapters
FOR DELETE
TO authenticated
USING (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Members read published mystery images and operators read all" ON public.shadow_mystery_images;
CREATE POLICY "Members read published mystery images and operators read all"
ON public.shadow_mystery_images
FOR SELECT
TO authenticated
USING (
  public.is_app_operator((select auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.shadow_mystery_stories stories
    WHERE stories.id = shadow_mystery_images.story_id
      AND stories.status = 'published'
  )
);

DROP POLICY IF EXISTS "Operators create mystery images" ON public.shadow_mystery_images;
CREATE POLICY "Operators create mystery images"
ON public.shadow_mystery_images
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND (created_by IS NULL OR created_by = (select auth.uid()))
  AND (updated_by IS NULL OR updated_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Operators update mystery images" ON public.shadow_mystery_images;
CREATE POLICY "Operators update mystery images"
ON public.shadow_mystery_images
FOR UPDATE
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND (updated_by IS NULL OR updated_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Operators delete mystery images" ON public.shadow_mystery_images;
CREATE POLICY "Operators delete mystery images"
ON public.shadow_mystery_images
FOR DELETE
TO authenticated
USING (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Members read published mystery sources and operators read all" ON public.shadow_mystery_sources;
CREATE POLICY "Members read published mystery sources and operators read all"
ON public.shadow_mystery_sources
FOR SELECT
TO authenticated
USING (
  public.is_app_operator((select auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.shadow_mystery_stories stories
    WHERE stories.id = shadow_mystery_sources.story_id
      AND stories.status = 'published'
  )
);

DROP POLICY IF EXISTS "Operators create mystery sources" ON public.shadow_mystery_sources;
CREATE POLICY "Operators create mystery sources"
ON public.shadow_mystery_sources
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND (created_by IS NULL OR created_by = (select auth.uid()))
  AND (updated_by IS NULL OR updated_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Operators update mystery sources" ON public.shadow_mystery_sources;
CREATE POLICY "Operators update mystery sources"
ON public.shadow_mystery_sources
FOR UPDATE
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND (updated_by IS NULL OR updated_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Operators delete mystery sources" ON public.shadow_mystery_sources;
CREATE POLICY "Operators delete mystery sources"
ON public.shadow_mystery_sources
FOR DELETE
TO authenticated
USING (public.is_app_operator((select auth.uid())));

REVOKE ALL ON TABLE public.shadow_mystery_stories FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.shadow_mystery_chapters FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.shadow_mystery_images FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.shadow_mystery_sources FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shadow_mystery_stories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shadow_mystery_chapters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shadow_mystery_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shadow_mystery_sources TO authenticated;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'shadow-mystery',
  'shadow-mystery',
  false,
  15728640,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Members read published Shadow Mystery artwork and operators read all" ON storage.objects;
CREATE POLICY "Members read published Shadow Mystery artwork and operators read all"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shadow-mystery'
  AND (
    public.is_app_operator((select auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.shadow_mystery_images images
      JOIN public.shadow_mystery_stories stories ON stories.id = images.story_id
      WHERE images.storage_path = storage.objects.name
        AND stories.status = 'published'
    )
  )
);

DROP POLICY IF EXISTS "Operators upload Shadow Mystery artwork" ON storage.objects;
CREATE POLICY "Operators upload Shadow Mystery artwork"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shadow-mystery'
  AND public.is_app_operator((select auth.uid()))
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

DROP POLICY IF EXISTS "Operators update Shadow Mystery artwork" ON storage.objects;
CREATE POLICY "Operators update Shadow Mystery artwork"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shadow-mystery'
  AND public.is_app_operator((select auth.uid()))
)
WITH CHECK (
  bucket_id = 'shadow-mystery'
  AND public.is_app_operator((select auth.uid()))
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

DROP POLICY IF EXISTS "Operators delete Shadow Mystery artwork" ON storage.objects;
CREATE POLICY "Operators delete Shadow Mystery artwork"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'shadow-mystery'
  AND public.is_app_operator((select auth.uid()))
);

COMMENT ON TABLE public.shadow_mystery_stories IS
  'Shadow Mystery publishing records, isolated from News, chat, DMs, and Shado TV.';
COMMENT ON COLUMN public.shadow_mystery_stories.legacy_story_id IS
  'Optional hardcoded V1 story id used to replace a fallback story without duplicating it.';
COMMENT ON TABLE public.shadow_mystery_images IS
  'Private Storage artwork metadata and attribution for story, header, and chapter placements.';
