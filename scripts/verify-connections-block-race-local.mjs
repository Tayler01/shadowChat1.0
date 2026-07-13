import { spawn, spawnSync } from 'node:child_process'

const DATABASE_CONTAINER = 'supabase_db_chat2-0'
const USER_A = 'c1000000-0000-4000-8000-000000000001'
const USER_B = 'c1000000-0000-4000-8000-000000000002'
const BLOCK_USER_IDS_SQL = `'${USER_A}'::uuid, '${USER_B}'::uuid`
const CAP_TARGET_A = 'c2000000-0000-4000-8000-000000000050'
const CAP_TARGET_B = 'c2000000-0000-4000-8000-000000000051'
const FIXTURE_USER_IDS_SQL = `
  SELECT '${USER_A}'::uuid
  UNION ALL SELECT '${USER_B}'::uuid
  UNION ALL
  SELECT format(
    'c2000000-0000-4000-8000-%s',
    lpad(target_number::text, 12, '0')
  )::uuid
  FROM generate_series(1, 51) AS targets(target_number)
`
const SESSION_TIMEOUT_MS = 15_000

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function runSql(sql) {
  const result = spawnSync('docker', [
    'exec', DATABASE_CONTAINER,
    'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-c', sql,
  ], {
    encoding: 'utf8',
    windowsHide: true,
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Local SQL command failed:\n${result.stderr || result.stdout}`)
  }

  return result.stdout.trim()
}

class PsqlSession {
  constructor(name) {
    this.name = name
    this.stdout = ''
    this.stderr = ''
    this.exitCode = null
    this.process = spawn('docker', [
      'exec', '-i', DATABASE_CONTAINER,
      'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres',
    ], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.process.stdout.setEncoding('utf8')
    this.process.stderr.setEncoding('utf8')
    this.process.stdout.on('data', chunk => { this.stdout += chunk })
    this.process.stderr.on('data', chunk => { this.stderr += chunk })
    this.done = new Promise((resolve, reject) => {
      this.process.once('error', reject)
      this.process.once('close', code => {
        this.exitCode = code
        resolve(code)
      })
    })
  }

  send(sql) {
    if (this.exitCode !== null || this.process.stdin.destroyed) {
      throw new Error(`${this.name} exited before SQL could be sent`)
    }
    this.process.stdin.write(sql.endsWith('\n') ? sql : `${sql}\n`)
  }

  async waitFor(marker, timeoutMs = SESSION_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.stdout.includes(marker)) return
      if (this.exitCode !== null) {
        throw new Error(
          `${this.name} exited with ${this.exitCode} before ${marker}\n`
          + `stdout:\n${this.stdout}\nstderr:\n${this.stderr}`,
        )
      }
      await delay(20)
    }
    throw new Error(
      `${this.name} timed out waiting for ${marker}\n`
      + `stdout:\n${this.stdout}\nstderr:\n${this.stderr}`,
    )
  }

  async expectCleanExit() {
    const code = await Promise.race([
      this.done,
      delay(SESSION_TIMEOUT_MS).then(() => {
        throw new Error(`${this.name} did not exit within ${SESSION_TIMEOUT_MS}ms`)
      }),
    ])
    if (code !== 0) {
      throw new Error(
        `${this.name} exited with ${code}\nstdout:\n${this.stdout}\nstderr:\n${this.stderr}`,
      )
    }
  }

  async dispose() {
    if (this.exitCode !== null) return
    try {
      this.process.stdin.write('ROLLBACK;\n\\q\n')
      this.process.stdin.end()
      await Promise.race([this.done, delay(2_000)])
    } finally {
      if (this.exitCode === null) this.process.kill()
    }
  }
}

function authenticatedTransactionPrelude(applicationName, userId) {
  return `
BEGIN;
SET application_name = '${applicationName}';
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"${userId}","role":"authenticated"}',
  true
);
`
}

async function waitForAdvisoryWait(applicationName) {
  const deadline = Date.now() + SESSION_TIMEOUT_MS
  while (Date.now() < deadline) {
    const waitState = runSql(`
      SELECT coalesce(wait_event_type || ':' || wait_event, '')
      FROM pg_catalog.pg_stat_activity
      WHERE application_name = '${applicationName}'
        AND state = 'active';
    `)
    if (waitState === 'Lock:advisory') return
    await delay(40)
  }
  throw new Error(`${applicationName} never reached the shared advisory-lock barrier`)
}

function cleanFixture() {
  runSql(`
    BEGIN;
    DELETE FROM public.notification_events events
    WHERE events.user_id IN (${FIXTURE_USER_IDS_SQL});
    DELETE FROM public.user_connections connections
    WHERE connections.member_low_id IN (${FIXTURE_USER_IDS_SQL})
       OR connections.member_high_id IN (${FIXTURE_USER_IDS_SQL});
    DELETE FROM public.user_blocks blocks
    WHERE blocks.blocker_id IN (${FIXTURE_USER_IDS_SQL})
       OR blocks.blocked_id IN (${FIXTURE_USER_IDS_SQL});
    DELETE FROM auth.users users WHERE users.id IN (${FIXTURE_USER_IDS_SQL});
    COMMIT;
  `)
}

function createFixture() {
  runSql(`
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    VALUES
      (
        '00000000-0000-0000-0000-000000000000', '${USER_A}',
        'authenticated', 'authenticated', 'connections-race-a@local.test', '', now(),
        '{"provider":"email","providers":["email"]}',
        '{"username":"connections_race_a","display_name":"Connections Race A"}',
        now(), now()
      ),
      (
        '00000000-0000-0000-0000-000000000000', '${USER_B}',
        'authenticated', 'authenticated', 'connections-race-b@local.test', '', now(),
        '{"provider":"email","providers":["email"]}',
        '{"username":"connections_race_b","display_name":"Connections Race B"}',
        now(), now()
      );

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    SELECT
      '00000000-0000-0000-0000-000000000000'::uuid,
      format(
        'c2000000-0000-4000-8000-%s',
        lpad(target_number::text, 12, '0')
      )::uuid,
      'authenticated',
      'authenticated',
      format('connections-cap-%s@local.test', target_number),
      '',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'username', format('connections_cap_%s', target_number),
        'display_name', format('Connections Cap %s', target_number)
      ),
      now(),
      now()
    FROM generate_series(1, 51) AS targets(target_number);
  `)

  const count = Number(runSql(`
    SELECT count(*)
    FROM public.users users
    WHERE users.id IN (${FIXTURE_USER_IDS_SQL});
  `))
  if (count !== 53) throw new Error(`Fixture profile bootstrap produced ${count} users instead of 53`)
}

function resetPairState() {
  runSql(`
    BEGIN;
    DELETE FROM public.notification_events events
    WHERE events.user_id IN (${BLOCK_USER_IDS_SQL})
       OR events.payload #>> '{actor,id}' IN ('${USER_A}', '${USER_B}');
    DELETE FROM public.user_connections connections
    WHERE connections.member_low_id = least('${USER_A}'::uuid, '${USER_B}'::uuid)
      AND connections.member_high_id = greatest('${USER_A}'::uuid, '${USER_B}'::uuid);
    DELETE FROM public.user_blocks blocks
    WHERE (blocks.blocker_id = '${USER_A}' AND blocks.blocked_id = '${USER_B}')
       OR (blocks.blocker_id = '${USER_B}' AND blocks.blocked_id = '${USER_A}');
    COMMIT;
  `)
}

function unblockAndAssertNoResurrection(label) {
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SELECT set_config(
      'request.jwt.claims',
      '{"sub":"${USER_A}","role":"authenticated"}',
      true
    );
    SELECT public.unblock_user('${USER_B}');
    COMMIT;
  `)

  const state = JSON.parse(runSql(`
    SELECT json_build_object(
      'connections', (
        SELECT count(*) FROM public.user_connections connections
        WHERE connections.member_low_id = least('${USER_A}'::uuid, '${USER_B}'::uuid)
          AND connections.member_high_id = greatest('${USER_A}'::uuid, '${USER_B}'::uuid)
      ),
      'blocks', (
        SELECT count(*) FROM public.user_blocks blocks
        WHERE (blocks.blocker_id = '${USER_A}' AND blocks.blocked_id = '${USER_B}')
           OR (blocks.blocker_id = '${USER_B}' AND blocks.blocked_id = '${USER_A}')
      ),
      'unread_connection_events', (
        SELECT count(*) FROM public.notification_events events
        WHERE events.user_id IN (${BLOCK_USER_IDS_SQL})
          AND events.type IN ('connection_request', 'connection_accepted', 'connection_changed')
          AND events.read_at IS NULL
      )
    )::text;
  `))

  if (Number(state.connections) !== 0
    || Number(state.blocks) !== 0
    || Number(state.unread_connection_events) !== 0) {
    throw new Error(`${label} left unsafe state after unblock: ${JSON.stringify(state)}`)
  }
}

