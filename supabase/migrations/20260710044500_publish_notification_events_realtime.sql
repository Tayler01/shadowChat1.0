-- ShadowPin now has a live in-app notification surface. Publish the existing
-- recipient-owned event table so authenticated clients can receive INSERTs;
-- its RLS policies continue to restrict every row to its recipient.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notification_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_events;
  END IF;
END
$$;
