import { act, renderHook, waitFor } from '@testing-library/react'
import { useBoardChat } from '../src/hooks/useBoardChat'
import { useAuth } from '../src/hooks/useAuth'
import { useRealtimeRecovery } from '../src/hooks/useRealtimeRecovery'
import {
  ensureSession,
  getRealtimeClient,
  getWorkingClient,
} from '../src/lib/supabase'

jest.mock('../src/hooks/useAuth')
jest.mock('../src/hooks/useRealtimeRecovery', () => ({
  useRealtimeRecovery: jest.fn(),
}))
jest.mock('../src/config', () => ({
  MESSAGE_FETCH_LIMIT: 50,
}))
jest.mock('../src/lib/realtimeRecovery', () => ({
  runRealtimeRecovery: jest.fn().mockResolvedValue({ ok: true }),
}))
jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(),
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
}))

const createMessage = (id: string, minute: number) => ({
  id,
  board_slug: 'news-chat',
  user_id: 'u1',
  content: id,
  reactions: {},
  created_at: `2026-05-02T12:${String(minute).padStart(2, '0')}:00.000Z`,
  updated_at: `2026-05-02T12:${String(minute).padStart(2, '0')}:00.000Z`,
  user: { id: 'u1', username: 'user', display_name: 'User' },
})

const createQuery = (data: unknown[], error: unknown = null) => {
  const query: Record<string, jest.Mock> = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    lt: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn().mockResolvedValue({ data, error }),
    maybeSingle: jest.fn().mockResolvedValue({ data: data[0] ?? null, error }),
    insert: jest.fn(() => query),
    single: jest.fn().mockResolvedValue({ data: data[0] ?? null, error }),
    update: jest.fn(() => query),
    delete: jest.fn(() => query),
  }

  return query
}

const createChannel = () => ({
  state: 'joined',
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockReturnThis(),
  send: jest.fn(),
})

let workingClient: {
  from: jest.Mock
  channel: jest.Mock
  removeChannel: jest.Mock
  rpc: jest.Mock
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } })
  ;(ensureSession as jest.Mock).mockResolvedValue(true)

  workingClient = {
    from: jest.fn(),
    channel: jest.fn(() => createChannel()),
    removeChannel: jest.fn(),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  ;(getWorkingClient as jest.Mock).mockResolvedValue(workingClient)
  ;(getRealtimeClient as jest.Mock).mockReturnValue(workingClient)
})

test('loads board chat in a 50 message window', async () => {
  const query = createQuery([createMessage('m1', 1)])
  workingClient.from.mockReturnValue(query)

  const { result } = renderHook(() => useBoardChat('news-chat', 'News Chat'))

  await waitFor(() => expect(result.current.loading).toBe(false))

  expect(query.limit).toHaveBeenCalledWith(50)
  expect(result.current.messages.map(message => message.id)).toEqual(['m1'])
})

test('realtime recovery refreshes board chat without showing the full loading state again', async () => {
  const recoveryCallbacks: Array<() => void> = []
  ;(useRealtimeRecovery as jest.Mock).mockImplementation(callback => {
    recoveryCallbacks.push(callback)
  })

  const firstQuery = createQuery([createMessage('m1', 1)])
  const refreshQuery = createQuery([createMessage('m2', 2)])
  workingClient.from
    .mockReturnValueOnce(firstQuery)
    .mockReturnValueOnce(refreshQuery)

  const { result } = renderHook(() => useBoardChat('news-chat', 'News Chat'))

  await waitFor(() => expect(result.current.loading).toBe(false))

  act(() => {
    recoveryCallbacks[0]?.()
  })

  expect(result.current.loading).toBe(false)
  await waitFor(() => expect(refreshQuery.limit).toHaveBeenCalledWith(50))
  expect(result.current.loading).toBe(false)
})
