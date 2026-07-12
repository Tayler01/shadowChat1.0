import {
  pickPublicProfile,
} from '../../supabase/functions/_shared/public-profile'
import { getWorkingClient, type ChatMessageType } from './supabase'

type PublicProfile = ReturnType<typeof pickPublicProfile>

export interface DMRetrievalCursor {
  createdAt: string
  id: string
}

export type DMSharedContentFilter = 'all' | 'media' | 'files' | 'links'
export type DMSharedContentKind = Exclude<DMSharedContentFilter, 'all'>

export interface DMRetrievedMessage {
  id: string
  clientMessageId: string | null
  conversationId: string
  senderId: string
  content: string
  messageType: ChatMessageType
  fileUrl: string | null
  thumbnailUrl: string | null
  audioUrl: string | null
  audioDuration: number | null
  replyTo: string | null
  readAt: string | null
  readBy: string[]
  reactions: Record<string, { count: number; users: string[] }>
  editedAt: string | null
  createdAt: string
  updatedAt: string
  mediaWidth: number | null
  mediaHeight: number | null
  mediaProcessedAt: string | null
  thumbnailPath: string | null
  sender: PublicProfile
}

export interface DMSharedContentItem extends DMRetrievedMessage {
  contentKind: DMSharedContentKind
}

export interface DMRetrievalPage<T> {
  items: T[]
  nextCursor: DMRetrievalCursor | null
  hasMore: boolean
}

export interface DMMessageWindowResult {
  messages: DMRetrievedMessage[]
  hasOlder: boolean
  hasNewer: boolean
  targetStatus: 'resolved' | 'missing'
}

type RetrievalOptions = {
  limit?: number
  cursor?: Partial<DMRetrievalCursor> | null
}

type RetrievalRow = Record<string, unknown>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MESSAGE_TYPES = new Set<ChatMessageType>([
  'text',
  'command',
  'audio',
  'image',
  'video',
  'file',
  'hype',
])