function assertCommittedBlockOwnsPair(label) {
  const state = JSON.parse(runSql(`
    SELECT json_build_object(
      'connections', (
        SELECT count(*) FROM public.user_connections connections
        WHERE connections.member_low_id = least('${USER_A}'::uuid, '${USER_B}'::uuid)
          AND connections.member_high_id = greatest('${USER_A}'::uuid, '${USER_B}'::uuid)
      ),
      'blocks', (
        SELECT count(*) FROM public.user_blocks blocks
        WHERE blocks.blocker_id = '${USER_A}' AND blocks.blocked_id = '${USER_B}'
      ),
      'unread_connection_events', (
        SELECT count(*) FROM public.notification_events events
        WHERE events.user_id IN (${BLOCK_USER_IDS_SQL})
          AND events.type IN ('connection_request', 'connection_accepted', 'connection_changed')
          AND events.read_at IS NULL
      )
    )::text;
  `))

  if (Number(state.connections) !== 0
    || Number(state.blocks) !== 1
    || Number(state.unread_connection_events) !== 0) {
    throw new Error(`${label} did not leave the committed block authoritative: ${JSON.stringify(state)}`)
  }
}

async function runRequestFirst() {
  const requestApplication = 'connections_race_request_first_request'
  const blockApplication = 'connections_race_request_first_block'
  const requestSession = new PsqlSession('request-first request session')
  const blockSession = new PsqlSession('request-first block session')

  try {
    requestSession.send(`${authenticatedTransactionPrelude(requestApplication, USER_A)}
SELECT public.mutate_connection('${USER_B}', 'request');
\\echo REQUEST_FIRST_REQUEST_HELD
`)
    await requestSession.waitFor('REQUEST_FIRST_REQUEST_HELD')

    blockSession.send(`${authenticatedTransactionPrelude(blockApplication, USER_A)}
SELECT public.block_user('${USER_B}');
\\echo REQUEST_FIRST_BLOCK_APPLIED
`)
    await waitForAdvisoryWait(blockApplication)

    requestSession.send(`COMMIT;
\\echo REQUEST_FIRST_REQUEST_COMMITTED
\\q
`)
    await requestSession.waitFor('REQUEST_FIRST_REQUEST_COMMITTED')
    await requestSession.expectCleanExit()

    await blockSession.waitFor('REQUEST_FIRST_BLOCK_APPLIED')
    blockSession.send(`COMMIT;
\\echo REQUEST_FIRST_BLOCK_COMMITTED
\\q
`)
    await blockSession.waitFor('REQUEST_FIRST_BLOCK_COMMITTED')
    await blockSession.expectCleanExit()
  } finally {
    await Promise.all([requestSession.dispose(), blockSession.dispose()])
  }

  assertCommittedBlockOwnsPair('request-first ordering')
  unblockAndAssertNoResurrection('request-first ordering')
}

