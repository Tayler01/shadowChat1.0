import { act, renderHook, waitFor } from '@testing-library/react'
import { MessagesProvider, useMessages } from '../apps/streamlined/src-overrides/hooks/useMessages'
import * as messagesModule from '../apps/streamlined/src-overrides/hooks/useMessages'
import { DirectMessagesProvider, useDirectMessages } from '../apps/streamlined/src-overrides/hooks/useDirectMessages'
import { getWorkingClient, getRealtimeClient, supabase, ensureSession, fetchGeneralChatThreadedWindow, fetchGeneralChatMessageWindow, isGeneralChatThreadRpcUnavailable, isGeneralChatMessageWindowRpcUnavailable, fetchGeneralChatThreadSummaries } from '../apps/streamlined/src-overrides/lib/supabase'
import { prepareMessageMedia } from '../src/lib/privateMediaCopies'
import { getDMMessageWindow } from '../src/lib/dmConversationRetrieval'

jest.mock('../src/config', () => ({ MESSAGE_FETCH_LIMIT: 40 }))
jest.mock('../src/lib/supabase', () => jest.requireMock('../apps/streamlined/src-overrides/lib/supabase'))
jest.mock('../src/lib/privateMediaUrls', () => ({ PRIVATE_MEDIA_ENABLED: true }))
jest.mock('../src/lib/privateMediaCopies', () => ({ prepareMessageMedia: jest.fn() }))
jest.mock('../apps/streamlined/src-overrides/hooks/useAuth', () => {
  const session = { user: { id: 'u1' }, profile: { id: 'u1', username: 'tester' } }
  return { useAuth: () => session }
})
jest.mock('../src/hooks/useAuth', () => jest.requireMock('../apps/streamlined/src-overrides/hooks/useAuth'))
jest.mock('../src/hooks/useRealtimeRecovery', () => ({ useRealtimeRecovery: jest.fn() }))
jest.mock('../src/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ playMessage: jest.fn(), playReaction: jest.fn() }) }))
jest.mock('../src/lib/realtimeRecovery', () => ({ runRealtimeRecovery: jest.fn(async () => ({ ok: true })) }))
jest.mock('../src/lib/push', () => ({ triggerGroupPushNotification: jest.fn(async () => undefined), triggerReactionPushNotification: jest.fn(async () => undefined), triggerDMPushNotification: jest.fn(async () => undefined) }))
jest.mock('../src/lib/dmConversationRetrieval', () => ({ getDMMessageWindow: jest.fn() }))
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn(), auth: { getSession: jest.fn() } },
  getWorkingClient: jest.fn(), getRealtimeClient: jest.fn(), ensureSession: jest.fn(),
  fetchGeneralChatThreadedWindow: jest.fn(), fetchGeneralChatMessageWindow: jest.fn(),
  isGeneralChatThreadRpcUnavailable: jest.fn(), isGeneralChatMessageWindowRpcUnavailable: jest.fn(),
  fetchGeneralChatThreadSummaries: jest.fn(), resolveGeneralChatThreadId: jest.fn(async () => null),
  fetchDMConversations: jest.fn(async () => []), markDMMessagesRead: jest.fn(), markDMMessagesReadThrough: jest.fn(),
  refreshSessionLocked: jest.fn(async () => ({ data: { session: {} }, error: null })),
  withTimeout: (promise: Promise<unknown>) => promise,
}))

