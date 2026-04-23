import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  badRequest,
  corsHeaders,
  getSupabaseAdmin,
  hashToken,
  isExpiredIso,
  json,
  normalizeText,
  readJson,
} from '../_shared/bridge.ts'

type BridgeHeartbeatPayload = {
  deviceId?: string
  firmwareVersion?: string
  connectionHealth?: {
    pairStatus?: string
    backendConnected?: boolean
    realtimeConnected?: boolean
    lastRefreshAt?: string | null
  }
  accessToken?: string
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<BridgeHeartbeatPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const firmwareVersion = normalizeText(body?.firmwareVersion)
    const accessToken =
      normalizeText(req.headers.get('X-Bridge-Access-Token')) || normalizeText(body?.accessToken)

    if (!deviceId || !accessToken) {
      return badRequest('deviceId and accessToken are required')
    }

    const supabase = getSupabaseAdmin()
    const accessTokenHash = await hashToken(accessToken)

    const { data: session, error: sessionError } = await supabase
      .from('bridge_device_sessions')
      .select('id, user_id, status, expires_at')
      .eq('device_id', deviceId)
      .eq('status', 'active')
      .eq('access_token_hash', accessTokenHash)
      .maybeSingle()

    if (sessionError) {
      throw sessionError
    }

    if (!session) {
      return json({ error: 'Invalid bridge access token' }, 401)
    }

    const timestamp = new Date().toISOString()

    if (isExpiredIso(session.expires_at)) {
      await supabase
        .from('bridge_device_sessions')
        .update({
          status: 'expired',
        })
        .eq('id', session.id)

      await supabase
        .from('bridge_audit_events')
        .insert({
          device_id: deviceId,
          user_id: session.user_id,
          event_type: 'session_expired',
          event_payload: {
            bridge_session_id: session.id,
            expired_at: session.expires_at,
            rejected_operation: 'heartbeat',
          },
        })

      return json({ error: 'Bridge access token has expired' }, 401)
    }

    await supabase
      .from('bridge_devices')
      .update({
        last_seen_at: timestamp,
        ...(firmwareVersion ? { firmware_version: firmwareVersion } : {}),
      })
      .eq('id', deviceId)

    await supabase
      .from('bridge_audit_events')
      .insert({
        device_id: deviceId,
        user_id: session.user_id,
        event_type: 'bridge_heartbeat',
        event_payload: {
          firmware_version: firmwareVersion || null,
          connection_health: body.connectionHealth ?? null,
        },
      })

    return json({
      ok: true,
      deviceId,
      status: 'ok',
      lastSeenAt: timestamp,
      hints: {
        keepPollingPairingStatus: false,
        controlPlaneOnly: true,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
