export const SHADO_LIVE_ROOM_STATUSES = [
  'scheduled',
  'green_room',
  'live',
  'ending',
  'ended',
  'cancelled',
] as const

export const SHADO_LIVE_ROLES = ['host', 'speaker', 'listener'] as const
export const SHADO_LIVE_STAGE_REQUEST_STATUSES = ['none', 'raised', 'approved', 'declined'] as const

export type ShadoLiveRoomStatus = typeof SHADO_LIVE_ROOM_STATUSES[number]
export type ShadoLiveRole = typeof SHADO_LIVE_ROLES[number]
export type ShadoLiveStageRequestStatus = typeof SHADO_LIVE_STAGE_REQUEST_STATUSES[number]
export type ShadoLiveBackendState = 'idle' | 'loading' | 'authorizing' | 'ready' | 'failed'
export type ShadoLiveMediaState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
export type ShadoLiveSyncState = 'idle' | 'connecting' | 'synced' | 'stale'
export type ShadoLiveTerminalReason = 'ended' | 'removed' | 'replaced' | 'ineligible' | 'failed'

export interface ShadoLiveParticipant {
  userId: string
  participantId: string | null
  providerIdentity: string
  displayName: string
  username: string | null
  avatarUrl: string | null
  role: ShadoLiveRole
  hostMuted: boolean
  handRaised: boolean
  joinedAt: string | null
}

export interface ShadoLiveMessage {
  id: string
  roomId: string
  senderId: string
  senderDisplayName: string
  body: string
  createdAt: string
  clientNonce: string | null
}

export interface ShadoLiveRoom {
  id: string
  version: number
  title: string
  status: ShadoLiveRoomStatus
  hostId: string
  hostDisplayName: string
  listenerCount: number
  speakerLimit: number
  recordingEnabled: boolean
  canJoin: boolean
  canHost: boolean
  myRole: ShadoLiveRole | null
  myStageRequestStatus: ShadoLiveStageRequestStatus
  hostGraceExpiresAt: string | null
  startedAt: string | null
  scheduledAt: string | null
  endedAt: string | null
  participants: ShadoLiveParticipant[]
  messages: ShadoLiveMessage[]
  updatedAt: string
}

export interface ShadoLiveMediaCredentials {
  serverUrl: string
  participantToken: string
  expiresAt: string
}

export interface ShadoLiveSession {
  room: ShadoLiveRoom
  media: ShadoLiveMediaCredentials | null
}

export interface ShadoLiveMediaParticipant {
  identity: string
  name: string | null
  speaking: boolean
  audioLevel: number
  microphoneEnabled: boolean
  connectionQuality: string | null
}

export interface ShadoLiveMediaSnapshot {
  state: ShadoLiveMediaState
  participants: ShadoLiveMediaParticipant[]
  microphoneEnabled: boolean
  microphoneAllowed: boolean
  audioPlaybackEnabled: boolean
  audioPlaybackBlocked: boolean
  error: string | null
}

export const EMPTY_SHADO_LIVE_MEDIA_SNAPSHOT: ShadoLiveMediaSnapshot = Object.freeze({
  state: 'idle',
  participants: [],
  microphoneEnabled: false,
  microphoneAllowed: false,
  audioPlaybackEnabled: false,
  audioPlaybackBlocked: false,
  error: null,
})

const roomStatusSet = new Set<string>(SHADO_LIVE_ROOM_STATUSES)
const roleSet = new Set<string>(SHADO_LIVE_ROLES)
const stageRequestStatusSet = new Set<string>(SHADO_LIVE_STAGE_REQUEST_STATUSES)

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const readString = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

const readNullableString = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key]
    if (value === null) return null
    if (typeof value === 'string') return value.trim() || null
  }
  return null
}

const readBoolean = (record: Record<string, unknown>, fallback: boolean, ...keys: string[]) => {
  for (const key of keys) {
    if (typeof record[key] === 'boolean') return record[key] as boolean
  }
  return fallback
}

const readCount = (record: Record<string, unknown>, fallback: number, ...keys: string[]) => {
  for (const key of keys) {
    const value = Number(record[key])
    if (Number.isFinite(value) && value >= 0) return Math.floor(value)
  }
  return fallback
}

const readArray = (record: Record<string, unknown>, ...keys: string[]): unknown[] => {
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[]
  }
  return []
}

