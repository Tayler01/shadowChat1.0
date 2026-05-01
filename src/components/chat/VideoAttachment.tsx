import React from 'react'
import { Film } from 'lucide-react'
import { formatBytes } from '../../lib/utils'

interface VideoAttachmentProps {
  url: string
  meta?: string
}

export const VideoAttachment: React.FC<VideoAttachmentProps> = ({ url, meta }) => {
  let name = 'video'
  let size = 0
  let type = 'video'

  try {
    const parsed = meta ? JSON.parse(meta) : {}
    name = parsed.name || name
    size = parsed.size || size
    type = parsed.type || type
  } catch {
    // ignore malformed attachment metadata
  }

  return (
    <div className="mt-1 w-[min(22rem,calc(100vw-7rem))] max-w-full space-y-2">
      <video
        controls
        playsInline
        preload="metadata"
        src={url}
        className="aspect-video w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black object-contain shadow-[var(--shadow-panel)]"
      />
      <div className="glass-panel flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm">
        <Film className="h-4 w-4 flex-shrink-0 text-[var(--text-gold)]" />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          download={name}
          className="min-w-0 flex-1 truncate text-[var(--text-gold)] underline decoration-[rgba(215,170,70,0.45)] underline-offset-2"
        >
          {name}
        </a>
        {size > 0 && (
          <span className="shrink-0 text-xs text-[var(--text-muted)]">
            {formatBytes(size)}
          </span>
        )}
        {type && <span className="sr-only">{type}</span>}
      </div>
    </div>
  )
}
