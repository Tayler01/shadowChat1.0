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

/** A browser may advertise a clipboard file while withholding its File bytes. */
export function hasClipboardFileIntent(data: DataTransfer): boolean {
  const mediaType = (type: string) => /^(?:image|video|audio)\//i.test(type)
  return Array.from(data.types ?? []).some(type => type.toLowerCase() === 'files' || mediaType(type)) ||
    Array.from(data.items ?? []).some(item => item.kind === 'file' || mediaType(item.type))
}

export function clipboardHasNoReadableContent(data: DataTransfer): boolean {
  // WKWebView can declare text formats/items while withholding every value
  // for a Photos movie. Format declarations are not readable clipboard bytes.
  // Preserve real plain text, rich text and URLs, including whitespace.
  return !['text/plain', 'text/html', 'text/uri-list'].some(type => data.getData?.(type))
}

export const extractClipboardFiles = extractComposerFiles
export const extractDroppedFiles = extractComposerFiles
