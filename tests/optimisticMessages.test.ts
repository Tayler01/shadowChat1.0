import {
  mergeRealtimeMessageUpdate,
  upsertMessageIntoState,
} from '../src/lib/optimisticMessages'

type TestMessage = {
  id: string
  client_message_id?: string | null
  content: string
  created_at: string
  updated_at: string
  reactions: Record<string, { count: number; users: string[] }>
  hype_count?: number
  hype_users?: Array<{ user_id: string; display_name: string }>
  user?: { id: string; username: string }
  optimistic?: boolean
  delivery_status?: 'sending' | 'sent' | 'failed'
}

const baseMessage = (): TestMessage => ({
  id: 'm1',
  content: 'hello',
  created_at: '2026-05-14T12:00:00.000Z',
  updated_at: '2026-05-14T12:00:00.000Z',
  reactions: {},
  user: { id: 'u1', username: 'tay' },
  optimistic: true,
  delivery_status: 'sending',
})

test('mergeRealtimeMessageUpdate preserves joined user data while applying fresh payloads', () => {
  const existing = baseMessage()
  const merged = mergeRealtimeMessageUpdate(
    existing,
    {
      id: 'm1',
      content: 'edited',
      updated_at: '2026-05-14T12:01:00.000Z',
      reactions: { heart: { count: 1, users: ['u2'] } },
    },
    { user: existing.user }
  )

  expect(merged).toMatchObject({
    id: 'm1',
    content: 'edited',
    reactions: { heart: { count: 1, users: ['u2'] } },
    user: existing.user,
    optimistic: false,
    delivery_status: 'sent',
  })
})

test('mergeRealtimeMessageUpdate ignores stale payloads', () => {
  const existing = baseMessage()
  const merged = mergeRealtimeMessageUpdate(existing, {
    id: 'm1',
    content: 'stale',
    updated_at: '2026-05-14T11:59:00.000Z',
  })

  expect(merged).toBeNull()
})

test('mergeRealtimeMessageUpdate applies realtime Hype summary fields', () => {
  const existing = baseMessage()
  const merged = mergeRealtimeMessageUpdate(
    existing,
    {
      id: 'm1',
      updated_at: '2026-05-14T12:01:00.000Z',
      hype_count: 5,
      hype_users: [
        { user_id: 'u2', display_name: 'Maya' },
      ],
    },
    { user: existing.user }
  )

  expect(merged).toMatchObject({
    id: 'm1',
    hype_count: 5,
    hype_users: [{ user_id: 'u2', display_name: 'Maya' }],
    user: existing.user,
  })
})

test('upsertMessageIntoState still reconciles optimistic messages by client id', () => {
  const messages = [
    {
      ...baseMessage(),
      id: 'client-1',
      client_message_id: 'client-1',
    },
  ]

  const next = upsertMessageIntoState(messages, {
    ...baseMessage(),
    id: 'server-1',
    client_message_id: 'client-1',
    optimistic: false,
    delivery_status: 'sent',
  })

  expect(next).toHaveLength(1)
  expect(next[0].id).toBe('server-1')
  expect(next[0].delivery_status).toBe('sent')
})
