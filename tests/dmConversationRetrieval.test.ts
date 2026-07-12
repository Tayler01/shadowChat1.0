import { getWorkingClient } from '../src/lib/supabase'
import {
  getDMMessageWindow,
  listDMSharedContent,
  searchDMConversationMessages,
} from '../src/lib/dmConversationRetrieval'

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(),
}))

const CONVERSATION_ID = '10000000-0000-4000-8000-000000000001'
const MESSAGE_ID = '20000000-0000-4000-8000-000000000001'
const OLDER_MESSAGE_ID = '20000000-0000-4000-8000-000000000002'
const SENDER_ID = '30000000-0000-4000-8000-000000000001'

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: MESSAGE_ID,
  conversation_id: CONVERSATION_ID,
  sender_id: SENDER_ID,
  content: 'Lantern signal',
  message_type: 'text',
  file_url: null,
  thumbnail_url: null,
  thumbnail_path: 'dm/conversation-1/thumb.webp',
  audio_url: null,
  audio_duration: null,
  client_message_id: 'client-message-1',
  reply_to: null,
  read_at: '2026-07-11T12:02:00.000Z',
  read_by: [SENDER_ID],
  media_processed_at: '2026-07-11T12:00:30.000Z',
  reactions: { '❤️': { count: 1, users: [SENDER_ID] } },
  edited_at: null,
  created_at: '2026-07-11T12:00:00.000Z',
  updated_at: '2026-07-11T12:01:00.000Z',
  sender: {
    id: SENDER_ID,
    username: 'night_owl',
    display_name: 'Night Owl',
  },
  ...overrides,
})

