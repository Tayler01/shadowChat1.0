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
      notifications_enabled: true,
      dm_enabled: true,
      mention_enabled: true,
      reply_enabled: true,
      reaction_enabled: true,
      group_enabled: true,
      hype_enabled: true,
      shadow_pin_new_post_enabled: true,
      shadow_pin_comment_enabled: true,
      shadow_pin_reply_enabled: true,
      connection_notifications_enabled: true,
      shado_live_in_app_enabled: true,
      presence_in_app_enabled: true,
      presence_push_enabled: true,
      presence_notification_scope: 'connections',
      badge_dm_enabled: true,
      badge_group_enabled: true,
      badge_interactions_enabled: true,
      badge_connections_enabled: true,
      badge_shadow_pin_enabled: true,
      general_chat_muted: false,
      quiet_hours_start: null,
      quiet_hours_end: null,
      quiet_hours_timezone: 'UTC',
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
