/** @jest-environment node */
import { isDeletionReconciliationRequest, isDeletionReconciliationService, reconcileLegacyAccountDeletion } from '../supabase/functions/_shared/account-deletion-reconciliation'
import { type DeletionClient, type DeletionJob, type DeletionManifest } from '../supabase/functions/_shared/account-deletion-workflow'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { transpileModule, ModuleKind } from 'typescript'

const userId = '10000000-0000-4000-8000-000000000001'
const manifest = (): DeletionManifest => ({ version: 1, storage: [{ bucket: 'chat-uploads', paths: [`${userId}/photo.jpg`] }], bunny_assets: [], unsupported_provider_assets: [], live_rooms: [], live_memberships: [] })
function fixture(state: DeletionJob['state'] = 'requested') {
  const job: DeletionJob = { user_id: userId, state, manifest: manifest() }
  let authExists = true
  const control = { rpc: jest.fn(async (name: string, _args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> => ({ data: name === 'claim_legacy_account_deletion_job' ? structuredClone(job) : null, error: null })) }
  const rpc = jest.fn(async (name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> => {
    if (name.startsWith('begin_') || name.startsWith('get_')) throw new Error('Reconciliation must not initialize or authenticate an account')
    if (name === 'checkpoint_account_deletion') job.state = args!.next_state as DeletionJob['state']
    if (name === 'erase_account_data') job.state = 'data_removed'
    if (name === 'finish_account_deletion') { job.state = 'completed'; job.manifest = {} as DeletionManifest }
    return { data: structuredClone(job), error: null }
  })
  const getUser = jest.fn(async () => { throw new Error('No member authentication is needed or allowed') })
  const signOut = jest.fn(async () => { throw new Error('No member session may be revoked by the service worker') })
  const deleteUser = jest.fn(async () => { authExists = false; return { error: null } })
  const getUserById = jest.fn(async () => authExists ? { data: { user: { id: userId } }, error: null } : { data: { user: null }, error: { status: 404 } })
  const remove = jest.fn(async () => ({ error: null }))
  const providers = jest.fn(async (): Promise<void> => undefined)
  const evidence = jest.fn(async () => undefined)
  const client: DeletionClient = { rpc, auth: { getUser, admin: { signOut, deleteUser, getUserById } }, storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove }) } }
  const controller = new AbortController()
  const run = () => reconcileLegacyAccountDeletion(control, client, providers, evidence, controller.signal)
  return { job, control, client, rpc, getUser, signOut, deleteUser, getUserById, remove, providers, evidence, controller, run }
}

