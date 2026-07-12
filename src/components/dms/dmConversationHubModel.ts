import type { DMConversation, DMMessage } from '../../lib/supabase'

export type DMConversationHubMode = 'inbox' | 'unread' | 'archived'

export type DMConversationPreviewKind =
  | 'blocked'
  | 'draft'
  | 'empty'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'hype'

export type DMConversationPreviewDirection = 'incoming' | 'outgoing' | 'none'

export interface DMConversationHubPreference {
  conversationId: string
  pinnedAt: string | null
  archivedAt: string | null
  markedUnreadAt: string | null
  updatedAt: string
}

export interface DMConversationPreview {
  kind: DMConversationPreviewKind
  direction: DMConversationPreviewDirection
  text: string
}

export interface DMConversationHubItem {
  conversation: DMConversation
  preference: DMConversationHubPreference | null
  preview: DMConversationPreview
  localDraft: string
  muted: boolean
  isPinned: boolean
  isArchived: boolean
  isUnread: boolean
}

export interface DMConversationHubBuildOptions {
  currentUserId: string | null | undefined
  preferences?: DMConversationHubPreference[]
  mutedConversationIds?: Iterable<string>
  draftsByConversationId?: Readonly<Record<string, string | null | undefined>>
}

export interface DMConversationHubSelection {
  mode: DMConversationHubMode
  query?: string
}

export type DMConversationPreferenceChanges = Partial<Pick<
  DMConversationHubPreference,
  'pinnedAt' | 'archivedAt' | 'markedUnreadAt'
>>

export interface DMConversationPreferenceRollbackToken {
  conversationId: string
  previous: DMConversationHubPreference | null
  optimistic: DMConversationHubPreference
}

