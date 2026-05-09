import { act, renderHook, waitFor } from '@testing-library/react'
import { useNewsFeed } from '../src/hooks/useNewsFeed'
import { useAuth } from '../src/hooks/useAuth'
import { getWorkingClient } from '../src/lib/supabase'
import { getEasternVisibleDay } from '../src/lib/newsFeedVisibility'

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
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
}))

type HandlerMap = Record<string, (payload: any) => Promise<void> | void>
type TestChannel = {
  on: jest.Mock<TestChannel, [string, { event: string }, HandlerMap[string]]>
  subscribe: jest.Mock<TestChannel, []>
}

const createFeedItem = (id: string, visibleDay = getEasternVisibleDay()) => ({
  id,
  title: id,
  summary: `${id} summary`,
  source_url: `https://example.com/${id}`,
  image_url: null,
  hidden: false,
  visible_day: visibleDay,
  detected_at: '2026-05-02T12:00:00.000Z',
  created_at: '2026-05-02T12:00:00.000Z',
  source: null,
})

const createQuery = (data: unknown[]) => {
  const query: Record<string, jest.Mock> = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn().mockResolvedValue({ data, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: data[0] ?? null, error: null }),
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

test('skips detail fetches for hidden news feed inserts', async () => {
  const initialQuery = createQuery([])
  workingClient.from.mockReturnValue(initialQuery)

  const { result } = renderHook(() => useNewsFeed())

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(workingClient.from).toHaveBeenCalledTimes(1)

  await act(async () => {
    await handlers.INSERT?.({
      eventType: 'INSERT',
      new: { id: 'hidden-item', hidden: true, visible_day: getEasternVisibleDay() },
    })
  })

  expect(workingClient.from).toHaveBeenCalledTimes(1)
  expect(result.current.items).toEqual([])
})

test('removes hidden news feed updates without a detail refetch', async () => {
  const initialQuery = createQuery([createFeedItem('visible-item')])
  workingClient.from.mockReturnValue(initialQuery)

  const { result } = renderHook(() => useNewsFeed())

  await waitFor(() => expect(result.current.items).toHaveLength(1))
  expect(workingClient.from).toHaveBeenCalledTimes(1)

  await act(async () => {
    await handlers.UPDATE?.({
      eventType: 'UPDATE',
      new: { id: 'visible-item', hidden: true, visible_day: getEasternVisibleDay() },
    })
  })

  expect(workingClient.from).toHaveBeenCalledTimes(1)
  expect(result.current.items).toEqual([])
})
