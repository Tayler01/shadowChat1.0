/*
  Close production-only grant drift reported by the hosted Supabase security
  advisor. The prior hardening pass removed PostgreSQL's implicit PUBLIC grant,
  but historical direct grants to `anon` and default grants for future
  functions remained in the hosted catalog.

  Authenticated SECURITY DEFINER RPCs are preserved where the application uses
  them as intentional, guarded APIs. Paused product RPCs are service-role only
  until their domains are deliberately reactivated.
*/

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  function_signature regprocedure;
BEGIN
  FOR function_signature IN
    SELECT procedures.oid::regprocedure
    FROM pg_proc AS procedures
    JOIN pg_namespace AS namespaces
      ON namespaces.oid = procedures.pronamespace
    WHERE namespaces.nspname = 'public'
      AND procedures.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',
      function_signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      function_signature
    );
  END LOOP;
END;
$$;

-- This is the sole intentional unauthenticated SECURITY DEFINER RPC. Signup
-- uses it to check a candidate username before an Auth user exists.
GRANT EXECUTE ON FUNCTION public.is_username_available(text)
  TO anon, authenticated, service_role;

-- Trigger functions and the ban-detail helper are never client RPCs.
REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.initialize_notification_preferences()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_user_role_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_user_admin_role()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_user_presence_visibility()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_channel_ban_block_message(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_notification_preferences() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_user_role_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_user_admin_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_user_presence_visibility() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_channel_ban_block_message(uuid, text) TO service_role;

-- These wrappers do not need elevated table privileges. Their guarded v2 RPC
-- remains the sole definer boundary.
ALTER FUNCTION public.toggle_message_reaction(uuid, text, boolean)
  SECURITY INVOKER;
ALTER FUNCTION public.toggle_message_reaction(uuid, text)
  SECURITY INVOKER;
ALTER FUNCTION public.validate_storage_url(text, text)
  SECURITY INVOKER;

-- Require a real signed-in caller (or the trusted service role) before the
-- aggregate RPCs cross RLS. Stats remain readable for any target profile once
-- the caller is authenticated.
CREATE OR REPLACE FUNCTION public.count_user_reactions(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reaction_count integer;
BEGIN
  IF auth.uid() IS NULL
    AND auth.role() IS DISTINCT FROM 'service_role'
    AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT count(*)::integer
  INTO reaction_count
  FROM public.message_reactions
  WHERE user_id = count_user_reactions.target_user_id;

  RETURN coalesce(reaction_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.count_reactions_to_user_messages_v2(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reaction_count integer;
BEGIN
  IF auth.uid() IS NULL
    AND auth.role() IS DISTINCT FROM 'service_role'
    AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT count(message_reactions.*)::integer
  INTO reaction_count
  FROM public.message_reactions AS message_reactions
  JOIN public.messages AS messages
    ON message_reactions.message_id = messages.id
  WHERE messages.user_id = count_reactions_to_user_messages_v2.target_user_id;

  RETURN coalesce(reaction_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.count_reactions_to_user_dm_messages_v2(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reaction_count integer;
BEGIN
  IF auth.uid() IS NULL
    AND auth.role() IS DISTINCT FROM 'service_role'
    AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT count(message_reactions.*)::integer
  INTO reaction_count
  FROM public.message_reactions AS message_reactions
  JOIN public.dm_messages AS dm_messages
    ON message_reactions.dm_message_id = dm_messages.id
  WHERE dm_messages.sender_id = count_reactions_to_user_dm_messages_v2.target_user_id;

  RETURN coalesce(reaction_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_user_channel_bans()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_group record;
  expired_count integer := 0;
BEGIN
  IF auth.uid() IS NULL
    AND auth.role() IS DISTINCT FROM 'service_role'
    AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  FOR expired_group IN
    WITH expired_rows AS (
      UPDATE public.user_channel_bans AS bans
      SET
        revoked_at = now(),
        revoked_by = NULL
      WHERE bans.revoked_at IS NULL
        AND bans.expires_at IS NOT NULL
        AND bans.expires_at <= now()
      RETURNING bans.target_user_id, bans.scope, bans.reason, bans.expires_at
    )
    SELECT
      target_user_id,
      array_agg(scope ORDER BY scope) AS scopes,
      string_agg(
        DISTINCT coalesce(nullif(trim(reason), ''), 'No reason provided.'),
        '; '
      ) AS reasons,
      max(expires_at) AS expires_at,
      count(*)::integer AS row_count
    FROM expired_rows
    GROUP BY target_user_id
  LOOP
    expired_count := expired_count + expired_group.row_count;

    PERFORM public.insert_channel_ban_announcement(
      expired_group.target_user_id,
      'expired',
      expired_group.scopes,
      expired_group.reasons,
      expired_group.expires_at
    );
  END LOOP;

  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.count_user_reactions(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_reactions_to_user_messages_v2(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_reactions_to_user_dm_messages_v2(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_user_channel_bans()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.count_user_reactions(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_reactions_to_user_messages_v2(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_reactions_to_user_dm_messages_v2(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_user_channel_bans()
  TO authenticated, service_role;

-- Paused product domains retain their schema and data, but not a callable
-- browser mutation surface.
REVOKE ALL ON FUNCTION public.create_art_board_link(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_art_board_item(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_art_board_link(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_art_board_reaction(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_art_board_link(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_board_chat_pin(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_board_chat_reaction(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_news_chat_reaction(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_news_feed_reaction(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_art_board_link(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_art_board_item(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_art_board_link(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_art_board_reaction(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_art_board_link(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_board_chat_pin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_board_chat_reaction(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_news_chat_reaction(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_news_feed_reaction(uuid, text) TO service_role;

-- Public buckets serve known object URLs without a broad SELECT policy. These
-- policies unnecessarily exposed bucket-wide listing.
DROP POLICY IF EXISTS "Public read for art board images" ON storage.objects;
DROP POLICY IF EXISTS "Public read for shadow pin images" ON storage.objects;

-- The preserved ESP schema remains inaccessible to browser roles while the
-- bridge is on hold. Service-role access is unaffected.
REVOKE ALL PRIVILEGES ON TABLE public.bridge_audit_events FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_device_sessions FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_devices FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_pairing_codes FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_pairings FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_update_manifests FROM anon, authenticated;
