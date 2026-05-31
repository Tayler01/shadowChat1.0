import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_VIDEO_BYTES = 150 * 1024 * 1024
const MAX_VIDEO_SECONDS = 60
const DAILY_NATIVE_UPLOAD_LIMIT = 5
const FALLBACK_VIDEO_POSTER_URL = '/entertainment/shado-tv/placeholders/video-vertical.webp'
const ALLOWED_NATIVE_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
])

type Provider = 'bunny_stream' | 'youtube' | 'x' | 'pinterest' | 'instagram' | 'external'
type VideoAction =
  | 'create-upload'
  | 'complete-upload'
  | 'sync-status'
  | 'create-external'
  | 'replace-upload'
  | 'replace-external'
  | 'delete-video-asset'

type VideoPayload = {
  action?: VideoAction
  categoryId?: string
  imageId?: string
  title?: string
  description?: string | null
  sourceUrl?: string
  fileName?: string
  fileType?: string
  fileSize?: number
  durationSeconds?: number | null
  mediaWidth?: number | null
  mediaHeight?: number | null
  posterUrl?: string | null
  posterPath?: string | null
  posterContentType?: string | null
  posterSizeBytes?: number | null
  bunnyVideoId?: string
}

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

type ShadowPinRow = {
  id: string
  category_id: string
  creator_id: string
  title: string
  description: string | null
  provider: Provider | null
  provider_payload: Record<string, unknown> | null
  provider_asset_id: string | null
  processing_status: string | null
  deleted_at: string | null
}

type ExternalPreview = {
  canonicalUrl: string
  title?: string
  description?: string
  image?: string
  videoUrl?: string
  videoHlsUrl?: string
  mediaWidth?: number
  mediaHeight?: number
  durationSeconds?: number
  embedUrl?: string
  providerName?: string
  providerPayload?: Record<string, unknown>
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const badRequest = (message: string) => json({ error: message }, 400)
const unauthorized = (message: string) => json({ error: message }, 401)
const forbidden = (message: string) => json({ error: message }, 403)
const notFound = (message: string) => json({ error: message }, 404)

const getSupabaseEnv = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Supabase function credentials are not configured.')
  }

  return { supabaseUrl, anonKey, serviceRoleKey }
}

const getBunnyEnv = () => {
  const libraryId = Deno.env.get('BUNNY_STREAM_LIBRARY_ID')?.trim()
  const apiKey = Deno.env.get('BUNNY_STREAM_API_KEY')?.trim()
  const pullZoneUrl = (
    Deno.env.get('BUNNY_STREAM_PULL_ZONE_URL') ||
    Deno.env.get('BUNNY_STREAM_CDN_BASE_URL') ||
    ''
  ).trim().replace(/\/+$/, '')

  if (!libraryId || !apiKey) {
    throw new Error('Bunny Stream credentials are not configured.')
  }

  return { libraryId, apiKey, pullZoneUrl }
}

function getSupabaseAdmin() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const readJson = async <T>(req: Request): Promise<T> => {
  try {
    return await req.json() as T
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

const authenticate = async (req: Request) => {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    return { error: unauthorized('Authentication required.') }
  }

  const { supabaseUrl, anonKey } = getSupabaseEnv()
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: anonKey,
    },
  })

  if (!authResponse.ok) {
    return { error: unauthorized('Invalid or expired session.') }
  }

  const user = await authResponse.json()
  if (!user?.id) {
    return { error: unauthorized('Invalid or expired session.') }
  }

  return { userId: user.id as string, supabase: getSupabaseAdmin() }
}

const normalizeUuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : ''

const cleanText = (value: unknown, maxLength: number) =>
  typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
    : ''

const nullableCleanText = (value: unknown, maxLength: number) => {
  const cleaned = cleanText(value, maxLength)
  return cleaned || null
}

const normalizePositiveInteger = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.round(numberValue) : null
}

const normalizeNonNegativeInteger = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.round(numberValue) : null
}

const normalizeOptionalPath = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

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

