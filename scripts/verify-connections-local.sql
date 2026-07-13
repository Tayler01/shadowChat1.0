BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'connections-a@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"connections_a","display_name":"Connections A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'connections-b@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"connections_b","display_name":"Connections B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'connections-c@local.test', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"connections_c","display_name":"Connections C"}', now(), now());

-- Populate deliberately private legacy fields so projection assertions prove
-- they are excluded rather than merely null.
UPDATE public.users profiles
SET
  email = 'private-' || profiles.username || '@local.test',
  full_name = 'Private ' || profiles.display_name
WHERE profiles.id IN (
  'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000002',
  'c0000000-0000-4000-8000-000000000003'
);

UPDATE public.notification_preferences preferences
SET connection_notifications_enabled = false
WHERE preferences.user_id = 'c0000000-0000-4000-8000-000000000002';

-- Browser roles have no pair-table mutation/read surface. PUBLIC and anon do
-- not inherit an RPC surface, and the private predicate remains server-only.
DO $contract$
BEGIN
  IF has_table_privilege('authenticated', 'public.user_connections', 'select')
    OR has_table_privilege('authenticated', 'public.user_connections', 'insert')
    OR has_table_privilege('authenticated', 'public.user_connections', 'update')
    OR has_table_privilege('authenticated', 'public.user_connections', 'delete')
    OR has_table_privilege('anon', 'public.user_connections', 'select')
    OR has_table_privilege('anon', 'public.user_connections', 'insert')
    OR has_table_privilege('anon', 'public.user_connections', 'update')
    OR has_table_privilege('anon', 'public.user_connections', 'delete') THEN
    RAISE EXCEPTION 'browser role unexpectedly has direct user_connections privileges';
  END IF;

  IF has_function_privilege('anon', 'public.get_my_connection_state(uuid)', 'execute')
    OR has_function_privilege('anon', 'public.get_my_connection_summary()', 'execute')
    OR has_function_privilege(
      'anon',
      'public.list_my_connections(text,integer,timestamp with time zone,uuid)',
      'execute'
    )
    OR has_function_privilege('anon', 'public.mutate_connection(uuid,text)', 'execute') THEN
    RAISE EXCEPTION 'anon unexpectedly has a Connections RPC privilege';
  END IF;

  IF has_function_privilege(
      'authenticated', 'private.users_are_connected(uuid,uuid)', 'execute'
    )
    OR has_function_privilege('anon', 'private.users_are_connected(uuid,uuid)', 'execute') THEN
    RAISE EXCEPTION 'browser role unexpectedly has the private connection predicate';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc routines
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(
        routines.proacl,
        pg_catalog.acldefault('f', routines.proowner)
      )
    ) grants
    WHERE routines.oid IN (
      'public.get_my_connection_state(uuid)'::regprocedure,
      'public.get_my_connection_summary()'::regprocedure,
      'public.list_my_connections(text,integer,timestamp with time zone,uuid)'::regprocedure,
      'public.mutate_connection(uuid,text)'::regprocedure
    )
      AND grants.grantee = 0
      AND grants.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC unexpectedly has a Connections RPC privilege';
  END IF;
END
$contract$;

-- A requests B. B has foreground presentation disabled, so the recipient
-- request event must still exist with notify=false. The caller refresh event
-- is also notify=false by contract.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $request_ab$
DECLARE
  result jsonb;
  state jsonb;
BEGIN
  result := public.mutate_connection(
    'c0000000-0000-4000-8000-000000000002',
    'request'
  );
  state := public.get_my_connection_state(
    'c0000000-0000-4000-8000-000000000002'
  );

  IF result ->> 'changed' <> 'true'
    OR state ->> 'status' <> 'pending'
    OR state ->> 'direction' <> 'outgoing' THEN
    RAISE EXCEPTION 'initial outgoing request state mismatch: %, %', result, state;
  END IF;

  -- Exact idempotence: the same request changes no state and emits no new
  -- revision or notification.
  result := public.mutate_connection(
    'c0000000-0000-4000-8000-000000000002',
    'request'
  );
  IF result ->> 'changed' <> 'false' OR (result ->> 'revision')::integer <> 1 THEN
    RAISE EXCEPTION 'repeat request was not idempotent: %', result;
  END IF;
