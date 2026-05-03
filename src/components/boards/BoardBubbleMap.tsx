import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, BookOpen, Brush, Code2, Coins, FolderKanban, GraduationCap, MessageSquareText, Newspaper } from 'lucide-react'
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

interface BubbleVelocity {
  vx: number
  vy: number
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'news-feed': Newspaper,
  'news-chat': MessageSquareText,
  'investing-chat': Coins,
  'learning-chat': GraduationCap,
  'crypto-chat': BookOpen,
  'vibe-coding': Code2,
  'ai-news': Bot,
  'projects-chat': FolderKanban,
  'art-board': Brush,
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))
const EDGE_PADDING_X = 12
const EDGE_PADDING_TOP = 20
const EDGE_PADDING_BOTTOM = 16
const COLLISION_SPACING = 0.92
const COLLISION_RESTITUTION = 0.72
const COLLISION_TRANSFER = 0.44
const MOTION_FRICTION = 0.992
const MOTION_STOP_SPEED = 0.045
const MAX_THROW_SPEED = 28

const clonePositions = (positions: Record<string, BubblePosition>) => (
  Object.fromEntries(
    Object.entries(positions).map(([slug, position]) => [slug, { ...position }])
  ) as Record<string, BubblePosition>
)

const createZeroVelocities = (positions: Record<string, BubblePosition>) => (
  Object.fromEntries(
    Object.keys(positions).map(slug => [slug, { vx: 0, vy: 0 }])
  ) as Record<string, BubbleVelocity>
)

const clampSpeed = (value: number) => clamp(value, -MAX_THROW_SPEED, MAX_THROW_SPEED)

const clampBubbleToBounds = (
  position: BubblePosition,
  width: number,
  height: number,
  velocity?: BubbleVelocity
) => {
  const minX = position.radius + EDGE_PADDING_X
  const maxX = width - position.radius - EDGE_PADDING_X
  const minY = position.radius + EDGE_PADDING_TOP
  const maxY = height - position.radius - EDGE_PADDING_BOTTOM

  if (position.x < minX) {
    position.x = minX
    if (velocity && velocity.vx < 0) velocity.vx *= -0.58
  } else if (position.x > maxX) {
    position.x = maxX
    if (velocity && velocity.vx > 0) velocity.vx *= -0.58
  }

  if (position.y < minY) {
    position.y = minY
    if (velocity && velocity.vy < 0) velocity.vy *= -0.58
  } else if (position.y > maxY) {
    position.y = maxY
    if (velocity && velocity.vy > 0) velocity.vy *= -0.58
  }
}