const sourceUrl = 'https://example.supabase.co/storage/v1/object/public/shadow-pin/original/source.png'
const ownedUrl = 'https://example.supabase.co/storage/v1/object/public/chat-uploads/u1/forwarded/retry/image.png'
const query = (overrides: Record<string, unknown> = {}) => {
  const value: Record<string, any> = {
    select: jest.fn(() => value), insert: jest.fn(() => value), order: jest.fn(() => value),
    limit: jest.fn(() => value), eq: jest.fn(() => value), neq: jest.fn(() => value), is: jest.fn(() => value),
    or: jest.fn(() => value), lt: jest.fn(() => value), gt: jest.fn(() => value),
    single: jest.fn(async () => ({ data: [], error: null })), maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  }
  return Object.assign(value, overrides)
}
let client: { from: jest.Mock; channel: jest.Mock; removeChannel: jest.Mock; auth: { getSession: jest.Mock } }
beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  client = {
    from: jest.fn(() => query()),
    channel: jest.fn(() => { const channel = { on: jest.fn(() => channel), subscribe: jest.fn(() => channel), state: 'joined' }; return channel }),
    removeChannel: jest.fn(), auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'token', user: { id: 'u1' } } }, error: null })) },
  }
  Object.assign(supabase, client)
  ;(getWorkingClient as jest.Mock).mockResolvedValue(client)
  ;(getRealtimeClient as jest.Mock).mockReturnValue(client)
  ;(ensureSession as jest.Mock).mockResolvedValue(true)
  ;(fetchGeneralChatThreadedWindow as jest.Mock).mockRejectedValue({ code: 'PGRST202' })
  ;(fetchGeneralChatMessageWindow as jest.Mock).mockRejectedValue({ code: 'PGRST202' })
  ;(isGeneralChatThreadRpcUnavailable as jest.Mock).mockReturnValue(true)
  ;(isGeneralChatMessageWindowRpcUnavailable as jest.Mock).mockReturnValue(true)
  ;(fetchGeneralChatThreadSummaries as jest.Mock).mockResolvedValue(new Map())
  ;(getDMMessageWindow as jest.Mock).mockResolvedValue({ messages: [], hasOlder: false, hasNewer: false, targetStatus: 'missing' })
  ;(prepareMessageMedia as jest.Mock).mockResolvedValue({ content: 'photo', fileUrl: ownedUrl, thumbnailUrl: ownedUrl })
})
afterEach(() => jest.restoreAllMocks())

test('General retry retains copied owner references after insert failure', async () => {
  const insert = jest.spyOn(messagesModule, 'insertMessage')
    .mockRejectedValueOnce(new Error('network unavailable'))
    .mockResolvedValueOnce({ data: { id: 'saved', user_id: 'u1', client_message_id: 'retry', content: 'photo', message_type: 'image', file_url: ownedUrl, created_at: '2026-10-26T12:00:00Z' } as any, error: null })
  const hook = renderHook(() => useMessages(), { wrapper: MessagesProvider })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  await act(async () => {
    await expect(hook.result.current.sendMessage('photo', 'image', sourceUrl, undefined, sourceUrl, { clientMessageId: 'retry' })).rejects.toThrow('network unavailable')
  })
  expect(JSON.parse(localStorage.getItem('shadowchat:outbox:general')!)[0]).toMatchObject({ fileUrl: ownedUrl, thumbnailUrl: ownedUrl })
  await act(async () => { await hook.result.current.retryFailedMessage('retry') })
  expect(prepareMessageMedia).toHaveBeenNthCalledWith(2, expect.objectContaining({ fileUrl: ownedUrl, thumbnailUrl: ownedUrl }))
  expect(insert).toHaveBeenLastCalledWith(expect.objectContaining({ file_url: ownedUrl, thumbnail_url: ownedUrl }))
  expect(localStorage.getItem('shadowchat:outbox:general')).toBeNull()
})

test('DM retry retains copied owner references after insert failure', async () => {
  const hook = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  await act(async () => { hook.result.current.setCurrentConversation('conv1') })
  await waitFor(() => expect(hook.result.current.messagesLoading).toBe(false))
  const response = jest.fn().mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'temporary insert denied' } })
    .mockResolvedValueOnce({ data: { id: 'saved', conversation_id: 'conv1', sender_id: 'u1', client_message_id: 'retry', content: 'photo', message_type: 'image', file_url: ownedUrl, created_at: '2026-10-26T12:00:00Z', updated_at: '2026-10-26T12:00:00Z' }, error: null })
  const insert = jest.fn(() => ({ select: () => ({ single: response }) }))
  client.from.mockImplementation(() => query({ insert }))
  await act(async () => {
    await expect(hook.result.current.sendMessage('photo', 'image', sourceUrl, undefined, sourceUrl, { clientMessageId: 'retry' })).rejects.toBeDefined()
  })
  expect(JSON.parse(localStorage.getItem('shadowchat:outbox:dm:conv1')!)[0]).toMatchObject({ fileUrl: ownedUrl, thumbnailUrl: ownedUrl })
  await act(async () => { await hook.result.current.retryFailedMessage('retry') })
  expect(prepareMessageMedia).toHaveBeenNthCalledWith(2, expect.objectContaining({ fileUrl: ownedUrl, thumbnailUrl: ownedUrl }))
  expect(insert).toHaveBeenLastCalledWith(expect.objectContaining({ file_url: ownedUrl, thumbnail_url: ownedUrl }))
  expect(localStorage.getItem('shadowchat:outbox:dm:conv1')).toBeNull()
})