const normalizeUrl = (value: string) => {
  const withScheme = /^www\./i.test(value.trim()) ? `https://${value.trim()}` : value.trim()
  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https video links are supported.')
  }
  parsed.username = ''
  parsed.password = ''
  parsed.hash = ''
  return parsed
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
    throw new Error('Private links cannot be imported.')
  }

  try {
    const records = await Deno.resolveDns(host, 'A')
    if (records.some(isPrivateIpv4)) {
      throw new Error('Private links cannot be imported.')
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
    // The stream may already be closed after a small page read.
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

const isDirectVideoUrl = (url: URL) =>
  /\.(mp4|m4v|mov|webm|m3u8)(?:$|\?)/i.test(`${url.pathname}${url.search}`)

const parseXStatusId = (url: URL) => {
  const match = url.pathname.match(/\/status(?:es)?\/(\d{6,})/i)
  return match?.[1] || ''
}

const buildXStatusUrl = (url: URL) => {
  const statusId = parseXStatusId(url)
  if (!statusId) return url.toString()
  const username = url.pathname.split('/').filter(Boolean)[0] || 'i'
  return `https://x.com/${encodeURIComponent(username)}/status/${statusId}`
}

const buildXSyndicationToken = (statusId: string) =>
  ((Number(statusId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')

const parseInstagramMediaPath = (url: URL) => {
  const parts = url.pathname.split('/').filter(Boolean)
  for (let index = 0; index < parts.length - 1; index += 1) {
    const type = parts[index]?.toLowerCase()
    if ((type === 'p' || type === 'reel' || type === 'tv') && parts[index + 1]) {
      return { type, shortcode: parts[index + 1] }
    }
  }
  return null
}

const buildInstagramMediaUrl = (url: URL) => {
  const media = parseInstagramMediaPath(url)
  return media ? `https://www.instagram.com/${media.type}/${media.shortcode}/` : url.toString()
}

const isLikelyProviderVideoAssetUrl = (url: URL, provider: Provider) => {
  const host = url.hostname.toLowerCase()
  if (provider === 'x') return host === 'video.twimg.com'
  if (provider === 'instagram') {
    return (
      host === 'cdninstagram.com' ||
      host.endsWith('.cdninstagram.com') ||
      host === 'fbcdn.net' ||
      host.endsWith('.fbcdn.net')
    )
  }
  return false
}

const isPlayableVideoContentType = (contentType: string) => {
  const normalized = contentType.toLowerCase()
  return (
    normalized.startsWith('video/') ||
    normalized.includes('application/vnd.apple.mpegurl') ||
    normalized.includes('application/x-mpegurl')
  )
}

const probeDirectVideoUrl = async (url: URL): Promise<string | null> => {
  const requestHeaders = {
    accept: 'video/*,application/vnd.apple.mpegurl,application/x-mpegurl,*/*;q=0.2',
    'user-agent': 'ShadowChat-ShadowPinVideo/1.0',
  }

  const checkResponse = async (response: Response) => {
    if (!response.ok && response.status !== 206) return null
    const finalUrl = new URL(response.url || url.toString())
    await assertPublicHost(finalUrl)
    const contentType = response.headers.get('content-type') || ''
    return isPlayableVideoContentType(contentType) || isDirectVideoUrl(finalUrl)
      ? finalUrl.toString()
      : null
  }

  const headResponse = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(2500),
    headers: requestHeaders,
  }).catch(() => null)
  if (headResponse) {
    const playableUrl = await checkResponse(headResponse)
    if (playableUrl) return playableUrl
  }

  const rangeResponse = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(3000),
    headers: {
      ...requestHeaders,
      range: 'bytes=0-0',
    },
  }).catch(() => null)

  return rangeResponse ? checkResponse(rangeResponse) : null
}

const validateDirectVideoUrl = async (
  value: string | undefined | null,
  provider: Provider
): Promise<string | null> => {
  if (!value) return null

  try {
    const url = new URL(value)
    await assertPublicHost(url)

    if (isDirectVideoUrl(url)) return url.toString()
    if (!isLikelyProviderVideoAssetUrl(url, provider)) return null

    return await probeDirectVideoUrl(url)
  } catch {
    return null
  }
}

const selectBestMp4Variant = (variants: unknown[]) => {
  const mp4Variants = variants
    .map(variant => variant && typeof variant === 'object' ? variant as Record<string, unknown> : null)
    .filter((variant): variant is Record<string, unknown> => {
      const type = typeof variant?.content_type === 'string'
        ? variant.content_type
        : typeof variant?.type === 'string'
          ? variant.type
          : ''
      const url = typeof variant?.url === 'string'
        ? variant.url
        : typeof variant?.src === 'string'
          ? variant.src
          : ''
      return type.toLowerCase() === 'video/mp4' && Boolean(url)
    })
    .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))

  const selected = mp4Variants[0]
  const url = typeof selected?.url === 'string'
    ? selected.url
    : typeof selected?.src === 'string'
      ? selected.src
      : ''
  return url || null
}

const fetchXSyndicationPreview = async (url: URL): Promise<ExternalPreview | null> => {
  const statusId = parseXStatusId(url)
  if (!statusId) return null

  const endpoint = new URL('https://cdn.syndication.twimg.com/tweet-result')
  endpoint.searchParams.set('id', statusId)
  endpoint.searchParams.set('lang', 'en')
  endpoint.searchParams.set('token', buildXSyndicationToken(statusId))

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(3500),
    headers: {
      accept: 'application/json',
      'user-agent': 'ShadowChat-ShadowPinVideo/1.0',
    },
  })
  if (!response.ok) return null

  const data = await response.json().catch(() => null)
  if (!data || typeof data !== 'object') return null
  const payload = data as Record<string, unknown>
  const mediaDetails = Array.isArray(payload.mediaDetails) ? payload.mediaDetails : []
  const media = mediaDetails
    .map(item => item && typeof item === 'object' ? item as Record<string, unknown> : null)
    .find(item => item?.video_info && typeof item.video_info === 'object')
  const videoInfo = media?.video_info && typeof media.video_info === 'object'
    ? media.video_info as Record<string, unknown>
    : payload.video && typeof payload.video === 'object'
      ? payload.video as Record<string, unknown>
      : null
  const variants = Array.isArray(videoInfo?.variants) ? videoInfo.variants : []
  const videoUrl = selectBestMp4Variant(variants)
  if (!videoUrl) return null

  const hlsVariant = variants
    .map(variant => variant && typeof variant === 'object' ? variant as Record<string, unknown> : null)
    .find(variant => {
      const type = typeof variant?.content_type === 'string'
        ? variant.content_type
        : typeof variant?.type === 'string'
          ? variant.type
          : ''
      return type.toLowerCase().includes('mpegurl')
    })
  const hlsUrl = typeof hlsVariant?.url === 'string'
    ? hlsVariant.url
    : typeof hlsVariant?.src === 'string'
      ? hlsVariant.src
      : undefined
  const poster = typeof media?.media_url_https === 'string'
    ? media.media_url_https
    : typeof videoInfo?.poster === 'string'
      ? videoInfo.poster
      : undefined
  const originalInfo = media?.original_info && typeof media.original_info === 'object'
    ? media.original_info as Record<string, unknown>
    : null
  const aspectRatio = Array.isArray(videoInfo?.aspect_ratio)
    ? videoInfo.aspect_ratio
    : Array.isArray(videoInfo?.aspectRatio)
      ? videoInfo.aspectRatio
      : null
  const mediaWidth = normalizePositiveInteger(originalInfo?.width) ||
    (aspectRatio ? normalizePositiveInteger(aspectRatio[0]) : null)
  const mediaHeight = normalizePositiveInteger(originalInfo?.height) ||
    (aspectRatio ? normalizePositiveInteger(aspectRatio[1]) : null)
  const durationMs = normalizeNonNegativeInteger(videoInfo?.duration_millis ?? videoInfo?.durationMs)
  const user = payload.user && typeof payload.user === 'object'
    ? payload.user as Record<string, unknown>
    : null
  const screenName = typeof user?.screen_name === 'string' ? user.screen_name : null
  const canonicalUrl = screenName
    ? `https://x.com/${screenName}/status/${statusId}`
    : buildXStatusUrl(url)

  return {
    canonicalUrl,
    title: 'X Video',
    description: typeof user?.name === 'string' ? user.name : undefined,
    image: poster,
    videoUrl,
    videoHlsUrl: hlsUrl,
    mediaWidth: mediaWidth ?? undefined,
    mediaHeight: mediaHeight ?? undefined,
    durationSeconds: durationMs !== null ? Math.round(durationMs / 1000) : undefined,
    providerName: 'X',
    providerPayload: {
      xSyndication: {
        statusId,
        fetchedAt: new Date().toISOString(),
        poster,
        variantCount: variants.length,
      },
    },
  }
}

