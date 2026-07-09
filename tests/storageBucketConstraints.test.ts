import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHAT_UPLOAD_MIME_TYPES,
  MESSAGE_MEDIA_MIME_TYPES,
  PROFILE_IMAGE_MIME_TYPES,
} from '../src/lib/uploadLimits'

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260709220428_storage_bucket_constraints.sql'),
  'utf8'
)

const bucketUpdate = (bucket: string) => {
  const match = migration.match(new RegExp(
    `UPDATE storage\\.buckets[\\s\\S]*?WHERE id = '${bucket}';`
  ))
  if (!match) throw new Error(`Missing ${bucket} bucket update`)
  return match[0]
}

describe('storage bucket constraints migration', () => {
  test.each([
    ['avatars', 10485760, PROFILE_IMAGE_MIME_TYPES],
    ['banners', 26214400, PROFILE_IMAGE_MIME_TYPES],
    ['message-media', 10485760, MESSAGE_MEDIA_MIME_TYPES],
    ['chat-uploads', 67108864, CHAT_UPLOAD_MIME_TYPES],
  ] as const)('%s has its product-aligned size and MIME constraints', (bucket, maxBytes, mimeTypes) => {
    const update = bucketUpdate(bucket)
    expect(update).toContain(`file_size_limit = ${maxBytes}`)
    for (const mimeType of mimeTypes) {
      expect(update).toContain(`'${mimeType}'`)
    }
  })

  test('fails closed when a required bucket is absent', () => {
    expect(migration).toContain('Required storage buckets are missing')
  })
})
