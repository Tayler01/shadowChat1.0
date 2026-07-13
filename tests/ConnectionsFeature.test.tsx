import {
  getConnectionActions,
  getConnectionNotificationTargetUserId,
  getConnectionNotificationTitle,
  getConnectionStateLabel,
  getOptimisticConnectionState,
  isConnectionNotificationType,
  normalizeConnectionListItem,
  normalizeConnectionStatePayload,
  normalizeConnectionSummary,
} from '../src/features/connections/connectionModel'

describe('Connections feature model', () => {
  it('normalizes state and summary RPC payloads', () => {
    expect(normalizeConnectionStatePayload({
      state: 'connected',
      connection_id: 'connection-1',
      profile: { id: 'user-2', username: 'jules', display_name: 'Jules' },
      revision: 4,
    })).toMatchObject({
      state: 'connected',
      connectionId: 'connection-1',
      profile: { id: 'user-2', username: 'jules', display_name: 'Jules' },
      revision: 4,
    })

    expect(normalizeConnectionSummary({
      accepted_count: 8,
      incoming_count: '2',
      outgoing_count: null,
    })).toEqual({ acceptedCount: 8, incomingCount: 2, outgoingCount: 0 })

    expect(normalizeConnectionStatePayload({
      status: 'pending',
      direction: 'incoming',
      connection_id: 'connection-2',
      revision: 2,
    })).toMatchObject({
      state: 'incoming_pending',
      connectionId: 'connection-2',
      revision: 2,
    })

    expect(normalizeConnectionSummary({
      connections: 3,
      incoming: 1,
      outgoing: 2,
    })).toEqual({ acceptedCount: 3, incomingCount: 1, outgoingCount: 2 })
  })

  it('rejects incomplete list rows instead of rendering unsafe data', () => {
    expect(normalizeConnectionListItem({ connection_id: 'missing-profile' })).toBeNull()
    expect(normalizeConnectionListItem({
      connection_id: 'connection-1',
      state: 'incoming_pending',
      profile: { id: 'user-2', username: 'jules', display_name: 'Jules' },
      requested_at: '2026-07-13T12:00:00.000Z',
      accepted_at: null,
      updated_at: '2026-07-13T12:00:00.000Z',
      revision: 2,
    })).toMatchObject({
      connectionId: 'connection-1',
      state: 'incoming_pending',
      requestedAt: '2026-07-13T12:00:00.000Z',
    })

    expect(normalizeConnectionListItem({
      connection_id: 'connection-2',
      direction: 'connected',
      other_user: { id: 'user-3', username: 'river', display_name: 'River' },
      requested_at: '2026-07-13T12:00:00.000Z',
      accepted_at: '2026-07-13T12:01:00.000Z',
      updated_at: '2026-07-13T12:01:00.000Z',
      revision: 2,
    })).toMatchObject({
      connectionId: 'connection-2',
      state: 'connected',
      profile: { id: 'user-3', username: 'river', display_name: 'River' },
    })
  })

  it('maps each state to the expected member action', () => {
    expect(getConnectionStateLabel('none')).toBe('Connect')
    expect(getConnectionStateLabel('outgoing_pending')).toBe('Requested')
    expect(getConnectionActions('none')).toEqual(['request'])
    expect(getConnectionActions('incoming_pending')).toEqual(['accept', 'decline'])
    expect(getConnectionActions('connected')).toEqual(['remove'])
  })

  it('only applies valid optimistic transitions', () => {
    expect(getOptimisticConnectionState('none', 'request')).toBe('outgoing_pending')
    expect(getOptimisticConnectionState('incoming_pending', 'accept')).toBe('connected')
    expect(getOptimisticConnectionState('connected', 'remove')).toBe('none')
    expect(getOptimisticConnectionState('connected', 'accept')).toBe('connected')
  })

  it('presents request and acceptance notifications but keeps changed events silent', () => {
    const payload = { actor: { id: 'user-2', display_name: 'Jules', username: 'jules' } }
    expect(getConnectionNotificationTitle('connection_request', payload))
      .toBe('Jules sent you a connection request')
    expect(getConnectionNotificationTitle('connection_accepted', payload))
      .toBe('Jules accepted your connection request')
    expect(getConnectionNotificationTitle('connection_changed', payload)).toBeNull()
    expect(getConnectionNotificationTargetUserId(payload)).toBe('user-2')
  })

  it('recognizes only supported connection notification events', () => {
    expect(isConnectionNotificationType('connection_request')).toBe(true)
    expect(isConnectionNotificationType('connection_changed')).toBe(true)
    expect(isConnectionNotificationType('shadow_pin_comment')).toBe(false)
  })
})
