import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  authenticateBridgeAccessToken,
  corsHeaders,
  getSupabaseAdmin,
  json,
  normalizeText,
  readJson,
  requireBridgeApiEnabled,
} from '../_shared/bridge.ts'
import { PUBLIC_PROFILE_SELECT } from '../_shared/public-profile.ts'

type BridgeUserProfilePayload = {
  deviceId?: string
  userIds?: string[]
}

const UNIQUE_USER_LIMIT = 20

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const featurePauseResponse = requireBridgeApiEnabled()
  if (featurePauseResponse) {
    return featurePauseResponse
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<BridgeUserProfilePayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const accessToken = normalizeText(req.headers.get('X-Bridge-Access-Token'))
    const userIds = Array.from(
      new Set((body?.userIds ?? []).map(normalizeText).filter(Boolean)),
    ).slice(0, UNIQUE_USER_LIMIT)

    const bridgeAuth = await authenticateBridgeAccessToken(deviceId, accessToken)
    if ('error' in bridgeAuth) {
      return bridgeAuth.error
    }

    if (!userIds.length) {
      return json({ ok: true, deviceId, users: [] })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('users')
      .select(PUBLIC_PROFILE_SELECT)
      .in('id', userIds)

    if (error) {
      throw error
    }

    return json({
      ok: true,
      deviceId,
      users: data ?? [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
