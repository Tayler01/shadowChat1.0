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

test('uses a v2 envelope as the Catch-Up presentation authority while preserving the exact event id', async () => {
  const eventLimit = jest.fn().mockResolvedValue({
    data: [{
      id: 'event-v2',
      type: 'shadow_pin_comment',
      category: 'shadow_pin',
      actor_id: 'raw-actor',
      route: '/?view=pins&pin=raw-pin',
      payload: {
        title: 'Raw title',
        body: 'Raw private content',
        image_id: 'raw-pin',
      },
      created_at: '2026-07-18T12:00:00.000Z',
      actor: {
        id: 'raw-actor',
        display_name: 'Raw actor',
      },
    }],
    error: null,
    count: 1,
  })
  const eventOrder = jest.fn(() => ({ limit: eventLimit }))
  const eventResolvedIs = jest.fn(() => ({ order: eventOrder }))
  const eventReadIs = jest.fn(() => ({ is: eventResolvedIs }))
  const eventSelect = jest.fn(() => ({ is: eventReadIs }))

  const envelopeIn = jest.fn().mockResolvedValue({
    data: [{
      event_id: 'event-v2',
      schema_version: 2,
      category_key: 'shadow_pin',
      title: 'Envelope title',
      body: 'Envelope body',
      private_title: 'Private notification',
      private_body: 'Open ShadowChat to view it.',
      actor_id: 'actor-v2',
      route: '/?view=pins&pin=pin-v2&panel=comments&comment=comment-v2',
      privacy_level: 'full',
      media_ref: { kind: 'shadow_pin', image_id: 'pin-v2' },
      actor: {
        id: 'stale-embedded-id',
        display_name: 'JJ',
        username: 'jj',
        avatar_url: 'https://shadochat.online/jj.jpg',
        avatar_thumbnail_url: null,
        color: '#d7aa46',
      },
    }],
    error: null,
  })
  const envelopeSelect = jest.fn(() => ({ in: envelopeIn }))

  const mediaIs = jest.fn().mockResolvedValue({
    data: [{
      id: 'pin-v2',
      title: 'Pin preview',
      thumbnail_url: 'https://media.b-cdn.net/pin-v2.jpg',
      medium_url: null,
      image_url: null,
      image_content_type: 'image/jpeg',
    }],
    error: null,
  })
  const mediaIn = jest.fn(() => ({ is: mediaIs }))
  const mediaSelect = jest.fn(() => ({ in: mediaIn }))

  from.mockImplementation((table: string) => {
    if (table === 'notification_events') return { select: eventSelect }
    if (table === 'notification_envelopes_v2') return { select: envelopeSelect }
    if (table === 'shadow_pin_images') return { select: mediaSelect }
    throw new Error(`Unexpected table ${table}`)
  })

  await expect(fetchNotificationInbox()).resolves.toEqual({
    items: [expect.objectContaining({
      id: 'notification:event-v2',
      actor: expect.objectContaining({
        id: 'actor-v2',
        display_name: 'JJ',
      }),
      title: 'Envelope title',
      preview: 'Envelope body',
      target: {
        kind: 'app_route',
        route: '/?view=pins&pin=pin-v2&panel=comments&comment=comment-v2',
      },
      notificationEventIds: ['event-v2'],
      notificationPresentation: {
        schemaVersion: 2,
        category: 'shadow_pin',
        privacy: 'full',
        media: {
          kind: 'image',
          thumbnailUrl: 'https://media.b-cdn.net/pin-v2.jpg',
          alt: 'Pin preview',
        },
      },
    })],
    totalCount: 1,
  })
  expect(envelopeIn).toHaveBeenCalledWith('event_id', ['event-v2'])
  expect(mediaIn).toHaveBeenCalledWith('id', ['pin-v2'])
})

test('applies private envelope copy without leaking the raw actor, body, or media', async () => {
  const eventLimit = jest.fn().mockResolvedValue({
    data: [{
      id: 'event-private',
      type: 'dm_message',
      category: 'dm',
      actor_id: 'raw-actor',
      route: '/?view=dms&conversation=raw',
      payload: { title: 'Raw sender', body: 'Secret raw message' },
      created_at: '2026-07-18T12:00:00.000Z',
      actor: { id: 'raw-actor', display_name: 'Raw sender' },
    }],
    error: null,
    count: 1,
  })
  const eventSelect = jest.fn(() => ({
    is: jest.fn(() => ({
      is: jest.fn(() => ({
        order: jest.fn(() => ({ limit: eventLimit })),
      })),
    })),
  }))
  const envelopeIn = jest.fn().mockResolvedValue({
    data: [{
      event_id: 'event-private',
      schema_version: 2,
      category_key: 'dm',
      title: 'JJ',
      body: 'Secret envelope message',
      private_title: 'New ShadowChat notification',
      private_body: 'Open ShadowChat to view it.',
      actor_id: 'actor-private',
      route: '/?view=dms&conversation=dm-v2',
      privacy_level: 'private',
      media_ref: { kind: 'shadow_pin', image_id: 'pin-secret' },
      actor: { id: 'actor-private', display_name: 'JJ' },
    }],
    error: null,
  })
  const envelopeSelect = jest.fn(() => ({ in: envelopeIn }))
  const mediaIs = jest.fn().mockResolvedValue({ data: [], error: null })
  const mediaSelect = jest.fn(() => ({
    in: jest.fn(() => ({ is: mediaIs })),
  }))
  from.mockImplementation((table: string) => {
    if (table === 'notification_events') return { select: eventSelect }
    if (table === 'notification_envelopes_v2') return { select: envelopeSelect }
    if (table === 'shadow_pin_images') return { select: mediaSelect }
    throw new Error(`Unexpected table ${table}`)
  })

  const page = await fetchNotificationInbox()
  expect(page.items[0]).toMatchObject({
    actor: null,
    title: 'New ShadowChat notification',
    preview: 'Open ShadowChat to view it.',
    target: { kind: 'app_route', route: '/?view=dms&conversation=dm-v2' },
    notificationEventIds: ['event-private'],
    notificationPresentation: {
      category: 'dm',
      privacy: 'private',
      media: null,
    },
  })
  expect(JSON.stringify(page)).not.toContain('Secret raw message')
  expect(JSON.stringify(page)).not.toContain('Secret envelope message')
  expect(JSON.stringify(page)).not.toContain('Raw sender')
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
