import { act, renderHook, waitFor } from '@testing-library/react'
import {
  listMyInnerCircleMembers,
  listMyInnerCircles,
  listMyShadowPinCircleFeed,
  mutateMyInnerCircle,
  mutateMyInnerCircleMember,
  setMyInnerCircleMembers,
} from '../src/features/inner-circles/innerCirclesApi'
import {
  invalidateInnerCircles,
  useInnerCircleMembers,
  useInnerCircles,
} from '../src/features/inner-circles/useInnerCircles'
import {
  invalidateInnerCircleFeeds,
  useInnerCircleFeed,
} from '../src/features/inner-circles/useInnerCircleFeed'
import { toggleShadowPinImageHeart } from '../src/features/shadow-pin/api/shadowPinApi'

let activeUserId = 'inner-circle-user-1'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: activeUserId ? { id: activeUserId } : null }),
}))

jest.mock('../src/features/inner-circles/innerCirclesApi', () => ({
  createInnerCircleId: jest.fn(() => '11111111-1111-4111-8111-111111111111'),
  listMyInnerCircleMembers: jest.fn(),
  listMyInnerCircles: jest.fn(),
  listMyShadowPinCircleFeed: jest.fn(),
  mutateMyInnerCircle: jest.fn(),
  mutateMyInnerCircleMember: jest.fn(),
  setMyInnerCircleMembers: jest.fn(),
}))

jest.mock('../src/features/shadow-pin/api/shadowPinApi', () => ({
  toggleShadowPinImageHeart: jest.fn(),
}))

const fetchCircles = listMyInnerCircles as jest.MockedFunction<typeof listMyInnerCircles>
const fetchMembers = listMyInnerCircleMembers as jest.MockedFunction<typeof listMyInnerCircleMembers>
const fetchFeed = listMyShadowPinCircleFeed as jest.MockedFunction<typeof listMyShadowPinCircleFeed>
const mutateCircle = mutateMyInnerCircle as jest.MockedFunction<typeof mutateMyInnerCircle>
const mutateMember = mutateMyInnerCircleMember as jest.MockedFunction<typeof mutateMyInnerCircleMember>
const setMembers = setMyInnerCircleMembers as jest.MockedFunction<typeof setMyInnerCircleMembers>
const toggleHeart = toggleShadowPinImageHeart as jest.MockedFunction<typeof toggleShadowPinImageHeart>

const circle = (id: string, name = `Circle ${id}`) => ({
  id,
  name,
  revision: 2,
  memberCount: 1,
  createdAt: '2026-07-13T20:00:00Z',
  updatedAt: '2026-07-13T21:00:00Z',
})

const profile = (id: string) => ({
  id,
  username: id,
  display_name: `Member ${id}`,
})

const member = (id: string) => ({
  circleId: 'circle-1',
  memberId: id,
  addedAt: '2026-07-13T21:00:00Z',
  profile: profile(id),
})

const image = (id: string) => ({
  id,
  category_id: 'category-1',
  creator_id: 'creator-1',
  title: `Pin ${id}`,
  image_url: `https://images.example/${id}.jpg`,
  media_type: 'image' as const,
  processing_status: 'ready' as const,
  heart_count: 0,
  comment_count: 0,
  viewer_has_hearted: false,
  created_at: '2026-07-13T22:00:00Z',
  updated_at: '2026-07-13T22:00:00Z',
})

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
  activeUserId = `inner-circle-user-${Math.random()}`
  invalidateInnerCircles()
  invalidateInnerCircleFeeds()
  jest.clearAllMocks()
  fetchCircles.mockResolvedValue([])
  fetchMembers.mockResolvedValue([])
  fetchFeed.mockResolvedValue({ images: [], nextCursor: null, hasMore: false })
})

test('does no eager circle, member, or feed work while each hook is unused', async () => {
  renderHook(() => useInnerCircles(false))
  renderHook(() => useInnerCircleMembers(null, true))
  renderHook(() => useInnerCircleFeed(null, true))
  await act(async () => Promise.resolve())
  expect(fetchCircles).not.toHaveBeenCalled()
  expect(fetchMembers).not.toHaveBeenCalled()
  expect(fetchFeed).not.toHaveBeenCalled()
})

test('never paints a previous account circle list while the next account loads', async () => {
  const nextAccount = deferred<Awaited<ReturnType<typeof listMyInnerCircles>>>()
  fetchCircles
    .mockResolvedValueOnce([circle('first-account')])
    .mockReturnValueOnce(nextAccount.promise)
  const { result, rerender } = renderHook(() => useInnerCircles(true))
  await waitFor(() => expect(result.current.circles.map(item => item.id)).toEqual(['first-account']))

  activeUserId = `next-account-${Math.random()}`
  rerender()
  await waitFor(() => expect(result.current.loading).toBe(true))
  expect(result.current.circles).toEqual([])

  await act(async () => {
    nextAccount.resolve([circle('second-account')])
    await nextAccount.promise
  })
  await waitFor(() => expect(result.current.circles.map(item => item.id)).toEqual(['second-account']))
})

