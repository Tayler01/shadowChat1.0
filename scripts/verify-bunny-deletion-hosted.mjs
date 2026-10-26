/** Creates one EMPTY provider-only QA record, then deletes only its returned GUID. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanupAccountProviders, createBunnyVideoDeletionProvider } from '../supabase/functions/_shared/account-deletion-providers.ts'

assert(process.argv.includes('--execute'), 'Explicit provider-test execution is required')
assert(globalThis.Deno?.version?.deno, 'Run through Deno to exercise the Edge-compatible default fetch transport')
const libraryId = process.argv.find(arg => arg.startsWith('--library-id='))?.slice(13)
assert.equal(libraryId, '666331', 'Only the existing approved library is allowed')
const source = await readFile('.env', 'utf8')
const configured = Object.fromEntries(source.split(/\r?\n/).flatMap(line => {
  const match = /^\s*(BUNNY_STREAM_LIBRARY_ID|BUNNY_STREAM_API_KEY)\s*=\s*(.*?)\s*$/.exec(line)
  if (!match) return []
  let value = match[2]
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  return [[match[1], value.trim()]]
}))
assert.equal(configured.BUNNY_STREAM_LIBRARY_ID, libraryId)
const key = configured.BUNNY_STREAM_API_KEY
assert(key && !/[\r\n]/.test(key), 'The existing Stream API credential is required')
const operationId = randomUUID()
const title = `SHADOWCHAT_QA_EMPTY_DELETE_${operationId}`
const output = path.resolve('output/privacy/provider-cleanup', `${operationId}.json`)
await mkdir(path.dirname(output), { recursive: true })
const evidence = { operationId, libraryId, title, startedAt: new Date().toISOString(), runtime: 'Deno default fetch',
  uploadedBytes: 0, directAppWrites: 0, providerSettingChanges: 0, createdGuid: null, checks: [], cleanup: { verified: false }, error: null }
const save = () => writeFile(output, JSON.stringify(evidence, null, 2))
const safeError = error => String(error?.message || error).split(key).join('[redacted]').replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[redacted-token]').slice(0, 600)
const checks = async (name, action) => {
  try { const detail = await action(); evidence.checks.push({ name, passed: true, ...(detail ? { detail } : {}) }) }
  catch (error) { evidence.checks.push({ name, passed: false, error: safeError(error) }); throw error }
  finally { await save() }
}
const base = `https://video.bunnycdn.com/library/${libraryId}/videos`
const request = (target, method = 'GET', body) => fetch(target, { method, redirect: 'error', headers: {
  AccessKey: key, ...(body ? { 'Content-Type': 'application/json' } : {}),
}, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000) })
const remove = createBunnyVideoDeletionProvider(() => ({ libraryId, apiKey: key }))
let createdGuid = null
const exactDelete = async () => {
  assert(createdGuid && createdGuid === evidence.createdGuid, 'Only the returned allowlisted QA GUID may be deleted')
  const statuses = []
  await cleanupAccountProviders({
    deleteBunnyVideo: async (library, guid) => {
      assert.equal(library, libraryId); assert.equal(guid, createdGuid)
      const result = await remove(library, guid)
      statuses.push(result.status)
      return result
    },
    removeLiveParticipant: async () => { throw new Error('This test cannot access LiveKit') },
    deleteLiveRoom: async () => { throw new Error('This test cannot access LiveKit') },
  }, { version: 1, storage: [], bunny_assets: [{ library_id: libraryId, asset_id: createdGuid }],
    unsupported_provider_assets: [], live_rooms: [], live_memberships: [] }, operationId)
  return statuses
}
const verifyAbsent = async () => {
  assert(createdGuid && createdGuid === evidence.createdGuid)
  const result = await request(`${base}/${createdGuid}`)
  await result.body?.cancel()
  assert.equal(result.status, 404, 'Exact provider GET must confirm removal')
  evidence.cleanup.verified = true
  return { status: result.status }
}
await save() // Durable marker exists before the one provider create request.
try {
  await checks('create one empty clearly labeled QA record', async () => {
    const result = await request(base, 'POST', { title })
    assert(result.ok, `Provider create returned HTTP ${result.status}`)
    const record = await result.json()
    assert.match(record.guid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    createdGuid = record.guid
    evidence.createdGuid = createdGuid
    await save() // Persist only the GUID, never credentials or response bodies.
    assert.equal(String(record.videoLibraryId), libraryId)
    assert.equal(record.title, title)
    return { status: result.status }
  })
  await checks('confirm only the returned empty record before deletion', async () => {
    const result = await request(`${base}/${createdGuid}`)
    assert.equal(result.status, 200)
    const record = await result.json()
    assert.equal(record.guid, createdGuid); assert.equal(record.title, title)
    assert.equal(String(record.videoLibraryId), libraryId)
    assert.equal(record.storageSize, 0); assert.equal(record.length, 0)
    return { status: result.status, storageSize: record.storageSize, length: record.length }
  })
  await checks('actual account deletion helper removes the exact provider record', async () => ({ statuses: await exactDelete() }))
  await checks('exact provider GET confirms 404 after helper deletion', verifyAbsent)
  await checks('repeat helper cleanup accepts already absent provider record', async () => ({ statuses: await exactDelete() }))
  await checks('final exact provider GET still confirms 404', verifyAbsent)
} catch (error) {
  evidence.error = safeError(error)
  process.exitCode = 1
} finally {
  if (createdGuid && !evidence.cleanup.verified) {
    try { await exactDelete(); await verifyAbsent() }
    catch (error) { evidence.cleanup.error = safeError(error); process.exitCode = 1 }
  }
  evidence.finishedAt = new Date().toISOString()
  await save()
  console.log(JSON.stringify({ libraryId, operationId, createdGuid, passed: evidence.checks.filter(check => check.passed).length,
    failed: evidence.checks.filter(check => !check.passed).length, cleanup: evidence.cleanup, error: evidence.error, evidence: output }))
}
