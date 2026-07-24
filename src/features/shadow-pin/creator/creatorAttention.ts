import { getWorkingClient } from '../../../lib/supabase'
import { clearCreatorLocalDraft, loadCreatorLocalDraft } from './creatorLocalStore'
import type { CreatorLocalDraft } from './creatorModel'
import type { ShadowPinCreatorDraftState } from './creatorTypes'

const ATTENTION_DRAFT_STATES: ShadowPinCreatorDraftState[] = [
  'editing',
  'uploading',
  'processing',
  'ready',
  'preparing_publish',
  'publish_ready',
  'failed',
]

type RemoteCreatorAttentionDraft = {
  id: string
  state: ShadowPinCreatorDraftState
  category_id?: string | null
  title?: string | null
  description?: string | null
  tags?: string[] | null
  active_asset_id?: string | null
  target_image_id?: string | null
}

type RemoteCreatorAttentionAsset = {
  id: string
  asset_kind?: string | null
  provider?: string | null
  final_image_url?: string | null
  final_image_path?: string | null
  final_thumbnail_url?: string | null
  final_thumbnail_path?: string | null
  final_medium_url?: string | null
  final_medium_path?: string | null
  source_url?: string | null
  provider_asset_id?: string | null
  video_preview_url?: string | null
  video_playback_url?: string | null
  video_hls_url?: string | null
  video_embed_url?: string | null
}

type RemoteCreatorAttentionTarget = {
  id: string
  category_id?: string | null
  title?: string | null
  description?: string | null
  media_type?: string | null
  provider?: string | null
  image_url?: string | null
  image_path?: string | null
  thumbnail_url?: string | null
  thumbnail_path?: string | null
  medium_url?: string | null
  medium_path?: string | null
  source_url?: string | null
  provider_asset_id?: string | null
  video_preview_url?: string | null
  video_playback_url?: string | null
  video_hls_url?: string | null
  video_embed_url?: string | null
  tag_links?: Array<{ tag?: { slug?: string | null } | null }> | null
}

const normalizeText = (value: string | null | undefined) => value?.trim() || ''
const normalizeTags = (values: string[] | null | undefined) => Array.from(new Set((values ?? [])
  .map(value => value.trim().toLowerCase())
  .filter(Boolean)))
  .sort()

const equalTags = (
  draftTags: string[] | null | undefined,
  targetLinks: RemoteCreatorAttentionTarget['tag_links']
) => {
  const targetTags = (targetLinks ?? [])
    .map(link => link.tag?.slug ?? '')
  return JSON.stringify(normalizeTags(draftTags)) === JSON.stringify(normalizeTags(targetTags))
}

const assetMatchesTarget = (
  asset: RemoteCreatorAttentionAsset | undefined,
  target: RemoteCreatorAttentionTarget
) => {
  if (!asset) return false
  const expectedKind = target.media_type === 'video'
    ? 'video'
    : target.media_type === 'external_video'
      ? 'external_video'
      : 'image'
  if (normalizeText(asset.asset_kind) !== expectedKind) return false
  if (normalizeText(asset.provider) !== normalizeText(target.provider || 'shadow_pin_storage')) return false

  return [
    [asset.final_image_url, target.image_url],
    [asset.final_image_path, target.image_path],
    [asset.final_thumbnail_url, target.thumbnail_url],
    [asset.final_thumbnail_path, target.thumbnail_path],
    [asset.final_medium_url, target.medium_url],
    [asset.final_medium_path, target.medium_path],
    [asset.source_url, target.source_url],
    [asset.provider_asset_id, target.provider_asset_id],
    [asset.video_preview_url, target.video_preview_url],
    [asset.video_playback_url, target.video_playback_url],
    [asset.video_hls_url, target.video_hls_url],
    [asset.video_embed_url, target.video_embed_url],
  ].every(([draftValue, targetValue]) => normalizeText(draftValue) === normalizeText(targetValue))
}

export const creatorLocalDraftNeedsAttention = (draft: CreatorLocalDraft | null) => Boolean(
  draft && (
    draft.dirtyRevision > draft.savedRevision ||
    (draft.targetImageId && !draft.values.keepExistingMedia && (
      draft.values.fileFingerprint ||
      draft.values.sourceUrl.trim()
    )) ||
    (!draft.targetImageId && (
      draft.values.fileFingerprint ||
      draft.values.keepExistingMedia ||
      draft.values.sourceUrl.trim() ||
      draft.values.title.trim() ||
      draft.values.description.trim() ||
      draft.values.tags.length > 0
    ))
  )
)

