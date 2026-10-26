import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { VITE_PRIVATE_MEDIA_ENABLED, VITE_SUPABASE_URL } from './env'
import { getWorkingClient, supabase } from './supabase'
import { PERSONAL_BLOCKS_CHANGED_EVENT } from './personalBlocking'
import { isBunnyMediaCandidate, resolveBunnyMediaSource } from './privateBunnyMediaUrls'

export const PRIVATE_MEDIA_URL_LIFETIME_SECONDS = 600
export const PRIVATE_MEDIA_REFRESH_MARGIN_MS = 30_000
const MAX_CACHED_MEDIA_URLS = 512
const PRIVATE_MEDIA_BUCKETS = new Set(['chat-uploads', 'message-media', 'shadow-pin'])
// Keep this literal comparison so disabled builds can discard the signing path.
export const PRIVATE_MEDIA_ENABLED = VITE_PRIVATE_MEDIA_ENABLED === 'true'

type ImageTransform = { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' }
type PrivateMediaTarget = { bucket: string; path: string; transform?: ImageTransform }
export type PrivateMediaOptions = { download?: boolean | string }
export type ResolvedPrivateMediaSource = { url: string; expiresAt: number | null }

const cache = new Map<string, ResolvedPrivateMediaSource>()
const pending = new Map<string, Promise<ResolvedPrivateMediaSource>>()
const subscribers = new Set<() => void>()
let activeSessionKey: string | null = null
let cacheGeneration = 0
let listeningForAccessChanges = false

const getSessionKey = (session: Session | null) => session?.user?.id && session.access_token
  ? `${session.user.id}:${session.access_token}`
  : null

export const invalidatePrivateMediaUrls = () => {
  if (!PRIVATE_MEDIA_ENABLED) return
  cacheGeneration += 1
  cache.clear()
  pending.clear()
  subscribers.forEach(listener => listener())
}

export const subscribePrivateMediaInvalidation = (listener: () => void) => {
  subscribers.add(listener)
  return () => { subscribers.delete(listener) }
}

export const getPrivateMediaGeneration = () => cacheGeneration

const setActiveSession = (key: string | null) => {
  if (key === activeSessionKey) return
  activeSessionKey = key
  invalidatePrivateMediaUrls()
}

const listenForAccessChanges = () => {
  if (listeningForAccessChanges) return
  listeningForAccessChanges = true
  // Never make asynchronous Supabase requests inside its auth callback.
  supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => setActiveSession(getSessionKey(session)))
  if (typeof window !== 'undefined') {
    window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, invalidatePrivateMediaUrls)
  }
}

/** Recognizes only our project and durable member-media buckets; never signs external URLs. */
export const parsePrivateMediaUrl = (value: string): PrivateMediaTarget | null => {
  let url: URL
  let projectUrl: URL
  try {
    url = new URL(value)
    projectUrl = new URL(VITE_SUPABASE_URL)
  } catch {
    return null
  }
  if (url.origin !== projectUrl.origin) return null
  const match = url.pathname.match(/^\/storage\/v1\/(object|render\/image)\/(public|sign|authenticated)\/([^/]+)\/(.+)$/)
  if (!match || !PRIVATE_MEDIA_BUCKETS.has(match[3])) return null
  if (url.username || url.password) throw new Error('Media URL credentials are not allowed.')

  let parts: string[]
  try {
    parts = match[4].split('/').map(part => decodeURIComponent(part))
  } catch {
    throw new Error('Media object path is invalid.')
  }
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\/]/.test(part) ||
    Array.from(part).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) {
    throw new Error('Media object path is invalid.')
  }

  const transform: ImageTransform = {}
  if (match[1] === 'render/image') {
    for (const key of ['width', 'height', 'quality'] as const) {
      if (!url.searchParams.has(key)) continue
      const value = Number(url.searchParams.get(key))
      const maximum = key === 'quality' ? 100 : 2500
      if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error('Media transform is invalid.')
      transform[key] = value
    }
    const resize = url.searchParams.get('resize')
    if (resize !== null) {
      if (resize !== 'cover' && resize !== 'contain' && resize !== 'fill') throw new Error('Media transform is invalid.')
      transform.resize = resize
    }
  }
  return { bucket: match[3], path: parts.join('/'), ...(Object.keys(transform).length ? { transform } : {}) }
}

