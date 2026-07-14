import { getWorkingClient } from '../src/lib/supabase'
import {
  getMyShadowPinCircleFeedWindow,
  listMyInnerCircleMembers,
  listMyInnerCircles,
  listMyShadowPinCircleFeed,
  mutateMyInnerCircle,
  mutateMyInnerCircleMember,
  setMyInnerCircleMembers,
} from '../src/features/inner-circles/innerCirclesApi'

jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(),
  getSessionWithTimeout: jest.fn(),
  getWorkingClient: jest.fn(),
  uploadShadowPinImage: jest.fn(),
}))

const workingClient = getWorkingClient as jest.MockedFunction<typeof getWorkingClient>

const circleRow = {
  id: 'circle-1',
  name: 'Close friends',
  revision: 2,
  member_count: 1,
  created_at: '2026-07-13T20:00:00Z',
  updated_at: '2026-07-13T21:00:00Z',
}

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

beforeEach(() => {
  jest.clearAllMocks()
})

test('uses the exact owner-scoped circle and member RPC contracts', async () => {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: [circleRow], error: null })
    .mockResolvedValueOnce({
      data: [{
        circle_id: 'circle-1',
        member_id: 'member-1',
        added_at: '2026-07-13T21:00:00Z',
        profile: { id: 'member-1', username: 'shadow', display_name: 'Shadow' },
      }],
      error: null,
    })
    .mockResolvedValueOnce({ data: circleRow, error: null })
    .mockResolvedValueOnce({
      data: { circle_id: 'circle-1', member_id: 'member-1', is_member: false, changed: true },
      error: null,
    })
  workingClient.mockResolvedValue({ rpc } as never)

  await expect(listMyInnerCircles()).resolves.toHaveLength(1)
  await expect(listMyInnerCircleMembers('circle-1')).resolves.toHaveLength(1)
  await mutateMyInnerCircle('rename', {
    circleId: 'circle-1',
    name: '  Renamed circle ',
    expectedRevision: 2,
  })
  const memberResult = await mutateMyInnerCircleMember('circle-1', 'member-1', 'remove')
  expect(memberResult).toMatchObject({ isMember: false, removed: true, changed: true })

  expect(rpc).toHaveBeenNthCalledWith(1, 'list_my_inner_circles')
  expect(rpc).toHaveBeenNthCalledWith(2, 'list_my_inner_circle_members', {
    target_circle_id: 'circle-1',
  })
  expect(rpc).toHaveBeenNthCalledWith(3, 'mutate_my_inner_circle', {
    target_circle_id: 'circle-1',
    target_action: 'rename',
    target_name: 'Renamed circle',
    expected_revision: 2,
  })
  expect(rpc).toHaveBeenNthCalledWith(4, 'mutate_my_inner_circle_member', {
    target_circle_id: 'circle-1',
    target_member_id: 'member-1',
    target_action: 'remove',
  })
})

test('preserves a client circle UUID for idempotent create retries', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: circleRow, error: null })
  workingClient.mockResolvedValue({ rpc } as never)

  await mutateMyInnerCircle('create', { circleId: 'circle-retry-id', name: 'Friends' })

  expect(rpc).toHaveBeenCalledWith('mutate_my_inner_circle', {
    target_circle_id: 'circle-retry-id',
    target_action: 'create',
    target_name: 'Friends',
    expected_revision: null,
  })
})

test('sets the complete member selection through the exact atomic RPC', async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: [{
      circle_id: 'circle-1',
      revision: 4,
      member_count: 2,
      member_ids: ['member-2', 'member-1'],
      updated_at: '2026-07-13T22:00:00Z',
      changed: true,
    }],
    error: null,
  })
  workingClient.mockResolvedValue({ rpc } as never)

  await expect(setMyInnerCircleMembers('circle-1', [
    'member-2',
    'member-1',
    'member-2',
  ])).resolves.toEqual({
    circleId: 'circle-1',
    revision: 4,
    memberCount: 2,
    memberIds: ['member-2', 'member-1'],
    updatedAt: '2026-07-13T22:00:00Z',
    changed: true,
  })
  expect(rpc).toHaveBeenCalledWith('set_my_inner_circle_members', {
    target_circle_id: 'circle-1',
    target_member_ids: ['member-2', 'member-1'],
  })
})

test('hydrates a circle feed in authoritative keyset order and retains its RPC cursor', async () => {
  const firstTime = '2026-07-13T23:00:00Z'
  const secondTime = '2026-07-13T22:00:00Z'
  const rpc = jest.fn().mockResolvedValue({
    data: [
      { image_id: 'pin-2', created_at: firstTime, viewer_has_hearted: true, has_more: true },
      { image_id: 'pin-1', created_at: secondTime, viewer_has_hearted: false, has_more: true },
    ],
    error: null,
  })
  const is = jest.fn().mockResolvedValue({
    data: [pin('pin-1', secondTime), pin('pin-2', firstTime)],
    error: null,
  })
  const from = jest.fn(() => ({ select: () => ({ in: () => ({ is }) }) }))
  workingClient.mockResolvedValue({ rpc, from } as never)

  const page = await listMyShadowPinCircleFeed('circle-1', null, 30)

  expect(page.images.map(image => image.id)).toEqual(['pin-2', 'pin-1'])
  expect(page.images.map(image => image.viewer_has_hearted)).toEqual([true, false])
  expect(page.nextCursor).toEqual({ createdAt: secondTime, id: 'pin-1' })
  expect(page.hasMore).toBe(true)
  expect(rpc).toHaveBeenCalledWith('list_my_shadow_pin_circle_feed', {
    target_circle_id: 'circle-1',
    result_limit: 30,
    before_created_at: null,
    before_id: null,
  })
})

test('hydrates the exact circle-scoped Theater target and ordered window', async () => {
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

  const windowResult = await getMyShadowPinCircleFeedWindow('circle-1', 'target')

  expect(windowResult.target?.id).toBe('target')
  expect(windowResult.target?.viewer_has_hearted).toBe(true)
  expect(windowResult.images.map(image => image.id)).toEqual(['newer', 'target', 'older'])
  expect(rpc).toHaveBeenCalledWith('get_my_shadow_pin_circle_feed_window', {
    target_circle_id: 'circle-1',
    target_image_id: 'target',
  })
})
