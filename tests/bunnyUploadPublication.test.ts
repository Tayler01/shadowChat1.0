/** @jest-environment node */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import { transpileModule, ModuleKind } from 'typescript'
import { createRegisteredBunnyUpload } from '../supabase/functions/_shared/bunny-upload-workflow'
import * as bunnyPoster from '../supabase/functions/_shared/bunny-stream-poster'

const owner = '10000000-0000-4000-8000-000000000001'
const categoryId = '20000000-0000-4000-8000-000000000002'
const sourceId = '30000000-0000-4000-8000-000000000003'
const assetId = '40000000-0000-4000-8000-000000000004'
const libraryId = '123'
type Row = Record<string, any>
type Failure = 'publish-response-lost' | 'draft-activation' | 'register' | 'create-response-lost' | 'finish' | 'processing-job'

/** Execute the real endpoint with a stateful DB/provider boundary. A lost DB
 * response deliberately commits the canonical row before returning an error. */
function fixture(slug: 'shadow-pin-video' | 'shado-tv-bunny-upload', failure?: Failure) {
  let handler!: (request: Request) => Promise<Response>
  const events: string[] = []
  const providerAssets = new Set<string>()
  const reservations = new Map<string, Row>()
  const registry: Row[] = []
  const tables: Record<string, Row[]> = {
    shadow_pin_categories: [{ id: categoryId, deleted_at: null }], shadow_pin_images: [], shadow_pin_draft_assets: [],
    shadow_pin_creator_drafts: [{ id: sourceId, creator_id: owner, revision: 1, state: 'draft', source_kind: 'video_upload', active_asset_id: null }],
    shado_tv_videos: [{ id: sourceId, created_by: owner, title: 'Fixture episode', subtitle: null, deleted_at: null, provider_payload: {}, provider_asset_id: null }],
    shado_tv_processing_jobs: [],
  }
  const rpc = jest.fn(async (name: string, args: Row) => {
    events.push(name)
    if (name === 'is_app_operator') return { data: true, error: null }
    if (name === 'reserve_bunny_upload') reservations.set(args.target_reservation_id, { ...args, assetId: null })
    else if (name === 'resolve_bunny_upload') reservations.get(args.target_reservation_id)!.assetId = args.target_asset_id
    else if (name === 'register_bunny_media_asset') {
      if (failure === 'register') return { data: null, error: new Error('Registry unavailable') }
      registry.push({ library_id: args.target_library_id, asset_id: args.target_asset_id, owner_id: args.target_owner_id, source_type: args.target_source_type, source_id: args.target_source_id })
    } else if (name === 'get_trusted_bunny_media_asset') return { data: registry.filter(row => row.source_type === args.target_source_type && row.source_id === args.target_source_id && row.asset_id === args.target_asset_id), error: null }
    else if (name === 'finish_bunny_upload') {
      if (failure === 'finish') return { data: null, error: new Error('Reservation completion response lost') }
      reservations.delete(args.target_reservation_id)
    } else if (name !== 'reserve_bunny_upload') throw new Error(`Unexpected RPC: ${name}`)
    return { data: null, error: null }
  })
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = []
    let mode = 'read', payload: Row, head = false, single = false
    const query: any = {
      select: (_columns?: string, options?: { head?: boolean }) => { head = !!options?.head; return query },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query },
      is: (key: string, value: unknown) => { filters.push(row => row[key] === value || value === null && row[key] === undefined); return query },
      neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return query },
      gte: () => query, order: () => query, limit: () => query, not: () => query,
      insert: (value: Row) => { mode = 'insert'; payload = value; return query },
      update: (value: Row) => { mode = 'update'; payload = value; return query },
      single: () => { single = true; return query }, maybeSingle: () => { single = true; return query },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(() => {
        const rows = tables[table]
        if (!rows) throw new Error(`Unexpected table: ${table}`)
        let selected = rows.filter(row => filters.every(filter => filter(row)))
        if (mode !== 'read') {
          events.push(`${table}:${mode}`)
          if (failure === 'draft-activation' && table === 'shadow_pin_creator_drafts') return { data: null, error: new Error('Draft activation failed') }
          if (failure === 'processing-job' && table === 'shado_tv_processing_jobs') return { data: null, error: new Error('Job write failed') }
          if (mode === 'insert') { const saved = structuredClone(payload!); rows.push(saved); selected = [saved] }
          else for (const row of selected) Object.assign(row, structuredClone(payload!))
          if (failure === 'publish-response-lost' && ['shadow_pin_images', 'shado_tv_videos'].includes(table)) return { data: null, error: new Error('Database response lost after commit') }
        }
        return { data: head ? null : single ? structuredClone(selected[0] ?? null) : structuredClone(selected), count: head ? selected.length : null, error: null }
      }).then(resolve, reject),
    }
    return query
  }
  const client = { rpc, from }
  const requestProvider = jest.fn(async (input: string | URL, options?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: owner })
    if (url === `https://video.bunnycdn.com/library/${libraryId}/videos` && options?.method === 'POST') {
      events.push('provider:create'); providerAssets.add(assetId)
      if (failure === 'create-response-lost') throw new Error('Provider response lost after create')
      return Response.json({ guid: assetId })
    }
    if (url === `https://video.bunnycdn.com/library/${libraryId}/videos/${assetId}` && options?.method === 'DELETE') {
      events.push('provider:delete'); providerAssets.delete(assetId)
      return Response.json({ success: true })
    }
    throw new Error('Unexpected external request')
  })
  const env: Record<string, string> = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'fixture-public', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', BUNNY_STREAM_LIBRARY_ID: libraryId, BUNNY_STREAM_API_KEY: 'fixture-provider-key' }
  const modules: Record<string, unknown> = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (callback: typeof handler) => { handler = callback } },
    'https://esm.sh/@supabase/supabase-js@2.57.4': { createClient: () => client },
    '../_shared/edge-guard.ts': { authenticateEdgeUser: async () => ({ id: owner }), requireActiveEdgeMember: async () => {}, consumeEdgeRateLimit: async () => {}, EdgeAuthenticationError: class extends Error {}, EdgeRateLimitError: class extends Error {} },
    '../_shared/bunny-upload-workflow.ts': { createRegisteredBunnyUpload },
    '../_shared/bunny-stream-poster.ts': bunnyPoster,
    '../_shared/safe-fetch.ts': {}, '../_shared/bunny-stream-status.ts': {}, '../_shared/bunny-media-access.ts': {}, '../_shared/bunny-media-removal.ts': {},
  }
  const source = readFileSync(path.resolve(`supabase/functions/${slug}/index.ts`), 'utf8')
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  runInNewContext(compiled, { exports: {}, Response, URL, TextEncoder, crypto: webcrypto, AbortSignal, fetch: requestProvider, console: { error: jest.fn() }, Deno: { env: { get: (name: string) => env[name] } }, require: (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected handler dependency: ${name}`)
    return modules[name]
  } })
  return { events, providerAssets, reservations, registry, tables, rpc, requestProvider,
    request: (body: Row) => handler(new Request(`https://example.supabase.co/functions/v1/${slug}`, { method: 'POST', headers: { Authorization: 'Bearer fixture-user' }, body: JSON.stringify(body) })) }
}

const pinUpload = { action: 'create-upload', categoryId, title: 'Fixture Pin', fileName: 'fixture.mp4', fileType: 'video/mp4', fileSize: 2048, durationSeconds: 3 }
const tvUpload = { action: 'create-upload', videoId: sourceId, uploadKind: 'episode', fileName: 'fixture.mp4', fileType: 'video/mp4', fileSize: 2048 }

test.each(['shadow-pin-video', 'shado-tv-bunny-upload'] as const)('%s preserves a committed media row and provider asset after its publication response is lost', async slug => {
  const fx = fixture(slug, 'publish-response-lost')
  const response = await fx.request(slug === 'shadow-pin-video' ? pinUpload : tvUpload)
  expect(response.ok).toBe(false)
  expect(fx.tables[slug === 'shadow-pin-video' ? 'shadow_pin_images' : 'shado_tv_videos'][0].provider_asset_id).toBe(assetId)
  expect(fx.providerAssets.has(assetId)).toBe(true)
  expect([...fx.reservations.values()][0].assetId).toBe(assetId)
  expect(fx.events).not.toContain('provider:delete')
  expect(fx.events).not.toContain('finish_bunny_upload')
})

test('Creator Studio preserves the inserted asset when draft activation fails', async () => {
  const fx = fixture('shadow-pin-video', 'draft-activation')
  const response = await fx.request({ ...pinUpload, action: 'create-draft-upload', draftId: sourceId, expectedRevision: 1 })
  expect(response.ok).toBe(false)
  expect(fx.tables.shadow_pin_draft_assets[0].provider_asset_id).toBe(assetId)
  expect(fx.tables.shadow_pin_creator_drafts[0].active_asset_id).toBeNull()
  expect(fx.providerAssets.has(assetId)).toBe(true)
  expect(fx.reservations.size).toBe(1)
  expect(fx.events).not.toContain('provider:delete')
})

test.each(['shadow-pin-video', 'shado-tv-bunny-upload'] as const)('%s compensates only before canonical publication is attempted', async slug => {
  const fx = fixture(slug, 'register')
  expect((await fx.request(slug === 'shadow-pin-video' ? pinUpload : tvUpload)).ok).toBe(false)
  expect(fx.events).toContain('provider:delete')
  expect(fx.providerAssets.size).toBe(0)
  expect(fx.reservations.size).toBe(0)
  expect(fx.rpc).toHaveBeenLastCalledWith('finish_bunny_upload', expect.objectContaining({ cleanup_confirmed: true }))
  expect(fx.events.some(event => event.endsWith(':insert') || event.endsWith(':update'))).toBe(false)
})

test.each(['shadow-pin-video', 'shado-tv-bunny-upload'] as const)('%s keeps an unknown external create reserved without guessing its GUID or deleting', async slug => {
  const fx = fixture(slug, 'create-response-lost')
  expect((await fx.request(slug === 'shadow-pin-video' ? pinUpload : tvUpload)).ok).toBe(false)
  expect([...fx.reservations.values()][0].assetId).toBeNull()
  expect(fx.providerAssets.has(assetId)).toBe(true)
  expect(fx.events).not.toContain('provider:delete')
  expect(fx.registry).toEqual([])
})

test.each(['shadow-pin-video', 'shado-tv-bunny-upload'] as const)('%s preserves the current full-app upload and completion wire contract', async slug => {
  const fx = fixture(slug)
  const response = await fx.request(slug === 'shadow-pin-video' ? pinUpload : tvUpload)
  const body = await response.json()
  expect(response.status).toBe(200)
  expect(body).toMatchObject({ ok: true, bunnyVideoId: assetId, libraryId, endpoint: 'https://video.bunnycdn.com/tusupload', authorizationSignature: expect.stringMatching(/^[a-f0-9]{64}$/), authorizationExpire: expect.any(Number) })
  expect(fx.registry).toHaveLength(1)
  expect(fx.reservations.size).toBe(0)
  const completed = await fx.request(slug === 'shadow-pin-video'
    ? { action: 'complete-upload', imageId: body.image.id, bunnyVideoId: assetId }
    : { action: 'complete-upload', videoId: sourceId, uploadKind: 'episode', bunnyVideoId: assetId })
  expect(completed.status).toBe(200)
  expect(await completed.json()).toMatchObject({ ok: true })
  expect(fx.events.indexOf('register_bunny_media_asset')).toBeLessThan(fx.events.indexOf(slug === 'shadow-pin-video' ? 'shadow_pin_images:insert' : 'shado_tv_videos:update'))
})

test('an unknown legacy asset is not adopted just because a mutable Pin row names its GUID', async () => {
  const fx = fixture('shadow-pin-video')
  fx.tables.shadow_pin_images.push({ id: sourceId, creator_id: owner, provider: 'bunny_stream', provider_asset_id: assetId, deleted_at: null })
  const response = await fx.request({ action: 'complete-upload', imageId: sourceId, bunnyVideoId: assetId })
  expect(response.ok).toBe(false)
  expect(fx.registry).toEqual([])
  expect(fx.events).not.toContain('register_bunny_media_asset')
  expect(fx.requestProvider).not.toHaveBeenCalled()
})

test.each(['finish', 'processing-job'] as const)('TV %s failure retains the published media and a retriable reservation', async failure => {
  const fx = fixture('shado-tv-bunny-upload', failure)
  expect((await fx.request(tvUpload)).ok).toBe(false)
  expect(fx.tables.shado_tv_videos[0].provider_asset_id).toBe(assetId)
  expect(fx.providerAssets.has(assetId)).toBe(true)
  expect([...fx.reservations.values()][0].assetId).toBe(assetId)
  expect(fx.events).not.toContain('provider:delete')
})