const parseYouTubeId = (url: URL) => {
  const host = url.hostname.toLowerCase()
  if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
    return url.pathname.split('/').filter(Boolean)[0] || ''
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/').filter(Boolean)[1] || ''
    }
    return url.searchParams.get('v') || ''
  }
  return ''
}

const parsePinterestId = (url: URL) => {
  const directId = url.searchParams.get('id')
  if (directId && /^\d{6,}$/.test(directId)) return directId

  const path = url.pathname
  return (
    path.match(/--(\d{6,})(?:\/|$)/)?.[1] ||
    path.match(/\/pin\/(\d{6,})(?:\/|$)/i)?.[1] ||
    ''
  )
}

const buildPinterestOEmbedUrl = (url: URL) => {
  const pinId = parsePinterestId(url)
  if (!pinId) return url.toString()
  return `https://www.pinterest.com/pin/${pinId}/`
}

const extractIframeSrc = (html: unknown, baseUrl: string) => {
  if (typeof html !== 'string') return undefined
  const match = html.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i)
  return match?.[1] ? absolutize(decodeHtml(match[1]), baseUrl) : undefined
}

const normalizeEmbeddedUrl = (value: string) =>
  decodeHtml(value.replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16))))
    .replace(/\\\//g, '/')
    .replace(/\\u002F/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')

const isInstagramCdnVideoUrl = (value: string) => {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return (
      isDirectVideoUrl(url) &&
      (
        host === 'cdninstagram.com' ||
        host.endsWith('.cdninstagram.com') ||
        host === 'fbcdn.net' ||
        host.endsWith('.fbcdn.net')
      )
    )
  } catch {
    return false
  }
}

const extractInstagramVideoPreview = (html: string, baseUrl: string): Partial<ExternalPreview> | null => {
  const versionMatches = [...html.matchAll(/"width"\s*:\s*(\d+)\s*,\s*"height"\s*:\s*(\d+)[\s\S]{0,260}?"url"\s*:\s*"([^"]+?\.mp4[^"]*)"/gi)]
  const versionCandidates = versionMatches
    .map(match => {
      const videoUrl = absolutize(normalizeEmbeddedUrl(match[3]), baseUrl)
      return videoUrl && isInstagramCdnVideoUrl(videoUrl)
        ? {
            videoUrl,
            width: normalizePositiveInteger(match[1]),
            height: normalizePositiveInteger(match[2]),
          }
        : null
    })
    .filter((candidate): candidate is { videoUrl: string; width: number | null; height: number | null } => Boolean(candidate))

  const urlCandidates = [...html.matchAll(/"url"\s*:\s*"([^"]+?\.mp4[^"]*)"/gi)]
    .map(match => absolutize(normalizeEmbeddedUrl(match[1]), baseUrl))
    .filter((url): url is string => Boolean(url && isInstagramCdnVideoUrl(url)))

  const allUrls = [...new Set([
    ...versionCandidates.map(candidate => candidate.videoUrl),
    ...urlCandidates,
  ])]
  const selected = versionCandidates[0] || (allUrls[0] ? { videoUrl: allUrls[0], width: null, height: null } : null)
  if (!selected) return null

  return {
    videoUrl: selected.videoUrl,
    mediaWidth: selected.width ?? undefined,
    mediaHeight: selected.height ?? undefined,
    providerPayload: {
      instagramVideo: {
        videoUrl: selected.videoUrl,
        extractedAt: new Date().toISOString(),
        candidateCount: allUrls.length,
      },
    },
  }
}

const extractPinterestVideoPreview = (html: string, baseUrl: string): Partial<ExternalPreview> | null => {
  const urls = [...html.matchAll(/https?:\\?\/\\?\/[^"'<>\\\s]+?pinimg\.com\/videos\/[^"'<>\\\s]+?\.(?:mp4|m3u8)(?:\?[^"'<>\\\s]*)?/gi)]
    .map(match => absolutize(normalizeEmbeddedUrl(match[0]), baseUrl))
    .filter((url): url is string => Boolean(url))
  const uniqueUrls = [...new Set(urls)]
  const mp4Urls = uniqueUrls.filter(url => /\.mp4(?:$|\?)/i.test(url))
  const hlsUrl = uniqueUrls.find(url => /\.m3u8(?:$|\?)/i.test(url))
  const mp4Url = (
    mp4Urls.find(url => /\/expMp4\//i.test(url)) ||
    mp4Urls.find(url => !/\/(?:hevc|h265)/i.test(url)) ||
    mp4Urls[0]
  )

  if (!mp4Url && !hlsUrl) return null

  const videoIndex = mp4Url ? html.indexOf(mp4Url) : hlsUrl ? html.indexOf(hlsUrl) : -1
  const context = videoIndex >= 0
    ? html.slice(Math.max(0, videoIndex - 900), Math.min(html.length, videoIndex + 1600))
    : html
  const durationMs = normalizeNonNegativeInteger(context.match(/"duration"\s*:\s*(\d+)/)?.[1])
  const width = normalizePositiveInteger(context.match(/"width"\s*:\s*(\d+)/)?.[1])
  const height = normalizePositiveInteger(context.match(/"height"\s*:\s*(\d+)/)?.[1])

  return {
    videoUrl: mp4Url,
    videoHlsUrl: hlsUrl,
    mediaWidth: width ?? undefined,
    mediaHeight: height ?? undefined,
    durationSeconds: durationMs !== null ? Math.round(durationMs / 1000) : undefined,
    providerPayload: {
      pinterestVideo: {
        videoUrl: mp4Url,
        hlsUrl,
        extractedAt: new Date().toISOString(),
      },
    },
  }
}

const detectProvider = (url: URL): Provider => {
  const host = url.hostname.toLowerCase()
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(host) && parseYouTubeId(url)) return 'youtube'
  if (/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(host)) return 'x'
  if (/(^|\.)pinterest\.com$|(^|\.)pin\.it$/i.test(host)) return 'pinterest'
  if (/(^|\.)instagram\.com$/i.test(host)) return 'instagram'
  return 'external'
}

