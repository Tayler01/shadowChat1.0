import {
  buildCatchUpTargetUrl,
  clearCatchUpCache,
  normalizeCatchUpSnapshot,
  readCatchUpCache,
  writeCatchUpCache,
} from '../src/features/catch-up/catchUpModel'

const emptySection = (id: string, title: string) => ({
  id,
  title,
  shown_count: 0,
  total_count: 0,
  has_more: false,
  older_unread_exists: false,
  items: [],
})

const validSnapshot = () => ({
  schema_version: 1,
  generated_at: '2026-07-14T02:00:00.000Z',
  effective_since: '2026-07-07T02:00:00.000Z',
  lookback_hours: 168,
  source_linked: true,
  ai_generated: false,
  sections: {
    needs_you: {
      ...emptySection('needs_you', 'Needs you'),
      shown_count: 1,
      total_count: 1,
      items: [{
        id: 'activity:event-1',
        kind: 'mention',
        occurred_at: '2026-07-14T01:30:00.000Z',
        actor: {
          id: 'actor-1',
          display_name: 'Shadow Member',
          username: 'shadow_member',
          avatar_url: null,
          avatar_thumbnail_url: null,
          color: '#d7aa46',
        },
        title: 'You were mentioned',
        preview: 'Open the original message.',
        unread_count: 1,
        target: { kind: 'chat_message', message_id: 'message-1' },
        activity_event_ids: ['event-1'],
      }],
    },
    direct_messages: emptySection('direct_messages', 'Direct messages'),
    general_chat: emptySection('general_chat', 'General Chat'),
    shadow_pin: emptySection('shadow_pin', 'ShadowPin'),
  },
})

beforeEach(() => clearCatchUpCache())

test('accepts only a deterministic source-linked v1 snapshot', () => {
  const normalized = normalizeCatchUpSnapshot(validSnapshot())
  expect(normalized).toMatchObject({
    schemaVersion: 1,
    lookbackHours: 168,
    sourceLinked: true,
    aiGenerated: false,
  })
  expect(normalized?.sections.needs_you.items[0]).toMatchObject({
    occurredAt: '2026-07-14T01:30:00.000Z',
    target: { kind: 'chat_message', message_id: 'message-1' },
    activityEventIds: ['event-1'],
  })

  expect(normalizeCatchUpSnapshot({ ...validSnapshot(), ai_generated: true })).toBeNull()
  expect(normalizeCatchUpSnapshot({ ...validSnapshot(), source_linked: false })).toBeNull()
  expect(normalizeCatchUpSnapshot({ ...validSnapshot(), schema_version: 2 })).toBeNull()

  const malformed = validSnapshot()
  malformed.sections.needs_you.shown_count = 2
  expect(normalizeCatchUpSnapshot(malformed)).toBeNull()
})

test.each([
  [{ kind: 'connections' as const }, '?view=dms&panel=connections'],
  [{ kind: 'chat_message' as const, message_id: 'message-1' }, '?view=chat&message=message-1'],
  [{ kind: 'dm_message' as const, conversation_id: 'conversation-1', message_id: 'message-2' }, '?view=dms&conversation=conversation-1&message=message-2'],
  [{ kind: 'pin' as const, pin_id: 'pin-1' }, '?view=pins&pin=pin-1'],
  [{ kind: 'pin_comment' as const, pin_id: 'pin-1', comment_id: 'comment-1' }, '?view=pins&pin=pin-1&panel=comments&comment=comment-1'],
  [{ kind: 'app_route' as const, route: '/?view=games&experience=shadow-checkers&item=match-1' }, '?view=games&experience=shadow-checkers&item=match-1'],
])('builds the exact typed source URL for %o', (target, expectedSearch) => {
  const url = buildCatchUpTargetUrl(target, 'https://shadowchat.example/?view=catchup&stale=value')
  expect(url.origin).toBe('https://shadowchat.example')
  expect(url.search).toBe(expectedSearch)
})

test('does not let a notification source route leave the current origin', () => {
  const url = buildCatchUpTargetUrl(
    { kind: 'app_route', route: '//malicious.example/steal' },
    'https://shadowchat.example/?view=catchup',
  )
  expect(url.href).toBe('https://shadowchat.example/')
})

test('keeps the latest snapshot and scroll position for Back navigation', () => {
  const snapshot = normalizeCatchUpSnapshot(validSnapshot())
  expect(snapshot).not.toBeNull()
  writeCatchUpCache('user-1', snapshot, { scrollTop: 324, fetchedAt: 12 })
  expect(readCatchUpCache('user-1')).toEqual({
    ownerId: 'user-1',
    snapshot,
    scrollTop: 324,
    fetchedAt: 12,
    focusItemId: null,
  })
})

test('never exposes one account snapshot through another account cache read', () => {
  const snapshot = normalizeCatchUpSnapshot(validSnapshot())
  writeCatchUpCache('user-1', snapshot, { scrollTop: 99, fetchedAt: 12 })
  expect(readCatchUpCache('user-2')).toEqual({
    ownerId: 'user-2',
    snapshot: null,
    scrollTop: 0,
    fetchedAt: 0,
    focusItemId: null,
  })
})
