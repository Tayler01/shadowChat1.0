import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'

type QuickReactionRailProps = {
  open: boolean
  anchorRef: React.RefObject<HTMLElement>
  reactions: string[]
  onReact: (emoji: string) => void
  onAddReaction: () => void
  onClose: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  normalizeEmoji: (emoji: string) => string
}

const RAIL_WIDTH = 228
const RAIL_HEIGHT = 42
const EDGE_PADDING = 8
const RAIL_GAP = 6

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export function QuickReactionRail({
  open,
  anchorRef,
  reactions,
  onReact,
  onAddReaction,
  onClose,
  onPointerEnter,
  onPointerLeave,
  normalizeEmoji,
}: QuickReactionRailProps) {
  const [position, setPosition] = useState({ top: 0, left: EDGE_PADDING })
  const railRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return

    const update = () => {
      const anchor = anchorRef.current
      if (!anchor) return

      const rect = anchor.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportHeight = viewport?.height ?? window.innerHeight
      const viewportWidth = viewport?.width ?? window.innerWidth
      const viewportBottom = viewportTop + viewportHeight
      const footerRect = document
        .querySelector('[data-mobile-chat-footer="true"]')
        ?.getBoundingClientRect()
      const footerTop = footerRect?.top
      const footerTopIsUsable = typeof footerTop === 'number'
        && footerTop > viewportTop + RAIL_HEIGHT + EDGE_PADDING * 2
        && footerTop < viewportBottom
      const safeTop = viewportTop + EDGE_PADDING
      const safeBottom = Math.min(viewportBottom, footerTopIsUsable ? footerTop : viewportBottom) - EDGE_PADDING
      const maxTop = Math.max(safeTop, safeBottom - RAIL_HEIGHT)
      const topCandidate = rect.top - RAIL_HEIGHT - RAIL_GAP
      const top = topCandidate < safeTop
        ? Math.min(rect.bottom + RAIL_GAP, maxTop)
        : topCandidate
      const left = clamp(rect.left + 12, EDGE_PADDING, viewportWidth - RAIL_WIDTH - EDGE_PADDING)

      setPosition({ top: clamp(top, safeTop, maxTop), left })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener?.('resize', update)
    window.visualViewport?.addEventListener?.('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener?.('resize', update)
      window.visualViewport?.removeEventListener?.('scroll', update)
    }
  }, [anchorRef, open])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!railRef.current?.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        onClose()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('popstate', onClose)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('popstate', onClose)
    }
  }, [onClose, open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={railRef}
      role="toolbar"
      aria-label="Quick reactions"
      className="glass-panel fixed z-[115] flex items-center gap-1 rounded-full px-2 py-1 shadow-[var(--shadow-panel-strong)]"
      style={{ top: position.top, left: position.left, width: RAIL_WIDTH }}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {reactions.map(emoji => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.32)]"
          type="button"
          aria-label={`React with ${normalizeEmoji(emoji)}`}
        >
          {emoji}
        </button>
      ))}
      <button
        onClick={onAddReaction}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-transform hover:scale-110 hover:text-[var(--theme-accent-readable)] focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.32)]"
        type="button"
        aria-label="Add reaction"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>,
    document.body
  )
}
