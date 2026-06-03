import { act, renderHook, waitFor } from '@testing-library/react'
import { resetBoardChatCacheForTests, useBoardChat } from '../src/hooks/useBoardChat'
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
jest.mock('../src/hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({
    playMessage: jest.fn(),
    playReaction: jest.fn(),
  }),
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
  message_type: 'text',
  reactions: {},
  pinned: false,
  pinned_by: null,
  pinned_at: null,
  reply_to: null,
  created_at: `2026-05-02T12:${String(minute).padStart(2, '0')}:00.000Z`,
  updated_at: `2026-05-02T12:${String(minute).padStart(2, '0')}:00.000Z`,
  user: { id: 'u1', username: 'user', display_name: 'User' },
})

const createQuery = (data: unknown[], error: unknown = null) => {
  const query: Record<string, jest.Mock> = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    lt: jest.fn(() => query),
    or: jest.fn(() => query),
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

const queueBoardWindow = (messages: unknown[], pinned: unknown[] = []) => {
  const pinnedQuery = createQuery(pinned)
  const messagesQuery = createQuery(messages)
  workingClient.from
    .mockReturnValueOnce(pinnedQuery)
    .mockReturnValueOnce(messagesQuery)
  return { pinnedQuery, messagesQuery }
}

type RealtimeHandlers = Record<string, (payload: any) => Promise<void> | void>

type TestChannel = {
  state: string
  on: jest.Mock<TestChannel, [string, { event: string }, RealtimeHandlers[string]]>
  subscribe: jest.Mock<TestChannel, []>
  send: jest.Mock
}

const createChannel = (handlers: RealtimeHandlers): TestChannel => {
  const channel: TestChannel = {
    state: 'joined',
    on: jest.fn((_: string, config: { event: string }, handler: RealtimeHandlers[string]) => {
      handlers[config.event] = handler
      return channel
    }),
    subscribe: jest.fn(() => channel),
    send: jest.fn(),
  }

  return channel
}

let realtimeHandlers: RealtimeHandlers

let workingClient: {
  from: jest.Mock
  channel: jest.Mock
  removeChannel: jest.Mock
  rpc: jest.Mock
}

beforeEach(() => {
  jest.resetAllMocks()
  resetBoardChatCacheForTests()
  ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } })
  ;(ensureSession as jest.Mock).mockResolvedValue(true)
  realtimeHandlers = {}

  workingClient = {
    from: jest.fn(),
    channel: jest.fn(() => createChannel(realtimeHandlers)),
    removeChannel: jest.fn(),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  ;(getWorkingClient as jest.Mock).mockResolvedValue(workingClient)
  ;(getRealtimeClient as jest.Mock).mockReturnValue(workingClient)
})

test('loads board chat in a 50 message window', async () => {
  const { messagesQuery } = queueBoardWindow([createMessage('m1', 1)])

  const { result } = renderHook(() => useBoardChat('news-chat', 'News Chat'))

  await waitFor(() => expect(result.current.loading).toBe(false))

  expect(messagesQuery.limit).toHaveBeenCalledWith(50)
  expect(result.current.messages.map(message => message.id)).toEqual(['m1'])
  expect(messagesQuery.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: false })
  expect(messagesQuery.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false })
})

test('loads older board chat messages with a stable created_at and id cursor', async () => {
  const initialMessages = [
    createMessage('00000000-0000-0000-0000-0000000000b2', 2),
    createMessage('00000000-0000-0000-0000-0000000000a1', 2),
    ...Array.from({ length: 48 }, (_, index) =>
      createMessage(`00000000-0000-0000-0000-0000000001${String(index).padStart(2, '0')}`, index + 3)
    ),
  ]
  const { messagesQuery: initialQuery } = queueBoardWindow(initialMessages)
  const { messagesQuery: olderQuery } = queueBoardWindow([
    createMessage('00000000-0000-0000-0000-000000000090', 1),
  ])

  const { result } = renderHook(() => useBoardChat('news-chat', 'News Chat'))

  await waitFor(() => expect(result.current.loading).toBe(false))

  await act(async () => {
    await result.current.loadOlderMessages()
  })

  expect(olderQuery.or).toHaveBeenCalledWith(
    'created_at.lt.2026-05-02T12:02:00.000Z,and(created_at.eq.2026-05-02T12:02:00.000Z,id.lt.00000000-0000-0000-0000-0000000000a1)'
  )
  expect(olderQuery.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: false })
  expect(olderQuery.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false })
  expect(result.current.messages.map(message => message.id)).toEqual([
    '00000000-0000-0000-0000-000000000090',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b2',
    ...Array.from({ length: 48 }, (_, index) =>
      `00000000-0000-0000-0000-0000000001${String(index).padStart(2, '0')}`
    ),
  ])
})

