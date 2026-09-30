import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import { useComfortPreferences } from '../../hooks/useComfortPreferences'
import { claimGoldEasterEgg, type User } from '../../lib/supabase'
import { GOLD_EGG_DISCOVERY_REQUEST_EVENT } from './goldEggEvents'

const CELEBRATION_MS = 5600

type CelebrationState = {
  key: number
  displayName: string
  username?: string | null
}

const LazyGoldEggDiscoveryOverlay = lazy(() => import('./GoldEggDiscoveryOverlay').then(module => ({
  default: module.GoldEggDiscoveryOverlay,
})))

const getDisplayName = (user?: Pick<User, 'display_name' | 'username'> | null) =>
  user?.display_name || user?.username || 'Shadow'

export function GoldenEggDiscoveryController() {
  const { profile, refreshProfile } = useAuth()
  const { preferences: comfortPreferences } = useComfortPreferences()
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

    if (comfortPreferences.haptics && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
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

  return celebration ? (
    <Suspense fallback={(
      <div className="sr-only" role="status" aria-live="polite">
        Golden egg celebration loading for {celebration.displayName}.
      </div>
    )}>
      <LazyGoldEggDiscoveryOverlay key={celebration.key} celebration={celebration} />
    </Suspense>
  ) : null
}
