import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  authenticateBridgeAccessToken,
  badRequest,
  corsHeaders,
  getSupabaseAdmin,
  json,
  normalizeText,
  readJson,
  searchBridgeUsers,
} from '../_shared/bridge.ts'

type BridgeUserSearchPayload = {
  deviceId?: string
  query?: string
  limit?: number
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<BridgeUserSearchPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const query = normalizeText(body?.query)
    const accessToken = normalizeText(req.headers.get('X-Bridge-Access-Token'))
    const limit = Math.min(Math.max(Number(body?.limit ?? 8) || 8, 1), 20)

    if (!query) {
      return badRequest('query is required')
    }

    const bridgeAuth = await authenticateBridgeAccessToken(deviceId, accessToken)
    if ('error' in bridgeAuth) {
      return bridgeAuth.error
    }

    const supabase = getSupabaseAdmin()
    const users = await searchBridgeUsers(supabase, query, limit)

    return json({
      ok: true,
      deviceId,
      query,
      users: users.filter(user => user.id !== bridgeAuth.auth.userId),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
