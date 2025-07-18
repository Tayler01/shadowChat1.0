/*
  # Notification Sounds Table

  Adds a table `notification_sounds` for storing URLs to sound effects
  used by the frontend. Two default rows (message, reaction) are inserted
  as examples.
*/

CREATE TABLE IF NOT EXISTS notification_sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

INSERT INTO notification_sounds (name, url) VALUES
  ('message', 'https://example.com/message.mp3'),
  ('reaction', 'https://example.com/reaction.mp3')
ON CONFLICT (name) DO NOTHING;
