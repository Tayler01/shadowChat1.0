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
        'gold-egg-logo-trigger relative -ml-3.5 h-8 w-16 shrink-0 overflow-visible min-[380px]:-ml-3 min-[380px]:w-20 md:ml-0',
        isHolding && 'gold-egg-logo-trigger--holding',
        className
      )}
    >
      <img
        src="/icons/header-logo.png"
        alt="SHADO"
        draggable={false}
        className={cn(
          'theme-logo absolute left-0 top-1/2 h-12 w-28 origin-left -translate-y-1/2 scale-[1.18] object-contain object-left min-[380px]:h-14 min-[380px]:w-32',
          imageClassName
        )}
      />
    </button>
  )
}
