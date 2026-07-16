/* ShadowPin Creator Studio: additive, old-client-compatible draft backend. */

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shadow-pin-drafts', 'shadow-pin-drafts', false, 15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Creators read own ShadowPin draft files" ON storage.objects;
DROP POLICY IF EXISTS "Creators upload own ShadowPin draft files" ON storage.objects;
DROP POLICY IF EXISTS "Creators delete own ShadowPin draft files" ON storage.objects;

CREATE POLICY "Creators read own ShadowPin draft files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'shadow-pin-drafts'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Creators upload own ShadowPin draft files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'shadow-pin-drafts'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Creators delete own ShadowPin draft files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'shadow-pin-drafts'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE TABLE public.shadow_pin_creator_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.shadow_pin_categories(id),
  target_image_id uuid REFERENCES public.shadow_pin_images(id) ON DELETE SET NULL,
  client_mutation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_kind text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  state text NOT NULL DEFAULT 'editing',
  revision integer NOT NULL DEFAULT 1,
  active_asset_id uuid,
  published_image_id uuid,
  publish_idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  last_error_code text,
  last_error_message text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT shadow_pin_creator_drafts_source_kind_check
    CHECK (source_kind IN ('image_upload', 'image_url', 'video_upload', 'external_video')),
  CONSTRAINT shadow_pin_creator_drafts_state_check
    CHECK (state IN (
      'editing', 'uploading', 'processing', 'ready', 'preparing_publish',
      'publish_ready', 'published', 'failed', 'abandoned'
    )),
  CONSTRAINT shadow_pin_creator_drafts_title_check
    CHECK (char_length(trim(title)) BETWEEN 0 AND 80),
  CONSTRAINT shadow_pin_creator_drafts_description_check
    CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT shadow_pin_creator_drafts_tags_check
    CHECK (cardinality(tags) <= 8),
  CONSTRAINT shadow_pin_creator_drafts_revision_check CHECK (revision > 0),
  CONSTRAINT shadow_pin_creator_drafts_error_code_check
    CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 80),
  CONSTRAINT shadow_pin_creator_drafts_error_message_check
    CHECK (last_error_message IS NULL OR char_length(last_error_message) <= 500),
  UNIQUE (creator_id, client_mutation_id)
);

CREATE TABLE public.shadow_pin_draft_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.shadow_pin_creator_drafts(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  generation integer NOT NULL DEFAULT 1,
  asset_kind text NOT NULL,
  provider text NOT NULL,
  state text NOT NULL DEFAULT 'reserved',
  storage_bucket text,
  original_path text,
  thumbnail_path text,
  medium_path text,
  final_image_url text,
  final_image_path text,
  final_thumbnail_url text,
  final_thumbnail_path text,
  final_medium_url text,
  final_medium_path text,
  content_type text,
  size_bytes bigint,
  image_width integer,
  image_height integer,
  duration_seconds integer,
  source_url text,
  provider_asset_id text,
  provider_playback_id text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  video_preview_url text,
  video_playback_url text,
  video_hls_url text,
  video_embed_url text,
  error_code text,
  error_message text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT shadow_pin_draft_assets_kind_check
    CHECK (asset_kind IN ('image', 'video', 'external_video')),
  CONSTRAINT shadow_pin_draft_assets_provider_check
    CHECK (provider IN (
      'shadow_pin_storage', 'bunny_stream', 'youtube', 'x',
      'pinterest', 'instagram', 'external'
    )),
  CONSTRAINT shadow_pin_draft_assets_state_check
    CHECK (state IN (
      'reserved', 'uploading', 'processing', 'ready', 'publish_ready',
      'failed', 'superseded', 'deleted'
    )),
  CONSTRAINT shadow_pin_draft_assets_generation_check CHECK (generation > 0),
  CONSTRAINT shadow_pin_draft_assets_size_check
    CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 157286400),
  CONSTRAINT shadow_pin_draft_assets_dimensions_check
    CHECK ((image_width IS NULL OR image_width > 0) AND (image_height IS NULL OR image_height > 0)),
  CONSTRAINT shadow_pin_draft_assets_duration_check
    CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 60),
  CONSTRAINT shadow_pin_draft_assets_provider_payload_check
    CHECK (octet_length(provider_payload::text) <= 65536),
  CONSTRAINT shadow_pin_draft_assets_publish_manifest_check
    CHECK (
      state <> 'publish_ready'
      OR (final_image_url IS NOT NULL AND final_image_path IS NOT NULL)
    ),
  UNIQUE (draft_id, generation)
);

