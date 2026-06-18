import { useEffect, useRef, useState } from 'react'
import type { HTMLAttributes, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { Heart, Maximize2, Share2 } from 'lucide-react'
import { cn } from '../../lib/utils'

type ChatImageQuickAction = 'share' | 'heart' | 'open'
type ChatImageActionSide = 'left' | 'right'
type ChatImageActionConfig = {
  id: ChatImageQuickAction
  label: string
  x: number
  y: number
  icon: LucideIcon
}

type ChatImageRadialHeartProps = {
  children: ReactNode
  hearted?: boolean
  heartCount?: number
  disabled?: boolean
  tiltSide?: 'left' | 'right'
  onHeart: () => void | Promise<void>
  onOpen?: () => void | Promise<void>
  onShare?: () => void | Promise<void>
} & Omit<
  HTMLAttributes<HTMLSpanElement>,
  'children' | 'onClickCapture' | 'onContextMenu' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
>

const LONG_PRESS_MS = 440
const MOVE_CANCEL_PX = 14
const SELECT_RADIUS_PX = 48
const SAFE_MARGIN_PX = 18
const ICON_RADIUS_PX = 28
const ACTION_ARC_RADIUS_PX = 104

const mirrorAction = (action: ChatImageActionConfig): ChatImageActionConfig => ({
  ...action,
  x: -action.x,
})

const makeActions = (actions: ChatImageActionConfig[], side: ChatImageActionSide) =>
  side === 'right' ? actions : actions.map(mirrorAction)

const arcAction = (
  id: ChatImageQuickAction,
  label: string,
  angleDeg: number,
  icon: LucideIcon
): ChatImageActionConfig => {
  const angle = angleDeg * Math.PI / 180
  return {
    id,
    label,
    x: Math.round(Math.cos(angle) * ACTION_ARC_RADIUS_PX),
    y: Math.round(Math.sin(angle) * ACTION_ARC_RADIUS_PX),
    icon,
  }
}

const BASE_ACTIONS_RIGHT: ChatImageActionConfig[] = [
  arcAction('share', 'Share image', -96, Share2),
  arcAction('heart', 'Heart image', -60, Heart),
  arcAction('open', 'Open full screen', -24, Maximize2),
]
const CHAT_IMAGE_ACTIONS: Record<ChatImageActionSide, ChatImageActionConfig[]> = {
  left: makeActions(BASE_ACTIONS_RIGHT, 'left'),
  right: makeActions(BASE_ACTIONS_RIGHT, 'right'),
}

type PressState = {
  timerId: number | null
  pointerId: number
  startClientX: number
  startClientY: number
  menuOriginX: number
  menuOriginY: number
  active: boolean
  actions: ChatImageActionConfig[]
}

const finitePointerCoordinate = (value: number) => Number.isFinite(value) ? value : 0

const clamp = (value: number, min: number, max: number) => {
  if (min > max) return value
  return Math.min(Math.max(value, min), max)
}

const getMenuOrigin = (clientX: number, clientY: number, actions: ChatImageActionConfig[]) => {
  if (typeof window === 'undefined' || actions.length === 0) return { x: clientX, y: clientY }

  const minOffsetX = Math.min(...actions.map(action => action.x))
  const maxOffsetX = Math.max(...actions.map(action => action.x))
  const minOffsetY = Math.min(...actions.map(action => action.y))
  const maxOffsetY = Math.max(...actions.map(action => action.y))
  const inset = ICON_RADIUS_PX + SAFE_MARGIN_PX
  return {
    x: clamp(clientX, inset - minOffsetX, window.innerWidth - inset - maxOffsetX),
    y: clamp(clientY, inset - minOffsetY, window.innerHeight - inset - maxOffsetY),
  }
}

const getNearestAction = (
  deltaX: number,
  deltaY: number,
  actions: ChatImageActionConfig[]
): ChatImageQuickAction | null => {
  let nearestId: ChatImageQuickAction | null = null
  let nearestDistance = Infinity

  for (const action of actions) {
    const distance = Math.hypot(deltaX - action.x, deltaY - action.y)
    if (distance < nearestDistance) {
      nearestId = action.id
      nearestDistance = distance
    }
  }

  return nearestId && (nearestDistance <= SELECT_RADIUS_PX || deltaY < -52)
    ? nearestId
    : null
}

function ChatImageRadialMenu({
  open,
  originX,
  originY,
  selected,
  hearted,
  actions,
}: {
  open: boolean
  originX: number
  originY: number
  selected: ChatImageQuickAction | null
  hearted?: boolean
  actions: ChatImageActionConfig[]
}) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="shadow-pin-radial-layer" data-testid="chat-image-radial-layer" aria-hidden="true">
      <div
        className="shadow-pin-radial-menu"
        style={{ left: originX, top: originY }}
        data-testid="chat-image-radial-menu"
        data-selected-action={selected ?? ''}
      >
        <span className="shadow-pin-radial-thumb-dot" />
        {actions.map(action => {
          const Icon = action.icon
          const isSelected = selected === action.id
          const label = action.id === 'heart' && hearted ? 'Unlike image' : action.label

          return (
            <span
              key={action.id}
              className={cn('shadow-pin-radial-action', isSelected && 'shadow-pin-radial-action--selected')}
              style={{
                left: `${action.x}px`,
                top: `${action.y}px`,
              }}
              data-testid={`chat-image-radial-action-${action.id}`}
              data-action={action.id}
            >
              <Icon className={cn('h-5 w-5', action.id === 'heart' && hearted && 'fill-current')} />
              <span className="sr-only">{label}</span>
            </span>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

function ChatImageActionFeedback({
  feedback,
}: {
  feedback: { key: number; action: ChatImageQuickAction } | null
}) {
  if (!feedback) return null

  const Icon = feedback.action === 'share'
    ? Share2
    : feedback.action === 'open'
    ? Maximize2
    : Heart

  return (
    <span
      key={`${feedback.action}-${feedback.key}`}
      className={cn('chat-image-action-feedback shadow-pin-action-feedback', `shadow-pin-action-feedback--${feedback.action}`)}
      data-testid={`chat-image-${feedback.action}-feedback`}
      aria-hidden="true"
    >
      <span className="shadow-pin-action-wash" />
      {feedback.action === 'heart' && (
        <span className="shadow-pin-action-heart-burst">
          <span className="shadow-pin-action-heart-core">{'\u2764\uFE0F'}</span>
        </span>
      )}
      <span className="shadow-pin-action-confirm">
        <Icon className={cn('h-5 w-5', feedback.action === 'heart' && 'fill-current')} />
      </span>
    </span>
  )
}

const getActionSideForTilt = (tiltSide: 'left' | 'right'): ChatImageActionSide =>
  tiltSide === 'left' ? 'right' : 'left'

export function ChatImageRadialHeart({
  children,
  hearted,
  heartCount = 0,
  disabled = false,
  tiltSide = 'right',
  className,
  onHeart,
  onOpen,
  onShare,
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
    selected: null as ChatImageQuickAction | null,
    actions: [] as ChatImageActionConfig[],
  })
  const [feedback, setFeedback] = useState<{ key: number; action: ChatImageQuickAction } | null>(null)

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
    const previousRootUserSelect = root.style.userSelect
    const previousRootWebkitUserSelect = root.style.getPropertyValue('-webkit-user-select')
    const previousRootWebkitTouchCallout = root.style.getPropertyValue('-webkit-touch-callout')
    const previousBodyOverflow = body.style.overflow
    const previousBodyTouchAction = body.style.touchAction
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior
    const previousBodyUserSelect = body.style.userSelect
    const previousBodyWebkitUserSelect = body.style.getPropertyValue('-webkit-user-select')
    const previousBodyWebkitTouchCallout = body.style.getPropertyValue('-webkit-touch-callout')

    root.style.overflow = 'hidden'
    root.style.touchAction = 'none'
    root.style.overscrollBehavior = 'none'
    root.style.userSelect = 'none'
    root.style.setProperty('-webkit-user-select', 'none')
    root.style.setProperty('-webkit-touch-callout', 'none')
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    body.style.overscrollBehavior = 'none'
    body.style.userSelect = 'none'
    body.style.setProperty('-webkit-user-select', 'none')
    body.style.setProperty('-webkit-touch-callout', 'none')
    window.getSelection?.()?.removeAllRanges()

    const handleTouchMove = (event: TouchEvent) => {
      event.preventDefault()
    }

    const handleSelectStart = (event: Event) => {
      event.preventDefault()
      window.getSelection?.()?.removeAllRanges()
    }

    const handlePointerMove = (event: PointerEvent) => {
      const press = pressRef.current
      if (!press?.active) return

      event.preventDefault()
      event.stopPropagation()
      setRadialState(state => state.open ? {
        ...state,
        selected: getNearestAction(
          finitePointerCoordinate(event.clientX) - press.menuOriginX,
          finitePointerCoordinate(event.clientY) - press.menuOriginY,
          press.actions
        ),
      } : state)
    }

    const listenerOptions: AddEventListenerOptions = { passive: false, capture: true }
    const removeOptions: EventListenerOptions = { capture: true }
    document.addEventListener('touchmove', handleTouchMove, listenerOptions)
    document.addEventListener('pointermove', handlePointerMove, listenerOptions)
    document.addEventListener('selectstart', handleSelectStart, listenerOptions)

    unlockGestureScrollRef.current = () => {
      document.removeEventListener('touchmove', handleTouchMove, removeOptions)
      document.removeEventListener('pointermove', handlePointerMove, removeOptions)
      document.removeEventListener('selectstart', handleSelectStart, removeOptions)
      root.style.overflow = previousRootOverflow
      root.style.touchAction = previousRootTouchAction
      root.style.overscrollBehavior = previousRootOverscrollBehavior
      root.style.userSelect = previousRootUserSelect
      root.style.setProperty('-webkit-user-select', previousRootWebkitUserSelect)
      root.style.setProperty('-webkit-touch-callout', previousRootWebkitTouchCallout)
      body.style.overflow = previousBodyOverflow
      body.style.touchAction = previousBodyTouchAction
      body.style.overscrollBehavior = previousBodyOverscrollBehavior
      body.style.userSelect = previousBodyUserSelect
      body.style.setProperty('-webkit-user-select', previousBodyWebkitUserSelect)
      body.style.setProperty('-webkit-touch-callout', previousBodyWebkitTouchCallout)
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

  const showFeedback = (action: ChatImageQuickAction) => {
    feedbackKeyRef.current += 1
    setFeedback({ key: feedbackKeyRef.current, action })
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null)
      feedbackTimerRef.current = null
    }, 1180)
  }

  const runAction = (action: ChatImageQuickAction) => {
    showFeedback(action)
    if (action === 'heart') {
      void onHeart()
      return
    }
    if (action === 'open') {
      void onOpen?.()
      return
    }
    if (action === 'share') {
      void onShare?.()
    }
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
    const actions = CHAT_IMAGE_ACTIONS[getActionSideForTilt(tiltSide)]
    const menuOrigin = getMenuOrigin(startClientX, startClientY, actions)
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
          selected: null,
          actions,
        })
      }, LONG_PRESS_MS),
      pointerId,
      startClientX,
      startClientY,
      menuOriginX: menuOrigin.x,
      menuOriginY: menuOrigin.y,
      active: false,
      actions,
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
      selected: getNearestAction(clientX - press.menuOriginX, clientY - press.menuOriginY, press.actions),
    } : state)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return

    const wasActive = press.active
    const selected = wasActive
      ? getNearestAction(
        finitePointerCoordinate(event.clientX) - press.menuOriginX,
        finitePointerCoordinate(event.clientY) - press.menuOriginY,
        press.actions
      ) || radialState.selected
      : null

    clearPress()
    releasePointerCapture(event)

    if (!wasActive) return

    event.preventDefault()
    event.stopPropagation()
    setRadialState(state => ({ ...state, open: false, selected: null }))
    unlockGestureScroll()

    if (selected) {
      runAction(selected)
    }
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLSpanElement>) => {
    clearPress()
    releasePointerCapture(event)
    setRadialState(state => ({ ...state, open: false, selected: null }))
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
      <ChatImageActionFeedback feedback={feedback} />
      <ChatImageRadialMenu
        open={radialState.open}
        originX={radialState.originX}
        originY={radialState.originY}
        selected={radialState.selected}
        hearted={hearted}
        actions={radialState.actions}
      />
    </span>
  )
}
