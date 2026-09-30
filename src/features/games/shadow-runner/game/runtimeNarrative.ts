import { SHADOW_RUNNER_CAMPAIGN_MOMENTS } from './campaignMoments'
import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import type { ShadowRunnerLevelConfig, ShadowRunnerPlayableLevelId } from './levels'
import type { ShadowRunnerRuntimeAsset } from './runtimeCatalog'

export type ShadowRunnerStoryLandmarkKind = 'oath' | 'dispatch' | 'forgery' | 'beacon'
  | 'gearLock' | 'shardReceiver' | 'memorial' | 'watchfire' | 'relay'

const CHAPTER_LANDMARKS: Record<ShadowRunnerPlayableLevelId, ShadowRunnerStoryLandmarkKind> = {
  tutorial: 'oath',
  'level-1': 'dispatch',
  'level-2': 'dispatch',
  'level-3': 'dispatch',
  'level-4': 'forgery',
  'level-5': 'beacon',
  'level-6': 'gearLock',
  'level-7': 'shardReceiver',
  'level-8': 'memorial',
  'level-9': 'watchfire',
  'level-10': 'relay',
}

export interface ShadowRunnerStoryLandmark {
  momentId: string
  landmarkId: string
  kind: ShadowRunnerStoryLandmarkKind
  texture: string
  platformId: string
  x: number
  y: number
  width: number
  height: number
}

export const SHADOW_RUNNER_STORY_LANDMARK_DEPTH = 8
const LANDMARK_SIZE = 112
const MIN_LANDMARK_SIZE = 40

export function getShadowRunnerStoryLandmarks(level: ShadowRunnerLevelConfig): ShadowRunnerStoryLandmark[] {
  const kind = CHAPTER_LANDMARKS[level.id]
  const surfaces = level.platforms.filter(platform => !platform.hidden)
  const blockers = [...surfaces, ...(level.crouchGates ?? [])]
  return SHADOW_RUNNER_CAMPAIGN_MOMENTS[level.id].flatMap(moment => {
    const candidates: ShadowRunnerStoryLandmark[] = []
    // Keep the signal inside its discovery window, on permanent terrain only.
    for (const offset of [80, 56, 104, 32, 128, 8, 152]) {
      const x = moment.trigger.x + offset
      for (const floor of surfaces) {
        if (floor.y < moment.trigger.minY || floor.y > moment.trigger.maxY + 32) continue
        const availableWidth = Math.min(x - floor.x, floor.x + floor.width - x) * 2
        let size = Math.min(LANDMARK_SIZE, availableWidth)
        if (size < MIN_LANDMARK_SIZE) continue
        const ceilingBottom = blockers.filter(rect => rect !== floor && rect.x < x + size / 2
          && rect.x + rect.width > x - size / 2 && rect.y < floor.y)
          .reduce((bottom, rect) => Math.max(bottom, rect.y + rect.height), 0)
        size = Math.min(size, floor.y - ceilingBottom - 4)
        if (size < MIN_LANDMARK_SIZE) continue
        candidates.push({
          momentId: moment.id, landmarkId: moment.landmarkId, kind,
          texture: `shadow-runner-story-${kind}`, platformId: floor.id,
          x, y: floor.y, width: size, height: size,
        })
      }
    }
    candidates.sort((a, b) => b.height - a.height
      || Math.abs(a.y - moment.trigger.maxY) - Math.abs(b.y - moment.trigger.maxY)
      || Math.abs(a.x - moment.trigger.x - 80) - Math.abs(b.x - moment.trigger.x - 80))
    return candidates[0] ? [candidates[0]] : []
  })
}

export function getShadowRunnerStoryLandmarkAssets(level: ShadowRunnerLevelConfig): ShadowRunnerRuntimeAsset[] {
  const landmarks = getShadowRunnerStoryLandmarks(level)
  return Array.from(new Map(landmarks.map(landmark => [landmark.texture, {
    type: 'image' as const, key: landmark.texture, url: SHADOW_RUNNER_ASSETS.storyLandmarks[landmark.kind],
  }])).values())
}

export function getShadowRunnerReachedMoments(levelId: ShadowRunnerPlayableLevelId, point: { x: number; y: number }, seen: ReadonlySet<string>) {
  return SHADOW_RUNNER_CAMPAIGN_MOMENTS[levelId].filter(moment => !seen.has(moment.id)
    && point.x >= moment.trigger.x && point.x <= moment.trigger.x + 160
    && point.y >= moment.trigger.minY && point.y <= moment.trigger.maxY)
}
