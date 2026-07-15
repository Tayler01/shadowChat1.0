import { getWorkingClient } from '../../../lib/supabase'
import { loadCreatorLocalDraft } from './creatorLocalStore'
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
  if (creatorLocalDraftNeedsAttention(loadCreatorLocalDraft(userId))) return true

  const client = await getWorkingClient()
  const { data, error } = await client
    .from('shadow_pin_creator_drafts')
    .select('id')
    .eq('creator_id', userId)
    .in('state', ATTENTION_DRAFT_STATES)
    .limit(1)

  if (error) throw error
  return Boolean(data?.length)
}
