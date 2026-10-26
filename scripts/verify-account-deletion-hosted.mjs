/** Destructive synthetic QA is hard-bound to the disposable no-data branch. */
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { loadHostedTestTarget } from './hosted-test-target.mjs'
import { runModerationRetention } from './moderation-retention-core.mjs'

const { project, url, branch, serviceKey, anonKey } = loadHostedTestTarget(process.argv.slice(2))
const reviewOnly = process.argv.includes('--review-only')
const legacyOnly = process.argv.includes('--legacy-only')
assert(!(reviewOnly && legacyOnly), 'Select only one focused acceptance mode')
const runName = `deletion-${Date.now()}`
const output = path.resolve('output/privacy', runName)
await mkdir(output, { recursive: true })
const secrets = [serviceKey, anonKey]
const makeClient = key => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const admin = makeClient(serviceKey)
const summary = { project, branch, runName, mode: legacyOnly ? 'legacy-only' : reviewOnly ? 'review-only' : 'complete', startedAt: new Date().toISOString(), checks: [], fixtures: { users: [], roles: [], objects: [], messages: [], reports: [], cases: [], reservations: [] }, cleanup: { verified: false, errors: [] } }
const safeError = error => {
  let result = error?.message || String(error)
  for (const secret of secrets) if (secret) result = result.split(secret).join('[redacted]')
  return result.replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[redacted-token]').slice(0, 1800)
}
const save = () => writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2))
const value = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data }
const rpc = async (name, args) => value(await admin.rpc(name, args), name)
const check = async (name, action) => {
  try { const detail = await action(); summary.checks.push({ name, passed: true, detail }); console.log(`PASS ${name}`) }
  catch (error) { summary.checks.push({ name, passed: false, error: safeError(error) }); throw error }
  finally { await save() }
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY4kAAAAASUVORK5CYII=', 'base64')
const buckets = ['avatars', 'banners', 'message-media', 'chat-uploads', 'art-board', 'shadow-pin', 'shadow-pin-comments', 'shadow-pin-drafts', 'shado-tv', 'feedback-attachments']
const receipt = randomBytes(32).toString('base64url')
secrets.push(receipt)
let owner, reporter, retained = []
async function createMember(label) {
  const password = randomBytes(32).toString('base64url') + 'Aa9!'
  const email = `qa.${runName}.${label}@example.invalid`
  secrets.push(password)
  const user = value(await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { username: `qa_del_${randomBytes(5).toString('hex')}`, display_name: 'Synthetic deletion acceptance' } }), 'Create synthetic member').user
  assert(user?.id)
  summary.fixtures.users.push(user.id); await save()
  value(await admin.from('users').upsert({ id: user.id, email, username: `qa_del_${randomBytes(5).toString('hex')}`, display_name: 'Synthetic deletion acceptance' }), 'Create profile')
  const client = makeClient(anonKey)
  const session = value(await client.auth.signInWithPassword({ email, password }), 'Sign in synthetic member').session
  assert(session?.access_token)
  secrets.push(session.access_token, session.refresh_token)
  return { id: user.id, client, token: session.access_token }
}
async function requestDeletion(token, expectedUserId, suppliedReceipt = receipt) {
  const response = await fetch(`${url}/functions/v1/delete-account`, { method: 'POST', headers: {
    apikey: anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify({ confirm: 'DELETE', receipt: suppliedReceipt, expectedUserId }), signal: AbortSignal.timeout(60_000) })
  return { status: response.status, body: await response.json() }
}
async function requestLegacyDeletion(token, body = { confirm: 'DELETE' }) {
  const response = await fetch(`${url}/functions/v1/delete-account`, { method: 'POST', headers: {
    apikey: anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000), redirect: 'error' })
  return { status: response.status, body: await response.json() }
}
async function legacyJob(token) {
  const digest = createHash('sha256').update(`legacy-delete-bearer:v1:${token}`).digest('hex')
  secrets.push(digest)
  return rpc('get_legacy_account_deletion_job', { request_bearer_digest: digest })
}
async function runLegacyOnly() {
  owner = await createMember('legacy-owner')
  reporter = await createMember('legacy-unrelated')
  const object = { bucket: 'chat-uploads', path: `${owner.id}/${runName}/legacy.png` }
  summary.fixtures.objects.push(object); await save()
  value(await owner.client.storage.from(object.bucket).upload(object.path, png, { contentType: 'image/png', cacheControl: '0' }), 'Upload legacy source')
  const messageId = randomUUID(), survivingMessage = randomUUID()
  summary.fixtures.messages.push(messageId, survivingMessage); await save()
  value(await owner.client.from('messages').insert({ id: messageId, user_id: owner.id, content: runName, message_type: 'image', file_url: `${url}/storage/v1/object/public/${object.bucket}/${object.path}` }), 'Insert legacy source')
  value(await reporter.client.from('messages').insert({ id: survivingMessage, user_id: reporter.id, content: runName, message_type: 'text' }), 'Insert unrelated legacy fixture')
  await check('exact legacy requests reject absent and unbound invalid authentication', async () => {
    for (const token of [null, `invalid.${randomBytes(12).toString('hex')}`]) {
      const response = await requestLegacyDeletion(token)
      assert.equal(response.status, 401); assert.equal(response.body.deletionStarted, false)
    }
    assert.equal(await legacyJob(owner.token), null)
    assert.equal(value(await admin.auth.admin.getUserById(owner.id), 'Verify untouched legacy owner').user.id, owner.id)
  })
  await check('identity fields and incomplete receipts never fall back to legacy deletion', async () => {
    for (const body of [{ confirm: 'DELETE', expectedUserId: reporter.id }, { confirm: 'DELETE', userId: reporter.id }, { confirm: 'DELETE', receipt }]) {
      assert.equal((await requestLegacyDeletion(owner.token, body)).status, 400)
    }
    assert.equal(await legacyJob(owner.token), null)
    assert.equal(value(await admin.auth.admin.getUserById(reporter.id), 'Verify unrelated account').user.id, reporter.id)
  })
  const reservationId = randomUUID()
  summary.fixtures.reservations.push(reservationId); await save()
  await rpc('reserve_bunny_upload', { target_reservation_id: reservationId, target_owner_id: owner.id, target_library_id: '999999999', target_source_type: 'shadow_pin_image', target_source_id: randomUUID() })
  await check('legacy partial cleanup preserves Auth and the old client forced-refresh prerequisite', async () => {
    const response = await requestLegacyDeletion(owner.token)
    assert.equal(response.status, 503); assert.equal(response.body.retryable, true)
    assert.equal((await legacyJob(owner.token)).state, 'requested')
    assert.equal(value(await owner.client.auth.getUser(), 'Verify retained legacy Auth').user.id, owner.id)
    const refreshed = value(await owner.client.auth.refreshSession(), 'Refresh legacy session during partial cleanup').session
    assert.equal(refreshed?.user.id, owner.id)
    assert(refreshed?.access_token)
    secrets.push(refreshed.access_token, refreshed.refresh_token)
    owner.refreshedToken = refreshed.access_token
  })
  // This fixture never calls the external provider. Reconcile only its exact
  // pending reservation before retrying the unchanged old request body.
  await rpc('finish_bunny_upload', { target_reservation_id: reservationId, cleanup_confirmed: true })
  await check('the unchanged legacy request removes its own uploads, content and Auth after refresh', async () => {
    const response = await requestLegacyDeletion(owner.refreshedToken)
    assert.equal(response.status, 200); assert.equal(response.body.ok, true)
    const auth = await admin.auth.admin.getUserById(owner.id)
    assert(auth.error && !auth.data?.user)
    assert.equal(value(await admin.from('users').select('id').eq('id', owner.id), 'Verify removed legacy profile').length, 0)
    assert.equal(value(await admin.from('messages').select('id').eq('id', messageId), 'Verify removed legacy message').length, 0)
    assert.equal(value(await admin.from('messages').select('id').eq('id', survivingMessage), 'Verify preserved unrelated message').length, 1)
    assert.equal(value(await admin.storage.from(object.bucket).list(`${owner.id}/${runName}`), 'Verify removed legacy bytes').length, 0)
    assert.equal(value(await admin.auth.admin.getUserById(reporter.id), 'Verify preserved unrelated Auth').user.id, reporter.id)
  })
  await check('server replay of a discarded legacy success is idempotent after Auth removal', async () => {
    // Model a lost success response by replaying the already-bound token. This
    // proves endpoint behavior; the old client force-refresh cannot reach this
    // request after Auth removal, which requires the service reconciler.
    for (const token of [owner.token, owner.refreshedToken]) {
      const response = await requestLegacyDeletion(token)
      assert.equal(response.status, 200); assert.deepEqual(response.body, { ok: true })
      assert.deepEqual(await legacyJob(token), { user_id: owner.id, state: 'completed', manifest: {} })
    }
  })
  await check('another valid legacy caller can only remove its own account', async () => {
    const response = await requestLegacyDeletion(reporter.token)
    assert.equal(response.status, 200); assert.equal(response.body.ok, true)
    assert.deepEqual(await legacyJob(reporter.token), { user_id: reporter.id, state: 'completed', manifest: {} })
    assert.deepEqual(await legacyJob(owner.token), { user_id: owner.id, state: 'completed', manifest: {} })
    assert.equal(value(await admin.from('messages').select('id').eq('id', survivingMessage), 'Verify second legacy caller cleanup').length, 0)
  })
}
async function purgeSyntheticCase(caseId) {
  assert(summary.fixtures.cases.includes(caseId), 'Only this run-created case may be purged')
  const existing = value(await admin.from('moderation_cases').select('id').eq('id', caseId), 'Read exact synthetic case')
  if (!existing.length) return
  const previous = await admin.rpc('authorize_moderation_retention_batch', { target_case_id: caseId })
  if (!previous.data?.committed_at) {
    value(await admin.from('moderation_cases').update({ status: 'closed', resolved_at: '2020-01-01T00:00:00Z' }).eq('id', caseId), 'Close exact synthetic case for cleanup')
    await rpc('prepare_moderation_retention_purge', { target_case_ids: [caseId], dry_run: false })
    await check('reopening the exact synthetic case cancels removal before commitment', async () => {
      value(await admin.from('moderation_cases').update({ status: 'investigating' }).eq('id', caseId), 'Reopen exact synthetic case')
      const denied = await admin.rpc('claim_moderation_retention_purge', { target_case_id: caseId })
      assert(denied.error, 'A reopened case must not receive removal claims')
      assert.match(denied.error.message, /cancelled|eligibility/i)
    })
    value(await admin.from('moderation_cases').update({ status: 'closed', resolved_at: '2020-01-01T00:00:00Z' }).eq('id', caseId), 'Close exact synthetic case after negative check')
  }
  await runModerationRetention({
    execute: true, caseIds: [caseId],
    rpc: async (name, args) => {
      const result = await rpc(name, args)
      if (name === 'claim_moderation_retention_purge') {
        assert.equal(result.case_id, caseId)
        assert.equal(result.bunny_assets.length, 0, 'This test never owns external provider assets')
        await check('committed synthetic evidence removal rejects a late reopen', async () => {
          const denied = await admin.from('moderation_cases').update({ status: 'investigating' }).eq('id', caseId)
          assert(denied.error, 'Late reopen must not falsely promise preservation of in-flight evidence')
          assert.match(denied.error.message, /committed/i)
        })
      }
      return result
    },
    validateProvider: () => { throw new Error('Synthetic case cleanup cannot use external provider assets') },
    removeBunny: async () => { throw new Error('Synthetic case cleanup cannot call external providers') },
    removeStorage: async item => value(await admin.storage.from(item.bucket).remove([item.path]), 'Remove exact claimed synthetic evidence bytes'),
  })
  assert.equal(value(await admin.from('moderation_cases').select('id').eq('id', caseId), 'Verify case cleanup').length, 0)
}
async function runReviewOnly() {
  owner = await createMember('review-source')
  reporter = await createMember('review-reporter')
  const operator = await createMember('review-operator')
  summary.fixtures.roles.push({ userId: operator.id, role: 'sub_admin' }); await save()
  value(await admin.from('user_roles').insert({ user_id: operator.id, role: 'sub_admin' }), 'Assign exact synthetic case reviewer')
  const object = { bucket: 'chat-uploads', path: `${owner.id}/${runName}/review.png` }
  summary.fixtures.objects.push(object); await save()
  value(await owner.client.storage.from(object.bucket).upload(object.path, png, { contentType: 'image/png', cacheControl: '0' }), 'Upload review source')
  const messageId = randomUUID()
  summary.fixtures.messages.push(messageId); await save()
  value(await owner.client.from('messages').insert({ id: messageId, user_id: owner.id, content: runName, message_type: 'image',
    file_url: `${url}/storage/v1/object/public/${object.bucket}/${object.path}` }), 'Insert review source')
  const reports = value(await reporter.client.rpc('submit_member_report', { p_target_type: 'general_message', p_target_id: messageId,
    p_category: 'harassment', p_client_report_id: randomUUID(), p_details: 'Synthetic case review acceptance', p_attachments: [] }), 'Submit review fixture')
  const caseId = reports[0].case_id
  summary.fixtures.reports.push(reports[0].report_id); summary.fixtures.cases.push(caseId); await save()
  value(await admin.from('moderation_cases').update({ assigned_to: operator.id }).eq('id', caseId), 'Assign exact synthetic case')
  const review = async token => {
    const response = await fetch(`${url}/functions/v1/moderation-media`, { method: 'POST', headers: {
      apikey: anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }, body: JSON.stringify({ caseId }), signal: AbortSignal.timeout(30_000) })
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() }
  }
  await check('source account deletion completes before reviewer endpoint access', async () => {
    const response = await requestDeletion(owner.token, owner.id)
    assert.equal(response.status, 200); assert.equal(response.body.ok, true)
    assert((await admin.auth.admin.getUserById(owner.id)).error)
    assert.equal(value(await admin.from('messages').select('id').eq('id', messageId), 'Verify review source deletion').length, 0)
    assert.equal(value(await admin.storage.from(object.bucket).list(`${owner.id}/${runName}`), 'Verify review source bytes deletion').length, 0)
  })
  await check('assigned operator endpoint reviews exact retained bytes after source deletion', async () => {
    const response = await review(operator.token)
    assert.equal(response.status, 200); assert.equal(response.cache, 'no-store')
    assert.equal(response.body.assets.length, 1)
    const asset = response.body.assets[0]
    assert.equal(asset.status, 'ready'); assert.equal(asset.kind, 'image')
    const signed = new URL(asset.url)
    assert.equal(signed.origin, url)
    assert(signed.pathname.includes('/moderation-captured-media/captured/'))
    const bytes = await fetch(signed, { signal: AbortSignal.timeout(20_000) })
    assert.equal(bytes.status, 200)
    assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), png)
  })
  await check('reporter and anonymous callers cannot obtain evidence review URLs', async () => {
    for (const token of [reporter.token, null]) {
      const response = await review(token)
      assert([401, 403].includes(response.status))
      assert(!response.body.assets)
    }
  })
  await check('revoked case assignment stops the former operator endpoint', async () => {
    value(await admin.from('moderation_cases').update({ assigned_to: null }).eq('id', caseId), 'Remove exact synthetic assignment')
    const response = await review(operator.token)
    assert([401, 403].includes(response.status)); assert(!response.body.assets)
  })
}
try {
  if (legacyOnly) {
    await runLegacyOnly()
  } else if (reviewOnly) {
    await runReviewOnly()
  } else {
  owner = await createMember('owner')
  reporter = await createMember('reporter')
  const operator = await createMember('operator')
  assert.equal(value(await admin.from('user_roles').select('user_id').eq('role', 'admin'), 'Check empty synthetic admin role').length, 0)
  summary.fixtures.roles.push({ userId: operator.id, role: 'admin' }); await save()
  value(await admin.from('user_roles').insert({ user_id: operator.id, role: 'admin' }), 'Assign exact synthetic admin role')
  await check('full admin deletion is refused before any deletion job starts', async () => {
    const operatorReceipt = randomBytes(32).toString('base64url'); secrets.push(operatorReceipt)
    const response = await requestDeletion(operator.token, operator.id, operatorReceipt)
    assert.equal(response.status, 403); assert.equal(response.body.deletionStarted, false)
    assert.match(response.body.error, /Transfer full admin/)
    assert.equal(value(await operator.client.auth.getUser(), 'Verify protected admin still exists').user.id, operator.id)
  })
  for (const bucket of buckets) {
    const object = { bucket, path: `${owner.id}/${runName}/fixture.png` }
    summary.fixtures.objects.push(object); await save()
    value(await (bucket === 'chat-uploads' ? owner.client : admin).storage.from(bucket).upload(object.path, png, { contentType: 'image/png', cacheControl: '0' }), `Upload ${bucket}`)
  }
  const image = summary.fixtures.objects.find(object => object.bucket === 'chat-uploads')
  const messageId = randomUUID(), survivingMessage = randomUUID()
  summary.fixtures.messages.push(messageId, survivingMessage); await save()
  value(await owner.client.from('messages').insert({ id: messageId, user_id: owner.id, content: runName, message_type: 'image', file_url: `${url}/storage/v1/object/public/${image.bucket}/${image.path}` }), 'Insert reported fixture')
  value(await reporter.client.from('messages').insert({ id: survivingMessage, user_id: reporter.id, content: runName, message_type: 'text' }), 'Insert surviving fixture')
  await check('report captures only the visible exact source media', async () => {
    const reports = value(await reporter.client.rpc('submit_member_report', { p_target_type: 'general_message', p_target_id: messageId, p_category: 'harassment', p_client_report_id: randomUUID(), p_details: 'Synthetic verification report', p_attachments: [] }), 'Submit fixture report')
    summary.fixtures.reports.push(reports[0].report_id); summary.fixtures.cases.push(reports[0].case_id)
    retained = await rpc('get_pending_moderation_media_for_owner', { target_user_id: owner.id })
    assert.equal(retained.length, 1)
    assert.equal(retained[0].source_path, image.path)
    assert.equal(retained[0].source_bucket, image.bucket)
  })
  await check('anonymous request cannot start deletion and account mismatch is rejected', async () => {
    const anonymous = await requestDeletion(null, owner.id)
    assert.equal(anonymous.status, 401); assert.equal(anonymous.body.deletionStarted, false)
    const switched = await requestDeletion(reporter.token, owner.id)
    assert.equal(switched.status, 409); assert.equal(switched.body.deletionStarted, false)
  })
  const reservationId = randomUUID()
  summary.fixtures.reservations.push(reservationId); await save()
  await rpc('reserve_bunny_upload', { target_reservation_id: reservationId, target_owner_id: owner.id, target_library_id: '999999999', target_source_type: 'shadow_pin_image', target_source_id: randomUUID() })
  await check('unknown provider create keeps deletion incomplete after evidence capture', async () => {
    const response = await requestDeletion(owner.token, owner.id)
    assert.equal(response.status, 503); assert.equal(response.body.retryable, true)
    assert.notEqual(response.body.ok, true)
    assert.equal((await rpc('get_pending_moderation_media_for_owner', { target_user_id: owner.id })).length, 0)
    const file = value(await admin.storage.from(retained[0].storage_bucket).download(retained[0].storage_path), 'Download captured evidence')
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), png)
  })
  await check('pending deletion revokes issued JWT table, RPC and new upload access', async () => {
    const rows = await owner.client.from('messages').select('id').limit(1)
    assert(rows.error || rows.data?.length === 0)
    const conversations = await owner.client.rpc('get_dm_conversations')
    assert.equal(conversations.error?.code, '42501', 'Existing RPC is denied by the active-member request gate')
    const upload = await owner.client.storage.from('chat-uploads').upload(`${owner.id}/${runName}/late.png`, png, { contentType: 'image/png' })
    assert(upload.error)
    const retry = await requestDeletion(null, owner.id)
    assert.equal(retry.status, 503, 'Completion-only receipt reaches handler without an Auth JWT')
  })
  // No external create was made: this reservation intentionally models response
  // uncertainty, then is explicitly reconciled as no provider asset.
  await rpc('finish_bunny_upload', { target_reservation_id: reservationId, cleanup_confirmed: true })
  await check('anonymous receipt retry completes all ten buckets and Auth removal', async () => {
    const response = await requestDeletion(null, owner.id)
    assert.equal(response.status, 200); assert.equal(response.body.ok, true)
    const auth = await admin.auth.admin.getUserById(owner.id)
    assert(auth.error && !auth.data?.user)
    assert.equal(value(await admin.from('users').select('id').eq('id', owner.id), 'Verify removed profile').length, 0)
    assert.equal(value(await admin.from('messages').select('id').eq('id', messageId), 'Verify removed message').length, 0)
    assert.equal(value(await admin.from('messages').select('id').eq('id', survivingMessage), 'Verify unrelated message').length, 1)
    for (const object of summary.fixtures.objects) {
      const found = value(await admin.storage.from(object.bucket).list(`${owner.id}/${runName}`), 'Verify file cleanup')
      assert.equal(found.length, 0, object.bucket)
    }
  })
  await check('retained evidence stays private and completed receipt is idempotent', async () => {
    const file = value(await admin.storage.from(retained[0].storage_bucket).download(retained[0].storage_path), 'Read retained fixture')
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), png)
    const signed = await reporter.client.storage.from(retained[0].storage_bucket).createSignedUrl(retained[0].storage_path, 30)
    assert(signed.error && !signed.data?.signedUrl, 'Reporter does not become a case reviewer')
    const repeat = await requestDeletion(null, owner.id)
    assert.equal(repeat.status, 200); assert.equal(repeat.body.ok, true)
  })
  await check('reviewed retention cleanup removes only the synthetic closed case and evidence', async () => {
    for (const caseId of summary.fixtures.cases) await purgeSyntheticCase(caseId)
    for (const asset of retained) {
      const listing = value(await admin.storage.from(asset.storage_bucket).list(`captured/${asset.case_id}`), 'Verify captured bytes cleanup')
      assert(!listing.some(file => file.name === asset.id))
    }
  })
  }
} catch (error) { summary.error = safeError(error); process.exitCode = 1 }
finally {
  const cleanup = async (name, action) => { try { await action() } catch (error) { summary.cleanup.errors.push({ name, error: safeError(error) }); process.exitCode = 1 } }
  for (const caseId of summary.fixtures.cases) await cleanup(`case ${caseId}`, () => purgeSyntheticCase(caseId))
  for (const id of summary.fixtures.reservations) await cleanup(`reservation ${id}`, () => rpc('finish_bunny_upload', { target_reservation_id: id, cleanup_confirmed: true }))
  if (owner) await cleanup('complete owner deletion', async () => {
    const auth = await admin.auth.admin.getUserById(owner.id)
    if (auth.data?.user) { const result = await requestDeletion(owner.token, owner.id); assert.equal(result.body.ok, true) }
  })
  if (summary.fixtures.messages.length) await cleanup('messages', async () => {
    value(await admin.from('messages').delete().in('id', summary.fixtures.messages), 'Remove exact fixture messages')
    assert.equal(value(await admin.from('messages').select('id').in('id', summary.fixtures.messages), 'Verify messages').length, 0)
  })
  for (const object of summary.fixtures.objects) await cleanup(`file ${object.bucket}`, async () => value(await admin.storage.from(object.bucket).remove([object.path]), 'Remove exact fixture file'))
  for (const { userId, role } of summary.fixtures.roles) await cleanup(`role ${userId}`, async () => value(await admin.from('user_roles').delete().eq('user_id', userId).eq('role', role), 'Remove exact synthetic operator role'))
  for (const id of summary.fixtures.users) await cleanup(`Auth ${id}`, async () => {
    const existing = await admin.auth.admin.getUserById(id)
    if (existing.data?.user) value(await admin.auth.admin.deleteUser(id), 'Remove exact fixture Auth user')
    const checked = await admin.auth.admin.getUserById(id)
    assert(checked.error && !checked.data?.user)
  })
  summary.cleanup.verified = summary.cleanup.errors.length === 0
  summary.finishedAt = new Date().toISOString(); await save()
  console.log(JSON.stringify({ project, checksPassed: summary.checks.filter(item => item.passed).length,
    checksFailed: summary.checks.filter(item => !item.passed).length, cleanup: summary.cleanup, error: summary.error ?? null,
    evidence: path.join(output, 'summary.json') }))
}