const requireUuid = (value: string, label: string) => {
  const normalized = value.trim()
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a valid UUID`)
  }
  return normalized
}

const normalizeLimit = (value: number | undefined, fallback: number, maximum: number) => {
  if (value === undefined) return fallback
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value), 1), maximum)
}

const normalizeCursor = (cursor?: Partial<DMRetrievalCursor> | null) => {
  if (!cursor) return null
  if (!cursor.createdAt || !cursor.id) {
    throw new Error('DM retrieval cursor must include both createdAt and id')
  }
  const timestamp = new Date(cursor.createdAt)
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('DM retrieval cursor createdAt must be a valid timestamp')
  }
  return {
    createdAt: timestamp.toISOString(),
    id: requireUuid(cursor.id, 'DM retrieval cursor id'),
  } satisfies DMRetrievalCursor
}

const optionalString = (value: unknown) => typeof value === 'string' ? value : null

const requiredString = (row: RetrievalRow, key: string) => {
  const value = optionalString(row[key])
  if (!value) throw new Error(`Invalid DM retrieval response: ${key} is missing`)
  return value
}

const optionalNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

const optionalStringArray = (value: unknown) => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
)

const normalizeMessageType = (value: unknown): ChatMessageType => (
  typeof value === 'string' && MESSAGE_TYPES.has(value as ChatMessageType)
    ? value as ChatMessageType
    : 'text'
)

const normalizeReactions = (value: unknown): DMRetrievedMessage['reactions'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as DMRetrievedMessage['reactions']
}

const normalizeSender = (value: unknown) => pickPublicProfile(
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
)

const mapRetrievedMessage = (row: RetrievalRow): DMRetrievedMessage => {
  const createdAt = requiredString(row, 'created_at')
  return {
    id: requiredString(row, 'id'),
    clientMessageId: optionalString(row.client_message_id),
    conversationId: requiredString(row, 'conversation_id'),
    senderId: requiredString(row, 'sender_id'),
    content: optionalString(row.content) ?? '',
    messageType: normalizeMessageType(row.message_type),
    fileUrl: optionalString(row.file_url),
    thumbnailUrl: optionalString(row.thumbnail_url),
    audioUrl: optionalString(row.audio_url),
    audioDuration: optionalNumber(row.audio_duration),
    replyTo: optionalString(row.reply_to),
    readAt: optionalString(row.read_at),
    readBy: optionalStringArray(row.read_by),
    reactions: normalizeReactions(row.reactions),
    editedAt: optionalString(row.edited_at),
    createdAt,
    updatedAt: optionalString(row.updated_at) ?? createdAt,
    mediaWidth: optionalNumber(row.media_width),
    mediaHeight: optionalNumber(row.media_height),
    mediaProcessedAt: optionalString(row.media_processed_at),
    thumbnailPath: optionalString(row.thumbnail_path),
    sender: normalizeSender(row.sender),
  }
}

const compareNewestFirst = (left: DMRetrievedMessage, right: DMRetrievedMessage) => {
  const timestampDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt)
  return timestampDifference || right.id.localeCompare(left.id)
}

const compareOldestFirst = (left: DMRetrievedMessage, right: DMRetrievedMessage) => {
  const timestampDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt)
  return timestampDifference || left.id.localeCompare(right.id)
}

const createPage = <T extends DMRetrievedMessage>(items: T[], limit: number): DMRetrievalPage<T> => {
  const sorted = [...items].sort(compareNewestFirst)
  const last = sorted.length > 0 ? sorted[sorted.length - 1] : undefined
  return {
    items: sorted,
    nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
    hasMore: sorted.length === limit,
  }
}

const rowsFromData = (data: unknown): RetrievalRow[] => {
  if (data == null) return []
  if (!Array.isArray(data)) throw new Error('Invalid DM retrieval response: expected a row array')
  return data.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Invalid DM retrieval response: expected an object row')
    }
    return row as RetrievalRow
  })
}

export const searchDMConversationMessages = async (
  conversationId: string,
  query: string,
  options: RetrievalOptions = {}
): Promise<DMRetrievalPage<DMRetrievedMessage>> => {
  const targetConversationId = requireUuid(conversationId, 'Conversation id')
  const normalizedQuery = query.trim().slice(0, 200)
  const limit = normalizeLimit(options.limit, 30, 50)
  const cursor = normalizeCursor(options.cursor)
  if (!normalizedQuery) return { items: [], nextCursor: null, hasMore: false }

  const client = await getWorkingClient()
  const { data, error } = await client.rpc('search_dm_conversation_messages', {
    target_conversation_id: targetConversationId,
    search_query: normalizedQuery,
    result_limit: limit,
    before_created_at: cursor?.createdAt ?? null,
    before_id: cursor?.id ?? null,
  })
  if (error) throw error
  return createPage(rowsFromData(data).map(mapRetrievedMessage), limit)
}

export const listDMSharedContent = async (
  conversationId: string,
  options: RetrievalOptions & { filter?: DMSharedContentFilter } = {}
): Promise<DMRetrievalPage<DMSharedContentItem>> => {
  const targetConversationId = requireUuid(conversationId, 'Conversation id')
  const filter = options.filter ?? 'all'
  if (!['all', 'media', 'files', 'links'].includes(filter)) {
    throw new Error('Shared content filter must be all, media, files, or links')
  }
  const limit = normalizeLimit(options.limit, 30, 50)
  const cursor = normalizeCursor(options.cursor)

  const client = await getWorkingClient()
  const { data, error } = await client.rpc('list_dm_shared_content', {
    target_conversation_id: targetConversationId,
    content_filter: filter,
    result_limit: limit,
    before_created_at: cursor?.createdAt ?? null,
    before_id: cursor?.id ?? null,
  })
  if (error) throw error

  const items = rowsFromData(data).map(row => {
    const contentKind = optionalString(row.content_kind)
    if (contentKind !== 'media' && contentKind !== 'files' && contentKind !== 'links') {
      throw new Error('Invalid DM retrieval response: content_kind is invalid')
    }
    return { ...mapRetrievedMessage(row), contentKind } satisfies DMSharedContentItem
  })
  return createPage(items, limit)
}

const parseWindowMessages = (value: unknown) => {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('Invalid DM message window response')
    }
  }
  return rowsFromData(parsed).map(mapRetrievedMessage).sort(compareOldestFirst)
}

const missingWindow = (): DMMessageWindowResult => ({
  messages: [],
  hasOlder: false,
  hasNewer: false,
  targetStatus: 'missing',
})

export const getDMMessageWindow = async (
  conversationId: string,
  targetMessageId: string,
  options: { limit?: number } = {}
): Promise<DMMessageWindowResult> => {
  const targetConversationId = requireUuid(conversationId, 'Conversation id')
  const normalizedTargetMessageId = requireUuid(targetMessageId, 'Target message id')
  const limit = normalizeLimit(options.limit, 50, 100)
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('get_dm_message_window', {
    target_conversation_id: targetConversationId,
    target_message_id: normalizedTargetMessageId,
    target_limit: limit,
  })
  if (error) throw error

  const rows = rowsFromData(data)
  const row = rows[0]
  if (!row || row.target_status === 'missing') return missingWindow()
  if (row.target_status !== 'resolved') {
    throw new Error('Invalid DM message window response: target_status is invalid')
  }

  const messages = parseWindowMessages(row.messages)
  if (!messages.some(message => message.id === normalizedTargetMessageId)) {
    return missingWindow()
  }
  return {
    messages,
    hasOlder: row.has_older === true,
    hasNewer: row.has_newer === true,
    targetStatus: 'resolved',
  }
}