test('realtime recovery refreshes board chat without showing the full loading state again', async () => {
  const recoveryCallbacks: Array<() => void> = []
  ;(useRealtimeRecovery as jest.Mock).mockImplementation(callback => {
    recoveryCallbacks.push(callback)
  })

  queueBoardWindow([createMessage('m1', 1)])
  const { messagesQuery: refreshQuery } = queueBoardWindow([createMessage('m2', 2)])

  const { result } = renderHook(() => useBoardChat('news-chat', 'News Chat'))

  await waitFor(() => expect(result.current.loading).toBe(false))

  act(() => {
    recoveryCallbacks[0]?.()
  })

  expect(result.current.loading).toBe(false)
  await waitFor(() => expect(refreshQuery.limit).toHaveBeenCalledWith(50))
  expect(result.current.loading).toBe(false)
})

test('skips realtime update detail fetches for unloaded board chat messages', async () => {
  queueBoardWindow([createMessage('m1', 1)])

  const { result } = renderHook(() => useBoardChat('news-chat', 'News Chat'))

  await waitFor(() => expect(result.current.loading).toBe(false))
  await waitFor(() => expect(realtimeHandlers.UPDATE).toBeDefined())
  expect(workingClient.from).toHaveBeenCalledTimes(2)

  act(() => {
    realtimeHandlers.UPDATE?.({
      new: {
        id: 'offscreen-message',
        content: 'offscreen edit',
        updated_at: '2026-05-02T13:00:00.000Z',
      },
    })
  })

  expect(workingClient.from).toHaveBeenCalledTimes(2)
  expect(result.current.messages.map(message => message.id)).toEqual(['m1'])
})

test('merges realtime board chat updates for loaded messages without refetching', async () => {
  queueBoardWindow([createMessage('m1', 1)])

  const { result } = renderHook(() => useBoardChat('news-chat', 'News Chat'))

  await waitFor(() => expect(result.current.loading).toBe(false))
  await waitFor(() => expect(realtimeHandlers.UPDATE).toBeDefined())
  expect(workingClient.from).toHaveBeenCalledTimes(2)

  act(() => {
    realtimeHandlers.UPDATE?.({
      new: {
        id: 'm1',
        content: 'edited locally',
        reactions: { gold: ['u2'] },
        updated_at: '2026-05-02T13:00:00.000Z',
      },
    })
  })

  expect(workingClient.from).toHaveBeenCalledTimes(2)
  expect(result.current.messages[0].content).toBe('edited locally')
  expect(result.current.messages[0].reactions).toEqual({ gold: ['u2'] })
  expect(result.current.messages[0].user).toEqual({ id: 'u1', username: 'user', display_name: 'User' })
})

test('ignores stale realtime board chat updates for loaded messages', async () => {
  queueBoardWindow([createMessage('m1', 5)])

  const { result } = renderHook(() => useBoardChat('news-chat', 'News Chat'))

  await waitFor(() => expect(result.current.loading).toBe(false))
  await waitFor(() => expect(realtimeHandlers.UPDATE).toBeDefined())

  act(() => {
    realtimeHandlers.UPDATE?.({
      new: {
        id: 'm1',
        content: 'stale edit',
        updated_at: '2026-05-02T12:04:00.000Z',
      },
    })
  })

  expect(workingClient.from).toHaveBeenCalledTimes(2)
  expect(result.current.messages[0].content).toBe('m1')
})

test('deletes board chat messages without client-side owner filtering', async () => {
  const deleteQuery = createQuery([{ id: 'm1' }])
  queueBoardWindow([createMessage('m1', 1)])
  workingClient.from.mockReturnValueOnce(deleteQuery)

  const { result } = renderHook(() => useBoardChat('news-chat', 'News Chat'))

  await waitFor(() => expect(result.current.loading).toBe(false))

  await act(async () => {
    await result.current.deleteMessage('m1')
  })

  expect(deleteQuery.delete).toHaveBeenCalled()
  expect(deleteQuery.eq).toHaveBeenNthCalledWith(1, 'id', 'm1')
  expect(deleteQuery.eq).toHaveBeenNthCalledWith(2, 'board_slug', 'news-chat')
  expect(deleteQuery.eq).toHaveBeenCalledTimes(2)
  expect(deleteQuery.select).toHaveBeenCalledWith('id')
  expect(deleteQuery.maybeSingle).toHaveBeenCalled()
})

test('does not treat zero-row board chat deletes as successful', async () => {
  const deleteQuery = createQuery([])
  queueBoardWindow([createMessage('m1', 1)])
  workingClient.from.mockReturnValueOnce(deleteQuery)

  const { result } = renderHook(() => useBoardChat('news-chat', 'News Chat'))

  await waitFor(() => expect(result.current.loading).toBe(false))

  await expect(
    act(async () => {
      await result.current.deleteMessage('m1')
    })
  ).rejects.toThrow('Message delete was not confirmed by the server.')
})
