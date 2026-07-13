import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ShadowPinImage } from '../src/features/shadow-pin/types'
import type {
  ShadowPinCreatorAsset,
  ShadowPinCreatorDraft,
} from '../src/features/shadow-pin/creator/creatorTypes'
import { ShadowPinCreatorStudio } from '../src/features/shadow-pin/creator/ShadowPinCreatorStudio'

const mockCreateCreatorDraft = jest.fn()
const mockUpdateCreatorDraft = jest.fn()
const mockStageCreatorDraftMedia = jest.fn()
const mockPublishCreatorDraft = jest.fn()
const mockListCreatorDrafts = jest.fn()
const mockClearCreatorLocalDraft = jest.fn()

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

jest.mock('../src/hooks/useComfortPreferences', () => ({
  useComfortPreferences: () => ({ isReducedMotion: false }),
}))

jest.mock('../src/hooks/useDialogAccessibility', () => ({
  useDialogAccessibility: () => ({ current: null }),
}))

jest.mock('../src/features/shadow-pin/hooks/useShadowPinCategories', () => ({
  useShadowPinCategories: () => ({
    categories: [{ id: 'category-1', title: 'Legends' }],
    loading: false,
    error: null,
  }),
}))

jest.mock('../src/features/shadow-pin/api/shadowPinApi', () => ({
  validateShadowPinFile: jest.fn(),
}))

jest.mock('../src/features/shadow-pin/creator/creatorLocalStore', () => ({
  loadCreatorLocalDraft: jest.fn(() => null),
  saveCreatorLocalDraft: jest.fn(),
  clearCreatorLocalDraft: (...args: unknown[]) => mockClearCreatorLocalDraft(...args),
}))

jest.mock('../src/features/shadow-pin/creator/creatorHistory', () => ({
  enterCreatorStudioHistory: jest.fn(),
  isCreatorStudioHistoryEntry: jest.fn(() => false),
  replaceCreatorStudioHistory: jest.fn(),
  requestCreatorStudioClose: jest.fn((close: () => void) => close()),
}))

jest.mock('../src/features/shadow-pin/creator/creatorApi', () => ({
  createCreatorDraft: (...args: unknown[]) => mockCreateCreatorDraft(...args),
  updateCreatorDraft: (...args: unknown[]) => mockUpdateCreatorDraft(...args),
  stageCreatorDraftMedia: (...args: unknown[]) => mockStageCreatorDraftMedia(...args),
  publishCreatorDraft: (...args: unknown[]) => mockPublishCreatorDraft(...args),
  listCreatorDrafts: (...args: unknown[]) => mockListCreatorDrafts(...args),
  deleteCreatorDraft: jest.fn(),
  inspectCreatorVideoFile: jest.fn(),
  syncCreatorDraftStatus: jest.fn(),
}))

const draft = (revision: number, state: ShadowPinCreatorDraft['state']): ShadowPinCreatorDraft => ({
  id: 'draft-1',
  creatorId: 'user-1',
  categoryId: 'category-1',
  targetImageId: null,
  clientMutationId: 'mutation-1',
  sourceKind: 'image_url',
  title: 'A new Pin',
  description: '',
  tags: [],
  state,
  revision,
  activeAssetId: revision > 1 ? 'asset-1' : null,
  publishedImageId: null,
  publishIdempotencyKey: 'publish-1',
  lastErrorCode: null,
  lastErrorMessage: null,
  expiresAt: null,
  createdAt: '2026-07-12T00:00:00Z',
  updatedAt: '2026-07-12T00:00:00Z',
  publishedAt: null,
})

const readyAsset: ShadowPinCreatorAsset = {
  id: 'asset-1',
  draftId: 'draft-1',
  generation: 1,
  assetKind: 'image',
  provider: 'shadow_pin_storage',
  state: 'publish_ready',
  storagePath: 'user-1/draft-1/original.webp',
  posterPath: null,
  previewUrl: 'https://signed.example/draft-preview.webp',
  playbackUrl: null,
  hlsUrl: null,
  embedUrl: null,
  mimeType: 'image/webp',
  sizeBytes: 123,
  width: 900,
  height: 1200,
  durationSeconds: null,
  sourceUrl: 'https://example.com/pin.jpg',
  providerAssetId: null,
  errorCode: null,
  errorMessage: null,
}

