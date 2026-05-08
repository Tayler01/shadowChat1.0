export type OptimisticMessageStatus = 'sending' | 'sent' | 'failed'

export interface OptimisticMessageFields {
  id: string
  client_message_id?: string | null
  content: string
  created_at: string
  optimistic?: boolean
  delivery_status?: OptimisticMessageStatus
  user_id?: string
  sender_id?: string
}

const createUuidFallback = () => {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createClientMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return createUuidFallback()
}

export function isClientMessageIdSchemaError(error: any) {
  const message = String(error?.message ?? error?.details ?? '')
  return (
    error?.code === 'PGRST204' &&
    message.includes('client_message_id')
  ) || (
    /client_message_id/i.test(message) &&
    /schema cache|column|could not find/i.test(message)
  )
}

const getAuthorId = (message: OptimisticMessageFields) => message.user_id ?? message.sender_id ?? null

const timestampsAreClose = (a: string, b: string) => {
  const left = Date.parse(a)
  const right = Date.parse(b)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  return Math.abs(left - right) <= 15000
}

export function findMatchingMessageIndex<TMessage extends OptimisticMessageFields>(
  messages: TMessage[],
  incoming: OptimisticMessageFields
) {
  const incomingClientId = incoming.client_message_id
  const incomingAuthorId = getAuthorId(incoming)

  return messages.findIndex(message => {
    if (message.id === incoming.id) return true
    if (incomingClientId && message.client_message_id === incomingClientId) return true
    if (incomingClientId && message.id === incomingClientId) return true
    if (message.client_message_id && message.client_message_id === incoming.id) return true

    return Boolean(
      (message.optimistic || incoming.optimistic) &&
      incomingAuthorId &&
      getAuthorId(message) === incomingAuthorId &&
      message.content === incoming.content &&
      timestampsAreClose(message.created_at, incoming.created_at)
    )
  })
}

export function upsertMessageIntoState<TMessage extends OptimisticMessageFields>(
  messages: TMessage[],
  incoming: TMessage
) {
  const existingIndex = findMatchingMessageIndex(messages, incoming)

  if (existingIndex < 0) {
    return [...messages, incoming]
  }

  const next = [...messages]
  const existing = next[existingIndex]
  next[existingIndex] = {
    ...existing,
    ...incoming,
    optimistic: incoming.optimistic ?? false,
    delivery_status: incoming.delivery_status ?? (incoming.optimistic ? 'sending' : 'sent'),
  }
  return next
}

export function markMessageSendFailed<TMessage extends OptimisticMessageFields>(
  messages: TMessage[],
  clientMessageId: string
) {
  return messages.map(message => {
    if (message.client_message_id !== clientMessageId && message.id !== clientMessageId) {
      return message
    }

    return {
      ...message,
      optimistic: true,
      delivery_status: 'failed' as const,
    }
  })
}