const resolveBubbleCollisions = (
  positions: Record<string, BubblePosition>,
  velocities: Record<string, BubbleVelocity>,
  width: number,
  height: number,
  pinnedSlug: string | null = null
) => {
  const slugs = Object.keys(positions)

  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 0; i < slugs.length; i += 1) {
      for (let j = i + 1; j < slugs.length; j += 1) {
        const aSlug = slugs[i]
        const bSlug = slugs[j]
        const a = positions[aSlug]
        const b = positions[bSlug]
        if (!a || !b) continue

        let dx = b.x - a.x
        let dy = b.y - a.y
        let distance = Math.hypot(dx, dy)
        if (distance < 0.001) {
          dx = 1
          dy = 0
          distance = 1
        }

        const minDistance = (a.radius + b.radius) * COLLISION_SPACING
        if (distance >= minDistance) continue

        const nx = dx / distance
        const ny = dy / distance
        const overlap = minDistance - distance
        const aPinned = aSlug === pinnedSlug
        const bPinned = bSlug === pinnedSlug

        if (aPinned && !bPinned) {
          b.x += nx * overlap
          b.y += ny * overlap
        } else if (bPinned && !aPinned) {
          a.x -= nx * overlap
          a.y -= ny * overlap
        } else {
          const halfOverlap = overlap * 0.5
          a.x -= nx * halfOverlap
          a.y -= ny * halfOverlap
          b.x += nx * halfOverlap
          b.y += ny * halfOverlap
        }

        const aVelocity = velocities[aSlug] ?? { vx: 0, vy: 0 }
        const bVelocity = velocities[bSlug] ?? { vx: 0, vy: 0 }
        velocities[aSlug] = aVelocity
        velocities[bSlug] = bVelocity

        const inverseMassA = aPinned ? 0 : 1
        const inverseMassB = bPinned ? 0 : 1
        const inverseMassTotal = inverseMassA + inverseMassB
        const relativeVelocityX = bVelocity.vx - aVelocity.vx
        const relativeVelocityY = bVelocity.vy - aVelocity.vy
        const relativeNormalVelocity = relativeVelocityX * nx + relativeVelocityY * ny

        if (inverseMassTotal > 0 && relativeNormalVelocity < 0) {
          const impulse = (-(1 + COLLISION_RESTITUTION) * relativeNormalVelocity) / inverseMassTotal
          if (!aPinned) {
            aVelocity.vx -= impulse * nx * inverseMassA
            aVelocity.vy -= impulse * ny * inverseMassA
          }
          if (!bPinned) {
            bVelocity.vx += impulse * nx * inverseMassB
            bVelocity.vy += impulse * ny * inverseMassB
          }
        }

        if (aPinned && !bPinned) {
          const hitSpeed = aVelocity.vx * nx + aVelocity.vy * ny
          if (hitSpeed > 0) {
            bVelocity.vx += nx * hitSpeed * COLLISION_TRANSFER
            bVelocity.vy += ny * hitSpeed * COLLISION_TRANSFER
          }
        } else if (bPinned && !aPinned) {
          const hitSpeed = -(bVelocity.vx * nx + bVelocity.vy * ny)
          if (hitSpeed > 0) {
            aVelocity.vx -= nx * hitSpeed * COLLISION_TRANSFER
            aVelocity.vy -= ny * hitSpeed * COLLISION_TRANSFER
          }
        }

        clampBubbleToBounds(a, width, height, aPinned ? undefined : aVelocity)
        clampBubbleToBounds(b, width, height, bPinned ? undefined : bVelocity)
      }
    }
  }
}

const getInitialPositions = (width: number, height: number) => {
  const mobileScale = width < 640 ? 0.72 : width < 920 ? 0.86 : 1
  const verticalPadding = width < 640 ? 42 : 32
  const positions: Record<string, BubblePosition> = {}

  BOARD_DEFINITIONS.forEach(board => {
    const radius = board.defaultPosition.radius * mobileScale
    positions[board.slug] = {
      radius,
      x: clamp((board.defaultPosition.x / 100) * width, radius + EDGE_PADDING_X, width - radius - EDGE_PADDING_X),
      y: clamp((board.defaultPosition.y / 100) * height, radius + verticalPadding, height - radius - EDGE_PADDING_BOTTOM),
    }
  })

  return positions
}

