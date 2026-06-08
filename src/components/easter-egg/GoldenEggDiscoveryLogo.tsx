import React, { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { GOLD_EGG_DISCOVERY_REQUEST_EVENT } from './goldEggEvents'

const HOLD_TO_DISCOVER_MS = 1300

const isMobileDiscoveryPointer = (event: React.PointerEvent<HTMLElement>) => {
  if (typeof window === 'undefined') return false
  const isPhoneWidth = window.matchMedia('(max-width: 767px)').matches
  const isTouchPointer = event.pointerType === 'touch' || event.pointerType === 'pen'
  return isPhoneWidth && isTouchPointer
}

export function GoldenEggDiscoveryLogo({
  className,
  imageClassName,
}: {
  className?: string
  imageClassName?: string
}) {
  const [isHolding, setIsHolding] = useState(false)
  const holdTimerRef = useRef<number | null>(null)

  const clearHold = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    setIsHolding(false)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isMobileDiscoveryPointer(event)) {
      return
    }

    event.preventDefault()

    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    setIsHolding(true)
    holdTimerRef.current = window.setTimeout(() => {
      clearHold()
      window.dispatchEvent(new CustomEvent(GOLD_EGG_DISCOVERY_REQUEST_EVENT))
    }, HOLD_TO_DISCOVER_MS)
  }

  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current)
        holdTimerRef.current = null
      }
    }
  }, [])

  return (
    <button
      type="button"
      aria-label="SHADO"
      data-testid="gold-egg-logo-trigger"
      onPointerDown={handlePointerDown}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onPointerLeave={clearHold}
      onContextMenu={event => event.preventDefault()}
      className={cn(
        'gold-egg-logo-trigger relative h-10 w-10 shrink-0 overflow-visible rounded-[0.8rem] border border-[rgba(215,170,70,0.22)] bg-[#070809] shadow-[0_10px_24px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] md:h-11 md:w-11',
        isHolding && 'gold-egg-logo-trigger--holding',
        className
      )}
    >
      <img
        src="/icons/app-icon-512.png"
        alt="SHADO"
        draggable={false}
        onDragStart={event => event.preventDefault()}
        className={cn(
          'theme-logo absolute inset-0 h-full w-full rounded-[0.74rem] object-cover drop-shadow-[0_8px_18px_rgba(0,0,0,0.28)]',
          imageClassName
        )}
      />
    </button>
  )
}
