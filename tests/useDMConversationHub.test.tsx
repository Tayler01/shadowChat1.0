import { act, renderHook, waitFor } from '@testing-library/react'
import { useDMConversationHub } from '../src/hooks/useDMConversationHub'
import { fetchDMConversationHubState, saveDMConversationPreference } from '../src/lib/dmConversationHub'
import type { DMConversation } from '../src/lib/supabase'

const removeChannelMock = jest.fn()
const subscribeMock = jest.fn()
const channel = {
  on: jest.fn(),
  subscribe: subscribeMock,
}
channel.on.mockReturnValue(channel)
subscribeMock.mockReturnValue(channel)

jest.mock('../src/lib/supabase', () => ({
  getRealtimeClient: () => ({
    channel: () => channel,
    removeChannel: removeChannelMock,
  }),
}))

jest.mock('../src/lib/dmConversationHub', () => ({
  fetchDMConversationHubState: jest.fn(),
  saveDMConversationPreference: jest.fn(),
}))

jest.mock('../src/lib/push', () => ({
  fetchConversationNotificationMute: jest.fn(),
  setConversationNotificationMute: jest.fn(),
}))

const fetchStateMock = fetchDMConversationHubState as jest.MockedFunction<typeof fetchDMConversationHubState>
const savePreferenceMock = saveDMConversationPreference as jest.MockedFunction<typeof saveDMConversationPreference>

const conversation: DMConversation = {
  id: 'conversation-1',
  participants: ['user-1', 'user-2'],
  last_message_at: '2026-07-11T20:00:00.000Z',
  created_at: '2026-07-11T19:00:00.000Z',
  other_user: {
    id: 'user-2',
    username: 'francis',
    display_name: 'Francis',
  } as DMConversation['other_user'],
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  channel.on.mockReturnValue(channel)
  subscribeMock.mockReturnValue(channel)
  fetchStateMock.mockResolvedValue({ preferences: [], mutedConversationIds: [] })
})

test('DM draft previews follow the authenticated account and ignore unowned legacy drafts', async () => {
  localStorage.setItem('draft-dm-conversation-1', 'legacy unknown owner')
  localStorage.setItem('draft-account:user-1:dm-conversation-1', 'A private draft')
  localStorage.setItem('draft-account:user-2:dm-conversation-1', 'B private draft')
  const { result, rerender } = renderHook(({ userId }: { userId: string }) => useDMConversationHub({ conversations: [conversation], userId }), {
    initialProps: { userId: 'user-1' },
  })
  await waitFor(() => expect(result.current.allItems[0].localDraft).toBe('A private draft'))
  rerender({ userId: 'user-2' })
  expect(result.current.allItems[0].localDraft).toBe('B private draft')
  rerender({ userId: 'user-1' })
  expect(result.current.allItems[0].localDraft).toBe('A private draft')
  expect(localStorage.getItem('draft-dm-conversation-1')).toBe('legacy unknown owner')
})

test('serializes preference writes and preserves the newest combined intent', async () => {
  const firstSave = deferred<Awaited<ReturnType<typeof saveDMConversationPreference>>>()
  const secondSave = deferred<Awaited<ReturnType<typeof saveDMConversationPreference>>>()
  savePreferenceMock
    .mockImplementationOnce(() => firstSave.promise)
    .mockImplementationOnce(() => secondSave.promise)

  const { result } = renderHook(() => useDMConversationHub({ conversations: [conversation], userId: 'user-1' }))
  await waitFor(() => expect(result.current.loading).toBe(false))

  let pinPromise!: Promise<void>
  let archivePromise!: Promise<void>
  act(() => {
    pinPromise = result.current.updatePreference('conversation-1', { pinnedAt: '2026-07-11T20:01:00.000Z' })
    archivePromise = result.current.updatePreference('conversation-1', { archivedAt: '2026-07-11T20:02:00.000Z' })
  })

  await waitFor(() => expect(savePreferenceMock).toHaveBeenCalledTimes(1))
  expect(result.current.allItems[0]).toMatchObject({ isPinned: true, isArchived: true })

  firstSave.resolve({
    conversationId: 'conversation-1',
    pinnedAt: '2026-07-11T20:01:00.000Z',
    archivedAt: null,
    markedUnreadAt: null,
    updatedAt: '2026-07-11T20:01:01.000Z',
  })
  await waitFor(() => expect(savePreferenceMock).toHaveBeenCalledTimes(2))
  expect(savePreferenceMock.mock.calls[1][0].preference).toMatchObject({
    pinnedAt: '2026-07-11T20:01:00.000Z',
    archivedAt: '2026-07-11T20:02:00.000Z',
  })

  secondSave.resolve({
    conversationId: 'conversation-1',
    pinnedAt: '2026-07-11T20:01:00.000Z',
    archivedAt: '2026-07-11T20:02:00.000Z',
    markedUnreadAt: null,
    updatedAt: '2026-07-11T20:02:01.000Z',
  })
  await act(async () => {
    await Promise.all([pinPromise, archivePromise])
  })

  expect(result.current.allItems[0]).toMatchObject({ isPinned: true, isArchived: true })
})

test('restores the latest committed preference when the newest queued write fails', async () => {
  const firstSave = deferred<Awaited<ReturnType<typeof saveDMConversationPreference>>>()
  const secondSave = deferred<Awaited<ReturnType<typeof saveDMConversationPreference>>>()
  savePreferenceMock
    .mockImplementationOnce(() => firstSave.promise)
    .mockImplementationOnce(() => secondSave.promise)

  const { result } = renderHook(() => useDMConversationHub({ conversations: [conversation], userId: 'user-1' }))
  await waitFor(() => expect(result.current.loading).toBe(false))

  let pinPromise!: Promise<void>
  let archivePromise!: Promise<void>
  act(() => {
    pinPromise = result.current.updatePreference('conversation-1', { pinnedAt: '2026-07-11T20:01:00.000Z' })
    archivePromise = result.current.updatePreference('conversation-1', { archivedAt: '2026-07-11T20:02:00.000Z' })
  })

  firstSave.resolve({
    conversationId: 'conversation-1',
    pinnedAt: '2026-07-11T20:01:00.000Z',
    archivedAt: null,
    markedUnreadAt: null,
    updatedAt: '2026-07-11T20:01:01.000Z',
  })
  await waitFor(() => expect(savePreferenceMock).toHaveBeenCalledTimes(2))

  secondSave.reject(new Error('network unavailable'))
  await act(async () => {
    await pinPromise
    await expect(archivePromise).rejects.toThrow('network unavailable')
  })

  expect(result.current.allItems[0]).toMatchObject({ isPinned: true, isArchived: false })
})
