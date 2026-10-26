import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { authorizeBunnyMediaSource, type BunnyAccessStore, type BunnyVisibleReference } from './bunny-media-access.ts'

const asset = '10000000-0000-0000-0000-000000000001'
const config = { libraryId: '123', pullZoneUrl: 'https://private.b-cdn.net', tokenSecurityKey: 'fixture-only-security-key', nowSeconds: 1000 }
const source = `${config.pullZoneUrl}/${asset}/play_720p.mp4`
const reference: BunnyVisibleReference = { id: 'pin', ownerId: 'owner', sourceType: 'shadow_pin_image', assetId: asset, mediaUrls: [source] }
const store = (overrides: Partial<BunnyAccessStore> = {}): BunnyAccessStore => ({
  visibleReferences: async () => [reference],
  trustedReferences: async () => [{ library_id: '123', asset_id: asset, owner_id: 'owner' }],
  ...overrides,
})

Deno.test('visible registered recipient receives a five-minute directory-scoped URL', async () => {
  const result = await authorizeBunnyMediaSource(source, config, store())
  assertEquals(result.managed, true)
  if (result.managed) {
    assertEquals(result.expiresAt, 1_300_000)
    assertEquals(result.url.includes(`/bcdn_token=HS256-`), true)
    assertEquals(result.url.endsWith(`/${asset}/play_720p.mp4`), true)
  }
})

for (const reason of ['nonparticipant', 'blocked', 'deleted', 'hidden']) {
  Deno.test(`no visible source after ${reason} denies signing without unsigned fallback`, async () => {
    await assertRejects(() => authorizeBunnyMediaSource(source, config, store({ visibleReferences: async () => [] })), Error, 'unavailable')
  })
}
Deno.test('forged visible row cannot borrow another uploader registry identity', async () => {
  await assertRejects(() => authorizeBunnyMediaSource(source, config, store({ trustedReferences: async () => [{ library_id: '123', asset_id: asset, owner_id: 'victim' }] })), Error, 'unavailable')
  await assertRejects(() => authorizeBunnyMediaSource(source, config, store({ trustedReferences: async () => [] })), Error, 'unavailable')
})
Deno.test('only canonical media filenames may be signed', async () => {
  await assertRejects(() => authorizeBunnyMediaSource(source.replace('play_720p.mp4', 'original.mp4'), config, store()), Error, 'unavailable')
})
Deno.test('embed preserves bounded playback controls but ignores client token/expiration', async () => {
  const result = await authorizeBunnyMediaSource(`https://iframe.mediadelivery.net/embed/123/${asset}?token=forged&expires=99999999&autoplay=true&t=42.5&captions=en&redirect=evil`, config, store())
  if (!result.managed) throw new Error('Expected managed source')
  const url = new URL(result.url)
  assertEquals(url.searchParams.get('autoplay'), 'true')
  assertEquals(url.searchParams.get('t'), '42.5')
  assertEquals(url.searchParams.get('captions'), 'en')
  assertEquals(url.searchParams.get('expires'), '1300')
  assertEquals(url.searchParams.has('redirect'), false)
})
Deno.test('external libraries are explicitly unmanaged; malformed own paths fail closed', async () => {
  assertEquals(await authorizeBunnyMediaSource(`https://player.mediadelivery.net/embed/456/${asset}`, config, store()), { managed: false })
  assertEquals(await authorizeBunnyMediaSource(`https://other.b-cdn.net/${asset}/play.mp4`, config, store()), { managed: false })
  await assertRejects(() => authorizeBunnyMediaSource(`${config.pullZoneUrl}/%2e%2e/secret.mp4`, config, store()))
})
Deno.test('database failures do not become an external-public fallback', async () => {
  await assertRejects(() => authorizeBunnyMediaSource(source, config, store({ trustedReferences: async () => { throw new Error('offline') } })), Error, 'offline')
})
