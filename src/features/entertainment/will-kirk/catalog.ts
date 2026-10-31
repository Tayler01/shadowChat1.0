import type { ShadoTvCatalog } from '../shado-tv/api'
import type { ShadoTvVideo } from '../shado-tv/data'

export const WILL_KIRK_SLUG = 'will-kirk'

export function getNewEpisodeExpiry(releasedAt: string | null, now = Date.now()) {
  const release = Date.parse(releasedAt ?? '')
  const day = 24 * 60 * 60 * 1000
  if (!Number.isFinite(release) || release > now || release + day <= now) return null
  return release + day
}

export function getWillKirkStories(catalog: ShadoTvCatalog, now = Date.now()): ShadoTvVideo[] {
  const channelIds = new Set(catalog.channels
    .filter(channel => channel.slug === WILL_KIRK_SLUG && channel.visibilityStatus === 'published' && !channel.deletedAt)
    .map(channel => channel.id))
  return catalog.videos.filter(video => {
    const release = Date.parse(video.releasedAt ?? '')
    return channelIds.has(video.channelId) && video.visibilityStatus === 'published' &&
      !video.deletedAt && video.status === 'released' && video.uploadStatus === 'ready' &&
      Boolean(video.embedUrl) && Number.isFinite(release) && release <= now
  }).sort((a, b) => Date.parse(b.releasedAt!) - Date.parse(a.releasedAt!) || a.id.localeCompare(b.id))
}
