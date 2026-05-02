/*
  # User read cursors

  Stores cross-device read positions for message-like surfaces. News Feed keeps
  using `news_user_state.feed_seen_at`; this cursor table is only for chat
  streams where the UI needs to reopen at the first unread message.
*/

CREATE TABLE IF NOT EXISTS public.user_read_cursors (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  surface text NOT NULL,
  scope_id text NOT NULL DEFAULT 'main',
  last_read_message_id uuid,
  last_read_at timestamptz NOT NULL DEFAULT '1970-01-01 00:00:00+00'::timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_read_cursors_surface_check
    CHECK (surface ~ '^[a-z0-9_:-]{1,80}$'),
  CONSTRAINT user_read_cursors_scope_id_check
    CHECK (char_length(scope_id) BETWEEN 1 AND 160),
  PRIMARY KEY (user_id, surface, scope_id)
);

ALTER TABLE public.user_read_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own read cursors" ON public.user_read_cursors;
DROP POLICY IF EXISTS "Users can insert own read cursors" ON public.user_read_cursors;
DROP POLICY IF EXISTS "Users can update own read cursors" ON public.user_read_cursors;

CREATE POLICY "Users can read own read cursors"
ON public.user_read_cursors
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own read cursors"
ON public.user_read_cursors
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own read cursors"
ON public.user_read_cursors
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP TRIGGER IF EXISTS update_user_read_cursors_updated_at ON public.user_read_cursors;
CREATE TRIGGER update_user_read_cursors_updated_at
  BEFORE UPDATE ON public.user_read_cursors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_user_read_cursor(
  target_surface text,
  target_scope_id text DEFAULT 'main'
)
RETURNS TABLE (
  user_id uuid,
  surface text,
  scope_id text,
  last_read_message_id uuid,
  last_read_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    cursor_row.user_id,
    cursor_row.surface,
    cursor_row.scope_id,
    cursor_row.last_read_message_id,
    cursor_row.last_read_at,
    cursor_row.updated_at
  FROM public.user_read_cursors cursor_row
  WHERE cursor_row.user_id = auth.uid()
    AND cursor_row.surface = target_surface
    AND cursor_row.scope_id = coalesce(nullif(target_scope_id, ''), 'main')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_user_read_cursor(
  target_surface text,
  target_scope_id text,
  target_last_read_message_id uuid,
  target_last_read_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  user_id uuid,
  surface text,
  scope_id text,
  last_read_message_id uuid,
  last_read_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  normalized_scope_id text := coalesce(nullif(target_scope_id, ''), 'main');
  normalized_last_read_at timestamptz := coalesce(target_last_read_at, now());
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_surface IS NULL OR target_surface !~ '^[a-z0-9_:-]{1,80}$' THEN
    RAISE EXCEPTION 'Invalid read cursor surface';
  END IF;

  IF char_length(normalized_scope_id) < 1 OR char_length(normalized_scope_id) > 160 THEN
    RAISE EXCEPTION 'Invalid read cursor scope';
  END IF;

  RETURN QUERY
  INSERT INTO public.user_read_cursors (
    user_id,
    surface,
    scope_id,
    last_read_message_id,
    last_read_at
  )
  VALUES (
    current_user_id,
    target_surface,
    normalized_scope_id,
    target_last_read_message_id,
    normalized_last_read_at
  )
  ON CONFLICT ON CONSTRAINT user_read_cursors_pkey DO UPDATE
  SET
    last_read_message_id = CASE
      WHEN EXCLUDED.last_read_at >= public.user_read_cursors.last_read_at
      THEN EXCLUDED.last_read_message_id
      ELSE public.user_read_cursors.last_read_message_id
    END,
    last_read_at = GREATEST(public.user_read_cursors.last_read_at, EXCLUDED.last_read_at),
    updated_at = now()
  RETURNING
    public.user_read_cursors.user_id,
    public.user_read_cursors.surface,
    public.user_read_cursors.scope_id,
    public.user_read_cursors.last_read_message_id,
    public.user_read_cursors.last_read_at,
    public.user_read_cursors.updated_at;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.user_read_cursors TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_read_cursor(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_read_cursors'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_read_cursors;
  END IF;
END $$;
