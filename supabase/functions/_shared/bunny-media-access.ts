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


export type BunnyDraftAsset = {
  id: string; draft_id: string; creator_id: string; provider: string; asset_kind: string;
  provider_asset_id: string | null; state: string; deleted_at: string | null;
  final_image_url: string | null; final_thumbnail_url: string | null; final_medium_url: string | null;
  video_preview_url: string | null; video_playback_url: string | null; video_hls_url: string | null; video_embed_url: string | null;
}
export type BunnyCreatorDraft = { id: string; creator_id: string; active_asset_id: string | null; state: string }

/** Both row sets must come from the caller's RLS-scoped client. This is only a
 * canonical-reference filter; authorizeBunnyMediaSource still requires the
 * service-owned registry to match the draft asset, library and creator. */
export function ownedBunnyDraftReferences(actorId: string, assetId: string, assets: BunnyDraftAsset[], drafts: BunnyCreatorDraft[]): BunnyVisibleReference[] {
  const activeDrafts = new Map(drafts.filter(draft => draft.creator_id === actorId && !['published', 'abandoned'].includes(draft.state)).map(draft => [draft.id, draft]))
  return assets.flatMap(asset => {
    const draft = activeDrafts.get(asset.draft_id)
    if (!draft || draft.active_asset_id !== asset.id || asset.creator_id !== actorId || asset.deleted_at !== null
      || asset.provider !== 'bunny_stream' || asset.asset_kind !== 'video' || asset.provider_asset_id !== assetId
      || !['uploading', 'processing', 'ready', 'publish_ready'].includes(asset.state)) return []
    return [{ id: asset.id, ownerId: asset.creator_id, sourceType: 'shadow_pin_draft_asset', assetId,
      mediaUrls: [asset.final_image_url, asset.final_thumbnail_url, asset.final_medium_url,
        asset.video_preview_url, asset.video_playback_url, asset.video_hls_url, asset.video_embed_url] }]
  })
}
