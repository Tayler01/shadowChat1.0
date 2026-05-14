import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type GifSearchPayload = {
  query?: string
  page?: number
  limit?: number
}

type NormalizedGif = {
  id: string
  title: string
  url: string
  previewUrl: string
  width?: number
  height?: number
  sourceUrl?: string
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

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return { supabaseUrl, supabaseAnonKey }
}

const authenticate = async (authorization: string) => {
  if (!authorization.startsWith('Bearer ')) {
    return false
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: supabaseAnonKey,
    },
  })

  if (!authResponse.ok) {
    return false
  }

  const user = await authResponse.json()
  return Boolean(user?.id)
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const asString = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

const asNumber = (value: unknown) => {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) && number > 0 ? number : undefined
}

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const stringValue = asString(value)
    if (stringValue) return stringValue
  }
  return undefined
}

const isGifUrl = (value?: string) => {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

const extractCandidates = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data
  const root = asRecord(data)
  const candidates = [
    root.data,
    root.results,
    root.gifs,
    root.items,
    asRecord(root.data).data,
    asRecord(root.data).results,
    asRecord(root.response).data,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

const pickFromMediaMap = (media: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const entry = asRecord(media[key])
    const gif = asRecord(entry.gif)
    const webp = asRecord(entry.webp)
    const jpg = asRecord(entry.jpg)
    const png = asRecord(entry.png)
    const mp4 = asRecord(entry.mp4)
    const url = firstString(
      entry.url,
      gif.url,
      webp.url,
      jpg.url,
      png.url,
      mp4.url,
      entry.webp,
      entry.gif,
      entry.jpg,
      entry.png,
      entry.mp4,
      media[key]
    )
    if (url) {
      return {
        url,
        width: asNumber(entry.width) ?? asNumber(gif.width) ?? asNumber(webp.width) ?? asNumber(jpg.width),
        height: asNumber(entry.height) ?? asNumber(gif.height) ?? asNumber(webp.height) ?? asNumber(jpg.height),
      }
    }
  }
  return null
}

const normalizeGif = (item: unknown): NormalizedGif | null => {
  const gif = asRecord(item)
  const file = asRecord(gif.file)
  const files = asRecord(gif.files)
  const mediaFormats = asRecord(gif.media_formats)
  const images = asRecord(gif.images)

  const primaryMedia =
    pickFromMediaMap(file, ['hd', 'gif', 'md', 'lg', 'original', 'webp']) ||
    pickFromMediaMap(files, ['gif', 'original', 'md', 'medium', 'lg', 'webp', 'mp4']) ||
    pickFromMediaMap(mediaFormats, ['gif', 'mediumgif', 'tinygif', 'nanogif', 'webp']) ||
    pickFromMediaMap(images, ['original', 'fixed_height', 'fixed_width', 'downsized'])

  const previewMedia =
    pickFromMediaMap(file, ['xs', 'sm', 'thumbnail', 'gif', 'md']) ||
    pickFromMediaMap(files, ['preview', 'sm', 'thumbnail', 'webp', 'gif']) ||
    pickFromMediaMap(mediaFormats, ['tinygif', 'nanogif', 'gifpreview', 'gif']) ||
    pickFromMediaMap(images, ['fixed_width_small', 'fixed_height_small', 'preview_gif', 'downsized_still'])

  const url = firstString(
    primaryMedia?.url,
    gif.url,
    gif.src,
    gif.gif_url,
    gif.media_url,
    gif.image,
    gif.image_url
  )
  const previewUrl = firstString(
    previewMedia?.url,
    gif.preview_url,
    gif.previewUrl,
    gif.proxy_src,
    url
  )

  if (!isGifUrl(url) || !isGifUrl(previewUrl)) {
    return null
  }

  return {
    id: firstString(gif.id, gif.content_id, gif.slug, url) ?? crypto.randomUUID(),
    title: firstString(gif.title, gif.name, gif.description, 'GIF') ?? 'GIF',
    url,
    previewUrl,
    width: asNumber(gif.width) ?? primaryMedia?.width ?? previewMedia?.width,
    height: asNumber(gif.height) ?? primaryMedia?.height ?? previewMedia?.height,
    sourceUrl: firstString(gif.url, gif.itemurl, gif.content_url),
  }
}

const getNextPage = (data: unknown, currentPage: number) => {
  const root = asRecord(data)
  const next = asNumber(root.nextPage) ?? asNumber(root.next_page) ?? asNumber(root.next)
  if (next) return next

  const pagination = asRecord(root.pagination)
  const paginationNext = asNumber(pagination.nextPage) ?? asNumber(pagination.next_page)
  if (paginationNext) return paginationNext

  return currentPage + 1
}

const buildKlipyUrl = (payload: Required<GifSearchPayload>) => {
  const apiKey = Deno.env.get('KLIPY_API_KEY')?.trim()
  if (!apiKey) {
    throw new Error('KLIPY_API_KEY is not configured.')
  }

  const baseUrl = (Deno.env.get('KLIPY_API_BASE_URL') || 'https://api.klipy.com').replace(/\/+$/, '')
  const endpoint = payload.query
    ? `${baseUrl}/api/v1/${encodeURIComponent(apiKey)}/gifs/search`
    : `${baseUrl}/api/v1/${encodeURIComponent(apiKey)}/gifs/trending`
  const url = new URL(endpoint)

  if (payload.query) {
    url.searchParams.set('q', payload.query)
  }
  url.searchParams.set('per_page', String(payload.limit))
  url.searchParams.set('page', String(payload.page))
  url.searchParams.set('rating', 'pg-13')
  url.searchParams.set('locale', 'en-US')

  return url
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const authorized = await authenticate(req.headers.get('Authorization') ?? '')
    if (!authorized) {
      return unauthorized('Authentication required')
    }

    const rawBody = await req.json().catch(() => ({})) as GifSearchPayload
    const payload = {
      query: typeof rawBody.query === 'string' ? rawBody.query.trim().slice(0, 80) : '',
      page: Math.max(1, Math.min(25, Math.floor(Number(rawBody.page) || 1))),
      limit: Math.max(6, Math.min(36, Math.floor(Number(rawBody.limit) || 24))),
    }

    const response = await fetch(buildKlipyUrl(payload), {
      signal: AbortSignal.timeout(6000),
      headers: {
        accept: 'application/json',
        'user-agent': 'ShadowChat-GifPicker/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Klipy request failed with ${response.status}`)
    }

    const data = await response.json()
    const gifs = extractCandidates(data)
      .map(normalizeGif)
      .filter(Boolean)
      .slice(0, payload.limit) as NormalizedGif[]

    return json({
      ok: true,
      gifs,
      nextPage: gifs.length === payload.limit ? getNextPage(data, payload.page) : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load GIFs.'
    return json({ error: message }, 400)
  }
})
