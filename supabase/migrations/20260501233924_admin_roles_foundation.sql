/*
  # Admin roles foundation

  Promotes the old News-only operator role into the app-wide admin model:

  - exactly one full `admin`
  - many `sub_admin` operators
  - sub-admins can use admin-class tools but cannot manage roles
  - all authenticated users can see visible admin role badges
  - role changes are audited and sub-admin grants create one-time notices
*/

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- `news_admin` was the partial role model used by the shipped News surface.
-- Convert it into the single full-admin role before tightening the constraint.
DO $$
DECLARE
  check_name text;
BEGIN
  FOR check_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS %I', check_name);
  END LOOP;
END $$;

WITH ranked_news_admins AS (
  SELECT
    ctid,
    row_number() OVER (ORDER BY created_at ASC, user_id ASC) AS position
  FROM public.user_roles
  WHERE role = 'news_admin'
)
UPDATE public.user_roles roles
SET role = CASE
  WHEN ranked_news_admins.position = 1 THEN 'admin'
  ELSE 'sub_admin'
END
FROM ranked_news_admins
WHERE roles.ctid = ranked_news_admins.ctid;

WITH ranked_roles AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at ASC
    ) AS position
  FROM public.user_roles
  WHERE role IN ('admin', 'sub_admin')
)
DELETE FROM public.user_roles roles
USING ranked_roles
WHERE roles.ctid = ranked_roles.ctid
  AND ranked_roles.position > 1;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'sub_admin'));

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_single_admin_idx
  ON public.user_roles ((role))
  WHERE role = 'admin';

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_admin_role_per_user_idx
  ON public.user_roles (user_id)
  WHERE role IN ('admin', 'sub_admin');

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS admin_role text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_admin_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_admin_role_check
  CHECK (admin_role IS NULL OR admin_role IN ('admin', 'sub_admin'));

REVOKE UPDATE (admin_role) ON public.users FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_user_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  target_user_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.user_id
    ELSE NEW.user_id
  END;

  UPDATE public.users
  SET admin_role = (
    SELECT role
    FROM public.user_roles
    WHERE user_id = target_user_id
      AND role IN ('admin', 'sub_admin')
    ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END
    LIMIT 1
  )
  WHERE id = target_user_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_user_admin_role_on_user_roles ON public.user_roles;
CREATE TRIGGER sync_user_admin_role_on_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_admin_role();

UPDATE public.users users
SET admin_role = (
  SELECT role
  FROM public.user_roles
  WHERE user_id = users.id
    AND role IN ('admin', 'sub_admin')
  ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END
  LIMIT 1
);

CREATE OR REPLACE FUNCTION public.enforce_admin_role_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE role = 'admin'
        AND user_id <> NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Only one full admin is allowed';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'admin' AND NEW.role <> 'admin' AND (
      SELECT count(*)
      FROM public.user_roles
      WHERE role = 'admin'
    ) <= 1 THEN
      RAISE EXCEPTION 'At least one full admin is required';
    END IF;

    IF NEW.role = 'admin' AND OLD.role <> 'admin' AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE role = 'admin'
        AND user_id <> NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Only one full admin is allowed';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' AND (
      SELECT count(*)
      FROM public.user_roles
      WHERE role = 'admin'
    ) <= 1 THEN
      RAISE EXCEPTION 'At least one full admin is required';
    END IF;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS enforce_admin_role_integrity_on_user_roles ON public.user_roles;
CREATE TRIGGER enforce_admin_role_integrity_on_user_roles
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_admin_role_integrity();

CREATE TABLE IF NOT EXISTS public.admin_role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  old_role text CHECK (old_role IS NULL OR old_role IN ('admin', 'sub_admin')),
  new_role text CHECK (new_role IS NULL OR new_role IN ('admin', 'sub_admin')),
  action text NOT NULL CHECK (action IN ('grant', 'revoke', 'change')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_role_audit ENABLE ROW LEVEL SECURITY;

INSERT INTO public.admin_role_audit (
  actor_user_id,
  target_user_id,
  old_role,
  new_role,
  action,
  created_at
)
SELECT
  created_by,
  user_id,
  NULL,
  role,
  'grant',
  created_at
FROM public.user_roles
WHERE role IN ('admin', 'sub_admin')
  AND NOT EXISTS (
    SELECT 1
    FROM public.admin_role_audit existing
    WHERE existing.target_user_id = public.user_roles.user_id
      AND existing.old_role IS NULL
      AND existing.new_role = public.user_roles.role
      AND existing.action = 'grant'
  );

CREATE TABLE IF NOT EXISTS public.admin_role_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('sub_admin')),
  message text NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz
);

