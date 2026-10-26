import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { injectSchedulerAuthMissing, schedulerAuthMissingSql, schedulerFixtureSql, schedulerTestTarget, validateSchedulerFixture } from '../scripts/verify-legacy-deletion-scheduler-hosted.mjs'

const project = 'aaaaaaaaaaaaaaaaaaaa'
const otherProject = 'bbbbbbbbbbbbbbbbbbbb'
const member = '10000000-0000-4000-8000-000000000001'
const workerUrl = `https://${project}.supabase.co/functions/v1/delete-account`
const urlName = 'shadowchat_legacy_deletion_reconcile_url'
const keyName = 'shadowchat_legacy_deletion_service_role_key'
const syntheticKey = (ref = project, role = 'service_role') => `synthetic.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.testonly`
const fingerprint = value => createHash('sha256').update(value).digest('hex')
const syntheticSecret = `sb_secret_${'synthetic_only_'.repeat(3)}`
const rollout = await readFile(new URL('../supabase/rollout/legacy-account-deletion-reconciliation.sql', import.meta.url), 'utf8')
const statusQuery = await readFile(new URL('../supabase/rollout/legacy-account-deletion-reconciliation-status.sql', import.meta.url), 'utf8')
const foundation = await readFile(new URL('../supabase/migrations/20261023224356_legacy_account_deletion_reconciliation.sql', import.meta.url), 'utf8')
const dispatcherStart = foundation.indexOf('create table private.legacy_account_deletion_dispatch_config')
const dispatcherEnd = foundation.indexOf("notify pgrst, 'reload schema';", dispatcherStart)
assert(dispatcherStart > 0 && dispatcherEnd > dispatcherStart)
const dispatcher = foundation.slice(dispatcherStart, dispatcherEnd)

async function fixture(t) {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema vault; create schema cron; create schema net; create schema auth;
    grant usage on schema private to anon,authenticated,service_role;
    create table private.account_deletion_jobs(user_id uuid primary key,state text,updated_at timestamptz default now());
    create table private.account_deletion_legacy_bearers(user_id uuid);
    create table private.account_deletion_legacy_reconciliation(user_id uuid,worker_id uuid,lease_expires_at timestamptz);
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create table private.bunny_upload_reservations(id uuid,owner_id uuid,library_id text,source_type text,source_id uuid,state text,asset_id uuid);
    create function public.finish_bunny_upload(target_reservation_id uuid,cleanup_confirmed boolean) returns void language sql as $$
      delete from private.bunny_upload_reservations where id=target_reservation_id and cleanup_confirmed;
    $$;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
    create table cron.job_run_details(jobid bigint,status text,start_time timestamptz,end_time timestamptz);
    create function cron.schedule(name text,timing text,sql text) returns bigint language plpgsql as $$
      declare result bigint;
      begin
        insert into cron.job(jobname,schedule,command) values(name,timing,sql)
          on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command,active=true returning jobid into result;
        return result;
      end;
    $$;
    create table net.requests(id bigint generated always as identity primary key,url text,headers jsonb,body jsonb,timeout integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$
      insert into net.requests(url,headers,body,timeout) values(url,headers,body,timeout_milliseconds) returning id;
    $$;
    create function public.claim_legacy_account_deletion_job(worker_id uuid) returns jsonb language sql as $$select null::jsonb$$;
    create function public.finish_legacy_account_deletion_attempt(target_user_id uuid,worker_id uuid,completed boolean) returns void language sql as $$select$$;
    create function public.get_legacy_account_deletion_reconciliation_status() returns jsonb language sql as $$select '{}'::jsonb$$;
  `)
  await db.exec(dispatcher)
  const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
  const configure = async () => {
    await db.query("select set_config('shadowchat.legacy_deletion_readiness','verified',false)")
    await db.query("select set_config('shadowchat.legacy_deletion_project_ref',$1,false)", [project])
    await db.query("select set_config('shadowchat.legacy_deletion_credential_sha256',$1,false)", [fingerprint(syntheticKey())])
    await db.query('insert into vault.decrypted_secrets values($1,$2),($3,$4)', [urlName, workerUrl, keyName, syntheticKey()])
  }
  const pending = async () => {
    await db.query("insert into private.account_deletion_jobs values($1,'requested')", [member])
    await db.query('insert into private.account_deletion_legacy_bearers values($1)', [member])
  }
  const apply = () => db.exec(rollout)
  const call = () => scalar('select private.request_legacy_account_deletion_reconciliation()')
  const rejectedApply = async pattern => {
    await assert.rejects(apply, pattern)
    await db.exec('rollback')
  }
  return { db, scalar, configure, pending, apply, call, rejectedApply }
}

test('dormant rollout refuses missing readiness and dependencies without creating a schedule', async t => {
  const f = await fixture(t)
  await assert.rejects(f.call, /not configured/)
  assert.equal(await f.scalar('select count(*)::int from net.requests'), 0)
  await f.rejectedApply(/Verified legacy deletion integration/)
  assert.equal(await f.scalar('select count(*)::int from cron.job'), 0)
  await f.configure()
  await f.db.exec('drop function public.claim_legacy_account_deletion_job(uuid)')
  await f.rejectedApply(/foundation is missing/)
  assert.equal(await f.scalar('select count(*)::int from cron.job'), 0)
})

test('reviewed setup is idempotent, schedules only the fixed action, and does not itself send HTTP', async t => {
  const f = await fixture(t)
  await f.configure()
  await f.db.exec("insert into cron.job(jobname,schedule,command) values('unrelated','0 * * * *','select 1;')")
  await f.apply()
  await f.apply()
  const jobs = (await f.db.query("select jobname,schedule,command,active from cron.job where jobname='shadowchat-legacy-account-deletion'")).rows
  assert.deepEqual(jobs, [{ jobname: 'shadowchat-legacy-account-deletion', schedule: '* * * * *', command: 'select private.request_legacy_account_deletion_reconciliation();', active: true }])
  assert.equal(await f.scalar("select count(*)::int from cron.job where jobname='unrelated'"), 1)
  assert.equal(await f.scalar('select count(*)::int from net.requests'), 0)
  assert.equal(await f.call(), null)
  const status = (await f.db.exec(statusQuery)).flatMap(result => result.rows).find(row => row.reconciliation)?.reconciliation
  assert.deepEqual(status, { worker: {}, schedule: [{ active: true, schedule: '* * * * *', expected_command: true }], browser_dispatch_allowed: false, bound_project_ref: project, recent_schedule_runs: [] })
  assert.equal(await f.scalar('show transaction_read_only'), 'off')
  assert(!JSON.stringify(status).includes(syntheticKey()))
})

test('dispatch contains no identity input and only pending alias-bound legacy jobs can queue it', async t => {
  const f = await fixture(t)
  await f.configure()
  await f.apply()
  await f.db.query("insert into private.account_deletion_jobs values($1,'requested')", [member])
  assert.equal(await f.call(), null)
  await f.db.query('insert into private.account_deletion_legacy_bearers values($1)', [member])
  assert.equal(await f.call(), 1)
  const request = (await f.db.query('select url,headers,body,timeout from net.requests')).rows[0]
  assert.deepEqual(request, { url: workerUrl, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${syntheticKey()}` }, body: { action: 'reconcile-legacy' }, timeout: 30000 })
  await f.db.exec("update private.account_deletion_jobs set state='completed'")
  assert.equal(await f.call(), null)
  assert.equal(await f.scalar('select count(*)::int from net.requests'), 1)
})

