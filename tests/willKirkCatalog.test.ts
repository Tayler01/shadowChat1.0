import { canPlayWillKirkStory, getNewEpisodeExpiry, getStoryCountdown, getWillKirkStories } from '../src/features/entertainment/will-kirk/catalog'
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

test('scheduled cover is first and visible without exposing or requiring playback metadata', () => {
  const scheduled = story('scheduled', '2026-11-07T00:30:00Z', { status: 'locked', embedUrl: null, uploadStatus: 'none' })
  expect(getWillKirkStories(catalog([story('older', '2026-10-23T18:00:00Z'), scheduled]), now).map(v => v.id)).toEqual(['scheduled', 'older'])
  expect(canPlayWillKirkStory(scheduled, now)).toBe(false)
  expect(getNewEpisodeExpiry(scheduled.releasedAt!, now)).toBeNull()
})

test('only publication at the unlock boundary enables playback and starts the badge', () => {
  const at = Date.parse('2026-11-07T00:30:00Z')
  const scheduled = story('scheduled', new Date(at).toISOString(), { status: 'locked', embedUrl: null })
  expect(canPlayWillKirkStory(scheduled, at)).toBe(false)
  const published = { ...scheduled, status: 'released' as const, embedUrl: 'https://example.test/final.mp4' }
  expect(canPlayWillKirkStory(published, at - 1)).toBe(false)
  expect(canPlayWillKirkStory(published, at)).toBe(true)
  expect(getNewEpisodeExpiry(published.releasedAt!, at)).toBe(at + 86_400_000)
})

test('countdown includes live seconds and stops at the unlock boundary', () => {
  const at = '2026-11-07T00:30:00Z'
  const time = Date.parse(at)
  expect(getStoryCountdown(at, time - 90061000)).toBe('1d 01h 01m 01s')
  expect(getStoryCountdown(at, time - 1)).toBe('0d 00h 00m 01s')
  expect(getStoryCountdown(at, time)).toBe('Unlocking…')
  expect(getStoryCountdown(at, time + 1000)).toBe('Unlocking…')
})
