import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pin, X } from 'lucide-react'
import { Button } from '../ui/Button'
import type { Message } from '../../lib/supabase'

const LazyPinnedMessageItem = React.lazy(() =>
  import('./PinnedMessageItem').then(module => ({ default: module.PinnedMessageItem }))
)

interface PinnedMessagesButtonProps {
  messages: Message[]
  onUnpin: (messageId: string) => Promise<void>
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>
}

export function PinnedMessagesButton({
  messages,
  onUnpin,
  onToggleReaction,
}: PinnedMessagesButtonProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!messages.length) return null

  const pinnedPopup = open ? (
    <div
      ref={popupRef}
      className="glass-panel-strong fixed left-1/2 top-[calc(env(safe-area-inset-top)_+_4.35rem)] z-[90] w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] shadow-[var(--shadow-panel-strong)]"
      role="dialog"
      aria-label="Pinned messages"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-panel)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Pinned
          </p>
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            Saved from General Chat
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 rounded-full p-0"
          onClick={() => setOpen(false)}
          aria-label="Close pinned messages"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <React.Suspense
        fallback={<div className="p-3 text-sm text-[var(--text-muted)]">Loading pinned messages...</div>}
      >
        <div className="max-h-[min(60vh,24rem)] space-y-2 overflow-y-auto p-3">
          {messages.map(message => (
            <LazyPinnedMessageItem
              key={message.id}
              message={message}
              onUnpin={onUnpin}
              onToggleReaction={onToggleReaction}
            />
          ))}
        </div>
      </React.Suspense>
    </div>
  ) : null

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(value => !value)}
        className="relative h-10 w-10 rounded-full p-0 text-[var(--text-secondary)] hover:text-[var(--theme-accent-readable)]"
        aria-label={`View ${messages.length} pinned message${messages.length === 1 ? '' : 's'}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Pin className="h-4 w-4" />
      </Button>

      {pinnedPopup && (typeof document === 'undefined' ? pinnedPopup : createPortal(pinnedPopup, document.body))}
    </div>
  )
}
