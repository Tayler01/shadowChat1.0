DO $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT id
  INTO target_user_id
  FROM public.users
  WHERE lower(regexp_replace(coalesce(username, ''), '^@+', '')) = 'caleb'
     OR lower(regexp_replace(coalesce(display_name, ''), '^@+', '')) = 'caleb'
  ORDER BY created_at ASC
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Could not grant news_admin: no public.users row found for @caleb';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'news_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