END
$request_ab$;
RESET ROLE;

DO $pending_ab_proof$
DECLARE
  pair_id uuid;
  event_count integer;
  distinct_dedupe_count integer;
BEGIN
  SELECT connections.id
  INTO STRICT pair_id
  FROM public.user_connections connections
  WHERE connections.member_low_id = 'c0000000-0000-4000-8000-000000000001'
    AND connections.member_high_id = 'c0000000-0000-4000-8000-000000000002';

  IF private.users_are_connected(
    'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'pending pair qualified as connected';
  END IF;

  SELECT count(*), count(DISTINCT events.dedupe_key)
  INTO event_count, distinct_dedupe_count
  FROM public.notification_events events
  WHERE events.entity_id = pair_id;

  IF event_count <> 2 OR distinct_dedupe_count <> 2 THEN
    RAISE EXCEPTION 'request notification/dedupe count mismatch: %, %',
      event_count, distinct_dedupe_count;
  END IF;

  IF (SELECT count(*) FROM public.notification_events events
      WHERE events.entity_id = pair_id
        AND events.type = 'connection_request'
        AND events.user_id = 'c0000000-0000-4000-8000-000000000002'
        AND events.payload #>> '{actor,id}' = 'c0000000-0000-4000-8000-000000000001'
        AND events.payload ->> 'revision' = '1'
        AND events.payload ->> 'notify' = 'false') <> 1 THEN
    RAISE EXCEPTION 'exact B request notification payload mismatch';
  END IF;

  IF (SELECT count(*) FROM public.notification_events events
      WHERE events.entity_id = pair_id
        AND events.type = 'connection_changed'
        AND events.user_id = 'c0000000-0000-4000-8000-000000000001'
        AND events.payload #>> '{actor,id}' = 'c0000000-0000-4000-8000-000000000002'
        AND events.payload ->> 'revision' = '1'
        AND events.payload ->> 'notify' = 'false') <> 1 THEN
    RAISE EXCEPTION 'exact A actor-refresh notification payload mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_events events
    WHERE events.entity_id = pair_id
      AND (
        jsonb_typeof(events.payload -> 'actor') <> 'object'
        OR events.payload -> 'actor' ?| ARRAY[
          'email', 'full_name', 'encrypted_password', 'raw_app_meta_data',
          'raw_user_meta_data', 'connection_notifications_enabled',
          'quiet_hours_start', 'quiet_hours_end', 'quiet_hours_timezone'
        ]
      )
  ) THEN
    RAISE EXCEPTION 'request event leaked a private actor field';
  END IF;
END
$pending_ab_proof$;

-- C is an authenticated third party. Caller-scoped state, summary, list, and
-- recipient-owned event RLS reveal nothing about the A/B pair.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

DO $third_party$
DECLARE
  state jsonb;
  summary jsonb;
  listed_count integer;
  event_count integer;
BEGIN
  state := public.get_my_connection_state(
    'c0000000-0000-4000-8000-000000000001'
  );
  summary := public.get_my_connection_summary();
  SELECT count(*) INTO listed_count
  FROM public.list_my_connections('all', 50, NULL, NULL);
  SELECT count(*) INTO event_count FROM public.notification_events;

  IF state ->> 'status' <> 'none'
    OR (summary ->> 'connections')::integer <> 0
    OR (summary ->> 'incoming')::integer <> 0
    OR (summary ->> 'outgoing')::integer <> 0
    OR listed_count <> 0
    OR event_count <> 0 THEN
    RAISE EXCEPTION 'third-party Connections isolation failed: %, %, %, %',
      state, summary, listed_count, event_count;
  END IF;
END
$third_party$;
RESET ROLE;

-- B's crossing request atomically accepts A/B. Repeating it is idempotent.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

DO $crossing_ab$
DECLARE
  summary jsonb;
  result jsonb;
  state jsonb;
