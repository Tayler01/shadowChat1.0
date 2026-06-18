import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Play } from 'lucide-react'
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

interface RecognitionMessageCard {
  displayName: string
  username?: string | null
  avatarUrl?: string | null
  avatarThumbnailUrl?: string | null
  bannerUrl?: string | null
  bannerThumbnailUrl?: string | null
  profileColor?: string | null
  featureTitle?: string | null
  submissionTitle?: string | null
}

const RECOGNITION_CARD_PREFIX = '[[shadowchat-recognition-card:'
const RECOGNITION_CARD_PATTERN = /^\[\[shadowchat-recognition-card:([A-Za-z0-9%_.!~*'()-]+)\]\]\s*/

const normalizeRecognitionText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

const normalizeRecognitionUrl = (value: unknown) => {
  const text = normalizeRecognitionText(value, 2048)
  if (!text) return ''
  try {
    const url = new URL(text)
    return url.protocol === 'https:' || url.protocol === 'http:' ? text : ''
  } catch {
    return ''
  }
}

const extractRecognitionMessageCard = (content: string): {
  card: RecognitionMessageCard | null
  text: string
} => {
  if (!content.startsWith(RECOGNITION_CARD_PREFIX)) {
    return { card: null, text: content }
  }

  const match = content.match(RECOGNITION_CARD_PATTERN)
  if (!match) {
    return { card: null, text: content }
  }

  try {
    const raw = JSON.parse(decodeURIComponent(match[1])) as Record<string, unknown>
    const displayName = normalizeRecognitionText(raw.displayName, 80)
    if (!displayName) {
      return { card: null, text: content.slice(match[0].length) }
    }

    return {
      card: {
        displayName,
        username: normalizeRecognitionText(raw.username, 40) || null,
        avatarUrl: normalizeRecognitionUrl(raw.avatarUrl) || null,
        avatarThumbnailUrl: normalizeRecognitionUrl(raw.avatarThumbnailUrl) || null,
        bannerUrl: normalizeRecognitionUrl(raw.bannerUrl) || null,
        bannerThumbnailUrl: normalizeRecognitionUrl(raw.bannerThumbnailUrl) || null,
        profileColor: normalizeRecognitionText(raw.profileColor, 40) || null,
        featureTitle: normalizeRecognitionText(raw.featureTitle, 140) || null,
        submissionTitle: normalizeRecognitionText(raw.submissionTitle, 140) || null,
      },
      text: content.slice(match[0].length),
    }
  } catch {
    return { card: null, text: content }
  }
}

const getRecognitionInitials = (displayName: string) =>
  displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || displayName[0]?.toUpperCase() || 'S'

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
  const [imageLoadFailed, setImageLoadFailed] = useState(false)

  useEffect(() => {
    setImageLoadFailed(false)
  }, [preview.image])

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block max-w-xl overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] text-left shadow-[var(--shadow-panel)] transition-colors hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.055)]"
      aria-label={`Open link preview for ${preview.title || host}`}
    >
      {preview.image && (
        <div className="relative aspect-[1.91/1] w-full overflow-hidden border-b border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)]">
          {imageLoadFailed ? (
            <div
              className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(215,170,70,0.12),rgba(5,6,8,0.9))] text-[rgba(255,240,184,0.72)]"
              aria-label={`${preview.title || host} preview image unavailable`}
            >
              <ExternalLink className="h-5 w-5" aria-hidden="true" />
            </div>
          ) : (
            <img
              src={preview.image}
              alt={preview.title ? `${preview.title} preview image` : `${host} preview image`}
              width={1200}
              height={630}
              loading="lazy"
              decoding="async"
              onError={() => setImageLoadFailed(true)}
              className="h-full w-full object-cover"
            />
          )}
          {preview.mediaType === 'video' && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,240,184,0.42)] bg-[rgba(0,0,0,0.62)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(255,240,184)] shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
              <Play className="h-3 w-3 fill-current" />
              Video
            </span>
          )}
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

