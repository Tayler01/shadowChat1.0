BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'circle-a@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"circle_a","display_name":"Circle A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'circle-b@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"circle_b","display_name":"Circle B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'circle-c@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"circle_c","display_name":"Circle C"}', now(), now());

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  ('fc000000-0000-4000-8000-' || lpad(to_hex(series.number + 256), 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'circle-cap-' || series.number || '@local.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object(
    'username', 'circle_cap_' || series.number,
    'display_name', 'Circle Cap ' || series.number
  ),
  now(),
  now()
FROM generate_series(1, 51) AS series(number);

INSERT INTO public.user_connections (
  id, member_low_id, member_high_id, requested_by, status,
  requested_at, accepted_at, created_at, updated_at
)
VALUES (
  'fc300000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000002',
  'fc000000-0000-4000-8000-000000000001',
  'accepted',
  now(),
  now(),
  now(),
  now()
);

INSERT INTO public.user_connections (
  id, member_low_id, member_high_id, requested_by, status,
  requested_at, accepted_at, created_at, updated_at
)
SELECT
  ('fc300000-0000-4000-8000-' || lpad(to_hex(series.number + 256), 12, '0'))::uuid,
  'fc000000-0000-4000-8000-000000000001'::uuid,
  ('fc000000-0000-4000-8000-' || lpad(to_hex(series.number + 256), 12, '0'))::uuid,
  'fc000000-0000-4000-8000-000000000001'::uuid,
  'accepted',
  now(),
  now(),
  now(),
  now()
FROM generate_series(1, 51) AS series(number);

INSERT INTO public.shadow_pin_categories (
  id, creator_id, title, image_url, image_path, processing_status
)
VALUES
  ('fc400000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000002', 'Circle B Pins', 'https://example.test/circle-b.jpg', 'circles/b.jpg', 'ready'),
  ('fc400000-0000-4000-8000-000000000002', 'fc000000-0000-4000-8000-000000000003', 'Circle C Pins', 'https://example.test/circle-c.jpg', 'circles/c.jpg', 'ready');

INSERT INTO public.shadow_pin_images (
  id, category_id, creator_id, title, image_url, image_path,
  media_type, processing_status, created_at, updated_at
)
VALUES
  ('fc500000-0000-4000-8000-000000000001', 'fc400000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000002', 'Circle older', 'https://example.test/circle-older.jpg', 'circles/older.jpg', 'image', 'pending', '2026-07-13 20:00:00+00', '2026-07-13 20:00:00+00'),
  ('fc500000-0000-4000-8000-000000000002', 'fc400000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000002', 'Circle newer', 'https://example.test/circle-newer.jpg', 'circles/newer.jpg', 'image', 'pending', '2026-07-13 21:00:00+00', '2026-07-13 21:00:00+00'),
  ('fc500000-0000-4000-8000-000000000003', 'fc400000-0000-4000-8000-000000000002', 'fc000000-0000-4000-8000-000000000003', 'Outside Circle', 'https://example.test/outside-circle.jpg', 'circles/outside.jpg', 'image', 'pending', '2026-07-13 22:00:00+00', '2026-07-13 22:00:00+00');

DO $privileges$
BEGIN
  IF has_table_privilege('authenticated', 'public.inner_circles', 'select')
    OR has_table_privilege('authenticated', 'public.inner_circles', 'insert')
    OR has_table_privilege('authenticated', 'public.inner_circles', 'update')
    OR has_table_privilege('authenticated', 'public.inner_circles', 'delete')
    OR has_table_privilege('authenticated', 'public.inner_circle_members', 'select')
    OR has_table_privilege('authenticated', 'public.inner_circle_members', 'insert')
    OR has_table_privilege('authenticated', 'public.inner_circle_members', 'update')
    OR has_table_privilege('authenticated', 'public.inner_circle_members', 'delete')
    OR has_table_privilege('anon', 'public.inner_circles', 'select')
    OR has_table_privilege('anon', 'public.inner_circle_members', 'select') THEN
    RAISE EXCEPTION 'browser role unexpectedly has direct Inner Circle table access';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.inner_circles', 'select')
    OR NOT has_table_privilege('service_role', 'public.inner_circle_members', 'select')
    OR has_table_privilege('service_role', 'public.inner_circles', 'insert')
    OR has_table_privilege('service_role', 'public.inner_circle_members', 'insert') THEN
    RAISE EXCEPTION 'service-role Inner Circle privileges drifted';
  END IF;

  IF has_function_privilege('anon', 'public.list_my_inner_circles()', 'execute')
    OR has_function_privilege('anon', 'public.list_my_inner_circle_members(uuid)', 'execute')
    OR has_function_privilege('anon', 'public.mutate_my_inner_circle(uuid,text,text,integer)', 'execute')
    OR has_function_privilege('anon', 'public.mutate_my_inner_circle_member(uuid,uuid,text)', 'execute')
    OR has_function_privilege('anon', 'public.set_my_inner_circle_members(uuid,uuid[])', 'execute')
    OR has_function_privilege('anon', 'public.list_my_shadow_pin_circle_feed(uuid,integer,timestamp with time zone,uuid)', 'execute')
    OR has_function_privilege('anon', 'public.get_my_shadow_pin_circle_feed_window(uuid,uuid)', 'execute') THEN
    RAISE EXCEPTION 'anonymous role unexpectedly has an Inner Circle RPC privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename IN ('inner_circles', 'inner_circle_members')
  ) THEN
    RAISE EXCEPTION 'Inner Circle tables unexpectedly entered the Realtime publication';
  END IF;
