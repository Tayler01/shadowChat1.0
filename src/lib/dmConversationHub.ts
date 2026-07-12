import { getWorkingClient } from './supabase'
import type { DMConversationHubPreference } from '../components/dms/dmConversationHubModel'

type DMConversationPreferenceRow = {
  conversation_id: string
  pinned_at: string | null
  archived_at: string | null
  marked_unread_at: string | null
  updated_at: string
}

const mapPreferenceRow = (row: DMConversationPreferenceRow): DMConversationHubPreference => ({
  conversationId: row.conversation_id,
  pinnedAt: row.pinned_at,
  archivedAt: row.archived_at,
  markedUnreadAt: row.marked_unread_at,
  updatedAt: row.updated_at,
})

export const fetchDMConversationHubState = async () => {
  const client = await getWorkingClient()
  const [preferencesResult, muteResult] = await Promise.all([
    client
      .from('dm_conversation_preferences')
      .select('conversation_id,pinned_at,archived_at,marked_unread_at,updated_at'),
    client
      .from('notification_conversation_mutes')
      .select('conversation_id'),
  ])

  if (preferencesResult.error) throw preferencesResult.error
  if (muteResult.error) throw muteResult.error

  return {
    preferences: ((preferencesResult.data ?? []) as DMConversationPreferenceRow[]).map(mapPreferenceRow),
    mutedConversationIds: (muteResult.data ?? []).map((row: { conversation_id: string }) => String(row.conversation_id)),
  }
}

export const saveDMConversationPreference = async ({
  userId,
  preference,
}: {
  userId: string
  preference: DMConversationHubPreference
}) => {
  const client = await getWorkingClient()
  const { data, error } = await client
    .from('dm_conversation_preferences')
    .upsert({
      user_id: userId,
      conversation_id: preference.conversationId,
      pinned_at: preference.pinnedAt,
      archived_at: preference.archivedAt,
      marked_unread_at: preference.markedUnreadAt,
    }, { onConflict: 'user_id,conversation_id' })
    .select('conversation_id,pinned_at,archived_at,marked_unread_at,updated_at')
    .single()

  if (error) throw error
  return mapPreferenceRow(data as DMConversationPreferenceRow)
}
