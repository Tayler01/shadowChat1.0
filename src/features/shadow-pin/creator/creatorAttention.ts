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

export const creatorLocalDraftNeedsAttention = (draft: CreatorLocalDraft | null) => Boolean(
  draft && (
    draft.dirtyRevision > draft.savedRevision ||
    draft.values.fileFingerprint ||
    draft.values.keepExistingMedia ||
    draft.values.sourceUrl.trim() ||
    draft.values.title.trim() ||
    draft.values.description.trim() ||
    draft.values.tags.length > 0
  )
)

export async function hasCreatorDraftsNeedingAttention(userId: string) {
  if (!userId) return false
  const localDraft = loadCreatorLocalDraft(userId)
  const localNeedsAttention = creatorLocalDraftNeedsAttention(localDraft)
  if (localNeedsAttention && !localDraft?.draftId) return true

  const client = await getWorkingClient()
  const { data, error } = await client
    .from('shadow_pin_creator_drafts')
    .select('id,state,title,description,tags,active_asset_id,target_image_id')
    .eq('creator_id', userId)
    .in('state', ATTENTION_DRAFT_STATES)
    .limit(25)

  if (error) throw error
  type RemoteCreatorAttentionDraft = {
    id: string
    state: ShadowPinCreatorDraftState
    title?: string | null
    description?: string | null
    tags?: string[] | null
    active_asset_id?: string | null
    target_image_id?: string | null
  }
  const activeDrafts = ((data ?? []) as RemoteCreatorAttentionDraft[]).filter(draft => (
    draft.state !== 'editing' ||
    Boolean(
      draft.active_asset_id ||
      draft.target_image_id ||
      draft.title?.trim() ||
      draft.description?.trim() ||
      draft.tags?.length
    )
  ))
  if (localNeedsAttention && localDraft?.draftId) {
    const localDraftIsActive = activeDrafts.some(draft => draft.id === localDraft.draftId)
    if (localDraftIsActive) return true
    clearCreatorLocalDraft(userId)
  }
  return activeDrafts.length > 0
}
