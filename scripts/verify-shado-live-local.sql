BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'live-host@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"live_host","display_name":"Live Host"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'live-one@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"live_one","display_name":"Live One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'live-two@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"live_two","display_name":"Live Two"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'live-three@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"live_three","display_name":"Live Three"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'live-four@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"live_four","display_name":"Live Four"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'live-outsider@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"live_outsider","display_name":"Live Outsider"}', now(), now());

INSERT INTO public.user_roles (user_id, role)
VALUES ('a1000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.user_connections (
  member_low_id, member_high_id, requested_by, status, accepted_at
)
SELECT
  'a1000000-0000-4000-8000-000000000001'::uuid,
  connected_user_id,
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'accepted',
  now()
FROM unnest(ARRAY[
  'a1000000-0000-4000-8000-000000000002'::uuid,
  'a1000000-0000-4000-8000-000000000003'::uuid,
  'a1000000-0000-4000-8000-000000000004'::uuid,
  'a1000000-0000-4000-8000-000000000005'::uuid,
  'a1000000-0000-4000-8000-000000000006'::uuid
]) connected_user_id;

DO $security_contract$
BEGIN
  IF NOT (SELECT enabled AND access_mode = 'allowlist'
          FROM public.shado_live_system_state WHERE singleton) THEN
    RAISE EXCEPTION 'Shado Live combined migrations were not isolated in allowlist mode';
  END IF;
  IF has_table_privilege('authenticated', 'public.live_rooms', 'select')
    OR has_table_privilege('authenticated', 'public.shado_live_access_members', 'select')
    OR has_table_privilege('authenticated', 'public.live_room_events', 'select')
    OR has_table_privilege('authenticated', 'public.live_provider_operations', 'select')
    OR NOT has_table_privilege('authenticated', 'public.live_room_signals', 'select') THEN
    RAISE EXCEPTION 'Shado Live browser table boundary mismatch';
  END IF;
  IF has_function_privilege(
      'authenticated',
      'public.shado_live_prepare_session(uuid,text,uuid,uuid,jsonb)',
      'execute'
    )
    OR has_function_privilege(
      'anon', 'public.get_my_shado_live_room(uuid)', 'execute'
    )
    OR NOT has_function_privilege(
      'authenticated', 'public.get_my_shado_live_room(uuid)', 'execute'
    ) THEN
    RAISE EXCEPTION 'Shado Live RPC grant boundary mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables publication_tables
    WHERE publication_tables.pubname = 'supabase_realtime'
      AND publication_tables.schemaname = 'public'
      AND publication_tables.tablename = 'live_room_signals'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables publication_tables
    WHERE publication_tables.pubname = 'supabase_realtime'
      AND publication_tables.schemaname = 'public'
      AND publication_tables.tablename = 'live_room_events'
  ) THEN
    RAISE EXCEPTION 'Shado Live Realtime publication boundary mismatch';
  END IF;
END
$security_contract$;

SET LOCAL ROLE service_role;
DO $create_room$
DECLARE
  result jsonb;
  room_id uuid;
  allowlisted_user uuid;
BEGIN
  result := public.shado_live_set_access_mode(
    'a1000000-0000-4000-8000-000000000001', 'allowlist', 'local beta verification'
  );
  IF result ->> 'accessMode' <> 'allowlist' OR result ->> 'enabled' <> 'true' THEN
    RAISE EXCEPTION 'allowlist mode receipt mismatch: %', result;
  END IF;
  FOREACH allowlisted_user IN ARRAY ARRAY[
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'a1000000-0000-4000-8000-000000000002'::uuid,
    'a1000000-0000-4000-8000-000000000003'::uuid,
    'a1000000-0000-4000-8000-000000000004'::uuid,
    'a1000000-0000-4000-8000-000000000005'::uuid
  ] LOOP
    PERFORM public.shado_live_set_access_member(
      'a1000000-0000-4000-8000-000000000001', allowlisted_user,
      true, now() + interval '1 day', 'local beta verification'
    );
  END LOOP;
  result := public.shado_live_prepare_session(
    'a1000000-0000-4000-8000-000000000001',
    'create', NULL,
    'b1000000-0000-4000-8000-000000000001',
    '{"title":"Local Audio Room","description":"Contract proof"}'::jsonb
  );
  room_id := (result ->> 'room_id')::uuid;
  IF result ->> 'provider_operation' <> 'create_room'
    OR result ->> 'room_state' <> 'green_room'
    OR result ->> 'participant_user_id' <> 'a1000000-0000-4000-8000-000000000001'
    OR result ->> 'participant_role' <> 'host'
    OR (result ->> 'provider_can_publish')::boolean IS NOT TRUE
    OR result ->> 'provider_room_name' <> 'shado-live-' || room_id::text
    OR result -> 'response' ->> 'title' <> 'Local Audio Room' THEN
    RAISE EXCEPTION 'create receipt mismatch: %', result;
  END IF;
  PERFORM set_config('shado_live.room_id', room_id::text, true);
  PERFORM set_config('shado_live.create_operation_id', result ->> 'operation_id', true);
  PERFORM public.shado_live_complete_provider_operation(
    (result ->> 'operation_id')::uuid, 'succeeded', '{"provider":"local"}', NULL, NULL
  );
