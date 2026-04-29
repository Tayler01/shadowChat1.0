import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type LinkPreviewPayload = {
  url?: string
}

type LinkPreview = {
  url: string
  canonicalUrl?: string
  title?: string
  description?: string
  image?: string
  mediaType?: 'image' | 'video' | 'link'
  siteName?: string
  provider?: string
}

const unauthorized = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

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

const normalizeUrl = (value: string) => {
  const withScheme = /^www\./i.test(value.trim()) ? `https://${value.trim()}` : value.trim()
  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https links can be previewed.')
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
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  )
}

const assertPublicHost = async (url: URL) => {
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    isPrivateIpv4(host)
  ) {
    throw new Error('Private links cannot be previewed.')
  }

  try {
    const records = await Deno.resolveDns(host, 'A')
    if (records.some(isPrivateIpv4)) {
      throw new Error('Private links cannot be previewed.')
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Private links')) {
      throw error
    }
  }
}

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim()

const getMetaContent = (html: string, key: string) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return decodeHtml(match[1])
    }
  }

  return undefined
}

const getTitle = (html: string) => {
  const metaTitle = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title')
  if (metaTitle) return metaTitle

  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match?.[1] ? decodeHtml(match[1].replace(/\s+/g, ' ')) : undefined
}

const absolutize = (value: string | undefined, baseUrl: string) => {
  if (!value) return undefined
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return undefined
  }
}

const getPreviewImage = (html: string, baseUrl: string) => {
  const image = (
    getMetaContent(html, 'og:image:secure_url') ||
    getMetaContent(html, 'og:image:url') ||
    getMetaContent(html, 'og:image') ||
    getMetaContent(html, 'twitter:image:src') ||
    getMetaContent(html, 'twitter:image') ||
    getMetaContent(html, 'thumbnail') ||
    getMetaContent(html, 'thumbnailUrl') ||
    getMetaContent(html, 'video:thumbnail') ||
    getMetaContent(html, 'og:video:thumbnail') ||
    getMetaContent(html, 'og:video:secure_url:image')
  )

  return absolutize(image, baseUrl)
}

const isXHost = (url: URL) => /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(url.hostname)

const normalizeXMediaImage = (value: string) => {
  const decoded = decodeHtml(value)
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/[),.]+$/g, '')

  try {
    const url = new URL(decoded)
    if (url.hostname !== 'pbs.twimg.com' || !url.pathname.startsWith('/media/')) {
      return undefined
    }

    if (url.searchParams.has('name')) {
      url.searchParams.set('name', 'large')
      return url.toString()
    }

    const normalized = url.toString()
    return /:(?:large|small|medium|thumb|orig)$/i.test(normalized)
      ? normalized
      : `${normalized}:large`
  } catch {
    return undefined
  }
}