const compactText = (value: string | null | undefined, maxLength = 120) => {
  const compacted = (value ?? '').replace(/\s+/g, ' ').trim()
  if (compacted.length <= maxLength) return compacted
  return `${compacted.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

const normalizeSearchText = (value: string | null | undefined) => (
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
)

const getMessageDirection = (
  message: DMMessage | undefined,
  currentUserId: string | null | undefined
): DMConversationPreviewDirection => {
  if (!message || !currentUserId) return 'none'
  return message.sender_id === currentUserId ? 'outgoing' : 'incoming'
}

const withOptionalCaption = (label: string, message: DMMessage) => {
  const caption = compactText(message.content)
  return caption ? `${label} · ${caption}` : label
}

export const getDMConversationDraftStorageKey = (conversationId: string) => (
  `draft-dm-${conversationId}`
)

export const normalizeDMConversationDraft = (value: string | null | undefined) => (
  compactText(value, 160)
)

export const getDMConversationPreview = ({
  conversation,
  currentUserId,
  localDraft,
}: {
  conversation: DMConversation
  currentUserId: string | null | undefined
  localDraft?: string | null
}): DMConversationPreview => {
  if (conversation.is_blocked) {
    return { kind: 'blocked', direction: 'none', text: 'Messaging unavailable' }
  }

  const draft = normalizeDMConversationDraft(localDraft)
  if (draft) {
    return { kind: 'draft', direction: 'outgoing', text: `Draft: ${draft}` }
  }

  const message = conversation.last_message
  if (!message) {
    return { kind: 'empty', direction: 'none', text: 'No messages yet' }
  }

  const direction = getMessageDirection(message, currentUserId)
  switch (message.message_type) {
    case 'image':
      return { kind: 'image', direction, text: withOptionalCaption('Photo', message) }
    case 'video':
      return { kind: 'video', direction, text: withOptionalCaption('Video', message) }
    case 'audio':
      return { kind: 'audio', direction, text: 'Voice message' }
    case 'file':
      return { kind: 'file', direction, text: withOptionalCaption('File', message) }
    case 'hype':
      return { kind: 'hype', direction, text: compactText(message.content) || 'Hype' }
    default:
      return { kind: 'text', direction, text: compactText(message.content) || 'Message' }
  }
}

const timestampValue = (value: string | null | undefined) => {
  const timestamp = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

export const compareDMConversationHubItems = (
  left: DMConversationHubItem,
  right: DMConversationHubItem
) => {
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1

  if (left.isPinned && right.isPinned) {
    const pinnedDifference = timestampValue(right.preference?.pinnedAt) - timestampValue(left.preference?.pinnedAt)
    if (pinnedDifference !== 0) return pinnedDifference
  }

  const activityDifference = timestampValue(right.conversation.last_message_at) - timestampValue(left.conversation.last_message_at)
  if (activityDifference !== 0) return activityDifference
  return left.conversation.id.localeCompare(right.conversation.id)
}

export const buildDMConversationHubItems = (
  conversations: DMConversation[],
  options: DMConversationHubBuildOptions
) => {
  const preferences = new Map(
    (options.preferences ?? []).map(preference => [preference.conversationId, preference])
  )
  const mutedConversationIds = new Set(options.mutedConversationIds ?? [])

  return conversations.map(conversation => {
    const preference = preferences.get(conversation.id) ?? null
    const localDraft = normalizeDMConversationDraft(
      options.draftsByConversationId?.[conversation.id]
    )
    return {
      conversation,
      preference,
      localDraft,
      muted: mutedConversationIds.has(conversation.id),
      isPinned: Boolean(preference?.pinnedAt),
      isArchived: Boolean(preference?.archivedAt),
      isUnread: Number(conversation.unread_count ?? 0) > 0 || Boolean(preference?.markedUnreadAt),
      preview: getDMConversationPreview({
        conversation,
        currentUserId: options.currentUserId,
        localDraft,
      }),
    } satisfies DMConversationHubItem
  }).sort(compareDMConversationHubItems)
}

const itemMatchesMode = (item: DMConversationHubItem, mode: DMConversationHubMode) => {
  if (mode === 'archived') return item.isArchived
  if (item.isArchived) return false
  return mode === 'unread' ? item.isUnread : true
}

const itemMatchesQuery = (item: DMConversationHubItem, query: string) => {
  if (!query) return true
  const otherUser = item.conversation.other_user
  const messageContent = item.conversation.is_blocked
    ? ''
    : item.conversation.last_message?.content
  const searchable = normalizeSearchText([
    otherUser?.display_name,
    otherUser?.username,
    item.preview.text,
    messageContent,
    item.conversation.is_blocked ? '' : item.localDraft,
  ].filter(Boolean).join(' '))
  return searchable.includes(query)
}

export const selectDMConversationHubItems = (
  items: DMConversationHubItem[],
  selection: DMConversationHubSelection
) => {
  const query = normalizeSearchText(selection.query)
  return items
    .filter(item => itemMatchesMode(item, selection.mode) && itemMatchesQuery(item, query))
    .sort(compareDMConversationHubItems)
}

const preferencesEqual = (
  left: DMConversationHubPreference,
  right: DMConversationHubPreference
) => (
  left.conversationId === right.conversationId &&
  left.pinnedAt === right.pinnedAt &&
  left.archivedAt === right.archivedAt &&
  left.markedUnreadAt === right.markedUnreadAt &&
  left.updatedAt === right.updatedAt
)

export const applyOptimisticDMConversationPreference = (
  preferences: DMConversationHubPreference[],
  conversationId: string,
  changes: DMConversationPreferenceChanges,
  updatedAt: string
) => {
  const previous = preferences.find(preference => preference.conversationId === conversationId) ?? null
  const optimistic: DMConversationHubPreference = {
    conversationId,
    pinnedAt: previous?.pinnedAt ?? null,
    archivedAt: previous?.archivedAt ?? null,
    markedUnreadAt: previous?.markedUnreadAt ?? null,
    updatedAt,
    ...changes,
  }
  const next = preferences.filter(preference => preference.conversationId !== conversationId)
  next.push(optimistic)

  return {
    preferences: next,
    rollbackToken: { conversationId, previous, optimistic } satisfies DMConversationPreferenceRollbackToken,
  }
}

export const rollbackOptimisticDMConversationPreference = (
  preferences: DMConversationHubPreference[],
  token: DMConversationPreferenceRollbackToken
) => {
  const current = preferences.find(preference => preference.conversationId === token.conversationId)
  if (!current || !preferencesEqual(current, token.optimistic)) {
    return { preferences, rolledBack: false }
  }

  const next = preferences.filter(preference => preference.conversationId !== token.conversationId)
  if (token.previous) next.push(token.previous)
  return { preferences: next, rolledBack: true }
}

