import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { getShadowRunnerRuntimeManifest } from '../src/features/games/shadow-runner/game/runtimeCatalog'
import { getShadowRunnerWaypostAppearance, getShadowRunnerWaypostPlacement, SHADOW_RUNNER_WAYPOST_TEXTURE } from '../src/features/games/shadow-runner/game/runtimeWayposts'

const levels = Object.values(SHADOW_RUNNER_LEVEL_CONFIGS)

describe('Courier checkpoint wayposts', () => {
  test.each(levels)('$id posts rest on visible permanent floors without overlapping roofs', level => {
    for (const checkpoint of level.checkpoints ?? []) {
      const post = getShadowRunnerWaypostPlacement(level, checkpoint)
      expect({ checkpoint: checkpoint.id, found: Boolean(post) }).toEqual({ checkpoint: checkpoint.id, found: true })
      if (!post) continue
      const support = level.platforms.find(platform => platform.id === post.platformId)!
      expect(support.hidden).not.toBe(true)
      expect(post.y).toBe(support.y)
      expect(post.x - post.width / 2).toBeGreaterThanOrEqual(support.x)
      expect(post.x + post.width / 2).toBeLessThanOrEqual(support.x + support.width)
      expect(post.x).toBeGreaterThanOrEqual(checkpoint.x)
      expect(post.x).toBeLessThanOrEqual(checkpoint.x + (checkpoint.triggerWidth ?? 160))
      for (const rect of [...level.platforms, ...(level.crouchGates ?? [])]) {
        if (rect === support || rect.hidden) continue
        expect(rect.x < post.x + post.width / 2 && rect.x + rect.width > post.x - post.width / 2
          && rect.y < post.y && rect.y + rect.height > post.y - post.height).toBe(false)
      }
    }
  })

  test('empty or unsupported routes have no floating posts or unnecessary asset load', () => {
    const level = { ...levels[0], checkpoints: [], platforms: [] }
    expect(getShadowRunnerRuntimeManifest(level).some(asset => asset.key === SHADOW_RUNNER_WAYPOST_TEXTURE)).toBe(false)
    expect(getShadowRunnerWaypostPlacement(level, { id: 'missing', label: 'Missing', x: 200, y: 400 })).toBeNull()
  })

  test('activated posts have a stable, brighter state without requiring motion', () => {
    expect(getShadowRunnerWaypostAppearance(true)).toEqual({ tint: 0xffffff, alpha: 1 })
    expect(getShadowRunnerWaypostAppearance(false).alpha).toBeLessThan(1)
    expect(getShadowRunnerWaypostAppearance(false).tint).not.toBe(0xffffff)
  })
})
