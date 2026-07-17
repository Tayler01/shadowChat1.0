import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CatchUpView } from '../src/features/catch-up/CatchUpView'
import { clearCatchUpCache, writeCatchUpCache, type CatchUpSnapshot } from '../src/features/catch-up/catchUpModel'
import {
  acknowledgeCatchUpEvents,
  acknowledgeNotificationInboxEvent,
  fetchCatchUpSnapshot,
  fetchNotificationInbox,
} from '../src/features/catch-up/catchUpApi'
import { getUserProfile } from '../src/lib/auth'

let mockMotionPreference: 'full' | 'reduced' | 'none' = 'none'

jest.mock('../src/features/catch-up/catchUpApi', () => ({
  acknowledgeCatchUpEvents: jest.fn(),
  acknowledgeNotificationInboxEvent: jest.fn(),
  fetchCatchUpSnapshot: jest.fn(),
  fetchNotificationInbox: jest.fn(),
}))

jest.mock('../src/components/layout/MobileAppHeader', () => ({
  MobileAppHeader: () => null,
}))

jest.mock('../src/components/ui/Avatar', () => ({
  Avatar: ({ src, alt, fallback }: { src?: string; alt: string; fallback?: string }) => (
    <span data-testid="catch-up-avatar" data-src={src || ''} data-fallback={fallback || ''}>{alt}</span>
  ),
}))