const normalizeRole = (value: unknown): ShadoLiveRole | null => (
  typeof value === 'string' && roleSet.has(value) ? value as ShadoLiveRole : null
)

export const normalizeShadoLiveParticipant = (value: unknown): ShadoLiveParticipant | null => {
  const record = asRecord(value)
  if (!record) return null
  const user = asRecord(record.user) ?? record
  const userId = readString(record, 'user_id', 'userId') ?? readString(user, 'id')
  const displayName = readString(record, 'display_name', 'displayName')
    ?? readString(user, 'display_name', 'displayName', 'username')
  const role = normalizeRole(record.role)
  if (!userId || !displayName || !role) return null

  return {
    userId,
    participantId: readNullableString(record, 'participant_id', 'participantId'),
    providerIdentity: readString(record, 'provider_identity', 'providerIdentity') ?? userId,
    displayName,
    username: readNullableString(record, 'username') ?? readNullableString(user, 'username'),
    avatarUrl: readNullableString(record, 'avatar_url', 'avatarUrl')
      ?? readNullableString(user, 'avatar_url', 'avatarUrl', 'avatar_thumbnail_url', 'avatarThumbnailUrl'),
    role,
    hostMuted: readBoolean(record, false, 'host_muted', 'hostMuted'),
    handRaised: readBoolean(record, false, 'hand_raised', 'handRaised'),
    joinedAt: readNullableString(record, 'joined_at', 'joinedAt'),
  }
}

export const normalizeShadoLiveMessage = (value: unknown, fallbackRoomId?: string): ShadoLiveMessage | null => {
  const record = asRecord(value)
  if (!record) return null
  const sender = asRecord(record.sender) ?? record
  const id = readString(record, 'id', 'message_id', 'messageId')
  const roomId = readString(record, 'room_id', 'roomId') ?? fallbackRoomId?.trim() ?? null
  const senderId = readString(record, 'sender_id', 'senderId') ?? readString(sender, 'id')
  const senderDisplayName = readString(record, 'sender_display_name', 'senderDisplayName')
    ?? readString(sender, 'display_name', 'displayName', 'username')
  const body = readString(record, 'body')
  const createdAt = readString(record, 'created_at', 'createdAt')
  if (!id || !roomId || !senderId || !senderDisplayName || !body || !createdAt) return null

  return {
    id,
    roomId,
    senderId,
    senderDisplayName,
    body: body.slice(0, 500),
    createdAt,
    clientNonce: readNullableString(record, 'client_nonce', 'clientNonce'),
  }
}