END
$privileges$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"fc000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $owner_contract$
DECLARE
  mutation record;
  member_mutation record;
  listed_circle record;
  listed_member record;
  normalized_revision integer;
  extra_number integer;
BEGIN
  BEGIN
    PERFORM 1 FROM public.inner_circles;
    RAISE EXCEPTION 'direct Inner Circle table read unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SELECT * INTO mutation
  FROM public.mutate_my_inner_circle(
    'fc100000-0000-4000-8000-000000000001',
    'create',
    '  Trusted    Core  ',
    NULL
  );
  IF mutation.name <> 'Trusted Core'
    OR mutation.revision <> 1
    OR mutation.member_count <> 0
    OR mutation.changed IS NOT TRUE
    OR mutation.deleted IS NOT FALSE THEN
    RAISE EXCEPTION 'circle create mismatch: %', row_to_json(mutation);
  END IF;

  SELECT * INTO mutation
  FROM public.mutate_my_inner_circle(
    'fc100000-0000-4000-8000-000000000001',
    'create',
    'Ignored retry name',
    NULL
  );
  IF mutation.name <> 'Trusted Core' OR mutation.revision <> 1 OR mutation.changed IS NOT FALSE THEN
    RAISE EXCEPTION 'circle create retry was not idempotent: %', row_to_json(mutation);
  END IF;

  BEGIN
    PERFORM * FROM public.mutate_my_inner_circle(
      'fc100000-0000-4000-8000-000000000099',
      'create',
      'trusted core',
      NULL
    );
    RAISE EXCEPTION 'case-insensitive duplicate circle name unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'case-insensitive duplicate circle name unexpectedly succeeded' THEN RAISE; END IF;
  END;

  SELECT * INTO member_mutation
  FROM public.mutate_my_inner_circle_member(
    'fc100000-0000-4000-8000-000000000001',
    'fc000000-0000-4000-8000-000000000002',
    'add'
  );
  IF member_mutation.is_member IS NOT TRUE
    OR member_mutation.revision <> 2
    OR member_mutation.member_count <> 1
    OR member_mutation.changed IS NOT TRUE THEN
    RAISE EXCEPTION 'circle member add mismatch: %', row_to_json(member_mutation);
  END IF;

  SELECT * INTO member_mutation
  FROM public.mutate_my_inner_circle_member(
    'fc100000-0000-4000-8000-000000000001',
    'fc000000-0000-4000-8000-000000000002',
    'add'
  );
  IF member_mutation.revision <> 2 OR member_mutation.changed IS NOT FALSE THEN
    RAISE EXCEPTION 'circle member retry was not idempotent: %', row_to_json(member_mutation);
  END IF;

  SELECT * INTO listed_circle
  FROM public.list_my_inner_circles()
  WHERE id = 'fc100000-0000-4000-8000-000000000001';
  IF listed_circle.member_count <> 1 THEN
    RAISE EXCEPTION 'owner circle count mismatch: %', row_to_json(listed_circle);
  END IF;

  SELECT * INTO listed_member
  FROM public.list_my_inner_circle_members('fc100000-0000-4000-8000-000000000001');
  IF listed_member.member_id <> 'fc000000-0000-4000-8000-000000000002'::uuid
    OR listed_member.profile ? 'email'
    OR listed_member.profile ? 'full_name' THEN
    RAISE EXCEPTION 'safe member projection mismatch: %', row_to_json(listed_member);
  END IF;

  BEGIN
    PERFORM * FROM public.mutate_my_inner_circle_member(
      'fc100000-0000-4000-8000-000000000001',
      'fc000000-0000-4000-8000-000000000003',
      'add'
    );
    RAISE EXCEPTION 'unconnected member unexpectedly entered a circle';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'unconnected member unexpectedly entered a circle' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM * FROM public.mutate_my_inner_circle_member(
      'fc100000-0000-4000-8000-000000000001',
      'fc000000-0000-4000-8000-000000000001',
      'add'
    );
    RAISE EXCEPTION 'circle owner unexpectedly added themselves';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'circle owner unexpectedly added themselves' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM * FROM public.mutate_my_inner_circle(
      'fc100000-0000-4000-8000-000000000001',
      'rename',
      'Closest',
      1
    );
    RAISE EXCEPTION 'stale circle revision unexpectedly succeeded';
  EXCEPTION WHEN serialization_failure THEN
    NULL;
  END;

  SELECT * INTO mutation
  FROM public.mutate_my_inner_circle(
    'fc100000-0000-4000-8000-000000000001',
    'rename',
    'Closest',
    2
  );
  IF mutation.name <> 'Closest' OR mutation.revision <> 3 OR mutation.changed IS NOT TRUE THEN
    RAISE EXCEPTION 'circle rename mismatch: %', row_to_json(mutation);
  END IF;
  normalized_revision := mutation.revision;

  SELECT * INTO mutation
  FROM public.mutate_my_inner_circle(
    'fc100000-0000-4000-8000-000000000001',
    'rename',
    'Closest',
    2
  );
  IF mutation.revision <> normalized_revision OR mutation.changed IS NOT FALSE THEN
    RAISE EXCEPTION 'rename retry was not idempotent: %', row_to_json(mutation);
  END IF;

  PERFORM * FROM public.mutate_my_inner_circle(
    'fc100000-0000-4000-8000-000000000002',
    'create',
    'Capacity',
    NULL
  );

  FOR extra_number IN 3..10 LOOP
    PERFORM * FROM public.mutate_my_inner_circle(
      ('fc100000-0000-4000-8000-' || lpad(to_hex(extra_number), 12, '0'))::uuid,
      'create',
      'Circle ' || extra_number,
      NULL
    );
  END LOOP;

  BEGIN
    PERFORM * FROM public.mutate_my_inner_circle(
      'fc100000-0000-4000-8000-000000000011',
      'create',
      'Circle 11',
      NULL
    );
    RAISE EXCEPTION 'eleventh Inner Circle unexpectedly succeeded';
  EXCEPTION WHEN program_limit_exceeded THEN
    NULL;
  END;
