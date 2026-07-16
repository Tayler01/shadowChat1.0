import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
  type VideoGrant,
  type WebhookEvent,
} from 'npm:livekit-server-sdk@2.17.0'

/**
 * Service-role RPC contract expected from the Shado Live migration track.
 * Keeping the names centralized makes backend reconciliation explicit and
 * prevents the Edge Functions from falling back to direct table writes.
 */
export const SHADO_LIVE_PREPARE_SESSION_RPC = 'shado_live_prepare_session'
export const SHADO_LIVE_PREPARE_COMMAND_RPC = 'shado_live_prepare_command'
export const SHADO_LIVE_CLAIM_PROVIDER_OPERATIONS_RPC = 'shado_live_claim_provider_operations'
export const SHADO_LIVE_COMPLETE_PROVIDER_OPERATION_RPC = 'shado_live_complete_provider_operation'
export const SHADO_LIVE_INGEST_WEBHOOK_RPC = 'shado_live_ingest_provider_webhook'

export const SHADO_LIVE_SESSION_ACTIONS = ['create', 'join', 'resume', 'leave'] as const
export const SHADO_LIVE_COMMAND_ACTIONS = [
  'start',
  'raise_hand',
  'lower_hand',
  'send_message',
  'promote',
  'demote',
  'mute',
  'remove',
  'end',
] as const
export const SHADO_LIVE_ROLES = ['host', 'speaker', 'listener'] as const
export const SHADO_LIVE_PROVIDER_OPERATIONS = [
  'none',
  'create_room',
  'delete_room',
  'update_participant',
  'remove_participant',
] as const

export type ShadoLiveSessionAction = typeof SHADO_LIVE_SESSION_ACTIONS[number]
export type ShadoLiveCommandAction = typeof SHADO_LIVE_COMMAND_ACTIONS[number]
export type ShadoLiveRole = typeof SHADO_LIVE_ROLES[number]
export type ShadoLiveProviderOperation = typeof SHADO_LIVE_PROVIDER_OPERATIONS[number]

export type ShadoLiveOperationReceipt = {
  operationId: string | null
  roomId: string
  roomVersion: number
  roomState: string
  participantId: string | null
  participantUserId: string | null
  participantRole: ShadoLiveRole | null
  tokenVersion: number | null
  providerOperation: ShadoLiveProviderOperation
  targetUserId: string | null
  targetRole: ShadoLiveRole | null
  providerCanPublish: boolean | null
  displayName: string | null
  roomTitle: string | null
  roomDescription: string | null
  maxParticipants: number
  emptyTimeoutSeconds: number
  response: Record<string, unknown>
}

export type ShadoLiveProviderResult = {
  operation: ShadoLiveProviderOperation
  roomName: string
  participantIdentity?: string
  providerRoomSid?: string
  providerParticipantSid?: string
  alreadyAbsent?: boolean
  alreadyExisted?: boolean
}

type SupabaseRpcResult = {
  data: unknown
  error: { code?: string; message?: string; details?: string; hint?: string } | null
}

export type ShadoLiveServiceClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<SupabaseRpcResult>
}

export class ShadoLiveRequestError extends Error {
  status: number
  code: string
  retryable: boolean

  constructor(message: string, status = 400, code = 'invalid_request', retryable = false) {
    super(message)
    this.status = status
    this.code = code
    this.retryable = retryable
  }
}

export class ShadoLiveProviderError extends ShadoLiveRequestError {
  constructor(message = 'Live audio is temporarily unavailable.') {
    super(message, 503, 'provider_unavailable', true)
  }
}

export const SHADO_LIVE_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const MICROPHONE_TRACK_SOURCE = 2
const DEFAULT_TOKEN_TTL_SECONDS = 300
const MAX_TOKEN_TTL_SECONDS = 600

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const firstRecord = (value: unknown) => {
  const candidate = Array.isArray(value) ? value[0] : value
  return asRecord(candidate)
}

const asText = (value: unknown, maxLength = 500) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) return null
  return normalized
}

const asNullableText = (value: unknown, maxLength = 500) => {
  if (value == null || value === '') return null
  return asText(value, maxLength)
}

const asPositiveInteger = (value: unknown) => {
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null
}

const asBoolean = (value: unknown) => typeof value === 'boolean' ? value : null

