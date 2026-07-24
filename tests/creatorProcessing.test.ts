import {
  isCreatorAssetReady,
  refreshCreatorAssetUntilSettled,
} from '../src/features/shadow-pin/creator/creatorProcessing'
import type {
  ShadowPinCreatorAsset,
  ShadowPinCreatorDraft,
  ShadowPinCreatorDraftBundle,
} from '../src/features/shadow-pin/creator/creatorTypes'

const draft = {
  id: 'draft-1',
  creatorId: 'user-1',
  categoryId: 'category-1',
  targetImageId: null,
  clientMutationId: 'mutation-1',
  sourceKind: 'video_upload',
  title: 'Video',
  description: '',
  tags: [],
  state: 'processing',
  revision: 2,
  activeAssetId: 'asset-1',
  publishedImageId: null,
  publishIdempotencyKey: 'publish-1',
  lastErrorCode: null,
  lastErrorMessage: null,
  expiresAt: null,
  createdAt: '2026-07-24T00:00:00Z',
  updatedAt: '2026-07-24T00:00:00Z',
  publishedAt: null,
} satisfies ShadowPinCreatorDraft

const asset = (state: ShadowPinCreatorAsset['state']): ShadowPinCreatorAsset => ({
  id: 'asset-1',
  draftId: draft.id,
  generation: 1,
  assetKind: 'video',
  provider: 'bunny_stream',
  state,
  storagePath: null,
  posterPath: null,
  previewUrl: null,
  playbackUrl: null,
  hlsUrl: null,
  embedUrl: null,
  mimeType: 'video/quicktime',
  sizeBytes: 68_000_000,
  width: 1080,
  height: 1920,
  durationSeconds: 20,
  sourceUrl: null,
  providerAssetId: 'bunny-video-1',
  errorCode: null,
  errorMessage: null,
})

const bundle = (state: ShadowPinCreatorAsset['state']): ShadowPinCreatorDraftBundle => ({
  draft: { ...draft, state: state === 'ready' ? 'ready' : state === 'failed' ? 'failed' : 'processing' },
  asset: asset(state),
})

describe('Creator Studio processing refresh', () => {
  test('keeps checking a pending video and stops as soon as it is ready', async () => {
    const sync = jest.fn()
      .mockResolvedValueOnce(bundle('processing'))
      .mockResolvedValueOnce(bundle('ready'))
    const wait = jest.fn().mockResolvedValue(undefined)

    const result = await refreshCreatorAssetUntilSettled(bundle('processing'), sync, {
      attempts: 8,
      intervalMs: 4_000,
      wait,
    })

    expect(isCreatorAssetReady(result.asset)).toBe(true)
    expect(sync).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledWith(4_000)
  })

  test('does not poll a video that is already ready', async () => {
    const sync = jest.fn()
    const result = await refreshCreatorAssetUntilSettled(bundle('ready'), sync)
    expect(result.asset?.state).toBe('ready')
    expect(sync).not.toHaveBeenCalled()
  })

  test('stops when Bunny reports a processing failure', async () => {
    const sync = jest.fn().mockResolvedValueOnce(bundle('failed'))
    const result = await refreshCreatorAssetUntilSettled(bundle('processing'), sync, {
      wait: async () => undefined,
    })
    expect(result.asset?.state).toBe('failed')
    expect(sync).toHaveBeenCalledTimes(1)
  })
})