const fetchOEmbedPreview = async (url: URL, provider: Provider): Promise<ExternalPreview | null> => {
  let endpoint: URL | null = null
  if (provider === 'youtube') {
    endpoint = new URL('https://www.youtube.com/oembed')
    endpoint.searchParams.set('url', url.toString())
    endpoint.searchParams.set('format', 'json')
  } else if (provider === 'pinterest') {
    endpoint = new URL('https://www.pinterest.com/oembed.json')
    endpoint.searchParams.set('url', buildPinterestOEmbedUrl(url))
  } else if (provider === 'x') {
    endpoint = new URL('https://publish.twitter.com/oembed')
    endpoint.searchParams.set('url', buildXStatusUrl(url))
    endpoint.searchParams.set('omit_script', '1')
    endpoint.searchParams.set('hide_thread', '1')
    endpoint.searchParams.set('theme', 'dark')
    endpoint.searchParams.set('dnt', '1')
  } else if (provider === 'instagram') {
    const accessToken = Deno.env.get('META_OEMBED_ACCESS_TOKEN') ||
      (Deno.env.get('META_APP_ID') && Deno.env.get('META_APP_SECRET')
        ? `${Deno.env.get('META_APP_ID')}|${Deno.env.get('META_APP_SECRET')}`
        : undefined)
    if (accessToken) {
      endpoint = new URL('https://graph.facebook.com/v25.0/instagram_oembed')
      endpoint.searchParams.set('url', buildInstagramMediaUrl(url))
      endpoint.searchParams.set('access_token', accessToken)
      endpoint.searchParams.set('omitscript', 'true')
      endpoint.searchParams.set('maxwidth', '658')
    }
  }

  if (!endpoint) return null

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(3500),
    headers: {
      accept: 'application/json',
      'user-agent': 'ShadowChat-ShadowPinVideo/1.0',
    },
  })
  if (!response.ok) return null

  const data = await response.json()
  const title = typeof data?.title === 'string' ? decodeHtml(data.title) : undefined
  const description = typeof data?.author_name === 'string' ? decodeHtml(data.author_name) : undefined
  const image = typeof data?.thumbnail_url === 'string'
    ? absolutize(data.thumbnail_url, url.toString())
    : undefined
  const embedUrl = extractIframeSrc(data?.html, url.toString())

  return {
    canonicalUrl: typeof data?.url === 'string' ? data.url : url.toString(),
    title,
    description,
    image,
    embedUrl,
    providerName: typeof data?.provider_name === 'string' ? data.provider_name : provider,
    providerPayload: { oembed: data },
  }
}

const fetchOpenGraphPreview = async (url: URL): Promise<ExternalPreview | null> => {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(4500),
    headers: {
      accept: 'text/html,application/xhtml+xml,video/*',
      'user-agent': 'ShadowChat-ShadowPinVideo/1.0',
    },
  })

  if (!response.ok) return null
  const finalUrl = new URL(response.url || url.toString())
  await assertPublicHost(finalUrl)

  const contentType = response.headers.get('content-type') || ''
  if (contentType.startsWith('video/') || isDirectVideoUrl(finalUrl)) {
    return {
      canonicalUrl: finalUrl.toString(),
      title: finalUrl.pathname.split('/').filter(Boolean).pop(),
      videoUrl: finalUrl.toString(),
      providerPayload: { contentType },
    }
  }

  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    return null
  }

  const provider = detectProvider(finalUrl)
  const htmlReadLimit = provider === 'pinterest' || provider === 'instagram'
    ? 2048 * 1024
    : 512 * 1024
  const html = await readLimitedText(response, htmlReadLimit)
  const providerVideoPreview = provider === 'pinterest'
    ? extractPinterestVideoPreview(html, finalUrl.toString())
    : provider === 'instagram'
      ? extractInstagramVideoPreview(html, finalUrl.toString())
      : null
  const image = absolutize(
    getMetaContent(html, 'og:image:secure_url') ||
    getMetaContent(html, 'og:image:url') ||
    getMetaContent(html, 'og:image') ||
    getMetaContent(html, 'twitter:image:src') ||
    getMetaContent(html, 'twitter:image') ||
    getMetaContent(html, 'thumbnail') ||
    getMetaContent(html, 'thumbnailUrl') ||
    getMetaContent(html, 'video:thumbnail') ||
    getMetaContent(html, 'og:video:thumbnail'),
    finalUrl.toString()
  )
  const videoUrl = providerVideoPreview?.videoUrl || absolutize(
    getMetaContent(html, 'og:video:secure_url') ||
    getMetaContent(html, 'og:video:url') ||
    getMetaContent(html, 'og:video') ||
    getMetaContent(html, 'twitter:player:stream'),
    finalUrl.toString()
  )

  return {
    canonicalUrl: getMetaContent(html, 'og:url') || finalUrl.toString(),
    title: getTitle(html),
    description: getMetaContent(html, 'og:description') || getMetaContent(html, 'twitter:description') || getMetaContent(html, 'description'),
    image,
    videoUrl,
    videoHlsUrl: providerVideoPreview?.videoHlsUrl,
    mediaWidth: providerVideoPreview?.mediaWidth,
    mediaHeight: providerVideoPreview?.mediaHeight,
    durationSeconds: providerVideoPreview?.durationSeconds,
    providerName: getMetaContent(html, 'og:site_name') || finalUrl.hostname.replace(/^www\./i, ''),
    providerPayload: {
      openGraph: { contentType },
      ...(providerVideoPreview?.providerPayload ?? {}),
    },
  }
}

