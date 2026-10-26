import { executeUserStorageCleanup, type DeletionStorageClient, type StorageCleanupPlan, USER_STORAGE_BUCKETS } from './account-deletion.ts'

export type DeletionManifest = {
  version: 1
  storage: StorageCleanupPlan
  bunny_assets: Array<{ library_id: string; asset_id: string }>
  unsupported_provider_assets: Array<{ provider: string; id: string }>
  live_rooms: string[]
  live_memberships: string[]
}
export type DeletionJob = {
  user_id: string
  state: 'requested' | 'providers_removed' | 'storage_removed' | 'data_removed' | 'completed'
  manifest: DeletionManifest
}
type ApiError = { message?: string; status?: number; code?: string }
type ApiResult = { error: ApiError | null }
export type DeletionClient = DeletionStorageClient & {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<ApiResult & { data: unknown }>
  auth: {
    getUser: (token: string) => PromiseLike<ApiResult & { data: { user: { id: string } | null } }>
    admin: {
      signOut: (token: string, scope: 'global') => PromiseLike<ApiResult>
      deleteUser: (id: string) => PromiseLike<ApiResult>
      getUserById: (id: string) => PromiseLike<ApiResult & { data: { user: { id: string } | null } }>
    }
  }
}

export class AccountDeletionRequestError extends Error {
  constructor(message: string, readonly status: 401 | 403 | 409 | 503) { super(message) }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const room = /^shado-live-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid deletion manifest')
  return value as Record<string, unknown>
}
const strings = (value: unknown, pattern: RegExp): string[] => {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !pattern.test(item))) throw new Error('Invalid deletion manifest')
  return [...new Set(value)]
}

export const parseDeletionJob = (value: unknown): DeletionJob => {
  const job = record(value)
  if (typeof job.user_id !== 'string' || !uuid.test(job.user_id)
    || !['requested', 'providers_removed', 'storage_removed', 'data_removed', 'completed'].includes(String(job.state))) {
    throw new Error('Invalid deletion job')
  }
  if (job.state === 'completed') return job as unknown as DeletionJob
  const manifest = record(job.manifest)
  if (manifest.version !== 1 || !Array.isArray(manifest.storage) || !Array.isArray(manifest.unsupported_provider_assets) || !Array.isArray(manifest.bunny_assets)) {
    throw new Error('Invalid deletion manifest')
  }
  const allowedBuckets = new Set<string>([...USER_STORAGE_BUCKETS, 'moderation-evidence'])
  const storage = manifest.storage.map(value => {
    const entry = record(value)
    if (typeof entry.bucket !== 'string' || !allowedBuckets.has(entry.bucket) || !Array.isArray(entry.paths)
      || entry.paths.some(path => typeof path !== 'string' || path.length > 1024 || path.startsWith('/')
        || path.includes('\\') || path.includes(String.fromCharCode(0)) || path.split('/').some(part => !part || part === '.' || part === '..'))) {
      throw new Error('Invalid deletion storage plan')
    }
    return { bucket: entry.bucket, paths: [...new Set(entry.paths as string[])] }
  })
  return {
    user_id: job.user_id,
    state: job.state as DeletionJob['state'],
    manifest: {
      version: 1, storage,
      bunny_assets: manifest.bunny_assets.map(value => {
        const asset = record(value)
        if (typeof asset.library_id !== 'string' || !/^[0-9]{1,20}$/.test(asset.library_id)
          || typeof asset.asset_id !== 'string' || !uuid.test(asset.asset_id)) throw new Error('Invalid trusted video asset')
        return { library_id: asset.library_id, asset_id: asset.asset_id }
      }),
      live_rooms: strings(manifest.live_rooms, room),
      live_memberships: strings(manifest.live_memberships, room),
      unsupported_provider_assets: manifest.unsupported_provider_assets.map(value => {
        const asset = record(value)
        if (typeof asset.provider !== 'string' || typeof asset.id !== 'string') throw new Error('Invalid provider asset')
        return { provider: asset.provider, id: asset.id }
      }),
    },
  }
}

