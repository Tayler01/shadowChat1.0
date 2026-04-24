import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  authenticateRequest,
  badRequest,
  corsHeaders,
  ensureBridgeUserForDevice,
  forbidden,
  getSupabaseAdmin,
  json,
  normalizeText,
  notFound,
  readJson,
} from '../_shared/bridge.ts'

type PairingApprovePayload = {
  pairingCode?: string
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const auth = await authenticateRequest(req)
    if ('error' in auth) {
      return auth.error
    }

    const body = await readJson<PairingApprovePayload>(req)
    const pairingCode = normalizeText(body?.pairingCode).toUpperCase()

    if (!pairingCode) {
      return badRequest('pairingCode is required')
    }

    const supabase = getSupabaseAdmin()

    const { data: codeRow, error: codeError } = await supabase
      .from('bridge_pairing_codes')
      .select('id, device_id, status, expires_at')
      .eq('code', pairingCode)
      .maybeSingle()

    if (codeError) {
      throw codeError
    }

    if (!codeRow) {
      return notFound('Pairing code not found')
    }

    if (codeRow.status !== 'pending') {
      return forbidden('Pairing code is not pending')
    }

    if (new Date(codeRow.expires_at).getTime() <= Date.now()) {
      await supabase
        .from('bridge_pairing_codes')
        .update({ status: 'expired' })
        .eq('id', codeRow.id)

      return forbidden('Pairing code has expired')
    }

    const { data: device, error: deviceError } = await supabase
      .from('bridge_devices')
      .select('id, device_serial, status, bridge_user_id')
      .eq('id', codeRow.device_id)
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

    const timestamp = new Date().toISOString()
    const bridgeAccount = await ensureBridgeUserForDevice(supabase, {
      id: device.id,
      device_serial: device.device_serial,
      bridge_user_id: device.bridge_user_id,
    })

    await supabase
      .from('bridge_pairings')
      .update({
        status: 'revoked',
        revoked_at: timestamp,
        revoked_by: auth.userId,
      })
      .eq('device_id', device.id)
      .in('status', ['pending', 'paired'])

    const { data: pairing, error: pairingInsertError } = await supabase
      .from('bridge_pairings')
      .insert({
        device_id: device.id,
        user_id: auth.userId,
        bridge_user_id: bridgeAccount.bridgeUserId,
        status: 'paired',
        paired_at: timestamp,
      })
      .select('id')
      .single()

    if (pairingInsertError) {
      throw pairingInsertError
    }

    await supabase
      .from('bridge_pairing_codes')
      .update({
        status: 'consumed',
        consumed_at: timestamp,
      })
      .eq('id', codeRow.id)

    await supabase
      .from('bridge_pairing_codes')
      .update({ status: 'revoked' })
      .eq('device_id', device.id)
      .eq('status', 'pending')

    await supabase
      .from('bridge_devices')
      .update({
        status: 'paired',
        paired_user_id: auth.userId,
        bridge_user_id: bridgeAccount.bridgeUserId,
      })
      .eq('id', device.id)

    await supabase.from('bridge_audit_events').insert([
      {
        device_id: device.id,
        user_id: auth.userId,
        event_type: 'pairing_approved',
        event_payload: {
          pairing_id: pairing.id,
          pairing_code_id: codeRow.id,
          bridge_user_id: bridgeAccount.bridgeUserId,
        },
      },
      {
        device_id: device.id,
        user_id: auth.userId,
        event_type: 'pairing_consumed',
        event_payload: {
          pairing_id: pairing.id,
          pairing_code_id: codeRow.id,
          bridge_user_id: bridgeAccount.bridgeUserId,
        },
      },
    ])

    return json({
      ok: true,
      deviceId: device.id,
      pairingId: pairing.id,
      pairingStatus: 'paired',
      userId: auth.userId,
      ownerUserId: auth.userId,
      bridgeUserId: bridgeAccount.bridgeUserId,
      bridgeUsername: bridgeAccount.username,
      bridgeDisplayName: bridgeAccount.displayName,
      sessionExchangeReady: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