END
$owner_contract$;

DO $atomic_member_set_contract$
DECLARE
  mutation record;
  before_revision integer;
  after_revision integer;
  stored_member_ids uuid[];
  oversized_member_ids uuid[];
BEGIN
  SELECT * INTO mutation
  FROM public.set_my_inner_circle_members(
    'fc100000-0000-4000-8000-000000000002',
    ARRAY[
      'fc000000-0000-4000-8000-000000000102'::uuid,
      'fc000000-0000-4000-8000-000000000101'::uuid
    ]
  );
  IF mutation.revision <> 2
    OR mutation.member_count <> 2
    OR mutation.member_ids <> ARRAY[
      'fc000000-0000-4000-8000-000000000101'::uuid,
      'fc000000-0000-4000-8000-000000000102'::uuid
    ]
    OR mutation.changed IS NOT TRUE THEN
    RAISE EXCEPTION 'atomic member-set save mismatch: %', row_to_json(mutation);
  END IF;

  SELECT * INTO mutation
  FROM public.set_my_inner_circle_members(
    'fc100000-0000-4000-8000-000000000002',
    ARRAY[
      'fc000000-0000-4000-8000-000000000102'::uuid,
      'fc000000-0000-4000-8000-000000000101'::uuid,
      'fc000000-0000-4000-8000-000000000102'::uuid
    ]
  );
  IF mutation.revision <> 2 OR mutation.member_count <> 2 OR mutation.changed IS NOT FALSE THEN
    RAISE EXCEPTION 'equivalent atomic member-set save was not idempotent: %', row_to_json(mutation);
  END IF;

  SELECT revision INTO before_revision
  FROM public.list_my_inner_circles()
  WHERE id = 'fc100000-0000-4000-8000-000000000002';

  BEGIN
    PERFORM * FROM public.set_my_inner_circle_members(
      'fc100000-0000-4000-8000-000000000002',
      ARRAY[
        'fc000000-0000-4000-8000-000000000101'::uuid,
        'fc000000-0000-4000-8000-000000000003'::uuid
      ]
    );
    RAISE EXCEPTION 'mixed valid/invalid member-set unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SELECT revision INTO after_revision
  FROM public.list_my_inner_circles()
  WHERE id = 'fc100000-0000-4000-8000-000000000002';
  SELECT array_agg(members.member_id ORDER BY members.member_id)
  INTO stored_member_ids
  FROM public.list_my_inner_circle_members(
    'fc100000-0000-4000-8000-000000000002'
  ) members;
  IF after_revision <> before_revision
    OR stored_member_ids <> ARRAY[
      'fc000000-0000-4000-8000-000000000101'::uuid,
      'fc000000-0000-4000-8000-000000000102'::uuid
    ] THEN
    RAISE EXCEPTION 'failed member-set save partially applied: revision %, members %',
      after_revision, stored_member_ids;
  END IF;

  SELECT array_agg(
    ('fc000000-0000-4000-8000-' || lpad(to_hex(series.number + 256), 12, '0'))::uuid
    ORDER BY series.number
  )
  INTO oversized_member_ids
  FROM generate_series(1, 51) AS series(number);

  BEGIN
    PERFORM * FROM public.set_my_inner_circle_members(
      'fc100000-0000-4000-8000-000000000002',
      oversized_member_ids
    );
    RAISE EXCEPTION 'oversized atomic member-set unexpectedly succeeded';
  EXCEPTION WHEN program_limit_exceeded THEN
    NULL;
  END;

  SELECT * INTO mutation
  FROM public.set_my_inner_circle_members(
    'fc100000-0000-4000-8000-000000000002',
    '{}'::uuid[]
  );
  IF mutation.revision <> 3
    OR mutation.member_count <> 0
    OR mutation.member_ids <> '{}'::uuid[]
    OR mutation.changed IS NOT TRUE THEN
    RAISE EXCEPTION 'atomic member-set clear mismatch: %', row_to_json(mutation);
  END IF;
