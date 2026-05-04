/*
  # Art Board domain

  Adds the shared visual Art Board as its own backend domain:
  - public image storage bucket with 10MB image-only uploads
  - canvas items, links, and reactions
  - art-board moderation scope
  - RPC helpers for soft delete, reactions, and links
*/

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'art-board',
  'art-board',
  true,
  10485760,
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

DROP POLICY IF EXISTS "Public read for art board images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own art board images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own art board images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own art board images" ON storage.objects;

CREATE POLICY "Public read for art board images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'art-board');

CREATE POLICY "Users can upload their own art board images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'art-board'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "Users can update their own art board images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'art-board'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
)
WITH CHECK (
  bucket_id = 'art-board'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "Users can delete their own art board images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'art-board'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

UPDATE public.board_catalog
SET
  title = 'Art Board',
  board_type = 'static',
  description = 'Shared visual mood board.',
  moderation_scope = NULL,
  unread_contributes_to_nav = false,
  sort_order = 60,
  is_visible = true,
  updated_at = now()
WHERE slug = 'art-board';

ALTER TABLE public.user_channel_bans
  DROP CONSTRAINT IF EXISTS user_channel_bans_scope_check;

ALTER TABLE public.user_channel_bans
  ADD CONSTRAINT user_channel_bans_scope_check
  CHECK (
    scope IN (
      'general_chat',
      'board_news_chat',
      'board_investing_chat',
      'board_learning_chat',
      'board_crypto_chat',
      'board_vibe_coding',
      'board_ai_news',
      'board_projects_chat',
      'art_board',
      'all_interaction'
    )
  );

CREATE OR REPLACE FUNCTION public.channel_ban_scope_label(scope text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE scope
    WHEN 'general_chat' THEN 'General Chat'
    WHEN 'board_news_chat' THEN 'News Chat'
    WHEN 'board_investing_chat' THEN 'Investing Chat'
    WHEN 'board_learning_chat' THEN 'Learning Chat'
    WHEN 'board_crypto_chat' THEN 'Crypto Chat'
    WHEN 'board_vibe_coding' THEN 'Vibe Coding'
    WHEN 'board_ai_news' THEN 'AI News'
    WHEN 'board_projects_chat' THEN 'Projects Chat'
    WHEN 'art_board' THEN 'Art Board'
    WHEN 'all_interaction' THEN 'All Interaction'
    ELSE scope
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_channel_bans(
  target_user_id uuid,
  scopes text[],
  duration_minutes integer DEFAULT NULL,
  reason text DEFAULT NULL
)
RETURNS SETOF public.user_channel_bans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  clean_scopes text[];
  current_scopes text[];
  announcement_scopes text[];
  expires_at_value timestamptz;
  invalid_scope text;
  normalized_reason text;
  target_admin_role text;
  action_label text;
  valid_scopes text[] := ARRAY[
    'general_chat',
    'board_news_chat',
    'board_investing_chat',
    'board_learning_chat',
    'board_crypto_chat',
    'board_vibe_coding',
    'board_ai_news',
    'board_projects_chat',
    'art_board',
    'all_interaction'
  ];
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_operator(actor_user_id) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  PERFORM public.expire_user_channel_bans();

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  SELECT users.admin_role
  INTO target_admin_role
  FROM public.users
  WHERE users.id = set_user_channel_bans.target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF actor_user_id = set_user_channel_bans.target_user_id THEN
    RAISE EXCEPTION 'Admins cannot ban themselves';
  END IF;

  IF target_admin_role = 'admin' THEN
    RAISE EXCEPTION 'The full admin account cannot be channel banned';
  END IF;

  IF target_admin_role = 'sub_admin' AND NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Only the full admin can channel ban a sub-admin';
  END IF;

  IF duration_minutes IS NOT NULL AND duration_minutes <= 0 THEN
    RAISE EXCEPTION 'Duration must be positive';
  END IF;

  normalized_reason := NULLIF(trim(COALESCE(set_user_channel_bans.reason, '')), '');

  SELECT COALESCE(array_agg(DISTINCT normalized_scope ORDER BY normalized_scope), ARRAY[]::text[])
  INTO clean_scopes
  FROM (
    SELECT CASE lower(trim(scope_value))
      WHEN 'news_chat' THEN 'board_news_chat'
      WHEN 'news_feed' THEN 'all_interaction'
      WHEN 'art-board' THEN 'art_board'
      ELSE lower(trim(scope_value))
    END AS normalized_scope
    FROM unnest(COALESCE(scopes, ARRAY[]::text[])) AS scope_value
    WHERE trim(scope_value) <> ''
  ) normalized;

  SELECT normalized_scope
  INTO invalid_scope
  FROM unnest(clean_scopes) AS normalized_scope
  WHERE NOT normalized_scope = ANY(valid_scopes)
  LIMIT 1;

  IF invalid_scope IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid channel ban scope: %', invalid_scope;
  END IF;

  PERFORM 1
  FROM public.user_channel_bans active_bans
  WHERE active_bans.target_user_id = set_user_channel_bans.target_user_id
    AND active_bans.revoked_at IS NULL
    AND (
      active_bans.expires_at IS NULL
      OR active_bans.expires_at > now()
    )
  FOR UPDATE;

  SELECT COALESCE(array_agg(active_bans.scope ORDER BY active_bans.scope), ARRAY[]::text[])
  INTO current_scopes
  FROM public.user_channel_bans active_bans
  WHERE active_bans.target_user_id = set_user_channel_bans.target_user_id
    AND active_bans.revoked_at IS NULL
    AND (
      active_bans.expires_at IS NULL
      OR active_bans.expires_at > now()
    );

  IF (cardinality(clean_scopes) > 0 OR cardinality(current_scopes) > 0)
    AND normalized_reason IS NULL THEN
    RAISE EXCEPTION 'A public ban reason is required';
  END IF;

  IF cardinality(clean_scopes) = 0 AND cardinality(current_scopes) = 0 THEN
    RETURN;
  END IF;

  expires_at_value := CASE
    WHEN cardinality(clean_scopes) = 0 THEN NULL
    WHEN duration_minutes IS NULL THEN NULL
    ELSE now() + make_interval(mins => duration_minutes)
  END;

  UPDATE public.user_channel_bans active_bans
  SET
    revoked_at = now(),
    revoked_by = actor_user_id
  WHERE active_bans.target_user_id = set_user_channel_bans.target_user_id
    AND active_bans.revoked_at IS NULL
    AND active_bans.scope = ANY(valid_scopes);

  INSERT INTO public.user_channel_bans (
    target_user_id,
    scope,
    banned_by,
    reason,
    expires_at
  )
  SELECT
    set_user_channel_bans.target_user_id,
    normalized_scope,
    actor_user_id,
    normalized_reason,
    expires_at_value
  FROM unnest(clean_scopes) AS normalized_scope;

  announcement_scopes := CASE
    WHEN cardinality(clean_scopes) > 0 THEN clean_scopes
    ELSE current_scopes
  END;

  action_label := CASE
    WHEN cardinality(clean_scopes) = 0 THEN 'removed'
    WHEN cardinality(current_scopes) = 0 THEN 'banned'
    ELSE 'updated'
  END;

  PERFORM public.insert_channel_ban_announcement(
    set_user_channel_bans.target_user_id,
    action_label,
    announcement_scopes,
    normalized_reason,
    expires_at_value
  );

  RETURN QUERY
  SELECT active_bans.*
  FROM public.user_channel_bans active_bans
  WHERE active_bans.target_user_id = set_user_channel_bans.target_user_id
    AND active_bans.revoked_at IS NULL
    AND (
      active_bans.expires_at IS NULL
      OR active_bans.expires_at > now()
    )
  ORDER BY active_bans.scope ASC, active_bans.created_at DESC;
END;
$$;

CREATE TABLE IF NOT EXISTS public.art_board_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('image', 'note')),
  title text CHECK (title IS NULL OR char_length(trim(title)) <= 120),
  caption text CHECK (caption IS NULL OR char_length(trim(caption)) <= 4000),
  tags text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(tags) <= 12),
  image_url text,
  image_path text,
  alt_text text CHECK (alt_text IS NULL OR char_length(trim(alt_text)) <= 300),
  note_text text,
  note_color text NOT NULL DEFAULT 'butter' CHECK (note_color IN ('butter', 'rose', 'sage', 'sky', 'lavender', 'peach')),
  frame_style text NOT NULL DEFAULT 'clean' CHECK (frame_style IN ('clean', 'print', 'polaroid', 'pinned')),
  position_x numeric(12,2) NOT NULL DEFAULT 0,
  position_y numeric(12,2) NOT NULL DEFAULT 0,
  width numeric(8,2) NOT NULL DEFAULT 260 CHECK (width BETWEEN 96 AND 720),
  height numeric(8,2) NOT NULL DEFAULT 220 CHECK (height BETWEEN 72 AND 720),
  rotation numeric(5,2) NOT NULL DEFAULT 0 CHECK (rotation BETWEEN -12 AND 12),
  z_index bigint NOT NULL DEFAULT 0,
  chunk_x integer GENERATED ALWAYS AS (floor(position_x / 1000.0)::integer) STORED,
  chunk_y integer GENERATED ALWAYS AS (floor(position_y / 1000.0)::integer) STORED,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reactions) = 'object'),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT art_board_items_content_check CHECK (
    (
      item_type = 'image'
      AND image_url IS NOT NULL
      AND image_path IS NOT NULL
    )
    OR (
      item_type = 'note'
      AND char_length(trim(COALESCE(note_text, ''))) BETWEEN 1 AND 4000
    )
  )
);

