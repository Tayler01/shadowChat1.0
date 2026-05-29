import type { ChatMessageType } from '../../lib/supabase'
import { getSupabaseImageTransformUrl } from '../../lib/storageImageTransforms'

export type ReplyTarget = {
  id: string
  content: string
  messageType?: ChatMessageType
  fileUrl?: string | null
  thumbnailUrl?: string | null
  authorName?: string | null
}

export type MessagePreviewSource = {
  id: string
  content?: string | null
  message_type: ChatMessageType
  file_url?: string | null
  thumbnail_url?: string | null
  user?: { display_name?: string | null; username?: string | null } | null
  sender?: { display_name?: string | null; username?: string | null } | null
}

const IMAGE_THUMBNAIL_DISPLAY_SIZE = 420

export const getImageMessageDisplaySrc = (
  fileUrl?: string | null,
  thumbnailUrl?: string | null
) => {
  if (thumbnailUrl) return thumbnailUrl
  if (!fileUrl) return ''

  return getSupabaseImageTransformUrl(fileUrl, {
    width: IMAGE_THUMBNAIL_DISPLAY_SIZE,
    height: IMAGE_THUMBNAIL_DISPLAY_SIZE,
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
})