const getXEmbeddedMediaImage = (html: string) => {
  const normalizedHtml = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
  const mediaUrls = normalizedHtml.match(/https?:\/\/pbs\.twimg\.com\/media\/[^\s"'<>\\)]+/gi) || []

  for (const mediaUrl of mediaUrls) {
    const image = normalizeXMediaImage(mediaUrl)
    if (image) return image
  }

  return undefined
}

const inferMediaType = (html: string, hasImage: boolean): LinkPreview['mediaType'] => {
  const type = [
    getMetaContent(html, 'og:type'),
    getMetaContent(html, 'twitter:card'),
    getMetaContent(html, 'og:video'),
    getMetaContent(html, 'og:video:url'),
    getMetaContent(html, 'og:video:secure_url'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/\b(video|movie|player|stream)\b/.test(type)) {
    return 'video'
  }

  if (hasImage && /\b(image|photo|summary_large_image)\b/.test(type)) {
    return 'image'
  }

  return hasImage ? 'image' : 'link'
}

const readLimitedText = async (response: Response, maxBytes = 512 * 1024) => {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let received = 0

  while (received < maxBytes) {
    const { value, done } = await reader.read()
    if (done || !value) break
    const remaining = maxBytes - received
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value
    chunks.push(chunk)
    received += chunk.byteLength
  }

  try {
    await reader.cancel()
  } catch {
    // ignore cancel failures after a complete read
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(merged)
}

const getOEmbedEndpoint = (url: URL) => {
  const host = url.hostname.toLowerCase()

  if (/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(host)) {
    const endpoint = new URL('https://publish.twitter.com/oembed')
    endpoint.searchParams.set('url', url.toString())
    endpoint.searchParams.set('omit_script', '1')
    return { endpoint, provider: 'X', mediaType: undefined as LinkPreview['mediaType'] }
  }

  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(host)) {
    const endpoint = new URL('https://www.youtube.com/oembed')
    endpoint.searchParams.set('url', url.toString())
    endpoint.searchParams.set('format', 'json')
    return { endpoint, provider: 'YouTube', mediaType: 'video' as const }
  }

  if (/(^|\.)vimeo\.com$/i.test(host)) {
    const endpoint = new URL('https://vimeo.com/api/oembed.json')
    endpoint.searchParams.set('url', url.toString())
    return { endpoint, provider: 'Vimeo', mediaType: 'video' as const }
  }

  return null
}

const fetchOEmbedPreview = async (url: URL): Promise<LinkPreview | null> => {
  const config = getOEmbedEndpoint(url)
  if (!config) return null

  const response = await fetch(config.endpoint, {
    signal: AbortSignal.timeout(3500),
    headers: {
      accept: 'application/json',
      'user-agent': 'ShadowChat-LinkPreview/1.0',
    },
  })

  if (!response.ok) return null

  const data = await response.json()
  const text = typeof data?.html === 'string'
    ? decodeHtml(data.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
    : undefined
  const title = typeof data?.title === 'string' ? decodeHtml(data.title) : text

  return {
    url: url.toString(),
    canonicalUrl: typeof data?.url === 'string' ? data.url : url.toString(),
    title: title || `Post on ${config.provider}`,
    description: typeof data?.author_name === 'string' ? decodeHtml(data.author_name) : undefined,
    image: typeof data?.thumbnail_url === 'string'
      ? absolutize(data.thumbnail_url, url.toString())
      : undefined,
    mediaType: config.mediaType || (typeof data?.type === 'string' && data.type.toLowerCase().includes('video') ? 'video' : undefined),
    siteName: typeof data?.provider_name === 'string' ? data.provider_name : config.provider,
    provider: typeof data?.provider_name === 'string' ? data.provider_name : config.provider,
  }
}

const fetchOpenGraphPreview = async (url: URL): Promise<LinkPreview> => {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(4500),
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'ShadowChat-LinkPreview/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Preview fetch failed with ${response.status}`)
  }

  const finalUrl = new URL(response.url || url.toString())
  await assertPublicHost(finalUrl)

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    return {
      url: url.toString(),
      canonicalUrl: finalUrl.toString(),
      title: finalUrl.hostname.replace(/^www\./i, ''),
    }
  }

  const html = await readLimitedText(response)
  const image = getPreviewImage(html, finalUrl.toString()) ||
    (isXHost(url) || isXHost(finalUrl) ? getXEmbeddedMediaImage(html) : undefined)

  return {
    url: url.toString(),
    canonicalUrl: getMetaContent(html, 'og:url') || finalUrl.toString(),
    title: getTitle(html),
    description: getMetaContent(html, 'og:description') || getMetaContent(html, 'twitter:description') || getMetaContent(html, 'description'),
    image,
    mediaType: inferMediaType(html, Boolean(image)),
    siteName: getMetaContent(html, 'og:site_name'),
    provider: finalUrl.hostname.replace(/^www\./i, ''),
  }
}

const mergePreview = (primary: LinkPreview | null, fallback: LinkPreview | null): LinkPreview | null => {
  if (!primary) return fallback
  if (!fallback) return primary

  return {
    ...fallback,
    ...primary,
    canonicalUrl: primary.canonicalUrl || fallback.canonicalUrl,
    title: primary.title || fallback.title,
    description: primary.description || fallback.description,
    image: primary.image || fallback.image,
    mediaType: primary.mediaType || fallback.mediaType,
    siteName: primary.siteName || fallback.siteName,
    provider: primary.provider || fallback.provider,
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
    const authorized = await authenticate(req.headers.get('Authorization') ?? '')
    if (!authorized) {
      return unauthorized('Authentication required')
    }

    const body = await req.json() as LinkPreviewPayload
    if (!body?.url || body.url.length > 2048) {
      return json({ error: 'A valid url is required.' }, 400)
    }

    const url = normalizeUrl(body.url)
    await assertPublicHost(url)

    const [openGraphPreview, oEmbedPreview] = await Promise.all([
      fetchOpenGraphPreview(url).catch(() => null),
      fetchOEmbedPreview(url).catch(() => null),
    ])
    const preview = mergePreview(oEmbedPreview, openGraphPreview)

    if (!preview) {
      throw new Error('Unable to load link preview.')
    }

    return json({
      ok: true,
      preview: {
        ...preview,
        title: preview.title?.slice(0, 180),
        description: preview.description?.slice(0, 280),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load link preview.'
    return json({ error: message }, 400)
  }
})
