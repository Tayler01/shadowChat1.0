import type { ShadowPinImage } from './types'

export const SHADOW_PIN_VIDEO_FALLBACK_POSTER_URL = '/entertainment/shado-tv/placeholders/video-vertical.webp'

export function isShadowPinFallbackVideoPosterUrl(source: string | null | undefined): boolean {
  if (!source) return false
  try {
    return new URL(source, 'https://shadowchat.local').pathname === SHADOW_PIN_VIDEO_FALLBACK_POSTER_URL
  } catch {
    return false
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

/** An image-only CDN fallback for older Bunny pins whose stored poster is generic. */
export function getBunnyStreamThumbnailUrl(image: ShadowPinImage): string | null {
  if (image.provider !== 'bunny_stream') return null
  const videoId = image.provider_asset_id || image.provider_playback_id
  if (!videoId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(videoId)) return null

  const payload = asRecord(image.provider_payload)
  const bunny = asRecord(payload?.bunny_stream)
  const status = asRecord(payload?.bunny_status)
  const response = asRecord(bunny?.bunnyResponse)
  const filename = [status?.thumbnailFileName, response?.thumbnailFileName, bunny?.thumbnailFileName]
    .find(value => typeof value === 'string' && /^[a-z0-9_.-]+\.(?:jpe?g|png|webp)$/i.test(value)) as string | undefined

  for (const source of [image.video_preview_url, image.video_playback_url, image.video_hls_url]) {
    if (!source) continue
    try {
      const url = new URL(source)
      if (url.protocol !== 'https:') continue
      const marker = `/${videoId}/`
      const markerIndex = url.pathname.indexOf(marker)
      if (markerIndex < 0) continue
      url.pathname = `${url.pathname.slice(0, markerIndex)}${marker}${filename || 'thumbnail.jpg'}`
      url.search = ''
      url.hash = ''
      return url.toString()
    } catch {
      // A malformed playback URL cannot supply a safe poster path.
    }
  }
  return null
}
