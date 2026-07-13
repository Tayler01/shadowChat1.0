import type { BasicUser } from '../../lib/supabase'

export type ConnectionState =
  | 'none'
  | 'outgoing_pending'
  | 'incoming_pending'
  | 'connected'

export type ConnectionScope = 'accepted' | 'incoming' | 'outgoing'

export type ConnectionAction = 'request' | 'accept' | 'decline' | 'cancel' | 'remove'

export interface ConnectionProfile extends Partial<BasicUser> {
  id: string
  username: string
  display_name: string
}

export interface ConnectionStateRecord {
  state: ConnectionState
  connectionId: string | null
  profile: ConnectionProfile | null
  revision: number
  retryAfter: string | null
}

export interface ConnectionSummary {
  acceptedCount: number
  incomingCount: number
  outgoingCount: number
}

export interface ConnectionListItem extends ConnectionStateRecord {
  connectionId: string
  profile: ConnectionProfile
  requestedAt: string | null
  acceptedAt: string | null
  updatedAt: string
}

export interface ConnectionsChangedDetail {
  targetUserId?: string | null
  state?: ConnectionState
  source?: 'control' | 'hub' | 'notification'
}

export const CONNECTIONS_CHANGED_EVENT = 'shadowchat:connections-changed'

export const CONNECTION_NOTIFICATION_TYPES = [
  'connection_request',
  'connection_accepted',
  'connection_changed',
] as const

export type ConnectionNotificationType = typeof CONNECTION_NOTIFICATION_TYPES[number]

const CONNECTION_STATES = new Set<ConnectionState>([
  'none',
  'outgoing_pending',
  'incoming_pending',
  'connected',
])

const asRecord = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value)) return asRecord(value[0])
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

const asString = (value: unknown) => typeof value === 'string' ? value : null

const asCount = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

const normalizeState = (value: unknown): ConnectionState => (
  typeof value === 'string' && CONNECTION_STATES.has(value as ConnectionState)
    ? value as ConnectionState
    : 'none'
)

const normalizeDirection = (value: unknown): ConnectionState => {
  if (value === 'connected') return 'connected'
  if (value === 'outgoing') return 'outgoing_pending'
  if (value === 'incoming') return 'incoming_pending'
  return 'none'
}

export const normalizeConnectionProfile = (value: unknown): ConnectionProfile | null => {
  const record = asRecord(value)
  const id = asString(record.id ?? record.user_id)
  if (!id) return null
  const username = asString(record.username) ?? ''
  const displayName = asString(record.display_name) ?? (username || 'ShadowChat member')
  return { ...record, id, username, display_name: displayName } as ConnectionProfile
}

export const normalizeConnectionStatePayload = (value: unknown): ConnectionStateRecord => {
  const record = asRecord(value)
  return {
    state: record.state === undefined
      ? normalizeDirection(record.direction)
      : normalizeState(record.state),
    connectionId: asString(record.connection_id ?? record.connectionId),
    profile: normalizeConnectionProfile(record.profile ?? record.other_user ?? record.otherUser),
    revision: asCount(record.revision),
    retryAfter: asString(record.retry_after ?? record.retryAfter),
  }
}

export const normalizeConnectionSummary = (value: unknown): ConnectionSummary => {
  const record = asRecord(value)
  return {
    acceptedCount: asCount(record.accepted_count ?? record.acceptedCount ?? record.connections),
    incomingCount: asCount(record.incoming_count ?? record.incomingCount ?? record.incoming),
    outgoingCount: asCount(record.outgoing_count ?? record.outgoingCount ?? record.outgoing),
  }
}

export const normalizeConnectionListItem = (value: unknown): ConnectionListItem | null => {
  const record = asRecord(value)
  const normalized = normalizeConnectionStatePayload(record)
  const updatedAt = asString(record.updated_at ?? record.updatedAt)
  if (!normalized.connectionId || !normalized.profile || !updatedAt) return null
  return {
    ...normalized,
    connectionId: normalized.connectionId,
    profile: normalized.profile,
    requestedAt: asString(record.requested_at ?? record.requestedAt),
    acceptedAt: asString(record.accepted_at ?? record.acceptedAt),
    updatedAt,
  }
}

export const getConnectionStateLabel = (state: ConnectionState) => {
  switch (state) {
    case 'outgoing_pending': return 'Requested'
    case 'incoming_pending': return 'Respond'
    case 'connected': return 'Connected'
    default: return 'Connect'
  }
}

export const getConnectionActions = (state: ConnectionState): ConnectionAction[] => {
  switch (state) {
    case 'outgoing_pending': return ['cancel']
    case 'incoming_pending': return ['accept', 'decline']
    case 'connected': return ['remove']
    default: return ['request']
  }
}

export const getOptimisticConnectionState = (
  state: ConnectionState,
  action: ConnectionAction,
): ConnectionState => {
  if (state === 'none' && action === 'request') return 'outgoing_pending'
  if (state === 'incoming_pending' && action === 'accept') return 'connected'
  if (state === 'incoming_pending' && action === 'decline') return 'none'
  if (state === 'outgoing_pending' && action === 'cancel') return 'none'
  if (state === 'connected' && action === 'remove') return 'none'
  return state
}

export const isConnectionNotificationType = (value: unknown): value is ConnectionNotificationType => (
  typeof value === 'string'
  && CONNECTION_NOTIFICATION_TYPES.includes(value as ConnectionNotificationType)
)

export const getConnectionNotificationTitle = (
  type: ConnectionNotificationType,
  payload: unknown,
) => {
  const record = asRecord(payload)
  const actor = asRecord(record.actor ?? record.profile)
  const actorName = asString(actor.display_name)
    ?? (asString(actor.username) ? `@${asString(actor.username)}` : null)
    ?? 'Someone'
  if (type === 'connection_request') return `${actorName} sent you a connection request`
  if (type === 'connection_accepted') return `${actorName} accepted your connection request`
  return null
}

export const getConnectionNotificationTargetUserId = (payload: unknown) => {
  const record = asRecord(payload)
  const actor = asRecord(record.actor ?? record.profile)
  return asString(actor.id ?? actor.user_id ?? record.actor_id ?? record.target_user_id)
}

export const shouldPresentConnectionNotification = (payload: unknown) => {
  const record = asRecord(payload)
  return record.notify !== false
}

export const dispatchConnectionsChanged = (detail: ConnectionsChangedDetail = {}) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ConnectionsChangedDetail>(CONNECTIONS_CHANGED_EVENT, { detail }))
}
