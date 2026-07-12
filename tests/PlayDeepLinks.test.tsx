import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShadoTvScreen } from '../src/features/entertainment/shado-tv/ShadoTvScreen'

const mockFetchCatalog = jest.fn()
const mockFetchProgress = jest.fn()

jest.mock('../src/features/entertainment/shado-tv/api', () => {
  const actual = jest.requireActual('../src/features/entertainment/shado-tv/api')
  return {
    ...actual,
    fetchShadoTvCatalog: (...args: unknown[]) => mockFetchCatalog(...args),
    fetchShadoTvWatchProgress: (...args: unknown[]) => mockFetchProgress(...args),
    recordShadoTvWatchEvent: jest.fn().mockResolvedValue(undefined),
    saveShadoTvWatchProgress: jest.fn().mockResolvedValue(undefined),
  }
})

beforeEach(() => {
  const { SHADO_TV_FALLBACK_CATALOG } = jest.requireActual('../src/features/entertainment/shado-tv/api')
  mockFetchCatalog.mockReset().mockResolvedValue(SHADO_TV_FALLBACK_CATALOG)
  mockFetchProgress.mockReset().mockResolvedValue(new Map())
})

test('Shado TV opens an exact video slug and reacts to a warm route update', async () => {
  const onVideoRoute = jest.fn()
  const { rerender } = render(
    <ShadoTvScreen onExit={jest.fn()} onVideoRoute={onVideoRoute} />
  )

  expect(await screen.findByRole('button', { name: 'Open The Chicken Snatchers' })).toBeInTheDocument()

  rerender(
    <ShadoTvScreen
      onExit={jest.fn()}
      initialVideoId="the-chicken-snatchers"
      onVideoRoute={onVideoRoute}
    />
  )

  expect(await screen.findByRole('heading', { name: 'The Chicken Snatchers' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Back within Shado TV' }))
  expect(onVideoRoute).toHaveBeenCalledWith('close-item', 'the-chicken-snatchers')

  await waitFor(() => expect(screen.getByRole('button', { name: 'Open The Chicken Snatchers' })).toBeInTheDocument())
})

test('Shado TV does not substitute a different episode for an unknown exact item', async () => {
  render(
    <ShadoTvScreen
      onExit={jest.fn()}
      initialVideoId="missing-video"
    />
  )

  expect(await screen.findByRole('heading', { name: 'Episode hidden' })).toBeInTheDocument()
})
