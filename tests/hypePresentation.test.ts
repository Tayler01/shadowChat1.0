import { getHypeTier } from '../src/lib/hypePresentation'

test('getHypeTier maps message Hype counts to five visual tiers', () => {
  expect(getHypeTier(0)).toBe(0)
  expect(getHypeTier(1)).toBe(1)
  expect(getHypeTier(2)).toBe(2)
  expect(getHypeTier(3)).toBe(3)
  expect(getHypeTier(4)).toBe(4)
  expect(getHypeTier(5)).toBe(5)
  expect(getHypeTier(9)).toBe(5)
})
