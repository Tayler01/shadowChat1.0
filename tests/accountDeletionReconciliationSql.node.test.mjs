import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const { PGlite } = process.env.SHADOWCHAT_PGLITE_MODULE_PATH
  ? await import(pathToFileURL(path.resolve(process.env.SHADOWCHAT_PGLITE_MODULE_PATH)).href)
  : await import('@electric-sql/pglite')
const member = '10000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'
const worker = '30000000-0000-4000-8000-000000000003'
const nextWorker = '40000000-0000-4000-8000-000000000004'
const project = 'abcdefghijklmnopqrst'
const readMigration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')

async function fixture() {
  const db = await PGlite.create()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema private;')
    await db.exec(`
      create table public.messages(id uuid primary key);
      create table public.notification_events(id bigint primary key,
        message_id uuid references public.messages(id) on delete cascade);
    `)
    const access = await readMigration('20261023001140_active_member_access_boundary.sql')
    const start = access.indexOf('create table private.account_deletion_jobs')
    const end = access.indexOf('create function private.is_active_member')
    assert.ok(start >= 0 && end > start)
    await db.exec(access.slice(start, end))
    await db.exec(await readMigration('20261023223132_legacy_account_deletion_compatibility.sql'))
    await db.exec(await readMigration('20261023224356_legacy_account_deletion_reconciliation.sql'))
    const scalar = async (sql, parameters = []) => Object.values((await db.query(sql, parameters)).rows[0])[0]
    const service = () => db.exec('reset role; set role service_role')
    const seed = async ({ id = member, alias = true, ageMinutes = 6, state = 'requested' } = {}) => {
      await db.exec('reset role')
      await db.query(`insert into private.account_deletion_jobs
        (user_id,receipt_digest,state,manifest,updated_at,completed_at,receipt_expires_at)
        values($1,$2,$3,'{"version":1,"storage":[]}',now()-make_interval(mins=>$4),
          case when $3='completed' then now() else null end,
          case when $3='completed' then now()+interval '1 day' else null end)`,
      [id, (id === member ? 'a' : 'b').repeat(64), state, ageMinutes])
      if (alias) await db.query('insert into private.account_deletion_legacy_bearers(bearer_digest,user_id) values($1,$2)', [(id === member ? 'c' : 'd').repeat(64), id])
      await service()
    }
    const claim = (id = worker) => scalar('select public.claim_legacy_account_deletion_job($1)', [id])
    const finish = (completed = false, id = worker, userId = member) => scalar('select public.finish_legacy_account_deletion_attempt($1,$2,$3)', [userId, id, completed])
    const status = () => scalar('select public.get_legacy_account_deletion_reconciliation_status()')
    await service()
    return { db, scalar, service, seed, claim, finish, status }
  } catch (error) { await db.close(); throw error }
}

async function dispatcherFixture() {
  const fx = await fixture()
  await fx.db.exec(`reset role; create schema vault; create schema net;
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    create table net.fixture_requests(id bigserial,url text,headers jsonb,body jsonb,timeout_milliseconds integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
    returns bigint language plpgsql as $$ declare request_id bigint; begin
      insert into net.fixture_requests(url,headers,body,timeout_milliseconds)
        values($1,$2,$3,$4) returning id into request_id;
      return request_id;
    end $$;`)
  const credential = (role = 'service_role', ref = project) => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ role, ref })).toString('base64url')}.synthetic`
  const bind = async (key = credential()) => {
    await fx.db.exec('reset role')
    await fx.db.query(`insert into private.legacy_account_deletion_dispatch_config(singleton,project_ref,credential_sha256)
      values(true,$1,$2) on conflict(singleton) do update set project_ref=excluded.project_ref,
      credential_sha256=excluded.credential_sha256,updated_at=now()`,
    [project, createHash('sha256').update(key).digest('hex')])
  }
  const vault = async (url = `https://${project}.supabase.co/functions/v1/delete-account`, key = credential()) => {
    await fx.db.exec('reset role; delete from vault.decrypted_secrets')
    await fx.db.query("insert into vault.decrypted_secrets values('shadowchat_legacy_deletion_reconcile_url',$1),('shadowchat_legacy_deletion_service_role_key',$2)", [url, key])
  }
  const dispatch = () => fx.scalar('select private.request_legacy_account_deletion_reconciliation()')
  return { ...fx, bind, credential, vault, dispatch }
}

