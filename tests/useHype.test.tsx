import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HypeProvider, useHype } from '../src/hooks/useHype'
import { useAuth } from '../src/hooks/useAuth'
import { useMessages } from '../src/hooks/MessagesContext'
import {
  fetchHypeStatus,
  fetchPendingHypeEvents,
  getRealtimeClient,
  getWorkingClient,
  markHypeEventsPlayed,
  type HypeEvent,
} from '../src/lib/supabase'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))
jest.mock('../src/hooks/MessagesContext', () => ({
  useMessages: jest.fn(),
}))
jest.mock('../src/hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({
    playHypeBell: jest.fn(),
    playHypeMessage: jest.fn(),
  }),
}))
jest.mock('../src/lib/push', () => ({
  triggerHypePushNotification: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../src/lib/supabase', () => ({
  fetchHypeEvent: jest.fn(),
  fetchHypeStatus: jest.fn(),
  fetchPendingHypeEvents: jest.fn(),
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
  hypeMessage: jest.fn(),
  markHypeEventsPlayed: jest.fn(),
  ringHypeBell: jest.fn(),
}))

const mockedUseAuth = useAuth as jest.Mock
const mockedUseMessages = useMessages as jest.Mock
const mockedFetchHypeStatus = fetchHypeStatus as jest.Mock
const mockedFetchPendingHypeEvents = fetchPendingHypeEvents as jest.Mock
const mockedGetRealtimeClient = getRealtimeClient as jest.Mock
const mockedGetWorkingClient = getWorkingClient as jest.Mock
const mockedMarkHypeEventsPlayed = markHypeEventsPlayed as jest.Mock
let realtimeInsertHandler: ((payload: any) => Promise<void> | void) | undefined

const makeEvent = (id: string): HypeEvent => ({
  id,
  actor_id: 'actor-1',
  event_type: 'bell',
  message_id: null,
  message_author_id: null,
  metadata: { actor_display_name: 'Alice' },
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 60_000).toISOString(),
})

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <HypeProvider>{children}</HypeProvider>
)

const flushAsync = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  localStorage.clear()
  realtimeInsertHandler = undefined

  const channel: any = {
    on: jest.fn((_event, _filter, handler) => {
      realtimeInsertHandler = handler
      return channel
    }),
    subscribe: jest.fn(),
  }
  const client = {
    channel: jest.fn(() => channel),
    removeChannel: jest.fn(),
  }

  mockedUseAuth.mockReturnValue({ user: { id: 'user-1' } })
  mockedUseMessages.mockReturnValue({ loading: false })
  mockedFetchHypeStatus.mockResolvedValue({
    used: 0,
    remaining: 2,
    limit_per_day: 2,
    reset_at: new Date(Date.now() + 86_400_000).toISOString(),
  })
  mockedFetchPendingHypeEvents.mockResolvedValue([])
  mockedGetWorkingClient.mockResolvedValue(client)
  mockedGetRealtimeClient.mockReturnValue(client)
  mockedMarkHypeEventsPlayed.mockResolvedValue(undefined)
})

afterEach(() => {
  jest.useRealTimers()
})

test('retries server receipts without replaying locally seen pending Hype events', async () => {
  const event = makeEvent('hype-event-1')
  localStorage.setItem(
    'shadowchat:hype-played-events:user-1',
    JSON.stringify([{ id: event.id, expiresAt: event.expires_at, storedAt: Date.now() }])
  )
  mockedFetchPendingHypeEvents.mockResolvedValue([event])

  const { result } = renderHook(() => useHype(), { wrapper })

  await waitFor(() => {
    expect(mockedMarkHypeEventsPlayed).toHaveBeenCalledWith([event.id])
  })
  expect(result.current.activeCelebration).toBeNull()
})

test('stores a local receipt before showing a new pending Hype event after startup settles', async () => {
  jest.useFakeTimers()
  const event = makeEvent('hype-event-2')
  mockedFetchPendingHypeEvents.mockResolvedValue([event])

  const { result } = renderHook(() => useHype(), { wrapper })

  await flushAsync()

  const rawReceipts = localStorage.getItem('shadowchat:hype-played-events:user-1')
  expect(rawReceipts).toContain(event.id)
  expect(mockedMarkHypeEventsPlayed).toHaveBeenCalledWith([event.id])
  expect(result.current.activeCelebration).toBeNull()

  act(() => {
    jest.advanceTimersByTime(1_999)
  })
  expect(result.current.activeCelebration).toBeNull()

  act(() => {
    jest.advanceTimersByTime(1)
  })
  await flushAsync()

  expect(result.current.activeCelebration?.latestEvent.id).toBe(event.id)
})

test('queues live realtime Hype events until startup settles', async () => {
  jest.useFakeTimers()
  const event = makeEvent('hype-event-3')

  const { result } = renderHook(() => useHype(), { wrapper })

  await flushAsync()
  expect(realtimeInsertHandler).toBeDefined()

  await act(async () => {
    await realtimeInsertHandler?.({ new: event })
  })

  expect(mockedMarkHypeEventsPlayed).toHaveBeenCalledWith([event.id])
  expect(result.current.activeCelebration).toBeNull()

  act(() => {
    jest.advanceTimersByTime(2_000)
  })
  await flushAsync()

  expect(result.current.activeCelebration?.latestEvent.id).toBe(event.id)
})
