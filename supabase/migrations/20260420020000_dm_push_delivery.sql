ALTER TABLE public.notification_events
ADD COLUMN IF NOT EXISTS dm_message_id uuid REFERENCES public.dm_messages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notification_events_dm_message_id
  ON public.notification_events(dm_message_id);