END
$create_room$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
DO $green_room_resume$
DECLARE
  listed_count integer;
BEGIN
  SELECT count(*) INTO listed_count
  FROM public.list_my_shado_live_rooms(30) rooms
  WHERE rooms.room_id = current_setting('shado_live.room_id')::uuid
    AND rooms.status = 'green_room';
  IF listed_count <> 1 THEN
    RAISE EXCEPTION 'host green room disappeared from the lobby summary';
  END IF;
END
$green_room_resume$;
RESET ROLE;
SET LOCAL ROLE service_role;

DO $start_room$
DECLARE
  result jsonb;
BEGIN
  result := public.shado_live_prepare_command(
    'a1000000-0000-4000-8000-000000000001', 'start',
    current_setting('shado_live.room_id')::uuid, NULL, 1,
    'b1000000-0000-4000-8000-000000000002', '{}'::jsonb
  );
  IF result ->> 'provider_operation' <> 'none'
    OR result ->> 'operation_id' IS NOT NULL
    OR result ->> 'room_state' <> 'live'
    OR (result ->> 'room_version')::integer <> 2 THEN
    RAISE EXCEPTION 'start receipt mismatch: %', result;
  END IF;
END
$start_room$;

DO $join_members$
DECLARE
  target_user uuid;
  idempotency_key uuid;
  result jsonb;
  position integer := 0;
BEGIN
  FOREACH target_user IN ARRAY ARRAY[
    'a1000000-0000-4000-8000-000000000002'::uuid,
    'a1000000-0000-4000-8000-000000000003'::uuid,
    'a1000000-0000-4000-8000-000000000004'::uuid,
    'a1000000-0000-4000-8000-000000000005'::uuid
  ] LOOP
    position := position + 1;
    idempotency_key := ('b1000000-0000-4000-8000-' || lpad((10 + position)::text, 12, '0'))::uuid;
    result := public.shado_live_prepare_session(
      target_user, 'join', current_setting('shado_live.room_id')::uuid,
      idempotency_key, '{}'::jsonb
    );
    IF result ->> 'provider_operation' <> 'none'
      OR result ->> 'participant_user_id' <> target_user::text
      OR result ->> 'participant_role' <> 'listener'
      OR (result ->> 'provider_can_publish')::boolean IS NOT FALSE THEN
      RAISE EXCEPTION 'join receipt mismatch: %', result;
    END IF;
  END LOOP;
END
$join_members$;

DO $promote_three$
DECLARE
  target_user uuid;
  result jsonb;
  expected_version integer := 2;
  position integer := 0;
BEGIN
  FOREACH target_user IN ARRAY ARRAY[
    'a1000000-0000-4000-8000-000000000002'::uuid,
    'a1000000-0000-4000-8000-000000000003'::uuid,
    'a1000000-0000-4000-8000-000000000004'::uuid
  ] LOOP
    position := position + 1;
    result := public.shado_live_prepare_command(
      'a1000000-0000-4000-8000-000000000001', 'promote',
      current_setting('shado_live.room_id')::uuid, target_user, expected_version,
      ('b1000000-0000-4000-8000-' || lpad((20 + position)::text, 12, '0'))::uuid,
      '{}'::jsonb
    );
    expected_version := expected_version + 1;
    IF result ->> 'provider_operation' <> 'update_participant'
      OR result ->> 'target_user_id' <> target_user::text
      OR result ->> 'target_role' <> 'speaker'
      OR (result ->> 'token_version')::integer <> 2
      OR (result ->> 'provider_can_publish')::boolean IS NOT TRUE
      OR (result ->> 'room_version')::integer <> expected_version THEN
      RAISE EXCEPTION 'promote receipt mismatch: %', result;
    END IF;
  END LOOP;

  BEGIN
    PERFORM public.shado_live_prepare_command(
      'a1000000-0000-4000-8000-000000000001', 'promote',
      current_setting('shado_live.room_id')::uuid,
      'a1000000-0000-4000-8000-000000000005', expected_version,
      'b1000000-0000-4000-8000-000000000030', '{}'::jsonb
    );
    RAISE EXCEPTION 'fourth additional speaker was accepted';
  EXCEPTION WHEN sqlstate '54000' THEN
    NULL;
  END;
