UPDATE public.news_sources
SET
  handle = trim(regexp_replace(trim(handle), '^@+[[:space:]]*', '@')),
  health_status = CASE
    WHEN platform = 'truth' AND handle ~* '^@+[[:space:]]+' THEN 'pending'
    ELSE health_status
  END,
  last_error = CASE
    WHEN platform = 'truth' AND handle ~* '^@+[[:space:]]+' THEN NULL
    ELSE last_error
  END,
  last_checked_at = CASE
    WHEN platform = 'truth' AND handle ~* '^@+[[:space:]]+' THEN NULL
    ELSE last_checked_at
  END
WHERE handle <> trim(regexp_replace(trim(handle), '^@+[[:space:]]*', '@'));

ALTER TABLE public.news_sources
  DROP CONSTRAINT IF EXISTS news_sources_platform_normalized_handle_key;

ALTER TABLE public.news_sources
  DROP COLUMN IF EXISTS normalized_handle;

ALTER TABLE public.news_sources
  ADD COLUMN normalized_handle text
  GENERATED ALWAYS AS (lower(trim(regexp_replace(trim(handle), '^@+', '')))) STORED;

ALTER TABLE public.news_sources
  ADD CONSTRAINT news_sources_platform_normalized_handle_key
  UNIQUE (platform, normalized_handle);

CREATE OR REPLACE FUNCTION public.upsert_news_source(
  platform text,
  handle text,
  display_name text DEFAULT NULL,
  profile_url text DEFAULT NULL,
  external_account_id text DEFAULT NULL
)
RETURNS public.news_sources
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  next_source public.news_sources;
  clean_handle text := trim(regexp_replace(trim(upsert_news_source.handle), '^@+[[:space:]]*', '@'));
BEGIN
  IF current_user_id IS NULL OR NOT public.is_news_admin(current_user_id) THEN
    RAISE EXCEPTION 'News admin role required';
  END IF;

  IF clean_handle = '' THEN
    RAISE EXCEPTION 'News source handle is required';
  END IF;

  INSERT INTO public.news_sources (
    platform,
    handle,
    display_name,
    profile_url,
    external_account_id,
    created_by
  )
  VALUES (
    lower(trim(upsert_news_source.platform)),
    clean_handle,
    NULLIF(trim(upsert_news_source.display_name), ''),
    NULLIF(trim(upsert_news_source.profile_url), ''),
    NULLIF(trim(upsert_news_source.external_account_id), ''),
    current_user_id
  )
  ON CONFLICT ON CONSTRAINT news_sources_platform_normalized_handle_key DO UPDATE
  SET
    handle = EXCLUDED.handle,
    display_name = COALESCE(EXCLUDED.display_name, public.news_sources.display_name),
    profile_url = COALESCE(EXCLUDED.profile_url, public.news_sources.profile_url),
    external_account_id = COALESCE(EXCLUDED.external_account_id, public.news_sources.external_account_id),
    enabled = true,
    updated_at = now()
  RETURNING * INTO next_source;

  RETURN next_source;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_news_source(text, text, text, text, text) TO authenticated;