export function BoardBubbleMap({ countsByBoard, onSelect }: BoardBubbleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activePointerRef = useRef<number | null>(null)
  const activeSlugRef = useRef<string | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragStartRef = useRef({ x: 0, y: 0 })
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 })
  const dragMovedRef = useRef(false)
  const lastFrameTimeRef = useRef<number | null>(null)
  const positionsRef = useRef<Record<string, BubblePosition>>({})
  const velocitiesRef = useRef<Record<string, BubbleVelocity>>({})
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [positions, setPositions] = useState<Record<string, BubblePosition>>({})

  const setBubblePositions = (updater: (previous: Record<string, BubblePosition>) => Record<string, BubblePosition>) => {
    setPositions(previous => {
      const next = updater(previous)
      positionsRef.current = next
      return next
    })
  }

  const stopPhysicsLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    lastFrameTimeRef.current = null
  }, [])

  const startPhysicsLoop = useCallback(() => {
    if (animationFrameRef.current !== null || !size.width || !size.height) return

    const step = (time: number) => {
      const previousTime = lastFrameTimeRef.current ?? time
      const deltaFrames = clamp((time - previousTime) / 16.67, 0.5, 2.5)
      const friction = Math.pow(MOTION_FRICTION, deltaFrames)
      const pinnedSlug = activeSlugRef.current
      lastFrameTimeRef.current = time

      const next = clonePositions(positionsRef.current)
      const velocities = velocitiesRef.current

      Object.entries(next).forEach(([slug, position]) => {
        const velocity = velocities[slug] ?? { vx: 0, vy: 0 }
        velocities[slug] = velocity

        if (slug !== pinnedSlug) {
          position.x += velocity.vx * deltaFrames
          position.y += velocity.vy * deltaFrames
          velocity.vx *= friction
          velocity.vy *= friction
          clampBubbleToBounds(position, size.width, size.height, velocity)
        }
      })

      resolveBubbleCollisions(next, velocities, size.width, size.height, pinnedSlug)

      let hasMotion = false
      Object.entries(velocities).forEach(([slug, velocity]) => {
        if (slug === pinnedSlug) return

        velocity.vx = clampSpeed(velocity.vx)
        velocity.vy = clampSpeed(velocity.vy)

        if (Math.hypot(velocity.vx, velocity.vy) <= MOTION_STOP_SPEED) {
          velocity.vx = 0
          velocity.vy = 0
        } else {
          hasMotion = true
        }
      })

      positionsRef.current = next
      setPositions(next)

      if (hasMotion || activePointerRef.current !== null) {
        animationFrameRef.current = window.requestAnimationFrame(step)
        return
      }

      animationFrameRef.current = null
      lastFrameTimeRef.current = null
    }

    animationFrameRef.current = window.requestAnimationFrame(step)
  }, [size.height, size.width])

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
    stopPhysicsLoop()
    const initialPositions = getInitialPositions(size.width, size.height)
    positionsRef.current = initialPositions
    velocitiesRef.current = createZeroVelocities(initialPositions)
    setPositions(initialPositions)
  }, [size.width, size.height, stopPhysicsLoop])

  useEffect(() => () => stopPhysicsLoop(), [stopPhysicsLoop])

  const boards = useMemo(() => [...BOARD_DEFINITIONS].sort((a, b) => a.defaultPosition.y - b.defaultPosition.y), [])

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, board: BoardDefinition) => {
    const position = positions[board.slug]
    if (!position || !size.width || !size.height) return

    activePointerRef.current = event.pointerId
    activeSlugRef.current = board.slug
    dragMovedRef.current = false
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: event.timeStamp }
    dragOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    }
    velocitiesRef.current[board.slug] = { vx: 0, vy: 0 }
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
    const lastPointer = lastPointerRef.current
    const deltaFrames = clamp((event.timeStamp - lastPointer.time) / 16.67, 0.5, 3)
    const activeVelocity = velocitiesRef.current[activeSlug] ?? { vx: 0, vy: 0 }
    activeVelocity.vx = clampSpeed((event.clientX - lastPointer.x) / deltaFrames)
    activeVelocity.vy = clampSpeed((event.clientY - lastPointer.y) / deltaFrames)
    velocitiesRef.current[activeSlug] = activeVelocity
    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: event.timeStamp }

    const nextActive = {
      ...active,
      x: clamp(event.clientX - dragOffsetRef.current.x, active.radius + EDGE_PADDING_X, size.width - active.radius - EDGE_PADDING_X),
      y: clamp(event.clientY - dragOffsetRef.current.y, active.radius + EDGE_PADDING_TOP, size.height - active.radius - EDGE_PADDING_BOTTOM),
    }

    setBubblePositions(previous => {
      const next = clonePositions(previous)
      next[activeSlug] = nextActive
      resolveBubbleCollisions(next, velocitiesRef.current, size.width, size.height, activeSlug)
      return next
    })
    startPhysicsLoop()
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
    } else {
      startPhysicsLoop()
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
            transition={{
              opacity: { duration: 0.16 },
              scale: { type: 'spring', stiffness: 360, damping: 28, mass: 0.7 },
              x: { duration: 0.012, ease: 'linear' },
              y: { duration: 0.012, ease: 'linear' },
            }}
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
