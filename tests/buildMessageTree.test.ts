import { buildMessageTree } from '../src/lib/utils'
import type { Message } from '../src/lib/supabase'

test('builds nested message tree', () => {
  const base: Partial<Message> = {
    user_id: 'u1',
    content: 'hi',
    message_type: 'text',
    reactions: {},
    pinned: false,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z'
  }
  const msgs: Message[] = [
    { ...base, id: '1' } as Message,
    { ...base, id: '2', reply_to: '1', created_at: '2020-01-01T00:01:00Z' } as Message,
    { ...base, id: '3', reply_to: '2', created_at: '2020-01-01T00:02:00Z' } as Message
  ]

  const tree = buildMessageTree(msgs)
  expect(tree).toHaveLength(1)
  expect(tree[0].id).toBe('1')
  expect(tree[0].replies[0].id).toBe('2')
  expect(tree[0].replies[0].replies[0].id).toBe('3')
})