test('foundation indexes group notification cascades and preserves unrelated events', async () => {
  const { db, scalar } = await fixture()
  try {
    await db.exec('reset role')
    await db.query('insert into public.messages values($1),($2)', [member, other])
    await db.query(`insert into public.notification_events
      select i,case when i<=23 then $1::uuid else $2::uuid end
      from generate_series(1,20000) i`, [member, other])
    await db.exec('analyze public.notification_events')
    const plan = await db.query('explain (format json) delete from public.notification_events where message_id=$1', [member])
    assert.match(JSON.stringify(plan.rows), /idx_notification_events_message_id/,
      'The cascade predicate must use the index installed by the actual foundation migration')
    await db.query('delete from public.messages where id=$1', [member])
    assert.equal(await scalar('select count(*)::integer from public.notification_events where message_id=$1', [member]), 0)
    assert.equal(await scalar('select count(*)::integer from public.notification_events where message_id=$1', [other]), 19977)
    assert.equal(await scalar('select count(*)::integer from public.messages where id=$1', [other]), 1)
  } finally { await db.close() }
})

test('claims only a stale, already-authorized legacy job and never creates deletion authority', async () => {
  const fx = await fixture()
  try {
    assert.equal(await fx.claim(), null)
    await fx.seed({ alias: false })
    assert.equal(await fx.claim(), null)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_legacy_reconciliation'), 0)
    await fx.seed({ id: other, ageMinutes: 1 })
    assert.equal(await fx.claim(), null)
    await fx.db.exec('reset role')
    await fx.db.query("update private.account_deletion_jobs set updated_at=now()-interval '6 minutes' where user_id=$1", [other])
    await fx.service()
    assert.deepEqual(await fx.claim(), { user_id: other, state: 'requested', manifest: { version: 1, storage: [] } })
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_jobs'), 2)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_legacy_bearers'), 1)
  } finally { await fx.db.close() }
})

test('one job per claim and an active five-minute lease excludes overlapping workers', async () => {
  const fx = await fixture()
  try {
    await fx.seed()
    await fx.seed({ id: other })
    const first = await fx.claim()
    assert.equal(first.user_id, member)
    assert.equal(await fx.scalar('select extract(epoch from lease_expires_at-last_claimed_at)::int from private.account_deletion_legacy_reconciliation where user_id=$1', [member]), 300)
    assert.equal((await fx.claim(nextWorker)).user_id, other)
    assert.equal(await fx.claim(), null)
    assert.equal((await fx.status()).leased_jobs, 2)
  } finally { await fx.db.close() }
})

test('crashed leases can be reclaimed, while the stale worker cannot release its successor', async () => {
  const fx = await fixture()
  try {
    await fx.seed()
    await fx.claim()
    await fx.db.exec('reset role')
    await fx.db.exec("update private.account_deletion_legacy_reconciliation set lease_expires_at=now()-interval '1 second',next_attempt_at=now()-interval '1 second'")
    await fx.service()
    assert.equal((await fx.claim(nextWorker)).user_id, member)
    await assert.rejects(() => fx.finish(false), /lease is not active/)
    assert.equal(await fx.scalar('select worker_id from private.account_deletion_legacy_reconciliation'), nextWorker)
    assert.equal(await fx.scalar('select attempt_count from private.account_deletion_legacy_reconciliation'), 2)
    await fx.finish(false, nextWorker)
    assert.equal(await fx.claim(), null)
  } finally { await fx.db.close() }
})

test('retry delay doubles to one hour without abandoning authorized jobs or overflowing attempts', async () => {
  const fx = await fixture()
  try {
    await fx.seed()
    for (const expectedSeconds of [60, 120, 240, 480, 960, 1920, 3600, 3600]) {
      await fx.claim()
      await fx.finish()
      assert.equal(await fx.scalar('select extract(epoch from next_attempt_at-last_finished_at)::int from private.account_deletion_legacy_reconciliation'), expectedSeconds)
      assert.equal(await fx.claim(), null)
      await fx.db.exec('reset role')
      await fx.db.exec("update private.account_deletion_legacy_reconciliation set next_attempt_at=now()-interval '1 second'")
      await fx.service()
    }
    await fx.db.exec('reset role')
    await fx.db.exec('update private.account_deletion_legacy_reconciliation set attempt_count=2147483647')
    await fx.service()
    assert.equal((await fx.claim()).user_id, member)
    await fx.finish()
    assert.equal(await fx.scalar('select attempt_count from private.account_deletion_legacy_reconciliation'), 2147483647)
    assert.equal(await fx.scalar('select extract(epoch from next_attempt_at-last_finished_at)::int from private.account_deletion_legacy_reconciliation'), 3600)
    assert.equal(await fx.scalar('select state from private.account_deletion_jobs'), 'requested')
  } finally { await fx.db.close() }
})