END
$atomic_member_set_contract$;

DO $capacity_contract$
DECLARE
  member_number integer;
  capacity_member_id uuid;
  member_mutation record;
BEGIN
  FOR member_number IN 1..50 LOOP
    capacity_member_id := (
      'fc000000-0000-4000-8000-' || lpad(to_hex(member_number + 256), 12, '0')
    )::uuid;
    SELECT * INTO member_mutation
    FROM public.mutate_my_inner_circle_member(
      'fc100000-0000-4000-8000-000000000002',
      capacity_member_id,
      'add'
    );
    IF member_mutation.member_count <> member_number THEN
      RAISE EXCEPTION 'capacity count mismatch at %: %', member_number, row_to_json(member_mutation);
    END IF;
  END LOOP;

  BEGIN
    PERFORM * FROM public.mutate_my_inner_circle_member(
      'fc100000-0000-4000-8000-000000000002',
      'fc000000-0000-4000-8000-000000000133',
      'add'
    );
    RAISE EXCEPTION 'fifty-first circle member unexpectedly succeeded';
  EXCEPTION WHEN program_limit_exceeded THEN
    NULL;
  END;
END
$capacity_contract$;

DO $circle_feed$
DECLARE
  feed_ids uuid[];
  first_row record;
  second_row record;
  window_ids uuid[];
