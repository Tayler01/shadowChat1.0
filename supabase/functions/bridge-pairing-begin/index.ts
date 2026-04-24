import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  badRequest,
  corsHeaders,
  forbidden,
  generatePairingCode,
  getSupabaseAdmin,
  hashToken,
  json,
  normalizeText,
  notFound,
  readJson,
} from '../_shared/bridge.ts'

type PairingBeginPayload = {
  deviceId?: string
  recoveryToken?: string
}

const PAIRING_CODE_TTL_MINUTES = 10

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<PairingBeginPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const recoveryToken = normalizeText(body?.recoveryToken)

    if (!deviceId) {
      return badRequest('deviceId is required')
    }

    const supabase = getSupabaseAdmin()

    const { data: device, error: deviceError } = await supabase
      .from('bridge_devices')
      .select('id, status, paired_user_id, bridge_user_id, recovery_token_hash')
      .eq('id', deviceId)
      .maybeSingle()

    if (deviceError) {
      throw deviceError
    }

    if (!device) {
      return notFound('Bridge device not found')
    }

    if (device.status === 'revoked' || device.status === 'disabled') {
      return forbidden('Bridge device is not eligible for pairing')
    }

    const { data: activePairing, error: pairingLookupError } = await supabase
      .from('bridge_pairings')
      .select('id')
      .eq('device_id', deviceId)
      .eq('status', 'paired')
      .maybeSingle()

    if (pairingLookupError) {
      throw pairingLookupError
    }

    await supabase
      .from('bridge_pairing_codes')
      .update({ status: 'revoked' })
      .eq('device_id', deviceId)
      .eq('status', 'pending')

    const timestamp = new Date().toISOString()
    const canRecoverWithToken = Boolean(
      recoveryToken &&
        device.recovery_token_hash &&
        activePairing &&
        device.paired_user_id &&
        device.bridge_user_id,
    )

    if (recoveryToken && !canRecoverWithToken) {
      return forbidden('Bridge recovery is not available for this device')
    }

    if (canRecoverWithToken) {
      const recoveryTokenHash = await hashToken(recoveryToken)
      if (recoveryTokenHash !== device.recovery_token_hash) {
        return forbidden('Invalid bridge recovery token')
      }
    }

    let pairingCode = ''
    let pairingRequestId = ''
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000).toISOString()
    const autoApprovedRecovery = canRecoverWithToken

    for (let attempt = 0; attempt < 5; attempt += 1) {
      pairingCode = generatePairingCode()
      const { data, error } = await supabase
        .from('bridge_pairing_codes')
        .insert({
          device_id: deviceId,
          code: pairingCode,
          status: autoApprovedRecovery ? 'consumed' : 'pending',
          expires_at: expiresAt,
          consumed_at: autoApprovedRecovery ? timestamp : null,
        })
        .select('id')
        .single()

      if (!error && data?.id) {
        pairingRequestId = data.id
        break
      }

      if (error && error.code !== '23505') {
        throw error
      }
    }

    if (!pairingRequestId) {
      throw new Error('Unable to generate unique pairing code')
    }

    await supabase
      .from('bridge_devices')
      .update({ status: autoApprovedRecovery ? 'paired' : 'pairing_pending' })
      .eq('id', deviceId)

    await supabase.from('bridge_audit_events').insert({
      device_id: deviceId,
      user_id: autoApprovedRecovery ? device.paired_user_id : null,
      event_type: autoApprovedRecovery ? 'pairing_recovery_auto_approved' : 'pairing_started',
      event_payload: {
        expires_at: expiresAt,
        pairing_request_id: pairingRequestId,
        auto_approved_recovery: autoApprovedRecovery,
      },
    })

    return json({
      deviceId,
      pairingCode,
      expiresAt,
      pairingRequestId,
      status: autoApprovedRecovery ? 'paired' : 'pairing_pending',
      pairingCodeStatus: autoApprovedRecovery ? 'consumed' : 'pending',
      autoApprovedRecovery,
      sessionExchangeReady: autoApprovedRecovery,
      wasAlreadyPaired: Boolean(activePairing),
      pairedUserId: device.paired_user_id,
      bridgeUserId: device.bridge_user_id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
