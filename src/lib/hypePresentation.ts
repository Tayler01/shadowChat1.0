export const getHypeTier = (count = 0) => {
  if (count >= 5) return 5
  if (count >= 4) return 4
  if (count >= 3) return 3
  if (count >= 2) return 2
  if (count > 0) return 1
  return 0
}

export type HypeCelebrationMode = 'live' | 'catchup'
export type HypeCelebrationPresentation = 'compact' | 'fullscreen'

type HypeCelebrationPresentationOptions = {
  mode: HypeCelebrationMode
  intensity: number
  prefersReducedMotion?: boolean
}

type HypeDisplayDurationOptions = HypeCelebrationPresentationOptions & {
  isPhone?: boolean
}

export const getHypeCelebrationPresentation = ({
  mode,
  intensity,
  prefersReducedMotion = false,
}: HypeCelebrationPresentationOptions): HypeCelebrationPresentation => {
  if (prefersReducedMotion || mode === 'catchup') return 'compact'
  return getHypeTier(intensity) >= 3 ? 'fullscreen' : 'compact'
}

export const getHypeDisplayDurationMs = ({
  mode,
  intensity,
  prefersReducedMotion = false,
  isPhone = false,
}: HypeDisplayDurationOptions) => {
  if (prefersReducedMotion) return 2_000

  const presentation = getHypeCelebrationPresentation({ mode, intensity })
  if (presentation === 'compact') return isPhone ? 2_400 : 3_000
  return isPhone ? 3_200 : 4_600
}