ALTER TABLE public.admin_role_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read user roles" ON public.user_roles;
CREATE POLICY "Authenticated users can read user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.is_app_admin(target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = target_user_id
      AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_app_operator(target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = target_user_id
      AND role IN ('admin', 'sub_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_admin_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role IN ('admin', 'sub_admin')
  ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Full admins can read admin role audit" ON public.admin_role_audit;
CREATE POLICY "Full admins can read admin role audit"
ON public.admin_role_audit
FOR SELECT
TO authenticated
USING (public.is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can read own admin role notifications" ON public.admin_role_notifications;
CREATE POLICY "Users can read own admin role notifications"
ON public.admin_role_notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_setting text := NULLIF(current_setting('app.actor_user_id', true), '');
  actor_user_id uuid := CASE WHEN actor_setting IS NULL THEN NULL ELSE actor_setting::uuid END;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_role_audit (
      actor_user_id,
      target_user_id,
      old_role,
      new_role,
      action
    )
    VALUES (
      COALESCE(actor_user_id, NEW.created_by),
      NEW.user_id,
      NULL,
      NEW.role,
      'grant'
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO public.admin_role_audit (
        actor_user_id,
        target_user_id,
        old_role,
        new_role,
        action
      )
      VALUES (
        COALESCE(actor_user_id, NEW.created_by, OLD.created_by),
        NEW.user_id,
        OLD.role,
        NEW.role,
        'change'
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_role_audit (
      actor_user_id,
      target_user_id,
      old_role,
      new_role,
      action
    )
    VALUES (
      COALESCE(actor_user_id, OLD.created_by),
      OLD.user_id,
      OLD.role,
      NULL,
      'revoke'
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS log_user_role_change_on_user_roles ON public.user_roles;
CREATE TRIGGER log_user_role_change_on_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.log_user_role_change();

CREATE OR REPLACE FUNCTION public.list_admin_access_users()
RETURNS TABLE (
  id uuid,
  email text,
  username text,
  display_name text,
  avatar_url text,
  banner_url text,
  status text,
  status_message text,
  color text,
  last_active timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  admin_role text,
  role_created_at timestamptz,
  role_created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Full admin role required';
  END IF;

  RETURN QUERY
  SELECT
    users.id,
    users.email,
    users.username,
    users.display_name,
    users.avatar_url,
    users.banner_url,
    users.status,
    users.status_message,
    users.color,
    users.last_active,
    users.created_at,
    users.updated_at,
    roles.role AS admin_role,
    roles.created_at AS role_created_at,
    roles.created_by AS role_created_by
  FROM public.users users
  LEFT JOIN public.user_roles roles
    ON roles.user_id = users.id
   AND roles.role IN ('admin', 'sub_admin')
  ORDER BY
    CASE roles.role WHEN 'admin' THEN 0 WHEN 'sub_admin' THEN 1 ELSE 2 END,
    lower(users.display_name),
    lower(users.username);
END;
$$;

DROP FUNCTION IF EXISTS public.search_users(text);

CREATE OR REPLACE FUNCTION public.search_users(term text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  color text,
  status text,
  admin_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    users.id,
    users.username,
    users.display_name,
    users.avatar_url,
    users.color,
    users.status,
    users.admin_role
  FROM public.users users
  WHERE users.username ILIKE '%' || search_users.term || '%'
     OR users.display_name ILIKE '%' || search_users.term || '%'
  ORDER BY lower(users.username)
  LIMIT 30;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_sub_admin_status(target_user_id uuid, enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  existing_role text;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Full admin role required';
  END IF;

  IF target_user_id = actor_user_id THEN
    RAISE EXCEPTION 'Admins cannot change their own admin role';
  END IF;

  SELECT role
  INTO existing_role
  FROM public.user_roles
  WHERE user_id = target_user_id
    AND role IN ('admin', 'sub_admin')
  LIMIT 1;

  IF existing_role = 'admin' THEN
    RAISE EXCEPTION 'The full admin role cannot be changed here';
  END IF;

  PERFORM set_config('app.actor_user_id', actor_user_id::text, true);

  IF enabled THEN
    IF existing_role = 'sub_admin' THEN
      RETURN;
    END IF;

    INSERT INTO public.user_roles (user_id, role, created_by)
    VALUES (target_user_id, 'sub_admin', actor_user_id)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.admin_role_notifications (
      user_id,
      role,
      message,
      created_by
    )
    VALUES (
      target_user_id,
      'sub_admin',
      'You now have sub-admin access to ShadowChat admin tools.',
      actor_user_id
    );

    RETURN;
  END IF;

  IF existing_role IS DISTINCT FROM 'sub_admin' THEN
    RETURN;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role = 'sub_admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_admin_role_notifications()
RETURNS TABLE (
  id uuid,
  role text,
  message text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    id,
    role,
    message,
    created_at
  FROM public.admin_role_notifications
  WHERE user_id = auth.uid()
    AND seen_at IS NULL
  ORDER BY created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.mark_admin_role_notification_seen(notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_role_notifications
  SET seen_at = now()
  WHERE id = notification_id
    AND user_id = auth.uid()
    AND seen_at IS NULL;
END;
$$;

DROP POLICY IF EXISTS "News admins can insert sources" ON public.news_sources;
DROP POLICY IF EXISTS "News admins can update sources" ON public.news_sources;
DROP POLICY IF EXISTS "News admins can delete sources" ON public.news_sources;
DROP POLICY IF EXISTS "App operators can insert sources" ON public.news_sources;
DROP POLICY IF EXISTS "App operators can update sources" ON public.news_sources;
DROP POLICY IF EXISTS "App operators can delete sources" ON public.news_sources;

CREATE POLICY "App operators can insert sources"
ON public.news_sources
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_operator(auth.uid()));

CREATE POLICY "App operators can update sources"
ON public.news_sources
FOR UPDATE
TO authenticated
USING (public.is_app_operator(auth.uid()))
WITH CHECK (public.is_app_operator(auth.uid()));

CREATE POLICY "App operators can delete sources"
ON public.news_sources
FOR DELETE
TO authenticated
USING (public.is_app_operator(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read today's visible feed" ON public.news_feed_items;
DROP POLICY IF EXISTS "News admins can update feed items" ON public.news_feed_items;
DROP POLICY IF EXISTS "News admins can delete feed items" ON public.news_feed_items;
DROP POLICY IF EXISTS "App operators can update feed items" ON public.news_feed_items;
DROP POLICY IF EXISTS "App operators can delete feed items" ON public.news_feed_items;

CREATE POLICY "Authenticated users can read today's visible feed"
ON public.news_feed_items
FOR SELECT
TO authenticated
USING (
  public.is_app_operator(auth.uid())
  OR (
    hidden = false
    AND visible_day = ((now() AT TIME ZONE 'America/New_York')::date)
  )
);

CREATE POLICY "App operators can update feed items"
ON public.news_feed_items
FOR UPDATE
TO authenticated
USING (public.is_app_operator(auth.uid()))
WITH CHECK (public.is_app_operator(auth.uid()));

CREATE POLICY "App operators can delete feed items"
ON public.news_feed_items
FOR DELETE
TO authenticated
USING (public.is_app_operator(auth.uid()));

CREATE OR REPLACE FUNCTION public.upsert_news_source(
  platform text,
  handle text,
  display_name text DEFAULT NULL,
  profile_url text DEFAULT NULL,
  external_account_id text DEFAULT NULL
)
RETURNS public.news_sources
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  next_source public.news_sources;
  clean_handle text := trim(regexp_replace(trim(upsert_news_source.handle), '^@+[[:space:]]*', '@'));
BEGIN
  IF current_user_id IS NULL OR NOT public.is_app_operator(current_user_id) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF clean_handle = '' THEN
    RAISE EXCEPTION 'News source handle is required';
  END IF;

  INSERT INTO public.news_sources (
    platform,
    handle,
    display_name,
    profile_url,
    external_account_id,
    created_by
  )
  VALUES (
    lower(trim(upsert_news_source.platform)),
    clean_handle,
    NULLIF(trim(upsert_news_source.display_name), ''),
    NULLIF(trim(upsert_news_source.profile_url), ''),
    NULLIF(trim(upsert_news_source.external_account_id), ''),
    current_user_id
  )
  ON CONFLICT ON CONSTRAINT news_sources_platform_normalized_handle_key DO UPDATE
  SET
    handle = EXCLUDED.handle,
    display_name = COALESCE(EXCLUDED.display_name, public.news_sources.display_name),
    profile_url = COALESCE(EXCLUDED.profile_url, public.news_sources.profile_url),
    external_account_id = COALESCE(EXCLUDED.external_account_id, public.news_sources.external_account_id),
    enabled = true,
    updated_at = now()
  RETURNING * INTO next_source;

  RETURN next_source;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_news_source_enabled(source_id uuid, enabled boolean)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_operator(auth.uid()) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  UPDATE public.news_sources
  SET enabled = set_news_source_enabled.enabled
  WHERE id = source_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hide_news_feed_item(feed_item_id uuid, hidden boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_operator(auth.uid()) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  UPDATE public.news_feed_items
  SET
    hidden = hide_news_feed_item.hidden,
    hidden_by = CASE WHEN hide_news_feed_item.hidden THEN auth.uid() ELSE NULL END,
    hidden_at = CASE WHEN hide_news_feed_item.hidden THEN now() ELSE NULL END
  WHERE id = feed_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_app_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_operator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_admin_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_access_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_sub_admin_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_admin_role_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_admin_role_notification_seen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_news_source(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_news_source_enabled(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_news_feed_item(uuid, boolean) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'user_roles'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'admin_role_notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_role_notifications;
    END IF;
  END IF;
END $$;
