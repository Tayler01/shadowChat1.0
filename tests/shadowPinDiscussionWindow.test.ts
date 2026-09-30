import { getWorkingClient } from '../src/lib/supabase'
import { fetchShadowPinDiscussionWindow, markShadowPinCommentsRead, cleanupShadowPinCommentAttachment } from '../src/features/shadow-pin/api/shadowPinApi'

jest.mock('../src/lib/supabase', () => ({ getWorkingClient: jest.fn(), ensureSession: jest.fn(), getSessionWithTimeout: jest.fn(), uploadShadowPinImage: jest.fn() }))
const workingClient = getWorkingClient as jest.Mock
const row = (id: string, createdAt = '2026-09-30T12:00:00Z') => ({ id, image_id: 'pin', author_id: 'member', body: id, created_at: createdAt, updated_at: createdAt })
const query = (data: unknown, error: unknown = null) => {
  const builder: any = { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve) }
  for (const method of ['select', 'eq', 'or', 'order', 'limit', 'in']) builder[method] = jest.fn(() => builder)
  builder.maybeSingle = jest.fn(async () => ({ data, error }))
  return builder
}
const cursor = { user_id: 'viewer', image_id: 'pin', last_read_comment_id: 'c010', last_read_at: '2026-09-30T12:00:00Z', updated_at: '2026-09-30T12:01:00Z' }

beforeEach(() => jest.clearAllMocks())

test('opens at the true unread tuple even when unread count exceeds the latest page; same-timestamp ids stay ordered', async () => {
  const cursorQuery = query(cursor)
  const unreadQuery = query(row('c011'))
  const before = query(Array.from({ length: 11 }, (_, i) => row(`c${String(10-i).padStart(3,'0')}`)))
  const after = query(Array.from({ length: 30 }, (_, i) => row(`c${String(12+i).padStart(3,'0')}`)))
  const from = jest.fn().mockReturnValueOnce(cursorQuery).mockReturnValueOnce(unreadQuery).mockReturnValueOnce(before).mockReturnValueOnce(after)
  workingClient.mockResolvedValue({ from })
  const result = await fetchShadowPinDiscussionWindow('pin', 'viewer')
  expect(result.firstUnreadId).toBe('c011')
  expect(result.comments.map(comment => comment.id)).toEqual(Array.from({ length: 40 }, (_, i) => `c${String(1+i).padStart(3,'0')}`))
  expect(result.hasMore).toBe(true)
  expect(result.hasNewer).toBe(true)
  expect(result.cursor?.last_read_message_id).toBe('c010')
  expect(unreadQuery.or).toHaveBeenCalledWith('created_at.gt.2026-09-30T12:00:00Z,and(created_at.eq.2026-09-30T12:00:00Z,id.gt.c010)')
  expect(unreadQuery.order).toHaveBeenCalledWith('created_at', { ascending: true })
  expect(unreadQuery.limit).toHaveBeenCalledWith(1)
})

test('cursor lookup failure never silently chooses the latest page', async () => {
  const from = jest.fn(() => query(null, new Error('network down')))
  workingClient.mockResolvedValue({ from })
  await expect(fetchShadowPinDiscussionWindow('pin', 'viewer')).rejects.toThrow('network down')
  expect(from).toHaveBeenCalledTimes(1)
})

test('inaccessible exact target returns an explicit unavailable state without loading unrelated latest content', async () => {
  const from = jest.fn().mockReturnValueOnce(query(cursor)).mockReturnValueOnce(query(null))
  workingClient.mockResolvedValue({ from })
  const result = await fetchShadowPinDiscussionWindow('pin', 'viewer', 'blocked')
  expect(result.targetUnavailable).toBe(true)
  expect(result.comments).toEqual([])
  expect(from).toHaveBeenCalledTimes(2)
})

test('read acknowledgement rejects a changed account before making its RPC', async () => {
  const rpc = jest.fn()
  workingClient.mockResolvedValue({ rpc, auth: { getSession: async () => ({ data: { session: { user: { id: 'other' } } } }) } })
  await expect(markShadowPinCommentsRead('pin', ['c011'], 'viewer')).rejects.toThrow('account changed')
  expect(rpc).not.toHaveBeenCalled()
})

test('uncertain attachment-send cleanup preserves an object already referenced by a visible comment', async () => {
  const remove = jest.fn()
  workingClient.mockResolvedValue({ from: () => query([{ id: 'comment' }]), storage: { from: () => ({ remove }) } })
  await cleanupShadowPinCommentAttachment({ path: 'viewer/pin/uuid' })
  expect(remove).not.toHaveBeenCalled()
})
