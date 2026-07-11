import {
  formatActivityBadge,
  getActivityGroup,
  getActivityTarget,
  normalizeActivityEvent,
  sortAndDedupeActivity,
  type ActivityEvent,
} from '../src/features/activity/activityModel'

const event = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
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
  body_preview: 'Hello',
  metadata: {},
  read_at: null,
  occurred_at: '2026-07-11T12:00:00.000Z',
  actor: null,
  ...overrides,
})

describe('Activity model', () => {
  test('normalizes only typed rows and minimal actor fields', () => {
    expect(normalizeActivityEvent({
      ...event(),
      actor: [{
        id: 'actor-1',
        display_name: 'Member',
        username: 'member',
        avatar_url: 'avatar.jpg',
        avatar_thumbnail_url: 'thumb.jpg',
        color: '#d7aa46',
        email: 'must-not-leak@example.test',
      }],
    })?.actor).toEqual({
      id: 'actor-1',
      display_name: 'Member',
      username: 'member',
      avatar_url: 'avatar.jpg',
      avatar_thumbnail_url: 'thumb.jpg',
      color: '#d7aa46',
    })
    expect(normalizeActivityEvent({ ...event(), type: 'arbitrary_url_event' })).toBeNull()
  })

  test('derives only typed app destinations', () => {
    expect(getActivityTarget(event())).toEqual({
      view: 'chat',
      conversation: null,
      message: 'message-1',
      pin: null,
      comment: null,
    })
    expect(getActivityTarget(event({
      type: 'dm_message',
      conversation_id: 'conversation-1',
      message_id: null,
      dm_message_id: 'dm-1',
    }))).toEqual({
      view: 'dms',
      conversation: 'conversation-1',
      message: 'dm-1',
      pin: null,
      comment: null,
    })
    expect(getActivityTarget(event({
      type: 'shadow_pin_reply',
      message_id: null,
      shadow_pin_image_id: 'pin-1',
      shadow_pin_comment_id: 'comment-1',
    }))).toEqual({
      view: 'pins',
      conversation: null,
      message: null,
      pin: 'pin-1',
      comment: 'comment-1',
    })
    expect(getActivityTarget(event({ message_id: null }))).toBeNull()
  })

  test('deduplicates and keeps stable newest-first ordering', () => {
    const older = event({ id: 'a', occurred_at: '2026-07-11T10:00:00.000Z' })
    const newer = event({ id: 'b', occurred_at: '2026-07-11T11:00:00.000Z' })
    expect(sortAndDedupeActivity([older, newer, newer]).map(item => item.id)).toEqual(['b', 'a'])
  })

  test('groups local calendar days and caps badges', () => {
    const now = new Date(2026, 6, 11, 12)
    expect(getActivityGroup(new Date(2026, 6, 11, 8).toISOString(), now)).toBe('Today')
    expect(getActivityGroup(new Date(2026, 6, 10, 8).toISOString(), now)).toBe('Yesterday')
    expect(getActivityGroup(new Date(2026, 6, 9, 8).toISOString(), now)).toBe('Earlier')
    expect(formatActivityBadge(140)).toBe('99+')
  })
})
