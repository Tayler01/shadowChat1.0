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
const mockFetchSessions = jest.fn(async () => [] as unknown[])
const mockFetchMatches = jest.fn(async () => [activeMatch])
const mockFetchMatch = jest.fn(async (matchId: string) => ({ ...activeMatch, id: matchId }))
const mockFetchLeaderboard = jest.fn(async () => [] as unknown[])
const mockFetchChat = jest.fn(async () => [] as unknown[])
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
  fetchShadowCheckersSessions: () => mockFetchSessions(),
  fetchShadowCheckersMatches: () => mockFetchMatches(),
  fetchShadowCheckersMatch: (matchId: string) => mockFetchMatch(matchId),
  fetchShadowCheckersLeaderboard: () => mockFetchLeaderboard(),
  fetchShadowCheckersQueue: jest.fn(async () => []),
  fetchMyShadowCheckersQueuedSessions: (userId: string) => mockFetchMyQueuedSessions(userId),
  fetchShadowCheckersMoves: jest.fn(async () => []),
  fetchShadowCheckersChat: () => mockFetchChat(),
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
    mockFetchSessions.mockImplementation(async () => [])
    mockFetchMatches.mockImplementation(async () => [activeMatch])
    mockFetchMatch.mockImplementation(async matchId => ({ ...activeMatch, id: matchId }))
    mockFetchLeaderboard.mockImplementation(async () => [])
    mockFetchChat.mockImplementation(async () => [])
    mockSubmitMove.mockImplementation(async () => ({ matchId: 'match-1', completed: false }))
    mockCreate.mockImplementation(async () => ({ sessionId: 'session-1', matchId: 'match-1' }))
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

  test('publishes the committed board before delayed lobby and leaderboard, without rewinding it', async () => {
    const { result } = renderHook(() => useShadowCheckers('match-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let releaseSessions!: (value: unknown[]) => void
    let releaseLeaderboard!: (value: unknown[]) => void
    mockFetchSessions.mockImplementationOnce(() => new Promise(resolve => { releaseSessions = resolve }))
    mockFetchLeaderboard.mockImplementationOnce(() => new Promise(resolve => { releaseLeaderboard = resolve }))
    mockFetchMatch.mockResolvedValueOnce({ ...activeMatch, move_count: 5, current_turn_user_id: 'player-two' })

    await act(async () => {
      await result.current.actions.submitMove('match-1', 'piece-1', [{ row: 4, col: 1 }])
    })
    expect(result.current.activeMatch?.move_count).toBe(5)
    expect(result.current.busy).toBeNull()
    expect(releaseSessions).toBeDefined()
    expect(releaseLeaderboard).toBeDefined()
    await act(async () => { releaseSessions([]); releaseLeaderboard([]) })
    await waitFor(() => expect(result.current.activeMatch?.move_count).toBe(5))
  })

  test('a slow chat read cannot delay the focused move confirmation', async () => {
    const { result } = renderHook(() => useShadowCheckers('match-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let releaseChat!: (value: unknown[]) => void
    mockFetchChat.mockImplementationOnce(() => new Promise(resolve => { releaseChat = resolve }))
    mockFetchMatch.mockResolvedValueOnce({ ...activeMatch, move_count: 5 })

    await act(async () => {
      await result.current.actions.submitMove('match-1', 'piece-1', [{ row: 4, col: 1 }])
    })
    expect(result.current.activeMatch?.move_count).toBe(5)
    await waitFor(() => expect(releaseChat).toBeDefined())
    await act(async () => releaseChat([]))
  })

  test('a delayed full refresh cannot reopen a completed match at the same move count', async () => {
    const { result } = renderHook(() => useShadowCheckers('match-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let releaseLeaderboard!: (value: unknown[]) => void
    mockFetchLeaderboard.mockImplementationOnce(() => new Promise(resolve => { releaseLeaderboard = resolve }))
    mockFetchMatch.mockResolvedValueOnce({ ...activeMatch, status: 'completed' })

    await act(async () => {
      await result.current.actions.submitMove('match-1', 'piece-1', [{ row: 4, col: 1 }])
    })
    expect(result.current.activeMatch?.status).toBe('completed')
    await act(async () => releaseLeaderboard([]))
    await waitFor(() => expect(result.current.activeMatch?.status).toBe('completed'))
  })

  test('a confirmed RPC remains successful when its focused read fails', async () => {
    const { result } = renderHook(() => useShadowCheckers('match-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    mockFetchMatch.mockRejectedValueOnce(new Error('Temporary match read failure'))
    mockFetchMatches.mockResolvedValueOnce([{ ...activeMatch, move_count: 5 }])

    await act(async () => {
      await expect(result.current.actions.submitMove('match-1', 'piece-1', [{ row: 4, col: 1 }]))
        .resolves.toMatchObject({ matchId: 'match-1' })
    })
    await waitFor(() => expect(result.current.activeMatch?.move_count).toBe(5))
    expect(result.current.error).toBeNull()
  })

  test('realtime updates for the open match bypass leaderboard refresh', async () => {
    const { result } = renderHook(() => useShadowCheckers('match-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(channel.on).toHaveBeenCalled())
    const handler = channel.on.mock.calls.find(call => call[1]?.table === 'shadow_checkers_matches')?.[2]
    expect(handler).toBeDefined()
    const priorMatchReads = mockFetchMatch.mock.calls.length
    const priorLeaderboardReads = mockFetchLeaderboard.mock.calls.length
    mockFetchMatch.mockResolvedValueOnce({ ...activeMatch, move_count: 5 })
    act(() => handler({ new: { id: 'match-1' }, old: {} }))
    await waitFor(() => expect(mockFetchMatch.mock.calls.length).toBeGreaterThan(priorMatchReads))
    await waitFor(() => expect(result.current.activeMatch?.move_count).toBe(5))
    expect(mockFetchLeaderboard).toHaveBeenCalledTimes(priorLeaderboardReads)
  })

  test('an old move read cannot replace another selection or clear its newer busy action', async () => {
    const { result } = renderHook(() => useShadowCheckers('match-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let releaseMatch!: (value: typeof activeMatch) => void
    mockFetchMatch.mockImplementationOnce(() => new Promise(resolve => { releaseMatch = resolve }))
    let oldMove!: ReturnType<typeof result.current.actions.submitMove>
    act(() => { oldMove = result.current.actions.submitMove('match-1', 'piece-1', [{ row: 4, col: 1 }]) })
    const oldMoveError = oldMove.then(() => null, reason => reason)
    await waitFor(() => expect(releaseMatch).toBeDefined())
    act(() => result.current.actions.selectMatch('match-2'))
    await waitFor(() => expect(result.current.activeMatch?.id).toBe('match-2'))

    let releaseCreate!: (value: { sessionId: string; matchId: string }) => void
    mockCreate.mockImplementationOnce(() => new Promise(resolve => { releaseCreate = resolve }))
    let newAction!: ReturnType<typeof result.current.actions.create>
    act(() => { newAction = result.current.actions.create('obsidian-sentinel') })
    await waitFor(() => expect(result.current.busy).toBe('create'))
    await act(async () => releaseMatch({ ...activeMatch, move_count: 5 }))
    expect(await oldMoveError).toMatchObject({ name: 'AbortError' })
    expect(result.current.activeMatch?.id).toBe('match-2')
    expect(result.current.busy).toBe('create')
    await act(async () => releaseCreate({ sessionId: 'session-3', matchId: 'match-3' }))
    await act(async () => { await newAction })
  })

  test('a move RPC completed after account switch cannot publish or notify as the new account', async () => {
    const { result, rerender } = renderHook(() => useShadowCheckers('match-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let releaseRpc!: (value: { matchId: string; completed: boolean }) => void
    mockSubmitMove.mockImplementationOnce(() => new Promise(resolve => { releaseRpc = resolve }))
    let oldMove!: ReturnType<typeof result.current.actions.submitMove>
    act(() => { oldMove = result.current.actions.submitMove('match-1', 'piece-1', [{ row: 4, col: 1 }]) })
    const oldMoveError = oldMove.then(() => null, reason => reason)
    await waitFor(() => expect(releaseRpc).toBeDefined())
    mockCurrentUserId = 'player-two'
    rerender()
    await act(async () => releaseRpc({ matchId: 'match-1', completed: false }))
    expect(await oldMoveError).toMatchObject({ name: 'AbortError' })
    expect(mockTriggerTurnPush).not.toHaveBeenCalled()
    expect(result.current.activeMatch?.move_count).not.toBe(5)
  })
})
