/** Trusted report-media rows only. Never accepts a caller-supplied source URL. */
export type ModerationMediaAsset = {
  id: string; case_id: string; report_id: string; media_key: string
  kind: 'image' | 'audio' | 'video' | 'file'
  provider: 'storage' | 'bunny' | 'external'; status: 'pending' | 'ready' | 'unavailable'
  source_bucket: string | null; source_path: string | null; source_url: string | null
  source_size_bytes: number | null; source_content_type: string | null
  library_id: string | null; asset_id: string | null
  storage_bucket: string; storage_path: string; error_code: string | null
}
type Result = { data?: unknown; error: unknown }
export type ModerationMediaClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result>
  storage: { from(bucket: string): {
    copy(source: string, destination: string, options: { destinationBucket: string }): PromiseLike<Result>
    createSignedUrl(path: string, expiresIn: number, options?: { download?: boolean | string }): PromiseLike<{ data: { signedUrl?: string } | null; error: unknown }>
  } }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SOURCES = new Set(['avatars', 'banners', 'chat-uploads', 'message-media', 'shadow-pin', 'shadow-pin-comments', 'moderation-evidence'])
const CAPTURE_BUCKET = 'moderation-captured-media'
export const MODERATION_MEDIA_URL_SECONDS = 300

const safePath = (path: unknown): path is string => typeof path === 'string' && path.length <= 1024
  && !path.includes('\\') && ![...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  && path.split('/').every(part => part && part !== '.' && part !== '..')

export function parseModerationMediaAssets(value: unknown): ModerationMediaAsset[] {
  if (!Array.isArray(value)) throw new Error('Invalid report media records')
  return value.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid report media record')
    const row = item as ModerationMediaAsset
    if (![row.id, row.case_id, row.report_id].every(id => typeof id === 'string' && UUID.test(id))
      || typeof row.media_key !== 'string' || !['image', 'audio', 'video', 'file'].includes(row.kind)
      || !['storage', 'bunny', 'external'].includes(row.provider) || !['pending', 'ready', 'unavailable'].includes(row.status)
      || row.storage_bucket !== CAPTURE_BUCKET || row.storage_path !== `captured/${row.case_id}/${row.id}`) throw new Error('Invalid report media record')
    if (row.provider === 'storage' && (!SOURCES.has(row.source_bucket ?? '') || !safePath(row.source_path)
      || typeof row.source_size_bytes !== 'number' || !Number.isSafeInteger(row.source_size_bytes)
      || typeof row.source_content_type !== 'string')) throw new Error('Invalid report media source')
    if (row.provider === 'bunny' && (!/^[1-9][0-9]{0,19}$/.test(row.library_id ?? '') || !UUID.test(row.asset_id ?? ''))) throw new Error('Invalid retained video identity')
    return row
  })
}

function sourceMatchesProject(asset: ModerationMediaAsset, projectUrl: string): boolean {
  if (asset.source_url == null) return asset.source_bucket === 'moderation-evidence' && /^attachment:[0-9a-f-]{36}$/i.test(asset.media_key)
  let url: URL
  try { url = new URL(asset.source_url) } catch { return false }
  if (url.origin !== new URL(projectUrl).origin || url.username || url.password) return false
  const match = url.pathname.match(/^\/storage\/v1\/(?:object|render\/image)\/(?:public|authenticated|sign)\/([^/]+)\/(.+)$/)
  if (!match || match[1] !== asset.source_bucket) return false
  try {
    const parts = match[2].split('/').map(part => decodeURIComponent(part))
    if (parts.some(part => /[\\/]/.test(part))) return false
    return safePath(parts.join('/')) && parts.join('/') === asset.source_path
  } catch { return false }
}

/** Copy runs as service role; destination ownership must not inherit a member JWT. */
export async function captureModerationMedia(client: ModerationMediaClient, value: unknown, config: { supabaseUrl: string }): Promise<void> {
  const projectUrl = new URL(config.supabaseUrl)
  if (!['https:', 'http:'].includes(projectUrl.protocol)) throw new Error('Media capture configuration is invalid')
  for (const asset of parseModerationMediaAssets(value)) {
    if (asset.provider !== 'storage' || asset.status !== 'pending') continue
    if (!sourceMatchesProject(asset, config.supabaseUrl)) {
      const result = await client.rpc('reject_moderation_media_origin', { target_asset_id: asset.id })
      if (result.error) throw new Error('Media source validation could not be recorded')
      continue
    }
    if (asset.source_size_bytes! < 1 || asset.source_size_bytes! > 268_435_456) throw new Error('Media capture exceeds its allowed size')
    // A lost copy response must be retryable. The DB verifies the private
    // destination's expected size/type before accepting an existing copy.
    const copied = await client.storage.from(asset.source_bucket!).copy(asset.source_path!, asset.storage_path, { destinationBucket: CAPTURE_BUCKET })
    const completed = await client.rpc('complete_moderation_media_capture', { target_asset_id: asset.id })
    if (completed.error) {
      if (copied.error) throw new Error('Reported media capture is incomplete; retry is required')
      throw new Error('Reported media copy was not confirmed; retry is required')
    }
  }
}

export type ReviewMediaAsset = {
  id: string; reportId: string; kind: ModerationMediaAsset['kind']; status: ModerationMediaAsset['status']
  url?: string; contentType?: string; error?: string
}

export async function createModerationMediaReview(
  client: ModerationMediaClient,
  value: unknown,
  caseId: string,
  signBunny: (libraryId: string, assetId: string) => Promise<string>,
): Promise<ReviewMediaAsset[]> {
  const assets = parseModerationMediaAssets(value)
  if (assets.some(asset => asset.case_id !== caseId)) throw new Error('Case media scope was not confirmed')
  const result: ReviewMediaAsset[] = []
  for (const asset of assets) {
    const view: ReviewMediaAsset = { id: asset.id, reportId: asset.report_id, kind: asset.kind, status: asset.status }
    if (asset.status === 'unavailable') view.error = 'This media was not retained. Review the captured text and any supplied evidence.'
    if (asset.status === 'pending') view.error = 'The private evidence copy is still pending. Retry loading reported media.'
    if (asset.status === 'ready' && asset.provider === 'storage') {
      const signed = await client.storage.from(CAPTURE_BUCKET).createSignedUrl(asset.storage_path, MODERATION_MEDIA_URL_SECONDS, asset.kind === 'file' ? { download: true } : undefined)
      if (signed.error || !signed.data?.signedUrl) throw new Error('Evidence access could not be confirmed')
      view.url = signed.data.signedUrl
      view.contentType = asset.source_content_type ?? 'application/octet-stream'
    } else if (asset.status === 'ready' && asset.provider === 'bunny') {
      view.url = await signBunny(asset.library_id!, asset.asset_id!)
      view.contentType = 'application/x-bunny-player'
    }
    result.push(view)
  }
  return result
}