const userNotFound = (error: ApiError | null) => error?.status === 404 || error?.code === 'user_not_found'

/** Durable, repeatable stages. A failed stage never advances its checkpoint. */
export const runAccountDeletion = async (
  client: DeletionClient,
  token: string | null,
  receiptDigest: string,
  expectedUserId: string,
  cleanupProviders: (manifest: DeletionManifest, userId: string) => Promise<void>,
  preserveEvidence: (userId: string) => Promise<void>,
): Promise<void> => {
  const existing = await client.rpc('get_account_deletion_job', { request_receipt_digest: receiptDigest })
  if (existing.error) throw existing.error
  let job: DeletionJob
  const isRetry = existing.data != null
  if (isRetry) {
    // This completion-only capability remains usable after member access or
    // Auth is removed. It never grants account access or returns user content.
    job = parseDeletionJob(existing.data)
    if (job.user_id !== expectedUserId) throw new Error('Deletion receipt does not match the expected account')
  } else {
    if (!token) throw new AccountDeletionRequestError('Authentication is required to start account deletion', 401)
    const auth = await client.auth.getUser(token)
    if (auth.error || !auth.data.user?.id) throw new AccountDeletionRequestError('Invalid or expired session', 401)
    if (auth.data.user.id !== expectedUserId) throw new AccountDeletionRequestError('The signed-in account changed. Review the account before starting deletion.', 409)
    const started = await client.rpc('begin_account_deletion', {
      target_user_id: auth.data.user.id, request_receipt_digest: receiptDigest,
    })
    if (started.error?.code === 'PT403') throw new AccountDeletionRequestError('Transfer full admin access before deleting this account.', 403)
    if (started.error?.code === 'PT503') throw new AccountDeletionRequestError('Account deletion is being upgraded. Please try again shortly; nothing has been deleted.', 503)
    if (started.error?.code === '55000') throw new AccountDeletionRequestError('A shared media ownership repair is required before this account can be deleted. Contact support.', 409)
    if (started.error) throw started.error
    job = parseDeletionJob(started.data)
  }
  await runDeletionStages(client, job, token && !isRetry ? token : null, cleanupProviders, preserveEvidence)
}

/**
 * Compatibility for the published full app's exact { confirm: 'DELETE' } body.
 * A bearer is bound only after getUser succeeds. Its one-way digest can then
 * finish that same job if Auth is removed before the response reaches the app.
 * It cannot start another deletion or reveal account data. Existing explicit
 * client receipts are never replaced by this path.
 */
export const runLegacyAccountDeletion = async (
  client: DeletionClient,
  token: string,
  bearerDigest: string,
  generatedReceiptDigest: string,
  cleanupProviders: (manifest: DeletionManifest, userId: string) => Promise<void>,
  preserveEvidence: (userId: string) => Promise<void>,
): Promise<void> => {
  if (!token) throw new AccountDeletionRequestError('Authentication is required to start account deletion', 401)
  const existing = await client.rpc('get_legacy_account_deletion_job', { request_bearer_digest: bearerDigest })
  if (existing.error) throw existing.error
  let job: DeletionJob
  if (existing.data != null) {
    job = parseDeletionJob(existing.data)
  } else {
    const auth = await client.auth.getUser(token)
    if (auth.error || !auth.data.user?.id || !uuid.test(auth.data.user.id)) {
      throw new AccountDeletionRequestError('Invalid or expired session', 401)
    }
    const started = await client.rpc('begin_legacy_account_deletion', {
      target_user_id: auth.data.user.id,
      request_bearer_digest: bearerDigest,
      generated_receipt_digest: generatedReceiptDigest,
    })
    if (started.error?.code === 'PT403') throw new AccountDeletionRequestError('Transfer full admin access before deleting this account.', 403)
    if (started.error?.code === 'PT503') throw new AccountDeletionRequestError('Account deletion is being upgraded. Please try again shortly; nothing has been deleted.', 503)
    if (started.error?.code === '55000') throw new AccountDeletionRequestError('A shared media ownership repair is required before this account can be deleted. Contact support.', 409)
    if (started.error) throw started.error
    job = parseDeletionJob(started.data)
    if (job.user_id !== auth.data.user.id) throw new Error('Deletion job does not match the authenticated account')
  }
  // Do not revoke refresh sessions before cleanup: the published full app has
  // no saved receipt UI. RLS and the active-member boundary already deny data.
  await runDeletionStages(client, job, null, cleanupProviders, preserveEvidence)
}