BEGIN
  SELECT array_agg(feed.image_id ORDER BY feed.created_at DESC, feed.image_id DESC)
  INTO feed_ids
  FROM public.list_my_shadow_pin_circle_feed(
    'fc100000-0000-4000-8000-000000000001', 30, NULL, NULL
  ) feed;
  IF feed_ids <> ARRAY[
    'fc500000-0000-4000-8000-000000000002'::uuid,
    'fc500000-0000-4000-8000-000000000001'::uuid
  ] THEN
    RAISE EXCEPTION 'circle feed escaped or missed its membership: %', feed_ids;
  END IF;

  SELECT * INTO first_row
  FROM public.list_my_shadow_pin_circle_feed(
    'fc100000-0000-4000-8000-000000000001', 1, NULL, NULL
  );
  IF first_row.image_id <> 'fc500000-0000-4000-8000-000000000002'::uuid
    OR first_row.has_more IS NOT TRUE THEN
    RAISE EXCEPTION 'circle first keyset page mismatch: %', row_to_json(first_row);
  END IF;

  SELECT * INTO second_row
  FROM public.list_my_shadow_pin_circle_feed(
    'fc100000-0000-4000-8000-000000000001',
    1,
    first_row.created_at,
    first_row.image_id
  );
  IF second_row.image_id <> 'fc500000-0000-4000-8000-000000000001'::uuid
    OR second_row.has_more IS NOT FALSE THEN
    RAISE EXCEPTION 'circle second keyset page mismatch: %', row_to_json(second_row);
  END IF;

  SELECT array_agg(window_rows.image_id ORDER BY window_rows.created_at DESC, window_rows.image_id DESC)
  INTO window_ids
  FROM public.get_my_shadow_pin_circle_feed_window(
    'fc100000-0000-4000-8000-000000000001',
    'fc500000-0000-4000-8000-000000000001'
  ) window_rows;
  IF window_ids <> ARRAY[
    'fc500000-0000-4000-8000-000000000002'::uuid,
    'fc500000-0000-4000-8000-000000000001'::uuid
  ] THEN
    RAISE EXCEPTION 'circle feed window mismatch: %', window_ids;
  END IF;

  BEGIN
    PERFORM * FROM public.list_my_shadow_pin_circle_feed(
      'fc100000-0000-4000-8000-000000000001', 30, now(), NULL
    );
    RAISE EXCEPTION 'partial circle feed cursor unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'partial circle feed cursor unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$circle_feed$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"fc000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $third_party_isolation$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_my_inner_circles()) THEN
    RAISE EXCEPTION 'another owner circles leaked into the caller list';
  END IF;

  BEGIN
    PERFORM * FROM public.list_my_inner_circle_members(
      'fc100000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'third party unexpectedly listed circle members';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM * FROM public.list_my_shadow_pin_circle_feed(
      'fc100000-0000-4000-8000-000000000001', 30, NULL, NULL
    );
    RAISE EXCEPTION 'third party unexpectedly listed a circle feed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$third_party_isolation$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"fc000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
DO $reciprocal_membership$
BEGIN
  PERFORM * FROM public.mutate_my_inner_circle(
    'fc100000-0000-4000-8000-000000000020',
    'create',
    'Other direction',
    NULL
  );
  PERFORM * FROM public.mutate_my_inner_circle_member(
    'fc100000-0000-4000-8000-000000000020',
    'fc000000-0000-4000-8000-000000000001',
    'add'
  );
END
$reciprocal_membership$;
RESET ROLE;

CREATE TEMP TABLE inner_circle_revision_check (
  circle_id uuid PRIMARY KEY,
  before_revision integer NOT NULL
) ON COMMIT DROP;

INSERT INTO inner_circle_revision_check (circle_id, before_revision)
SELECT circles.id, circles.revision
FROM public.inner_circles circles
WHERE circles.id IN (
  'fc100000-0000-4000-8000-000000000001',
  'fc100000-0000-4000-8000-000000000020'
);

UPDATE public.user_connections
SET status = 'inactive',
    revision = revision + 1,
    ended_at = now(),
    updated_at = now()
WHERE id = 'fc300000-0000-4000-8000-000000000001';

