/*
  # Universal message search, saves, and personal collections

  Search runs as the caller so existing General Chat and DM RLS remains the
  visibility authority. Saves and collections are private to their owner.
*/

CREATE TABLE public.message_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  description text CHECK (description IS NULL OR char_length(description) <= 240),
  accent_color text CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN -10000 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX message_collections_owner_name_idx
  ON public.message_collections (user_id, lower(name));
CREATE INDEX message_collections_owner_sort_idx
  ON public.message_collections (user_id, sort_order, updated_at DESC);

CREATE TABLE public.saved_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  collection_id uuid REFERENCES public.message_collections(id) ON DELETE SET NULL,
  message_source text NOT NULL CHECK (message_source IN ('general', 'dm')),
  general_message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  dm_message_id uuid REFERENCES public.dm_messages(id) ON DELETE CASCADE,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_messages_source_target_check CHECK (
    (message_source = 'general' AND general_message_id IS NOT NULL AND dm_message_id IS NULL)
    OR
    (message_source = 'dm' AND dm_message_id IS NOT NULL AND general_message_id IS NULL)
  )
);

CREATE UNIQUE INDEX saved_messages_general_owner_unique_idx
  ON public.saved_messages (user_id, general_message_id)
  WHERE general_message_id IS NOT NULL;
CREATE UNIQUE INDEX saved_messages_dm_owner_unique_idx
  ON public.saved_messages (user_id, dm_message_id)
  WHERE dm_message_id IS NOT NULL;
CREATE INDEX saved_messages_owner_recent_idx
  ON public.saved_messages (user_id, created_at DESC);
CREATE INDEX saved_messages_collection_recent_idx
  ON public.saved_messages (collection_id, created_at DESC)
  WHERE collection_id IS NOT NULL;

ALTER TABLE public.message_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own message collections"
ON public.message_collections
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

CREATE POLICY "Members can create own message collections"
ON public.message_collections
FOR INSERT
TO authenticated
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Members can update own message collections"
ON public.message_collections
FOR UPDATE
TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Members can delete own message collections"
ON public.message_collections
FOR DELETE
TO authenticated
USING (user_id = (select auth.uid()));

CREATE POLICY "Members can read own saved messages"
ON public.saved_messages
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

CREATE POLICY "Members can create visible saved messages"
ON public.saved_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (select auth.uid())
  AND (
    collection_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.message_collections collections
      WHERE collections.id = saved_messages.collection_id
        AND collections.user_id = (select auth.uid())
    )
  )
  AND (
    (
      message_source = 'general'
      AND EXISTS (
        SELECT 1 FROM public.messages messages
        WHERE messages.id = saved_messages.general_message_id
      )
    )
    OR
    (
      message_source = 'dm'
      AND EXISTS (
        SELECT 1
        FROM public.dm_messages direct_messages
        JOIN public.dm_conversations conversations
          ON conversations.id = direct_messages.conversation_id
        WHERE direct_messages.id = saved_messages.dm_message_id
          AND (select auth.uid()) = ANY(conversations.participants)
      )
    )
  )
);

CREATE POLICY "Members can update own saved messages"
ON public.saved_messages
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
      WHERE collections.id = saved_messages.collection_id
        AND collections.user_id = (select auth.uid())
    )
  )
);

CREATE POLICY "Members can delete own saved messages"
ON public.saved_messages
FOR DELETE
TO authenticated
USING (user_id = (select auth.uid()));

DROP TRIGGER IF EXISTS update_message_collections_updated_at ON public.message_collections;
CREATE TRIGGER update_message_collections_updated_at
  BEFORE UPDATE ON public.message_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_saved_messages_updated_at ON public.saved_messages;
CREATE TRIGGER update_saved_messages_updated_at
  BEFORE UPDATE ON public.saved_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX messages_search_document_idx
  ON public.messages USING gin (to_tsvector('simple', coalesce(content, '')));
CREATE INDEX dm_messages_search_document_idx
  ON public.dm_messages USING gin (to_tsvector('simple', coalesce(content, '')));

