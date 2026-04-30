/*
  # Default profile color refresh

  New user chat colors should match the current obsidian/gold palette instead
  of the legacy blue default from the original theme.
*/

DO $$
DECLARE
  default_chat_color constant text := '#D7AA46';
  legacy_blue constant text := '#3B82F6';
BEGIN
  UPDATE public.users
  SET
    color = CASE
      WHEN upper(COALESCE(color, '')) = legacy_blue THEN default_chat_color
      WHEN NULLIF(color, '') IS NULL AND upper(COALESCE(chat_color, '')) = legacy_blue THEN default_chat_color
      ELSE color
    END,
    chat_color = CASE
      WHEN upper(COALESCE(chat_color, '')) = legacy_blue THEN default_chat_color
      WHEN NULLIF(chat_color, '') IS NULL AND upper(COALESCE(color, '')) = legacy_blue THEN default_chat_color
      ELSE chat_color
    END
  WHERE
    upper(COALESCE(color, '')) = legacy_blue
    OR upper(COALESCE(chat_color, '')) = legacy_blue;
END $$;

ALTER TABLE public.users
  ALTER COLUMN color SET DEFAULT '#D7AA46',
  ALTER COLUMN chat_color SET DEFAULT '#D7AA46';

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
  default_chat_color constant text := '#D7AA46';
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
    default_chat_color,
    default_chat_color,
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
