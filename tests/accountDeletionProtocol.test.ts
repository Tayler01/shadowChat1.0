
/** @jest-environment node */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { transpileModule, ModuleKind } from 'typescript'
import { ACCOUNT_DELETION_CAPABILITIES } from '../supabase/functions/_shared/account-deletion-protocol'
import { requireAccountDeletionProtocol } from '../src/lib/accountDeletionProtocol'
import * as reconciliation from '../supabase/functions/_shared/account-deletion-reconciliation'

function handlerFixture() {
  let handler!: (request: Request) => Promise<Response>
  const getSupabaseAdmin = jest.fn(() => ({}))
  const runAccountDeletion = jest.fn()
  const runLegacyAccountDeletion = jest.fn()
  const provider = jest.fn()
  const hashToken = jest.fn(async () => 'hashed-receipt')
  const json = (body: unknown, status = 200) => Response.json(body, { status })
  const modules: Record<string, unknown> = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (callback: typeof handler) => { handler = callback } },
    '../_shared/bridge.ts': { getSupabaseAdmin, hashToken, corsHeaders: { 'Access-Control-Allow-Origin': '*' }, json, badRequest: (error: string) => json({ error }, 400) },
    '../_shared/account-deletion-protocol.ts': { ACCOUNT_DELETION_CAPABILITIES },
    '../_shared/account-deletion-reconciliation.ts': reconciliation,
    '../_shared/account-deletion-workflow.ts': { runAccountDeletion, runLegacyAccountDeletion, AccountDeletionRequestError: class extends Error {} },
    '../_shared/account-deletion-providers.ts': { cleanupAccountProviders: provider, createBunnyVideoDeletionProvider: provider },
    '../_shared/shado-live.ts': { createLiveKitClients: provider },
    '../_shared/moderation-media.ts': { captureModerationMedia: provider },
  }
  const source = readFileSync(path.resolve('supabase/functions/delete-account/index.ts'), 'utf8')
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  runInNewContext(compiled, { exports: {}, Response, require: (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected handler dependency: ${name}`)
    return modules[name]
  } })
  return { handler, getSupabaseAdmin, runAccountDeletion, runLegacyAccountDeletion, provider, hashToken }
}

test.each([undefined, 'Bearer synthetic-session'])('the actual handler answers capabilities without credentials, admin, hashing or provider work (%p)', async authorization => {
  const fx = handlerFixture()
  const response = await fx.handler(new Request('https://example.supabase.co/functions/v1/delete-account', {
    method: 'POST', headers: authorization ? { Authorization: authorization } : {}, body: JSON.stringify({ action: 'capabilities' }),
  }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(ACCOUNT_DELETION_CAPABILITIES)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  for (const operation of [fx.getSupabaseAdmin, fx.runAccountDeletion, fx.runLegacyAccountDeletion, fx.provider, fx.hashToken]) expect(operation).not.toHaveBeenCalled()
})

test.each([{ action: 'capabilities', confirm: 'DELETE' }, { action: 'capabilities', receipt: 'a'.repeat(43) }, { action: 'unknown', confirm: 'DELETE' }, null])('the handler rejects mixed or invalid probes before destructive work (%p)', async body => {
  const fx = handlerFixture()
  const response = await fx.handler(new Request('https://example.supabase.co/functions/v1/delete-account', { method: 'POST', body: JSON.stringify(body) }))
  expect(response.status).toBe(400)
  for (const operation of [fx.getSupabaseAdmin, fx.runAccountDeletion, fx.runLegacyAccountDeletion, fx.provider, fx.hashToken]) expect(operation).not.toHaveBeenCalled()
})

test('the normal confirmed receipt request still reaches the existing deletion workflow', async () => {
  const fx = handlerFixture()
  const response = await fx.handler(new Request('https://example.supabase.co/functions/v1/delete-account', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-session' },
    body: JSON.stringify({ confirm: 'DELETE', receipt: 'a'.repeat(43), expectedUserId: '00000000-0000-4000-8000-000000000001' }),
  }))
  expect(response.status).toBe(200)
  expect(fx.runAccountDeletion).toHaveBeenCalledTimes(1)
  expect(fx.runAccountDeletion).toHaveBeenCalledWith({}, 'synthetic-session', 'hashed-receipt', '00000000-0000-4000-8000-000000000001', expect.any(Function), expect.any(Function))
})

test.each([new Response('<html>proxy</html>', { status: 200 }), Response.json({ ok: true }), Response.json(ACCOUNT_DELETION_CAPABILITIES, { status: 503 })])('non-protocol responses cannot authorize deletion (%p)', async response => {
  const originalFetch = global.fetch
  global.fetch = jest.fn().mockResolvedValue(response)
  try { await expect(requireAccountDeletionProtocol('https://example.supabase.co', 'public-key')).rejects.toThrow('No deletion request was sent') }
  finally { global.fetch = originalFetch }
})

test('a stalled capability probe aborts and never falls through to deletion', async () => {
  const originalFetch = global.fetch
  jest.useFakeTimers()
  const request = jest.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }))
  global.fetch = request as typeof fetch
  try {
    const failure = expect(requireAccountDeletionProtocol('https://example.supabase.co', 'public-key')).rejects.toThrow('No deletion request was sent')
    await jest.advanceTimersByTimeAsync(10_001)
    await failure
    expect(request).toHaveBeenCalledTimes(1)
    expect(JSON.parse(request.mock.calls[0][1].body as string)).toEqual({ action: 'capabilities' })
  } finally { global.fetch = originalFetch; jest.useRealTimers() }
})
