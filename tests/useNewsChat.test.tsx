import { act, renderHook, waitFor } from '@testing-library/react'
import { resetNewsChatCacheForTests, useNewsChat } from '../src/hooks/useNewsChat'
import { useAuth } from '../src/hooks/useAuth'
import { useRealtimeRecovery } from '../src/hooks/useRealtimeRecovery'
import { getWorkingClient } from '../src/lib/supabase'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))
jest.mock('../src/hooks/useRealtimeRecovery', () => ({
  useRealtimeRecovery: jest.fn(),
}))
jest.mock('../src/lib/realtimeRecovery', () => ({
  runRealtimeRecovery: jest.fn().mockResolvedValue({ ok: true }),
}))
jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn().mockResolvedValue(true),
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
}))

type HandlerMap = Record<string, (payload: any) => Promise<void> | void>
type TestChannel = {
  on: jest.Mock<TestChannel, [string, { event: string }, HandlerMap[string]]>
  subscribe: jest.Mock<TestChannel, []>
}

const createMessage = (id: string) => ({
  id,
  user_id: 'u1',
  content: `${id} content`,
  reactions: {},
  created_at: `2026-05-02T12:00:0${id.endsWith('2') ? '2' : '1'}.000Z`,
  updated_at: `2026-05-02T12:00:0${id.endsWith('2') ? '2' : '1'}.000Z`,
  edited_at: null,
  deleted_at: null,
  user: {
    id: 'u1',
    username: 'news',
    display_name: 'News User',
    avatar_url: null,
    color: '#d7aa46',
    admin_role: null,
  },
})

const createQuery = (data: unknown[]) => {
  const query: Record<string, jest.Mock> = {
    select: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn().mockResolvedValue({ data, error: null }),
    eq: jest.fn(() => query),
    maybeSingle: jest.fn().mockResolvedValue({ data: data[0] ?? null, error: null }),
    insert: jest.fn(() => query),
    single: jest.fn().mockResolvedValue({ data: data[0] ?? null, error: null }),
    update: jest.fn(() => query),
    delete: jest.fn(() => query),
  }

  return query
}

const createChannel = (handlers: HandlerMap): TestChannel => {
  const channel: TestChannel = {
    on: jest.fn((_: string, config: { event: string }, handler: HandlerMap[string]) => {
      handlers[config.event] = handler
      return channel
    }),
    subscribe: jest.fn(() => channel),
  }

  return channel
}

let createChannelRef: TestChannel
let handlers: HandlerMap
let workingClient: {
  from: jest.Mock
  channel: jest.Mock
  removeChannel: jest.Mock
  rpc: jest.Mock
}

beforeEach(() => {
  jest.resetAllMocks()
  resetNewsChatCacheForTests()
  ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } })
  handlers = {}
  createChannelRef = createChannel(handlers)
  workingClient = {
    from: jest.fn(),
    channel: jest.fn(() => createChannelRef),
    removeChannel: jest.fn(),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  ;(getWorkingClient as jest.Mock).mockResolvedValue(workingClient)
})

test('applies inserted news chat messages from realtime', async () => {
  const message = createMessage('message-1')
  workingClient.from
    .mockReturnValueOnce(createQuery([]))
    .mockReturnValueOnce(createQuery([message]))

  const { result } = renderHook(() => useNewsChat())

  await waitFor(() => expect(result.current.loading).toBe(false))

  await act(async () => {
    await handlers.INSERT?.({
      eventType: 'INSERT',
      new: { id: 'message-1' },
    })
  })

  expect(result.current.messages).toEqual([message])
})

test('removes the news chat realtime channel on unmount', async () => {
  workingClient.from.mockReturnValue(createQuery([]))

  const { result, unmount } = renderHook(() => useNewsChat())

  await waitFor(() => expect(result.current.loading).toBe(false))
  await waitFor(() => expect(workingClient.channel).toHaveBeenCalledTimes(1))

  unmount()

  expect(workingClient.removeChannel).toHaveBeenCalledWith(createChannelRef)
})

test('resubscribes the news chat realtime channel after recovery', async () => {
  const nextChannel = createChannel({})
  workingClient.from.mockReturnValue(createQuery([]))

  const { result } = renderHook(() => useNewsChat())

  await waitFor(() => expect(result.current.loading).toBe(false))
  await waitFor(() => expect(workingClient.channel).toHaveBeenCalledTimes(1))

  workingClient.channel.mockReturnValueOnce(nextChannel)
  const recoveryHandler = (useRealtimeRecovery as jest.Mock).mock.calls[0]?.[0] as (() => void) | undefined
  expect(recoveryHandler).toBeDefined()

  await act(async () => {
    recoveryHandler?.()
  })

  await waitFor(() => expect(workingClient.channel).toHaveBeenCalledTimes(2))
  expect(workingClient.removeChannel).toHaveBeenCalledWith(createChannelRef)
})