CREATE OR REPLACE FUNCTION public.search_my_messages(
  search_query text,
  result_limit integer DEFAULT 40,
  before_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  message_source text,
  message_id uuid,
  conversation_id uuid,
  content text,
  message_type text,
  file_url text,
  thumbnail_url text,
  created_at timestamptz,
  author jsonb,
  is_saved boolean,
  collection_id uuid,
  search_rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH query AS (
    SELECT websearch_to_tsquery('simple', left(trim($1), 200)) AS value
  ),
  visible_messages AS (
    SELECT
      'general'::text AS message_source,
      messages.id AS message_id,
      NULL::uuid AS conversation_id,
      messages.content,
      messages.message_type,
      messages.file_url,
      messages.thumbnail_url,
      messages.created_at,
      public.user_public_profile_json(profiles) AS author,
      saves.id IS NOT NULL AS is_saved,
      saves.collection_id,
      ts_rank_cd(to_tsvector('simple', coalesce(messages.content, '')), query.value) AS search_rank
    FROM public.messages messages
    JOIN public.users profiles ON profiles.id = messages.user_id
    CROSS JOIN query
    LEFT JOIN public.saved_messages saves
      ON saves.user_id = (select auth.uid())
     AND saves.general_message_id = messages.id
    WHERE trim($1) <> ''
      AND to_tsvector('simple', coalesce(messages.content, '')) @@ query.value
      AND ($3 IS NULL OR messages.created_at < $3)

    UNION ALL

    SELECT
      'dm'::text AS message_source,
      direct_messages.id AS message_id,
      direct_messages.conversation_id,
      direct_messages.content,
      direct_messages.message_type,
      direct_messages.file_url,
      direct_messages.thumbnail_url,
      direct_messages.created_at,
      public.user_public_profile_json(profiles) AS author,
      saves.id IS NOT NULL AS is_saved,
      saves.collection_id,
      ts_rank_cd(to_tsvector('simple', coalesce(direct_messages.content, '')), query.value) AS search_rank
    FROM public.dm_messages direct_messages
    JOIN public.users profiles ON profiles.id = direct_messages.sender_id
    CROSS JOIN query
    LEFT JOIN public.saved_messages saves
      ON saves.user_id = (select auth.uid())
     AND saves.dm_message_id = direct_messages.id
    WHERE trim($1) <> ''
      AND to_tsvector('simple', coalesce(direct_messages.content, '')) @@ query.value
      AND ($3 IS NULL OR direct_messages.created_at < $3)
  )
  SELECT *
  FROM visible_messages
  ORDER BY search_rank DESC, created_at DESC, message_id DESC
  LIMIT greatest(1, least(coalesce($2, 40), 100));
$$;

CREATE OR REPLACE FUNCTION public.list_my_saved_messages(
  collection_filter uuid DEFAULT NULL,
  result_limit integer DEFAULT 100
)
RETURNS TABLE (
  saved_id uuid,
  message_source text,
  message_id uuid,
  conversation_id uuid,
  content text,
  message_type text,
  file_url text,
  thumbnail_url text,
  message_created_at timestamptz,
  author jsonb,
  collection_id uuid,
  note text,
  saved_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH saved_rows AS (
    SELECT
      saves.id AS saved_id,
      'general'::text AS message_source,
      messages.id AS message_id,
      NULL::uuid AS conversation_id,
      messages.content,
      messages.message_type,
      messages.file_url,
      messages.thumbnail_url,
      messages.created_at AS message_created_at,
      public.user_public_profile_json(profiles) AS author,
      saves.collection_id,
      saves.note,
      saves.created_at AS saved_at
    FROM public.saved_messages saves
    JOIN public.messages messages ON messages.id = saves.general_message_id
    JOIN public.users profiles ON profiles.id = messages.user_id
    WHERE saves.user_id = (select auth.uid())
      AND saves.message_source = 'general'
      AND ($1 IS NULL OR saves.collection_id = $1)

    UNION ALL

    SELECT
      saves.id AS saved_id,
      'dm'::text AS message_source,
      direct_messages.id AS message_id,
      direct_messages.conversation_id,
      direct_messages.content,
      direct_messages.message_type,
      direct_messages.file_url,
      direct_messages.thumbnail_url,
      direct_messages.created_at AS message_created_at,
      public.user_public_profile_json(profiles) AS author,
      saves.collection_id,
      saves.note,
      saves.created_at AS saved_at
    FROM public.saved_messages saves
    JOIN public.dm_messages direct_messages ON direct_messages.id = saves.dm_message_id
    JOIN public.users profiles ON profiles.id = direct_messages.sender_id
    WHERE saves.user_id = (select auth.uid())
      AND saves.message_source = 'dm'
      AND ($1 IS NULL OR saves.collection_id = $1)
  )
  SELECT *
  FROM saved_rows
  ORDER BY saved_at DESC, saved_id DESC
  LIMIT greatest(1, least(coalesce($2, 100), 200));
$$;

CREATE OR REPLACE FUNCTION public.save_message_to_library(
  target_source text,
  target_message_id uuid,
  target_collection_id uuid DEFAULT NULL,
  target_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  saved_id uuid;
  caller_id uuid := auth.uid();
  normalized_note text := NULLIF(trim(target_note), '');
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF target_source NOT IN ('general', 'dm') THEN
    RAISE EXCEPTION 'Unsupported message source';
  END IF;
  IF normalized_note IS NOT NULL AND char_length(normalized_note) > 500 THEN
    RAISE EXCEPTION 'Saved message note is too long';
  END IF;

  IF target_source = 'general' THEN
    INSERT INTO public.saved_messages (
      user_id, collection_id, message_source, general_message_id, note
    ) VALUES (
      caller_id, target_collection_id, 'general', target_message_id, normalized_note
    )
    ON CONFLICT (user_id, general_message_id) WHERE general_message_id IS NOT NULL
    DO UPDATE SET
      collection_id = EXCLUDED.collection_id,
      note = EXCLUDED.note,
      updated_at = now()
    RETURNING id INTO saved_id;
  ELSE
    INSERT INTO public.saved_messages (
      user_id, collection_id, message_source, dm_message_id, note
    ) VALUES (
      caller_id, target_collection_id, 'dm', target_message_id, normalized_note
    )
    ON CONFLICT (user_id, dm_message_id) WHERE dm_message_id IS NOT NULL
    DO UPDATE SET
      collection_id = EXCLUDED.collection_id,
      note = EXCLUDED.note,
      updated_at = now()
    RETURNING id INTO saved_id;
  END IF;

  RETURN saved_id;
END;
$$;

REVOKE ALL ON TABLE public.message_collections, public.saved_messages FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.message_collections, public.saved_messages TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.message_collections, public.saved_messages TO service_role;

REVOKE ALL ON FUNCTION public.search_my_messages(text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_my_messages(text, integer, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_saved_messages(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_saved_messages(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_message_to_library(text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_message_to_library(text, uuid, uuid, text) TO authenticated, service_role;