test('wrong-target, browser, malformed and ambiguous credentials fail before scheduling or HTTP', async t => {
  const f = await fixture(t)
  await f.configure()
  for (const key of [syntheticKey(otherProject), syntheticKey(project, 'authenticated'), 'not-a-key', 'synthetic.bm90anNvbg.testonly']) {
    await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [key, keyName])
    await f.rejectedApply(/credential/)
  }
  await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [syntheticKey(), keyName])
  await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [`https://${otherProject}.supabase.co/functions/v1/delete-account`, urlName])
  await f.rejectedApply(/differs from the selected project/)
  await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [workerUrl, urlName])
  await f.apply()
  await f.pending()
  await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [`https://${otherProject}.supabase.co/functions/v1/delete-account`, urlName])
  await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [syntheticKey(otherProject), keyName])
  await f.db.query("select set_config('shadowchat.legacy_deletion_project_ref',$1,false)", [otherProject])
  await assert.rejects(f.call, /endpoint or service credential is invalid/)
  await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [workerUrl, urlName])
  await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [syntheticKey(otherProject), keyName])
  await f.db.query('update private.legacy_account_deletion_dispatch_config set credential_sha256=$1', [fingerprint(syntheticKey(otherProject))])
  await assert.rejects(f.call, /another role or project/)
  await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [syntheticKey(), keyName])
  await f.db.query('update private.legacy_account_deletion_dispatch_config set credential_sha256=$1', [fingerprint(syntheticKey())])
  await f.db.query('insert into vault.decrypted_secrets values($1,$2)', [keyName, syntheticKey()])
  await assert.rejects(f.call, /unavailable/)
  assert.equal(await f.scalar('select count(*)::int from net.requests'), 0)
})

