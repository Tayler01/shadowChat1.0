import { act, renderHook, waitFor } from '@testing-library/react'
import { getMyConnectionSummary } from '../src/features/connections/connectionsApi'
import {
  fetchMyShadowPinConnectionFeed,
  getMyShadowPinFeedMode,
  setMyShadowPinFeedMode,
} from '../src/features/shadow-pin/api/shadowPinApi'
import {
  invalidateShadowPinConnectionFeed,
  useShadowPinConnectionFeed,
} from '../src/features/shadow-pin/hooks/useShadowPinConnectionFeed'
import { useShadowPinFeedMode } from '../src/features/shadow-pin/hooks/useShadowPinFeedMode'

let activeUserId = 'feed-user-1'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: activeUserId ? { id: activeUserId } : null }),
}))

jest.mock('../src/features/connections/connectionsApi', () => ({
  getMyConnectionSummary: jest.fn(),
}))

jest.mock('../src/features/shadow-pin/api/shadowPinApi', () => ({
  fetchMyShadowPinConnectionFeed: jest.fn(),
  getMyShadowPinFeedMode: jest.fn(),
  setMyShadowPinFeedMode: jest.fn(),
  toggleShadowPinImageHeart: jest.fn(),
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}))

const fetchFeed = fetchMyShadowPinConnectionFeed as jest.MockedFunction<typeof fetchMyShadowPinConnectionFeed>
const fetchPreference = getMyShadowPinFeedMode as jest.MockedFunction<typeof getMyShadowPinFeedMode>
const savePreference = setMyShadowPinFeedMode as jest.MockedFunction<typeof setMyShadowPinFeedMode>
const fetchSummary = getMyConnectionSummary as jest.MockedFunction<typeof getMyConnectionSummary>

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

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

beforeEach(() => {
  activeUserId = `feed-user-${Math.random()}`
  invalidateShadowPinConnectionFeed()
  jest.clearAllMocks()
  fetchPreference.mockResolvedValue({ mode: 'discover', revision: 0, updatedAt: null })
  savePreference.mockResolvedValue({ mode: 'discover', revision: 1, updatedAt: '2026-07-13T22:00:00Z' })
  fetchSummary.mockResolvedValue({ acceptedCount: 0, incomingCount: 0, outgoingCount: 0 })
})

test('serializes rapid feed-mode saves so the final selection wins on the server', async () => {
  const firstSave = deferred<Awaited<ReturnType<typeof setMyShadowPinFeedMode>>>()
  savePreference
    .mockReturnValueOnce(firstSave.promise)
    .mockResolvedValueOnce({ mode: 'discover', revision: 2, updatedAt: '2026-07-13T22:00:01Z' })
  const onRouteModeChange = jest.fn()
  const { result } = renderHook(() => useShadowPinFeedMode('discover', onRouteModeChange))

  act(() => result.current.selectMode('connections'))
  await waitFor(() => expect(savePreference).toHaveBeenCalledTimes(1))
  act(() => window.dispatchEvent(new Event('focus')))
  expect(fetchPreference).not.toHaveBeenCalled()
  act(() => result.current.selectMode('discover'))

  expect(result.current.mode).toBe('discover')
  expect(onRouteModeChange.mock.calls.map(call => call[0])).toEqual(['connections', 'discover'])
  expect(savePreference).toHaveBeenCalledTimes(1)

  await act(async () => {
    firstSave.resolve({ mode: 'connections', revision: 1, updatedAt: '2026-07-13T22:00:00Z' })
    await firstSave.promise
  })

  await waitFor(() => expect(savePreference).toHaveBeenNthCalledWith(2, 'discover'))
  expect(result.current.saveError).toBeNull()
})

test('an empty Connections feed resolves once without a refresh loop', async () => {
  fetchFeed.mockResolvedValue({ images: [], nextCursor: null, hasMore: false })
  fetchSummary.mockResolvedValue({ acceptedCount: 3, incomingCount: 0, outgoingCount: 0 })

  const { result } = renderHook(() => useShadowPinConnectionFeed(true))

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.acceptedCount).toBe(3)
  expect(fetchFeed).toHaveBeenCalledTimes(1)
  expect(fetchSummary).toHaveBeenCalledTimes(1)
})

