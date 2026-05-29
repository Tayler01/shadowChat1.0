ALTER TABLE public.dm_messages
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.dm_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dm_messages_reply_to_idx
  ON public.dm_messages (reply_to)
  WHERE reply_to IS NOT NULL;
