import { resolveUploadMimeType } from './uploadLimits'

export type ComposerFileKind = 'image' | 'video' | 'file'

export const MAX_STAGED_ATTACHMENTS = 3

export function classifyComposerFile(file: File): { kind: ComposerFileKind; mimeType: string } {
  const mimeType = resolveUploadMimeType(file)
  return {
    kind: mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'file',
    mimeType,
  }
}

// Keep image captions as text for legacy readers; file/video content retains
// its existing metadata shape with an optional caption added to that object.
export function buildAttachmentMessageContent(file: File, caption = ''): string {
  const { kind, mimeType } = classifyComposerFile(file)
  const text = caption.trim()
  if (kind === 'image') return text
  return JSON.stringify({
    name: file.name,
    size: file.size,
    type: mimeType,
    ...(text ? { caption: text } : {}),
  })
}

export function extractComposerFiles(data: DataTransfer): File[] {
  // Browsers commonly expose the same clipboard file in both collections.
  const files = Array.from(data.files ?? [])
  if (files.length > 0) return files
  return Array.from(data.items ?? [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)
}

export const extractClipboardFiles = extractComposerFiles
export const extractDroppedFiles = extractComposerFiles
