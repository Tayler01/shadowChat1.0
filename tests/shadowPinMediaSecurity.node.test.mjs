import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {
  createDerivatives,
  MAX_IMAGE_BYTES,
  processShadowPinDraftImage,
  processShadowPinRow,
  fetchRemoteImage,
  authenticateAuthorization,
} from '../netlify/functions/_shared/shadow-pin-media.mjs'

test('ShadowPin rejects SVG/HTML bytes before selecting an image decoder', async () => {
  for (const bytes of [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>',
    '<html><body>not an image</body></html>',
  ]) {
    await assert.rejects(() => createDerivatives(Buffer.from(bytes)), /image bytes are supported/)
  }
})

test('legacy member-media imports download with caller authority and never anonymously fetch the object', async () => {
  const previous = process.env.SUPABASE_URL
  process.env.SUPABASE_URL = 'https://fixture.supabase.co'
  const calls = []
  const userClient = { storage: { from: bucket => ({ download: async objectPath => {
    calls.push({ bucket, objectPath })
    return { data: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), error: null }
  } }) } }
  try {
    const source = 'https://fixture.supabase.co/storage/v1/object/public/chat-uploads/bob/photo.jpg'
    const result = await fetchRemoteImage(source, userClient)
    assert.equal(result.contentType, 'image/jpeg')
    assert.deepEqual(calls, [{ bucket: 'chat-uploads', objectPath: 'bob/photo.jpg' }])
    await assert.rejects(() => fetchRemoteImage(source), /Authenticated media access/)
    const denied = { storage: { from: () => ({ download: async () => ({ error: new Error('RLS denied') }) }) } }
    await assert.rejects(() => fetchRemoteImage(source, denied), /no longer have access/)
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previous
  }
})

test('a forged owned Pin row cannot make the service role download another creator object', async () => {
  const query = { select: () => query, eq: () => query, is: () => query,
    maybeSingle: async () => ({ data: { id: 'pin', creator_id: 'alice', image_path: 'bob/private.jpg' } }) }
  const admin = { from: () => query, get storage() { throw new Error('service-role download must not run') } }
  await assert.rejects(() => processShadowPinRow({ admin, targetType: 'image', id: 'pin', userId: 'alice' }), /does not belong/)
})

test('a valid Auth token is insufficient for deleted or deleting members to run privileged media work', async () => {
  const admin = { auth: { getUser: async () => ({ data: { user: { id: 'alice' } } }) }, rpc: async () => ({ data: false }) }
  assert.equal(await authenticateAuthorization('Bearer still-valid-jwt', admin), null)
  admin.rpc = async () => ({ data: true })
  assert.deepEqual(await authenticateAuthorization('Bearer active-jwt', admin), { id: 'alice' })
})

test('ShadowPin enforces actual image bytes instead of trusting declared size', async () => {
  const bytes = Buffer.alloc(MAX_IMAGE_BYTES + 1)
  Buffer.from([0xff, 0xd8, 0xff]).copy(bytes)
  await assert.rejects(() => createDerivatives(bytes), /15MB or smaller/)
})

test('ShadowPin still creates usable thumbnails for every supported raster format', async () => {
  for (const format of ['jpeg', 'png', 'webp', 'gif']) {
    const original = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#cf9f38' } })
      .toFormat(format).toBuffer()
    const result = await createDerivatives(original)
    const thumbnail = await sharp(result.thumbnail).metadata()
    const medium = await sharp(result.medium).metadata()
    assert.deepEqual({ width: result.width, height: result.height }, { width: 16, height: 12 })
    assert.equal(thumbnail.format, 'webp')
    assert.equal(medium.format, 'webp')
  }
})

test('a foreign draft path is rejected before any service-role read', async () => {
  const admin = new Proxy({}, { get: () => { throw new Error('unexpected service-role access') } })
  await assert.rejects(() => processShadowPinDraftImage({
    admin, userId: 'alice', draftId: 'alice-draft', storagePath: 'bob/private/original.png',
    contentType: 'image/png', sizeBytes: 1,
  }), /Draft storage path is invalid/)
})

test('an unavailable draft is rejected before Storage downloads', async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) }
  const admin = {
    from: () => query,
    get storage() { throw new Error('unexpected Storage read') },
  }
  await assert.rejects(() => processShadowPinDraftImage({
    admin, userId: 'alice', draftId: 'missing', storagePath: 'alice/missing/original.png',
    contentType: 'image/png', sizeBytes: 1,
  }), /Creator draft is unavailable/)
})