jest.mock('../src/components/profile/PublicProfileDialog', () => ({
  PublicProfileDialog: ({ user, open }: { user: { display_name: string }; open: boolean }) => (
    open ? <div data-testid="public-profile-dialog">{user.display_name}</div> : null
  ),
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

jest.mock('../src/hooks/useComfortPreferences', () => ({
  useComfortPreferences: () => ({
    effectivePreferences: { motion: mockMotionPreference },
  }),
}))

jest.mock('../src/lib/auth', () => ({
  getUserProfile: jest.fn(),
}))

const fetchSnapshot = fetchCatchUpSnapshot as jest.MockedFunction<typeof fetchCatchUpSnapshot>
const acknowledge = acknowledgeCatchUpEvents as jest.MockedFunction<typeof acknowledgeCatchUpEvents>
const acknowledgeNotification = acknowledgeNotificationInboxEvent as jest.MockedFunction<typeof acknowledgeNotificationInboxEvent>
const fetchInbox = fetchNotificationInbox as jest.MockedFunction<typeof fetchNotificationInbox>
const fetchProfile = getUserProfile as jest.MockedFunction<typeof getUserProfile>

const section = (id: CatchUpSnapshot['sections'][keyof CatchUpSnapshot['sections']]['id'], title: string) => ({
  id,
  title,
  shownCount: 0,
  totalCount: 0,
  hasMore: false,
  olderUnreadExists: false,
  items: [],
})

const snapshot = (): CatchUpSnapshot => ({
  schemaVersion: 1,
  generatedAt: '2026-07-14T02:00:00Z',
  effectiveSince: '2026-07-07T02:00:00Z',
  lookbackHours: 168,
  sourceLinked: true,
  aiGenerated: false,
  sections: {
    needs_you: {
      ...section('needs_you', 'Needs you'),
      shownCount: 1,
      totalCount: 1,
      items: [{
        id: 'activity:event-1',
        kind: 'mention',
        occurredAt: '2026-07-14T01:30:00Z',
        actor: {
          id: 'actor-1',
          display_name: 'Mills',
          username: 'mills',
          avatar_url: 'https://example.com/mills-full.jpg',
          avatar_thumbnail_url: 'https://example.com/mills-thumb.jpg',
          color: '#d7aa46',
        },
        title: 'You were mentioned',
        preview: 'Open the exact source message.',
        unreadCount: 1,
        manuallyUnread: false,
        target: { kind: 'chat_message', message_id: 'message-1' },
        activityEventIds: ['event-1'],
      }],
    },
    direct_messages: section('direct_messages', 'Direct messages'),
    general_chat: section('general_chat', 'General Chat'),
    shadow_pin: section('shadow_pin', 'ShadowPin'),
  },
})

beforeEach(() => {
  jest.clearAllMocks()
  clearCatchUpCache()
  acknowledge.mockResolvedValue(1)
  acknowledgeNotification.mockResolvedValue(true)
  fetchInbox.mockResolvedValue([])
  fetchProfile.mockResolvedValue(null)
  mockMotionPreference = 'none'
})

test('shows canonical unread notifications and clears the exact event after opening its source', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue([{
    id: 'notification:event-9',
    kind: 'shadow_checkers_turn',
    occurredAt: '2026-07-14T01:50:00Z',
    actor: null,
    title: 'Your turn in Shadow Checkers',
    preview: 'Mills moved. Open the match to make your play.',
    unreadCount: 1,
    manuallyUnread: false,
    target: { kind: 'app_route', route: '/?view=games&experience=shadow-checkers&item=match-1' },
    activityEventIds: [],
    notificationEventIds: ['event-9'],
  }])
  const onOpenSource = jest.fn()

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={onOpenSource} />)

  expect(await screen.findByRole('heading', { name: 'Notification inbox' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Your turn in Shadow Checkers' }))

  expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({
    target: { kind: 'app_route', route: '/?view=games&experience=shadow-checkers&item=match-1' },
  }))
  await waitFor(() => expect(acknowledgeNotification).toHaveBeenCalledWith('event-9'))
  expect(screen.queryByRole('heading', { name: 'Notification inbox' })).not.toBeInTheDocument()
})

test('swipes a notification left to mark it read without opening its source', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue([{
    id: 'notification:event-10',
    kind: 'shadow_pin_comment',
    occurredAt: '2026-07-17T12:00:00Z',
    actor: {
      id: 'actor-1',
      display_name: 'Mills',
      username: 'mills',
      avatar_url: 'https://example.com/mills-full.jpg',
      avatar_thumbnail_url: 'https://example.com/mills-thumb.jpg',
      color: '#d7aa46',
    },
    title: 'New comment on your Pin',
    preview: 'Mills left a comment.',
    unreadCount: 1,
    manuallyUnread: false,
    target: { kind: 'app_route', route: '/?view=shadowpin&item=pin-1' },
    activityEventIds: [],
    notificationEventIds: ['event-10'],
  }])
  const onOpenSource = jest.fn()

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={onOpenSource} />)

  expect(await screen.findByRole('button', { name: "Open Mills's profile" })).toBeInTheDocument()
  expect(screen.getByTestId('catch-up-avatar')).toHaveAttribute(
    'data-src',
    'https://example.com/mills-thumb.jpg'
  )
  const swipeSurface = screen.getByTestId('notification-swipe-notification:event-10')
  fireEvent.pointerDown(swipeSurface, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 240,
    clientY: 120,
  })
  fireEvent.pointerMove(swipeSurface, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 150,
    clientY: 122,
  })
  fireEvent.pointerUp(swipeSurface, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 150,
    clientY: 122,
  })

  await waitFor(() => expect(acknowledgeNotification).toHaveBeenCalledWith('event-10'))
  expect(onOpenSource).not.toHaveBeenCalled()
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'Notification inbox' })).not.toBeInTheDocument()
  })
  expect(screen.getByText('New comment on your Pin marked as read.')).toBeInTheDocument()
})

