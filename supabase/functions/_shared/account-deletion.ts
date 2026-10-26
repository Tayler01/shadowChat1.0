// Account cleanup is intentionally separate from moderation-evidence retention.
// Published safety evidence must be handled under the operator's documented
// retention process, not silently erased with an account's upload prefix.
export const USER_STORAGE_BUCKETS = [
  'avatars',
  'banners',
  'message-media',
  'chat-uploads',
  'art-board',
  'shadow-pin',
  'shadow-pin-comments',
  'shadow-pin-drafts',
  'shado-tv',
  'feedback-attachments',
] as const

type StorageItem = { id?: string | null; name: string }
type StorageResult = { error: { message: string } | null }
export type DeletionStorageClient = {
  storage: {
    from: (bucket: string) => {
      list: (prefix: string, options: { limit: number; offset: number }) => PromiseLike<StorageResult & { data: StorageItem[] | null }>
      remove: (paths: string[]) => PromiseLike<StorageResult>
    }
  }
}
export type StorageCleanupPlan = Array<{ bucket: string; paths: string[] }>

export class AccountDeletionStorageError extends Error {
  readonly partialDeletion: boolean

  constructor(partialDeletion: boolean) {
    super(partialDeletion
      ? 'Account deletion was not completed. Some uploaded files may already have been removed. Try again to finish deleting your account.'
      : 'Account deletion was not started because uploaded files could not be checked. Try again.')
    this.name = 'AccountDeletionStorageError'
    this.partialDeletion = partialDeletion
  }
}

/** Enumerate every supported bucket before deleting anything. */
export const prepareUserStorageCleanup = async (
  supabase: DeletionStorageClient,
  userId: string,
): Promise<StorageCleanupPlan> => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new AccountDeletionStorageError(false)
  }
  const plan: StorageCleanupPlan = []
  for (const bucket of USER_STORAGE_BUCKETS) {
    const folders = [userId]
    const visited = new Set<string>()
    const paths = new Set<string>()
    while (folders.length > 0) {
      const folder = folders.pop()!
      if (visited.has(folder)) continue
      visited.add(folder)
      let offset = 0
      for (;;) {
        const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000, offset })
        if (error) throw new AccountDeletionStorageError(false)
        const entries = data ?? []
        for (const entry of entries) {
          // Treat Storage listing data as names, never as paths outside this
          // member's prefix. This also makes malformed legacy entries fail safe.
          if (!entry.name || entry.name === '.' || entry.name === '..' || /[/\\]/.test(entry.name)) {
            throw new AccountDeletionStorageError(false)
          }
          const entryPath = `${folder}/${entry.name}`
          if (entry.id === null) folders.push(entryPath)
          else if (entry.id) paths.add(entryPath)
          else throw new AccountDeletionStorageError(false)
        }
        if (entries.length < 1000) break
        offset += entries.length
      }
    }
    plan.push({ bucket, paths: [...paths] })
  }
  return plan
}

/** Re-running a partially completed cleanup is safe: Storage removal is idempotent. */
export const executeUserStorageCleanup = async (
  supabase: DeletionStorageClient,
  plan: StorageCleanupPlan,
  signal?: AbortSignal,
): Promise<void> => {
  for (const { bucket, paths } of plan) {
    for (let offset = 0; offset < paths.length; offset += 100) {
      signal?.throwIfAborted()
      const { error } = await supabase.storage.from(bucket).remove(paths.slice(offset, offset + 100))
      signal?.throwIfAborted()
      if (error) throw new AccountDeletionStorageError(true)
    }
  }
}
