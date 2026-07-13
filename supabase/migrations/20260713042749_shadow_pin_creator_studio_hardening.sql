/* ShadowPin Creator Studio hardening: stale-target guards, publish leases,
   transactional Bunny publication, and bounded draft asset growth. */

ALTER TABLE public.shadow_pin_creator_drafts
  ADD COLUMN target_image_updated_at timestamptz,
  ADD COLUMN target_image_content_revision bigint,
  ADD COLUMN promotion_lease_token uuid,
  ADD COLUMN promotion_lease_expires_at timestamptz,
  ADD COLUMN promotion_asset_id uuid REFERENCES public.shadow_pin_draft_assets(id) ON DELETE SET NULL;

ALTER TABLE public.shadow_pin_images
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 1
  CHECK (content_revision > 0);

UPDATE public.shadow_pin_creator_drafts draft
SET target_image_updated_at = image.updated_at
  , target_image_content_revision = image.content_revision
FROM public.shadow_pin_images image
WHERE image.id = draft.target_image_id
  AND draft.target_image_updated_at IS NULL;

ALTER TABLE public.shadow_pin_creator_drafts
  ADD CONSTRAINT shadow_pin_creator_drafts_target_snapshot_check
    CHECK (
      target_image_id IS NULL
      OR (target_image_updated_at IS NOT NULL AND target_image_content_revision IS NOT NULL)
    ),
  ADD CONSTRAINT shadow_pin_creator_drafts_promotion_lease_check
    CHECK (
      (promotion_lease_token IS NULL AND promotion_lease_expires_at IS NULL AND promotion_asset_id IS NULL)
      OR
      (promotion_lease_token IS NOT NULL AND promotion_lease_expires_at IS NOT NULL AND promotion_asset_id IS NOT NULL)
    );

ALTER TABLE public.shadow_pin_draft_assets
  ADD CONSTRAINT shadow_pin_draft_assets_generation_ceiling_check
    CHECK (generation BETWEEN 1 AND 32);

CREATE INDEX shadow_pin_creator_drafts_expired_promotion_lease_idx
  ON public.shadow_pin_creator_drafts (promotion_lease_expires_at, id)
  WHERE promotion_lease_expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION private.bump_shadow_pin_image_content_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.content_revision := OLD.content_revision + 1;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.bump_shadow_pin_image_content_revision()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER bump_shadow_pin_image_content_revision
  BEFORE UPDATE OF
    category_id, title, description, image_url, image_path,
    image_content_type, image_size_bytes, thumbnail_url, thumbnail_path,
    medium_url, medium_path, image_width, image_height, processing_status,
    deleted_at, media_type, source_type, source_url, provider,
    provider_asset_id, provider_playback_id, provider_payload,
    video_preview_url, video_playback_url, video_hls_url, video_embed_url,
    duration_seconds, video_size_bytes
  ON public.shadow_pin_images
  FOR EACH ROW EXECUTE FUNCTION private.bump_shadow_pin_image_content_revision();

CREATE OR REPLACE FUNCTION private.capture_shadow_pin_target_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.target_image_id IS NULL THEN
    NEW.target_image_updated_at := NULL;
    NEW.target_image_content_revision := NULL;
    RETURN NEW;
  END IF;

  SELECT image.updated_at, image.content_revision
  INTO NEW.target_image_updated_at, NEW.target_image_content_revision
  FROM public.shadow_pin_images image
  WHERE image.id = NEW.target_image_id
    AND image.deleted_at IS NULL;

  IF NEW.target_image_updated_at IS NULL OR NEW.target_image_content_revision IS NULL THEN
    RAISE EXCEPTION 'Replacement pin is unavailable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_shadow_pin_target_snapshot()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER capture_shadow_pin_target_snapshot
  BEFORE INSERT OR UPDATE OF target_image_id ON public.shadow_pin_creator_drafts
  FOR EACH ROW EXECUTE FUNCTION private.capture_shadow_pin_target_snapshot();

CREATE OR REPLACE FUNCTION private.enforce_shadow_pin_draft_asset_caps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  draft_creator_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.draft_id::text, 0));

  SELECT draft.creator_id INTO draft_creator_id
  FROM public.shadow_pin_creator_drafts draft
  WHERE draft.id = NEW.draft_id;
  IF draft_creator_id IS NULL OR draft_creator_id <> NEW.creator_id THEN
    RAISE EXCEPTION 'Draft asset owner does not match the draft';
  END IF;
  IF NEW.generation > 32 THEN
    RAISE EXCEPTION 'Draft media generation limit reached';
  END IF;
  IF (SELECT count(*) FROM public.shadow_pin_draft_assets asset
      WHERE asset.draft_id = NEW.draft_id
        AND asset.deleted_at IS NULL
        AND asset.state NOT IN ('failed', 'superseded', 'deleted')) >= 4 THEN
    RAISE EXCEPTION 'Clean up an older draft asset before adding another';
  END IF;
  IF (SELECT count(*) FROM public.shadow_pin_draft_assets asset
      WHERE asset.creator_id = NEW.creator_id
        AND asset.deleted_at IS NULL
        AND asset.state NOT IN ('failed', 'superseded', 'deleted')) >= 40 THEN
    RAISE EXCEPTION 'Too many active Creator Studio assets';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_shadow_pin_draft_asset_caps()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_shadow_pin_draft_asset_caps
  BEFORE INSERT ON public.shadow_pin_draft_assets
  FOR EACH ROW EXECUTE FUNCTION private.enforce_shadow_pin_draft_asset_caps();

