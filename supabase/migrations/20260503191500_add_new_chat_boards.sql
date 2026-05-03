-- Add the next set of reusable chat boards and their moderation scopes.

ALTER TABLE public.board_catalog
  DROP CONSTRAINT IF EXISTS board_catalog_moderation_scope_check;

ALTER TABLE public.board_catalog
  ADD CONSTRAINT board_catalog_moderation_scope_check
  CHECK (
    moderation_scope IS NULL
    OR moderation_scope IN (
      'board_news_chat',
      'board_investing_chat',
      'board_learning_chat',
      'board_crypto_chat',
      'board_vibe_coding',
      'board_ai_news',
      'board_projects_chat'
    )
  );

INSERT INTO public.board_catalog (
  slug,
  title,
  board_type,
  description,
  moderation_scope,
  unread_contributes_to_nav,
  sort_order
)
VALUES
  ('vibe-coding', 'Vibe Coding', 'chat', 'Builds, prompts, and dev flow.', 'board_vibe_coding', true, 55),
  ('ai-news', 'AI News', 'chat', 'Models, tools, and AI drops.', 'board_ai_news', true, 56),
  ('projects-chat', 'Projects Chat', 'chat', 'Share progress and ideas.', 'board_projects_chat', true, 57)
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  board_type = EXCLUDED.board_type,
  description = EXCLUDED.description,
  moderation_scope = EXCLUDED.moderation_scope,
  unread_contributes_to_nav = EXCLUDED.unread_contributes_to_nav,
  sort_order = EXCLUDED.sort_order,
  is_visible = true,
  updated_at = now();

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

GRANT EXECUTE ON FUNCTION public.channel_ban_scope_label(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_channel_bans(uuid, text[], integer, text) TO authenticated;
