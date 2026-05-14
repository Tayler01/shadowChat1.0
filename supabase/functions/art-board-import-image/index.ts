import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const ART_BOARD_BUCKET = 'art-board'
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ALLOWED_CONTENT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ImportImagePayload = {
  url?: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const unauthorized = (message: string) => json({ error: message }, 401)

const getSupabaseEnv = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey }
}

const createAdminClient = () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const authenticate = async (authorization: string) => {
  if (!authorization.startsWith('Bearer ')) {
    return null
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
  const token = authorization.replace(/^Bearer\s+/i, '')
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  })

  if (!authResponse.ok) {
    return null
  }

  const user = await authResponse.json()
  return typeof user?.id === 'string' ? { id: user.id as string } : null
}

const normalizeUrl = (value: string) => {
  const trimmed = value.trim()
  const withScheme = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed
  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only public http and https image URLs can be imported.')
  }
  parsed.username = ''
  parsed.password = ''
  parsed.hash = ''
  return parsed
}

const isPrivateIpv4 = (host: string) => {
  const parts = host.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

const isUnsafeHost = (host: string) => {
  const normalized = host.toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') ||
    isPrivateIpv4(normalized)
  )
}

const assertPublicHost = async (url: URL) => {
  const host = url.hostname.toLowerCase()
  if (isUnsafeHost(host)) {
    throw new Error('Private or local image URLs cannot be imported.')
  }

  try {
    const records = await Deno.resolveDns(host, 'A')
    if (records.some(isPrivateIpv4)) {
      throw new Error('Private or local image URLs cannot be imported.')
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Private or local')) {
      throw error
    }
  }
}

const resolveImageType = (contentTypeHeader: string | null) => {
  const contentType = (contentTypeHeader ?? '').split(';')[0]?.trim().toLowerCase()
  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error('The URL must point to a JPEG, PNG, WebP, or GIF image.')
  }
  return {
    contentType,
    extension: ALLOWED_CONTENT_TYPES.get(contentType) ?? 'img',
  }
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const user = await authenticate(req.headers.get('Authorization') ?? '')
    if (!user) {
      return unauthorized('Authentication required')
    }

    const body = await req.json() as ImportImagePayload
    if (!body?.url || body.url.length > 2048) {
      return json({ error: 'A valid image URL is required.' }, 400)
    }

    const sourceUrl = normalizeUrl(body.url)
    await assertPublicHost(sourceUrl)

    const admin = createAdminClient()
    const { data: banned, error: banError } = await admin.rpc('is_user_channel_banned', {
      target_user_id: user.id,
      scope: 'art_board',
    })
    if (banError) throw banError
    if (banned) {
      const { data: message } = await admin.rpc('get_channel_ban_block_message', {
        target_user_id: user.id,
        scope: 'art_board',
      })
      return json({ error: message || 'You are banned from Art Board.' }, 403)
    }

    const response = await fetch(sourceUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.5',
        'user-agent': 'ShadowChat-ArtBoardImporter/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Image fetch failed with ${response.status}`)
    }

    const finalUrl = new URL(response.url || sourceUrl.toString())
    await assertPublicHost(finalUrl)

    const contentLength = Number(response.headers.get('content-length') ?? '0')
    if (contentLength > MAX_IMAGE_BYTES) {
      throw new Error('Image is larger than 2MB. Save it and upload it from your phone so ShadowChat can optimize it for mobile.')
    }

    const { contentType, extension } = resolveImageType(response.headers.get('content-type'))
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('Image is larger than 2MB. Save it and upload it from your phone so ShadowChat can optimize it for mobile.')
    }

    const path = `${user.id}/imports/${Date.now()}-${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await admin.storage
      .from(ART_BOARD_BUCKET)
      .upload(path, new Blob([bytes], { type: contentType }), {
        cacheControl: '31536000',
        contentType,
        upsert: false,
      })

    if (uploadError) {
      throw uploadError
    }

    const { data } = admin.storage.from(ART_BOARD_BUCKET).getPublicUrl(path)

    return json({
      ok: true,
      path,
      publicUrl: data.publicUrl,
      contentType,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to import image.'
    return json({ error: message }, 400)
  }
})
