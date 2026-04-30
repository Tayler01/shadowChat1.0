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
BEGIN
  IF current_user_id IS NULL OR NOT public.is_news_admin(current_user_id) THEN
    RAISE EXCEPTION 'News admin role required';
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
    trim(upsert_news_source.handle),
    NULLIF(trim(upsert_news_source.display_name), ''),
    NULLIF(trim(upsert_news_source.profile_url), ''),
    NULLIF(trim(upsert_news_source.external_account_id), ''),
    current_user_id
  )
  ON CONFLICT ON CONSTRAINT news_sources_platform_normalized_handle_key DO UPDATE
  SET
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
