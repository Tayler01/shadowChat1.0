import { act, render, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ShadoLiveNotificationBridge } from '../src/features/entertainment/shado-live/real/ShadoLiveNotificationBridge'
import { useAuth } from '../src/hooks/useAuth'
import { getRealtimeClient, getWorkingClient } from '../src/lib/supabase'

jest.mock('../src/hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../src/lib/supabase', () => ({
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
}))
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    custom: jest.fn(),
    dismiss: jest.fn(),
  },
}))

const recentNotification = {
  notification_id: 'notification-1',
  type: 'room_started',
  room_id: '10000000-0000-4000-8000-000000000001',
  actor: { display_name: 'JJ', username: 'jj' },
  body_preview: 'Started a Shado Live room',
  read_at: null,
  occurred_at: new Date().toISOString(),
}

describe('ShadoLiveNotificationBridge', () => {
  let insertHandler: (() => void) | undefined
  let rpc: jest.Mock
  let channel: { on: jest.Mock; subscribe: jest.Mock }
  let client: { rpc: jest.Mock; channel: jest.Mock; removeChannel: jest.Mock }

  beforeEach(() => {
    insertHandler = undefined
    rpc = jest.fn((name: string) => {
      if (name === 'list_my_shado_live_notifications') {
        return Promise.resolve({ data: [recentNotification], error: null })
      }
      if (name === 'mark_my_shado_live_notifications_read') {
        return Promise.resolve({ data: 1, error: null })
      }
      throw new Error(`Unexpected RPC: ${name}`)
    })
    channel = {
      on: jest.fn((_event, filter, handler) => {
        if (filter?.event === 'INSERT') insertHandler = handler
        return channel
      }),
      subscribe: jest.fn(callback => {
        callback('SUBSCRIBED')
        return channel
      }),
    }
    client = {
      rpc,
      channel: jest.fn(() => channel),
      removeChannel: jest.fn().mockResolvedValue(undefined),
    }
    ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'recipient-1' } })
    ;(getWorkingClient as jest.Mock).mockResolvedValue(client)
    ;(getRealtimeClient as jest.Mock).mockReturnValue(client)
    ;(toast.custom as jest.Mock).mockReset().mockReturnValue('live-toast')
    ;(toast.dismiss as jest.Mock).mockReset()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    window.history.replaceState({}, '', '/')
  })

  test('reads the canonical recipient ledger and subscribes to only that recipient', async () => {
    render(<ShadoLiveNotificationBridge />)

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('list_my_shado_live_notifications', {
      p_limit: 20,
      p_before_occurred_at: null,
      p_before_id: null,
    }))
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'shado_live_notifications',
        filter: 'recipient_user_id=eq.recipient-1',
      },
      expect.any(Function),
    )
    expect(toast.custom).toHaveBeenCalledTimes(1)
  })

  test('marks a selected notification read and opens the canonical Live room route', async () => {
    render(<ShadoLiveNotificationBridge />)
    await waitFor(() => expect(toast.custom).toHaveBeenCalledTimes(1))
    const [renderer, options] = (toast.custom as jest.Mock).mock.calls[0]
    expect(options).toEqual({ duration: 5000, position: 'top-center' })
    render(renderer({ id: 'toast-1', visible: true }))

    act(() => {
      screen.getByRole('button', { name: /JJ is live now\. Open Shado Live/i }).click()
    })

    await waitFor(() => expect(rpc).toHaveBeenCalledWith(
      'mark_my_shado_live_notifications_read',
      { p_notification_ids: ['notification-1'] },
    ))
    const url = new URL(window.location.href)
    expect(url.searchParams.get('view')).toBe('games')
    expect(url.searchParams.get('experience')).toBe('shado-live')
    expect(url.searchParams.get('item')).toBe(recentNotification.room_id)
    expect(toast.dismiss).toHaveBeenCalledWith('toast-1')
  })

  test('does not replay a notification after a realtime refresh', async () => {
    render(<ShadoLiveNotificationBridge />)
    await waitFor(() => expect(toast.custom).toHaveBeenCalledTimes(1))
    expect(insertHandler).toBeDefined()

    act(() => insertHandler?.())
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === 'list_my_shado_live_notifications')).toHaveLength(2))
    expect(toast.custom).toHaveBeenCalledTimes(1)
  })

  test('suppresses read and stale canonical rows', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'list_my_shado_live_notifications') {
        return Promise.resolve({
          data: [
            { ...recentNotification, notification_id: 'read-1', read_at: new Date().toISOString() },
            { ...recentNotification, notification_id: 'stale-1', occurred_at: new Date(Date.now() - 120_000).toISOString() },
          ],
          error: null,
        })
      }
      return Promise.resolve({ data: 1, error: null })
    })

    render(<ShadoLiveNotificationBridge />)
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(toast.custom).not.toHaveBeenCalled()
  })
})
