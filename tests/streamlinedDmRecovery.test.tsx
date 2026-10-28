import { act, renderHook, waitFor } from '@testing-library/react'
import { DirectMessagesProvider, useDirectMessages } from '../apps/streamlined/src-overrides/hooks/useDirectMessages'
import { fetchDMConversations, getRealtimeClient, getWorkingClient } from '../apps/streamlined/src-overrides/lib/supabase'
import { useAuth } from '../apps/streamlined/src-overrides/hooks/useAuth'

jest.mock('../apps/streamlined/src-overrides/hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../src/hooks/useRealtimeRecovery', () => ({ useRealtimeRecovery: jest.fn() }))
jest.mock('../src/config', () => ({ MESSAGE_FETCH_LIMIT: 40 }))
jest.mock('../src/hooks/useSoundEffects', () => {
  const playMessage = jest.fn()
  return { useSoundEffects: () => ({ playMessage }) }
})
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({
  fetchDMConversations: jest.fn(),
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
  withTimeout: (promise: Promise<unknown>, ms: number) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]),
}))

beforeEach(() => {
  jest.clearAllMocks()
  ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'qa-user' } })
  const channel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn(), send: jest.fn(), state: 'joined' }
  const client = { channel: jest.fn(() => channel), removeChannel: jest.fn() }
  ;(getWorkingClient as jest.Mock).mockResolvedValue(client)
  ;(getRealtimeClient as jest.Mock).mockReturnValue(client)
})

test('a stalled inbox times out, retains the selected route, and retries without accepting a late result', async () => {
  jest.useFakeTimers()
  let resolveOld!: (value: unknown[]) => void
  const stalled = new Promise<unknown[]>(resolve => { resolveOld = resolve })
  const fetch = fetchDMConversations as jest.Mock
  fetch.mockReturnValueOnce(stalled).mockResolvedValue([{ id: 'conversation-1' }])
  const { result, unmount } = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider })
  act(() => result.current.setCurrentConversation('conversation-1'))
  await act(async () => { jest.advanceTimersByTime(12000); await Promise.resolve() })
  expect(result.current.loading).toBe(false)
  expect(result.current.conversationsError).toBe(true)
  expect(result.current.currentConversation).toBe('conversation-1')
  await act(async () => { await result.current.retryConversations() })
  expect(result.current.conversationsError).toBe(false)
  expect(result.current.conversations.map(item => item.id)).toEqual(['conversation-1'])
  await act(async () => { resolveOld([{ id: 'stale' }]); await Promise.resolve() })
  expect(result.current.conversations.map(item => item.id)).toEqual(['conversation-1'])
  unmount()
  jest.useRealTimers()
})

test('a later inbox failure preserves the last successful conversations', async () => {
  const fetch = fetchDMConversations as jest.Mock
  fetch.mockResolvedValueOnce([{ id: 'conversation-1' }]).mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider })
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => { await result.current.retryConversations() })
  expect(result.current.conversationsError).toBe(true)
  expect(result.current.conversations.map(item => item.id)).toEqual(['conversation-1'])
})

test('an older in-flight refresh cannot overwrite a successful retry', async () => {
  let resolveOld!: (value: unknown[]) => void
  const fetch = fetchDMConversations as jest.Mock
  fetch.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
    .mockResolvedValueOnce([{ id: 'new' }])
  const { result } = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider })
  await act(async () => { await result.current.retryConversations() })
  await act(async () => { resolveOld([{ id: 'old' }]); await Promise.resolve() })
  expect(result.current.conversations.map(item => item.id)).toEqual(['new'])
  expect(result.current.conversationsError).toBe(false)
})

test('switching accounts clears the old inbox and ignores its pending response', async () => {
  let resolveOld!: (value: unknown[]) => void
  const fetch = fetchDMConversations as jest.Mock
  fetch.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
    .mockResolvedValueOnce([{ id: 'new-account-conversation' }])
  const { result, rerender } = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider })
  act(() => result.current.setCurrentConversation('old-account-conversation'))
  ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'other-user' } })
  rerender()
  await waitFor(() => expect(result.current.conversations.map(item => item.id)).toEqual(['new-account-conversation']))
  expect(result.current.currentConversation).toBeNull()
  await act(async () => { resolveOld([{ id: 'old-account-conversation' }]); await Promise.resolve() })
  expect(result.current.conversations.map(item => item.id)).toEqual(['new-account-conversation'])
})
