import {
  getWorkingClient,
  searchUsersStrict,
  type BasicUser,
} from '../../lib/supabase'
import {
  normalizeConnectionListItem,
  normalizeConnectionStatePayload,
  normalizeConnectionSummary,
  type ConnectionAction,
  type ConnectionListItem,
  type ConnectionScope,
  type ConnectionStateRecord,
  type ConnectionSummary,
} from './connectionModel'

const throwRpcError = (error: unknown) => {
  if (error) throw error
}

export const getMyConnectionState = async (targetUserId: string): Promise<ConnectionStateRecord> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('get_my_connection_state', {
    target_user_id: targetUserId,
  })
  throwRpcError(error)
  return normalizeConnectionStatePayload(data)
}

export const getMyConnectionSummary = async (): Promise<ConnectionSummary> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('get_my_connection_summary')
  throwRpcError(error)
  return normalizeConnectionSummary(data)
}

interface ListMyConnectionsOptions {
  scope: ConnectionScope
  limit?: number
  beforeUpdatedAt?: string | null
  beforeId?: string | null
}

export const listMyConnections = async ({
  scope,
  limit = 40,
  beforeUpdatedAt = null,
  beforeId = null,
}: ListMyConnectionsOptions): Promise<ConnectionListItem[]> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('list_my_connections', {
    target_scope: scope,
    result_limit: limit,
    before_updated_at: beforeUpdatedAt,
    before_id: beforeId,
  })
  throwRpcError(error)
  if (!Array.isArray(data)) return []
  return data
    .map(normalizeConnectionListItem)
    .filter((item): item is ConnectionListItem => item !== null)
}

export const mutateConnection = async (
  targetUserId: string,
  action: ConnectionAction,
): Promise<ConnectionStateRecord> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('mutate_connection', {
    target_user_id: targetUserId,
    target_action: action,
  })
  throwRpcError(error)
  return normalizeConnectionStatePayload(data)
}

export const searchConnectionPeople = (
  term: string,
  options?: { signal?: AbortSignal },
): Promise<BasicUser[]> => searchUsersStrict(term, options)
