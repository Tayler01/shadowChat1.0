import { parseMemberMediaUrl } from './member-media.ts'
import { parseManagedBunnySource, type BunnyAccessConfig } from './bunny-media-access.ts'
import { signBunnyPrivateMedia } from './bunny-private-media.ts'

export class NotificationMediaAccessDeniedError extends Error {
  constructor() { super('Notification target or media preference is no longer available.'); this.name = 'NotificationMediaAccessDeniedError' }
}
export const shouldIncludeNotificationMedia = (preferences: { notification_preview_mode?: unknown; notification_media_enabled?: unknown } | null | undefined) =>
  preferences?.notification_preview_mode === 'full' && preferences.notification_media_enabled !== false

export const NOTIFICATION_STORAGE_MEDIA_TTL_SECONDS = 600
export type NotificationMediaClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
  storage: { from(bucket: string): { createSignedUrl(path: string, expiresIn: number, options?: { transform?: { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' } }): Promise<{ data: { signedUrl: string } | null; error: unknown }> } }
}
type AuthorizedPin = { id: string; creator_id: string; title: string; thumbnail_url: string | null; image_content_type: string | null; provider: string | null; provider_asset_id: string | null }
export type NotificationMediaSigningConfig = { projectUrl: string; bunny: BunnyAccessConfig }
const pictureFile = /\.(?:jpg|jpeg|png|webp|gif|avif)$/i

/** Sign only fresh canonical references for this recipient/event. URLs are delivery-only,
 * never persisted into canonical notification rows. Expiry cannot erase OS/provider caches.
 */
export async function getPrivateNotificationPinMedia(
  client: NotificationMediaClient,
  request: { eventId: string; userId: string; imageId?: string; includeMedia?: boolean },
  config: NotificationMediaSigningConfig,
) {
  const authorized = await client.rpc('get_notification_pin_media_for_service', {
    target_event_id: request.eventId, target_user_id: request.userId, target_image_id: request.imageId ?? null,
  })
  if (authorized.error) throw new Error('Notification media authorization is unavailable.')
  const pin = (Array.isArray(authorized.data) ? authorized.data[0] : null) as AuthorizedPin | null
  if (!pin || (request.imageId && pin.id !== request.imageId) || !pin.creator_id) throw new NotificationMediaAccessDeniedError()
  if (request.includeMedia === false || !pin.thumbnail_url) return null
  let source: URL
  try { source = new URL(pin.thumbnail_url) } catch { return null }
  if (source.protocol !== 'https:' || source.username || source.password) return null
  const storage = parseMemberMediaUrl(source.toString(), config.projectUrl)
  if (!storage && source.origin === new URL(config.projectUrl).origin
    && source.pathname.startsWith('/storage/v1/')
    && !/^\/storage\/v1\/object\/public\/(?:avatars|banners)\//.test(source.pathname)) return null
  let thumbnailUrl = source.toString()
  if (storage) {
    const ownPath = storage.path.startsWith(`${pin.creator_id}/`)
    const canonicalDerivative = storage.bucket === 'shadow-pin' && new Set([
      `derivatives/images/${pin.id}/thumbnail.webp`, `derivatives/images/${pin.id}/medium.webp`,
    ]).has(storage.path)
    // A writable Pin URL does not itself authorize signing another member's bytes.
    if (!ownPath && !canonicalDerivative) return null
    const transform: { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' } = {}
    for (const name of ['width','height','quality'] as const) {
      const raw=source.searchParams.get(name)
      if (!raw) continue
      const value=Number(raw)
      if (!Number.isInteger(value) || value<1 || value>(name==='quality'?100:2500)) return null
      transform[name]=value
    }
    const resize=source.searchParams.get('resize')
    if (resize && !['cover','contain','fill'].includes(resize)) return null
    if (resize) transform.resize=resize as 'cover' | 'contain' | 'fill'
    const signed=await client.storage.from(storage.bucket).createSignedUrl(storage.path,NOTIFICATION_STORAGE_MEDIA_TTL_SECONDS,
      Object.keys(transform).length?{transform}:undefined)
    if (signed.error || !signed.data?.signedUrl) throw new Error('Notification image signing is unavailable.')
    thumbnailUrl=signed.data.signedUrl
  } else if (pin.provider === 'bunny_stream' || source.origin === config.bunny.pullZoneUrl.replace(/\/$/, '') || ['player.mediadelivery.net','iframe.mediadelivery.net'].includes(source.hostname)) {
    if (pin.provider !== 'bunny_stream') return null
    const target=parseManagedBunnySource(source.toString(),config.bunny)
    if (!target || target.kind!=='cdn' || !pictureFile.test(target.fileName) || target.assetId!==pin.provider_asset_id?.toLowerCase()) return null
    const trusted=await client.rpc('get_trusted_bunny_media_asset', {
      target_source_type:'shadow_pin_image',target_source_id:pin.id,target_asset_id:target.assetId,
    })
    if (trusted.error) throw new Error('Notification video provenance is unavailable.')
    if (!Array.isArray(trusted.data) || !trusted.data.some(row=>row.library_id===config.bunny.libraryId && row.asset_id===target.assetId && row.owner_id===pin.creator_id)) return null
    thumbnailUrl=(await signBunnyPrivateMedia({...config.bunny,videoId:target.assetId},{kind:'cdn',fileName:target.fileName})).url
  }
  return { kind: pin.image_content_type?.startsWith('video/') ? 'video' as const : 'image' as const, thumbnailUrl, alt:pin.title || 'ShadowPin' }
}
