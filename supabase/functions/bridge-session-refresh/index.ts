import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  badRequest,
  corsHeaders,
  createBridgeSessionMaterial,
  getFutureIso,
  getSupabaseAdmin,
  hashToken,
  json,
  normalizeText,
  readJson,
} from '../_shared/bridge.ts'

type SessionRefreshPayload = {
  deviceId?: string
  refreshToken?: string
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<SessionRefreshPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const refreshToken = normalizeText(body?.refreshToken)

    if (!deviceId || !refreshToken) {
      return badRequest('deviceId and refreshToken are required')
    }

    const supabase = getSupabaseAdmin()
    const refreshTokenHash = await hashToken(refreshToken)

    const { data: session, error: sessionError } = await supabase
      .from('bridge_device_sessions')
      .select('id, device_id, user_id, status, refresh_token_hash')
      .eq('device_id', deviceId)
      .eq('status', 'active')
      .eq('refresh_token_hash', refreshTokenHash)
      .maybeSingle()

    if (sessionError) {
      throw sessionError
    }

    if (!session) {
      return json({ error: 'Invalid bridge refresh token' }, 401)
    }

    const { data: pairing, error: pairingError } = await supabase
      .from('bridge_pairings')
      .select('id, status')
      .eq('device_id', deviceId)
      .eq('user_id', session.user_id)
      .eq('status', 'paired')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pairingError) {
      throw pairingError
    }

    if (!pairing) {
      return json({ error: 'Bridge pairing is no longer active' }, 403)
    }

    const timestamp = new Date().toISOString()
    const expiresAt = getFutureIso(60)
    const nextSessionMaterial = await createBridgeSessionMaterial()

    const { error: updateError } = await supabase
      .from('bridge_device_sessions')
      .update({
        status: 'active',
        last_refresh_at: timestamp,
        last_rotated_at: timestamp,
        expires_at: expiresAt,
        access_token_hash: nextSessionMaterial.accessTokenHash,
        refresh_token_hash: nextSessionMaterial.refreshTokenHash,
      })
      .eq('id', session.id)

    if (updateError) {
      throw updateError
    }

    await supabase
      .from('bridge_audit_events')
      .insert({
        device_id: deviceId,
        user_id: session.user_id,
        event_type: 'session_refreshed',
        event_payload: {
          bridge_session_id: session.id,
          pairing_id: pairing.id,
          control_plane_only: true,
        },
      })

    return json({
      deviceId,
      bridgeSessionId: session.id,
      accessToken: nextSessionMaterial.accessToken,
      refreshToken: nextSessionMaterial.refreshToken,
      expiresAt,
      sessionMetadata: {
        userId: session.user_id,
        sessionType: 'bridge_control',
        provisioningStatus: 'control_plane_only',
        dataPlaneReady: false,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
