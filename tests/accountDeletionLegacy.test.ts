/** @jest-environment node */
import { createHash, webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { transpileModule, ModuleKind } from 'typescript'
import { AccountDeletionRequestError, runAccountDeletion, runLegacyAccountDeletion, type DeletionClient, type DeletionJob, type DeletionManifest } from '../supabase/functions/_shared/account-deletion-workflow'
import { ACCOUNT_DELETION_CAPABILITIES } from '../supabase/functions/_shared/account-deletion-protocol'
import * as reconciliation from '../supabase/functions/_shared/account-deletion-reconciliation'

const member = '10000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'
const receipt = 'r'.repeat(43)
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const bearerHash = (token: string) => hash(`legacy-delete-bearer:v1:${token}`)
const manifest = (userId: string): DeletionManifest => ({ version: 1, storage: [{ bucket: 'chat-uploads', paths: [`${userId}/photo.jpg`] }], bunny_assets: [], unsupported_provider_assets: [], live_rooms: [], live_memberships: [] })

/** Stateful Auth/job/Storage boundary around the actual handler and workflow. */
function fixture(environment: Record<string, string | undefined> = {}) {
  const users = new Set([member, other])
  const tokens = new Map([['member-token', member], ['refreshed-member-token', member], ['other-token', other]])
  const expiredTokens = new Set<string>()
  const jobs = new Map<string, DeletionJob & { receiptDigest: string }>()
  const aliases = new Map<string, string>()
  const copy = (job: DeletionJob | undefined) => job ? JSON.parse(JSON.stringify(job)) : null
  const rpc = jest.fn(async (name: string, args: Record<string, unknown> = {}): Promise<{ data: unknown; error: { code?: string; message?: string } | null }> => {
    const userId = args.target_user_id as string
    if (name === 'get_legacy_account_deletion_job') return { data: copy(jobs.get(aliases.get(args.request_bearer_digest as string) ?? '')), error: null }
    if (name === 'get_account_deletion_job') return { data: copy([...jobs.values()].find(job => job.receiptDigest === args.request_receipt_digest)), error: null }
    if (name === 'get_pending_moderation_media_for_owner') return { data: [], error: null }
    if (name === 'begin_account_deletion' || name === 'begin_legacy_account_deletion') {
      if (!jobs.has(userId)) jobs.set(userId, { user_id: userId, state: 'requested', manifest: manifest(userId), receiptDigest: (args.request_receipt_digest ?? args.generated_receipt_digest) as string })
      if (name === 'begin_account_deletion') jobs.get(userId)!.receiptDigest = args.request_receipt_digest as string
      else aliases.set(args.request_bearer_digest as string, userId)
    }
    if (name === 'checkpoint_account_deletion') jobs.get(userId)!.state = args.next_state as DeletionJob['state']
    if (name === 'erase_account_data') jobs.get(userId)!.state = 'data_removed'
    if (name === 'finish_account_deletion') { jobs.get(userId)!.state = 'completed'; jobs.get(userId)!.manifest = {} as DeletionManifest }
    return { data: copy(jobs.get(userId)), error: null }
  })
  const getUser = jest.fn(async (token: string) => {
    const id = tokens.get(token)
    return id && users.has(id) && !expiredTokens.has(token)
      ? { data: { user: { id } }, error: null }
      : { data: { user: null }, error: { status: 401 } }
  })
  const signOut = jest.fn(async () => ({ error: null }))
  const deleteUser = jest.fn(async (id: string): Promise<{ error: { status: number } | null }> => { users.delete(id); return { error: null } })
  const getUserById = jest.fn(async (id: string): Promise<{ data: { user: { id: string } | null }; error: { status: number } | null }> => users.has(id)
    ? { data: { user: { id } }, error: null }
    : { data: { user: null }, error: { status: 404 } })
  const remove = jest.fn(async () => ({ error: null as { message: string } | null }))
  const providers = jest.fn(async (_manifest: DeletionManifest, _userId: string) => undefined)
  const evidence = jest.fn(async () => undefined)
  const client: DeletionClient = { rpc, auth: { getUser, admin: { signOut, deleteUser, getUserById } }, storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove }) } }
  let handler!: (request: Request) => Promise<Response>
  const getSupabaseAdmin = jest.fn(() => client)
  const json = (body: unknown, status = 200) => Response.json(body, { status })
  const modules: Record<string, unknown> = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (callback: typeof handler) => { handler = callback } },
    '../_shared/bridge.ts': { getSupabaseAdmin, hashToken: async (value: string) => hash(value), corsHeaders: {}, json, badRequest: (error: string) => json({ error }, 400) },
    '../_shared/account-deletion-protocol.ts': { ACCOUNT_DELETION_CAPABILITIES },
    '../_shared/account-deletion-reconciliation.ts': reconciliation,
    '../_shared/account-deletion-workflow.ts': { runAccountDeletion, runLegacyAccountDeletion, AccountDeletionRequestError },
    '../_shared/account-deletion-providers.ts': { cleanupAccountProviders: async (_operations: unknown, value: DeletionManifest, userId: string) => providers(value, userId), createBunnyVideoDeletionProvider: jest.fn() },
    '../_shared/shado-live.ts': { createLiveKitClients: jest.fn() },
    '../_shared/moderation-media.ts': { captureModerationMedia: evidence },
  }
  const compiled = transpileModule(readFileSync(path.resolve('supabase/functions/delete-account/index.ts'), 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const configuredEnvironment: Record<string, string | undefined> = {
    SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-secret', ...environment,
  }
  runInNewContext(compiled, { exports: {}, Response, AbortSignal, crypto: webcrypto, Uint8Array, Deno: { env: { get: (key: string) => configuredEnvironment[key] } }, require: (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected handler dependency: ${name}`)
    return modules[name]
  } })
  const request = (token: string | null = 'member-token', body: unknown = { confirm: 'DELETE' }, headers: Record<string, string> = {}) => handler(new Request('https://fixture.supabase.co/functions/v1/delete-account', {
    method: 'POST', headers: { ...(token == null ? {} : { Authorization: `Bearer ${token}` }), ...headers }, body: JSON.stringify(body),
  }))
  return { request, jobs, aliases, users, expiredTokens, rpc, getUser, signOut, deleteUser, getUserById, getSupabaseAdmin, providers, evidence, remove }
}

test('the published exact legacy request completes without early sign-out or client identity fields', async () => {
  const fx = fixture()
  const response = await fx.request()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
  expect(fx.getUser).toHaveBeenCalledWith('member-token')
  expect(fx.rpc).toHaveBeenCalledWith('begin_legacy_account_deletion', { target_user_id: member, request_bearer_digest: bearerHash('member-token'), generated_receipt_digest: expect.stringMatching(/^[0-9a-f]{64}$/) })
  expect(fx.signOut).not.toHaveBeenCalled()
  expect(fx.deleteUser).toHaveBeenCalledWith(member)
  expect(fx.users.has(other)).toBe(true)
  expect(fx.jobs.get(member)?.state).toBe('completed')
})

test.each([
  { confirm: 'DELETE' },
  { confirm: 'DELETE', receipt, expectedUserId: member },
])('handover rejection starts no provider, Storage, session or Auth deletion (%j)', async body => {
  const fx = fixture()
  const original = fx.rpc.getMockImplementation()!
  fx.rpc.mockImplementation(async (name, args) => name === 'begin_account_deletion' || name === 'begin_legacy_account_deletion'
    ? { data: null, error: { code: 'PT503', message: 'Account deletion is being upgraded; retry shortly. No deletion has started.' } }
    : original(name, args))
  const response = await fx.request('member-token', body)
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ retryable: true, deletionStarted: false })
  expect(fx.providers).not.toHaveBeenCalled()
  expect(fx.remove).not.toHaveBeenCalled()
  expect(fx.signOut).not.toHaveBeenCalled()
  expect(fx.deleteUser).not.toHaveBeenCalled()
  expect(fx.jobs.size).toBe(0)
  expect(fx.users.has(member)).toBe(true)
})

test.each([null, ''])('legacy requests without a bearer cannot initialize clients or jobs (%p)', async token => {
  const fx = fixture()
  const response = await fx.request(token)
  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ deletionStarted: false })
  expect(fx.getSupabaseAdmin).not.toHaveBeenCalled()
  expect(fx.jobs.size).toBe(0)
})

test.each([
  { confirm: 'DELETE', expectedUserId: other },
  { confirm: 'DELETE', receipt },
  { confirm: 'DELETE', receipt: null, expectedUserId: member },
  { confirm: 'DELETE', userId: other },
  { confirm: 'DELETE', receipt: 'broken', expectedUserId: member },
])('partial receipt or identity-bearing bodies never fall back to legacy (%p)', async body => {
  const fx = fixture()
  expect((await fx.request('member-token', body)).status).toBe(400)
  expect(fx.getSupabaseAdmin).not.toHaveBeenCalled()
  expect(fx.providers).not.toHaveBeenCalled()
})

test.each(['unknown-token', 'member-token'])('an unbound invalid or expired token never starts deletion (%p)', async token => {
  const fx = fixture()
  fx.expiredTokens.add(token)
  expect((await fx.request(token)).status).toBe(401)
  expect(fx.jobs.size).toBe(0)
  expect(fx.aliases.size).toBe(0)
  expect(fx.providers).not.toHaveBeenCalled()
})

test('provider failure retains Auth and a bound now-expired bearer only resumes its existing job', async () => {
  const fx = fixture()
  fx.providers.mockRejectedValueOnce(new Error('temporary provider failure'))
  expect((await fx.request()).status).toBe(503)
  expect(fx.users.has(member)).toBe(true)
  expect(fx.signOut).not.toHaveBeenCalled()
  expect(fx.jobs.get(member)?.state).toBe('requested')
  fx.expiredTokens.add('member-token')
  expect((await fx.request()).status).toBe(200)
  expect(fx.getUser).toHaveBeenCalledTimes(1)
  expect(fx.jobs.size).toBe(1)
})

test('a refreshed valid bearer resumes the same job without rotating its saved receipt', async () => {
  const fx = fixture()
  fx.providers.mockRejectedValueOnce(new Error('temporary provider failure'))
  expect((await fx.request('member-token', { confirm: 'DELETE', receipt, expectedUserId: member })).status).toBe(503)
  const savedDigest = fx.jobs.get(member)!.receiptDigest
  expect((await fx.request('refreshed-member-token')).status).toBe(200)
  expect(fx.jobs.get(member)?.receiptDigest).toBe(savedDigest)
  expect((await fx.request(null, { confirm: 'DELETE', receipt, expectedUserId: member })).status).toBe(200)
  expect(fx.deleteUser).toHaveBeenCalledTimes(1)
})

test('a different valid bearer can only delete its own account, never resume another member job', async () => {
  const fx = fixture()
  fx.providers.mockRejectedValueOnce(new Error('temporary provider failure'))
  expect((await fx.request()).status).toBe(503)
  expect((await fx.request('other-token')).status).toBe(200)
  expect(fx.jobs.get(member)?.state).toBe('requested')
  expect(fx.users.has(member)).toBe(true)
  expect(fx.deleteUser).toHaveBeenCalledTimes(1)
  expect(fx.deleteUser).toHaveBeenCalledWith(other)
})

test('a committed Auth deletion with a lost response resumes through its bound bearer and confirms absence', async () => {
  const fx = fixture()
  fx.deleteUser.mockImplementationOnce(async id => { fx.users.delete(id); return { error: { status: 503 } } })
  expect((await fx.request()).status).toBe(503)
  expect(fx.jobs.get(member)?.state).toBe('data_removed')
  expect(fx.users.has(member)).toBe(false)
  expect((await fx.request()).status).toBe(200)
  expect(fx.getUser).toHaveBeenCalledTimes(1)
  expect(fx.getUserById).toHaveBeenCalledWith(member)
  expect(fx.jobs.get(member)?.state).toBe('completed')
})

test('a lost begin response leaves the already-authorized alias available for a same-token retry', async () => {
  const fx = fixture()
  const original = fx.rpc.getMockImplementation()!
  let lost = false
  fx.rpc.mockImplementation(async (name, args) => {
    const result = await original(name, args)
    if (name === 'begin_legacy_account_deletion' && !lost) { lost = true; throw new Error('lost database response') }
    return result
  })
  expect((await fx.request()).status).toBe(503)
  expect(fx.providers).not.toHaveBeenCalled()
  expect(fx.aliases.get(bearerHash('member-token'))).toBe(member)
  expect((await fx.request()).status).toBe(200)
  expect(fx.getUser).toHaveBeenCalledTimes(1)
})

test('legacy retry never reports success on ambiguous Auth deletion confirmation', async () => {
  const fx = fixture()
  fx.getUserById.mockResolvedValueOnce({ data: { user: null }, error: null })
  expect((await fx.request()).status).toBe(503)
  expect(fx.jobs.get(member)?.state).toBe('data_removed')
  expect((await fx.request()).status).toBe(200)
})

test('explicit receipt recovery can take over a legacy job and remains usable without a bearer', async () => {
  const fx = fixture()
  fx.providers.mockRejectedValueOnce(new Error('temporary provider failure'))
  expect((await fx.request()).status).toBe(503)
  fx.deleteUser.mockImplementationOnce(async id => { fx.users.delete(id); return { error: { status: 503 } } })
  expect((await fx.request('member-token', { confirm: 'DELETE', receipt, expectedUserId: member })).status).toBe(503)
  expect((await fx.request(null, { confirm: 'DELETE', receipt, expectedUserId: member })).status).toBe(200)
  expect(fx.jobs.get(member)?.state).toBe('completed')
})

test.each([null, 'member-token', 'wrong-service-secret'])('reconciliation rejects non-service callers before client initialization (%p)', async token => {
  const fx = fixture()
  expect((await fx.request(token, { action: 'reconcile-legacy' })).status).toBe(401)
  expect(fx.getSupabaseAdmin).not.toHaveBeenCalled()
  expect(fx.jobs.size).toBe(0)
})

test('service reconciliation refuses caller identity and confirmation fields before claiming work', async () => {
  const fx = fixture()
  for (const body of [{ action: 'reconcile-legacy', userId: member }, { action: 'reconcile-legacy', confirm: 'DELETE' }]) {
    expect((await fx.request('synthetic-service-secret', body)).status).toBe(400)
  }
  expect(fx.getSupabaseAdmin).not.toHaveBeenCalled()
})

test('exact service action claims once and cannot start an unrequested deletion', async () => {
  const fx = fixture()
  const response = await fx.request('synthetic-service-secret', { action: 'reconcile-legacy' })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true, claimed: 0, completed: 0 })
  expect(fx.rpc.mock.calls.map(([name]) => name)).toEqual(['claim_legacy_account_deletion_job'])
  expect(fx.getUser).not.toHaveBeenCalled()
  expect(fx.jobs.size).toBe(0)
  expect(fx.deleteUser).not.toHaveBeenCalled()
})

test('actual handler accepts the registered default opaque apikey without Authorization or the legacy alias', async () => {
  const secret = 'sb_secret_synthetic_registered_default_123456789'
  const fx = fixture({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: secret }), SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_different_platform_alias' })
  const response = await fx.request(null, { action: 'reconcile-legacy' }, { apikey: secret })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true, claimed: 0, completed: 0 })
  expect(fx.rpc.mock.calls.map(([name]) => name)).toEqual(['claim_legacy_account_deletion_job'])
  expect(fx.getSupabaseAdmin).toHaveBeenCalledTimes(2)
  expect(fx.getUser).not.toHaveBeenCalled()
  expect(fx.jobs.size).toBe(0)
  expect(fx.deleteUser).not.toHaveBeenCalled()
})

test.each([
  { map: '{', key: 'sb_secret_synthetic_registered_default_123456789' },
  { map: 'null', key: 'sb_secret_synthetic_registered_default_123456789' },
  { map: JSON.stringify({ default: 'sb_publishable_public_key' }), key: 'sb_publishable_public_key' },
  { map: JSON.stringify({ default: 'sb_secret_registered', unrelated: 'sb_secret_other_named' }), key: 'sb_secret_other_named' },
  { map: JSON.stringify({ default: 'sb_secret_registered' }), key: 'sb_secret_wrong_project' },
  { map: JSON.stringify({ default: 'sb_secret_registered' }), key: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.' },
])('actual handler rejects public/unregistered/malformed service credentials before admin work (%#)', async ({ map, key }) => {
  const fx = fixture({ SUPABASE_SECRET_KEYS: map })
  const response = await fx.request(null, { action: 'reconcile-legacy' }, { apikey: key })
  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ error: 'Service authentication is required' })
  expect(fx.getSupabaseAdmin).not.toHaveBeenCalled()
  expect(fx.rpc).not.toHaveBeenCalled()
  expect(fx.jobs.size).toBe(0)
})

test('registered opaque service credentials cannot supply an identity or initialize deletion', async () => {
  const secret = 'sb_secret_synthetic_registered_default_123456789'
  const fx = fixture({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: secret }) })
  expect((await fx.request(null, { action: 'reconcile-legacy', expectedUserId: member }, { apikey: secret })).status).toBe(400)
  expect((await fx.request(null, { confirm: 'DELETE' }, { apikey: secret })).status).toBe(401)
  expect((await fx.request(secret, { action: 'reconcile-legacy' })).status).toBe(401)
  expect(fx.getSupabaseAdmin).not.toHaveBeenCalled()
  expect(fx.jobs.size).toBe(0)
})
