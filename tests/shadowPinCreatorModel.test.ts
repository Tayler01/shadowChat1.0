import {
  CREATOR_STEPS,
  createInitialCreatorState,
  creatorLocalDraftHasUnsyncedChanges,
  creatorFileMatchesFingerprint,
  creatorReducer,
  fingerprintCreatorFile,
  inferCreatorSourceKind,
  serializeCreatorLocalDraft,
  shouldPreferLocalCreatorDraft,
  validateCreatorStep,
} from '../src/features/shadow-pin/creator/creatorModel'

describe('ShadowPin Creator Studio model', () => {
  test('starts in the media stage with an isolated category prefill', () => {
    const state = createInitialCreatorState('category-1')

    expect(CREATOR_STEPS).toEqual(['media', 'details', 'preview', 'publish'])
    expect(state).toMatchObject({
      step: 'media',
      operation: 'idle',
      progress: 0,
      dirtyRevision: 0,
      savedRevision: 0,
      values: { categoryId: 'category-1', sourceMode: 'file', file: null },
    })
  })

  test('normalizes edits, fingerprints files, and invalidates publish confirmation', () => {
    const file = new File(['image'], 'My Pin.PNG', {
      type: 'image/png',
      lastModified: 1234,
    })
    let state = createInitialCreatorState()
    state = creatorReducer(state, { type: 'publish-confirmed', confirmed: true })
    state = creatorReducer(state, {
      type: 'set-value',
      key: 'tags',
      value: [' Night Sky ', 'night sky', 'Odd & Ends'],
    })
    state = creatorReducer(state, { type: 'set-file', file })

    expect(state.values.tags).toEqual(['night-sky', 'odd-ends'])
    expect(state.values.fileFingerprint).toEqual(fingerprintCreatorFile(file))
    expect(creatorFileMatchesFingerprint(file, state.values.fileFingerprint)).toBe(true)
    expect(creatorFileMatchesFingerprint(
      new File(['different'], file.name, { type: file.type, lastModified: file.lastModified }),
      state.values.fileFingerprint
    )).toBe(false)
    expect(state.publishConfirmed).toBe(false)
    expect(state.dirtyRevision).toBe(2)
  })

  test('keeps save, failure, progress, restore, and reset transitions deterministic', () => {
    const draft = {
      id: 'draft-1', creatorId: 'user-1', categoryId: 'category-1', targetImageId: null,
      clientMutationId: 'mutation-1', sourceKind: 'image_url' as const, title: 'Title',
      description: '', tags: [], state: 'editing' as const, revision: 4, activeAssetId: null,
      publishedImageId: null, publishIdempotencyKey: 'publish-1', lastErrorCode: null,
      lastErrorMessage: null, expiresAt: null, createdAt: '2026-07-12T00:00:00Z',
      updatedAt: '2026-07-12T00:00:00Z', publishedAt: null,
    }
    let state = createInitialCreatorState()
    state = creatorReducer(state, { type: 'restore-started' })
    state = creatorReducer(state, {
      type: 'restored',
      values: { title: 'Recovered', sourceMode: 'url', sourceUrl: 'https://example.com/pin.jpg' },
      draft,
      step: 'details',
      recovered: true,
    })
    state = creatorReducer(state, { type: 'operation', operation: 'uploading', progress: 140 })
    state = creatorReducer(state, { type: 'operation', operation: 'failed', error: 'Retry safely', progress: -4 })
    state = creatorReducer(state, { type: 'draft-saved', draft, savedRevision: 6 })

    expect(state).toMatchObject({
      step: 'details', recovered: true, operation: 'saved', progress: 0,
      error: null, dirtyRevision: 4, savedRevision: 6, draft,
    })
    const reset = creatorReducer(state, { type: 'reset', categoryId: 'category-2' })
    expect(reset).toMatchObject({
      step: 'media', operation: 'idle', draft: null, dirtyRevision: 0, savedRevision: 0,
      values: { categoryId: 'category-2', title: '', file: null },
    })
    expect(reset.clientMutationId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(reset.clientMutationId).not.toBe(state.clientMutationId)
  })

  test('keeps an in-flight publish locked while only provider status is synchronized', () => {
    const original = {
      id: 'draft-1', creatorId: 'user-1', categoryId: 'category-1', targetImageId: null,
      clientMutationId: 'mutation-1', sourceKind: 'video_upload' as const, title: 'Video',
      description: '', tags: [], state: 'processing' as const, revision: 4, activeAssetId: 'asset-1',
      publishedImageId: null, publishIdempotencyKey: 'publish-1', lastErrorCode: null,
      lastErrorMessage: null, expiresAt: null, createdAt: '2026-07-24T00:00:00Z',
      updatedAt: '2026-07-24T00:00:00Z', publishedAt: null,
    }
    let state = creatorReducer(createInitialCreatorState(), {
      type: 'restored',
      values: { title: 'Video' },
      draft: original,
    })
    state = creatorReducer(state, { type: 'operation', operation: 'processing' })
    const synced = {
      ...original,
      state: 'ready' as const,
      updatedAt: '2026-07-24T00:01:00Z',
    }
    state = creatorReducer(state, { type: 'draft-status-synced', draft: synced })

    expect(state.draft).toEqual(synced)
    expect(state.operation).toBe('processing')
    expect(state.savedRevision).toBe(4)
  })

  test('validates only the requirements reached by each stage', () => {
    const values = createInitialCreatorState().values

    expect(validateCreatorStep('media', values)).toEqual(['Choose an image or short video.'])
    expect(validateCreatorStep('details', values)).toEqual(['Choose a category.', 'Add a title.'])

    const complete = {
      ...values,
      categoryId: 'category-1',
      title: 'A finished Pin',
      sourceMode: 'url' as const,
      sourceUrl: 'https://example.com/pin.jpg',
      tags: ['one', 'two'],
    }
    expect(validateCreatorStep('preview', complete)).toEqual([])
    expect(validateCreatorStep('publish', complete)).toEqual([])
    expect(validateCreatorStep('publish', { ...complete, sourceUrl: 'javascript:alert(1)' }))
      .toContain('Use a public http or https URL.')
  })

  test('allows a complete Pin to publish without tags', () => {
    const tagless = {
      ...createInitialCreatorState().values,
      categoryId: 'category-1',
      title: 'A tag-free Pin',
      sourceMode: 'url' as const,
      sourceUrl: 'https://example.com/pin.jpg',
      tags: [],
    }

    expect(validateCreatorStep('details', tagless)).toEqual([])
    expect(validateCreatorStep('preview', tagless)).toEqual([])
    expect(validateCreatorStep('publish', tagless)).toEqual([])
  })

  test('infers supported upload and URL source kinds', () => {
    const base = createInitialCreatorState().values
    expect(inferCreatorSourceKind({ ...base, file: new File(['x'], 'pin.webp', { type: 'image/webp' }) }))
      .toBe('image_upload')
    expect(inferCreatorSourceKind({ ...base, file: new File(['x'], 'pin.mp4', { type: 'video/mp4' }) }))
      .toBe('video_upload')
    expect(inferCreatorSourceKind({ ...base, sourceMode: 'url', sourceUrl: 'https://youtu.be/abc' }))
      .toBe('external_video')
    expect(inferCreatorSourceKind({ ...base, sourceMode: 'url', sourceUrl: 'https://example.com/pin.jpg' }))
      .toBe('image_url')
  })

  test('serializes recovery metadata without persisting the File object', () => {
    const file = new File(['secret binary'], 'pin.png', { type: 'image/png', lastModified: 42 })
    let state = creatorReducer(createInitialCreatorState('category-1', 'pin-to-replace'), { type: 'set-file', file })
    state = creatorReducer(state, { type: 'set-value', key: 'title', value: 'Draft title' })
    state = creatorReducer(state, { type: 'set-value', key: 'tags', value: [' One ', 'one', 'Two Tags'] })

    const serialized = serializeCreatorLocalDraft(state)
    expect(serialized.values).not.toHaveProperty('file')
    expect(serialized.values.fileFingerprint).toEqual(fingerprintCreatorFile(file))
    expect(serialized.values.tags).toEqual(['one', 'two-tags'])
    expect(serialized.targetImageId).toBe('pin-to-replace')
    expect(serialized.dirtyRevision).toBe(state.dirtyRevision)
    expect(serialized.savedRevision).toBe(state.savedRevision)
    expect(JSON.stringify(serialized)).not.toContain('secret binary')
  })

  test('prefers an unsynced matching local snapshot but not an older clean snapshot', () => {
    const server = {
      id: 'draft-1', creatorId: 'user-1', categoryId: 'category-1', targetImageId: null,
      clientMutationId: 'mutation-1', sourceKind: 'image_url' as const, title: 'Server title',
      description: '', tags: [], state: 'editing' as const, revision: 4, activeAssetId: null,
      publishedImageId: null, publishIdempotencyKey: 'publish-1', lastErrorCode: null,
      lastErrorMessage: null, expiresAt: null, createdAt: '2026-07-12T00:00:00Z',
      updatedAt: '2026-07-12T00:00:05Z', publishedAt: null,
    }
    const local = {
      draftId: 'draft-1',
      targetImageId: null,
      clientMutationId: 'mutation-1',
      step: 'details' as const,
      values: { ...createInitialCreatorState().values, file: undefined },
      dirtyRevision: 6,
      savedRevision: 4,
      updatedAt: '2026-07-12T00:00:01Z',
    }
    Reflect.deleteProperty(local.values, 'file')

    expect(creatorLocalDraftHasUnsyncedChanges(local)).toBe(true)
    expect(shouldPreferLocalCreatorDraft(local, server)).toBe(true)
    expect(shouldPreferLocalCreatorDraft({ ...local, dirtyRevision: 4 }, server)).toBe(false)
    expect(shouldPreferLocalCreatorDraft({ ...local, draftId: 'different-draft' }, server)).toBe(false)
  })

  test('does not let a late save receipt regress the acknowledged local revision', () => {
    const firstReceipt = {
      id: 'draft-1', creatorId: 'user-1', categoryId: 'category-1', targetImageId: null,
      clientMutationId: 'mutation-1', sourceKind: 'image_url' as const, title: 'First',
      description: '', tags: [], state: 'editing' as const, revision: 8, activeAssetId: null,
      publishedImageId: null, publishIdempotencyKey: 'publish-1', lastErrorCode: null,
      lastErrorMessage: null, expiresAt: null, createdAt: '2026-07-12T00:00:00Z',
      updatedAt: '2026-07-12T00:00:08Z', publishedAt: null,
    }
    const lateReceipt = { ...firstReceipt, revision: 7, updatedAt: '2026-07-12T00:00:07Z' }
    let state = creatorReducer(createInitialCreatorState(), {
      type: 'draft-saved', draft: firstReceipt, savedRevision: 8,
    })
    state = creatorReducer(state, {
      type: 'draft-saved', draft: lateReceipt, savedRevision: 7,
    })

    expect(state.savedRevision).toBe(8)
  })
})
