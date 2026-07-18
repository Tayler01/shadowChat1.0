import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CatchUpView } from '../src/features/catch-up/CatchUpView'
import {
  clearCatchUpCache,
  writeCatchUpCache,
  type CatchUpItem,
  type CatchUpSnapshot,
} from '../src/features/catch-up/catchUpModel'
import {
  acknowledgeAllNotificationInboxEvents,
  acknowledgeCatchUpEvents,
  acknowledgeNotificationInboxEvent,
  clearPendingNotificationRead,
  fetchCatchUpSnapshot,
  fetchNotificationInbox,
  findUnreadNotificationEventIds,
  flushPendingNotificationReads,
  queuePendingNotificationRead,
} from '../src/features/catch-up/catchUpApi'
import { clearAllNotificationsFromSystemTray } from '../src/features/notifications/notificationApi'
import { getUserProfile } from '../src/lib/auth'

let mockMotionPreference: 'full' | 'reduced' | 'none' = 'none'

jest.mock('../src/features/catch-up/catchUpApi', () => ({
  acknowledgeAllNotificationInboxEvents: jest.fn(),
  acknowledgeCatchUpEvents: jest.fn(),
  acknowledgeNotificationInboxEvent: jest.fn(),
  clearPendingNotificationRead: jest.fn(),
  fetchCatchUpSnapshot: jest.fn(),
  fetchNotificationInbox: jest.fn(),
  findUnreadNotificationEventIds: jest.fn(),
  flushPendingNotificationReads: jest.fn(),
  queuePendingNotificationRead: jest.fn(),
}))

jest.mock('../src/features/notifications/notificationApi', () => ({
  clearAllNotificationsFromSystemTray: jest.fn(),
  clearNotificationEventFromSystemTray: jest.fn(),
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
const acknowledgeAllNotifications = acknowledgeAllNotificationInboxEvents as jest.MockedFunction<typeof acknowledgeAllNotificationInboxEvents>
const acknowledge = acknowledgeCatchUpEvents as jest.MockedFunction<typeof acknowledgeCatchUpEvents>
const acknowledgeNotification = acknowledgeNotificationInboxEvent as jest.MockedFunction<typeof acknowledgeNotificationInboxEvent>
const clearPendingRead = clearPendingNotificationRead as jest.MockedFunction<typeof clearPendingNotificationRead>
const fetchInbox = fetchNotificationInbox as jest.MockedFunction<typeof fetchNotificationInbox>
const findUnreadNotificationIds = findUnreadNotificationEventIds as jest.MockedFunction<typeof findUnreadNotificationEventIds>
const flushPendingReads = flushPendingNotificationReads as jest.MockedFunction<typeof flushPendingNotificationReads>
const queuePendingRead = queuePendingNotificationRead as jest.MockedFunction<typeof queuePendingNotificationRead>
const clearSystemTray = clearAllNotificationsFromSystemTray as jest.MockedFunction<typeof clearAllNotificationsFromSystemTray>
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

const notificationItem = (
  eventId: string,
  overrides: Partial<CatchUpItem> = {}
): CatchUpItem => ({
  id: `notification:${eventId}`,
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
  notificationEventIds: [eventId],
  ...overrides,
})

const inboxPage = (items: CatchUpItem[], totalCount = items.length) => ({
  items,
  totalCount,
})

const swipeLeft = (
  surface: HTMLElement,
  touchId = 1,
  from = { x: 240, y: 120 },
  to = { x: 140, y: 122 }
) => {
  dispatchTouch(surface, 'touchstart', [touchPoint(surface, touchId, from.x, from.y)])
  dispatchTouch(surface, 'touchmove', [touchPoint(surface, touchId, to.x, to.y)])
  dispatchTouch(surface, 'touchend', [], [touchPoint(surface, touchId, to.x, to.y)])
}

type TestTouch = {
  identifier: number
  target: EventTarget
  clientX: number
  clientY: number
  pageX: number
  pageY: number
  screenX: number
  screenY: number
}

const touchPoint = (
  target: EventTarget,
  identifier: number,
  clientX: number,
  clientY: number
): TestTouch => ({
  identifier,
  target,
  clientX,
  clientY,
  pageX: clientX,
  pageY: clientY,
  screenX: clientX,
  screenY: clientY,
})

const dispatchTouch = (
  target: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: TestTouch[],
  changedTouches: TestTouch[] = touches
) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    touches: { value: touches },
    targetTouches: { value: touches },
    changedTouches: { value: changedTouches },
  })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

beforeEach(() => {
  jest.clearAllMocks()
  clearCatchUpCache()
  acknowledge.mockResolvedValue(1)
  acknowledgeAllNotifications.mockResolvedValue(0)
  acknowledgeNotification.mockResolvedValue(true)
  flushPendingReads.mockResolvedValue({ confirmed: [], failed: [] })
  findUnreadNotificationIds.mockResolvedValue([])
  fetchInbox.mockResolvedValue(inboxPage([]))
  clearSystemTray.mockResolvedValue(undefined)
  fetchProfile.mockResolvedValue(null)
  mockMotionPreference = 'none'
})

test('shows canonical unread notifications and clears the exact event after opening its source', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([{
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
  }], 413))
  const onOpenSource = jest.fn()

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={onOpenSource} />)

  expect(await screen.findByRole('heading', { name: 'Notification inbox' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Your turn in Shadow Checkers' }))

  await waitFor(() => expect(acknowledgeNotification).toHaveBeenCalledWith('event-9'))
  expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({
    target: { kind: 'app_route', route: '/?view=games&experience=shadow-checkers&item=match-1' },
  }))
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'Notification inbox' })).not.toBeInTheDocument()
  })
})