DO $inactive_teardown$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inner_circle_members memberships
    WHERE (memberships.circle_id = 'fc100000-0000-4000-8000-000000000001'
      AND memberships.member_id = 'fc000000-0000-4000-8000-000000000002')
      OR (memberships.circle_id = 'fc100000-0000-4000-8000-000000000020'
      AND memberships.member_id = 'fc000000-0000-4000-8000-000000000001')
  ) THEN
    RAISE EXCEPTION 'inactive Connection left bidirectional circle membership behind';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM inner_circle_revision_check expected
    JOIN public.inner_circles circles ON circles.id = expected.circle_id
    WHERE circles.revision <> expected.before_revision + 1
  ) THEN
    RAISE EXCEPTION 'inactive Connection teardown did not bump each affected circle exactly once';
  END IF;
END
$inactive_teardown$;

UPDATE public.user_connections
SET status = 'accepted',
    revision = revision + 1,
    accepted_at = now(),
    ended_at = NULL,
    updated_at = now()
WHERE id = 'fc300000-0000-4000-8000-000000000001';

DO $reconnect_no_restore$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.inner_circle_members memberships
    WHERE memberships.member_id IN (
      'fc000000-0000-4000-8000-000000000001',
      'fc000000-0000-4000-8000-000000000002'
    )
      AND memberships.circle_id IN (
        'fc100000-0000-4000-8000-000000000001',
        'fc100000-0000-4000-8000-000000000020'
      )
  ) THEN
    RAISE EXCEPTION 'reconnect silently restored circle membership';
  END IF;
END
$reconnect_no_restore$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"fc000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT * FROM public.mutate_my_inner_circle_member(
  'fc100000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000002',
  'add'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"fc000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT * FROM public.mutate_my_inner_circle_member(
  'fc100000-0000-4000-8000-000000000020',
  'fc000000-0000-4000-8000-000000000001',
  'add'
);
RESET ROLE;

TRUNCATE inner_circle_revision_check;
INSERT INTO inner_circle_revision_check (circle_id, before_revision)
SELECT circles.id, circles.revision
FROM public.inner_circles circles
WHERE circles.id IN (
  'fc100000-0000-4000-8000-000000000001',
  'fc100000-0000-4000-8000-000000000020'
);

INSERT INTO public.user_blocks (blocker_id, blocked_id)
VALUES (
  'fc000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000002'
);

DO $block_teardown$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.inner_circle_members memberships
    WHERE memberships.member_id IN (
      'fc000000-0000-4000-8000-000000000001',
      'fc000000-0000-4000-8000-000000000002'
    )
      AND memberships.circle_id IN (
        'fc100000-0000-4000-8000-000000000001',
        'fc100000-0000-4000-8000-000000000020'
      )
  ) THEN
    RAISE EXCEPTION 'personal block left circle membership behind';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_connections connections
    WHERE connections.id = 'fc300000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'personal block did not remove the canonical Connection';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM inner_circle_revision_check expected
    JOIN public.inner_circles circles ON circles.id = expected.circle_id
    WHERE circles.revision <> expected.before_revision + 1
  ) THEN
    RAISE EXCEPTION 'block/Connection-delete teardown did not bump each affected circle exactly once';
  END IF;
END
$block_teardown$;

DELETE FROM public.user_blocks
WHERE blocker_id = 'fc000000-0000-4000-8000-000000000001'
  AND blocked_id = 'fc000000-0000-4000-8000-000000000002';

INSERT INTO public.user_connections (
  id, member_low_id, member_high_id, requested_by, status,
  requested_at, accepted_at, created_at, updated_at
)
VALUES (
  'fc300000-0000-4000-8000-000000000002',
  'fc000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000002',
  'fc000000-0000-4000-8000-000000000001',
  'accepted',
  now(),
  now(),
  now(),
  now()
);

DO $unblock_no_restore$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.inner_circle_members memberships
    WHERE memberships.member_id IN (
      'fc000000-0000-4000-8000-000000000001',
      'fc000000-0000-4000-8000-000000000002'
    )
      AND memberships.circle_id IN (
        'fc100000-0000-4000-8000-000000000001',
        'fc100000-0000-4000-8000-000000000020'
      )
  ) THEN
    RAISE EXCEPTION 'unblock and reconnect restored circle membership';
  END IF;
END
$unblock_no_restore$;

ROLLBACK;