const publishedImage = {
  id: 'pin-1',
  category_id: 'category-1',
  title: 'A new Pin',
} as unknown as ShadowPinImage

beforeEach(() => {
  jest.clearAllMocks()
  mockListCreatorDrafts.mockResolvedValue([])
  mockCreateCreatorDraft.mockResolvedValue({ draft: draft(1, 'editing'), asset: null })
  mockUpdateCreatorDraft.mockResolvedValue({ draft: draft(3, 'publish_ready'), asset: readyAsset })
  mockStageCreatorDraftMedia.mockResolvedValue({ draft: draft(2, 'publish_ready'), asset: readyAsset })
  mockPublishCreatorDraft.mockResolvedValue({
    draft: { ...draft(4, 'published'), publishedImageId: 'pin-1' },
    image: publishedImage,
    wasAlreadyPublished: false,
  })
})

test('renders the URL prefill and blocks Details until a category is chosen', async () => {
  render(
    <ShadowPinCreatorStudio
      open
      initialMediaUrl="https://example.com/pin.jpg"
      initialTitle="A new Pin"
      onClose={jest.fn()}
      onPublished={jest.fn()}
    />
  )

  await waitFor(() => expect(screen.getByLabelText(/public media url/i)).toHaveValue('https://example.com/pin.jpg'))
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  expect(screen.getByTestId('creator-step-details')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a category.')
  expect(mockStageCreatorDraftMedia).not.toHaveBeenCalled()
})

test('moves through Preview and requires explicit confirmation before publishing', async () => {
  const onClose = jest.fn()
  const onPublished = jest.fn()
  render(
    <ShadowPinCreatorStudio
      open
      initialCategoryId="category-1"
      initialMediaUrl="https://example.com/pin.jpg"
      initialTitle="A new Pin"
      onClose={onClose}
      onPublished={onPublished}
    />
  )

  await waitFor(() => expect(screen.getByLabelText(/public media url/i)).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  })
  await waitFor(() => expect(screen.getByTestId('creator-step-preview')).toBeInTheDocument())
  expect(mockStageCreatorDraftMedia).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  const publishButton = screen.getByRole('button', { name: /publish pin/i })
  expect(publishButton).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /ready to publish/i }))
  expect(publishButton).toBeEnabled()

  await act(async () => {
    fireEvent.click(publishButton)
  })
  await waitFor(() => expect(onPublished).toHaveBeenCalledWith(publishedImage))
  expect(mockPublishCreatorDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 'draft-1' }), readyAsset)
  expect(mockClearCreatorLocalDraft).toHaveBeenCalledWith('user-1')
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('reopens a mounted Studio without leaking the previous create session', async () => {
  const props = {
    onClose: jest.fn(),
    onPublished: jest.fn(),
  }
  const view = render(
    <ShadowPinCreatorStudio
      {...props}
      open
      initialMediaUrl="https://example.com/first.jpg"
      initialTitle="First draft"
    />
  )
  await waitFor(() => expect(screen.getByLabelText(/public media url/i)).toHaveValue('https://example.com/first.jpg'))

  view.rerender(
    <ShadowPinCreatorStudio
      {...props}
      open={false}
      initialMediaUrl="https://example.com/second.jpg"
      initialTitle="Second draft"
    />
  )
  view.rerender(
    <ShadowPinCreatorStudio
      {...props}
      open
      initialMediaUrl="https://example.com/second.jpg"
      initialTitle="Second draft"
    />
  )

  await waitFor(() => expect(screen.getByLabelText(/public media url/i)).toHaveValue('https://example.com/second.jpg'))
  expect(screen.queryByDisplayValue('https://example.com/first.jpg')).not.toBeInTheDocument()
})
