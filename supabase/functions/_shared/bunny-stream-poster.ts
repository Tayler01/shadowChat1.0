export const FALLBACK_VIDEO_POSTER_URL = '/entertainment/shado-tv/placeholders/video-vertical.webp'

type PosterRow = Record<string, unknown>
const variants = ['image', 'thumbnail', 'medium'] as const

export const isMissingBunnyPoster = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value.trim()) return true
  const url = value.trim()
  if (url === FALLBACK_VIDEO_POSTER_URL) return true
  try {
    return new URL(url).pathname === FALLBACK_VIDEO_POSTER_URL
  } catch {
    return false
  }
}

export const needsBunnyPosterRepair = (row: PosterRow, prefix = ''): boolean =>
  variants.some(variant => isMissingBunnyPoster(row[`${prefix}${variant}_url`]))

// All inputs originate from server configuration or authenticated provider metadata.
// Never accept a provider URL: only a single image basename inside this video's directory.
export const buildBunnyThumbnailUrl = (
  pullZoneUrl: string,
  videoId: string,
  thumbnailFileName: unknown,
): string | null => {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(videoId)) return null
  if (typeof thumbnailFileName !== 'string' ||
      !/^[a-z0-9][a-z0-9._-]{0,159}\.(?:jpe?g|png|webp|avif)$/i.test(thumbnailFileName) ||
      thumbnailFileName.includes('..')) return null
  try {
    const base = new URL(pullZoneUrl)
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) return null
    return `${base.toString().replace(/\/+$/, '')}/${videoId}/${thumbnailFileName}`
  } catch {
    return null
  }
}

export const buildBunnyPosterPatch = (
  row: PosterRow,
  pullZoneUrl: string,
  videoId: string,
  providerStatus: Record<string, unknown>,
  prefix = '',
): Record<string, string | null> => {
  const customVariant = variants.find(variant => !isMissingBunnyPoster(row[`${prefix}${variant}_url`]))
  const customUrl = customVariant ? row[`${prefix}${customVariant}_url`] as string : null
  const posterUrl = customUrl || buildBunnyThumbnailUrl(pullZoneUrl, videoId, providerStatus.thumbnailFileName)
  if (!posterUrl) return {}
  const patch: Record<string, string | null> = {}
  for (const variant of variants) {
    if (!isMissingBunnyPoster(row[`${prefix}${variant}_url`])) continue
    patch[`${prefix}${variant}_url`] = posterUrl
    const customPath = customVariant ? row[`${prefix}${customVariant}_path`] : null
    patch[`${prefix}${variant}_path`] = typeof customPath === 'string'
      ? customPath
      : variant === 'image' ? `bunny:${videoId}:poster` : null
  }
  return patch
}