ALTER TABLE public.shadow_pin_creator_drafts
  ADD CONSTRAINT shadow_pin_creator_drafts_active_asset_fkey
  FOREIGN KEY (active_asset_id) REFERENCES public.shadow_pin_draft_assets(id) ON DELETE SET NULL;

ALTER TABLE public.shadow_pin_images
  ADD COLUMN creator_draft_id uuid REFERENCES public.shadow_pin_creator_drafts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX shadow_pin_images_creator_draft_unique_idx
  ON public.shadow_pin_images (creator_draft_id)
  WHERE creator_draft_id IS NOT NULL;

ALTER TABLE public.shadow_pin_creator_drafts
  ADD CONSTRAINT shadow_pin_creator_drafts_published_image_fkey
  FOREIGN KEY (published_image_id) REFERENCES public.shadow_pin_images(id) ON DELETE SET NULL;

CREATE INDEX shadow_pin_creator_drafts_owner_updated_idx
  ON public.shadow_pin_creator_drafts (creator_id, updated_at DESC, id DESC);
CREATE INDEX shadow_pin_creator_drafts_active_idx
  ON public.shadow_pin_creator_drafts (creator_id, state, updated_at DESC)
  WHERE state NOT IN ('published', 'abandoned');
CREATE INDEX shadow_pin_draft_assets_draft_generation_idx
  ON public.shadow_pin_draft_assets (draft_id, generation DESC);
CREATE INDEX shadow_pin_draft_assets_cleanup_idx
  ON public.shadow_pin_draft_assets (state, expires_at)
  WHERE state IN ('failed', 'superseded', 'deleted');
CREATE UNIQUE INDEX shadow_pin_draft_assets_provider_asset_unique_idx
  ON public.shadow_pin_draft_assets (provider, provider_asset_id)
  WHERE provider_asset_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.shadow_pin_creator_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_pin_draft_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators read own ShadowPin drafts"
  ON public.shadow_pin_creator_drafts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = creator_id);
CREATE POLICY "Creators read own ShadowPin draft assets"
  ON public.shadow_pin_draft_assets FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = creator_id);

REVOKE ALL ON TABLE public.shadow_pin_creator_drafts, public.shadow_pin_draft_assets
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.shadow_pin_creator_drafts, public.shadow_pin_draft_assets
  TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.shadow_pin_creator_drafts, public.shadow_pin_draft_assets
  TO service_role;

CREATE OR REPLACE FUNCTION private.touch_shadow_pin_creator_draft()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.touch_shadow_pin_creator_draft() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER touch_shadow_pin_creator_draft
  BEFORE UPDATE ON public.shadow_pin_creator_drafts
  FOR EACH ROW EXECUTE FUNCTION private.touch_shadow_pin_creator_draft();

CREATE OR REPLACE FUNCTION private.touch_shadow_pin_draft_asset()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.touch_shadow_pin_draft_asset() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER touch_shadow_pin_draft_asset
  BEFORE UPDATE ON public.shadow_pin_draft_assets
  FOR EACH ROW EXECUTE FUNCTION private.touch_shadow_pin_draft_asset();

