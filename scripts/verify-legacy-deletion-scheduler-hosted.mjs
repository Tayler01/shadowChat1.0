/** Exclusive synthetic scheduler proof. Root performs Vault/SQL steps in memory. */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { loadHostedTestTarget } from './hosted-test-target.mjs'

export const schedulerTestTarget = { project: 'jwldrnmhrmwsyrfhmrkg', branchId: '28082276-7003-40e5-b6cf-478fc8b76336' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const outputBase = path.resolve('output/privacy')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY4kAAAAASUVORK5CYII=', 'base64')
const value = (result, label) => { if (result.error) throw new Error(`${label} failed`); return result.data }

export function validateSchedulerFixture(fixture) {
  assert.equal(fixture?.version, 1)
  assert.equal(fixture.purpose, 'exclusive-legacy-deletion-scheduler')
  assert.equal(fixture.project, schedulerTestTarget.project)
  assert.equal(fixture.branchId, schedulerTestTarget.branchId)
  for (const key of ['runId', 'userId', 'messageId', 'reservationId', 'sourceId']) assert.match(fixture[key], uuid)
  assert.equal(fixture.email, `qa.legacy-scheduler.${fixture.runId}@example.invalid`)
  assert.equal(fixture.objectPath, `${fixture.userId}/legacy-scheduler-${fixture.runId}/fixture.png`)
  assert(Number.isFinite(Date.parse(fixture.startedAt)))
  return fixture
}

export function schedulerFixtureSql(fixture) {
  const f = validateSchedulerFixture(fixture)
  // No credential, bearer digest or member message body is written to these SQL
  // instructions. All values are strict, locally generated synthetic identities.
  return `begin;
do $fixture$ begin
  if not exists(select 1 from auth.users where id='${f.userId}' and email='${f.email}'
    and raw_user_meta_data->>'qa_legacy_scheduler_run'='${f.runId}') then
    raise exception 'The exact synthetic scheduler owner is missing';
  end if;
  perform 1 from private.account_deletion_jobs where user_id='${f.userId}' and state='requested' for update;
  if not found or not exists(select 1 from private.account_deletion_legacy_bearers where user_id='${f.userId}') then
    raise exception 'The exact already-authorized legacy job is missing';
  end if;
  if not exists(select 1 from private.bunny_upload_reservations where id='${f.reservationId}'
    and owner_id='${f.userId}' and library_id='999999999' and source_type='shadow_pin_image'
    and source_id='${f.sourceId}' and state='pending' and asset_id is null) then
    raise exception 'The exact empty synthetic provider hold is missing';
  end if;
  perform public.finish_bunny_upload('${f.reservationId}',true);
  update private.account_deletion_jobs set updated_at=now()-interval '6 minutes' where user_id='${f.userId}' and state='requested';
end; $fixture$;
commit;`
}

export function schedulerAuthMissingSql(fixture) {
  const f = validateSchedulerFixture(fixture)
  return `begin transaction read only;
do $fixture$ begin
  if exists(select 1 from cron.job where jobname='shadowchat-legacy-account-deletion' and active) then
    raise exception 'Disable the exact scheduler before fault injection';
  end if;
  if not exists(select 1 from auth.users where id='${f.userId}' and email='${f.email}'
    and raw_user_meta_data->>'qa_legacy_scheduler_run'='${f.runId}') then
    raise exception 'The exact synthetic scheduler owner is missing';
  end if;
  if not exists(select 1 from private.account_deletion_jobs where user_id='${f.userId}'
    and state='requested' and updated_at < now()-interval '5 minutes')
    or not exists(select 1 from private.account_deletion_legacy_bearers where user_id='${f.userId}') then
    raise exception 'The exact released already-authorized legacy job is missing';
  end if;
  if exists(select 1 from private.bunny_upload_reservations where owner_id='${f.userId}')
    or exists(select 1 from private.account_deletion_legacy_reconciliation where user_id='${f.userId}'
      and (worker_id is not null or lease_expires_at is not null)) then
    raise exception 'A provider reservation or worker lease prevents fault injection';
  end if;
end; $fixture$;
rollback;`
}

export async function injectSchedulerAuthMissing({ fixture, admin, status }) {
  const f = validateSchedulerFixture(fixture)
  assert.equal(f.phase, 'held')
  const before = await status()
  assert.equal(before.pending_jobs, 1)
  assert.equal(before.leased_jobs, 0)
  assert.equal(before.total_attempts, f.initial.total_attempts, 'A worker already attempted this fixture')
  const existing = value(await admin.auth.admin.getUserById(f.userId), 'Verify exact synthetic Auth owner').user
  assert.equal(existing?.id, f.userId)
  assert.equal(existing?.email, f.email)
  assert.equal(existing?.user_metadata?.qa_legacy_scheduler_run, f.runId)
  // Deliberate fault injection for this disposable member only. The durable job
  // and its authorization alias are untouched; no worker or begin RPC is called.
  value(await admin.from('messages').delete().eq('id', f.messageId).eq('user_id', f.userId).eq('content', `legacy-scheduler-${f.runId}`), 'Remove exact fixture message before Auth404')
  value(await admin.storage.from('chat-uploads').remove([f.objectPath]), 'Remove exact fixture bytes before Auth404')
  value(await admin.auth.admin.deleteUser(f.userId), 'Inject exact synthetic Auth404')
  assert.equal((await admin.auth.admin.getUserById(f.userId)).error?.status, 404)
  const after = await status()
  assert.equal(after.pending_jobs, 1, 'The already-authorized durable job must survive Auth removal')
  assert.equal(after.leased_jobs, 0)
  assert.equal(after.total_attempts, f.initial.total_attempts)
  return { kind: 'synthetic-auth-removed-before-reconciliation', injectedAt: new Date().toISOString(), durableJobStillPending: true }
}

async function save(directory, fixture) {
  await writeFile(path.join(directory, 'fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`)
}

async function run(args) {
  if (args.includes('--plan')) {
    console.log(JSON.stringify({ target: schedulerTestTarget, steps: [
      'Await root exclusive scheduler window and fresh staged bootstrap receipt.',
      'prepare: create one synthetic legacy deletion held by an empty provider reservation.',
      'Root provisions dedicated branch-only Vault entries in memory and applies the guarded scheduler SQL.',
      'Root executes release-and-age.sql for this exact fixture only.',
      'Optional second fixture: while the schedule is disabled, root verifies auth-missing-preflight.sql; fault-auth-missing removes only that synthetic Auth account before enabling the scheduler.',
      'observe: prove background cleanup without a member bearer; root records Cron and worker aggregate readback.',
      'Root unschedules exact test job, removes dedicated Vault entries and verifies no running lease.',
      'cleanup: remove exact acknowledged synthetic remnants; root removes the completed private job, clears the owner-only dispatcher configuration row, and verifies scheduler teardown.',
    ], productionWrites: false, createsProviderAssets: false }, null, 2))
    return
  }
  assert(args.includes('--exclusive-scheduler-window'), 'Root must grant the exclusive scheduler window')
  const mode = args.find(arg => arg.startsWith('--mode='))?.slice(7)
  assert(['prepare', 'observe', 'cleanup', 'fault-auth-missing'].includes(mode), 'Choose prepare, observe, cleanup or fault-auth-missing')
  const target = loadHostedTestTarget(args)
  assert.equal(target.project, schedulerTestTarget.project)
  assert.equal(target.branchId, schedulerTestTarget.branchId)
  const client = key => createClient(target.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const admin = client(target.serviceKey)
  const rpc = async (name, parameters) => value(await admin.rpc(name, parameters), name)
  const status = () => rpc('get_legacy_account_deletion_reconciliation_status', {})
  let directory, fixture
  if (mode === 'prepare') {
    const initial = await status()
    assert.equal(initial.pending_jobs, 0, 'Another pending legacy job forbids this exclusive test')
    assert.equal(initial.leased_jobs, 0, 'Another worker lease forbids this exclusive test')
    const runId = randomUUID()
    directory = path.join(outputBase, `legacy-scheduler-${runId}`)
    await mkdir(directory, { recursive: true })
    fixture = { version: 1, purpose: 'exclusive-legacy-deletion-scheduler', project: target.project, branchId: target.branchId,
      runId, email: `qa.legacy-scheduler.${runId}@example.invalid`, startedAt: new Date().toISOString(),
      messageId: randomUUID(), reservationId: randomUUID(), sourceId: randomUUID(), initial, phase: 'creating', checks: [] }
    await save(directory, fixture)
    const password = `${randomBytes(32).toString('base64url')}Aa9!`
    const user = value(await admin.auth.admin.createUser({ email: fixture.email, password, email_confirm: true,
      user_metadata: { username: `qa_sched_${randomBytes(5).toString('hex')}`, qa_legacy_scheduler_run: runId } }), 'Create synthetic owner').user
    assert(user?.id)
    fixture.userId = user.id
    fixture.objectPath = `${user.id}/legacy-scheduler-${runId}/fixture.png`
    await save(directory, fixture)
    value(await admin.from('users').upsert({ id: user.id, email: fixture.email, username: `qa_sched_${randomBytes(5).toString('hex')}`, display_name: 'Synthetic scheduler acceptance' }), 'Create synthetic profile')
    const member = client(target.anonKey)
    const session = value(await member.auth.signInWithPassword({ email: fixture.email, password }), 'Sign in synthetic owner').session
    assert(session?.access_token)
    value(await member.storage.from('chat-uploads').upload(fixture.objectPath, png, { contentType: 'image/png', cacheControl: '0' }), 'Upload synthetic bytes')
    value(await member.from('messages').insert({ id: fixture.messageId, user_id: user.id, content: `legacy-scheduler-${runId}`, message_type: 'image',
      file_url: `${target.url}/storage/v1/object/public/chat-uploads/${fixture.objectPath}` }), 'Insert synthetic message')
    await rpc('reserve_bunny_upload', { target_reservation_id: fixture.reservationId, target_owner_id: user.id,
      target_library_id: '999999999', target_source_type: 'shadow_pin_image', target_source_id: fixture.sourceId })
    const response = await fetch(`${target.url}/functions/v1/delete-account`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { apikey: target.anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) })
    const body = await response.json()
    assert.equal(response.status, 503)
    assert.equal(body.retryable, true)
    assert.equal((await status()).pending_jobs, 1)
    fixture.phase = 'held'
    fixture.checks.push({ name: 'exact legacy request created a held authorized job', passed: true })
    await save(directory, fixture)
    await writeFile(path.join(directory, 'release-and-age.sql'), schedulerFixtureSql(fixture))
    await writeFile(path.join(directory, 'auth-missing-preflight.sql'), schedulerAuthMissingSql(fixture))
    console.log(JSON.stringify({ phase: fixture.phase, evidence: path.join(directory, 'fixture.json'), releaseSql: path.join(directory, 'release-and-age.sql') }))
    return
  }
  const requested = args.find(arg => arg.startsWith('--run-dir='))?.slice(10)
  assert(requested, 'An exact synthetic run directory is required')
  directory = path.resolve(requested)
  assert(path.dirname(directory) === outputBase && /^legacy-scheduler-[0-9a-f-]{36}$/.test(path.basename(directory)), 'Invalid synthetic run directory')
  fixture = validateSchedulerFixture(JSON.parse(await readFile(path.join(directory, 'fixture.json'), 'utf8')))
  assert.equal(path.basename(directory), `legacy-scheduler-${fixture.runId}`)
  if (mode === 'fault-auth-missing') {
    assert(args.includes('--scheduler-disabled-verified') && args.includes('--fault-preflight-verified'), 'Root must verify the exact SQL fault preflight with the schedule disabled')
    fixture.faultInjection = await injectSchedulerAuthMissing({ fixture, admin, status })
    fixture.phase = 'auth-missing'
    fixture.checks.push({ name: 'deliberate synthetic Auth404 leaves the already-authorized job pending', passed: true })
    await save(directory, fixture)
    console.log(JSON.stringify({ phase: fixture.phase, faultInjection: fixture.faultInjection, evidence: path.join(directory, 'fixture.json') }))
    return
  }
  if (mode === 'observe') {
    assert(['held', 'auth-missing'].includes(fixture.phase))
    const deadline = Date.now() + 4 * 60_000
    let latest
    while (Date.now() < deadline) {
      latest = await status()
      if (latest.pending_jobs === 0 && latest.leased_jobs === 0 && latest.total_attempts > fixture.initial.total_attempts
        && latest.completed_jobs > fixture.initial.completed_jobs
        && Date.parse(latest.last_finished_at) >= Date.parse(latest.last_claimed_at)
        && Date.parse(latest.last_finished_at) >= Date.parse(fixture.startedAt)) break
      await new Promise(resolve => setTimeout(resolve, 10_000))
    }
    assert.equal(latest.pending_jobs, 0, 'Background deletion did not drain before the bounded test deadline')
    assert.equal(latest.leased_jobs, 0)
    assert(latest.total_attempts > fixture.initial.total_attempts)
    assert(latest.completed_jobs > fixture.initial.completed_jobs, 'The durable job must reach completed before cleanup is claimed')
    assert(Date.parse(latest.last_finished_at) >= Date.parse(latest.last_claimed_at), 'The worker must finish its final lease before teardown')
    assert(Date.parse(latest.last_finished_at) >= Date.parse(fixture.startedAt))
    const auth = await admin.auth.admin.getUserById(fixture.userId)
    assert.equal(auth.error?.status, 404, 'Only an explicit Auth404 proves account removal')
    assert.equal(value(await admin.from('users').select('id').eq('id', fixture.userId), 'Verify removed profile').length, 0)
    assert.equal(value(await admin.from('messages').select('id').eq('id', fixture.messageId), 'Verify removed message').length, 0)
    assert.equal(value(await admin.storage.from('chat-uploads').list(`${fixture.userId}/legacy-scheduler-${fixture.runId}`), 'Verify removed bytes').length, 0)
    fixture.phase = 'drained'; fixture.final = latest
    fixture.checks.push({ name: fixture.faultInjection
      ? 'scheduled worker completed an already-authorized job after deliberate synthetic Auth404 without member interaction'
      : 'scheduled worker removed Auth, profile, message and bytes without member interaction', passed: true })
    await save(directory, fixture)
    console.log(JSON.stringify({ phase: fixture.phase, evidence: path.join(directory, 'fixture.json'), totalAttempts: latest.total_attempts }))
    return
  }
  assert(args.includes('--scheduler-disabled-verified'), 'Root must verify schedule teardown and no active lease before fixture cleanup')
  assert.equal((await status()).leased_jobs, 0, 'An active worker prevents cleanup')
  const existing = await admin.auth.admin.getUserById(fixture.userId)
  if (existing.data?.user) {
    assert.equal(existing.data.user.email, fixture.email)
    assert.equal(existing.data.user.user_metadata.qa_legacy_scheduler_run, fixture.runId)
  } else assert.equal(existing.error?.status, 404)
  value(await admin.from('messages').delete().eq('id', fixture.messageId).eq('user_id', fixture.userId).eq('content', `legacy-scheduler-${fixture.runId}`), 'Remove exact fixture message')
  value(await admin.storage.from('chat-uploads').remove([fixture.objectPath]), 'Remove exact fixture bytes')
  if (existing.data?.user) value(await admin.auth.admin.deleteUser(fixture.userId), 'Remove exact fixture Auth')
  assert.equal((await admin.auth.admin.getUserById(fixture.userId)).error?.status, 404)
  assert.equal(value(await admin.from('users').select('id').eq('id', fixture.userId), 'Verify fixture profile cleanup').length, 0)
  assert.equal(value(await admin.from('messages').select('id').eq('id', fixture.messageId), 'Verify fixture message cleanup').length, 0)
  assert.equal(value(await admin.storage.from('chat-uploads').list(`${fixture.userId}/legacy-scheduler-${fixture.runId}`), 'Verify fixture bytes cleanup').length, 0)
  fixture.cleanup = { appRowsAndAuthVerified: true, privateJobAndSchedulerRequireRootReadback: true, verifiedAt: new Date().toISOString() }
  await save(directory, fixture)
  console.log(JSON.stringify({ cleanup: fixture.cleanup, evidence: path.join(directory, 'fixture.json') }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await run(process.argv.slice(2)) }
  catch { console.error('Synthetic scheduler proof stopped; no credential-bearing errors are printed. Inspect the exact run manifest and complete scoped cleanup.'); process.exitCode = 1 }
}
