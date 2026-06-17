import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '../../lib/utils'

const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_ZOOM = 2.35

type Point = {
  x: number
  y: number
}

type Transform = {
  scale: number
  x: number
  y: number
}

type StoredPointer = Point & {
  pointerId: number
}

type GestureState =
  | {
      type: 'pan'
      pointerId: number
      startPointer: Point
      startTransform: Transform
    }
  | {
      type: 'pinch'
      pointerIds: [number, number]
      startDistance: number
      startScale: number
      contentAtMidpoint: Point
    }

interface ZoomableImageFrameProps {
  children: React.ReactNode
  className?: string
  contentClassName?: string
  resetKey?: string | number
  resetLabel?: string
}

const initialTransform: Transform = { scale: 1, x: 0, y: 0 }

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const getDistance = (first: Point, second: Point) =>
  Math.hypot(second.x - first.x, second.y - first.y)

const getMidpoint = (first: Point, second: Point): Point => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
})

export const ZoomableImageFrame: React.FC<ZoomableImageFrameProps> = ({
  children,
  className,
  contentClassName,
  resetKey,
  resetLabel = 'Reset image zoom',
}) => {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const pointersRef = useRef<Map<number, StoredPointer>>(new Map())
  const gestureRef = useRef<GestureState | null>(null)
  const transformRef = useRef<Transform>(initialTransform)
  const [transform, setTransform] = useState<Transform>(initialTransform)

  const setClampedTransform = useCallback((next: Transform) => {
    const frame = frameRef.current
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE)
    const maxX = frame ? (frame.clientWidth * (scale - 1)) / 2 : 0
    const maxY = frame ? (frame.clientHeight * (scale - 1)) / 2 : 0
    const clamped = scale <= MIN_SCALE
      ? initialTransform
      : {
          scale,
          x: clamp(next.x, -maxX, maxX),
          y: clamp(next.y, -maxY, maxY),
        }

    transformRef.current = clamped
    setTransform(clamped)
  }, [])

  const reset = useCallback(() => {
    pointersRef.current.clear()
    gestureRef.current = null
    setClampedTransform(initialTransform)
  }, [setClampedTransform])

  useEffect(() => {
    reset()
  }, [reset, resetKey])

  const getLocalPoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = frameRef.current?.getBoundingClientRect()
    return {
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
    }
  }, [])

  const startPinch = useCallback(() => {
    const pointers = Array.from(pointersRef.current.values()).slice(0, 2)
    if (pointers.length < 2) return

    const [first, second] = pointers
    const midpoint = getMidpoint(first, second)
    const start = transformRef.current
    const startDistance = getDistance(first, second)
    if (startDistance <= 0) return

    gestureRef.current = {
      type: 'pinch',
      pointerIds: [first.pointerId, second.pointerId],
      startDistance,
      startScale: start.scale,
      contentAtMidpoint: {
        x: (midpoint.x - start.x) / start.scale,
        y: (midpoint.y - start.y) / start.scale,
      },
    }
  }, [])

  const startPan = useCallback((pointer: StoredPointer) => {
    gestureRef.current = {
      type: 'pan',
      pointerId: pointer.pointerId,
      startPointer: pointer,
      startTransform: transformRef.current,
    }
  }, [])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return

    const point = getLocalPoint(event.clientX, event.clientY)
    const pointer = { pointerId: event.pointerId, ...point }
    pointersRef.current.set(event.pointerId, pointer)
    event.currentTarget.setPointerCapture?.(event.pointerId)

    if (pointersRef.current.size >= 2) {
      startPinch()
    } else if (transformRef.current.scale > MIN_SCALE) {
      startPan(pointer)
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return

    const point = getLocalPoint(event.clientX, event.clientY)
    pointersRef.current.set(event.pointerId, { pointerId: event.pointerId, ...point })

    const gesture = gestureRef.current
    if (!gesture) return

    if (gesture.type === 'pinch') {
      const first = pointersRef.current.get(gesture.pointerIds[0])
      const second = pointersRef.current.get(gesture.pointerIds[1])
      if (!first || !second) return

      const distance = getDistance(first, second)
      const midpoint = getMidpoint(first, second)
      const nextScale = clamp(gesture.startScale * (distance / gesture.startDistance), MIN_SCALE, MAX_SCALE)
      setClampedTransform({
        scale: nextScale,
        x: midpoint.x - gesture.contentAtMidpoint.x * nextScale,
        y: midpoint.y - gesture.contentAtMidpoint.y * nextScale,
      })
      return
    }

    const pointer = pointersRef.current.get(gesture.pointerId)
    if (!pointer) return

    setClampedTransform({
      scale: gesture.startTransform.scale,
      x: gesture.startTransform.x + pointer.x - gesture.startPointer.x,
      y: gesture.startTransform.y + pointer.y - gesture.startPointer.y,
    })
  }

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    event.currentTarget.releasePointerCapture?.(event.pointerId)

    const remaining = Array.from(pointersRef.current.values())
    if (remaining.length >= 2) {
      startPinch()
    } else if (remaining.length === 1 && transformRef.current.scale > MIN_SCALE) {
      startPan(remaining[0])
    } else {
      gestureRef.current = null
    }
  }

  const zoomAtPoint = useCallback((point: Point, nextScale: number) => {
    const current = transformRef.current
    const contentPoint = {
      x: (point.x - current.x) / current.scale,
      y: (point.y - current.y) / current.scale,
    }
    setClampedTransform({
      scale: nextScale,
      x: point.x - contentPoint.x * nextScale,
      y: point.y - contentPoint.y * nextScale,
    })
  }, [setClampedTransform])

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (transformRef.current.scale > MIN_SCALE) {
      reset()
      return
    }
    zoomAtPoint(getLocalPoint(event.clientX, event.clientY), DOUBLE_TAP_ZOOM)
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && transformRef.current.scale <= MIN_SCALE) return
    event.preventDefault()
    const delta = event.deltaY > 0 ? 0.88 : 1.12
    zoomAtPoint(getLocalPoint(event.clientX, event.clientY), transformRef.current.scale * delta)
  }

  return (
    <div
      ref={frameRef}
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden touch-none select-none',
        transform.scale > MIN_SCALE ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
        className
      )}
      data-zoomable-image-frame="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
    >
      <div
        className={cn('flex h-full w-full origin-top-left items-center justify-center will-change-transform', contentClassName)}
        data-zoomable-image-content="true"
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          transition: gestureRef.current ? 'none' : 'transform 160ms ease-out',
        }}
      >
        {children}
      </div>
      {transform.scale > MIN_SCALE && (
        <button
          type="button"
          onClick={reset}
          className="absolute bottom-3 right-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(5,6,8,0.78)] text-[var(--text-primary)] shadow-[0_12px_26px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:bg-[rgba(255,255,255,0.12)]"
          aria-label={resetLabel}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