const asRole = (value: unknown): ShadoLiveRole | null => (
  SHADO_LIVE_ROLES.includes(value as ShadoLiveRole) ? value as ShadoLiveRole : null
)

const asProviderOperation = (value: unknown): ShadoLiveProviderOperation => {
  if (value == null || value === '') return 'none'
  if (SHADO_LIVE_PROVIDER_OPERATIONS.includes(value as ShadoLiveProviderOperation)) {
    return value as ShadoLiveProviderOperation
  }
  throw new ShadoLiveRequestError(
    'Shado Live returned an unsupported provider operation.',
    503,
    'invalid_receipt',
    true,
  )
}

export const normalizeUuid = (value: unknown, label = 'id') => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!UUID_PATTERN.test(normalized)) {
    throw new ShadoLiveRequestError(`A valid ${label} is required.`, 400, `invalid_${label.replace(/\s+/gu, '_')}`)
  }
  return normalized
}

export const optionalUuid = (value: unknown, label = 'id') => (
  value == null || value === '' ? null : normalizeUuid(value, label)
)

export const normalizeIdempotencyKey = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!UUID_PATTERN.test(normalized)) {
    throw new ShadoLiveRequestError(
      'A stable UUID request id is required.',
      400,
      'invalid_idempotency_key',
    )
  }
  return normalized
}

export const parseJsonObject = async (req: Request, maxBytes = 16_384) => {
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ShadoLiveRequestError('Request body is too large.', 413, 'request_too_large')
  }
  const raw = await req.text()
  if (!raw || new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new ShadoLiveRequestError('A JSON request body is required.', 400, 'invalid_json')
  }
  try {
    const parsed = JSON.parse(raw)
    const record = asRecord(parsed)
    if (!record) throw new Error('not an object')
    return record
  } catch {
    throw new ShadoLiveRequestError('A valid JSON object is required.', 400, 'invalid_json')
  }
}

export const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...SHADO_LIVE_CORS_HEADERS,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...headers,
  },
})

export const errorResponse = (error: unknown) => {
  if (error && typeof error === 'object' && 'status' in error && 'retryAfterSeconds' in error) {
    const candidate = error as { message?: unknown; status?: unknown; retryAfterSeconds?: unknown }
    const retryAfter = Math.max(1, Number(candidate.retryAfterSeconds) || 1)
    return jsonResponse(
      { error: typeof candidate.message === 'string' ? candidate.message : 'Too many requests.', code: 'rate_limited' },
      Number(candidate.status) || 429,
      { 'Retry-After': String(Math.ceil(retryAfter)) },
    )
  }
  if (error instanceof ShadoLiveRequestError) {
    return jsonResponse(
      { error: error.message, code: error.code, retryable: error.retryable },
      error.status,
      error.retryable ? { 'Retry-After': '3' } : {},
    )
  }
  if (error && typeof error === 'object' && 'status' in error && Number((error as { status?: unknown }).status) === 401) {
    return jsonResponse({ error: 'Authentication required.', code: 'authentication_required' }, 401)
  }
  return jsonResponse(
    { error: 'Shado Live could not complete this request.', code: 'internal_error', retryable: true },
    503,
    { 'Retry-After': '3' },
  )
}

const mapRpcError = (error: NonNullable<SupabaseRpcResult['error']>) => {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')
  if (error.code === 'PGRST202') {
    return new ShadoLiveRequestError(
      'Shado Live is not available on this backend yet.',
      503,
      'backend_contract_unavailable',
      true,
    )
  }
  if (/not found|not available/iu.test(message)) {
    return new ShadoLiveRequestError('This Shado Live room is not available.', 404, 'room_not_available')
  }
  if (/forbidden|not allowed|not eligible|operator|host required|blocked|authentication/iu.test(message) || error.code === '42501') {
    return new ShadoLiveRequestError('This Shado Live action is not allowed.', 403, 'action_not_allowed')
  }
  if (/version|changed|conflict|already|state|ended|cancelled|full|limit/iu.test(message)) {
    return new ShadoLiveRequestError('The room changed. Refresh and try again.', 409, 'room_conflict')
  }
  return new ShadoLiveRequestError(
    'Shado Live could not verify this action.',
    503,
    'backend_unavailable',
    true,
  )
}

