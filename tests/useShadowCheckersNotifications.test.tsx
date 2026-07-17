import { act, renderHook, waitFor } from '@testing-library/react'
import { useShadowCheckers } from '../src/features/games/shadow-checkers/hooks/useShadowCheckers'

const mockTriggerTurnPush = jest.fn(async (_matchId: string) => ({ deliveredCount: 1 }))
const mockMarkTurnRead = jest.fn(async (_matchId: string) => undefined)
const mockRequestBadgeRefresh = jest.fn()
const mockCreate = jest.fn(async () => ({ sessionId: 'session-1', matchId: 'match-1' }))
const mockJoin = jest.fn(async (_sessionId: string, _characterKey: string) => ({ sessionId: 'session-1', matchId: 'match-1' }))
const mockSubmitMove = jest.fn(async (_matchId: string, _pieceId: string, _path: unknown[]) => ({ matchId: 'match-1', completed: false }))
const mockRematch = jest.fn(async (_matchId: string) => ({ sessionId: 'session-2', matchId: 'match-2' }))
const mockNextChallenger = jest.fn(async (_matchId: string) => ({ sessionId: 'session-3', matchId: 'match-3' }))

const activeMatch = {
  id: 'match-1',
  session_id: 'session-1',
  status: 'active',
  player_one_id: 'player-one',
  player_two_id: 'player-two',
  current_turn_user_id: 'player-one',
  move_count: 4,
}

const channel = {
  on: jest.fn(),
  subscribe: jest.fn(),
}
channel.on.mockReturnValue(channel)
channel.subscribe.mockReturnValue(channel)

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'player-one' } }),
}))

jest.mock('../src/hooks/useRealtimeRecovery', () => ({
  useRealtimeRecovery: jest.fn(),
}))

jest.mock('../src/lib/realtimeRecovery', () => ({
  runRealtimeRecovery: jest.fn(),
}))

jest.mock('../src/lib/supabase', () => ({
  getRealtimeClient: jest.fn(() => ({
    channel: jest.fn(() => channel),
    removeChannel: jest.fn(),
  })),
  getWorkingClient: jest.fn(async () => ({
    channel: jest.fn(() => channel),
    removeChannel: jest.fn(),
  })),
}))

jest.mock('../src/lib/appBadge', () => ({
  requestAppBadgeRefresh: () => mockRequestBadgeRefresh(),
}))

jest.mock('../src/lib/push', () => ({
  triggerShadowCheckersTurnPushNotification: (matchId: string) => mockTriggerTurnPush(matchId),
}))

jest.mock('../src/features/games/shadow-checkers/api/shadowCheckersApi', () => ({
  fetchShadowCheckersSessions: jest.fn(async () => []),
  fetchShadowCheckersMatches: jest.fn(async () => [activeMatch]),
  fetchShadowCheckersMatch: jest.fn(async () => activeMatch),
  fetchShadowCheckersLeaderboard: jest.fn(async () => []),
  fetchShadowCheckersQueue: jest.fn(async () => []),
  fetchShadowCheckersMoves: jest.fn(async () => []),
  fetchShadowCheckersChat: jest.fn(async () => []),
  createShadowCheckersMatch: () => mockCreate(),
  joinShadowCheckersMatch: (sessionId: string, characterKey: string) => mockJoin(sessionId, characterKey),
  submitShadowCheckersMove: (matchId: string, pieceId: string, path: unknown[]) => mockSubmitMove(matchId, pieceId, path),
  resignShadowCheckersMatch: jest.fn(async () => ({ matchId: 'match-1', winnerId: 'player-one' })),
  cancelShadowCheckersMatch: jest.fn(async () => undefined),
  queueShadowCheckersMatch: jest.fn(async () => ({})),
  leaveShadowCheckersQueue: jest.fn(async () => undefined),
  rematchShadowCheckersMatch: (matchId: string) => mockRematch(matchId),
  startShadowCheckersNextChallenger: (matchId: string) => mockNextChallenger(matchId),
  postShadowCheckersChatMessage: jest.fn(async () => ({})),
  markShadowCheckersTurnRead: (matchId: string) => mockMarkTurnRead(matchId),
}))

describe('Shadow Checkers notification integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    channel.on.mockReturnValue(channel)
    channel.subscribe.mockReturnValue(channel)
  })

  test('an exact routed current-turn match clears its durable alert and refreshes the badge', async () => {
    renderHook(() => useShadowCheckers('match-1'))

    await waitFor(() => {
      expect(mockMarkTurnRead).toHaveBeenCalledWith('match-1')
      expect(mockRequestBadgeRefresh).toHaveBeenCalled()
    })
  })

  test('server-confirmed turn-changing actions request compatibility push delivery', async () => {
    const onAutoSelectMatch = jest.fn()
    const { result } = renderHook(() => useShadowCheckers(undefined, onAutoSelectMatch))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.actions.create('raven')
      await result.current.actions.join('session-1', 'raven')
      await result.current.actions.submitMove('match-1', 'piece-1', [{ row: 3, col: 2 }])
      await result.current.actions.rematch('match-1')
      await result.current.actions.nextChallenger('match-2')
    })

    expect(mockTriggerTurnPush.mock.calls).toEqual([
      ['match-1'],
      ['match-1'],
      ['match-2'],
      ['match-3'],
    ])
    expect(onAutoSelectMatch.mock.calls).toEqual([
      ['match-1', 'push'],
      ['match-2', 'replace'],
      ['match-3', 'replace'],
    ])
  })
})
