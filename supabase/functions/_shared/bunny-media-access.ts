import { signBunnyPrivateMedia } from './bunny-private-media.ts'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const VIDEO_FILE = new RegExp(`^/(${UUID})/([A-Za-z0-9][A-Za-z0-9_.-]{0,119}\\.(?:m3u8|mp4|webm|jpg|jpeg|png|webp|gif|avif))$`, 'i')
const EMBED = new RegExp(`^/embed/([1-9][0-9]*)/(${UUID})$`, 'i')
const PLAYER_HOSTS = new Set(['player.mediadelivery.net', 'iframe.mediadelivery.net'])
const PLAYER_OPTIONS = new Set(['autoplay', 'muted', 'loop', 'preload', 'responsive', 'controls', 'showSpeed'])

export type BunnyAccessConfig = { libraryId: string; pullZoneUrl: string; tokenSecurityKey: string; nowSeconds?: number }
export type BunnyVisibleReference = { id: string; ownerId: string; sourceType: string; assetId: string; mediaUrls: Array<string | null> }
export type BunnyTrustedReference = { library_id: string; asset_id: string; owner_id: string }
export type BunnyAccessStore = {
  /** Must use the caller's JWT and canonical SELECT RLS, never service role. */
  visibleReferences(assetId: string): Promise<BunnyVisibleReference[]>
  /** Service-only provenance lookup; a writable row alone never grants access. */
  trustedReferences(reference: BunnyVisibleReference): Promise<BunnyTrustedReference[]>
}

export function parseManagedBunnySource(value: string, config: Pick<BunnyAccessConfig, 'libraryId' | 'pullZoneUrl'>) {
  let url: URL
  let cdn: URL
  try { url = new URL(value); cdn = new URL(config.pullZoneUrl) } catch { throw new Error('Invalid private video configuration or URL.') }
  const managedCdn = url.origin === cdn.origin
  const player = PLAYER_HOSTS.has(url.hostname)
  if (!managedCdn && !player) return null
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('Invalid private video URL.')
  if (player) {
    const match = url.pathname.match(EMBED)
    if (!match) throw new Error('Invalid private player URL.')
    if (match[1] !== config.libraryId) return null
    return { kind: 'embed' as const, assetId: match[2].toLowerCase(), url }
  }
  // Existing short-lived paths may be re-authorized, but their tokens confer no
  // authority and are never reused. The resource is rebuilt from trusted data.
  const path = url.pathname.replace(/^\/bcdn_token=[^/]+(?=\/)/, '')
  const match = path.match(VIDEO_FILE)
  if (!match || match[2].includes('..')) throw new Error('Invalid private video path.')
  return { kind: 'cdn' as const, assetId: match[1].toLowerCase(), fileName: match[2], url }
}

export async function authorizeBunnyMediaSource(value: string, config: BunnyAccessConfig, store: BunnyAccessStore) {
  const target = parseManagedBunnySource(value, config)
  if (!target) return { managed: false as const }
  const references = await store.visibleReferences(target.assetId)
  for (const reference of references) {
    if (reference.assetId.toLowerCase() !== target.assetId) continue
    if (target.kind === 'cdn' && !reference.mediaUrls.some(value => {
      if (!value) return false
      try {
        const media = parseManagedBunnySource(value, config)
        return media?.kind === 'cdn' && media.assetId === target.assetId && media.fileName === target.fileName
      } catch { return false }
    })) continue
    const trusted = await store.trustedReferences(reference)
    if (!trusted.some(row => row.library_id === config.libraryId && row.asset_id === target.assetId && row.owner_id === reference.ownerId)) continue
    const signed = await signBunnyPrivateMedia({ ...config, videoId: target.assetId }, target.kind === 'embed'
      ? { kind: 'embed' } : { kind: 'cdn', fileName: target.fileName })
    if (target.kind === 'embed') {
      const playerUrl = new URL(signed.url)
      for (const [key, value] of target.url.searchParams) {
        if (PLAYER_OPTIONS.has(key) && (value === 'true' || value === 'false')) playerUrl.searchParams.set(key, value)
        if (key === 't' && /^\d{1,7}(?:\.\d{1,3})?$/.test(value)) playerUrl.searchParams.set(key, value)
        if (key === 'captions' && /^[a-z]{2,3}(?:-[a-z]{2})?$/.test(value)) playerUrl.searchParams.set(key, value)
      }
      signed.url = playerUrl.toString()
    }
    return { managed: true as const, ...signed }
  }
  throw new Error('This video is unavailable or you no longer have access.')
}
