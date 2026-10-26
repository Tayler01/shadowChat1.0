import { cleanupAccountProviders, createBunnyVideoDeletionProvider } from '../supabase/functions/_shared/account-deletion-providers'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('Bunny cleanup uses the configured exact library and default DELETE transport', async () => {
  const cancel = jest.fn(async () => undefined)
  const fetcher = jest.fn(async () => ({ ok: true, status: 200, body: { cancel } }))
  globalThis.fetch = fetcher as unknown as typeof fetch
  const remove = createBunnyVideoDeletionProvider(() => ({ libraryId: ' 123 ', apiKey: ' fixture-key ' }))
  await expect(remove('123', 'asset-id')).resolves.toEqual({ ok: true, status: 200 })
  expect(fetcher).toHaveBeenCalledWith('https://video.bunnycdn.com/library/123/videos/asset-id', {
    method: 'DELETE', headers: { AccessKey: 'fixture-key' }, signal: expect.any(AbortSignal),
  })
  expect(cancel).toHaveBeenCalledTimes(1)
})

test.each([{ libraryId: 'other', apiKey: 'fixture-key' }, { libraryId: '123' }])('misconfigured Bunny cleanup makes no request', async configuration => {
  const fetcher = jest.fn()
  globalThis.fetch = fetcher
  await expect(createBunnyVideoDeletionProvider(() => configuration)('123', 'asset-id')).rejects.toThrow('not configured')
  expect(fetcher).not.toHaveBeenCalled()
})

test('Bunny transport preserves provider status for the idempotent cleanup policy', async () => {
  globalThis.fetch = jest.fn(async () => ({ ok: false, status: 404, body: null })) as unknown as typeof fetch
  await expect(createBunnyVideoDeletionProvider(() => ({ libraryId: '123', apiKey: 'fixture-key' }))('123', 'asset-id'))
    .resolves.toEqual({ ok: false, status: 404 })
})

test('an expired worker cannot send a new Bunny removal request', async () => {
  const controller = new AbortController()
  controller.abort(new Error('worker deadline'))
  const fetcher = jest.fn()
  globalThis.fetch = fetcher
  await expect(createBunnyVideoDeletionProvider(() => ({ libraryId: '123', apiKey: 'fixture-key' }), controller.signal)('123', 'asset-id')).rejects.toThrow('worker deadline')
  expect(fetcher).not.toHaveBeenCalled()
})

test('a deadline after one provider response prevents the next destructive call', async () => {
  const controller = new AbortController()
  const remove = jest.fn(async () => { controller.abort(new Error('worker deadline')); return { ok: true, status: 200 } })
  await expect(cleanupAccountProviders({ deleteBunnyVideo: remove, removeLiveParticipant: jest.fn(), deleteLiveRoom: jest.fn() }, {
    version: 1, storage: [], bunny_assets: [{ library_id: '123', asset_id: 'first' }, { library_id: '123', asset_id: 'second' }], unsupported_provider_assets: [], live_rooms: [], live_memberships: [],
  }, 'fixture-member', controller.signal)).rejects.toThrow('worker deadline')
  expect(remove).toHaveBeenCalledTimes(1)
})
