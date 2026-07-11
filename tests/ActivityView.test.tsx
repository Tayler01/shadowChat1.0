import { fireEvent, render, screen } from '@testing-library/react'
import { ActivityView } from '../src/features/activity/ActivityView'
import type { ActivityEvent } from '../src/features/activity/activityModel'

const mockUseActivity = jest.fn()

jest.mock('../src/features/activity/ActivityContext', () => ({
  useActivity: () => mockUseActivity(),
}))

jest.mock('../src/components/ui/Avatar', () => ({
  Avatar: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}))

jest.mock('../src/components/search/GlobalSearchButton', () => ({
  GlobalSearchButton: () => null,
}))

const activityEvent: ActivityEvent = {
  id: 'event-1',
  user_id: 'user-1',
  actor_id: 'actor-1',
  type: 'mention',
  entity_id: 'message-1',
  conversation_id: null,
  message_id: 'message-1',
  dm_message_id: null,
  shadow_pin_image_id: null,
  shadow_pin_comment_id: null,
  body_preview: 'Please take a look',
  metadata: {},
  read_at: null,
  occurred_at: new Date().toISOString(),
  actor: {
    id: 'actor-1',
    display_name: 'Activity Member',
    username: 'activity_member',
    avatar_url: null,
    avatar_thumbnail_url: null,
    color: '#d7aa46',
  },
}

const activityState = (overrides: Record<string, unknown> = {}) => ({
  items: [activityEvent],
  filter: 'all',
  loading: false,
  loadingMore: false,
  error: null,
  unreadCount: 1,
  hasMore: false,
  announcement: '',
  realtimeStatus: 'live',
  setFilter: jest.fn(),
  refresh: jest.fn(),
  loadMore: jest.fn(),
  markRead: jest.fn().mockResolvedValue(true),
  markAllRead: jest.fn().mockResolvedValue(true),
  ...overrides,
})

test('Activity row marks read and opens its typed target', () => {
  const state = activityState()
  const onOpenActivity = jest.fn()
  mockUseActivity.mockReturnValue(state)

  render(<ActivityView currentView="activity" onViewChange={jest.fn()} onOpenActivity={onOpenActivity} />)
  fireEvent.click(screen.getByRole('button', { name: /Activity Member mentioned you, unread/i }))

  expect(state.markRead).toHaveBeenCalledWith('event-1')
  expect(onOpenActivity).toHaveBeenCalledWith({
    view: 'chat',
    conversation: null,
    message: 'message-1',
    pin: null,
    comment: null,
  })
})

test('Unread filter has a distinct, accessible caught-up state', () => {
  mockUseActivity.mockReturnValue(activityState({ items: [], filter: 'unread', unreadCount: 0 }))
  render(<ActivityView currentView="activity" onViewChange={jest.fn()} onOpenActivity={jest.fn()} />)

  expect(screen.getByRole('heading', { name: 'You’re all caught up' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
})
