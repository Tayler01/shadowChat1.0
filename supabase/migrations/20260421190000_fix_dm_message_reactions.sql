/*
  # Fix DM message reactions storage

  1. Allow `message_reactions` rows to target either a group message or a DM.
  2. Enforce exactly one target per reaction row.
  3. Update reaction/stat RPCs so DM reactions use `dm_message_id`.
*/

ALTER TABLE public.message_reactions
  ADD COLUMN IF NOT EXISTS dm_message_id uuid REFERENCES public.dm_messages(id) ON DELETE CASCADE;

ALTER TABLE public.message_reactions
  ALTER COLUMN message_id DROP NOT NULL;

ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_message_id_user_id_emoji_key;

DROP INDEX IF EXISTS public.message_reactions_message_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_message_unique_idx
  ON public.message_reactions (message_id, user_id, emoji)
  WHERE message_id IS NOT NULL;

DROP INDEX IF EXISTS public.message_reactions_dm_message_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_dm_message_unique_idx
  ON public.message_reactions (dm_message_id, user_id, emoji)
  WHERE dm_message_id IS NOT NULL;

ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_target_check;

ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_target_check
  CHECK (num_nonnulls(message_id, dm_message_id) = 1);

CREATE OR REPLACE FUNCTION toggle_message_reaction_v2(
  message_id uuid,
  emoji text,
  is_dm boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  existing_reaction_id uuid;
  current_reactions jsonb;
  emoji_data jsonb;
  new_reactions jsonb;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO existing_reaction_id
  FROM public.message_reactions
  WHERE (
      (is_dm = false AND public.message_reactions.message_id = toggle_message_reaction_v2.message_id)
      OR
      (is_dm = true AND public.message_reactions.dm_message_id = toggle_message_reaction_v2.message_id)
    )
    AND public.message_reactions.user_id = current_user_id
    AND public.message_reactions.emoji = toggle_message_reaction_v2.emoji;

  IF existing_reaction_id IS NOT NULL THEN
    DELETE FROM public.message_reactions WHERE id = existing_reaction_id;

    IF is_dm THEN
      SELECT reactions INTO current_reactions FROM public.dm_messages WHERE id = message_id;

      emoji_data := current_reactions -> emoji;
      IF emoji_data IS NOT NULL THEN
        emoji_data := jsonb_build_object(
          'count', GREATEST(0, (emoji_data->>'count')::int - 1),
          'users', COALESCE(
            (
              SELECT jsonb_agg(user_id)
              FROM jsonb_array_elements_text(emoji_data->'users') AS user_id
              WHERE user_id::uuid != current_user_id
            ),
            '[]'::jsonb
          )
        );

        IF (emoji_data->>'count')::int <= 0 THEN
          new_reactions := current_reactions - emoji;
        ELSE
          new_reactions := current_reactions || jsonb_build_object(emoji, emoji_data);
        END IF;

        UPDATE public.dm_messages SET reactions = new_reactions WHERE id = message_id;
      END IF;
    ELSE
      SELECT reactions INTO current_reactions FROM public.messages WHERE id = message_id;

      emoji_data := current_reactions -> emoji;
      IF emoji_data IS NOT NULL THEN
        emoji_data := jsonb_build_object(
          'count', GREATEST(0, (emoji_data->>'count')::int - 1),
          'users', COALESCE(
            (
              SELECT jsonb_agg(user_id)
              FROM jsonb_array_elements_text(emoji_data->'users') AS user_id
              WHERE user_id::uuid != current_user_id
            ),
            '[]'::jsonb
          )
        );

        IF (emoji_data->>'count')::int <= 0 THEN
          new_reactions := current_reactions - emoji;
        ELSE
          new_reactions := current_reactions || jsonb_build_object(emoji, emoji_data);
        END IF;

        UPDATE public.messages SET reactions = new_reactions WHERE id = message_id;
      END IF;
    END IF;
  ELSE
    INSERT INTO public.message_reactions (message_id, dm_message_id, user_id, emoji)
    VALUES (
      CASE WHEN is_dm THEN NULL ELSE message_id END,
      CASE WHEN is_dm THEN message_id ELSE NULL END,
      current_user_id,
      emoji
    );

    IF is_dm THEN
      SELECT COALESCE(reactions, '{}'::jsonb) INTO current_reactions FROM public.dm_messages WHERE id = message_id;
    ELSE
      SELECT COALESCE(reactions, '{}'::jsonb) INTO current_reactions FROM public.messages WHERE id = message_id;
    END IF;

    emoji_data := current_reactions -> emoji;
    IF emoji_data IS NULL THEN
      emoji_data := jsonb_build_object(
        'count', 1,
        'users', jsonb_build_array(current_user_id)
      );
    ELSE
      emoji_data := jsonb_build_object(
        'count', (emoji_data->>'count')::int + 1,
        'users', (emoji_data->'users') || jsonb_build_array(current_user_id)
      );
    END IF;

    new_reactions := current_reactions || jsonb_build_object(emoji, emoji_data);

    IF is_dm THEN
      UPDATE public.dm_messages SET reactions = new_reactions WHERE id = message_id;
    ELSE
      UPDATE public.messages SET reactions = new_reactions WHERE id = message_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION count_user_reactions(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reaction_count integer;
BEGIN
  SELECT COUNT(*)
  INTO reaction_count
  FROM public.message_reactions
  WHERE user_id = target_user_id;

  RETURN COALESCE(reaction_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION count_reactions_to_user_messages_v2(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reaction_count integer;
BEGIN
  SELECT COUNT(mr.*)
  INTO reaction_count
  FROM public.message_reactions mr
  INNER JOIN public.messages m ON mr.message_id = m.id
  WHERE m.user_id = target_user_id;

  RETURN COALESCE(reaction_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION count_reactions_to_user_dm_messages_v2(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reaction_count integer;
BEGIN
  SELECT COUNT(mr.*)
  INTO reaction_count
  FROM public.message_reactions mr
  INNER JOIN public.dm_messages dm ON mr.dm_message_id = dm.id
  WHERE dm.sender_id = target_user_id;

  RETURN COALESCE(reaction_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION toggle_message_reaction(
  message_id uuid,
  emoji text,
  is_dm boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM toggle_message_reaction_v2(message_id, emoji, is_dm);
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_message_reaction_v2(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION count_user_reactions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION count_reactions_to_user_messages_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION count_reactions_to_user_dm_messages_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_message_reaction(uuid, text, boolean) TO authenticated;
