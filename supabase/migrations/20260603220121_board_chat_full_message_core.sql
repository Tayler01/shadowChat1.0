/*
  # Board Chat full message core

  Expands board chat messages to the same payload shape used by General Chat so
  chat boards can share the core composer, message list, replies, media, local
  retry, reactions, and pin behavior while remaining isolated from the general
  `messages` table.
*/

ALTER TABLE public.board_chat_messages
  ADD COLUMN IF NOT EXISTS client_message_id text,
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS audio_duration integer,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS media_width integer,
  ADD COLUMN IF NOT EXISTS media_height integer,
  ADD COLUMN IF NOT EXISTS media_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.board_chat_messages(id) ON DELETE SET NULL;

UPDATE public.board_chat_messages
SET message_type = 'text'
WHERE message_type IS NULL;

UPDATE public.board_chat_messages
SET pinned = false
WHERE pinned IS NULL;

ALTER TABLE public.board_chat_messages
  ALTER COLUMN message_type SET DEFAULT 'text',
  ALTER COLUMN message_type SET NOT NULL,
  ALTER COLUMN pinned SET DEFAULT false,
  ALTER COLUMN pinned SET NOT NULL;

ALTER TABLE public.board_chat_messages
  DROP CONSTRAINT IF EXISTS board_chat_messages_content_check,
  ADD CONSTRAINT board_chat_messages_content_check
    CHECK (
      char_length(content) <= 4000
      AND (
        char_length(trim(content)) >= 1
        OR message_type IN ('audio', 'image', 'video')
        OR file_url IS NOT NULL
        OR audio_url IS NOT NULL
      )
    ),
  DROP CONSTRAINT IF EXISTS board_chat_messages_message_type_check,
  ADD CONSTRAINT board_chat_messages_message_type_check
    CHECK (message_type IN ('text', 'command', 'audio', 'image', 'video', 'file')),
  DROP CONSTRAINT IF EXISTS board_chat_messages_media_dimensions_check,
  ADD CONSTRAINT board_chat_messages_media_dimensions_check
    CHECK (
      (media_width IS NULL OR media_width > 0)
      AND (media_height IS NULL OR media_height > 0)
    ),
  DROP CONSTRAINT IF EXISTS board_chat_messages_audio_duration_check,
  ADD CONSTRAINT board_chat_messages_audio_duration_check
    CHECK (audio_duration IS NULL OR audio_duration >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS board_chat_messages_board_sender_client_message_id_key
  ON public.board_chat_messages (board_slug, user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS board_chat_messages_board_created_id_idx
  ON public.board_chat_messages (board_slug, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS board_chat_messages_board_pinned_idx
  ON public.board_chat_messages (board_slug, pinned_at ASC, created_at ASC, id ASC)
  WHERE pinned = true;

CREATE INDEX IF NOT EXISTS board_chat_messages_reply_to_idx
  ON public.board_chat_messages (reply_to)
  WHERE reply_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS board_chat_messages_media_thumbnail_idx
  ON public.board_chat_messages (media_processed_at)
  WHERE message_type IN ('image', 'video') AND file_url IS NOT NULL AND thumbnail_url IS NULL;

CREATE OR REPLACE FUNCTION public.toggle_board_chat_pin(chat_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  target_board_slug text;
  is_pinned boolean;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT board_slug, pinned
  INTO target_board_slug, is_pinned
  FROM public.board_chat_messages
  WHERE id = chat_message_id;

  IF target_board_slug IS NULL THEN
    RAISE EXCEPTION 'Board chat message is not available';
  END IF;

  IF public.is_board_interaction_banned(current_user_id, target_board_slug) THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(
      current_user_id,
      COALESCE(public.board_chat_moderation_scope(target_board_slug), 'all_interaction')
    );
  END IF;

  IF is_pinned THEN
    UPDATE public.board_chat_messages
    SET pinned = false,
        pinned_by = NULL,
        pinned_at = NULL
    WHERE id = chat_message_id;
  ELSE
    UPDATE public.board_chat_messages
    SET pinned = false,
        pinned_by = NULL,
        pinned_at = NULL
    WHERE board_slug = target_board_slug
      AND pinned = true;

    UPDATE public.board_chat_messages
    SET pinned = true,
        pinned_by = current_user_id,
        pinned_at = now()
    WHERE id = chat_message_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_board_chat_pin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_board_chat_pin(uuid) TO authenticated;

COMMENT ON FUNCTION public.toggle_board_chat_pin(uuid)
  IS 'Toggles one pinned board chat message within its own board scope.';