test('tracks a full-width swipe continuously instead of stopping at the action width', async () => {
  mockMotionPreference = 'full'
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue([{
    id: 'notification:event-wide-swipe',
    kind: 'shadow_pin_post',
    occurredAt: '2026-07-17T12:00:00Z',
    actor: null,
    title: 'A new Pin',
    preview: 'Open the new Pin.',
    unreadCount: 1,
    manuallyUnread: false,
    target: { kind: 'app_route', route: '/?view=pins&pin=pin-1' },
    activityEventIds: [],
    notificationEventIds: ['event-wide-swipe'],
  }])

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)
  const swipeSurface = await screen.findByTestId('notification-swipe-notification:event-wide-swipe')
  fireEvent.pointerDown(swipeSurface, {
    pointerId: 4,
    pointerType: 'touch',
    clientX: 300,
    clientY: 120,
  })
  fireEvent.pointerMove(swipeSurface, {
    pointerId: 4,
    pointerType: 'touch',
    clientX: 250,
    clientY: 121,
  })
  expect(Number(swipeSurface.getAttribute('data-swipe-offset'))).toBeLessThanOrEqual(-50)
  fireEvent.pointerMove(swipeSurface, {
    pointerId: 4,
    pointerType: 'touch',
    clientX: 130,
    clientY: 122,
  })
  expect(Number(swipeSurface.getAttribute('data-swipe-offset'))).toBeLessThanOrEqual(-170)
  expect(screen.getByTestId('notification-row-notification:event-wide-swipe')).toHaveAttribute(
    'data-dismiss-phase',
    'dragging'
  )
})

test('loads source-linked sections and acknowledges only the opened Activity event', async () => {
  fetchSnapshot.mockResolvedValue(snapshot())
  const onOpenSource = jest.fn()
  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={onOpenSource} />)

  expect(await screen.findByRole('heading', { name: 'Needs you' })).toBeInTheDocument()
  expect(screen.getByText('Source-linked / No AI')).toBeInTheDocument()
  expect(screen.getByTestId('catch-up-compact-header')).toHaveClass('border-b')
  expect(screen.getByTestId('catch-up-compact-header')).not.toHaveClass('rounded-[1.75rem]')
  fireEvent.click(screen.getByRole('button', { name: /You were mentioned/i }))

  expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({
    target: { kind: 'chat_message', message_id: 'message-1' },
  }))
  await waitFor(() => expect(acknowledge).toHaveBeenCalledWith(['event-1']))
  expect(screen.getByRole('heading', { name: 'You are caught up' })).toBeInTheDocument()
})

test('renders the actor PFP and opens the canonical profile without opening the source', async () => {
  fetchSnapshot.mockResolvedValue(snapshot())
  fetchProfile.mockResolvedValue({
    id: 'actor-1',
    display_name: 'Mills',
    username: 'mills',
  } as never)
  const onOpenSource = jest.fn()

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={onOpenSource} />)

  const profileButton = await screen.findByRole('button', { name: "Open Mills's profile" })
  expect(screen.getByTestId('catch-up-avatar')).toHaveAttribute('data-src', 'https://example.com/mills-thumb.jpg')

  fireEvent.click(profileButton)

  expect(fetchProfile).toHaveBeenCalledWith('actor-1')
  expect(await screen.findByTestId('public-profile-dialog')).toHaveTextContent('Mills')
  expect(onOpenSource).not.toHaveBeenCalled()
  expect(acknowledge).not.toHaveBeenCalled()
})

test('does not claim the member is caught up when unread sources predate the window', async () => {
  const olderSnapshot = snapshot()
  olderSnapshot.sections.needs_you = {
    ...section('needs_you', 'Needs you'),
    olderUnreadExists: true,
  }
  fetchSnapshot.mockResolvedValue(olderSnapshot)

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)

  expect(await screen.findByRole('heading', { name: 'Older unread sources are waiting' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'You are caught up' })).not.toBeInTheDocument()
})

test('retains a valid cached snapshot when a refresh fails', async () => {
  writeCatchUpCache('user-1', snapshot(), { fetchedAt: Date.now() })
  fetchSnapshot.mockRejectedValue(new Error('Network unavailable'))

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)
  expect(screen.getByRole('heading', { name: 'Needs you' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Refresh Catch-Up' }))
  expect(await screen.findByText('Refresh failed; the last source snapshot is still shown.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /You were mentioned/i })).toBeInTheDocument()
})
