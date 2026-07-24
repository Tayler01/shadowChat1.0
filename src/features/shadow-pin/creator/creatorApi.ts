import { ensureSession, getSessionWithTimeout, getWorkingClient } from '../../../lib/supabase'
import type { ShadowPinCreatorValues } from './creatorModel'
import { inferCreatorSourceKind } from './creatorModel'
import type {
  ShadowPinCreatorAsset,
  ShadowPinCreatorDraft,
  ShadowPinCreatorDraftBundle,
  ShadowPinCreatorPublishResult,
  ShadowPinCreatorSourceKind,
} from './creatorTypes'

const DRAFT_BUCKET = 'shadow-pin-drafts'
const NETLIFY_MEDIA_ENDPOINT = '/api/shadow-pin/media'
const VIDEO_FUNCTION = 'shadow-pin-video'
const NETLIFY_MEDIA_TIMEOUT_MS = 45_000

type UnknownRecord = Record<string, unknown>

const asRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
)
const asString = (value: unknown) => typeof value === 'string' ? value : ''
const asOptionalString = (value: unknown) => typeof value === 'string' && value ? value : null
const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const pick = (record: UnknownRecord, snake: string, camel: string) => record[snake] ?? record[camel]
const firstRow = (value: unknown) => asRecord(Array.isArray(value) ? value[0] : value)

export const normalizeCreatorDraft = (value: unknown): ShadowPinCreatorDraft => {
  const row = asRecord(value)
  return {
    id: asString(row.id),
    creatorId: asString(pick(row, 'creator_id', 'creatorId')),
    categoryId: asString(pick(row, 'category_id', 'categoryId')),
    targetImageId: asOptionalString(pick(row, 'target_image_id', 'targetImageId')),
    targetImageUpdatedAt: asOptionalString(pick(row, 'target_image_updated_at', 'targetImageUpdatedAt')),
    clientMutationId: asString(pick(row, 'client_mutation_id', 'clientMutationId')),
    sourceKind: asString(pick(row, 'source_kind', 'sourceKind')) as ShadowPinCreatorSourceKind,
    title: asString(row.title),
    description: asString(row.description),
    tags: Array.isArray(row.tags) ? row.tags.map(asString).filter(Boolean) : [],
    state: asString(row.state) as ShadowPinCreatorDraft['state'],
    revision: asNumber(row.revision),
    activeAssetId: asOptionalString(pick(row, 'active_asset_id', 'activeAssetId')),
    publishedImageId: asOptionalString(pick(row, 'published_image_id', 'publishedImageId')),
    publishIdempotencyKey: asString(pick(row, 'publish_idempotency_key', 'publishIdempotencyKey')),
    promotionLeaseToken: asOptionalString(pick(row, 'promotion_lease_token', 'promotionLeaseToken')),
    promotionLeaseExpiresAt: asOptionalString(pick(row, 'promotion_lease_expires_at', 'promotionLeaseExpiresAt')),
    promotionAssetId: asOptionalString(pick(row, 'promotion_asset_id', 'promotionAssetId')),
    lastErrorCode: asOptionalString(pick(row, 'last_error_code', 'lastErrorCode')),
    lastErrorMessage: asOptionalString(pick(row, 'last_error_message', 'lastErrorMessage')),
    expiresAt: asOptionalString(pick(row, 'expires_at', 'expiresAt')),
    createdAt: asString(pick(row, 'created_at', 'createdAt')),
    updatedAt: asString(pick(row, 'updated_at', 'updatedAt')),
    publishedAt: asOptionalString(pick(row, 'published_at', 'publishedAt')),
  }
}

