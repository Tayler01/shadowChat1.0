import React, { useState } from 'react'
import { RefreshCw, Satellite } from 'lucide-react'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { NewsFeedItem } from './NewsFeedItem'
import { NewsFeedModal } from './NewsFeedModal'
import { useNewsFeed } from '../../hooks/useNewsFeed'
import type { NewsFeedItem as NewsFeedItemType } from '../../lib/supabase'

export function NewsFeed() {
  const { items, loading, error, refresh, toggleReaction } = useNewsFeed()
  const [openItem, setOpenItem] = useState<NewsFeedItemType | null>(null)

  const handleReaction = async (itemId: string, emoji: string) => {
    await toggleReaction(itemId, emoji)
    setOpenItem(prev => {
      if (!prev || prev.id !== itemId) return prev
      const updated = items.find(item => item.id === itemId)
      return updated || prev
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-panel)] px-4 py-3 md:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">Today Board</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Clears at 00:00 Eastern.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()} aria-label="Refresh news feed">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center p-8">
            <LoadingSpinner size="lg" className="text-[var(--text-gold)]" />
          </div>
        ) : error ? (
          <div className="m-4 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-4 text-sm text-red-100">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] text-[var(--text-gold)]">
                <Satellite className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">No tracked posts yet</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                Admins can add X and Truth sources in Settings.
              </p>
            </div>
          </div>
        ) : (
          <div>
            {items.map(item => (
              <NewsFeedItem
                key={item.id}
                item={item}
                onOpen={setOpenItem}
                onReact={handleReaction}
              />
            ))}
          </div>
        )}
      </div>

      <NewsFeedModal
        item={openItem}
        onClose={() => setOpenItem(null)}
        onReact={handleReaction}
      />
    </div>
  )
}
