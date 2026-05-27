import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Egg, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import { claimGoldEasterEgg, type User } from '../../lib/supabase'
import { GoldEasterEggBadge } from '../ui/GoldEasterEggBadge'
import { GOLD_EGG_DISCOVERY_REQUEST_EVENT } from './goldEggEvents'

const CELEBRATION_MS = 4200

type CelebrationState = {
  key: number
  displayName: string
  username?: string | null
}

const getDisplayName = (user?: Pick<User, 'display_name' | 'username'> | null) =>
  user?.display_name || user?.username || 'Shadow'

function GoldEggDiscoveryOverlay({ celebration }: { celebration: CelebrationState }) {
  const particles = useMemo(
    () => Array.from({ length: 22 }, (_, index) => {
      const angle = (index / 22) * Math.PI * 2
      const distance = index % 3 === 0 ? 128 : index % 2 === 0 ? 104 : 82
      return {
        id: index,
        x: `${Math.cos(angle) * distance}px`,
        y: `${Math.sin(angle) * distance}px`,
        delay: `${(index % 7) * 42}ms`,
        size: `${index % 4 === 0 ? 7 : 5}px`,
      }
    }),
    []
  )

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="gold-egg-discovery" role="status" aria-live="polite" data-testid="gold-egg-discovery-overlay">
      <div className="gold-egg-discovery__aurora" aria-hidden="true" />
      <div className="gold-egg-discovery__ring gold-egg-discovery__ring--one" aria-hidden="true" />
      <div className="gold-egg-discovery__ring gold-egg-discovery__ring--two" aria-hidden="true" />
      <div className="gold-egg-discovery__ring gold-egg-discovery__ring--three" aria-hidden="true" />
      {particles.map(particle => (
        <span
          key={particle.id}
          className="gold-egg-discovery__particle"
          style={{
            '--gold-egg-particle-x': particle.x,
            '--gold-egg-particle-y': particle.y,
            '--gold-egg-particle-delay': particle.delay,
            '--gold-egg-particle-size': particle.size,
          } as React.CSSProperties}
          aria-hidden="true"
        />
      ))}
      <div className="gold-egg-discovery__content">
        <div className="gold-egg-discovery__spark gold-egg-discovery__spark--left" aria-hidden="true">
          <Sparkles className="h-full w-full" />
        </div>
        <div className="gold-egg-discovery__egg" aria-hidden="true">
          <Egg className="h-16 w-16" />
        </div>
        <div className="gold-egg-discovery__spark gold-egg-discovery__spark--right" aria-hidden="true">
          <Sparkles className="h-full w-full" />
        </div>
        <p className="gold-egg-discovery__eyebrow">Discovery Unlocked</p>
        <h2 className="gold-egg-discovery__title">Golden Egg Found</h2>
        <p className="gold-egg-discovery__name">
          <span className="truncate">{celebration.displayName}</span>
          <GoldEasterEggBadge active className="h-6 w-6" />
        </p>
        {celebration.username && (
          <p className="gold-egg-discovery__handle">@{celebration.username}</p>
        )}
      </div>
    </div>,
    document.body
  )
}

export function GoldenEggDiscoveryController() {
  const { profile, refreshProfile } = useAuth()
  const [celebration, setCelebration] = useState<CelebrationState | null>(null)
  const celebrationTimerRef = useRef<number | null>(null)
  const awardingRef = useRef(false)

  const showCelebration = (nextProfile?: User | null) => {
    const awardedProfile = nextProfile || profile
    const state = {
      key: Date.now(),
      displayName: getDisplayName(awardedProfile),
      username: awardedProfile?.username,
    }
    setCelebration(state)
    window.dispatchEvent(new CustomEvent('shadowchat:gold-egg-found', {
      detail: {
        userId: awardedProfile?.id,
        username: awardedProfile?.username,
      },
    }))

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([18, 32, 28])
    }

    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current)
    }
    celebrationTimerRef.current = window.setTimeout(() => {
      setCelebration(null)
      celebrationTimerRef.current = null
    }, CELEBRATION_MS)
  }

  const claimEgg = async () => {
    if (awardingRef.current || !profile || profile.gold_easter_egg) return

    awardingRef.current = true
    try {
      await claimGoldEasterEgg()
      const nextProfile = await refreshProfile()
      showCelebration(nextProfile)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The golden egg slipped away. Try again.'
      toast.error(message)
    } finally {
      awardingRef.current = false
    }
  }

  useEffect(() => {
    const handleDiscoveryRequest = () => {
      void claimEgg()
    }

    window.addEventListener(GOLD_EGG_DISCOVERY_REQUEST_EVENT, handleDiscoveryRequest)
    return () => {
      window.removeEventListener(GOLD_EGG_DISCOVERY_REQUEST_EVENT, handleDiscoveryRequest)
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current)
      }
    }
  })

  return celebration ? <GoldEggDiscoveryOverlay key={celebration.key} celebration={celebration} /> : null
}
