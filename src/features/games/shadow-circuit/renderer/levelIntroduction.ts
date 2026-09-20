export const FLYOVER_MS = 2800
export const COUNTDOWN_MS = 3000
export function introductionAt(elapsed: number, reducedMotion: boolean) {
  const flyover = reducedMotion ? 0 : FLYOVER_MS
  return {
    progress: flyover ? Math.min(1, Math.max(0, elapsed / flyover)) : 1,
    count: Math.max(0, Math.min(3, Math.ceil((flyover + COUNTDOWN_MS - elapsed) / 1000))),
    phase: elapsed < flyover ? 'cinematic' : elapsed < flyover + COUNTDOWN_MS ? 'countdown' : 'playing',
  } as const
}
