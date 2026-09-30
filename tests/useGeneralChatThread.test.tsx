import { act, renderHook, waitFor } from '@testing-library/react'
import { useGeneralChatThread } from '../src/features/general-chat-threads/useGeneralChatThread'
import { fetchGeneralChatThread } from '../src/features/general-chat-threads/generalChatThreadsApi'
import { getWorkingClient, type Message } from '../src/lib/supabase'
jest.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'reader' }, profile: { id: 'reader' } }) }))
jest.mock('../src/hooks/useRealtimeRecovery', () => ({ useRealtimeRecovery: jest.fn() }))
jest.mock('../src/lib/supabase', () => ({ getWorkingClient: jest.fn() }))
jest.mock('../src/features/general-chat-threads/generalChatThreadsApi', () => ({
  ...jest.requireActual('../src/features/general-chat-threads/generalChatThreadsApi'), fetchGeneralChatThread: jest.fn(),
}))
const message = (id: string, index: number, reply_to?: string) => ({ id, reply_to, user_id: 'other', content: id, created_at: new Date(Date.UTC(2026, 8, 30, 12, index)).toISOString(), updated_at: '2026-09-30T12:00:00Z', message_type: 'text', reactions: {} }) as Message
beforeEach(() => { localStorage.clear(); jest.clearAllMocks() })

test('background refresh preserves missing-target recovery until the reader chooses latest', async () => {
  const root = message('root', 0)
  const channel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() }
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ channel: jest.fn(() => channel), removeChannel: jest.fn() })
  ;(fetchGeneralChatThread as jest.Mock)
    .mockResolvedValueOnce({ rootMessage: root, replies: [], hasOlder: false, hasNewer: false, targetFound: false })
    .mockResolvedValue({ rootMessage: root, replies: [], hasOlder: false, hasNewer: false, targetFound: true })
  const { result } = renderHook(() => useGeneralChatThread({ threadId: 'root', targetMessageId: 'missing', open: true }))
  await waitFor(() => expect(result.current.targetUnavailable).toBe(true))
  await act(async () => { await result.current.refresh() })
  expect(result.current.targetUnavailable).toBe(true)
  act(() => result.current.setFollowingLatest(true))
  expect(result.current.targetUnavailable).toBe(false)
})
test('ordinary open requests first unread and anchored recovery preserves the full capped history window', async () => {
  const root = message('root', 0)
  const replies = Array.from({ length: 200 }, (_, index) => message(`reply-${index}`, index + 1, 'root'))
  ;(fetchGeneralChatThread as jest.Mock).mockResolvedValue({ rootMessage: root, replies, hasOlder: true, hasNewer: true, firstUnreadMessageId: 'reply-15' })
  const inQuery = jest.fn().mockResolvedValue({ data: [root, ...replies], error: null })
  const channel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() }
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ channel: jest.fn(() => channel), removeChannel: jest.fn(), from: jest.fn(() => ({ select: jest.fn(() => ({ in: inQuery })) })) })
  const { result } = renderHook(() => useGeneralChatThread({ threadId: 'root', open: true }))
  await waitFor(() => expect(result.current.replies).toHaveLength(200))
  expect(fetchGeneralChatThread).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'root', readAnchor: true }))
  act(() => result.current.setFollowingLatest(false))
  act(() => window.dispatchEvent(new CustomEvent('shadowchat:general-thread-message', { detail: message('new-reply', 250, 'root') })))
  expect(result.current.replies[0].id).toBe('reply-0')
  expect(result.current.replies).toHaveLength(200)
  await act(async () => { await result.current.refresh() })
  expect(fetchGeneralChatThread).toHaveBeenCalledTimes(1)
  expect(inQuery).toHaveBeenCalledWith('id', ['root', ...replies.map(reply => reply.id)])
  expect(result.current.replies[0].id).toBe('reply-0')
  expect(result.current.hasNewer).toBe(true)
})
