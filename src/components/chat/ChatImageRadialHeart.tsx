import { useEffect, useRef, useState } from 'react'
import type { HTMLAttributes, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Heart } from 'lucide-react'
import { cn } from '../../lib/utils'

type ChatImageRadialHeartProps = {
  children: ReactNode
  hearted?: boolean
  heartCount?: number
  disabled?: boolean
  tiltSide?: 'left' | 'right'
  onHeart: () => void | Promise<void>
} & Omit<
  HTMLAttributes<HTMLSpanElement>,
  'children' | 'onClickCapture' | 'onContextMenu' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
>

const LONG_PRESS_MS = 440
const MOVE_CANCEL_PX = 14
const SELECT_RADIUS_PX = 48
const SAFE_MARGIN_PX = 18
const ICON_RADIUS_PX = 28
const HEART_ACTION = {
  x: 0,
  y: -92,
}

type PressState = {
  timerId: number | null
  pointerId: number
  startClientX: number
  startClientY: number
  menuOriginX: number
  menuOriginY: number
  active: boolean
}

const finitePointerCoordinate = (value: number) => Number.isFinite(value) ? value : 0

const clamp = (value: number, min: number, max: number) => {
  if (min > max) return value
  return Math.min(Math.max(value, min), max)
}

const getMenuOrigin = (clientX: number, clientY: number) => {
  if (typeof window === 'undefined') return { x: clientX, y: clientY }

  const inset = ICON_RADIUS_PX + SAFE_MARGIN_PX
  return {
    x: clamp(clientX, inset - HEART_ACTION.x, window.innerWidth - inset - HEART_ACTION.x),
    y: clamp(clientY, inset - HEART_ACTION.y, window.innerHeight - inset - HEART_ACTION.y),
  }
}

const isHeartSelected = (deltaX: number, deltaY: number) =>
  Math.hypot(deltaX - HEART_ACTION.x, deltaY - HEART_ACTION.y) <= SELECT_RADIUS_PX || deltaY < -52

function ChatImageHeartRadialMenu({
  open,
  originX,
  originY,
  selected,
  hearted,
}: {
  open: boolean
  originX: number
  originY: number
  selected: boolean
  hearted?: boolean
}) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="shadow-pin-radial-layer" data-testid="chat-image-radial-layer" aria-hidden="true">
      <div
        className="shadow-pin-radial-menu"
        style={{ left: originX, top: originY }}
        data-testid="chat-image-radial-menu"
        data-selected-action={selected ? 'heart' : ''}
      >
        <span className="shadow-pin-radial-thumb-dot" />
        <span
          className={cn('shadow-pin-radial-action', selected && 'shadow-pin-radial-action--selected')}
          style={{
            left: `${HEART_ACTION.x}px`,
            top: `${HEART_ACTION.y}px`,
          }}
          data-testid="chat-image-radial-action-heart"
          data-action="heart"
        >
          <Heart className={cn('h-5 w-5', hearted && 'fill-current')} />
          <span className="sr-only">{hearted ? 'Unlike image' : 'Heart image'}</span>
        </span>
      </div>
    </div>,
    document.body
  )
}

function ChatImageHeartFeedback({ feedbackKey }: { feedbackKey: number | null }) {
  if (feedbackKey === null) return null

  return (
    <span
      key={feedbackKey}
      className="shadow-pin-action-feedback shadow-pin-action-feedback--heart"
      data-testid="chat-image-heart-feedback"
      aria-hidden="true"
    >
      <span className="shadow-pin-action-wash" />
      <span className="shadow-pin-action-heart-burst">
        <span className="shadow-pin-action-heart-core">{'\u2764\uFE0F'}</span>
      </span>
      <span className="shadow-pin-action-confirm">
        <Heart className="h-5 w-5 fill-current" />
      </span>
    </span>
  )
}

