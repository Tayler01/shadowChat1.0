import type { ShadoTvCatalog } from '../shado-tv/api'
import type { ShadoTvVideo } from '../shado-tv/data'

export const WILL_KIRK_SLUG = 'will-kirk'

export function getStoryCountdown(releasedAt: string, now = Date.now()) {
  const remaining = Math.ceil((Date.parse(releasedAt) - now) / 1000)
  if (!Number.isFinite(remaining) || remaining <= 0) return 'Unlocking…'
  const days = Math.floor(remaining / 86400)
  const hours = Math.floor(remaining % 86400 / 3600)
  const minutes = Math.floor(remaining % 3600 / 60)
  const seconds = remaining % 60
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

export function canPlayWillKirkStory(video: ShadoTvVideo, now = Date.now()) {
  const release = Date.parse(video.releasedAt ?? '')
  return video.status === 'released' && video.uploadStatus === 'ready' &&
    Boolean(video.embedUrl) && Number.isFinite(release) && release <= now
}

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
    const scheduled = video.status === 'locked' && Number.isFinite(release) && Boolean(video.posterAsset)
    return channelIds.has(video.channelId) && video.visibilityStatus === 'published' &&
      !video.deletedAt && (scheduled || canPlayWillKirkStory(video, now))
  }).sort((a, b) => Date.parse(b.releasedAt!) - Date.parse(a.releasedAt!) || a.id.localeCompare(b.id))
}
