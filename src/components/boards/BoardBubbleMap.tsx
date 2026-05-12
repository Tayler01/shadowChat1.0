import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, BookOpen, Brush, Code2, Coins, FolderKanban, GraduationCap, MessageSquareText, Newspaper, Pin } from 'lucide-react'
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
  angle: number
}

interface BubbleVelocity {
  vx: number
  vy: number
  angular: number
}

type BoardShape = 'circle' | 'pill' | 'square' | 'octagon'

interface CollisionFeedbackEvent {
  key: string
  x: number
  y: number
  intensity: number
  color: string
}

interface CollisionBurst {
  id: number
  x: number
  y: number
  color: string
  size: number
  rotate: number
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
  'shadow-pin': Pin,
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))
const EDGE_PADDING_X = 12
const EDGE_PADDING_TOP = 20
const EDGE_PADDING_BOTTOM = 16
const COLLISION_SPACING = 1.06

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '').trim()
  if (!/^[0-9a-f]{6}$/iu.test(normalized)) return null
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

const getBoardBubbleBackground = (board: BoardDefinition) => {
  const rgb = hexToRgb(board.accent) ?? { r: 215, g: 170, b: 70 }
  const accent = `${rgb.r}, ${rgb.g}, ${rgb.b}`
  const borderAlpha = board.kind === 'feed' ? 0.42 : board.kind === 'static' ? 0.36 : 0.28

  return {
    background: [
      `radial-gradient(circle at 30% 18%, rgba(${accent}, 0.28), rgba(${accent}, 0.11) 42%, transparent 76%)`,
      'var(--theme-panel-cover-bg)',
    ].join(', '),
    borderColor: `rgba(${accent}, ${borderAlpha})`,
  }
}
const COLLISION_RESTITUTION = 0.62
const COLLISION_TRANSFER = 0.5
const COLLISION_PASSES = 6
const COLLISION_POSITION_CORRECTION = 0.92
const COLLISION_FEEDBACK_SPEED = 1.25
const MOTION_FRICTION = 0.992
const MOTION_STOP_SPEED = 0.045
const MAX_THROW_SPEED = 28
const ANGULAR_FRICTION = 0.952
const ANGULAR_RETURN_FORCE = 0.034
const ANGULAR_STOP_SPEED = 0.025
const MAX_ANGULAR_SPEED = 2.65

const getBoardShape = (board: BoardDefinition): BoardShape => {
  if (board.slug === 'shadow-pin') return 'octagon'
  if (board.kind === 'feed') return 'pill'
  if (board.kind === 'static') return 'square'
  return 'circle'
}

const BOARD_SHAPES_BY_SLUG = Object.fromEntries(
  BOARD_DEFINITIONS.map(board => [board.slug, getBoardShape(board)])
) as Record<string, BoardShape>

const BOARD_ACCENTS_BY_SLUG = Object.fromEntries(
  BOARD_DEFINITIONS.map(board => [board.slug, board.accent])
) as Record<string, string>

const clonePositions = (positions: Record<string, BubblePosition>) => (
  Object.fromEntries(
    Object.entries(positions).map(([slug, position]) => [slug, { ...position }])
  ) as Record<string, BubblePosition>
)

const createZeroVelocities = (positions: Record<string, BubblePosition>) => (
  Object.fromEntries(
    Object.keys(positions).map(slug => [slug, { vx: 0, vy: 0, angular: 0 }])
  ) as Record<string, BubbleVelocity>
)

const clampSpeed = (value: number) => clamp(value, -MAX_THROW_SPEED, MAX_THROW_SPEED)
const clampAngularSpeed = (value: number) => clamp(value, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED)

const normalizeAngle = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180

