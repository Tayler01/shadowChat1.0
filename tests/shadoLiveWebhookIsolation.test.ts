/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transpileModule, ModuleKind } from 'typescript'

const testRoom = 'shadowchat-qa-empty-delete-00112233-4455-4677-8899-aabbccddeeff'
function fixture() {
  let handler!: (request: Request) => Promise<Response>
  const createEdgeAdminClient = jest.fn(() => ({}))
  const callShadoLiveRpc = jest.fn(async () => ({}))
  const verifyLiveKitWebhook = jest.fn(async (body: string) => JSON.parse(body))
  class RequestError extends Error {
    constructor(message: string, public status: number, public code: string) { super(message) }
  }
  const jsonResponse = (body: unknown, status = 200) => Response.json(body, { status })
  const modules: Record<string, unknown> = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (callback: typeof handler) => { handler = callback } },
    '../_shared/edge-guard.ts': { createEdgeAdminClient },
    '../_shared/shado-live.ts': {
      SHADO_LIVE_INGEST_WEBHOOK_RPC: 'shado_live_ingest_provider_webhook',
      ShadoLiveRequestError: RequestError, callShadoLiveRpc, jsonResponse, verifyLiveKitWebhook,
      normalizeUuid: (value: string) => value,
      errorResponse: (error: RequestError) => jsonResponse({ error: error.message, code: error.code }, error.status ?? 500),
    },
  }
  const source = readFileSync('supabase/functions/shado-live-provider-webhook/index.ts', 'utf8')
  runInNewContext(transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
    exports: {}, Response, TextEncoder, require: (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`)
      return modules[name]
    },
  })
  const request = (event: object) => new Request('https://example.supabase.co/functions/v1/shado-live-provider-webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/webhook+json', Authorization: 'fixture-signature' }, body: JSON.stringify(event),
  })
  return { handler, request, createEdgeAdminClient, callShadoLiveRpc, verifyLiveKitWebhook }
}

test.each(['room_started', 'room_finished', 'participant_joined', 'participant_left', 'track_published', 'track_unpublished'])('signed %s for an isolated QA room cannot reach database or messages', async event => {
  const fx = fixture()
  const response = await fx.handler(fx.request({ id: 'fixture-event', event, createdAt: 1_792_794_000, room: { name: testRoom } }))
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_webhook_room')
  expect(fx.verifyLiveKitWebhook).toHaveBeenCalledTimes(1)
  expect(fx.createEdgeAdminClient).not.toHaveBeenCalled()
  expect(fx.callShadoLiveRpc).not.toHaveBeenCalled()
})

test.each(['egress', 'ingress'])('isolated %s payload without a room object is also rejected before database access', async type => {
  const fx = fixture()
  const response = await fx.handler(fx.request({ id: 'fixture-event', event: `${type}_started`, createdAt: 1_792_794_000,
    [`${type}Info`]: { roomName: testRoom } }))
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_webhook_room')
  expect(fx.createEdgeAdminClient).not.toHaveBeenCalled()
  expect(fx.callShadoLiveRpc).not.toHaveBeenCalled()
})

test('the isolation fixture still permits a canonical signed app room to reach its existing RPC', async () => {
  const fx = fixture()
  const response = await fx.handler(fx.request({ id: 'fixture-event', event: 'room_finished', createdAt: 1_792_794_000,
    room: { name: 'shado-live-00112233-4455-4677-8899-aabbccddeeff' } }))
  expect(response.status).toBe(200)
  expect(fx.createEdgeAdminClient).toHaveBeenCalledTimes(1)
  expect(fx.callShadoLiveRpc).toHaveBeenCalledTimes(1)
})
