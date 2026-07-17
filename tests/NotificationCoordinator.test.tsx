import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NotificationCoordinatorProvider } from '../src/features/notifications/NotificationCoordinator'
import {
  claimNotificationEvent,
  clearNotificationEventFromSystemTray,
  fetchForegroundNotificationEvents,
  fetchNotificationCoordinatorPreferences,
  markNotificationEventRead,
} from '../src/features/notifications/notificationApi'
import { useAuth } from '../src/hooks/useAuth'
import { useIsDesktop } from '../src/hooks/useIsDesktop'
import { getRealtimeClient, getWorkingClient } from '../src/lib/supabase'
import {
  refreshAppBadgeState,
  requestAppBadgeRefresh,
} from '../src/lib/appBadge'

jest.mock('../src/hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../src/hooks/useIsDesktop', () => ({ useIsDesktop: jest.fn() }))
jest.mock('../src/lib/supabase', () => ({
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
}))
jest.mock('../src/lib/appBadge', () => ({
  APP_BADGE_REFRESH_EVENT: 'shadowchat:app-badge-refresh',
  refreshAppBadgeState: jest.fn().mockResolvedValue({
    total: 0,
    dm: 0,
    group: 0,
    interactions: 0,
    connections: 0,
    shadow_pin: 0,
    games: 0,
  }),
  requestAppBadgeRefresh: jest.fn(),
}))
jest.mock('../src/features/notifications/notificationApi', () => ({
  claimNotificationEvent: jest.fn(),
  clearNotificationEventFromSystemTray: jest.fn(),
  fetchForegroundNotificationEvents: jest.fn(),
  fetchNotificationCoordinatorPreferences: jest.fn(),
  markNotificationEventRead: jest.fn(),
}))

