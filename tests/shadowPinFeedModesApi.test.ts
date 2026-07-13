import { getWorkingClient } from '../src/lib/supabase'
import {
  fetchMyShadowPinConnectionFeed,
  fetchMyShadowPinConnectionFeedWindow,
  getMyShadowPinFeedMode,
  setMyShadowPinFeedMode,
} from '../src/features/shadow-pin/api/shadowPinApi'

jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(),
  getSessionWithTimeout: jest.fn(),
  getWorkingClient: jest.fn(),
  uploadShadowPinImage: jest.fn(),
}))

const workingClient = getWorkingClient as jest.MockedFunction<typeof getWorkingClient>

const pin = (id: string, createdAt: string) => ({
  id,
  category_id: 'category-1',
  creator_id: 'creator-1',
  title: `Pin ${id}`,
  image_url: `https://images.example/${id}.jpg`,
  media_type: 'image',
  processing_status: 'ready',
  heart_count: 0,
  comment_count: 0,
  created_at: createdAt,
  updated_at: createdAt,
  creator: null,
  category: { id: 'category-1', title: 'Category' },
  tag_links: [],
})

test('normalizes and persists the account feed preference', async () => {
  const rpc = jest.fn()
    .mockResolvedValueOnce({
      data: [{ feed_mode: 'connections', revision: 4, updated_at: '2026-07-13T22:00:00Z' }],
      error: null,
    })
    .mockResolvedValueOnce({
      data: [{ feed_mode: 'discover', revision: 5, updated_at: '2026-07-13T22:01:00Z' }],
      error: null,
    })
  workingClient.mockResolvedValue({ rpc } as never)

  await expect(getMyShadowPinFeedMode()).resolves.toEqual({
    mode: 'connections',
    revision: 4,
    updatedAt: '2026-07-13T22:00:00Z',
  })
  await expect(setMyShadowPinFeedMode('discover')).resolves.toEqual({
    mode: 'discover',
    revision: 5,
    updatedAt: '2026-07-13T22:01:00Z',
  })
  expect(rpc).toHaveBeenNthCalledWith(2, 'set_my_shadow_pin_feed_mode', { target_mode: 'discover' })
})

test('keeps RPC keyset order while loading exact Pin rows through RLS', async () => {
  const firstTime = '2026-07-13T22:00:00Z'
  const secondTime = '2026-07-13T21:00:00Z'
  const rpc = jest.fn().mockResolvedValue({
    data: [
      { image_id: 'pin-2', created_at: firstTime, viewer_has_hearted: true, has_more: true },
      { image_id: 'pin-1', created_at: secondTime, viewer_has_hearted: false, has_more: true },
    ],
    error: null,
  })
  const is = jest.fn().mockResolvedValue({ data: [pin('pin-1', secondTime), pin('pin-2', firstTime)], error: null })
  const inFilter = jest.fn(() => ({ is }))
  const select = jest.fn(() => ({ in: inFilter }))
  const from = jest.fn(() => ({ select }))
  workingClient.mockResolvedValue({ rpc, from } as never)

  const page = await fetchMyShadowPinConnectionFeed(null, 30)

  expect(page.images.map(image => image.id)).toEqual(['pin-2', 'pin-1'])
  expect(page.images.map(image => image.viewer_has_hearted)).toEqual([true, false])
  expect(page.hasMore).toBe(true)
  expect(page.nextCursor).toEqual({ createdAt: secondTime, id: 'pin-1' })
  expect(rpc).toHaveBeenCalledWith('list_my_shadow_pin_connection_feed', {
    result_limit: 30,
    before_created_at: null,
    before_id: null,
  })
  expect(inFilter).toHaveBeenCalledWith('id', ['pin-2', 'pin-1'])
})

test('advances from the authoritative RPC cursor when hydrated rows disappear', async () => {
  const firstTime = '2026-07-13T22:00:00Z'
  const secondTime = '2026-07-13T21:00:00Z'
  const rpc = jest.fn().mockResolvedValue({
    data: [
      { image_id: 'pin-2', created_at: firstTime, viewer_has_hearted: false, has_more: true },
      { image_id: 'pin-1', created_at: secondTime, viewer_has_hearted: false, has_more: true },
    ],
    error: null,
  })
  const is = jest.fn().mockResolvedValue({ data: [], error: null })
  const from = jest.fn(() => ({ select: () => ({ in: () => ({ is }) }) }))
  workingClient.mockResolvedValue({ rpc, from } as never)

  const page = await fetchMyShadowPinConnectionFeed(null, 30)

  expect(page.images).toEqual([])
  expect(page.hasMore).toBe(true)
  expect(page.nextCursor).toEqual({ createdAt: secondTime, id: 'pin-1' })
})

test('resolves a cold Connections Theater target and ordered neighbors', async () => {
  const rows = [
    { image_id: 'newer', created_at: '2026-07-13T23:00:00Z', viewer_has_hearted: false, window_position: 'newer' },
    { image_id: 'target', created_at: '2026-07-13T22:00:00Z', viewer_has_hearted: true, window_position: 'target' },
    { image_id: 'older', created_at: '2026-07-13T21:00:00Z', viewer_has_hearted: false, window_position: 'older' },
  ]
  const rpc = jest.fn().mockResolvedValue({ data: rows, error: null })
  const is = jest.fn().mockResolvedValue({
    data: [pin('older', rows[2].created_at), pin('target', rows[1].created_at), pin('newer', rows[0].created_at)],
    error: null,
  })
  const from = jest.fn(() => ({ select: () => ({ in: () => ({ is }) }) }))
  workingClient.mockResolvedValue({ rpc, from } as never)

  const windowResult = await fetchMyShadowPinConnectionFeedWindow('target')

  expect(windowResult.target?.id).toBe('target')
  expect(windowResult.target?.viewer_has_hearted).toBe(true)
  expect(windowResult.images.map(image => image.id)).toEqual(['newer', 'target', 'older'])
})
