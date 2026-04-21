import React from 'react'
import { FileText } from 'lucide-react'
import { formatBytes } from '../../lib/utils'

interface FileAttachmentProps {
  url: string
  meta?: string
}

export const FileAttachment: React.FC<FileAttachmentProps> = ({ url, meta }) => {
  let name = 'file'
  let size = 0
  let type = ''
  try {
    const parsed = meta ? JSON.parse(meta) : {}
    name = parsed.name || name
    size = parsed.size || size
    type = parsed.type || type
  } catch {
    // ignore
  }

  const previewDocument = type === 'application/pdf' || type.startsWith('text/')
  const previewAudio = type.startsWith('audio/')

  return (
    <div className="mt-1 max-w-xs">
      {previewDocument && (
        <iframe
          src={url}
          title={name}
          className="mb-2 h-48 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)]"
        />
      )}
      {previewAudio && (
        <audio controls src={url} className="w-full mt-1 mb-2" />
      )}
      <div className="glass-panel flex items-center space-x-2 rounded-[var(--radius-md)] px-3 py-2">
        <FileText className="h-4 w-4 flex-shrink-0 text-[var(--text-gold)]" />
        <a href={url} download className="break-all text-[var(--text-gold)] underline decoration-[rgba(215,170,70,0.45)] underline-offset-2">
          {name}
        </a>
        {size > 0 && (
          <span className="text-xs text-[var(--text-muted)]">({formatBytes(size)})</span>
        )}
        {!previewDocument && !previewAudio && type && (
          <span className="text-xs text-[var(--text-muted)]">{type}</span>
        )}
      </div>
    </div>
  )
}