const RecognitionPostCard: React.FC<{ card: RecognitionMessageCard }> = ({ card }) => {
  const bannerSrc = card.bannerThumbnailUrl || card.bannerUrl || ''
  const avatarSrc = card.avatarThumbnailUrl || card.avatarUrl || ''
  const username = card.username ? `@${card.username.replace(/^@/, '')}` : ''
  const accentStyle = card.profileColor
    ? { '--recognition-profile-color': card.profileColor } as React.CSSProperties
    : undefined

  return (
    <section
      className="mb-3 overflow-hidden rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.24)] bg-[rgba(255,255,255,0.04)] shadow-[var(--shadow-panel)]"
      data-testid="recognition-message-card"
      style={accentStyle}
    >
      <div className="relative h-24 overflow-hidden bg-[linear-gradient(135deg,rgba(215,170,70,0.2),rgba(6,7,9,0.92))] sm:h-28">
        {bannerSrc ? (
          <img
            src={bannerSrc}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover"
            data-testid="recognition-message-banner"
          />
        ) : (
          <div className="h-full w-full bg-[linear-gradient(135deg,var(--recognition-profile-color,rgba(215,170,70,0.34)),rgba(6,7,9,0.92))]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.56))]" />
      </div>
      <div className="relative px-3 pb-3 pt-0">
        <div className="-mt-8 flex items-end gap-3">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[rgba(255,240,184,0.52)] bg-[rgba(6,7,9,0.92)] text-lg font-semibold text-[var(--text-gold)] shadow-[0_12px_28px_rgba(0,0,0,0.42)] ring-2 ring-[rgba(6,7,9,0.88)]"
            style={card.profileColor ? { backgroundColor: card.profileColor } : undefined}
          >
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={`${card.displayName} profile picture`}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
                data-testid="recognition-message-avatar"
              />
            ) : (
              <span>{getRecognitionInitials(card.displayName)}</span>
            )}
          </div>
          <div className="min-w-0 pb-1">
            <p className="truncate text-base font-semibold leading-tight text-[var(--text-primary)]">{card.displayName}</p>
            {username && <p className="truncate text-xs font-medium text-[var(--theme-accent-readable)]">{username}</p>}
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Community request shipped</p>
          {card.featureTitle && (
            <p className="text-sm font-semibold leading-snug text-[var(--text-primary)]">{card.featureTitle}</p>
          )}
          {card.submissionTitle && (
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">Submitted: {card.submissionTitle}</p>
          )}
        </div>
      </div>
    </section>
  )
}

export const MessageRichText: React.FC<MessageRichTextProps> = ({
  content,
  className,
  showPreview = true,
}) => {
  const recognitionMessage = useMemo(() => extractRecognitionMessageCard(content), [content])
  const displayContent = recognitionMessage.text
  const parts = useMemo(() => tokenizeMessageText(displayContent), [displayContent])
  const firstUrl = useMemo(() => extractFirstMessageUrl(displayContent), [displayContent])
  const containerRef = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [shouldFetchPreview, setShouldFetchPreview] = useState(false)

  useEffect(() => {
    setPreview(null)
    setShouldFetchPreview(false)

    if (!showPreview || !firstUrl) {
      return
    }

    if (typeof IntersectionObserver === 'undefined') {
      setShouldFetchPreview(true)
      return
    }

    const element = containerRef.current
    if (!element) {
      setShouldFetchPreview(true)
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setShouldFetchPreview(true)
          observer.disconnect()
        }
      },
      { rootMargin: '600px 0px' }
    )

    observer.observe(element)
    const fallbackTimer = window.setTimeout(() => {
      setShouldFetchPreview(true)
      observer.disconnect()
    }, 1500)

    return () => {
      window.clearTimeout(fallbackTimer)
      observer.disconnect()
    }
  }, [firstUrl, showPreview])

  useEffect(() => {
    let cancelled = false

    if (!showPreview || !firstUrl || !shouldFetchPreview) {
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
  }, [firstUrl, shouldFetchPreview, showPreview])

  return (
    <div ref={containerRef} className={cn('min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]', className)}>
      {recognitionMessage.card && <RecognitionPostCard card={recognitionMessage.card} />}
      {displayContent && (
        <span className="break-words [overflow-wrap:anywhere]">
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
                className="break-words font-medium text-[var(--text-gold)] underline decoration-[rgba(241,211,138,0.42)] underline-offset-2 transition-colors [overflow-wrap:anywhere] hover:text-[var(--gold-5)]"
              >
                {part.text}
              </a>
            )
          })}
        </span>
      )}
      {preview && <LinkPreviewCard preview={preview} />}
    </div>
  )
}