CREATE OR REPLACE FUNCTION public.create_shadow_pin_creator_draft(
  target_category_id uuid,
  target_title text,
  target_description text,
  target_tags text[],
  target_source_kind text,
  target_image_id uuid,
  target_client_mutation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_title text := trim(COALESCE(target_title, ''));
  normalized_description text := NULLIF(trim(COALESCE(target_description, '')), '');
  normalized_tags text[];
  resolved_category_id uuid := target_category_id;
  draft_row public.shadow_pin_creator_drafts%ROWTYPE;
  asset_row public.shadow_pin_draft_assets%ROWTYPE;
  target_image public.shadow_pin_images%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF target_client_mutation_id IS NULL THEN RAISE EXCEPTION 'client mutation id is required'; END IF;
  IF target_source_kind NOT IN ('image_upload', 'image_url', 'video_upload', 'external_video') THEN
    RAISE EXCEPTION 'Unsupported draft source';
  END IF;
  IF char_length(normalized_title) > 80 THEN RAISE EXCEPTION 'Title must be at most 80 characters'; END IF;
  IF normalized_description IS NOT NULL AND char_length(normalized_description) > 500 THEN RAISE EXCEPTION 'Description is too long'; END IF;

  SELECT COALESCE(array_agg(clean_tag ORDER BY first_ordinal), ARRAY[]::text[])
  INTO normalized_tags
  FROM (
    SELECT clean_tag, min(ordinality) AS first_ordinal
    FROM (
      SELECT
        trim(both '-' from regexp_replace(lower(trim(raw_tag)), '[^a-z0-9]+', '-', 'g')) AS clean_tag,
        ordinality
      FROM unnest(COALESCE(target_tags, ARRAY[]::text[])) WITH ORDINALITY AS input(raw_tag, ordinality)
    ) cleaned
    WHERE clean_tag <> ''
    GROUP BY clean_tag
    ORDER BY min(ordinality)
    LIMIT 8
  ) bounded;

  IF target_image_id IS NOT NULL THEN
    SELECT image.* INTO target_image
    FROM public.shadow_pin_images image
    WHERE image.id = target_image_id
      AND (
        image.creator_id = caller_id
        OR public.is_app_operator(caller_id)
      )
      AND image.deleted_at IS NULL;
    IF target_image.id IS NULL THEN RAISE EXCEPTION 'Replacement pin is unavailable'; END IF;
    resolved_category_id := COALESCE(target_category_id, target_image.category_id);
  END IF;

  IF resolved_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shadow_pin_categories category
    WHERE category.id = resolved_category_id AND category.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'ShadowPin category is unavailable'; END IF;

  IF (SELECT count(*) FROM public.shadow_pin_creator_drafts draft
      WHERE draft.creator_id = caller_id
        AND draft.state NOT IN ('published', 'abandoned')
        AND draft.expires_at > now()) >= 25 THEN
    RAISE EXCEPTION 'Finish or remove an existing ShadowPin draft first';
  END IF;

  INSERT INTO public.shadow_pin_creator_drafts (
    creator_id, category_id, target_image_id, client_mutation_id,
    source_kind, title, description, tags
  ) VALUES (
    caller_id, resolved_category_id, target_image_id, target_client_mutation_id,
    target_source_kind, normalized_title, normalized_description, normalized_tags
  )
  ON CONFLICT (creator_id, client_mutation_id) DO NOTHING
  RETURNING * INTO draft_row;

  IF draft_row.id IS NULL THEN
    SELECT * INTO draft_row FROM public.shadow_pin_creator_drafts draft
    WHERE draft.creator_id = caller_id AND draft.client_mutation_id = target_client_mutation_id;
  END IF;

  IF target_image.id IS NOT NULL AND draft_row.active_asset_id IS NULL THEN
    INSERT INTO public.shadow_pin_draft_assets (
      draft_id, creator_id, generation, asset_kind, provider, state,
      final_image_url, final_image_path, final_thumbnail_url, final_thumbnail_path,
      final_medium_url, final_medium_path, content_type, size_bytes,
      image_width, image_height, duration_seconds, source_url,
      provider_asset_id, provider_playback_id, provider_payload,
      video_preview_url, video_playback_url, video_hls_url, video_embed_url, ready_at
    ) VALUES (
      draft_row.id, caller_id, 1,
      CASE target_image.media_type WHEN 'video' THEN 'video' WHEN 'external_video' THEN 'external_video' ELSE 'image' END,
      COALESCE(target_image.provider, 'shadow_pin_storage'), 'publish_ready',
      target_image.image_url, target_image.image_path,
      target_image.thumbnail_url, target_image.thumbnail_path,
      target_image.medium_url, target_image.medium_path,
      target_image.image_content_type,
      CASE WHEN target_image.media_type = 'video' THEN target_image.video_size_bytes ELSE target_image.image_size_bytes END,
      target_image.image_width, target_image.image_height, target_image.duration_seconds,
      target_image.source_url, target_image.provider_asset_id, target_image.provider_playback_id,
      target_image.provider_payload, target_image.video_preview_url,
      target_image.video_playback_url, target_image.video_hls_url,
      target_image.video_embed_url, now()
    ) RETURNING * INTO asset_row;

    UPDATE public.shadow_pin_creator_drafts draft_record SET
      active_asset_id = asset_row.id, state = 'publish_ready'
    WHERE draft_record.id = draft_row.id
    RETURNING * INTO draft_row;
  ELSIF draft_row.active_asset_id IS NOT NULL THEN
    SELECT * INTO asset_row FROM public.shadow_pin_draft_assets asset_record
    WHERE asset_record.id = draft_row.active_asset_id;
  END IF;

  RETURN jsonb_build_object(
    'draft', to_jsonb(draft_row),
    'asset', CASE WHEN asset_row.id IS NULL THEN NULL ELSE to_jsonb(asset_row) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_shadow_pin_creator_draft(
  target_draft_id uuid,
  target_expected_revision integer,
  target_source_kind text,
  target_category_id uuid,
  target_title text,
  target_description text,
  target_tags text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  current_draft public.shadow_pin_creator_drafts%ROWTYPE;
  updated_draft public.shadow_pin_creator_drafts%ROWTYPE;
  normalized_title text := trim(COALESCE(target_title, ''));
  normalized_description text := NULLIF(trim(COALESCE(target_description, '')), '');
  normalized_tags text[];
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO current_draft FROM public.shadow_pin_creator_drafts draft
  WHERE draft.id = target_draft_id AND draft.creator_id = caller_id FOR UPDATE;
  IF current_draft.id IS NULL THEN RAISE EXCEPTION 'Draft is unavailable'; END IF;
  IF current_draft.expires_at <= now() THEN RAISE EXCEPTION 'Draft has expired'; END IF;
  IF current_draft.revision <> target_expected_revision THEN RAISE EXCEPTION 'Draft changed on another device'; END IF;
  IF current_draft.state IN ('preparing_publish', 'published', 'abandoned') THEN RAISE EXCEPTION 'Draft cannot be edited in its current state'; END IF;
  IF target_source_kind NOT IN ('image_upload', 'image_url', 'video_upload', 'external_video') THEN
    RAISE EXCEPTION 'Unsupported draft source';
  END IF;
  IF char_length(normalized_title) > 80 THEN RAISE EXCEPTION 'Title must be at most 80 characters'; END IF;
  IF normalized_description IS NOT NULL AND char_length(normalized_description) > 500 THEN RAISE EXCEPTION 'Description is too long'; END IF;
  IF target_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shadow_pin_categories category
    WHERE category.id = target_category_id AND category.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'ShadowPin category is unavailable'; END IF;

  SELECT COALESCE(array_agg(clean_tag ORDER BY first_ordinal), ARRAY[]::text[])
  INTO normalized_tags
  FROM (
    SELECT clean_tag, min(ordinality) AS first_ordinal
    FROM (
      SELECT trim(both '-' from regexp_replace(lower(trim(raw_tag)), '[^a-z0-9]+', '-', 'g')) AS clean_tag, ordinality
      FROM unnest(COALESCE(target_tags, ARRAY[]::text[])) WITH ORDINALITY AS input(raw_tag, ordinality)
    ) cleaned
    WHERE clean_tag <> '' GROUP BY clean_tag ORDER BY min(ordinality) LIMIT 8
  ) bounded;

  UPDATE public.shadow_pin_creator_drafts draft SET
    source_kind = target_source_kind,
    category_id = target_category_id,
    title = normalized_title,
    description = normalized_description,
    tags = normalized_tags,
    last_error_code = NULL,
    last_error_message = NULL
  WHERE draft.id = current_draft.id
  RETURNING * INTO updated_draft;
  RETURN to_jsonb(updated_draft);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_shadow_pin_creator_drafts(target_limit integer DEFAULT 25)
RETURNS TABLE (draft jsonb, asset jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    to_jsonb(draft_row) AS draft,
    CASE WHEN asset_row.id IS NULL THEN NULL ELSE to_jsonb(asset_row) END AS asset
  FROM public.shadow_pin_creator_drafts draft_row
  LEFT JOIN public.shadow_pin_draft_assets asset_row ON asset_row.id = draft_row.active_asset_id
  WHERE draft_row.creator_id = auth.uid()
  ORDER BY draft_row.updated_at DESC, draft_row.id DESC
  LIMIT GREATEST(1, LEAST(COALESCE(target_limit, 25), 50));
$$;

CREATE OR REPLACE FUNCTION public.delete_shadow_pin_creator_draft(
  target_draft_id uuid,
  target_expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  draft_row public.shadow_pin_creator_drafts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.shadow_pin_creator_drafts draft SET
    state = 'abandoned', expires_at = LEAST(draft.expires_at, now())
  WHERE draft.id = target_draft_id AND draft.creator_id = auth.uid()
    AND draft.revision = target_expected_revision
    AND draft.state NOT IN ('published', 'abandoned')
  RETURNING * INTO draft_row;
  IF draft_row.id IS NULL THEN RAISE EXCEPTION 'Draft is unavailable'; END IF;
  RETURN to_jsonb(draft_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_shadow_pin_creator_draft(
  target_draft_id uuid,
  target_expected_revision integer,
  target_publish_idempotency_key uuid
)
RETURNS TABLE (draft jsonb, image jsonb, was_already_published boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  draft_row public.shadow_pin_creator_drafts%ROWTYPE;
  asset_row public.shadow_pin_draft_assets%ROWTYPE;
  image_row public.shadow_pin_images%ROWTYPE;
  media_type_value text;
  source_type_value text;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF target_publish_idempotency_key IS NULL THEN RAISE EXCEPTION 'Publish idempotency key is required'; END IF;

  SELECT * INTO draft_row
  FROM public.shadow_pin_creator_drafts draft_record
  WHERE draft_record.id = target_draft_id AND draft_record.creator_id = caller_id
  FOR UPDATE;
  IF draft_row.id IS NULL THEN RAISE EXCEPTION 'Draft is unavailable'; END IF;
  IF draft_row.publish_idempotency_key IS DISTINCT FROM target_publish_idempotency_key THEN
    RAISE EXCEPTION 'Publish idempotency key does not match this draft';
  END IF;

  IF draft_row.state = 'published' THEN
    SELECT * INTO image_row FROM public.shadow_pin_images image_record
    WHERE image_record.id = draft_row.published_image_id;
    RETURN QUERY SELECT to_jsonb(draft_row), to_jsonb(image_row), true;
    RETURN;
  END IF;

  IF draft_row.expires_at <= now() THEN RAISE EXCEPTION 'Draft has expired'; END IF;

  IF draft_row.revision <> target_expected_revision THEN
    RAISE EXCEPTION 'Draft changed on another device';
  END IF;
  IF draft_row.state <> 'publish_ready' OR draft_row.active_asset_id IS NULL THEN
    RAISE EXCEPTION 'Draft media is not ready to publish';
  END IF;

  SELECT * INTO asset_row
  FROM public.shadow_pin_draft_assets asset_record
  WHERE asset_record.id = draft_row.active_asset_id
    AND asset_record.draft_id = draft_row.id
    AND asset_record.creator_id = caller_id
    AND asset_record.state = 'publish_ready'
    AND asset_record.deleted_at IS NULL
  FOR UPDATE;
  IF asset_row.id IS NULL THEN RAISE EXCEPTION 'Draft asset is unavailable'; END IF;

  IF draft_row.category_id IS NULL THEN RAISE EXCEPTION 'Choose a category before publishing'; END IF;
  IF char_length(trim(draft_row.title)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Add a title before publishing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.shadow_pin_categories category
    WHERE category.id = draft_row.category_id AND category.deleted_at IS NULL
      AND (
        category.creator_id IS NULL OR category.creator_id = caller_id
        OR NOT private.users_have_block(caller_id, category.creator_id)
      )
  ) THEN RAISE EXCEPTION 'ShadowPin category is unavailable'; END IF;

  media_type_value := CASE asset_row.asset_kind
    WHEN 'image' THEN 'image'
    WHEN 'video' THEN 'video'
    ELSE 'external_video'
  END;
  source_type_value := CASE draft_row.source_kind
    WHEN 'image_url' THEN 'url_import'
    WHEN 'external_video' THEN 'external_embed'
    ELSE 'file_upload'
  END;

  IF draft_row.target_image_id IS NULL THEN
    INSERT INTO public.shadow_pin_images (
      category_id, creator_id, creator_draft_id, title, description,
      image_url, image_path, image_content_type, image_size_bytes,
      thumbnail_url, thumbnail_path, medium_url, medium_path,
      image_width, image_height, processing_status, processing_error, processed_at,
      media_type, source_type, source_url, provider, provider_asset_id,
      provider_playback_id, provider_payload, video_preview_url,
      video_playback_url, video_hls_url, video_embed_url,
      duration_seconds, video_size_bytes
    ) VALUES (
      draft_row.category_id, caller_id, draft_row.id, draft_row.title, draft_row.description,
      asset_row.final_image_url, asset_row.final_image_path, asset_row.content_type,
      CASE WHEN asset_row.asset_kind = 'image' THEN asset_row.size_bytes::integer ELSE NULL END,
      asset_row.final_thumbnail_url, asset_row.final_thumbnail_path,
      asset_row.final_medium_url, asset_row.final_medium_path,
      asset_row.image_width, asset_row.image_height, 'ready', NULL, now(),
      media_type_value, source_type_value, asset_row.source_url, asset_row.provider,
      asset_row.provider_asset_id, asset_row.provider_playback_id, asset_row.provider_payload,
      asset_row.video_preview_url, asset_row.video_playback_url, asset_row.video_hls_url,
      asset_row.video_embed_url, asset_row.duration_seconds,
      CASE WHEN asset_row.asset_kind = 'video' THEN asset_row.size_bytes::integer ELSE NULL END
    ) RETURNING * INTO image_row;
  ELSE
    SELECT * INTO image_row FROM public.shadow_pin_images current_image
    WHERE current_image.id = draft_row.target_image_id
      AND (
        current_image.creator_id = caller_id
        OR public.is_app_operator(caller_id)
      )
      AND current_image.deleted_at IS NULL
    FOR UPDATE;
    IF image_row.id IS NULL THEN RAISE EXCEPTION 'Replacement pin is unavailable'; END IF;

    UPDATE public.shadow_pin_images current_image SET
      creator_draft_id = draft_row.id,
      category_id = draft_row.category_id,
      title = draft_row.title,
      description = draft_row.description,
      image_url = asset_row.final_image_url,
      image_path = asset_row.final_image_path,
      image_content_type = asset_row.content_type,
      image_size_bytes = CASE WHEN asset_row.asset_kind = 'image' THEN asset_row.size_bytes::integer ELSE NULL END,
      thumbnail_url = asset_row.final_thumbnail_url,
      thumbnail_path = asset_row.final_thumbnail_path,
      medium_url = asset_row.final_medium_url,
      medium_path = asset_row.final_medium_path,
      image_width = asset_row.image_width,
      image_height = asset_row.image_height,
      processing_status = 'ready', processing_error = NULL, processed_at = now(),
      media_type = media_type_value, source_type = source_type_value,
      source_url = asset_row.source_url, provider = asset_row.provider,
      provider_asset_id = asset_row.provider_asset_id,
      provider_playback_id = asset_row.provider_playback_id,
      provider_payload = asset_row.provider_payload,
      video_preview_url = asset_row.video_preview_url,
      video_playback_url = asset_row.video_playback_url,
      video_hls_url = asset_row.video_hls_url,
      video_embed_url = asset_row.video_embed_url,
      duration_seconds = asset_row.duration_seconds,
      video_size_bytes = CASE WHEN asset_row.asset_kind = 'video' THEN asset_row.size_bytes::integer ELSE NULL END
    WHERE current_image.id = image_row.id
    RETURNING * INTO image_row;
  END IF;

  PERFORM public.set_shadow_pin_image_tags(image_row.id, draft_row.tags);

  UPDATE public.shadow_pin_creator_drafts draft_record SET
    state = 'published',
    published_image_id = image_row.id,
    published_at = now(),
    expires_at = now() + interval '7 days',
    last_error_code = NULL,
    last_error_message = NULL
  WHERE draft_record.id = draft_row.id
  RETURNING * INTO draft_row;

  RETURN QUERY SELECT to_jsonb(draft_row), to_jsonb(image_row), false;
END;
$$;

REVOKE ALL ON FUNCTION public.create_shadow_pin_creator_draft(uuid, text, text, text[], text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_shadow_pin_creator_draft(uuid, integer, text, uuid, text, text, text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_shadow_pin_creator_drafts(integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_shadow_pin_creator_draft(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_shadow_pin_creator_draft(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_shadow_pin_creator_draft(uuid, text, text, text[], text, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_shadow_pin_creator_draft(uuid, integer, text, uuid, text, text, text[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_shadow_pin_creator_drafts(integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shadow_pin_creator_draft(uuid, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_shadow_pin_creator_draft(uuid, integer, uuid)
  TO authenticated;

COMMENT ON TABLE public.shadow_pin_creator_drafts IS
  'Owner-private Creator Studio metadata. Drafts never appear in legacy ShadowPin feeds.';
COMMENT ON TABLE public.shadow_pin_draft_assets IS
  'Server-owned staged media ledger. Authenticated creators have read-only access and cannot forge readiness.';
COMMENT ON COLUMN public.shadow_pin_images.creator_draft_id IS
  'Optional idempotency link to the Creator Studio draft that created or last replaced this canonical ready pin.';
