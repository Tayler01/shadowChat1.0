import {
  getShadowRunnerReachedMoments,
  getShadowRunnerStoryLandmarks,
  getShadowRunnerStoryLandmarkAssets,
  SHADOW_RUNNER_STORY_LANDMARK_DEPTH,
} from '../src/features/games/shadow-runner/game/runtimeNarrative'
import { SHADOW_RUNNER_CAMPAIGN_MOMENTS } from '../src/features/games/shadow-runner/game/campaignMoments'
import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { SHADOW_RUNNER_ASSETS } from '../src/features/games/shadow-runner/assets/manifest'
import type { ShadowRunnerPlayableLevelId } from '../src/features/games/shadow-runner/game/levels'
import { getShadowRunnerDistrictDepth, getShadowRunnerDepthPropX } from '../src/features/games/shadow-runner/game/runtimeDistrictDepth'
import { getShadowRunnerRuntimeManifest } from '../src/features/games/shadow-runner/game/runtimeCatalog'

test.each(Object.keys(SHADOW_RUNNER_ASSETS.districtDepth))('%s adds two restrained architectural depth layers with selective loading', (texture) => {
  const index = Object.keys(SHADOW_RUNNER_ASSETS.districtDepth).indexOf(texture)
  const levelId = `level-${index + 1}` as ShadowRunnerPlayableLevelId
  const props = getShadowRunnerDistrictDepth(levelId)
  expect(new Set(props.map(prop => prop.parallax))).toEqual(new Set([0.14, 0.28]))
  expect(props.every(prop => prop.texture === texture && prop.y < 0 && prop.height <= 160)).toBe(true)
  expect(getShadowRunnerDepthPropX(props[0], 100) - getShadowRunnerDepthPropX(props[0], 0)).toBeCloseTo(-14)
  const manifest = getShadowRunnerRuntimeManifest(SHADOW_RUNNER_LEVEL_CONFIGS[levelId])
  expect(manifest.filter(asset => asset.url.includes('/district-depth-'))).toHaveLength(1)
})

test.each(Object.entries(SHADOW_RUNNER_CAMPAIGN_MOMENTS))('%s discoveries require their real bounded location and never repeat in a run', (id, moments) => {
  for (const moment of moments) {
    const levelId = id as ShadowRunnerPlayableLevelId
    const trigger = moment.trigger
    const point = { x: trigger.x + 20, y: (trigger.minY + trigger.maxY) / 2 }
    expect(getShadowRunnerReachedMoments(levelId, point, new Set())).toContain(moment)
    expect(getShadowRunnerReachedMoments(levelId, { ...point, x: trigger.x - 1 }, new Set())).not.toContain(moment)
    expect(getShadowRunnerReachedMoments(levelId, { ...point, x: trigger.x + 161 }, new Set())).not.toContain(moment)
    expect(getShadowRunnerReachedMoments(levelId, { ...point, y: trigger.maxY + 1 }, new Set())).not.toContain(moment)
    expect(getShadowRunnerReachedMoments(levelId, { ...point, y: trigger.minY - 1 }, new Set())).not.toContain(moment)
    expect(getShadowRunnerReachedMoments(levelId, point, new Set([moment.id]))).not.toContain(moment)
  }
})

test.each(Object.values(SHADOW_RUNNER_LEVEL_CONFIGS))('$id has a visible static story signal at every discovery zone', level => {
  const landmarks = getShadowRunnerStoryLandmarks(level)
  const moments = SHADOW_RUNNER_CAMPAIGN_MOMENTS[level.id]
  expect(landmarks.map(landmark => landmark.momentId)).toEqual(moments.map(moment => moment.id))
  for (const landmark of landmarks) {
    const moment = moments.find(current => current.id === landmark.momentId)!
    const support = level.platforms.find(platform => platform.id === landmark.platformId)!
    expect(landmark.landmarkId).toBe(moment.landmarkId)
    expect(support.hidden).not.toBe(true)
    expect(landmark.y).toBe(support.y)
    expect(landmark.width).toBe(landmark.height)
    expect(landmark.height).toBeGreaterThanOrEqual(40)
    expect(landmark.height).toBeLessThanOrEqual(112)
    expect(landmark.x - landmark.width / 2).toBeGreaterThanOrEqual(support.x)
    expect(landmark.x + landmark.width / 2).toBeLessThanOrEqual(support.x + support.width)
    expect(landmark.x).toBeGreaterThanOrEqual(moment.trigger.x)
    expect(landmark.x).toBeLessThanOrEqual(moment.trigger.x + 160)
    for (const rect of [...level.platforms, ...(level.crouchGates ?? [])]) {
      if (rect === support || rect.hidden) continue
      expect(rect.x < landmark.x + landmark.width / 2 && rect.x + rect.width > landmark.x - landmark.width / 2
        && rect.y < landmark.y && rect.y + rect.height > landmark.y - landmark.height).toBe(false)
    }
  }
})

test.each(Object.values(SHADOW_RUNNER_LEVEL_CONFIGS))('$id loads only its selected story sprite once', level => {
  const landmarks = getShadowRunnerStoryLandmarks(level)
  const assets = getShadowRunnerStoryLandmarkAssets(level)
  expect(assets).toHaveLength(1)
  expect(assets[0]).toEqual({
    type: 'image', key: landmarks[0].texture,
    url: SHADOW_RUNNER_ASSETS.storyLandmarks[landmarks[0].kind],
  })
})

test('all nine narrative props are used and draw behind actors but above terrain', () => {
  const kinds = new Set(Object.values(SHADOW_RUNNER_LEVEL_CONFIGS).flatMap(level =>
    getShadowRunnerStoryLandmarks(level).map(landmark => landmark.kind)))
  expect([...kinds].sort()).toEqual(['oath', 'dispatch', 'forgery', 'beacon', 'gearLock',
    'shardReceiver', 'memorial', 'watchfire', 'relay'].sort())
  expect(SHADOW_RUNNER_STORY_LANDMARK_DEPTH).toBeGreaterThan(7)
  expect(SHADOW_RUNNER_STORY_LANDMARK_DEPTH).toBeLessThan(10)
})

test('unsupported or concealed terrain cannot create floating landmarks or asset dependencies', () => {
  const level = SHADOW_RUNNER_LEVEL_CONFIGS.tutorial
  for (const platforms of [[], level.platforms.map(platform => ({ ...platform, hidden: true }))]) {
    const unsupported = { ...level, platforms }
    expect(getShadowRunnerStoryLandmarks(unsupported)).toEqual([])
    expect(getShadowRunnerStoryLandmarkAssets(unsupported)).toEqual([])
  }
})