const mockRpc = (result: { data: unknown; error: unknown }) => {
  const rpc = jest.fn().mockResolvedValue(result)
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ rpc })
  return rpc
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('DM conversation retrieval wrappers', () => {
  test('maps search results, clamps the limit, and exposes a deterministic next cursor', async () => {
    const rpc = mockRpc({
      data: [
        makeRow({ id: OLDER_MESSAGE_ID, created_at: '2026-07-11T11:00:00.000Z' }),
        makeRow(),
      ],
      error: null,
    })

    const result = await searchDMConversationMessages(CONVERSATION_ID, '  lantern  ', { limit: 500 })

    expect(rpc).toHaveBeenCalledWith('search_dm_conversation_messages', {
      target_conversation_id: CONVERSATION_ID,
      search_query: 'lantern',
      result_limit: 50,
      before_created_at: null,
      before_id: null,
    })
    expect(result.items.map(item => item.id)).toEqual([MESSAGE_ID, OLDER_MESSAGE_ID])
    expect(result.items[0]).toMatchObject({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      messageType: 'text',
      content: 'Lantern signal',
      sender: { username: 'night_owl', display_name: 'Night Owl' },
    })
    expect(result.nextCursor).toEqual({
      createdAt: '2026-07-11T11:00:00.000Z',
      id: OLDER_MESSAGE_ID,
    })
    expect(result.hasMore).toBe(false)
  })

  test('normalizes a complete search cursor and rejects partial cursors before RPC', async () => {
    const rpc = mockRpc({ data: [], error: null })
    await searchDMConversationMessages(CONVERSATION_ID, 'signal', {
      cursor: { createdAt: '2026-07-11T11:00:00-04:00', id: OLDER_MESSAGE_ID },
    })
    expect(rpc).toHaveBeenCalledWith('search_dm_conversation_messages', expect.objectContaining({
      before_created_at: '2026-07-11T15:00:00.000Z',
      before_id: OLDER_MESSAGE_ID,
    }))

    await expect(searchDMConversationMessages(CONVERSATION_ID, 'signal', {
      cursor: { createdAt: '2026-07-11T11:00:00.000Z' },
    })).rejects.toThrow('must include both')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  test('returns an empty search page without a network call for a blank query', async () => {
    const rpc = mockRpc({ data: [], error: null })
    await expect(searchDMConversationMessages(CONVERSATION_ID, '   ')).resolves.toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  test('maps shared content and sends the bounded filter cursor contract', async () => {
    const rpc = mockRpc({
      data: [makeRow({
        message_type: 'image',
        content_kind: 'media',
        file_url: 'https://example.com/photo.webp',
        media_width: 1200,
        media_height: '900',
      })],
      error: null,
    })

    const result = await listDMSharedContent(CONVERSATION_ID, { filter: 'media', limit: 0 })
    expect(rpc).toHaveBeenCalledWith('list_dm_shared_content', {
      target_conversation_id: CONVERSATION_ID,
      content_filter: 'media',
      result_limit: 1,
      before_created_at: null,
      before_id: null,
    })
    expect(result.items[0]).toMatchObject({
      contentKind: 'media',
      messageType: 'image',
      fileUrl: 'https://example.com/photo.webp',
      mediaWidth: 1200,
      mediaHeight: 900,
    })
    expect(result.hasMore).toBe(true)
  })

  test('rejects invalid ids and shared-content filters before RPC', async () => {
    const rpc = mockRpc({ data: [], error: null })
    await expect(searchDMConversationMessages('not-an-id', 'signal')).rejects.toThrow('valid UUID')
    await expect(listDMSharedContent(CONVERSATION_ID, { filter: 'private' as never }))
      .rejects.toThrow('filter must be')
    expect(rpc).not.toHaveBeenCalled()
  })

  test('maps a resolved exact window chronologically with authoritative bounds', async () => {
    const rpc = mockRpc({
      data: [{
        messages: [
          makeRow(),
          makeRow({ id: OLDER_MESSAGE_ID, created_at: '2026-07-11T11:00:00.000Z' }),
        ],
        has_older: true,
        has_newer: false,
        target_status: 'resolved',
      }],
      error: null,
    })

    const result = await getDMMessageWindow(CONVERSATION_ID, MESSAGE_ID, { limit: 1000 })
    expect(rpc).toHaveBeenCalledWith('get_dm_message_window', {
      target_conversation_id: CONVERSATION_ID,
      target_message_id: MESSAGE_ID,
      target_limit: 100,
    })
    expect(result.messages.map(message => message.id)).toEqual([OLDER_MESSAGE_ID, MESSAGE_ID])
    expect(result.messages[1]).toMatchObject({
      clientMessageId: 'client-message-1',
      readAt: '2026-07-11T12:02:00.000Z',
      readBy: [SENDER_ID],
      mediaProcessedAt: '2026-07-11T12:00:30.000Z',
      thumbnailPath: 'dm/conversation-1/thumb.webp',
    })
    expect(result).toMatchObject({ hasOlder: true, hasNewer: false, targetStatus: 'resolved' })
  })

  test('fails closed when the target is missing or a resolved payload omits it', async () => {
    mockRpc({
      data: [{ messages: [makeRow()], has_older: true, has_newer: true, target_status: 'missing' }],
      error: null,
    })
    await expect(getDMMessageWindow(CONVERSATION_ID, MESSAGE_ID)).resolves.toEqual({
      messages: [],
      hasOlder: false,
      hasNewer: false,
      targetStatus: 'missing',
    })

    mockRpc({
      data: [{
        messages: [makeRow({ id: OLDER_MESSAGE_ID })],
        has_older: true,
        has_newer: true,
        target_status: 'resolved',
      }],
      error: null,
    })
    await expect(getDMMessageWindow(CONVERSATION_ID, MESSAGE_ID)).resolves.toEqual({
      messages: [],
      hasOlder: false,
      hasNewer: false,
      targetStatus: 'missing',
    })
  })

  test('throws Supabase RPC errors instead of converting them into empty data', async () => {
    const error = { code: '42501', message: 'Conversation is unavailable' }
    mockRpc({ data: null, error })
    await expect(searchDMConversationMessages(CONVERSATION_ID, 'signal')).rejects.toBe(error)
  })
})
