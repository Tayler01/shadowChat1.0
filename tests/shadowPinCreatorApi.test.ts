import { ensureSession, getSessionWithTimeout, getWorkingClient } from '../src/lib/supabase'
import {
  createCreatorDraft,
  normalizeCreatorAsset,
  normalizeCreatorBundle,
  normalizeCreatorDraft,
  publishCreatorDraft,
  stageCreatorDraftMedia,
  updateCreatorDraft,
} from '../src/features/shadow-pin/creator/creatorApi'
import { createInitialCreatorState } from '../src/features/shadow-pin/creator/creatorModel'

const mockTusUpload = jest.fn()

jest.mock('tus-js-client', () => ({
  Upload: function MockUpload(file: File, options: Record<string, (...args: unknown[]) => void>) {
    mockTusUpload(file, options)
    return {
      abort: jest.fn(async () => undefined),
      findPreviousUploads: jest.fn(async () => []),
      resumeFromPreviousUpload: jest.fn(),
      start: jest.fn(() => options.onSuccess?.()),
    }
  },
}))

jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(),
  getSessionWithTimeout: jest.fn(),
  getWorkingClient: jest.fn(),
}))

const rawDraft = {
  id: 'draft-1', creator_id: 'user-1', category_id: 'category-1', target_image_id: null,
  client_mutation_id: 'mutation-1', source_kind: 'image_url', title: 'Pin title',
  description: 'Description', tags: ['one'], state: 'publish_ready', revision: 3,
  active_asset_id: 'asset-1', published_image_id: null, publish_idempotency_key: 'publish-1',
  last_error_code: null, last_error_message: null, expires_at: null,
  created_at: '2026-07-12T00:00:00Z', updated_at: '2026-07-12T00:00:01Z', published_at: null,
}

const rawAsset = {
  id: 'asset-1', draft_id: 'draft-1', generation: 2, asset_kind: 'image',
  provider: 'shadow_pin_storage', state: 'publish_ready', final_image_path: 'drafts/final.webp',
  final_thumbnail_url: 'https://signed.test/preview', content_type: 'image/webp', size_bytes: 123,
  image_width: 1200, image_height: 1600, duration_seconds: null,
}

const values = {
  ...createInitialCreatorState('category-1').values,
  sourceMode: 'url' as const,
  sourceUrl: 'https://example.com/pin.jpg',
  title: '  Pin title  ',
  description: '  Description  ',
  tags: ['one'],
}