const ensureVelocity = (velocities: Record<string, BubbleVelocity>, slug: string) => {
  const existing = velocities[slug]
  if (existing) {
    existing.angular ??= 0
    return existing
  }

  const created = { vx: 0, vy: 0, angular: 0 }
  velocities[slug] = created
  return created
}

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
  pinnedSlug: string | null = null,
  feedbackEvents?: CollisionFeedbackEvent[]
) => {
  const slugs = Object.keys(positions)

  for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
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
        const rawOverlap = minDistance - distance
        const overlap = rawOverlap * COLLISION_POSITION_CORRECTION
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

        const aVelocity = ensureVelocity(velocities, aSlug)
        const bVelocity = ensureVelocity(velocities, bSlug)

        const inverseMassA = aPinned ? 0 : 1
        const inverseMassB = bPinned ? 0 : 1
        const inverseMassTotal = inverseMassA + inverseMassB
        const relativeVelocityX = bVelocity.vx - aVelocity.vx
        const relativeVelocityY = bVelocity.vy - aVelocity.vy
        const relativeNormalVelocity = relativeVelocityX * nx + relativeVelocityY * ny
        const impactSpeed = Math.max(0, -relativeNormalVelocity)

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

        const tangentX = -ny
        const tangentY = nx
        const relativeTangentVelocity = relativeVelocityX * tangentX + relativeVelocityY * tangentY
        const cornerFactor = clamp(Math.abs(nx * ny) * 2.2, 0, 1)
        const applySpin = (slug: string, velocity: BubbleVelocity, direction: number) => {
          const shape = BOARD_SHAPES_BY_SLUG[slug]
          if (shape !== 'pill') return
          const glancingKick = Math.abs(relativeTangentVelocity) * 0.035
          const cornerKick = impactSpeed * 0.13 * cornerFactor
          if (cornerKick + glancingKick < 0.025) return
          const spinDirection = Math.sign((nx || 0.01) * (ny || 0.01)) || 1
          velocity.angular = clampAngularSpeed(
            velocity.angular + direction * spinDirection * (cornerKick + glancingKick)
          )
        }

        applySpin(aSlug, aVelocity, -1)
        applySpin(bSlug, bVelocity, 1)

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

        if (feedbackEvents && pass === 0) {
          const pinnedImpact = aPinned
            ? Math.max(0, aVelocity.vx * nx + aVelocity.vy * ny)
            : bPinned
              ? Math.max(0, -(bVelocity.vx * nx + bVelocity.vy * ny))
              : 0
          const feedbackIntensity = Math.max(impactSpeed, pinnedImpact, rawOverlap * 0.045)
          if (feedbackIntensity >= COLLISION_FEEDBACK_SPEED) {
            feedbackEvents.push({
              key: [aSlug, bSlug].sort().join(':'),
              x: (a.x + b.x) / 2,
              y: (a.y + b.y) / 2,
              intensity: feedbackIntensity,
              color: BOARD_ACCENTS_BY_SLUG[bSlug] ?? BOARD_ACCENTS_BY_SLUG[aSlug] ?? '#d7aa46',
            })
          }
        }

        clampBubbleToBounds(a, width, height, aPinned ? undefined : aVelocity)
        clampBubbleToBounds(b, width, height, bPinned ? undefined : bVelocity)
      }
    }
  }
}

const getInitialPositions = (width: number, height: number) => {
  const mobileScale = width < 390 ? 0.62 : width < 640 ? 0.68 : width < 920 ? 0.84 : 0.98
  const verticalPadding = width < 640 ? 42 : 32
  const positions: Record<string, BubblePosition> = {}

  BOARD_DEFINITIONS.forEach(board => {
    const radius = board.defaultPosition.radius * mobileScale
    positions[board.slug] = {
      radius,
      x: clamp((board.defaultPosition.x / 100) * width, radius + EDGE_PADDING_X, width - radius - EDGE_PADDING_X),
      y: clamp((board.defaultPosition.y / 100) * height, radius + verticalPadding, height - radius - EDGE_PADDING_BOTTOM),
      angle: 0,
    }
  })

  const velocities = createZeroVelocities(positions)
  resolveBubbleCollisions(positions, velocities, width, height)
  return positions
}