test('never shows a previous account feed while the next account is loading', async () => {
  const nextAccountFeed = deferred<Awaited<ReturnType<typeof fetchMyShadowPinConnectionFeed>>>()
  fetchFeed
    .mockResolvedValueOnce({ images: [image('first-account')], nextCursor: null, hasMore: false })
    .mockReturnValueOnce(nextAccountFeed.promise)

  const { result, rerender } = renderHook(() => useShadowPinConnectionFeed(true))
  await waitFor(() => expect(result.current.images.map(pin => pin.id)).toEqual(['first-account']))

  activeUserId = `feed-user-next-${Math.random()}`
  rerender()

  await waitFor(() => expect(result.current.loading).toBe(true))
  expect(result.current.images).toEqual([])

  await act(async () => {
    nextAccountFeed.resolve({ images: [image('next-account')], nextCursor: null, hasMore: false })
    await nextAccountFeed.promise
  })
  await waitFor(() => expect(result.current.images.map(pin => pin.id)).toEqual(['next-account']))
})

test('relationship invalidation clears a mounted feed before revalidation completes', async () => {
  const revalidation = deferred<Awaited<ReturnType<typeof fetchMyShadowPinConnectionFeed>>>()
  fetchFeed
    .mockResolvedValueOnce({ images: [image('connected')], nextCursor: null, hasMore: false })
    .mockReturnValueOnce(revalidation.promise)

  const { result } = renderHook(() => useShadowPinConnectionFeed(true))
  await waitFor(() => expect(result.current.images.map(pin => pin.id)).toEqual(['connected']))

  act(() => {
    window.dispatchEvent(new CustomEvent('shadowchat:connections-changed', {
      detail: { targetUserId: 'creator-1', state: 'none' },
    }))
  })

  expect(result.current.images).toEqual([])
  expect(result.current.loading).toBe(true)

  await act(async () => {
    revalidation.resolve({ images: [], nextCursor: null, hasMore: false })
    await revalidation.promise
  })
  await waitFor(() => expect(result.current.loading).toBe(false))
})

test('global relationship invalidation prevents stale cache after the feed unmounts', async () => {
  const remountFeed = deferred<Awaited<ReturnType<typeof fetchMyShadowPinConnectionFeed>>>()
  fetchFeed
    .mockResolvedValueOnce({ images: [image('cached')], nextCursor: null, hasMore: false })
    .mockReturnValueOnce(remountFeed.promise)

  const first = renderHook(() => useShadowPinConnectionFeed(true))
  await waitFor(() => expect(first.result.current.images.map(pin => pin.id)).toEqual(['cached']))
  first.unmount()

  act(() => {
    window.dispatchEvent(new CustomEvent('shadowchat:personal-blocks-changed', {
      detail: { userId: 'creator-1', blocked: true },
    }))
  })

  const second = renderHook(() => useShadowPinConnectionFeed(true))
  expect(second.result.current.images).toEqual([])
  expect(second.result.current.loading).toBe(true)

  await act(async () => {
    remountFeed.resolve({ images: [], nextCursor: null, hasMore: false })
    await remountFeed.promise
  })
})

test('revalidates an account-synced preference when the app regains focus', async () => {
  fetchPreference
    .mockResolvedValueOnce({ mode: 'discover', revision: 1, updatedAt: '2026-07-13T22:00:00Z' })
    .mockResolvedValueOnce({ mode: 'connections', revision: 2, updatedAt: '2026-07-13T22:01:00Z' })
  const onRouteModeChange = jest.fn()
  const { result } = renderHook(() => useShadowPinFeedMode(null, onRouteModeChange))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.mode).toBe('discover')

  act(() => window.dispatchEvent(new Event('focus')))

  await waitFor(() => expect(result.current.mode).toBe('connections'))
  expect(onRouteModeChange).toHaveBeenCalledWith('connections')
})
