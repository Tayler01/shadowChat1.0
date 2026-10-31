import { getWillKirkStories } from '../src/features/entertainment/will-kirk/catalog'
import type { ShadoTvCatalog } from '../src/features/entertainment/shado-tv/api'
import type { ShadoTvVideo } from '../src/features/entertainment/shado-tv/data'

const now = Date.parse('2026-10-30T20:00:00Z')
const story = (id: string, releasedAt: string, extra: Partial<ShadoTvVideo> = {}): ShadoTvVideo => ({
  id, channelId: 'wk', title: id, subtitle: '', description: '', posterAsset: '/cover.webp',
  thumbnailAsset: '/cover.webp', status: 'released', orientation: 'horizontal', durationLabel: '18:00',
  releaseLabel: '', releasedAt, visibilityStatus: 'published', uploadStatus: 'ready',
  embedUrl: 'https://example.test/story.mp4', ...extra,
})
const catalog = (videos: ShadoTvVideo[]): ShadoTvCatalog => ({
  channels: [{ id: 'wk', slug: 'will-kirk', name: 'Will & Kirk', tagline: '', ticketAsset: '', heroAsset: '', accent: '', updatedAtLabel: '', visibilityStatus: 'published' }],
  videos, contentItems: [], loadedFromSupabase: true,
})

test('orders stories by release date, newest first, regardless of catalog order', () => {
  const input = catalog([story('older', '2026-10-23T18:00:00Z'), story('newest', '2026-10-30T18:00:00Z')])
  expect(getWillKirkStories(input, now).map(video => video.id)).toEqual(['newest', 'older'])
  expect(input.videos[0].id).toBe('older')
})

test.each<Partial<ShadoTvVideo>>([
  { channelId: 'other' }, { visibilityStatus: 'hidden' }, { deletedAt: '2026-10-29T00:00:00Z' },
  { status: 'premiere' }, { uploadStatus: 'processing' }, { embedUrl: null },
  { releasedAt: null }, { releasedAt: 'invalid' }, { releasedAt: '2026-11-06T18:00:00Z' },
])('omits unpublished, unavailable, unrelated, or future stories: %j', extra => {
  expect(getWillKirkStories(catalog([story('excluded', '2026-10-23T18:00:00Z', extra)]), now)).toEqual([])
})

test('hiding the channel hides its entire story list', () => {
  const input = catalog([story('one', '2026-10-23T18:00:00Z')])
  input.channels[0].visibilityStatus = 'hidden'
  expect(getWillKirkStories(input, now)).toEqual([])
})
