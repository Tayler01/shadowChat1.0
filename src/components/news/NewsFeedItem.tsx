import React from 'react'
import { ExternalLink, Play } from 'lucide-react'
import { NewsReactionBar } from './NewsReactionBar'
import { formatTime, cn } from '../../lib/utils'
import type { NewsFeedItem as NewsFeedItemType } from '../../lib/supabase'

const platformLabel = (platform: NewsFeedItemType['platform']) =>
  platform === 'x' ? 'X' : 'Truth'

export function NewsFeedItem({
  item,
  onOpen,
  onReact,
}: {
  item: NewsFeedItemType
  onOpen: (item: NewsFeedItemType) => void
  onReact: (itemId: string, emoji: string) => void | Promise<void>
}) {
  const media = item.media?.[0]

  return (
    <article className="group border-b border-[var(--border-panel)] last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="grid w-full gap-4 px-4 py-4 text-left transition-colors hover:bg-[rgba(255,255,255,0.035)] md:grid-cols-[minmax(0,1fr)_12rem] md:px-5"
      >
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
              {platformLabel(item.platform)}
            </span>
            <span className="truncate text-xs text-[var(--text-muted)]">
              @{item.author_handle} / {item.posted_at ? formatTime(item.posted_at) : formatTime(item.detected_at)}
            </span>
            <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {item.post_kind}
            </span>
          </div>
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-[var(--text-primary)] group-hover:text-[var(--text-gold)]">
            {item.headline}
          </h3>
          {item.body_text && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">
              {item.body_text}
            </p>
          )}
        </div>

        <div className={cn(
          'relative hidden aspect-[1.91/1] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] md:block',
          !media && 'grid place-items-center'
        )}>
          {media ? (
            <>
              <img
                src={media.thumbnail_url || media.url}
                alt={media.alt || item.headline}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              {media.type === 'video' && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-[rgba(255,240,184,0.42)] bg-[rgba(0,0,0,0.62)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[rgb(255,240,184)]">
                  <Play className="h-3 w-3 fill-current" />
                  Video
                </span>
              )}
            </>
          ) : (
            <ExternalLink className="h-6 w-6 text-[var(--text-muted)]" />
          )}
        </div>
      </button>

      <div className="px-4 pb-4 md:px-5">
        <NewsReactionBar
          reactions={item.reactions}
          onReact={emoji => onReact(item.id, emoji)}
        />
      </div>
    </article>
  )
}
