import { act, renderHook, waitFor } from '@testing-library/react'
import { useShadowCheckers } from '../src/features/games/shadow-checkers/hooks/useShadowCheckers'

const mockTriggerTurnPush = jest.fn(async (_matchId: string) => ({ deliveredCount: 1 }))
const mockMarkTurnRead = jest.fn(async (
  _matchId: string,
  _moveCount: number,
  _isCurrent: () => boolean,
) => undefined)
const mockRequestBadgeRefresh = jest.fn()
const mockCreate = jest.fn(async () => ({ sessionId: 'session-1', matchId: 'match-1' }))
const mockJoin = jest.fn(async (_sessionId: string, _characterKey: string) => ({ sessionId: 'session-1', matchId: 'match-1' }))
const mockSubmitMove = jest.fn(async (_matchId: string, _pieceId: string, _path: unknown[]) => ({ matchId: 'match-1', completed: false }))
const mockRematch = jest.fn(async (_matchId: string) => ({ sessionId: 'session-2', matchId: 'match-2' }))
const mockNextChallenger = jest.fn(async (_matchId: string) => ({ sessionId: 'session-3', matchId: 'match-3' }))
const mockFetchMyQueuedSessions = jest.fn(async (_userId: string): Promise<string[]> => [])
let mockCurrentUserId = 'player-one'

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
  useAuth: () => ({ user: { id: mockCurrentUserId } }),
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
  fetchMyShadowCheckersQueuedSessions: (userId: string) => mockFetchMyQueuedSessions(userId),
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
  markShadowCheckersTurnRead: (matchId: string, moveCount: number, isCurrent: () => boolean) =>
    mockMarkTurnRead(matchId, moveCount, isCurrent),
}))

describe('Shadow Checkers notification integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCurrentUserId = 'player-one'
    mockFetchMyQueuedSessions.mockImplementation(async () => [])
    channel.on.mockReturnValue(channel)
    channel.subscribe.mockReturnValue(channel)
  })

  test('a prior account refresh cannot overwrite the current viewer queue', async () => {
    let resolveOld!: (ids: string[]) => void
    let resolveNew!: (ids: string[]) => void
    mockFetchMyQueuedSessions.mockImplementation(userId => new Promise(resolve => {
      if (userId === 'player-one') resolveOld = resolve
      else resolveNew = resolve
    }))
    const { result, rerender } = renderHook(() => useShadowCheckers())
    await waitFor(() => expect(resolveOld).toBeDefined())
    mockCurrentUserId = 'player-two'
    rerender()
    expect(result.current.myQueuedSessionIds).toEqual([])
    await waitFor(() => expect(resolveNew).toBeDefined())
    await act(async () => resolveNew(['new-session']))
    await waitFor(() => expect(result.current.myQueuedSessionIds).toEqual(['new-session']))
    await act(async () => resolveOld(['old-session']))
    expect(result.current.myQueuedSessionIds).toEqual(['new-session'])
  })

  test('own queue lookup runs on lobby return, not each selected-match refresh', async () => {
    mockFetchMyQueuedSessions.mockResolvedValue(['session-queued'])
    const { result } = renderHook(() => useShadowCheckers('match-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFetchMyQueuedSessions).not.toHaveBeenCalled()
    act(() => result.current.actions.selectMatch(null))
    await waitFor(() => expect(result.current.myQueuedSessionIds).toEqual(['session-queued']))
    expect(mockFetchMyQueuedSessions).toHaveBeenCalledWith('player-one')
    const callsOnLobby = mockFetchMyQueuedSessions.mock.calls.length
    act(() => result.current.actions.selectMatch('match-1'))
    await waitFor(() => expect(result.current.selectedMatchId).toBe('match-1'))
    expect(mockFetchMyQueuedSessions).toHaveBeenCalledTimes(callsOnLobby)
  })

  test('an exact routed current-turn match clears its durable alert and refreshes the badge', async () => {
    renderHook(() => useShadowCheckers('match-1'))

    await waitFor(() => {
      expect(mockMarkTurnRead).toHaveBeenCalledWith('match-1', 4, expect.any(Function))
      expect(mockRequestBadgeRefresh).toHaveBeenCalled()
    })
  })

  test('does not read a turn until the match tab becomes visible', async () => {
    const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    try {
      const { result } = renderHook(() => useShadowCheckers('match-1'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(mockMarkTurnRead).not.toHaveBeenCalled()
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      act(() => document.dispatchEvent(new Event('visibilitychange')))
      await waitFor(() => expect(mockMarkTurnRead).toHaveBeenCalledWith(
        'match-1', 4, expect.any(Function),
      ))
    } finally {
      if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility)
    }
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