export const requiresPrivateMediaUrl = (value?: string | null) => {
  if (!PRIVATE_MEDIA_ENABLED || !value) return false
  try {
    return Boolean(parsePrivateMediaUrl(value)) || isBunnyMediaCandidate(value)
  } catch {
    // A malformed member URL must remain hidden, not fall back to public delivery.
    return true
  }
}

export const resolvePrivateMediaSource = async (
  value: string,
  options: PrivateMediaOptions = {},
): Promise<ResolvedPrivateMediaSource> => {
  if (!PRIVATE_MEDIA_ENABLED) return { url: value, expiresAt: null }
  const target = parsePrivateMediaUrl(value)
  const bunny = !target && isBunnyMediaCandidate(value)
  if (!target && !bunny) return { url: value, expiresAt: null }

  listenForAccessChanges()
  const initialGeneration = cacheGeneration
  const client = await getWorkingClient()
  const { data, error } = await client.auth.getSession()
  const session = data.session
  const sessionKey = getSessionKey(session)
  if (error || !sessionKey || (session?.expires_at && session.expires_at * 1000 <= Date.now())) {
    setActiveSession(null)
    throw new Error('Sign in to view this attachment.')
  }
  if (initialGeneration !== cacheGeneration && activeSessionKey !== sessionKey) {
    throw new Error('Media access changed. Try again.')
  }
  setActiveSession(sessionKey)
  const generation = cacheGeneration
  const key = JSON.stringify([sessionKey, target ?? value, options.download ?? false])
  const cached = cache.get(key)
  if (cached?.expiresAt && cached.expiresAt > Date.now() + PRIVATE_MEDIA_REFRESH_MARGIN_MS) return cached
  if (pending.has(key)) return pending.get(key)!

  const request = (async () => {
    if (bunny) {
      const result = await resolveBunnyMediaSource(value, body => client.functions.invoke('shadow-pin-video', { body }))
      if (generation !== cacheGeneration || sessionKey !== activeSessionKey) throw new Error('Media access changed. Try again.')
      cache.set(key, result)
      while (cache.size > MAX_CACHED_MEDIA_URLS) cache.delete(cache.keys().next().value!)
      return result
    }
    if (!target) throw new Error('Invalid attachment source.')
    const requestedAt = Date.now()
    const { data: signed, error: signingError } = await client.storage.from(target.bucket).createSignedUrl(
      target.path,
      PRIVATE_MEDIA_URL_LIFETIME_SECONDS,
      { ...(target.transform ? { transform: target.transform } : {}), ...options },
    )
    if (signingError || !signed?.signedUrl) throw new Error('This attachment is unavailable or you no longer have access.')
    if (generation !== cacheGeneration || sessionKey !== activeSessionKey) throw new Error('Media access changed. Try again.')
    // Storage is the authority. Retain neither a public fallback nor disk-cached bearer URLs.
    const signedUrl = new URL(signed.signedUrl)
    const expectedOrigin = new URL(VITE_SUPABASE_URL).origin
    const signedTarget = parsePrivateMediaUrl(signed.signedUrl)
    if (
      signedUrl.origin !== expectedOrigin || signedUrl.username || signedUrl.password ||
      !/^\/storage\/v1\/(object|render\/image)\/sign\//.test(signedUrl.pathname) ||
      !signedUrl.searchParams.get('token') || signedTarget?.bucket !== target.bucket || signedTarget.path !== target.path
    ) {
      throw new Error('The attachment service returned an invalid URL.')
    }
    const result = { url: signedUrl.toString(), expiresAt: requestedAt + PRIVATE_MEDIA_URL_LIFETIME_SECONDS * 1000 }
    cache.delete(key)
    cache.set(key, result)
    while (cache.size > MAX_CACHED_MEDIA_URLS) cache.delete(cache.keys().next().value!)
    return result
  })()
  pending.set(key, request)
  try {
    return await request
  } finally {
    if (pending.get(key) === request) pending.delete(key)
  }
}

export const resolvePrivateMediaUrl = async (value: string, options?: PrivateMediaOptions) =>
  (await resolvePrivateMediaSource(value, options)).url