test('browser and service roles cannot execute the scheduler or read its Vault credential', async t => {
  const f = await fixture(t)
  await f.configure()
  await f.apply()
  await f.pending()
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await f.db.exec(`set role ${role}`)
    await assert.rejects(f.call, /permission denied/)
    await assert.rejects(() => f.db.query('select decrypted_secret from vault.decrypted_secrets'), /permission denied/)
    await assert.rejects(() => f.db.query('select project_ref from private.legacy_account_deletion_dispatch_config'), /permission denied/)
    await assert.rejects(() => f.db.query('update private.legacy_account_deletion_dispatch_config set project_ref=$1', [otherProject]), /permission denied/)
    await f.db.exec('reset role')
  }
  assert.equal(await f.scalar('select count(*)::int from net.requests'), 0)
})

test('operations reject target-table grants and preserve a different existing binding', async t => {
  const f = await fixture(t)
  await f.configure()
  await f.db.exec('grant update on private.legacy_account_deletion_dispatch_config to service_role')
  await f.rejectedApply(/configuration has unexpected grants/)
  await f.db.exec('revoke update on private.legacy_account_deletion_dispatch_config from service_role')
  await f.db.query('insert into private.legacy_account_deletion_dispatch_config(singleton,project_ref,credential_sha256) values(true,$1,$2)', [otherProject, fingerprint(syntheticKey())])
  await f.rejectedApply(/already bound to another project/)
  assert.equal(await f.scalar('select project_ref from private.legacy_account_deletion_dispatch_config'), otherProject)
  assert.equal(await f.scalar('select count(*)::int from cron.job'), 0)
})

test('registered opaque secrets use apikey only and any swapped secret fails the pinned fingerprint', async t => {
  const f = await fixture(t)
  await f.configure()
  for (const masked of ['sb_secret_first...last', 'sb_secret_first\u2026last']) {
    await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [masked, keyName])
    await f.db.query("select set_config('shadowchat.legacy_deletion_credential_sha256',$1,false)", [fingerprint(masked)])
    await f.rejectedApply(/masked API key.*--reveal/)
  }
  await f.db.query("select set_config('shadowchat.legacy_deletion_credential_sha256',$1,false)", [fingerprint(syntheticKey())])
  await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [syntheticSecret, keyName])
  await f.rejectedApply(/independently reviewed fingerprint/)
  await f.db.query("select set_config('shadowchat.legacy_deletion_credential_sha256',$1,false)", [fingerprint(syntheticSecret)])
  await f.apply()
  await f.pending()
  await f.call()
  const request = (await f.db.query('select headers,body from net.requests')).rows[0]
  assert.deepEqual(request, { headers: { 'Content-Type': 'application/json', apikey: syntheticSecret }, body: { action: 'reconcile-legacy' } })
  await f.db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2', [`${syntheticSecret}other`, keyName])
  await assert.rejects(f.call, /service credential is invalid/)
  assert.equal(await f.scalar('select count(*)::int from net.requests'), 1)
})

test('setup preserves an existing differently-owned schedule with the same name', async t => {
  const f = await fixture(t)
  await f.configure()
  await f.db.exec("insert into cron.job(jobname,schedule,command) values('shadowchat-legacy-account-deletion','0 * * * *','select 42;')")
  await f.rejectedApply(/different command/)
  assert.equal(await f.scalar("select command from cron.job where jobname='shadowchat-legacy-account-deletion'"), 'select 42;')
})

test('operations refuse a drifted dispatcher body or a browser execution grant', async t => {
  const f = await fixture(t)
  await f.configure()
  await f.db.exec('grant execute on function private.request_legacy_account_deletion_reconciliation() to authenticated')
  await f.rejectedApply(/unexpected execution grants/)
  await f.db.exec('revoke execute on function private.request_legacy_account_deletion_reconciliation() from authenticated')
  await f.db.exec("create or replace function private.request_legacy_account_deletion_reconciliation() returns bigint language sql security definer set search_path='' as $$select 1::bigint$$")
  await f.rejectedApply(/dispatcher is missing or changed/)
  assert.equal(await f.scalar('select count(*)::int from cron.job'), 0)
})

const schedulerFixture = () => {
  const runId = '20000000-0000-4000-8000-000000000002'
  return { version: 1, purpose: 'exclusive-legacy-deletion-scheduler', ...schedulerTestTarget,
    runId, userId: member, messageId: '30000000-0000-4000-8000-000000000003', reservationId: '40000000-0000-4000-8000-000000000004',
    sourceId: '50000000-0000-4000-8000-000000000005', email: `qa.legacy-scheduler.${runId}@example.invalid`,
    objectPath: `${member}/legacy-scheduler-${runId}/fixture.png`, startedAt: '2026-10-23T00:00:00Z' }
}

test('hosted fixture instructions cannot target production, foreign prefixes or injected SQL identities', () => {
  const fixture = schedulerFixture()
  validateSchedulerFixture(fixture)
  for (const changed of [{ project: 'shsqqouecvdoifzufkqm' }, { userId: "bad';delete" }, { email: 'member@example.com' }, { objectPath: 'another-member/file' }]) {
    assert.throws(() => schedulerFixtureSql({ ...fixture, ...changed }))
  }
})

