import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { authenticateEdgeUser, createEdgeAdminClient, consumeEdgeRateLimit, EdgeAuthenticationError, EdgeRateLimitError, getEdgeSupabaseEnv } from '../_shared/edge-guard.ts'
import { corsHeaders } from '../_shared/bridge.ts'
import { captureModerationMedia, createModerationMediaReview } from '../_shared/moderation-media.ts'
import { signBunnyPrivateMedia } from '../_shared/bunny-private-media.ts'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
})

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const user = await authenticateEdgeUser(req)
    const body = await req.json().catch(() => null) as { caseId?: unknown } | null
    if (!body || typeof body.caseId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.caseId)) return json({ error: 'A valid case is required' }, 400)
    const client = createEdgeAdminClient()
    const load = async () => {
      const result = await client.rpc('get_moderation_media_for_case', { actor_user_id: user.id, target_case_id: body.caseId })
      if (result.error) throw new EdgeAuthenticationError('This case is not available for media review')
      return result.data
    }
    const assets = await load() // Authorization precedes copy and signing.
    await consumeEdgeRateLimit(client, { userId: user.id, scope: 'moderation-media-review', windowSeconds: 60, limit: 20, message: 'Wait briefly before loading more evidence.' })
    await captureModerationMedia(client, assets, { supabaseUrl: getEdgeSupabaseEnv().supabaseUrl })
    // Assignment, active membership, and case access may change during a copy.
    const current = await load()
    const review = await createModerationMediaReview(client, current, body.caseId, async (libraryId, assetId) => {
      const configuredLibrary = Deno.env.get('BUNNY_STREAM_LIBRARY_ID')?.trim()
      const pullZoneUrl = (Deno.env.get('BUNNY_STREAM_PULL_ZONE_URL') || Deno.env.get('BUNNY_STREAM_CDN_BASE_URL'))?.trim()
      const tokenSecurityKey = Deno.env.get('BUNNY_STREAM_TOKEN_SECURITY_KEY')?.trim()
      if (configuredLibrary !== libraryId || !pullZoneUrl || !tokenSecurityKey) throw new Error('Retained video review is not configured')
      const signed = await signBunnyPrivateMedia({ libraryId, videoId: assetId, pullZoneUrl, tokenSecurityKey }, { kind: 'embed' })
      const url = new URL(signed.url)
      url.searchParams.set('autoplay', 'false')
      return url.toString()
    })
    return json({ assets: review }, 200, { 'Cache-Control': 'no-store' })
  } catch (error) {
    if (error instanceof EdgeAuthenticationError) return json({ error: error.message }, error.status)
    if (error instanceof EdgeRateLimitError) return json({ error: error.message }, 429, { 'Retry-After': String(error.retryAfterSeconds) })
    return json({ error: 'Reported media could not be loaded. Retry or contact the operator.' }, 503)
  }
})