export function ChatImageRadialHeart({
  children,
  hearted,
  heartCount = 0,
  disabled = false,
  tiltSide = 'right',
  className,
  onHeart,
  ...spanProps
}: ChatImageRadialHeartProps) {
  const pressRef = useRef<PressState | null>(null)
  const unlockGestureScrollRef = useRef<(() => void) | null>(null)
  const pressConsumedRef = useRef(false)
  const pressConsumedTimerRef = useRef<number | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)
  const feedbackKeyRef = useRef(0)
  const [radialState, setRadialState] = useState({
    open: false,
    originX: 0,
    originY: 0,
    selected: false,
  })
  const [feedbackKey, setFeedbackKey] = useState<number | null>(null)

  useEffect(() => () => {
    if (pressRef.current?.timerId) window.clearTimeout(pressRef.current.timerId)
    if (pressConsumedTimerRef.current) window.clearTimeout(pressConsumedTimerRef.current)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    unlockGestureScrollRef.current?.()
    unlockGestureScrollRef.current = null
  }, [])

  const unlockGestureScroll = () => {
    unlockGestureScrollRef.current?.()
    unlockGestureScrollRef.current = null
  }

  const lockGestureScroll = () => {
    if (typeof document === 'undefined' || unlockGestureScrollRef.current) return

    const root = document.documentElement
    const body = document.body
    const previousRootOverflow = root.style.overflow
    const previousRootTouchAction = root.style.touchAction
    const previousRootOverscrollBehavior = root.style.overscrollBehavior
    const previousBodyOverflow = body.style.overflow
    const previousBodyTouchAction = body.style.touchAction
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior

    root.style.overflow = 'hidden'
    root.style.touchAction = 'none'
    root.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    body.style.overscrollBehavior = 'none'

    const handleTouchMove = (event: TouchEvent) => {
      event.preventDefault()
    }

    const handlePointerMove = (event: PointerEvent) => {
      const press = pressRef.current
      if (!press?.active) return

      event.preventDefault()
      event.stopPropagation()
      setRadialState(state => state.open ? {
        ...state,
        selected: isHeartSelected(
          finitePointerCoordinate(event.clientX) - press.menuOriginX,
          finitePointerCoordinate(event.clientY) - press.menuOriginY
        ),
      } : state)
    }

    const listenerOptions: AddEventListenerOptions = { passive: false, capture: true }
    const removeOptions: EventListenerOptions = { capture: true }
    document.addEventListener('touchmove', handleTouchMove, listenerOptions)
    document.addEventListener('pointermove', handlePointerMove, listenerOptions)

    unlockGestureScrollRef.current = () => {
      document.removeEventListener('touchmove', handleTouchMove, removeOptions)
      document.removeEventListener('pointermove', handlePointerMove, removeOptions)
      root.style.overflow = previousRootOverflow
      root.style.touchAction = previousRootTouchAction
      root.style.overscrollBehavior = previousRootOverscrollBehavior
      body.style.overflow = previousBodyOverflow
      body.style.touchAction = previousBodyTouchAction
      body.style.overscrollBehavior = previousBodyOverscrollBehavior
    }
  }

  const clearPressTimer = () => {
    if (pressRef.current?.timerId) {
      window.clearTimeout(pressRef.current.timerId)
      pressRef.current.timerId = null
    }
  }

  const clearPress = () => {
    clearPressTimer()
    pressRef.current = null
  }

  const markPressConsumed = () => {
    pressConsumedRef.current = true
    if (pressConsumedTimerRef.current) window.clearTimeout(pressConsumedTimerRef.current)
    pressConsumedTimerRef.current = window.setTimeout(() => {
      pressConsumedRef.current = false
      pressConsumedTimerRef.current = null
    }, 420)
  }

  const resetPressConsumed = () => {
    pressConsumedRef.current = false
    if (pressConsumedTimerRef.current) {
      window.clearTimeout(pressConsumedTimerRef.current)
      pressConsumedTimerRef.current = null
    }
  }

  const showFeedback = () => {
    feedbackKeyRef.current += 1
    setFeedbackKey(feedbackKeyRef.current)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedbackKey(null)
      feedbackTimerRef.current = null
    }, 1180)
  }

  const releasePointerCapture = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const target = event.currentTarget
    const pointerId = event.pointerId
    if (typeof target.hasPointerCapture === 'function' && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled) return
    if (event.isPrimary === false) return
    if (typeof event.button === 'number' && event.button !== 0) return

    const pointerId = event.pointerId
    const startClientX = finitePointerCoordinate(event.clientX)
    const startClientY = finitePointerCoordinate(event.clientY)
    const menuOrigin = getMenuOrigin(startClientX, startClientY)
    const captureTarget = event.currentTarget

    clearPress()
    pressRef.current = {
      timerId: window.setTimeout(() => {
        if (!pressRef.current || pressRef.current.pointerId !== pointerId) return

        pressRef.current.active = true
        markPressConsumed()
        lockGestureScroll()

        if (typeof captureTarget.setPointerCapture === 'function') {
          try {
            captureTarget.setPointerCapture(pointerId)
          } catch {
            // Some mobile/browser test paths reject capture after the pointer has ended.
          }
        }

        setRadialState({
          open: true,
          originX: menuOrigin.x,
          originY: menuOrigin.y,
          selected: false,
        })
      }, LONG_PRESS_MS),
      pointerId,
      startClientX,
      startClientY,
      menuOriginX: menuOrigin.x,
      menuOriginY: menuOrigin.y,
      active: false,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return

    const clientX = finitePointerCoordinate(event.clientX)
    const clientY = finitePointerCoordinate(event.clientY)
    const deltaX = clientX - press.startClientX
    const deltaY = clientY - press.startClientY

    if (!press.active) {
      if (Math.hypot(deltaX, deltaY) > MOVE_CANCEL_PX) clearPress()
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setRadialState(state => state.open ? {
      ...state,
      selected: isHeartSelected(clientX - press.menuOriginX, clientY - press.menuOriginY),
    } : state)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return

    const wasActive = press.active
    const selected = wasActive
      ? isHeartSelected(
        finitePointerCoordinate(event.clientX) - press.menuOriginX,
        finitePointerCoordinate(event.clientY) - press.menuOriginY
      ) || radialState.selected
      : false

    clearPress()
    releasePointerCapture(event)

    if (!wasActive) return

    event.preventDefault()
    event.stopPropagation()
    setRadialState(state => ({ ...state, open: false, selected: false }))
    unlockGestureScroll()

    if (selected) {
      showFeedback()
      void onHeart()
    }
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLSpanElement>) => {
    clearPress()
    releasePointerCapture(event)
    setRadialState(state => ({ ...state, open: false, selected: false }))
    unlockGestureScroll()
  }

  const handleClickCapture = (event: ReactMouseEvent<HTMLSpanElement>) => {
    if (!pressConsumedRef.current) return
    resetPressConsumed()
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <span
      {...spanProps}
      className={cn(
        'chat-image-radial-heart-shell shadow-pin-action-card relative inline-block max-w-full rounded-[var(--radius-md)] align-top',
        radialState.open && 'shadow-pin-action-card--active',
        radialState.open && tiltSide === 'left' && 'shadow-pin-action-card--active-left',
        radialState.open && tiltSide === 'right' && 'shadow-pin-action-card--active-right',
        className
      )}
      onClickCapture={handleClickCapture}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {children}
      {heartCount > 0 && (
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 z-20 inline-flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.18)] bg-[rgba(4,5,6,0.72)] px-2 py-1 text-[0.7rem] font-semibold text-[var(--text-primary)] shadow-[0_8px_18px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <Heart className={cn('h-3.5 w-3.5 text-[#ff91af]', hearted && 'fill-current')} />
          <span>{heartCount}</span>
        </span>
      )}
      <ChatImageHeartFeedback feedbackKey={feedbackKey} />
      <ChatImageHeartRadialMenu
        open={radialState.open}
        originX={radialState.originX}
        originY={radialState.originY}
        selected={radialState.selected}
        hearted={hearted}
      />
    </span>
  )
}