describe('ShadowPin Creator Studio API', () => {
  const rpc = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getWorkingClient as jest.Mock).mockResolvedValue({ rpc })
    ;(ensureSession as jest.Mock).mockResolvedValue(true)
    ;(getSessionWithTimeout as jest.Mock).mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
      error: null,
    })
  })

  test('normalizes snake-case, camel-case, array, and nested bundle responses', () => {
    expect(normalizeCreatorDraft(rawDraft)).toMatchObject({
      id: 'draft-1', creatorId: 'user-1', categoryId: 'category-1', revision: 3,
      publishIdempotencyKey: 'publish-1',
    })
    expect(normalizeCreatorAsset(rawAsset)).toMatchObject({
      id: 'asset-1', draftId: 'draft-1', storagePath: 'drafts/final.webp',
      previewUrl: 'https://signed.test/preview', mimeType: 'image/webp', width: 1200,
    })
    expect(normalizeCreatorBundle([{ draft: rawDraft, activeAsset: rawAsset }])).toMatchObject({
      draft: { id: 'draft-1' }, asset: { id: 'asset-1' },
    })
    expect(normalizeCreatorAsset({})).toBeNull()
  })

  test('creates drafts with the exact bounded RPC payload', async () => {
    rpc.mockResolvedValue({ data: { draft: rawDraft, asset: null }, error: null })

    const stableCreateReceipt = '11111111-1111-4111-8111-111111111111'
    await createCreatorDraft(values, 'pin-to-replace', stableCreateReceipt)
    await createCreatorDraft(values, 'pin-to-replace', stableCreateReceipt)

    expect(rpc).toHaveBeenCalledWith('create_shadow_pin_creator_draft', expect.objectContaining({
      target_category_id: 'category-1',
      target_source_kind: 'image_url',
      target_title: 'Pin title',
      target_description: 'Description',
      target_tags: ['one'],
      target_client_mutation_id: stableCreateReceipt,
      target_image_id: 'pin-to-replace',
    }))
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual([
      'target_category_id', 'target_client_mutation_id', 'target_description', 'target_image_id',
      'target_source_kind', 'target_tags', 'target_title',
    ])
    expect(rpc.mock.calls[1][1].target_client_mutation_id).toBe(stableCreateReceipt)
  })

  test('updates and publishes with optimistic revision and stable idempotency keys', async () => {
    const draft = normalizeCreatorDraft(rawDraft)
    rpc
      .mockResolvedValueOnce({ data: { draft: { ...rawDraft, revision: 4 }, asset: rawAsset }, error: null })
      .mockResolvedValueOnce({
        data: { draft: { ...rawDraft, state: 'published', published_image_id: 'pin-1' }, image: { id: 'pin-1' }, was_already_published: false },
        error: null,
      })

    await updateCreatorDraft(draft, values)
    const published = await publishCreatorDraft(draft)

    expect(rpc).toHaveBeenNthCalledWith(1, 'update_shadow_pin_creator_draft', {
      target_draft_id: 'draft-1', target_expected_revision: 3,
      target_category_id: 'category-1', target_source_kind: 'image_url',
      target_title: 'Pin title', target_description: 'Description', target_tags: ['one'],
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'finalize_shadow_pin_creator_draft', {
      target_draft_id: 'draft-1', target_expected_revision: 3,
      target_publish_idempotency_key: 'publish-1',
    })
    expect(published).toMatchObject({ image: { id: 'pin-1' }, wasAlreadyPublished: false })
  })

  test('promotes a private ready image immediately before guarded finalization', async () => {
    const draft = normalizeCreatorDraft({ ...rawDraft, state: 'ready', revision: 3 })
    const asset = normalizeCreatorAsset({ ...rawAsset, state: 'ready' })!
    const originalFetch = globalThis.fetch
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        draft: { ...rawDraft, state: 'publish_ready', revision: 4 },
        asset: { ...rawAsset, state: 'publish_ready' },
      }),
    } as Response)
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: fetchMock })
    rpc.mockResolvedValue({
      data: [{
        draft: { ...rawDraft, state: 'published', revision: 5, published_image_id: 'pin-1' },
        image: { id: 'pin-1' },
        was_already_published: false,
      }],
      error: null,
    })

    try {
      await publishCreatorDraft(draft, asset)

      expect(fetchMock).toHaveBeenCalledWith('/api/shadow-pin/media', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        body: expect.stringContaining('prepare-draft-image-publish'),
      }))
      expect(rpc).toHaveBeenCalledWith('finalize_shadow_pin_creator_draft', {
        target_draft_id: 'draft-1',
        target_expected_revision: 4,
        target_publish_idempotency_key: 'publish-1',
      })
    } finally {
      if (originalFetch) {
        Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: originalFetch })
      } else {
        Reflect.deleteProperty(globalThis, 'fetch')
      }
    }
  })

  test('throws RPC errors without inventing a local success', async () => {
    const error = new Error('stale revision')
    rpc.mockResolvedValue({ data: null, error })

    await expect(updateCreatorDraft(normalizeCreatorDraft(rawDraft), values)).rejects.toBe(error)
  })

  test.each([
    ['nested', (session: Record<string, unknown>) => ({ draft: rawDraft, asset: rawAsset, upload: session })],
    ['flattened', (session: Record<string, unknown>) => ({ draft: rawDraft, asset: rawAsset, ...session })],
  ])('accepts %s native-video upload sessions', async (_shape, shapeSession) => {
    const invoke = jest.fn()
      .mockResolvedValueOnce({
        data: shapeSession({
          endpoint: 'https://video.test/tus',
          uploadUrl: 'https://video.test/tus/upload-1',
          authorizationSignature: 'signature',
          authorizationExpire: 123,
          libraryId: 'library-1',
          bunnyVideoId: 'video-1',
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: { draft: { ...rawDraft, source_kind: 'video_upload' }, asset: { ...rawAsset, asset_kind: 'video' } },
        error: null,
      })
    ;(getWorkingClient as jest.Mock).mockResolvedValue({ rpc, functions: { invoke } })

    const originalCreateElement = document.createElement.bind(document)
    const video = {
      preload: '', muted: false, playsInline: false, duration: 12,
      videoWidth: 720, videoHeight: 1280, onloadedmetadata: null as null | (() => void),
      onerror: null as null | (() => void), removeAttribute: jest.fn(), load: jest.fn(),
    }
    Object.defineProperty(video, 'src', {
      set: () => queueMicrotask(() => video.onloadedmetadata?.()),
    })
    const createElement = jest.spyOn(document, 'createElement').mockImplementation(((tagName: string) => (
      tagName === 'video' ? video : originalCreateElement(tagName)
    )) as typeof document.createElement)
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:video') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() })

    try {
      const file = new File(['video'], 'clip.mp4', { type: 'video/mp4', lastModified: 7 })
      const result = await stageCreatorDraftMedia(normalizeCreatorDraft({ ...rawDraft, source_kind: 'video_upload' }), {
        ...values,
        sourceMode: 'file',
        sourceUrl: '',
        file,
        fileFingerprint: null,
      })

      expect(mockTusUpload).toHaveBeenCalledWith(file, expect.objectContaining({
        endpoint: 'https://video.test/tus',
        uploadUrl: 'https://video.test/tus/upload-1',
        headers: expect.objectContaining({ VideoId: 'video-1', LibraryId: 'library-1' }),
      }))
      expect(invoke).toHaveBeenNthCalledWith(2, 'shadow-pin-video', {
        body: expect.objectContaining({ action: 'complete-draft-upload', bunnyVideoId: 'video-1' }),
      })
      expect(result.asset).toMatchObject({ id: 'asset-1', assetKind: 'video' })
    } finally {
      createElement.mockRestore()
    }
  })
})
