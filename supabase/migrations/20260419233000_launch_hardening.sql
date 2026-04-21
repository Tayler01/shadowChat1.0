/*
  # Launch hardening and bootstrap fixes

  1. Normalize the users schema so legacy and current app code agree.
  2. Create a safe signup path with `is_username_available()` and an auth trigger
     that bootstraps `public.users` rows from `auth.users`.
  3. Create storage buckets and object policies needed for fresh deployments.
  4. Replace placeholder notification sound URLs with safe defaults.
  5. Explicitly publish realtime tables used by the app.
*/

-- Normalize legacy profile columns so fresh and upgraded projects converge.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS chat_color text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS status_message text DEFAULT '';

UPDATE public.users u
SET
  email = COALESCE(NULLIF(u.email, ''), au.email),
  display_name = COALESCE(NULLIF(u.display_name, ''), NULLIF(u.full_name, ''), NULLIF(u.username, ''), split_part(COALESCE(au.email, u.email, ''), '@', 1), 'User'),
  full_name = COALESCE(NULLIF(u.full_name, ''), NULLIF(u.display_name, ''), NULLIF(u.username, ''), split_part(COALESCE(au.email, u.email, ''), '@', 1), 'User'),
  color = COALESCE(NULLIF(u.color, ''), NULLIF(u.chat_color, ''), '#3B82F6'),
  chat_color = COALESCE(NULLIF(u.chat_color, ''), NULLIF(u.color, ''), '#3B82F6'),
  status_message = COALESCE(u.status_message, '')
FROM auth.users au
WHERE au.id = u.id;

UPDATE public.users
SET
  display_name = COALESCE(NULLIF(display_name, ''), NULLIF(full_name, ''), NULLIF(username, ''), split_part(COALESCE(email, ''), '@', 1), 'User'),
  full_name = COALESCE(NULLIF(full_name, ''), NULLIF(display_name, ''), NULLIF(username, ''), split_part(COALESCE(email, ''), '@', 1), 'User'),
  color = COALESCE(NULLIF(color, ''), NULLIF(chat_color, ''), '#3B82F6'),
  chat_color = COALESCE(NULLIF(chat_color, ''), NULLIF(color, ''), '#3B82F6'),
  status_message = COALESCE(status_message, '');

ALTER TABLE public.users
  ALTER COLUMN display_name SET DEFAULT 'User',
  ALTER COLUMN full_name SET DEFAULT 'User',
  ALTER COLUMN color SET DEFAULT '#3B82F6',
  ALTER COLUMN chat_color SET DEFAULT '#3B82F6',
  ALTER COLUMN status_message SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.is_username_available(candidate text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := lower(trim(candidate));
BEGIN
  IF normalized IS NULL OR normalized = '' THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(username) = normalized
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_username text;
  normalized_username text;
  resolved_display_name text;
BEGIN
  raw_username := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'username'), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'user'
  );

  normalized_username := lower(regexp_replace(raw_username, '[^a-zA-Z0-9_]+', '', 'g'));
  IF normalized_username = '' THEN
    normalized_username := 'user_' || left(replace(NEW.id::text, '-', ''), 8);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(username) = normalized_username
  ) THEN
    RAISE EXCEPTION 'Username already taken';
  END IF;

  resolved_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    normalized_username
  );

  INSERT INTO public.users (
    id,
    email,
    username,
    display_name,
    full_name,
    color,
    chat_color,
    status,
    status_message,
    last_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    normalized_username,
    resolved_display_name,
    resolved_display_name,
    '#3B82F6',
    '#3B82F6',
    'online',
    '',
    now(),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = COALESCE(EXCLUDED.email, public.users.email),
    display_name = COALESCE(NULLIF(public.users.display_name, ''), EXCLUDED.display_name),
    full_name = COALESCE(NULLIF(public.users.full_name, ''), EXCLUDED.full_name),
    color = COALESCE(NULLIF(public.users.color, ''), EXCLUDED.color),
    chat_color = COALESCE(NULLIF(public.users.chat_color, ''), EXCLUDED.chat_color),
    status_message = COALESCE(public.users.status_message, '');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any existing auth users that never received a public profile row.
INSERT INTO public.users (
  id,
  email,
  username,
  display_name,
  full_name,
  color,
  chat_color,
  status,
  status_message,
  last_active,
  created_at,
  updated_at
)
SELECT
  au.id,
  au.email,
  lower(regexp_replace(
    COALESCE(NULLIF(trim(au.raw_user_meta_data ->> 'username'), ''), split_part(COALESCE(au.email, ''), '@', 1), 'user_' || left(replace(au.id::text, '-', ''), 8)),
    '[^a-zA-Z0-9_]+',
    '',
    'g'
  )) AS username,
  COALESCE(
    NULLIF(trim(au.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(trim(au.raw_user_meta_data ->> 'full_name'), ''),
    split_part(COALESCE(au.email, ''), '@', 1),
    'User'
  ) AS display_name,
  COALESCE(
    NULLIF(trim(au.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(trim(au.raw_user_meta_data ->> 'full_name'), ''),
    split_part(COALESCE(au.email, ''), '@', 1),
    'User'
  ) AS full_name,
  '#3B82F6',
  '#3B82F6',
  'online',
  '',
  now(),
  COALESCE(au.created_at, now()),
  now()
FROM auth.users au
LEFT JOIN public.users u
  ON u.id = au.id
WHERE u.id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users existing
    WHERE lower(existing.username) = lower(regexp_replace(
      COALESCE(NULLIF(trim(au.raw_user_meta_data ->> 'username'), ''), split_part(COALESCE(au.email, ''), '@', 1), 'user_' || left(replace(au.id::text, '-', ''), 8)),
      '[^a-zA-Z0-9_]+',
      '',
      'g'
    ))
  );

-- Bootstrap storage buckets required by the app.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('banners', 'banners', true),
  ('chat-uploads', 'chat-uploads', true),
  ('message-media', 'message-media', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read for launch buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload for launch buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update for launch buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete for launch buckets" ON storage.objects;

CREATE POLICY "Public read for launch buckets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id IN ('avatars', 'banners', 'chat-uploads', 'message-media'));

CREATE POLICY "Authenticated upload for launch buckets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('avatars', 'banners', 'chat-uploads', 'message-media')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated update for launch buckets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('avatars', 'banners', 'chat-uploads', 'message-media')
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id IN ('avatars', 'banners', 'chat-uploads', 'message-media')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated delete for launch buckets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN ('avatars', 'banners', 'chat-uploads', 'message-media')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE TABLE IF NOT EXISTS public.notification_sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.notification_sounds (name, url)
VALUES
  ('message', 'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  ('reaction', 'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
ON CONFLICT (name) DO UPDATE
SET url = EXCLUDED.url;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dm_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END $$;
