BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'f3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'feed-a@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"feed_a","display_name":"Feed A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'feed-b@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"feed_b","display_name":"Feed B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'feed-c@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"feed_c","display_name":"Feed C"}', now(), now());

INSERT INTO public.shadow_pin_categories (
  id, creator_id, title, image_url, image_path, processing_status
)
VALUES
  ('f3100000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'Feed B category', 'https://example.test/b-category.jpg', 'feed/b-category.jpg', 'ready'),
  ('f3100000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000003', 'Feed C category', 'https://example.test/c-category.jpg', 'feed/c-category.jpg', 'ready');

INSERT INTO public.shadow_pin_images (
  id, category_id, creator_id, title, image_url, image_path,
  media_type, processing_status, created_at, updated_at
)
VALUES
  ('f3200000-0000-4000-8000-000000000001', 'f3100000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'Connected older', 'https://example.test/b-older.jpg', 'feed/b-older.jpg', 'image', 'pending', '2026-07-13 20:00:00+00', '2026-07-13 20:00:00+00'),
  ('f3200000-0000-4000-8000-000000000002', 'f3100000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'Connected newer tie', 'https://example.test/b-newer.jpg', 'feed/b-newer.jpg', 'image', 'pending', '2026-07-13 20:00:00+00', '2026-07-13 20:00:00+00'),
  ('f3200000-0000-4000-8000-000000000003', 'f3100000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000003', 'Unconnected', 'https://example.test/c.jpg', 'feed/c.jpg', 'image', 'pending', '2026-07-13 21:00:00+00', '2026-07-13 21:00:00+00'),
  ('f3200000-0000-4000-8000-000000000004', 'f3100000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'Self', 'https://example.test/a.jpg', 'feed/a.jpg', 'image', 'pending', '2026-07-13 22:00:00+00', '2026-07-13 22:00:00+00'),
  ('f3200000-0000-4000-8000-000000000005', 'f3100000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'Pending video', 'https://example.test/video-poster.jpg', 'feed/video-poster.jpg', 'video', 'pending', '2026-07-13 23:00:00+00', '2026-07-13 23:00:00+00'),
  ('f3200000-0000-4000-8000-000000000006', 'f3100000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'Deleted', 'https://example.test/deleted.jpg', 'feed/deleted.jpg', 'image', 'pending', '2026-07-13 23:30:00+00', '2026-07-13 23:30:00+00');

UPDATE public.shadow_pin_images
SET deleted_at = now(), deleted_by = creator_id
WHERE id = 'f3200000-0000-4000-8000-000000000006';

INSERT INTO public.shadow_pin_image_hearts (image_id, user_id)
VALUES ('f3200000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000001');

DO $privileges$
BEGIN
  IF has_table_privilege('authenticated', 'public.shadow_pin_feed_preferences', 'select')
    OR has_table_privilege('authenticated', 'public.shadow_pin_feed_preferences', 'insert')
    OR has_table_privilege('authenticated', 'public.shadow_pin_feed_preferences', 'update')
    OR has_table_privilege('anon', 'public.shadow_pin_feed_preferences', 'select') THEN
    RAISE EXCEPTION 'browser role unexpectedly has direct feed preference access';
  END IF;

  IF has_function_privilege('anon', 'public.get_my_shadow_pin_feed_mode()', 'execute')
    OR has_function_privilege('anon', 'public.set_my_shadow_pin_feed_mode(text)', 'execute')
    OR has_function_privilege('anon', 'public.list_my_shadow_pin_connection_feed(integer,timestamp with time zone,uuid)', 'execute')
    OR has_function_privilege('anon', 'public.get_my_shadow_pin_connection_feed_window(uuid)', 'execute') THEN
    RAISE EXCEPTION 'anon unexpectedly has a feed mode RPC privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'shadow_pin_images_creator_connections_feed_idx'
  ) THEN
    RAISE EXCEPTION 'Connections feed index is missing';
  END IF;
END
$privileges$;

DO $immutable_feed_identity$
BEGIN
  BEGIN
    UPDATE public.shadow_pin_images
    SET created_at = created_at + interval '1 second'
    WHERE id = 'f3200000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'feed identity mutation unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'feed identity mutation unexpectedly succeeded'
      OR position('immutable' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;
END
$immutable_feed_identity$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $preference$
DECLARE
  current_mode record;
BEGIN
  SELECT * INTO current_mode FROM public.get_my_shadow_pin_feed_mode();
  IF current_mode.feed_mode <> 'discover' OR current_mode.revision <> 0 THEN
    RAISE EXCEPTION 'default feed preference mismatch: %', row_to_json(current_mode);
  END IF;

  SELECT * INTO current_mode FROM public.set_my_shadow_pin_feed_mode('connections');
  IF current_mode.feed_mode <> 'connections' OR current_mode.revision <> 1 THEN
    RAISE EXCEPTION 'first feed preference write mismatch: %', row_to_json(current_mode);
  END IF;

  SELECT * INTO current_mode FROM public.set_my_shadow_pin_feed_mode('discover');
  IF current_mode.feed_mode <> 'discover' OR current_mode.revision <> 2 THEN
    RAISE EXCEPTION 'feed preference revision mismatch: %', row_to_json(current_mode);
  END IF;

  BEGIN
    PERFORM public.set_my_shadow_pin_feed_mode('invalid');
    RAISE EXCEPTION 'invalid feed mode unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid feed mode unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$preference$;

DO $no_connection$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_my_shadow_pin_connection_feed(30, NULL, NULL)) THEN
    RAISE EXCEPTION 'unconnected Pins qualified for the feed';
  END IF;
END
$no_connection$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
DO $preference_isolation$
DECLARE
  current_mode record;
BEGIN
  SELECT * INTO current_mode FROM public.get_my_shadow_pin_feed_mode();
  IF current_mode.feed_mode <> 'discover' OR current_mode.revision <> 0 THEN
    RAISE EXCEPTION 'another owner preference leaked: %', row_to_json(current_mode);
  END IF;
END
$preference_isolation$;
RESET ROLE;

INSERT INTO public.user_connections (
  id, member_low_id, member_high_id, requested_by, status, requested_at
)
VALUES (
  'f3300000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000002',
  'f3000000-0000-4000-8000-000000000001',
  'pending',
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $pending$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_my_shadow_pin_connection_feed(30, NULL, NULL)) THEN
    RAISE EXCEPTION 'pending Connection qualified for the feed';
  END IF;
END
$pending$;

RESET ROLE;

UPDATE public.user_connections
SET status = 'accepted', accepted_at = now(), revision = 2, updated_at = now()
WHERE id = 'f3300000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $accepted$
DECLARE
  rows_found uuid[];
  first_row record;
  second_row record;
  window_ids uuid[];
BEGIN
  SELECT array_agg(feed.image_id ORDER BY feed.created_at DESC, feed.image_id DESC)
  INTO rows_found
  FROM public.list_my_shadow_pin_connection_feed(30, NULL, NULL) feed;

  IF rows_found <> ARRAY[
    'f3200000-0000-4000-8000-000000000002'::uuid,
    'f3200000-0000-4000-8000-000000000001'::uuid
  ] THEN
    RAISE EXCEPTION 'accepted feed rows mismatch: %', rows_found;
  END IF;

  SELECT * INTO first_row
  FROM public.list_my_shadow_pin_connection_feed(1, NULL, NULL);
  IF first_row.image_id <> 'f3200000-0000-4000-8000-000000000002'::uuid
    OR first_row.viewer_has_hearted IS NOT TRUE
    OR first_row.has_more IS NOT TRUE THEN
    RAISE EXCEPTION 'first keyset page mismatch: %', row_to_json(first_row);
  END IF;

  SELECT * INTO second_row
  FROM public.list_my_shadow_pin_connection_feed(1, first_row.created_at, first_row.image_id);
  IF second_row.image_id <> 'f3200000-0000-4000-8000-000000000001'::uuid
    OR second_row.has_more IS NOT FALSE THEN
    RAISE EXCEPTION 'second keyset page mismatch: %', row_to_json(second_row);
  END IF;

  SELECT array_agg(window_rows.image_id ORDER BY window_rows.created_at DESC, window_rows.image_id DESC)
  INTO window_ids
  FROM public.get_my_shadow_pin_connection_feed_window(
    'f3200000-0000-4000-8000-000000000001'
  ) window_rows;
  IF window_ids <> ARRAY[
    'f3200000-0000-4000-8000-000000000002'::uuid,
    'f3200000-0000-4000-8000-000000000001'::uuid
  ] THEN
    RAISE EXCEPTION 'feed window mismatch: %', window_ids;
  END IF;

  BEGIN
    PERFORM * FROM public.list_my_shadow_pin_connection_feed(30, now(), NULL);
    RAISE EXCEPTION 'partial cursor unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'partial cursor unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$accepted$;

RESET ROLE;

UPDATE public.shadow_pin_images
SET processing_status = 'ready'
WHERE id = 'f3200000-0000-4000-8000-000000000005';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $ready_video$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.list_my_shadow_pin_connection_feed(30, NULL, NULL)
    WHERE image_id = 'f3200000-0000-4000-8000-000000000005'
  ) THEN
    RAISE EXCEPTION 'ready Connection video did not qualify';
  END IF;
END
$ready_video$;
RESET ROLE;

UPDATE public.shadow_pin_images
SET processing_status = 'pending'
WHERE id = 'f3200000-0000-4000-8000-000000000005';

INSERT INTO public.shadow_pin_images (
  id, category_id, creator_id, title, image_url, image_path,
  media_type, processing_status, created_at, updated_at
)
VALUES (
  'f3200000-0000-4000-8000-000000000007',
  'f3100000-0000-4000-8000-000000000002',
  'f3000000-0000-4000-8000-000000000002',
  'Connected creator in blocked category',
  'https://example.test/blocked-category.jpg',
  'feed/blocked-category.jpg',
  'image',
  'pending',
  '2026-07-13 23:45:00+00',
  '2026-07-13 23:45:00+00'
);
INSERT INTO public.user_blocks (blocker_id, blocked_id)
VALUES ('f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000003');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $blocked_category_creator$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.list_my_shadow_pin_connection_feed(30, NULL, NULL)
    WHERE image_id = 'f3200000-0000-4000-8000-000000000007'
  ) THEN
    RAISE EXCEPTION 'Pin in a blocked creator category leaked into the feed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.get_my_shadow_pin_connection_feed_window(
      'f3200000-0000-4000-8000-000000000007'
    )
  ) THEN
    RAISE EXCEPTION 'Pin in a blocked creator category leaked into the Theater window';
  END IF;
END
$blocked_category_creator$;

RESET ROLE;
DELETE FROM public.user_blocks
WHERE blocker_id = 'f3000000-0000-4000-8000-000000000001'
  AND blocked_id = 'f3000000-0000-4000-8000-000000000003';

INSERT INTO public.user_blocks (blocker_id, blocked_id)
VALUES ('f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002');
DELETE FROM public.user_blocks
WHERE blocker_id = 'f3000000-0000-4000-8000-000000000001'
  AND blocked_id = 'f3000000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $unblock_no_restore$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_my_shadow_pin_connection_feed(30, NULL, NULL)) THEN
    RAISE EXCEPTION 'unblock restored a removed Connection feed';
  END IF;
END
$unblock_no_restore$;

RESET ROLE;
ROLLBACK;
