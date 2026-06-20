/*
  # Admin authority source cleanup

  Keep public.users.admin_role as the visible badge mirror, but stop using it
  as server-side authority for moderation, account protection, and ShadowPin
  eligibility decisions.
*/

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

  PERFORM 1
  FROM public.users
  WHERE users.id = set_user_channel_bans.target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  SELECT roles.role
  INTO target_admin_role
  FROM public.user_roles roles
  WHERE roles.user_id = set_user_channel_bans.target_user_id
    AND roles.role IN ('admin', 'sub_admin')
  ORDER BY CASE roles.role WHEN 'admin' THEN 0 ELSE 1 END
  LIMIT 1;

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

DROP POLICY IF EXISTS "Users can delete own or moderate non-admin messages" ON public.messages;

CREATE POLICY "Users can delete own or moderate non-admin messages"
  ON public.messages
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR (
      public.is_app_operator((select auth.uid()))
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles message_author_role
        WHERE message_author_role.user_id = messages.user_id
          AND message_author_role.role IN ('admin', 'sub_admin')
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own or moderate board chat messages" ON public.board_chat_messages;

CREATE POLICY "Users can delete own or moderate board chat messages"
  ON public.board_chat_messages
  FOR DELETE
  TO authenticated
  USING (
    NOT public.is_board_interaction_banned((select auth.uid()), board_slug)
    AND (
      (select auth.uid()) = user_id
      OR (
        public.is_app_operator((select auth.uid()))
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_roles message_author_role
          WHERE message_author_role.user_id = board_chat_messages.user_id
            AND message_author_role.role IN ('admin', 'sub_admin')
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION private.refresh_shadow_pin_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champion_id uuid;
BEGIN
  DELETE FROM private.shadow_pin_scores
  WHERE user_id IS NOT NULL;

  INSERT INTO private.shadow_pin_scores (
    user_id,
    image_count,
    received_like_count,
    image_points,
    like_points,
    total_score,
    last_scored_at,
    updated_at
  )
  SELECT
    images.creator_id AS user_id,
    count(DISTINCT images.id)::integer AS image_count,
    count(hearts.user_id)::integer AS received_like_count,
    count(DISTINCT images.id)::integer AS image_points,
    (count(hearts.user_id)::integer * 2) AS like_points,
    (count(DISTINCT images.id)::integer + (count(hearts.user_id)::integer * 2)) AS total_score,
    max(greatest(images.created_at, coalesce(hearts.created_at, images.created_at))) AS last_scored_at,
    now() AS updated_at
  FROM public.shadow_pin_images images
  LEFT JOIN public.shadow_pin_image_hearts hearts
    ON hearts.image_id = images.id
   AND hearts.user_id IS DISTINCT FROM images.creator_id
  WHERE images.creator_id IS NOT NULL
    AND images.deleted_at IS NULL
    AND images.category_id IS NOT NULL
    AND (
      images.media_type = 'image'
      OR images.processing_status = 'ready'
    )
  GROUP BY images.creator_id
  HAVING count(DISTINCT images.id) > 0;

  SELECT scores.user_id
  INTO champion_id
  FROM private.shadow_pin_scores scores
  WHERE scores.total_score > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles roles
      WHERE roles.user_id = scores.user_id
        AND roles.role = 'admin'
    )
  ORDER BY
    scores.total_score DESC,
    scores.received_like_count DESC,
    scores.image_count DESC,
    scores.last_scored_at DESC NULLS LAST,
    scores.user_id ASC
  LIMIT 1;

  UPDATE public.users users
  SET shadow_pin_gold_pin = (champion_id IS NOT NULL AND users.id = champion_id)
  WHERE users.shadow_pin_gold_pin IS DISTINCT FROM (champion_id IS NOT NULL AND users.id = champion_id);
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_shadow_pin_scores() FROM public, anon, authenticated;

SELECT private.refresh_shadow_pin_scores();
