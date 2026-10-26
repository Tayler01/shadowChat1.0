import { AccountDeletionRequestError, parseDeletionJob, runAccountDeletion, type DeletionClient, type DeletionJob, type DeletionManifest } from '../supabase/functions/_shared/account-deletion-workflow'
import { cleanupAccountProviders } from '../supabase/functions/_shared/account-deletion-providers'

const userId = '10000000-0000-0000-0000-000000000001'
const asset = '20000000-0000-0000-0000-000000000002'
const room = `shado-live-${asset}`
const digest = 'a'.repeat(64)
const manifest = (): DeletionManifest => ({ version: 1, storage: [{ bucket: 'chat-uploads', paths: [`${userId}/one.jpg`] }], bunny_assets: [{ library_id: '123', asset_id: asset }], unsupported_provider_assets: [], live_rooms: [room], live_memberships: [] })
const fixture = (initial: DeletionJob['state'] | null = null) => {
  let job: DeletionJob | null = initial ? { user_id: userId, state: initial, manifest: manifest() } : null
  const rpc = jest.fn(async (name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message?: string } | null }> => {
    if (name === 'get_account_deletion_job') return { data: job ? JSON.parse(JSON.stringify(job)) : null, error: null }
    if (name === 'begin_account_deletion') job = { user_id: userId, state: 'requested', manifest: manifest() }
    if (name === 'checkpoint_account_deletion') job!.state = args!.next_state as DeletionJob['state']
    if (name === 'erase_account_data') job!.state = 'data_removed'
    if (name === 'finish_account_deletion') { job!.state = 'completed'; job!.manifest = {} as DeletionManifest }
    return { data: job ? JSON.parse(JSON.stringify(job)) : null, error: null }
  })
  const getUser = jest.fn(async () => ({ data: { user: { id: userId } }, error: null }))
  const signOut = jest.fn(async () => ({ error: null as { status: number } | null }))
  const deleteUser = jest.fn(async () => ({ error: null as { status: number } | null }))
  const getUserById = jest.fn(async () => ({ data: { user: null as { id: string } | null }, error: { status: 404 } as { status: number } | null }))
  const remove = jest.fn(async () => ({ error: null as { message: string } | null }))
  const providers = jest.fn(async () => undefined)
  const evidence = jest.fn(async () => undefined)
  const client: DeletionClient = { rpc, auth: { getUser, admin: { signOut, deleteUser, getUserById } }, storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove }) } }
  return { client, rpc, getUser, signOut, deleteUser, getUserById, remove, providers, evidence, job: () => job }
}

test('deletion advances durable checkpoints only after provider, files, data and verified Auth removal', async () => {
  const fx = fixture()
  await runAccountDeletion(fx.client, 'valid-bearer', digest, userId, fx.providers, fx.evidence)
  expect(fx.getUser).toHaveBeenCalledTimes(1)
  expect(fx.signOut).toHaveBeenCalledWith('valid-bearer', 'global')
  expect(fx.providers).toHaveBeenCalledWith(expect.objectContaining({ bunny_assets: [{ library_id: '123', asset_id: asset }] }), userId)
  expect(fx.rpc.mock.calls.map(([name]) => name)).toEqual(['get_account_deletion_job', 'begin_account_deletion', 'refresh_account_deletion_providers', 'checkpoint_account_deletion', 'refresh_account_deletion_storage', 'checkpoint_account_deletion', 'erase_account_data', 'finish_account_deletion'])
  expect(fx.job()).toMatchObject({ state: 'completed', manifest: {} })
})

test('provider failure retains its manifest and anonymous receipt retry finishes without a profile', async () => {
  const fx = fixture()
  fx.providers.mockRejectedValueOnce(new Error('provider unavailable'))
  await expect(runAccountDeletion(fx.client, 'valid-bearer', digest, userId, fx.providers, fx.evidence)).rejects.toThrow('provider unavailable')
  expect(fx.job()?.state).toBe('requested')
  expect(fx.remove).not.toHaveBeenCalled()
  await runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)
  expect(fx.getUser).toHaveBeenCalledTimes(1)
  expect(fx.signOut).toHaveBeenCalledTimes(1)
  expect(fx.job()?.state).toBe('completed')
})

test('unresolved evidence capture prevents provider, file and account removal and can be retried', async () => {
  const fx = fixture('requested')
  fx.evidence.mockRejectedValueOnce(new Error('evidence copy not confirmed'))
  await expect(runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)).rejects.toThrow('evidence copy not confirmed')
  expect(fx.evidence).toHaveBeenCalledWith(userId)
  expect(fx.providers).not.toHaveBeenCalled()
  expect(fx.remove).not.toHaveBeenCalled()
  expect(fx.deleteUser).not.toHaveBeenCalled()
  expect(fx.job()?.state).toBe('requested')
  await runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)
  expect(fx.job()?.state).toBe('completed')
})

test('receipt-bound retry ignores a bearer for another signed-in account', async () => {
  const fx = fixture('requested')
  await runAccountDeletion(fx.client, 'another-account-bearer', digest, userId, fx.providers, fx.evidence)
  expect(fx.signOut).not.toHaveBeenCalled()
  expect(fx.getUser).not.toHaveBeenCalled()
  expect(fx.deleteUser).toHaveBeenCalledWith(userId)
})

test('a storage failure resumes its stage without repeating successful provider cleanup', async () => {
  const fx = fixture()
  fx.remove.mockResolvedValueOnce({ error: { message: 'storage down' } })
  await expect(runAccountDeletion(fx.client, 'valid-bearer', digest, userId, fx.providers, fx.evidence)).rejects.toThrow()
  expect(fx.job()?.state).toBe('providers_removed')
  expect(fx.deleteUser).not.toHaveBeenCalled()
  await runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)
  expect(fx.providers).toHaveBeenCalledTimes(1)
  expect(fx.remove).toHaveBeenCalledTimes(2)
})

