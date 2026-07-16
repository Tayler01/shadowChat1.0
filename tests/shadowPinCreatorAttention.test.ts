import {
  creatorLocalDraftNeedsAttention,
  hasCreatorDraftsNeedingAttention,
} from '../src/features/shadow-pin/creator/creatorAttention'
import type { CreatorLocalDraft } from '../src/features/shadow-pin/creator/creatorModel'

const mockGetWorkingClient = jest.fn()
const mockLoadCreatorLocalDraft = jest.fn()
const mockClearCreatorLocalDraft = jest.fn()

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: (...args: unknown[]) => mockGetWorkingClient(...args),
}))

jest.mock('../src/features/shadow-pin/creator/creatorLocalStore', () => ({
  loadCreatorLocalDraft: (...args: unknown[]) => mockLoadCreatorLocalDraft(...args),
  clearCreatorLocalDraft: (...args: unknown[]) => mockClearCreatorLocalDraft(...args),
}))

const localDraft = (overrides: Partial<CreatorLocalDraft> = {}): CreatorLocalDraft => ({
  draftId: null,
  targetImageId: null,
  clientMutationId: 'mutation-1',
  step: 'media',
  values: {
    categoryId: '',
    title: '',
    description: '',
    tags: [],
    sourceMode: 'file',
    sourceUrl: '',
    fileFingerprint: null,
    keepExistingMedia: false,
  },
  dirtyRevision: 0,
  savedRevision: 0,
  updatedAt: '2026-07-15T12:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockLoadCreatorLocalDraft.mockReturnValue(null)
})

test('ignores the empty local snapshot created by opening Creator Studio', () => {
  expect(creatorLocalDraftNeedsAttention(localDraft())).toBe(false)
})

test('recognizes unsynced or meaningful local creator work', () => {
  expect(creatorLocalDraftNeedsAttention(localDraft({ dirtyRevision: 1 }))).toBe(true)
  expect(creatorLocalDraftNeedsAttention(localDraft({
    values: {
      ...localDraft().values,
      title: 'Half-finished Pin',
    },
  }))).toBe(true)
  expect(creatorLocalDraftNeedsAttention(localDraft({
    values: {
      ...localDraft().values,
      fileFingerprint: {
        name: 'pin.jpg',
        size: 1024,
        type: 'image/jpeg',
        lastModified: 1,
      },
    },
  }))).toBe(true)
})

test('clears a stale local receipt when its server draft is no longer active', async () => {
  mockLoadCreatorLocalDraft.mockReturnValue(localDraft({
    draftId: 'published-draft',
    values: {
      ...localDraft().values,
      title: 'Already published',
      sourceMode: 'url',
      sourceUrl: 'https://example.com/published.jpg',
    },
  }))
  const limit = jest.fn().mockResolvedValue({ data: [], error: null })
  const inFilter = jest.fn(() => ({ limit }))
  const eqCreator = jest.fn(() => ({ in: inFilter }))
  const select = jest.fn(() => ({ eq: eqCreator }))
  mockGetWorkingClient.mockResolvedValue({
    from: jest.fn(() => ({ select })),
  })

  await expect(hasCreatorDraftsNeedingAttention('user-1')).resolves.toBe(false)
  expect(mockClearCreatorLocalDraft).toHaveBeenCalledWith('user-1')
})

test('keeps a matching active server draft visible for recovery', async () => {
  mockLoadCreatorLocalDraft.mockReturnValue(localDraft({
    draftId: 'draft-1',
    dirtyRevision: 2,
    savedRevision: 1,
  }))
  const limit = jest.fn().mockResolvedValue({ data: [{ id: 'draft-1' }], error: null })
  const inFilter = jest.fn(() => ({ limit }))
  const eqCreator = jest.fn(() => ({ in: inFilter }))
  const select = jest.fn(() => ({ eq: eqCreator }))
  mockGetWorkingClient.mockResolvedValue({
    from: jest.fn(() => ({ select })),
  })

  await expect(hasCreatorDraftsNeedingAttention('user-1')).resolves.toBe(true)
  expect(mockClearCreatorLocalDraft).not.toHaveBeenCalled()
})
