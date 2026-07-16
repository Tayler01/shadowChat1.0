import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createEdgeAdminClient } from '../_shared/edge-guard.ts'
import {
  SHADO_LIVE_INGEST_WEBHOOK_RPC,
  ShadoLiveRequestError,
  callShadoLiveRpc,
  errorResponse,
  jsonResponse,
  normalizeUuid,
  verifyLiveKitWebhook,
} from '../_shared/shado-live.ts'

const MAX_WEBHOOK_BYTES = 262_144
const ROOM_NAME_PATTERN = /^shado-live-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu
const ACCEPTED_EVENT_TYPES = new Set([
  'room_started',
  'room_finished',
  'participant_joined',
  'participant_left',
  'participant_connection_aborted',
  'participant_active',
  'participant_inactive',
  'track_published',
  'track_unpublished',
  'egress_started',
  'egress_updated',
  'egress_ended',
  'ingress_started',
  'ingress_ended',
])

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const boundedString = (value: unknown, label: string, maxLength: number) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized || normalized.length > maxLength) {
    throw new ShadoLiveRequestError(`Webhook ${label} is invalid.`, 400, 'invalid_webhook_event')
  }
  return normalized
}

const readRoomName = (event: Record<string, unknown>) => {
  const room = asRecord(event.room)
  const egress = asRecord(event.egressInfo ?? event.egress_info)
  const ingress = asRecord(event.ingressInfo ?? event.ingress_info)
  const roomName = room?.name ?? egress?.roomName ?? egress?.room_name ?? ingress?.roomName ?? ingress?.room_name
  return boundedString(roomName, 'room name', 160)
}

const readParticipantIdentity = (event: Record<string, unknown>) => {
  const participant = asRecord(event.participant)
  const identity = participant?.identity
  return identity == null || identity === '' ? null : normalizeUuid(identity, 'participant user id')
}

const readOccurredAt = (value: unknown) => {
  const seconds = typeof value === 'bigint' ? Number(value) : Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new ShadoLiveRequestError('Webhook timestamp is invalid.', 400, 'invalid_webhook_event')
  }
  const occurredAt = new Date(Math.floor(seconds) * 1000)
  if (Number.isNaN(occurredAt.getTime())) {
    throw new ShadoLiveRequestError('Webhook timestamp is invalid.', 400, 'invalid_webhook_event')
  }
  return occurredAt.toISOString()
}

serve(async (req): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.', code: 'method_not_allowed' }, 405)
  }

  try {
    const contentType = req.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('application/webhook+json') && !contentType.includes('application/json')) {
      throw new ShadoLiveRequestError('Webhook content type is invalid.', 415, 'invalid_content_type')
    }
    const contentLength = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
      throw new ShadoLiveRequestError('Webhook payload is too large.', 413, 'webhook_too_large')
    }

    const rawBody = await req.text()
    if (!rawBody || new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
      throw new ShadoLiveRequestError('Webhook payload is invalid.', 413, 'webhook_too_large')
    }

    // LiveKit signs the exact raw body. Verification must happen before any
    // JSON parsing or normalization so the signature covers what we ingest.
    const verifiedEvent = await verifyLiveKitWebhook(
      rawBody,
      req.headers.get('Authorization') ?? '',
    )
    const providerPayload = JSON.parse(rawBody) as unknown
    const event = asRecord(verifiedEvent)
    if (!event) {
      throw new ShadoLiveRequestError('Webhook event is invalid.', 400, 'invalid_webhook_event')
    }

    const eventId = boundedString(event.id, 'event id', 160)
    const eventType = boundedString(event.event, 'event type', 80)
    if (!ACCEPTED_EVENT_TYPES.has(eventType)) {
      throw new ShadoLiveRequestError('Webhook event type is unsupported.', 400, 'unsupported_webhook_event')
    }
    const roomName = readRoomName(event)
    const roomMatch = ROOM_NAME_PATTERN.exec(roomName)
    if (!roomMatch) {
      throw new ShadoLiveRequestError('Webhook room is not a Shado Live room.', 400, 'invalid_webhook_room')
    }
    const roomId = normalizeUuid(roomMatch[1], 'room id')
    const participantUserId = readParticipantIdentity(event)
    const occurredAt = readOccurredAt(event.createdAt ?? event.created_at)

    const admin = createEdgeAdminClient()
    const result = await callShadoLiveRpc<Record<string, unknown>>(
      admin,
      SHADO_LIVE_INGEST_WEBHOOK_RPC,
      {
        p_event_id: eventId,
        p_event_type: eventType,
        p_room_id: roomId,
        p_room_name: roomName,
        p_participant_user_id: participantUserId,
        p_occurred_at: occurredAt,
        p_provider_payload: providerPayload,
      },
    )

    return jsonResponse({ ok: true, accepted: true, ...result })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse(new ShadoLiveRequestError('Webhook JSON is invalid.', 400, 'invalid_webhook_event'))
    }
    return errorResponse(error)
  }
})