test('shows the canonical unread total and marks the complete backlog read', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([notificationItem('event-visible')], 413))
  acknowledgeAllNotifications.mockResolvedValue(413)
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)

  expect(await screen.findByText('Showing 1 of 413 unread notifications. Open or swipe one to clear it permanently.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Mark all 413 notifications as read' }))

  await waitFor(() => expect(acknowledgeAllNotifications).toHaveBeenCalledTimes(1))
  expect(clearSystemTray).toHaveBeenCalledTimes(1)
  expect(await screen.findByText('413 notifications marked as read.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Notification inbox' })).not.toBeInTheDocument()
  confirm.mockRestore()
})

test('swipes a notification left to mark it read without opening its source', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([{
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
  }]))
  const onOpenSource = jest.fn()

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={onOpenSource} />)

  expect(await screen.findByRole('button', { name: "Open Mills's profile" })).toBeInTheDocument()
  expect(screen.getByTestId('catch-up-avatar')).toHaveAttribute(
    'data-src',
    'https://example.com/mills-thumb.jpg'
  )
  const swipeSurface = screen.getByTestId('notification-swipe-notification:event-10')
  swipeLeft(swipeSurface, 1, { x: 240, y: 120 }, { x: 150, y: 122 })

  await waitFor(() => expect(acknowledgeNotification).toHaveBeenCalledWith('event-10'))
  expect(onOpenSource).not.toHaveBeenCalled()
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'Notification inbox' })).not.toBeInTheDocument()
  })
  expect(screen.getByText('New comment on your Pin marked as read.')).toBeInTheDocument()
})

test('keeps a swiped notification visible until the server confirms it as read', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([notificationItem('event-confirmation')]))
  let confirmRead: ((value: boolean) => void) | undefined
  acknowledgeNotification.mockReturnValue(new Promise<boolean>(resolve => {
    confirmRead = resolve
  }))

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)
  const swipeSurface = await screen.findByTestId('notification-swipe-notification:event-confirmation')

  swipeLeft(swipeSurface)

  expect(queuePendingRead).toHaveBeenCalledWith('user-1', 'event-confirmation')
  expect(screen.getByTestId('notification-row-notification:event-confirmation')).toBeInTheDocument()
  expect(screen.getByText('Marking New comment on your Pin as read.')).toBeInTheDocument()

  await act(async () => {
    confirmRead?.(true)
    await Promise.resolve()
  })

  await waitFor(() => {
    expect(screen.queryByTestId('notification-row-notification:event-confirmation')).not.toBeInTheDocument()
  })
  expect(clearPendingRead).toHaveBeenCalledWith('user-1', 'event-confirmation')
})

test('restores a swiped notification when the server acknowledgement fails', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([notificationItem('event-failed')]))
  acknowledgeNotification.mockRejectedValue(new Error('Network unavailable'))

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)
  const swipeSurface = await screen.findByTestId('notification-swipe-notification:event-failed')

  swipeLeft(swipeSurface)

  await waitFor(() => {
    expect(screen.getByTestId('notification-row-notification:event-failed')).toHaveAttribute(
      'data-dismiss-phase',
      'idle'
    )
  })
  expect(screen.getByText(/stayed in your inbox and will retry automatically/i)).toBeInTheDocument()
  expect(queuePendingRead).toHaveBeenCalledWith('user-1', 'event-failed')
  expect(clearPendingRead).not.toHaveBeenCalled()
})

