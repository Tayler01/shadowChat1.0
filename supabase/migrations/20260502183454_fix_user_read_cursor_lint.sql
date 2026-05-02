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

GRANT EXECUTE ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) TO authenticated;
