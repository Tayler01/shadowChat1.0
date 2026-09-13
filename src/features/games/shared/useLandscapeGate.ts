import React from 'react'

type OrientationWindow = Window & typeof globalThis & {
  orientation?: number
}

type ViewportOrientation = 'landscape' | 'portrait' | 'unknown'

const ORIENTATION_DIMENSION_TOLERANCE_PX = 2
const ORIENTATION_RECHECK_DELAYS_MS = [80, 180, 360, 700] as const

function normalizeOrientationAngle(angle?: number) {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) return null
  return ((angle % 360) + 360) % 360
}

function getDimensionOrientation(width?: number, height?: number): ViewportOrientation {
  if (
    typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    return 'unknown'
  }

  if (width > height + ORIENTATION_DIMENSION_TOLERANCE_PX) return 'landscape'
  if (height > width + ORIENTATION_DIMENSION_TOLERANCE_PX) return 'portrait'
  return 'unknown'
}

function getViewportMediaOrientation(): ViewportOrientation {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'unknown'

  const landscape = window.matchMedia('(orientation: landscape)').matches
  const portrait = window.matchMedia('(orientation: portrait)').matches

  if (landscape && !portrait) return 'landscape'
  if (portrait && !landscape) return 'portrait'
  return 'unknown'
}

function getViewportDimensionOrientation(): ViewportOrientation {
  if (typeof window === 'undefined') return 'unknown'

  const viewport = window.visualViewport
  const documentElement = document.documentElement
  const orientations = [
    getDimensionOrientation(viewport?.width, viewport?.height),
    getDimensionOrientation(window.innerWidth, window.innerHeight),
    getDimensionOrientation(documentElement?.clientWidth, documentElement?.clientHeight),
  ]

  const landscapeCount = orientations.filter(orientation => orientation === 'landscape').length
  const portraitCount = orientations.filter(orientation => orientation === 'portrait').length

  if (landscapeCount > portraitCount) return 'landscape'
  if (portraitCount > landscapeCount) return 'portrait'
  return 'unknown'
}

function getScreenOrientationFallback(): ViewportOrientation {
  if (typeof window === 'undefined') return 'unknown'

  const orientation = window.screen.orientation
  const orientationType = orientation?.type ?? ''
  const orientationAngle = normalizeOrientationAngle(orientation?.angle)
  const legacyOrientation = normalizeOrientationAngle((window as OrientationWindow).orientation)

  if (orientationType.includes('landscape')) return 'landscape'
  if (orientationType.includes('portrait')) return 'portrait'

  if (orientationAngle === 90 || orientationAngle === 270) return 'landscape'
  if (orientationAngle === 0 || orientationAngle === 180) return 'portrait'

  if (legacyOrientation === 90 || legacyOrientation === 270) return 'landscape'
  if (legacyOrientation === 0 || legacyOrientation === 180) return 'portrait'

  return 'unknown'
}

function getCurrentViewportOrientation(): ViewportOrientation {
  const dimensionOrientation = getViewportDimensionOrientation()
  if (dimensionOrientation !== 'unknown') return dimensionOrientation

  const mediaOrientation = getViewportMediaOrientation()
  if (mediaOrientation !== 'unknown') return mediaOrientation

  return getScreenOrientationFallback()
}

function isLandscapeViewport() {
  return getCurrentViewportOrientation() === 'landscape'
}

export function useLandscapeGate() {
  const [showRotateGate, setShowRotateGate] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return !isLandscapeViewport()
  })

  React.useEffect(() => {
    let animationFrame: number | null = null
    let settlingAnimationFrame: number | null = null
    const timeoutIds = new Set<number>()
    const viewport = window.visualViewport
    const orientation = window.screen.orientation
    const orientationQueries = typeof window.matchMedia === 'function'
      ? [
          window.matchMedia('(orientation: landscape)'),
          window.matchMedia('(orientation: portrait)'),
        ]
      : []

    const clearDeferredUpdates = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = null
      }

      if (settlingAnimationFrame !== null) {
        window.cancelAnimationFrame(settlingAnimationFrame)
        settlingAnimationFrame = null
      }

      timeoutIds.forEach(timeoutId => window.clearTimeout(timeoutId))
      timeoutIds.clear()
    }

    const updateGate = () => {
      setShowRotateGate(current => {
        const next = !isLandscapeViewport()
        return current === next ? current : next
      })
    }

    const scheduleGateUpdate = () => {
      clearDeferredUpdates()
      updateGate()

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null
        updateGate()

        settlingAnimationFrame = window.requestAnimationFrame(() => {
          settlingAnimationFrame = null
          updateGate()
        })
      })

      ORIENTATION_RECHECK_DELAYS_MS.forEach(delay => {
        const timeoutId = window.setTimeout(() => {
          timeoutIds.delete(timeoutId)
          updateGate()
        }, delay)

        timeoutIds.add(timeoutId)
      })
    }

    const handleOrientationSignal = () => scheduleGateUpdate()

    const addMediaQueryListener = (query: MediaQueryList) => {
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', handleOrientationSignal)
        return
      }

      query.addListener?.(handleOrientationSignal)
    }

    const removeMediaQueryListener = (query: MediaQueryList) => {
      if (typeof query.removeEventListener === 'function') {
        query.removeEventListener('change', handleOrientationSignal)
        return
      }

      query.removeListener?.(handleOrientationSignal)
    }

    scheduleGateUpdate()
    window.addEventListener('resize', handleOrientationSignal)
    window.addEventListener('orientationchange', handleOrientationSignal)
    window.addEventListener('pageshow', handleOrientationSignal)
    document.addEventListener('visibilitychange', handleOrientationSignal)
    viewport?.addEventListener('resize', handleOrientationSignal)
    viewport?.addEventListener('scroll', handleOrientationSignal)
    orientation?.addEventListener('change', handleOrientationSignal)
    orientationQueries.forEach(addMediaQueryListener)

    return () => {
      clearDeferredUpdates()
      window.removeEventListener('resize', handleOrientationSignal)
      window.removeEventListener('orientationchange', handleOrientationSignal)
      window.removeEventListener('pageshow', handleOrientationSignal)
      document.removeEventListener('visibilitychange', handleOrientationSignal)
      viewport?.removeEventListener('resize', handleOrientationSignal)
      viewport?.removeEventListener('scroll', handleOrientationSignal)
      orientation?.removeEventListener('change', handleOrientationSignal)
      orientationQueries.forEach(removeMediaQueryListener)
    }
  }, [])

  return showRotateGate
}
