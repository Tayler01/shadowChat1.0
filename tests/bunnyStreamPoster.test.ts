import fs from 'node:fs'
import path from 'node:path'
import {
  buildBunnyPosterPatch,
  buildBunnyThumbnailUrl,
  FALLBACK_VIDEO_POSTER_URL,
  needsBunnyPosterRepair,
} from '../supabase/functions/_shared/bunny-stream-poster'

const guid = 'b28d2b26-f6e2-4adc-85fd-3360c92aed4b'
const cdn = 'https://configured.b-cdn.net'
const status = { thumbnailFileName: 'thumbnail.jpg' }
const placeholder = { image_url: FALLBACK_VIDEO_POSTER_URL, thumbnail_url: FALLBACK_VIDEO_POSTER_URL, medium_url: null }

describe('provider-confirmed Bunny posters', () => {
  test('builds a thumbnail from configured CDN and provider basename only', () => {
    expect(buildBunnyThumbnailUrl(`${cdn}/`, guid, 'thumbnail.jpg')).toBe(`${cdn}/${guid}/thumbnail.jpg`)
    expect(buildBunnyThumbnailUrl(cdn, guid, null)).toBeNull()
  })

  test.each(['../thumbnail.jpg', 'https://evil.test/a.jpg', '/thumbnail.jpg', 'a/thumbnail.jpg', 'thumb.jpg?x=1', 'thumb.jpg#x', 'thumb.svg', '..jpg'])('rejects unsafe provider filename %s', file => {
    expect(buildBunnyThumbnailUrl(cdn, guid, file)).toBeNull()
  })

  test('rejects invalid video identity or configured origin', () => {
    expect(buildBunnyThumbnailUrl(cdn, '../other', 'thumbnail.jpg')).toBeNull()
    for (const origin of ['http://configured.b-cdn.net', 'https://user:secret@configured.b-cdn.net', `${cdn}?x=1`, 'bad']) {
      expect(buildBunnyThumbnailUrl(origin, guid, 'thumbnail.jpg')).toBeNull()
    }
  })

  test('repairs all published placeholder variants without allocating Storage paths', () => {
    expect(buildBunnyPosterPatch(placeholder, cdn, guid, status)).toEqual({
      image_url: `${cdn}/${guid}/thumbnail.jpg`, image_path: `bunny:${guid}:poster`,
      thumbnail_url: `${cdn}/${guid}/thumbnail.jpg`, thumbnail_path: null,
      medium_url: `${cdn}/${guid}/thumbnail.jpg`, medium_path: null,
    })
    expect(needsBunnyPosterRepair(placeholder)).toBe(true)
  })

  test('preserves custom posters and uses their Storage path for missing variants', () => {
    const custom = { ...placeholder, image_url: 'https://storage.test/poster.jpg', image_path: 'owner/poster.jpg' }
    expect(buildBunnyPosterPatch(custom, cdn, guid, status)).toEqual({
      thumbnail_url: custom.image_url, thumbnail_path: custom.image_path,
      medium_url: custom.image_url, medium_path: custom.image_path,
    })
    expect(buildBunnyPosterPatch({ ...custom, thumbnail_url: 'https://storage.test/thumb.jpg', medium_url: 'https://storage.test/medium.jpg' }, cdn, guid, status)).toEqual({})
  })

  test('repairs ready Creator assets before transactional publication', () => {
    const draft = { final_image_url: FALLBACK_VIDEO_POSTER_URL, final_thumbnail_url: `${cdn}${FALLBACK_VIDEO_POSTER_URL}` }
    expect(needsBunnyPosterRepair(draft, 'final_')).toBe(true)
    expect(buildBunnyPosterPatch(draft, cdn, guid, status, 'final_').final_image_url).toBe(`${cdn}/${guid}/thumbnail.jpg`)
    expect(buildBunnyPosterPatch(placeholder, cdn, guid, {})).toEqual({})
  })

  test('server wires repair into published polling, draft polling and publication preflight', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/shadow-pin-video/index.ts'), 'utf8')
    const sync = source.slice(source.indexOf('const handleSyncStatus'), source.indexOf('const buildYoutubeEmbedUrl'))
    const draftSync = source.slice(source.indexOf('const handleSyncDraftStatus'), source.indexOf('const handlePublishDraftVideo'))
    const publish = source.slice(source.indexOf('const handlePublishDraftVideo'), source.indexOf('const handleDeleteDraftVideoAsset'))
    expect(sync).toContain('buildBunnyPosterPatch(pin, pullZoneUrl, pin.provider_asset_id, bunnyStatus)')
    expect(sync).toContain(".eq('provider_asset_id', pin.provider_asset_id)")
    expect(draftSync).toContain("needsBunnyPosterRepair(asset, 'final_')")
    expect(draftSync).toContain("buildBunnyPosterPatch(asset, pullZoneUrl, asset.provider_asset_id, bunnyStatus, 'final_')")
    expect(publish.indexOf('.update(posterPatch)')).toBeLessThan(publish.indexOf("rpc('finalize_shadow_pin_creator_bunny_draft'"))
    expect(publish).toContain(".eq('creator_id', auth.userId)")
  })
})
