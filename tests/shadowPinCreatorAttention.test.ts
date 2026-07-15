import { creatorLocalDraftNeedsAttention } from '../src/features/shadow-pin/creator/creatorAttention'
import type { CreatorLocalDraft } from '../src/features/shadow-pin/creator/creatorModel'

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
