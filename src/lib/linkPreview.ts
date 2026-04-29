import { supabase } from './supabase'

export type LinkTextPart =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string }

export type LinkPreview = {
  url: string
  canonicalUrl?: string
  title?: string
  description?: string
  image?: string
  mediaType?: 'image' | 'video' | 'link'
  siteName?: string
  provider?: string
}

type CachedPreview = {
  preview: LinkPreview
  expiresAt: number
}

const URL_PATTERN = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi
const CACHE_PREFIX = 'shadowchat:link-preview:'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const memoryCache = new Map<string, CachedPreview>()
const pendingRequests = new Map<string, Promise<LinkPreview | null>>()

const trimUrlToken = (value: string) => {
  let candidate = value
  while (/[.,!?;:]$/.test(candidate)) {
    candidate = candidate.slice(0, -1)
  }

  while (candidate.endsWith(')')) {
    const opens = (candidate.match(/\(/g) || []).length
    const closes = (candidate.match(/\)/g) || []).length
    if (closes <= opens) break
    candidate = candidate.slice(0, -1)
  }

  return candidate
}

export const normalizeMessageUrl = (value: string): string | null => {
  const trimmed = trimUrlToken(value.trim())
  if (!trimmed) return null

  const withScheme = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed

  try {
    const parsed = new URL(withScheme)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}

export const tokenizeMessageText = (content: string): LinkTextPart[] => {
  const parts: LinkTextPart[] = []
  let lastIndex = 0

  for (const match of content.matchAll(URL_PATTERN)) {
    const raw = match[0]
    const start = match.index ?? 0
    const normalized = normalizeMessageUrl(raw)
    if (!normalized) continue

    const visible = trimUrlToken(raw)
    const end = start + visible.length

    if (start > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, start) })
    }

    parts.push({ type: 'link', text: visible, href: normalized })
    lastIndex = end
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) })
  }

  return parts.length ? parts : [{ type: 'text', text: content }]
}

export const extractFirstMessageUrl = (content: string): string | null => {
  for (const match of content.matchAll(URL_PATTERN)) {
    const normalized = normalizeMessageUrl(match[0])
    if (normalized) return normalized
  }

  return null
}

const getCacheKey = (url: string) => `${CACHE_PREFIX}${encodeURIComponent(url)}`

const readCachedPreview = (url: string): LinkPreview | null => {
  const memory = memoryCache.get(url)
  if (memory && memory.expiresAt > Date.now()) {
    return memory.preview
  }

  if (typeof localStorage === 'undefined') return null

  try {
    const raw = localStorage.getItem(getCacheKey(url))
    if (!raw) return null

    const cached = JSON.parse(raw) as CachedPreview
    if (!cached?.preview || cached.expiresAt <= Date.now()) {
      localStorage.removeItem(getCacheKey(url))
      return null
    }

    memoryCache.set(url, cached)
    return cached.preview
  } catch {
    return null
  }
}

const writeCachedPreview = (url: string, preview: LinkPreview) => {
  const cached: CachedPreview = {
    preview,
    expiresAt: Date.now() + CACHE_TTL_MS,
  }
  memoryCache.set(url, cached)

  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(getCacheKey(url), JSON.stringify(cached))
  } catch {
    // Ignore storage pressure; previews still work through memory cache.
  }
}

export const fetchLinkPreview = async (url: string): Promise<LinkPreview | null> => {
  const normalized = normalizeMessageUrl(url)
  if (!normalized) return null

  const cached = readCachedPreview(normalized)
  if (cached) return cached

  const pending = pendingRequests.get(normalized)
  if (pending) return pending

  const request = (supabase.functions.invoke('link-preview', {
      body: { url: normalized },
    }) as Promise<{ data?: { preview?: LinkPreview }; error?: unknown }>)
    .then(({ data, error }: { data?: { preview?: LinkPreview }; error?: unknown }) => {
      if (error || !data?.preview) {
        return null
      }

      writeCachedPreview(normalized, data.preview)
      return data.preview
    })
    .catch(() => null)
    .finally(() => {
      pendingRequests.delete(normalized)
    })

  pendingRequests.set(normalized, request)
  return request
}
