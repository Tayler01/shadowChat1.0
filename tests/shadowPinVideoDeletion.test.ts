import { ensureSession, getWorkingClient } from '../src/lib/supabase'
import { deleteShadowPinImage, retryDeletedShadowPinVideoCleanup } from '../src/features/shadow-pin/api/shadowPinApi'

jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(), getSessionWithTimeout: jest.fn(), getWorkingClient: jest.fn(), uploadShadowPinImage: jest.fn(),
}))

const removed = {
  id: 'pin-1', creator_id: 'owner-1', deleted_by: 'owner-1', deleted_at: '2026-11-01T00:00:00Z',
  media_type: 'video', source_type: 'file_upload', provider: 'bunny_stream', provider_asset_id: 'asset-1',
}
const cleaned = { ...removed, provider_asset_id: null }
const rpc = jest.fn()
const invoke = jest.fn()
const getSession = jest.fn()
beforeEach(() => {
  jest.resetAllMocks()
  ;(ensureSession as jest.Mock).mockResolvedValue(true)
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ rpc, functions: { invoke }, auth: { getSession } })
  getSession.mockResolvedValue({ data: { session: { user: { id: 'owner-1' } } } })
  rpc.mockResolvedValue({ data: removed, error: null })
  invoke.mockResolvedValue({ data: { ok: true, image: cleaned }, error: null })
})

test('ordinary deletion cleans only after canonical soft deletion and returns its completed receipt', async () => {
  await expect(deleteShadowPinImage('pin-1')).resolves.toEqual(cleaned)
  expect(rpc).toHaveBeenCalledWith('delete_shadow_pin_image', { target_image_id: 'pin-1' })
  expect(invoke).toHaveBeenCalledWith('shadow-pin-video', { body: { action: 'delete-video-asset', imageId: 'pin-1' } })
  expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0])
})

test('a failed canonical deletion cannot invoke provider cleanup', async () => {
  rpc.mockResolvedValue({ data: null, error: new Error('not permitted') })
  await expect(deleteShadowPinImage('pin-1')).rejects.toThrow('not permitted')
  expect(invoke).not.toHaveBeenCalled()
})

test.each([
  { media_type: 'image' }, { provider: 'youtube' }, { source_type: 'external_embed' },
  { provider_asset_id: null }, { deleted_at: null },
])('skips provider cleanup for ineligible deletion receipt %j', async patch => {
  const row = { ...removed, ...patch }
  rpc.mockResolvedValue({ data: row, error: null })
  await expect(deleteShadowPinImage('pin-1')).resolves.toEqual(row)
  expect(invoke).not.toHaveBeenCalled()
})

test('provider errors preserve deletion and return a same-account retry, which does not repeat canonical deletion', async () => {
  invoke.mockRejectedValueOnce(new Error('network unavailable'))
  await expect(deleteShadowPinImage('pin-1')).resolves.toEqual({ ...removed, videoCleanupPending: { imageId: 'pin-1', accountId: 'owner-1' } })
  await expect(retryDeletedShadowPinVideoCleanup('pin-1', 'owner-1')).resolves.toEqual(cleaned)
  expect(rpc).toHaveBeenCalledTimes(1)
})

test('operator cleanup fences retries to the deleting operator while retaining original media ownership', async () => {
  rpc.mockResolvedValue({ data: { ...removed, deleted_by: 'operator-1' }, error: null })
  getSession.mockResolvedValue({ data: { session: { user: { id: 'operator-1' } } } })
  await expect(deleteShadowPinImage('pin-1')).resolves.toMatchObject({ creator_id: 'owner-1', provider_asset_id: null })
  expect(invoke).toHaveBeenCalledTimes(1)
})

test('account switching after deletion preserves the deleted result and blocks cleanup/retry from the new account', async () => {
  getSession.mockResolvedValue({ data: { session: { user: { id: 'other-1' } } } })
  await expect(deleteShadowPinImage('pin-1')).resolves.toMatchObject({ deleted_at: removed.deleted_at, videoCleanupPending: { accountId: 'owner-1' } })
  await expect(retryDeletedShadowPinVideoCleanup('pin-1', 'owner-1')).rejects.toThrow('account that removed')
  expect(invoke).not.toHaveBeenCalled()
})

test.each([{ ok: false, image: cleaned }, { ok: true, image: removed }, { ok: true, image: { ...cleaned, id: 'other-pin' } }])('incomplete or wrong-source receipt cannot claim successful cleanup', async data => {
  invoke.mockResolvedValue({ data, error: null })
  await expect(retryDeletedShadowPinVideoCleanup('pin-1', 'owner-1')).rejects.toThrow('completed deletion receipt')
})
