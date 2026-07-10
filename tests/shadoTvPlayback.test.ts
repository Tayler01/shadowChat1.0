import {
  getShadoTvPremiereOffset,
  shouldCorrectShadoTvPremierePosition,
  shouldRecordShadoTvProgress,
} from '../src/features/entertainment/shado-tv/playback'
import type { ShadoTvVideo } from '../src/features/entertainment/shado-tv/data'

const video = {
  id: 'video-1',
  channelId: 'channel-1',
  title: 'Episode',
  subtitle: 'Episode 1',
  description: 'Test',
  posterAsset: '/poster.webp',
  thumbnailAsset: '/thumb.webp',
  status: 'premiere',
  orientation: 'horizontal',
  durationSeconds: 120,
  durationLabel: '2:00',
  releaseLabel: 'Premiere',
  premiereAt: '2026-07-10T00:00:00.000Z',
} satisfies ShadoTvVideo

test('derives a shared live premiere offset only during the premiere window', () => {
  expect(getShadoTvPremiereOffset(video, Date.parse('2026-07-09T23:59:59.000Z'))).toBeNull()
  expect(getShadoTvPremiereOffset(video, Date.parse('2026-07-10T00:00:42.000Z'))).toBe(42)
  expect(getShadoTvPremiereOffset(video, Date.parse('2026-07-10T00:02:00.000Z'))).toBeNull()
})

test('corrects only material premiere drift', () => {
  expect(shouldCorrectShadoTvPremierePosition(40, 42)).toBe(false)
  expect(shouldCorrectShadoTvPremierePosition(35, 42)).toBe(true)
})

test('records progress once per interval boundary', () => {
  expect(shouldRecordShadoTvProgress(14, 15)).toBe(true)
  expect(shouldRecordShadoTvProgress(15, 29)).toBe(false)
  expect(shouldRecordShadoTvProgress(29, 30)).toBe(true)
})
