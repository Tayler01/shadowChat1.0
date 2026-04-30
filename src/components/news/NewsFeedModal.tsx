import React from 'react'
import { Copy, ExternalLink, Play, Share2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import { NewsReactionBar } from './NewsReactionBar'
import { formatTime } from '../../lib/utils'
import type { NewsFeedItem } from '../../lib/supabase'

const getSourceLabel = (item: NewsFeedItem) =>
  item.platform === 'x' ? 'X' : 'Truth Social'

export function NewsFeedModal({
  item,
  onClose,
  onReact,
}: {
  item: NewsFeedItem | null
  onClose: () => void
  onReact: (itemId: string, emoji: string) => void | Promise<void>
}) {
  if (!item) return null

  const primaryMedia = item.media?.[0]
  const sourceLabel = getSourceLabel(item)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(item.source_url)
      toast.success('Link copied')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const shareLink = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: item.headline,
          text: item.body_text || item.headline,
          url: item.source_url,
        })
        return
      }

      await copyLink()
    } catch {
      // Native share can be cancelled by the user; no toast needed.
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/72 p-3 backdrop-blur-md sm:p-5" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(20,22,23,0.98),rgba(9,10,11,0.99))] shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-panel)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {sourceLabel} / @{item.author_handle}
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-[var(--text-primary)] sm:text-lg">
              {item.author_display_name || item.author_handle}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={copyLink} aria-label="Copy original link">
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void shareLink()} aria-label="Share original link">
              <Share2 className="h-4 w-4" />
            </Button>
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] border border-transparent px-3 text-sm text-[var(--text-secondary)] transition-colors hover:border-[rgba(215,170,70,0.16)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
              aria-label="Open original post"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close news item">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full gap-5 p-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.75fr)] lg:p-6">
            <article className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 uppercase tracking-[0.14em]">
                  {item.post_kind}
                </span>
                <span>{item.posted_at ? `${formatTime(item.posted_at)} posted` : `${formatTime(item.detected_at)} detected`}</span>
              </div>
              <h1 className="text-2xl font-semibold leading-tight text-[var(--text-primary)] sm:text-3xl">
                {item.headline}
              </h1>
              {item.body_text && (
                <p className="mt-5 whitespace-pre-wrap text-base leading-8 text-[var(--text-secondary)]">
                  {item.body_text}
                </p>
              )}
              <div className="mt-6">
                <NewsReactionBar
                  reactions={item.reactions}
                  onReact={emoji => onReact(item.id, emoji)}
                />
              </div>
            </article>

            <aside className="min-w-0 space-y-4">
              {primaryMedia ? (
                <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)]">
                  <div className="relative aspect-[4/3] bg-black/30">
                    <img
                      src={primaryMedia.thumbnail_url || primaryMedia.url}
                      alt={primaryMedia.alt || item.headline}
                      className="h-full w-full object-cover"
                    />
                    {primaryMedia.type === 'video' && (
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,240,184,0.42)] bg-[rgba(0,0,0,0.62)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(255,240,184)]">
                        <Play className="h-3 w-3 fill-current" />
                        Video
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-5 text-sm text-[var(--text-muted)]">
                  No media attached.
                </div>
              )}

              {item.media?.length > 1 && (
                <div className="grid grid-cols-3 gap-2">
                  {item.media.slice(1, 7).map((media, index) => (
                    <a
                      key={`${media.url}-${index}`}
                      href={media.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)]"
                    >
                      <img src={media.thumbnail_url || media.url} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
