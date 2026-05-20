import { act, renderHook, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { useMessageNotifications } from '../src/hooks/useMessageNotifications'
import { useAuth } from '../src/hooks/useAuth'
import { getRealtimeClient, getWorkingClient } from '../src/lib/supabase'

const mockUseRealtimeRecovery = jest.fn()

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))
jest.mock('../src/hooks/useIsDesktop', () => ({
  useIsDesktop: jest.fn(() => true),
}))
jest.mock('../src/hooks/useRealtimeRecovery', () => ({
  useRealtimeRecovery: (...args: unknown[]) => mockUseRealtimeRecovery(...args),
}))
jest.mock('../src/lib/realtimeRecovery', () => ({
  runRealtimeRecovery: jest.fn().mockResolvedValue({ ok: true, skipped: false, reason: 'channel-error' }),
}))
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    custom: jest.fn(),
    dismiss: jest.fn(),
  },
}))
jest.mock('../src/lib/supabase', () => ({
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
}))

type ChannelMock = {
  insertHandler?: (payload: any) => Promise<void>
  on: jest.Mock
  subscribe: jest.Mock
  state: string
}

type UseMessageNotificationsProps = {
  onOpenConversation: (id: string) => void
}

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

const createMessageQuery = () => {
  const query: Record<string, any> = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    single: jest.fn().mockResolvedValue({
      data: {
        id: 'dm-1',
        content: 'hello',
        conversation_id: 'conversation-1',
        sender: {
          id: 'sender-1',
          display_name: 'Sender',
          avatar_url: null,
          color: 'gold',
          admin_role: null,
          presence_visibility: 'tracked',
        },
      },
      error: null,
    }),
  }

  return query
}

describe('useMessageNotifications', () => {
  let channels: ChannelMock[]
  let workingClient: {
    channel: jest.Mock
    removeChannel: jest.Mock
    from: jest.Mock
  }

  beforeEach(() => {
    channels = []
    workingClient = {
      channel: jest.fn(() => {
        const channel: ChannelMock = {
          on: jest.fn((_event, filter, handler) => {
            if (filter?.event === 'INSERT') {
              channel.insertHandler = handler
            }
            return channel
          }),
          subscribe: jest.fn(() => channel),
          state: 'joined',
        }
        channels.push(channel)
        return channel
      }),
      removeChannel: jest.fn(),
      from: jest.fn(() => createMessageQuery()),
    }

    ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'user-1' } })
    ;(getWorkingClient as jest.Mock).mockResolvedValue(workingClient)
    ;(getRealtimeClient as jest.Mock).mockReturnValue(workingClient)
    ;(toast.custom as jest.Mock).mockClear()
    mockUseRealtimeRecovery.mockClear()
    workingClient.channel.mockClear()
    workingClient.removeChannel.mockClear()
  })

  it('does not resubscribe when the parent passes a fresh open handler on rerender', async () => {
    const { rerender } = renderHook<void, UseMessageNotificationsProps>(
      ({ onOpenConversation }) => useMessageNotifications(onOpenConversation),
      { initialProps: { onOpenConversation: jest.fn() } }
    )

    await waitFor(() => expect(workingClient.channel).toHaveBeenCalledTimes(1))

    rerender({ onOpenConversation: jest.fn() })
    rerender({ onOpenConversation: jest.fn() })

    await act(async () => {
      await Promise.resolve()
    })

    expect(workingClient.channel).toHaveBeenCalledTimes(1)
    expect(workingClient.removeChannel).not.toHaveBeenCalled()
  })

  it('removes a notification channel that finishes subscribing after cleanup', async () => {
    const deferredClient = createDeferred<typeof workingClient>()
    ;(getWorkingClient as jest.Mock).mockReturnValueOnce(deferredClient.promise)

    const { unmount } = renderHook(() => useMessageNotifications(jest.fn()))

    unmount()

    await act(async () => {
      deferredClient.resolve(workingClient)
      await deferredClient.promise
      await Promise.resolve()
    })

    await waitFor(() => expect(channels).toHaveLength(1))
    expect(workingClient.removeChannel).toHaveBeenCalledWith(channels[0])
  })

  it('shows one toast when duplicate realtime subscriptions deliver the same DM insert', async () => {
    renderHook(() => useMessageNotifications(jest.fn()))

    await waitFor(() => expect(channels[0]?.insertHandler).toBeDefined())

    await act(async () => {
      await channels[0].insertHandler?.({
        new: {
          id: 'dm-1',
          sender_id: 'sender-1',
        },
      })
      await channels[0].insertHandler?.({
        new: {
          id: 'dm-1',
          sender_id: 'sender-1',
        },
      })
    })

    expect(toast.custom).toHaveBeenCalledTimes(1)
    expect(workingClient.from).toHaveBeenCalledTimes(1)
  })

  it('keeps only the latest realtime recovery resubscribe channel active', async () => {
    const firstRecoveryClient = createDeferred<typeof workingClient>()
    const secondRecoveryClient = createDeferred<typeof workingClient>()
    ;(getWorkingClient as jest.Mock)
      .mockResolvedValueOnce(workingClient)
      .mockReturnValueOnce(firstRecoveryClient.promise)
      .mockReturnValueOnce(secondRecoveryClient.promise)

    renderHook(() => useMessageNotifications(jest.fn()))

    await waitFor(() => expect(workingClient.channel).toHaveBeenCalledTimes(1))
    const recover = mockUseRealtimeRecovery.mock.calls[0][0] as () => void

    act(() => {
      recover()
      recover()
    })

    await act(async () => {
      firstRecoveryClient.resolve(workingClient)
      await firstRecoveryClient.promise
      await Promise.resolve()
    })

    await act(async () => {
      secondRecoveryClient.resolve(workingClient)
      await secondRecoveryClient.promise
      await Promise.resolve()
    })

    expect(channels).toHaveLength(3)
    expect(workingClient.removeChannel).toHaveBeenCalledWith(channels[0])
    expect(workingClient.removeChannel).toHaveBeenCalledWith(channels[1])
    expect(workingClient.removeChannel).not.toHaveBeenCalledWith(channels[2])
  })
})