test('optimistically renames a circle and restores it when the RPC fails', async () => {
  const rename = deferred<Awaited<ReturnType<typeof mutateMyInnerCircle>>>()
  fetchCircles.mockResolvedValue([circle('circle-1', 'Original')])
  mutateCircle.mockReturnValue(rename.promise)
  const { result } = renderHook(() => useInnerCircles(true))
  await waitFor(() => expect(result.current.circles[0]?.name).toBe('Original'))

  let pending!: Promise<unknown>
  act(() => {
    pending = result.current.renameCircle('circle-1', 'Renamed')
  })
  expect(result.current.circles[0]?.name).toBe('Renamed')

  await act(async () => {
    rename.reject(new Error('stale revision'))
    await expect(pending).rejects.toThrow('stale revision')
  })
  expect(result.current.circles[0]?.name).toBe('Original')
  expect(result.current.error).toBe('stale revision')
})

test('optimistically removes a member and restores the exact order on failure', async () => {
  const removal = deferred<Awaited<ReturnType<typeof mutateMyInnerCircleMember>>>()
  fetchMembers.mockResolvedValue([member('member-1'), member('member-2')])
  mutateMember.mockReturnValue(removal.promise)
  const { result } = renderHook(() => useInnerCircleMembers('circle-1', true))
  await waitFor(() => expect(result.current.members).toHaveLength(2))

  let pending!: Promise<unknown>
  act(() => {
    pending = result.current.removeMember('member-1')
  })
  expect(result.current.members.map(item => item.memberId)).toEqual(['member-2'])

  await act(async () => {
    removal.reject(new Error('connection changed'))
    await expect(pending).rejects.toThrow('connection changed')
  })
  expect(result.current.members.map(item => item.memberId)).toEqual(['member-1', 'member-2'])
})

test('optimistically replaces the full member selection and rolls it back atomically', async () => {
  const replacement = deferred<Awaited<ReturnType<typeof setMyInnerCircleMembers>>>()
  fetchMembers.mockResolvedValue([member('member-1'), member('member-2')])
  setMembers.mockReturnValue(replacement.promise)
  const { result } = renderHook(() => useInnerCircleMembers('circle-1', true))
  await waitFor(() => expect(result.current.members).toHaveLength(2))

  let pending!: Promise<unknown>
  act(() => {
    pending = result.current.setMembers([profile('member-2'), profile('member-3')])
  })
  expect(result.current.members.map(item => item.memberId)).toEqual(['member-2', 'member-3'])
  expect(setMembers).toHaveBeenCalledWith('circle-1', ['member-2', 'member-3'])

  await act(async () => {
    replacement.reject(new Error('connection changed during save'))
    await expect(pending).rejects.toThrow('connection changed during save')
  })
  expect(result.current.members.map(item => item.memberId)).toEqual(['member-1', 'member-2'])
  expect(result.current.error).toBe('connection changed during save')
})

test('fails closed immediately and revalidates a mounted circle feed on relationship change', async () => {
  const revalidation = deferred<Awaited<ReturnType<typeof listMyShadowPinCircleFeed>>>()
  fetchFeed
    .mockResolvedValueOnce({ images: [image('connected')], nextCursor: null, hasMore: false })
    .mockReturnValueOnce(revalidation.promise)
  const { result } = renderHook(() => useInnerCircleFeed('circle-1', true))
  await waitFor(() => expect(result.current.images.map(pin => pin.id)).toEqual(['connected']))

  act(() => window.dispatchEvent(new Event('shadowchat:connections-changed')))
  expect(result.current.images).toEqual([])
  expect(result.current.loading).toBe(true)

  await act(async () => {
    revalidation.resolve({ images: [], nextCursor: null, hasMore: false })
    await revalidation.promise
  })
  await waitFor(() => expect(result.current.loading).toBe(false))
})

test('rolls back a failed optimistic Pin heart without disturbing circle scope', async () => {
  const heart = deferred<Awaited<ReturnType<typeof toggleShadowPinImageHeart>>>()
  fetchFeed.mockResolvedValue({ images: [image('pin-1')], nextCursor: null, hasMore: false })
  toggleHeart.mockReturnValue(heart.promise)
  const { result } = renderHook(() => useInnerCircleFeed('circle-1', true))
  await waitFor(() => expect(result.current.images).toHaveLength(1))

  let pending!: Promise<unknown>
  act(() => {
    pending = result.current.toggleHeart(result.current.images[0])
  })
  expect(result.current.images[0].viewer_has_hearted).toBe(true)
  expect(result.current.images[0].heart_count).toBe(1)

  await act(async () => {
    heart.reject(new Error('heart failed'))
    await expect(pending).rejects.toThrow('heart failed')
  })
  expect(result.current.images[0].viewer_has_hearted).toBe(false)
  expect(result.current.images[0].heart_count).toBe(0)
})
