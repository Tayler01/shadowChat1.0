/*
  # Non-message discovery library items

  Extends the existing private message library with independently stored saves
  for consumer-visible ShadowPin posts, Shado TV episodes, and Shadow Mystery
  stories. Existing message library tables and RPCs remain unchanged.

  All content reads run as the caller. Explicit publication predicates are
  intentionally stricter than operator SELECT policies so drafts, hidden rows,
  and soft-deleted Play content never enter the consumer library.

  Returned thumbnail_path values are reference metadata for existing guarded
  media helpers. This migration adds no Storage object read, list, or bucket
  enumeration privilege.
*/

CREATE TABLE public.saved_discovery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  collection_id uuid REFERENCES public.message_collections(id) ON DELETE SET NULL,
  target_kind text NOT NULL CHECK (
    target_kind IN ('shadow_pin', 'shado_tv_video', 'shadow_mystery_story')
  ),
  shadow_pin_image_id uuid REFERENCES public.shadow_pin_images(id) ON DELETE CASCADE,
  shado_tv_video_id uuid REFERENCES public.shado_tv_videos(id) ON DELETE CASCADE,
  shadow_mystery_story_id uuid REFERENCES public.shadow_mystery_stories(id) ON DELETE CASCADE,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_discovery_items_exact_target_check CHECK (
    (
      target_kind = 'shadow_pin'
      AND shadow_pin_image_id IS NOT NULL
      AND shado_tv_video_id IS NULL
      AND shadow_mystery_story_id IS NULL
    )
    OR (
      target_kind = 'shado_tv_video'
      AND shadow_pin_image_id IS NULL
      AND shado_tv_video_id IS NOT NULL
      AND shadow_mystery_story_id IS NULL
    )
    OR (
      target_kind = 'shadow_mystery_story'
      AND shadow_pin_image_id IS NULL
      AND shado_tv_video_id IS NULL
      AND shadow_mystery_story_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX saved_discovery_items_pin_owner_unique_idx
  ON public.saved_discovery_items (user_id, shadow_pin_image_id)
  WHERE shadow_pin_image_id IS NOT NULL;
CREATE UNIQUE INDEX saved_discovery_items_tv_owner_unique_idx
  ON public.saved_discovery_items (user_id, shado_tv_video_id)
  WHERE shado_tv_video_id IS NOT NULL;
CREATE UNIQUE INDEX saved_discovery_items_mystery_owner_unique_idx
  ON public.saved_discovery_items (user_id, shadow_mystery_story_id)
  WHERE shadow_mystery_story_id IS NOT NULL;

CREATE INDEX saved_discovery_items_owner_recent_idx
  ON public.saved_discovery_items (user_id, created_at DESC, id DESC);
CREATE INDEX saved_discovery_items_collection_recent_idx
  ON public.saved_discovery_items (collection_id, created_at DESC, id DESC)
  WHERE collection_id IS NOT NULL;
CREATE INDEX saved_discovery_items_pin_target_idx
  ON public.saved_discovery_items (shadow_pin_image_id)
  WHERE shadow_pin_image_id IS NOT NULL;
CREATE INDEX saved_discovery_items_tv_target_idx
  ON public.saved_discovery_items (shado_tv_video_id)
  WHERE shado_tv_video_id IS NOT NULL;
CREATE INDEX saved_discovery_items_mystery_target_idx
  ON public.saved_discovery_items (shadow_mystery_story_id)
  WHERE shadow_mystery_story_id IS NOT NULL;

CREATE INDEX shado_tv_videos_discovery_search_idx
  ON public.shado_tv_videos USING gin ((
    pg_catalog.setweight(
      pg_catalog.to_tsvector('simple', coalesce(title, '')),
      'A'
    )
    || pg_catalog.setweight(
      pg_catalog.to_tsvector('simple', coalesce(subtitle, '')),
      'B'
    )
    || pg_catalog.setweight(
      pg_catalog.to_tsvector('simple', coalesce(description, '')),
      'C'
    )
  ))
  WHERE deleted_at IS NULL AND visibility_status = 'published';

CREATE INDEX shadow_mystery_stories_discovery_search_idx
  ON public.shadow_mystery_stories USING gin ((
    pg_catalog.setweight(
      pg_catalog.to_tsvector('simple', coalesce(title, '')),
      'A'
    )
    || pg_catalog.setweight(
      pg_catalog.to_tsvector('simple', coalesce(subtitle, '')),
      'B'
    )
    || pg_catalog.setweight(
      pg_catalog.to_tsvector(
        'simple',
        coalesce(location_label, '') || ' ' || coalesce(deck, '')
      ),
      'C'
    )
  ))
  WHERE status = 'published' AND published_at IS NOT NULL;

ALTER TABLE public.saved_discovery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own saved discovery items"
ON public.saved_discovery_items
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

CREATE POLICY "Members can create visible discovery saves"
ON public.saved_discovery_items
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (select auth.uid())
  AND (
    collection_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.message_collections collections
      WHERE collections.id = saved_discovery_items.collection_id
        AND collections.user_id = (select auth.uid())
    )
  )
  AND (
    (
      target_kind = 'shadow_pin'
      AND EXISTS (
        SELECT 1
        FROM public.shadow_pin_images images
        JOIN public.shadow_pin_categories categories ON categories.id = images.category_id
        WHERE images.id = saved_discovery_items.shadow_pin_image_id
          AND images.deleted_at IS NULL
          AND categories.deleted_at IS NULL
          AND NOT private.users_have_block((select auth.uid()), images.creator_id)
      )
    )
    OR (
      target_kind = 'shado_tv_video'
      AND EXISTS (
        SELECT 1
        FROM public.shado_tv_videos videos
        JOIN public.shado_tv_channels channels ON channels.id = videos.channel_id
        WHERE videos.id = saved_discovery_items.shado_tv_video_id
          AND videos.deleted_at IS NULL
          AND videos.visibility_status = 'published'
          AND channels.deleted_at IS NULL
          AND channels.visibility_status = 'published'
      )
    )
    OR (
      target_kind = 'shadow_mystery_story'
      AND EXISTS (
        SELECT 1
        FROM public.shadow_mystery_stories stories
        WHERE stories.id = saved_discovery_items.shadow_mystery_story_id
          AND stories.status = 'published'
          AND stories.published_at IS NOT NULL
      )
    )
  )
);