CREATE OR REPLACE FUNCTION public.claim_shadow_pin_image_promotion(
  target_creator_id uuid,
  target_draft_id uuid,
  target_expected_revision integer,
  target_asset_id uuid,
  target_lease_token uuid,
  target_lease_seconds integer DEFAULT 180
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  draft_row public.shadow_pin_creator_drafts%ROWTYPE;
BEGIN
  IF target_creator_id IS NULL OR target_lease_token IS NULL THEN
    RAISE EXCEPTION 'Promotion identity is required';
  END IF;
  SELECT * INTO draft_row FROM public.shadow_pin_creator_drafts draft
  WHERE draft.id = target_draft_id AND draft.creator_id = target_creator_id
  FOR UPDATE;
  IF draft_row.id IS NULL OR draft_row.state IN ('published', 'abandoned') THEN
    RAISE EXCEPTION 'Creator draft is unavailable';
  END IF;
  IF draft_row.expires_at <= now() THEN RAISE EXCEPTION 'Draft has expired'; END IF;
  IF draft_row.promotion_lease_token = target_lease_token
    AND draft_row.promotion_asset_id = target_asset_id
    AND draft_row.promotion_lease_expires_at > now() THEN
    RETURN to_jsonb(draft_row);
  END IF;
  IF draft_row.revision <> target_expected_revision THEN
    RAISE EXCEPTION 'Draft changed on another device';
  END IF;
  IF draft_row.promotion_lease_expires_at > now() THEN
    RAISE EXCEPTION 'Draft publish is already in progress';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shadow_pin_draft_assets asset
    WHERE asset.id = target_asset_id
      AND asset.draft_id = target_draft_id
      AND asset.creator_id = target_creator_id
      AND asset.provider = 'shadow_pin_storage'
      AND asset.asset_kind = 'image'
      AND asset.state IN ('ready', 'publish_ready')
      AND asset.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Draft image asset is unavailable'; END IF;

  UPDATE public.shadow_pin_creator_drafts draft SET
    active_asset_id = target_asset_id,
    state = 'preparing_publish',
    promotion_lease_token = target_lease_token,
    promotion_lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(target_lease_seconds, 60), 600)),
    promotion_asset_id = target_asset_id,
    last_error_code = NULL,
    last_error_message = NULL
  WHERE draft.id = target_draft_id
  RETURNING * INTO draft_row;
  RETURN to_jsonb(draft_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_shadow_pin_image_promotion(
  target_creator_id uuid,
  target_draft_id uuid,
  target_lease_token uuid,
  target_next_state text DEFAULT 'ready'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  draft_row public.shadow_pin_creator_drafts%ROWTYPE;
BEGIN
  IF target_next_state NOT IN ('ready', 'publish_ready', 'failed', 'abandoned') THEN
    RAISE EXCEPTION 'Unsupported promotion recovery state';
  END IF;
  UPDATE public.shadow_pin_creator_drafts draft SET
    state = CASE WHEN draft.state IN ('published', 'abandoned') THEN draft.state ELSE target_next_state END,
    promotion_lease_token = NULL,
    promotion_lease_expires_at = NULL,
    promotion_asset_id = NULL
  WHERE draft.id = target_draft_id
    AND draft.creator_id = target_creator_id
    AND draft.promotion_lease_token = target_lease_token
  RETURNING * INTO draft_row;
  IF draft_row.id IS NULL THEN RAISE EXCEPTION 'Promotion lease is unavailable'; END IF;
  RETURN to_jsonb(draft_row);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_shadow_pin_image_promotion(uuid, uuid, integer, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_shadow_pin_image_promotion(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_shadow_pin_image_promotion(uuid, uuid, integer, uuid, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_shadow_pin_image_promotion(uuid, uuid, uuid, text)
  TO service_role;

ALTER FUNCTION public.finalize_shadow_pin_creator_draft(uuid, integer, uuid) SET SCHEMA private;
ALTER FUNCTION private.finalize_shadow_pin_creator_draft(uuid, integer, uuid)
  RENAME TO finalize_shadow_pin_creator_draft_v1;
REVOKE ALL ON FUNCTION private.finalize_shadow_pin_creator_draft_v1(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

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
  target_row public.shadow_pin_images%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO draft_row FROM public.shadow_pin_creator_drafts draft_record
  WHERE draft_record.id = target_draft_id AND draft_record.creator_id = caller_id
  FOR UPDATE;
  IF draft_row.id IS NULL THEN RAISE EXCEPTION 'Draft is unavailable'; END IF;

  IF draft_row.state <> 'published' AND draft_row.target_image_id IS NOT NULL THEN
    SELECT * INTO target_row FROM public.shadow_pin_images image_record
    WHERE image_record.id = draft_row.target_image_id AND image_record.deleted_at IS NULL
    FOR UPDATE;
    IF target_row.id IS NULL THEN RAISE EXCEPTION 'Replacement pin is unavailable'; END IF;
    IF draft_row.target_image_content_revision IS NULL
      OR target_row.content_revision IS DISTINCT FROM draft_row.target_image_content_revision THEN
      RAISE EXCEPTION 'Target Pin changed after this draft was created';
    END IF;
  END IF;

  RETURN QUERY
  SELECT result.draft, result.image, result.was_already_published
  FROM private.finalize_shadow_pin_creator_draft_v1(
    target_draft_id, target_expected_revision, target_publish_idempotency_key
  ) result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_shadow_pin_creator_draft(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_shadow_pin_creator_draft(uuid, integer, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_shadow_pin_creator_bunny_draft(
  target_draft_id uuid,
  target_expected_revision integer,
  target_publish_idempotency_key uuid,
  target_asset_id uuid,
  target_video_preview_url text,
  target_video_playback_url text,
  target_video_hls_url text,
  target_video_embed_url text
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
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO draft_row FROM public.shadow_pin_creator_drafts draft_record
  WHERE draft_record.id = target_draft_id AND draft_record.creator_id = caller_id
  FOR UPDATE;
  IF draft_row.id IS NULL THEN RAISE EXCEPTION 'Draft is unavailable'; END IF;

  IF draft_row.state = 'published' THEN
    RETURN QUERY SELECT * FROM public.finalize_shadow_pin_creator_draft(
      target_draft_id, target_expected_revision, target_publish_idempotency_key
    );
    RETURN;
  END IF;
  IF draft_row.revision <> target_expected_revision THEN
    RAISE EXCEPTION 'Draft changed on another device';
  END IF;
  SELECT * INTO asset_row FROM public.shadow_pin_draft_assets asset_record
  WHERE asset_record.id = target_asset_id
    AND asset_record.draft_id = target_draft_id
    AND asset_record.creator_id = caller_id
    AND asset_record.provider = 'bunny_stream'
    AND asset_record.asset_kind = 'video'
    AND asset_record.state IN ('ready', 'publish_ready')
    AND asset_record.deleted_at IS NULL
  FOR UPDATE;
  IF asset_row.id IS NULL THEN RAISE EXCEPTION 'Bunny draft asset is unavailable'; END IF;
  IF COALESCE(target_video_embed_url, target_video_playback_url, target_video_hls_url) IS NULL THEN
    RAISE EXCEPTION 'Bunny playback is unavailable';
  END IF;

  UPDATE public.shadow_pin_draft_assets asset_record SET
    state = 'publish_ready',
    video_preview_url = target_video_preview_url,
    video_playback_url = target_video_playback_url,
    video_hls_url = target_video_hls_url,
    video_embed_url = target_video_embed_url,
    ready_at = COALESCE(asset_record.ready_at, now())
  WHERE asset_record.id = asset_row.id;
  UPDATE public.shadow_pin_creator_drafts draft_record SET
    active_asset_id = asset_row.id,
    state = 'publish_ready'
  WHERE draft_record.id = draft_row.id
  RETURNING * INTO draft_row;

  RETURN QUERY SELECT * FROM public.finalize_shadow_pin_creator_draft(
    target_draft_id, draft_row.revision, target_publish_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_shadow_pin_creator_bunny_draft(
  uuid, integer, uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_shadow_pin_creator_bunny_draft(
  uuid, integer, uuid, uuid, text, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION private.touch_shadow_pin_creator_draft()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := now();
  IF NEW.state IN ('published', 'abandoned') THEN
    NEW.promotion_lease_token := NULL;
    NEW.promotion_lease_expires_at := NULL;
    NEW.promotion_asset_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.touch_shadow_pin_creator_draft()
  FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.shadow_pin_creator_drafts.target_image_updated_at IS
  'Server-captured target version used to reject stale replacement publishes.';
COMMENT ON COLUMN public.shadow_pin_creator_drafts.target_image_content_revision IS
  'Server-captured canonical content revision; engagement-only counters do not invalidate replacement drafts.';
COMMENT ON FUNCTION public.claim_shadow_pin_image_promotion(uuid, uuid, integer, uuid, uuid, integer) IS
  'Service-only expiring lease for interruption-safe private-to-public image promotion.';
COMMENT ON FUNCTION public.finalize_shadow_pin_creator_bunny_draft(uuid, integer, uuid, uuid, text, text, text, text) IS
  'Authenticated transactional Bunny playback publication; draft playback stays null before commit.';
