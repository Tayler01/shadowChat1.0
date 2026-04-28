import React, { useEffect, useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import {
  extractFirstMessageUrl,
  fetchLinkPreview,
  tokenizeMessageText,
  type LinkPreview,
} from '../../lib/linkPreview'
import { cn } from '../../lib/utils'

interface MessageRichTextProps {
  content: string
  className?: string
  showPreview?: boolean
}

const getHostLabel = (preview: LinkPreview) => {
  const source = preview.canonicalUrl || preview.url
  try {
    return new URL(source).hostname.replace(/^www\./i, '')
  } catch {
    return preview.provider || preview.siteName || 'link'
  }
}

const LinkPreviewCard: React.FC<{ preview: LinkPreview }> = ({ preview }) => {
  const href = preview.canonicalUrl || preview.url
  const host = getHostLabel(preview)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block max-w-xl overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] text-left shadow-[var(--shadow-panel)] transition-colors hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.055)]"
      aria-label={`Open link preview for ${preview.title || host}`}
    >
      {preview.image && (
        <div className="aspect-[1.91/1] w-full overflow-hidden border-b border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)]">
          <img
            src={preview.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="space-y-1.5 p-3">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <ExternalLink className="h-3 w-3" />
          <span className="truncate">{preview.siteName || preview.provider || host}</span>
        </div>
        {preview.title && (
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--text-primary)]">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="line-clamp-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            {preview.description}
          </p>
        )}
        <p className="truncate text-[11px] text-[var(--text-muted)]">{host}</p>
      </div>
    </a>
  )
}

export const MessageRichText: React.FC<MessageRichTextProps> = ({
  content,
  className,
  showPreview = true,
}) => {
  const parts = useMemo(() => tokenizeMessageText(content), [content])
  const firstUrl = useMemo(() => extractFirstMessageUrl(content), [content])
  const [preview, setPreview] = useState<LinkPreview | null>(null)

  useEffect(() => {
    let cancelled = false
    setPreview(null)

    if (!showPreview || !firstUrl) {
      return
    }

    void fetchLinkPreview(firstUrl).then(result => {
      if (!cancelled) {
        setPreview(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [firstUrl, showPreview])

  return (
    <div className={cn('whitespace-pre-wrap break-words', className)}>
      <span>
        {parts.map((part, index) => {
          if (part.type === 'text') {
            return <React.Fragment key={`${index}-text`}>{part.text}</React.Fragment>
          }

          return (
            <a
              key={`${index}-${part.href}`}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--text-gold)] underline decoration-[rgba(241,211,138,0.42)] underline-offset-2 transition-colors hover:text-[var(--gold-5)]"
            >
              {part.text}
            </a>
          )
        })}
      </span>
      {preview && <LinkPreviewCard preview={preview} />}
    </div>
  )
}