CREATE INDEX IF NOT EXISTS art_board_items_chunk_idx
  ON public.art_board_items (chunk_x, chunk_y, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS art_board_items_recent_idx
  ON public.art_board_items (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS art_board_items_user_idx
  ON public.art_board_items (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.art_board_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_board_items REPLICA IDENTITY FULL;

DROP TRIGGER IF EXISTS update_art_board_items_updated_at ON public.art_board_items;
CREATE TRIGGER update_art_board_items_updated_at
  BEFORE UPDATE ON public.art_board_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.art_board_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_a_id uuid NOT NULL REFERENCES public.art_board_items(id) ON DELETE CASCADE,
  item_b_id uuid NOT NULL REFERENCES public.art_board_items(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'related' CHECK (label IN ('inspired by', 'reference', 'related', 'part of', 'contrast')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (item_a_id < item_b_id),
  UNIQUE (item_a_id, item_b_id)
);

CREATE INDEX IF NOT EXISTS art_board_links_item_a_idx
  ON public.art_board_links (item_a_id);

CREATE INDEX IF NOT EXISTS art_board_links_item_b_idx
  ON public.art_board_links (item_b_id);

ALTER TABLE public.art_board_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_board_links REPLICA IDENTITY FULL;

DROP TRIGGER IF EXISTS update_art_board_links_updated_at ON public.art_board_links;
CREATE TRIGGER update_art_board_links_updated_at
  BEFORE UPDATE ON public.art_board_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.art_board_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.art_board_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('heart', 'spark', 'fire', 'idea')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS art_board_reactions_item_idx
  ON public.art_board_reactions (item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS art_board_reactions_user_idx
  ON public.art_board_reactions (user_id, created_at DESC);

ALTER TABLE public.art_board_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_board_reactions REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Authenticated users can read art board items" ON public.art_board_items;
CREATE POLICY "Authenticated users can read art board items"
ON public.art_board_items
FOR SELECT
TO authenticated
USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can add own art board items" ON public.art_board_items;
CREATE POLICY "Users can add own art board items"
ON public.art_board_items
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'art_board')
);

DROP POLICY IF EXISTS "Users can update own art board items" ON public.art_board_items;
CREATE POLICY "Users can update own art board items"
ON public.art_board_items
FOR UPDATE
TO authenticated
USING (
  (select auth.uid()) = user_id
  AND deleted_at IS NULL
  AND NOT public.is_user_channel_banned((select auth.uid()), 'art_board')
)
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'art_board')
);

DROP POLICY IF EXISTS "Authenticated users can read art board links" ON public.art_board_links;
CREATE POLICY "Authenticated users can read art board links"
ON public.art_board_links
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.art_board_items item_a
    WHERE item_a.id = art_board_links.item_a_id
      AND item_a.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1
    FROM public.art_board_items item_b
    WHERE item_b.id = art_board_links.item_b_id
      AND item_b.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "Users can link art board items" ON public.art_board_links;
CREATE POLICY "Users can link art board items"
ON public.art_board_links
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = created_by
  AND NOT public.is_user_channel_banned((select auth.uid()), 'art_board')
  AND item_a_id < item_b_id
  AND EXISTS (
    SELECT 1 FROM public.art_board_items items
    WHERE items.id = item_a_id AND items.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.art_board_items items
    WHERE items.id = item_b_id AND items.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "Owners and operators can update art board links" ON public.art_board_links;
CREATE POLICY "Owners and operators can update art board links"
ON public.art_board_links
FOR UPDATE
TO authenticated
USING (
  NOT public.is_user_channel_banned((select auth.uid()), 'art_board')
  AND (
    public.is_app_operator((select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.art_board_items items
      WHERE items.id IN (item_a_id, item_b_id)
        AND items.user_id = (select auth.uid())
        AND items.deleted_at IS NULL
    )
  )
)
WITH CHECK (
  NOT public.is_user_channel_banned((select auth.uid()), 'art_board')
  AND (
    public.is_app_operator((select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.art_board_items items
      WHERE items.id IN (item_a_id, item_b_id)
        AND items.user_id = (select auth.uid())
        AND items.deleted_at IS NULL
    )
  )
);

DROP POLICY IF EXISTS "Owners and operators can delete art board links" ON public.art_board_links;
CREATE POLICY "Owners and operators can delete art board links"
ON public.art_board_links
FOR DELETE
TO authenticated
USING (
  NOT public.is_user_channel_banned((select auth.uid()), 'art_board')
  AND (
    public.is_app_operator((select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.art_board_items items
      WHERE items.id IN (item_a_id, item_b_id)
        AND items.user_id = (select auth.uid())
        AND items.deleted_at IS NULL
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can read art board reactions" ON public.art_board_reactions;
CREATE POLICY "Authenticated users can read art board reactions"
ON public.art_board_reactions
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.aggregate_art_board_reactions(target_item_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      reaction,
      jsonb_build_object('count', reaction_count, 'users', users)
      ORDER BY reaction
    ),
    '{}'::jsonb
  )
  FROM (
    SELECT
      reaction,
      count(*)::integer AS reaction_count,
      jsonb_agg(user_id::text ORDER BY created_at ASC) AS users
    FROM public.art_board_reactions
    WHERE item_id = target_item_id
    GROUP BY reaction
  ) grouped;
$$;

CREATE OR REPLACE FUNCTION public.toggle_art_board_reaction(target_item_id uuid, target_reaction text)
RETURNS public.art_board_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  existing_reaction_id uuid;
  next_reactions jsonb;
  updated_item public.art_board_items%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_user_channel_banned(current_user_id, 'art_board') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'art_board');
  END IF;

  IF target_reaction NOT IN ('heart', 'spark', 'fire', 'idea') THEN
    RAISE EXCEPTION 'Invalid art board reaction';
  END IF;

  PERFORM 1
  FROM public.art_board_items items
  WHERE items.id = target_item_id
    AND items.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Art board item is not available';
  END IF;

  SELECT id INTO existing_reaction_id
  FROM public.art_board_reactions reactions
  WHERE reactions.item_id = target_item_id
    AND reactions.user_id = current_user_id
    AND reactions.reaction = target_reaction;

  IF existing_reaction_id IS NOT NULL THEN
    DELETE FROM public.art_board_reactions WHERE id = existing_reaction_id;
  ELSE
    INSERT INTO public.art_board_reactions (item_id, user_id, reaction)
    VALUES (target_item_id, current_user_id, target_reaction);
  END IF;

  next_reactions := public.aggregate_art_board_reactions(target_item_id);

  UPDATE public.art_board_items
  SET reactions = next_reactions
  WHERE id = target_item_id
  RETURNING * INTO updated_item;

  RETURN updated_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_art_board_item(target_item_id uuid)
RETURNS public.art_board_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  target_item public.art_board_items%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO target_item
  FROM public.art_board_items
  WHERE id = target_item_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF target_item.id IS NULL THEN
    RAISE EXCEPTION 'Art board item is not available';
  END IF;

  IF target_item.user_id <> current_user_id AND NOT public.is_app_operator(current_user_id) THEN
    RAISE EXCEPTION 'Only the creator or an admin can remove this item';
  END IF;

  IF target_item.user_id = current_user_id
    AND NOT public.is_app_operator(current_user_id)
    AND public.is_user_channel_banned(current_user_id, 'art_board') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'art_board');
  END IF;

  DELETE FROM public.art_board_links
  WHERE item_a_id = target_item_id
     OR item_b_id = target_item_id;

  DELETE FROM public.art_board_reactions
  WHERE item_id = target_item_id;

  UPDATE public.art_board_items
  SET
    reactions = '{}'::jsonb,
    deleted_at = now(),
    deleted_by = current_user_id
  WHERE id = target_item_id
  RETURNING * INTO target_item;

  RETURN target_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_art_board_link(source_item_id uuid, target_item_id uuid, link_label text DEFAULT 'related')
RETURNS public.art_board_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  item_a uuid;
  item_b uuid;
  normalized_label text := COALESCE(NULLIF(trim(link_label), ''), 'related');
  inserted_link public.art_board_links%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_user_channel_banned(current_user_id, 'art_board') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'art_board');
  END IF;

  IF source_item_id = target_item_id THEN
    RAISE EXCEPTION 'Choose a different item to link';
  END IF;

  IF normalized_label NOT IN ('inspired by', 'reference', 'related', 'part of', 'contrast') THEN
    RAISE EXCEPTION 'Invalid art board link label';
  END IF;

  item_a := LEAST(source_item_id, target_item_id);
  item_b := GREATEST(source_item_id, target_item_id);

  PERFORM 1 FROM public.art_board_items items WHERE items.id = item_a AND items.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'First art board item is not available';
  END IF;

  PERFORM 1 FROM public.art_board_items items WHERE items.id = item_b AND items.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Second art board item is not available';
  END IF;

  INSERT INTO public.art_board_links (item_a_id, item_b_id, created_by, label)
  VALUES (item_a, item_b, current_user_id, normalized_label)
  ON CONFLICT (item_a_id, item_b_id) DO NOTHING
  RETURNING * INTO inserted_link;

  IF inserted_link.id IS NULL THEN
    SELECT *
    INTO inserted_link
    FROM public.art_board_links links
    WHERE links.item_a_id = item_a
      AND links.item_b_id = item_b;
  END IF;

  RETURN inserted_link;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_art_board_link(target_link_id uuid, link_label text)
RETURNS public.art_board_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  normalized_label text := COALESCE(NULLIF(trim(link_label), ''), 'related');
  target_link public.art_board_links%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_user_channel_banned(current_user_id, 'art_board') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'art_board');
  END IF;

  IF normalized_label NOT IN ('inspired by', 'reference', 'related', 'part of', 'contrast') THEN
    RAISE EXCEPTION 'Invalid art board link label';
  END IF;

  SELECT *
  INTO target_link
  FROM public.art_board_links links
  WHERE links.id = target_link_id;

  IF target_link.id IS NULL THEN
    RAISE EXCEPTION 'Art board link is not available';
  END IF;

  IF NOT public.is_app_operator(current_user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.art_board_items items
      WHERE items.id IN (target_link.item_a_id, target_link.item_b_id)
        AND items.user_id = current_user_id
        AND items.deleted_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Only item owners or admins can edit this link';
  END IF;

  UPDATE public.art_board_links
  SET label = normalized_label
  WHERE id = target_link_id
  RETURNING * INTO target_link;

  RETURN target_link;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_art_board_link(target_link_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  target_link public.art_board_links%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_user_channel_banned(current_user_id, 'art_board') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'art_board');
  END IF;

  SELECT *
  INTO target_link
  FROM public.art_board_links links
  WHERE links.id = target_link_id;

  IF target_link.id IS NULL THEN
    RAISE EXCEPTION 'Art board link is not available';
  END IF;

  IF NOT public.is_app_operator(current_user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.art_board_items items
      WHERE items.id IN (target_link.item_a_id, target_link.item_b_id)
        AND items.user_id = current_user_id
        AND items.deleted_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Only item owners or admins can remove this link';
  END IF;

  DELETE FROM public.art_board_links
  WHERE id = target_link_id;

  RETURN target_link_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.channel_ban_scope_label(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_channel_bans(uuid, text[], integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_art_board_reactions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_art_board_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_art_board_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_art_board_link(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_art_board_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_art_board_link(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'art_board_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.art_board_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'art_board_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.art_board_links;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'art_board_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.art_board_reactions;
  END IF;
END $$;
