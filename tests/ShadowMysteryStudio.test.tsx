import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShadowMysteryStudio } from '../src/components/settings/ShadowMysteryStudio'

const mockFetchStories = jest.fn()
const mockCreateStory = jest.fn()
const mockUpdateStory = jest.fn()
const mockSetStatus = jest.fn()
const mockDeleteStory = jest.fn()
const mockCreateChapter = jest.fn()

jest.mock('../src/features/entertainment/shadow-mystery/api', () => ({
  fetchShadowMysteryAdminStories: (...args: unknown[]) => mockFetchStories(...args),
  createShadowMysteryStory: (...args: unknown[]) => mockCreateStory(...args),
  updateShadowMysteryStory: (...args: unknown[]) => mockUpdateStory(...args),
  setShadowMysteryPublicationStatus: (...args: unknown[]) => mockSetStatus(...args),
  deleteShadowMysteryStory: (...args: unknown[]) => mockDeleteStory(...args),
  createShadowMysteryChapter: (...args: unknown[]) => mockCreateChapter(...args),
  updateShadowMysteryChapter: jest.fn(),
  deleteShadowMysteryChapter: jest.fn(),
  createShadowMysterySource: jest.fn(),
  updateShadowMysterySource: jest.fn(),
  deleteShadowMysterySource: jest.fn(),
  uploadShadowMysteryArtwork: jest.fn(),
  updateShadowMysteryArtworkMetadata: jest.fn(),
  deleteShadowMysteryArtwork: jest.fn(),
  slugifyShadowMysteryValue: (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  paragraphsFromShadowMysteryDraft: (value: string) => value.split(/\n\s*\n/).map(item => item.trim()).filter(Boolean),
}))

const story = {
  id: 'story-1',
  legacyStoryId: null,
  slug: 'the-dimming-road',
  title: 'The Dimming Road',
  subtitle: 'A Shadow Mystery case',
  locationLabel: 'East Tennessee',
  deck: 'A road vanishes after midnight.',
  readTimeMinutes: 12,
  status: 'draft',
  publishedAt: '2026-07-10',
  coverImage: undefined,
  headerImage: undefined,
  chapters: [],
  sources: [],
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
}

describe('ShadowMysteryStudio', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetchStories.mockResolvedValue([story])
    mockUpdateStory.mockResolvedValue(undefined)
    mockSetStatus.mockResolvedValue(undefined)
    mockCreateChapter.mockResolvedValue({ id: 'chapter-1' })
  })

  it('lets an operator edit, publish, and add an ordered chapter from a phone-friendly workspace', async () => {
    render(<ShadowMysteryStudio />)

    expect(await screen.findByDisplayValue('The Dimming Road')).toBeInTheDocument()
    expect(screen.getByText(/four bundled v1 stories remain available/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The Dimming Highway' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mockUpdateStory).toHaveBeenCalledWith(
        'story-1',
        expect.objectContaining({ title: 'The Dimming Highway' })
      )
    })

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }))
    await waitFor(() => {
      expect(mockSetStatus).toHaveBeenCalledWith('story-1', 'published', '2026-07-10')
    })

    fireEvent.click(screen.getByRole('button', { name: /add chapter/i }))
    await waitFor(() => {
      expect(mockCreateChapter).toHaveBeenCalledWith(
        'story-1',
        expect.objectContaining({ title: 'Untitled Chapter', sortOrder: 10 })
      )
    })
  })
})
