import {
  buildNotificationPresentation,
  isNotificationPresentationCandidate,
  isNotificationQuietNow,
  isNotificationSourceActive,
  isNotificationTypeEnabled,
  type NotificationEventRecord,
} from '../src/features/notifications/notificationModel'

const makeEvent = (
  overrides: Partial<NotificationEventRecord> = {},
): NotificationEventRecord => ({
  id: 'event-1',
  user_id: 'user-1',
  type: 'dm_message',
  category: 'dm',
  entity_id: 'message-1',
  conversation_id: 'conversation-1',
  message_id: null,
  dm_message_id: 'message-1',
  actor_id: 'actor-1',
  route: null,
  payload: { title: 'JJ', body: 'Hey there' },
  sent_at: null,
  read_at: null,
  presented_at: null,
  resolved_at: null,
  created_at: '2026-07-17T16:00:00.000Z',
  presentation_expires_at: '2026-07-17T16:01:30.000Z',
  ...overrides,
})

describe('notification presentation policy', () => {
  it('only presents unclaimed foreground events from the current visible session', () => {
    const now = Date.parse('2026-07-17T16:00:10.000Z')
    const visibleSince = Date.parse('2026-07-17T15:59:59.000Z')
    expect(isNotificationPresentationCandidate(makeEvent(), visibleSince, now)).toBe(true)
    expect(isNotificationPresentationCandidate(
      makeEvent({ created_at: '2026-07-17T15:59:58.000Z' }),
      visibleSince,
      now,
    )).toBe(false)
    expect(isNotificationPresentationCandidate(
      makeEvent({ sent_at: '2026-07-17T16:00:01.000Z' }),
      visibleSince,
      now,
    )).toBe(true)
    expect(isNotificationPresentationCandidate(
      makeEvent({ presented_at: '2026-07-17T16:00:01.000Z' }),
      visibleSince,
      now,
    )).toBe(false)
  })

  it('applies master, type, snooze, and overnight quiet-hour preferences', () => {
    const event = makeEvent()
    expect(isNotificationTypeEnabled(event, { notifications_enabled: false })).toBe(false)
    expect(isNotificationTypeEnabled(event, { dm_enabled: false })).toBe(false)
    expect(isNotificationTypeEnabled(event, { dm_enabled: true })).toBe(true)
    expect(isNotificationQuietNow({
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      quiet_hours_timezone: 'UTC',
    }, new Date('2026-07-17T23:30:00.000Z'))).toBe(true)
    expect(isNotificationQuietNow({
      mute_until: '2026-07-17T17:00:00.000Z',
    }, new Date('2026-07-17T16:00:00.000Z'))).toBe(true)
  })

  it('builds an exact ShadowPin comment route instead of a generic Pins route', () => {
    const presentation = buildNotificationPresentation(makeEvent({
      type: 'shadow_pin_comment',
      category: 'shadow_pin',
      entity_id: 'comment-1',
      conversation_id: null,
      dm_message_id: null,
      payload: {
        title: 'New comment',
        image_id: 'pin-1',
        comment_id: 'comment-1',
      },
    }))
    const route = new URL(presentation.route, 'https://shadochat.online')
    expect(route.searchParams.get('view')).toBe('pins')
    expect(route.searchParams.get('pin')).toBe('pin-1')
    expect(route.searchParams.get('comment')).toBe('comment-1')
    expect(route.searchParams.get('panel')).toBe('comments')
  })

  it('recognizes the currently open canonical source without requiring query order equality', () => {
    expect(isNotificationSourceActive(
      '/?view=dms&conversation=conversation-1&message=message-2',
      'https://shadochat.online/?conversation=conversation-1&view=dms',
    )).toBe(true)
    expect(isNotificationSourceActive(
      '/?view=chat&thread=thread-1&message=message-2',
      'https://shadochat.online/?message=message-1&view=chat&thread=thread-1',
    )).toBe(true)
    expect(isNotificationSourceActive(
      '/?view=pins&pin=pin-1&comment=comment-2&panel=comments',
      'https://shadochat.online/?view=pins&pin=pin-1&comment=comment-3&panel=comments',
    )).toBe(false)
  })

  it('normalizes Shado Live through the canonical preference and exact room route', () => {
    const event = makeEvent({
      type: 'shado_live_room_started',
      category: 'live',
      entity_id: 'source-notification-1',
      conversation_id: null,
      dm_message_id: null,
      route: null,
      payload: {
        actor: { display_name: 'Tayler Kid' },
        room_id: 'room-1',
      },
    })
    const presentation = buildNotificationPresentation(event)
    expect(presentation.title).toBe('Tayler Kid is live now')
    expect(isNotificationTypeEnabled(event, { shado_live_in_app_enabled: false })).toBe(false)
    expect(isNotificationTypeEnabled(event, { shado_live_in_app_enabled: true })).toBe(true)

    const route = new URL(presentation.route, 'https://shadochat.online')
    expect(route.searchParams.get('experience')).toBe('shado-live')
    expect(route.searchParams.get('item')).toBe('room-1')
    expect(isNotificationSourceActive(
      presentation.route,
      'https://shadochat.online/?view=games&experience=shado-live&item=room-1',
    )).toBe(true)
  })
})