test('actual release SQL requires the exact synthetic owner, authorized job and empty provider hold', async t => {
  const f = await fixture(t)
  const input = schedulerFixture()
  const sql = schedulerFixtureSql(input)
  await assert.rejects(() => f.db.exec(sql), /synthetic scheduler owner is missing/)
  await f.db.exec('rollback')
  await f.db.query('insert into auth.users values($1,$2,$3)', [member, input.email, { qa_legacy_scheduler_run: input.runId }])
  await f.pending()
  await assert.rejects(() => f.db.exec(sql), /synthetic provider hold is missing/)
  await f.db.exec('rollback')
  await f.db.query('insert into private.bunny_upload_reservations values($1,$2,$3,$4,$5,$6,null)', [input.reservationId, member, '999999999', 'shadow_pin_image', input.sourceId, 'pending'])
  await f.db.exec(sql)
  assert.equal(await f.scalar('select count(*)::int from private.bunny_upload_reservations'), 0)
  assert.equal(await f.scalar("select updated_at < now()-interval '5 minutes' from private.account_deletion_jobs where user_id=$1", [member]), true)
  assert.equal(await f.scalar('select count(*)::int from net.requests'), 0)
})

test('Auth404 fault preflight requires a released authorized fixture with no schedule, reservation or lease', async t => {
  const f = await fixture(t)
  const input = schedulerFixture()
  const sql = schedulerAuthMissingSql(input)
  await f.db.query('insert into auth.users values($1,$2,$3)', [member, input.email, { qa_legacy_scheduler_run: input.runId }])
  await f.pending()
  await assert.rejects(() => f.db.exec(sql), /released already-authorized legacy job is missing/)
  await f.db.exec('rollback')
  await f.db.exec("update private.account_deletion_jobs set updated_at=now()-interval '6 minutes'")
  await f.db.exec(sql)
  await f.db.exec("insert into cron.job(jobname,schedule,command) values('shadowchat-legacy-account-deletion','* * * * *','select 1;')")
  await assert.rejects(() => f.db.exec(sql), /Disable the exact scheduler/)
  await f.db.exec('rollback; update cron.job set active=false')
  await f.db.query('insert into private.account_deletion_legacy_reconciliation values($1,$2,now())', [member, input.runId])
  await assert.rejects(() => f.db.exec(sql), /worker lease prevents fault injection/)
  await f.db.exec('rollback; delete from private.account_deletion_legacy_reconciliation')
  await f.db.query('insert into private.bunny_upload_reservations values($1,$2,$3,$4,$5,$6,null)', [input.reservationId, member, '999999999', 'shadow_pin_image', input.sourceId, 'pending'])
  await assert.rejects(() => f.db.exec(sql), /provider reservation/)
  await f.db.exec('rollback')
  assert.equal(await f.scalar('select count(*)::int from private.account_deletion_jobs'), 1)
  assert.equal(await f.scalar('select count(*)::int from net.requests'), 0)
})

test('Auth404 injection removes only the exact marked synthetic identity and leaves its existing job untouched', async () => {
  const input = { ...schedulerFixture(), phase: 'held', initial: { total_attempts: 0 } }
  const effects = []
  let removed = false
  let email = input.email
  const status = async () => ({ pending_jobs: 1, leased_jobs: 0, total_attempts: 0 })
  const admin = {
    auth: { admin: {
      getUserById: async id => { assert.equal(id, input.userId); return removed ? { error: { status: 404 } }
        : { data: { user: { id, email, user_metadata: { qa_legacy_scheduler_run: input.runId } } } } },
      deleteUser: async id => { effects.push(['Auth', id]); removed = true; return { data: {} } },
    } },
    from: table => ({ delete: () => {
      const filters = []
      const query = { eq: (key, value) => { filters.push([key, value]); return query },
        then: resolve => { effects.push([table, filters]); return Promise.resolve(resolve({ data: null })) } }
      return query
    } }),
    storage: { from: bucket => ({ remove: async paths => { effects.push([bucket, paths]); return { data: [] } } }) },
  }
  email = 'different@example.invalid'
  await assert.rejects(() => injectSchedulerAuthMissing({ fixture: input, admin, status }))
  assert.deepEqual(effects, [])
  email = input.email
  const result = await injectSchedulerAuthMissing({ fixture: input, admin, status })
  assert.equal(result.durableJobStillPending, true)
  assert.deepEqual(effects, [
    ['messages', [['id', input.messageId], ['user_id', input.userId], ['content', `legacy-scheduler-${input.runId}`]]],
    ['chat-uploads', [input.objectPath]], ['Auth', input.userId],
  ])
})
