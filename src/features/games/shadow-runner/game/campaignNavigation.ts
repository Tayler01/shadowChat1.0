import { SHADOW_RUNNER_CAMPAIGN_LEVELS, type ShadowRunnerCampaignLevel, type ShadowRunnerPlayableLevelId } from './levels'

export function getRunnerChapterState(completedLevels: readonly string[], level: ShadowRunnerCampaignLevel) {
  const completed = completedLevels.includes(level.id)
  const unlocked = level.levelNumber === 1 || completed || completedLevels.includes(`level-${level.levelNumber - 1}`)
  return { completed, unlocked, playable: unlocked && Boolean(level.playableLevelId) }
}

export function getRunnerContinueLevel(completedLevels: readonly string[]): ShadowRunnerPlayableLevelId {
  if (!completedLevels.includes('tutorial')) return 'tutorial'
  return SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => !completedLevels.includes(level.id) && getRunnerChapterState(completedLevels, level).playable)?.playableLevelId ?? 'level-10'
}
