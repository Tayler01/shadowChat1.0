import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ShadowPinImage } from '../src/features/shadow-pin/types'
import type {
  ShadowPinCreatorAsset,
  ShadowPinCreatorDraft,
  ShadowPinCreatorDraftBundle,
} from '../src/features/shadow-pin/creator/creatorTypes'
import { ShadowPinCreatorStudio } from '../src/features/shadow-pin/creator/ShadowPinCreatorStudio'

const mockCreateCreatorDraft = jest.fn()
const mockUpdateCreatorDraft = jest.fn()
const mockStageCreatorDraftMedia = jest.fn()
const mockPublishCreatorDraft = jest.fn()
const mockListCreatorDrafts = jest.fn()
const mockLoadCreatorLocalDraft = jest.fn()
const mockSaveCreatorLocalDraft = jest.fn()
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
  loadCreatorLocalDraft: (...args: unknown[]) => mockLoadCreatorLocalDraft(...args),
  saveCreatorLocalDraft: (...args: unknown[]) => mockSaveCreatorLocalDraft(...args),
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

const draft = (
  revision: number,
  state: ShadowPinCreatorDraft['state'],
  overrides: Partial<ShadowPinCreatorDraft> = {}
): ShadowPinCreatorDraft => ({
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
  ...overrides,
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
  mockLoadCreatorLocalDraft.mockReturnValue(null)
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

test('keeps a newer dirty local snapshot over an older matching server draft', async () => {
  const serverDraft = draft(4, 'editing', {
    title: 'Older server title',
    updatedAt: '2026-07-12T00:00:04Z',
  })
  mockLoadCreatorLocalDraft.mockReturnValue({
    draftId: 'draft-1',
    targetImageId: null,
    clientMutationId: 'mutation-1',
    step: 'details',
    values: {
      categoryId: 'category-1',
      title: 'Newer local title',
      description: 'Unsynced local description',
      tags: ['local'],
      sourceMode: 'url',
      sourceUrl: 'https://example.com/local.jpg',
      fileFingerprint: null,
      keepExistingMedia: false,
    },
    dirtyRevision: 6,
    savedRevision: 4,
    updatedAt: '2026-07-12T00:00:05Z',
  })
  mockListCreatorDrafts.mockResolvedValue([{ draft: serverDraft, asset: readyAsset }])

  render(
    <ShadowPinCreatorStudio
      open
      onClose={jest.fn()}
      onPublished={jest.fn()}
    />
  )

  await waitFor(() => expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Newer local title'))
  expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Unsynced local description')
})

test('flushes the outgoing draft before switching draft contexts', async () => {
  const first = draft(3, 'ready', { id: 'draft-1', title: 'First draft' })
  const second = draft(5, 'ready', {
    id: 'draft-2',
    clientMutationId: 'mutation-2',
    title: 'Second draft',
    activeAssetId: 'asset-2',
  })
  const firstAsset = { ...readyAsset, draftId: first.id, sourceUrl: 'https://example.com/first.jpg' }
  const secondAsset = { ...readyAsset, id: 'asset-2', draftId: second.id, sourceUrl: 'https://example.com/second.jpg' }
  mockListCreatorDrafts.mockResolvedValue([
    { draft: first, asset: firstAsset },
    { draft: second, asset: secondAsset },
  ])
  mockUpdateCreatorDraft.mockImplementation(async (current: ShadowPinCreatorDraft, values: { title: string }) => ({
    draft: { ...current, title: values.title, revision: current.revision + 1 },
    asset: current.id === first.id ? firstAsset : secondAsset,
  }))

  render(
    <ShadowPinCreatorStudio
      open
      onClose={jest.fn()}
      onPublished={jest.fn()}
    />
  )

  await waitFor(() => expect(screen.getByRole('button', { name: /first draft/i })).toHaveAttribute('aria-pressed', 'true'))
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  const title = await screen.findByRole('textbox', { name: /title/i })
  fireEvent.change(title, { target: { value: 'Unsynced first draft' } })
  fireEvent.click(screen.getByRole('button', { name: /back/i }))
  fireEvent.click(await screen.findByRole('button', { name: /second draft/i }))

  await waitFor(() => expect(mockUpdateCreatorDraft).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'draft-1' }),
    expect.objectContaining({ title: 'Unsynced first draft' })
  ))
  await waitFor(() => expect(screen.getByRole('button', { name: /second draft/i })).toHaveAttribute('aria-pressed', 'true'))
})

