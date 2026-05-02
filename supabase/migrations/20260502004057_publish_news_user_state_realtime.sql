/*
  # Publish News seen state for realtime badge repair

  `news_user_state` stores each user's feed/chat seen timestamps. News badge
  counts are derived from this table plus `news_feed_items` and
  `news_chat_messages`; publishing it lets active clients refresh unread counts
  when the same user marks News seen from another tab or device.
*/

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
      AND tablename = 'news_user_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.news_user_state;
  END IF;
END $$;