export const normalizeCreatorAsset = (value: unknown): ShadowPinCreatorAsset | null => {
  const row = asRecord(value)
  if (!asString(row.id)) return null
  return {
    id: asString(row.id),
    draftId: asString(pick(row, 'draft_id', 'draftId')),
    generation: asNumber(row.generation),
    assetKind: asString(pick(row, 'asset_kind', 'assetKind')) as ShadowPinCreatorAsset['assetKind'],
    provider: asOptionalString(row.provider),
    state: asString(row.state) as ShadowPinCreatorAsset['state'],
    storagePath: asOptionalString(pick(row, 'final_image_path', 'finalImagePath') ?? pick(row, 'storage_path', 'storagePath') ?? pick(row, 'original_path', 'originalPath')),
    posterPath: asOptionalString(
      pick(row, 'final_thumbnail_path', 'finalThumbnailPath') ??
      pick(row, 'poster_path', 'posterPath') ??
      pick(row, 'medium_path', 'mediumPath') ??
      pick(row, 'thumbnail_path', 'thumbnailPath')
    ),
    previewUrl: asOptionalString(pick(row, 'preview_url', 'previewUrl') ?? pick(row, 'final_medium_url', 'finalMediumUrl') ?? pick(row, 'final_thumbnail_url', 'finalThumbnailUrl') ?? pick(row, 'final_image_url', 'finalImageUrl') ?? pick(row, 'medium_url', 'mediumUrl') ?? pick(row, 'image_url', 'imageUrl')),
    playbackUrl: asOptionalString(pick(row, 'playback_url', 'playbackUrl') ?? pick(row, 'video_playback_url', 'videoPlaybackUrl')),
    hlsUrl: asOptionalString(pick(row, 'hls_url', 'hlsUrl') ?? pick(row, 'video_hls_url', 'videoHlsUrl')),
    embedUrl: asOptionalString(pick(row, 'embed_url', 'embedUrl') ?? pick(row, 'video_embed_url', 'videoEmbedUrl')),
    mimeType: asOptionalString(pick(row, 'mime_type', 'mimeType') ?? pick(row, 'content_type', 'contentType')),
    sizeBytes: row.size_bytes == null && row.sizeBytes == null ? null : asNumber(pick(row, 'size_bytes', 'sizeBytes')),
    width: row.width == null && row.image_width == null ? null : asNumber(row.width ?? row.image_width),
    height: row.height == null && row.image_height == null ? null : asNumber(row.height ?? row.image_height),
    durationSeconds: row.duration_seconds == null && row.durationSeconds == null ? null : asNumber(pick(row, 'duration_seconds', 'durationSeconds')),
    sourceUrl: asOptionalString(pick(row, 'source_url', 'sourceUrl')),
    providerAssetId: asOptionalString(pick(row, 'provider_asset_id', 'providerAssetId')),
    errorCode: asOptionalString(pick(row, 'error_code', 'errorCode')),
    errorMessage: asOptionalString(pick(row, 'error_message', 'errorMessage')),
  }
}

export const normalizeCreatorBundle = (value: unknown): ShadowPinCreatorDraftBundle => {
  const row = firstRow(value)
  return {
    draft: normalizeCreatorDraft(row.draft ?? row),
    asset: normalizeCreatorAsset(row.asset ?? row.active_asset ?? row.activeAsset),
  }
}

const draftRpcValues = (values: ShadowPinCreatorValues) => ({
  target_category_id: values.categoryId || null,
  target_source_kind: inferCreatorSourceKind(values),
  target_title: values.title.trim(),
  target_description: values.description.trim() || null,
  target_tags: values.tags,
})

export async function createCreatorDraft(
  values: ShadowPinCreatorValues,
  targetImageId: string | null | undefined,
  clientMutationId: string
) {
  if (!clientMutationId) throw new Error('Refresh Creator Studio before saving this draft.')
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('create_shadow_pin_creator_draft', {
    ...draftRpcValues(values),
    target_client_mutation_id: clientMutationId,
    target_image_id: targetImageId ?? null,
  })
  if (error) throw error
  return normalizeCreatorBundle(data)
}

export async function updateCreatorDraft(draft: ShadowPinCreatorDraft, values: ShadowPinCreatorValues) {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('update_shadow_pin_creator_draft', {
    target_draft_id: draft.id,
    target_expected_revision: draft.revision,
    ...draftRpcValues(values),
  })
  if (error) throw error
  return normalizeCreatorBundle(data)
}

export async function listCreatorDrafts(): Promise<ShadowPinCreatorDraftBundle[]> {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('list_my_shadow_pin_creator_drafts', { target_limit: 25 })
  if (error) throw error
  const bundles = await Promise.all((Array.isArray(data) ? data : []).map(async value => (
    withCreatorPrivatePreview(normalizeCreatorBundle(value))
  )))
  for (const bundle of bundles) {
    if (bundle.draft.state === 'published' && bundle.asset) {
      void cleanupCreatorPublishedAssets(bundle.draft, bundle.asset).catch(() => undefined)
    }
  }
  return bundles
}

