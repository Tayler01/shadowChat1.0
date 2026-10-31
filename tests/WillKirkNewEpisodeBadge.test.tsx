import { act, render, screen } from '@testing-library/react'
import { WillKirkNewEpisodeBadge } from '../src/features/entertainment/will-kirk/WillKirkNewEpisodeBadge'
import { getNewEpisodeExpiry } from '../src/features/entertainment/will-kirk/catalog'
import { fetchWillKirkLatestRelease } from '../src/features/entertainment/will-kirk/api'

jest.mock('../src/features/entertainment/will-kirk/api', () => ({ fetchWillKirkLatestRelease: jest.fn() }))
const fetchRelease = jest.mocked(fetchWillKirkLatestRelease)
const now = Date.parse('2026-10-30T23:00:00Z')
const day = 86_400_000

test('new-episode window excludes future, invalid, missing and exactly 24-hour-old releases', () => {
  expect(getNewEpisodeExpiry(new Date(now - day + 1).toISOString(), now)).toBe(now + 1)
  expect(getNewEpisodeExpiry(new Date(now - day).toISOString(), now)).toBeNull()
  expect(getNewEpisodeExpiry(new Date(now + 1).toISOString(), now)).toBeNull()
  expect(getNewEpisodeExpiry('invalid', now)).toBeNull()
  expect(getNewEpisodeExpiry(null, now)).toBeNull()
})

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(now)
  jest.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  fetchRelease.mockReset()
})
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

test('expires at the release anniversary while the picker remains open, and cleans up timers', async () => {
  fetchRelease.mockResolvedValue(new Date(now - day + 1000).toISOString())
  const view = render(<WillKirkNewEpisodeBadge />)
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText('New episode')).toBeInTheDocument()
  act(() => { jest.advanceTimersByTime(1000) })
  expect(screen.queryByText('New episode')).not.toBeInTheDocument()
  view.unmount()
  expect(jest.getTimerCount()).toBe(0)
})

test('picks up a new release on return to the picker without creating a realtime subscription', async () => {
  fetchRelease.mockResolvedValueOnce(null).mockResolvedValue(new Date(now).toISOString())
  render(<WillKirkNewEpisodeBadge />)
  await act(async () => { await Promise.resolve() })
  expect(screen.queryByText('New episode')).not.toBeInTheDocument()
  await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve() })
  expect(screen.getByText('New episode')).toBeInTheDocument()
})
