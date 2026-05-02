import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Brush, Coins, GraduationCap, MessageSquareText, Newspaper } from 'lucide-react'
import { motion } from 'framer-motion'
import { BOARD_DEFINITIONS, type BoardDefinition } from '../../lib/boards'
import { cn } from '../../lib/utils'

interface BoardBubbleMapProps {
  countsByBoard: Record<string, number>
  onSelect: (board: BoardDefinition) => void
}

interface BubblePosition {
  x: number
  y: number
  radius: number
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'news-feed': Newspaper,
  'news-chat': MessageSquareText,
  'investing-chat': Coins,
  'learning-chat': GraduationCap,
  'crypto-chat': BookOpen,
  'art-board': Brush,
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

const getInitialPositions = (width: number, height: number) => {
  const mobileScale = width < 640 ? 0.72 : width < 920 ? 0.86 : 1
  const verticalPadding = width < 640 ? 42 : 32
  const positions: Record<string, BubblePosition> = {}

  BOARD_DEFINITIONS.forEach(board => {
    const radius = board.defaultPosition.radius * mobileScale
    positions[board.slug] = {
      radius,
      x: clamp((board.defaultPosition.x / 100) * width, radius + 12, width - radius - 12),
      y: clamp((board.defaultPosition.y / 100) * height, radius + verticalPadding, height - radius - 16),
    }
  })

  return positions
}

const resolveActiveCollision = (
  positions: Record<string, BubblePosition>,
  activeSlug: string,
  width: number,
  height: number
) => {
  const next = Object.fromEntries(
    Object.entries(positions).map(([slug, position]) => [slug, { ...position }])
  ) as Record<string, BubblePosition>
  const active = next[activeSlug]
  if (!active) return next

  Object.entries(next).forEach(([slug, position]) => {
    if (slug === activeSlug) return
    const dx = position.x - active.x
    const dy = position.y - active.y
    const distance = Math.max(Math.hypot(dx, dy), 0.001)
    const minDistance = (position.radius + active.radius) * 0.82
    if (distance >= minDistance) return

    const push = (minDistance - distance) * 0.92
    const ux = dx / distance
    const uy = dy / distance
    position.x = clamp(position.x + ux * push, position.radius + 12, width - position.radius - 12)
    position.y = clamp(position.y + uy * push, position.radius + 20, height - position.radius - 16)
  })

  return next
}

export function BoardBubbleMap({ countsByBoard, onSelect }: BoardBubbleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activePointerRef = useRef<number | null>(null)
  const activeSlugRef = useRef<string | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragMovedRef = useRef(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [positions, setPositions] = useState<Record<string, BubblePosition>>({})

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      setSize({
        width: Math.max(rect.width, 320),
        height: Math.max(rect.height, 420),
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    window.addEventListener('orientationchange', updateSize)

    return () => {
      observer.disconnect()
      window.removeEventListener('orientationchange', updateSize)
    }
  }, [])

  useEffect(() => {
    if (!size.width || !size.height) return
    setPositions(getInitialPositions(size.width, size.height))
  }, [size.width, size.height])

  const boards = useMemo(() => [...BOARD_DEFINITIONS].sort((a, b) => a.defaultPosition.y - b.defaultPosition.y), [])

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, board: BoardDefinition) => {
    const position = positions[board.slug]
    if (!position || !size.width || !size.height) return

    activePointerRef.current = event.pointerId
    activeSlugRef.current = board.slug
    dragMovedRef.current = false
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    dragOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerRef.current !== event.pointerId || !activeSlugRef.current) return
    const activeSlug = activeSlugRef.current
    const active = positions[activeSlug]
    if (!active) return

    const dragDistance = Math.hypot(
      event.clientX - dragStartRef.current.x,
      event.clientY - dragStartRef.current.y
    )
    if (dragDistance < 4) return

    dragMovedRef.current = true
    const nextActive = {
      ...active,
      x: clamp(event.clientX - dragOffsetRef.current.x, active.radius + 12, size.width - active.radius - 12),
      y: clamp(event.clientY - dragOffsetRef.current.y, active.radius + 20, size.height - active.radius - 16),
    }

    setPositions(prev => resolveActiveCollision({
      ...prev,
      [activeSlug]: nextActive,
    }, activeSlug, size.width, size.height))
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>, board: BoardDefinition) => {
    if (activePointerRef.current === event.pointerId) {
      activePointerRef.current = null
      activeSlugRef.current = null
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // Ignore capture release failures from interrupted gestures.
      }
    }

