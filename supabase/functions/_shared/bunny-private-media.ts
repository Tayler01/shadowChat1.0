// Server-only signing. Callers must authorize the video from trusted registry
// and visible content records before invoking this helper; never sign a client URL.
// https://bunny.net/docs/stream/player/signed-embeds
// https://bunny.net/docs/cdn/security/token-authentication/advanced
export const BUNNY_PRIVATE_MEDIA_TTL_SECONDS = 300

type BunnyPrivateMediaConfig = {
  libraryId: string
  videoId: string
  pullZoneUrl: string
  tokenSecurityKey: string
  /** Server clock in epoch seconds; injectable for deterministic tests only. */
  nowSeconds?: number
}

type BunnyPrivateMediaResource = { kind: 'embed' } | { kind: 'cdn'; fileName: string }

const encoder = new TextEncoder()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEDIA_FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.(?:m3u8|mp4|webm|jpg|jpeg|png|webp|gif|avif)$/i
const DNS_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function configuredOrigin(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Bunny media origin is not configured correctly.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !DNS_NAME.test(url.hostname) || url.hostname.length > 253
    || /(?:^|\.)(?:localhost|local|internal|invalid)$/.test(url.hostname)
    || (value !== url.origin && value !== `${url.origin}/`)) {
    throw new Error('Bunny media origin is not configured correctly.')
  }
  return url.origin
}

export async function signBunnyPrivateMedia(
  config: BunnyPrivateMediaConfig,
  resource: BunnyPrivateMediaResource,
): Promise<{ url: string; expiresAt: number }> {
  if (typeof config.libraryId !== 'string' || !/^[1-9][0-9]{0,18}$/.test(config.libraryId)
    || typeof config.videoId !== 'string' || !UUID.test(config.videoId)) {
    throw new Error('Invalid Bunny media identity.')
  }
  const key = config.tokenSecurityKey
  if (typeof key !== 'string' || key.length < 16 || key.length > 512 || /\s/.test(key)
    || [...key].some(value => value.charCodeAt(0) < 32 || value.charCodeAt(0) === 127)) {
    throw new Error('Bunny media token security key is not configured correctly.')
  }
  const now = config.nowSeconds ?? Math.floor(Date.now() / 1000)
  // Reject milliseconds, fractional time and unsafe arithmetic. No caller TTL.
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffff - BUNNY_PRIVATE_MEDIA_TTL_SECONDS) {
    throw new Error('Invalid Bunny media signing time.')
  }
  const expires = now + BUNNY_PRIVATE_MEDIA_TTL_SECONDS
  const videoId = config.videoId.toLowerCase()
  if (resource.kind === 'embed') {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${key}${videoId}${expires}`)))
    const token = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
    return {
      url: `https://player.mediadelivery.net/embed/${config.libraryId}/${videoId}?token=${token}&expires=${expires}`,
      expiresAt: expires * 1000,
    }
  }
  if (resource.kind !== 'cdn' || typeof resource.fileName !== 'string'
    || !MEDIA_FILE.test(resource.fileName) || resource.fileName.includes('..')) {
    throw new Error('Invalid Bunny media file.')
  }
  const origin = configuredOrigin(config.pullZoneUrl)
  // A trailing slash limits the token to this video. Path-style authorization
  // stays in relative HLS playlist/segment URLs instead of being lost in a query.
  const directory = `/${videoId}/`
  const hmacKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  // Bunny signs raw parameter values; percent-encoding is only for the URL.
  const payload = `${directory}${expires}token_path=${directory}`
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(payload)))
  const token = `HS256-${btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  return {
    url: `${origin}/bcdn_token=${token}&token_path=${encodeURIComponent(directory)}&expires=${expires}${directory}${resource.fileName}`,
    expiresAt: expires * 1000,
  }
}