const mergePreview = (primary: ExternalPreview | null, fallback: ExternalPreview | null): ExternalPreview | null => {
  if (!primary) return fallback
  if (!fallback) return primary
  return {
    ...fallback,
    ...primary,
    canonicalUrl: primary.canonicalUrl || fallback.canonicalUrl,
    title: primary.title || fallback.title,
    description: primary.description || fallback.description,
    image: primary.image || fallback.image,
    videoUrl: primary.videoUrl || fallback.videoUrl,
    videoHlsUrl: primary.videoHlsUrl || fallback.videoHlsUrl,
    mediaWidth: primary.mediaWidth || fallback.mediaWidth,
    mediaHeight: primary.mediaHeight || fallback.mediaHeight,
    durationSeconds: primary.durationSeconds || fallback.durationSeconds,
    embedUrl: primary.embedUrl || fallback.embedUrl,
    providerName: primary.providerName || fallback.providerName,
    providerPayload: {
      ...(fallback.providerPayload ?? {}),
      ...(primary.providerPayload ?? {}),
    },
  }
}

const createBunnyVideo = async (libraryId: string, apiKey: string, title: string) => {
  const response = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Unable to create Bunny Stream video.')
  }

  const guid = typeof body?.guid === 'string' ? body.guid : ''
  if (!guid) {
    throw new Error('Bunny Stream did not return a video id.')
  }

  return { guid, raw: body as Record<string, unknown> }
}

const getBunnyVideo = async (libraryId: string, apiKey: string, bunnyVideoId: string) => {
  const response = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(bunnyVideoId)}`, {
    headers: { AccessKey: apiKey },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Unable to load Bunny Stream video status.')
  }
  return body as Record<string, unknown>
}

const deleteBunnyVideo = async (libraryId: string, apiKey: string, bunnyVideoId: string) => {
  const response = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(bunnyVideoId)}`, {
    method: 'DELETE',
    headers: { AccessKey: apiKey },
  })
  const body = await response.json().catch(() => ({}))
  if (response.status === 404) {
    return body as Record<string, unknown>
  }
  if (!response.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Unable to delete Bunny Stream video.')
  }
  return body as Record<string, unknown>
}