describe('NotificationCoordinatorProvider', () => {
  let insertHandler: ((payload: { new: unknown }) => void) | undefined
  let channel: { on: jest.Mock; subscribe: jest.Mock }
  let client: { channel: jest.Mock; removeChannel: jest.Mock }

  beforeEach(() => {
    insertHandler = undefined
    channel = {
      on: jest.fn((_kind, filter, handler) => {
        if (filter?.event === 'INSERT') insertHandler = handler
        return channel
      }),
      subscribe: jest.fn((statusHandler?: (status: string) => void) => {
        statusHandler?.('SUBSCRIBED')
        return channel
      }),
    }
    client = {
      channel: jest.fn(() => channel),
      removeChannel: jest.fn().mockResolvedValue(undefined),
    }
    ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'user-1' } })
    ;(useIsDesktop as jest.Mock).mockReturnValue(false)
    ;(getWorkingClient as jest.Mock).mockResolvedValue(client)
    ;(getRealtimeClient as jest.Mock).mockReturnValue(client)
    ;(fetchNotificationCoordinatorPreferences as jest.Mock).mockResolvedValue({
      notifications_enabled: true,
      dm_enabled: true,
    })
    ;(fetchForegroundNotificationEvents as jest.Mock).mockResolvedValue([])
    ;(claimNotificationEvent as jest.Mock).mockResolvedValue(true)
    ;(markNotificationEventRead as jest.Mock).mockResolvedValue(true)
    ;(clearNotificationEventFromSystemTray as jest.Mock).mockResolvedValue(undefined)
    ;(refreshAppBadgeState as jest.Mock).mockClear()
    ;(requestAppBadgeRefresh as jest.Mock).mockClear()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses one notification_events subscription, atomically claims, routes, and clears', async () => {
    render(
      <NotificationCoordinatorProvider>
        <main>App</main>
      </NotificationCoordinatorProvider>,
    )
    await waitFor(() => expect(insertHandler).toBeDefined())
    expect(client.channel).toHaveBeenCalledTimes(1)
    expect(channel.on).toHaveBeenCalledTimes(1)

    act(() => {
      insertHandler?.({
        new: {
          id: 'event-1',
          user_id: 'user-1',
          type: 'dm_message',
          category: 'dm',
          entity_id: 'message-1',
          conversation_id: 'conversation-1',
          message_id: null,
          dm_message_id: 'message-1',
          actor_id: 'actor-1',
          route: '/?view=dms&conversation=conversation-1&message=message-1',
          payload: { title: 'JJ', body: 'Check this out' },
          sent_at: null,
          read_at: null,
          presented_at: null,
          resolved_at: null,
          created_at: new Date(Date.now() + 100).toISOString(),
          presentation_expires_at: new Date(Date.now() + 90_000).toISOString(),
        },
      })
    })

    await waitFor(() => expect(claimNotificationEvent).toHaveBeenCalledWith('event-1'))
    const alert = await screen.findByRole('button', { name: /JJ. Open notification/i })
    fireEvent.click(alert)

    expect(new URL(window.location.href).searchParams.get('conversation')).toBe('conversation-1')
    expect(markNotificationEventRead).toHaveBeenCalledWith('event-1')
    expect(clearNotificationEventFromSystemTray).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event-1',
      notificationType: 'dm_message',
      conversationId: 'conversation-1',
      messageId: 'message-1',
    }))
  })

  it('presents a current foreground event even when another device delivery set sent_at', async () => {
    render(
      <NotificationCoordinatorProvider>
        <main>App</main>
      </NotificationCoordinatorProvider>,
    )
    await waitFor(() => expect(insertHandler).toBeDefined())

    act(() => {
      insertHandler?.({
        new: {
          id: 'multi-device-event',
          user_id: 'user-1',
          type: 'dm_message',
          category: 'dm',
          entity_id: 'message-2',
          conversation_id: 'conversation-1',
          message_id: null,
          dm_message_id: 'message-2',
          actor_id: 'actor-1',
          route: '/?view=dms&conversation=conversation-1&message=message-2',
          payload: { title: 'Mills', body: 'Delivered elsewhere too' },
          sent_at: new Date().toISOString(),
          read_at: null,
          presented_at: null,
          resolved_at: null,
          created_at: new Date(Date.now() + 100).toISOString(),
          presentation_expires_at: new Date(Date.now() + 90_000).toISOString(),
        },
      })
    })

    await waitFor(() => expect(claimNotificationEvent).toHaveBeenCalledWith('multi-device-event'))
    expect(await screen.findByText('Delivered elsewhere too')).toBeInTheDocument()
  })

  it('claims but does not toast or read an event whose source is already open', async () => {
    window.history.replaceState({}, '', '/?view=dms&conversation=conversation-1')
    render(
      <NotificationCoordinatorProvider>
        <main>App</main>
      </NotificationCoordinatorProvider>,
    )
    await waitFor(() => expect(insertHandler).toBeDefined())

    act(() => {
      insertHandler?.({
        new: {
          id: 'active-source-event',
          user_id: 'user-1',
          type: 'dm_message',
          category: 'dm',
          entity_id: 'message-3',
          conversation_id: 'conversation-1',
          message_id: null,
          dm_message_id: 'message-3',
          actor_id: 'actor-1',
          route: '/?view=dms&conversation=conversation-1&message=message-3',
          payload: { title: 'APOLDER', body: 'Already visible' },
          sent_at: null,
          read_at: null,
          presented_at: null,
          resolved_at: null,
          created_at: new Date(Date.now() + 100).toISOString(),
          presentation_expires_at: new Date(Date.now() + 90_000).toISOString(),
        },
      })
    })

    await waitFor(() => expect(claimNotificationEvent).toHaveBeenCalledWith('active-source-event'))
    expect(screen.queryByText('Already visible')).not.toBeInTheDocument()
    expect(markNotificationEventRead).not.toHaveBeenCalledWith('active-source-event')
  })

  it('does not replay a pre-session unread event and hard-dismisses a fresh event', async () => {
    render(
      <NotificationCoordinatorProvider>
        <main>App</main>
      </NotificationCoordinatorProvider>,
    )
    await waitFor(() => expect(insertHandler).toBeDefined())

    act(() => {
      insertHandler?.({
        new: {
          id: 'old-event',
          user_id: 'user-1',
          type: 'dm_message',
          category: 'dm',
          entity_id: 'old-message',
          conversation_id: 'conversation-1',
          message_id: null,
          dm_message_id: 'old-message',
          actor_id: null,
          route: null,
          payload: { title: 'Old alert' },
          sent_at: null,
          read_at: null,
          presented_at: null,
          resolved_at: null,
          created_at: new Date(Date.now() - 60_000).toISOString(),
          presentation_expires_at: new Date(Date.now() + 30_000).toISOString(),
        },
      })
    })
    await act(async () => Promise.resolve())
    expect(claimNotificationEvent).not.toHaveBeenCalledWith('old-event')
    expect(screen.queryByText('Old alert')).not.toBeInTheDocument()

    jest.useFakeTimers()
    await act(async () => {
      insertHandler?.({
        new: {
          id: 'fresh-event',
          user_id: 'user-1',
          type: 'dm_message',
          category: 'dm',
          entity_id: 'fresh-message',
          conversation_id: 'conversation-1',
          message_id: null,
          dm_message_id: 'fresh-message',
          actor_id: null,
          route: null,
          payload: { title: 'Fresh alert' },
          sent_at: null,
          read_at: null,
          presented_at: null,
          resolved_at: null,
          created_at: new Date(Date.now() + 100).toISOString(),
          presentation_expires_at: new Date(Date.now() + 90_000).toISOString(),
        },
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('Fresh alert')).toBeInTheDocument()
    act(() => {
      jest.advanceTimersByTime(5_000)
    })
    expect(screen.queryByText('Fresh alert')).not.toBeInTheDocument()
    jest.useRealTimers()
  })
})
