import { getPresenceOption, presenceOptions } from '../src/lib/presence'

test('presence colors use conventional chat status colors', () => {
  expect(getPresenceOption('online').dotClass).toContain('#22c55e')
  expect(getPresenceOption('away').dotClass).toContain('#facc15')
  expect(getPresenceOption('busy').dotClass).toContain('#ef4444')
  expect(getPresenceOption('offline').dotClass).toContain('#64748b')
})

test('presence selector options expose matching selected color classes', () => {
  expect(presenceOptions).toHaveLength(4)
  expect(getPresenceOption('online').selectedClass).toContain('#22c55e')
  expect(getPresenceOption('away').selectedClass).toContain('#facc15')
  expect(getPresenceOption('busy').selectedClass).toContain('#ef4444')
})
