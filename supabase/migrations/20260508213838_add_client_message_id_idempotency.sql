ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_message_id_key
  ON public.messages (user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

ALTER TABLE public.dm_messages
  ADD COLUMN IF NOT EXISTS client_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS dm_messages_sender_client_message_id_key
  ON public.dm_messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
