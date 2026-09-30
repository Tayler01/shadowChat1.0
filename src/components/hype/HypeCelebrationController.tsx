import { lazy, Suspense } from 'react'
import { useHype } from '../../hooks/useHype'

const HypeCelebrationOverlay = lazy(() => import('./HypeCelebrationOverlay').then(module => ({
  default: module.HypeCelebrationOverlay,
})))

export function HypeCelebrationController() {
  const { activeCelebration } = useHype()
  if (!activeCelebration) return null

  return (
    <Suspense fallback={null}>
      <HypeCelebrationOverlay />
    </Suspense>
  )
}
