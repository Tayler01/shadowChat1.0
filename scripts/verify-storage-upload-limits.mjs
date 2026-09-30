import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAT_UPLOAD_MAX_BYTES } from '../src/lib/uploadLimits.ts'

const MIB = 1024 * 1024
const bucketContracts = [
  ['avatars', 10 * MIB, true], ['banners', 25 * MIB, true],
  ['chat-uploads', CHAT_UPLOAD_MAX_BYTES, true], ['message-media', 10 * MIB, true],
  ['shadow-pin', 15 * MIB, true], ['shadow-pin-comments', 50 * MIB, false],
]

export function inspectStorageUploadLimits(config, buckets) {
  const failures = []
  const globalMaxBytes = config?.fileSizeLimit
  if (!Number.isSafeInteger(globalMaxBytes) || globalMaxBytes < CHAT_UPLOAD_MAX_BYTES) {
    failures.push('Global Storage cap is below the chat upload contract or unavailable')
  }
  const results = bucketContracts.map(([id, expectedBytes, expectedPublic]) => {
    const bucket = buckets.find(row => row.id === id)
    if (!bucket || bucket.file_size_limit !== expectedBytes || bucket.public !== expectedPublic) {
      failures.push(`${id}: bucket cap or visibility differs from its reviewed contract`)
    }
    return { id, bucketMaxBytes: bucket?.file_size_limit ?? null,
      effectiveMaxBytes: bucket ? Math.min(globalMaxBytes, bucket.file_size_limit) : null,
      public: bucket?.public ?? null }
  })
  return { globalMaxBytes, chatContractBytes: CHAT_UPLOAD_MAX_BYTES, buckets: results, failures }
}

export async function verifyStorageUploadLimits() {
  const ref = process.env.SUPABASE_PROJECT_REF?.trim()
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  if (!ref || !/^[a-z0-9]{20}$/.test(ref) || !token) {
    throw new Error('SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are required')
  }
  const get = async path => {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/${path}`, {
      method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`Storage preflight request failed with HTTP ${response.status}`)
    return response.json()
  }
  const [config, buckets] = await Promise.all([get('config/storage'), get('storage/buckets')])
  if (!Array.isArray(buckets)) throw new Error('Storage bucket metadata is unavailable')
  return { project: ref, ...inspectStorageUploadLimits(config, buckets) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyStorageUploadLimits()
    console.log(JSON.stringify(result))
    if (result.failures.length) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Storage preflight failed')
    process.exitCode = 1
  }
}
