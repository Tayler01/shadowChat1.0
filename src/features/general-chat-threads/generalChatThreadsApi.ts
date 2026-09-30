import {
  getWorkingClient,
  type GeneralChatMessageKey,
  type Message,
  type User,
} from '../../lib/supabase'

export const GENERAL_CHAT_THREAD_PAGE_SIZE = 40

export type GeneralChatThreadCursor = GeneralChatMessageKey

export type GeneralChatThreadWindow = {
  threadId: string
  rootMessage: Message | null
  replies: Message[]
  hasOlder: boolean
  hasNewer: boolean
  firstUnreadMessageId: string | null
  anchorStatus: string
  targetMessageId: string | null
  targetFound: boolean
}

export type GeneralChatThreadSummary = {
  threadId: string
  replyCount: number
  unreadCount: number
  lastReplyAt: string | null
  lastReplyId: string | null
  lastReplyPreview: string | null
  lastReplyAuthor: User | null
  participants: User[]
}

export type FetchGeneralChatThreadRequest = {
  threadId: string
  targetMessageId?: string | null
  before?: GeneralChatThreadCursor | null
  after?: GeneralChatThreadCursor | null
  readAnchor?: boolean
  limit?: number
}

type UnknownRecord = Record<string, unknown>

const asRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' ? value as UnknownRecord : {}
)

const asMessage = (value: unknown): Message | null => {
  const record = asRecord(value)
  if (record.unavailable === true) return null
  return typeof record.id === 'string' ? record as unknown as Message : null
}

const asUser = (value: unknown): User | null => {
  const record = asRecord(value)
  return typeof record.id === 'string' ? record as unknown as User : null
}

const asMessageList = (value: unknown): Message[] => (
  Array.isArray(value) ? value.map(asMessage).filter((message): message is Message => Boolean(message)) : []
)

const firstRpcRow = (value: unknown): UnknownRecord => {
  if (Array.isArray(value)) return asRecord(value[0])
  return asRecord(value)
}

const readString = (record: UnknownRecord, ...keys: string[]) => {
  for (const key of keys) {
    if (typeof record[key] === 'string') return record[key] as string
  }
  return null
}

const readNumber = (record: UnknownRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return 0
}

export const compareThreadMessages = (left: Message, right: Message) => {
  const leftTime = Date.parse(left.created_at)
  const rightTime = Date.parse(right.created_at)
  const createdAtComparison = Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? leftTime - rightTime
    : left.created_at.localeCompare(right.created_at)
  return createdAtComparison || left.id.localeCompare(right.id)
}

export const mergeThreadMessages = (current: Message[], incoming: Message[]) => {
  const messages = [...current]
  incoming.forEach(message => {
    const index = messages.findIndex(candidate => (
      candidate.id === message.id ||
      Boolean(
        message.client_message_id &&
        candidate.client_message_id === message.client_message_id
      )
    ))
    if (index >= 0) messages[index] = message
    else messages.push(message)
  })
  return messages.sort(compareThreadMessages)
}

export const normalizeGeneralChatThreadWindow = (
  value: unknown,
  request: FetchGeneralChatThreadRequest
): GeneralChatThreadWindow => {
  const row = firstRpcRow(value)
  const rootMessage = asMessage(row.root_message ?? row.rootMessage ?? row.thread_root ?? row.threadRoot)
  const replies = asMessageList(row.replies ?? row.thread_replies ?? row.threadReplies ?? row.messages)
    .filter(message => message.id !== rootMessage?.id)
    .sort(compareThreadMessages)
  const targetMessageId = request.targetMessageId ?? null
  const targetStatus = readString(row, 'target_status', 'targetStatus', 'anchor_status', 'anchorStatus')

  return {
    threadId: readString(row, 'thread_id', 'threadId', 'root_id', 'rootId') ?? request.threadId,
    rootMessage,
    replies,
    hasOlder: Boolean(row.has_older ?? row.hasOlder),
    hasNewer: Boolean(row.has_newer ?? row.hasNewer),
    firstUnreadMessageId: readString(row, 'first_unread_message_id', 'firstUnreadMessageId'),
    anchorStatus: readString(row, 'anchor_status', 'anchorStatus') ?? 'latest',
    targetMessageId,
    targetFound: !targetMessageId || targetStatus === 'found' || targetStatus === 'resolved' || replies.some(message => message.id === targetMessageId),
  }
}

