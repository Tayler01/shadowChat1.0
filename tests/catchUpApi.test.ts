import { supabase } from '../src/lib/supabase'
import {
  acknowledgeAllNotificationInboxEvents,
  acknowledgeCatchUpEvents,
  acknowledgeNotificationInboxEvent,
  fetchCatchUpSnapshot,
  fetchNotificationInbox,
  findUnreadNotificationEventIds,
  flushPendingNotificationReads,
  getPendingNotificationReadEventIds,
  queuePendingNotificationRead,
} from '../src/features/catch-up/catchUpApi'

jest.mock('../src/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

const rpc = supabase.rpc as jest.Mock
const from = supabase.from as jest.Mock

const emptySection = (id: string, title: string) => ({
  id,
  title,
  shown_count: 0,
  total_count: 0,
  has_more: false,
  older_unread_exists: false,
  items: [],
})

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
})

test('fetches the bounded seven-day deterministic snapshot contract', async () => {
  rpc.mockResolvedValue({
    data: {
      schema_version: 1,
      generated_at: '2026-07-14T02:00:00Z',
      effective_since: '2026-07-07T02:00:00Z',
      lookback_hours: 168,
      source_linked: true,
      ai_generated: false,
      sections: {
        needs_you: emptySection('needs_you', 'Needs you'),
        direct_messages: emptySection('direct_messages', 'Direct messages'),
        general_chat: emptySection('general_chat', 'General Chat'),
        shadow_pin: emptySection('shadow_pin', 'ShadowPin'),
      },
    },
    error: null,
  })

  await expect(fetchCatchUpSnapshot()).resolves.toMatchObject({ sourceLinked: true, aiGenerated: false })
  expect(rpc).toHaveBeenCalledWith('get_my_catch_up_v1', {
    section_limit: 6,
    lookback_hours: 168,
  })
})

test('deduplicates and bounds caller-owned Activity acknowledgements', async () => {
  rpc.mockResolvedValue({ data: 2, error: null })
  const ids = Array.from({ length: 55 }, (_, index) => `event-${index}`)
  ids.unshift('event-1')

  await expect(acknowledgeCatchUpEvents(ids)).resolves.toBe(2)
  expect(rpc).toHaveBeenCalledWith('acknowledge_my_catch_up_events', {
    target_event_ids: expect.any(Array),
  })
  const payload = rpc.mock.calls[0][1].target_event_ids as string[]
  expect(payload).toHaveLength(50)
  expect(new Set(payload).size).toBe(50)
})

test('rejects malformed backend snapshots instead of rendering invented content', async () => {
  rpc.mockResolvedValue({ data: { schema_version: 1, ai_generated: true }, error: null })
  await expect(fetchCatchUpSnapshot()).rejects.toThrow('invalid source snapshot')
})

test('hydrates notification actors from the current safe public profile relationship', async () => {
  const limit = jest.fn().mockResolvedValue({
    data: [{
      id: 'event-1',
      type: 'shadow_pin_comment',
      category: 'shadow_pin',
      actor_id: 'actor-1',
      route: '/?view=shadowpin&item=pin-1',
      payload: {
        title: 'New comment',
        body: 'Mills commented on your Pin.',
        image_id: 'pin-1',
        comment_id: 'comment-1',
        actor: {
          id: 'actor-1',
          display_name: 'Old name',
          avatar_thumbnail_url: null,
        },
      },
      created_at: '2026-07-17T12:00:00.000Z',
      actor: {
        id: 'actor-1',
        display_name: 'Mills',
        username: 'mills',
        avatar_url: 'https://example.com/mills-full.jpg',
        avatar_thumbnail_url: 'https://example.com/mills-thumb.jpg',
        color: '#d7aa46',
      },
    }],
    error: null,
    count: 413,
  })
  const order = jest.fn(() => ({ limit }))
  const resolvedIs = jest.fn(() => ({ order }))
  const readIs = jest.fn(() => ({ is: resolvedIs }))
  const select = jest.fn((_query: string, _options: { count: 'exact' }) => ({ is: readIs }))
  from.mockReturnValue({ select })

  await expect(fetchNotificationInbox()).resolves.toEqual({
    items: [
      expect.objectContaining({
        id: 'notification:event-1',
        actor: {
          id: 'actor-1',
          display_name: 'Mills',
          username: 'mills',
          avatar_url: 'https://example.com/mills-full.jpg',
          avatar_thumbnail_url: 'https://example.com/mills-thumb.jpg',
          color: '#d7aa46',
        },
        target: {
          kind: 'app_route',
          route: '/?view=pins&pin=pin-1&panel=comments&comment=comment-1',
        },
      }),
    ],
    totalCount: 413,
  })
  expect(from).toHaveBeenCalledWith('notification_events')
  expect(select.mock.calls[0][0]).toContain(
    'actor:users!notification_events_actor_id_fkey('
  )
  expect(readIs).toHaveBeenCalledWith('read_at', null)
  expect(resolvedIs).toHaveBeenCalledWith('resolved_at', null)
  expect(select.mock.calls[0][1]).toEqual({ count: 'exact' })
})

test('rejects an unconfirmed notification read acknowledgement', async () => {
  rpc.mockResolvedValue({ data: false, error: null })

  await expect(acknowledgeNotificationInboxEvent('event-unconfirmed')).rejects.toThrow(
    'Notification read acknowledgement was not confirmed.'
  )
})

test('confirms a complete caller-owned notification inbox acknowledgement', async () => {
  rpc.mockResolvedValue({ data: 413, error: null })

  await expect(acknowledgeAllNotificationInboxEvents()).resolves.toBe(413)
  expect(rpc).toHaveBeenCalledWith('mark_all_my_notification_events_read')
})

test('checks failed retry ids against their canonical unread state instead of the visible page', async () => {
  const resolvedIs = jest.fn().mockResolvedValue({
    data: [{ id: 'event-page-31' }],
    error: null,
  })
  const readIs = jest.fn(() => ({ is: resolvedIs }))
  const inFilter = jest.fn(() => ({ is: readIs }))
  const select = jest.fn(() => ({ in: inFilter }))
  from.mockReturnValue({ select })

  await expect(findUnreadNotificationEventIds([
    'event-page-31',
    'event-page-31',
    '',
  ])).resolves.toEqual(['event-page-31'])
  expect(inFilter).toHaveBeenCalledWith('id', ['event-page-31'])
  expect(readIs).toHaveBeenCalledWith('read_at', null)
  expect(resolvedIs).toHaveBeenCalledWith('resolved_at', null)
})

test('persists pending notification reads and clears them only after server confirmation', async () => {
  queuePendingNotificationRead('user-1', 'event-pending')
  expect(getPendingNotificationReadEventIds('user-1')).toEqual(['event-pending'])

  rpc.mockResolvedValue({ data: true, error: null })
  await expect(flushPendingNotificationReads('user-1')).resolves.toEqual({
    confirmed: ['event-pending'],
    failed: [],
  })
  expect(getPendingNotificationReadEventIds('user-1')).toEqual([])
  expect(rpc).toHaveBeenCalledWith('mark_my_notification_event_read', {
    target_event_id: 'event-pending',
  })
})

test('retains pending notification reads when the retry cannot be confirmed', async () => {
  queuePendingNotificationRead('user-1', 'event-retry')
  rpc.mockResolvedValue({ data: false, error: null })

  await expect(flushPendingNotificationReads('user-1')).resolves.toEqual({
    confirmed: [],
    failed: ['event-retry'],
  })
  expect(getPendingNotificationReadEventIds('user-1')).toEqual(['event-retry'])
})
