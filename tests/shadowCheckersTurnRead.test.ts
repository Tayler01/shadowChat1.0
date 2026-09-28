import { markShadowCheckersTurnRead } from '../src/features/games/shadow-checkers/api/shadowCheckersApi'

const mockClearTray = jest.fn(async (_request: unknown) => undefined)
const mockRpc = jest.fn(async (_name: string, _args: unknown) => ({ data: true, error: null }))
const mockQuery = {
  select: jest.fn(),
  eq: jest.fn(),
  contains: jest.fn(),
  is: jest.fn(),
}
const mockFrom = jest.fn(() => mockQuery)

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(async () => ({ from: mockFrom, rpc: mockRpc })),
}))
jest.mock('../src/features/notifications/notificationApi', () => ({
  clearNotificationEventFromSystemTray: (request: unknown) => mockClearTray(request),
}))

describe('Shadow Checkers turn read-through', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery.select.mockReturnValue(mockQuery)
    mockQuery.eq.mockReturnValue(mockQuery)
    mockQuery.contains.mockReturnValue(mockQuery)
    mockQuery.is
      .mockReturnValueOnce(mockQuery)
      .mockResolvedValueOnce({ data: [{ id: 'current-turn-event' }], error: null })
  })

  test('marks and clears only event IDs from the selected match revision', async () => {
    await markShadowCheckersTurnRead('match-a', 4)

    expect(mockFrom).toHaveBeenCalledWith('notification_events')
    expect(mockQuery.eq).toHaveBeenCalledWith('type', 'shadow_checkers_turn')
    expect(mockQuery.eq).toHaveBeenCalledWith('entity_id', 'match-a')
    expect(mockQuery.contains).toHaveBeenCalledWith('payload', { move_count: 4 })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('mark_my_notification_event_read', {
      target_event_id: 'current-turn-event',
    })
    expect(mockClearTray).toHaveBeenCalledWith({
      eventId: 'current-turn-event',
      matchId: 'match-a',
      notificationType: 'shadow_checkers_turn',
    })
  })

  test('does not read a turn when its view became inactive during the fetch', async () => {
    await markShadowCheckersTurnRead('match-a', 4, () => false)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockClearTray).not.toHaveBeenCalled()
  })
})