BEGIN
  summary := public.get_my_connection_summary();
  IF (summary ->> 'incoming')::integer <> 1 THEN
    RAISE EXCEPTION 'B incoming summary mismatch before crossing request: %', summary;
  END IF;

  result := public.mutate_connection(
    'c0000000-0000-4000-8000-000000000001',
    'request'
  );
  state := public.get_my_connection_state(
    'c0000000-0000-4000-8000-000000000001'
  );
  IF result ->> 'changed' <> 'true'
    OR state ->> 'status' <> 'accepted'
    OR state ->> 'direction' <> 'connected'
    OR (state ->> 'revision')::integer <> 2 THEN
    RAISE EXCEPTION 'crossing request did not converge on acceptance: %, %', result, state;
  END IF;

  result := public.mutate_connection(
    'c0000000-0000-4000-8000-000000000001',
    'request'
  );
  IF result ->> 'changed' <> 'false' OR (result ->> 'revision')::integer <> 2 THEN
    RAISE EXCEPTION 'repeat accepted request was not idempotent: %', result;
  END IF;
END
$crossing_ab$;
RESET ROLE;

DO $accepted_ab_proof$
DECLARE
  pair_id uuid;
  event_count integer;
  distinct_dedupe_count integer;
BEGIN
  SELECT connections.id
  INTO STRICT pair_id
  FROM public.user_connections connections
  WHERE connections.member_low_id = 'c0000000-0000-4000-8000-000000000001'
    AND connections.member_high_id = 'c0000000-0000-4000-8000-000000000002';

  IF NOT private.users_are_connected(
    'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'accepted unblocked A/B pair did not qualify as connected';
  END IF;

  SELECT count(*), count(DISTINCT events.dedupe_key)
  INTO event_count, distinct_dedupe_count
  FROM public.notification_events events
  WHERE events.entity_id = pair_id;

  IF event_count <> 4 OR distinct_dedupe_count <> 4 THEN
    RAISE EXCEPTION 'accepted A/B event/dedupe count mismatch: %, %',
      event_count, distinct_dedupe_count;
  END IF;

  IF (SELECT count(*) FROM public.notification_events events
      WHERE events.entity_id = pair_id AND events.type = 'connection_request') <> 1
    OR (SELECT count(*) FROM public.notification_events events
        WHERE events.entity_id = pair_id AND events.type = 'connection_accepted') <> 1
    OR (SELECT count(*) FROM public.notification_events events
        WHERE events.entity_id = pair_id AND events.type = 'connection_changed') <> 2
    OR (SELECT count(*) FROM public.notification_events events
        WHERE events.entity_id = pair_id
          AND events.payload #>> '{actor,id}' = 'c0000000-0000-4000-8000-000000000001') <> 2
    OR (SELECT count(*) FROM public.notification_events events
        WHERE events.entity_id = pair_id
          AND events.payload #>> '{actor,id}' = 'c0000000-0000-4000-8000-000000000002') <> 2
    OR (SELECT count(*) FROM public.notification_events events
        WHERE events.entity_id = pair_id
          AND events.payload ->> 'notify' = 'false') <> 3
    OR (SELECT count(*) FROM public.notification_events events
        WHERE events.entity_id = pair_id
          AND events.payload ->> 'notify' = 'true') <> 1 THEN
    RAISE EXCEPTION 'accepted A/B exact type, actor, or notify counts mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_events events
    WHERE events.entity_id = pair_id
      AND events.payload -> 'actor' ?| ARRAY[
        'email', 'full_name', 'encrypted_password', 'raw_app_meta_data',
        'raw_user_meta_data', 'connection_notifications_enabled',
        'quiet_hours_start', 'quiet_hours_end', 'quiet_hours_timezone'
      ]
  ) THEN
    RAISE EXCEPTION 'accepted A/B event leaked a private actor field';
  END IF;
END
$accepted_ab_proof$;

-- Build A/C through the explicit accept path and prove requester authority.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT public.mutate_connection('c0000000-0000-4000-8000-000000000003', 'request');

DO $self_accept_denial$
BEGIN
  BEGIN
    PERFORM public.mutate_connection(
      'c0000000-0000-4000-8000-000000000003',
      'accept'
    );
    RAISE EXCEPTION 'requester accepted its own request';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END
$self_accept_denial$;
RESET ROLE;

DO $pending_ac_proof$
BEGIN
  IF private.users_are_connected(
    'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'pending A/C pair qualified as connected';
  END IF;
END
$pending_ac_proof$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT public.mutate_connection('c0000000-0000-4000-8000-000000000001', 'accept');
RESET ROLE;

DO $accepted_ac_proof$
DECLARE
  pair_id uuid;
BEGIN
  SELECT connections.id
  INTO STRICT pair_id
  FROM public.user_connections connections
  WHERE connections.member_low_id = 'c0000000-0000-4000-8000-000000000001'
    AND connections.member_high_id = 'c0000000-0000-4000-8000-000000000003';

  IF NOT private.users_are_connected(
    'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'accepted unblocked A/C pair did not qualify as connected';
  END IF;

  IF (SELECT count(*) FROM public.notification_events events
      WHERE events.entity_id = pair_id) <> 4
    OR (SELECT count(DISTINCT events.dedupe_key)
        FROM public.notification_events events
        WHERE events.entity_id = pair_id) <> 4 THEN
    RAISE EXCEPTION 'A/C exact notification or dedupe count mismatch';
  END IF;
END
$accepted_ac_proof$;

-- Force deterministic timestamps, then prove descending (updated_at, id)
-- keyset pages and safe profile projection.
UPDATE public.user_connections connections
SET updated_at = CASE connections.member_high_id
  WHEN 'c0000000-0000-4000-8000-000000000002'::uuid
    THEN '2026-07-13 12:00:00+00'::timestamptz
  WHEN 'c0000000-0000-4000-8000-000000000003'::uuid
    THEN '2026-07-13 11:00:00+00'::timestamptz
  ELSE connections.updated_at
END
WHERE connections.member_low_id = 'c0000000-0000-4000-8000-000000000001'
  AND connections.member_high_id IN (
    'c0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000003'
  );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $keyset$
DECLARE
  first_page record;
  second_page record;
  accepted_count integer;
  trailing_count integer;
BEGIN
  SELECT count(*) INTO accepted_count
  FROM public.list_my_connections('accepted', 50, NULL, NULL);
  IF accepted_count <> 2 THEN
    RAISE EXCEPTION 'accepted list count mismatch before keyset proof: %', accepted_count;
  END IF;

  SELECT * INTO STRICT first_page
  FROM public.list_my_connections('accepted', 1, NULL, NULL);

  IF first_page.other_user ->> 'id' <> 'c0000000-0000-4000-8000-000000000002'
    OR first_page.status <> 'accepted'
    OR first_page.direction <> 'connected' THEN
    RAISE EXCEPTION 'first accepted keyset page mismatch: %', row_to_json(first_page);
  END IF;

  SELECT * INTO STRICT second_page
  FROM public.list_my_connections(
    'accepted',
    1,
    first_page.updated_at,
    first_page.connection_id
  );

  IF second_page.other_user ->> 'id' <> 'c0000000-0000-4000-8000-000000000003'
    OR (second_page.updated_at, second_page.connection_id)
      >= (first_page.updated_at, first_page.connection_id) THEN
    RAISE EXCEPTION 'second accepted keyset page mismatch: %', row_to_json(second_page);
  END IF;

  SELECT count(*) INTO trailing_count
  FROM public.list_my_connections(
    'accepted',
    1,
    second_page.updated_at,
    second_page.connection_id
  );
  IF trailing_count <> 0 THEN
    RAISE EXCEPTION 'accepted keyset cursor repeated or skipped terminal state';
  END IF;

  IF first_page.other_user ?| ARRAY[
      'email', 'full_name', 'encrypted_password', 'raw_app_meta_data',
      'raw_user_meta_data', 'connection_notifications_enabled',
      'quiet_hours_start', 'quiet_hours_end', 'quiet_hours_timezone'
    ]
    OR second_page.other_user ?| ARRAY[
      'email', 'full_name', 'encrypted_password', 'raw_app_meta_data',
      'raw_user_meta_data', 'connection_notifications_enabled',
      'quiet_hours_start', 'quiet_hours_end', 'quiet_hours_timezone'
    ] THEN
    RAISE EXCEPTION 'accepted list leaked a private profile field';
  END IF;
END
$keyset$;

-- Inactive never qualifies as connected and the pair cooldown remains active.
DO $remove_ab$
DECLARE
  result jsonb;
BEGIN
  result := public.mutate_connection(
    'c0000000-0000-4000-8000-000000000002',
    'remove'
  );
  IF result ->> 'status' <> 'inactive' OR result ->> 'changed' <> 'true' THEN
    RAISE EXCEPTION 'accepted A/B removal mismatch: %', result;
  END IF;

  BEGIN
    PERFORM public.mutate_connection(
      'c0000000-0000-4000-8000-000000000002',
      'request'
    );
    RAISE EXCEPTION 'inactive A/B pair bypassed cooldown';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END
$remove_ab$;
RESET ROLE;

DO $inactive_ab_proof$
BEGIN
  IF private.users_are_connected(
    'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'inactive A/B pair qualified as connected';
  END IF;
END
$inactive_ab_proof$;

-- Blocking hard-deletes A/C and suppresses its unread events. Unblocking must
-- remove only the block row; it cannot restore the canonical pair.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT public.block_user('c0000000-0000-4000-8000-000000000003');
RESET ROLE;

DO $blocked_ac_proof$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_connections connections
    WHERE connections.member_low_id = 'c0000000-0000-4000-8000-000000000001'
      AND connections.member_high_id = 'c0000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'personal block did not hard-delete A/C';
  END IF;

  IF private.users_are_connected(
    'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'blocked A/C pair qualified as connected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_events events
    WHERE events.user_id IN (
      'c0000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000003'
    )
      AND events.type IN (
        'connection_request', 'connection_accepted', 'connection_changed'
      )
      AND (
        (events.user_id = 'c0000000-0000-4000-8000-000000000001'
          AND events.payload #>> '{actor,id}' = 'c0000000-0000-4000-8000-000000000003')
        OR
        (events.user_id = 'c0000000-0000-4000-8000-000000000003'
          AND events.payload #>> '{actor,id}' = 'c0000000-0000-4000-8000-000000000001')
      )
      AND events.read_at IS NULL
  ) THEN
    RAISE EXCEPTION 'personal block left an unread A/C connection event';
  END IF;
END
$blocked_ac_proof$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT public.unblock_user('c0000000-0000-4000-8000-000000000003');

DO $unblocked_caller_view$
DECLARE
  state jsonb;
  accepted_count integer;
BEGIN
  state := public.get_my_connection_state(
    'c0000000-0000-4000-8000-000000000003'
  );
  SELECT count(*) INTO accepted_count
  FROM public.list_my_connections('accepted', 50, NULL, NULL);

  IF state ->> 'status' <> 'none' OR accepted_count <> 0 THEN
    RAISE EXCEPTION 'unblock restored a caller-visible relationship: %, %',
      state, accepted_count;
  END IF;
END
$unblocked_caller_view$;
RESET ROLE;

DO $unblocked_ac_proof$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_connections connections
    WHERE connections.member_low_id = 'c0000000-0000-4000-8000-000000000001'
      AND connections.member_high_id = 'c0000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'unblock restored the A/C canonical pair';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_blocks blocks
    WHERE blocks.blocker_id = 'c0000000-0000-4000-8000-000000000001'
      AND blocks.blocked_id = 'c0000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'unblock left the A/C block row';
  END IF;

  IF private.users_are_connected(
    'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'unblocked deleted A/C pair qualified as connected';
  END IF;
END
$unblocked_ac_proof$;

SELECT 'Connections local contract verification passed.' AS verification_result;

ROLLBACK;