export const callShadoLiveRpc = async <T = unknown>(
  client: ShadoLiveServiceClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> => {
  const { data, error } = await client.rpc(name, args)
  if (error) throw mapRpcError(error)
  return data as T
}

export const parseOperationReceipt = (value: unknown): ShadoLiveOperationReceipt => {
  const row = firstRecord(value)
  if (!row) {
    throw new ShadoLiveRequestError('Shado Live returned an invalid authorization receipt.', 503, 'invalid_receipt', true)
  }
  const operationId = optionalUuid(row.operation_id ?? row.operationId, 'operation id')
  const roomId = normalizeUuid(row.room_id ?? row.roomId, 'room id')
  const roomVersion = asPositiveInteger(row.room_version ?? row.roomVersion)
  const roomState = asText(row.room_state ?? row.roomState, 40)
  if (!roomVersion || !roomState) {
    throw new ShadoLiveRequestError('Shado Live returned an incomplete room receipt.', 503, 'invalid_receipt', true)
  }
  const providerOperation = asProviderOperation(row.provider_operation ?? row.providerOperation)
  if (providerOperation !== 'none' && !operationId) {
    throw new ShadoLiveRequestError('Shado Live returned an incomplete provider receipt.', 503, 'invalid_receipt', true)
  }
  const participantUserId = optionalUuid(row.participant_user_id ?? row.participantUserId, 'participant user id')
  const targetUserId = optionalUuid(row.target_user_id ?? row.targetUserId, 'target user id')
  const participantRole = asRole(row.participant_role ?? row.participantRole)
  const targetRole = asRole(row.target_role ?? row.targetRole)
  const tokenVersionValue = row.token_version ?? row.tokenVersion
  const tokenVersion = tokenVersionValue == null ? null : asPositiveInteger(tokenVersionValue)
  if (tokenVersionValue != null && !tokenVersion) {
    throw new ShadoLiveRequestError('Shado Live returned an invalid token version.', 503, 'invalid_receipt', true)
  }

  return {
    operationId,
    roomId,
    roomVersion,
    roomState,
    participantId: optionalUuid(row.participant_id ?? row.participantId, 'participant id'),
    participantUserId,
    participantRole,
    tokenVersion,
    providerOperation,
    targetUserId,
    targetRole,
    providerCanPublish: asBoolean(row.provider_can_publish ?? row.providerCanPublish),
    displayName: asNullableText(row.display_name ?? row.displayName, 120),
    roomTitle: asNullableText(row.room_title ?? row.roomTitle, 120),
    roomDescription: asNullableText(row.room_description ?? row.roomDescription, 500),
    maxParticipants: Math.min(250, Math.max(4, asPositiveInteger(row.max_participants ?? row.maxParticipants) ?? 64)),
    emptyTimeoutSeconds: Math.min(600, Math.max(60, asPositiveInteger(row.empty_timeout_seconds ?? row.emptyTimeoutSeconds) ?? 120)),
    response: asRecord(row.response) ?? {},
  }
}

const requiredProviderEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new ShadoLiveProviderError('Live audio is not configured.')
  return value
}

const normalizeLiveKitUrls = (raw: string) => {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ShadoLiveProviderError('Live audio is not configured.')
  }
  if (parsed.username || parsed.password || !['https:', 'wss:'].includes(parsed.protocol)) {
    throw new ShadoLiveProviderError('Live audio is not configured securely.')
  }
  parsed.pathname = parsed.pathname.replace(/\/$/u, '')
  parsed.search = ''
  parsed.hash = ''
  const serviceUrl = new URL(parsed.toString())
  serviceUrl.protocol = 'https:'
  const clientUrl = new URL(parsed.toString())
  clientUrl.protocol = 'wss:'
  return {
    serviceUrl: serviceUrl.toString().replace(/\/$/u, ''),
    clientUrl: clientUrl.toString().replace(/\/$/u, ''),
  }
}

export const getLiveKitEnvironment = () => {
  const urls = normalizeLiveKitUrls(requiredProviderEnv('LIVEKIT_URL'))
  return {
    ...urls,
    apiKey: requiredProviderEnv('LIVEKIT_API_KEY'),
    apiSecret: requiredProviderEnv('LIVEKIT_API_SECRET'),
  }
}