export const normalizeShadoLiveRoom = (value: unknown): ShadoLiveRoom | null => {
  const record = asRecord(value)
  if (!record) return null
  const host = asRecord(record.host)
  const id = readString(record, 'id', 'room_id', 'roomId')
  const title = readString(record, 'title')
  const hostId = readString(record, 'host_id', 'hostId') ?? (host ? readString(host, 'id') : null)
  const hostDisplayName = readString(record, 'host_display_name', 'hostDisplayName')
    ?? (host ? readString(host, 'display_name', 'displayName', 'username') : null)
  const statusValue = readString(record, 'status')
    ?? readString(record, 'room_status', 'roomStatus', 'room_state', 'roomState')
  if (!id || !title || !hostId || !hostDisplayName || !statusValue || !roomStatusSet.has(statusValue)) {
    return null
  }

  const callerRole = normalizeRole(record.caller_role ?? record.callerRole ?? record.my_role ?? record.myRole)
  const stageRequestValue = readString(record, 'my_stage_request_status', 'myStageRequestStatus')
    ?? (record.handRaised === true || record.hand_raised === true ? 'raised' : 'none')
  const participantsSource = readArray(record, 'participants', 'speakers')
  const participants = participantsSource
    .map(normalizeShadoLiveParticipant)
    .filter((participant): participant is ShadoLiveParticipant => participant !== null)
  const raisedUserIds = new Set(
    readArray(record, 'stage_requests', 'stageRequests')
      .map(request => {
        const requestRecord = asRecord(request)
        const requestUser = asRecord(requestRecord?.user)
        return requestRecord?.status === 'raised' && requestUser
          ? readString(requestUser, 'id')
          : null
      })
      .filter((userId): userId is string => userId !== null)
  )
  for (const participant of participants) {
    if (raisedUserIds.has(participant.userId)) participant.handRaised = true
  }
  if (!participants.some(participant => participant.userId === hostId)) {
    const normalizedHost = normalizeShadoLiveParticipant({
      participantId: null,
      role: 'host',
      user: host ?? { id: hostId, display_name: hostDisplayName },
    })
    if (normalizedHost) participants.unshift(normalizedHost)
  }
  const messages = readArray(record, 'messages')
    .map(message => normalizeShadoLiveMessage(message, id))
    .filter((message): message is ShadoLiveMessage => message !== null)
  const startedAt = readNullableString(record, 'started_at', 'startedAt')
  const scheduledAt = readNullableString(record, 'scheduled_at', 'scheduledAt')

  return {
    id,
    version: readCount(record, 0, 'revision', 'version', 'room_revision', 'roomRevision', 'room_version', 'roomVersion'),
    title: title.slice(0, 100),
    status: statusValue as ShadoLiveRoomStatus,
    hostId,
    hostDisplayName,
    listenerCount: readCount(record, 0, 'listener_count', 'listenerCount'),
    speakerLimit: Math.max(1, readCount(record, 3, 'speaker_limit', 'speakerLimit')),
    recordingEnabled: readBoolean(record, false, 'recording_enabled', 'recordingEnabled'),
    canJoin: readBoolean(record, statusValue === 'live', 'can_join', 'canJoin'),
    canHost: readBoolean(record, callerRole === 'host', 'can_host', 'canHost'),
    myRole: callerRole,
    myStageRequestStatus: stageRequestStatusSet.has(stageRequestValue)
      ? stageRequestValue as ShadoLiveStageRequestStatus
      : 'none',
    hostGraceExpiresAt: readNullableString(record, 'host_grace_expires_at', 'hostGraceExpiresAt'),
    startedAt,
    scheduledAt,
    endedAt: readNullableString(record, 'ended_at', 'endedAt'),
    participants,
    messages,
    updatedAt: readString(record, 'updated_at', 'updatedAt') ?? startedAt ?? scheduledAt ?? '',
  }
}

export const normalizeShadoLiveRoomList = (value: unknown): ShadoLiveRoom[] => {
  const source = Array.isArray(value)
    ? value
    : readArray(asRecord(value) ?? {}, 'rooms')
  return source
    .map(normalizeShadoLiveRoom)
    .filter((room): room is ShadoLiveRoom => room !== null)
}

export const normalizeShadoLiveSession = (value: unknown): ShadoLiveSession => {
  const record = asRecord(value)
  const room = normalizeShadoLiveRoom(record?.room ?? value)
  if (!record || !room) throw new Error('Shado Live returned an invalid room session.')

  const mediaRecord = asRecord(record.media)
  let media: ShadoLiveMediaCredentials | null = null
  if (mediaRecord) {
    const serverUrl = readString(mediaRecord, 'server_url', 'serverUrl', 'url')
    const participantToken = readString(mediaRecord, 'participant_token', 'participantToken', 'token')
    const expiresAt = readString(mediaRecord, 'expires_at', 'expiresAt')
    if (!serverUrl || !participantToken || !expiresAt || !/^wss:\/\//iu.test(serverUrl)) {
      throw new Error('Shado Live returned invalid media credentials.')
    }
    media = { serverUrl, participantToken, expiresAt }
  }

  if ((room.status === 'green_room' || room.status === 'live') && !media) {
    throw new Error('The active room did not return authorized media credentials.')
  }

  return { room, media }
}

export const getShadoLiveErrorMessage = (caught: unknown, fallback: string) => {
  if (caught instanceof Error && caught.message.trim()) return caught.message
  const record = asRecord(caught)
  return readString(record ?? {}, 'message', 'error_description') ?? fallback
}

export const isShadoLiveTerminalStatus = (status: ShadoLiveRoomStatus) => (
  status === 'ended' || status === 'cancelled'
)

export const canPublishShadoLiveMicrophone = (role: ShadoLiveRole | null) => (
  role === 'host' || role === 'speaker'
)

export const createShadoLiveRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

export const normalizeShadoLiveTitle = (value: string) => value.trim().replace(/\s+/gu, ' ').slice(0, 100)
export const normalizeShadoLiveMessageBody = (value: string) => value.trim().replace(/\s+/gu, ' ').slice(0, 500)