test('only the exact configured service credential is accepted, never a decoded role claim', async () => {
  expect(await isDeletionReconciliationService('configured-secret', 'configured-secret')).toBe(true)
  for (const token of [null, '', 'other', 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.', 'x'.repeat(16_385)]) {
    expect(await isDeletionReconciliationService(token, 'configured-secret')).toBe(false)
  }
  expect(await isDeletionReconciliationService('configured-secret', undefined)).toBe(false)
})

const defaultSecret = 'sb_secret_synthetic_registered_default_123456789'
const namedSecret = 'sb_secret_synthetic_unrelated_named_123456789'
const configuredKeys = JSON.stringify({ default: defaultSecret, unrelated: namedSecret })
const serviceConfiguration = { secretKeysJson: configuredKeys, legacyServiceKey: 'configured-legacy-service-credential' }

test('new platform default secret authenticates on apikey without relying on the legacy environment alias', async () => {
  expect(await isDeletionReconciliationRequest({ apiKey: defaultSecret, bearer: null }, serviceConfiguration)).toBe(true)
  expect(await isDeletionReconciliationRequest({ apiKey: defaultSecret, bearer: null }, {
    ...serviceConfiguration, legacyServiceKey: 'sb_secret_different_injected_compatibility_alias',
  })).toBe(true)
  expect(await isDeletionReconciliationRequest({ apiKey: namedSecret, bearer: null }, serviceConfiguration)).toBe(false)
  expect(await isDeletionReconciliationRequest({ apiKey: null, bearer: defaultSecret }, {
    ...serviceConfiguration, legacyServiceKey: defaultSecret,
  })).toBe(false)
})

test.each([
  undefined, '', '{', 'null', '[]', '"not a map"', '{}',
  JSON.stringify({ other: defaultSecret }), JSON.stringify({ default: null }),
  JSON.stringify({ default: { value: defaultSecret } }), JSON.stringify({ default: 'sb_publishable_synthetic_public' }),
  JSON.stringify({ default: 'forged.service_role.claims' }), ' '.repeat(65_537),
])('opaque-key authentication fails closed for malformed or unsupported configured maps (%#)', async secretKeysJson => {
  expect(await isDeletionReconciliationRequest({ apiKey: defaultSecret, bearer: 'configured-legacy-service-credential' }, {
    ...serviceConfiguration, secretKeysJson,
  })).toBe(false)
})

test.each([
  null, '', 'sb_publishable_synthetic_public', 'sb_secret_wrong_project_default',
  'sb_secret_x'.repeat(2_000), `${defaultSecret},${namedSecret}`,
  'eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.',
])('public, forged, missing and unregistered apikeys do not authorize the worker (%#)', async apiKey => {
  expect(await isDeletionReconciliationRequest({ apiKey, bearer: null }, serviceConfiguration)).toBe(false)
})

test('legacy exact-match compatibility remains separate from opaque-key and publishable-key authentication', async () => {
  expect(await isDeletionReconciliationRequest({ apiKey: 'sb_publishable_synthetic_public', bearer: 'configured-legacy-service-credential' }, serviceConfiguration)).toBe(true)
  expect(await isDeletionReconciliationRequest({ apiKey: null, bearer: 'configured-legacy-service-credential' }, {
    ...serviceConfiguration, secretKeysJson: '{',
  })).toBe(true)
  expect(await isDeletionReconciliationRequest({ apiKey: 'sb_secret_wrong_project_default', bearer: 'configured-legacy-service-credential' }, serviceConfiguration)).toBe(false)
  expect(await isDeletionReconciliationRequest({ apiKey: null, bearer: 'sb_publishable_synthetic_public' }, {
    ...serviceConfiguration, legacyServiceKey: 'sb_publishable_synthetic_public',
  })).toBe(false)
})

test('one claimed job runs evidence and normal cleanup checkpoints before Auth removal', async () => {
  const fx = fixture()
  expect(await fx.run()).toEqual({ claimed: 1, completed: 1 })
  expect(fx.control.rpc.mock.calls.map(([name]) => name)).toEqual(['claim_legacy_account_deletion_job', 'finish_legacy_account_deletion_attempt'])
  const workerId = fx.control.rpc.mock.calls[0][1]!.worker_id
  expect(fx.control.rpc).toHaveBeenLastCalledWith('finish_legacy_account_deletion_attempt', { target_user_id: userId, worker_id: workerId, completed: true })
  expect(fx.evidence).toHaveBeenCalledWith(userId)
  expect(fx.evidence.mock.invocationCallOrder[0]).toBeLessThan(fx.providers.mock.invocationCallOrder[0])
  expect(fx.remove.mock.invocationCallOrder[0]).toBeLessThan(fx.deleteUser.mock.invocationCallOrder[0])
  expect(fx.job.state).toBe('completed')
  expect(fx.getUser).not.toHaveBeenCalled()
  expect(fx.signOut).not.toHaveBeenCalled()
})

test('no eligible job is a no-op and does not touch Auth, files or providers', async () => {
  const fx = fixture()
  fx.control.rpc.mockResolvedValueOnce({ data: null, error: null })
  expect(await fx.run()).toEqual({ claimed: 0, completed: 0 })
  expect(fx.control.rpc).toHaveBeenCalledTimes(1)
  for (const operation of [fx.rpc, fx.deleteUser, fx.providers, fx.evidence, fx.remove]) expect(operation).not.toHaveBeenCalled()
})

test('an unresolved evidence copy releases for retry without provider or Auth deletion', async () => {
  const fx = fixture()
  fx.evidence.mockRejectedValueOnce(new Error('copy pending'))
  await expect(fx.run()).rejects.toThrow('copy pending')
  expect(fx.providers).not.toHaveBeenCalled()
  expect(fx.deleteUser).not.toHaveBeenCalled()
  expect(fx.control.rpc).toHaveBeenLastCalledWith('finish_legacy_account_deletion_attempt', expect.objectContaining({ completed: false }))
  expect(fx.job.state).toBe('requested')
})

test('a stalled provider reaches its deadline and late completion cannot advance a checkpoint', async () => {
  const fx = fixture()
  let finishProvider!: () => void
  fx.providers.mockImplementationOnce(() => new Promise<void>(resolve => { finishProvider = resolve }))
  const result = fx.run()
  for (let index = 0; index < 10 && !finishProvider; index += 1) await Promise.resolve()
  expect(finishProvider).toBeDefined()
  fx.controller.abort(new Error('work deadline'))
  await expect(result).rejects.toThrow('work deadline')
  expect(fx.control.rpc).toHaveBeenLastCalledWith('finish_legacy_account_deletion_attempt', expect.objectContaining({ completed: false }))
  finishProvider()
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
  expect(fx.rpc.mock.calls.map(([name]) => name)).toEqual(['refresh_account_deletion_providers'])
  expect(fx.job.state).toBe('requested')
  expect(fx.deleteUser).not.toHaveBeenCalled()
})

test('an already-aborted invocation cannot claim or remove anything', async () => {
  const fx = fixture()
  fx.controller.abort(new Error('expired'))
  await expect(fx.run()).rejects.toThrow('expired')
  expect(fx.control.rpc).not.toHaveBeenCalled()
  expect(fx.deleteUser).not.toHaveBeenCalled()
})

test('claim and release failures never report successful reconciliation', async () => {
  const claim = fixture()
  claim.control.rpc.mockResolvedValueOnce({ data: null, error: { message: 'claim unavailable' } })
  await expect(claim.run()).rejects.toMatchObject({ message: 'claim unavailable' })
  expect(claim.deleteUser).not.toHaveBeenCalled()
  const release = fixture('data_removed')
  const normal = release.control.rpc.getMockImplementation()!
  release.control.rpc.mockImplementation((name, args) => name === 'finish_legacy_account_deletion_attempt'
    ? Promise.resolve({ data: null, error: { message: 'release unavailable' } }) : normal(name, args))
  await expect(release.run()).rejects.toMatchObject({ message: 'release unavailable' })
  expect(release.job.state).toBe('completed')
})

test('the actual admin client opt-in abort transport preserves ordinary calls and both cancellation sources', async () => {
  const createClient = jest.fn((_url: string, _key: string, options: { global?: { fetch: typeof fetch } }) => options)
  const fetcher = jest.fn(async () => new Response('{}'))
  const compiled = transpileModule(readFileSync(path.resolve('supabase/functions/_shared/bridge.ts'), 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exported: { getSupabaseAdmin?: (options?: { signal?: AbortSignal }) => { global?: { fetch: typeof fetch } } } = {}
  runInNewContext(compiled, { exports: exported, Request, Response, AbortSignal, fetch: fetcher, Deno: { env: { get: () => 'synthetic-configuration' } }, require: (name: string) => {
    if (name.startsWith('https://esm.sh/@supabase/supabase-js')) return { createClient }
    if (name === './edge-guard.ts') return { requireActiveEdgeMember: jest.fn() }
    if (name === './public-profile.ts') return { PUBLIC_PROFILE_SELECT: 'id' }
    throw new Error(`Unexpected bridge dependency: ${name}`)
  } })
  expect(exported.getSupabaseAdmin!().global).toBeUndefined()
  const worker = new AbortController(), caller = new AbortController()
  const admin = exported.getSupabaseAdmin!({ signal: worker.signal })
  await admin.global!.fetch('https://fixture.invalid/rest/v1/messages', { signal: caller.signal })
  const received = (fetcher.mock.calls as unknown as Array<[RequestInfo, RequestInit]>)[0][1].signal!
  expect(received.aborted).toBe(false)
  caller.abort()
  expect(received.aborted).toBe(true)
  worker.abort(new Error('worker deadline'))
  expect(() => admin.global!.fetch('https://fixture.invalid/rest/v1/messages')).toThrow('worker deadline')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