    if (!dragMovedRef.current) {
      onSelect(board)
    }
    dragMovedRef.current = false
  }

  return (
    <div
      ref={containerRef}
      className="relative min-h-[calc(100vh-10rem)] flex-1 overflow-hidden touch-none rounded-none md:min-h-[620px]"
      aria-label="Boards map"
    >
      <div className="pointer-events-none absolute inset-x-8 top-6 h-px bg-[linear-gradient(90deg,transparent,rgba(215,170,70,0.24),transparent)]" />
      {boards.map(board => {
        const position = positions[board.slug]
        const Icon = iconMap[board.slug] || MessageSquareText
        const unreadCount = countsByBoard[board.slug] || 0
        const diameter = position ? position.radius * 2 : board.defaultPosition.radius * 2

        return (
          <motion.button
            key={board.slug}
            type="button"
            onPointerDown={event => handlePointerDown(event, board)}
            onPointerMove={handlePointerMove}
            onPointerUp={event => handlePointerUp(event, board)}
            onPointerCancel={() => {
              activePointerRef.current = null
              activeSlugRef.current = null
              dragMovedRef.current = false
            }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: position ? position.x - diameter / 2 : 0,
              y: position ? position.y - diameter / 2 : 0,
            }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
            className={cn(
              'absolute left-0 top-0 isolate flex cursor-grab select-none flex-col items-center justify-center rounded-full border px-4 text-center shadow-[0_18px_52px_rgba(0,0,0,0.34)] outline-none transition-colors active:cursor-grabbing',
              board.kind === 'feed'
                ? 'border-[rgba(215,170,70,0.36)] bg-[radial-gradient(circle_at_30%_18%,rgba(255,240,184,0.24),rgba(215,170,70,0.08)_38%,rgba(15,16,17,0.94)_100%)]'
                : board.kind === 'static'
                  ? 'border-[rgba(216,143,184,0.34)] bg-[radial-gradient(circle_at_30%_18%,rgba(216,143,184,0.2),rgba(255,255,255,0.04)_42%,rgba(15,16,17,0.94)_100%)]'
                  : 'border-[rgba(255,255,255,0.11)] bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.15),rgba(255,255,255,0.05)_42%,rgba(15,16,17,0.95)_100%)]',
              'hover:border-[rgba(215,170,70,0.42)] focus-visible:ring-2 focus-visible:ring-[rgba(215,170,70,0.34)]'
            )}
            style={{
              width: diameter,
              height: diameter,
              color: board.accent,
            }}
            aria-label={`Open ${board.title}`}
          >
            <span className="absolute inset-0 -z-10 rounded-full opacity-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" />
            {unreadCount > 0 && (
              <span className="absolute right-3 top-3 min-w-6 rounded-full border border-[rgba(215,170,70,0.45)] bg-[rgba(215,170,70,0.16)] px-1.5 py-1 text-xs font-semibold leading-none text-[var(--text-gold)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            <span className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-current/20 bg-current/10 text-current">
              <Icon className="h-[1.125rem] w-[1.125rem]" />
            </span>
            <span className="text-base font-semibold leading-tight text-[var(--text-primary)]">{board.title}</span>
            <span className="mt-1 max-w-[9rem] text-[11px] leading-4 text-[var(--text-muted)]">{board.description}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