const sha256Hex = async (value: string) => {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

const buildBunnyPlaybackUrls = (libraryId: string, bunnyVideoId: string, pullZoneUrl: string) => ({
  embedUrl: `https://player.mediadelivery.net/embed/${libraryId}/${bunnyVideoId}`,
  hlsUrl: pullZoneUrl ? `${pullZoneUrl}/${bunnyVideoId}/playlist.m3u8` : null,
  previewUrl: pullZoneUrl ? `${pullZoneUrl}/${bunnyVideoId}/play_480p.mp4` : null,
  playbackUrl: pullZoneUrl ? `${pullZoneUrl}/${bunnyVideoId}/play_720p.mp4` : null,
})

const isOperator = async (supabase: SupabaseAdmin, userId: string) => {
  const { data, error } = await supabase.rpc('is_app_operator', { target_user_id: userId })
  if (error) throw error
  return Boolean(data)
}

const ensureCategory = async (supabase: SupabaseAdmin, categoryId: string) => {
  const { data, error } = await supabase
    .from('shadow_pin_categories')
    .select('id, deleted_at')
    .eq('id', categoryId)
    .maybeSingle()

  if (error) throw error
  if (!data || data.deleted_at) {
    throw new Error('Shadow Pin category not found.')
  }
}

const getEditablePin = async (supabase: SupabaseAdmin, userId: string, imageId: string) => {
  const { data, error } = await supabase
    .from('shadow_pin_images')
    .select('id, category_id, creator_id, title, description, provider, provider_payload, provider_asset_id, processing_status, deleted_at')
    .eq('id', imageId)
    .maybeSingle()

  if (error) throw error
  if (!data || data.deleted_at) return null

  const pin = data as ShadowPinRow
  if (pin.creator_id !== userId && !(await isOperator(supabase, userId))) {
    throw new Error('Only the creator or an operator can edit this pin.')
  }

  return pin
}

const getAssetCleanupPin = async (supabase: SupabaseAdmin, userId: string, imageId: string) => {
  const { data, error } = await supabase
    .from('shadow_pin_images')
    .select('id, category_id, creator_id, title, description, provider, provider_payload, provider_asset_id, processing_status, deleted_at')
    .eq('id', imageId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const pin = data as ShadowPinRow
  if (pin.creator_id !== userId && !(await isOperator(supabase, userId))) {
    throw new Error('Only the creator or an operator can clean up this video asset.')
  }

  return pin
}

const getVisiblePin = async (supabase: SupabaseAdmin, userId: string, imageId: string) => {
  const pin = await getEditablePin(supabase, userId, imageId)
  if (!pin) return null
  return pin
}

const enforceDailyNativeUploadLimit = async (
  supabase: SupabaseAdmin,
  userId: string,
  excludeImageId?: string
) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  let query = supabase
    .from('shadow_pin_images')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', userId)
    .eq('media_type', 'video')
    .is('deleted_at', null)
    .gte('created_at', since)

  if (excludeImageId) {
    query = query.neq('id', excludeImageId)
  }

  const { count, error } = await query

  if (error) throw error
  if ((count ?? 0) >= DAILY_NATIVE_UPLOAD_LIMIT) {
    throw new Error(`You can upload ${DAILY_NATIVE_UPLOAD_LIMIT} videos per day for now.`)
  }
}

const validateNativeUpload = (body: VideoPayload) => {
  const fileType = cleanText(body.fileType, 120) || 'video/mp4'
  const fileName = cleanText(body.fileName, 220) || 'shadow-pin-video.mp4'
  const fileSize = normalizePositiveInteger(body.fileSize)
  const durationSeconds = normalizeNonNegativeInteger(body.durationSeconds)
  const mediaWidth = normalizePositiveInteger(body.mediaWidth)
  const mediaHeight = normalizePositiveInteger(body.mediaHeight)
  const posterUrl = normalizeOptionalPath(body.posterUrl)
  const posterPath = normalizeOptionalPath(body.posterPath)
  const posterContentType = cleanText(body.posterContentType, 120) || 'image/jpeg'
  const posterSizeBytes = normalizePositiveInteger(body.posterSizeBytes)

  if (!ALLOWED_NATIVE_VIDEO_TYPES.has(fileType.toLowerCase())) {
    throw new Error('Use an MP4, MOV, or WebM video.')
  }
  if (!fileSize) {
    throw new Error('Video file size is required.')
  }
  if (fileSize > MAX_VIDEO_BYTES) {
    throw new Error('Videos can be up to 150 MB.')
  }
  if (durationSeconds === null) {
    throw new Error('Video duration is required.')
  }
  if (durationSeconds > MAX_VIDEO_SECONDS) {
    throw new Error('Videos can be up to 60 seconds.')
  }

  return {
    fileType,
    fileName,
    fileSize,
    durationSeconds,
    mediaWidth,
    mediaHeight,
    posterUrl,
    posterPath,
    posterContentType,
    posterSizeBytes,
  }
}

const buildNativePinRecord = (
  userId: string,
  categoryId: string,
  title: string,
  description: string | null,
  body: VideoPayload,
  bunnyVideo: { guid: string; raw: Record<string, unknown> },
  libraryId: string,
  pullZoneUrl: string
) => {
  const upload = validateNativeUpload(body)
  const playback = buildBunnyPlaybackUrls(libraryId, bunnyVideo.guid, pullZoneUrl)
  const createdAt = new Date().toISOString()

  return {
    category_id: categoryId,
    creator_id: userId,
    title,
    description,
    image_url: upload.posterUrl || FALLBACK_VIDEO_POSTER_URL,
    image_path: upload.posterPath || `bunny:${bunnyVideo.guid}:poster`,
    image_content_type: upload.posterContentType,
    image_size_bytes: upload.posterSizeBytes,
    thumbnail_url: upload.posterUrl || FALLBACK_VIDEO_POSTER_URL,
    thumbnail_path: upload.posterPath,
    medium_url: upload.posterUrl || FALLBACK_VIDEO_POSTER_URL,
    medium_path: upload.posterPath,
    image_width: upload.mediaWidth,
    image_height: upload.mediaHeight,
    processing_status: 'processing',
    processing_error: null,
    media_type: 'video',
    source_type: 'file_upload',
    source_url: null,
    provider: 'bunny_stream',
    provider_asset_id: bunnyVideo.guid,
    provider_playback_id: bunnyVideo.guid,
    provider_payload: {
      bunny_stream: {
        libraryId,
        videoId: bunnyVideo.guid,
        embedUrl: playback.embedUrl,
        pullZoneConfigured: Boolean(pullZoneUrl),
        fileName: upload.fileName,
        fileType: upload.fileType,
        fileSize: upload.fileSize,
        createdAt,
        createdBy: userId,
        bunnyResponse: bunnyVideo.raw,
      },
    },
    video_preview_url: playback.previewUrl,
    video_playback_url: playback.playbackUrl,
    video_hls_url: playback.hlsUrl,
    video_embed_url: playback.embedUrl,
    duration_seconds: upload.durationSeconds,
    video_size_bytes: upload.fileSize,
  }
}

const mergeProviderPayload = (
  existing: Record<string, unknown> | null,
  next: Record<string, unknown>
) => ({
  ...(existing && typeof existing === 'object' ? existing : {}),
  ...next,
})

const finishUploadSession = async (
  row: Record<string, unknown>,
  bunnyVideoId: string,
  libraryId: string,
  apiKey: string
) => {
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60
  const authorizationSignature = await sha256Hex(`${libraryId}${apiKey}${expiresAt}${bunnyVideoId}`)

  return json({
    ok: true,
    image: row,
    bunnyVideoId,
    libraryId,
    endpoint: 'https://video.bunnycdn.com/tusupload',
    authorizationSignature,
    authorizationExpire: expiresAt,
  })
}

const handleCreateUpload = async (req: Request, body: VideoPayload) => {
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error

  const categoryId = normalizeUuid(body.categoryId)
  const title = cleanText(body.title, 120)
  const description = nullableCleanText(body.description, 500)
  if (!categoryId) return badRequest('categoryId is required.')
  if (!title) return badRequest('Title is required.')

  validateNativeUpload(body)
  await ensureCategory(auth.supabase, categoryId)
  await enforceDailyNativeUploadLimit(auth.supabase, auth.userId)

  const { libraryId, apiKey, pullZoneUrl } = getBunnyEnv()
  const bunnyVideo = await createBunnyVideo(libraryId, apiKey, title)
  const record = buildNativePinRecord(auth.userId, categoryId, title, description, body, bunnyVideo, libraryId, pullZoneUrl)
  const { data, error } = await auth.supabase
    .from('shadow_pin_images')
    .insert(record)
    .select('*')
    .single()

  if (error) throw error
  return await finishUploadSession(data, bunnyVideo.guid, libraryId, apiKey)
}

const handleReplaceUpload = async (req: Request, body: VideoPayload) => {
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error

  const imageId = normalizeUuid(body.imageId)
  const title = cleanText(body.title, 120)
  const description = nullableCleanText(body.description, 500)
  if (!imageId) return badRequest('imageId is required.')
  if (!title) return badRequest('Title is required.')

  validateNativeUpload(body)
  const pin = await getEditablePin(auth.supabase, auth.userId, imageId)
  if (!pin) return notFound('Pin not found.')
  await enforceDailyNativeUploadLimit(auth.supabase, auth.userId, imageId)

  const { libraryId, apiKey, pullZoneUrl } = getBunnyEnv()
  const bunnyVideo = await createBunnyVideo(libraryId, apiKey, title)
  const record = buildNativePinRecord(auth.userId, pin.category_id, title, description, body, bunnyVideo, libraryId, pullZoneUrl)
  const providerPayload = mergeProviderPayload(pin.provider_payload, {
    previous_media: {
      providerAssetId: pin.provider_asset_id,
      replacedAt: new Date().toISOString(),
      replacedBy: auth.userId,
    },
    bunny_stream: record.provider_payload.bunny_stream,
  })

  const { data, error } = await auth.supabase
    .from('shadow_pin_images')
    .update({
      ...record,
      creator_id: pin.creator_id,
      provider_payload: providerPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', imageId)
    .select('*')
    .single()

  if (error) throw error
  return await finishUploadSession(data, bunnyVideo.guid, libraryId, apiKey)
}

const handleCompleteUpload = async (req: Request, body: VideoPayload) => {
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error

  const imageId = normalizeUuid(body.imageId)
  const bunnyVideoId = cleanText(body.bunnyVideoId, 120)
  if (!imageId) return badRequest('imageId is required.')
  if (!bunnyVideoId) return badRequest('bunnyVideoId is required.')

  const pin = await getEditablePin(auth.supabase, auth.userId, imageId)
  if (!pin) return notFound('Pin not found.')
  if (pin.provider_asset_id !== bunnyVideoId) {
    return forbidden('Upload session does not match this pin.')
  }

  const providerPayload = mergeProviderPayload(pin.provider_payload, {
    upload: {
      completedAt: new Date().toISOString(),
      completedBy: auth.userId,
      bunnyVideoId,
    },
  })
  const { data, error } = await auth.supabase
    .from('shadow_pin_images')
    .update({
      provider_payload: providerPayload,
      processing_status: 'processing',
      processing_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', imageId)
    .select('*')
    .single()

  if (error) throw error
  return json({ ok: true, image: data })
}

const getBunnyReadyState = (payload: Record<string, unknown>) => {
  const status = payload.status
  const statusText = String(payload.status ?? payload.statusText ?? payload.state ?? '').toLowerCase()
  const encodeProgress = Number(payload.encodeProgress ?? payload.encodingProgress ?? payload.progress ?? NaN)
  const availableResolutions = payload.availableResolutions
  const ready = (
    status === 4 ||
    statusText.includes('finished') ||
    statusText.includes('ready') ||
    encodeProgress >= 100 ||
    (typeof availableResolutions === 'string' && availableResolutions.trim().length > 0)
  )
  const failed = (
    status === 5 ||
    statusText.includes('fail') ||
    statusText.includes('error')
  )

  return { ready, failed, encodeProgress: Number.isFinite(encodeProgress) ? encodeProgress : null }
}

const handleSyncStatus = async (req: Request, body: VideoPayload) => {
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error

  const imageId = normalizeUuid(body.imageId)
  if (!imageId) return badRequest('imageId is required.')

  const pin = await getVisiblePin(auth.supabase, auth.userId, imageId)
  if (!pin) return notFound('Pin not found.')
  if (!pin.provider_asset_id) return badRequest('Pin does not have a Bunny Stream video id.')

  const { libraryId, apiKey } = getBunnyEnv()
  const bunnyStatus = await getBunnyVideo(libraryId, apiKey, pin.provider_asset_id)
  const state = getBunnyReadyState(bunnyStatus)
  const duration = normalizeNonNegativeInteger(
    bunnyStatus.length ?? bunnyStatus.duration ?? bunnyStatus.durationSeconds
  )
  const isTooLong = duration !== null && duration > MAX_VIDEO_SECONDS
  const processingStatus = state.failed || isTooLong ? 'failed' : state.ready ? 'ready' : 'processing'
  const processingError = isTooLong
    ? 'Video is longer than 60 seconds.'
    : state.failed
      ? 'Bunny Stream could not process this video.'
      : null

  const providerPayload = mergeProviderPayload(pin.provider_payload, {
    bunny_status: {
      syncedAt: new Date().toISOString(),
      state,
      raw: bunnyStatus,
    },
  })

  const { data, error } = await auth.supabase
    .from('shadow_pin_images')
    .update({
      processing_status: processingStatus,
      processing_error: processingError,
      processed_at: processingStatus === 'ready' || processingStatus === 'failed' ? new Date().toISOString() : null,
      duration_seconds: duration && duration <= MAX_VIDEO_SECONDS ? duration : undefined,
      provider_payload: providerPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', imageId)
    .select('*')
    .single()

  if (error) throw error
  return json({ ok: true, image: data })
}

const buildYoutubeEmbedUrl = (youtubeId: string) => {
  const embed = new URL(`https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}`)
  embed.searchParams.set('playsinline', '1')
  embed.searchParams.set('rel', '0')
  embed.searchParams.set('loop', '1')
  embed.searchParams.set('playlist', youtubeId)
  return embed.toString()
}

const buildExternalRecord = async (
  userId: string,
  categoryId: string,
  titleInput: string,
  descriptionInput: string | null,
  sourceUrl: URL
) => {
  const provider = detectProvider(sourceUrl)
  const [openGraph, oembed, providerVideo] = await Promise.all([
    fetchOpenGraphPreview(sourceUrl).catch(() => null),
    fetchOEmbedPreview(sourceUrl, provider).catch(() => null),
    provider === 'x' ? fetchXSyndicationPreview(sourceUrl).catch(() => null) : Promise.resolve(null),
  ])
  const preview = mergePreview(providerVideo, mergePreview(oembed, openGraph))
  const youtubeId = provider === 'youtube' ? parseYouTubeId(sourceUrl) : ''
  const pinterestId = provider === 'pinterest' ? parsePinterestId(sourceUrl) : ''
  const previewVideoUrl = await validateDirectVideoUrl(preview?.videoUrl, provider)
  const directSourceVideoUrl = provider === 'external' && isDirectVideoUrl(sourceUrl)
    ? sourceUrl.toString()
    : null
  const directVideoUrl = directSourceVideoUrl || previewVideoUrl

  if (provider === 'external' && !directVideoUrl) {
    throw new Error('Paste a YouTube Short, X, Pinterest, Instagram, or direct video URL.')
  }

  const canonicalUrl = preview?.canonicalUrl || sourceUrl.toString()
  const title = titleInput || preview?.title || (
    provider === 'youtube' ? 'YouTube Short' :
      provider === 'x' ? 'X Post' :
        provider === 'pinterest' ? 'Pinterest Video' :
          provider === 'instagram' ? 'Instagram Post' :
            'Video Pin'
  )
  const imageUrl = provider === 'youtube' && youtubeId
    ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
    : preview?.image || FALLBACK_VIDEO_POSTER_URL
  const videoUrl = provider === 'pinterest'
    ? (preview?.videoUrl || null)
    : directVideoUrl
  const shouldUseNativePlatformVideo = Boolean(videoUrl && (provider === 'x' || provider === 'instagram'))
  const embedUrl = shouldUseNativePlatformVideo
    ? null
    : provider === 'youtube' && youtubeId
      ? buildYoutubeEmbedUrl(youtubeId)
      : preview?.embedUrl
        ? preview.embedUrl
        : provider === 'pinterest' && pinterestId
          ? `https://assets.pinterest.com/ext/embed.html?id=${pinterestId}&src=shado-pin`
          : provider === 'external'
            ? videoUrl
            : null
  const providerAssetId = youtubeId || pinterestId || canonicalUrl

  return {
    category_id: categoryId,
    creator_id: userId,
    title: title.slice(0, 120),
    description: descriptionInput || preview?.description?.slice(0, 500) || null,
    image_url: imageUrl,
    image_path: `external:${provider}:${providerAssetId}`,
    image_content_type: null,
    image_size_bytes: null,
    thumbnail_url: imageUrl,
    thumbnail_path: null,
    medium_url: imageUrl,
    medium_path: null,
    image_width: preview?.mediaWidth ?? null,
    image_height: preview?.mediaHeight ?? null,
    processing_status: 'ready',
    processing_error: null,
    processed_at: new Date().toISOString(),
    media_type: 'external_video',
    source_type: 'external_embed',
    source_url: canonicalUrl,
    provider,
    provider_asset_id: providerAssetId,
    provider_playback_id: youtubeId || pinterestId || null,
    provider_payload: {
      provider,
      canonicalUrl,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      preview: preview?.providerPayload ?? {},
    },
    video_preview_url: videoUrl,
    video_playback_url: videoUrl,
    video_hls_url: preview?.videoHlsUrl ?? null,
    video_embed_url: embedUrl,
    duration_seconds: preview?.durationSeconds ?? null,
    video_size_bytes: null,
  }
}

const handleCreateExternal = async (req: Request, body: VideoPayload) => {
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error

  const categoryId = normalizeUuid(body.categoryId)
  const title = cleanText(body.title, 120)
  const description = nullableCleanText(body.description, 500)
  if (!categoryId) return badRequest('categoryId is required.')
  if (!body.sourceUrl || body.sourceUrl.length > 2048) return badRequest('sourceUrl is required.')

  const sourceUrl = normalizeUrl(body.sourceUrl)
  await assertPublicHost(sourceUrl)
  await ensureCategory(auth.supabase, categoryId)

  const record = await buildExternalRecord(auth.userId, categoryId, title, description, sourceUrl)
  const { data, error } = await auth.supabase
    .from('shadow_pin_images')
    .insert(record)
    .select('*')
    .single()

  if (error) throw error
  return json({ ok: true, image: data })
}

const handleReplaceExternal = async (req: Request, body: VideoPayload) => {
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error

  const imageId = normalizeUuid(body.imageId)
  const title = cleanText(body.title, 120)
  const description = nullableCleanText(body.description, 500)
  if (!imageId) return badRequest('imageId is required.')
  if (!body.sourceUrl || body.sourceUrl.length > 2048) return badRequest('sourceUrl is required.')

  const pin = await getEditablePin(auth.supabase, auth.userId, imageId)
  if (!pin) return notFound('Pin not found.')
  const sourceUrl = normalizeUrl(body.sourceUrl)
  await assertPublicHost(sourceUrl)

  const record = await buildExternalRecord(pin.creator_id, pin.category_id, title || pin.title, description ?? pin.description, sourceUrl)
  const providerPayload = mergeProviderPayload(pin.provider_payload, {
    previous_media: {
      providerAssetId: pin.provider_asset_id,
      replacedAt: new Date().toISOString(),
      replacedBy: auth.userId,
    },
    ...record.provider_payload,
  })

  const { data, error } = await auth.supabase
    .from('shadow_pin_images')
    .update({
      ...record,
      creator_id: pin.creator_id,
      provider_payload: providerPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', imageId)
    .select('*')
    .single()

  if (error) throw error
  return json({ ok: true, image: data })
}

const handleDeleteVideoAsset = async (req: Request, body: VideoPayload) => {
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error

  const imageId = normalizeUuid(body.imageId)
  if (!imageId) return badRequest('imageId is required.')

  const pin = await getAssetCleanupPin(auth.supabase, auth.userId, imageId)
  if (!pin) return notFound('Pin not found.')
  if (pin.provider !== 'bunny_stream' || !pin.provider_asset_id) {
    return badRequest('Pin does not have a Bunny Stream video asset.')
  }
  if (!pin.deleted_at && pin.processing_status !== 'failed') {
    return forbidden('Video assets can only be cleaned up after a pin is deleted or failed.')
  }

  const { libraryId, apiKey } = getBunnyEnv()
  const bunnyDelete = await deleteBunnyVideo(libraryId, apiKey, pin.provider_asset_id)
  const providerPayload = mergeProviderPayload(pin.provider_payload, {
    asset_cleanup: {
      deletedAt: new Date().toISOString(),
      deletedBy: auth.userId,
      bunnyVideoId: pin.provider_asset_id,
      bunnyResponse: bunnyDelete,
    },
  })

  const { data, error } = await auth.supabase
    .from('shadow_pin_images')
    .update({
      provider_asset_id: null,
      provider_playback_id: null,
      video_preview_url: null,
      video_playback_url: null,
      video_hls_url: null,
      video_embed_url: null,
      provider_payload: providerPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', imageId)
    .select('*')
    .single()

  if (error) throw error
  return json({ ok: true, image: data })
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  try {
    const body = await readJson<VideoPayload>(req)
    switch (body.action) {
      case 'create-upload':
        return await handleCreateUpload(req, body)
      case 'replace-upload':
        return await handleReplaceUpload(req, body)
      case 'complete-upload':
        return await handleCompleteUpload(req, body)
      case 'sync-status':
        return await handleSyncStatus(req, body)
      case 'create-external':
        return await handleCreateExternal(req, body)
      case 'replace-external':
        return await handleReplaceExternal(req, body)
      case 'delete-video-asset':
        return await handleDeleteVideoAsset(req, body)
      default:
        return badRequest('Unsupported Shadow Pin video action.')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Shadow Pin video error.'
    return json({ error: message }, 400)
  }
})
