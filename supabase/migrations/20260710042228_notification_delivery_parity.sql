/*
  Notification delivery parity for active ShadowChat surfaces.

  The browser owns only its user's preferences and DM mute rows. The
  service-role send-push function remains the sole delivery authority and
  applies these preferences before creating an event or contacting a push
  endpoint. Paused News, Boards, Art Board, and Bridge data are unchanged.
*/

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS general_chat_muted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_timezone text NOT NULL DEFAULT 'UTC';

UPDATE public.notification_preferences
SET
  quiet_hours_start = NULL,
  quiet_hours_end = NULL
WHERE (quiet_hours_start IS NULL) <> (quiet_hours_end IS NULL);

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_quiet_hours_pair_check,
  DROP CONSTRAINT IF EXISTS notification_preferences_quiet_hours_range_check,
  DROP CONSTRAINT IF EXISTS notification_preferences_quiet_hours_timezone_check;

ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_quiet_hours_pair_check CHECK (
    (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
    OR
    (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL)
  ),
  ADD CONSTRAINT notification_preferences_quiet_hours_range_check CHECK (
    quiet_hours_start IS NULL OR quiet_hours_start <> quiet_hours_end
  ),
  ADD CONSTRAINT notification_preferences_quiet_hours_timezone_check CHECK (
    length(quiet_hours_timezone) BETWEEN 1 AND 64
    AND quiet_hours_timezone !~ '[[:cntrl:]]'
  );

CREATE TABLE IF NOT EXISTS public.notification_conversation_mutes (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  muted_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

-- The primary key serves user-owned reads and upserts. This reverse index
-- keeps conversation deletes/cascades from scanning every user's mute rows.
CREATE INDEX IF NOT EXISTS notification_conversation_mutes_conversation_user_idx
  ON public.notification_conversation_mutes (conversation_id, user_id);

COMMENT ON TABLE public.notification_conversation_mutes IS
  'Private per-user DM push mutes. A null muted_until means muted until the user removes the row.';

ALTER TABLE public.notification_conversation_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own DM notification mutes"
  ON public.notification_conversation_mutes;
CREATE POLICY "Users can view own DM notification mutes"
  ON public.notification_conversation_mutes
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own DM notification mutes"
  ON public.notification_conversation_mutes;
CREATE POLICY "Users can insert own DM notification mutes"
  ON public.notification_conversation_mutes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.dm_conversations conversations
      WHERE conversations.id = conversation_id
        AND (select auth.uid()) = ANY(conversations.participants)
    )
  );

DROP POLICY IF EXISTS "Users can update own DM notification mutes"
  ON public.notification_conversation_mutes;
CREATE POLICY "Users can update own DM notification mutes"
  ON public.notification_conversation_mutes
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.dm_conversations conversations
      WHERE conversations.id = conversation_id
        AND (select auth.uid()) = ANY(conversations.participants)
    )
  );

DROP POLICY IF EXISTS "Users can delete own DM notification mutes"
  ON public.notification_conversation_mutes;
CREATE POLICY "Users can delete own DM notification mutes"
  ON public.notification_conversation_mutes
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP TRIGGER IF EXISTS update_notification_conversation_mutes_updated_at
  ON public.notification_conversation_mutes;
CREATE TRIGGER update_notification_conversation_mutes_updated_at
  BEFORE UPDATE ON public.notification_conversation_mutes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON TABLE public.notification_conversation_mutes
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.notification_conversation_mutes TO authenticated;
GRANT SELECT ON TABLE public.notification_conversation_mutes TO service_role;