test('completion requires the durable workflow to finish and never advances deletion state', async () => {
  const fx = await fixture()
  try {
    await fx.seed()
    await fx.claim()
    await assert.rejects(() => fx.finish(true), /Deletion has not completed/)
    assert.equal(await fx.scalar('select state from private.account_deletion_jobs'), 'requested')
    await fx.db.query("update private.account_deletion_jobs set state='completed',completed_at=now(),receipt_expires_at=now()+interval '1 day' where user_id=$1", [member])
    await fx.finish(true)
    assert.equal(await fx.claim(), null)
    assert.equal(await fx.scalar('select last_result from private.account_deletion_legacy_reconciliation'), 'completed')
    assert.equal(await fx.scalar('select worker_id from private.account_deletion_legacy_reconciliation'), null)
    assert.equal((await fx.status()).completed_jobs, 1)
  } finally { await fx.db.close() }
})

test('foreground completion wins even when a worker reports a retry', async () => {
  const fx = await fixture()
  try {
    await fx.seed()
    await fx.claim()
    await fx.db.exec("update private.account_deletion_jobs set state='completed',completed_at=now(),receipt_expires_at=now()+interval '1 day'")
    await fx.finish(false)
    assert.equal(await fx.scalar('select last_result from private.account_deletion_legacy_reconciliation'), 'completed')
    assert.equal(await fx.claim(), null)
  } finally { await fx.db.close() }
})

test('aggregate operational status exposes counts and times without credentials, manifests or identities', async () => {
  const fx = await fixture()
  try {
    await fx.seed()
    await fx.seed({ id: other, alias: false })
    let status = await fx.status()
    assert.equal(status.pending_jobs, 1)
    assert.equal(status.eligible_jobs, 1)
    assert.equal(status.attempted_jobs, 0)
    await fx.claim()
    status = await fx.status()
    assert.equal(status.leased_jobs, 1)
    assert.equal(status.eligible_jobs, 0)
    assert.equal(status.total_attempts, 1)
    assert.equal(status.max_attempts, 1)
    assert.ok(status.last_claimed_at)
    await fx.finish()
    status = await fx.status()
    assert.ok(status.last_finished_at)
    assert.equal(status.leased_jobs, 0)
    assert.equal(/user_id|manifest|digest|10000000|20000000/.test(JSON.stringify(status)), false)
  } finally { await fx.db.close() }
})

test('browser roles cannot claim, finish, inspect status or read the private lease state', async () => {
  const fx = await fixture()
  try {
    await fx.seed()
    await fx.claim()
    for (const role of ['anon', 'authenticated']) {
      await fx.db.exec(`reset role; set role ${role}`)
      await assert.rejects(() => fx.claim(), /permission denied/)
      await assert.rejects(() => fx.finish(), /permission denied/)
      await assert.rejects(() => fx.status(), /permission denied/)
      await assert.rejects(() => fx.scalar('select * from private.account_deletion_legacy_reconciliation'), /permission denied/)
    }
  } finally { await fx.db.close() }
})

test('expired, unknown or malformed attempts fail closed and completed receipt pruning removes leases', async () => {
  const fx = await fixture()
  try {
    await assert.rejects(() => fx.claim(null), /worker is required/)
    await assert.rejects(() => fx.finish(false, worker, other), /Unknown reconciliation job/)
    await fx.seed()
    await fx.claim()
    await assert.rejects(() => fx.finish(null), /attempt is required/)
    await assert.rejects(() => fx.finish(false, nextWorker), /lease is not active/)
    await fx.db.exec('reset role')
    await fx.db.exec("update private.account_deletion_legacy_reconciliation set lease_expires_at=now()-interval '1 second'")
    await fx.service()
    await assert.rejects(() => fx.finish(), /lease is not active/)
    await fx.db.exec('delete from private.account_deletion_jobs')
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_legacy_reconciliation'), 0)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_legacy_bearers'), 0)
  } finally { await fx.db.close() }
})

test('foundation dispatcher remains dormant even when a caller sets a matching session target', async () => {
  const fx = await dispatcherFixture()
  try {
    await fx.seed()
    await fx.vault()
    await fx.db.query("select set_config('shadowchat.legacy_deletion_project_ref',$1,false)", [project])
    await assert.rejects(() => fx.dispatch(), /not configured/)
    assert.equal(await fx.scalar('select count(*)::int from net.fixture_requests'), 0)
    assert.equal(await fx.scalar('select count(*)::int from private.legacy_account_deletion_dispatch_config'), 0)
  } finally { await fx.db.close() }
})

