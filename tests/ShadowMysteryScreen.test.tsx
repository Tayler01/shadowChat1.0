import { act, render, screen } from '@testing-library/react'
import { ShadowMysteryScreen } from '../src/features/entertainment/shadow-mystery/ShadowMysteryScreen'
import { getShadowMysteryStories, type ShadowMysteryStory } from '../src/features/entertainment/shadow-mystery/data'

const mockFetchCatalog = jest.fn()

jest.mock('../src/features/entertainment/shadow-mystery/api', () => ({
  fetchShadowMysteryCatalog: (...args: unknown[]) => mockFetchCatalog(...args),
}))

const publishedStory: ShadowMysteryStory = {
  id: 'database-case',
  slug: 'database-case',
  title: 'Database Case',
  subtitle: 'A live archive story',
  locationLabel: 'East Tennessee',
  publishedAt: '2026-07-10',
  readTimeMinutes: 9,
  deck: 'A database-published mystery.',
  coverAsset: '/entertainment/shadow-mystery/sleep-that-wouldnt-end-cover.webp',
  headerAsset: '/entertainment/shadow-mystery/sleep-that-wouldnt-end-header.webp',
  chapters: [{ id: 'opening', title: 'Opening', body: ['The archive opened.'] }],
  sources: [{ label: 'Archive', url: 'https://example.com/archive', usage: 'Case context.' }],
}

test('Shadow Mystery overlays published database stories without delaying bundled fallbacks', async () => {
  let resolveCatalog: ((catalog: { stories: ShadowMysteryStory[]; loadedFromSupabase: boolean }) => void) | undefined
  mockFetchCatalog.mockReturnValue(new Promise(resolve => {
    resolveCatalog = resolve
  }))

  render(<ShadowMysteryScreen onExit={jest.fn()} />)

  expect(screen.getByText('4 stories')).toBeInTheDocument()
  await act(async () => {
    resolveCatalog?.({
      stories: [publishedStory, ...getShadowMysteryStories()],
      loadedFromSupabase: true,
    })
  })
  expect(await screen.findByText('Database Case')).toBeInTheDocument()
  expect(screen.getByText('5 stories')).toBeInTheDocument()
})
