/*
  # Invite-only signup and auth hook foundation

  Implements the backend-only invite gate:
  - operator-created, single-use signup invite codes
  - 24 hour expiration and optional email lock
  - private hashed-code storage, with no plaintext invite persistence
  - public RPCs for app operators to create, list, and revoke invites
  - Supabase Before User Created hook entrypoint for invite validation
  - auth.users metadata cleanup after user creation
*/

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO supabase_auth_admin;

CREATE TABLE IF NOT EXISTS private.signup_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  email_lock text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revoke_reason text,
  redeemed_at timestamptz,
  redeemed_by uuid,
  redeemed_email text,
  redemption_request_id uuid,
  CONSTRAINT signup_invites_code_hash_sha256_check
    CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT signup_invites_email_lock_normalized_check
    CHECK (email_lock IS NULL OR email_lock = lower(trim(email_lock))),
  CONSTRAINT signup_invites_redeemed_email_normalized_check
    CHECK (redeemed_email IS NULL OR redeemed_email = lower(trim(redeemed_email))),
  CONSTRAINT signup_invites_expires_after_created_check
    CHECK (expires_at > created_at),
  CONSTRAINT signup_invites_revoked_by_requires_revoked_at_check
    CHECK (revoked_by IS NULL OR revoked_at IS NOT NULL),
  CONSTRAINT signup_invites_redeemed_by_requires_redeemed_at_check
    CHECK (redeemed_by IS NULL OR redeemed_at IS NOT NULL),
  CONSTRAINT signup_invites_redemption_request_requires_redeemed_at_check
    CHECK (redemption_request_id IS NULL OR redeemed_at IS NOT NULL)
);

COMMENT ON TABLE private.signup_invites IS
  'Private invite-only signup ledger. Invite codes are stored only as SHA-256 hashes.';

COMMENT ON COLUMN private.signup_invites.code_hash IS
  'SHA-256 hash of the normalized invite code with the server-side invite namespace prefix.';

ALTER TABLE private.signup_invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.signup_invites FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS signup_invites_created_by_idx
  ON private.signup_invites (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS signup_invites_redeemed_by_idx
  ON private.signup_invites (redeemed_by)
  WHERE redeemed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS signup_invites_active_lookup_idx
  ON private.signup_invites (code_hash, expires_at)
  WHERE revoked_at IS NULL AND redeemed_at IS NULL;

CREATE TABLE IF NOT EXISTS private.signup_invite_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES private.signup_invites(id) ON DELETE CASCADE,
  invite_created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  redeemed_by uuid NOT NULL,
  redeemed_email text NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  redemption_request_id uuid,
  CONSTRAINT signup_invite_redemptions_redeemed_email_normalized_check
    CHECK (redeemed_email = lower(trim(redeemed_email)))
);

COMMENT ON TABLE private.signup_invite_redemptions IS
  'Private invite redemption history linking creator admin, redeemed auth user, and redeemed email.';

ALTER TABLE private.signup_invite_redemptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.signup_invite_redemptions FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS signup_invite_redemptions_invite_id_idx
  ON private.signup_invite_redemptions (invite_id);

CREATE INDEX IF NOT EXISTS signup_invite_redemptions_redeemed_by_idx
  ON private.signup_invite_redemptions (redeemed_by, redeemed_at DESC);

