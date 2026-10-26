import { VITE_BUNNY_STREAM_CDN_ORIGIN } from './env'

const PLAYER_HOSTS = new Set(['player.mediadelivery.net', 'iframe.mediadelivery.net'])
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const assetPath = new RegExp(`/(${UUID})/([^/]+)$`, 'i')
const embedPath = new RegExp(`^/embed/(\\d+)/(${UUID})$`, 'i')

/** All provider candidates go to the server; only it knows which library is ours. */
export const isBunnyMediaCandidate = (value: string) => {
  try {
    const url = new URL(value)
    const configured = VITE_BUNNY_STREAM_CDN_ORIGIN ? new URL(VITE_BUNNY_STREAM_CDN_ORIGIN).origin : null
    return PLAYER_HOSTS.has(url.hostname) || url.hostname.endsWith('.b-cdn.net') || url.origin === configured
  } catch { return false }
}

export async function resolveBunnyMediaSource(value: string, invoke: (body: { action: string; sourceUrl: string }) => Promise<{ data: unknown; error: unknown }>) {
  const original = new URL(value)
  if (original.protocol !== 'https:' || original.username || original.password || original.port) throw new Error('Invalid private video URL.')
  const { data, error } = await invoke({ action: 'resolve-private-media', sourceUrl: value })
  const result = data as { ok?: boolean; managed?: boolean; url?: string; expiresAt?: number } | null
  if (error || result?.ok !== true) throw new Error('This video is unavailable or you no longer have access.')
  // Explicit server classification preserves external Bunny libraries. A denied
  // or malformed response never reuses an unsigned managed-library URL.
  if (result.managed === false) return { url: value, expiresAt: null }
  if (result.managed !== true || typeof result.url !== 'string' || !Number.isSafeInteger(result.expiresAt)
    || result.expiresAt! <= Date.now() || result.expiresAt! > Date.now() + 305_000) {
    throw new Error('The video service returned an invalid expiration.')
  }
  const signed = new URL(result.url)
  if (signed.protocol !== 'https:' || signed.username || signed.password || signed.port || signed.hash) throw new Error('The video service returned an invalid URL.')
  const originalEmbed = original.pathname.match(embedPath)
  if (PLAYER_HOSTS.has(original.hostname)) {
    if (!originalEmbed || signed.origin !== 'https://player.mediadelivery.net' || signed.pathname !== original.pathname
      || !/^[0-9a-f]{64}$/.test(signed.searchParams.get('token') ?? '')
      || Number(signed.searchParams.get('expires')) * 1000 !== result.expiresAt) throw new Error('The video service returned an invalid player URL.')
  } else {
    const originalAsset = original.pathname.match(assetPath)
    const signedAsset = signed.pathname.match(assetPath)
    const token = signed.pathname.match(/^\/bcdn_token=HS256-[A-Za-z0-9_-]+&token_path=([^&]+)&expires=(\d+)\//)
    if (signed.origin !== original.origin || !originalAsset || !signedAsset || !token
      || signedAsset[1] !== originalAsset[1] || signedAsset[2] !== originalAsset[2]
      || decodeURIComponent(token[1]) !== `/${originalAsset[1]}/` || Number(token[2]) * 1000 !== result.expiresAt) {
      throw new Error('The video service returned an invalid media URL.')
    }
  }
  return { url: signed.toString(), expiresAt: result.expiresAt! }
}