END
$promote_three$;

DO $claim_operations$
DECLARE
  claimed_count integer;
BEGIN
  SELECT count(*) INTO claimed_count
  FROM public.shado_live_claim_provider_operations(
    'a1000000-0000-4000-8000-000000000001', 10
  ) claimed
  WHERE claimed.provider_operation = 'update_participant'
    AND claimed.target_role = 'speaker'
    AND claimed.token_version = 2
    AND claimed.provider_can_publish;
  IF claimed_count <> 3 THEN
    RAISE EXCEPTION 'provider operation claim mismatch: %', claimed_count;
  END IF;
END
$claim_operations$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);
DO $listener_actions$
DECLARE
  room_snapshot jsonb;
  message_receipt jsonb;
BEGIN
  PERFORM public.mutate_my_shado_live_stage_request(
    current_setting('shado_live.room_id')::uuid,
    'raise_hand',
    'b1000000-0000-4000-8000-000000000040'
  );
  message_receipt := public.send_my_shado_live_message(
    current_setting('shado_live.room_id')::uuid,
    'Local live message',
    'b1000000-0000-4000-8000-000000000041'
  );
  room_snapshot := public.get_my_shado_live_room(
    current_setting('shado_live.room_id')::uuid
  );
  IF room_snapshot ->> 'callerRole' <> 'listener'
    OR room_snapshot ->> 'handRaised' <> 'true'
    OR jsonb_array_length(room_snapshot -> 'participants') <> 5
    OR jsonb_array_length(room_snapshot -> 'stageRequests') <> 1
    OR jsonb_array_length(room_snapshot -> 'messages') <> 1
    OR message_receipt ->> 'body' <> 'Local live message' THEN
    RAISE EXCEPTION 'listener snapshot/action mismatch: %, %', room_snapshot, message_receipt;
  END IF;
END
$listener_actions$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
DO $host_snapshot$
DECLARE
  room_snapshot jsonb;
BEGIN
  room_snapshot := public.get_my_shado_live_room(
    current_setting('shado_live.room_id')::uuid
  );
  IF jsonb_array_length(room_snapshot -> 'stageRequests') <> 1
    OR room_snapshot #>> '{stageRequests,0,user,id}' <> 'a1000000-0000-4000-8000-000000000005'
    OR NOT EXISTS (
      SELECT 1 FROM public.live_room_signals signals
      WHERE signals.room_id = current_setting('shado_live.room_id')::uuid
        AND signals.sequence > 1
    ) THEN
    RAISE EXCEPTION 'host control/realtime snapshot mismatch: %', room_snapshot;
  END IF;
END
$host_snapshot$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
DO $outsider_isolation$
BEGIN
  IF public.get_my_shado_live_room(current_setting('shado_live.room_id')::uuid) IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.live_room_signals) THEN
    RAISE EXCEPTION 'non-connection observed private Shado Live state';
  END IF;
END
$outsider_isolation$;
RESET ROLE;

INSERT INTO public.user_blocks (blocker_id, blocked_id)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000005'
);

DO $block_teardown$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.live_room_participants participants
    WHERE participants.room_id = current_setting('shado_live.room_id')::uuid
      AND participants.user_id = 'a1000000-0000-4000-8000-000000000005'
      AND participants.status = 'removed'
      AND participants.removal_reason = 'personal_block'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.live_provider_operations operations
    WHERE operations.room_id = current_setting('shado_live.room_id')::uuid
      AND operations.target_user_id = 'a1000000-0000-4000-8000-000000000005'
      AND operations.operation_type = 'remove_participant'
      AND operations.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'personal-block live teardown failed';
  END IF;
END
$block_teardown$;

ROLLBACK;