async function runBlockFirst() {
  const blockApplication = 'connections_race_block_first_block'
  const requestApplication = 'connections_race_block_first_request'
  const blockSession = new PsqlSession('block-first block session')
  const requestSession = new PsqlSession('block-first request session')

  try {
    blockSession.send(`${authenticatedTransactionPrelude(blockApplication, USER_A)}
SELECT public.block_user('${USER_B}');
\\echo BLOCK_FIRST_BLOCK_HELD
`)
    await blockSession.waitFor('BLOCK_FIRST_BLOCK_HELD')

    requestSession.send(`${authenticatedTransactionPrelude(requestApplication, USER_B)}
DO $race$
BEGIN
  BEGIN
    PERFORM public.mutate_connection('${USER_A}', 'request');
    RAISE EXCEPTION 'request unexpectedly succeeded behind an uncommitted block';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END
$race$;
\\echo BLOCK_FIRST_REQUEST_DENIED
COMMIT;
\\q
`)
    await waitForAdvisoryWait(requestApplication)

    blockSession.send(`COMMIT;
\\echo BLOCK_FIRST_BLOCK_COMMITTED
\\q
`)
    await blockSession.waitFor('BLOCK_FIRST_BLOCK_COMMITTED')
    await blockSession.expectCleanExit()

    await requestSession.waitFor('BLOCK_FIRST_REQUEST_DENIED')
    await requestSession.expectCleanExit()
  } finally {
    await Promise.all([blockSession.dispose(), requestSession.dispose()])
  }

  assertCommittedBlockOwnsPair('block-first ordering')
  unblockAndAssertNoResurrection('block-first ordering')
}