CREATE POLICY "Members can update own visible discovery saves"
ON public.saved_discovery_items
FOR UPDATE
TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (
  user_id = (select auth.uid())
  AND (
    collection_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.message_collections collections
      WHERE collections.id = saved_discovery_items.collection_id
        AND collections.user_id = (select auth.uid())
    )
  )
  AND (
    (
      target_kind = 'shadow_pin'
      AND EXISTS (
        SELECT 1
        FROM public.shadow_pin_images images
        JOIN public.shadow_pin_categories categories ON categories.id = images.category_id
        WHERE images.id = saved_discovery_items.shadow_pin_image_id
          AND images.deleted_at IS NULL
          AND categories.deleted_at IS NULL
          AND NOT private.users_have_block((select auth.uid()), images.creator_id)
      )
    )
    OR (
      target_kind = 'shado_tv_video'
      AND EXISTS (
        SELECT 1
        FROM public.shado_tv_videos videos
        JOIN public.shado_tv_channels channels ON channels.id = videos.channel_id
        WHERE videos.id = saved_discovery_items.shado_tv_video_id
          AND videos.deleted_at IS NULL
          AND videos.visibility_status = 'published'
          AND channels.deleted_at IS NULL
          AND channels.visibility_status = 'published'
      )
    )
    OR (
      target_kind = 'shadow_mystery_story'
      AND EXISTS (
        SELECT 1
        FROM public.shadow_mystery_stories stories
        WHERE stories.id = saved_discovery_items.shadow_mystery_story_id
          AND stories.status = 'published'
          AND stories.published_at IS NOT NULL
      )
    )
  )
);

CREATE POLICY "Members can delete own discovery saves"
ON public.saved_discovery_items
FOR DELETE
TO authenticated
USING (user_id = (select auth.uid()));

