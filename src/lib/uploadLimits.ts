const MEBIBYTE = 1024 * 1024

export const AVATAR_UPLOAD_MAX_BYTES = 10 * MEBIBYTE
export const BANNER_UPLOAD_MAX_BYTES = 25 * MEBIBYTE
export const MESSAGE_MEDIA_UPLOAD_MAX_BYTES = 10 * MEBIBYTE
export const CHAT_UPLOAD_MAX_BYTES = 64 * MEBIBYTE
export const VOICE_RECORDING_MAX_SECONDS = 120

export const PROFILE_IMAGE_MIME_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const MESSAGE_MEDIA_MIME_TYPES = [
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const CHAT_IMAGE_MIME_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
] as const

export const CHAT_UPLOAD_MIME_TYPES = [
  ...CHAT_IMAGE_MIME_TYPES,
  'video/mp4',
  'video/mpeg',
  'video/ogg',
  'video/quicktime',
  'video/webm',
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'text/csv',
  'text/markdown',
  'text/plain',
  'application/json',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

export interface UploadRule {
  maxBytes: number
  mimeTypes: readonly string[]
  label: string
  supportedTypesDescription: string
}

export const AVATAR_UPLOAD_RULE: UploadRule = {
  maxBytes: AVATAR_UPLOAD_MAX_BYTES,
  mimeTypes: PROFILE_IMAGE_MIME_TYPES,
  label: 'Avatar',
  supportedTypesDescription: 'JPEG, PNG, WebP, GIF, or AVIF image',
}

export const BANNER_UPLOAD_RULE: UploadRule = {
  maxBytes: BANNER_UPLOAD_MAX_BYTES,
  mimeTypes: PROFILE_IMAGE_MIME_TYPES,
  label: 'Banner',
  supportedTypesDescription: 'JPEG, PNG, WebP, GIF, or AVIF image',
}

export const VOICE_UPLOAD_RULE: UploadRule = {
  maxBytes: MESSAGE_MEDIA_UPLOAD_MAX_BYTES,
  mimeTypes: MESSAGE_MEDIA_MIME_TYPES.filter(type => type.startsWith('audio/')),
  label: 'Voice message',
  supportedTypesDescription: 'AAC, MP4, MP3, OGG, WAV, or WebM audio',
}

export const CHAT_IMAGE_UPLOAD_RULE: UploadRule = {
  maxBytes: CHAT_UPLOAD_MAX_BYTES,
  mimeTypes: CHAT_IMAGE_MIME_TYPES,
  label: 'Image',
  supportedTypesDescription: 'JPEG, PNG, WebP, GIF, AVIF, or SVG image',
}

export const CHAT_FILE_UPLOAD_RULE: UploadRule = {
  maxBytes: CHAT_UPLOAD_MAX_BYTES,
  mimeTypes: CHAT_UPLOAD_MIME_TYPES,
  label: 'Attachment',
  supportedTypesDescription: 'supported image, video, audio, text, PDF, Office, JSON, or ZIP file',
}

const EXTENSION_MIME_TYPES: Record<string, string> = {
  aac: 'audio/aac',
  avif: 'image/avif',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  m4a: 'audio/mp4',
  md: 'text/markdown',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

export const normalizeMimeType = (mimeType?: string | null) =>
  (mimeType || '').split(';', 1)[0].trim().toLowerCase()

export const resolveUploadMimeType = (file: Pick<File, 'name' | 'type'>) => {
  const declaredType = normalizeMimeType(file.type)
  if (declaredType) return declaredType

  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  return EXTENSION_MIME_TYPES[extension] || ''
}

const formatMebibytes = (bytes: number) => `${Math.round(bytes / MEBIBYTE)} MiB`

export const validateUpload = (
  value: Pick<Blob, 'size' | 'type'> & Partial<Pick<File, 'name'>>,
  rule: UploadRule
) => {
  const mimeType = 'name' in value
    ? resolveUploadMimeType({ name: value.name || '', type: value.type })
    : normalizeMimeType(value.type)

  if (!mimeType || !rule.mimeTypes.includes(mimeType)) {
    throw new UploadValidationError(
      `${rule.label} must be a ${rule.supportedTypesDescription}.`
    )
  }

  if (value.size > rule.maxBytes) {
    throw new UploadValidationError(
      `${rule.label} is too large. The maximum size is ${formatMebibytes(rule.maxBytes)}.`
    )
  }

  return mimeType
}

export const getUploadErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof UploadValidationError) return error.message
  const message = error instanceof Error ? error.message.trim() : ''
  const normalized = message.toLowerCase()
  if (normalized.includes('maximum') || normalized.includes('too large')) {
    return message || 'This file is too large to upload.'
  }
  if (
    normalized.includes('network') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout') ||
    normalized.includes('connection')
  ) {
    return 'The upload was interrupted. Check your connection and try again.'
  }
  if (
    normalized.includes('jwt') ||
    normalized.includes('not authenticated') ||
    normalized.includes('unauthorized')
  ) {
    return 'Your session needs to be refreshed. Reopen ShadowChat and try the upload again.'
  }
  if (normalized.includes('row-level security') || normalized.includes('forbidden')) {
    return 'ShadowChat could not authorize this upload. Refresh the app and try again.'
  }
  return fallback
}

export const sanitizeUploadFileName = (name: string, fallback = 'attachment') => {
  const leafName = name.split(/[\\/]/).pop() || ''
  const normalized = leafName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  const lastDot = normalized.lastIndexOf('.')
  const rawExtension = lastDot > 0 ? normalized.slice(lastDot + 1) : ''
  const extension = rawExtension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12)
  const rawBase = lastDot > 0 ? normalized.slice(0, lastDot) : normalized
  const base = rawBase
    .split('')
    .filter(character => {
      const codePoint = character.charCodeAt(0)
      return codePoint >= 32 && codePoint !== 127
    })
    .join('')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
  const suffix = extension ? `.${extension}` : ''
  const maxBaseLength = Math.max(1, 120 - suffix.length)
  const safeBase = base.slice(0, maxBaseLength) || fallback
  return `${safeBase}${suffix}`
}
