import {
  fetchGeneralChatThread,
  mergeThreadMessages,
  normalizeGeneralChatThreadSummaries,
  normalizeGeneralChatThreadWindow,
} from '../src/features/general-chat-threads/generalChatThreadsApi'
import { getWorkingClient, type Message } from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => ({ getWorkingClient: jest.fn() }))

const makeMessage = (id: string, createdAt: string, content = id): Message => ({
  id,
  user_id: 'user-1',
  content,
  message_type: 'text',
  reactions: {},
  pinned: false,
  created_at: createdAt,
  updated_at: createdAt,
})

test('normalizes a thread window and keeps replies chronological', () => {
  const root = makeMessage('root-1', '2026-07-12T12:00:00.000Z')
  const newer = makeMessage('reply-2', '2026-07-12T12:03:00.000Z')
  const older = makeMessage('reply-1', '2026-07-12T12:02:00.000Z')

  expect(normalizeGeneralChatThreadWindow({
    thread_id: root.id,
    root_message: root,
    thread_replies: [newer, root, older],
    has_older: true,
    target_status: 'found',
  }, {
    threadId: root.id,
    targetMessageId: older.id,
  })).toEqual({
    threadId: root.id,
    rootMessage: root,
    replies: [older, newer],
    hasOlder: true,
    hasNewer: false,
    firstUnreadMessageId: null,
    anchorStatus: 'latest',
    targetMessageId: older.id,
    targetFound: true,
  })
})

test('turns an unavailable root placeholder into a missing root', () => {
  const reply = makeMessage('reply-1', '2026-07-12T12:02:00.000Z')
  const result = normalizeGeneralChatThreadWindow({
    thread_id: 'root-removed',
    root_message: { id: 'root-removed', unavailable: true },
    replies: [reply],
    anchor_status: 'latest',
  }, { threadId: 'root-removed' })

  expect(result.rootMessage).toBeNull()
  expect(result.replies).toEqual([reply])
})

test('merges realtime refreshes without duplicates and replaces stale rows', () => {
  const first = makeMessage('reply-1', '2026-07-12T12:02:00.000Z', 'before')
  const changed = makeMessage('reply-1', '2026-07-12T12:02:00.000Z', 'after')
  const second = makeMessage('reply-2', '2026-07-12T12:03:00.000Z')

  expect(mergeThreadMessages([first], [second, changed])).toEqual([changed, second])
})

test('orders equivalent timestamp encodings by ID before reconciling optimistic rows', () => {
  const newerId = makeMessage('reply-2', '2026-07-12T12:02:00.000Z')
  const olderId = makeMessage('reply-1', '2026-07-12T08:02:00-04:00')
  expect(mergeThreadMessages([], [newerId, olderId])).toEqual([olderId, newerId])
})

test('reconciles a local reply with its server row by client message id', () => {
  const optimistic = {
    ...makeMessage('client-1', '2026-07-12T12:02:00.000Z', 'sending'),
    client_message_id: 'client-1',
    optimistic: true,
    delivery_status: 'sending' as const,
  }
  const server = {
    ...makeMessage('reply-1', '2026-07-12T12:02:00.000Z', 'sent'),
    client_message_id: 'client-1',
    delivery_status: 'sent' as const,
  }

  expect(mergeThreadMessages([optimistic], [server])).toEqual([server])
})

test('accepts summary field variants and drops malformed rows', () => {
  expect(normalizeGeneralChatThreadSummaries([
    {
      root_message_id: 'root-1',
      summary: {
        reply_count: '4',
        unread_count: 2,
        latest_reply_at: '2026-07-12T12:03:00.000Z',
        latest_reply_id: 'reply-4',
        latest_reply_preview: 'Latest reply',
        latest_reply_author: { id: 'user-2', display_name: 'Shado' },
        participants: [{ id: 'user-2', display_name: 'Shado' }],
      },
    },
    { reply_count: 99 },
  ])).toEqual([{
    threadId: 'root-1',
    replyCount: 4,
    unreadCount: 2,
    lastReplyAt: '2026-07-12T12:03:00.000Z',
    lastReplyId: 'reply-4',
    lastReplyPreview: 'Latest reply',
    lastReplyAuthor: { id: 'user-2', display_name: 'Shado' },
    participants: [{ id: 'user-2', display_name: 'Shado' }],
  }])
})

test('read-aware thread request uses server cursor resolution and authoritative forward bounds', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{
    thread_id: 'root-1', replies: [makeMessage('reply-1', '2026-09-30T12:00:00Z')],
    anchor_status: 'unread', first_unread_message_id: 'reply-1', has_newer: true,
  }], error: null })
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ rpc })
  const result = await fetchGeneralChatThread({ threadId: 'root-1', readAnchor: true })
  expect(rpc).toHaveBeenCalledWith('get_general_chat_thread_read_window', expect.objectContaining({
    target_read_anchor: true, target_after_id: null, target_before_id: null,
  }))
  expect(result).toMatchObject({ hasNewer: true, firstUnreadMessageId: 'reply-1', anchorStatus: 'unread' })
  const after = { created_at: '2026-09-30T12:00:00Z', id: 'reply-1' }
  await fetchGeneralChatThread({ threadId: 'root-1', after, readAnchor: false })
  expect(rpc).toHaveBeenLastCalledWith('get_general_chat_thread_read_window', expect.objectContaining({
    target_after_created_at: after.created_at, target_after_id: after.id, target_read_anchor: false,
  }))
  await expect(fetchGeneralChatThread({ threadId: 'root-1', before: after, after })).rejects.toThrow('only one')
})