export const createLiveKitClients = () => {
  const environment = getLiveKitEnvironment()
  return {
    ...environment,
    rooms: new RoomServiceClient(environment.serviceUrl, environment.apiKey, environment.apiSecret),
    webhooks: new WebhookReceiver(environment.apiKey, environment.apiSecret),
  }
}

export const liveKitRoomName = (roomId: string) => `shado-live-${normalizeUuid(roomId, 'room id')}`

const resolveTokenTtlSeconds = () => {
  const configured = Number(Deno.env.get('SHADO_LIVE_TOKEN_TTL_SECONDS') ?? '')
  if (!Number.isFinite(configured)) return DEFAULT_TOKEN_TTL_SECONDS
  return Math.min(MAX_TOKEN_TTL_SECONDS, Math.max(60, Math.floor(configured)))
}

const participantMetadata = (options: {
  userId: string
  participantId: string
  roomId: string
  role: ShadoLiveRole
  tokenVersion: number
}) => JSON.stringify({
  shadowChatUserId: options.userId,
  participantId: options.participantId,
  roomId: options.roomId,
  role: options.role,
  tokenVersion: options.tokenVersion,
  format: 'audio',
  recording: false,
})

const canRolePublish = (role: ShadoLiveRole) => role === 'host' || role === 'speaker'

export const buildParticipantGrant = (role: ShadoLiveRole): VideoGrant => {
  const canPublish = canRolePublish(role)
  return {
    roomJoin: true,
    canSubscribe: true,
    canPublish,
    canPublishSources: canPublish ? [MICROPHONE_TRACK_SOURCE] as VideoGrant['canPublishSources'] : [],
    canPublishData: false,
    canUpdateOwnMetadata: false,
    roomAdmin: false,
    roomCreate: false,
    roomList: false,
    roomRecord: false,
    recorder: false,
    ingressAdmin: false,
    agent: false,
    canManageAgentSession: false,
  }
}

const buildParticipantPermission = (role: ShadoLiveRole, canPublishOverride: boolean | null) => {
  const canPublish = canRolePublish(role) && (canPublishOverride ?? true)
  return {
    canSubscribe: true,
    canPublish,
    canPublishSources: canPublish ? [MICROPHONE_TRACK_SOURCE] : [],
    canPublishData: false,
    canUpdateMetadata: false,
    hidden: false,
    recorder: false,
    agent: false,
  }
}

export const issueShadoLiveToken = async (
  receipt: ShadoLiveOperationReceipt,
  authenticatedUserId: string,
) => {
  const userId = normalizeUuid(authenticatedUserId, 'user id')
  if (
    receipt.participantUserId !== userId ||
    !receipt.participantId ||
    !receipt.participantRole ||
    !receipt.tokenVersion
  ) {
    throw new ShadoLiveRequestError('The room authorization receipt does not match this user.', 403, 'receipt_mismatch')
  }
  if (!['green_room', 'live'].includes(receipt.roomState)) {
    throw new ShadoLiveRequestError('This room is not open for live audio.', 409, 'room_not_joinable')
  }

  const environment = getLiveKitEnvironment()
  const token = new AccessToken(environment.apiKey, environment.apiSecret, {
    identity: userId,
    name: receipt.displayName ?? undefined,
    ttl: resolveTokenTtlSeconds(),
    metadata: participantMetadata({
      userId,
      participantId: receipt.participantId,
      roomId: receipt.roomId,
      role: receipt.participantRole,
      tokenVersion: receipt.tokenVersion,
    }),
    attributes: {
      'shado.live.room_id': receipt.roomId,
      'shado.live.role': receipt.participantRole,
      'shado.live.token_version': String(receipt.tokenVersion),
      'shado.live.recording': 'false',
    },
  })
  token.addGrant({
    ...buildParticipantGrant(receipt.participantRole),
    room: liveKitRoomName(receipt.roomId),
  })
  return {
    token: await token.toJwt(),
    providerUrl: environment.clientUrl,
    expiresInSeconds: resolveTokenTtlSeconds(),
    identity: userId,
    tokenVersion: receipt.tokenVersion,
  }
}

const isProviderNotFound = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /not found|does not exist|participant does not exist|room does not exist|404/iu.test(message)
}

const isProviderAlreadyExists = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /already exists|room exists|409/iu.test(message)
}

