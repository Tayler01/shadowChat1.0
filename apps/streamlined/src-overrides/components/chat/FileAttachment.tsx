import React from 'react'
import { FileText } from 'lucide-react'
import { formatBytes } from '../../../../../src/lib/utils'
import { usePrivateMediaUrl } from '../../../../../src/hooks/usePrivateMediaUrl'
import { PrivateMediaAudio } from '../../../../../src/components/ui/PrivateMediaPlayer'

interface FileAttachmentProps {
  url: string
  meta?: string
}

const safeAttachmentUrl = (value?: string) => {
  try {
    const parsed = new URL(value || '')
    const isWebUrl = parsed.protocol === 'https:' || parsed.protocol === 'http:'
    const isLocalBlob = parsed.protocol === 'blob:' && typeof window !== 'undefined' && parsed.origin === window.location.origin
    if ((isWebUrl || isLocalBlob) && !parsed.username && !parsed.password) return parsed.toString()
  } catch {
    // Do not put executable or malformed message URLs in browsing contexts.
  }
  return undefined
}

export const FileAttachment: React.FC<FileAttachmentProps> = ({ url, meta }) => {
  const originalUrl = safeAttachmentUrl(url)
  const authorizedUrl = usePrivateMediaUrl(originalUrl)
  let name = 'file'
  let size = 0
  let type = ''
  try {
    const parsed = meta ? JSON.parse(meta) : {}
    if (typeof parsed?.name === 'string' && parsed.name.trim()) name = parsed.name
    if (typeof parsed?.size === 'number' && Number.isFinite(parsed.size) && parsed.size > 0) size = parsed.size
    if (typeof parsed?.type === 'string') type = parsed.type.toLowerCase().split(';', 1)[0].trim()
  } catch {
    // ignore
  }

  const previewDocument = type === 'application/pdf'
  const previewText = type.startsWith('text/')
  const previewAudio = type.startsWith('audio/')
  const safeUrl = safeAttachmentUrl(authorizedUrl)

  return (
    <div className="mt-1 max-w-xs">
      {previewDocument && safeUrl && (
        <iframe
          src={safeUrl}
          title={name}
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          loading="lazy"
          className="mb-2 h-48 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)]"
        />
      )}
      {previewText && (
        <div className="mb-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          Text files open cleanly from the attachment link below.
        </div>
      )}
      {previewAudio && originalUrl && (
        <PrivateMediaAudio controls src={originalUrl} className="w-full mt-1 mb-2" />
      )}
      <div className="glass-panel flex items-center space-x-2 rounded-[var(--radius-md)] px-3 py-2">
        <FileText className="h-4 w-4 flex-shrink-0 text-[var(--text-gold)]" />
        {safeUrl ? (
          <a href={safeUrl} download target="_blank" rel="noopener noreferrer" className="break-all text-[var(--text-gold)] underline decoration-[rgba(215,170,70,0.45)] underline-offset-2">
            {name}
          </a>
        ) : (
          <span className="break-all text-[var(--text-muted)]">{name} (unavailable attachment)</span>
        )}
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
