jest.mock('../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))
jest.mock('../src/hooks/useRealtimeRecovery', () => ({
  useRealtimeRecovery: jest.fn(),
}))
jest.mock('../src/lib/realtimeRecovery', () => ({
  runRealtimeRecovery: jest.fn(),
}))
jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(),
  getRealtimeClient: jest.fn(),
}))

import { act, renderHook, waitFor } from '@testing-library/react'
import { useReadCursor } from '../src/hooks/useReadCursor'
import { useAuth } from '../src/hooks/useAuth'
import { getRealtimeClient, getWorkingClient } from '../src/lib/supabase'
import type { UserReadCursor } from '../src/lib/readCursors'

type WorkingClient = {
  rpc: jest.Mock
  channel: jest.Mock
  removeChannel: jest.Mock
}

const makeCursor = (
  messageId: string,
  createdAt: string,
  scopeId = 'main'
) => ({
  user_id: 'user-1',
  surface: 'general_chat',
  scope_id: scopeId,
  last_read_message_id: messageId,
  last_read_at: createdAt,
  updated_at: createdAt,
}) as UserReadCursor

const createChannel = () => {
  const channel = {
    on: jest.fn(),
    subscribe: jest.fn(),
  }
  channel.on.mockReturnValue(channel)
  channel.subscribe.mockReturnValue(channel)
  return channel
}

describe('useReadCursor', () => {
  let workingClient: WorkingClient
  let userIndex = 0

  beforeEach(() => {
    workingClient = {
      rpc: jest.fn(),
      channel: jest.fn(() => createChannel()),
      removeChannel: jest.fn(),
    }

    userIndex += 1
    ;(useAuth as jest.Mock).mockReturnValue({ user: { id: `user-${userIndex}` } })
    ;(getWorkingClient as jest.Mock).mockResolvedValue(workingClient)
    ;(getRealtimeClient as jest.Mock).mockReturnValue(workingClient)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('preserves a cached cursor and exposes an error when refresh fails', async () => {
    const cachedCursor = makeCursor('message-b', '2026-05-03T12:00:00.000Z', 'preserve-cache')
    const readError = { message: 'network offline' }
    workingClient.rpc.mockResolvedValueOnce({ data: [cachedCursor], error: null })

    const { result } = renderHook(() =>
      useReadCursor('general_chat', 'preserve-cache', true)
    )

    await waitFor(() => {
      expect(result.current.cursor?.last_read_message_id).toBe('message-b')
    })

    workingClient.rpc.mockResolvedValueOnce({ data: null, error: readError })
    let refreshResult: UserReadCursor | null = null
    await act(async () => {
      refreshResult = await result.current.refresh()
    })

    expect(refreshResult).toEqual(cachedCursor)
    expect(result.current.cursor).toEqual(cachedCursor)
    expect(result.current.error).toBe(readError)
    expect(result.current.loading).toBe(false)
  })

  it('keeps cursor loading conservative when the first fetch fails without cache', async () => {
    const readError = { message: 'initial fetch failed' }
    workingClient.rpc.mockResolvedValueOnce({ data: null, error: readError })

    const { result } = renderHook(() =>
      useReadCursor('general_chat', 'cold-failure', true)
    )

    await waitFor(() => {
      expect(result.current.error).toBe(readError)
    })

    expect(result.current.cursor).toBeNull()
    expect(result.current.loading).toBe(true)
  })

  it('does not send an older markRead key after a newer cursor is cached', async () => {
    const cachedCursor = makeCursor('message-b', '2026-05-03T12:00:00.000Z', 'monotonic-guard')
    workingClient.rpc.mockResolvedValueOnce({ data: [cachedCursor], error: null })

    const { result } = renderHook(() =>
      useReadCursor('general_chat', 'monotonic-guard', true)
    )

    await waitFor(() => {
      expect(result.current.cursor?.last_read_message_id).toBe('message-b')
    })

    workingClient.rpc.mockClear()
    let markResult: UserReadCursor | null = null
    await act(async () => {
      markResult = await result.current.markRead('message-a', '2026-05-03T12:00:00.000Z')
    })

    expect(markResult).toEqual(cachedCursor)
    expect(result.current.cursor).toEqual(cachedCursor)
    expect(workingClient.rpc).not.toHaveBeenCalled()
  })

  it('allows a newer same-timestamp markRead key through the id tie-breaker', async () => {
    const cachedCursor = makeCursor('message-b', '2026-05-03T12:00:00.000Z', 'same-time-newer')
    const nextCursor = makeCursor('message-c', '2026-05-03T12:00:00.000Z', 'same-time-newer')
    workingClient.rpc.mockResolvedValueOnce({ data: [cachedCursor], error: null })

    const { result } = renderHook(() =>
      useReadCursor('general_chat', 'same-time-newer', true)
    )

    await waitFor(() => {
      expect(result.current.cursor?.last_read_message_id).toBe('message-b')
    })

    workingClient.rpc.mockClear()
    workingClient.rpc.mockResolvedValueOnce({ data: [nextCursor], error: null })

    await act(async () => {
      await result.current.markRead('message-c', '2026-05-03T12:00:00.000Z')
    })

    expect(workingClient.rpc).toHaveBeenCalledWith('set_user_read_cursor', {
      target_surface: 'general_chat',
      target_scope_id: 'same-time-newer',
      target_last_read_message_id: 'message-c',
      target_last_read_at: '2026-05-03T12:00:00.000Z',
    })
    expect(result.current.cursor).toEqual(nextCursor)
    expect(result.current.error).toBeNull()
  })
})
