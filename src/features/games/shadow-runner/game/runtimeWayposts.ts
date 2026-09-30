import type { ShadowRunnerCheckpoint, ShadowRunnerLevelConfig } from './levels'

export const SHADOW_RUNNER_WAYPOST_TEXTURE = 'shadow-runner-courier-waypost'
const POST_HEIGHT = 110
const POST_WIDTH = POST_HEIGHT * 64 / 176

export function getShadowRunnerWaypostPlacement(level: ShadowRunnerLevelConfig, checkpoint: ShadowRunnerCheckpoint) {
  const surfaces = level.platforms.filter(platform => !platform.hidden)
  const blockers = [...surfaces, ...(level.crouchGates ?? [])]
  const triggerWidth = checkpoint.triggerWidth ?? 160
  // Prefer the trigger's near edge, but keep the whole post clear of roofs and gaps.
  const candidates = []
  for (let offset = 0; offset <= Math.min(triggerWidth - POST_WIDTH / 2, 144); offset += 24) {
    const x = checkpoint.x + offset
    const supports = surfaces.filter(platform => x - POST_WIDTH / 2 >= platform.x
      && x + POST_WIDTH / 2 <= platform.x + platform.width
      && platform.y >= checkpoint.y - 32 && platform.y <= checkpoint.y + 96)
      .sort((a, b) => Math.abs(a.y - checkpoint.y) - Math.abs(b.y - checkpoint.y))
    for (const floor of supports) {
      const ceilingBottom = blockers.filter(rect => rect !== floor && rect.x < x + POST_WIDTH / 2
        && rect.x + rect.width > x - POST_WIDTH / 2 && rect.y < floor.y)
        .reduce((bottom, rect) => Math.max(bottom, rect.y + rect.height), 0)
      const height = Math.min(POST_HEIGHT, floor.y - ceilingBottom - 4)
      if (height >= 40) candidates.push({ x, y: floor.y, width: height * 64 / 176, height, platformId: floor.id })
    }
  }
  return candidates.sort((a, b) => b.height - a.height)[0] ?? null
}

export function getShadowRunnerWaypostAppearance(reached: boolean) {
  return reached ? { tint: 0xffffff, alpha: 1 } : { tint: 0x72808a, alpha: 0.8 }
}
