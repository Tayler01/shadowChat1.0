const mockSingle = jest.fn()
const mockSelect = jest.fn(() => ({ single: mockSingle }))
const mockUpsert = jest.fn(() => ({ select: mockSelect }))
const mockFrom = jest.fn(() => ({ upsert: mockUpsert }))

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(async () => ({
    from: mockFrom,
  })),
}))

import { upsertNotificationPreferences } from '../src/lib/push'

beforeEach(() => {
  jest.clearAllMocks()
  mockSingle.mockResolvedValue({
    data: {
      user_id: 'user-1',
      dm_enabled: true,
      mention_enabled: true,
      reply_enabled: true,
      reaction_enabled: true,
      group_enabled: true,
      quiet_hours_start: null,
      quiet_hours_end: null,
      mute_until: null,
    },
    error: null,
  })
})

test('upserts only the changed notification preference', async () => {
  await upsertNotificationPreferences('user-1', { group_enabled: true })

  expect(mockFrom).toHaveBeenCalledWith('notification_preferences')
  expect(mockUpsert).toHaveBeenCalledWith(
    {
      user_id: 'user-1',
      group_enabled: true,
    },
    { onConflict: 'user_id' }
  )
})
