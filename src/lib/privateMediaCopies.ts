import { VITE_SUPABASE_URL } from './env'
import { getWorkingClient } from './supabase'
import { parsePrivateMediaUrl, PRIVATE_MEDIA_ENABLED } from './privateMediaUrls'

type MessageMedia = { content: string; fileUrl?: string; thumbnailUrl?: string | null }
type CopyRequest = MessageMedia & { senderId: string; clientMessageId: string; messageType: string }
const validId = /^[a-zA-Z0-9_-]{1,128}$/

const durableUrl = (bucket: string, path: string) =>
  `${new URL(VITE_SUPABASE_URL).origin}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`

/** Storage.copy checks the caller's SELECT on the source and INSERT on the destination.
 * A visible row referencing somebody else's path must never itself grant source access.
 * Copies are independent uploads, so deleting/hiding the original Pin preserves a share.
 */
const preparePrivateMessageMedia = async (request: CopyRequest): Promise<MessageMedia> => {
  if (!validId.test(request.senderId) || !validId.test(request.clientMessageId)) {
    throw new Error('The attachment could not be prepared for this message.')
  }
  const sources = [request.fileUrl, request.thumbnailUrl, request.messageType === 'audio' ? request.content : undefined]
  if (!sources.some(source => source && parsePrivateMediaUrl(source))) {
    return { content: request.content, fileUrl: request.fileUrl, thumbnailUrl: request.thumbnailUrl }
  }
  const client = await getWorkingClient()
  const { data, error } = await client.auth.getSession()
  const session = data.session
  if (error || session?.user.id !== request.senderId || !session.access_token ||
    (session.expires_at && session.expires_at * 1000 <= Date.now())) {
    throw new Error('Sign in again before sharing this attachment.')
  }
  const copies = new Map<string, string>()
  const copy = async (source: string | null | undefined) => {
    if (!source) return source
    const target = parsePrivateMediaUrl(source)
    if (!target) return source
    if (target.bucket !== 'shadow-pin' && target.path.startsWith(`${request.senderId}/`)) {
      return durableUrl(target.bucket, target.path)
    }
    const sourceKey = `${target.bucket}/${target.path}`
    if (copies.has(sourceKey)) return copies.get(sourceKey)!
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceKey))
    const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
    const extension = target.path.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1] || 'bin'
    const destination = `${request.senderId}/forwarded/${request.clientMessageId}/${hash}.${extension}`
    const { error: copyError } = await client.storage.from(target.bucket).copy(target.path, destination, {
      destinationBucket: 'chat-uploads',
    })
    if (copyError) {
      // A deterministic destination makes interrupted sends retryable without duplicate objects.
      // Only a confirmed already-owned destination can recover a duplicate-copy response.
      if (Number((copyError as { statusCode?: string; status?: number }).statusCode ??
        (copyError as { status?: number }).status) !== 409) throw copyError
      const existing = await client.storage.from('chat-uploads').info(destination)
      if (existing.error || !existing.data) throw copyError
    }
    const url = durableUrl('chat-uploads', destination)
    copies.set(sourceKey, url)
    return url
  }
  const fileUrl = await copy(request.fileUrl)
  const thumbnailUrl = await copy(request.thumbnailUrl)
  const content = request.messageType === 'audio' ? await copy(request.content) : request.content
  const current = await client.auth.getSession()
  if (current.error || current.data.session?.user.id !== request.senderId ||
    current.data.session.access_token !== session.access_token) {
    throw new Error('The account changed while preparing this attachment.')
  }
  return { content: content!, fileUrl: fileUrl ?? undefined, thumbnailUrl }
}

// Literal build gating keeps the public-media edition's existing runtime and bundle cost.
export const prepareMessageMedia = PRIVATE_MEDIA_ENABLED
  ? preparePrivateMessageMedia
  : async ({ content, fileUrl, thumbnailUrl }: CopyRequest): Promise<MessageMedia> => ({ content, fileUrl, thumbnailUrl })