test('Auth failure cannot erase the retry job or report completion', async () => {
  const fx = fixture('data_removed')
  fx.deleteUser.mockResolvedValueOnce({ error: { status: 503 } })
  await expect(runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)).rejects.toMatchObject({ status: 503 })
  expect(fx.job()?.state).toBe('data_removed')
  await runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)
  expect(fx.job()?.state).toBe('completed')
})

test.each([null, { status: 503 }])('an ambiguous Auth readback %p cannot confirm deletion', async error => {
  const fx = fixture('data_removed')
  fx.getUserById.mockResolvedValue({ data: { user: null }, error })
  await expect(runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)).rejects.toThrow('not confirmed')
  expect(fx.job()?.state).toBe('data_removed')
})

test('already absent Auth user and completed receipt retries are idempotent', async () => {
  const fx = fixture('data_removed')
  fx.deleteUser.mockResolvedValue({ error: { status: 404 } })
  await runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)
  await runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)
  expect(fx.deleteUser).toHaveBeenCalledTimes(1)
})

test('no matching receipt and no authenticated caller cannot begin deletion', async () => {
  const fx = fixture()
  await expect(runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)).rejects.toBeInstanceOf(AccountDeletionRequestError)
  expect(fx.job()).toBeNull()
})

test('first request refuses an account switch before starting a deletion job', async () => {
  const fx = fixture()
  fx.getUser.mockResolvedValue({ data: { user: { id: asset } }, error: null })
  await expect(runAccountDeletion(fx.client, 'switched-account', digest, userId, fx.providers, fx.evidence)).rejects.toMatchObject({ status: 409 })
  expect(fx.job()).toBeNull()
  expect(fx.signOut).not.toHaveBeenCalled()
})

test('receipt account mismatch preserves the real job and performs no cleanup', async () => {
  const fx = fixture('requested')
  await expect(runAccountDeletion(fx.client, null, digest, asset, fx.providers, fx.evidence)).rejects.toThrow('does not match')
  expect(fx.job()?.state).toBe('requested')
  expect(fx.providers).not.toHaveBeenCalled()
})

test('an unresolved external-create reservation keeps deletion retryable', async () => {
  const fx = fixture('requested')
  const original = fx.rpc.getMockImplementation()!
  fx.rpc.mockImplementation(async (name, args) => name === 'refresh_account_deletion_providers'
    ? { data: null, error: { message: 'provider reconciliation pending' } } : original(name, args))
  await expect(runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)).rejects.toMatchObject({ message: 'provider reconciliation pending' })
  expect(fx.providers).not.toHaveBeenCalled()
  expect(fx.job()?.state).toBe('requested')
})

test('confirmed sole-admin refusal does not create a job or run cleanup', async () => {
  const fx = fixture()
  fx.rpc.mockImplementation(async name => name === 'begin_account_deletion' ? { data: null, error: { code: 'PT403' } } : { data: null, error: null })
  await expect(runAccountDeletion(fx.client, 'valid-bearer', digest, userId, fx.providers, fx.evidence)).rejects.toMatchObject({ status: 403 })
  expect(fx.signOut).not.toHaveBeenCalled()
  expect(fx.providers).not.toHaveBeenCalled()
})

test('an unrelated database permission error is not mislabeled as confirmed admin refusal', async () => {
  const fx = fixture()
  fx.rpc.mockImplementation(async name => name === 'begin_account_deletion' ? { data: null, error: { code: '42501', message: 'permission denied for table' } } : { data: null, error: null })
  await expect(runAccountDeletion(fx.client, 'valid-bearer', digest, userId, fx.providers, fx.evidence)).rejects.toEqual({ code: '42501', message: 'permission denied for table' })
  expect(fx.providers).not.toHaveBeenCalled()
})

test.each(['../outside.jpg', `${userId}/../outside.jpg`, '/absolute.jpg', `${userId}\\other.jpg`])('invalid storage plan %p is rejected before cleanup', objectPath => {
  expect(() => parseDeletionJob({ user_id: userId, state: 'requested', manifest: { ...manifest(), storage: [{ bucket: 'chat-uploads', paths: [objectPath] }] } })).toThrow('Invalid deletion storage plan')
})

test('unknown provider assets never produce a false successful deletion', async () => {
  const fx = fixture('requested')
  fx.job()!.manifest.unsupported_provider_assets.push({ provider: 'unsupported', id: asset })
  await expect(runAccountDeletion(fx.client, null, digest, userId, fx.providers, fx.evidence)).rejects.toThrow('operator')
  expect(fx.providers).not.toHaveBeenCalled()
  expect(fx.job()?.state).toBe('requested')
})

test('Bunny and LiveKit not-found responses are successful idempotent cleanup', async () => {
  const providers = {
    deleteBunnyVideo: jest.fn(async () => ({ ok: false, status: 404 })),
    removeLiveParticipant: jest.fn(async () => { throw { code: 'not_found' } }),
    deleteLiveRoom: jest.fn(async () => { throw { status: 404 } }),
  }
  await cleanupAccountProviders(providers, { ...manifest(), live_memberships: [room] }, userId)
  expect(providers.deleteBunnyVideo).toHaveBeenCalledWith('123', asset)
})

test.each([401, 429, 500])('Bunny %p preserves the retry job', async status => {
  await expect(cleanupAccountProviders({ deleteBunnyVideo: async () => ({ ok: false, status }), removeLiveParticipant: async () => undefined, deleteLiveRoom: async () => undefined }, manifest(), userId)).rejects.toThrow('not confirmed')
})
