/*
  # Push Notification Triggers

  Creates a trigger that calls the `notify-message` Edge Function whenever
  a new row is inserted into the `messages` or `dm_messages` tables.
*/

-- Ensure network HTTP extension is available
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to invoke the Edge Function via HTTP
CREATE OR REPLACE FUNCTION notify_message_http()
RETURNS trigger AS $$
DECLARE
  url text := 'https://<your-project-ref>.functions.supabase.co/notify-message';
  payload text;
BEGIN
  payload := json_build_object(
    'table', TG_TABLE_NAME,
    'type', TG_OP,
    'record', row_to_json(NEW)
  )::text;

  PERFORM
    net.http_post(url, payload, 'application/json');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS notify_messages_insert ON messages;
CREATE TRIGGER notify_messages_insert
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_message_http();

DROP TRIGGER IF EXISTS notify_dm_messages_insert ON dm_messages;
CREATE TRIGGER notify_dm_messages_insert
  AFTER INSERT ON dm_messages
  FOR EACH ROW EXECUTE FUNCTION notify_message_http();