test('drops a stale retry entry when the notification is no longer unread', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([]))
  flushPendingReads.mockResolvedValue({ confirmed: [], failed: ['event-already-gone'] })
  findUnreadNotificationIds.mockResolvedValue([])

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)

  await waitFor(() => {
    expect(clearPendingRead).toHaveBeenCalledWith('user-1', 'event-already-gone')
  })
  expect(findUnreadNotificationIds).toHaveBeenCalledWith(['event-already-gone'])
  expect(screen.queryByText(/previously dismissed notification is still syncing/i)).not.toBeInTheDocument()
})

test('keeps a failed retry queued when it is unread outside the visible 30-card page', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([], 413))
  flushPendingReads.mockResolvedValue({ confirmed: [], failed: ['event-page-31'] })
  findUnreadNotificationIds.mockResolvedValue(['event-page-31'])

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)

  await waitFor(() => {
    expect(findUnreadNotificationIds).toHaveBeenCalledWith(['event-page-31'])
  })
  expect(clearPendingRead).not.toHaveBeenCalledWith('user-1', 'event-page-31')
})

test('locks vertical scrolling only after a left swipe is claimed', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([notificationItem('event-scroll-lock')]))

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)
  const swipeSurface = await screen.findByTestId('notification-swipe-notification:event-scroll-lock')
  const scroller = screen.getByRole('region', { name: 'Catch-Up content' })

  const start17 = touchPoint(swipeSurface, 17, 240, 120)
  dispatchTouch(swipeSurface, 'touchstart', [start17])
  const ambiguousMove = dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 17, 236, 127)]
  )

  expect(ambiguousMove.defaultPrevented).toBe(false)
  expect(swipeSurface).toHaveAttribute('data-swipe-offset', '0')
  expect(scroller).toHaveAttribute('data-horizontal-swipe-locked', 'false')

  const claimedMove = dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 17, 222, 134)]
  )
  expect(claimedMove.defaultPrevented).toBe(true)
  expect(scroller).toHaveAttribute('data-horizontal-swipe-locked', 'true')
  expect(swipeSurface).toHaveAttribute('data-swipe-offset', '-18')

  const driftMove = dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 17, 180, 173)]
  )
  expect(driftMove.defaultPrevented).toBe(true)
  expect(scroller).toHaveAttribute('data-horizontal-swipe-locked', 'true')
  expect(swipeSurface).toHaveAttribute('data-swipe-offset', '-60')

  dispatchTouch(
    swipeSurface,
    'touchcancel',
    [],
    [touchPoint(swipeSurface, 17, 180, 173)]
  )
  expect(scroller).toHaveAttribute('data-horizontal-swipe-locked', 'false')
  const releasedMove = new Event('touchmove', { bubbles: true, cancelable: true })
  scroller.dispatchEvent(releasedMove)
  expect(releasedMove.defaultPrevented).toBe(false)

  dispatchTouch(
    swipeSurface,
    'touchstart',
    [touchPoint(swipeSurface, 18, 240, 120)]
  )
  const verticalPending = dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 18, 236, 130)]
  )
  expect(verticalPending.defaultPrevented).toBe(false)
  expect(scroller).toHaveAttribute('data-horizontal-swipe-locked', 'false')
  const verticalRelease = dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 18, 234, 144)]
  )
  expect(verticalRelease.defaultPrevented).toBe(false)
  expect(scroller).toHaveAttribute('data-horizontal-swipe-locked', 'false')
  expect(swipeSurface).toHaveAttribute('data-swipe-offset', '0')

  const lateHorizontalMove = dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 18, 160, 148)]
  )
  expect(lateHorizontalMove.defaultPrevented).toBe(false)
  expect(scroller).toHaveAttribute('data-horizontal-swipe-locked', 'false')
  expect(swipeSurface).toHaveAttribute('data-swipe-offset', '0')
  dispatchTouch(
    swipeSurface,
    'touchend',
    [],
    [touchPoint(swipeSurface, 18, 160, 148)]
  )
})