const isMissingRpc = (error: unknown) => {
  const record = asRecord(error)
  const message = `${record.code ?? ''} ${record.message ?? ''} ${record.details ?? ''}`
  return message.includes('PGRST202') || /could not find (the )?function/i.test(message)
}

export const fetchGeneralChatThread = async (
  request: FetchGeneralChatThreadRequest
): Promise<GeneralChatThreadWindow> => {
  if (request.before && request.after) throw new Error('Use only one thread pagination cursor')
  const client = await getWorkingClient()
  const limit = request.limit !== undefined && Number.isFinite(request.limit)
    ? Math.max(1, Math.min(Math.trunc(request.limit), 80))
    : GENERAL_CHAT_THREAD_PAGE_SIZE
  const useReadWindow = request.readAnchor !== undefined || Boolean(request.after)
  const { data, error } = await client.rpc(useReadWindow ? 'get_general_chat_thread_read_window' : 'get_general_chat_thread', {
    target_thread_id: request.threadId,
    target_message_id: request.targetMessageId ?? null,
    target_before_created_at: request.before?.created_at ?? null,
    target_before_id: request.before?.id ?? null,
    ...(useReadWindow ? {
      target_after_created_at: request.after?.created_at ?? null,
      target_after_id: request.after?.id ?? null,
      target_read_anchor: request.readAnchor ?? false,
    } : {}),
    target_limit: limit,
  })

  if (error) throw error
  return normalizeGeneralChatThreadWindow(data, request)
}

export const normalizeGeneralChatThreadSummaries = (value: unknown): GeneralChatThreadSummary[] => {
  const rows = Array.isArray(value) ? value : []
  return rows.flatMap(item => {
    const row = asRecord(item)
    const summary = asRecord(row.summary)
    const fields = Object.keys(summary).length > 0 ? summary : row
    const threadId = readString(row, 'thread_id', 'threadId', 'root_id', 'rootId', 'root_message_id', 'rootMessageId')
    if (!threadId) return []
    return [{
      threadId,
      replyCount: Math.max(0, readNumber(fields, 'reply_count', 'replyCount')),
      unreadCount: Math.max(0, readNumber(fields, 'unread_count', 'unreadCount')),
      lastReplyAt: readString(fields, 'latest_reply_at', 'latestReplyAt', 'last_reply_at', 'lastReplyAt'),
      lastReplyId: readString(fields, 'latest_reply_id', 'latestReplyId', 'last_reply_id', 'lastReplyId', 'last_reply_message_id', 'lastReplyMessageId'),
      lastReplyPreview: readString(fields, 'latest_reply_preview', 'latestReplyPreview', 'last_reply_preview', 'lastReplyPreview'),
      lastReplyAuthor: asUser(fields.latest_reply_author ?? fields.latestReplyAuthor),
      participants: Array.isArray(fields.participants)
        ? fields.participants.filter(participant => Boolean(asRecord(participant).id)) as User[]
        : [],
    }]
  })
}

export const fetchGeneralChatThreadSummaries = async (
  rootMessageIds: string[]
): Promise<GeneralChatThreadSummary[]> => {
  const targetRootIds = Array.from(new Set(rootMessageIds.filter(Boolean))).slice(0, 50)
  if (targetRootIds.length === 0) return []

  const client = await getWorkingClient()
  let response = await client.rpc('get_general_chat_thread_summaries', {
    target_root_ids: targetRootIds,
  })

  if (response.error && isMissingRpc(response.error)) {
    response = await client.rpc('list_general_chat_thread_summaries', {
      target_root_ids: targetRootIds,
    })
  }

  if (response.error) throw response.error
  return normalizeGeneralChatThreadSummaries(response.data)
}
