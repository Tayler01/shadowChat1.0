import type { ChatMessageType, HypeUserSummary } from '../../lib/supabase'
import { getSupabaseImageTransformUrl } from '../../lib/storageImageTransforms'

export type ChatMediaOrientation = 'portrait' | 'square' | 'landscape'

export type ReplyTarget = {
  id: string
  content: string
  messageType?: ChatMessageType
  fileUrl?: string | null
  thumbnailUrl?: string | null
  authorName?: string | null
  hypeCount?: number
  hypeUsers?: HypeUserSummary[]
}

export type MessagePreviewSource = {
  id: string
  content?: string | null
  message_type: ChatMessageType
  file_url?: string | null
  thumbnail_url?: string | null
  user?: { display_name?: string | null; username?: string | null } | null
  sender?: { display_name?: string | null; username?: string | null } | null
  hype_count?: number | null
  hype_users?: HypeUserSummary[] | null
}

export const CHAT_MEDIA_INTRINSIC_WIDTH = 1080
export const CHAT_MEDIA_INTRINSIC_HEIGHT = 1920

export const CHAT_MEDIA_ASPECT_CLASSES: Record<ChatMediaOrientation, string> = {
  portrait: 'aspect-[9/16]',
  square: 'aspect-square',
  landscape: 'aspect-video',
}

const IMAGE_THUMBNAIL_DISPLAY_WIDTH = 480
const IMAGE_THUMBNAIL_DISPLAY_HEIGHT = 854

export const getChatMediaOrientation = (
  width?: number | null,
  height?: number | null
): ChatMediaOrientation => {
  if (!width || !height || width <= 0 || height <= 0) {
    return 'portrait'
  }

  const ratio = width / height
  if (ratio >= 1.18) return 'landscape'
  if (ratio >= 0.82) return 'square'
  return 'portrait'
}

export const getChatMediaAspectClass = (orientation: ChatMediaOrientation) =>
  CHAT_MEDIA_ASPECT_CLASSES[orientation]

export const getImageMessageDisplaySrc = (
  fileUrl?: string | null,
  thumbnailUrl?: string | null
) => {
  if (thumbnailUrl) return thumbnailUrl
  if (!fileUrl) return ''

  return getSupabaseImageTransformUrl(fileUrl, {
    width: IMAGE_THUMBNAIL_DISPLAY_WIDTH,
    height: IMAGE_THUMBNAIL_DISPLAY_HEIGHT,
    resize: 'contain',
    quality: 76,
  })
}

const parseAttachmentName = (content?: string | null) => {
  if (!content) return null

  try {
    const parsed = JSON.parse(content)
    return typeof parsed?.name === 'string' && parsed.name.trim()
      ? parsed.name.trim()
      : null
  } catch {
    return null
  }
}

export const getMessagePreviewText = (message: MessagePreviewSource) => {
  const text = message.content?.trim()

  if (message.message_type === 'image') return text || 'Image'
  if (message.message_type === 'video') return 'Video'
  if (message.message_type === 'audio') return 'Voice message'
  if (message.message_type === 'file') return parseAttachmentName(text) || text || 'File attachment'
  if (message.message_type === 'hype') return 'Hype'

  return text || message.message_type
}

export const messageToReplyTarget = (message: MessagePreviewSource): ReplyTarget => ({
  id: message.id,
  content: getMessagePreviewText(message),
  messageType: message.message_type,
  fileUrl: message.file_url ?? null,
  thumbnailUrl: message.thumbnail_url ?? null,
  authorName:
    message.user?.display_name ||
    message.user?.username ||
    message.sender?.display_name ||
    message.sender?.username ||
    null,
  hypeCount: message.hype_count ?? 0,
  hypeUsers: message.hype_users ?? [],
})
