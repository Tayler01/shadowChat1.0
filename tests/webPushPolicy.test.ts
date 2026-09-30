import { resolveWebPushPayload, recoveryNotificationTag } from '../supabase/functions/_shared/web-push-policy'

const fullPayload = {
  title: 'JJ', body: 'Private message text', image: 'https://public.example/preview.jpg',
  badgeCount: null,
  data: { type: 'dm_message', senderId: 'actor-1', conversationId: 'conversation-1',
    messageId: 'message-1', route: '/?view=dms&conversation=conversation-1', unreadCount: null },
}

test.each(['dm_message', 'group_message', 'reaction', 'shadow_pin_post', 'shadow_checkers_turn', 'presence_active'])(
  'private policy strips identity, text and media before provider transmission for %s', type => {
    const result = resolveWebPushPayload({ ...fullPayload, data: { ...fullPayload.data, type } },
      { notification_preview_mode: 'private' }, 'event-1')
    expect(result).toMatchObject({ title: 'New ShadowChat notification', body: 'Open ShadowChat to view it.',
      data: { eventId: 'event-1', messageId: 'message-1', route: fullPayload.data.route } })
    expect(JSON.stringify(result)).not.toContain('Private message text')
    expect(JSON.stringify(result)).not.toContain('actor-1')
    expect(result).not.toHaveProperty('image')
    expect(result).not.toHaveProperty('badgeCount')
    expect(result.data).not.toHaveProperty('unreadCount')
  },
)

test('sender-only keeps the identity title but strips content and media', () => {
  const result = resolveWebPushPayload(fullPayload, { notification_preview_mode: 'sender_only' })
  expect(result).toMatchObject({ title: 'JJ', body: 'Open ShadowChat to view it.' })
  expect(result).not.toHaveProperty('image')
})

test('full preview honors media opt-out and preserves confirmed zero badges', () => {
  const result = resolveWebPushPayload({ ...fullPayload, badgeCount: 0 },
    { notification_preview_mode: 'full', notification_media_enabled: false })
  expect(result).toMatchObject({ title: 'JJ', body: 'Private message text', badgeCount: 0 })
  expect(result).not.toHaveProperty('image')
})

test('unknown preferences fail closed to a generic preview', () => {
  expect(resolveWebPushPayload(fullPayload, null)).toMatchObject({ title: 'New ShadowChat notification' })
})

test('recovered DM and reaction tags retain immediate clearing semantics', () => {
  expect(recoveryNotificationTag({ type: 'dm_message', entityId: 'm', conversationId: 'c' })).toBe('dm:c')
  expect(recoveryNotificationTag({ type: 'reaction', entityId: 'r', messageId: 'm', isDm: true })).toBe('reaction:dm:m')
  expect(recoveryNotificationTag({ type: 'reaction', entityId: 'r', messageId: 'm', isDm: false })).toBe('reaction:group:m')
})
