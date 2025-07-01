-- Migrate existing audio message content to audio_url

-- For messages table
UPDATE messages
SET audio_url = content,
    content = ''
WHERE message_type = 'audio'
  AND audio_url IS NULL;

-- For dm_messages table
UPDATE dm_messages
SET audio_url = content,
    content = ''
WHERE message_type = 'audio'
  AND audio_url IS NULL;