export const creatorRemoteDraftNeedsAttention = (
  draft: RemoteCreatorAttentionDraft,
  asset?: RemoteCreatorAttentionAsset,
  target?: RemoteCreatorAttentionTarget
) => {
  if (!draft.target_image_id) {
    return draft.state !== 'editing' || Boolean(
      draft.active_asset_id ||
      normalizeText(draft.title) ||
      normalizeText(draft.description) ||
      draft.tags?.length
    )
  }

  // A soft-deleted or otherwise unavailable target cannot be resumed. The
  // linked migration abandons existing rows, while this guard prevents future
  // stale edit receipts from surfacing before backend cleanup catches up.
  if (!target) return false

  if (['uploading', 'processing', 'preparing_publish', 'failed'].includes(draft.state)) {
    return true
  }

  const metadataMatches = (
    normalizeText(draft.category_id) === normalizeText(target.category_id) &&
    normalizeText(draft.title) === normalizeText(target.title) &&
    normalizeText(draft.description) === normalizeText(target.description) &&
    equalTags(draft.tags, target.tag_links)
  )
  const mediaMatches = draft.active_asset_id
    ? assetMatchesTarget(asset, target)
    : true

  // Opening Edit copies the canonical Pin into a publish-ready draft. That
  // untouched copy is a receipt, not unfinished work, and must not raise the
  // Drafts / Needs attention pill.
  return !metadataMatches || !mediaMatches
}

export async function hasCreatorDraftsNeedingAttention(userId: string) {
  if (!userId) return false
  const localDraft = loadCreatorLocalDraft(userId)
  const localNeedsAttention = creatorLocalDraftNeedsAttention(localDraft)
  if (localNeedsAttention && !localDraft?.draftId) return true

  const client = await getWorkingClient()
  const { data, error } = await client
    .from('shadow_pin_creator_drafts')
    .select('id,state,category_id,title,description,tags,active_asset_id,target_image_id')
    .eq('creator_id', userId)
    .in('state', ATTENTION_DRAFT_STATES)
    .limit(25)

  if (error) throw error
  const remoteDrafts = (data ?? []) as RemoteCreatorAttentionDraft[]
  const editDrafts = remoteDrafts.filter(draft => draft.target_image_id)
  const targetIds = Array.from(new Set(editDrafts
    .map(draft => draft.target_image_id)
    .filter((value): value is string => Boolean(value))))
  const assetIds = Array.from(new Set(editDrafts
    .map(draft => draft.active_asset_id)
    .filter((value): value is string => Boolean(value))))

  let targetRows: RemoteCreatorAttentionTarget[] = []
  if (targetIds.length > 0) {
    const targetResult = await client
      .from('shadow_pin_images')
      .select(`
        id,category_id,title,description,media_type,provider,
        image_url,image_path,thumbnail_url,thumbnail_path,medium_url,medium_path,
        source_url,provider_asset_id,video_preview_url,video_playback_url,
        video_hls_url,video_embed_url,
        tag_links:shadow_pin_image_tags(tag:shadow_pin_tags(slug))
      `)
      .in('id', targetIds)
    if (targetResult.error) throw targetResult.error
    targetRows = (targetResult.data ?? []) as RemoteCreatorAttentionTarget[]
  }

  let assetRows: RemoteCreatorAttentionAsset[] = []
  if (assetIds.length > 0) {
    const assetResult = await client
      .from('shadow_pin_draft_assets')
      .select(`
        id,asset_kind,provider,final_image_url,final_image_path,
        final_thumbnail_url,final_thumbnail_path,final_medium_url,final_medium_path,
        source_url,provider_asset_id,video_preview_url,video_playback_url,
        video_hls_url,video_embed_url
      `)
      .in('id', assetIds)
    if (assetResult.error) throw assetResult.error
    assetRows = (assetResult.data ?? []) as RemoteCreatorAttentionAsset[]
  }

  const targetsById = new Map(targetRows.map(target => [target.id, target]))
  const assetsById = new Map(assetRows.map(asset => [asset.id, asset]))
  const activeDrafts = remoteDrafts.filter(draft => creatorRemoteDraftNeedsAttention(
    draft,
    draft.active_asset_id ? assetsById.get(draft.active_asset_id) : undefined,
    draft.target_image_id ? targetsById.get(draft.target_image_id) : undefined
  ))
  if (localNeedsAttention && localDraft?.draftId) {
    const localDraftIsActive = activeDrafts.some(draft => draft.id === localDraft.draftId)
    if (localDraftIsActive) return true
    clearCreatorLocalDraft(userId)
  }
  return activeDrafts.length > 0
}