test('explicitly bound dispatcher queues only the service action and skips non-legacy or completed jobs', async () => {
  const fx = await dispatcherFixture()
  try {
    await fx.bind()
    await fx.seed({ alias: false })
    await fx.db.exec('reset role')
    assert.equal(await fx.dispatch(), null)
    await fx.seed({ id: other, state: 'completed' })
    await fx.db.exec('reset role')
    assert.equal(await fx.dispatch(), null)
    await fx.db.query("update private.account_deletion_jobs set state='data_removed',completed_at=null,receipt_expires_at=null where user_id=$1", [other])
    await fx.vault()
    assert.equal(await fx.dispatch(), 1)
    const row = (await fx.db.query('select url,headers,body,timeout_milliseconds from net.fixture_requests')).rows[0]
    assert.equal(row.url, `https://${project}.supabase.co/functions/v1/delete-account`)
    assert.deepEqual(row.body, { action: 'reconcile-legacy' })
    assert.equal(row.headers['Content-Type'], 'application/json')
    assert.equal(row.headers.Authorization, `Bearer ${fx.credential()}`)
    assert.equal(row.headers.apikey, undefined)
    assert.equal(row.timeout_milliseconds, 30000)
  } finally { await fx.db.close() }
})

test('bound registered secret uses apikey only and rejects any unreviewed key replacement', async () => {
  const fx = await dispatcherFixture()
  try {
    const key = `sb_secret_${'s'.repeat(256)}`
    const url = `https://${project}.supabase.co/functions/v1/delete-account`
    await fx.seed()
    await fx.bind(key)
    await fx.vault(url, key)
    assert.equal(await fx.dispatch(), 1)
    const row = (await fx.db.query('select headers,body from net.fixture_requests')).rows[0]
    assert.deepEqual(row.headers, { 'Content-Type': 'application/json', apikey: key })
    assert.deepEqual(row.body, { action: 'reconcile-legacy' })
    await fx.vault(url, `sb_secret_${'t'.repeat(40)}`)
    await assert.rejects(() => fx.dispatch(), /credential/)
    await fx.bind()
    await fx.vault(url, fx.credential().replace('.synthetic', '.otherSignature'))
    await assert.rejects(() => fx.dispatch(), /credential/)
    assert.equal(await fx.scalar('select count(*)::int from net.fixture_requests'), 1)
  } finally { await fx.db.close() }
})

test('missing, ambiguous, mismatched or malformed dispatcher credentials never enqueue HTTP', async () => {
  const fx = await dispatcherFixture()
  try {
    await fx.seed()
    await fx.bind()
    await assert.rejects(() => fx.dispatch(), /credentials are unavailable/)
    await fx.vault()
    await fx.db.exec("insert into vault.decrypted_secrets values('shadowchat_legacy_deletion_reconcile_url','duplicate')")
    await assert.rejects(() => fx.dispatch(), /credentials are unavailable/)
    const url = `https://${project}.supabase.co/functions/v1/delete-account`
    for (const [target, key] of [
      ['https://other.example.invalid/functions/v1/delete-account', fx.credential()],
      [`${url}?target=other`, fx.credential()],
      [url, fx.credential('authenticated')],
      [url, fx.credential('service_role', 'tsrqponmlkjihgfedcba')],
      [url, 'malformed'],
      [url, 'header.e25vLmpzb24.signature'],
      [url, 'sb_secret_short'],
      [url, `sb_secret_${'s'.repeat(19)}`],
      [url, `sb_secret_${'s'.repeat(257)}`],
      [url, `sb_publishable_${'s'.repeat(40)}`],
    ]) {
      await fx.bind(key)
      await fx.vault(target, key)
      await assert.rejects(() => fx.dispatch(), /credential|endpoint/)
    }
    assert.equal(await fx.scalar('select count(*)::int from net.fixture_requests'), 0)
  } finally { await fx.db.close() }
})

test('dispatcher execution is unavailable to browser and service API roles', async () => {
  const fx = await dispatcherFixture()
  try {
    await fx.bind()
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await fx.db.exec(`reset role; set role ${role}`)
      await assert.rejects(() => fx.dispatch(), /permission denied/)
      await assert.rejects(() => fx.scalar('select project_ref from private.legacy_account_deletion_dispatch_config'), /permission denied/)
      await assert.rejects(() => fx.db.query('insert into private.legacy_account_deletion_dispatch_config(singleton,project_ref) values(true,$1)', [project]), /permission denied/)
    }
  } finally { await fx.db.close() }
})