test('uses native touch once and ignores compatibility touch pointer events', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([notificationItem('event-native-touch')]))

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)
  const swipeSurface = await screen.findByTestId('notification-swipe-notification:event-native-touch')

  dispatchTouch(
    swipeSurface,
    'touchstart',
    [touchPoint(swipeSurface, 31, 240, 120)]
  )
  fireEvent.pointerDown(swipeSurface, {
    pointerId: 31,
    pointerType: 'touch',
    clientX: 240,
    clientY: 120,
  })
  fireEvent.pointerMove(swipeSurface, {
    pointerId: 31,
    pointerType: 'touch',
    clientX: 140,
    clientY: 122,
  })
  expect(swipeSurface).toHaveAttribute('data-swipe-offset', '0')

  const nativeMove = dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 31, 140, 122)]
  )
  expect(nativeMove.defaultPrevented).toBe(true)
  expect(swipeSurface).toHaveAttribute('data-swipe-offset', '-100')

  fireEvent.pointerUp(swipeSurface, {
    pointerId: 31,
    pointerType: 'touch',
    clientX: 140,
    clientY: 122,
  })
  dispatchTouch(
    swipeSurface,
    'touchend',
    [],
    [touchPoint(swipeSurface, 31, 140, 122)]
  )

  await waitFor(() => expect(acknowledgeNotification).toHaveBeenCalledTimes(1))
  expect(acknowledgeNotification).toHaveBeenCalledWith('event-native-touch')
})

test('abandons a claimed swipe for multi-touch without blocking pinch zoom', async () => {
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([notificationItem('event-multitouch')]))

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)
  const swipeSurface = await screen.findByTestId('notification-swipe-notification:event-multitouch')
  const scroller = screen.getByRole('region', { name: 'Catch-Up content' })

  const firstTouch = touchPoint(swipeSurface, 41, 240, 120)
  dispatchTouch(swipeSurface, 'touchstart', [firstTouch])
  const claimedMove = dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 41, 200, 122)]
  )
  expect(claimedMove.defaultPrevented).toBe(true)
  expect(scroller).toHaveAttribute('data-horizontal-swipe-locked', 'true')

  const secondTouch = touchPoint(swipeSurface, 42, 280, 160)
  const secondStart = dispatchTouch(
    swipeSurface,
    'touchstart',
    [touchPoint(swipeSurface, 41, 200, 122), secondTouch],
    [secondTouch]
  )
  expect(secondStart.defaultPrevented).toBe(false)
  expect(scroller).toHaveAttribute('data-horizontal-swipe-locked', 'false')
  expect(swipeSurface).toHaveAttribute('data-swipe-offset', '0')

  const pinchMove = dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 41, 190, 112), touchPoint(swipeSurface, 42, 292, 172)]
  )
  expect(pinchMove.defaultPrevented).toBe(false)
  expect(acknowledgeNotification).not.toHaveBeenCalled()
})

test('uses the full shatter-to-ash effect for full motion preference', async () => {
  mockMotionPreference = 'full'
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([notificationItem('event-shatter')]))
  let confirmRead: ((value: boolean) => void) | undefined
  acknowledgeNotification.mockReturnValue(new Promise<boolean>(resolve => {
    confirmRead = resolve
  }))

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)
  const swipeSurface = await screen.findByTestId('notification-swipe-notification:event-shatter')

  swipeLeft(swipeSurface)

  expect(screen.queryByTestId('notification-disintegration-notification:event-shatter')).not.toBeInTheDocument()
  await act(async () => {
    confirmRead?.(true)
    await Promise.resolve()
  })

  const effect = await screen.findByTestId('notification-disintegration-notification:event-shatter')
  expect(swipeSurface).toHaveAttribute('data-card-disintegration', 'active')
  expect(effect.querySelectorAll('[data-disintegration-fragment]')).toHaveLength(28)
  expect(effect.querySelectorAll('[data-disintegration-wave]')).toHaveLength(28)
  expect(new Set(
    Array.from(effect.querySelectorAll('[data-disintegration-wave]'))
      .map(fragment => fragment.getAttribute('data-disintegration-wave'))
  ).size).toBeGreaterThanOrEqual(4)
  expect(effect.querySelector('[data-disintegration-fracture-band]')).toBeInTheDocument()
})

test('tracks a full-width swipe continuously instead of stopping at the action width', async () => {
  mockMotionPreference = 'full'
  const emptySnapshot = snapshot()
  emptySnapshot.sections.needs_you = section('needs_you', 'Needs you')
  fetchSnapshot.mockResolvedValue(emptySnapshot)
  fetchInbox.mockResolvedValue(inboxPage([{
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
  }]))

  render(<CatchUpView currentView="catchup" onViewChange={jest.fn()} onOpenSource={jest.fn()} />)
  const swipeSurface = await screen.findByTestId('notification-swipe-notification:event-wide-swipe')
  dispatchTouch(
    swipeSurface,
    'touchstart',
    [touchPoint(swipeSurface, 4, 300, 120)]
  )
  dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 4, 250, 121)]
  )
  expect(Number(swipeSurface.getAttribute('data-swipe-offset'))).toBeLessThanOrEqual(-50)
  dispatchTouch(
    swipeSurface,
    'touchmove',
    [touchPoint(swipeSurface, 4, 130, 122)]
  )
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
