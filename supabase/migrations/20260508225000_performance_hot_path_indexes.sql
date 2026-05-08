-- Narrow indexes for high-traffic chat, DM, and presence paths.
-- These keep ordering tie-breakers and partial predicates close to the app queries/RPCs.

CREATE INDEX IF NOT EXISTS messages_created_id_desc_idx
  ON public.messages (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS dm_messages_conversation_created_id_desc_idx
  ON public.dm_messages (conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS user_presence_online_last_seen_idx
  ON public.user_presence (last_seen DESC, user_id)
  WHERE status = 'online' AND last_seen IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_pinned_at_idx
  ON public.messages (pinned_at ASC)
  WHERE pinned = true;
