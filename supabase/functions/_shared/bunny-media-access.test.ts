import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { authorizeBunnyMediaSource, ownedBunnyDraftReferences, type BunnyDraftAsset, type BunnyCreatorDraft, type BunnyAccessStore, type BunnyVisibleReference } from './bunny-media-access.ts'

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


const draftAsset: BunnyDraftAsset = { id: 'draft-asset', draft_id: 'draft', creator_id: 'owner', provider: 'bunny_stream', asset_kind: 'video',
  provider_asset_id: asset, state: 'ready', deleted_at: null, final_image_url: source.replace('play_720p.mp4','thumbnail.jpg'),
  final_thumbnail_url: null, final_medium_url: null, video_preview_url: null, video_playback_url: source, video_hls_url: null, video_embed_url: null }
const draft: BunnyCreatorDraft = { id: 'draft', creator_id: 'owner', active_asset_id: 'draft-asset', state: 'ready' }
const draftStore = (assets: BunnyDraftAsset[] = [draftAsset], drafts: BunnyCreatorDraft[] = [draft]): BunnyAccessStore => store({
  visibleReferences: async id => ownedBunnyDraftReferences('owner', id, assets, drafts),
  trustedReferences: async reference => reference.sourceType === 'shadow_pin_draft_asset' && reference.id === 'draft-asset'
    ? [{library_id:'123',asset_id:asset,owner_id:'owner'}] : [],
})
Deno.test('active owner draft signs its persisted poster and preview with trusted draft provenance', async () => {
  for (const target of [source, draftAsset.final_image_url!]) {
    const result = await authorizeBunnyMediaSource(target, config, draftStore())
    assertEquals(result.managed, true)
    if (result.managed) assertEquals(result.expiresAt, 1_300_000)
  }
})
for (const [reason, patch] of Object.entries({ otherOwner:{creator_id:'other'}, deleted:{deleted_at:'2026-10-28'}, superseded:{state:'superseded'}, failed:{state:'failed'}, foreignProvider:{provider:'youtube'}, foreignAsset:{provider_asset_id:'20000000-0000-0000-0000-000000000001'}, image:{asset_kind:'image'}, unrelatedDraft:{draft_id:'other'} })) {
  Deno.test('draft signing denies '+reason, async () => {
    await assertRejects(() => authorizeBunnyMediaSource(source,config,draftStore([{...draftAsset,...patch}])),Error,'unavailable')
  })
}
for (const [reason, patch] of Object.entries({ otherOwner:{creator_id:'other'}, inactive:{active_asset_id:'other'}, abandoned:{state:'abandoned'}, published:{state:'published'} })) {
  Deno.test('draft signing denies parent '+reason, async () => {
    await assertRejects(() => authorizeBunnyMediaSource(source,config,draftStore([draftAsset],[{...draft,...patch}])),Error,'unavailable')
  })
}
Deno.test('RLS-hidden draft or parent and absent provenance fail closed', async () => {
  for(const target of [draftStore([]),draftStore([draftAsset],[]),{...draftStore(),trustedReferences:async()=>[]}]) {
    await assertRejects(() => authorizeBunnyMediaSource(source,config,target),Error,'unavailable')
  }
})
Deno.test('draft ownership never permits an unlisted provider filename', async () => {
  await assertRejects(() => authorizeBunnyMediaSource(source.replace('play_720p.mp4','original.mp4'),config,draftStore()),Error,'unavailable')
})
