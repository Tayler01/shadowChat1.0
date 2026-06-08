import React from 'react'
import { Play } from 'lucide-react'
import { NewsReactionBar, NewsReactionSummaryStrip } from './NewsReactionBar'
import { NewsMediaImage } from './NewsMediaImage'
import { formatTime } from '../../lib/utils'
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
  const hasReactions = Object.values(item.reactions || {}).some(reaction => reaction.count > 0)

  return (
    <article className="group relative m-3 overflow-visible rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(255,255,255,0.034),rgba(255,255,255,0.016))] shadow-[var(--shadow-panel)] transition-colors hover:border-[rgba(215,170,70,0.24)] md:m-4">
      <NewsReactionBar
        reactions={item.reactions}
        onReact={emoji => onReact(item.id, emoji)}
        variant="menu"
        className="absolute right-2.5 top-2.5 z-20"
      />
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[var(--radius-lg)] px-4 pb-3.5 pt-4 pr-12 text-left transition-colors hover:bg-[rgba(255,255,255,0.022)] md:px-5 md:pb-4 md:pr-14"
      >
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
              {platformLabel(item.platform)}
            </span>
            <span className="min-w-0 truncate text-xs text-[var(--text-muted)]">
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

        {media && (
          <div className="relative mt-7 flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden sm:h-20 sm:w-24">
            <NewsMediaImage
              media={media}
              alt={media.alt || item.headline}
              className="h-full w-full rounded-[var(--radius-sm)] object-cover"
            />
            {media.type === 'video' && (
              <span className="absolute left-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[rgb(255,240,184)]">
                <Play className="h-3 w-3 fill-current" />
              </span>
            )}
          </div>
        )}
      </button>

      {hasReactions && (
        <div className="px-4 pb-3 md:px-5">
          <NewsReactionSummaryStrip
            reactions={item.reactions}
            onReact={emoji => onReact(item.id, emoji)}
          />
        </div>
      )}
    </article>
  )
}
