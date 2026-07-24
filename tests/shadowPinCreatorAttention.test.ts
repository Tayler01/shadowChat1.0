import {
  creatorLocalDraftNeedsAttention,
  creatorRemoteDraftNeedsAttention,
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

test('does not treat an untouched edit prefill as an unfinished local Pin', () => {
  expect(creatorLocalDraftNeedsAttention(localDraft({
    targetImageId: 'pin-1',
    values: {
      ...localDraft().values,
      title: 'Existing Pin',
      keepExistingMedia: true,
    },
  }))).toBe(false)

  expect(creatorLocalDraftNeedsAttention(localDraft({
    targetImageId: 'pin-1',
    dirtyRevision: 2,
    savedRevision: 1,
    values: {
      ...localDraft().values,
      title: 'Changed title',
      keepExistingMedia: true,
    },
  }))).toBe(true)

  expect(creatorLocalDraftNeedsAttention(localDraft({
    targetImageId: 'pin-1',
    values: {
      ...localDraft().values,
      fileFingerprint: {
        name: 'replacement.jpg',
        size: 2048,
        type: 'image/jpeg',
        lastModified: 2,
      },
      keepExistingMedia: false,
    },
  }))).toBe(true)
})

const existingTarget = {
  id: 'pin-1',
  category_id: 'category-1',
  title: 'Existing Pin',
  description: 'Existing description',
  media_type: 'image',
  provider: 'shadow_pin_storage',
  image_url: 'https://example.com/original.jpg',
  image_path: 'owner/pin/original.jpg',
  thumbnail_url: 'https://example.com/thumb.webp',
  thumbnail_path: 'owner/pin/thumb.webp',
  medium_url: 'https://example.com/medium.webp',
  medium_path: 'owner/pin/medium.webp',
  source_url: null,
  provider_asset_id: null,
  video_preview_url: null,
  video_playback_url: null,
  video_hls_url: null,
  video_embed_url: null,
  tag_links: [{ tag: { slug: 'retro' } }],
}

const copiedTargetAsset = {
  id: 'asset-1',
  asset_kind: 'image',
  provider: 'shadow_pin_storage',
  final_image_url: existingTarget.image_url,
  final_image_path: existingTarget.image_path,
  final_thumbnail_url: existingTarget.thumbnail_url,
  final_thumbnail_path: existingTarget.thumbnail_path,
  final_medium_url: existingTarget.medium_url,
  final_medium_path: existingTarget.medium_path,
  source_url: null,
  provider_asset_id: null,
  video_preview_url: null,
  video_playback_url: null,
  video_hls_url: null,
  video_embed_url: null,
}

const copiedEditDraft = {
  id: 'draft-1',
  state: 'publish_ready' as const,
  category_id: existingTarget.category_id,
  title: existingTarget.title,
  description: existingTarget.description,
  tags: ['retro'],
  active_asset_id: copiedTargetAsset.id,
  target_image_id: existingTarget.id,
}

test('does not treat a copied edit receipt as unfinished server work', () => {
  expect(creatorRemoteDraftNeedsAttention(
    copiedEditDraft,
    copiedTargetAsset,
    existingTarget
  )).toBe(false)
})

test('keeps a changed edit draft visible for recovery', () => {
  expect(creatorRemoteDraftNeedsAttention(
    { ...copiedEditDraft, title: 'Unpublished title change' },
    copiedTargetAsset,
    existingTarget
  )).toBe(true)
  expect(creatorRemoteDraftNeedsAttention(
    copiedEditDraft,
    { ...copiedTargetAsset, final_image_path: 'owner/draft/replacement.jpg' },
    existingTarget
  )).toBe(true)
})

test('ignores an edit draft after its target Pin is no longer available', () => {
  expect(creatorRemoteDraftNeedsAttention(
    copiedEditDraft,
    copiedTargetAsset,
    undefined
  )).toBe(false)
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

test('does not show the attention pill for an untouched server editing draft', async () => {
  const limit = jest.fn().mockResolvedValue({
    data: [{
      id: 'blank-draft',
      state: 'editing',
      title: '',
      description: '',
      tags: [],
      active_asset_id: null,
      target_image_id: null,
    }],
    error: null,
  })
  const inFilter = jest.fn(() => ({ limit }))
  const eqCreator = jest.fn(() => ({ in: inFilter }))
  const select = jest.fn(() => ({ eq: eqCreator }))
  mockGetWorkingClient.mockResolvedValue({
    from: jest.fn(() => ({ select })),
  })

  await expect(hasCreatorDraftsNeedingAttention('user-1')).resolves.toBe(false)
})
