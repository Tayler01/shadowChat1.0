import { getBunnyStreamThumbnailUrl, isShadowPinFallbackVideoPosterUrl } from '../src/features/shadow-pin/videoPoster'
import type { ShadowPinImage } from '../src/features/shadow-pin/types'

const videoId = 'b28d2b26-f6e2-4adc-85fd-3360c92aed4b'
const pin = (patch: Partial<ShadowPinImage> = {}) => ({
  id: 'pin',
  title: 'Video',
  image_url: '/entertainment/shado-tv/placeholders/video-vertical.webp',
  heart_count: 0,
  media_type: 'video',
  provider: 'bunny_stream',
  provider_asset_id: videoId,
  video_preview_url: `https://vz-c7e4be31-00e.b-cdn.net/${videoId}/play_480p.mp4`,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...patch,
}) as ShadowPinImage

test('uses an image-only Bunny CDN poster URL for older placeholder pins', () => {
  expect(getBunnyStreamThumbnailUrl(pin())).toBe(`https://vz-c7e4be31-00e.b-cdn.net/${videoId}/thumbnail.jpg`)
})

test('recognizes relative and absolute stored fallback posters by pathname', () => {
  expect(isShadowPinFallbackVideoPosterUrl('/entertainment/shado-tv/placeholders/video-vertical.webp')).toBe(true)
  expect(isShadowPinFallbackVideoPosterUrl('https://shadowchat.online/entertainment/shado-tv/placeholders/video-vertical.webp?version=1')).toBe(true)
  expect(isShadowPinFallbackVideoPosterUrl('https://images.example/video-vertical.webp')).toBe(false)
})

test('uses a validated provider thumbnail filename and HLS fallback', () => {
  const image = pin({
    video_preview_url: null,
    video_hls_url: `https://vz-c7e4be31-00e.b-cdn.net/${videoId}/playlist.m3u8`,
    provider_payload: { bunny_status: { thumbnailFileName: 'thumbnail_1.webp' } },
  })
  expect(getBunnyStreamThumbnailUrl(image)).toBe(`https://vz-c7e4be31-00e.b-cdn.net/${videoId}/thumbnail_1.webp`)
})

test('rejects unrelated providers, malformed ids and playback URLs', () => {
  expect(getBunnyStreamThumbnailUrl(pin({ provider: 'youtube' }))).toBeNull()
  expect(getBunnyStreamThumbnailUrl(pin({ provider_asset_id: '../elsewhere' }))).toBeNull()
  expect(getBunnyStreamThumbnailUrl(pin({ video_preview_url: 'http://cdn.example/video.mp4', video_playback_url: null }))).toBeNull()
  expect(getBunnyStreamThumbnailUrl(pin({ video_preview_url: 'https://cdn.example/other-id/play_480p.mp4', video_playback_url: null }))).toBeNull()
})

test('does not use unsafe provider thumbnail filenames', () => {
  const image = pin({ provider_payload: { bunny_status: { thumbnailFileName: '../secret.jpg' } } })
  expect(getBunnyStreamThumbnailUrl(image)).toBe(`https://vz-c7e4be31-00e.b-cdn.net/${videoId}/thumbnail.jpg`)
})
