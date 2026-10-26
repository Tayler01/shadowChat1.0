import { parseDeletionJob, resumeAuthorizedAccountDeletion, type DeletionClient, type DeletionManifest } from './account-deletion-workflow.ts'

export const LEGACY_DELETION_WORK_TIMEOUT_MS = 90_000
export const LEGACY_DELETION_CONTROL_TIMEOUT_MS = 110_000

/** Match the configured service credential; decoded JWT claims are not proof. */
export const isDeletionReconciliationService = async (provided: string | null, expected: string | undefined): Promise<boolean> => {
  if (!provided || !expected || provided.length > 16_384 || expected.length > 16_384) return false
  const encoder = new TextEncoder()
  const [left, right] = await Promise.all([provided, expected].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))))
  const a = new Uint8Array(left), b = new Uint8Array(right)
  let difference = a.length ^ b.length
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index]
  return difference === 0
}

/**
 * Supabase injects named opaque keys as JSON. Accept only the registered default
 * secret on apikey; a prefix or decoded role never authorizes administrative work.
 * Keep exact legacy Bearer authentication for projects still using JWT keys.
 */
export const isDeletionReconciliationRequest = async (
  credentials: { apiKey: string | null; bearer: string | null },
  configuration: { secretKeysJson: string | undefined; legacyServiceKey: string | undefined },
): Promise<boolean> => {
  if (credentials.apiKey?.startsWith('sb_secret_')) {
    const source = configuration.secretKeysJson
    if (!source || source.length > 65_536 || credentials.apiKey.length > 16_384) return false
    let keys: unknown
    try { keys = JSON.parse(source) } catch { return false }
    if (!keys || typeof keys !== 'object' || Array.isArray(keys) || !Object.prototype.hasOwnProperty.call(keys, 'default')) return false
    const expected = (keys as Record<string, unknown>).default
    if (typeof expected !== 'string' || !/^sb_secret_[A-Za-z0-9_-]+$/.test(expected)) return false
    return isDeletionReconciliationService(credentials.apiKey, expected)
  }
  // Opaque keys are never accepted in Authorization, even if a compatibility
  // environment variable also contains one. They must use the named map above.
  if (credentials.bearer?.startsWith('sb_secret_') || credentials.bearer?.startsWith('sb_publishable_')) return false
  return isDeletionReconciliationService(credentials.bearer, configuration.legacyServiceKey)
}

const beforeDeadline = async <T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> => {
  signal.throwIfAborted()
  let abort!: () => void
  const stopped = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason ?? new Error('Deletion work deadline reached'))
    signal.addEventListener('abort', abort, { once: true })
  })
  try { return await Promise.race([operation(), stopped]) }
  finally { signal.removeEventListener('abort', abort) }
}

/** One already-authorized legacy job, with durable leasing/backoff in SQL. */
export const reconcileLegacyAccountDeletion = async (
  control: Pick<DeletionClient, 'rpc'>,
  work: DeletionClient,
  cleanupProviders: (manifest: DeletionManifest, userId: string) => Promise<void>,
  preserveEvidence: (userId: string) => Promise<void>,
  signal: AbortSignal,
): Promise<{ claimed: 0 | 1; completed: 0 | 1 }> => {
  signal.throwIfAborted()
  const workerId = crypto.randomUUID()
  const claimed = await control.rpc('claim_legacy_account_deletion_job', { worker_id: workerId })
  if (claimed.error) throw claimed.error
  if (claimed.data == null) return { claimed: 0, completed: 0 }
  const job = parseDeletionJob(claimed.data)
  let completed = false
  let failure: { error: unknown } | undefined
  try {
    await beforeDeadline(signal, () => resumeAuthorizedAccountDeletion(work, job, cleanupProviders, preserveEvidence, signal))
    completed = true
  } catch (error) { failure = { error } }
  // This separate control connection outlives the work deadline, but remains
  // bounded. A failed release retains the lease until its database expiry.
  const released = await control.rpc('finish_legacy_account_deletion_attempt', {
    target_user_id: job.user_id, worker_id: workerId, completed,
  })
  if (failure) throw failure.error
  if (released.error) throw released.error
  return { claimed: 1, completed: 1 }
}
