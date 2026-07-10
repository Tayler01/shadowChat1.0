import {
  getHypeCelebrationPresentation,
  getHypeDisplayDurationMs,
  getHypeTier,
} from '../src/lib/hypePresentation'

test('getHypeTier maps message Hype counts to five visual tiers', () => {
  expect(getHypeTier(0)).toBe(0)
  expect(getHypeTier(1)).toBe(1)
  expect(getHypeTier(2)).toBe(2)
  expect(getHypeTier(3)).toBe(3)
  expect(getHypeTier(4)).toBe(4)
  expect(getHypeTier(5)).toBe(5)
  expect(getHypeTier(9)).toBe(5)
})

test('Hype celebrations reserve fullscreen presentation for live high tiers', () => {
  expect(getHypeCelebrationPresentation({ mode: 'live', intensity: 1 })).toBe('compact')
  expect(getHypeCelebrationPresentation({ mode: 'live', intensity: 2 })).toBe('compact')
  expect(getHypeCelebrationPresentation({ mode: 'live', intensity: 3 })).toBe('fullscreen')
  expect(getHypeCelebrationPresentation({ mode: 'catchup', intensity: 8 })).toBe('compact')
  expect(getHypeCelebrationPresentation({
    mode: 'live',
    intensity: 8,
    prefersReducedMotion: true,
  })).toBe('compact')
})

test('phone and reduced-motion celebrations use shorter display windows', () => {
  expect(getHypeDisplayDurationMs({ mode: 'live', intensity: 4 })).toBe(4_600)
  expect(getHypeDisplayDurationMs({ mode: 'live', intensity: 4, isPhone: true })).toBe(3_200)
  expect(getHypeDisplayDurationMs({ mode: 'catchup', intensity: 6, isPhone: true })).toBe(2_400)
  expect(getHypeDisplayDurationMs({
    mode: 'live',
    intensity: 6,
    isPhone: true,
    prefersReducedMotion: true,
  })).toBe(2_000)
})
