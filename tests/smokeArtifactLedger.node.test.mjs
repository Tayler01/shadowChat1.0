import assert from 'node:assert/strict'
import test from 'node:test'
import { createSmokeArtifactLedger, recordSmokeArtifactRequest, ownedSmokeStoragePaths } from '../scripts/smoke-artifact-ledger.mjs'

const origin = 'https://test.supabase.co'
const owner = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
test('cleanup tracks exact insert identifiers and ignores other origins and reads', () => {
  const ledger = createSmokeArtifactLedger(origin)
  const request = { url: `${origin}/rest/v1/messages`, method: 'POST', body: JSON.stringify({ client_message_id: clientId }) }
  recordSmokeArtifactRequest(ledger, { ...request, url: 'https://other.supabase.co/rest/v1/messages' })
  recordSmokeArtifactRequest(ledger, { ...request, method: 'GET' })
  assert.equal(ledger.messages.size, 0)
  recordSmokeArtifactRequest(ledger, request)
  assert.deepEqual([...ledger.messages], [clientId])
  recordSmokeArtifactRequest(ledger, { ...request, body: '{}' })
  assert.equal(ledger.untrackedInserts, 1)
})
test('direct and resumable uploads retain exact paths, including unreferenced failed sends', () => {
  const ledger = createSmokeArtifactLedger(origin)
  recordSmokeArtifactRequest(ledger, { url: `${origin}/storage/v1/object/chat-uploads/${owner}/photo.png`, method: 'POST' })
  const encode = value => Buffer.from(value).toString('base64')
  recordSmokeArtifactRequest(ledger, { url: 'https://test.storage.supabase.co/storage/v1/upload/resumable', method: 'POST', headers: { 'upload-metadata': `bucketName ${encode('message-media')},objectName ${encode(`${owner}/voice.webm`)}` } })
  const paths = ownedSmokeStoragePaths(ledger, [owner])
  assert.deepEqual([...paths.get('chat-uploads')], [`${owner}/photo.png`])
  assert.deepEqual([...paths.get('message-media')], [`${owner}/voice.webm`])
  assert.throws(() => ownedSmokeStoragePaths(ledger, ['another-account']), /outside/)
})
