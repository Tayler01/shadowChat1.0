import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectStorageUploadLimits } from '../scripts/verify-storage-upload-limits.mjs'

const MIB = 1024 * 1024
const buckets = [
  ['avatars', 10, true], ['banners', 25, true], ['chat-uploads', 64, true],
  ['message-media', 10, true], ['shadow-pin', 15, true], ['shadow-pin-comments', 50, false],
].map(([id, max, publicBucket]) => ({ id, file_size_limit: max * MIB, public: publicBucket }))

test('preflight detects global cap drift even when bucket and client allow 64 MiB', () => {
  const result = inspectStorageUploadLimits({ fileSizeLimit: 50 * MIB }, buckets)
  assert.equal(result.failures.length, 1)
  assert.equal(result.buckets.find(row => row.id === 'chat-uploads').effectiveMaxBytes, 50 * MIB)
})

test('aligned global cap retains smaller private Pins comment and image contracts', () => {
  const result = inspectStorageUploadLimits({ fileSizeLimit: 64 * MIB }, buckets)
  assert.deepEqual(result.failures, [])
  assert.equal(result.buckets.find(row => row.id === 'shadow-pin-comments').effectiveMaxBytes, 50 * MIB)
  assert.equal(result.buckets.find(row => row.id === 'shadow-pin-comments').public, false)
  assert.equal(result.buckets.find(row => row.id === 'shadow-pin').effectiveMaxBytes, 15 * MIB)
})

test('missing metadata and unexpected bucket visibility/cap fail closed', () => {
  const changed = buckets.map(row => row.id === 'shadow-pin-comments' ? { ...row, public: true } : row)
  assert.equal(inspectStorageUploadLimits({ fileSizeLimit: 64 * MIB }, changed).failures.length, 1)
  assert.equal(inspectStorageUploadLimits({}, []).failures.length, 7)
})
