import {
  AccountDeletionStorageError,
  executeUserStorageCleanup,
  prepareUserStorageCleanup,
  USER_STORAGE_BUCKETS,
  type DeletionStorageClient,
} from '../supabase/functions/_shared/account-deletion'

const userId = '10000000-0000-0000-0000-000000000001'
type Entry = { id: string | null; name: string }

const fixture = (entries: Record<string, Entry[]> = {}) => {
  const removed: Array<{ bucket: string; paths: string[] }> = []
  const list = jest.fn(async (bucket: string, prefix: string, options: { offset: number; limit: number }) => ({
    data: (entries[`${bucket}/${prefix}`] ?? []).slice(options.offset, options.offset + options.limit),
    error: null as { message: string } | null,
  }))
  const remove = jest.fn(async (bucket: string, paths: string[]) => {
    removed.push({ bucket, paths })
    return { error: null as { message: string } | null }
  })
  const client: DeletionStorageClient = {
    storage: { from: bucket => ({
      list: (prefix, options) => list(bucket, prefix, options),
      remove: paths => remove(bucket, paths),
    }) },
  }
  return { client, list, remove, removed }
}

test('cleanup handles paginated nested uploads, comment attachments and drafts under only the member prefix', async () => {
  const files = Array.from({ length: 1002 }, (_, index) => ({ id: `file-${index}`, name: `${index}.jpg` }))
  const fx = fixture({
    [`chat-uploads/${userId}`]: [{ id: null, name: 'nested' }],
    [`chat-uploads/${userId}/nested`]: files,
    [`shadow-pin-comments/${userId}`]: [{ id: 'comment', name: 'attachment.png' }],
    [`shadow-pin-drafts/${userId}`]: [{ id: 'draft', name: 'draft.jpg' }],
  })
  const plan = await prepareUserStorageCleanup(fx.client, userId)
  expect(fx.remove).not.toHaveBeenCalled()
  await executeUserStorageCleanup(fx.client, plan)
  const allPaths = fx.removed.flatMap(entry => entry.paths)
  expect(allPaths).toHaveLength(1004)
  expect(allPaths.every(objectPath => objectPath.startsWith(`${userId}/`))).toBe(true)
  expect(fx.removed.every(entry => entry.paths.length <= 100)).toBe(true)
  expect(fx.removed.some(entry => entry.bucket === 'shadow-pin-comments')).toBe(true)
  expect(fx.removed.some(entry => entry.bucket === 'shadow-pin-drafts')).toBe(true)
  expect(fx.removed.some(entry => entry.bucket === 'moderation-evidence')).toBe(false)
})

test('a later bucket listing failure does not remove previously enumerated files', async () => {
  const fx = fixture({ [`avatars/${userId}`]: [{ id: 'profile', name: 'avatar.png' }] })
  fx.list.mockImplementation(async bucket => ({
    data: [], error: bucket === 'feedback-attachments' ? { message: 'private diagnostic' } : null,
  }))
  await expect(prepareUserStorageCleanup(fx.client, userId)).rejects.toMatchObject({
    partialDeletion: false,
    message: expect.not.stringContaining('private diagnostic'),
  })
  expect(fx.remove).not.toHaveBeenCalled()
})

test.each(['../other', 'nested/file', '..', '', 'nested\\file'])('malformed listing name %p fails before deletion', async name => {
  const fx = fixture({ [`avatars/${userId}`]: [{ id: 'bad', name }] })
  await expect(prepareUserStorageCleanup(fx.client, userId)).rejects.toBeInstanceOf(AccountDeletionStorageError)
  expect(fx.remove).not.toHaveBeenCalled()
})

test('removal failure reports possible partial completion and can be retried', async () => {
  const fx = fixture()
  const plan = [{ bucket: 'chat-uploads', paths: [`${userId}/a.jpg`, `${userId}/b.jpg`] }]
  fx.remove.mockResolvedValueOnce({ error: { message: 'private service diagnostic' } })
  await expect(executeUserStorageCleanup(fx.client, plan)).rejects.toMatchObject({
    partialDeletion: true,
    message: expect.stringContaining('Some uploaded files may already have been removed'),
  })
  await expect(executeUserStorageCleanup(fx.client, plan)).resolves.toBeUndefined()
})

test('invalid member ID cannot become a storage prefix', async () => {
  const fx = fixture()
  await expect(prepareUserStorageCleanup(fx.client, '../another-member')).rejects.toBeInstanceOf(AccountDeletionStorageError)
  expect(fx.list).not.toHaveBeenCalled()
})

test('empty accounts have a complete cleanup plan without storage mutations', async () => {
  const fx = fixture()
  const plan = await prepareUserStorageCleanup(fx.client, userId)
  expect(plan).toHaveLength(USER_STORAGE_BUCKETS.length)
  await executeUserStorageCleanup(fx.client, plan)
  expect(fx.remove).not.toHaveBeenCalled()
})
