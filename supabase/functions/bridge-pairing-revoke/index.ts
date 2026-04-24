import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  authenticateRequest,
  badRequest,
  corsHeaders,
  getSupabaseAdmin,
  hashToken,
  json,
  normalizeText,
  notFound,
  readJson,
} from '../_shared/bridge.ts'

type PairingRevokePayload = {
  deviceId?: string
  mode?: 'user_revoke' | 'device_wipe'
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
    const body = await readJson<PairingRevokePayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const mode = body?.mode ?? 'user_revoke'
    const refreshToken = normalizeText(body?.refreshToken)

    if (!deviceId) {
      return badRequest('deviceId is required')
    }

    const supabase = getSupabaseAdmin()
    const { data: device, error: deviceError } = await supabase
      .from('bridge_devices')
      .select('id, paired_user_id, bridge_user_id, status')
      .eq('id', deviceId)
      .maybeSingle()

    if (deviceError) {
      throw deviceError
    }

    if (!device) {
      return notFound('Bridge device not found')
    }

    let actorUserId: string | null = null
    let nextDeviceStatus: 'revoked' | 'unpaired' = 'revoked'
    let eventType = 'pairing_revoked'

    if (mode === 'device_wipe') {
      if (!refreshToken) {
        return badRequest('refreshToken is required for device_wipe')
      }

      const refreshTokenHash = await hashToken(refreshToken)
      const { data: session, error: sessionError } = await supabase
        .from('bridge_device_sessions')
        .select('id, user_id, owner_user_id')
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

      actorUserId = session.owner_user_id ?? session.user_id
      nextDeviceStatus = 'unpaired'
      eventType = 'device_wiped'
    } else {
      const auth = await authenticateRequest(req)
      if ('error' in auth) {
        return auth.error
      }

      actorUserId = auth.userId

      const { data: pairing, error: pairingError } = await supabase
        .from('bridge_pairings')
        .select('id')
        .eq('device_id', deviceId)
        .eq('user_id', actorUserId)
        .eq('status', 'paired')
        .maybeSingle()

      if (pairingError) {
        throw pairingError
      }

      if (!pairing) {
        return json({ error: 'You do not have access to revoke this bridge' }, 403)
      }
    }

    const timestamp = new Date().toISOString()

    await supabase
      .from('bridge_pairings')
      .update({
        status: 'revoked',
        revoked_at: timestamp,
        revoked_by: actorUserId,
      })
      .eq('device_id', deviceId)
      .in('status', ['pending', 'paired'])

    await supabase
      .from('bridge_device_sessions')
      .update({
        status: 'revoked',
        revoked_at: timestamp,
      })
      .eq('device_id', deviceId)
      .in('status', ['active', 'rotating'])

    await supabase
      .from('bridge_pairing_codes')
      .update({ status: 'revoked' })
      .eq('device_id', deviceId)
      .in('status', ['pending', 'consumed'])

    await supabase
      .from('bridge_devices')
      .update({
        status: nextDeviceStatus,
        paired_user_id: null,
      })
      .eq('id', deviceId)

    await supabase
      .from('bridge_audit_events')
      .insert({
        device_id: deviceId,
        user_id: actorUserId,
        event_type: eventType,
        event_payload: {
          mode,
          resulting_status: nextDeviceStatus,
        },
      })

    return json({
      ok: true,
      deviceId,
      status: nextDeviceStatus,
      mode,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