function outgoingCount() {
  return Number(runSql(`
    SELECT count(*)
    FROM public.user_connections connections
    WHERE connections.requested_by = '${USER_A}'
      AND connections.status = 'pending';
  `))
}

function seedOutgoingCapacityFixture() {
  runSql(`
    INSERT INTO public.user_connections (
      member_low_id,
      member_high_id,
      requested_by,
      status
    )
    SELECT
      least('${USER_A}'::uuid, target_id),
      greatest('${USER_A}'::uuid, target_id),
      '${USER_A}'::uuid,
      'pending'
    FROM (
      SELECT format(
        'c2000000-0000-4000-8000-%s',
        lpad(target_number::text, 12, '0')
      )::uuid AS target_id
      FROM generate_series(1, 49) AS targets(target_number)
    ) fixture_targets;
  `)

  const seededCount = outgoingCount()
  if (seededCount !== 49) {
    throw new Error(`Outgoing-cap fixture produced ${seededCount} rows instead of 49`)
  }
}

async function runOutgoingCapacityRace() {
  const firstApplication = 'connections_race_outgoing_cap_first'
  const secondApplication = 'connections_race_outgoing_cap_second'
  const firstSession = new PsqlSession('outgoing-cap first request session')
  const secondSession = new PsqlSession('outgoing-cap second request session')

  try {
    firstSession.send(`${authenticatedTransactionPrelude(firstApplication, USER_A)}
SELECT public.mutate_connection('${CAP_TARGET_A}', 'request');
\\echo OUTGOING_CAP_FIRST_HELD
`)
    await firstSession.waitFor('OUTGOING_CAP_FIRST_HELD')

    secondSession.send(`${authenticatedTransactionPrelude(secondApplication, USER_A)}
DO $race$
BEGIN
  BEGIN
    PERFORM public.mutate_connection('${CAP_TARGET_B}', 'request');
    RAISE EXCEPTION 'both concurrent outgoing requests unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '54000' THEN
    NULL;
  END;
END
$race$;
\\echo OUTGOING_CAP_SECOND_DENIED
COMMIT;
\\q
`)
    await waitForAdvisoryWait(secondApplication)

    const countWhileContended = outgoingCount()
    if (countWhileContended !== 49) {
      throw new Error(
        `Outgoing count changed to ${countWhileContended} before the winning request committed`,
      )
    }

    firstSession.send(`COMMIT;
\\echo OUTGOING_CAP_FIRST_COMMITTED
\\q
`)
    await firstSession.waitFor('OUTGOING_CAP_FIRST_COMMITTED')
    await firstSession.expectCleanExit()

    await secondSession.waitFor('OUTGOING_CAP_SECOND_DENIED')
    await secondSession.expectCleanExit()
  } finally {
    await Promise.all([firstSession.dispose(), secondSession.dispose()])
  }

  const state = JSON.parse(runSql(`
    SELECT json_build_object(
      'outgoing', (
        SELECT count(*) FROM public.user_connections connections
        WHERE connections.requested_by = '${USER_A}'
          AND connections.status = 'pending'
      ),
      'race_target_a', (
        SELECT count(*) FROM public.user_connections connections
        WHERE connections.member_low_id = least('${USER_A}'::uuid, '${CAP_TARGET_A}'::uuid)
          AND connections.member_high_id = greatest('${USER_A}'::uuid, '${CAP_TARGET_A}'::uuid)
          AND connections.status = 'pending'
      ),
      'race_target_b', (
        SELECT count(*) FROM public.user_connections connections
        WHERE connections.member_low_id = least('${USER_A}'::uuid, '${CAP_TARGET_B}'::uuid)
          AND connections.member_high_id = greatest('${USER_A}'::uuid, '${CAP_TARGET_B}'::uuid)
          AND connections.status = 'pending'
      ),
      'noncanonical', (
        SELECT count(*) FROM public.user_connections connections
        WHERE connections.requested_by = '${USER_A}'
          AND connections.status = 'pending'
          AND connections.member_low_id >= connections.member_high_id
      )
    )::text;
  `))

  if (Number(state.outgoing) !== 50
    || Number(state.race_target_a) !== 1
    || Number(state.race_target_b) !== 0
    || Number(state.noncanonical) !== 0) {
    throw new Error(`Concurrent outgoing-cap enforcement failed: ${JSON.stringify(state)}`)
  }
}

