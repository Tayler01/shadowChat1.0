/*
  # Shado TV modular content blocks

  Adds operator-managed global text sections for the Crimp & Shrimp show
  pages. V1 keeps these blocks text/date only so Cast and Updates can be
  edited without regenerating page assets.
*/

CREATE TABLE IF NOT EXISTS public.shado_tv_content_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.shado_tv_channels(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('cast', 'updates')),
  slug text NOT NULL CHECK (char_length(trim(slug)) > 0),
  title text NOT NULL CHECK (char_length(trim(title)) > 0 AND char_length(title) <= 160),
  subtitle text CHECK (subtitle IS NULL OR char_length(subtitle) <= 200),
  body text CHECK (body IS NULL OR char_length(body) <= 2400),
  date_label text CHECK (date_label IS NULL OR char_length(date_label) <= 80),
  visibility_status text NOT NULL DEFAULT 'published' CHECK (visibility_status IN ('draft', 'published', 'hidden')),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shado_tv_content_blocks_channel_section_slug_unique UNIQUE (channel_id, section, slug)
);

CREATE INDEX IF NOT EXISTS shado_tv_content_blocks_visible_idx
  ON public.shado_tv_content_blocks (channel_id, section, sort_order, updated_at DESC)
  WHERE deleted_at IS NULL AND visibility_status = 'published';

ALTER TABLE public.shado_tv_content_blocks ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_shado_tv_content_blocks_updated_at ON public.shado_tv_content_blocks;
CREATE TRIGGER update_shado_tv_content_blocks_updated_at
  BEFORE UPDATE ON public.shado_tv_content_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Authenticated users can read published Shado TV content blocks" ON public.shado_tv_content_blocks;
CREATE POLICY "Authenticated users can read published Shado TV content blocks"
ON public.shado_tv_content_blocks
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND visibility_status = 'published'
  AND EXISTS (
    SELECT 1
    FROM public.shado_tv_channels channels
    WHERE channels.id = shado_tv_content_blocks.channel_id
      AND channels.deleted_at IS NULL
      AND channels.visibility_status = 'published'
  )
);

DROP POLICY IF EXISTS "Operators can read all Shado TV content blocks" ON public.shado_tv_content_blocks;
CREATE POLICY "Operators can read all Shado TV content blocks"
ON public.shado_tv_content_blocks
FOR SELECT
TO authenticated
USING (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Operators can create Shado TV content blocks" ON public.shado_tv_content_blocks;
CREATE POLICY "Operators can create Shado TV content blocks"
ON public.shado_tv_content_blocks
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Operators can update Shado TV content blocks" ON public.shado_tv_content_blocks;
CREATE POLICY "Operators can update Shado TV content blocks"
ON public.shado_tv_content_blocks
FOR UPDATE
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (public.is_app_operator((select auth.uid())));

GRANT SELECT, INSERT, UPDATE ON public.shado_tv_content_blocks TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shado_tv_content_blocks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shado_tv_content_blocks;
  END IF;
END $$;

WITH admin_owner AS (
  SELECT (
    SELECT roles.user_id
    FROM public.user_roles roles
    WHERE roles.role = 'admin'
    ORDER BY roles.created_at ASC
    LIMIT 1
  ) AS user_id
),
series AS (
  SELECT id
  FROM public.shado_tv_channels
  WHERE slug = 'crimp-shrimp'
  LIMIT 1
),
seed_rows AS (
  SELECT *
  FROM (VALUES
    ('cast', 'alyssa-polder', 'Alyssa Polder', 'The Crimp', 'The older schemer with a straight face and a talent for choosing the wrong shortcut.', NULL, 10),
    ('cast', 'lindyann-polder', 'Lindyann Polder', 'The Shrimp', 'The lookout, sidekick, and accidental conscience of the operation.', NULL, 20),
    ('cast', 'amelia-polder', 'Amelia Polder', 'Director', 'Guiding the woods, wagon tracks, and small-town comedy timing.', NULL, 30),
    ('cast', 'elisha-polder', 'Elisha Polder', 'Writer', 'Building the caper, the family-comedy rhythm, and the trouble that keeps getting bigger.', NULL, 40),
    ('updates', 'coming-soon-page-live', 'Coming Soon page is live', 'Launch prep', 'The Crimp & Shrimp show hub is ready for the Episode 1 cover, countdown, trailers, cast, and updates.', to_char(now()::date, 'FMMonth FMDD, YYYY'), 10),
    ('updates', 'trailer-window', 'Trailer window scheduled', 'Trailer release', 'The trailer can be uploaded and published ahead of the full premiere from Shado TV Studio.', to_char((now() + interval '3 days')::date, 'FMMonth FMDD, YYYY'), 20),
    ('updates', 'episode-one-premiere', 'Episode 1 premiere countdown', 'The Chicken Snatchers', 'The main upload stays locked with a live countdown until premiere time, then moves into the streaming window.', to_char((now() + interval '7 days')::date, 'FMMonth FMDD, YYYY'), 30)
  ) AS values(section, slug, title, subtitle, body, date_label, sort_order)
)
INSERT INTO public.shado_tv_content_blocks (
  channel_id,
  section,
  slug,
  title,
  subtitle,
  body,
  date_label,
  visibility_status,
  sort_order,
  created_by,
  updated_by,
  deleted_at,
  deleted_by
)
SELECT
  series.id,
  seed_rows.section,
  seed_rows.slug,
  seed_rows.title,
  seed_rows.subtitle,
  seed_rows.body,
  seed_rows.date_label,
  'published',
  seed_rows.sort_order,
  admin_owner.user_id,
  admin_owner.user_id,
  NULL,
  NULL
FROM seed_rows
CROSS JOIN series
CROSS JOIN admin_owner
ON CONFLICT (channel_id, section, slug) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  body = EXCLUDED.body,
  date_label = EXCLUDED.date_label,
  visibility_status = EXCLUDED.visibility_status,
  sort_order = EXCLUDED.sort_order,
  updated_by = EXCLUDED.updated_by,
  deleted_at = NULL,
  deleted_by = NULL;