export async function deleteCreatorDraft(
  draft: ShadowPinCreatorDraft,
  asset: ShadowPinCreatorAsset | null = null
) {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('delete_shadow_pin_creator_draft', {
    target_draft_id: draft.id,
    target_expected_revision: draft.revision,
  })
  if (error) throw error
  const abandoned = normalizeCreatorDraft(data)
  const assetId = asset?.id || draft.activeAssetId
  if (!assetId) return { draft: abandoned, asset: null }

  try {
    if (asset?.assetKind === 'video' || asset?.assetKind === 'external_video' || draft.sourceKind.includes('video')) {
      return normalizeCreatorBundle(await callVideoFunction({
        action: 'delete-draft-video-asset',
        draftId: draft.id,
        assetId,
      }))
    }

    return await cleanupCreatorImageAsset(draft, { id: assetId })
  } catch {
    // The revision-guarded RPC above is the authoritative discard. Provider or
    // Storage cleanup is best effort and must not resurrect the local draft or
    // leave the attention pill stuck after the server accepted the discard.
    return { draft: abandoned, asset }
  }
}

export async function publishCreatorDraft(
  draft: ShadowPinCreatorDraft,
  asset: ShadowPinCreatorAsset | null = null
): Promise<ShadowPinCreatorPublishResult> {
  if (!draft.publishIdempotencyKey) {
    throw new Error('Refresh this draft before publishing so its publish receipt can be verified.')
  }
  const publishPayload = {
    draftId: draft.id,
    expectedRevision: draft.revision,
    assetId: asset?.id,
    publishIdempotencyKey: draft.publishIdempotencyKey,
  }
  if (asset?.assetKind === 'image' && asset.provider === 'shadow_pin_storage') {
    const result = await callNetlifyMediaRaw({
      action: 'publish-draft-image',
      ...publishPayload,
    })
    return normalizeCreatorPublishResult(result)
  }
  if (asset?.assetKind === 'video' && asset.provider === 'bunny_stream') {
    const result = await callVideoFunction({
      action: 'publish-draft-video',
      ...publishPayload,
    })
    return normalizeCreatorPublishResult(result)
  }

  const client = await getWorkingClient()
  const finalize = () => client.rpc('finalize_shadow_pin_creator_draft', {
    target_draft_id: draft.id,
    target_expected_revision: draft.revision,
    target_publish_idempotency_key: draft.publishIdempotencyKey,
  })
  let { data, error } = await finalize()
  if (error) {
    const retry = await finalize()
    data = retry.data
    error = retry.error
  }
  if (error) throw error
  const result = normalizeCreatorPublishResult(data)
  if (asset) {
    try {
      await cleanupCreatorPublishedAssets(result.draft, asset)
    } catch {
      // The published draft remains a durable cleanup receipt. Opening Studio
      // again retries cleanup without making a successful publish look failed.
      result.cleanupPending = true
    }
  }
  return result
}

const normalizeCreatorPublishResult = (value: unknown): ShadowPinCreatorPublishResult => {
  const row = firstRow(value)
  return {
    draft: normalizeCreatorDraft(row.draft),
    image: row.image as ShadowPinCreatorPublishResult['image'],
    wasAlreadyPublished: Boolean(row.was_already_published ?? row.wasAlreadyPublished),
  }
}

const accessToken = async (forceRefresh = false) => {
  if (!(await ensureSession(forceRefresh))) throw new Error('Sign in to continue your draft.')
  const client = await getWorkingClient()
  const { data: { session } } = await getSessionWithTimeout(client)
  if (!session?.access_token) throw new Error('Sign in to continue your draft.')
  return session.access_token as string
}

const callNetlifyMediaRaw = async (body: UnknownRecord, signal?: AbortSignal) => {
  const requestBody = JSON.stringify(body)
  const call = async (token: string) => {
    const controller = new AbortController()
    let timedOut = false
    const abortFromCaller = () => controller.abort(signal?.reason)
    if (signal?.aborted) {
      abortFromCaller()
    } else {
      signal?.addEventListener('abort', abortFromCaller, { once: true })
    }
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, NETLIFY_MEDIA_TIMEOUT_MS)

    try {
      return await fetch(NETLIFY_MEDIA_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: requestBody,
        signal: controller.signal,
      })
    } catch (error) {
      if (timedOut && !signal?.aborted) {
        throw new Error('Media processing timed out. Check your connection and try again.')
      }
      throw error
    } finally {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  let response = await call(await accessToken())
  if (response.status === 401) {
    response = await call(await accessToken(true))
  }
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.error) throw new Error(data?.error || 'Unable to process draft media.')
  return data as UnknownRecord
}

