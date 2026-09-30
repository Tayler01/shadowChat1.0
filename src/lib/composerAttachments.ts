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
