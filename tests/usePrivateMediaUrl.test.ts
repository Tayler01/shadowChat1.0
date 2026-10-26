
import { act, renderHook, waitFor } from '@testing-library/react'
import { usePrivateMediaUrl } from '../src/hooks/usePrivateMediaUrl'
import { resolvePrivateMediaSource } from '../src/lib/privateMediaUrls'

let mockGeneration = 0
const mockListeners = new Set<() => void>()
jest.mock('../src/lib/privateMediaUrls', () => ({
  PRIVATE_MEDIA_ENABLED: true,
  PRIVATE_MEDIA_REFRESH_MARGIN_MS: 30_000,
  getPrivateMediaGeneration: () => mockGeneration,
  requiresPrivateMediaUrl: (value: string) => Boolean(value?.startsWith('private:')),
  resolvePrivateMediaSource: jest.fn(),
  subscribePrivateMediaInvalidation: (listener: () => void) => {
    mockListeners.add(listener)
    return () => mockListeners.delete(listener)
  },
}))

const resolve = resolvePrivateMediaSource as jest.Mock
beforeEach(() => {
  mockGeneration = 0
  resolve.mockReset().mockResolvedValue({ url: 'https://signed.example/one', expiresAt: Date.now() + 600_000 })
})
afterEach(() => { jest.useRealTimers() })

test('keeps a pending/denied private source absent and never renders its stored public URL', async () => {
  resolve.mockRejectedValue(new Error('forbidden'))
  const { result } = renderHook(() => usePrivateMediaUrl('private:one'))
  expect(result.current).toBeUndefined()
  await waitFor(() => expect(resolve).toHaveBeenCalled())
  expect(result.current).toBeUndefined()
})

test('clears an old item immediately when the source changes and ignores its late response', async () => {
  let finishOld: (value: unknown) => void = () => undefined
  resolve.mockImplementationOnce(() => new Promise(done => { finishOld = done }))
  const { result, rerender } = renderHook(({ source }) => usePrivateMediaUrl(source), { initialProps: { source: 'private:old' } })
  rerender({ source: 'private:new' })
  await waitFor(() => expect(result.current).toBe('https://signed.example/one'))
  await act(async () => { finishOld({ url: 'https://signed.example/old', expiresAt: Date.now() + 600_000 }) })
  expect(result.current).toBe('https://signed.example/one')
})

test('drops displayed access immediately on invalidation and reauthorizes', async () => {
  const { result } = renderHook(() => usePrivateMediaUrl('private:one'))
  await waitFor(() => expect(result.current).toBe('https://signed.example/one'))
  resolve.mockRejectedValue(new Error('blocked'))
  await act(async () => {
    mockGeneration += 1
    mockListeners.forEach(listener => listener())
  })
  expect(result.current).toBeUndefined()
})

test('renews before a signed URL expires', async () => {
  jest.useFakeTimers()
  resolve.mockResolvedValue({ url: 'https://signed.example/one', expiresAt: Date.now() + 40_000 })
  const { result } = renderHook(() => usePrivateMediaUrl('private:one'))
  await act(async () => { await Promise.resolve() })
  expect(result.current).toBe('https://signed.example/one')
  resolve.mockResolvedValue({ url: 'https://signed.example/two', expiresAt: Date.now() + 600_000 })
  await act(async () => { jest.advanceTimersByTime(10_000) })
  expect(result.current).toBe('https://signed.example/two')
})

test('skips hidden/disabled previews and passes ordinary external media through', () => {
  const disabled = renderHook(() => usePrivateMediaUrl('private:one', { enabled: false }))
  expect(disabled.result.current).toBeUndefined()
  const external = renderHook(() => usePrivateMediaUrl('https://ordinary.example/image.png'))
  expect(external.result.current).toBe('https://ordinary.example/image.png')
  expect(resolve).not.toHaveBeenCalled()
})
