import { getWorkingClient } from '../../../../lib/supabase'
import {
  createShadoLiveRequestId,
  getShadoLiveErrorMessage,
  normalizeShadoLiveMessageBody,
  normalizeShadoLiveRoom,
  normalizeShadoLiveRoomList,
  normalizeShadoLiveSession,
  normalizeShadoLiveTitle,
  type ShadoLiveRoom,
  type ShadoLiveSession,
} from './shadoLiveModel'

export type ShadoLiveSessionAction = 'create' | 'join' | 'resume'
export type ShadoLiveCommandAction =
  | 'start'
  | 'raise_hand'
  | 'lower_hand'
  | 'send_message'
  | 'promote'
  | 'demote'
  | 'mute'
  | 'remove'
  | 'end'

export interface ShadoLiveCommandInput {
  action: ShadoLiveCommandAction
  roomId: string
  targetUserId?: string
  body?: string
  expectedVersion?: number
  requestId?: string
}

const unwrapFunctionData = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  return record.data ?? record.result ?? value
}

const assertRoomId = (roomId: string) => {
  const normalized = roomId.trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(normalized)) {
    throw new Error('A valid Shado Live room is required.')
  }
  return normalized
}

const invoke = async (
  functionName: 'shado-live-session' | 'shado-live-command' | 'shado-live-reconcile',
  body: Record<string, unknown>
) => {
  const client = await getWorkingClient()
  const { data, error } = await client.functions.invoke(functionName, { body })
  if (error) throw new Error(getShadoLiveErrorMessage(error, 'Shado Live is unavailable right now.'))
  return unwrapFunctionData(data)
}

export const reconcileShadoLive = async (requestId = createShadoLiveRequestId()) => {
  const data = await invoke('shado-live-reconcile', { request_id: requestId })
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null
  if (record?.ok !== true) throw new Error('Shado Live reconciliation was not confirmed.')
  return record
}

export const listMyShadoLiveRooms = async (limit = 20): Promise<ShadoLiveRoom[]> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('list_my_shado_live_rooms', {
    result_limit: Math.max(1, Math.min(50, Math.floor(limit))),
  })
  if (error) throw error
  return normalizeShadoLiveRoomList(data)
}

export const getMyShadoLiveRoom = async (roomId: string): Promise<ShadoLiveRoom> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('get_my_shado_live_room', {
    target_room_id: assertRoomId(roomId),
  })
  if (error) throw error
  const source = Array.isArray(data) ? data[0] : data
  const room = normalizeShadoLiveRoom(source)
  if (!room) throw new Error('Shado Live returned an invalid room snapshot.')
  return room
}

export const openShadoLiveSession = async ({
  action,
  roomId,
  title,
  requestId = createShadoLiveRequestId(),
}: {
  action: ShadoLiveSessionAction
  roomId?: string
  title?: string
  requestId?: string
}): Promise<ShadoLiveSession> => {
  const normalizedTitle = typeof title === 'string' ? normalizeShadoLiveTitle(title) : ''
  if (action === 'create' && normalizedTitle.length < 3) {
    throw new Error('Room titles must be at least 3 characters.')
  }
  if (action !== 'create' && !roomId) throw new Error('A Shado Live room is required.')

  const data = await invoke('shado-live-session', {
    action,
    room_id: roomId ? assertRoomId(roomId) : null,
    title: action === 'create' ? normalizedTitle : null,
    request_id: requestId,
  })
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null
  const confirmedRoomId = typeof record?.roomId === 'string'
    ? record.roomId
    : typeof record?.room_id === 'string'
      ? record.room_id
      : null
  if (record?.ok !== true || record?.action !== action || !confirmedRoomId) {
    throw new Error('Shado Live did not confirm the room session.')
  }
  const room = await getMyShadoLiveRoom(confirmedRoomId)
  return normalizeShadoLiveSession({ room, media: record.media })
}

export const leaveShadoLiveSession = async (
  roomId: string,
  requestId = createShadoLiveRequestId()
) => {
  const data = await invoke('shado-live-session', {
    action: 'leave',
    room_id: assertRoomId(roomId),
    title: null,
    request_id: requestId,
  })
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null
  const confirmedRoomId = record?.roomId ?? record?.room_id
  if (record?.ok !== true || record?.action !== 'leave' || confirmedRoomId !== roomId) {
    throw new Error('The server did not confirm that you left the room.')
  }
  return true
}

export const sendShadoLiveCommand = async ({
  action,
  roomId,
  targetUserId,
  body,
  expectedVersion,
  requestId = createShadoLiveRequestId(),
}: ShadoLiveCommandInput): Promise<ShadoLiveRoom> => {
  const normalizedBody = typeof body === 'string' ? normalizeShadoLiveMessageBody(body) : ''
  if (action === 'send_message' && !normalizedBody) throw new Error('Write a message before sending.')
  if (['promote', 'demote', 'mute', 'remove'].includes(action) && !targetUserId?.trim()) {
    throw new Error('A room participant is required for this command.')
  }
  const requiresExpectedVersion = ['start', 'promote', 'demote', 'mute', 'remove', 'end'].includes(action)
  if (requiresExpectedVersion && (!Number.isInteger(expectedVersion) || Number(expectedVersion) <= 0)) {
    throw new Error('The latest room version is required for this host command.')
  }

  const data = await invoke('shado-live-command', {
    action,
    room_id: assertRoomId(roomId),
    target_user_id: targetUserId?.trim() || null,
    body: action === 'send_message' ? normalizedBody : null,
    expected_version: requiresExpectedVersion ? expectedVersion : null,
    request_id: requestId,
  })
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null
  const confirmedRoomId = record?.roomId ?? record?.room_id
  if (record?.ok !== true || record?.action !== action || confirmedRoomId !== roomId) {
    throw new Error('Shado Live did not confirm the room command.')
  }
  return getMyShadoLiveRoom(roomId)
}
