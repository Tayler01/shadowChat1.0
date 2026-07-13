import type { ShadowPinImage } from '../types'

export type ShadowPinCreatorSourceKind = 'image_upload' | 'image_url' | 'video_upload' | 'external_video'
export type ShadowPinCreatorDraftState = 'editing' | 'uploading' | 'processing' | 'ready' | 'preparing_publish' | 'publish_ready' | 'published' | 'failed' | 'abandoned'
export type ShadowPinCreatorAssetState = 'reserved' | 'uploading' | 'processing' | 'ready' | 'publish_ready' | 'failed' | 'superseded' | 'deleted'

export type ShadowPinCreatorDraft = {
  id: string
  creatorId: string
  categoryId: string
  targetImageId: string | null
  targetImageUpdatedAt?: string | null
  clientMutationId: string
  sourceKind: ShadowPinCreatorSourceKind
  title: string
  description: string
  tags: string[]
  state: ShadowPinCreatorDraftState
  revision: number
  activeAssetId: string | null
  publishedImageId: string | null
  publishIdempotencyKey: string
  promotionLeaseToken?: string | null
  promotionLeaseExpiresAt?: string | null
  promotionAssetId?: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export type ShadowPinCreatorAsset = {
  id: string
  draftId: string
  generation: number
  assetKind: 'image' | 'video' | 'external_video'
  provider: string | null
  state: ShadowPinCreatorAssetState
  storagePath: string | null
  posterPath: string | null
  previewUrl: string | null
  playbackUrl: string | null
  hlsUrl: string | null
  embedUrl: string | null
  mimeType: string | null
  sizeBytes: number | null
  width: number | null
  height: number | null
  durationSeconds: number | null
  sourceUrl: string | null
  providerAssetId: string | null
  errorCode: string | null
  errorMessage: string | null
}

export type ShadowPinCreatorDraftBundle = {
  draft: ShadowPinCreatorDraft
  asset: ShadowPinCreatorAsset | null
}

export type ShadowPinCreatorPublishResult = {
  draft: ShadowPinCreatorDraft
  image: ShadowPinImage
  wasAlreadyPublished: boolean
  cleanupPending?: boolean
}