const runDeletionStages = async (
  client: DeletionClient,
  initialJob: DeletionJob,
  revokeToken: string | null,
  cleanupProviders: (manifest: DeletionManifest, userId: string) => Promise<void>,
  preserveEvidence: (userId: string) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> => {
  const guard = () => signal?.throwIfAborted()
  guard()
  let job = initialJob
  if (job.state === 'completed') return
  if (job.state === 'requested' || job.state === 'providers_removed') {
    // Submitted media must have an independent service-owned evidence copy
    // before ordinary user-owned bytes can be removed. Retries are idempotent.
    await preserveEvidence(job.user_id)
    guard()
  }

  if (job.state === 'requested') {
    // Capability-only retries must never revoke a different signed-in account.
    // First use has just verified the bearer; later retries need no bearer.
    if (revokeToken) {
      const revoked = await client.auth.admin.signOut(revokeToken, 'global')
      if (revoked.error) throw revoked.error
    }
    if (job.manifest.unsupported_provider_assets.length) throw new Error('Provider cleanup requires an operator')
    const refreshed = await client.rpc('refresh_account_deletion_providers', { target_user_id: job.user_id })
    guard()
    if (refreshed.error) throw refreshed.error
    job = parseDeletionJob(refreshed.data)
    await cleanupProviders(job.manifest, job.user_id)
    guard()
    const result = await client.rpc('checkpoint_account_deletion', { target_user_id: job.user_id, next_state: 'providers_removed' })
    guard()
    if (result.error) throw result.error
    job = parseDeletionJob(result.data)
  }
  if (job.state === 'providers_removed') {
    const refreshed = await client.rpc('refresh_account_deletion_storage', { target_user_id: job.user_id })
    guard()
    if (refreshed.error) throw refreshed.error
    job = parseDeletionJob(refreshed.data)
    await executeUserStorageCleanup(client, job.manifest.storage, signal)
    guard()
    const result = await client.rpc('checkpoint_account_deletion', { target_user_id: job.user_id, next_state: 'storage_removed' })
    guard()
    if (result.error) throw result.error
    job = parseDeletionJob(result.data)
  }
  if (job.state === 'storage_removed') {
    const result = await client.rpc('erase_account_data', { target_user_id: job.user_id })
    guard()
    if (result.error) throw result.error
    job.state = 'data_removed'
  }
  if (job.state === 'data_removed') {
    const deleted = await client.auth.admin.deleteUser(job.user_id)
    guard()
    if (deleted.error && !userNotFound(deleted.error)) throw deleted.error
    const checked = await client.auth.admin.getUserById(job.user_id)
    guard()
    if (checked.data.user || !userNotFound(checked.error)) throw new Error('Auth deletion is not confirmed')
    const finished = await client.rpc('finish_account_deletion', { target_user_id: job.user_id })
    guard()
    if (finished.error) throw finished.error
  }
}

/** Only the authenticated service reconciler supplies a database-claimed job. */
export const resumeAuthorizedAccountDeletion = async (
  client: DeletionClient,
  claimedJob: unknown,
  cleanupProviders: (manifest: DeletionManifest, userId: string) => Promise<void>,
  preserveEvidence: (userId: string) => Promise<void>,
  signal: AbortSignal,
): Promise<void> => runDeletionStages(client, parseDeletionJob(claimedJob), null, cleanupProviders, preserveEvidence, signal)
