import { captureModerationMedia, createModerationMediaReview, parseModerationMediaAssets, type ModerationMediaAsset } from '../supabase/functions/_shared/moderation-media'

const id = '10000000-0000-4000-8000-000000000001'
const caseId = '20000000-0000-4000-8000-000000000002'
const reportId = '30000000-0000-4000-8000-000000000003'
const ownerId = '40000000-0000-4000-8000-000000000004'
const videoId = '50000000-0000-4000-8000-000000000005'
const record = (patch: Partial<ModerationMediaAsset> = {}): ModerationMediaAsset => ({
  id, case_id: caseId, report_id: reportId, media_key: 'fileUrl', kind: 'image', provider: 'storage', status: 'pending',
  source_bucket: 'chat-uploads', source_path: `${ownerId}/photo.jpg`, source_url: `https://project.supabase.co/storage/v1/object/public/chat-uploads/${ownerId}/photo.jpg`,
  source_size_bytes: 100, source_content_type: 'image/jpeg', library_id: null, asset_id: null,
  storage_bucket: 'moderation-captured-media', storage_path: `captured/${caseId}/${id}`, error_code: null,
  ...patch,
})
const fixture = () => {
  const rpc = jest.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: null, error: null as unknown }))
  const copy = jest.fn(async (_source: string, _destination: string, _options: { destinationBucket: string }) => ({ data: {}, error: null as unknown }))
  const createSignedUrl = jest.fn(async (_path: string, _ttl: number, _options?: { download?: boolean | string }) => ({ data: { signedUrl: 'https://project.supabase.co/storage/v1/object/sign/evidence?token=short' }, error: null as unknown }))
  const from = jest.fn((_bucket: string) => ({ copy, createSignedUrl }))
  return { client: { rpc, storage: { from } }, rpc, copy, createSignedUrl, from }
}

test('copies only the authoritative source into the case-owned bucket before confirming capture', async () => {
  const fx = fixture()
  await captureModerationMedia(fx.client, [record()], { supabaseUrl: 'https://project.supabase.co' })
  expect(fx.copy).toHaveBeenCalledWith(`${ownerId}/photo.jpg`, `captured/${caseId}/${id}`, { destinationBucket: 'moderation-captured-media' })
  expect(fx.rpc).toHaveBeenCalledWith('complete_moderation_media_capture', { target_asset_id: id })
  expect(fx.copy.mock.invocationCallOrder[0]).toBeLessThan(fx.rpc.mock.invocationCallOrder[0])
})

test.each([
  `https://attacker.example/storage/v1/object/public/chat-uploads/${ownerId}/photo.jpg`,
  `https://user:secret@project.supabase.co/storage/v1/object/public/chat-uploads/${ownerId}/photo.jpg`,
  `https://project.supabase.co/storage/v1/object/public/chat-uploads/${ownerId}/other.jpg`,
  `https://project.supabase.co/storage/v1/object/public/chat-uploads/${ownerId}/%2fphoto.jpg`,
])('never copies a forged or nonproject snapshot URL: %s', async source_url => {
  const fx = fixture()
  await captureModerationMedia(fx.client, [record({ source_url })], { supabaseUrl: 'https://project.supabase.co' })
  expect(fx.copy).not.toHaveBeenCalled()
  expect(fx.rpc).toHaveBeenCalledWith('reject_moderation_media_origin', { target_asset_id: id })
})

test('retries a lost copy response only when SQL confirms the existing destination', async () => {
  const fx = fixture()
  fx.copy.mockResolvedValue({ data: {}, error: { statusCode: '409' } })
  await expect(captureModerationMedia(fx.client, [record()], { supabaseUrl: 'https://project.supabase.co' })).resolves.toBeUndefined()
  fx.rpc.mockResolvedValue({ data: null, error: { message: 'Destination missing' } })
  await expect(captureModerationMedia(fx.client, [record()], { supabaseUrl: 'https://project.supabase.co' })).rejects.toThrow('capture is incomplete')
})

test('failed confirmation never reports successful capture or returns a URL', async () => {
  const fx = fixture()
  fx.rpc.mockResolvedValue({ data: null, error: { message: 'size mismatch' } })
  await expect(captureModerationMedia(fx.client, [record()], { supabaseUrl: 'https://project.supabase.co' })).rejects.toThrow('not confirmed')
  expect(fx.createSignedUrl).not.toHaveBeenCalled()
})

test('submitted attachments use trusted report linkage without an arbitrary URL', async () => {
  const fx = fixture()
  await captureModerationMedia(fx.client, [record({ media_key: `attachment:${id}`, source_bucket: 'moderation-evidence', source_url: null })], { supabaseUrl: 'https://project.supabase.co' })
  expect(fx.from).toHaveBeenCalledWith('moderation-evidence')
  expect(fx.copy).toHaveBeenCalledTimes(1)
})

test('wrong case, arbitrary target bucket and traversal records fail before signing', async () => {
  const fx = fixture()
  const signBunny = jest.fn(async () => 'https://player.mediadelivery.net/embed/signed')
  await expect(createModerationMediaReview(fx.client, [record({ status: 'ready' })], ownerId, signBunny)).rejects.toThrow('scope')
  expect(() => parseModerationMediaAssets([record({ storage_bucket: 'chat-uploads' })])).toThrow('Invalid')
  expect(() => parseModerationMediaAssets([record({ source_path: '../other/private.jpg' })])).toThrow('Invalid')
  expect(fx.createSignedUrl).not.toHaveBeenCalled()
  expect(signBunny).not.toHaveBeenCalled()
})

test('review signs only retained destination media and held registry video, with bounded lifetime', async () => {
  const fx = fixture()
  const signBunny = jest.fn(async () => 'https://iframe.mediadelivery.net/embed/123/signed')
  const views = await createModerationMediaReview(fx.client, [record({ status: 'ready', kind: 'file' }), record({ id: videoId, storage_path: `captured/${caseId}/${videoId}`, provider: 'bunny', status: 'ready', kind: 'video', library_id: '123', asset_id: videoId })], caseId, signBunny)
  expect(fx.from).toHaveBeenCalledWith('moderation-captured-media')
  expect(fx.createSignedUrl).toHaveBeenCalledWith(`captured/${caseId}/${id}`, 300, { download: true })
  expect(signBunny).toHaveBeenCalledWith('123', videoId)
  expect(views[1].contentType).toBe('application/x-bunny-player')
  expect(views[0]).not.toHaveProperty('source_path')
  expect(views[0]).not.toHaveProperty('source_url')
})

test('pending/unavailable evidence never receives a signing capability', async () => {
  const fx = fixture()
  const signBunny = jest.fn(async () => 'https://example.test/signed')
  const views = await createModerationMediaReview(fx.client, [record(), record({ status: 'unavailable' })], caseId, signBunny)
  expect(views.every(view => !view.url)).toBe(true)
  expect(fx.createSignedUrl).not.toHaveBeenCalled()
  expect(signBunny).not.toHaveBeenCalled()
})