const safeProviderError = (error: unknown) => {
  if (error instanceof ShadoLiveProviderError) return error
  return new ShadoLiveProviderError()
}

export const executeProviderOperation = async (
  receipt: ShadoLiveOperationReceipt,
): Promise<ShadoLiveProviderResult> => {
  const roomName = liveKitRoomName(receipt.roomId)
  if (receipt.providerOperation === 'none') return { operation: 'none', roomName }

  const { rooms } = createLiveKitClients()
  try {
    if (receipt.providerOperation === 'create_room') {
      let room
      try {
        room = await rooms.createRoom({
          name: roomName,
          emptyTimeout: receipt.emptyTimeoutSeconds,
          maxParticipants: receipt.maxParticipants,
          metadata: JSON.stringify({
            roomId: receipt.roomId,
            version: receipt.roomVersion,
            title: receipt.roomTitle,
            description: receipt.roomDescription,
            format: 'audio',
            recording: false,
          }),
        })
      } catch (error) {
        if (!isProviderAlreadyExists(error)) throw error
        return { operation: 'create_room', roomName, alreadyExisted: true }
      }
      return { operation: 'create_room', roomName, providerRoomSid: room.sid || undefined }
    }

    if (receipt.providerOperation === 'delete_room') {
      try {
        await rooms.deleteRoom(roomName)
      } catch (error) {
        if (!isProviderNotFound(error)) throw error
        return { operation: 'delete_room', roomName, alreadyAbsent: true }
      }
      return { operation: 'delete_room', roomName }
    }

    const targetIdentity = normalizeUuid(receipt.targetUserId, 'target user id')
    if (receipt.providerOperation === 'remove_participant') {
      try {
        await rooms.removeParticipant(roomName, targetIdentity, {
          revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
        })
      } catch (error) {
        if (!isProviderNotFound(error)) throw error
        return {
          operation: 'remove_participant',
          roomName,
          participantIdentity: targetIdentity,
          alreadyAbsent: true,
        }
      }
      return { operation: 'remove_participant', roomName, participantIdentity: targetIdentity }
    }

    if (!receipt.targetRole) {
      throw new ShadoLiveProviderError()
    }
    const participant = await rooms.updateParticipant(roomName, targetIdentity, {
      metadata: JSON.stringify({
        shadowChatUserId: targetIdentity,
        roomId: receipt.roomId,
        role: receipt.targetRole,
        tokenVersion: receipt.tokenVersion,
        format: 'audio',
        recording: false,
      }),
      attributes: {
        'shado.live.room_id': receipt.roomId,
        'shado.live.role': receipt.targetRole,
        'shado.live.token_version': String(receipt.tokenVersion ?? ''),
        'shado.live.recording': 'false',
      },
      permission: buildParticipantPermission(receipt.targetRole, receipt.providerCanPublish),
    })
    return {
      operation: 'update_participant',
      roomName,
      participantIdentity: targetIdentity,
      providerParticipantSid: participant.sid || undefined,
    }
  } catch (error) {
    throw safeProviderError(error)
  }
}

export const completeProviderOperation = async (
  client: ShadoLiveServiceClient,
  options: {
    operationId: string
    status: 'succeeded' | 'failed' | 'retryable'
    result?: ShadoLiveProviderResult | null
    errorCode?: string | null
    errorMessage?: string | null
  },
) => callShadoLiveRpc<Record<string, unknown>>(client, SHADO_LIVE_COMPLETE_PROVIDER_OPERATION_RPC, {
  p_operation_id: options.operationId,
  p_operation_status: options.status,
  p_provider_payload: options.result ?? {},
  p_error_code: options.errorCode ?? null,
  p_error_message: options.errorMessage ?? null,
})

export const verifyLiveKitWebhook = async (
  rawBody: string,
  authorization: string,
): Promise<WebhookEvent> => {
  if (!authorization.trim()) {
    throw new ShadoLiveRequestError('Webhook authorization is required.', 401, 'invalid_webhook_signature')
  }
  const { webhooks } = createLiveKitClients()
  try {
    return await webhooks.receive(rawBody, authorization)
  } catch {
    throw new ShadoLiveRequestError('Webhook signature is invalid.', 401, 'invalid_webhook_signature')
  }
}