DROP TRIGGER IF EXISTS update_saved_discovery_items_updated_at ON public.saved_discovery_items;
CREATE TRIGGER update_saved_discovery_items_updated_at
  BEFORE UPDATE ON public.saved_discovery_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.save_discovery_item_to_library(
  target_kind pg_catalog.text,
  target_id pg_catalog.uuid,
  target_collection_id pg_catalog.uuid DEFAULT NULL,
  target_note pg_catalog.text DEFAULT NULL
)
RETURNS pg_catalog.uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  caller_id pg_catalog.uuid := auth.uid();
  normalized_note pg_catalog.text := NULLIF(pg_catalog.btrim(target_note), '');
  saved_id pg_catalog.uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF target_kind NOT IN ('shadow_pin', 'shado_tv_video', 'shadow_mystery_story') THEN
    RAISE EXCEPTION 'Unsupported discovery target kind';
  END IF;
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'Discovery target is required';
  END IF;
  IF normalized_note IS NOT NULL AND pg_catalog.char_length(normalized_note) > 500 THEN
    RAISE EXCEPTION 'Saved discovery note is too long';
  END IF;
  IF target_collection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.message_collections collections
    WHERE collections.id = target_collection_id
      AND collections.user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Library collection is unavailable';
  END IF;

  IF target_kind = 'shadow_pin' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.shadow_pin_images images
      JOIN public.shadow_pin_categories categories ON categories.id = images.category_id
      WHERE images.id = target_id
        AND images.deleted_at IS NULL
        AND categories.deleted_at IS NULL
        AND NOT private.users_have_block(caller_id, images.creator_id)
    ) THEN
      RAISE EXCEPTION 'Discovery target is not available';
    END IF;

    INSERT INTO public.saved_discovery_items (
      user_id, collection_id, target_kind, shadow_pin_image_id, note
    ) VALUES (
      caller_id, target_collection_id, 'shadow_pin', target_id, normalized_note
    )
    ON CONFLICT (user_id, shadow_pin_image_id) WHERE shadow_pin_image_id IS NOT NULL
    DO UPDATE SET
      collection_id = EXCLUDED.collection_id,
      note = EXCLUDED.note,
      updated_at = pg_catalog.now()
    RETURNING id INTO saved_id;
  ELSIF target_kind = 'shado_tv_video' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.shado_tv_videos videos
      JOIN public.shado_tv_channels channels ON channels.id = videos.channel_id
      WHERE videos.id = target_id
        AND videos.deleted_at IS NULL
        AND videos.visibility_status = 'published'
        AND channels.deleted_at IS NULL
        AND channels.visibility_status = 'published'
    ) THEN
      RAISE EXCEPTION 'Discovery target is not available';
    END IF;

    INSERT INTO public.saved_discovery_items (
      user_id, collection_id, target_kind, shado_tv_video_id, note
    ) VALUES (
      caller_id, target_collection_id, 'shado_tv_video', target_id, normalized_note
    )
    ON CONFLICT (user_id, shado_tv_video_id) WHERE shado_tv_video_id IS NOT NULL
    DO UPDATE SET
      collection_id = EXCLUDED.collection_id,
      note = EXCLUDED.note,
      updated_at = pg_catalog.now()
    RETURNING id INTO saved_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.shadow_mystery_stories stories
      WHERE stories.id = target_id
        AND stories.status = 'published'
        AND stories.published_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Discovery target is not available';
    END IF;

    INSERT INTO public.saved_discovery_items (
      user_id, collection_id, target_kind, shadow_mystery_story_id, note
    ) VALUES (
      caller_id, target_collection_id, 'shadow_mystery_story', target_id, normalized_note
    )
    ON CONFLICT (user_id, shadow_mystery_story_id) WHERE shadow_mystery_story_id IS NOT NULL
    DO UPDATE SET
      collection_id = EXCLUDED.collection_id,
      note = EXCLUDED.note,
      updated_at = pg_catalog.now()
    RETURNING id INTO saved_id;
  END IF;

  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_discovery_item_to_collection(
  saved_item_id pg_catalog.uuid,
  target_collection_id pg_catalog.uuid DEFAULT NULL
)
RETURNS pg_catalog.uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  caller_id pg_catalog.uuid := auth.uid();
  saved_item public.saved_discovery_items%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF target_collection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.message_collections collections
    WHERE collections.id = target_collection_id
      AND collections.user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Library collection is unavailable';
  END IF;

  SELECT saves.*
  INTO saved_item
  FROM public.saved_discovery_items saves
  WHERE saves.id = saved_item_id
    AND saves.user_id = caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saved discovery item is unavailable';
  END IF;

  IF saved_item.target_kind = 'shadow_pin' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.shadow_pin_images images
      JOIN public.shadow_pin_categories categories ON categories.id = images.category_id
      WHERE images.id = saved_item.shadow_pin_image_id
        AND images.deleted_at IS NULL
        AND categories.deleted_at IS NULL
        AND NOT private.users_have_block(caller_id, images.creator_id)
    ) THEN
      RAISE EXCEPTION 'Discovery target is not available';
    END IF;
  ELSIF saved_item.target_kind = 'shado_tv_video' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.shado_tv_videos videos
      JOIN public.shado_tv_channels channels ON channels.id = videos.channel_id
      WHERE videos.id = saved_item.shado_tv_video_id
        AND videos.deleted_at IS NULL
        AND videos.visibility_status = 'published'
        AND channels.deleted_at IS NULL
        AND channels.visibility_status = 'published'
    ) THEN
      RAISE EXCEPTION 'Discovery target is not available';
    END IF;
  ELSIF saved_item.target_kind = 'shadow_mystery_story' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.shadow_mystery_stories stories
      WHERE stories.id = saved_item.shadow_mystery_story_id
        AND stories.status = 'published'
        AND stories.published_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Discovery target is not available';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported discovery target kind';
  END IF;

  UPDATE public.saved_discovery_items saves
  SET collection_id = target_collection_id,
      updated_at = pg_catalog.now()
  WHERE saves.id = saved_item.id
    AND saves.user_id = caller_id;

  RETURN saved_item.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_discovery_item_from_library(
  saved_item_id pg_catalog.uuid
)
RETURNS pg_catalog.bool
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  caller_id pg_catalog.uuid := auth.uid();
  removed_id pg_catalog.uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  /*
    Removal stays available after a target becomes hidden or soft-deleted. It
    reveals no target content and lets owners clean stale private references.
  */
  DELETE FROM public.saved_discovery_items saves
  WHERE saves.id = saved_item_id
    AND saves.user_id = caller_id
  RETURNING saves.id INTO removed_id;

  RETURN removed_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_saved_discovery_items(
  collection_filter pg_catalog.uuid DEFAULT NULL,
  result_limit pg_catalog.int4 DEFAULT 100
)
RETURNS TABLE (
  saved_id pg_catalog.uuid,
  target_kind pg_catalog.text,
  target_id pg_catalog.uuid,
  parent_id pg_catalog.uuid,
  target_slug pg_catalog.text,
  parent_slug pg_catalog.text,
  title pg_catalog.text,
  subtitle pg_catalog.text,
  description pg_catalog.text,
  thumbnail_url pg_catalog.text,
  thumbnail_path pg_catalog.text,
  creator pg_catalog.jsonb,
  collection_id pg_catalog.uuid,
  note pg_catalog.text,
  saved_at pg_catalog.timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH visible_saves AS (
    SELECT
      saves.id AS saved_id,
      'shadow_pin'::pg_catalog.text AS target_kind,
      images.id AS target_id,
      images.category_id AS parent_id,
      NULL::pg_catalog.text AS target_slug,
      NULL::pg_catalog.text AS parent_slug,
      images.title,
      NULL::pg_catalog.text AS subtitle,
      images.description,
      coalesce(images.thumbnail_url, images.medium_url, images.image_url) AS thumbnail_url,
      coalesce(images.thumbnail_path, images.medium_path, images.image_path) AS thumbnail_path,
      CASE
        WHEN profiles.id IS NULL THEN NULL::pg_catalog.jsonb
        ELSE public.user_public_profile_json(profiles)
      END AS creator,
      saves.collection_id,
      saves.note,
      saves.created_at AS saved_at
    FROM public.saved_discovery_items saves
    JOIN public.shadow_pin_images images ON images.id = saves.shadow_pin_image_id
    JOIN public.shadow_pin_categories categories ON categories.id = images.category_id
    LEFT JOIN public.users profiles ON profiles.id = images.creator_id
    WHERE saves.user_id = (select auth.uid())
      AND saves.target_kind = 'shadow_pin'
      AND ($1 IS NULL OR saves.collection_id = $1)
      AND images.deleted_at IS NULL
      AND categories.deleted_at IS NULL
      AND NOT private.users_have_block((select auth.uid()), images.creator_id)

    UNION ALL

    SELECT
      saves.id AS saved_id,
      'shado_tv_video'::pg_catalog.text AS target_kind,
      videos.id AS target_id,
      channels.id AS parent_id,
      videos.slug AS target_slug,
      channels.slug AS parent_slug,
      videos.title,
      videos.subtitle,
      videos.description,
      coalesce(videos.thumbnail_asset_url, videos.poster_asset_url) AS thumbnail_url,
      coalesce(videos.thumbnail_asset_path, videos.poster_asset_path) AS thumbnail_path,
      NULL::pg_catalog.jsonb AS creator,
      saves.collection_id,
      saves.note,
      saves.created_at AS saved_at
    FROM public.saved_discovery_items saves
    JOIN public.shado_tv_videos videos ON videos.id = saves.shado_tv_video_id
    JOIN public.shado_tv_channels channels ON channels.id = videos.channel_id
    WHERE saves.user_id = (select auth.uid())
      AND saves.target_kind = 'shado_tv_video'
      AND ($1 IS NULL OR saves.collection_id = $1)
      AND videos.deleted_at IS NULL
      AND videos.visibility_status = 'published'
      AND channels.deleted_at IS NULL
      AND channels.visibility_status = 'published'

    UNION ALL

    SELECT
      saves.id AS saved_id,
      'shadow_mystery_story'::pg_catalog.text AS target_kind,
      stories.id AS target_id,
      NULL::pg_catalog.uuid AS parent_id,
      stories.slug AS target_slug,
      NULL::pg_catalog.text AS parent_slug,
      stories.title,
      stories.subtitle,
      stories.deck AS description,
      NULL::pg_catalog.text AS thumbnail_url,
      cover.storage_path AS thumbnail_path,
      NULL::pg_catalog.jsonb AS creator,
      saves.collection_id,
      saves.note,
      saves.created_at AS saved_at
    FROM public.saved_discovery_items saves
    JOIN public.shadow_mystery_stories stories ON stories.id = saves.shadow_mystery_story_id
    LEFT JOIN LATERAL (
      SELECT images.storage_path
      FROM public.shadow_mystery_images images
      WHERE images.story_id = stories.id
        AND images.role = 'cover'
      ORDER BY images.created_at, images.id
      LIMIT 1
    ) cover ON true
    WHERE saves.user_id = (select auth.uid())
      AND saves.target_kind = 'shadow_mystery_story'
      AND ($1 IS NULL OR saves.collection_id = $1)
      AND stories.status = 'published'
      AND stories.published_at IS NOT NULL
  )
  SELECT *
  FROM visible_saves
  ORDER BY saved_at DESC, saved_id DESC
  LIMIT greatest(1, least(coalesce($2, 100), 200));
$$;

CREATE OR REPLACE FUNCTION public.search_published_play_content(
  search_query pg_catalog.text,
  result_limit pg_catalog.int4 DEFAULT 20
)
RETURNS TABLE (
  target_kind pg_catalog.text,
  target_id pg_catalog.uuid,
  parent_id pg_catalog.uuid,
  target_slug pg_catalog.text,
  parent_slug pg_catalog.text,
  title pg_catalog.text,
  subtitle pg_catalog.text,
  description pg_catalog.text,
  thumbnail_url pg_catalog.text,
  thumbnail_path pg_catalog.text,
  search_rank pg_catalog.float4
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH query AS (
    SELECT pg_catalog.websearch_to_tsquery(
      'simple',
      pg_catalog.left(pg_catalog.btrim($1), 120)
    ) AS value
  ),
  visible_matches AS (
    SELECT
      'shado_tv_video'::pg_catalog.text AS target_kind,
      videos.id AS target_id,
      channels.id AS parent_id,
      videos.slug AS target_slug,
      channels.slug AS parent_slug,
      videos.title,
      videos.subtitle,
      videos.description,
      coalesce(videos.thumbnail_asset_url, videos.poster_asset_url) AS thumbnail_url,
      coalesce(videos.thumbnail_asset_path, videos.poster_asset_path) AS thumbnail_path,
      pg_catalog.ts_rank_cd(
        pg_catalog.setweight(
          pg_catalog.to_tsvector('simple', coalesce(videos.title, '')),
          'A'
        )
        || pg_catalog.setweight(
          pg_catalog.to_tsvector('simple', coalesce(videos.subtitle, '')),
          'B'
        )
        || pg_catalog.setweight(
          pg_catalog.to_tsvector('simple', coalesce(videos.description, '')),
          'C'
        ),
        query.value
      )::pg_catalog.float4 AS search_rank
    FROM public.shado_tv_videos videos
    JOIN public.shado_tv_channels channels ON channels.id = videos.channel_id
    CROSS JOIN query
    WHERE pg_catalog.btrim($1) <> ''
      AND videos.deleted_at IS NULL
      AND videos.visibility_status = 'published'
      AND channels.deleted_at IS NULL
      AND channels.visibility_status = 'published'
      AND (
        pg_catalog.setweight(
          pg_catalog.to_tsvector('simple', coalesce(videos.title, '')),
          'A'
        )
        || pg_catalog.setweight(
          pg_catalog.to_tsvector('simple', coalesce(videos.subtitle, '')),
          'B'
        )
        || pg_catalog.setweight(
          pg_catalog.to_tsvector('simple', coalesce(videos.description, '')),
          'C'
        )
      ) @@ query.value

    UNION ALL

    SELECT
      'shadow_mystery_story'::pg_catalog.text AS target_kind,
      stories.id AS target_id,
      NULL::pg_catalog.uuid AS parent_id,
      stories.slug AS target_slug,
      NULL::pg_catalog.text AS parent_slug,
      stories.title,
      stories.subtitle,
      stories.deck AS description,
      NULL::pg_catalog.text AS thumbnail_url,
      cover.storage_path AS thumbnail_path,
      pg_catalog.ts_rank_cd(
        pg_catalog.setweight(
          pg_catalog.to_tsvector('simple', coalesce(stories.title, '')),
          'A'
        )
        || pg_catalog.setweight(
          pg_catalog.to_tsvector('simple', coalesce(stories.subtitle, '')),
          'B'
        )
        || pg_catalog.setweight(
          pg_catalog.to_tsvector(
            'simple',
            coalesce(stories.location_label, '') || ' ' || coalesce(stories.deck, '')
          ),
          'C'
        ),
        query.value
      )::pg_catalog.float4 AS search_rank
    FROM public.shadow_mystery_stories stories
    CROSS JOIN query
    LEFT JOIN LATERAL (
      SELECT images.storage_path
      FROM public.shadow_mystery_images images
      WHERE images.story_id = stories.id
        AND images.role = 'cover'
      ORDER BY images.created_at, images.id
      LIMIT 1
    ) cover ON true
    WHERE pg_catalog.btrim($1) <> ''
      AND stories.status = 'published'
      AND stories.published_at IS NOT NULL
      AND (
        pg_catalog.setweight(
          pg_catalog.to_tsvector('simple', coalesce(stories.title, '')),
          'A'
        )
        || pg_catalog.setweight(
          pg_catalog.to_tsvector('simple', coalesce(stories.subtitle, '')),
          'B'
        )
        || pg_catalog.setweight(
          pg_catalog.to_tsvector(
            'simple',
            coalesce(stories.location_label, '') || ' ' || coalesce(stories.deck, '')
          ),
          'C'
        )
      ) @@ query.value
  )
  SELECT *
  FROM visible_matches
  ORDER BY search_rank DESC, title, target_id
  LIMIT greatest(1, least(coalesce($2, 20), 60));
$$;

REVOKE ALL ON TABLE public.saved_discovery_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_discovery_items TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.saved_discovery_items TO service_role;

REVOKE ALL ON FUNCTION public.save_discovery_item_to_library(text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_discovery_item_to_library(text, uuid, uuid, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.move_discovery_item_to_collection(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_discovery_item_to_collection(uuid, uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.remove_discovery_item_from_library(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_discovery_item_from_library(uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_saved_discovery_items(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_saved_discovery_items(uuid, integer)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.search_published_play_content(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_published_play_content(text, integer)
  TO authenticated, service_role;