const getBoardVisualSize = (board: BoardDefinition, diameter: number) => {
  const shape = getBoardShape(board)

  if (shape === 'pill') {
    return {
      shape,
      width: diameter,
      height: diameter * 0.64,
    }
  }

  return {
    shape,
    width: diameter,
    height: diameter,
  }
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
  const audioContextRef = useRef<AudioContext | null>(null)
  const lastCollisionFeedbackRef = useRef<Record<string, number>>({})
  const burstIdRef = useRef(0)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [positions, setPositions] = useState<Record<string, BubblePosition>>({})
  const [collisionBursts, setCollisionBursts] = useState<CollisionBurst[]>([])

  const playCollisionSound = useCallback((intensity: number) => {
    if (typeof window === 'undefined') return
    try {
      if (window.localStorage?.getItem('soundEffectsEnabled') === 'false') return
    } catch {
      // Ignore storage access failures.
    }

    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext }
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext
    if (!AudioContextCtor) return

    try {
      const context = audioContextRef.current ?? new AudioContextCtor()
      audioContextRef.current = context
      context.resume?.().catch(() => {})

      const now = context.currentTime
      const gain = context.createGain()
      const oscillator = context.createOscillator()
      const overtone = context.createOscillator()
      const baseFrequency = 420 + clamp(intensity, 0, 9) * 28

      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(baseFrequency, now)
      oscillator.frequency.exponentialRampToValueAtTime(baseFrequency * 1.38, now + 0.11)
      overtone.type = 'sine'
      overtone.frequency.setValueAtTime(baseFrequency * 1.52, now)
      overtone.frequency.exponentialRampToValueAtTime(baseFrequency * 1.9, now + 0.08)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.035, now + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)

      oscillator.connect(gain)
      overtone.connect(gain)
      gain.connect(context.destination)
      oscillator.start(now)
      overtone.start(now)
      oscillator.stop(now + 0.18)
      overtone.stop(now + 0.14)
    } catch {
      // Browser audio can be unavailable or blocked; the visual feedback still runs.
    }
  }, [])

  const emitCollisionFeedback = useCallback((events: CollisionFeedbackEvent[]) => {
    if (!events.length) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const accepted: CollisionFeedbackEvent[] = []

    events.forEach(event => {
      const last = lastCollisionFeedbackRef.current[event.key] ?? 0
      if (now - last < 180) return
      lastCollisionFeedbackRef.current[event.key] = now
      accepted.push(event)
    })

    if (!accepted.length) return

    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (!prefersReducedMotion) {
      const bursts = accepted.slice(0, 3).map(event => ({
        id: burstIdRef.current += 1,
        x: event.x,
        y: event.y,
        color: event.color,
        size: clamp(26 + event.intensity * 3, 28, 52),
        rotate: (event.intensity * 23) % 180,
      }))

      setCollisionBursts(previous => [...previous.slice(-10), ...bursts])
      window.setTimeout(() => {
        setCollisionBursts(previous => previous.filter(burst => !bursts.some(next => next.id === burst.id)))
      }, 620)
    }

    playCollisionSound(Math.max(...accepted.map(event => event.intensity)))
  }, [playCollisionSound])

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
      const feedbackEvents: CollisionFeedbackEvent[] = []

      Object.entries(next).forEach(([slug, position]) => {
        const velocity = ensureVelocity(velocities, slug)
        const shape = BOARD_SHAPES_BY_SLUG[slug]

        if (slug !== pinnedSlug) {
          position.x += velocity.vx * deltaFrames
          position.y += velocity.vy * deltaFrames
          if (shape === 'pill') {
            velocity.angular += -position.angle * ANGULAR_RETURN_FORCE * deltaFrames
            position.angle = normalizeAngle(position.angle + velocity.angular * deltaFrames)
            velocity.angular *= Math.pow(ANGULAR_FRICTION, deltaFrames)
          } else {
            position.angle = 0
            velocity.angular = 0
          }
          velocity.vx *= friction
          velocity.vy *= friction
          clampBubbleToBounds(position, size.width, size.height, velocity)
        }
      })

      resolveBubbleCollisions(next, velocities, size.width, size.height, pinnedSlug, feedbackEvents)
      emitCollisionFeedback(feedbackEvents)

      let hasMotion = false
      Object.entries(velocities).forEach(([slug, velocity]) => {
        if (slug === pinnedSlug) return

        velocity.vx = clampSpeed(velocity.vx)
        velocity.vy = clampSpeed(velocity.vy)
        velocity.angular = clampAngularSpeed(velocity.angular)

        if (Math.hypot(velocity.vx, velocity.vy) <= MOTION_STOP_SPEED) {
          velocity.vx = 0
          velocity.vy = 0
        } else {
          hasMotion = true
        }

        if (Math.abs(velocity.angular) <= ANGULAR_STOP_SPEED && Math.abs(next[slug]?.angle ?? 0) <= 0.35) {
          velocity.angular = 0
          if (next[slug]) next[slug].angle = 0
        } else if (BOARD_SHAPES_BY_SLUG[slug] === 'pill') {
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
  }, [emitCollisionFeedback, size.height, size.width])

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
    const position = positionsRef.current[board.slug] ?? positions[board.slug]
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
    velocitiesRef.current[board.slug] = { vx: 0, vy: 0, angular: ensureVelocity(velocitiesRef.current, board.slug).angular * 0.35 }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some embedded browser surfaces can interrupt capture during fast taps.
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerRef.current !== event.pointerId || !activeSlugRef.current) return
    const activeSlug = activeSlugRef.current
    const active = positionsRef.current[activeSlug] ?? positions[activeSlug]
    if (!active) return

    const dragDistance = Math.hypot(
      event.clientX - dragStartRef.current.x,
      event.clientY - dragStartRef.current.y
    )
    if (dragDistance < 4) return

    dragMovedRef.current = true
    const lastPointer = lastPointerRef.current
    const deltaFrames = clamp((event.timeStamp - lastPointer.time) / 16.67, 0.5, 3)
    const activeVelocity = ensureVelocity(velocitiesRef.current, activeSlug)
    activeVelocity.vx = clampSpeed((event.clientX - lastPointer.x) / deltaFrames)
    activeVelocity.vy = clampSpeed((event.clientY - lastPointer.y) / deltaFrames)
    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: event.timeStamp }

    const nextActive = {
      ...active,
      x: clamp(event.clientX - dragOffsetRef.current.x, active.radius + EDGE_PADDING_X, size.width - active.radius - EDGE_PADDING_X),
      y: clamp(event.clientY - dragOffsetRef.current.y, active.radius + EDGE_PADDING_TOP, size.height - active.radius - EDGE_PADDING_BOTTOM),
    }

    const next = clonePositions(positionsRef.current)
    next[activeSlug] = nextActive
    const feedbackEvents: CollisionFeedbackEvent[] = []
    resolveBubbleCollisions(next, velocitiesRef.current, size.width, size.height, activeSlug, feedbackEvents)
    positionsRef.current = next
    setPositions(next)
    emitCollisionFeedback(feedbackEvents)
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
        const visual = getBoardVisualSize(board, diameter)
        const compact = visual.width < 132 || visual.height < 118
        const showDescription = !compact && visual.shape !== 'pill'
        const rotation = visual.shape === 'pill' ? position?.angle ?? 0 : 0
        const labelMaxWidth = Math.max(visual.width - 28, 68)
        const bubbleSurface = getBoardBubbleBackground(board)

        return (
          <motion.button
            key={board.slug}
            type="button"
            data-board-shape={visual.shape}
            onPointerDown={event => handlePointerDown(event, board)}
            onPointerMove={handlePointerMove}
            onPointerUp={event => handlePointerUp(event, board)}
            onPointerCancel={() => {
              activePointerRef.current = null
              activeSlugRef.current = null
              dragMovedRef.current = false
              startPhysicsLoop()
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
            }}
            transition={{
              opacity: { duration: 0.16 },
            }}
            className={cn(
              'absolute left-0 top-0 isolate flex cursor-grab select-none flex-col items-center justify-center overflow-visible border px-3 text-center shadow-[0_18px_52px_rgba(0,0,0,0.34)] outline-none transition-colors active:cursor-grabbing',
              visual.shape === 'pill'
                ? 'rounded-full'
                : visual.shape === 'square'
                  ? 'rounded-[var(--radius-sm)]'
                  : visual.shape === 'octagon'
                    ? 'rounded-none'
                    : 'rounded-full',
              'bg-transparent hover:border-[var(--border-glow)] focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]'
            )}
            style={{
              ...bubbleSurface,
              width: visual.width,
              height: visual.height,
              color: board.accent,
              transform: position
                ? `translate3d(${position.x - visual.width / 2}px, ${position.y - visual.height / 2}px, 0) rotate(${rotation}deg)`
                : undefined,
              transformOrigin: '50% 50%',
              willChange: 'transform',
              clipPath: visual.shape === 'octagon'
                ? 'polygon(29% 0, 71% 0, 100% 29%, 100% 71%, 71% 100%, 29% 100%, 0 71%, 0 29%)'
                : undefined,
            }}
            aria-label={`Open ${board.title}`}
          >
            <span
              className={cn(
                'absolute inset-0 -z-10 opacity-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
                visual.shape === 'square' ? 'rounded-[var(--radius-sm)]' : visual.shape === 'octagon' ? 'rounded-none' : 'rounded-full'
              )}
            />
            {unreadCount > 0 && (
              <span className="theme-unread-badge absolute right-1.5 top-1.5 z-20 min-w-6 rounded-full px-1.5 py-1 text-xs font-semibold leading-none shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            <span className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-full border border-current/20 bg-current/10 text-current',
              compact ? 'mb-1 h-7 w-7' : visual.shape === 'pill' ? 'mb-1.5 h-8 w-8' : 'mb-2 h-9 w-9'
            )}>
              <Icon className={compact ? 'h-4 w-4' : 'h-[1.125rem] w-[1.125rem]'} />
            </span>
            <span
              className={cn(
                'min-w-0 font-semibold leading-tight text-[var(--text-primary)]',
                compact ? 'text-xs' : visual.shape === 'pill' ? 'text-sm' : 'text-[0.94rem]'
              )}
              style={{
                maxWidth: labelMaxWidth,
                overflow: 'hidden',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: visual.shape === 'pill' ? 1 : 2,
              }}
            >
              {board.title}
            </span>
            {showDescription && (
              <span
                className="mt-1 min-w-0 text-[11px] leading-4 text-[var(--text-muted)]"
                style={{
                  maxWidth: Math.max(visual.width - 36, 72),
                  overflow: 'hidden',
                  overflowWrap: 'anywhere',
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                }}
              >
                {board.description}
              </span>
            )}
          </motion.button>
        )
      })}
      {collisionBursts.map(burst => (
        <motion.span
          key={burst.id}
          className="pointer-events-none absolute z-20"
          initial={{ opacity: 0, scale: 0.35, rotate: burst.rotate }}
          animate={{ opacity: [0, 1, 0], scale: [0.35, 1, 1.55], rotate: burst.rotate + 110 }}
          transition={{ duration: 0.56, ease: 'easeOut' }}
          style={{
            left: burst.x - burst.size / 2,
            top: burst.y - burst.size / 2,
            width: burst.size,
            height: burst.size,
            color: burst.color,
          }}
          aria-hidden="true"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={index}
              className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_14px_currentColor]"
              style={{
                transform: `translate(-50%, -50%) rotate(${index * 60}deg) translateY(-${burst.size * 0.34}px)`,
              }}
            />
          ))}
        </motion.span>
      ))}
    </div>
  )
}
