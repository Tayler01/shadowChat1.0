import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import {
  assertPublicUrl,
  normalizePublicHttpUrl,
  readLimitedArrayBuffer,
  safeFetch,
} from '../_shared/safe-fetch.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const LINK_PREVIEW_IMAGE_BUCKET = 'message-media'
const MAX_PREVIEW_IMAGE_BYTES = 4 * 1024 * 1024
const ALLOWED_PREVIEW_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])
const SAFE_LINK_URL_OPTIONS = {
  credentialMessage: 'URL credentials are not allowed.',
  invalidSchemeMessage: 'Only http and https links can be previewed.',
  tooLongMessage: 'A valid url is required.',
  unsafeHostMessage: 'Private links cannot be previewed.',
}
const SAFE_PREVIEW_IMAGE_URL_OPTIONS = {
  credentialMessage: 'URL credentials are not allowed.',
  invalidSchemeMessage: 'Only public http and https preview image links are supported.',
  tooLongMessage: 'Preview image URL is required.',
  unsafeHostMessage: 'Private preview image links cannot be imported.',
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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey }
}

const getSupabaseAdmin = () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv()
  if (!serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
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
  return normalizePublicHttpUrl(value, SAFE_LINK_URL_OPTIONS)
}

const assertPublicHost = async (url: URL) => {
  await assertPublicUrl(url, SAFE_LINK_URL_OPTIONS)
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

const isInstagramHost = (url: URL) => /(^|\.)instagram\.com$/i.test(url.hostname)

const isInstagramPreviewImageHost = (value: string | undefined) => {
  if (!value) return false
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return (
      host === 'cdninstagram.com' ||
      host.endsWith('.cdninstagram.com') ||
      host === 'fbcdn.net' ||
      host.endsWith('.fbcdn.net')
    )
  } catch {
    return false
  }
}

const isPublicStorageUrl = (value: string | undefined) => {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.pathname.includes(`/storage/v1/object/public/${LINK_PREVIEW_IMAGE_BUCKET}/`)
  } catch {
    return false
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

const resolvePreviewImageType = (contentTypeHeader: string | null) => {
  const contentType = (contentTypeHeader ?? '').split(';')[0]?.trim().toLowerCase()
  if (!contentType || !ALLOWED_PREVIEW_IMAGE_TYPES.has(contentType)) {
    throw new Error('Preview image is not a supported image type.')
  }
  return {
    contentType,
    extension: ALLOWED_PREVIEW_IMAGE_TYPES.get(contentType) ?? 'img',
  }
}

const hashPreviewKey = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40)
}

const shouldStorePreviewImage = (sourceUrl: URL, preview: LinkPreview) =>
  Boolean(
    preview.image &&
    !isPublicStorageUrl(preview.image) &&
    (isInstagramHost(sourceUrl) || isInstagramPreviewImageHost(preview.image))
  )

const storePreviewImage = async (preview: LinkPreview): Promise<string | null> => {
  if (!preview.image) return null
  const admin = getSupabaseAdmin()
  if (!admin) return null

  try {
    const sourceUrl = normalizePublicHttpUrl(preview.image, SAFE_PREVIEW_IMAGE_URL_OPTIONS)
    await assertPublicUrl(sourceUrl, SAFE_PREVIEW_IMAGE_URL_OPTIONS)
    const response = await safeFetch(sourceUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.5',
        'user-agent': 'ShadowChat-LinkPreviewImage/1.0',
      },
    }, SAFE_PREVIEW_IMAGE_URL_OPTIONS)

    if (!response.ok) {
      throw new Error(`Preview image fetch failed with ${response.status}.`)
    }

    const finalUrl = new URL(response.url || sourceUrl.toString())
    await assertPublicUrl(finalUrl, SAFE_PREVIEW_IMAGE_URL_OPTIONS)
    const { contentType, extension } = resolvePreviewImageType(response.headers.get('content-type'))
    const bytes = await readLimitedArrayBuffer(response, MAX_PREVIEW_IMAGE_BYTES, 'Preview image is larger than 4MB.')
    const key = await hashPreviewKey(preview.canonicalUrl || preview.url)
    const path = `link-previews/${key}.${extension}`

    const { error: uploadError } = await admin.storage
      .from(LINK_PREVIEW_IMAGE_BUCKET)
      .upload(path, new Blob([bytes], { type: contentType }), {
        cacheControl: '604800',
        contentType,
        upsert: true,
      })
    if (uploadError) throw uploadError

    const { data: publicAsset } = admin.storage.from(LINK_PREVIEW_IMAGE_BUCKET).getPublicUrl(path)
    return publicAsset.publicUrl
  } catch (error) {
    console.warn('Unable to store link preview image', error instanceof Error ? error.message : String(error))
    return null
  }
}

const makePreviewImageDurable = async (sourceUrl: URL, preview: LinkPreview) => {
  if (!shouldStorePreviewImage(sourceUrl, preview)) return preview
  const storedImage = await storePreviewImage(preview)
  return storedImage ? { ...preview, image: storedImage } : preview
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

  const metaAccessToken = Deno.env.get('META_OEMBED_ACCESS_TOKEN') ||
    (Deno.env.get('META_APP_ID') && Deno.env.get('META_APP_SECRET')
      ? `${Deno.env.get('META_APP_ID')}|${Deno.env.get('META_APP_SECRET')}`
      : undefined)

  if (metaAccessToken && /(^|\.)instagram\.com$/i.test(host)) {
    const endpoint = new URL('https://graph.facebook.com/v19.0/instagram_oembed')
    endpoint.searchParams.set('url', url.toString())
    endpoint.searchParams.set('access_token', metaAccessToken)
    return { endpoint, provider: 'Instagram', mediaType: undefined as LinkPreview['mediaType'] }
  }

  if (metaAccessToken && /(^|\.)facebook\.com$|(^|\.)fb\.watch$/i.test(host)) {
    const endpoint = new URL('https://graph.facebook.com/v19.0/oembed_post')
    endpoint.searchParams.set('url', url.toString())
    endpoint.searchParams.set('access_token', metaAccessToken)
    return { endpoint, provider: 'Facebook', mediaType: undefined as LinkPreview['mediaType'] }
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
  const response = await safeFetch(url, {
    signal: AbortSignal.timeout(4500),
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'ShadowChat-LinkPreview/1.0',
    },
  }, SAFE_LINK_URL_OPTIONS)

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
    const durablePreview = await makePreviewImageDurable(url, preview)

    return json({
      ok: true,
      preview: {
        ...durablePreview,
        title: durablePreview.title?.slice(0, 180),
        description: durablePreview.description?.slice(0, 280),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load link preview.'
    return json({ error: message }, 400)
  }
})