function assertFixtureRemoved() {
  const residue = Number(runSql(`
    SELECT
      (SELECT count(*) FROM auth.users users WHERE users.id IN (${FIXTURE_USER_IDS_SQL}))
      + (SELECT count(*) FROM public.users users WHERE users.id IN (${FIXTURE_USER_IDS_SQL}))
      + (SELECT count(*) FROM public.user_connections connections
          WHERE connections.member_low_id IN (${FIXTURE_USER_IDS_SQL})
             OR connections.member_high_id IN (${FIXTURE_USER_IDS_SQL}))
      + (SELECT count(*) FROM public.user_blocks blocks
          WHERE blocks.blocker_id IN (${FIXTURE_USER_IDS_SQL})
             OR blocks.blocked_id IN (${FIXTURE_USER_IDS_SQL}))
      + (SELECT count(*) FROM public.notification_events events
          WHERE events.user_id IN (${FIXTURE_USER_IDS_SQL}));
  `))
  if (residue !== 0) throw new Error(`Connections race verifier left ${residue} fixture rows behind`)
}

async function main() {
  runSql('SELECT 1;')
  cleanFixture()

  try {
    createFixture()
    resetPairState()
    await runRequestFirst()
    resetPairState()
    await runBlockFirst()
    resetPairState()
    seedOutgoingCapacityFixture()
    await runOutgoingCapacityRace()
    console.log(
      'Connections concurrency verification passed '
      + '(request-first block, block-first request, and 50-outgoing cap).',
    )
  } finally {
    cleanFixture()
    assertFixtureRemoved()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