test('does not let a delayed outgoing save receipt cross into the selected draft', async () => {
  const first = draft(3, 'ready', { id: 'draft-1', title: 'First draft' })
  const second = draft(5, 'ready', {
    id: 'draft-2',
    clientMutationId: 'mutation-2',
    title: 'Second draft',
    activeAssetId: 'asset-2',
  })
  const firstAsset = { ...readyAsset, draftId: first.id, sourceUrl: 'https://example.com/first.jpg' }
  const secondAsset = { ...readyAsset, id: 'asset-2', draftId: second.id, sourceUrl: 'https://example.com/second.jpg' }
  mockListCreatorDrafts.mockResolvedValue([
    { draft: first, asset: firstAsset },
    { draft: second, asset: secondAsset },
  ])
  let resolveOutgoing!: (bundle: ShadowPinCreatorDraftBundle) => void
  mockUpdateCreatorDraft.mockReturnValue(new Promise<ShadowPinCreatorDraftBundle>(resolve => {
    resolveOutgoing = resolve
  }))

  render(
    <ShadowPinCreatorStudio
      open
      onClose={jest.fn()}
      onPublished={jest.fn()}
    />
  )

  await waitFor(() => expect(screen.getByRole('button', { name: /first draft/i })).toHaveAttribute('aria-pressed', 'true'))
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  fireEvent.change(await screen.findByRole('textbox', { name: /title/i }), {
    target: { value: 'Pending first draft edit' },
  })
  fireEvent.click(screen.getByRole('button', { name: /back/i }))
  fireEvent.click(await screen.findByRole('button', { name: /second draft/i }))

  await act(async () => {
    resolveOutgoing({
      draft: { ...first, title: 'Late first-draft receipt', revision: 4 },
      asset: firstAsset,
    })
  })

  await waitFor(() => expect(screen.getByRole('button', { name: /second draft/i })).toHaveAttribute('aria-pressed', 'true'))
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  expect(await screen.findByRole('textbox', { name: /title/i })).toHaveValue('Second draft')
  expect(screen.queryByDisplayValue('Late first-draft receipt')).not.toBeInTheDocument()
})

test('flushes unsaved metadata when browser Back closes Studio', async () => {
  const onClose = jest.fn()
  render(
    <ShadowPinCreatorStudio
      open
      initialCategoryId="category-1"
      initialMediaUrl="https://example.com/back-safe.jpg"
      initialTitle="Back-safe draft"
      onClose={onClose}
      onPublished={jest.fn()}
    />
  )

  await waitFor(() => expect(screen.getByLabelText(/public media url/i)).toHaveValue('https://example.com/back-safe.jpg'))
  fireEvent.popState(window)

  expect(mockCreateCreatorDraft).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Back-safe draft' }),
    null,
    expect.any(String)
  )
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})

test('keeps the dirty local retry snapshot and closes when Back cannot reach the server', async () => {
  const onClose = jest.fn()
  mockCreateCreatorDraft.mockRejectedValue(new Error('offline'))
  render(
    <ShadowPinCreatorStudio
      open
      initialCategoryId="category-1"
      initialMediaUrl="https://example.com/offline.jpg"
      initialTitle="Offline-safe draft"
      onClose={onClose}
      onPublished={jest.fn()}
    />
  )

  await waitFor(() => expect(screen.getByLabelText(/public media url/i)).toHaveValue('https://example.com/offline.jpg'))
  fireEvent.popState(window)

  await waitFor(() => expect(mockSaveCreatorLocalDraft).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({
      values: expect.objectContaining({ title: 'Offline-safe draft' }),
    })
  ))
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})