CREATE OR REPLACE FUNCTION private.normalize_signup_invite_code(invite_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $$
  SELECT upper(regexp_replace(trim(invite_code), '[^a-zA-Z0-9]+', '', 'g'));
$$;

REVOKE ALL ON FUNCTION private.normalize_signup_invite_code(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.hash_signup_invite_code(invite_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
SET search_path = extensions, public
AS $$
  SELECT encode(
    digest(
      'shadowchat-signup-invite-v1:' || private.normalize_signup_invite_code(invite_code),
      'sha256'
    ),
    'hex'
  );
$$;

REVOKE ALL ON FUNCTION private.hash_signup_invite_code(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.generate_signup_invite_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  raw_code text;
BEGIN
  raw_code := upper(encode(gen_random_bytes(18), 'hex'));

  RETURN
    substring(raw_code from 1 for 6) || '-' ||
    substring(raw_code from 7 for 6) || '-' ||
    substring(raw_code from 13 for 6) || '-' ||
    substring(raw_code from 19 for 6) || '-' ||
    substring(raw_code from 25 for 6) || '-' ||
    substring(raw_code from 31 for 6);
END;
$$;

REVOKE ALL ON FUNCTION private.generate_signup_invite_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.create_signup_invite(
  creator_user_id uuid,
  email_lock text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  invite_code text,
  locked_email text,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
DECLARE
  normalized_email text := NULLIF(lower(trim(email_lock)), '');
  generated_code text;
  generated_hash text;
  attempts integer := 0;
  inserted_invite private.signup_invites%ROWTYPE;
BEGIN
  IF creator_user_id IS NULL OR NOT public.is_app_operator(creator_user_id) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF normalized_email IS NOT NULL AND normalized_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invite email lock must be a valid email address';
  END IF;

  LOOP
    attempts := attempts + 1;
    generated_code := private.generate_signup_invite_code();
    generated_hash := private.hash_signup_invite_code(generated_code);

    BEGIN
      INSERT INTO private.signup_invites (
        code_hash,
        email_lock,
        created_by
      )
      VALUES (
        generated_hash,
        normalized_email,
        creator_user_id
      )
      RETURNING *
      INTO inserted_invite;

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF attempts >= 5 THEN
          RAISE EXCEPTION 'Could not generate a unique invite code';
        END IF;
    END;
  END LOOP;

  RETURN QUERY
  SELECT
    inserted_invite.id,
    generated_code,
    inserted_invite.email_lock,
    inserted_invite.expires_at,
    inserted_invite.created_at;
END;
$$;

REVOKE ALL ON FUNCTION private.create_signup_invite(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.revoke_signup_invite(
  actor_user_id uuid,
  target_invite_id uuid,
  reason text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  email_lock text,
  created_by uuid,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  redeemed_at timestamptz,
  redeemed_by uuid,
  redeemed_email text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  invite_row private.signup_invites%ROWTYPE;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_operator(actor_user_id) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  SELECT *
  INTO invite_row
  FROM private.signup_invites invites
  WHERE invites.id = target_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF invite_row.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Redeemed invites cannot be revoked';
  END IF;

  IF invite_row.revoked_at IS NULL THEN
    UPDATE private.signup_invites invites
    SET
      revoked_at = now(),
      revoked_by = actor_user_id,
      revoke_reason = NULLIF(trim(reason), '')
    WHERE invites.id = target_invite_id
    RETURNING *
    INTO invite_row;
  END IF;

  RETURN QUERY
  SELECT
    invite_row.id,
    invite_row.email_lock,
    invite_row.created_by,
    invite_row.created_at,
    invite_row.expires_at,
    invite_row.revoked_at,
    invite_row.revoked_by,
    invite_row.revoke_reason,
    invite_row.redeemed_at,
    invite_row.redeemed_by,
    invite_row.redeemed_email;
END;
$$;

REVOKE ALL ON FUNCTION private.revoke_signup_invite(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.validate_signup_invite_for_auth_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
DECLARE
  invite_code text;
  normalized_code text;
  invite_hash text;
  signup_email text := NULLIF(lower(trim(event -> 'user' ->> 'email')), '');
  signup_user_id uuid := NULLIF(event -> 'user' ->> 'id', '')::uuid;
  request_id uuid := NULLIF(event -> 'metadata' ->> 'uuid', '')::uuid;
  invite_row private.signup_invites%ROWTYPE;
BEGIN
  invite_code := COALESCE(
    NULLIF(event -> 'user' -> 'user_metadata' ->> 'invite_code', ''),
    NULLIF(event -> 'user' -> 'user_metadata' ->> 'inviteCode', ''),
    NULLIF(event -> 'user' -> 'user_metadata' ->> 'signup_invite_code', '')
  );

  normalized_code := private.normalize_signup_invite_code(invite_code);

  IF signup_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Signup request is missing a user id.',
        'http_code', 400
      )
    );
  END IF;

  IF signup_email IS NULL THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Email is required for signup.',
        'http_code', 400
      )
    );
  END IF;

  IF normalized_code IS NULL OR length(normalized_code) < 24 THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'A valid invite code is required to sign up.',
        'http_code', 403
      )
    );
  END IF;

  invite_hash := private.hash_signup_invite_code(normalized_code);

  SELECT *
  INTO invite_row
  FROM private.signup_invites invites
  WHERE invites.code_hash = invite_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Invite code is invalid.',
        'http_code', 403
      )
    );
  END IF;

  IF invite_row.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Invite code has been revoked.',
        'http_code', 403
      )
    );
  END IF;

  IF invite_row.redeemed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Invite code has already been used.',
        'http_code', 403
      )
    );
  END IF;

  IF invite_row.expires_at <= now() THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Invite code has expired.',
        'http_code', 403
      )
    );
  END IF;

  IF invite_row.email_lock IS NOT NULL AND invite_row.email_lock <> signup_email THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Invite code is locked to a different email address.',
        'http_code', 403
      )
    );
  END IF;

  UPDATE private.signup_invites invites
  SET
    redeemed_at = now(),
    redeemed_by = signup_user_id,
    redeemed_email = signup_email,
    redemption_request_id = request_id
  WHERE invites.id = invite_row.id
    AND invites.redeemed_at IS NULL
    AND invites.revoked_at IS NULL
    AND invites.expires_at > now()
  RETURNING *
  INTO invite_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Invite code could not be redeemed.',
        'http_code', 409
      )
    );
  END IF;

  INSERT INTO private.signup_invite_redemptions (
    invite_id,
    invite_created_by,
    redeemed_by,
    redeemed_email,
    redeemed_at,
    redemption_request_id
  )
  VALUES (
    invite_row.id,
    invite_row.created_by,
    signup_user_id,
    signup_email,
    invite_row.redeemed_at,
    request_id
  )
  ON CONFLICT (invite_id) DO NOTHING;

  RETURN '{}'::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_signup_invite_for_auth_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.validate_signup_invite_for_auth_hook(jsonb) TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION private.cleanup_signup_invite_auth_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NEW.raw_user_meta_data ?| ARRAY['invite_code', 'inviteCode', 'signup_invite_code'] THEN
    NEW.raw_user_meta_data :=
      COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
        - 'invite_code'
        - 'inviteCode'
        - 'signup_invite_code';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.cleanup_signup_invite_auth_metadata() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_signup_invite(email_lock text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  invite_code text,
  locked_email text,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM private.create_signup_invite(auth.uid(), email_lock);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_signup_invite(invite_id uuid, reason text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  email_lock text,
  created_by uuid,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  redeemed_at timestamptz,
  redeemed_by uuid,
  redeemed_email text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM private.revoke_signup_invite(auth.uid(), invite_id, reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_signup_invites()
RETURNS TABLE (
  id uuid,
  email_lock text,
  created_by uuid,
  created_by_username text,
  created_by_display_name text,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_by_username text,
  revoked_by_display_name text,
  revoke_reason text,
  redeemed_at timestamptz,
  redeemed_by uuid,
  redeemed_by_email text,
  redeemed_by_username text,
  redeemed_by_display_name text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_operator(auth.uid()) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  RETURN QUERY
  SELECT
    invites.id,
    invites.email_lock,
    invites.created_by,
    creator.username AS created_by_username,
    creator.display_name AS created_by_display_name,
    invites.created_at,
    invites.expires_at,
    invites.revoked_at,
    invites.revoked_by,
    revoker.username AS revoked_by_username,
    revoker.display_name AS revoked_by_display_name,
    invites.revoke_reason,
    invites.redeemed_at,
    invites.redeemed_by,
    invites.redeemed_email AS redeemed_by_email,
    redeemed_user.username AS redeemed_by_username,
    redeemed_user.display_name AS redeemed_by_display_name,
    CASE
      WHEN invites.redeemed_at IS NOT NULL THEN 'redeemed'
      WHEN invites.revoked_at IS NOT NULL THEN 'revoked'
      WHEN invites.expires_at <= now() THEN 'expired'
      ELSE 'active'
    END AS status
  FROM private.signup_invites invites
  LEFT JOIN public.users creator
    ON creator.id = invites.created_by
  LEFT JOIN public.users revoker
    ON revoker.id = invites.revoked_by
  LEFT JOIN public.users redeemed_user
    ON redeemed_user.id = invites.redeemed_by
  ORDER BY invites.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.hook_validate_signup_invite(event jsonb)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path = public, private
AS $$
  SELECT private.validate_signup_invite_for_auth_hook(event);
$$;

REVOKE ALL ON FUNCTION public.create_signup_invite(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_signup_invite(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_signup_invites() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hook_validate_signup_invite(jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_signup_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_signup_invite(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_signup_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hook_validate_signup_invite(jsonb) TO supabase_auth_admin;

GRANT EXECUTE ON FUNCTION private.cleanup_signup_invite_auth_metadata() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS cleanup_signup_invite_auth_metadata_on_auth_users ON auth.users;
CREATE TRIGGER cleanup_signup_invite_auth_metadata_on_auth_users
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.cleanup_signup_invite_auth_metadata();
