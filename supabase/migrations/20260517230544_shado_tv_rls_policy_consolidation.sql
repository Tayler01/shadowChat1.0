/*
  # Shado TV RLS policy consolidation

  Consolidates Shado TV SELECT policies so Supabase does not evaluate multiple
  permissive authenticated policies for the same action.
*/

DROP POLICY IF EXISTS "Authenticated users can read published Shado TV channels" ON public.shado_tv_channels;
DROP POLICY IF EXISTS "Operators can read all Shado TV channels" ON public.shado_tv_channels;

CREATE POLICY "Authenticated users can read allowed Shado TV channels"
ON public.shado_tv_channels
FOR SELECT
TO authenticated
USING (
  (
    deleted_at IS NULL
    AND visibility_status = 'published'
  )
  OR public.is_app_operator((select auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can read published Shado TV videos" ON public.shado_tv_videos;
DROP POLICY IF EXISTS "Operators can read all Shado TV videos" ON public.shado_tv_videos;

CREATE POLICY "Authenticated users can read allowed Shado TV videos"
ON public.shado_tv_videos
FOR SELECT
TO authenticated
USING (
  (
    deleted_at IS NULL
    AND visibility_status = 'published'
    AND channel_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.shado_tv_channels channels
      WHERE channels.id = shado_tv_videos.channel_id
        AND channels.deleted_at IS NULL
        AND channels.visibility_status = 'published'
    )
  )
  OR public.is_app_operator((select auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can read visible Shado TV home features" ON public.shado_tv_home_features;
DROP POLICY IF EXISTS "Operators can manage Shado TV home features" ON public.shado_tv_home_features;

CREATE POLICY "Authenticated users can read allowed Shado TV home features"
ON public.shado_tv_home_features
FOR SELECT
TO authenticated
USING (
  (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.shado_tv_videos videos
      JOIN public.shado_tv_channels channels
        ON channels.id = videos.channel_id
      WHERE videos.id = shado_tv_home_features.video_id
        AND videos.deleted_at IS NULL
        AND videos.visibility_status = 'published'
        AND channels.deleted_at IS NULL
        AND channels.visibility_status = 'published'
    )
  )
  OR public.is_app_operator((select auth.uid()))
);

CREATE POLICY "Operators can create Shado TV home features"
ON public.shado_tv_home_features
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_operator((select auth.uid())));

CREATE POLICY "Operators can update Shado TV home features"
ON public.shado_tv_home_features
FOR UPDATE
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (public.is_app_operator((select auth.uid())));

CREATE POLICY "Operators can delete Shado TV home features"
ON public.shado_tv_home_features
FOR DELETE
TO authenticated
USING (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Operators can read Shado TV processing jobs" ON public.shado_tv_processing_jobs;
DROP POLICY IF EXISTS "Operators can manage Shado TV processing jobs" ON public.shado_tv_processing_jobs;

CREATE POLICY "Operators can manage Shado TV processing jobs"
ON public.shado_tv_processing_jobs
FOR ALL
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (public.is_app_operator((select auth.uid())));