const callNetlifyMedia = async (body: UnknownRecord, signal?: AbortSignal) => {
  return withCreatorPrivatePreview(normalizeCreatorBundle(await callNetlifyMediaRaw(body, signal)))
}

const callVideoFunction = async (body: UnknownRecord) => {
  const client = await getWorkingClient()
  const { data, error } = await client.functions.invoke(VIDEO_FUNCTION, { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as UnknownRecord
}

async function cleanupCreatorImageAsset(
  draft: Pick<ShadowPinCreatorDraft, 'id'>,
  asset: Pick<ShadowPinCreatorAsset, 'id'>
) {
  return callNetlifyMedia({
    action: 'delete-draft-image-assets',
    draftId: draft.id,
    assetId: asset.id,
  })
}

async function cleanupCreatorPublishedAssets(
  draft: ShadowPinCreatorDraft,
  activeAsset: ShadowPinCreatorAsset
) {
  const client = await getWorkingClient()
  const { data, error } = await client.from('shadow_pin_draft_assets')
    .select('*')
    .eq('draft_id', draft.id)
  if (error) throw error
  const allAssets = (Array.isArray(data) ? data : []).map(normalizeCreatorAsset).filter(
    (candidate): candidate is ShadowPinCreatorAsset => Boolean(candidate)
  )
  if (!allAssets.some(candidate => candidate.id === activeAsset.id)) allAssets.push(activeAsset)

  for (const candidate of allAssets) {
    if (candidate.state === 'superseded') {
      if (candidate.assetKind === 'image') await cleanupCreatorImageAsset(draft, candidate)
      else await callVideoFunction({ action: 'delete-draft-video-asset', draftId: draft.id, assetId: candidate.id })
    } else if (candidate.id === activeAsset.id && candidate.assetKind === 'image' && candidate.state !== 'deleted') {
      await cleanupCreatorImageAsset(draft, candidate)
    }
  }
}

async function withCreatorPrivatePreview(
  bundle: ShadowPinCreatorDraftBundle
): Promise<ShadowPinCreatorDraftBundle> {
  const { asset } = bundle
  if (!asset || asset.provider !== 'shadow_pin_storage' || asset.previewUrl) return bundle
  const path = asset.posterPath || asset.storagePath
  if (!path || asset.state === 'deleted') return bundle
  const client = await getWorkingClient()
  const { data, error } = await client.storage.from(DRAFT_BUCKET).createSignedUrl(path, 600)
  if (error) throw error
  return {
    ...bundle,
    asset: { ...asset, previewUrl: data?.signedUrl || null },
  }
}

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-100) || 'media'
const isStorageObjectAlreadyPresent = (error: unknown) => {
  const row = asRecord(error)
  return Number(row.statusCode ?? row.status) === 409 || /already exists|duplicate/i.test(asString(row.message))
}

async function uploadDraftImage(draft: ShadowPinCreatorDraft, file: File, signal?: AbortSignal) {
  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Sign in to upload draft media.')
  if (signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError')
  const fileToken = safeFileName(`${file.name}-${file.size}-${file.lastModified}-${file.type || 'unknown'}`)
  const path = `${user.id}/${draft.id}/${fileToken}/source-${safeFileName(file.name)}`
  const { error } = await client.storage.from(DRAFT_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error && !isStorageObjectAlreadyPresent(error)) throw error
  if (signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError')
  return callNetlifyMedia({
    action: 'process-draft-image',
    draftId: draft.id,
    expectedRevision: draft.revision,
    storagePath: path,
    contentType: file.type,
    sizeBytes: file.size,
  }, signal)
}

type TusSession = {
  draft?: unknown
  asset?: unknown
  endpoint?: string
  uploadUrl?: string
  authorizationSignature?: string
  authorizationExpire?: number
  libraryId?: string
  bunnyVideoId?: string
}

const readVideoMetadata = async (file: File) => {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  try {
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const result = await new Promise<{ durationSeconds: number; width: number | null; height: number | null }>((resolve, reject) => {
      video.onloadedmetadata = () => resolve({
        durationSeconds: Math.ceil(Number.isFinite(video.duration) ? video.duration : 0),
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      })
      video.onerror = () => reject(new Error('Unable to read video metadata.'))
      video.src = url
    })
    if (!result.durationSeconds || result.durationSeconds > 60) throw new Error('Videos can be up to 60 seconds.')
    return result
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

export const inspectCreatorVideoFile = readVideoMetadata

async function uploadDraftVideo(
  draft: ShadowPinCreatorDraft,
  file: File,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
) {
  const metadata = await readVideoMetadata(file)
  const rawSession = await callVideoFunction({
    action: 'create-draft-upload',
    draftId: draft.id,
    expectedRevision: draft.revision,
    fileName: file.name,
    fileType: file.type || 'video/mp4',
    fileSize: file.size,
    durationSeconds: metadata.durationSeconds,
    mediaWidth: metadata.width,
    mediaHeight: metadata.height,
  })
  const session = {
    ...asRecord(rawSession.upload),
    ...rawSession,
  } as TusSession
  const endpoint = session.endpoint || 'https://video.bunnycdn.com/tusupload'
  const { Upload } = await import('tus-js-client')
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      uploadUrl: session.uploadUrl,
      retryDelays: [0, 1000, 3000, 5000],
      removeFingerprintOnSuccess: true,
      metadata: { filetype: file.type || 'video/mp4', title: file.name, collection: 'shadow-pin-drafts' },
      headers: session.authorizationSignature ? {
        AuthorizationSignature: session.authorizationSignature,
        AuthorizationExpire: String(session.authorizationExpire),
        VideoId: String(session.bunnyVideoId || ''),
        LibraryId: String(session.libraryId || ''),
      } : undefined,
      onError: reject,
      onProgress: (uploaded, total) => onProgress?.(total ? Math.round((uploaded / total) * 100) : 0),
      onSuccess: () => resolve(),
    })
    const abort = () => { void upload.abort(false).finally(() => reject(new DOMException('Upload paused.', 'AbortError'))) }
    signal?.addEventListener('abort', abort, { once: true })
    // The Edge Function creates a fresh Bunny VideoId for this exact draft
    // asset. tus-js-client fingerprints are file-based, so resuming an
    // arbitrary prior fingerprint can upload into an older VideoId and leave
    // the newly-created asset permanently empty. Retry within this Upload
    // instance; only use a server-bound uploadUrl when one is supplied.
    upload.start()
  })
  const assetId = normalizeCreatorAsset(session.asset)?.id
  const complete = await callVideoFunction({
    action: 'complete-draft-upload',
    draftId: draft.id,
    expectedRevision: normalizeCreatorDraft(session.draft).revision || draft.revision,
    ...(assetId ? { assetId } : {}),
    bunnyVideoId: session.bunnyVideoId,
  })
  return normalizeCreatorBundle(complete)
}

export async function stageCreatorDraftMedia(
  draft: ShadowPinCreatorDraft,
  values: ShadowPinCreatorValues,
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void } = {}
) {
  const sourceKind = inferCreatorSourceKind(values)
  if (sourceKind === 'image_upload') {
    if (!values.file) throw new Error('Reselect the image to continue this upload.')
    return uploadDraftImage(draft, values.file, options.signal)
  }
  if (sourceKind === 'video_upload') {
    if (!values.file) throw new Error('Reselect the video to continue this upload.')
    return uploadDraftVideo(draft, values.file, options.onProgress, options.signal)
  }
  if (sourceKind === 'image_url') {
    return callNetlifyMedia({
      action: 'stage-draft-image-from-url',
      draftId: draft.id,
      expectedRevision: draft.revision,
      url: values.sourceUrl.trim(),
    }, options.signal)
  }
  const result = await callVideoFunction({
    action: 'create-draft-upload',
    draftId: draft.id,
    expectedRevision: draft.revision,
    sourceKind,
    sourceUrl: values.sourceUrl.trim(),
  })
  return normalizeCreatorBundle(result)
}

export async function syncCreatorDraftStatus(draft: ShadowPinCreatorDraft) {
  const result = await callVideoFunction({ action: 'sync-draft-status', draftId: draft.id })
  return normalizeCreatorBundle(result)
}
